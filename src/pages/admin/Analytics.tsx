import { useState } from 'react'
import { useAnalytics } from '../../hooks/useAnalytics'
import { useLocations } from '../../hooks/useLocations'
import { exportRetention } from '../../hooks/useExport'
import { useAuthContext } from '../../app/AuthContext'
import MusicLoader from '../../components/shared/MusicLoader'
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import { Download, TrendingUp } from 'lucide-react'
import { IssueContextProvider } from '../../contexts/IssueContext'
import ReportIssueButton from '../../components/shared/ReportIssueButton'
import { instrumentWithEmojiTitle } from '../../utils/instrumentEmoji'

export default function Analytics() {
  const { tenantId } = useAuthContext()
  const { data: locations } = useLocations()
  const [months, setMonths] = useState(12)
  const [locationFilter, setLocationFilter] = useState('')
  const { data, isLoading } = useAnalytics(months, locationFilter || undefined)

  if (isLoading) return <div className="page"><div className="page-header"><h1>Analytics</h1></div><div style={{ height: 300 }}><MusicLoader /></div></div>

  return (
    <IssueContextProvider page="Analytics">
    <div className="page">
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <TrendingUp size={18} style={{ color: '#f59e0b' }} />
          <h1>Analytics</h1>
        </div>
        <div style={{ display: 'flex', gap: 8, marginLeft: 'auto', alignItems: 'center' }}>
          <select value={months} onChange={e => setMonths(Number(e.target.value))} className="filter-select" style={{ fontSize: 11, width: 'auto' }}>
            <option value={3}>3 months</option><option value={6}>6 months</option><option value={12}>12 months</option>
          </select>
          <select value={locationFilter} onChange={e => setLocationFilter(e.target.value)} className="filter-select" style={{ fontSize: 11, width: 'auto' }}>
            <option value="">All Locations</option>
            {locations?.filter((l: any) => l.is_active).map((l: any) => <option key={l.id} value={l.id}>{l.name.replace(' Music Lessons', '')}</option>)}
          </select>
          {tenantId && <button onClick={() => exportRetention(tenantId)} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '5px 12px', borderRadius: 6, fontSize: 11, background: 'rgba(255,255,255,0.04)', color: '#8080A8', border: '1px solid rgba(255,255,255,0.08)', cursor: 'pointer' }}><Download size={11} /> Export</button>}
        </div>
        <ReportIssueButton />
      </div>

      {data && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
          {/* Enrollment Trends */}
          <ChartCard title="Enrollment Trends" sub="New enrollments vs churn by month">
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={data.enrollmentTrend.map((e, i) => ({ ...e, churn: data.churnTrend[i]?.value ?? 0, net: data.netGrowth[i]?.value ?? 0 }))}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                <XAxis dataKey="label" stroke="#606088" fontSize={11} />
                <YAxis stroke="#606088" fontSize={11} />
                <Tooltip contentStyle={{ background: '#101018', border: '1px solid #1a1a28', borderRadius: 8, fontSize: 12 }} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="value" name="Enrolled" fill="#22C55E" radius={[4, 4, 0, 0]} />
                <Bar dataKey="churn" name="Churned" fill="#EF4444" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          {/* Revenue Trends */}
          <ChartCard title="Revenue Trends" sub="Monthly invoiced revenue">
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={data.revenueTrend}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                <XAxis dataKey="label" stroke="#606088" fontSize={11} />
                <YAxis stroke="#606088" fontSize={11} tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} />
                <Tooltip contentStyle={{ background: '#101018', border: '1px solid #1a1a28', borderRadius: 8, fontSize: 12 }} formatter={(v: number) => [`$${v.toLocaleString()}`, 'Revenue']} />
                <Line type="monotone" dataKey="value" stroke="#f59e0b" strokeWidth={2} dot={{ fill: '#f59e0b', r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>

          {/* Cohort Retention Heatmap */}
          {data.cohorts.length > 0 && (
            <ChartCard title="Retention Cohort Analysis" sub="Percentage of each enrollment cohort still active">
              <div style={{ overflowX: 'auto' }}>
                <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 11 }}>
                  <thead>
                    <tr>
                      <th style={thStyle}>Cohort</th>
                      {[1,2,3,4,5,6,7,8,9,10,11,12].map(m => <th key={m} style={thStyle}>Mo {m}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {data.cohorts.map(c => (
                      <tr key={c.enrollMonth}>
                        <td style={{ ...tdStyle, fontWeight: 600, color: '#E0E0F4' }}>{c.label}</td>
                        {c.retention.map((pct, i) => (
                          <td key={i} style={{ ...tdStyle, background: pct < 0 ? 'transparent' : pct >= 80 ? 'rgba(34,197,94,0.15)' : pct >= 50 ? 'rgba(255,184,0,0.12)' : 'rgba(239,68,68,0.12)', color: pct < 0 ? '#363656' : pct >= 80 ? '#22C55E' : pct >= 50 ? '#FFB800' : '#EF4444', fontWeight: 600, textAlign: 'center' }}>
                            {pct < 0 ? '—' : `${pct}%`}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </ChartCard>
          )}

          {/* Churn by Instrument */}
          {data.churnByInstrument.length > 0 && (
            <ChartCard title="Churn by Instrument" sub="Which instruments retain best?">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {data.churnByInstrument.filter(c => c.total >= 5).map(c => (
                  <div key={c.instrument} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0' }}>
                    <span style={{ width: 80, fontSize: 12, color: '#E0E0F4', fontWeight: 600 }}>{instrumentWithEmojiTitle(c.instrument)}</span>
                    <div style={{ flex: 1, height: 8, borderRadius: 4, background: 'rgba(255,255,255,0.06)' }}>
                      <div style={{ height: '100%', borderRadius: 4, width: `${c.rate}%`, background: c.rate > 40 ? '#EF4444' : c.rate > 25 ? '#FFB800' : '#22C55E' }} />
                    </div>
                    <span style={{ fontSize: 11, color: '#8080A8', width: 60, textAlign: 'right' }}>{c.rate}% ({c.count}/{c.total})</span>
                  </div>
                ))}
              </div>
            </ChartCard>
          )}
        </div>
      )}
    </div>
    </IssueContextProvider>
  )
}

function ChartCard({ title, sub, children }: { title: string; sub: string; children: React.ReactNode }) {
  return (
    <div style={{ padding: 20, borderRadius: 14, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
      <div style={{ fontSize: 15, fontWeight: 700, color: '#E0E0F4', marginBottom: 2 }}>{title}</div>
      <div style={{ fontSize: 11, color: '#8080A8', marginBottom: 16 }}>{sub}</div>
      {children}
    </div>
  )
}

const thStyle: React.CSSProperties = { padding: '6px 8px', textAlign: 'left', color: '#8080A8', borderBottom: '1px solid rgba(255,255,255,0.06)', fontSize: 10, fontWeight: 600 }
const tdStyle: React.CSSProperties = { padding: '6px 8px', borderBottom: '1px solid rgba(255,255,255,0.03)', fontSize: 11 }
