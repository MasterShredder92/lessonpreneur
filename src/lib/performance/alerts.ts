/**
 * SPEED Agent — Alerts
 *
 * Threshold definitions, alert generation, and Supabase read/write helpers
 * for the performance_alerts table.
 */

import { supabase } from '../supabase'
import type { PageMetricRow, RouteSummary, SlowQuerySummary } from './metrics'

// ─── Types ───────────────────────────────────────────────────────────────────

export type AlertSeverity = 'warning' | 'critical'
export type AlertType =
  | 'slow_lcp'
  | 'slow_fcp'
  | 'high_cls'
  | 'slow_inp'
  | 'slow_query'
  | 'high_slow_query_rate'

export interface PerformanceAlert {
  id: string
  tenant_id: string
  alert_type: AlertType
  severity: AlertSeverity
  message: string
  details: Record<string, unknown>
  resolved: boolean
  resolved_at: string | null
  created_at: string
}

// ─── Thresholds (based on Core Web Vitals + Google guidelines) ───────────────

export const THRESHOLDS = {
  lcp: { warning: 2500, critical: 4000 },    // ms
  fcp: { warning: 1800, critical: 3000 },    // ms
  cls: { warning: 0.1,  critical: 0.25 },   // score
  inp: { warning: 200,  critical: 500 },     // ms
  queryMs: { warning: 500, critical: 2000 }, // ms
  slowQueryRatePct: { warning: 15, critical: 30 }, // % of queries that are slow
} as const

// ─── Alert generation ────────────────────────────────────────────────────────

interface CandidateAlert {
  alert_type: AlertType
  severity: AlertSeverity
  message: string
  details: Record<string, unknown>
}

/**
 * Evaluate route summaries and slow-query data against thresholds.
 * Returns a list of new alerts to create (does not write to DB — call
 * createAlerts() to persist them).
 */
