import { useState, useEffect, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useParentFamily } from '../../hooks/useParentFamily'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import MusicLoader from '../../components/shared/MusicLoader'
import { Calendar, PhoneOff } from 'lucide-react'
import MessageStudioButton from '../../components/parent/MessageStudioButton'
import CallOutModal from '../../components/parent/CallOutModal'
import { useStudioClosures } from '../../hooks/useFamilyCallout'
import { useLogBlockedCallout } from '../../hooks/useFamilyCallout'
import { toast } from '../../components/shared/Toast'
import { getInstrumentEmoji } from '../../utils/instrumentEmoji'
import { useAuthContext } from '../../app/AuthContext'

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
  const { tenantId } = useAuthContext()
  const [searchParams] = useSearchParams()
  const urlStudent = searchParams.get('student')

  const [studentFilter, setStudentFilter] = useState<string>(urlStudent ?? 'all')
  const [teacherFilter, setTeacherFilter] = useState<string>('all')
  const [timeframe, setTimeframe] = useState<Timeframe>('upcoming')

  // Call-out modal state
  const [callOutTarget, setCallOutTarget] = useState<{
    blockId: string; studentId: string; date: string
  } | null>(null)

  // Family name (for alerts/notifications)
  const { data: familyName } = useQuery({
    queryKey: ['parent-family-name', familyId],
    enabled: !!familyId,
    queryFn: async () => {
      const { data } = await supabase.from('families').select('name').eq('id', familyId!).single()
      return data?.name ?? ''
    },
  })

  // Studio closures for all family-student locations
  const locationIds = useMemo(() => [...new Set(students.map(s => s.location_id))], [students])
  const { data: closures } = useStudioClosures(tenantId, locationIds)

  // Index closures by date (any closure for any location the family touches counts)
  const closureByDate = useMemo(() => {
    const map = new Map<string, { label: string; emoji: string | null }>()
    ;(closures ?? []).forEach(c => {
      map.set(c.closure_date, { label: c.label, emoji: c.emoji })
    })
    return map
  }, [closures])

  const logBlocked = useLogBlockedCallout()

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
        .select('id, student_id, block_date, start_time, end_time, teacher_id, block_type, location_id, is_family_callout, callout_id, is_makeup_session, makeup_session_id')
        .in('student_id', studentIds)
        .gte('block_date', fromDate)
        .lte('block_date', toDate)
        .in('block_type', ['student_session', 'first_day', 'call_out', 'makeup_session'])
        .order('block_date', { ascending: timeframe === 'upcoming' })
        .order('start_time')
        .limit(80)

      if (!data || data.length === 0) return []

      // Fetch callouts → makeup date mapping for any called-out block in the list
      const calloutIds = [...new Set(data.filter((b: any) => b.callout_id).map((b: any) => b.callout_id))] as string[]
      const calloutToMakeupDate = new Map<string, string>()
      if (calloutIds.length > 0) {
        const { data: callouts } = await supabase
          .from('student_callouts')
          .select('id, makeup_session_id')
          .in('id', calloutIds)
        const makeupIds = (callouts ?? []).map((c: any) => c.makeup_session_id).filter(Boolean) as string[]
        if (makeupIds.length > 0) {
          const { data: makeups } = await supabase
            .from('makeup_sessions')
            .select('id, scheduled_date')
            .in('id', makeupIds)
          const mMap = new Map((makeups ?? []).map((m: any) => [m.id, m.scheduled_date]))
          ;(callouts ?? []).forEach((c: any) => {
            const dt = c.makeup_session_id ? mMap.get(c.makeup_session_id) : null
            if (dt) calloutToMakeupDate.set(c.id, dt as string)
          })
        }
      }

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
        endTime: b.end_time,
        locationId: b.location_id,
        teacherName: tMap.get(b.teacher_id) ?? '',
        isFirstDay: b.block_type === 'first_day',
        isCalledOut: b.block_type === 'call_out' && Boolean(b.is_family_callout),
        isMakeup: b.block_type === 'makeup_session',
        makeupDate: b.callout_id ? (calloutToMakeupDate.get(b.callout_id) ?? null) : null,
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

  const handleCallOutClick = (session: { id: string; studentId: string; date: string; startTime: string }) => {
    // 60-minute cutoff check
    const sessionStart = new Date(`${session.date}T${session.startTime}`)
    const minutesUntil = (sessionStart.getTime() - Date.now()) / 60000
    if (minutesUntil < 60) {
      // Log the blocked attempt + toast
      logBlocked.mutate({
        student_id: session.studentId,
        family_id: familyId!,
        location_id: (sessions ?? []).find(s => s.id === session.id)?.locationId ?? '',
        callout_date: session.date,
        schedule_block_id: session.id,
      })
      toast("Less than 1 hour — please text the studio", 'warning')
      return
    }
    setCallOutTarget({ blockId: session.id, studentId: session.studentId, date: session.date })
  }

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
            {filtered.map(s => {
              const closure = closureByDate.get(s.date)
              const sessionStart = new Date(`${s.date}T${s.startTime}`)
              const minutesUntil = (sessionStart.getTime() - Date.now()) / 60000
              const within60 = minutesUntil >= 0 && minutesUntil < 60
              const isPast = minutesUntil < 0
              const canCallOut = timeframe === 'upcoming' && !closure && !within60 && !isPast && !s.isCalledOut

              return (
                <div
                  key={s.id}
                  id={`parent-session-${s.id}`}
                  data-makeup-date={s.isMakeup ? s.date : undefined}
                  data-student={s.studentId}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
                    borderRadius: 10,
                    background: s.isMakeup
                      ? 'rgba(255,107,107,0.06)'
                      : closure ? 'rgba(255,184,0,0.04)' : 'rgba(255,255,255,0.02)',
                    border: `1px solid ${s.isMakeup ? 'rgba(255,107,107,0.3)' : closure ? 'rgba(255,184,0,0.15)' : 'rgba(255,255,255,0.04)'}`,
                    opacity: s.isCalledOut ? 0.55 : 1,
                    transition: 'box-shadow 200ms',
                  }}
                >
                  <div style={{
                    fontSize: 11, fontWeight: 700,
                    color: s.isMakeup ? '#FF6B6B' : '#D4226A',
                    textAlign: 'center', minWidth: 48,
                  }}>
                    {new Date(s.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#E0E0F4', display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontSize: 15 }}>{getInstrumentEmoji(s.instrument)}</span>
                      {s.studentName}
                      {s.isMakeup && (
                        <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 7px', borderRadius: 6, background: 'rgba(255,107,107,0.18)', color: '#FF6B6B', border: '1px solid rgba(255,107,107,0.35)' }}>
                          Makeup 🌺
                        </span>
                      )}
                      {s.isCalledOut && (
                        <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 7px', borderRadius: 6, background: 'rgba(160,160,200,0.1)', color: '#8080A8' }}>
                          Called Out ✓
                        </span>
                      )}
                    </div>
                    <div style={{
                      fontSize: 11, color: '#8080A8',
                      textDecoration: s.isCalledOut ? 'line-through' : 'none',
                    }}>
                      {formatTime(s.startTime)}{s.teacherName ? ` with ${s.teacherName}` : ''}
                      {s.isFirstDay && <span style={{ color: '#38BDF8', marginLeft: 6 }}>First Day!</span>}
                    </div>
                    {s.isCalledOut && s.makeupDate && (
                      <button
                        onClick={() => {
                          const element = document.querySelector<HTMLElement>(`[data-makeup-date="${s.makeupDate}"][data-student="${s.studentId}"]`)
                          if (element) {
                            element.scrollIntoView({ behavior: 'smooth', block: 'center' })
                            element.style.boxShadow = '0 0 0 2px rgba(255,107,107,0.5)'
                            setTimeout(() => { element.style.boxShadow = '' }, 1500)
                          }
                        }}
                        style={{
                          fontSize: 11, fontWeight: 700, color: '#FF6B6B',
                          marginTop: 4, padding: 0, background: 'none', border: 'none',
                          cursor: 'pointer', textAlign: 'left',
                          textDecoration: 'underline', textUnderlineOffset: 2,
                        }}
                      >
                        Makeup: {new Date(s.makeupDate + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })} 🌺
                      </button>
                    )}
                    {closure && (
                      <div style={{ fontSize: 11, color: '#FFB800', marginTop: 2 }}>
                        {closure.emoji ?? '🏫'} {closure.label}
                      </div>
                    )}
                  </div>

                  {/* Action: Call Out / Message Studio / nothing */}
                  {timeframe === 'upcoming' && !closure && !isPast && !s.isCalledOut && (
                    within60 ? (
                      <MessageStudioButton variant="compact" />
                    ) : canCallOut ? (
                      <button
                        onClick={() => handleCallOutClick(s)}
                        style={{
                          display: 'inline-flex', alignItems: 'center', gap: 5,
                          padding: '7px 10px', borderRadius: 8, cursor: 'pointer',
                          background: 'rgba(212,34,106,0.1)', border: '1px solid rgba(212,34,106,0.25)',
                          color: '#D4226A', fontSize: 11, fontWeight: 700,
                          WebkitTapHighlightColor: 'transparent', flexShrink: 0,
                        }}
                      >
                        <PhoneOff size={12} />
                        Call Out
                      </button>
                    ) : null
                  )}
                </div>
              )
            })}
          </div>
        </>
      )}

      {/* Call-Out Modal */}
      {callOutTarget && familyId && (
        <CallOutModal
          isOpen={!!callOutTarget}
          onClose={() => setCallOutTarget(null)}
          clickedBlockId={callOutTarget.blockId}
          clickedStudentId={callOutTarget.studentId}
          sessionDate={callOutTarget.date}
          familyId={familyId}
          familyName={familyName ?? ''}
          familyStudentIds={students.map(s => s.id)}
        />
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
