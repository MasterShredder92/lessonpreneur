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