export function evaluateThresholds(
  routeSummaries: RouteSummary[],
  slowQueries: SlowQuerySummary[],
  totalQuerySamples: number,
): CandidateAlert[] {
  const alerts: CandidateAlert[] = []

  // ── Page metric alerts (per route) ──
  for (const summary of routeSummaries) {
    if (summary.sample_count < 3) continue // need enough samples

    if (summary.avg_lcp_ms != null) {
      if (summary.avg_lcp_ms >= THRESHOLDS.lcp.critical) {
        alerts.push({
          alert_type: 'slow_lcp',
          severity: 'critical',
          message: `Critical LCP on ${summary.page_route}: avg ${summary.avg_lcp_ms}ms (threshold ${THRESHOLDS.lcp.critical}ms)`,
          details: { route: summary.page_route, avg_lcp_ms: summary.avg_lcp_ms, sample_count: summary.sample_count },
        })
      } else if (summary.avg_lcp_ms >= THRESHOLDS.lcp.warning) {
        alerts.push({
          alert_type: 'slow_lcp',
          severity: 'warning',
          message: `Slow LCP on ${summary.page_route}: avg ${summary.avg_lcp_ms}ms (threshold ${THRESHOLDS.lcp.warning}ms)`,
          details: { route: summary.page_route, avg_lcp_ms: summary.avg_lcp_ms, sample_count: summary.sample_count },
        })
      }
    }

    if (summary.avg_fcp_ms != null) {
      if (summary.avg_fcp_ms >= THRESHOLDS.fcp.critical) {
        alerts.push({
          alert_type: 'slow_fcp',
          severity: 'critical',
          message: `Critical FCP on ${summary.page_route}: avg ${summary.avg_fcp_ms}ms (threshold ${THRESHOLDS.fcp.critical}ms)`,
          details: { route: summary.page_route, avg_fcp_ms: summary.avg_fcp_ms, sample_count: summary.sample_count },
        })
      } else if (summary.avg_fcp_ms >= THRESHOLDS.fcp.warning) {
        alerts.push({
          alert_type: 'slow_fcp',
          severity: 'warning',
          message: `Slow FCP on ${summary.page_route}: avg ${summary.avg_fcp_ms}ms (threshold ${THRESHOLDS.fcp.warning}ms)`,
          details: { route: summary.page_route, avg_fcp_ms: summary.avg_fcp_ms, sample_count: summary.sample_count },
        })
      }
    }

    if (summary.avg_inp_ms != null) {
      if (summary.avg_inp_ms >= THRESHOLDS.inp.critical) {
        alerts.push({
          alert_type: 'slow_inp',
          severity: 'critical',
          message: `Critical INP on ${summary.page_route}: avg ${summary.avg_inp_ms}ms (threshold ${THRESHOLDS.inp.critical}ms)`,
          details: { route: summary.page_route, avg_inp_ms: summary.avg_inp_ms, sample_count: summary.sample_count },
        })
      } else if (summary.avg_inp_ms >= THRESHOLDS.inp.warning) {
        alerts.push({
          alert_type: 'slow_inp',
          severity: 'warning',
          message: `Slow INP on ${summary.page_route}: avg ${summary.avg_inp_ms}ms (threshold ${THRESHOLDS.inp.warning}ms)`,
          details: { route: summary.page_route, avg_inp_ms: summary.avg_inp_ms, sample_count: summary.sample_count },
        })
      }
    }

    if (summary.avg_cls != null) {
      if (summary.avg_cls >= THRESHOLDS.cls.critical) {
        alerts.push({
          alert_type: 'high_cls',
          severity: 'critical',
          message: `Critical CLS on ${summary.page_route}: avg score ${summary.avg_cls.toFixed(4)} (threshold ${THRESHOLDS.cls.critical})`,
          details: { route: summary.page_route, avg_cls: summary.avg_cls, sample_count: summary.sample_count },
        })
      } else if (summary.avg_cls >= THRESHOLDS.cls.warning) {
        alerts.push({
          alert_type: 'high_cls',
          severity: 'warning',
          message: `High CLS on ${summary.page_route}: avg score ${summary.avg_cls.toFixed(4)} (threshold ${THRESHOLDS.cls.warning})`,
          details: { route: summary.page_route, avg_cls: summary.avg_cls, sample_count: summary.sample_count },
        })
      }
    }
  }

  // ── Slow-query alerts ──
  for (const sq of slowQueries) {
    if (sq.avg_ms >= THRESHOLDS.queryMs.critical) {
      alerts.push({
        alert_type: 'slow_query',
        severity: 'critical',
        message: `Critical slow query "${sq.query_label}": avg ${sq.avg_ms}ms over ${sq.occurrence_count} calls`,
        details: { query_label: sq.query_label, table_name: sq.table_name, avg_ms: sq.avg_ms, max_ms: sq.max_ms, occurrence_count: sq.occurrence_count },
      })
    } else if (sq.avg_ms >= THRESHOLDS.queryMs.warning) {
      alerts.push({
        alert_type: 'slow_query',
        severity: 'warning',
        message: `Slow query "${sq.query_label}": avg ${sq.avg_ms}ms over ${sq.occurrence_count} calls`,
        details: { query_label: sq.query_label, table_name: sq.table_name, avg_ms: sq.avg_ms, max_ms: sq.max_ms, occurrence_count: sq.occurrence_count },
      })
    }
  }

  // ── Slow query rate alert ──
  if (totalQuerySamples > 20) {
    const totalSlowCount = slowQueries.reduce((acc, q) => acc + q.occurrence_count, 0)
    const ratePct = Math.round((totalSlowCount / totalQuerySamples) * 100)
    if (ratePct >= THRESHOLDS.slowQueryRatePct.critical) {
      alerts.push({
        alert_type: 'high_slow_query_rate',
        severity: 'critical',
        message: `${ratePct}% of queries are slow (>${THRESHOLDS.queryMs.warning}ms) in the last 7 days`,
        details: { rate_pct: ratePct, slow_count: totalSlowCount, total_count: totalQuerySamples },
      })
    } else if (ratePct >= THRESHOLDS.slowQueryRatePct.warning) {
      alerts.push({
        alert_type: 'high_slow_query_rate',
        severity: 'warning',
        message: `${ratePct}% of queries are slow (>${THRESHOLDS.queryMs.warning}ms) in the last 7 days`,
        details: { rate_pct: ratePct, slow_count: totalSlowCount, total_count: totalQuerySamples },
      })
    }
  }

  return alerts
}

