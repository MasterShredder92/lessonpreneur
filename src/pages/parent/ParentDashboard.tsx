import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthContext } from '../../app/AuthContext'
import { useParentFamily } from '../../hooks/useParentFamily'
import { useFamilyCommunications, type ParentUpdate } from '../../hooks/useParentUpdates'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import MusicLoader from '../../components/shared/MusicLoader'
import ShareableProgressCard from '../../components/shared/ShareableProgressCard'
import { getInstrumentEmoji } from '../../utils/instrumentEmoji'
import { Music, Star, Share2, Calendar, Timer } from 'lucide-react'
import MessageStudioButton from '../../components/parent/MessageStudioButton'

const PROGRESS_DISPLAY: Record<string, { label: string; color: string }> = {
  struggling: { label: 'Working Through It', color: '#EF4444' },
  on_track: { label: 'On Track', color: '#FFB800' },
  crushing_it: { label: 'Crushing It', color: '#22C55E' },
}
const ENGAGEMENT_DISPLAY: Record<number, string> = { 1: '😴', 2: '😐', 3: '🙂', 4: '����', 5: '🔥' }

function timeAgo(dateStr: string): string {
  const diffMs = Date.now() - new Date(dateStr).getTime()
  const diffMin = Math.floor(diffMs / 60000)
  if (diffMin < 60) return `${diffMin}m ago`
  const diffHrs = Math.floor(diffMin / 60)
  if (diffHrs < 24) return `${diffHrs}h ago`
  const diffDays = Math.floor(diffHrs / 24)
  if (diffDays === 1) return 'Yesterday'
  if (diffDays < 7) return `${diffDays} days ago`
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export default function ParentDashboard() {
  const { profile } = useAuthContext()
  const { familyId, students, isLoading } = useParentFamily()
  const [shareCard, setShareCard] = useState<ParentUpdate | null>(null)
  const navigate = useNavigate()

  const { data: milestones } = useQuery({
    queryKey: ['parent-milestones', familyId],
    enabled: !!familyId && students.length > 0,
    queryFn: async () => {
      const studentIds = students.map(s => s.id)
      const { data: logs } = await supabase
        .from('session_log')
        .select('student_id, block_date')
        .in('student_id', studentIds)
        .order('block_date', { ascending: false })

      const { data: studentRows } = await supabase
        .from('students')
        .select('id, first_name, created_at')
        .in('id', studentIds)

      const countByStudent = new Map<string, number>()
      logs?.forEach((l: any) => countByStudent.set(l.student_id, (countByStudent.get(l.student_id) ?? 0) + 1))

      return (studentRows ?? []).map((s: any) => ({
        id: s.id,
        firstName: s.first_name,
        totalSessions: countByStudent.get(s.id) ?? 0,
        tenureMonths: Math.floor((Date.now() - new Date(s.created_at).getTime()) / (86400000 * 30)),
      }))
    },
  })

  const { data: updates, isLoading: updatesLoading } = useFamilyCommunications(familyId ?? undefined)

  if (isLoading || !profile) {
    return <div style={{ padding: 40, textAlign: 'center' }}><MusicLoader /></div>
  }

  return (
    <div style={{ maxWidth: 540, margin: '0 auto', padding: 16 }}>
      {/* Header */}
      <div style={{ marginBottom: 16 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: '#E0E0F4', margin: 0 }}>
          Hi, {profile.first_name ?? 'there'}
        </h1>
        <p style={{ fontSize: 13, color: '#8080A8', marginTop: 4 }}>
          Here's how your {students.length > 1 ? 'kids are' : 'child is'} doing.
        </p>
      </div>

      <div style={{ marginBottom: 24 }}>
        <MessageStudioButton />
      </div>

      {/* Student cards — stacked */}
      {students.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 }}>
          {students.map(s => (
            <div key={s.id} style={{
              padding: 14, borderRadius: 12,
              background: 'rgba(212,34,106,0.04)', border: '1px solid rgba(212,34,106,0.12)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 12 }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 15, fontWeight: 700, color: '#E0E0F4', display: 'flex', alignItems: 'center', gap: 8 }}>
                    {s.instrument ? <span style={{ fontSize: 18 }}>{getInstrumentEmoji(s.instrument)}</span> : <Music size={15} style={{ color: '#D4226A' }} />}
                    {s.first_name}
                  </div>
                  <div style={{ fontSize: 11, color: '#A0A0C8', marginTop: 2 }}>
                    {s.instrument ? `${s.instrument.charAt(0).toUpperCase()}${s.instrument.slice(1)}` : 'No instrument set'}
                    {s.teacher_name ? ` · with ${s.teacher_name}` : ''}
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={() => navigate(`/parent/schedule?student=${s.id}`)}
                  style={{
                    flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                    minHeight: 40, padding: '0 10px', borderRadius: 8, cursor: 'pointer',
                    background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
                    color: '#E0E0F4', fontSize: 12, fontWeight: 700,
                    WebkitTapHighlightColor: 'transparent',
                  }}
                >
                  <Calendar size={13} /> View Schedule
                </button>
                <button
                  onClick={() => navigate(`/parent/practice?student=${s.id}`)}
                  style={{
                    flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                    minHeight: 40, padding: '0 10px', borderRadius: 8, cursor: 'pointer',
                    background: 'rgba(212,34,106,0.12)', border: '1px solid rgba(212,34,106,0.3)',
                    color: '#D4226A', fontSize: 12, fontWeight: 700,
                    WebkitTapHighlightColor: 'transparent',
                  }}
                >
                  <Timer size={13} /> Practice Log
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Milestones */}
      {milestones && milestones.some(m => m.totalSessions > 0) && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 24 }}>
          {milestones.filter(m => m.totalSessions > 0).map(m => (
            <div key={m.id} style={{
              padding: '10px 14px', borderRadius: 10, flex: '1 0 140px',
              background: 'rgba(255,184,0,0.04)', border: '1px solid rgba(255,184,0,0.1)', textAlign: 'center',
            }}>
              <div style={{ fontSize: 22, fontWeight: 800, color: '#FFB800' }}>{m.totalSessions}</div>
              <div style={{ fontSize: 10, color: '#A0A0C8', fontWeight: 600 }}>sessions{m.firstName ? ` — ${m.firstName}` : ''}</div>
              {m.tenureMonths > 0 && (
                <div style={{ fontSize: 9, color: '#606088', marginTop: 2 }}>{m.tenureMonths} month{m.tenureMonths !== 1 ? 's' : ''} enrolled</div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Progress Updates */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 16 }}>
          <Star size={14} style={{ color: '#FFB800' }} />
          <span style={{ fontSize: 13, fontWeight: 700, color: '#E0E0F4' }}>Session Updates</span>
        </div>

        {updatesLoading ? (
          <div style={{ padding: 40, textAlign: 'center' }}><MusicLoader /></div>
        ) : !updates || updates.length === 0 ? (
          <div style={{ padding: '32px 16px', textAlign: 'center', borderRadius: 12, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
            <Music size={24} style={{ color: '#606088', marginBottom: 8 }} />
            <p style={{ fontSize: 13, color: '#8080A8', margin: 0 }}>
              No session updates yet. After your child's next session, their teacher will share a progress note here.
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {updates.map(update => {
              const progressInfo = PROGRESS_DISPLAY[update.progress_indicator ?? '']
              const engagementEmoji = ENGAGEMENT_DISPLAY[update.engagement_level ?? 0]
              return (
                <div key={update.id} style={{ padding: 16, borderRadius: 12, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: '#E0E0F4' }}>{update.student_name}</span>
                      {update.instrument && <span style={{ fontSize: 10, color: '#A0A0C8', background: 'rgba(255,255,255,0.04)', padding: '2px 8px', borderRadius: 4 }}>{getInstrumentEmoji(update.instrument)}</span>}
                    </div>
                    <span style={{ fontSize: 10, color: '#606088' }}>{timeAgo(update.created_at)}</span>
                  </div>
                  <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                    {progressInfo && <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 10px', borderRadius: 6, background: progressInfo.color + '18', color: progressInfo.color }}>{progressInfo.label}</span>}
                    {engagementEmoji && <span style={{ fontSize: 14 }}>{engagementEmoji}</span>}
                    {(update.worked_on?.length ?? 0) > 0 && update.worked_on.slice(0, 3).map(tag => (
                      <span key={tag} style={{ fontSize: 9, color: '#8080A8', background: 'rgba(255,255,255,0.04)', padding: '2px 6px', borderRadius: 4 }}>{tag}</span>
                    ))}
                  </div>
                  <div style={{ fontSize: 13, color: '#C0C0E0', lineHeight: 1.6 }}>{update.body}</div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 }}>
                    <div style={{ fontSize: 10, color: '#606088' }}>— {update.teacher_name}</div>
                    {(update.progress_indicator === 'on_track' || update.progress_indicator === 'crushing_it') && (
                      <button onClick={() => setShareCard(update)} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 12px', borderRadius: 6, fontSize: 10, fontWeight: 700, background: 'rgba(212,34,106,0.08)', color: '#D4226A', border: '1px solid rgba(212,34,106,0.15)', cursor: 'pointer' }}>
                        <Share2 size={11} /> Share
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {shareCard && (shareCard.progress_indicator === 'on_track' || shareCard.progress_indicator === 'crushing_it') && (
        <ShareableProgressCard
          studentFirstName={shareCard.student_name.split(' ')[0]}
          instrument={shareCard.instrument}
          progressIndicator={shareCard.progress_indicator}
          workedOn={shareCard.worked_on}
          locationId={students.find(s => s.id === shareCard.student_id)?.location_id ?? null}
          onClose={() => setShareCard(null)}
        />
      )}
    </div>
  )
}
