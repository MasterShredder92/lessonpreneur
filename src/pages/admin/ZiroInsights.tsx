import { useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuthContext } from '../../app/AuthContext'
import { usePermissions } from '../../hooks/usePermissions'
import {
  useAiObservabilityReport,
  useAiObservabilityTeamProfiles,
  type AiObservabilityFilters,
} from '../../hooks/useAiObservability'
import MusicLoader from '../../components/shared/MusicLoader'
import { IssueContextProvider } from '../../contexts/IssueContext'
import ReportIssueButton from '../../components/shared/ReportIssueButton'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts'
import { Sparkles } from 'lucide-react'

function defaultRange(): { dateFrom: string; dateTo: string } {
  const end = new Date()
  const start = new Date()
  start.setDate(end.getDate() - 14)
  return {
    dateFrom: start.toISOString().slice(0, 10),
    dateTo: end.toISOString().slice(0, 10),
  }
}

const ACTION_PRESETS = [
  { value: '', label: 'All actions' },
  { value: 'crm.navigate', label: 'crm.navigate' },
  { value: 'crm.reassign_students', label: 'crm.reassign_students' },
  { value: 'crm.move_schedule_sessions', label: 'crm.move_schedule_sessions' },
  { value: 'crm.audit_ping', label: 'crm.audit_ping' },
]

const thStyle: CSSProperties = {
  textAlign: 'left',
  padding: '8px 10px',
  borderBottom: '1px solid rgba(255,255,255,0.08)',
  color: '#9090b8',
  fontSize: 10,
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
}

const tdStyle: CSSProperties = {
  padding: '8px 10px',
  borderBottom: '1px solid rgba(255,255,255,0.04)',
  fontSize: 12,
  color: '#c8c8e8',
  verticalAlign: 'top',
}