// ─── Supabase I/O ─────────────────────────────────────────────────────────────

/** Fetch active (unresolved) alerts for the tenant, most recent first. */
export async function fetchActiveAlerts(tenantId: string): Promise<PerformanceAlert[]> {
  const { data, error } = await supabase
    .from('performance_alerts')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('resolved', false)
    .order('created_at', { ascending: false })
    .limit(100)

  if (error) throw error
  return (data ?? []) as PerformanceAlert[]
}

/** Fetch resolved alerts for the last 30 days. */
export async function fetchResolvedAlerts(tenantId: string): Promise<PerformanceAlert[]> {
  const since = new Date()
  since.setDate(since.getDate() - 30)

  const { data, error } = await supabase
    .from('performance_alerts')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('resolved', true)
    .gte('created_at', since.toISOString())
    .order('created_at', { ascending: false })
    .limit(50)

  if (error) throw error
  return (data ?? []) as PerformanceAlert[]
}

/** Persist evaluated alerts to the DB. Fire-and-forget. */
export async function createAlerts(
  tenantId: string,
  candidates: CandidateAlert[],
): Promise<void> {
  if (!candidates.length) return

  const rows = candidates.map(c => ({
    tenant_id: tenantId,
    alert_type: c.alert_type,
    severity: c.severity,
    message: c.message,
    details: c.details,
    resolved: false,
  }))

  const { error } = await supabase.from('performance_alerts').insert(rows)
  if (error) console.warn('[SPEED] alert insert failed', error.message)
}

/** Mark an alert as resolved. */
export async function resolveAlert(alertId: string): Promise<void> {
  const { error } = await supabase
    .from('performance_alerts')
    .update({ resolved: true, resolved_at: new Date().toISOString() })
    .eq('id', alertId)

  if (error) throw error
}

/** Severity → display color */
export function severityColor(severity: AlertSeverity): string {
  return severity === 'critical' ? '#D4226A' : '#FFB800'
}

/** Alert type → human label */
export function alertTypeLabel(type: AlertType): string {
  const map: Record<AlertType, string> = {
    slow_lcp: 'Slow LCP',
    slow_fcp: 'Slow FCP',
    high_cls: 'High CLS',
    slow_inp: 'Slow INP',
    slow_query: 'Slow Query',
    high_slow_query_rate: 'High Slow-Query Rate',
  }
  return map[type] ?? type
}

/** Score a single LCP value: 'good' | 'needs-improvement' | 'poor' */
export function scoreLcp(ms: number | null): 'good' | 'needs-improvement' | 'poor' | 'none' {
  if (ms == null) return 'none'
  if (ms <= 2500) return 'good'
  if (ms <= 4000) return 'needs-improvement'
  return 'poor'
}

/** Score a single FCP value */
export function scoreFcp(ms: number | null): 'good' | 'needs-improvement' | 'poor' | 'none' {
  if (ms == null) return 'none'
  if (ms <= 1800) return 'good'
  if (ms <= 3000) return 'needs-improvement'
  return 'poor'
}

/** Score a CLS value */
export function scoreCls(score: number | null): 'good' | 'needs-improvement' | 'poor' | 'none' {
  if (score == null) return 'none'
  if (score <= 0.1) return 'good'
  if (score <= 0.25) return 'needs-improvement'
  return 'poor'
}

// ─── Route → file mapping ────────────────────────────────────────────────────

