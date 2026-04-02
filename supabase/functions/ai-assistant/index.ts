import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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

// ═══════════════════════════════════════
// MAIN HANDLER
// ═══════════════════════════════════════

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    if (!ANTHROPIC_API_KEY) {
      return new Response(JSON.stringify({ error: "ANTHROPIC_API_KEY not configured" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { question, conversation_history, tenant_id, schedule_context, timezone, system_override } = await req.json();
    if (!question || !tenant_id) {
      return new Response(JSON.stringify({ error: "question and tenant_id required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const tz = timezone || "America/Chicago";
    const todayStr = getDateStringInTimezone(tz);
    const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Gather context — only what's needed for scheduling
    const [
      { data: tenant },
      { data: locations },
      { data: teachers },
      { data: students },
      { data: families },
    ] = await Promise.all([
      sb.from("tenants").select("name, slug").eq("id", tenant_id).single(),
      sb.from("locations").select("id, name, is_active").eq("tenant_id", tenant_id),
      sb.from("teachers").select("id, first_name, last_name, instruments, is_active, profile:profiles!teachers_profile_id_fkey(first_name, last_name)").eq("tenant_id", tenant_id),
      sb.from("students").select("id, first_name, last_name, instrument, status, location_id, teacher_id, family_id").eq("tenant_id", tenant_id).eq("status", "active"),
      sb.from("families").select("id, name, is_military").eq("tenant_id", tenant_id),
    ]);

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

CANCELLATION RULES:
- Every cancellation MUST include a reason. Pick the best-fit preset: student_sick, teacher_sick, family_emergency, no_show, schedule_conflict, holiday, weather, other.
- If user says "sick" → student_sick. If user says "teacher is out" → teacher_sick. If vague, use the most likely preset.
- RECURRING CHECK: If the student's block on the schedule shows is_recurring or block_type is student_session (most are recurring), ASK: "Cancel just this week or all future lessons?" BEFORE calling the tool. Wait for the answer, then call with the correct cancel_scope.
- If user explicitly says "cancel all", "cancel going forward", "drop the student" → all_future. If they say "just today", "this week only" → this_week.
- Cancelled blocks flip back to Open so the teacher's time is available.`;

    // Honor system_override — when present, use it instead of the default scheduling prompt
    const finalSystemPrompt = system_override || systemPrompt;

    const messages: any[] = [];
    if (conversation_history && Array.isArray(conversation_history)) {
      for (const msg of conversation_history.slice(-10)) messages.push({ role: msg.role, content: msg.content });
    }
    messages.push({ role: "user", content: question });

    const tools = [
      {
        name: "move_lesson",
        description: "Move a student's lesson to a different time/date/teacher.",
        input_schema: {
          type: "object",
          properties: {
            student_name: { type: "string" },
            target_time: { type: "string", description: "HH:MM 24h format" },
            target_date: { type: "string", description: `YYYY-MM-DD. Default: ${ctxDate}` },
            target_teacher_name: { type: "string", description: "Optional — keeps current teacher if omitted" },
          },
          required: ["student_name", "target_time"],
        },
      },
      {
        name: "book_student",
        description: "Book a student into a time slot. Default: student_session, recurring weekly.",
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

    const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: 1024, system: finalSystemPrompt, messages, ...(system_override ? {} : { tools, tool_choice: { type: "auto" } }) }),
    });

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
            description = `Move ${resolvedParams.student_display}'s lesson to ${formatTime(resolvedParams.target_time + ":00")}`;
            if (resolvedParams.target_date) description += ` on ${resolvedParams.target_date}`;
            if (resolvedParams.target_teacher_display) description += ` with ${resolvedParams.target_teacher_display}`;
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

    // Log
    const authHeader = req.headers.get("Authorization");
    if (authHeader) {
      try {
        const token = authHeader.replace("Bearer ", "");
        const profileId = JSON.parse(atob(token.split(".")[1])).sub;
        if (profileId) {
          await createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY).from("ai_conversations").insert([
            { tenant_id, profile_id: profileId, role: "user", content: question, metadata: { source: "schedule_panel" } },
            { tenant_id, profile_id: profileId, role: "assistant", content: answer, metadata: { model: "claude-sonnet-4-6", usage: claudeData.usage } },
          ]);
        }
      } catch { /* ok */ }
    }

    const payload: any = { answer, usage: claudeData.usage };
    if (proposed_action) payload.proposed_action = proposed_action;
    return new Response(JSON.stringify(payload), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
