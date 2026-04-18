import { supabase } from '../lib/supabase'
import { fetchBillingSnapshotData, type BillingSnapshotData } from './billingSnapshotQuery'

export type { BillingSnapshotData }

/**
 * Low-level RPC + billing merge. Prefer the Ziro entrypoints in `app/src/ziro-core/` (`loadZiroGlobalContext`,
 * `buildZiroUserScope`, `appendPageContextToZiroPrompt`) so scope and page layers stay consistent.
 *
 * Raw context data from `get_ziro_context()` RPC — used by Ziro modal/charts (non-billing sections).
 *
 * SECURITY / TRUTH — read before changing callers:
 * - Server-side RPC (`get_ziro_context`) now enforces auth, role verification, location scoping,
 *   and field zeroing (teacher/director restrictions). Client-side masking below is defense-in-depth.
 * - Billing dollar amounts for Ziro **must** come from `billing_snapshot` (same queries as dashboard Billing Snapshot).
 * - Backend checklist: `app/docs/ZIRO_BACKEND_HANDOFF.md`
 */
export interface ZiroContextData {
  generated_at: string
  students: { active: number; paused: number; inactive: number; by_location: { location: string; count: number }[]; by_instrument: { instrument: string; count: number }[] }
  families: { total: number; total_overdue_cents: number; families_overdue: number; with_card_on_file: number; no_card_on_file: number; autopay_enabled: number }
  billing: { estimated_mrr_cents: number; mrr_by_location: { location: string; mrr_cents: number }[] }
  schedule: { booked_this_week: number; available_this_week: number; utilization_pct: number; booked_this_month: number; callouts_this_week: number; by_location_this_week: { location: string; booked: number; available: number }[] }
  teachers: { active: number; no_students: number; contract_missing: number; load_by_teacher: { name: string; active_students: number; instruments?: string[] }[] }
  leads: { active_total: number; needing_followup: number; new_last_7_days: number; new_last_30_days: number; converted_last_30_days: number; lost_last_30_days: number }
  retention: { students_paused: number; students_may_return: number; students_inactive_last_60_days: number; active_campaigns: number }
  sessions: { total_last_30_days: number; total_last_7_days: number; notes_written_last_7_days: number }
  tasks: { open: number; overdue: number; high_priority_open: number }
  locations: { name: string; active_students: number; mrr_cents: number; booked_this_week: number }[]
}

/** RPC payload + dashboard-parity billing snapshot (not from RPC). */
export type ZiroPromptContext = ZiroContextData & {
  billing_snapshot: BillingSnapshotData | null
}

export interface FetchZiroContextOptions {
  /** When set (e.g. studio director’s first assigned location), matches `useBillingSnapshot(locationId)`. Omit for all-location aggregate. */
  billingLocationId?: string
}

/**
 * Fetches the raw JSONB from get_ziro_context() RPC and merges Billing Snapshot data (same path as dashboard).
 */
export async function fetchZiroContext(
  tenantId: string,
  role?: string | null,
  options?: FetchZiroContextOptions,
): Promise<ZiroPromptContext | null> {
  const { data, error } = await supabase.rpc('get_ziro_context', {
    p_tenant_id: tenantId,
  })

  if (error || !data) {
    console.error('[Ziro] Context fetch failed:', error)
    return null
  }

  const ctx = data as ZiroContextData

  const canSeeBilling =
    role !== 'teacher' && role !== 'parent' && role !== 'student'

  let billing_snapshot: BillingSnapshotData | null = null
  if (canSeeBilling) {
    try {
      billing_snapshot = await fetchBillingSnapshotData(tenantId, options?.billingLocationId)
    } catch (e) {
      console.error('[Ziro] Billing snapshot fetch failed:', e)
      billing_snapshot = null
    }
  }

  // Strip sensitive data based on role (UI/prompt only — not a security boundary; see file header).
  if (role === 'teacher' || role === 'parent') {
    ctx.billing = { estimated_mrr_cents: 0, mrr_by_location: [] }
    ctx.families = { ...ctx.families, total_overdue_cents: 0, families_overdue: 0 }
  }

  return { ...ctx, billing_snapshot }
}