const ROUTE_FILE_MAP: Record<string, string> = {
  '/admin/dashboard': 'src/pages/admin/Dashboard.tsx + src/hooks/useDashboard.ts',
  '/admin/students': 'src/pages/admin/Students.tsx + src/hooks/useStudents.ts',
  '/admin/teachers': 'src/pages/admin/Teachers.tsx + src/hooks/useTeachers.ts',
  '/admin/leads': 'src/pages/admin/Leads.tsx + src/hooks/useLeads.ts',
  '/admin/families': 'src/pages/admin/Families.tsx + src/hooks/useStudents.ts',
  '/admin/billing': 'src/pages/admin/Billing.tsx + src/hooks/useBilling.ts',
  '/admin/settings': 'src/pages/admin/Settings.tsx',
  '/admin/financials': 'src/pages/admin/Financials.tsx',
  '/admin/retention': 'src/pages/admin/Retention.tsx + src/hooks/useRetention.ts',
  '/admin/payroll': 'src/pages/admin/Payroll.tsx',
  '/admin/integrations': 'src/pages/admin/Integrations.tsx',
  '/admin/zirowork': 'src/pages/admin/ZiroWorkPage.tsx',
  '/teacher/dashboard': 'src/pages/teacher/TeacherDashboard.tsx',
  '/parent/dashboard': 'src/pages/parent/ParentDashboard.tsx',
}

const QUERY_HOOK_MAP: Record<string, string> = {
  'students.list': 'src/hooks/useStudents.ts — useStudents()',
  'teachers.list': 'src/hooks/useTeachers.ts — useTeachers()',
  'leads.list': 'src/hooks/useLeads.ts — useLeads()',
  'schedule.grid': 'src/hooks/useScheduleGrid.ts — useScheduleGrid()',
  'dashboard.data': 'src/hooks/useDashboard.ts — useDashboard()',
  'families.list': 'src/hooks/useStudents.ts — useFamilies()',
}

function resolveRouteFiles(route: string): string {
  if (ROUTE_FILE_MAP[route]) return ROUTE_FILE_MAP[route]
  // Try prefix match for schedule routes like /admin/schedule/2026-04-14
  if (route.startsWith('/admin/schedule')) return 'src/pages/admin/ScheduleDetail.tsx + src/hooks/useScheduleGrid.ts'
  // Generic admin route
  const slug = route.replace('/admin/', '').split('/')[0]
  if (slug) return `src/pages/admin/${slug.charAt(0).toUpperCase() + slug.slice(1)}.tsx (likely)`
  return 'Unknown — inspect route manually'
}

function resolveQueryFiles(queryLabel: string): string {
  if (QUERY_HOOK_MAP[queryLabel]) return QUERY_HOOK_MAP[queryLabel]
  // Infer from label pattern like "students.list" → useStudents
  const [domain] = queryLabel.split('.')
  if (domain) return `src/hooks/use${domain.charAt(0).toUpperCase() + domain.slice(1)}.ts (likely)`
  return 'Unknown — search codebase for query label'
}

// ─── Claude Code fix prompt generation ───────────────────────────────────────

export type PromptCategory = 'fix' | 'sql' | 'frontend'

export interface FixPrompt {
  category: PromptCategory
  label: string
  prompt: string
}

/**
 * Generate ready-to-paste Claude Code prompts for a performance alert.
 * Returns 1-3 prompts depending on alert type (fix, sql, frontend).
 */
export function generateFixPrompts(alert: PerformanceAlert): FixPrompt[] {
  const d = alert.details as any
  const route = d?.route as string | undefined
  const queryLabel = d?.query_label as string | undefined
  const tableName = d?.table_name as string | undefined
  const avgMs = d?.avg_ms as number | undefined
  const maxMs = d?.max_ms as number | undefined
  const occurrences = d?.occurrence_count as number | undefined
  const sampleCount = d?.sample_count as number | undefined
  const avgLcp = d?.avg_lcp_ms as number | undefined
  const avgFcp = d?.avg_fcp_ms as number | undefined
  const avgInp = d?.avg_inp_ms as number | undefined
  const avgCls = d?.avg_cls as number | undefined

  switch (alert.alert_type as AlertType) {
    case 'slow_query':
      return buildSlowQueryPrompts(alert, queryLabel, tableName, avgMs, maxMs, occurrences)
    case 'slow_lcp':
      return buildWebVitalPrompts(alert, 'LCP', route, avgLcp, sampleCount)
    case 'slow_fcp':
      return buildWebVitalPrompts(alert, 'FCP', route, avgFcp, sampleCount)
    case 'slow_inp':
      return buildInpPrompts(alert, route, avgInp, sampleCount)
    case 'high_cls':
      return buildClsPrompts(alert, route, avgCls, sampleCount)
    case 'high_slow_query_rate':
      return buildSlowRatePrompts(alert, d)
    default:
      return [{ category: 'fix', label: 'Copy Fix Prompt', prompt: buildGenericPrompt(alert) }]
  }
}

