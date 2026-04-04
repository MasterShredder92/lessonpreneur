import { useState } from 'react'
import { useAuthContext } from '../../app/AuthContext'
import { supabase } from '../../lib/supabase'
import { useQuery } from '@tanstack/react-query'
import { useFamilyCommunications, type ParentUpdate } from '../../hooks/useParentUpdates'
import MusicLoader from '../../components/shared/MusicLoader'
import ShareableProgressCard from '../../components/shared/ShareableProgressCard'
import { useAvailableRescheduleSlots, useRescheduleSession } from '../../hooks/useDirectorWorkflow'
import { toast } from '../../components/shared/Toast'
import { getInstrumentEmoji } from '../../utils/instrumentEmoji'
import { Music, Star, Share2, RefreshCw } from 'lucide-react'

function formatTime(t: string) {
  const [h, m] = t.split(':')
  const hour = parseInt(h)
  const ampm = hour >= 12 ? 'pm' : 'am'
  const display = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour
  return `${display}:${m}${ampm}`
}

const PROGRESS_DISPLAY: Record<string, { label: string; color: string }> = {
  struggling: { label: 'Working Through It', color: '#EF4444' },
  on_track: { label: 'On Track', color: '#FFB800' },
  crushing_it: { label: 'Crushing It', color: '#22C55E' },
}

const ENGAGEMENT_DISPLAY: Record<number, string> = {
  1: '😴', 2: '😐', 3: '🙂', 4: '😄', 5: '🔥',
}

