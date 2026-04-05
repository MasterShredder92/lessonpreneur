import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { useAuthContext } from '../../app/AuthContext'
import { toast } from '../shared/Toast'

interface BlockingTeacher {
  teacher_id: string
  short_name: string
  location_name: string | null
}

interface DirectorCloseoutStatus {
  today: string
  profileId: string | null
  locationId: string | null
  existingCloseout: { id: string; closed_at: string } | null
  unacknowledgedCallouts: number
  blockingTeachers: BlockingTeacher[]
  incompleteTasks: number
  isAfter830: boolean
}

function formatTimeOfDay(iso: string) {
  const d = new Date(iso)
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
}

function teacherShortName(fullName: string | null | undefined): string {
  if (!fullName) return ''
  const parts = fullName.trim().split(/\s+/)
  if (parts.length === 1) return parts[0]
  return `${parts[0]} ${parts[parts.length - 1][0]}.`
}

export default function DirectorCloseoutSection() {
  const { profile, tenantId, role } = useAuthContext()
  const qc = useQueryClient()
  const [modal, setModal] = useState<'blocked' | 'confirm' | null>(null)
  const [now] = useState(() => new Date())

  const isStudioDirector = role === 'studio_director'

  const { data: status } = useQuery<DirectorCloseoutStatus>({
    queryKey: ['director-closeout-status', profile?.id, tenantId],
    enabled: isStudioDirector && !!profile?.id && !!tenantId,
    staleTime: 30_000,
    queryFn: async () => {
      const today = new Date().toISOString().split('T')[0]
      const nowDate = new Date()
      const eightThirty = new Date()
      eightThirty.setHours(20, 30, 0, 0)
      const isAfter830 = nowDate.getTime() >= eightThirty.getTime()

      // Director's assigned location (most recent user_locations row)
      let locationId: string | null = null
      const { data: userLocs } = await supabase
        .from('profile_locations')
        .select('location_id')
        .eq('profile_id', profile!.id)
        .limit(1)
      locationId = userLocs?.[0]?.location_id ?? null

      // Existing closeout today
      const { data: closeoutRow } = await supabase
        .from('director_closeouts')
        .select('id, closed_at')
        .eq('tenant_id', tenantId!)
        .eq('profile_id', profile!.id)
        .eq('closeout_date', today)
        .maybeSingle()

      // Unacknowledged family callout alerts for today
      const { count: calloutCount } = await supabase
        .from('dashboard_alerts')
        .select('*', { count: 'exact', head: true })
        .eq('tenant_id', tenantId!)
        .eq('alert_type', 'family_callout')
        .eq('alert_date', today)
        .eq('is_acknowledged', false)

      // Teachers with sessions today + no closeout (only checked after 8:30 PM)
      let blockingTeachers: BlockingTeacher[] = []
      if (isAfter830) {
        const { data: blocks } = await supabase
          .from('schedule_blocks')
          .select('teacher_id, location_id')
          .eq('block_date', today)
          .eq('status', 'booked')
          .eq('block_type', 'student_session')
          .not('teacher_id', 'is', null)

        const teacherLocMap = new Map<string, string>()
        ;(blocks ?? []).forEach((b: any) => {
          if (b.teacher_id && !teacherLocMap.has(b.teacher_id)) {
            teacherLocMap.set(b.teacher_id, b.location_id)
          }
        })
        const teacherIds = [...teacherLocMap.keys()]

        if (teacherIds.length > 0) {
          const { data: closedRows } = await supabase
            .from('teacher_closeouts')
            .select('teacher_id')
            .eq('tenant_id', tenantId!)
            .eq('closeout_date', today)
            .in('teacher_id', teacherIds)
          const closedSet = new Set((closedRows ?? []).map((r: any) => r.teacher_id))
          const missingIds = teacherIds.filter(id => !closedSet.has(id))

          if (missingIds.length > 0) {
            const { data: teachers } = await supabase
              .from('teachers')
              .select('id, first_name, last_name')
              .in('id', missingIds)
            const locIds = [...new Set(missingIds.map(id => teacherLocMap.get(id)).filter(Boolean) as string[])]
            const locMap = new Map<string, string>()
            if (locIds.length > 0) {
              const { data: locs } = await supabase
                .from('locations')
                .select('id, name')
                .in('id', locIds)
              locs?.forEach((l: any) => locMap.set(l.id, (l.name ?? '').replace(' Music Lessons', '')))
            }
            blockingTeachers = (teachers ?? []).map((t: any) => ({
              teacher_id: t.id,
              short_name: teacherShortName(`${t.first_name ?? ''} ${t.last_name ?? ''}`.trim()),
              location_name: locMap.get(teacherLocMap.get(t.id) ?? '') ?? null,
            }))
          }
        }
      }

      // Incomplete director tasks for today
      let incompleteTasks = 0
      try {
        const { count: tCount } = await supabase
          .from('tasks')
          .select('*', { count: 'exact', head: true })
          .eq('tenant_id', tenantId!)
          .eq('assigned_to', profile!.id)
          .eq('due_date', today)
          .neq('status', 'completed')
        incompleteTasks = tCount ?? 0
      } catch {
        incompleteTasks = 0
      }

      return {
        today,
        profileId: profile!.id,
        locationId,
        existingCloseout: closeoutRow ? { id: closeoutRow.id, closed_at: closeoutRow.closed_at } : null,
        unacknowledgedCallouts: calloutCount ?? 0,
        blockingTeachers,
        incompleteTasks,
        isAfter830,
      }
    },
  })

  const complete = useMutation({
    mutationFn: async () => {
      if (!status || !tenantId || !profile?.id) throw new Error('Not ready')
      const today = status.today
      const closedAt = new Date().toISOString()
      const directorName = `${profile.first_name ?? ''} ${profile.last_name ?? ''}`.trim() || 'Director'

      const { error } = await supabase.from('director_closeouts').insert({
        tenant_id: tenantId,
        profile_id: profile.id,
        location_id: status.locationId,
        closeout_date: today,
        closed_at: closedAt,
        callouts_acknowledged: true,
        teacher_nonclosures_followed_up: true,
        manual_tasks_completed: true,
        is_complete: true,
      })
      if (error) throw error

      await supabase.from('audit_log').insert({
        tenant_id: tenantId,
        performed_by: profile.id,
        user_name: directorName,
        user_role: 'studio_director',
        action: 'DIRECTOR_CLOSEOUT',
        table_name: 'director_closeouts',
        record_id: profile.id,
        entity_name: directorName,
        location_id: status.locationId,
        new_value: { closeout_date: today, closed_at: closedAt },
      })
      return { closedAt }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['director-closeout-status'] })
    },
  })

  if (!isStudioDirector) return null
  if (!status) return null

  const hasBlockers =
    status.unacknowledgedCallouts > 0 ||
    status.blockingTeachers.length > 0 ||
    status.incompleteTasks > 0

  const handleClick = () => {
    if (hasBlockers) {
      setModal('blocked')
    } else {
      setModal('confirm')
    }
  }

  const handleConfirm = async () => {
    try {
      await complete.mutateAsync()
      setModal(null)
      toast('Day closed out — great work today!', 'success')
    } catch (err: any) {
      toast(err.message ?? 'Failed to close out', 'error')
    }
  }

  return (
    <div style={{ marginTop: 24, marginBottom: 20 }}>
      <div className="section-header" style={{ marginBottom: 8 }}>
        <span className="section-label">End of Day</span>
        <div className="section-line" />
      </div>

      {status.existingCloseout ? (
        <div style={{
          padding: '14px 16px', borderRadius: 10,
          background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.25)',
          textAlign: 'center',
        }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#22C55E' }}>
            ✅ Day closed out at {formatTimeOfDay(status.existingCloseout.closed_at)}
          </div>
        </div>
      ) : (
        <>
          <button
            data-tour-id="close-out-button"
            onClick={handleClick}
            disabled={complete.isPending}
            style={{
              width: '100%', minHeight: 52, padding: '14px 20px', borderRadius: 12,
              background: '#D4226A', color: '#FFFFFF', fontSize: 16, fontWeight: 800,
              border: 'none', cursor: complete.isPending ? 'wait' : 'pointer',
              boxShadow: '0 4px 16px rgba(212,34,106,0.3)',
              transition: 'transform 120ms ease, box-shadow 120ms ease',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 6px 20px rgba(212,34,106,0.4)' }}
            onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 4px 16px rgba(212,34,106,0.3)' }}
          >
            Close Out My Day
          </button>
          <div style={{ fontSize: 11, color: '#8080A8', marginTop: 6, textAlign: 'center' }}>
            Current time: {formatTimeOfDay(now.toISOString())}
          </div>
        </>
      )}

      {/* Blocked modal */}
      {modal === 'blocked' && (
        <div
          onClick={() => setModal(null)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 1000,
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: '#0c0b16', borderRadius: 14, padding: 24, maxWidth: 460, width: '100%',
              border: '1px solid rgba(212,34,106,0.3)', boxShadow: '0 20px 60px rgba(0,0,0,0.6)',
            }}
          >
            <div style={{ fontSize: 18, fontWeight: 800, color: '#D4226A', marginBottom: 12 }}>
              ⚠️ A Few Things Need Your Attention
            </div>
            <div style={{ fontSize: 13, color: '#C0C0E0', marginBottom: 14 }}>
              Before closing out, please handle:
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 18 }}>
              {status.unacknowledgedCallouts > 0 && (
                <div style={{
                  padding: '10px 12px', borderRadius: 8,
                  background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)',
                }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#E0E0F4' }}>
                    📵 {status.unacknowledgedCallouts} family call-out{status.unacknowledgedCallouts !== 1 ? 's' : ''} not yet acknowledged
                  </div>
                  <div style={{ fontSize: 11, color: '#8080A8', marginTop: 3 }}>
                    → Go to dashboard feed to acknowledge {status.unacknowledgedCallouts === 1 ? 'it' : 'them'}
                  </div>
                </div>
              )}
              {status.blockingTeachers.map((t) => (
                <div key={t.teacher_id} style={{
                  padding: '10px 12px', borderRadius: 8,
                  background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)',
                }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#E0E0F4' }}>
                    ⚠️ {t.short_name} hasn't closed out yet ({formatTimeOfDay(now.toISOString())})
                  </div>
                  <div style={{ fontSize: 11, color: '#8080A8', marginTop: 3 }}>
                    → Follow up with {t.short_name.split(' ')[0]}{t.location_name ? ` (${t.location_name})` : ''}
                  </div>
                </div>
              ))}
              {status.incompleteTasks > 0 && (
                <div style={{
                  padding: '10px 12px', borderRadius: 8,
                  background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)',
                }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#E0E0F4' }}>
                    📋 {status.incompleteTasks} task{status.incompleteTasks !== 1 ? 's' : ''} still open for today
                  </div>
                  <div style={{ fontSize: 11, color: '#8080A8', marginTop: 3 }}>
                    → Complete or snooze in the Tasks section
                  </div>
                </div>
              )}
            </div>
            <button
              onClick={() => setModal(null)}
              style={{
                width: '100%', padding: '12px', borderRadius: 8, fontSize: 13, fontWeight: 800,
                background: '#D4226A', color: '#FFFFFF', border: 'none', cursor: 'pointer',
              }}
            >
              Got It
            </button>
          </div>
        </div>
      )}

      {/* Confirm modal */}
      {modal === 'confirm' && (
        <div
          onClick={() => setModal(null)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 1000,
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: '#0c0b16', borderRadius: 14, padding: 24, maxWidth: 420, width: '100%',
              border: '1px solid rgba(212,34,106,0.3)', boxShadow: '0 20px 60px rgba(0,0,0,0.6)',
            }}
          >
            <div style={{ fontSize: 18, fontWeight: 800, color: '#D4226A', marginBottom: 12 }}>
              🌟 Ready to Close Out?
            </div>
            <div style={{ fontSize: 13, color: '#C0C0E0', marginBottom: 12, lineHeight: 1.55 }}>
              Everything looks good for today.
            </div>
            <div style={{ fontSize: 12, color: '#8080A8', marginBottom: 18, lineHeight: 1.55 }}>
              Closing out will log <strong style={{ color: '#A0A0C8' }}>{formatTimeOfDay(new Date().toISOString())}</strong> as your end of day.
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={() => setModal(null)}
                disabled={complete.isPending}
                style={{
                  flex: 1, padding: '12px', borderRadius: 8, fontSize: 13, fontWeight: 700,
                  background: 'rgba(255,255,255,0.04)', color: '#A0A0C8',
                  border: '1px solid rgba(255,255,255,0.08)', cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleConfirm}
                disabled={complete.isPending}
                style={{
                  flex: 1, padding: '12px', borderRadius: 8, fontSize: 13, fontWeight: 800,
                  background: '#D4226A', color: '#FFFFFF', border: 'none',
                  cursor: complete.isPending ? 'wait' : 'pointer',
                }}
              >
                {complete.isPending ? 'Closing...' : 'Close Out My Day'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
