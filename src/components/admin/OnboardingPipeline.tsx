import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useOnboardingPipeline, useCompleteTouchpoint, TOUCHPOINTS, type OnboardingSequence } from '../../hooks/useOnboarding'
import { toast } from '../shared/Toast'
import { ChevronDown, ChevronRight, Check, AlertTriangle } from 'lucide-react'
import { instrumentWithEmojiTitle } from '../../utils/instrumentEmoji'

export default function OnboardingPipeline() {
  const { data: sequences } = useOnboardingPipeline()
  const completeTouchpoint = useCompleteTouchpoint()
  const navigate = useNavigate()
  const [expanded, setExpanded] = useState(true)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  if (!sequences || sequences.length === 0) return null

  const atRiskCount = sequences.filter(s => s.risk_flag).length
  const overdueCount = sequences.filter(s => s.is_overdue).length

  // Sort: risk first, then overdue, then by days enrolled (newest first)
  const sorted = [...sequences].sort((a, b) => {
    if (a.risk_flag && !b.risk_flag) return -1
    if (!a.risk_flag && b.risk_flag) return 1
    if (a.is_overdue && !b.is_overdue) return -1
    if (!a.is_overdue && b.is_overdue) return 1
    return a.days_enrolled - b.days_enrolled
  })

  const handleComplete = async (seq: OnboardingSequence) => {
    // Find the first incomplete touchpoint
    for (const tp of TOUCHPOINTS) {
      const completedKey = `${tp.key}_completed_at` as keyof OnboardingSequence
      if (!seq[completedKey]) {
        try {
          await completeTouchpoint.mutateAsync({ sequenceId: seq.id, touchpoint: tp.key, type: 'manual' })
          toast(`${tp.label} touchpoint completed for ${seq.student_name}`, 'success')
        } catch (err: any) {
          toast(err.message ?? 'Failed to complete touchpoint', 'error')
        }
        return
      }
    }
  }

  return (
    <div style={{ marginBottom: 28 }}>
      <div
        onClick={() => setExpanded(!expanded)}
        style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', marginBottom: expanded ? 12 : 0 }}
      >
        {expanded ? <ChevronDown size={14} style={{ color: '#8080A8' }} /> : <ChevronRight size={14} style={{ color: '#8080A8' }} />}
        <span className="section-label" style={{ margin: 0 }}>Onboarding Pipeline</span>
        <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 999, background: 'rgba(56,189,248,0.12)', color: '#38BDF8' }}>
          {sequences.length}
        </span>
        {atRiskCount > 0 && (
          <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 8px', borderRadius: 999, background: 'rgba(239,68,68,0.12)', color: '#EF4444' }}>
            {atRiskCount} at risk
          </span>
        )}
        {overdueCount > 0 && (
          <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 8px', borderRadius: 999, background: 'rgba(255,184,0,0.12)', color: '#FFB800' }}>
            {overdueCount} overdue
          </span>
        )}
      </div>

      {expanded && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {sorted.slice(0, 12).map(seq => {
            const isExpanded = expandedId === seq.id
            const borderColor = seq.risk_flag ? 'rgba(239,68,68,0.2)' : seq.is_overdue ? 'rgba(255,184,0,0.15)' : 'rgba(255,255,255,0.06)'
            const bgColor = seq.risk_flag ? 'rgba(239,68,68,0.03)' : seq.is_overdue ? 'rgba(255,184,0,0.02)' : 'rgba(255,255,255,0.02)'

            return (
              <div key={seq.id}>
                <div
                  onClick={() => setExpandedId(isExpanded ? null : seq.id)}
                  style={{
                    padding: '10px 14px', borderRadius: isExpanded ? '10px 10px 0 0' : 10,
                    background: bgColor, border: `1px solid ${borderColor}`,
                    borderBottom: isExpanded ? 'none' : undefined,
                    cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10,
                  }}
                >
                  {/* Risk icon */}
                  {seq.risk_flag && <AlertTriangle size={14} style={{ color: '#EF4444', flexShrink: 0 }} />}

                  {/* Student info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: '#E0E0F4' }}>{seq.student_name}</span>
                      {seq.instrument && (
                        <span style={{ fontSize: 10, color: '#A0A0C8' }}>{instrumentWithEmojiTitle(seq.instrument)}</span>
                      )}
                      {seq.location_name && (
                        <span style={{ fontSize: 10, color: '#606088' }}>{seq.location_name}</span>
                      )}
                    </div>
                    <div style={{ fontSize: 10, color: '#8080A8', marginTop: 1 }}>
                      Day {seq.days_enrolled} of 90 · {seq.current_touchpoint ?? 'Complete'}
                      {seq.risk_flag && <span style={{ color: '#EF4444', marginLeft: 6 }}>At Risk{seq.risk_reason ? `: ${seq.risk_reason}` : ''}</span>}
                    </div>
                  </div>

                  {/* Touchpoint dots */}
                  <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                    {TOUCHPOINTS.map(tp => {
                      const completed = !!seq[`${tp.key}_completed_at` as keyof OnboardingSequence]
                      const due = seq[`${tp.key}_due` as keyof OnboardingSequence] as string
                      const today = new Date().toISOString().split('T')[0]
                      const isPast = due && today > due
                      const isCurrent = !completed && seq.current_touchpoint === tp.label

                      return (
                        <div key={tp.key} title={`${tp.label}${completed ? ' (done)' : isPast ? ' (overdue)' : ''}`} style={{
                          width: isCurrent ? 20 : 10, height: 10, borderRadius: 5,
                          background: completed ? '#22C55E' : (isPast && !completed) ? '#FFB800' : 'rgba(255,255,255,0.08)',
                          transition: 'all 200ms ease',
                        }} />
                      )
                    })}
                  </div>

                  {/* Complete button */}
                  {seq.current_touchpoint && seq.current_touchpoint !== 'Complete' && (
                    <button
                      onClick={(e) => { e.stopPropagation(); handleComplete(seq) }}
                      disabled={completeTouchpoint.isPending}
                      style={{
                        padding: '4px 10px', borderRadius: 6, fontSize: 10, fontWeight: 700,
                        background: 'rgba(34,197,94,0.1)', color: '#22C55E', border: '1px solid rgba(34,197,94,0.2)',
                        cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0,
                      }}
                    >
                      <Check size={10} /> Done
                    </button>
                  )}
                </div>

                {/* Expanded detail */}
                {isExpanded && (
                  <div style={{
                    padding: '12px 14px', borderRadius: '0 0 10px 10px',
                    background: bgColor, border: `1px solid ${borderColor}`, borderTop: 'none',
                    animation: 'fadeIn 150ms ease',
                  }}>
                    <div style={{ display: 'flex', gap: 16, fontSize: 11, color: '#A0A0C8', marginBottom: 10, flexWrap: 'wrap' }}>
                      <span>Enrolled: {new Date(seq.enrollment_date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                      {seq.teacher_name && <span>Teacher: {seq.teacher_name}</span>}
                      <span>Last session: {seq.last_session_date ? new Date(seq.last_session_date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'None'}</span>
                    </div>

                    {/* Touchpoint timeline */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 10 }}>
                      {TOUCHPOINTS.map(tp => {
                        const completed = seq[`${tp.key}_completed_at` as keyof OnboardingSequence] as string | null
                        const due = seq[`${tp.key}_due` as keyof OnboardingSequence] as string
                        const today = new Date().toISOString().split('T')[0]
                        const isPast = due && today > due && !completed

                        return (
                          <div key={tp.key} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11 }}>
                            <div style={{
                              width: 16, height: 16, borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center',
                              background: completed ? 'rgba(34,197,94,0.15)' : isPast ? 'rgba(255,184,0,0.15)' : 'rgba(255,255,255,0.04)',
                            }}>
                              {completed ? <Check size={10} style={{ color: '#22C55E' }} /> : null}
                            </div>
                            <span style={{ color: completed ? '#22C55E' : isPast ? '#FFB800' : '#606088', fontWeight: 600, width: 50 }}>{tp.label}</span>
                            <span style={{ color: '#606088' }}>
                              Due {due ? new Date(due + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—'}
                            </span>
                            {completed && <span style={{ color: '#606088' }}>Done {new Date(completed).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>}
                            {isPast && !completed && <span style={{ color: '#FFB800', fontWeight: 600 }}>Overdue</span>}
                          </div>
                        )
                      })}
                    </div>

                    <button
                      onClick={() => navigate(`/admin/students?id=${seq.student_id}`)}
                      style={{
                        padding: '6px 14px', borderRadius: 6, fontSize: 11, fontWeight: 600,
                        background: 'rgba(255,255,255,0.04)', color: '#A0A0C8',
                        border: '1px solid rgba(255,255,255,0.08)', cursor: 'pointer',
                      }}
                    >
                      View Student Profile
                    </button>
                  </div>
                )}
              </div>
            )
          })}
          {sorted.length > 12 && (
            <div onClick={() => navigate('/admin/students')} style={{ textAlign: 'center', fontSize: 11, color: '#8080A8', padding: 4, cursor: 'pointer' }}>
              + {sorted.length - 12} more in onboarding
            </div>
          )}
        </div>
      )}
    </div>
  )
}
