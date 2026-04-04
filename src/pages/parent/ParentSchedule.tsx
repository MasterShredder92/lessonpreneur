import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useParentFamily } from '../../hooks/useParentFamily'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import MusicLoader from '../../components/shared/MusicLoader'
import { Calendar } from 'lucide-react'
import MessageStudioButton from '../../components/parent/MessageStudioButton'
import { getInstrumentEmoji } from '../../utils/instrumentEmoji'

function formatTime(t: string) {
  const [h, m] = t.split(':')
  const hour = parseInt(h)
  const ampm = hour >= 12 ? 'pm' : 'am'
  const display = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour
  return `${display}:${m}${ampm}`
}

type Timeframe = 'upcoming' | 'past'

export default function ParentSchedule() {
  const { familyId, students, isLoading } = useParentFamily()
  const [searchParams] = useSearchParams()
  const urlStudent = searchParams.get('student')

  const [studentFilter, setStudentFilter] = useState<string>(urlStudent ?? 'all')
  const [teacherFilter, setTeacherFilter] = useState<string>('all')
  const [timeframe, setTimeframe] = useState<Timeframe>('upcoming')

  // Keep state in sync if URL param changes
  useEffect(() => {
    if (urlStudent) setStudentFilter(urlStudent)
  }, [urlStudent])

  const { data: sessions } = useQuery({
    queryKey: ['parent-sessions', familyId, timeframe],
    enabled: !!familyId && students.length > 0,
    queryFn: async () => {
      const studentIds = students.map(s => s.id)
      const today = new Date().toISOString().split('T')[0]
      let fromDate: string
      let toDate: string
      if (timeframe === 'upcoming') {
        fromDate = today
        const end = new Date()
        end.setDate(end.getDate() + 56) // 8 weeks
        toDate = end.toISOString().split('T')[0]
      } else {
        const start = new Date()
        start.setDate(start.getDate() - 28) // 4 weeks back
        fromDate = start.toISOString().split('T')[0]
        toDate = today
      }
      const { data } = await supabase
        .from('schedule_blocks')
        .select('id, student_id, block_date, start_time, end_time, teacher_id, block_type')
        .in('student_id', studentIds)
        .gte('block_date', fromDate)
        .lte('block_date', toDate)
        .in('block_type', ['student_session', 'first_day'])
        .order('block_date', { ascending: timeframe === 'upcoming' })
        .order('start_time')
        .limit(60)

      if (!data || data.length === 0) return []

      const teacherIds = [...new Set(data.map(b => b.teacher_id).filter(Boolean))]
      const tMap = new Map<string, string>()
      if (teacherIds.length > 0) {
        const { data: teachers } = await supabase.from('teachers').select('id, first_name').in('id', teacherIds)
        teachers?.forEach((t: any) => tMap.set(t.id, t.first_name))
      }
      const sMap = new Map(students.map(s => [s.id, { first_name: s.first_name, instrument: s.instrument }]))

      return data.map((b: any) => ({
        id: b.id,
        studentId: b.student_id,
        studentName: sMap.get(b.student_id)?.first_name ?? '',
        instrument: sMap.get(b.student_id)?.instrument ?? null,
        teacherId: b.teacher_id,
        date: b.block_date,
        startTime: b.start_time,
        teacherName: tMap.get(b.teacher_id) ?? '',
        isFirstDay: b.block_type === 'first_day',
      }))
    },
  })

  // Unique teachers present in the loaded sessions
  const teacherOptions = Array.from(
    new Map((sessions ?? []).filter(s => s.teacherId).map(s => [s.teacherId as string, s.teacherName])).entries()
  ).map(([id, name]) => ({ id, name }))

  const filtered = (sessions ?? []).filter(s => {
    if (studentFilter !== 'all' && s.studentId !== studentFilter) return false
    if (teacherFilter !== 'all' && s.teacherId !== teacherFilter) return false
    return true
  })

  if (isLoading) return <div style={{ padding: 40, textAlign: 'center' }}><MusicLoader /></div>

  return (
    <div style={{ maxWidth: 540, margin: '0 auto', padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, margin: '0 0 16px' }}>
        <h1 style={{ fontSize: 20, fontWeight: 800, color: '#E0E0F4', margin: 0 }}>Schedule</h1>
        <MessageStudioButton variant="compact" />
      </div>

      {/* Timeframe toggle */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
        <TimeframeBtn label="Upcoming" active={timeframe === 'upcoming'} onClick={() => setTimeframe('upcoming')} />
        <TimeframeBtn label="Past" active={timeframe === 'past'} onClick={() => setTimeframe('past')} />
      </div>

      {/* Student + Teacher filters */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <FilterSelect
          value={studentFilter}
          onChange={setStudentFilter}
          options={[{ value: 'all', label: 'All Students' }, ...students.map(s => ({ value: s.id, label: s.first_name }))]}
        />
        <FilterSelect
          value={teacherFilter}
          onChange={setTeacherFilter}
          options={[{ value: 'all', label: 'All Teachers' }, ...teacherOptions.map(t => ({ value: t.id, label: t.name }))]}
        />
      </div>

      {filtered.length === 0 ? (
        <div style={{ padding: '40px 16px', textAlign: 'center', borderRadius: 12, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
          <Calendar size={28} style={{ color: '#606088', marginBottom: 8 }} />
          <p style={{ fontSize: 13, color: '#8080A8', margin: 0 }}>
            {timeframe === 'upcoming' ? 'No upcoming sessions match these filters.' : 'No past sessions match these filters.'}
          </p>
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {filtered.map(s => (
              <div key={s.id} style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
                borderRadius: 10,
                background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)',
              }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#D4226A', textAlign: 'center', minWidth: 48 }}>
                  {new Date(s.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#E0E0F4', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 15 }}>{getInstrumentEmoji(s.instrument)}</span>
                    {s.studentName}
                  </div>
                  <div style={{ fontSize: 11, color: '#8080A8' }}>
                    {formatTime(s.startTime)}{s.teacherName ? ` with ${s.teacherName}` : ''}
                    {s.isFirstDay && <span style={{ color: '#38BDF8', marginLeft: 6 }}>First Day!</span>}
                  </div>
                </div>
              </div>
            ))}
          </div>
          {timeframe === 'upcoming' && (
            <div style={{
              marginTop: 14, padding: '10px 12px', borderRadius: 8,
              background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)',
              fontSize: 11, color: '#8080A8', textAlign: 'center',
            }}>
              To reschedule, contact your studio.
            </div>
          )}
        </>
      )}
    </div>
  )
}

function TimeframeBtn({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        flex: 1, minHeight: 36, padding: '0 14px', borderRadius: 8, cursor: 'pointer',
        background: active ? 'rgba(212,34,106,0.12)' : 'rgba(255,255,255,0.03)',
        border: `1px solid ${active ? 'rgba(212,34,106,0.3)' : 'rgba(255,255,255,0.06)'}`,
        color: active ? '#D4226A' : '#8080A8',
        fontSize: 12, fontWeight: 700,
        WebkitTapHighlightColor: 'transparent',
      }}
    >
      {label}
    </button>
  )
}

function FilterSelect({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      style={{
        flex: 1, minHeight: 36, padding: '0 10px', borderRadius: 8,
        background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)',
        color: '#E0E0F4', fontSize: 12, fontWeight: 600, fontFamily: 'inherit',
        outline: 'none', cursor: 'pointer',
      }}
    >
      {options.map(o => <option key={o.value} value={o.value} style={{ background: '#0c0b16' }}>{o.label}</option>)}
    </select>
  )
}
