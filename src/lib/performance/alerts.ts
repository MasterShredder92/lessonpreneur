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