function buildSlowQueryPrompts(
  alert: PerformanceAlert,
  queryLabel?: string,
  tableName?: string,
  avgMs?: number,
  maxMs?: number,
  occurrences?: number,
): FixPrompt[] {
  const hookFile = queryLabel ? resolveQueryFiles(queryLabel) : 'Unknown'
  const prompts: FixPrompt[] = []

  prompts.push({
    category: 'fix',
    label: 'Copy Fix Prompt',
    prompt: `SPEED ALERT — Slow Query Fix
Severity: ${alert.severity.toUpperCase()}
Query: ${queryLabel ?? 'unknown'}
Table: ${tableName ?? 'unknown'}
Avg execution time: ${avgMs ?? '?'}ms (threshold: 500ms)
Max execution time: ${maxMs ?? '?'}ms
Occurrences: ${occurrences ?? '?'}

DETECTED BY: SPEED performance monitoring system on lessonpreneur.io

FILES TO INSPECT:
${hookFile}

TASK:
1. Open the hook file above and find the Supabase query labeled "${queryLabel}".
2. Analyze the query shape:
   - Is it using .select('*')? Switch to explicit column list.
   - Is .limit() present? Add one if missing (max 500 for lists).
   - Are there missing WHERE filters? Add tenant_id + date range bounds.
   - Is there an N+1 pattern (queries inside loops)? Refactor to batch.
   - Are enrichment sub-queries parallelized with Promise.all()? Fix if sequential.
3. Check if the ${tableName ?? 'target'} table has indexes on the filter columns:
   - Run: SELECT indexname, indexdef FROM pg_indexes WHERE tablename = '${tableName ?? '<table>'}';
   - Add missing indexes on foreign key and filter columns.
4. After patching, verify the query timing improves:
   - Navigate to the page that triggers this query.
   - Check the SPEED dashboard in Settings for updated timing.
   - Target: under 500ms avg execution time.
5. Do NOT silence the alert — fix the actual query performance.
6. Report: exact files changed, what was wrong, what you fixed, new timing.

npm run build && vercel --prod`,
  })

  prompts.push({
    category: 'sql',
    label: 'Copy SQL Prompt',
    prompt: `SPEED ALERT — Database Index Check
Table: ${tableName ?? 'unknown'}
Query: ${queryLabel ?? 'unknown'}
Avg time: ${avgMs ?? '?'}ms | Max: ${maxMs ?? '?'}ms

Run these checks on Supabase project dhsyxyhtoadrqfrlmsqe:

1. Check existing indexes:
   SELECT indexname, indexdef FROM pg_indexes WHERE tablename = '${tableName ?? '<table>'}';

2. Check table size:
   SELECT pg_size_pretty(pg_total_relation_size('${tableName ?? '<table>'}'));

3. Analyze the slow query plan — find the Supabase query in ${hookFile} and run EXPLAIN ANALYZE on the raw SQL equivalent.

4. Add missing indexes on:
   - tenant_id (if not already indexed)
   - Any foreign key columns used in JOINs
   - Any columns used in WHERE/filter clauses
   - Composite index on (tenant_id, <most-common-filter>, created_at DESC) if date-ranged

5. Verify improvement after index creation.`,
  })

  return prompts
}

