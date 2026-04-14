import { useState, useMemo, type CSSProperties } from 'react'
import { Navigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  LineChart, Line, CartesianGrid, Legend,
} from 'recharts'
import { Activity, AlertTriangle, CheckCircle2, Zap, Database, Clock, TrendingUp, RefreshCw, ClipboardCopy } from 'lucide-react'
import { useAuthContext } from '../../app/AuthContext'
import { usePermissions } from '../../hooks/usePermissions'
import MusicLoader from '../../components/shared/MusicLoader'
import { qk } from '../../lib/queryKeys'
import {
  fetchRecentMetrics,
  fetchSlowQuerySummaries,
  fetchQuerySampleCount,
  buildRouteSummaries,
  buildDailyTrend,
  buildHealthSummary,
  type RouteSummary,
  type DailySummary,
  type SlowQuerySummary,
} from '../../lib/performance/metrics'
import {
  fetchActiveAlerts,
  fetchResolvedAlerts,
  resolveAlert,
  evaluateThresholds,
  reconcilePerformanceAlerts,
  applyPerformanceAlerts,
  buildSiteAuditSummary,
  generateBulkFixPrompts,
  computeSlowQueryRatePct,
  THRESHOLDS,
  severityColor,
  alertTypeLabel,
  scoreLcp,
  scoreFcp,
  scoreCls,
  getRemediation,
  generateFixPrompts,
  type PerformanceAlert,
  type FixPrompt,
  type SiteAuditSummary,
} from '../../lib/performance/alerts'
import { toast } from '../../components/shared/Toast'

// ─── Style helpers ───────────────────────────────────────────────────────────

const card: CSSProperties = {
  background: 'rgba(255,255,255,0.03)',
  border: '1px solid rgba(255,255,255,0.07)',
  borderRadius: 12,
  padding: '20px 24px',
}

const label: CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  color: '#6060a0',
  marginBottom: 4,
}

const bigNum: CSSProperties = {
  fontSize: 32,
  fontWeight: 800,
  color: '#E0E0F4',
  lineHeight: 1.1,
}

const sectionTitle: CSSProperties = {
  fontSize: 13,
  fontWeight: 700,
  color: '#C0C0E0',
  marginBottom: 14,
  letterSpacing: '0.02em',
}

const thStyle: CSSProperties = {
  textAlign: 'left',
  padding: '8px 10px',
  borderBottom: '1px solid rgba(255,255,255,0.07)',
  color: '#6060a0',
  fontSize: 10,
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
}

const tdStyle: CSSProperties = {
  padding: '9px 10px',
  borderBottom: '1px solid rgba(255,255,255,0.04)',
  fontSize: 12,
  color: '#C0C0E0',
  verticalAlign: 'middle',
}

function scoreChip(score: 'good' | 'needs-improvement' | 'poor' | 'none') {
  const map = {
    good:             { bg: 'rgba(16,185,129,0.15)', color: '#10b981', label: 'Good' },
    'needs-improvement': { bg: 'rgba(255,184,0,0.15)',  color: '#FFB800', label: 'Needs work' },
    poor:             { bg: 'rgba(212,34,106,0.15)',  color: '#D4226A', label: 'Poor' },
    none:             { bg: 'rgba(255,255,255,0.05)', color: '#6060a0', label: '—' },
  }
  const s = map[score]
  return (
    <span style={{
      display: 'inline-block',
      padding: '2px 8px',
      borderRadius: 6,
      fontSize: 11,
      fontWeight: 600,
      background: s.bg,
      color: s.color,
    }}>
      {s.label}
    </span>
  )
}

// ─── Tooltip customisation ───────────────────────────────────────────────────

