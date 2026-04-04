import { useState } from 'react'
import { useParentFamily } from '../../hooks/useParentFamily'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { useAvailableRescheduleSlots, useRescheduleSession } from '../../hooks/useDirectorWorkflow'
import { toast } from '../../components/shared/Toast'
import MusicLoader from '../../components/shared/MusicLoader'
import { RefreshCw, Calendar } from 'lucide-react'

function formatTime(t: string) {
  const [h, m] = t.split(':')
  const hour = parseInt(h)
  const ampm = hour >= 12 ? 'pm' : 'am'
  const display = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour
  return `${display}:${m}${ampm}`
}

export default function ParentSchedule() {
  const { familyId, students, isLoading } = useParentFamily()
  const [rescheduleId, setRescheduleId] = useState<string | null>(null)
  const rescheduleSession = useRescheduleSession()

  const { data: sessions } = useQuery({
    queryKey: ['parent-upcoming', familyId],
    enabled: !!familyId && students.length > 0,
    queryFn: async () => {
      const studentIds = students.map(s => s.id)
      const today = new Date().toISOString().split('T')[0]
      const fourWeeks = new Date()
      fourWeeks.setDate(fourWeeks.getDate() + 28)
      const { data } = await supabase
        .from('schedule_blocks')
        .select('id, student_id, block_date, start_time, end_time, teacher_id, block_type')
        .in('student_id', studentIds)
        .gte('block_date', today)
        .lte('block_date', fourWeeks.toISOString().split('T')[0])
        .in('block_type', ['student_session', 'first_day'])
        .order('block_date')
        .order('start_time')
        .limit(20)

      if (!data || data.length === 0) return []

      const teacherIds = [...new Set(data.map(b => b.teacher_id).filter(Boolean))]
      const tMap = new Map<string, string>()
      if (teacherIds.length > 0) {
        const { data: teachers } = await supabase.from('teachers').select('id, first_name').in('id', teacherIds)
        teachers?.forEach((t: any) => tMap.set(t.id, t.first_name))
      }
      const sMap = new Map(students.map(s => [s.id, s.first_name]))

      return data.map((b: any) => ({
        id: b.id,
        studentId: b.student_id,
        studentName: sMap.get(b.student_id) ?? '',
        date: b.block_date,
        startTime: b.start_time,
        teacherName: tMap.get(b.teacher_id) ?? '',
        isFirstDay: b.block_type === 'first_day',
      }))
    },
  })

  const activeSession = sessions?.find(s => s.id === rescheduleId)
  const studentForReschedule = activeSession ? students.find(st => st.first_name === activeSession.studentName) : null
  const { data: slots } = useAvailableRescheduleSlots(studentForReschedule?.id, rescheduleId ?? undefined)

  const handleReschedule = async (newBlockId: string) => {
    if (!rescheduleId || !studentForReschedule) return
    try {
      await rescheduleSession.mutateAsync({ currentBlockId: rescheduleId, newBlockId, studentId: studentForReschedule.id })
      toast('Session rescheduled!', 'success')
      setRescheduleId(null)
    } catch (err: any) {
      toast(err.message ?? 'Could not reschedule', 'error')
    }
  }

  if (isLoading) return <div style={{ padding: 40, textAlign: 'center' }}><MusicLoader /></div>

  return (
    <div style={{ maxWidth: 540, margin: '0 auto', padding: 16 }}>
      <h1 style={{ fontSize: 20, fontWeight: 800, color: '#E0E0F4', margin: '0 0 20px' }}>Schedule</h1>

      {!sessions || sessions.length === 0 ? (
        <div style={{ padding: '40px 16px', textAlign: 'center', borderRadius: 12, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
          <Calendar size={28} style={{ color: '#606088', marginBottom: 8 }} />
          <p style={{ fontSize: 13, color: '#8080A8', margin: 0 }}>No upcoming sessions in the next 4 weeks.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {sessions.map(s => (
            <div key={s.id}>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
                borderRadius: rescheduleId === s.id ? '10px 10px 0 0' : 10,
                background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)',
                borderBottom: rescheduleId === s.id ? 'none' : undefined,
              }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#D4226A', textAlign: 'center', minWidth: 48 }}>
                  {new Date(s.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#E0E0F4' }}>{s.studentName}</div>
                  <div style={{ fontSize: 11, color: '#8080A8' }}>
                    {formatTime(s.startTime)}{s.teacherName ? ` with ${s.teacherName}` : ''}
                    {s.isFirstDay && <span style={{ color: '#38BDF8', marginLeft: 6 }}>First Day!</span>}
                  </div>
                </div>
                {!s.isFirstDay && (
                  <button onClick={() => setRescheduleId(rescheduleId === s.id ? null : s.id)} style={{
                    display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', borderRadius: 6,
                    fontSize: 10, fontWeight: 600, cursor: 'pointer',
                    background: rescheduleId === s.id ? 'rgba(212,34,106,0.12)' : 'rgba(255,255,255,0.04)',
                    color: rescheduleId === s.id ? '#D4226A' : '#606088',
                    border: `1px solid ${rescheduleId === s.id ? 'rgba(212,34,106,0.2)' : 'rgba(255,255,255,0.06)'}`,
                  }}>
                    <RefreshCw size={10} /> Reschedule
                  </button>
                )}
              </div>
              {rescheduleId === s.id && (
                <div style={{ padding: '10px 12px', borderRadius: '0 0 10px 10px', background: 'rgba(212,34,106,0.03)', border: '1px solid rgba(255,255,255,0.04)', borderTop: 'none' }}>
                  {!slots || slots.length === 0 ? (
                    <div style={{ fontSize: 11, color: '#8080A8' }}>No open slots available this week. Contact the studio to reschedule.</div>
                  ) : (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {slots.map(slot => (
                        <button key={slot.blockId} onClick={() => handleReschedule(slot.blockId)}
                          disabled={rescheduleSession.isPending}
                          style={{ padding: '6px 12px', borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: 'pointer', background: 'rgba(34,197,94,0.08)', color: '#22C55E', border: '1px solid rgba(34,197,94,0.2)' }}>
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
      )}
    </div>
  )
}