function buildWebVitalPrompts(
  alert: PerformanceAlert,
  vital: 'LCP' | 'FCP',
  route?: string,
  avgMs?: number,
  sampleCount?: number,
): FixPrompt[] {
  const files = route ? resolveRouteFiles(route) : 'Unknown'
  const threshold = vital === 'LCP' ? THRESHOLDS.lcp : THRESHOLDS.fcp
  const prompts: FixPrompt[] = []

  prompts.push({
    category: 'frontend',
    label: 'Copy Frontend Prompt',
    prompt: `SPEED ALERT — Slow ${vital} Fix
Severity: ${alert.severity.toUpperCase()}
Route: ${route ?? 'unknown'}
Avg ${vital}: ${avgMs ?? '?'}ms (warning: ${threshold.warning}ms, critical: ${threshold.critical}ms)
Samples: ${sampleCount ?? '?'}

DETECTED BY: SPEED performance monitoring system on lessonpreneur.io

FILES TO INSPECT:
${files}

TASK:
1. Open the page component and analyze what renders above the fold.
2. Check the component's data-fetching hooks:
   - Are queries blocking first render? Add Suspense/skeleton loading.
   - Is the query fetching more data than the view needs? Trim the select.
   - Are multiple sequential queries causing a waterfall? Parallelize with Promise.all().
3. Check for render-blocking resources:
   - Large images without preload or lazy loading.
   - Heavy components imported synchronously that should be lazy().
   - Inline SVGs or large data URIs above the fold.
4. Verify the route is code-split (should use lazy() import in App.tsx).
5. ${vital === 'LCP'
      ? 'If the LCP element is an image, add <link rel="preload" as="image"> in index.html or preload it programmatically.'
      : 'If FCP is slow, check if AuthContext or global providers are blocking initial paint with sequential data fetches.'}
6. After fixing, navigate to ${route ?? 'the route'} and verify ${vital} drops below ${threshold.warning}ms in SPEED dashboard.
7. Do NOT add loading spinners as a fix — fix the actual bottleneck.
8. Report: exact files changed, what was bottlenecking, new ${vital} timing.

npm run build && vercel --prod`,
  })

  return prompts
}

function buildInpPrompts(
  alert: PerformanceAlert,
  route?: string,
  avgInp?: number,
  sampleCount?: number,
): FixPrompt[] {
  const files = route ? resolveRouteFiles(route) : 'Unknown'

  return [{
    category: 'frontend',
    label: 'Copy Frontend Prompt',
    prompt: `SPEED ALERT — Slow INP (Interaction to Next Paint) Fix
Severity: ${alert.severity.toUpperCase()}
Route: ${route ?? 'unknown'}
Avg INP: ${avgInp ?? '?'}ms (warning: 200ms, critical: 500ms)
Samples: ${sampleCount ?? '?'}

DETECTED BY: SPEED performance monitoring system on lessonpreneur.io

FILES TO INSPECT:
${files}

TASK:
1. Open the page component and identify interactive elements (buttons, inputs, dropdowns, modals).
2. Profile click/input handlers for expensive synchronous work:
   - Are handlers triggering large React re-renders? Add React.memo() on heavy child components.
   - Are handlers doing synchronous computation (sorting, filtering large arrays)? Move to useMemo or debounce.
   - Are handlers opening modals that mount expensive components? Lazy-load modal content.
3. Check for expensive derived state that recalculates on every interaction:
   - Large .filter().map().sort() chains in render body → move to useMemo with proper deps.
   - State updates that cause the entire page to re-render → split state or use React.memo.
4. Check if any onClick handlers call multiple sequential Supabase queries — batch them.
5. After fixing, interact with the page and verify INP drops below 200ms in SPEED dashboard.
6. Report: exact files changed, which interaction was slow, what you fixed.

npm run build && vercel --prod`,
  }]
}

function buildClsPrompts(
  alert: PerformanceAlert,
  route?: string,
  avgCls?: number,
  sampleCount?: number,
): FixPrompt[] {
  const files = route ? resolveRouteFiles(route) : 'Unknown'

  return [{
    category: 'frontend',
    label: 'Copy Frontend Prompt',
    prompt: `SPEED ALERT — High CLS (Layout Shift) Fix
Severity: ${alert.severity.toUpperCase()}
Route: ${route ?? 'unknown'}
Avg CLS: ${avgCls?.toFixed(4) ?? '?'} (warning: 0.1, critical: 0.25)
Samples: ${sampleCount ?? '?'}

DETECTED BY: SPEED performance monitoring system on lessonpreneur.io

FILES TO INSPECT:
${files}

TASK:
1. Open the page component and identify elements that load asynchronously (images, data-driven content, charts).
2. For each async element:
   - Set explicit width/height or aspect-ratio on containers BEFORE data loads.
   - Add skeleton placeholders that match the final layout dimensions.
   - If using Recharts or similar, set fixed container height.
3. Check for dynamic content insertion:
   - Toasts, banners, or alerts that push content down → use fixed positioning.
   - Conditional renders that insert elements above existing content → reserve space.
4. Check font loading — if custom fonts cause text reflow, add font-display: swap and preload the font.
5. After fixing, navigate to ${route ?? 'the route'} and verify CLS drops below 0.1 in SPEED dashboard.
6. Report: exact files changed, which elements were shifting, what you fixed.

npm run build && vercel --prod`,
  }]
}

