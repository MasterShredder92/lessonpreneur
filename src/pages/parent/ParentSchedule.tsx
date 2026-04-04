import { useSearchParams } from 'react-router-dom'
import { useParentFamily } from '../../hooks/useParentFamily'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import MusicLoader from '../../components/shared/MusicLoader'
import { Calendar } from 'lucide-react'
import MessageStudioButton from '../../components/parent/MessageStudioButton'

function formatTime(t: string) {
  const [h, m] = t.split(':')
  const hour = parseInt(h)
  const ampm = hour >= 12 ? 'pm' : 'am'
  const display = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour
  return `${display}:${m}${ampm}`
}

export default function ParentSchedule() {
  const { familyId, students, isLoading } = useParentFamily()
  const [searchParams] = useSearchParams()
  const studentFilter = searchParams.get('student')

  const { data: sessions } = useQuery({
    queryKey: ['parent-upcoming', familyId, studentFilter],
    enabled: !!familyId && students.length > 0,
    queryFn: async () => {
      const studentIds = (studentFilter ? students.filter(s => s.id === studentFilter) : students).map(s => s.id)
      if (studentIds.length === 0) return []
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

  if (isLoading) return <div style={{ padding: 40, textAlign: 'center' }}><MusicLoader /></div>

  return (
    <div style={{ maxWidth: 540, margin: '0 auto', padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, margin: '0 0 20px' }}>
        <h1 style={{ fontSize: 20, fontWeight: 800, color: '#E0E0F4', margin: 0 }}>Schedule</h1>
        <MessageStudioButton variant="compact" />
      </div>

      {!sessions || sessions.length === 0 ? (
        <div style={{ padding: '40px 16px', textAlign: 'center', borderRadius: 12, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
          <Calendar size={28} style={{ color: '#606088', marginBottom: 8 }} />
          <p style={{ fontSize: 13, color: '#8080A8', margin: 0 }}>No upcoming sessions in the next 4 weeks.</p>
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {sessions.map(s => (
              <div key={s.id} style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
                borderRadius: 10,
                background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)',
              }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#D4226A', textAlign: 'center', minWidth: 48 }}>
                  {new Date(s.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#E0E0F4' }}>{s.studentName}</div>
                  <div style={{ fontSize: 11, color: '#8080A8' }}>
                    {formatTime(s.startTime)}{s.teacherName ? ` with ${s.teacherName}` : ''}
                    {s.isFirstDay && <span style={{ color: '#38BDF8', marginLeft: 6 }}>First Day!</span>}
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div style={{
            marginTop: 14, padding: '10px 12px', borderRadius: 8,
            background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)',
            fontSize: 11, color: '#8080A8', textAlign: 'center',
          }}>
            To reschedule, contact your studio.
          </div>
        </>
      )}
    </div>
  )
}
