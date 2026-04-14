import { useState, type CSSProperties } from 'react'
import { Navigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  LineChart, Line, CartesianGrid, Legend,
} from 'recharts'
import { Activity, AlertTriangle, CheckCircle2, Zap, Database, Clock, TrendingUp, RefreshCw } from 'lucide-react'
import { useAuthContext } from '../../app/AuthContext'
import { usePermissions } from '../../hooks/usePermissions'
import MusicLoader from '../../components/shared/MusicLoader'
import { qk } from '../../lib/queryKeys'
import {
  fetchRecentMetrics,
  fetchSlowQuerySummaries,
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
  createAlerts,
  severityColor,
  alertTypeLabel,
  scoreLcp,
  scoreFcp,
  scoreCls,
  type PerformanceAlert,
} from '../../lib/performance/alerts'

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
  const [alertTab, setAlertTab] = useState<'active' | 'resolved'>('active')

  // Only owner / company_director can access this page
  if (!isOwner && !isCompanyDirector) {
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

  const { data: resolvedAlerts = [] } = useQuery({
    queryKey: qk.performance.resolvedAlerts(tenantId),
    queryFn: () => fetchResolvedAlerts(tenantId!),
    enabled: !!tenantId && alertTab === 'resolved',
    staleTime: 5 * 60 * 1000,
  })

  // ── Derived data ─────────────────────────────────────────────────────────

  const routeSummaries: RouteSummary[] = buildRouteSummaries(rawMetrics)
  const dailyTrend: DailySummary[] = buildDailyTrend(rawMetrics)
  const totalQuerySamples = slowQueries.reduce((acc, q) => acc + q.occurrence_count, 0)
  const health = buildHealthSummary(rawMetrics, slowQueries.reduce((acc, q) => acc + q.occurrence_count, 0))

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
      const candidates = evaluateThresholds(routeSummaries, slowQueries, totalQuerySamples)
      if (candidates.length && tenantId) {
        await createAlerts(tenantId, candidates)
      }
      return candidates.length
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.performance.activeAlerts(tenantId) })
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
              sub={`>${500}ms threshold`}
              subColor="#7070a0"
            />
            <HeroCard
              icon={<AlertTriangle size={16} color={activeAlerts.length > 0 ? '#D4226A' : '#10b981'} />}
              title="Active Alerts"
              value={String(activeAlerts.length)}
              sub={activeAlerts.length === 0 ? 'All clear' : `${activeAlerts.filter(a => a.severity === 'critical').length} critical`}
              subColor={activeAlerts.length === 0 ? '#10b981' : '#D4226A'}
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

          {/* ── Alerts panel ── */}
          <div style={card}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <div style={sectionTitle}>Performance Alerts</div>
              <div style={{ display: 'flex', gap: 6 }}>
                {(['active', 'resolved'] as const).map(tab => (
                  <button key={tab} onClick={() => setAlertTab(tab)} style={{
                    padding: '4px 12px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.08)',
                    background: alertTab === tab ? 'rgba(212,34,106,0.15)' : 'rgba(255,255,255,0.04)',
                    color: alertTab === tab ? '#D4226A' : '#6060a0',
                    fontSize: 11, fontWeight: 600, cursor: 'pointer', textTransform: 'capitalize',
                  }}>
                    {tab} {tab === 'active' ? `(${activeAlerts.length})` : ''}
                  </button>
                ))}
              </div>
            </div>

            {(() => {
              const alerts = alertTab === 'active' ? activeAlerts : resolvedAlerts
              if (alerts.length === 0) {
                return (
                  <EmptyState
                    icon={<CheckCircle2 size={20} color="#10b981" />}
                    message={alertTab === 'active' ? 'No active alerts. Click "Run Analysis" to evaluate current metrics.' : 'No resolved alerts in the last 30 days.'}
                  />
                )
              }
              return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {alerts.map(alert => (
                    <AlertRow
                      key={alert.id}
                      alert={alert}
                      onResolve={alertTab === 'active' ? () => resolveAlertMut.mutate(alert.id) : undefined}
                      resolving={resolveAlertMut.isPending}
                    />
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

function AlertRow({ alert, onResolve, resolving }: {
  alert: PerformanceAlert
  onResolve?: () => void
  resolving: boolean
}) {
  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
      padding: '10px 14px', borderRadius: 8,
      background: alert.severity === 'critical' ? 'rgba(212,34,106,0.07)' : 'rgba(255,184,0,0.06)',
      border: `1px solid ${alert.severity === 'critical' ? 'rgba(212,34,106,0.2)' : 'rgba(255,184,0,0.15)'}`,
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: severityColor(alert.severity), textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            {alert.severity}
          </span>
          <span style={{ fontSize: 11, color: '#6060a0', background: 'rgba(255,255,255,0.05)', padding: '1px 6px', borderRadius: 4 }}>
            {alertTypeLabel(alert.alert_type)}
          </span>
        </div>
        <div style={{ fontSize: 12, color: '#C0C0E0', lineHeight: 1.5 }}>{alert.message}</div>
        <div style={{ fontSize: 10, color: '#5050a0', marginTop: 2 }}>
          {new Date(alert.created_at).toLocaleString()}
          {alert.resolved && alert.resolved_at && ` · Resolved ${new Date(alert.resolved_at).toLocaleString()}`}
        </div>
      </div>
      {onResolve && (
        <button
          onClick={onResolve}
          disabled={resolving}
          style={{
            marginLeft: 12, flexShrink: 0, padding: '4px 10px', borderRadius: 6,
            background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.25)',
            color: '#10b981', fontSize: 11, fontWeight: 600, cursor: resolving ? 'wait' : 'pointer',
            opacity: resolving ? 0.5 : 1,
          }}
        >
          Resolve
        </button>
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