function buildSlowRatePrompts(
  alert: PerformanceAlert,
  details: any,
): FixPrompt[] {
  return [{
    category: 'fix',
    label: 'Copy Fix Prompt',
    prompt: `SPEED ALERT — High Slow Query Rate
Severity: ${alert.severity.toUpperCase()}
Slow query rate: ${details?.rate_pct ?? '?'}% of all queries exceed 500ms
Slow queries: ${details?.slow_count ?? '?'} out of ${details?.total_count ?? '?'} total

DETECTED BY: SPEED performance monitoring system on lessonpreneur.io

TASK:
1. Go to Settings > SPEED tab in the app. Review the "Slow Queries" table for the top offenders.
2. For each slow query listed:
   a. Find the hook file using the query label (e.g., "students.list" → src/hooks/useStudents.ts).
   b. Inspect the Supabase query shape — check for select('*'), missing .limit(), missing date filters.
   c. Check the target table for missing indexes.
   d. Fix the query and verify timing improvement.
3. Check Supabase dashboard at https://supabase.com/dashboard/project/dhsyxyhtoadrqfrlmsqe:
   - Connection pool utilization
   - Database CPU usage
   - Slow query logs in the Logs explorer
4. Priority order: fix the slowest queries first (highest avg_ms).
5. Target: get slow query rate below 15%.
6. Report: each query fixed, what was wrong, new timing, overall rate improvement.

npm run build && vercel --prod`,
  }, {
    category: 'sql',
    label: 'Copy SQL Prompt',
    prompt: `SPEED ALERT — Bulk Index Audit
${details?.slow_count ?? '?'} slow queries detected (>${THRESHOLDS.queryMs.warning}ms) out of ${details?.total_count ?? '?'} total.

Run on Supabase project dhsyxyhtoadrqfrlmsqe:

1. Find tables missing indexes on foreign keys:
   SELECT c.relname AS table, a.attname AS column
   FROM pg_constraint con
   JOIN pg_class c ON c.oid = con.conrelid
   JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum = ANY(con.conkey)
   WHERE con.contype = 'f'
   AND NOT EXISTS (
     SELECT 1 FROM pg_index i
     WHERE i.indrelid = c.oid
     AND a.attnum = ANY(i.indkey)
   );

2. Check table sizes to prioritize:
   SELECT relname, pg_size_pretty(pg_total_relation_size(relid))
   FROM pg_catalog.pg_statio_user_tables
   ORDER BY pg_total_relation_size(relid) DESC LIMIT 20;

3. Add missing indexes on the largest tables first.
4. Verify query times improve in the SPEED dashboard.`,
  }]
}

function buildGenericPrompt(alert: PerformanceAlert): string {
  return `SPEED ALERT — Performance Issue
Type: ${alert.alert_type}
Severity: ${alert.severity.toUpperCase()}
Message: ${alert.message}
Details: ${JSON.stringify(alert.details, null, 2)}

DETECTED BY: SPEED performance monitoring system on lessonpreneur.io

Investigate this alert, identify the root cause, fix it, and verify the fix.
Do NOT silence the alert — fix the actual performance issue.
Report: exact files changed, what was wrong, what you fixed.

npm run build && vercel --prod`
}

// ─── Remediation guidance ────────────────────────────────────────────────────