function ChartTooltip({ active, payload, label: lbl }: any) {
  if (!active || !payload?.length) return null
  return (
    <div style={{ background: 'rgba(16,16,32,0.95)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '8px 12px', fontSize: 12 }}>
      <div style={{ color: '#9090c0', marginBottom: 4 }}>{lbl}</div>
      {payload.map((p: any) => (
        <div key={p.name} style={{ color: p.color, fontWeight: 600 }}>
          {p.name}: {p.value != null ? `${p.value}ms` : '—'}
        </div>
      ))}
    </div>
  )
}

// ─── Main page ───────────────────────────────────────────────────────────────

export default function Performance() {
  const { tenantId } = useAuthContext()
  const { isOwner, isCompanyDirector } = usePermissions()
  const qc = useQueryClient()
  const [daysBack, setDaysBack] = useState(7)
  type AlertView = 'active' | 'highest' | 'regressed' | 'resolved' | 'auto_resolved' | 'audit'
  const [alertView, setAlertView] = useState<AlertView>('active')
  const [groupMode, setGroupMode] = useState<'none' | 'route' | 'type' | 'query'>('none')

  // Owner only — embedded in Settings, also guarded by route
  if (!isOwner) {
    return <Navigate to="/admin/dashboard" replace />
  }

  // ── Queries ──────────────────────────────────────────────────────────────

  const { data: rawMetrics = [], isLoading: loadingMetrics } = useQuery({
    queryKey: qk.performance.metrics(tenantId, daysBack),
    queryFn: () => fetchRecentMetrics(tenantId!, daysBack),
    enabled: !!tenantId,
    staleTime: 3 * 60 * 1000,
  })

  const { data: slowQueries = [], isLoading: loadingQueries } = useQuery({
    queryKey: qk.performance.slowQueries(tenantId, daysBack),
    queryFn: () => fetchSlowQuerySummaries(tenantId!, daysBack),
    enabled: !!tenantId,
    staleTime: 3 * 60 * 1000,
  })

  const { data: activeAlerts = [], isLoading: loadingActiveAlerts } = useQuery({
    queryKey: qk.performance.activeAlerts(tenantId),
    queryFn: () => fetchActiveAlerts(tenantId!),
    enabled: !!tenantId,
    staleTime: 60 * 1000,
  })

  const { data: resolvedAlerts = [], isLoading: loadingResolved } = useQuery({
    queryKey: qk.performance.resolvedAlerts(tenantId),
    queryFn: () => fetchResolvedAlerts(tenantId!),
    enabled: !!tenantId && (alertView === 'resolved' || alertView === 'auto_resolved'),
    staleTime: 5 * 60 * 1000,
  })

  const { data: querySampleTotal = 0 } = useQuery({
    queryKey: qk.performance.querySampleCount(tenantId, daysBack),
    queryFn: () => fetchQuerySampleCount(tenantId!, daysBack),
    enabled: !!tenantId,
    staleTime: 3 * 60 * 1000,
  })

  // ── Derived data ─────────────────────────────────────────────────────────

  const routeSummaries: RouteSummary[] = buildRouteSummaries(rawMetrics)
  const dailyTrend: DailySummary[] = buildDailyTrend(rawMetrics)
  const totalSlowOccurrences = slowQueries.reduce((acc, q) => acc + q.occurrence_count, 0)
  const health = buildHealthSummary(rawMetrics, totalSlowOccurrences)
  const slowRatePct = querySampleTotal > 0 ? computeSlowQueryRatePct(slowQueries, querySampleTotal) : 0

  /** After DB dedupe, matches row count; pre-migration fallback counts distinct signatures. */
  const uniqueActiveIssueCount = useMemo(
    () => new Set(activeAlerts.map(a => a.dedupe_key ?? a.id)).size,
    [activeAlerts],
  )

  const siteAudit = useMemo(
    () => buildSiteAuditSummary(activeAlerts, routeSummaries, slowQueries),
    [activeAlerts, routeSummaries, slowQueries],
  )

  const activeSortedByImpact = useMemo(() => {
    const sev = (s: PerformanceAlert['severity']) => (s === 'critical' ? 2 : 1)
    return [...activeAlerts].sort((a, b) => {
      if (sev(b.severity) !== sev(a.severity)) return sev(b.severity) - sev(a.severity)
      const wo = (b.worst_metric ?? 0) - (a.worst_metric ?? 0)
      if (wo !== 0) return wo
      return (b.occurrence_count ?? 0) - (a.occurrence_count ?? 0)
    })
  }, [activeAlerts])

  const regressedAlerts = useMemo(
    () => activeAlerts.filter(a => a.regressed_at).sort((a, b) => (b.regressed_at ?? '').localeCompare(a.regressed_at ?? '')),
    [activeAlerts],
  )

  const autoResolvedAlerts = useMemo(
    () => resolvedAlerts.filter(
      a => a.resolution_reason === 'metric_recovered' || a.resolution_reason === 'stale',
    ),
    [resolvedAlerts],
  )

  function groupAlertsForView(list: PerformanceAlert[]) {
    if (groupMode === 'none' || alertView === 'audit') return [{ key: '', alerts: list }]
    const m = new Map<string, PerformanceAlert[]>()
    for (const a of list) {
      const d = a.details as Record<string, unknown>
      let k: string
      if (groupMode === 'route') k = typeof d?.route === 'string' ? d.route : '(no route)'
      else if (groupMode === 'query') k = typeof d?.query_label === 'string' ? d.query_label : '(no query label)'
      else k = a.alert_type
      if (!m.has(k)) m.set(k, [])
      m.get(k)!.push(a)
    }
    return [...m.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([key, alerts]) => ({ key, alerts: [...alerts].sort((x, y) => (y.severity === 'critical' ? 1 : 0) - (x.severity === 'critical' ? 1 : 0)) }))
  }

  // ── Mutations ────────────────────────────────────────────────────────────

  const resolveAlertMut = useMutation({
    mutationFn: (alertId: string) => resolveAlert(alertId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.performance.activeAlerts(tenantId) })
      qc.invalidateQueries({ queryKey: qk.performance.resolvedAlerts(tenantId) })
    },
  })

  const runAnalysisMut = useMutation({
    mutationFn: async () => {
      if (!tenantId) return { reconciled: 0, candidates: 0 }
      const [raw, slow, totalAll] = await Promise.all([
        fetchRecentMetrics(tenantId, daysBack),
        fetchSlowQuerySummaries(tenantId, daysBack),
        fetchQuerySampleCount(tenantId, daysBack),
      ])
      const routes = buildRouteSummaries(raw)
      const reconciled = await reconcilePerformanceAlerts(tenantId, routes, slow, totalAll)
      const candidates = evaluateThresholds(routes, slow, totalAll)
      if (candidates.length) await applyPerformanceAlerts(tenantId, candidates)
      return { reconciled, candidates: candidates.length }
    },
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: qk.performance.metrics(tenantId, daysBack) })
      qc.invalidateQueries({ queryKey: qk.performance.slowQueries(tenantId, daysBack) })
      qc.invalidateQueries({ queryKey: qk.performance.querySampleCount(tenantId, daysBack) })
      qc.invalidateQueries({ queryKey: qk.performance.activeAlerts(tenantId) })
      qc.invalidateQueries({ queryKey: qk.performance.resolvedAlerts(tenantId) })
      if (r.candidates > 0 || r.reconciled > 0) {
        toast(
          r.reconciled > 0
            ? `Analysis: ${r.reconciled} issue(s) auto-cleared, ${r.candidates} open or updated.`
            : `Analysis: ${r.candidates} issue(s) evaluated.`,
          'success',
        )
      } else {
        toast('Analysis complete — no threshold breaches in this window.', 'success')
      }
    },
    onError: (e: Error) => {
      toast(e.message || 'Analysis failed', 'error')
    },
  })

  const isLoading = loadingMetrics || loadingQueries || loadingActiveAlerts

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div style={{ padding: '24px 28px', maxWidth: 1200 }}>

      {/* ── Header ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
            <Zap size={20} color="#FFB800" />
            <h1 style={{ fontSize: 22, fontWeight: 800, color: '#E0E0F4', margin: 0 }}>
              SPEED
            </h1>
            <span style={{ fontSize: 11, fontWeight: 600, color: '#6060a0', letterSpacing: '0.05em', background: 'rgba(255,255,255,0.05)', padding: '2px 8px', borderRadius: 6 }}>
              Site Performance Enhancement &amp; Error Detection
            </span>
          </div>
          <p style={{ fontSize: 13, color: '#7070a0', margin: 0 }}>
            Real-time Web Vitals, query performance, and regression alerts.
          </p>
        </div>

        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          {/* Date range selector */}
          {([7, 14, 30] as const).map(d => (
            <button
              key={d}
              onClick={() => setDaysBack(d)}
              style={{
                padding: '6px 14px',
                borderRadius: 8,
                border: '1px solid rgba(255,255,255,0.08)',
                background: daysBack === d ? 'rgba(212,34,106,0.2)' : 'rgba(255,255,255,0.04)',
                color: daysBack === d ? '#D4226A' : '#7070a0',
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              {d}d
            </button>
          ))}

          <button
            onClick={() => runAnalysisMut.mutate()}
            disabled={runAnalysisMut.isPending || isLoading}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '6px 14px', borderRadius: 8,
              background: 'rgba(212,34,106,0.15)',
              border: '1px solid rgba(212,34,106,0.3)',
              color: '#D4226A', fontSize: 12, fontWeight: 600,
              cursor: runAnalysisMut.isPending ? 'wait' : 'pointer',
              opacity: runAnalysisMut.isPending ? 0.6 : 1,
            }}
          >
            <RefreshCw size={13} style={{ animation: runAnalysisMut.isPending ? 'spin 1s linear infinite' : undefined }} />
            {runAnalysisMut.isPending ? 'Analysing…' : 'Run Analysis'}
          </button>
        </div>
      </div>

      {isLoading && (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '60px 0' }}>
          <MusicLoader />
        </div>
      )}

      {!isLoading && (
        <>
          {/* ── Hero cards ── */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 24 }}>
            <HeroCard
              icon={<Activity size={16} color="#D4226A" />}
              title="Avg LCP"
              value={health.avgLcpMs != null ? `${health.avgLcpMs}ms` : '—'}
              sub={health.avgLcpMs != null ? scoreLabel(scoreLcp(health.avgLcpMs)) : 'No data'}
              subColor={scoreColor(scoreLcp(health.avgLcpMs))}
            />
            <HeroCard
              icon={<TrendingUp size={16} color="#FF5500" />}
              title="Avg FCP"
              value={health.avgFcpMs != null ? `${health.avgFcpMs}ms` : '—'}
              sub={health.avgFcpMs != null ? scoreLabel(scoreFcp(health.avgFcpMs)) : 'No data'}
              subColor={scoreColor(scoreFcp(health.avgFcpMs))}
            />
            <HeroCard
              icon={<Database size={16} color="#FFB800" />}
              title="Slow Queries"
              value={String(health.slowQueryCount)}
              sub={querySampleTotal > 0 ? `${slowRatePct}% of ${querySampleTotal} query samples (>${500}ms)` : `>${500}ms threshold`}
              subColor="#7070a0"
            />
            <HeroCard
              icon={<AlertTriangle size={16} color={uniqueActiveIssueCount > 0 ? '#D4226A' : '#10b981'} />}
              title="Active Issues"
              value={String(uniqueActiveIssueCount)}
              sub={uniqueActiveIssueCount === 0 ? 'All clear (deduped)' : `${activeAlerts.filter(a => a.severity === 'critical').length} critical · ${regressedAlerts.length} regressed`}
              subColor={uniqueActiveIssueCount === 0 ? '#10b981' : '#D4226A'}
            />
          </div>

          {/* ── Charts row ── */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 24 }}>

            {/* Daily LCP trend */}
            <div style={card}>
              <div style={sectionTitle}>LCP &amp; FCP Trend ({daysBack}d)</div>
              {dailyTrend.length === 0 ? (
                <EmptyState message="No page metric data yet. Metrics are collected automatically as users navigate." />
              ) : (
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={dailyTrend} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                    <XAxis dataKey="date" tick={{ fill: '#6060a0', fontSize: 10 }} tickFormatter={d => d.slice(5)} />
                    <YAxis tick={{ fill: '#6060a0', fontSize: 10 }} />
                    <Tooltip content={<ChartTooltip />} />
                    <Legend wrapperStyle={{ fontSize: 11, color: '#9090c0' }} />
                    <Line type="monotone" dataKey="avg_lcp_ms" name="LCP" stroke="#D4226A" strokeWidth={2} dot={false} connectNulls />
                    <Line type="monotone" dataKey="avg_fcp_ms" name="FCP" stroke="#FFB800" strokeWidth={2} dot={false} connectNulls />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>

            {/* Per-route LCP bar */}
            <div style={card}>
              <div style={sectionTitle}>Avg LCP by Route (top 8)</div>
              {routeSummaries.length === 0 ? (
                <EmptyState message="No page metric data yet." />
              ) : (
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart
                    data={routeSummaries.slice(0, 8).map(r => ({ name: r.page_route.replace('/admin/', '').replace('/teacher/', '').replace('/parent/', '') || '/', lcp: r.avg_lcp_ms }))}
                    margin={{ top: 4, right: 8, left: -20, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                    <XAxis dataKey="name" tick={{ fill: '#6060a0', fontSize: 9 }} />
                    <YAxis tick={{ fill: '#6060a0', fontSize: 10 }} />
                    <Tooltip content={<ChartTooltip />} />
                    {/* Good / warning / poor threshold lines */}
                    <Bar dataKey="lcp" name="LCP" fill="#D4226A" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          {/* ── Route breakdown table ── */}
          <div style={{ ...card, marginBottom: 24 }}>
            <div style={sectionTitle}>Per-Route Breakdown</div>
            {routeSummaries.length === 0 ? (
              <EmptyState message="No page metric data collected yet. Metrics are captured automatically as authenticated users navigate." />
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      {['Route', 'Samples', 'Avg LCP', 'LCP Score', 'Avg FCP', 'FCP Score', 'Avg Load', 'Avg CLS', 'CLS Score'].map(h => (
                        <th key={h} style={thStyle}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {routeSummaries.map(r => (
                      <tr key={r.page_route} style={{ transition: 'background 100ms' }}
                        onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.02)')}
                        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                      >
                        <td style={{ ...tdStyle, color: '#E0E0F4', fontWeight: 600, maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.page_route}</td>
                        <td style={tdStyle}>{r.sample_count}</td>
                        <td style={tdStyle}>{r.avg_lcp_ms != null ? `${r.avg_lcp_ms}ms` : '—'}</td>
                        <td style={tdStyle}>{scoreChip(scoreLcp(r.avg_lcp_ms))}</td>
                        <td style={tdStyle}>{r.avg_fcp_ms != null ? `${r.avg_fcp_ms}ms` : '—'}</td>
                        <td style={tdStyle}>{scoreChip(scoreFcp(r.avg_fcp_ms))}</td>
                        <td style={tdStyle}>{r.avg_load_ms != null ? `${r.avg_load_ms}ms` : '—'}</td>
                        <td style={tdStyle}>{r.avg_cls != null ? r.avg_cls.toFixed(4) : '—'}</td>
                        <td style={tdStyle}>{scoreChip(scoreCls(r.avg_cls))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* ── Slow queries table ── */}
          <div style={{ ...card, marginBottom: 24 }}>
            <div style={sectionTitle}>Slow Queries (&gt;500ms) — Last {daysBack} Days</div>
            {slowQueries.length === 0 ? (
              <EmptyState message="No slow queries detected. Instrument queries via logQueryPerf() in hooks." />
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      {['Query', 'Table', 'Occurrences', 'Avg Time', 'Max Time', 'Severity'].map(h => (
                        <th key={h} style={thStyle}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {slowQueries.map(q => (
                      <tr key={q.query_label}
                        onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.02)')}
                        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                      >
                        <td style={{ ...tdStyle, color: '#E0E0F4', fontWeight: 500, maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{q.query_label}</td>
                        <td style={{ ...tdStyle, color: '#9090c0' }}>{q.table_name ?? '—'}</td>
                        <td style={tdStyle}>{q.occurrence_count}</td>
                        <td style={{ ...tdStyle, color: q.avg_ms >= 2000 ? '#D4226A' : q.avg_ms >= 500 ? '#FFB800' : '#10b981', fontWeight: 600 }}>{q.avg_ms}ms</td>
                        <td style={{ ...tdStyle, color: '#9090c0' }}>{q.max_ms}ms</td>
                        <td style={tdStyle}>
                          <span style={{
                            padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 600,
                            background: q.avg_ms >= 2000 ? 'rgba(212,34,106,0.15)' : 'rgba(255,184,0,0.12)',
                            color: q.avg_ms >= 2000 ? '#D4226A' : '#FFB800',
                          }}>
                            {q.avg_ms >= 2000 ? 'Critical' : 'Warning'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* ── Alerts + audit (deduped lifecycle) ── */}
          <div style={card}>
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 14 }}>
              <div style={sectionTitle}>SPEED Issues &amp; Audit</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'flex-end' }}>
                {([
                  ['active', 'Active', activeAlerts.length] as const,
                  ['highest', 'Highest impact', activeSortedByImpact.length] as const,
                  ['regressed', 'Regressed', regressedAlerts.length] as const,
                  ['resolved', 'Resolved', resolvedAlerts.length] as const,
                  ['auto_resolved', 'Auto-resolved', autoResolvedAlerts.length] as const,
                  ['audit', 'Full audit', null] as const,
                ] as const).map(([id, label, count]) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setAlertView(id)}
                    style={{
                      padding: '4px 10px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.08)',
                      background: alertView === id ? 'rgba(212,34,106,0.15)' : 'rgba(255,255,255,0.04)',
                      color: alertView === id ? '#D4226A' : '#6060a0',
                      fontSize: 10, fontWeight: 600, cursor: 'pointer',
                    }}
                  >
                    {label}{count != null ? ` (${count})` : ''}
                  </button>
                ))}
              </div>
            </div>

            {(alertView === 'active' || alertView === 'highest' || alertView === 'regressed') && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 12 }}>
                <span style={{ fontSize: 10, fontWeight: 700, color: '#5050a0', textTransform: 'uppercase' }}>Group by</span>
                {(['none', 'route', 'type', 'query'] as const).map(m => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setGroupMode(m)}
                    style={{
                      padding: '3px 8px', borderRadius: 4, fontSize: 10, fontWeight: 600,
                      border: '1px solid rgba(255,255,255,0.08)',
                      background: groupMode === m ? 'rgba(56,189,248,0.12)' : 'transparent',
                      color: groupMode === m ? '#38bdf8' : '#7070a0',
                      cursor: 'pointer', textTransform: 'capitalize',
                    }}
                  >
                    {m === 'none' ? 'Flat' : m}
                  </button>
                ))}
              </div>
            )}

            {alertView === 'audit' && (
              <SiteAuditSection
                audit={siteAudit}
                activeAlerts={activeAlerts}
                routeSummaries={routeSummaries}
                slowQueries={slowQueries}
              />
            )}

            {alertView !== 'audit' && (alertView === 'resolved' || alertView === 'auto_resolved') && loadingResolved && (
              <div style={{ display: 'flex', justifyContent: 'center', padding: 24 }}><MusicLoader /></div>
            )}

            {alertView !== 'audit' && !((alertView === 'resolved' || alertView === 'auto_resolved') && loadingResolved) && (() => {
              const list =
                alertView === 'active' ? activeAlerts
                  : alertView === 'highest' ? activeSortedByImpact
                    : alertView === 'regressed' ? regressedAlerts
                      : alertView === 'resolved' ? resolvedAlerts
                        : autoResolvedAlerts
              const showResolve = alertView === 'active' || alertView === 'highest'
              if (!list.length) {
                const emptyMsg =
                  alertView === 'active' ? 'No active issues. Run Analysis reconciles metrics, upserts one row per signature, and auto-clears recovered routes.'
                    : alertView === 'highest' ? 'No active issues to rank.'
                      : alertView === 'regressed' ? 'Nothing reopened after a fix yet.'
                        : alertView === 'resolved' ? 'No resolved issues in the last 90 days.'
                          : 'No auto-resolved issues (metric recovery or stale cleanup) in the last 90 days.'
                return (
                  <EmptyState
                    icon={<CheckCircle2 size={20} color="#10b981" />}
                    message={emptyMsg}
                  />
                )
              }
              const groups = groupAlertsForView(list)
              return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {showResolve && list.length > 0 && (
                    <BulkPromptToolbar alerts={activeAlerts} />
                  )}
                  {groups.map(g => (
                    <div key={g.key || '_flat'}>
                      {g.key ? (
                        <div style={{ fontSize: 11, fontWeight: 800, color: '#9090c0', marginBottom: 6, letterSpacing: '0.04em' }}>
                          {groupMode === 'route' ? 'Route' : groupMode === 'query' ? 'Query' : 'Type'}: {g.key}
                        </div>
                      ) : null}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {g.alerts.map(alert => (
                          <AlertRow
                            key={alert.id}
                            alert={alert}
                            onResolve={showResolve ? () => resolveAlertMut.mutate(alert.id) : undefined}
                            resolving={resolveAlertMut.isPending}
                          />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )
            })()}
          </div>

          {/* ── Optimization guide ── */}
          <div style={{ ...card, marginTop: 24 }}>
            <div style={sectionTitle}>Optimization Checklist</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
              {OPTIMIZATION_TIPS.map(tip => (
                <div key={tip.title} style={{ background: 'rgba(255,255,255,0.02)', borderRadius: 8, padding: '12px 16px' }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#C0C0E0', marginBottom: 4 }}>{tip.title}</div>
                  <div style={{ fontSize: 11, color: '#7070a0', lineHeight: 1.6 }}>{tip.body}</div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function HeroCard({ icon, title, value, sub, subColor }: {
  icon: React.ReactNode
  title: string
  value: string
  sub: string
  subColor: string
}) {
  return (
    <div style={card}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
        {icon}
        <span style={label}>{title}</span>
      </div>
      <div style={bigNum}>{value}</div>
      <div style={{ fontSize: 11, color: subColor, marginTop: 4, fontWeight: 600 }}>{sub}</div>
    </div>
  )
}

function PlainCopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text)
          setCopied(true)
          toast('Copied to clipboard', 'success')
          setTimeout(() => setCopied(false), 2000)
        } catch {
          const ta = document.createElement('textarea')
          ta.value = text
          ta.style.position = 'fixed'
          ta.style.opacity = '0'
          document.body.appendChild(ta)
          ta.select()
          document.execCommand('copy')
          document.body.removeChild(ta)
          setCopied(true)
          toast('Copied to clipboard', 'success')
          setTimeout(() => setCopied(false), 2000)
        }
      }}
      style={{
        padding: '5px 10px', borderRadius: 6, fontSize: 10, fontWeight: 700,
        background: copied ? 'rgba(16,185,129,0.15)' : 'rgba(255,255,255,0.05)',
        border: `1px solid ${copied ? 'rgba(16,185,129,0.3)' : 'rgba(255,255,255,0.1)'}`,
        color: copied ? '#10b981' : '#C0C0E0', cursor: 'pointer',
      }}
    >
      {copied ? 'Copied' : label}
    </button>
  )
}

function BulkPromptToolbar({ alerts }: { alerts: PerformanceAlert[] }) {
  if (!alerts.length) return null
  return (
    <div style={{
      padding: '10px 12px', borderRadius: 8,
      background: 'rgba(2,2,9,0.45)', border: '1px solid rgba(255,255,255,0.06)', marginBottom: 8,
    }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: '#6060a0', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        Batched Claude prompts (deduped keys)
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        <PlainCopyButton text={generateBulkFixPrompts(alerts, 'all')} label="All" />
        <PlainCopyButton text={generateBulkFixPrompts(alerts, 'frontend')} label="Frontend" />
        <PlainCopyButton text={generateBulkFixPrompts(alerts, 'backend')} label="Backend" />
        <PlainCopyButton text={generateBulkFixPrompts(alerts, 'sql')} label="SQL" />
      </div>
    </div>
  )
}

function pickScheduleRouteSummary(routeSummaries: RouteSummary[]): RouteSummary | undefined {
  const exact = routeSummaries.find(r => r.page_route === '/admin/schedule')
  if (exact) return exact
  const subs = routeSummaries.filter(r => r.page_route.startsWith('/admin/schedule'))
  if (!subs.length) return undefined
  return subs.reduce((best, r) => {
    const s = (r.avg_inp_ms ?? 0) + (r.avg_cls ?? 0) * 4000
    const bs = (best.avg_inp_ms ?? 0) + (best.avg_cls ?? 0) * 4000
    return s >= bs ? r : best
  })
}

function SiteAuditSection({
  audit,
  activeAlerts,
  routeSummaries,
  slowQueries,
}: {
  audit: SiteAuditSummary
  activeAlerts: PerformanceAlert[]
  routeSummaries: RouteSummary[]
  slowQueries: SlowQuerySummary[]
}) {
  const keys = useMemo(() => new Set(activeAlerts.map(a => a.dedupe_key).filter(Boolean) as string[]), [activeAlerts])
  const leads = routeSummaries.find(r => r.page_route === '/admin/leads')
  const schedule = pickScheduleRouteSummary(routeSummaries)

  const spotRows = useMemo(() => {
    const hasScheduleInp = [...keys].some(k => k.startsWith('slow_inp|route:/admin/schedule'))
    const hasScheduleCls = [...keys].some(k => k.startsWith('high_cls|route:/admin/schedule'))
    const q = (label: string) => slowQueries.find(s => s.query_label === label)
    const interpret = (hasAlert: boolean, metricBad: boolean | undefined) => {
      if (metricBad == null) return 'Not enough data in window'
      if (metricBad && hasAlert) return 'Still failing — matches active issue'
      if (metricBad && !hasAlert) return 'Bad in window, no active row — run Analysis'
      if (!metricBad && hasAlert) return 'Metric recovered; Run Analysis to auto-clear'
      return 'Healthy in window'
    }

    const leadsInpBad = !!(leads && leads.sample_count >= 3 && leads.avg_inp_ms != null && leads.avg_inp_ms >= THRESHOLDS.inp.warning)
    const leadsClsBad = !!(leads && leads.sample_count >= 3 && leads.avg_cls != null && leads.avg_cls >= THRESHOLDS.cls.warning)
    const schInpBad = !!(schedule && schedule.sample_count >= 3 && schedule.avg_inp_ms != null && schedule.avg_inp_ms >= THRESHOLDS.inp.warning)
    const schClsBad = !!(schedule && schedule.sample_count >= 3 && schedule.avg_cls != null && schedule.avg_cls >= THRESHOLDS.cls.warning)

    return [
      { name: 'INP /admin/leads', has: keys.has('slow_inp|route:/admin/leads'), metric: leads ? `${leads.avg_inp_ms ?? '—'}ms (n=${leads.sample_count})` : '—', note: interpret(keys.has('slow_inp|route:/admin/leads'), leadsInpBad) },
      { name: 'CLS /admin/leads', has: keys.has('high_cls|route:/admin/leads'), metric: leads?.avg_cls != null ? leads.avg_cls.toFixed(4) : '—', note: interpret(keys.has('high_cls|route:/admin/leads'), leadsClsBad) },
      { name: `INP schedule (${schedule?.page_route ?? '/admin/schedule'})`, has: hasScheduleInp, metric: schedule ? `${schedule.avg_inp_ms ?? '—'}ms (n=${schedule.sample_count})` : '—', note: interpret(hasScheduleInp, schInpBad) },
      { name: `CLS schedule (${schedule?.page_route ?? '—'})`, has: hasScheduleCls, metric: schedule?.avg_cls != null ? schedule.avg_cls.toFixed(4) : '—', note: interpret(hasScheduleCls, schClsBad) },
      { name: 'Slow query dashboard.data', has: keys.has('slow_query|label:dashboard.data'), metric: q('dashboard.data') ? `${q('dashboard.data')!.avg_ms}ms avg` : 'not in slow list', note: interpret(keys.has('slow_query|label:dashboard.data'), (q('dashboard.data')?.avg_ms ?? 0) >= THRESHOLDS.queryMs.warning) },
      { name: 'Slow query teachers.list', has: keys.has('slow_query|label:teachers.list'), metric: q('teachers.list') ? `${q('teachers.list')!.avg_ms}ms avg` : 'not in slow list', note: interpret(keys.has('slow_query|label:teachers.list'), (q('teachers.list')?.avg_ms ?? 0) >= THRESHOLDS.queryMs.warning) },
      { name: 'Slow query schedule.grid', has: keys.has('slow_query|label:schedule.grid'), metric: q('schedule.grid') ? `${q('schedule.grid')!.avg_ms}ms avg` : 'not in slow list', note: interpret(keys.has('slow_query|label:schedule.grid'), (q('schedule.grid')?.avg_ms ?? 0) >= THRESHOLDS.queryMs.warning) },
    ]
  }, [keys, leads, schedule, slowQueries])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
        <div style={{ background: 'rgba(255,255,255,0.02)', borderRadius: 8, padding: 12 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: '#6060a0', marginBottom: 4 }}>Unique active issues</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#E0E0F4' }}>{audit.uniqueActiveIssues}</div>
        </div>
        <div style={{ background: 'rgba(255,255,255,0.02)', borderRadius: 8, padding: 12 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: '#6060a0', marginBottom: 4 }}>By severity</div>
          <div style={{ fontSize: 12, color: '#C0C0E0' }}>Critical {audit.bySeverity.critical} · Warning {audit.bySeverity.warning}</div>
        </div>
        <div style={{ background: 'rgba(255,255,255,0.02)', borderRadius: 8, padding: 12 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: '#6060a0', marginBottom: 4 }}>Worst pages (composite)</div>
          <div style={{ fontSize: 11, color: '#9090c0', lineHeight: 1.5 }}>
            {audit.worstRoutes.slice(0, 5).map(w => <div key={w.route}>{w.route}</div>)}
            {!audit.worstRoutes.length && '—'}
          </div>
        </div>
        <div style={{ background: 'rgba(255,255,255,0.02)', borderRadius: 8, padding: 12 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: '#6060a0', marginBottom: 4 }}>Worst queries</div>
          <div style={{ fontSize: 11, color: '#9090c0', lineHeight: 1.5 }}>
            {audit.worstQueries.slice(0, 5).map(w => <div key={w.label}>{w.label} ({w.avg_ms}ms)</div>)}
            {!audit.worstQueries.length && '—'}
          </div>
        </div>
      </div>

      <div>
        <div style={{ fontSize: 11, fontWeight: 800, color: '#C0C0E0', marginBottom: 8 }}>Issues by type</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {Object.entries(audit.byType).map(([t, n]) => (
            <span key={t} style={{ fontSize: 11, padding: '4px 10px', borderRadius: 6, background: 'rgba(255,255,255,0.04)', color: '#9090c0' }}>
              {t}: <strong style={{ color: '#E0E0F4' }}>{n}</strong>
            </span>
          ))}
          {!Object.keys(audit.byType).length && <span style={{ fontSize: 11, color: '#5050a0' }}>No active types</span>}
        </div>
      </div>

      <BulkPromptToolbar alerts={activeAlerts} />

      <div>
        <div style={{ fontSize: 11, fontWeight: 800, color: '#C0C0E0', marginBottom: 8 }}>Top 10 prioritized fixes</div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
            <thead>
              <tr>
                {['Type', 'Location', 'Severity', 'Owner', 'Difficulty', 'Impact', 'Likely cause', 'Fix', 'Gain'].map(h => (
                  <th key={h} style={thStyle}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {audit.topFixes.map(fix => (
                <tr key={fix.dedupe_key}>
                  <td style={tdStyle}>{alertTypeLabel(fix.alert_type)}</td>
                  <td style={{ ...tdStyle, fontFamily: 'monospace', maxWidth: 200 }}>{fix.route ?? fix.query_label ?? '—'}</td>
                  <td style={tdStyle}>{fix.severity}</td>
                  <td style={tdStyle}>{fix.owner}</td>
                  <td style={tdStyle}>{fix.difficulty}</td>
                  <td style={tdStyle}>{fix.impact}</td>
                  <td style={{ ...tdStyle, maxWidth: 220, whiteSpace: 'pre-wrap' }}>{fix.likelyCause}</td>
                  <td style={{ ...tdStyle, maxWidth: 220, whiteSpace: 'pre-wrap' }}>{fix.recommendedFix}</td>
                  <td style={tdStyle}>{fix.expectedGain}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!audit.topFixes.length && <EmptyState message="No active issues in this audit snapshot." />}
        </div>
      </div>

      <div>
        <div style={{ fontSize: 11, fontWeight: 800, color: '#FFB800', marginBottom: 8 }}>Repeated-issue spot check (live window vs alerts)</div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
            <thead>
              <tr>
                {['Check', 'Active alert?', 'Live metric', 'Interpretation'].map(h => (
                  <th key={h} style={thStyle}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {spotRows.map(row => (
                <tr key={row.name}>
                  <td style={{ ...tdStyle, color: '#E0E0F4', fontWeight: 600 }}>{row.name}</td>
                  <td style={tdStyle}>{row.has ? 'Yes' : 'No'}</td>
                  <td style={{ ...tdStyle, fontFamily: 'monospace' }}>{row.metric}</td>
                  <td style={{ ...tdStyle, color: '#9090c0' }}>{row.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

function CopyButton({ prompt }: { prompt: FixPrompt }) {
  const [copied, setCopied] = useState(false)
  const categoryColors: Record<string, { bg: string; border: string; text: string }> = {
    fix:      { bg: 'rgba(212,34,106,0.12)', border: 'rgba(212,34,106,0.3)', text: '#D4226A' },
    sql:      { bg: 'rgba(255,184,0,0.12)',  border: 'rgba(255,184,0,0.3)',  text: '#FFB800' },
    frontend: { bg: 'rgba(56,189,248,0.12)', border: 'rgba(56,189,248,0.3)', text: '#38bdf8' },
  }
  const c = categoryColors[prompt.category] ?? categoryColors.fix

  return (
    <button
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(prompt.prompt)
          setCopied(true)
          toast('Prompt copied to clipboard', 'success')
          setTimeout(() => setCopied(false), 2000)
        } catch {
          // Fallback for non-HTTPS
          const ta = document.createElement('textarea')
          ta.value = prompt.prompt
          ta.style.position = 'fixed'
          ta.style.opacity = '0'
          document.body.appendChild(ta)
          ta.select()
          document.execCommand('copy')
          document.body.removeChild(ta)
          setCopied(true)
          toast('Prompt copied to clipboard', 'success')
          setTimeout(() => setCopied(false), 2000)
        }
      }}
      style={{
        display: 'flex', alignItems: 'center', gap: 5,
        padding: '5px 12px', borderRadius: 6,
        background: copied ? 'rgba(16,185,129,0.15)' : c.bg,
        border: `1px solid ${copied ? 'rgba(16,185,129,0.3)' : c.border}`,
        color: copied ? '#10b981' : c.text,
        fontSize: 11, fontWeight: 700, cursor: 'pointer',
        transition: 'all 150ms ease',
        whiteSpace: 'nowrap',
      }}
    >
      {copied ? (
        <><CheckCircle2 size={12} /> Copied</>
      ) : (
        <><ClipboardCopy size={12} /> {prompt.label}</>
      )}
    </button>
  )
}

function AlertRow({ alert, onResolve, resolving }: {
  alert: PerformanceAlert
  onResolve?: () => void
  resolving: boolean
}) {
  const [expanded, setExpanded] = useState(false)
  const [showPrompt, setShowPrompt] = useState<number | null>(null)
  const remediation = getRemediation(alert)
  const fixPrompts = generateFixPrompts(alert)

  return (
    <div style={{
      borderRadius: 8,
      background: alert.severity === 'critical' ? 'rgba(212,34,106,0.07)' : 'rgba(255,184,0,0.06)',
      border: `1px solid ${alert.severity === 'critical' ? 'rgba(212,34,106,0.2)' : 'rgba(255,184,0,0.15)'}`,
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', padding: '10px 14px' }}>
        <div style={{ flex: 1, minWidth: 0, cursor: 'pointer' }} onClick={() => setExpanded(v => !v)}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: severityColor(alert.severity), textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              {alert.severity}
            </span>
            <span style={{ fontSize: 11, color: '#6060a0', background: 'rgba(255,255,255,0.05)', padding: '1px 6px', borderRadius: 4 }}>
              {alertTypeLabel(alert.alert_type)}
            </span>
            <span style={{ fontSize: 10, color: '#5050a0', marginLeft: 'auto' }}>
              {expanded ? '▾ collapse' : '▸ details'}
            </span>
          </div>
          <div style={{ fontSize: 12, color: '#C0C0E0', lineHeight: 1.5 }}>{alert.message}</div>
          {(alert.occurrence_count != null && alert.occurrence_count > 0) || alert.first_seen_at || alert.last_seen_at ? (
            <div style={{ fontSize: 10, color: '#7070a0', marginTop: 4, lineHeight: 1.5 }}>
              {alert.occurrence_count != null && alert.occurrence_count > 0 && (
                <span>Detections ×{alert.occurrence_count}</span>
              )}
              {alert.first_seen_at && (
                <span>{alert.occurrence_count != null && alert.occurrence_count > 0 ? ' · ' : ''}First {new Date(alert.first_seen_at).toLocaleString()}</span>
              )}
              {alert.last_seen_at && (
                <span> · Last {new Date(alert.last_seen_at).toLocaleString()}</span>
              )}
              {(alert.worst_metric != null || alert.latest_metric != null) && (
                <span>
                  {' · '}
                  Worst {alert.worst_metric ?? '—'}
                  {alert.alert_type === 'high_cls' ? '' : alert.alert_type === 'high_slow_query_rate' ? '%' : 'ms'}
                  {' → Latest '}{alert.latest_metric ?? '—'}
                  {alert.alert_type === 'high_cls' ? '' : alert.alert_type === 'high_slow_query_rate' ? '%' : 'ms'}
                </span>
              )}
            </div>
          ) : null}
          <div style={{ fontSize: 10, color: '#5050a0', marginTop: 2, display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
            <span>Created {new Date(alert.created_at).toLocaleString()}</span>
            {alert.resolved && alert.resolved_at && <span>· Resolved {new Date(alert.resolved_at).toLocaleString()}</span>}
            {alert.resolution_reason && alert.resolved && (
              <span style={{ color: '#6060a0' }}>· {alert.resolution_reason.replace(/_/g, ' ')}</span>
            )}
            {alert.regressed_at && !alert.resolved && (
              <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 4, background: 'rgba(255,184,0,0.15)', color: '#FFB800' }}>
                Regressed {new Date(alert.regressed_at).toLocaleDateString()}
              </span>
            )}
            {alert.dedupe_key && (
              <span style={{ fontFamily: 'monospace', color: '#404060', fontSize: 9 }} title="Dedupe key">{alert.dedupe_key}</span>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginLeft: 10, flexShrink: 0 }}>
          {fixPrompts.map((p, i) => <CopyButton key={i} prompt={p} />)}
          {onResolve && (
            <button
              onClick={onResolve}
              disabled={resolving}
              style={{
                padding: '5px 10px', borderRadius: 6,
                background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.25)',
                color: '#10b981', fontSize: 11, fontWeight: 600, cursor: resolving ? 'wait' : 'pointer',
                opacity: resolving ? 0.5 : 1,
              }}
            >
              Resolve
            </button>
          )}
        </div>
      </div>

      {/* Expanded details */}
      {expanded && (
        <div style={{
          padding: '0 14px 14px',
          borderTop: '1px solid rgba(255,255,255,0.04)',
        }}>
          {/* Remediation summary */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 10 }}>
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#6060a0', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 3 }}>
                Issue Type
              </div>
              <div style={{ fontSize: 12, color: '#C0C0E0' }}>{remediation.issueType}</div>
            </div>
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#6060a0', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 3 }}>
                Affected Area
              </div>
              <div style={{ fontSize: 12, color: '#E0E0F4', fontWeight: 600, fontFamily: 'monospace' }}>{remediation.affectedArea}</div>
            </div>
          </div>
          <div style={{ marginTop: 10 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#6060a0', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 3 }}>
              Likely Cause
            </div>
            <div style={{ fontSize: 12, color: '#C0C0E0', lineHeight: 1.5 }}>{remediation.likelyCause}</div>
          </div>
          <div style={{ marginTop: 10 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#D4226A', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 3 }}>
              Recommended Fix
            </div>
            <div style={{ fontSize: 12, color: '#C0C0E0', lineHeight: 1.7, whiteSpace: 'pre-line' }}>{remediation.recommendedFix}</div>
          </div>

          {/* Claude Code Fix Prompts */}
          <div style={{
            marginTop: 14,
            padding: '12px 14px',
            background: 'rgba(212,34,106,0.04)',
            border: '1px solid rgba(212,34,106,0.12)',
            borderRadius: 8,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: '#D4226A', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Claude Code Fix Prompt{fixPrompts.length > 1 ? 's' : ''}
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                {fixPrompts.map((p, i) => (
                  <button
                    key={i}
                    onClick={() => setShowPrompt(showPrompt === i ? null : i)}
                    style={{
                      padding: '3px 8px', borderRadius: 4, fontSize: 10, fontWeight: 600,
                      background: showPrompt === i ? 'rgba(212,34,106,0.2)' : 'rgba(255,255,255,0.05)',
                      border: '1px solid rgba(255,255,255,0.08)',
                      color: showPrompt === i ? '#D4226A' : '#8080A8',
                      cursor: 'pointer',
                    }}
                  >
                    {p.category === 'fix' ? 'Fix' : p.category === 'sql' ? 'SQL' : 'Frontend'}
                  </button>
                ))}
              </div>
            </div>

            {showPrompt != null && fixPrompts[showPrompt] && (
              <div style={{ position: 'relative' }}>
                <pre style={{
                  margin: 0,
                  padding: '10px 12px',
                  background: 'rgba(2,2,9,0.6)',
                  border: '1px solid rgba(255,255,255,0.06)',
                  borderRadius: 6,
                  fontSize: 11,
                  lineHeight: 1.6,
                  color: '#B0B0D0',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                  maxHeight: 320,
                  overflowY: 'auto',
                  fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace",
                }}>
                  {fixPrompts[showPrompt].prompt}
                </pre>
                <div style={{ marginTop: 8 }}>
                  <CopyButton prompt={fixPrompts[showPrompt]} />
                </div>
              </div>
            )}

            {showPrompt == null && (
              <div style={{ fontSize: 11, color: '#7070a0' }}>
                Click a tab above to preview the prompt, or use the copy buttons in the header to copy directly.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function EmptyState({ icon, message }: { icon?: React.ReactNode; message: string }) {
  return (
    <div style={{ textAlign: 'center', padding: '32px 0', color: '#5050a0', fontSize: 12 }}>
      {icon && <div style={{ marginBottom: 8 }}>{icon}</div>}
      {message}
    </div>
  )
}

// ─── Score helpers ────────────────────────────────────────────────────────────

function scoreLabel(score: 'good' | 'needs-improvement' | 'poor' | 'none'): string {
  const map = { good: 'Good', 'needs-improvement': 'Needs work', poor: 'Poor', none: 'No data' }
  return map[score]
}

function scoreColor(score: 'good' | 'needs-improvement' | 'poor' | 'none'): string {
  const map = { good: '#10b981', 'needs-improvement': '#FFB800', poor: '#D4226A', none: '#5050a0' }
  return map[score]
}

// ─── Static optimization tips ─────────────────────────────────────────────────

const OPTIMIZATION_TIPS = [
  {
    title: 'LCP > 2500ms',
    body: 'Preload hero images, reduce server response time, avoid render-blocking resources above the fold.',
  },
  {
    title: 'High CLS',
    body: 'Set explicit width/height on images and iframes. Reserve space for async-loaded content with skeleton placeholders.',
  },
  {
    title: 'Slow Queries',
    body: 'Add indexes on foreign keys and filter columns. Add .limit() to all list queries. Use .select() to limit returned columns.',
  },
  {
    title: 'FCP > 1800ms',
    body: 'Eliminate render-blocking scripts. Use code splitting (already configured in Vite). Minimize critical CSS.',
  },
  {
    title: 'Bundle Regression',
    body: 'Run `vite build --report` and inspect the rollup chunk map. Lazy-load anything not needed on initial render.',
  },
  {
    title: 'N+1 Patterns',
    body: 'Fetch related data in a single JOIN query rather than per-row lookups. Check hooks that call supabase inside loops.',
  },
]