function timeAgo(dateStr: string): string {
  const now = new Date()
  const d = new Date(dateStr)
  const diffMs = now.getTime() - d.getTime()
  const diffMin = Math.floor(diffMs / 60000)
  if (diffMin < 60) return `${diffMin}m ago`
  const diffHrs = Math.floor(diffMin / 60)
  if (diffHrs < 24) return `${diffHrs}h ago`
  const diffDays = Math.floor(diffHrs / 24)
  if (diffDays === 1) return 'Yesterday'
  if (diffDays < 7) return `${diffDays} days ago`
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export default function ParentDashboard() {
  const { profile } = useAuthContext()

  // Get the parent's family ID from their email
  const { data: familyId } = useQuery({
    queryKey: ['parent-family-id', profile?.id],
    enabled: !!profile?.email,
    queryFn: async () => {
      const { data } = await supabase
        .from('families')
        .select('id')
        .ilike('primary_email', profile!.email!)
        .limit(1)
        .single()
      return data?.id ?? null
    },
  })

  // Get family's students
  const { data: students } = useQuery({
    queryKey: ['parent-students', familyId],
    enabled: !!familyId,
    queryFn: async () => {
      const { data } = await supabase
        .from('students')
        .select('id, first_name, last_name, instrument, status, teacher_id, location_id')
        .eq('family_id', familyId!)
        .eq('status', 'active')
        .order('first_name')

      if (!data || data.length === 0) return []

      // Get teacher names
      const teacherIds = [...new Set(data.map(s => s.teacher_id).filter(Boolean))]
      const teacherMap = new Map<string, string>()
      if (teacherIds.length > 0) {
        const { data: teachers } = await supabase
          .from('teachers')
          .select('id, first_name, last_name')
          .in('id', teacherIds)
        teachers?.forEach((t: any) => teacherMap.set(t.id, `${t.first_name} ${t.last_name}`.trim()))
      }

      return data.map((s: any) => ({
        ...s,
        teacher_name: s.teacher_id ? teacherMap.get(s.teacher_id) ?? null : null,
      }))
    },
  })

  // Get milestones: session count + tenure per student
  const { data: milestones } = useQuery({
    queryKey: ['parent-milestones', familyId],
    enabled: !!familyId && !!students && students.length > 0,
    queryFn: async () => {
      const studentIds = (students ?? []).map(s => s.id)
      if (studentIds.length === 0) return []

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
      const lastDateByStudent = new Map<string, string>()
      logs?.forEach((l: any) => {
        countByStudent.set(l.student_id, (countByStudent.get(l.student_id) ?? 0) + 1)
        if (!lastDateByStudent.has(l.student_id)) lastDateByStudent.set(l.student_id, l.block_date)
      })

      return (studentRows ?? []).map((s: any) => {
        const totalSessions = countByStudent.get(s.id) ?? 0
        const enrolled = new Date(s.created_at)
        const tenureDays = Math.floor((Date.now() - enrolled.getTime()) / 86400000)
        const tenureMonths = Math.floor(tenureDays / 30)
        return { id: s.id, firstName: s.first_name, totalSessions, tenureMonths }
      })
    },
  })

  // Get upcoming sessions
  const { data: upcomingSessions } = useQuery({
    queryKey: ['parent-upcoming', familyId],
    enabled: !!familyId && !!students && students.length > 0,
    queryFn: async () => {
      const studentIds = (students ?? []).map(s => s.id)
      if (studentIds.length === 0) return []
      const today = new Date().toISOString().split('T')[0]
      const twoWeeks = new Date()
      twoWeeks.setDate(twoWeeks.getDate() + 14)
      const { data } = await supabase
        .from('schedule_blocks')
        .select('id, student_id, block_date, start_time, end_time, teacher_id, block_type')
        .in('student_id', studentIds)
        .gte('block_date', today)
        .lte('block_date', twoWeeks.toISOString().split('T')[0])
        .in('block_type', ['student_session', 'first_day'])
        .order('block_date')
        .order('start_time')
        .limit(10)

      if (!data || data.length === 0) return []

      const teacherIds = [...new Set(data.map(b => b.teacher_id).filter(Boolean))]
      const tMap = new Map<string, string>()
      if (teacherIds.length > 0) {
        const { data: teachers } = await supabase.from('teachers').select('id, first_name').in('id', teacherIds)
        teachers?.forEach((t: any) => tMap.set(t.id, t.first_name))
      }

      const sMap = new Map((students ?? []).map(s => [s.id, s.first_name]))

      return data.map((b: any) => ({
        id: b.id,
        studentName: sMap.get(b.student_id) ?? '',
        date: b.block_date,
        startTime: b.start_time,
        teacherName: tMap.get(b.teacher_id) ?? '',
        isFirstDay: b.block_type === 'first_day',
      }))
    },
  })

  // Get communications for the family
  const { data: updates, isLoading } = useFamilyCommunications(familyId ?? undefined)
  const [shareCard, setShareCard] = useState<ParentUpdate | null>(null)

  const parentFirst = profile?.first_name ?? 'there'

  if (!profile) {
    return <div className="page" style={{ padding: 40, textAlign: 'center' }}><MusicLoader /></div>
  }

  return (
    <div className="page" style={{ maxWidth: 540, margin: '0 auto', padding: '16px' }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: '#E0E0F4', margin: 0 }}>
          Hi, {parentFirst}
        </h1>
        <p style={{ fontSize: 13, color: '#8080A8', marginTop: 4 }}>
          Here's how your {students && students.length > 1 ? 'kids are' : 'child is'} doing.
        </p>
      </div>

      {/* Student cards */}
      {students && students.length > 0 && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 24, overflowX: 'auto' }}>
          {students.map((s: any) => (
            <div key={s.id} style={{
              padding: '14px 16px', borderRadius: 12, minWidth: 140, flex: '0 0 auto',
              background: 'rgba(212,34,106,0.04)', border: '1px solid rgba(212,34,106,0.12)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <Music size={14} style={{ color: '#D4226A' }} />
                <span style={{ fontSize: 14, fontWeight: 700, color: '#E0E0F4' }}>{s.first_name}</span>
              </div>
              <div style={{ fontSize: 11, color: '#A0A0C8' }}>
                {s.instrument && <div title={s.instrument}>{getInstrumentEmoji(s.instrument)} {s.instrument.charAt(0).toUpperCase() + s.instrument.slice(1)}</div>}
                {s.teacher_name && <div style={{ marginTop: 2 }}>with {s.teacher_name}</div>}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Milestones */}
      {milestones && milestones.some(m => m.totalSessions > 0) && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {milestones.filter(m => m.totalSessions > 0).map(m => (
              <div key={m.id} style={{
                padding: '10px 14px', borderRadius: 10, flex: '1 0 140px',
                background: 'rgba(255,184,0,0.04)', border: '1px solid rgba(255,184,0,0.1)',
                textAlign: 'center',
              }}>
                <div style={{ fontSize: 22, fontWeight: 800, color: '#FFB800' }}>{m.totalSessions}</div>
                <div style={{ fontSize: 10, color: '#A0A0C8', fontWeight: 600 }}>
                  sessions{m.firstName ? ` — ${m.firstName}` : ''}
                </div>
                {m.tenureMonths > 0 && (
                  <div style={{ fontSize: 9, color: '#606088', marginTop: 2 }}>
                    {m.tenureMonths} month{m.tenureMonths !== 1 ? 's' : ''} enrolled
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Upcoming Sessions + Self-Service Rescheduling */}
      {upcomingSessions && upcomingSessions.length > 0 && (
        <UpcomingSessions
          sessions={upcomingSessions}
          students={students ?? []}
        />
      )}

      {/* Progress Updates */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 16 }}>
          <Star size={14} style={{ color: '#FFB800' }} />
          <span style={{ fontSize: 13, fontWeight: 700, color: '#E0E0F4' }}>Session Updates</span>
        </div>

        {isLoading ? (
          <div style={{ padding: 40, textAlign: 'center' }}><MusicLoader /></div>
        ) : !updates || updates.length === 0 ? (
          <div style={{
            padding: '32px 16px', textAlign: 'center', borderRadius: 12,
            background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)',
          }}>
            <Music size={24} style={{ color: '#606088', marginBottom: 8 }} />
            <p style={{ fontSize: 13, color: '#8080A8', margin: 0 }}>
              No session updates yet. After your child's next lesson, their teacher will share a progress note here.
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {updates.map(update => (
              <ProgressUpdateCard key={update.id} update={update} onShare={setShareCard} />
            ))}
          </div>
        )}
      </div>

      {/* Shareable progress card modal */}
      {shareCard && (shareCard.progress_indicator === 'on_track' || shareCard.progress_indicator === 'crushing_it') && (
        <ShareableProgressCard
          studentFirstName={shareCard.student_name.split(' ')[0]}
          instrument={shareCard.instrument}
          progressIndicator={shareCard.progress_indicator}
          workedOn={shareCard.worked_on}
          locationId={students?.find((s: any) => s.id === shareCard.student_id)?.location_id ?? null}
          onClose={() => setShareCard(null)}
        />
      )}
    </div>
  )
}

function ProgressUpdateCard({ update, onShare }: { update: ParentUpdate; onShare: (u: ParentUpdate) => void }) {
  const progressInfo = PROGRESS_DISPLAY[update.progress_indicator ?? '']
  const engagementEmoji = ENGAGEMENT_DISPLAY[update.engagement_level ?? 0]

  return (
    <div style={{
      padding: '16px', borderRadius: 12,
      background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: '#E0E0F4' }}>{update.student_name}</span>
          {update.instrument && (
            <span title={update.instrument} style={{ fontSize: 10, color: '#A0A0C8', background: 'rgba(255,255,255,0.04)', padding: '2px 8px', borderRadius: 4 }}>
              {getInstrumentEmoji(update.instrument)}
            </span>
          )}
        </div>
        <span style={{ fontSize: 10, color: '#606088' }}>{timeAgo(update.created_at)}</span>
      </div>

      {/* Progress + engagement badges */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
        {progressInfo && (
          <span style={{
            fontSize: 10, fontWeight: 700, padding: '3px 10px', borderRadius: 6,
            background: progressInfo.color + '18', color: progressInfo.color,
          }}>
            {progressInfo.label}
          </span>
        )}
        {engagementEmoji && (
          <span style={{ fontSize: 14 }}>{engagementEmoji}</span>
        )}
        {(update.worked_on?.length ?? 0) > 0 && (
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {update.worked_on.slice(0, 3).map(tag => (
              <span key={tag} style={{ fontSize: 9, color: '#8080A8', background: 'rgba(255,255,255,0.04)', padding: '2px 6px', borderRadius: 4 }}>
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* AI-generated body */}
      <div style={{ fontSize: 13, color: '#C0C0E0', lineHeight: 1.6 }}>
        {update.body}
      </div>

      {/* Teacher attribution + share button */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 }}>
        <div style={{ fontSize: 10, color: '#606088' }}>
          — {update.teacher_name}
        </div>
        {(update.progress_indicator === 'on_track' || update.progress_indicator === 'crushing_it') && (
          <button
            onClick={() => onShare(update)}
            style={{
              display: 'flex', alignItems: 'center', gap: 5,
              padding: '5px 12px', borderRadius: 6, fontSize: 10, fontWeight: 700,
              background: 'rgba(212,34,106,0.08)', color: '#D4226A',
              border: '1px solid rgba(212,34,106,0.15)', cursor: 'pointer',
            }}
          >
            <Share2 size={11} /> Share
          </button>
        )}
      </div>
    </div>
  )
}

// ─── Upcoming Sessions with Self-Service Reschedule ──

function UpcomingSessions({ sessions, students }: { sessions: any[]; students: any[] }) {
  const [rescheduleId, setRescheduleId] = useState<string | null>(null)
  const rescheduleSession = useRescheduleSession()

  // Find the student_id for the active reschedule block
  const activeSession = sessions.find(s => s.id === rescheduleId)
  const studentForReschedule = activeSession ? students.find((st: any) => st.first_name === activeSession.studentName) : null
  const { data: slots } = useAvailableRescheduleSlots(studentForReschedule?.id, rescheduleId ?? undefined)

  const handleReschedule = async (newBlockId: string) => {
    if (!rescheduleId || !studentForReschedule) return
    try {
      await rescheduleSession.mutateAsync({
        currentBlockId: rescheduleId,
        newBlockId,
        studentId: studentForReschedule.id,
      })
      toast('Session rescheduled!', 'success')
      setRescheduleId(null)
    } catch (err: any) {
      toast(err.message ?? 'Could not reschedule', 'error')
    }
  }

  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: '#E0E0F4', marginBottom: 10 }}>Upcoming Sessions</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {sessions.map((s: any) => (
          <div key={s.id}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px',
              borderRadius: rescheduleId === s.id ? '8px 8px 0 0' : 8,
              background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)',
              borderBottom: rescheduleId === s.id ? 'none' : undefined,
            }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#D4226A', textAlign: 'center', minWidth: 48 }}>
                {new Date(s.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#E0E0F4' }}>{s.studentName}</div>
                <div style={{ fontSize: 10, color: '#8080A8' }}>
                  {formatTime(s.startTime)}{s.teacherName ? ` with ${s.teacherName}` : ''}
                  {s.isFirstDay && <span style={{ color: '#38BDF8', marginLeft: 6 }}>First Day!</span>}
                </div>
              </div>
              {!s.isFirstDay && (
                <button onClick={() => setRescheduleId(rescheduleId === s.id ? null : s.id)} style={{
                  display: 'flex', alignItems: 'center', gap: 4, padding: '3px 8px', borderRadius: 4,
                  fontSize: 9, fontWeight: 600, cursor: 'pointer',
                  background: rescheduleId === s.id ? 'rgba(212,34,106,0.12)' : 'rgba(255,255,255,0.04)',
                  color: rescheduleId === s.id ? '#D4226A' : '#606088',
                  border: `1px solid ${rescheduleId === s.id ? 'rgba(212,34,106,0.2)' : 'rgba(255,255,255,0.06)'}`,
                }}>
                  <RefreshCw size={9} /> Reschedule
                </button>
              )}
            </div>
            {rescheduleId === s.id && (
              <div style={{
                padding: '10px 12px', borderRadius: '0 0 8px 8px',
                background: 'rgba(212,34,106,0.03)', border: '1px solid rgba(255,255,255,0.04)', borderTop: 'none',
              }}>
                {!slots || slots.length === 0 ? (
                  <div style={{ fontSize: 11, color: '#8080A8' }}>No open slots available this week. Contact the studio to reschedule.</div>
                ) : (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {slots.map(slot => (
                      <button key={slot.blockId} onClick={() => handleReschedule(slot.blockId)}
                        disabled={rescheduleSession.isPending}
                        style={{
                          padding: '6px 12px', borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: 'pointer',
                          background: 'rgba(34,197,94,0.08)', color: '#22C55E', border: '1px solid rgba(34,197,94,0.2)',
                        }}>
                        {new Date(slot.blockDate + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })} {formatTime(slot.startTime)}
                      </button>
                    ))}
                  </div>
                )}
                <div style={{ fontSize: 9, color: '#606088', marginTop: 6 }}>Max 2 reschedules per month · 24h advance required</div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