export interface RemediationGuide {
  issueType: string
  likelyCause: string
  recommendedFix: string
  affectedArea: string
}

/**
 * Given an alert, return actionable remediation guidance a developer
 * can work from directly.
 */
export function getRemediation(alert: PerformanceAlert): RemediationGuide {
  const route = (alert.details as any)?.route as string | undefined
  const queryLabel = (alert.details as any)?.query_label as string | undefined
  const tableName = (alert.details as any)?.table_name as string | undefined

  switch (alert.alert_type as AlertType) {
    case 'slow_lcp':
      return {
        issueType: 'Slow Largest Contentful Paint',
        affectedArea: route ? `Route: ${route}` : 'Unknown route',
        likelyCause: 'Heavy above-the-fold content, render-blocking resources, large unoptimized images, or slow server response delaying the main content paint.',
        recommendedFix: `1. Preload hero images with <link rel="preload">.\n2. Lazy-load components below the fold.\n3. Check if this route fetches too much data before first render — add skeleton loading.\n4. Audit the route's Supabase queries for unbounded selects.`,
      }
    case 'slow_fcp':
      return {
        issueType: 'Slow First Contentful Paint',
        affectedArea: route ? `Route: ${route}` : 'Unknown route',
        likelyCause: 'Large JS bundles blocking initial render, render-blocking CSS, or slow Supabase auth check delaying first paint.',
        recommendedFix: `1. Verify the route is code-split (lazy import).\n2. Move non-critical CSS below the fold.\n3. Check if AuthContext loading waterfall is causing delays.\n4. Run \`npx vite build --report\` to check chunk sizes for this route.`,
      }
    case 'high_cls':
      return {
        issueType: 'High Cumulative Layout Shift',
        affectedArea: route ? `Route: ${route}` : 'Unknown route',
        likelyCause: 'Images or embeds without explicit dimensions, async-loaded content pushing elements around, or font swap causing text reflow.',
        recommendedFix: `1. Set explicit width/height on all images.\n2. Reserve space for async content with skeleton placeholders.\n3. Use font-display: swap with preloaded fonts.\n4. Check for dynamic content that inserts above existing elements.`,
      }
    case 'slow_inp':
      return {
        issueType: 'Slow Interaction to Next Paint',
        affectedArea: route ? `Route: ${route}` : 'Unknown route',
        likelyCause: 'Expensive event handlers, large React re-renders triggered by user interaction, or synchronous processing blocking the main thread.',
        recommendedFix: `1. Profile the route's click/input handlers for heavy computation.\n2. Debounce search inputs and filter changes.\n3. Use React.memo or useMemo for expensive derived state.\n4. Move heavy processing to Web Workers if applicable.`,
      }
    case 'slow_query':
      return {
        issueType: 'Slow Supabase Query',
        affectedArea: queryLabel ? `Query: ${queryLabel}${tableName ? ` (table: ${tableName})` : ''}` : 'Unknown query',
        likelyCause: `Query exceeds 500ms — likely missing index, unbounded select, or excessive row count on ${tableName ?? 'unknown'} table.`,
        recommendedFix: `1. Add .limit() if not present.\n2. Add index on the filter columns used in this query.\n3. Use .select('col1,col2') instead of select('*').\n4. Add date-range filter if querying time-series data.\n5. Check if N+1 pattern — fetching related data in a loop instead of a JOIN.`,
      }
    case 'high_slow_query_rate':
      return {
        issueType: 'High Percentage of Slow Queries',
        affectedArea: 'System-wide query layer',
        likelyCause: 'Multiple queries hitting performance thresholds — may indicate missing indexes, connection pooling issues, or Supabase plan limits.',
        recommendedFix: `1. Review the Slow Queries table above for the top offenders.\n2. Add indexes on frequently filtered foreign key columns.\n3. Check Supabase dashboard for connection pool saturation.\n4. Consider upgrading Supabase plan if hitting compute limits.`,
      }
    default:
      return {
        issueType: alert.alert_type,
        affectedArea: 'Unknown',
        likelyCause: 'Unknown — review alert details.',
        recommendedFix: 'Investigate the alert details and associated metrics.',
      }
  }
}
