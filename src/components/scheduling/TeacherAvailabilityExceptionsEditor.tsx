import { useEffect, useMemo, useState } from 'react'
import { Bolt, Plus, Trash2, X } from 'lucide-react'
import {
  addBlackout,
  addOverride,
  getTeacherDateExceptions,
  removeBlackout,
  removeOverride,
  useTeacherAvailabilityExceptions,
} from './useTeacherAvailabilityExceptions'

interface TeacherAvailabilityExceptionsEditorProps {
  teacherId: string
  teacherName: string
  timeSlots: string[]
  dates: string[]
  compact?: boolean
}

function formatDateLabel(iso: string): string {
  const d = new Date(`${iso}T12:00:00`)
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

function nextSlot(timeSlots: string[], slot: string): string {
  const i = timeSlots.findIndex(s => s === slot)
  if (i < 0 || i >= timeSlots.length - 1) return slot
  return timeSlots[i + 1]
}

export default function TeacherAvailabilityExceptionsEditor({
  teacherId,
  teacherName,
  timeSlots,
  dates,
  compact = false,
}: TeacherAvailabilityExceptionsEditorProps) {
  const { exceptions } = useTeacherAvailabilityExceptions()
  const [open, setOpen] = useState(false)
  const [dateKey, setDateKey] = useState(dates[0] ?? '')
  const [fullDayBlackout, setFullDayBlackout] = useState(true)
  const [blackoutStart, setBlackoutStart] = useState(timeSlots[0] ?? '09:00')
  const [blackoutEnd, setBlackoutEnd] = useState(timeSlots[1] ?? timeSlots[0] ?? '09:30')
  const [overrideStart, setOverrideStart] = useState(timeSlots[0] ?? '09:00')
  const [overrideEnd, setOverrideEnd] = useState(timeSlots[1] ?? timeSlots[0] ?? '09:30')

  useEffect(() => {
    if (!dateKey && dates[0]) setDateKey(dates[0])
    if (dateKey && !dates.includes(dateKey) && dates[0]) setDateKey(dates[0])
  }, [dateKey, dates])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  const dayExceptions = useMemo(
    () => (dateKey ? getTeacherDateExceptions(teacherId, dateKey) : {}),
    [teacherId, dateKey, exceptions],
  )

  const canAddBlackout = useMemo(() => {
    if (fullDayBlackout) return Boolean(dateKey)
    return Boolean(dateKey && blackoutStart && blackoutEnd && blackoutStart < blackoutEnd)
  }, [fullDayBlackout, dateKey, blackoutStart, blackoutEnd])

  const canAddOverride = useMemo(
    () => Boolean(dateKey && overrideStart && overrideEnd && overrideStart < overrideEnd),
    [dateKey, overrideStart, overrideEnd],
  )

  const triggerButton = (
    <button
      type="button"
      onClick={() => setOpen(true)}
      title="Teacher exceptions"
      aria-label={`Edit exceptions for ${teacherName}`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        borderRadius: 8,
        border: '1px solid rgba(250,204,21,0.3)',
        background: 'rgba(250,204,21,0.08)',
        color: '#facc15',
        cursor: 'pointer',
        padding: compact ? '2px 6px' : '4px 8px',
        fontSize: compact ? 10 : 11,
        fontWeight: 700,
      }}
    >
      <Bolt size={compact ? 10 : 12} />
      <span>Exceptions</span>
    </button>
  )

  if (!open) return triggerButton

  return (
    <>
      {triggerButton}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`${teacherName} availability exceptions`}
        onClick={() => setOpen(false)}
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 2400,
          background: 'rgba(0,0,0,0.55)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 12,
        }}
      >
        <div
          onClick={e => e.stopPropagation()}
          style={{
            width: '100%',
            maxWidth: 560,
            maxHeight: '85vh',
            overflowY: 'auto',
            background: '#111127',
            border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: 12,
            boxShadow: '0 20px 40px rgba(0,0,0,0.5)',
            padding: 14,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
            <div>
              <div style={{ fontSize: 14, color: '#EAEAF8', fontWeight: 800 }}>{teacherName}</div>
              <div style={{ fontSize: 11, color: '#9ca3af' }}>Blackouts and one-off availability overrides</div>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close exceptions editor"
              style={{
                width: 28,
                height: 28,
                borderRadius: 8,
                border: '1px solid rgba(255,255,255,0.12)',
                background: 'transparent',
                color: '#cbd5e1',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <X size={14} />
            </button>
          </div>

          <div style={{ marginTop: 10, display: 'grid', gap: 10 }}>
            <label style={{ fontSize: 11, color: '#a5b4fc', fontWeight: 700 }}>
              Date
              <select
                value={dateKey}
                onChange={e => setDateKey(e.target.value)}
                style={{
                  marginTop: 4,
                  width: '100%',
                  background: '#1b1b33',
                  color: '#e2e8f0',
                  border: '1px solid rgba(255,255,255,0.14)',
                  borderRadius: 8,
                  padding: '7px 9px',
                }}
              >
                {dates.map(d => (
                  <option key={d} value={d}>
                    {formatDateLabel(d)}
                  </option>
                ))}
              </select>
            </label>

            <div style={{ border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, padding: 10 }}>
              <div style={{ fontSize: 12, color: '#fca5a5', fontWeight: 800 }}>Add blackout</div>
              <label style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#d1d5db' }}>
                <input
                  type="checkbox"
                  checked={fullDayBlackout}
                  onChange={e => setFullDayBlackout(e.target.checked)}
                />
                Full day
              </label>
              {!fullDayBlackout && (
                <div style={{ marginTop: 8, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <select
                    value={blackoutStart}
                    onChange={e => {
                      const next = e.target.value
                      setBlackoutStart(next)
                      if (blackoutEnd <= next) setBlackoutEnd(nextSlot(timeSlots, next))
                    }}
                    style={{ background: '#1b1b33', color: '#e2e8f0', border: '1px solid rgba(255,255,255,0.14)', borderRadius: 8, padding: '7px 9px' }}
                  >
                    {timeSlots.map(slot => (
                      <option key={`bo-start-${slot}`} value={slot}>
                        {slot}
                      </option>
                    ))}
                  </select>
                  <select
                    value={blackoutEnd}
                    onChange={e => setBlackoutEnd(e.target.value)}
                    style={{ background: '#1b1b33', color: '#e2e8f0', border: '1px solid rgba(255,255,255,0.14)', borderRadius: 8, padding: '7px 9px' }}
                  >
                    {timeSlots.filter(slot => slot > blackoutStart).map(slot => (
                      <option key={`bo-end-${slot}`} value={slot}>
                        {slot}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <button
                type="button"
                disabled={!canAddBlackout}
                onClick={() => {
                  if (!dateKey) return
                  addBlackout(
                    teacherId,
                    dateKey,
                    fullDayBlackout ? { start: null, end: null } : { start: blackoutStart, end: blackoutEnd },
                  )
                }}
                style={{
                  marginTop: 8,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  borderRadius: 8,
                  border: '1px solid rgba(248,113,113,0.35)',
                  background: canAddBlackout ? 'rgba(248,113,113,0.14)' : 'rgba(255,255,255,0.05)',
                  color: canAddBlackout ? '#fca5a5' : '#6b7280',
                  padding: '6px 10px',
                  cursor: canAddBlackout ? 'pointer' : 'not-allowed',
                  fontSize: 11,
                  fontWeight: 700,
                }}
              >
                <Plus size={12} /> Add blackout
              </button>
            </div>

            <div style={{ border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, padding: 10 }}>
              <div style={{ fontSize: 12, color: '#86efac', fontWeight: 800 }}>Add override</div>
              <div style={{ marginTop: 8, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <select
                  value={overrideStart}
                  onChange={e => {
                    const next = e.target.value
                    setOverrideStart(next)
                    if (overrideEnd <= next) setOverrideEnd(nextSlot(timeSlots, next))
                  }}
                  style={{ background: '#1b1b33', color: '#e2e8f0', border: '1px solid rgba(255,255,255,0.14)', borderRadius: 8, padding: '7px 9px' }}
                >
                  {timeSlots.map(slot => (
                    <option key={`ov-start-${slot}`} value={slot}>
                      {slot}
                    </option>
                  ))}
                </select>
                <select
                  value={overrideEnd}
                  onChange={e => setOverrideEnd(e.target.value)}
                  style={{ background: '#1b1b33', color: '#e2e8f0', border: '1px solid rgba(255,255,255,0.14)', borderRadius: 8, padding: '7px 9px' }}
                >
                  {timeSlots.filter(slot => slot > overrideStart).map(slot => (
                    <option key={`ov-end-${slot}`} value={slot}>
                      {slot}
                    </option>
                  ))}
                </select>
              </div>
              <button
                type="button"
                disabled={!canAddOverride}
                onClick={() => {
                  if (!dateKey || !canAddOverride) return
                  addOverride(teacherId, dateKey, { start: overrideStart, end: overrideEnd })
                }}
                style={{
                  marginTop: 8,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  borderRadius: 8,
                  border: '1px solid rgba(74,222,128,0.35)',
                  background: canAddOverride ? 'rgba(74,222,128,0.14)' : 'rgba(255,255,255,0.05)',
                  color: canAddOverride ? '#86efac' : '#6b7280',
                  padding: '6px 10px',
                  cursor: canAddOverride ? 'pointer' : 'not-allowed',
                  fontSize: 11,
                  fontWeight: 700,
                }}
              >
                <Plus size={12} /> Add override
              </button>
            </div>

            <div style={{ border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, padding: 10 }}>
              <div style={{ fontSize: 12, color: '#fca5a5', fontWeight: 800, marginBottom: 6 }}>Existing blackouts</div>
              {(dayExceptions.blackout ?? []).length === 0 ? (
                <div style={{ fontSize: 11, color: '#6b7280' }}>No blackouts for this date.</div>
              ) : (
                <div style={{ display: 'grid', gap: 6 }}>
                  {(dayExceptions.blackout ?? []).map((r, idx) => (
                    <div key={`bo-${idx}`} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, fontSize: 11, color: '#fecaca' }}>
                      <span>{r.start == null || r.end == null ? 'Full day' : `${r.start} - ${r.end}`}</span>
                      <button
                        type="button"
                        onClick={() => removeBlackout(teacherId, dateKey, idx)}
                        aria-label={`Remove blackout ${idx + 1}`}
                        style={{
                          border: '1px solid rgba(248,113,113,0.35)',
                          background: 'rgba(248,113,113,0.12)',
                          color: '#fca5a5',
                          borderRadius: 7,
                          padding: 4,
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div style={{ border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, padding: 10 }}>
              <div style={{ fontSize: 12, color: '#86efac', fontWeight: 800, marginBottom: 6 }}>Existing overrides</div>
              {(dayExceptions.override ?? []).length === 0 ? (
                <div style={{ fontSize: 11, color: '#6b7280' }}>No overrides for this date.</div>
              ) : (
                <div style={{ display: 'grid', gap: 6 }}>
                  {(dayExceptions.override ?? []).map((r, idx) => (
                    <div key={`ov-${idx}`} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, fontSize: 11, color: '#bbf7d0' }}>
                      <span>{`${r.start} - ${r.end}`}</span>
                      <button
                        type="button"
                        onClick={() => removeOverride(teacherId, dateKey, idx)}
                        aria-label={`Remove override ${idx + 1}`}
                        style={{
                          border: '1px solid rgba(74,222,128,0.35)',
                          background: 'rgba(74,222,128,0.12)',
                          color: '#86efac',
                          borderRadius: 7,
                          padding: 4,
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
