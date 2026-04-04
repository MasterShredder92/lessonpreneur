import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { useAuthContext } from '../../app/AuthContext'
import { Check } from 'lucide-react'
import { getInstrumentEmoji } from '../../utils/instrumentEmoji'

interface HappeningTodayFeedProps {
  userLocations: string[] | null | undefined
}

interface AlertRow {
  id: string
  location_id: string | null
  related_entity_id: string | null
  related_entity_name: string | null
  created_at: string
  // enriched
  studentName: string | null
  locationName: string | null
  instrument: string | null
  sessionTime: string | null
  teacherShortName: string | null
}

function formatTime(t: string) {
  const [h, m] = t.split(':')
  const hour = parseInt(h)
  const ampm = hour >= 12 ? 'PM' : 'AM'
  const display = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour
  return `${display}:${m} ${ampm}`
}

function teacherInitialFromName(fullName: string | null | undefined): string {
  if (!fullName) return ''
  const parts = fullName.trim().split(/\s+/)
  if (parts.length === 1) return parts[0]
  return `${parts[0]} ${parts[parts.length - 1][0]}.`
}

export default function HappeningTodayFeed({ userLocations }: HappeningTodayFeedProps) {
  const { tenantId, role } = useAuthContext()
  const qc = useQueryClient()
  const [dismissing, setDismissing] = useState<Set<string>>(new Set())

  const canView = role === 'owner' || role === 'admin' || role === 'studio_director' || role === 'company_director'

  const { data: alerts } = useQuery<AlertRow[]>({
    queryKey: ['happening-today-feed', tenantId, userLocations],
    enabled: canView && !!tenantId,
    queryFn: async () => {
      const today = new Date().toISOString().split('T')[0]

      let q = supabase
        .from('dashboard_alerts')
        .select('id, location_id, related_entity_id, related_entity_name, created_at')
        .eq('tenant_id', tenantId!)
        .eq('alert_type', 'family_callout')
        .eq('alert_date', today)
        .eq('is_acknowledged', false)
        .in('target_role', ['studio_director', 'owner', 'company_director'])
        .order('created_at', { ascending: false })

      if (userLocations && userLocations.length > 0) {
        q = q.in('location_id', userLocations)
      }

      const { data: rows, error } = await q
      if (error) throw error
      if (!rows || rows.length === 0) return []

      // Gather related callout ids and location ids
      const calloutIds = rows.map(r => r.related_entity_id).filter(Boolean) as string[]
      const locationIds = [...new Set(rows.map(r => r.location_id).filter(Boolean) as string[])]

      // Locations
      const locMap = new Map<string, string>()
      if (locationIds.length > 0) {
        const { data: locs } = await supabase
          .from('locations')
          .select('id, name')
          .in('id', locationIds)
        locs?.forEach((l: any) => locMap.set(l.id, (l.name ?? '').replace(' Music Lessons', '')))
      }

      // Callouts → student, block
      const calloutMap = new Map<string, { student_id: string | null; schedule_block_id: string | null }>()
      if (calloutIds.length > 0) {
        const { data: callouts } = await supabase
          .from('student_callouts')
          .select('id, student_id, schedule_block_id')
          .in('id', calloutIds)
        callouts?.forEach((c: any) => calloutMap.set(c.id, { student_id: c.student_id, schedule_block_id: c.schedule_block_id }))
      }

      const studentIds = [...new Set([...calloutMap.values()].map(c => c.student_id).filter(Boolean) as string[])]
      const blockIds = [...new Set([...calloutMap.values()].map(c => c.schedule_block_id).filter(Boolean) as string[])]

      // Students
      const studentMap = new Map<string, { name: string; instrument: string | null }>()
      if (studentIds.length > 0) {
        const { data: students } = await supabase
          .from('students')
          .select('id, first_name, last_name, instrument')
          .in('id', studentIds)
        students?.forEach((s: any) => studentMap.set(s.id, {
          name: `${s.first_name ?? ''} ${s.last_name ?? ''}`.trim(),
          instrument: s.instrument ?? null,
        }))
      }

      // Blocks → time, teacher_id
      const blockMap = new Map<string, { start_time: string; teacher_id: string | null }>()
      if (blockIds.length > 0) {
        const { data: blks } = await supabase
          .from('schedule_blocks')
          .select('id, start_time, teacher_id')
          .in('id', blockIds)
        blks?.forEach((b: any) => blockMap.set(b.id, { start_time: b.start_time, teacher_id: b.teacher_id }))
      }

      // Teachers
      const teacherIds = [...new Set([...blockMap.values()].map(b => b.teacher_id).filter(Boolean) as string[])]
      const teacherMap = new Map<string, string>()
      if (teacherIds.length > 0) {
        const { data: teachers } = await supabase
          .from('teachers')
          .select('id, first_name, last_name')
          .in('id', teacherIds)
        teachers?.forEach((t: any) => teacherMap.set(t.id, `${t.first_name ?? ''} ${t.last_name ?? ''}`.trim()))
      }

      return rows.map((r): AlertRow => {
        const co = r.related_entity_id ? calloutMap.get(r.related_entity_id) : null
        const stu = co?.student_id ? studentMap.get(co.student_id) : null
        const blk = co?.schedule_block_id ? blockMap.get(co.schedule_block_id) : null
        const teacherName = blk?.teacher_id ? teacherMap.get(blk.teacher_id) : null
        return {
          id: r.id,
          location_id: r.location_id,
          related_entity_id: r.related_entity_id,
          related_entity_name: r.related_entity_name,
          created_at: r.created_at,
          studentName: stu?.name ?? r.related_entity_name ?? null,
          locationName: r.location_id ? locMap.get(r.location_id) ?? null : null,
          instrument: stu?.instrument ?? null,
          sessionTime: blk?.start_time ?? null,
          teacherShortName: teacherInitialFromName(teacherName),
        }
      })
    },
    staleTime: 30_000,
  })

  const acknowledge = useMutation({
    mutationFn: async (alertId: string) => {
      const { error } = await supabase
        .from('dashboard_alerts')
        .update({ is_acknowledged: true, acknowledged_at: new Date().toISOString() })
        .eq('id', alertId)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['happening-today-feed'] })
    },
  })

  if (!canView) return null

  const visible = (alerts ?? []).filter(a => !dismissing.has(a.id))
  if (visible.length === 0) return null

  const handleAck = (id: string) => {
    setDismissing(prev => new Set(prev).add(id))
    setTimeout(() => acknowledge.mutate(id), 250)
  }

  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{
        fontSize: 11, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.1em',
        color: 'rgba(255,255,255,0.4)', marginBottom: 10,
      }}>
        Things Happening Today
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {visible.map((a) => {
          const isFading = dismissing.has(a.id)
          const instrumentLabel = a.instrument
            ? `${getInstrumentEmoji(a.instrument)} ${a.instrument.charAt(0).toUpperCase() + a.instrument.slice(1)}`
            : '—'
          return (
            <div
              key={a.id}
              style={{
                padding: '12px 16px', borderRadius: 10,
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,107,107,0.3)',
                display: 'flex', alignItems: 'center', gap: 12,
                opacity: isFading ? 0 : 1,
                transition: 'opacity 250ms ease, transform 250ms ease',
                transform: isFading ? 'translateX(8px)' : 'translateX(0)',
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#FFFFFF', overflowWrap: 'break-word' }}>
                  📵 {a.studentName ?? '—'} called out today — {a.locationName ?? '—'}
                </div>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginTop: 3, overflowWrap: 'break-word' }}>
                  Family initiated · {instrumentLabel} · {a.sessionTime ? formatTime(a.sessionTime) : '—'} · {a.teacherShortName || '—'}
                </div>
              </div>
              <button
                onClick={() => handleAck(a.id)}
                title="Acknowledge"
                aria-label="Acknowledge"
                style={{
                  width: 44, height: 44, minWidth: 44, borderRadius: 22,
                  background: 'rgba(255,255,255,0.1)',
                  border: '1px solid rgba(255,255,255,0.15)',
                  color: 'rgba(255,255,255,0.7)',
                  cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0, transition: 'all 140ms ease',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'rgba(34,197,94,0.15)'
                  e.currentTarget.style.borderColor = 'rgba(34,197,94,0.4)'
                  e.currentTarget.style.color = '#22C55E'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'rgba(255,255,255,0.1)'
                  e.currentTarget.style.borderColor = 'rgba(255,255,255,0.15)'
                  e.currentTarget.style.color = 'rgba(255,255,255,0.7)'
                }}
              >
                <Check size={18} strokeWidth={3} />
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
