import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ═══════════════════════════════════════
// ZIRO ACCESS CONTROL — HARD SECURITY BOUNDARY
// ═══════════════════════════════════════
// Policy:
//   owner / admin / company_director → full access (all locations)
//   studio_director                  → assigned location(s) only
//   teacher / student / parent       → NO ACCESS (403)
//
// This is enforced server-side. Client-supplied tenant_id, role,
// and system_override are NEVER trusted for sensitive data.
const ZIRO_ALLOWED_ROLES = new Set(["owner", "admin", "company_director", "studio_director"]);
const ZIRO_FORBIDDEN_ROLES = new Set(["teacher", "student", "parent"]);

interface ZiroCallerIdentity {
  profileId: string;
  tenantId: string;
  role: string;
  allowedLocationIds: string[] | null; // null = all locations (owner/admin)
  isLocationScoped: boolean;
}

/**
 * Validates the JWT and returns the trusted caller identity.
 * Throws Response on failure (401 missing JWT, 403 forbidden role/tenant).
 */
async function authorizeZiroCaller(
  req: Request,
  sb: ReturnType<typeof createClient>,
  requestedTenantId: string,
): Promise<ZiroCallerIdentity> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    throw new Response(
      JSON.stringify({ error: "Authentication required." }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  // CRITICAL: validate the JWT signature via Supabase auth.getUser().
  // Decoding base64 alone is NOT secure — anyone could forge a payload.
  const token = authHeader.replace("Bearer ", "");
  const { data: userData, error: userErr } = await sb.auth.getUser(token);
  if (userErr || !userData?.user?.id) {
    throw new Response(
      JSON.stringify({ error: "Invalid authentication token." }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
  const profileId = userData.user.id;

  // Look up the profile (server-side, service role — JWT contents are NOT trusted)
  const { data: profile, error: profErr } = await sb
    .from("profiles")
    .select("id, tenant_id, role")
    .eq("id", profileId)
    .maybeSingle();

  if (profErr || !profile) {
    throw new Response(
      JSON.stringify({ error: "Profile not found. Access denied." }),
      { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const role = String(profile.role ?? "").toLowerCase().trim();

  // Hard block forbidden roles BEFORE any data access
  if (ZIRO_FORBIDDEN_ROLES.has(role)) {
    throw new Response(
      JSON.stringify({ error: "Ziro is not available for your role." }),
      { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  if (!ZIRO_ALLOWED_ROLES.has(role)) {
    throw new Response(
      JSON.stringify({ error: "Ziro access denied for this role." }),
      { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  // Verify the requested tenant matches the caller's tenant
  if (requestedTenantId && profile.tenant_id !== requestedTenantId) {
    throw new Response(
      JSON.stringify({ error: "Tenant mismatch. Access denied." }),
      { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  // For studio_director, load assigned locations and verify at least one exists
  let allowedLocationIds: string[] | null = null;
  let isLocationScoped = false;
  if (role === "studio_director") {
    const { data: locs } = await sb
      .from("profile_locations")
      .select("location_id")
      .eq("profile_id", profileId);
    allowedLocationIds = (locs ?? []).map((l: any) => l.location_id);
    isLocationScoped = true;
    if (allowedLocationIds.length === 0) {
      throw new Response(
        JSON.stringify({ error: "Studio director has no assigned locations." }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
  }

  return {
    profileId,
    tenantId: profile.tenant_id,
    role,
    allowedLocationIds,
    isLocationScoped,
  };
}

// ═══════════════════════════════════════
// SERVER-SIDE BUSINESS PROMPT BUILDER
// ═══════════════════════════════════════
// Mirrors `formatStarPrompt()` from src/services/starContext.ts but runs
// in the edge function with TRUSTED data fetched server-side via the
// caller's JWT. The client's `system_override` is IGNORED for sensitive
// business data — only the server-built prompt is sent to Claude.

function formatMoney(cents: number): string {
  const v = (cents ?? 0) / 100;
  return "$" + v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function buildZiroBusinessPromptServerSide(ctx: any, role: string): string {
  const ts = ctx?.generated_at ? new Date(ctx.generated_at).toLocaleString() : new Date().toLocaleString();

  const roleHeaders: Record<string, string> = {
    owner: "USER ROLE: Owner — full access to all data and actions.",
    admin: "USER ROLE: Company Director — can see revenue/payroll/collections but NOT owner take-home or profit margin.",
    company_director: "USER ROLE: Company Director — can see revenue/payroll/collections but NOT owner take-home or profit margin.",
    studio_director: "USER ROLE: Studio Director — can ONLY answer questions about their assigned location. For any cross-location, company-wide, or other-location question, refuse and say owner/admin/company_director access is required.",
  };
  const roleHeader = roleHeaders[role] ?? "USER ROLE: Unknown";

  const billingBlock =
    ctx?.billing_snapshot != null
      ? `BILLING SNAPSHOT (same definitions as Dashboard → Billing Snapshot)
- Collected This Month: ${formatMoney(ctx.billing_snapshot.collectedCents)}
- Total Invoiced This Month: ${formatMoney(ctx.billing_snapshot.totalInvoicedCents)}
- Discounted This Month: ${formatMoney(ctx.billing_snapshot.discountedCents)}
- Next Month (${ctx.billing_snapshot.nextMonthLabel} Projected): ${formatMoney(ctx.billing_snapshot.nextMonthCents)}
- Scheduled Payments: ${formatMoney(ctx.billing_snapshot.scheduledPaymentsCents)}`
      : `BILLING SNAPSHOT: Not included for your role or unavailable. Do not cite dollar amounts for billing.`;

  const mixedQuestionRule =
    role === "studio_director"
      ? `\n\nMIXED-QUESTION RULE: If the user asks about other locations, company-wide totals, or any data outside their assigned location, answer ONLY the portion that is within their location. Then explicitly say: "Cross-location and company-wide data requires owner, admin, or company director access." Never include other-location data even if you know it.`
      : "";

  return `${roleHeader}

You are Ziro — the AI operator inside Lessonpreneur. You work alongside the user like a sharp business partner who knows their school inside-out.

RESPONSE STYLE — THIS IS CRITICAL:
- Be conversational and direct. Talk like a trusted operator, not a report generator.
- Default to SHORT replies: 1-3 sentences for most questions. Just answer the thing they asked.
- Do NOT dump all related data. Give the most useful answer first. If there is more to unpack, ask a smart follow-up question instead.
- Avoid markdown headings (###), long bullet walls, and summary blocks. Use plain language.
- When the user asks something broad, give a quick pulse — the one or two most important things — then ask what they want to zoom into.
- When the user asks something specific, answer it directly in one line.
- Only give a longer, detailed breakdown when the user explicitly asks for one.
- Never start with "Great question!" or similar filler.

DATA RULES:
- Use only figures and facts from the snapshot below. Do not invent metrics, names, or amounts.
- If something is not in the snapshot, say so briefly and point them to the right area of the app.
- Sessions are always 30-minute increments. Never make up numbers.${mixedQuestionRule}

== LIVE BUSINESS SNAPSHOT (as of ${ts}) ==

SCHOOL OVERVIEW
- Active students: ${ctx?.students?.active ?? 0}
- Paused students: ${ctx?.students?.paused ?? 0}
- Inactive/former students: ${ctx?.students?.inactive ?? 0}
- Total families: ${ctx?.families?.total ?? 0}
- Active teachers: ${ctx?.teachers?.active ?? 0}

${billingBlock}

STUDENTS BY LOCATION:
${(ctx?.students?.by_location ?? []).map((l: any) => `- ${l.location}: ${l.count} students`).join("\n") || "- No location data"}

TOP INSTRUMENTS:
${(ctx?.students?.by_instrument ?? []).map((i: any) => `- ${i.instrument}: ${i.count}`).join("\n") || "- No instrument data"}

SCHEDULE (this week)
- Booked slots: ${ctx?.schedule?.booked_this_week ?? 0}
- Available slots: ${ctx?.schedule?.available_this_week ?? 0}
- Utilization: ${ctx?.schedule?.utilization_pct ?? 0}%
- Booked this month: ${ctx?.schedule?.booked_this_month ?? 0}
- Callouts this week: ${ctx?.schedule?.callouts_this_week ?? 0}

SCHEDULE BY LOCATION (this week):
${(ctx?.schedule?.by_location_this_week ?? []).map((l: any) => `- ${l.location}: ${l.booked} booked / ${l.available} available`).join("\n") || "- No schedule data"}

LEADS
- Active leads in pipeline: ${ctx?.leads?.active_total ?? 0}
- Leads needing follow-up: ${ctx?.leads?.needing_followup ?? 0}
- New leads (last 7 days): ${ctx?.leads?.new_last_7_days ?? 0}
- New leads (last 30 days): ${ctx?.leads?.new_last_30_days ?? 0}
- Converted (last 30 days): ${ctx?.leads?.converted_last_30_days ?? 0}
- Lost (last 30 days): ${ctx?.leads?.lost_last_30_days ?? 0}

TEACHER LOADS:
${(ctx?.teachers?.load_by_teacher ?? []).map((t: any) => `- ${t.name}: ${t.active_students} students${t.instruments?.length ? ` (${t.instruments.join(", ")})` : ""}`).join("\n") || "- No teacher data"}

Teachers with no students: ${ctx?.teachers?.no_students ?? 0}
Teachers missing contract: ${ctx?.teachers?.contract_missing ?? 0}

RETENTION
- Students paused: ${ctx?.retention?.students_paused ?? 0}
- Students who may return: ${ctx?.retention?.students_may_return ?? 0}
- Students gone inactive (last 60 days): ${ctx?.retention?.students_inactive_last_60_days ?? 0}
- Active retention campaigns: ${ctx?.retention?.active_campaigns ?? 0}

SESSIONS (last 30 days)
- Total sessions logged: ${ctx?.sessions?.total_last_30_days ?? 0}
- Sessions last 7 days: ${ctx?.sessions?.total_last_7_days ?? 0}
- Notes written last 7 days: ${ctx?.sessions?.notes_written_last_7_days ?? 0}

TASKS
- Open tasks: ${ctx?.tasks?.open ?? 0}
- Overdue tasks: ${ctx?.tasks?.overdue ?? 0}
- High priority open: ${ctx?.tasks?.high_priority_open ?? 0}

LOCATIONS (operational — not billing dollars):
${(ctx?.locations ?? []).map((l: any) => `- ${l.name}: ${l.active_students ?? 0} students, ${l.booked_this_week ?? 0} sessions this week`).join("\n") || "- No location data"}

== END SNAPSHOT ==

Answer using only the data above. When asked about revenue or billing, use the BILLING SNAPSHOT figures only.
For students, teachers, schedule, or leads — use the numbers shown. Do not estimate or approximate beyond what is shown. If data for a specific question isn't in the snapshot, say so briefly and suggest the right page in the app.

REMINDER: Keep it short. Answer the question, then offer to go deeper — do not go deeper by default.`;
}

// ═══════════════════════════════════════
// FUZZY NAME MATCHING
// ═══════════════════════════════════════

function fuzzyMatch(full: string, query: string): boolean {
  const f = full.toLowerCase();
  const q = query.toLowerCase();
  if (f.includes(q)) return true;
  // Compare first name tokens allowing 1-2 char difference
  const fFirst = f.split(" ")[0];
  const qFirst = q.split(" ")[0];
  if (qFirst.length < 3) return false;
  if (!fFirst.startsWith(qFirst.slice(0, 2))) return false;
  let mismatches = 0;
  const shorter = Math.min(fFirst.length, qFirst.length);
  for (let i = 0; i < shorter; i++) {
    if (fFirst[i] !== qFirst[i]) mismatches++;
  }
  mismatches += Math.abs(fFirst.length - qFirst.length);
  return mismatches <= 2;
}

// ═══════════════════════════════════════
// CONTEXT-AWARE NAME RESOLVERS
// ═══════════════════════════════════════

function resolveTeacherFromContext(ctx: any, name: string): { id: string; name: string } | null {
  if (!ctx?.teachers) return null;
  const parts = name.trim().toLowerCase().split(/\s+/);
  let matches = ctx.teachers.filter((t: any) => parts.every((p: string) => t.name.toLowerCase().includes(p)));
  if (matches.length === 1) return matches[0];
  matches = ctx.teachers.filter((t: any) => parts.every((p: string) => fuzzyMatch(t.name, p)));
  if (matches.length === 1) return matches[0];
  return null;
}

function resolveStudentFromContext(ctx: any, name: string): { student_id: string; student_name: string; teacher_id: string; teacher_name: string } | null {
  if (!ctx?.blocks) return null;
  const parts = name.trim().toLowerCase().split(/\s+/);
  const studentBlocks = ctx.blocks.filter((b: any) => b.student_name);
  const seen = new Set<string>();
  const exact: any[] = [];
  const fuzzy: any[] = [];
  for (const b of studentBlocks) {
    if (seen.has(b.student_id)) continue;
    seen.add(b.student_id);
    const full = b.student_name.toLowerCase();
    if (parts.every((p: string) => full.includes(p))) exact.push(b);
    else if (parts.every((p: string) => fuzzyMatch(b.student_name, p))) fuzzy.push(b);
  }
  const match = exact.length === 1 ? exact[0] : fuzzy.length === 1 ? fuzzy[0] : null;
  if (!match) return null;
  return { student_id: match.student_id, student_name: match.student_name, teacher_id: match.teacher_id, teacher_name: match.teacher_name };
}

async function resolveStudent(sb: any, tenantId: string, name: string, locationId?: string): Promise<any> {
  const parts = name.trim().split(/\s+/);

  // Build query scoped to location first
  const buildQuery = (locId?: string) => {
    let q = sb.from("students").select("id, first_name, last_name, instrument, location_id, teacher_id, family_id")
      .eq("tenant_id", tenantId).eq("status", "active");
    if (locId) q = q.eq("location_id", locId);
    if (parts.length >= 2) {
      q = q.ilike("first_name", `%${parts[0]}%`).ilike("last_name", `%${parts.slice(1).join(" ")}%`);
    } else {
      q = q.ilike("first_name", `%${parts[0]}%`);
    }
    return q;
  };

  // Try exact match at location
  let { data } = await buildQuery(locationId);
  if (data && data.length === 1) return { ...data[0], fuzzy_corrected: false };
  if (data && data.length > 1) throw new Error(`Multiple students match "${name}": ${data.map((s: any) => `${s.first_name} ${s.last_name}`).join(", ")}`);

  // Try fuzzy match at location — get all active students and filter
  if (locationId) {
    const { data: allLoc } = await sb.from("students").select("id, first_name, last_name, instrument, location_id, teacher_id, family_id")
      .eq("tenant_id", tenantId).eq("status", "active").eq("location_id", locationId);
    const fuzzyMatches = (allLoc ?? []).filter((s: any) => {
      const full = `${s.first_name} ${s.last_name}`;
      return parts.every((p: string) => fuzzyMatch(full, p));
    });
    if (fuzzyMatches.length === 1) return { ...fuzzyMatches[0], fuzzy_corrected: true };
    if (fuzzyMatches.length > 1) throw new Error(`Multiple students match "${name}": ${fuzzyMatches.map((s: any) => `${s.first_name} ${s.last_name}`).join(", ")}`);
  }

  // Retry without location filter
  if (locationId) {
    const { data: allData } = await buildQuery();
    if (allData && allData.length === 1) return { ...allData[0], fuzzy_corrected: false };
    // Fuzzy across all locations
    const { data: allStudents } = await sb.from("students").select("id, first_name, last_name, instrument, location_id, teacher_id, family_id")
      .eq("tenant_id", tenantId).eq("status", "active");
    const fuzzyAll = (allStudents ?? []).filter((s: any) => {
      const full = `${s.first_name} ${s.last_name}`;
      return parts.every((p: string) => fuzzyMatch(full, p));
    });
    if (fuzzyAll.length === 1) return { ...fuzzyAll[0], fuzzy_corrected: true };
    if (fuzzyAll.length > 1) throw new Error(`Multiple students match "${name}": ${fuzzyAll.map((s: any) => `${s.first_name} ${s.last_name}`).join(", ")}`);
  }

  throw new Error(`Student "${name}" not found`);
}

async function resolveTeacher(sb: any, tenantId: string, name: string) {
  const parts = name.trim().split(/\s+/);
  const { data: teachers } = await sb.from("teachers")
    .select("id, first_name, last_name, instruments, profile:profiles!teachers_profile_id_fkey(first_name, last_name)")
    .eq("tenant_id", tenantId).eq("is_active", true);
  const getName = (t: any) => `${t.first_name ?? t.profile?.first_name ?? ""} ${t.last_name ?? t.profile?.last_name ?? ""}`.trim();
  let matches = (teachers ?? []).filter((t: any) => parts.every((p: string) => getName(t).toLowerCase().includes(p.toLowerCase())));
  if (matches.length === 0) {
    matches = (teachers ?? []).filter((t: any) => parts.every((p: string) => fuzzyMatch(getName(t), p)));
  }
  if (matches.length === 0) throw new Error(`Teacher "${name}" not found`);
  if (matches.length > 1) throw new Error(`Multiple teachers match "${name}"`);
  return { id: matches[0].id, name: getName(matches[0]) };
}

function formatTime(t: string) {
  const [h, m] = t.split(":");
  const hour = parseInt(h);
  const ampm = hour >= 12 ? "pm" : "am";
  const display = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
  return `${display}:${m}${ampm}`;
}

function getNowInTimezone(tz: string): Date {
  return new Date(new Date().toLocaleString("en-US", { timeZone: tz }));
}

function getDateStringInTimezone(tz: string): string {
  const now = getNowInTimezone(tz);
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Normalized ai_conversations + ai_messages (service role — never throws to client). */
async function persistZiroExchange(
  sb: ReturnType<typeof createClient>,
  req: Request,
  opts: {
    tenantId: string;
    question: string;
    answer: string;
    usage: unknown;
    source: string;
    aiSessionId?: string | null;
    clientRoute?: string | null;
    pageContext?: Record<string, unknown> | null;
    model: string;
    errorText?: string | null;
    assistantMetadata?: Record<string, unknown>;
  },
): Promise<{ sessionId: string | null; assistantMessageId: string | null }> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return { sessionId: null, assistantMessageId: null };
  try {
    const token = authHeader.replace("Bearer ", "");
    const profileId = JSON.parse(atob(token.split(".")[1])).sub as string | undefined;
    if (!profileId) return { sessionId: null, assistantMessageId: null };

    const sessionId =
      opts.aiSessionId && UUID_RE.test(String(opts.aiSessionId))
        ? String(opts.aiSessionId)
        : crypto.randomUUID();

    const nowIso = new Date().toISOString();
    const { error: upErr } = await sb.from("ai_conversations").upsert(
      {
        id: sessionId,
        tenant_id: opts.tenantId,
        profile_id: profileId,
        source: opts.source,
        client_route: opts.clientRoute ?? null,
        page_context: opts.pageContext ?? {},
        metadata: {},
        updated_at: nowIso,
      },
      { onConflict: "id" },
    );
    if (upErr) console.error("[ai-assistant] ai_conversations upsert:", upErr);

    const u = {
      conversation_id: sessionId,
      tenant_id: opts.tenantId,
      profile_id: profileId,
    };
    const { error: uErr } = await sb.from("ai_messages").insert({
      ...u,
      role: "user",
      content: opts.question,
      metadata: { source: opts.source },
      seq: 0,
    });
    if (uErr) console.error("[ai-assistant] ai_messages user:", uErr);
    const { data: aRow, error: aErr } = await sb.from("ai_messages").insert({
      ...u,
      role: "assistant",
      content: opts.answer,
      error_text: opts.errorText ?? null,
      metadata: opts.assistantMetadata ?? {},
      model: opts.model,
      usage: opts.usage ?? null,
      seq: 0,
    }).select("id").single();
    if (aErr) console.error("[ai-assistant] ai_messages assistant:", aErr);

    const assistantMessageId = (aRow as { id?: string } | null)?.id ?? null;
    return { sessionId, assistantMessageId };
  } catch (e) {
    console.error("[ai-assistant] persistZiroExchange:", e);
    return { sessionId: null, assistantMessageId: null };
  }
}

// ═══════════════════════════════════════
// MAIN HANDLER
// ═══════════════════════════════════════

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    if (!ANTHROPIC_API_KEY) {
      return new Response(JSON.stringify({ error: "ANTHROPIC_API_KEY not configured" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const body = await req.json();
    const {
      question,
      conversation_history,
      tenant_id,
      schedule_context,
      timezone,
      system_override,
      ai_session_id,
      source: clientSource,
      client_route,
      client_page_context,
    } = body;
    if (!question || !tenant_id) {
      return new Response(JSON.stringify({ error: "question and tenant_id required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const tz = timezone || "America/Chicago";
    const todayStr = getDateStringInTimezone(tz);
    const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // ─── HARD AUTH: validate JWT, role, tenant ──────────────
    // This is the security boundary. Any failure throws a Response which is
    // re-thrown to the outer try/catch and returned as-is to the client.
    let caller: ZiroCallerIdentity;
    try {
      caller = await authorizeZiroCaller(req, sb, tenant_id);
    } catch (authResponse) {
      if (authResponse instanceof Response) return authResponse;
      throw authResponse;
    }

    // For studio_director, validate schedule_context location_id is in their allowed set
    if (caller.isLocationScoped && schedule_context?.location_id) {
      if (!caller.allowedLocationIds!.includes(schedule_context.location_id)) {
        return new Response(
          JSON.stringify({ error: "Access denied: this location is not in your assigned scope." }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
    }

    // ─── BUSINESS PATH: server-side prompt rebuild ──────────
    // The client may send `system_override` but it is IGNORED for sensitive
    // business data. We rebuild the prompt server-side using `get_star_context`
    // called with the user's JWT (RPC enforces role/location filtering).
    if (system_override) {
      // Server-side fetch of business context using the caller's JWT
      // (Supabase auth.uid() inside the RPC = caller.profileId)
      const userScopedSb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
      });

      const { data: rpcData, error: rpcErr } = await userScopedSb.rpc("get_star_context", {
        p_tenant_id: caller.tenantId,
      });

      if (rpcErr) {
        console.error("[ai-assistant] get_star_context failed:", rpcErr);
        return new Response(
          JSON.stringify({ error: "Failed to load business context. Access may be restricted for your role." }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      // Build the system prompt server-side from trusted data
      const trustedSystemPrompt = buildZiroBusinessPromptServerSide(rpcData ?? {}, caller.role);
      const messages: any[] = [];
      if (conversation_history && Array.isArray(conversation_history)) {
        for (const msg of conversation_history.slice(-10)) messages.push({ role: msg.role, content: msg.content });
      }
      messages.push({ role: "user", content: question });

      const claudeController = new AbortController();
      // Business path sends full system prompt (school snapshot); 12s was too aggressive for first paint.
      const claudeTimeout = setTimeout(() => claudeController.abort(), 32000);
      let claudeRes: Response;
      try {
        claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          signal: claudeController.signal,
          headers: { "Content-Type": "application/json", "x-api-key": ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
          body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: 500, system: trustedSystemPrompt, messages }),
        });
      } catch (fetchErr: any) {
        if (fetchErr.name === "AbortError") {
          const timeoutAns =
            "Ziro timed out while generating a response. Please try again in a moment. If this keeps happening, your prompt may be very large — open Ziro from the sidebar or retry after a short wait.";
          const timeoutSessionId = ai_session_id && UUID_RE.test(String(ai_session_id)) ? String(ai_session_id) : crypto.randomUUID();

          // Fire-and-forget persistence — don't block the timeout response on DB writes
          persistZiroExchange(sb, req, {
            tenantId: tenant_id,
            question,
            answer: timeoutAns,
            usage: null,
            source: typeof clientSource === "string" && clientSource ? clientSource : "ziro_business",
            aiSessionId: timeoutSessionId,
            clientRoute: typeof client_route === "string" ? client_route : null,
            pageContext: client_page_context && typeof client_page_context === "object" ? client_page_context : {},
            model: "claude-sonnet-4-6",
            errorText: "timeout",
          }).catch((e) => console.error("[ai-assistant] background persist (timeout) failed:", e));

          return new Response(
            JSON.stringify({
              answer: timeoutAns,
              ai_session_id: timeoutSessionId,
            }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }
        throw fetchErr;
      } finally {
        clearTimeout(claudeTimeout);
      }

      if (!claudeRes.ok) {
        const errText = await claudeRes.text();
        return new Response(JSON.stringify({ error: "AI service error — please try again." }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const claudeData = await claudeRes.json();
      let answer = "";
      for (const block of (claudeData.content ?? [])) {
        if (block.type === "text") answer += block.text;
      }
      if (!answer) answer = "Ziro had no response — please try rephrasing your question.";

      // Pre-compute session ID so we can return it immediately
      const sessionId = ai_session_id && UUID_RE.test(String(ai_session_id)) ? String(ai_session_id) : crypto.randomUUID();

      // Fire-and-forget persistence — don't block the response on DB writes
      persistZiroExchange(sb, req, {
        tenantId: tenant_id,
        question,
        answer,
        usage: claudeData.usage,
        source: typeof clientSource === "string" && clientSource ? clientSource : "ziro_business",
        aiSessionId: sessionId,
        clientRoute: typeof client_route === "string" ? client_route : null,
        pageContext: client_page_context && typeof client_page_context === "object" ? client_page_context : {},
        model: "claude-sonnet-4-6",
      }).catch((e) => console.error("[ai-assistant] background persist failed:", e));

      return new Response(
        JSON.stringify({
          answer,
          usage: claudeData.usage,
          ai_session_id: sessionId,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ─── SCHEDULING MODE: full context with tools ───
    // Gather context — only what's needed for scheduling.
    //
    // SECURITY: For studio directors, every lookup table is narrowed to their
    // assigned locations. Owners/admins/company_directors get the full tenant set.
    // This prevents the fuzzy-match name lookups (and the resulting system prompt
    // sent to Claude) from exposing students/teachers/families outside scope.
    const isScoped = caller.isLocationScoped;
    const allowedLocs = caller.allowedLocationIds ?? [];

    // Pre-resolve teacher_ids and family_ids for studio directors
    let scopedTeacherIds: string[] | null = null;
    let scopedFamilyIds: string[] | null = null;
    if (isScoped) {
      // Teachers that operate at one of the caller's locations
      const { data: tlocs } = await sb
        .from("teacher_locations")
        .select("teacher_id")
        .in("location_id", allowedLocs);
      scopedTeacherIds = Array.from(new Set((tlocs ?? []).map((r: any) => r.teacher_id)));

      // Families with at least one active student at one of the caller's locations
      const { data: scopedStudents } = await sb
        .from("students")
        .select("family_id")
        .eq("tenant_id", tenant_id)
        .eq("status", "active")
        .in("location_id", allowedLocs)
        .not("family_id", "is", null);
      scopedFamilyIds = Array.from(new Set((scopedStudents ?? []).map((s: any) => s.family_id).filter(Boolean)));
    }

    // Build the four parallel queries with conditional location narrowing
    const tenantQ = sb.from("tenants").select("name, slug").eq("id", tenant_id).single();

    let locationsQ = sb.from("locations").select("id, name, is_active").eq("tenant_id", tenant_id);
    if (isScoped) locationsQ = locationsQ.in("id", allowedLocs);

    let teachersQ = sb.from("teachers")
      .select("id, first_name, last_name, instruments, is_active, profile:profiles!teachers_profile_id_fkey(first_name, last_name)")
      .eq("tenant_id", tenant_id);
    if (isScoped) {
      // If no teachers operate in scope, force an empty result instead of returning all
      teachersQ = teachersQ.in("id", scopedTeacherIds!.length > 0 ? scopedTeacherIds! : ["00000000-0000-0000-0000-000000000000"]);
    }

    let studentsQ = sb.from("students")
      .select("id, first_name, last_name, instrument, status, location_id, teacher_id, family_id")
      .eq("tenant_id", tenant_id)
      .eq("status", "active");
    if (isScoped) studentsQ = studentsQ.in("location_id", allowedLocs);

    let familiesQ = sb.from("families").select("id, name, is_military").eq("tenant_id", tenant_id);
    if (isScoped) {
      familiesQ = familiesQ.in("id", scopedFamilyIds!.length > 0 ? scopedFamilyIds! : ["00000000-0000-0000-0000-000000000000"]);
    }

    const [
      { data: tenant },
      { data: locations },
      { data: teachers },
      { data: students },
      { data: families },
    ] = await Promise.all([tenantQ, locationsQ, teachersQ, studentsQ, familiesQ]);

    const locMap: Record<string, string> = {};
    locations?.forEach((l: any) => { locMap[l.id] = l.name?.replace(" Music Lessons", ""); });
    const teacherMap: Record<string, string> = {};
    const getName = (t: any) => `${t.first_name ?? t.profile?.first_name ?? ""} ${t.last_name ?? t.profile?.last_name ?? ""}`.trim();
    teachers?.forEach((t: any) => { teacherMap[t.id] = getName(t); });
    const activeStudents = students ?? [];
    const activeTeachers = (teachers ?? []).filter((t: any) => t.is_active);

    // Sibling map
    const familyMap: Record<string, Array<{ id: string; name: string }>> = {};
    activeStudents.forEach((s: any) => {
      if (!s.family_id) return;
      if (!familyMap[s.family_id]) familyMap[s.family_id] = [];
      familyMap[s.family_id].push({ id: s.id, name: `${s.first_name} ${s.last_name}` });
    });
    const siblingFamilies: Record<string, Array<{ id: string; name: string }>> = {};
    for (const [fid, members] of Object.entries(familyMap)) {
      if (members.length >= 2) siblingFamilies[fid] = members;
    }

    const today = getNowInTimezone(tz).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });

    // Build schedule section — scoped to current location only
    let scheduleSection = "";
    let locationStudentList = "";
    if (schedule_context) {
      const ctx = schedule_context;
      const teacherSchedules: Record<string, string[]> = {};
      for (const t of ctx.teachers) teacherSchedules[t.name] = [];
      for (const b of ctx.blocks) {
        if (!teacherSchedules[b.teacher_name]) teacherSchedules[b.teacher_name] = [];
        const timeStr = formatTime(b.start_time);
        teacherSchedules[b.teacher_name].push(
          b.status === "available" ? `  ${timeStr}: OPEN` : `  ${timeStr}: ${b.student_name ?? "?"} [${b.block_type}]`
        );
      }
      for (const name of Object.keys(teacherSchedules)) {
        teacherSchedules[name].sort();
      }

      const locStudents = activeStudents.filter((s: any) => s.location_id === ctx.location_id);
      locationStudentList = locStudents.map((s: any) => `${s.first_name} ${s.last_name} (${s.instrument})`).join(", ");

      const sibInfo: string[] = [];
      const seenFam = new Set<string>();
      for (const s of locStudents) {
        if (!s.family_id || seenFam.has(s.family_id)) continue;
        const sibs = siblingFamilies[s.family_id];
        if (sibs && sibs.length >= 2) { seenFam.add(s.family_id); sibInfo.push(sibs.map(x => x.name).join(" & ")); }
      }

      scheduleSection = `
LIVE SCHEDULE — ${ctx.location_name} on ${ctx.date}
${Object.entries(teacherSchedules).map(([name, lines]) => `${name}:\n${lines.join("\n")}`).join("\n\n")}

STUDENTS AT ${ctx.location_name.toUpperCase()}: ${locationStudentList || "none"}
${sibInfo.length > 0 ? `SIBLINGS: ${sibInfo.join("; ")}` : ""}`;
    }

    // Slim system prompt — no leads, no stats, just what Star needs for scheduling
    const ctxDate = schedule_context?.date ?? todayStr;
    const systemPrompt = `You are Star, scheduling assistant for ${tenant?.name ?? "this music school"}. Today is ${today} (${todayStr}). Timezone: ${tz}.

Locations: ${locations?.map((l: any) => locMap[l.id]).join(", ")}
Teachers: ${activeTeachers.map((t: any) => teacherMap[t.id]).join(", ")}
${scheduleSection}

RULES:
- YOU ARE AN EXECUTOR. When told to book/move/cancel, call the tool IMMEDIATELY. The confirmation card handles approval.
- Resolve first names against teachers and students visible on today's schedule. If one match → use it. Only ask if genuinely ambiguous.
- Default block_type is ALWAYS student_session unless user says "sub", "first day", "last day", or "meet and greet".
- Default recurring is ALWAYS true (weekly). Only set false if user says "one-time" or "just today".
- For batch booking ("On Arianna's schedule book: X at 5, Y at 5:30"), use batch_book_students.
- For batch cancelling ("Cancel: Jacob at 5, Cadence at 5:30"), use batch_cancel_lessons.
- Never say "I can't" — you have tools. Never ask unnecessary questions. Be brief.
- When a slot is taken, say who's there and list open times.
- Fuzzy name matching is enabled — "Candice" will match "Kandice", etc. If corrected, note it.

SCHEDULING INTENT — CRITICAL:
- "move", "switch", "transfer" a student TO another teacher or time → use move_lesson. This REMOVES the lesson from the current teacher/time and creates it at the new one. This is NOT the same as booking.
- "add", "book", "extra lesson", "another appointment" → use book_student. This creates a NEW lesson WITHOUT touching existing ones.
- "move permanently", "move going forward", "transfer from now on", "switch recurring" → use move_lesson with move_scope="all_future". This cancels all future lessons with the old teacher and creates recurring with the new one.
- If the user says "move" and does NOT say "permanently" or "going forward", default to move_scope="this_instance" (single date only).
- NEVER use book_student when the user says "move" or "switch" — that would leave the old lesson in place, which is wrong.

NOT-BOOKABLE BLOCKS:
- "not_bookable" blocks mark times a teacher is unavailable. They are NOT student lessons.
- You CANNOT move, cancel, or modify not_bookable blocks with your tools. They are managed in Settings.
- If asked to move/change a not_bookable block, respond: "Not-bookable blocks are managed in teacher availability settings — I can only move student sessions. Would you like me to help with something else?"

CANCELLATION RULES:
- Every cancellation MUST include a reason. Pick the best-fit preset: student_sick, teacher_sick, family_emergency, no_show, schedule_conflict, holiday, weather, other.
- If user says "sick" → student_sick. If user says "teacher is out" → teacher_sick. If vague, use the most likely preset.
- RECURRING CHECK: If the student's block on the schedule shows is_recurring or block_type is student_session (most are recurring), ASK: "Cancel just this week or all future lessons?" BEFORE calling the tool. Wait for the answer, then call with the correct cancel_scope.
- If user explicitly says "cancel all", "cancel going forward", "drop the student" → all_future. If they say "just today", "this week only" → this_week.
- Cancelled blocks flip back to Open so the teacher's time is available.`;

    // system_override is handled by the fast path above — this is always scheduling mode
    const finalSystemPrompt = systemPrompt;

    const messages: any[] = [];
    if (conversation_history && Array.isArray(conversation_history)) {
      for (const msg of conversation_history.slice(-10)) messages.push({ role: msg.role, content: msg.content });
    }
    messages.push({ role: "user", content: question });

    const tools = [
      {
        name: "move_lesson",
        description: "TRANSFER a student's lesson: REMOVES the existing lesson from the current teacher/time and books it at the new teacher/time. Use for 'move', 'switch', 'transfer'. Do NOT use book_student for moves — that would leave the old lesson in place.",
        input_schema: {
          type: "object",
          properties: {
            student_name: { type: "string" },
            target_time: { type: "string", description: "HH:MM 24h format" },
            target_date: { type: "string", description: `YYYY-MM-DD. Default: ${ctxDate}` },
            target_teacher_name: { type: "string", description: "Optional — keeps current teacher if omitted" },
            move_scope: { type: "string", enum: ["this_instance", "all_future"], description: "this_instance = move only today's lesson (default). all_future = cancel all future lessons with old teacher and create recurring with new teacher." },
          },
          required: ["student_name", "target_time"],
        },
      },
      {
        name: "book_student",
        description: "Book a student into a NEW time slot WITHOUT removing any existing lessons. Use for 'add', 'book', 'extra lesson', 'another appointment'. Do NOT use for moves/transfers — use move_lesson instead.",
        input_schema: {
          type: "object",
          properties: {
            student_name: { type: "string" },
            teacher_name: { type: "string", description: "Uses student's assigned teacher if omitted" },
            target_time: { type: "string", description: "HH:MM 24h format" },
            target_date: { type: "string", description: `YYYY-MM-DD. Default: ${ctxDate}` },
            block_type: { type: "string", enum: ["student_session", "sub", "meet_greet", "first_day", "last_day", "teacher_training"] },
            recurring: { type: "boolean", description: "true = weekly recurring (default), false = one-time only" },
          },
          required: ["student_name", "target_time"],
        },
      },
      {
        name: "batch_book_students",
        description: "Book multiple students with one teacher. Use for lists like 'On Arianna's schedule: X at 5, Y at 5:30'.",
        input_schema: {
          type: "object",
          properties: {
            teacher_name: { type: "string" },
            target_date: { type: "string", description: `YYYY-MM-DD. Default: ${ctxDate}` },
            recurring: { type: "boolean", description: "true = weekly recurring (default), false = one-time" },
            bookings: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  student_name: { type: "string" },
                  target_time: { type: "string", description: "HH:MM 24h format" },
                  block_type: { type: "string", enum: ["student_session", "sub", "meet_greet", "first_day", "last_day"] },
                },
                required: ["student_name", "target_time"],
              },
            },
          },
          required: ["teacher_name", "bookings"],
        },
      },
      {
        name: "find_coverage",
        description: "Find sub coverage for a teacher calling out.",
        input_schema: {
          type: "object",
          properties: {
            teacher_name: { type: "string" },
            date: { type: "string", description: `YYYY-MM-DD. Default: ${ctxDate}` },
          },
          required: ["teacher_name"],
        },
      },
      {
        name: "cancel_lesson",
        description: "Cancel a student's lesson. Always include a reason from the preset list or 'other' with custom text. For recurring students, specify cancel_scope.",
        input_schema: {
          type: "object",
          properties: {
            student_name: { type: "string" },
            date: { type: "string", description: `YYYY-MM-DD. Default: ${ctxDate}` },
            reason: { type: "string", enum: ["student_sick", "teacher_sick", "family_emergency", "no_show", "schedule_conflict", "holiday", "weather", "other"], description: "Preset reason category" },
            reason_detail: { type: "string", description: "Custom detail when reason is 'other', or additional notes" },
            cancel_scope: { type: "string", enum: ["this_week", "all_future"], description: "this_week = cancel only this date. all_future = cancel this + all future recurring blocks. Default: this_week" },
          },
          required: ["student_name", "reason"],
        },
      },
      {
        name: "batch_cancel_lessons",
        description: "Cancel multiple students' lessons at once. Use when admin gives a list like 'Cancel Jacob at 5, Cadence at 5:30'. One reason applies to all unless specified per student.",
        input_schema: {
          type: "object",
          properties: {
            date: { type: "string", description: `YYYY-MM-DD. Default: ${ctxDate}` },
            reason: { type: "string", enum: ["student_sick", "teacher_sick", "family_emergency", "no_show", "schedule_conflict", "holiday", "weather", "other"] },
            reason_detail: { type: "string" },
            cancel_scope: { type: "string", enum: ["this_week", "all_future"], description: "Default: this_week" },
            cancellations: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  student_name: { type: "string" },
                  target_time: { type: "string", description: "HH:MM 24h format. Optional — if omitted, cancels all blocks for this student on the date" },
                },
                required: ["student_name"],
              },
            },
          },
          required: ["reason", "cancellations"],
        },
      },
    ];

    const claudeController = new AbortController();
    const claudeTimeout = setTimeout(() => claudeController.abort(), 25000);
    let claudeRes: Response;
    try {
      claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        signal: claudeController.signal,
        headers: { "Content-Type": "application/json", "x-api-key": ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: 1024, system: finalSystemPrompt, messages, tools, tool_choice: { type: "auto" } }),
      });
    } catch (fetchErr: any) {
      if (fetchErr.name === "AbortError") {
        return new Response(JSON.stringify({ answer: "I took too long to think about that — please try again or rephrase your question.", error: null }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      throw fetchErr;
    } finally {
      clearTimeout(claudeTimeout);
    }

    if (!claudeRes.ok) {
      const errText = await claudeRes.text();
      return new Response(JSON.stringify({ error: "Claude API error: " + errText }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const claudeData = await claudeRes.json();
    let answer = "";
    let proposed_action: any = null;
    const contextLocationId = schedule_context?.location_id ?? null;

    for (const block of (claudeData.content ?? [])) {
      if (block.type === "text") {
        answer += block.text;
      } else if (block.type === "tool_use") {
        try {
          const toolName = block.name;
          const toolInput = block.input;
          const resolvedParams: any = { ...toolInput };

          // Helper to resolve a student with fuzzy correction tracking
          const resolveStudentFull = async (studentName: string) => {
            const ctxS = resolveStudentFromContext(schedule_context, studentName);
            const s = ctxS
              ? await resolveStudent(sb, tenant_id, ctxS.student_name, contextLocationId)
              : await resolveStudent(sb, tenant_id, studentName, contextLocationId);
            const displayName = `${s.first_name} ${s.last_name}`;
            const correction = s.fuzzy_corrected ? ` (matched from "${studentName}")` : "";
            return { ...s, displayName, correction };
          };

          // Helper to resolve a teacher from context or DB
          const resolveTeacherFull = async (teacherName: string) => {
            const ctxT = resolveTeacherFromContext(schedule_context, teacherName);
            if (ctxT) return ctxT;
            return await resolveTeacher(sb, tenant_id, teacherName);
          };

          if (toolName === "move_lesson") {
            const s = await resolveStudentFull(toolInput.student_name);
            resolvedParams.student_id = s.id;
            resolvedParams.student_display = s.displayName + s.correction;
            resolvedParams.location_id = s.location_id;
            resolvedParams.family_id = s.family_id;
            if (toolInput.target_teacher_name) {
              const t = await resolveTeacherFull(toolInput.target_teacher_name);
              resolvedParams.target_teacher_id = t.id;
              resolvedParams.target_teacher_display = t.name;
            }
            if (!resolvedParams.target_date && schedule_context?.date) resolvedParams.target_date = schedule_context.date;
            if (!resolvedParams.move_scope) resolvedParams.move_scope = "this_instance";
            // Resolve current teacher name for the confirmation description
            if (s.teacher_id && teacherMap[s.teacher_id]) {
              resolvedParams.source_teacher_display = teacherMap[s.teacher_id];
            }

          } else if (toolName === "cancel_lesson") {
            const s = await resolveStudentFull(toolInput.student_name);
            resolvedParams.student_id = s.id;
            resolvedParams.student_display = s.displayName + s.correction;
            resolvedParams.location_id = s.location_id;
            if (!resolvedParams.date && schedule_context?.date) resolvedParams.date = schedule_context.date;
            if (!resolvedParams.cancel_scope) resolvedParams.cancel_scope = "this_week";

          } else if (toolName === "batch_cancel_lessons") {
            if (!resolvedParams.date && schedule_context?.date) resolvedParams.date = schedule_context.date;
            if (!resolvedParams.cancel_scope) resolvedParams.cancel_scope = "this_week";
            resolvedParams.location_id = schedule_context?.location_id ?? null;
            const resolvedCancels: any[] = [];
            for (const c of (toolInput.cancellations ?? [])) {
              try {
                const s = await resolveStudentFull(c.student_name);
                resolvedCancels.push({
                  student_id: s.id, student_display: s.displayName + s.correction,
                  target_time: c.target_time ?? null,
                });
              } catch (err: any) {
                resolvedCancels.push({
                  student_id: null, student_display: c.student_name,
                  target_time: c.target_time ?? null, error: err.message,
                });
              }
            }
            resolvedParams.cancellations = resolvedCancels;

          } else if (toolName === "book_student") {
            const s = await resolveStudentFull(toolInput.student_name);
            resolvedParams.student_id = s.id;
            resolvedParams.student_display = s.displayName + s.correction;
            resolvedParams.location_id = schedule_context?.location_id ?? s.location_id;
            resolvedParams.family_id = s.family_id;
            if (toolInput.teacher_name) {
              const t = await resolveTeacherFull(toolInput.teacher_name);
              resolvedParams.teacher_id = t.id;
              resolvedParams.teacher_display = t.name;
            } else if (s.teacher_id) {
              resolvedParams.teacher_id = s.teacher_id;
              resolvedParams.teacher_display = teacherMap[s.teacher_id] ?? "assigned teacher";
            }
            if (!resolvedParams.target_date && schedule_context?.date) resolvedParams.target_date = schedule_context.date;
            if (!resolvedParams.block_type) resolvedParams.block_type = "student_session";
            if (resolvedParams.recurring === undefined) resolvedParams.recurring = true;

          } else if (toolName === "batch_book_students") {
            const t = await resolveTeacherFull(toolInput.teacher_name);
            resolvedParams.teacher_id = t.id;
            resolvedParams.teacher_display = t.name;
            if (!resolvedParams.target_date && schedule_context?.date) resolvedParams.target_date = schedule_context.date;
            resolvedParams.location_id = schedule_context?.location_id ?? null;
            if (resolvedParams.recurring === undefined) resolvedParams.recurring = true;

            const resolvedBookings: any[] = [];
            for (const booking of (toolInput.bookings ?? [])) {
              try {
                const s = await resolveStudentFull(booking.student_name);
                resolvedBookings.push({
                  student_id: s.id,
                  student_display: s.displayName + s.correction,
                  target_time: booking.target_time,
                  block_type: booking.block_type ?? "student_session",
                });
              } catch (err: any) {
                resolvedBookings.push({
                  student_id: null, student_display: booking.student_name,
                  target_time: booking.target_time, block_type: booking.block_type ?? "student_session",
                  error: err.message,
                });
              }
            }
            resolvedParams.bookings = resolvedBookings;

          } else if (toolName === "find_coverage") {
            const t = await resolveTeacherFull(toolInput.teacher_name);
            resolvedParams.teacher_id = t.id;
            resolvedParams.teacher_display = t.name;
            if (schedule_context?.location_id) resolvedParams.location_id = schedule_context.location_id;
            if (!resolvedParams.date && schedule_context?.date) resolvedParams.date = schedule_context.date;
          }

          // Sibling check for single bookings
          let siblingWarning = "";
          if ((toolName === "book_student" || toolName === "move_lesson") && resolvedParams.family_id) {
            const sibs = siblingFamilies[resolvedParams.family_id];
            if (sibs && sibs.length >= 2) {
              const otherSibs = sibs.filter(x => x.id !== resolvedParams.student_id);
              const checkDate = resolvedParams.target_date ?? todayStr;
              const { data: sibBlocks } = await sb.from("schedule_blocks")
                .select("student_id, start_time").in("student_id", otherSibs.map(x => x.id))
                .eq("block_date", checkDate).eq("status", "booked");
              if (sibBlocks && sibBlocks.length > 0) {
                const [h, m] = resolvedParams.target_time.split(":");
                const targetMin = parseInt(h) * 60 + parseInt(m);
                for (const sb2 of sibBlocks) {
                  const sib = otherSibs.find(x => x.id === sb2.student_id);
                  const [sh, sm] = sb2.start_time.split(":");
                  const gap = Math.abs(targetMin - (parseInt(sh) * 60 + parseInt(sm)));
                  if (gap > 30) siblingWarning = ` ⚠️ SIBLING: ${sib?.name} is at ${formatTime(sb2.start_time)} (${gap}min apart)`;
                }
              }
            }
          }

          // Build description
          let description = "";
          const recurLabel = (r: boolean) => r ? " (recurring weekly)" : " (one-time)";
          if (toolName === "move_lesson") {
            const scopeLabel = resolvedParams.move_scope === "all_future" ? " (+ all future recurring)" : "";
            const fromTeacher = resolvedParams.source_teacher_display ? ` from ${resolvedParams.source_teacher_display}` : "";
            const toTeacher = resolvedParams.target_teacher_display ? ` to ${resolvedParams.target_teacher_display}` : "";
            description = `Move ${resolvedParams.student_display}'s lesson${fromTeacher}${toTeacher} at ${formatTime(resolvedParams.target_time + ":00")}`;
            if (resolvedParams.target_date) description += ` on ${resolvedParams.target_date}`;
            description += scopeLabel;
            description += `\nThis will remove the existing session${fromTeacher ? fromTeacher + "'s schedule" : ""} and book it${toTeacher ? toTeacher + "'s schedule" : ""}.`;
            if (resolvedParams.move_scope === "all_future") description += " All future recurring lessons will also transfer.";
          } else if (toolName === "book_student") {
            const typeLabel = resolvedParams.block_type === "student_session" ? "" : ` (${resolvedParams.block_type.replace(/_/g, " ")})`;
            description = `Book ${resolvedParams.student_display} at ${formatTime(resolvedParams.target_time + ":00")} with ${resolvedParams.teacher_display ?? "their teacher"}${typeLabel}${recurLabel(resolvedParams.recurring)}`;
            if (resolvedParams.target_date) description += ` starting ${resolvedParams.target_date}`;
          } else if (toolName === "batch_book_students") {
            const lines = resolvedParams.bookings.map((b: any) => {
              if (b.error) return `✗ ${b.student_display} at ${formatTime(b.target_time + ":00")} — ${b.error}`;
              return `• ${b.student_display} at ${formatTime(b.target_time + ":00")}`;
            });
            description = `Batch book with ${resolvedParams.teacher_display}${recurLabel(resolvedParams.recurring)} on ${resolvedParams.target_date}:\n${lines.join("\n")}`;
          } else if (toolName === "find_coverage") {
            description = `Find sub coverage for ${resolvedParams.teacher_display}${resolvedParams.date ? ` on ${resolvedParams.date}` : " today"}`;
          } else if (toolName === "cancel_lesson") {
            const reasonLabel = resolvedParams.reason === "other" ? (resolvedParams.reason_detail ?? "other") : resolvedParams.reason.replace(/_/g, " ");
            const scopeLabel = resolvedParams.cancel_scope === "all_future" ? " + ALL future recurring" : "";
            description = `Cancel ${resolvedParams.student_display}'s lesson${resolvedParams.date ? ` on ${resolvedParams.date}` : " today"}${scopeLabel}\nReason: ${reasonLabel}`;
          } else if (toolName === "batch_cancel_lessons") {
            const reasonLabel = resolvedParams.reason === "other" ? (resolvedParams.reason_detail ?? "other") : resolvedParams.reason.replace(/_/g, " ");
            const scopeLabel = resolvedParams.cancel_scope === "all_future" ? " + all future" : "";
            const lines = resolvedParams.cancellations.map((c: any) => {
              const timeStr = c.target_time ? ` at ${formatTime(c.target_time + ":00")}` : "";
              if (c.error) return `✗ ${c.student_display}${timeStr} — ${c.error}`;
              return `• ${c.student_display}${timeStr}`;
            });
            description = `Batch cancel${scopeLabel} on ${resolvedParams.date ?? "today"}:\n${lines.join("\n")}\nReason: ${reasonLabel}`;
          }
          if (siblingWarning) description += siblingWarning;

          proposed_action = { action: toolName, params: resolvedParams, description };
        } catch (resolveErr: any) {
          answer += `\n\nI tried to help but hit an issue: ${resolveErr.message}`;
        }
      }
    }

    if (!answer && proposed_action) {
      answer = `I'll ${proposed_action.description.charAt(0).toLowerCase() + proposed_action.description.slice(1)}. Please confirm.`;
    }
    if (!answer) answer = "No response from AI.";

    // Pre-compute session ID so we can return it immediately
    const schedSessionId = ai_session_id && UUID_RE.test(String(ai_session_id)) ? String(ai_session_id) : crypto.randomUUID();

    // Fire-and-forget persistence — don't block the response on DB writes
    persistZiroExchange(sb, req, {
      tenantId: tenant_id,
      question,
      answer,
      usage: claudeData.usage,
      source: typeof clientSource === "string" && clientSource ? clientSource : "ziro_schedule",
      aiSessionId: schedSessionId,
      clientRoute: typeof client_route === "string" ? client_route : null,
      pageContext: client_page_context && typeof client_page_context === "object" ? client_page_context : {},
      model: "claude-sonnet-4-6",
      assistantMetadata: typeof proposed_action !== "undefined" && proposed_action
        ? { proposed_action }
        : {},
    }).catch((e) => console.error("[ai-assistant] background persist (schedule) failed:", e));

    const payload: any = {
      answer,
      usage: claudeData.usage,
      ai_session_id: schedSessionId,
    };
    if (proposed_action) payload.proposed_action = proposed_action;
    return new Response(JSON.stringify(payload), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
