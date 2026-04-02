import { useState } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { useAuthContext } from '../../app/AuthContext'
import { useUserLocations } from '../../hooks/useUserLocations'
import {
  useValueCardQueue, useGenerateValueCard, useSendValueCard,
  useReviewQueue, useSendReviewRequest, useRetentionMetrics,
  useAtRiskStudents, useDismissAtRisk,
  useFormerStudents, useLostLeads, useWinBackMetrics,
} from '../../hooks/useRetentionData'
import { toast } from '../../components/shared/Toast'
import { Shield, Star, AlertTriangle, Send, X, UserX, Clock, ExternalLink, Heart, Sparkles, ArrowRight, RefreshCw, Trophy, TrendingUp } from 'lucide-react'
import { getInstrumentEmoji } from '../../utils/instrumentEmoji'

const LOC_COLORS: Record<string, string> = {
  Omaha: '#D41113', Bellevue: '#A333FF', Elkhorn: '#00A5E8', Gretna: '#00A651',
}

type TabKey = 'active' | 'at-risk' | 'win-back' | 'campaigns'
const TABS: { key: TabKey; label: string }[] = [
  { key: 'active', label: 'Active Retention' },
  { key: 'at-risk', label: 'At-Risk' },
  { key: 'win-back', label: 'Win-Back' },
  { key: 'campaigns', label: 'Campaigns' },
]

// ── Location badge helper ──
function LocBadge({ name }: { name: string }) {
  const color = LOC_COLORS[name] ?? '#8080A8'
  return (
    <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 8px', borderRadius: 10, lineHeight: '16px', background: `${color}18`, color, border: `1px solid ${color}30`, whiteSpace: 'nowrap' }}>
      {name}
    </span>
  )
}

// ── Metric card ──
function MetricCard({ label, value, color = '#E0E0F4' }: { label: string; value: string | number; color?: string }) {
  return (
    <div style={{ flex: 1, minWidth: 120, padding: '14px 16px', borderRadius: 12, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: '#8080A8', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 800, color, marginTop: 4 }}>{value}</div>
    </div>
  )
}