function formatMoney(cents: number): string {
  const v = cents / 100
  return '$' + v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

/**
 * Formats live business snapshot context into a system prompt string for Ziro.
 */
export function formatZiroPrompt(ctx: ZiroPromptContext, role?: string | null): string {
  const ts = ctx.generated_at ? new Date(ctx.generated_at).toLocaleString() : new Date().toLocaleString()

  const roleRestrictions: Record<string, string> = {
    owner: 'USER ROLE: Owner — full access to all data and actions.',
    admin: 'USER ROLE: Company Director — can see revenue/payroll/collections but NOT owner take-home or profit margin.',
    company_director: 'USER ROLE: Company Director — can see revenue/payroll/collections but NOT owner take-home or profit margin.',
    studio_director: 'USER ROLE: Studio Director — can ONLY answer questions about their assigned location. Cannot make financial changes, setting changes, or cross-location operations.',
    teacher: 'USER ROLE: Teacher — can only answer questions about their own students and schedule. No financial data.',
    parent: "USER ROLE: Parent — can only answer questions about their child's progress and schedule.",
  }
  const roleHeader = roleRestrictions[role ?? ''] ?? 'USER ROLE: Unknown'

  const billingBlock =
    ctx.billing_snapshot != null
      ? `BILLING SNAPSHOT (same definitions as Dashboard → Billing Snapshot)
- Collected This Month: ${formatMoney(ctx.billing_snapshot.collectedCents)}
- Total Invoiced This Month: ${formatMoney(ctx.billing_snapshot.totalInvoicedCents)}
- Discounted This Month: ${formatMoney(ctx.billing_snapshot.discountedCents)}
- Next Month (${ctx.billing_snapshot.nextMonthLabel} Projected): ${formatMoney(ctx.billing_snapshot.nextMonthCents)}
- Scheduled Payments: ${formatMoney(ctx.billing_snapshot.scheduledPaymentsCents)}`
      : `BILLING SNAPSHOT: Not included for your role or unavailable. Do not cite dollar amounts for billing.`

  return `${roleHeader}

You are Ziro — the AI operator inside ZiroWork. You work alongside the user like a sharp business partner who knows their school inside-out.

RESPONSE STYLE — THIS IS CRITICAL:
- Be conversational and direct. Talk like a trusted operator, not a report generator.
- Default to SHORT replies: 1-3 sentences for most questions. Just answer the thing they asked.
- Do NOT dump all related data. Give the most useful answer first. If there is more to unpack, ask a smart follow-up question instead (e.g. "Want me to break that down by location?" or "Should I dig into who's at risk?").
- Avoid markdown headings (###), long bullet walls, and summary blocks. Use plain language. A short list is fine when it fits — a formatted report is not.
- Use emoji sparingly where it adds clarity (a single ✅ or ⚠️ is fine). Do not overdo it.
- When the user asks something broad ("how's the school doing?"), give a quick pulse — the one or two most important things — then ask what they want to zoom into.
- When the user asks something specific ("how many students at Omaha?"), answer it directly in one line. Do not pad with extra context they did not ask for.
- Only give a longer, detailed breakdown when the user explicitly asks for one ("give me the full breakdown", "list everything", "detailed report").
- Never start with "Great question!" or similar filler. Get to the point.

DATA RULES:
- Use only figures and facts from the snapshot below and any appended context. Do not invent metrics, names, or amounts.
- If something is not in the snapshot, say so briefly and point them to the right area of the app.
- Sessions are always 30-minute increments. Never make up numbers.

== LIVE BUSINESS SNAPSHOT (as of ${ts}) ==

SCHOOL OVERVIEW
- Active students: ${ctx.students?.active ?? 0}
- Paused students: ${ctx.students?.paused ?? 0}
- Inactive/former students: ${ctx.students?.inactive ?? 0}
- Total families: ${ctx.families?.total ?? 0}
- Active teachers: ${ctx.teachers?.active ?? 0}

${billingBlock}

STUDENTS BY LOCATION:
${(ctx.students?.by_location ?? []).map((l) => `- ${l.location}: ${l.count} students`).join('\n') || '- No location data'}

TOP INSTRUMENTS:
${(ctx.students?.by_instrument ?? []).map((i) => `- ${i.instrument}: ${i.count}`).join('\n') || '- No instrument data'}

SCHEDULE (this week)
- Booked slots: ${ctx.schedule?.booked_this_week ?? 0}
- Available slots: ${ctx.schedule?.available_this_week ?? 0}
- Utilization: ${ctx.schedule?.utilization_pct ?? 0}%
- Booked this month: ${ctx.schedule?.booked_this_month ?? 0}
- Callouts this week: ${ctx.schedule?.callouts_this_week ?? 0}

SCHEDULE BY LOCATION (this week):
${(ctx.schedule?.by_location_this_week ?? []).map((l) => `- ${l.location}: ${l.booked} booked / ${l.available} available`).join('\n') || '- No schedule data'}

LEADS
- Active leads in pipeline: ${ctx.leads?.active_total ?? 0}
- Leads needing follow-up: ${ctx.leads?.needing_followup ?? 0}
- New leads (last 7 days): ${ctx.leads?.new_last_7_days ?? 0}
- New leads (last 30 days): ${ctx.leads?.new_last_30_days ?? 0}
- Converted (last 30 days): ${ctx.leads?.converted_last_30_days ?? 0}
- Lost (last 30 days): ${ctx.leads?.lost_last_30_days ?? 0}

TEACHER LOADS:
${(ctx.teachers?.load_by_teacher ?? []).map((t) => `- ${t.name}: ${t.active_students} students${t.instruments?.length ? ` (${t.instruments.join(', ')})` : ''}`).join('\n') || '- No teacher data'}

Teachers with no students: ${ctx.teachers?.no_students ?? 0}
Teachers missing contract: ${ctx.teachers?.contract_missing ?? 0}

RETENTION
- Students paused: ${ctx.retention?.students_paused ?? 0}
- Students who may return: ${ctx.retention?.students_may_return ?? 0}
- Students gone inactive (last 60 days): ${ctx.retention?.students_inactive_last_60_days ?? 0}
- Active retention campaigns: ${ctx.retention?.active_campaigns ?? 0}

SESSIONS (last 30 days)
- Total sessions logged: ${ctx.sessions?.total_last_30_days ?? 0}
- Sessions last 7 days: ${ctx.sessions?.total_last_7_days ?? 0}
- Notes written last 7 days: ${ctx.sessions?.notes_written_last_7_days ?? 0}

TASKS
- Open tasks: ${ctx.tasks?.open ?? 0}
- Overdue tasks: ${ctx.tasks?.overdue ?? 0}
- High priority open: ${ctx.tasks?.high_priority_open ?? 0}

LOCATIONS (operational — not billing dollars):
${(ctx.locations ?? []).map((l) => `- ${l.name}: ${l.active_students ?? 0} students, ${l.booked_this_week ?? 0} sessions this week`).join('\n') || '- No location data'}

== END SNAPSHOT ==

Answer using only the data above (and any appended context blocks). When asked about revenue or billing, use the BILLING SNAPSHOT figures only — do not use RPC enrollment estimates or overdue/card fields from older integrations.
For students, teachers, schedule, or leads — use the numbers shown. Do not estimate or approximate beyond what is shown. If data for a specific question isn't in the snapshot, say so briefly and suggest the right page in the app.

REMINDER: Keep it short. Answer the question, then offer to go deeper — do not go deeper by default.`
}

// Legacy compat — used by old callers
export async function getZiroContext(tenantId: string, role?: string | null): Promise<string> {
  const ctx = await fetchZiroContext(tenantId, role)
  if (!ctx) return 'Business context unavailable — answer only from what the user tells you.'
  return formatZiroPrompt(ctx, role)
}
