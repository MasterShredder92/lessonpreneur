/**
 * SPEED Agent — Metrics
 *
 * Write helpers (fire-and-forget) and read helpers (for the dashboard).
 * All queries are bounded by date range and row limits.
 */

import { supabase } from '../supabase'

// ─── Types ──────────────────────────────────────────────────────────────────

export interface PageMetricRow {
  id: string
  tenant_id: string
  session_id: string
  page_route: string
  load_time_ms: number | null
  fcp_ms: number | null
  lcp_ms: number | null
  cls_score: number | null
  inp_ms: number | null
  ttfb_ms: number | null
  created_at: string
}

export interface QueryPerfRow {
  id: string
  tenant_id: string
  query_label: string
  table_name: string | null
  execution_time_ms: number
  row_count: number | null
  is_slow: boolean
  created_at: string
}

export interface RouteSummary {
  page_route: string
  sample_count: number
  avg_lcp_ms: number | null
  avg_fcp_ms: number | null
  avg_load_ms: number | null
  avg_cls: number | null
  avg_inp_ms: number | null
  p75_lcp_ms: number | null
}

export interface DailySummary {
  date: string          // 'YYYY-MM-DD'
  avg_lcp_ms: number | null
  avg_fcp_ms: number | null
  avg_load_ms: number | null
  sample_count: number
}

export interface SlowQuerySummary {
  query_label: string
  table_name: string | null
  occurrence_count: number
  avg_ms: number
  max_ms: number
}

// ─── Write (fire-and-forget) ─────────────────────────────────────────────────

interface PendingVitals {
  route: string
  loadTimeMs?: number
  fcpMs?: number
  lcpMs?: number
  clsScore?: number
  inpMs?: number
  ttfbMs?: number
}

export function flushPageMetrics(
  tenantId: string,
  sessionId: string,
  vitals: PendingVitals,
): void {
  // Skip if all metrics are undefined — nothing to record
  const hasData =
    vitals.loadTimeMs != null ||
    vitals.fcpMs != null ||
    vitals.lcpMs != null ||
    vitals.clsScore != null ||
    vitals.inpMs != null ||
    vitals.ttfbMs != null

  if (!hasData) return

  supabase
    .from('performance_metrics')
    .insert({
      tenant_id: tenantId,
      session_id: sessionId,
      page_route: vitals.route,
      load_time_ms: vitals.loadTimeMs ?? null,
      fcp_ms: vitals.fcpMs ?? null,
      lcp_ms: vitals.lcpMs ?? null,
      cls_score: vitals.clsScore ?? null,
      inp_ms: vitals.inpMs ?? null,
      ttfb_ms: vitals.ttfbMs ?? null,
    })
    .then(({ error }) => {
      if (error) console.warn('[SPEED] metrics write failed', error.message)
    })
}

/**
 * Log a timed query observation. Call this from query hooks where you
 * want to track execution time (optional — targeted instrumentation only).
 */
export function logQueryPerf(
  tenantId: string,
  queryLabel: string,
  executionTimeMs: number,
  opts?: { tableName?: string; rowCount?: number },
): void {
  supabase
    .from('query_performance')
    .insert({
      tenant_id: tenantId,
      query_label: queryLabel,
      execution_time_ms: Math.round(executionTimeMs),
      table_name: opts?.tableName ?? null,
      row_count: opts?.rowCount ?? null,
    })
    .then(({ error }) => {
      if (error) console.warn('[SPEED] query perf write failed', error.message)
    })
}

/**
 * Wrap a queryFn to automatically log its execution time.
 * Usage: queryFn: timedQuery(tenantId, 'students.list', 'students', actualFn)
 */
export function timedQuery<T>(
  tenantId: string | null,
  queryLabel: string,
  tableName: string,
  fn: () => Promise<T>,
): () => Promise<T> {
  return async () => {
    if (!tenantId) return fn()
    const start = performance.now()
    const result = await fn()
    const elapsed = performance.now() - start
    logQueryPerf(tenantId, queryLabel, elapsed, { tableName })
    return result
  }
}

// ─── Read (dashboard queries) ────────────────────────────────────────────────

/** Fetch up to 500 raw page metric rows for the given date window (most recent first). */
export async function fetchRecentMetrics(
  tenantId: string,
  daysBack = 7,
): Promise<PageMetricRow[]> {
  const since = new Date()
  since.setDate(since.getDate() - daysBack)

  const { data, error } = await supabase
    .from('performance_metrics')
    .select('id,tenant_id,session_id,page_route,load_time_ms,fcp_ms,lcp_ms,cls_score,inp_ms,ttfb_ms,created_at')
    .eq('tenant_id', tenantId)
    .gte('created_at', since.toISOString())
    .order('created_at', { ascending: false })
    .limit(500)

  if (error) throw error
  return (data ?? []) as PageMetricRow[]
}