export default function ZiroInsights() {
  const { tenantId } = useAuthContext()
  const { isOwner, isCompanyDirector } = usePermissions()
  const allowed = isOwner || isCompanyDirector

  const defaults = useMemo(() => defaultRange(), [])
  const [draft, setDraft] = useState<AiObservabilityFilters>(() => ({
    dateFrom: defaults.dateFrom,
    dateTo: defaults.dateTo,
    profileId: '',
    routeContains: '',
    source: '',
    actionId: '',
  }))
  const [applied, setApplied] = useState<AiObservabilityFilters>(() => ({
    dateFrom: defaults.dateFrom,
    dateTo: defaults.dateTo,
    profileId: '',
    routeContains: '',
    source: '',
    actionId: '',
  }))

  const { data: team } = useAiObservabilityTeamProfiles(tenantId)
  const { data: report, isLoading, isError, error } = useAiObservabilityReport(tenantId, applied)

  if (!allowed) {
    return <Navigate to="/admin/dashboard" replace />
  }

  const pieData =
    report && report.actionSummary.total > 0
      ? [
          { name: 'Success', value: report.actionSummary.success, fill: '#22C55E' },
          { name: 'Failed', value: report.actionSummary.failed, fill: '#EF4444' },
        ]
      : []

  const actionBarData =
    report?.actionSummary.byAction.map((a) => ({
      name: a.actionId.replace('crm.', ''),
      ok: a.success,
      fail: a.failed,
    })) ?? []

  return (
    <IssueContextProvider page="Ziro insights">
      <div className="page">
        <div className="page-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Sparkles size={18} style={{ color: '#D4226A' }} />
            <h1>Ziro insights</h1>
          </div>
          <ReportIssueButton />
        </div>

        <p style={{ margin: '0 0 16px', fontSize: 13, color: '#8080a8', maxWidth: 820 }}>
          Internal report: sessions, prompts, structured actions, and optional thumbs feedback. Filters apply to the
          selected date range (local calendar days). Rows are capped for performance—narrow the window if needed.
        </p>
        <div
          style={{
            marginBottom: 18,
            padding: '12px 14px',
            borderRadius: 10,
            background: 'rgba(212,34,106,0.06)',
            border: '1px solid rgba(212,34,106,0.15)',
            fontSize: 12,
            color: '#a8a8c8',
            lineHeight: 1.55,
            maxWidth: 820,
          }}
        >
          <strong style={{ color: '#e0e0f0' }}>What each signal means</strong>
          <ul style={{ margin: '8px 0 0', paddingLeft: 18 }}>
            <li>
              <strong style={{ color: '#c8c8e8' }}>User prompts</strong> — rows in <code style={{ fontSize: 11 }}>ai_messages</code>{' '}
              with <code style={{ fontSize: 11 }}>role=user</code> in the date range (what people asked).
            </li>
            <li>
              <strong style={{ color: '#c8c8e8' }}>Routes</strong> — <code style={{ fontSize: 11 }}>client_route</code> on sessions
              started in range (where the panel was used).
            </li>
            <li>
              <strong style={{ color: '#c8c8e8' }}>Structured actions</strong> — <code style={{ fontSize: 11 }}>ai_action_logs</code>{' '}
              (navigate, reassign, schedule moves). <strong style={{ color: '#c8c8e8' }}>Success rate</strong> is{' '}
              <code style={{ fontSize: 11 }}>ok=true</code> divided by total rows in range (believable when actions exist;
              use Action type filter to narrow).
            </li>
            <li>
              <strong style={{ color: '#c8c8e8' }}>Feedback</strong> — thumbs saved to <code style={{ fontSize: 11 }}>ai_feedback</code>{' '}
              from the Ziro panel after each assistant reply (requires deployed edge returning message ids).
            </li>
          </ul>
        </div>

        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 10,
            alignItems: 'flex-end',
            marginBottom: 20,
            padding: 14,
            borderRadius: 12,
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid rgba(255,255,255,0.08)',
          }}
        >
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11, color: '#9090b8' }}>
            From
            <input
              type="date"
              className="filter-select"
              value={draft.dateFrom}
              onChange={(e) => setDraft((d) => ({ ...d, dateFrom: e.target.value }))}
            />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11, color: '#9090b8' }}>
            To
            <input
              type="date"
              className="filter-select"
              value={draft.dateTo}
              onChange={(e) => setDraft((d) => ({ ...d, dateTo: e.target.value }))}
            />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11, color: '#9090b8' }}>
            User
            <select
              className="filter-select"
              style={{ minWidth: 160 }}
              value={draft.profileId}
              onChange={(e) => setDraft((d) => ({ ...d, profileId: e.target.value }))}
            >
              <option value="">All users</option>
              {(team ?? []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11, color: '#9090b8' }}>
            Route contains
            <input
              className="filter-select"
              placeholder="/admin/…"
              value={draft.routeContains}
              onChange={(e) => setDraft((d) => ({ ...d, routeContains: e.target.value }))}
              style={{ minWidth: 160 }}
            />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11, color: '#9090b8' }}>
            Source
            <input
              className="filter-select"
              placeholder="e.g. ziro_business"
              value={draft.source}
              onChange={(e) => setDraft((d) => ({ ...d, source: e.target.value }))}
              style={{ minWidth: 140 }}
            />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11, color: '#9090b8' }}>
            Action type
            <select
              className="filter-select"
              style={{ minWidth: 200 }}
              value={draft.actionId}
              onChange={(e) => setDraft((d) => ({ ...d, actionId: e.target.value }))}
            >
              {ACTION_PRESETS.map((o) => (
                <option key={o.value || 'all'} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="btn-primary"
            style={{ padding: '8px 16px', fontSize: 12, borderRadius: 8 }}
            onClick={() => setApplied({ ...draft })}
          >
            Apply filters
          </button>
        </div>

        {isLoading && (
          <div style={{ height: 280 }}>
            <MusicLoader />
          </div>
        )}

        {isError && (
          <div style={{ padding: 16, color: '#f87171', fontSize: 13 }}>
            {error instanceof Error ? error.message : 'Failed to load report'}
          </div>
        )}

        {!isLoading && report && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
              <Kpi title="Sessions" value={report.conversationCount} sub="ai_conversations in range" />
              <Kpi title="User prompts" value={report.userMessageCount} sub="ai_messages (role=user)" />
              <Kpi
                title="Structured actions"
                value={report.actionSummary.total}
                sub="ai_action_logs in range"
              />
              <Kpi
                title="Action success rate"
                value={
                  report.actionSummary.total === 0
                    ? '—'
                    : `${Math.round((100 * report.actionSummary.success) / report.actionSummary.total)}%`
                }
                sub={`${report.actionSummary.success} ok / ${report.actionSummary.failed} failed`}
              />
              <Kpi title="Feedback rows" value={report.feedbackSummary.total} sub="ai_feedback in range" />
              <Kpi
                title="Thumbs balance"
                value={
                  report.feedbackSummary.total === 0
                    ? '—'
                    : `${report.feedbackSummary.thumbsUp} up · ${report.feedbackSummary.thumbsDown} down`
                }
                sub={`Net ${report.feedbackSummary.netSentiment >= 0 ? '+' : ''}${report.feedbackSummary.netSentiment}`}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 20 }}>
              <ChartCard title="Action outcomes" sub="Success vs failed (all action types in range)">
                {pieData.length === 0 ? (
                  <div style={{ padding: 24, color: '#606088', fontSize: 13 }}>No actions in this range.</div>
                ) : (
                  <ResponsiveContainer width="100%" height={220}>
                    <PieChart>
                      <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={72}>
                        {pieData.map((_, i) => (
                          <Cell key={i} fill={pieData[i].fill} />
                        ))}
                      </Pie>
                      <Tooltip contentStyle={{ background: '#101018', border: '1px solid #1a1a28', borderRadius: 8 }} />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </ChartCard>

              <ChartCard title="Actions by type" sub="Success vs failed per action_id">
                {actionBarData.length === 0 ? (
                  <div style={{ padding: 24, color: '#606088', fontSize: 13 }}>No actions in this range.</div>
                ) : (
                  <ResponsiveContainer width="100%" height={260}>
                    <BarChart data={actionBarData} layout="vertical" margin={{ left: 8, right: 8 }}>
                      <XAxis type="number" stroke="#606088" fontSize={10} />
                      <YAxis type="category" dataKey="name" width={120} stroke="#606088" fontSize={10} />
                      <Tooltip contentStyle={{ background: '#101018', border: '1px solid #1a1a28', borderRadius: 8 }} />
                      <Bar dataKey="ok" name="OK" stackId="a" fill="#22C55E" radius={[0, 0, 0, 0]} />
                      <Bar dataKey="fail" name="Fail" stackId="a" fill="#EF4444" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </ChartCard>
            </div>

            <ChartCard title="Most common routes" sub="From ai_conversations.client_route (sessions started in range)">
              {report.routeCounts.length === 0 ? (
                <div style={{ padding: 16, color: '#606088', fontSize: 13 }}>No sessions in this range.</div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      <th style={thStyle}>Route</th>
                      <th style={{ ...thStyle, width: 100 }}>Sessions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.routeCounts.map((r) => (
                      <tr key={r.route}>
                        <td style={tdStyle}>
                          <code style={{ fontSize: 11, color: '#e0e0f4' }}>{r.route}</code>
                        </td>
                        <td style={{ ...tdStyle, fontWeight: 600 }}>{r.count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </ChartCard>

            <ChartCard
              title="User feedback (thumbs)"
              sub="From ai_feedback; route/source from linked session when available"
            >
              {report.feedbackSummary.total === 0 ? (
                <div style={{ padding: 16, color: '#606088', fontSize: 13 }}>
                  No feedback in this range. Thumbs appear under each Ziro reply after the ai-assistant edge exposes{' '}
                  <code style={{ fontSize: 11 }}>assistant_message_id</code>.
                </div>
              ) : (
                <>
                  <div style={{ display: 'flex', gap: 20, marginBottom: 14, flexWrap: 'wrap', fontSize: 12, color: '#9090b8' }}>
                    <span>
                      <strong style={{ color: '#22C55E' }}>{report.feedbackSummary.thumbsUp}</strong> thumbs up
                    </span>
                    <span>
                      <strong style={{ color: '#EF4444' }}>{report.feedbackSummary.thumbsDown}</strong> thumbs down
                    </span>
                    <span>
                      Net sentiment:{' '}
                      <strong style={{ color: '#E0E0F4' }}>
                        {report.feedbackSummary.netSentiment >= 0 ? '+' : ''}
                        {report.feedbackSummary.netSentiment}
                      </strong>
                    </span>
                  </div>
                  <MiniTable
                    cols={['When', 'User', 'Vote', 'Route', 'Source', 'Comment']}
                    rows={report.recentFeedback.map((f) => [
                      new Date(f.created_at).toLocaleString(),
                      f.displayName,
                      f.rating === 1 ? 'Up' : f.rating === -1 ? 'Down' : String(f.rating ?? '—'),
                      f.client_route ?? '—',
                      f.source ?? '—',
                      f.comment ?? '—',
                    ])}
                  />
                </>
              )}
            </ChartCard>

            <ChartCard title="Top repeated questions" sub="Exact match on normalized user message text (max 25)">
              {report.topQuestions.length === 0 ? (
                <div style={{ padding: 16, color: '#606088', fontSize: 13 }}>No user messages in this range.</div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      <th style={thStyle}>Count</th>
                      <th style={thStyle}>Question</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.topQuestions.map((q) => (
                      <tr key={q.question}>
                        <td style={{ ...tdStyle, width: 72, fontWeight: 700, color: '#FFB800' }}>{q.count}</td>
                        <td style={tdStyle}>{q.question}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </ChartCard>

            <ChartCard title="Recent sessions" sub="Newest first (sample)">
              <MiniTable
                cols={['When', 'User', 'Source', 'Route']}
                rows={report.recentConversations.map((c) => [
                  new Date(c.created_at).toLocaleString(),
                  c.displayName,
                  c.source,
                  c.client_route ?? '—',
                ])}
              />
            </ChartCard>

            <ChartCard title="Recent user prompts" sub="Newest first (sample)">
              <MiniTable
                cols={['When', 'User', 'Prompt']}
                rows={report.recentUserMessages.map((m) => [
                  new Date(m.created_at).toLocaleString(),
                  m.displayName,
                  m.content ?? '—',
                ])}
              />
            </ChartCard>

            <ChartCard title="Recent structured actions" sub="Newest first (sample)">
              <MiniTable
                cols={['When', 'User', 'Action', 'Result', 'Error']}
                rows={report.recentActions.map((a) => [
                  new Date(a.created_at).toLocaleString(),
                  a.displayName,
                  a.action_id,
                  a.ok ? 'OK' : 'Fail',
                  a.error_code ?? '—',
                ])}
              />
            </ChartCard>
          </div>
        )}
      </div>
    </IssueContextProvider>
  )
}

function Kpi({ title, value, sub }: { title: string; value: number | string; sub: string }) {
  return (
    <div
      style={{
        flex: '1 1 140px',
        minWidth: 140,
        padding: 14,
        borderRadius: 12,
        background: 'rgba(255,255,255,0.04)',
        border: '1px solid rgba(255,255,255,0.08)',
      }}
    >
      <div style={{ fontSize: 10, color: '#8080a8', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{title}</div>
      <div style={{ fontSize: 22, fontWeight: 800, color: '#f0f0fa', marginTop: 4 }}>{value}</div>
      <div style={{ fontSize: 11, color: '#606088', marginTop: 4 }}>{sub}</div>
    </div>
  )
}

function ChartCard({ title, sub, children }: { title: string; sub: string; children: ReactNode }) {
  return (
    <div
      style={{
        padding: 16,
        borderRadius: 12,
        background: 'rgba(255,255,255,0.03)',
        border: '1px solid rgba(255,255,255,0.08)',
      }}
    >
      <div style={{ fontSize: 14, fontWeight: 700, color: '#e8e8f8' }}>{title}</div>
      <div style={{ fontSize: 11, color: '#707098', marginBottom: 12 }}>{sub}</div>
      {children}
    </div>
  )
}

function MiniTable({ cols, rows }: { cols: string[]; rows: string[][] }) {
  if (rows.length === 0) {
    return <div style={{ padding: 12, color: '#606088', fontSize: 13 }}>No rows.</div>
  }
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
        <thead>
          <tr>
            {cols.map((c) => (
              <th key={c} style={thStyle}>
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              {r.map((cell, j) => (
                <td key={j} style={tdStyle}>
                  {j === cols.length - 1 && cell.length > 200 ? `${cell.slice(0, 200)}…` : cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