// ══════════════════════════════
//  MAIN PAGE
// ══════════════════════════════
export default function Retention() {
  const [params, setParams] = useSearchParams()
  const activeTab = (params.get('tab') as TabKey) || 'active'
  const { data: userLocations } = useUserLocations()

  return (
    <div className="page">
      <div className="page-header">
        <h1 style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Shield size={22} /> Retention
        </h1>
      </div>

      {/* Tab bar */}
      <div style={{ display: 'flex', gap: 2, padding: 4, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 14, marginBottom: 24, overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
        {TABS.map(tab => {
          const isActive = activeTab === tab.key
          return (
            <button key={tab.key} onClick={() => setParams({ tab: tab.key })} style={{ flex: 1, minWidth: 120, padding: '10px 16px', borderRadius: 10, border: 'none', background: isActive ? 'rgba(212,34,106,0.12)' : 'transparent', color: isActive ? '#E0E0F4' : '#8080A8', fontWeight: isActive ? 700 : 500, fontSize: 13, cursor: 'pointer', transition: 'all 150ms', position: 'relative', whiteSpace: 'nowrap' }}>
              {tab.label}
              {isActive && <div style={{ position: 'absolute', bottom: 0, left: '20%', right: '20%', height: 2, borderRadius: 1, background: '#D4226A' }} />}
            </button>
          )
        })}
      </div>

      {activeTab === 'active' && <ActiveRetentionTab locationIds={userLocations} />}
      {activeTab === 'at-risk' && <AtRiskTab locationIds={userLocations} />}
      {activeTab === 'win-back' && <WinBackTab locationIds={userLocations} />}
      {activeTab === 'campaigns' && <CampaignsTab locationIds={userLocations} />}
    </div>
  )
}

// ══════════════════════════════
//  TAB 1: ACTIVE RETENTION
// ══════════════════════════════
function ActiveRetentionTab({ locationIds }: { locationIds?: string[] | null }) {
  const { data: metrics } = useRetentionMetrics(locationIds)
  const { data: valueQueue } = useValueCardQueue(locationIds)
  const generateCard = useGenerateValueCard()
  const sendCard = useSendValueCard()
  const { data: reviewQueue } = useReviewQueue(locationIds)
  const sendReview = useSendReviewRequest()
  const [generatingFor, setGeneratingFor] = useState<string | null>(null)
  const [previewCard, setPreviewCard] = useState<any>(null)

  return (
    <div>
      {/* Metrics row */}
      {metrics && (
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 28 }}>
          <MetricCard label="Active Students" value={metrics.activeStudents} color="#22C55E" />
          <MetricCard label="Avg Months Enrolled" value={metrics.avgMonthsEnrolled} color="#FFB800" />
          <MetricCard label="Value Cards Sent" value={metrics.valueCardsSentThisMonth} color="#38BDF8" />
          <MetricCard label="Review Requests Sent" value={metrics.reviewRequestsSentThisMonth} color="#D4226A" />
          <MetricCard label="Reviews Received" value={metrics.reviewsReceivedThisMonth} color="#A333FF" />
        </div>
      )}

      {/* A) Value Card Queue */}
      <div style={{ marginBottom: 32 }}>
        <div className="section-header">
          <span className="section-label">Students Due for a Progress Update</span>
          <span style={{ fontSize: 10, color: '#8080A8' }}>{valueQueue?.length ?? 0} students</span>
          <div className="section-line" />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {(valueQueue ?? []).slice(0, 15).map(s => (
            <div key={s.id} className="ret-card" style={{ padding: '10px 14px', borderRadius: 10, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
              <div className="ret-card-top">
                <LocBadge name={s.locationName} />
              </div>
              <div className="ret-card-row">
                <div style={{ flex: 1, minWidth: 120 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#E0E0F4' }}>{s.name}</span>
                  <span style={{ fontSize: 11, color: '#8080A8', marginLeft: 8 }}>{s.instrument}</span>
                </div>
                <span className="ret-card-loc-inline"><LocBadge name={s.locationName} /></span>
                <span style={{ fontSize: 11, color: '#606088', whiteSpace: 'nowrap' }}>
                  {s.lastCardDate ? `Last: ${new Date(s.lastCardDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : 'Never sent'}
                </span>
              </div>
              <div className="ret-card-actions">
                <button
                  disabled={generatingFor === s.id || generateCard.isPending}
                  onClick={async () => {
                    setGeneratingFor(s.id)
                    try {
                      const card = await generateCard.mutateAsync(s.id)
                      setPreviewCard(card)
                    } catch { toast('Failed to generate card', 'error') }
                    setGeneratingFor(null)
                  }}
                  style={{ padding: '6px 14px', borderRadius: 8, background: 'rgba(56,189,248,0.08)', border: '1px solid rgba(56,189,248,0.2)', color: '#38BDF8', fontSize: 11, fontWeight: 700, cursor: 'pointer', minHeight: 36, whiteSpace: 'nowrap' }}
                >
                  {generatingFor === s.id ? <><Sparkles size={12} /> Generating...</> : 'Generate Card'}
                </button>
              </div>
            </div>
          ))}
          {(valueQueue ?? []).length === 0 && (
            <div style={{ padding: 24, textAlign: 'center', color: '#606088', fontSize: 13 }}>All students are up to date!</div>
          )}
        </div>
      </div>

      {/* Value Card Preview Modal */}
      {previewCard && (() => {
        const topPct = 100 - previewCard.percentile_rank
        const instrEmoji = getInstrumentEmoji(previewCard.instrument ?? '')
        const highlights: string[] = previewCard.teacher_highlights ?? []
        const skills: string[] = previewCard.skills_worked_on ?? []
        const attendRate = previewCard.attendance_rate ?? 0
        const attendLabel = attendRate >= 90 ? 'Outstanding' : attendRate >= 75 ? 'Strong' : attendRate >= 50 ? 'Building' : 'Needs Love'
        const attendEmoji = attendRate >= 90 ? '🔥' : attendRate >= 75 ? '💪' : attendRate >= 50 ? '📈' : '💛'

        return (
          <div className="modal-overlay" onClick={() => setPreviewCard(null)}>
            <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 440, overflow: 'hidden' }}>
              {/* Header with instrument emoji and gradient accent */}
              <div style={{ padding: '24px 24px 16px', background: 'linear-gradient(135deg, rgba(34,197,94,0.08) 0%, rgba(56,189,248,0.06) 100%)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ fontSize: 36, lineHeight: 1 }}>{instrEmoji}</div>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 600, color: '#8080A8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Progress Report</div>
                    <div style={{ fontSize: 16, fontWeight: 800, color: '#E0E0F4', marginTop: 2 }}>{previewCard.instrument} with {previewCard.teacher_name}</div>
                  </div>
                </div>
              </div>

              <div style={{ padding: '20px 24px 24px' }}>
                {/* Big stat cards — 2x2 grid */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 18 }}>
                  {/* Attendance */}
                  <div style={{ padding: '14px 16px', borderRadius: 14, background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.12)', textAlign: 'center' }}>
                    <div style={{ fontSize: 28, fontWeight: 900, color: '#22C55E', lineHeight: 1 }}>{attendRate}%</div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#22C55E', marginTop: 4 }}>{attendEmoji} {attendLabel}</div>
                    <div style={{ fontSize: 10, color: '#8080A8', marginTop: 2 }}>Attendance Rate</div>
                  </div>

                  {/* Ranking */}
                  <div style={{ padding: '14px 16px', borderRadius: 14, background: 'rgba(212,34,106,0.06)', border: '1px solid rgba(212,34,106,0.12)', textAlign: 'center' }}>
                    <div style={{ fontSize: 28, fontWeight: 900, color: '#D4226A', lineHeight: 1 }}>Top {topPct}%</div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#D4226A', marginTop: 4 }}>{topPct <= 10 ? '🏆' : topPct <= 25 ? '⭐' : '🎯'} {topPct <= 10 ? 'Elite' : topPct <= 25 ? 'Excellent' : 'Great'}</div>
                    <div style={{ fontSize: 10, color: '#8080A8', marginTop: 2 }}>Family Ranking</div>
                  </div>

                  {/* Sessions */}
                  <div style={{ padding: '14px 16px', borderRadius: 14, background: 'rgba(255,184,0,0.06)', border: '1px solid rgba(255,184,0,0.12)', textAlign: 'center' }}>
                    <div style={{ fontSize: 28, fontWeight: 900, color: '#FFB800', lineHeight: 1 }}>{previewCard.attended_sessions_period}</div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#FFB800', marginTop: 4 }}>🎶 Sessions</div>
                    <div style={{ fontSize: 10, color: '#8080A8', marginTop: 2 }}>This Period</div>
                  </div>

                  {/* Months */}
                  <div style={{ padding: '14px 16px', borderRadius: 14, background: 'rgba(56,189,248,0.06)', border: '1px solid rgba(56,189,248,0.12)', textAlign: 'center' }}>
                    <div style={{ fontSize: 28, fontWeight: 900, color: '#38BDF8', lineHeight: 1 }}>{previewCard.months_enrolled}</div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#38BDF8', marginTop: 4 }}>📅 {previewCard.months_enrolled === 1 ? 'Month' : 'Months'}</div>
                    <div style={{ fontSize: 10, color: '#8080A8', marginTop: 2 }}>Enrolled</div>
                  </div>
                </div>

                {/* Skills worked on */}
                {skills.length > 0 && (
                  <div style={{ marginBottom: 14 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#A0A0C8', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <TrendingUp size={12} /> Skills & Focus Areas
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {skills.map((s, i) => (
                        <span key={i} style={{ fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 10, background: 'rgba(163,51,255,0.08)', border: '1px solid rgba(163,51,255,0.15)', color: '#C084FC' }}>
                          ✨ {s}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Teacher highlights */}
                {highlights.length > 0 && (
                  <div style={{ marginBottom: 14 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#A0A0C8', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Heart size={12} /> Teacher Notes
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {highlights.map((h, i) => (
                        <div key={i} style={{ fontSize: 12, color: '#C0C0E0', padding: '6px 10px', borderRadius: 8, background: 'rgba(255,255,255,0.03)', borderLeft: '3px solid rgba(255,184,0,0.4)' }}>
                          💬 {h}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* AI summary — kept short */}
                {previewCard.ai_summary && (
                  <div style={{ padding: '12px 14px', borderRadius: 12, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', marginBottom: 18 }}>
                    <div style={{ fontSize: 12, color: '#C0C0E0', lineHeight: 1.6 }}>
                      {previewCard.ai_summary}
                    </div>
                  </div>
                )}

                {/* Action buttons */}
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    onClick={async () => {
                      await sendCard.mutateAsync(previewCard.id)
                      toast('Value card sent!', 'success')
                      setPreviewCard(null)
                    }}
                    style={{ flex: 2, padding: '12px 16px', borderRadius: 12, background: '#22C55E', border: 'none', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 44 }}
                  >
                    <Send size={14} /> Send to Family
                  </button>
                  <button
                    onClick={() => setPreviewCard(null)}
                    style={{ flex: 1, padding: '12px 16px', borderRadius: 12, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#8080A8', fontWeight: 600, fontSize: 13, cursor: 'pointer', minHeight: 44 }}
                  >
                    Discard
                  </button>
                </div>
              </div>
            </div>
          </div>
        )
      })()}

      {/* B) Google Review Requests */}
      <div style={{ marginBottom: 32 }}>
        <div className="section-header">
          <span className="section-label">Ask for a Google Review</span>
          <span style={{ fontSize: 10, color: '#8080A8' }}>{reviewQueue?.length ?? 0} families eligible</span>
          <div className="section-line" />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {(reviewQueue ?? []).slice(0, 10).map(f => (
            <div key={f.id} style={{ padding: '10px 14px', borderRadius: 10, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 140 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: '#E0E0F4' }}>{f.name}</span>
              </div>
              <span style={{ fontSize: 11, color: '#8080A8' }}>{f.monthsEnrolled}mo enrolled</span>
              <LocBadge name={f.locationName} />
              <span style={{ fontSize: 11, color: '#606088' }}>
                {f.lastRequestDate ? `Last: ${new Date(f.lastRequestDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : 'Never asked'}
              </span>
              <button
                onClick={async () => {
                  try {
                    await sendReview.mutateAsync({ familyId: f.id, locationId: f.locationId })
                    toast(`Review request sent to ${f.name}`, 'success')
                  } catch { toast('Failed to send request', 'error') }
                }}
                disabled={sendReview.isPending}
                style={{ padding: '6px 14px', borderRadius: 8, background: 'rgba(212,34,106,0.08)', border: '1px solid rgba(212,34,106,0.2)', color: '#D4226A', fontSize: 11, fontWeight: 700, cursor: 'pointer', minHeight: 36, whiteSpace: 'nowrap' }}
              >
                <Star size={12} style={{ verticalAlign: 'middle', marginRight: 4 }} />
                Request Review
              </button>
            </div>
          ))}
          {(reviewQueue ?? []).length === 0 && (
            <div style={{ padding: 24, textAlign: 'center', color: '#606088', fontSize: 13 }}>No families eligible right now.</div>
          )}
        </div>
      </div>
    </div>
  )
}

// ══════════════════════════════
//  TAB 2: AT-RISK
// ══════════════════════════════
function AtRiskTab({ locationIds }: { locationIds?: string[] | null }) {
  const { data: students } = useAtRiskStudents(locationIds)
  const dismiss = useDismissAtRisk()
  const navigate = useNavigate()

  // Group by location for breakdown
  const byLocation: Record<string, number> = {}
  students?.forEach(s => { byLocation[s.locationName] = (byLocation[s.locationName] ?? 0) + 1 })

  return (
    <div>
      {/* Metrics */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 24 }}>
        <MetricCard label="Total At-Risk" value={students?.length ?? 0} color="#EF4444" />
        {Object.entries(byLocation).map(([loc, count]) => (
          <MetricCard key={loc} label={loc} value={count} color={LOC_COLORS[loc] ?? '#8080A8'} />
        ))}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {(students ?? []).map(s => (
          <div key={s.id} style={{ padding: '12px 14px', borderRadius: 10, background: 'rgba(239,68,68,0.03)', border: '1px solid rgba(239,68,68,0.08)', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <AlertTriangle size={14} style={{ color: '#EF4444', flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 160, cursor: 'pointer' }} onClick={() => navigate(`/admin/students/${s.id}`)}>
              <span style={{ fontSize: 13, fontWeight: 700, color: '#E0E0F4' }}>{s.name}</span>
              <span style={{ fontSize: 11, color: '#8080A8', marginLeft: 8 }}>{s.instrument}</span>
              {s.familyName && <div style={{ fontSize: 10, color: '#606088' }}>{s.familyName}</div>}
            </div>
            <LocBadge name={s.locationName} />
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              {s.reasons.map((r, i) => (
                <span key={i} style={{ fontSize: 10, fontWeight: 700, padding: '1px 8px', borderRadius: 10, lineHeight: '16px', background: 'rgba(239,68,68,0.1)', color: '#EF4444', border: '1px solid rgba(239,68,68,0.2)', whiteSpace: 'nowrap' as const }}>{r}</span>
              ))}
            </div>
            <button
              onClick={() => { dismiss.mutateAsync({ studentId: s.id, locationId: s.locationId }); toast('Dismissed for 30 days', 'success') }}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#606088', padding: 4, minHeight: 44, minWidth: 44, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              title="Dismiss for 30 days"
            ><X size={14} /></button>
          </div>
        ))}
        {(students ?? []).length === 0 && (
          <div style={{ padding: 40, textAlign: 'center', color: '#22C55E', fontSize: 14, fontWeight: 600 }}>No at-risk students right now. Great job!</div>
        )}
      </div>
    </div>
  )
}

// ══════════════════════════════
//  TAB 3: WIN-BACK
// ══════════════════════════════
function WinBackTab({ locationIds }: { locationIds?: string[] | null }) {
  const [subTab, setSubTab] = useState<'former' | 'leads'>('former')
  const { data: metrics } = useWinBackMetrics(locationIds)
  const { data: formerStudents } = useFormerStudents(locationIds)
  const { data: lostLeads } = useLostLeads(locationIds)
  const navigate = useNavigate()

  const EXIT_LABELS: Record<string, string> = {
    summer_break: 'Summer Break', holiday_break: 'Holiday Break', financial: 'Financial',
    schedule_conflict: 'Schedule', moving: 'Moving', lost_interest: 'Lost Interest',
    sports: 'Sports', teacher_fit: 'Teacher Fit', transferred: 'Transferred', other: 'Other',
  }

  const LOST_LABELS: Record<string, string> = {
    never_responded: 'Never Responded', price_objection: 'Price', schedule_conflict: 'Schedule',
    chose_competitor: 'Chose Competitor', not_ready: 'Not Ready', other: 'Other',
  }

  return (
    <div>
      {/* Metrics */}
      {metrics && (
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 24 }}>
          <MetricCard label="Former Students" value={metrics.totalFormer} color="#EF4444" />
          <MetricCard label="Due for Reactivation" value={metrics.dueForReactivation} color="#FFB800" />
          <MetricCard label="Contacted This Month" value={metrics.contactedThisMonth} color="#38BDF8" />
          <MetricCard label="Won Back" value={metrics.wonBackThisMonth} color="#22C55E" />
          <MetricCard label="Lost Leads" value={metrics.totalLostLeads} color="#A333FF" />
        </div>
      )}

      {/* Sub-tab toggle */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        <button onClick={() => setSubTab('former')} style={{ padding: '8px 20px', borderRadius: 8, background: subTab === 'former' ? 'rgba(255,255,255,0.06)' : 'transparent', border: `1px solid ${subTab === 'former' ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.04)'}`, color: subTab === 'former' ? '#E0E0F4' : '#8080A8', fontWeight: 600, fontSize: 12, cursor: 'pointer' }}>
          Former Students ({formerStudents?.length ?? 0})
        </button>
        <button onClick={() => setSubTab('leads')} style={{ padding: '8px 20px', borderRadius: 8, background: subTab === 'leads' ? 'rgba(255,255,255,0.06)' : 'transparent', border: `1px solid ${subTab === 'leads' ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.04)'}`, color: subTab === 'leads' ? '#E0E0F4' : '#8080A8', fontWeight: 600, fontSize: 12, cursor: 'pointer' }}>
          Lost Leads ({lostLeads?.length ?? 0})
        </button>
      </div>

      {subTab === 'former' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {(formerStudents ?? []).map(s => {
            const isTransferred = !!s.transferredTo
            const isDue = s.reactivationDate && new Date(s.reactivationDate) <= new Date()
            return (
              <div key={s.id} style={{ padding: '12px 14px', borderRadius: 10, background: 'rgba(255,255,255,0.02)', border: `1px solid ${isDue ? 'rgba(255,184,0,0.15)' : 'rgba(255,255,255,0.05)'}`, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 160, cursor: 'pointer' }} onClick={() => navigate(`/admin/students/${s.id}`)}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#E0E0F4' }}>{s.name}</span>
                  <span style={{ fontSize: 11, color: '#8080A8', marginLeft: 8 }}>{s.instrument}</span>
                  {s.familyName && <div style={{ fontSize: 10, color: '#606088' }}>{s.familyName}</div>}
                </div>
                <LocBadge name={s.locationName} />
                {s.exitCategory && (
                  <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 8px', borderRadius: 10, lineHeight: '16px', background: 'rgba(255,255,255,0.06)', color: '#A0A0C8', border: '1px solid rgba(255,255,255,0.1)', whiteSpace: 'nowrap' as const }}>
                    {EXIT_LABELS[s.exitCategory] ?? s.exitCategory}
                  </span>
                )}
                {isTransferred && (
                  <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 8px', borderRadius: 10, lineHeight: '16px', background: 'rgba(56,189,248,0.1)', color: '#38BDF8', border: '1px solid rgba(56,189,248,0.2)', whiteSpace: 'nowrap' as const }}>
                    Transferred to {s.transferredTo}
                  </span>
                )}
                {isDue && !isTransferred && (
                  <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 8px', borderRadius: 10, lineHeight: '16px', background: 'rgba(255,184,0,0.12)', color: '#FFB800', border: '1px solid rgba(255,184,0,0.2)', whiteSpace: 'nowrap' as const }}>Due</span>
                )}
                {s.deactivatedAt && (
                  <span style={{ fontSize: 10, color: '#606088' }}>
                    Exit: {new Date(s.deactivatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' })}
                  </span>
                )}
                {s.outreachCount > 0 && (
                  <span style={{ fontSize: 10, color: '#8080A8' }}>{s.outreachCount} contact{s.outreachCount !== 1 ? 's' : ''}</span>
                )}
              </div>
            )
          })}
          {(formerStudents ?? []).length === 0 && (
            <div style={{ padding: 40, textAlign: 'center', color: '#606088', fontSize: 13 }}>No former students.</div>
          )}
        </div>
      )}

      {subTab === 'leads' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {(lostLeads ?? []).map(l => (
            <div key={l.id} style={{ padding: '12px 14px', borderRadius: 10, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 140 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: '#E0E0F4' }}>{l.name}</span>
                {l.parentName && l.parentName !== l.name && <span style={{ fontSize: 11, color: '#8080A8', marginLeft: 8 }}>({l.parentName})</span>}
              </div>
              <span style={{ fontSize: 11, color: '#8080A8' }}>{l.instrument}</span>
              <LocBadge name={l.locationName} />
              {l.lostCategory && (
                <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 8px', borderRadius: 10, lineHeight: '16px', background: 'rgba(255,255,255,0.06)', color: '#A0A0C8', border: '1px solid rgba(255,255,255,0.1)', whiteSpace: 'nowrap' as const }}>
                  {LOST_LABELS[l.lostCategory] ?? l.lostCategory}
                </span>
              )}
              {l.lostDate && (
                <span style={{ fontSize: 10, color: '#606088' }}>
                  Lost: {new Date(l.lostDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </span>
              )}
            </div>
          ))}
          {(lostLeads ?? []).length === 0 && (
            <div style={{ padding: 40, textAlign: 'center', color: '#606088', fontSize: 13 }}>No lost leads.</div>
          )}
        </div>
      )}
    </div>
  )
}

// ══════════════════════════════
//  TAB 4: CAMPAIGNS
// ══════════════════════════════
function CampaignsTab({ locationIds }: { locationIds?: string[] | null }) {
  const now = new Date()
  const month = now.getMonth() // 0-indexed

  // Determine recommended campaign
  const recommended = month >= 3 && month <= 4 ? 'Summer Retention'
    : month === 7 ? 'Back to School'
    : month === 10 ? 'Holiday Retention'
    : month === 0 ? 'New Year Win-Back'
    : null

  const CAMPAIGNS = [
    { name: 'Summer Retention', desc: 'Keep students enrolled through summer break', waves: 3, months: 'April – May', color: '#FFB800' },
    { name: 'Back to School', desc: 'Re-engage families for fall semester', waves: 2, months: 'August', color: '#22C55E' },
    { name: 'Holiday Retention', desc: 'Prevent holiday season drop-off', waves: 2, months: 'November', color: '#EF4444' },
    { name: 'New Year Win-Back', desc: 'Win back former students for the new year', waves: 3, months: 'January', color: '#38BDF8' },
    { name: 'Custom Campaign', desc: 'Build a custom outreach campaign', waves: 0, months: 'Anytime', color: '#A333FF' },
  ]

  return (
    <div>
      {recommended && (
        <div style={{ padding: '16px 20px', borderRadius: 14, background: 'rgba(255,184,0,0.06)', border: '1px solid rgba(255,184,0,0.15)', marginBottom: 24, display: 'flex', alignItems: 'center', gap: 12 }}>
          <Sparkles size={18} style={{ color: '#FFB800', flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#FFB800' }}>Recommended: {recommended}</div>
            <div style={{ fontSize: 11, color: '#A0A0C8', marginTop: 2 }}>Based on the time of year, this campaign is most relevant right now.</div>
          </div>
          <button style={{ padding: '8px 16px', borderRadius: 8, background: '#FFB800', border: 'none', color: '#1A1A2E', fontWeight: 700, fontSize: 12, cursor: 'pointer', minHeight: 44 }}>
            Start Campaign
          </button>
        </div>
      )}

      <div className="section-header">
        <span className="section-label">Campaign Templates</span>
        <div className="section-line" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
        {CAMPAIGNS.map(c => (
          <div key={c.name} style={{
            padding: '20px', borderRadius: 14,
            background: 'rgba(255,255,255,0.02)', border: `1px solid ${c.name === recommended ? `${c.color}30` : 'rgba(255,255,255,0.06)'}`,
            cursor: 'pointer', transition: 'border-color 150ms',
          }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: c.color, marginBottom: 4 }}>{c.name}</div>
            <div style={{ fontSize: 12, color: '#A0A0C8', marginBottom: 10, lineHeight: 1.5 }}>{c.desc}</div>
            <div style={{ display: 'flex', gap: 12, fontSize: 11, color: '#8080A8' }}>
              {c.waves > 0 && <span>{c.waves} waves</span>}
              <span>{c.months}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