/** Aggregate per-route summary from raw metrics. Done client-side to avoid an RPC. */
export function buildRouteSummaries(rows: PageMetricRow[]): RouteSummary[] {
  const grouped = new Map<string, PageMetricRow[]>()
  for (const row of rows) {
    const arr = grouped.get(row.page_route) ?? []
    arr.push(row)
    grouped.set(row.page_route, arr)
  }

  const summaries: RouteSummary[] = []
  for (const [route, group] of grouped.entries()) {
    const lcps = group.map(r => r.lcp_ms).filter((v): v is number => v != null)
    const fcps = group.map(r => r.fcp_ms).filter((v): v is number => v != null)
    const loads = group.map(r => r.load_time_ms).filter((v): v is number => v != null)
    const clss = group.map(r => r.cls_score).filter((v): v is number => v != null)
    const inps = group.map(r => r.inp_ms).filter((v): v is number => v != null)

    const avg = (arr: number[]) => arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : null
    const p75 = (arr: number[]) => {
      if (!arr.length) return null
      const sorted = [...arr].sort((a, b) => a - b)
      return sorted[Math.floor(sorted.length * 0.75)] ?? null
    }

    summaries.push({
      page_route: route,
      sample_count: group.length,
      avg_lcp_ms: avg(lcps),
      avg_fcp_ms: avg(fcps),
      avg_load_ms: avg(loads),
      avg_cls: clss.length ? Math.round(clss.reduce((a, b) => a + b, 0) / clss.length * 10000) / 10000 : null,
      avg_inp_ms: avg(inps),
      p75_lcp_ms: p75(lcps),
    })
  }

  return summaries.sort((a, b) => b.sample_count - a.sample_count)
}

/** Build daily trend data from raw metrics rows. */
export function buildDailyTrend(rows: PageMetricRow[]): DailySummary[] {
  const grouped = new Map<string, PageMetricRow[]>()
  for (const row of rows) {
    const day = row.created_at.slice(0, 10)
    const arr = grouped.get(day) ?? []
    arr.push(row)
    grouped.set(day, arr)
  }

  const summaries: DailySummary[] = []
  for (const [date, group] of grouped.entries()) {
    const lcps = group.map(r => r.lcp_ms).filter((v): v is number => v != null)
    const fcps = group.map(r => r.fcp_ms).filter((v): v is number => v != null)
    const loads = group.map(r => r.load_time_ms).filter((v): v is number => v != null)
    const avg = (arr: number[]) => arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : null

    summaries.push({
      date,
      avg_lcp_ms: avg(lcps),
      avg_fcp_ms: avg(fcps),
      avg_load_ms: avg(loads),
      sample_count: group.length,
    })
  }

  return summaries.sort((a, b) => a.date.localeCompare(b.date))
}

/** Fetch slow queries (>500ms) grouped by label, last N days. */
export async function fetchSlowQuerySummaries(
  tenantId: string,
  daysBack = 7,
): Promise<SlowQuerySummary[]> {
  const since = new Date()
  since.setDate(since.getDate() - daysBack)

  const { data, error } = await supabase
    .from('query_performance')
    .select('query_label,table_name,execution_time_ms')
    .eq('tenant_id', tenantId)
    .eq('is_slow', true)
    .gte('created_at', since.toISOString())
    .order('execution_time_ms', { ascending: false })
    .limit(500)

  if (error) throw error
  if (!data?.length) return []

  // Aggregate client-side
  const grouped = new Map<string, { table_name: string | null; times: number[] }>()
  for (const row of data) {
    const entry = grouped.get(row.query_label) ?? { table_name: row.table_name, times: [] }
    entry.times.push(row.execution_time_ms)
    grouped.set(row.query_label, entry)
  }

  return Array.from(grouped.entries())
    .map(([label, { table_name, times }]) => ({
      query_label: label,
      table_name,
      occurrence_count: times.length,
      avg_ms: Math.round(times.reduce((a, b) => a + b, 0) / times.length),
      max_ms: Math.max(...times),
    }))
    .sort((a, b) => b.avg_ms - a.avg_ms)
    .slice(0, 50)
}

/** Overall health summary stats for the hero cards. */
export interface HealthSummary {
  totalSamples: number
  avgLcpMs: number | null
  avgFcpMs: number | null
  avgLoadMs: number | null
  slowLcpPercent: number     // % of samples with LCP > 2500ms
  slowQueryCount: number
}

export function buildHealthSummary(
  rows: PageMetricRow[],
  slowQueryCount: number,
): HealthSummary {
  const lcps = rows.map(r => r.lcp_ms).filter((v): v is number => v != null)
  const fcps = rows.map(r => r.fcp_ms).filter((v): v is number => v != null)
  const loads = rows.map(r => r.load_time_ms).filter((v): v is number => v != null)
  const avg = (arr: number[]) => arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : null

  const slowLcp = lcps.filter(v => v > 2500).length
  return {
    totalSamples: rows.length,
    avgLcpMs: avg(lcps),
    avgFcpMs: avg(fcps),
    avgLoadMs: avg(loads),
    slowLcpPercent: lcps.length ? Math.round((slowLcp / lcps.length) * 100) : 0,
    slowQueryCount,
  }
}
