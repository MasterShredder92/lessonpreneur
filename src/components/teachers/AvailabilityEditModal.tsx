import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useLocations } from '../../hooks/useLocations'
import { useTeacherAvailability, useUpsertAvailability } from '../../hooks/useTeachers'
import { useAuthContext } from '../../app/AuthContext'
import { supabase } from '../../lib/supabase'
import ConfirmModal from '../shared/ConfirmModal'
import { toast } from '../shared/Toast'

const DAYS_ORDERED = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] as const
const DAY_LABELS: Record<string, string> = {
  sunday: 'Sun', monday: 'Mon', tuesday: 'Tue', wednesday: 'Wed',
  thursday: 'Thu', friday: 'Fri', saturday: 'Sat',
}
// day_of_week in DB: 0=Sun, 1=Mon, ... 6=Sat
const DAY_TO_DB_INDEX: Record<string, number> = {
  sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6,
}

interface Props {
  teacherId: string
  teacherName: string
  tenantId: string
  onClose: () => void
}

export default function AvailabilityEditModal({ teacherId, teacherName, tenantId, onClose }: Props) {
  const { profile: authProfile } = useAuthContext()
  const { data: locations } = useLocations()
  const { data: availabilityData } = useTeacherAvailability(teacherId)
  const upsertAvailability = useUpsertAvailability()

  // Fetch location hours for default times
  const { data: locationHours } = useQuery({
    queryKey: ['location-hours'],
    queryFn: async () => {
      const { data } = await supabase.from('location_hours').select('*')
      return data ?? []
    },
  })

  // Get default open/close for a location + day — ALWAYS reads from location_hours
  const getDefaultTimes = (locationId: string, day: string): { start_time: string; end_time: string } => {
    const dayIdx = DAY_TO_DB_INDEX[day] ?? 1
    const hours = locationHours?.find((h: any) => h.location_id === locationId && h.day_of_week === dayIdx)
    if (hours && !hours.is_closed) {
      return { start_time: hours.open_time?.substring(0, 5) ?? '10:00', end_time: hours.close_time?.substring(0, 5) ?? '15:00' }
    }
    // Fallback based on day — weekends are 10am-3pm, weekdays 3pm-9pm
    if (day === 'saturday' || day === 'sunday') {
      return { start_time: '10:00', end_time: '15:00' }
    }
    return { start_time: '15:00', end_time: '21:00' }
  }

  const [availByLoc, setAvailByLoc] = useState<Record<string, Record<string, { start_time: string; end_time: string } | null>>>({})
  const [editorLocations, setEditorLocations] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [pendingConfirm, setPendingConfirm] = useState<{ title: string; message: string; variant?: 'warning' | 'danger' | 'info'; onConfirm: () => void } | null>(null)

  // Initialize editor state from availability data
  useEffect(() => {
    if (!availabilityData) return
    const byLoc: Record<string, Record<string, { start_time: string; end_time: string } | null>> = {}
    const activeLocs: string[] = []

    availabilityData.flat.forEach((a) => {
      if (!byLoc[a.location_id]) {
        byLoc[a.location_id] = {}
        DAYS_ORDERED.forEach((d) => { byLoc[a.location_id][d] = null })
        activeLocs.push(a.location_id)
      }
      byLoc[a.location_id][a.day_of_week] = { start_time: a.start_time, end_time: a.end_time }
    })

    setAvailByLoc(byLoc)
    setEditorLocations(activeLocs)
  }, [availabilityData])

  const toggleLocation = (locId: string) => {
    if (editorLocations.includes(locId)) {
      const locName = locations?.find((l) => l.id === locId)?.name?.replace(' Music Lessons', '') ?? 'this location'
      setPendingConfirm({
        title: 'Disable Location Availability',
        message: `Turning off ${locName} will remove this teacher from upcoming open schedule slots. Booked sessions are not affected. Continue?`,
        variant: 'warning',
        onConfirm: () => {
          setPendingConfirm(null)
          setEditorLocations(editorLocations.filter((l) => l !== locId))
          const updated = { ...availByLoc }
          delete updated[locId]
          setAvailByLoc(updated)
        },
      })
    } else {
      setEditorLocations([...editorLocations, locId])
      const days: Record<string, { start_time: string; end_time: string } | null> = {}
      DAYS_ORDERED.forEach((d) => { days[d] = null })
      setAvailByLoc({ ...availByLoc, [locId]: days })
    }
  }

  const handleSave = async () => {
    setError(null)

    // Validate end > start
    for (const locId of editorLocations) {
      const days = availByLoc[locId]
      if (!days) continue
      for (const day of DAYS_ORDERED) {
        const slot = days[day]
        if (slot && slot.start_time >= slot.end_time) {
          const locName = locations?.find((l) => l.id === locId)?.name ?? locId
          setError(`${locName}: ${DAY_LABELS[day]} end time must be after start time.`)
          return
        }
      }
    }

    const slots: { location_id: string; day_of_week: string; start_time: string; end_time: string }[] = []
    for (const locId of editorLocations) {
      const days = availByLoc[locId]
      if (!days) continue
      for (const day of DAYS_ORDERED) {
        const slot = days[day]
        if (slot && slot.start_time && slot.end_time) {
          slots.push({ location_id: locId, day_of_week: day, start_time: slot.start_time, end_time: slot.end_time })
        }
      }
    }

    try {
      await upsertAvailability.mutateAsync({ teacher_id: teacherId, tenant_id: tenantId, performed_by: authProfile?.id ?? null, slots })
      toast('Availability updated', 'success')
      onClose()
    } catch (err: any) {
      setError('Failed: ' + err.message)
    }
  }

  return (
    <>
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 640 }}>
          <div className="modal-header">
            <h2>Set Availability — {teacherName}</h2>
            <button className="btn-ghost" onClick={onClose}>✕</button>
          </div>
          <div className="modal-form" style={{ maxHeight: '70vh', overflowY: 'auto' }}>
            {locations?.filter((l: any) => l.is_active).map((loc: any) => {
              const isOn = editorLocations.includes(loc.id)
              const locDays = availByLoc[loc.id] ?? {}
              return (
                <div key={loc.id} style={{ marginBottom: 16, padding: '12px 14px', background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: isOn ? 12 : 0 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: isOn ? (loc.color ?? '#38BDF8') : '#606088' }}>{loc.name.replace(' Music Lessons', '')}</span>
                    <button
                      className="btn-ghost"
                      onClick={() => toggleLocation(loc.id)}
                      style={{ fontSize: 10, padding: '3px 10px', color: isOn ? '#EF4444' : '#22C55E' }}
                    >
                      {isOn ? 'Remove' : 'Add'}
                    </button>
                  </div>

                  {isOn && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {DAYS_ORDERED.map((day) => {
                        const slot = locDays[day]
                        const hasSlot = slot !== null && slot !== undefined
                        return (
                          <div key={day} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ fontSize: 11, fontWeight: 700, color: '#A0A0C8', width: 36 }}>{DAY_LABELS[day]}</span>
                            {hasSlot ? (
                              <>
                                <input
                                  type="time"
                                  value={slot!.start_time}
                                  onChange={(e) => {
                                    const updated = { ...availByLoc }
                                    updated[loc.id] = { ...updated[loc.id], [day]: { ...slot!, start_time: e.target.value } }
                                    setAvailByLoc(updated)
                                  }}
                                  style={{ fontSize: 11, padding: '4px 6px', borderRadius: 6, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#E0E0F4', outline: 'none' }}
                                />
                                <span style={{ color: '#606088', fontSize: 11 }}>–</span>
                                <input
                                  type="time"
                                  value={slot!.end_time}
                                  onChange={(e) => {
                                    const updated = { ...availByLoc }
                                    updated[loc.id] = { ...updated[loc.id], [day]: { ...slot!, end_time: e.target.value } }
                                    setAvailByLoc(updated)
                                  }}
                                  style={{ fontSize: 11, padding: '4px 6px', borderRadius: 6, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#E0E0F4', outline: 'none' }}
                                />
                                <button
                                  onClick={() => {
                                    const updated = { ...availByLoc }
                                    updated[loc.id] = { ...updated[loc.id], [day]: null }
                                    setAvailByLoc(updated)
                                  }}
                                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#8080A8', padding: 2, fontSize: 11 }}
                                  title="Clear day"
                                >
                                  ✕
                                </button>
                              </>
                            ) : (
                              <button
                                onClick={() => {
                                  const updated = { ...availByLoc }
                                  updated[loc.id] = { ...updated[loc.id], [day]: getDefaultTimes(loc.id, day) }
                                  setAvailByLoc(updated)
                                }}
                                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#606088', fontSize: 11 }}
                              >
                                — <span style={{ color: '#8080A8', fontSize: 10 }}>click to add</span>
                              </button>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })}

            {error && <div className="form-error">{error}</div>}

            <div className="modal-actions">
              <button className="btn-ghost" onClick={onClose}>Cancel</button>
              <button className="btn-primary" onClick={handleSave} disabled={upsertAvailability.isPending}>
                {upsertAvailability.isPending ? 'Saving...' : 'Save Availability'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {pendingConfirm && (
        <ConfirmModal
          title={pendingConfirm.title}
          message={pendingConfirm.message}
          variant={pendingConfirm.variant ?? 'warning'}
          confirmLabel="Yes, Continue"
          onConfirm={pendingConfirm.onConfirm}
          onCancel={() => setPendingConfirm(null)}
        />
      )}
    </>
  )
}
