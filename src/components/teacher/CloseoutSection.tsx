import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTeacherCloseoutStatus, useCompleteTeacherCloseout, useRecapReminders24h } from '../../hooks/useTeacherCloseout'
import { getInstrumentEmoji } from '../../utils/instrumentEmoji'
import { toast } from '../shared/Toast'
import { useAuthContext } from '../../app/AuthContext'

function formatTime(t: string) {
  const [h, m] = t.split(':')
  const hour = parseInt(h)
  const ampm = hour >= 12 ? 'PM' : 'AM'
  const display = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour
  return `${display}:${m} ${ampm}`
}

function formatTimeOfDay(iso: string) {
  const d = new Date(iso)
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
}

function dayLabel(dateStr: string) {
  const today = new Date().toISOString().split('T')[0]
  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0]
  if (dateStr === today) return 'Today'
  if (dateStr === yesterday) return 'Yesterday'
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })
}

interface CloseoutSectionProps {
  onOpenNoteModal: (params: { studentId: string; studentName: string; instrument: string | null; blockId: string; date: string }) => void
}

export default function CloseoutSection({ onOpenNoteModal }: CloseoutSectionProps) {
  const navigate = useNavigate()
  const { profile } = useAuthContext()
  const { data: status } = useTeacherCloseoutStatus()
  const { data: recapReminders } = useRecapReminders24h()
  const complete = useCompleteTeacherCloseout()
  const [modal, setModal] = useState<'blocked' | 'confirm' | null>(null)

  const teacherName = `${profile?.first_name ?? ''} ${profile?.last_name ?? ''}`.trim() || 'Teacher'

  // 24h recap reminders card (past sessions, excluding today)
  const overdueReminders = (recapReminders ?? []).filter(r => r.block_date !== (status?.today ?? ''))

  if (!status) return null

  // Nothing to show — no sessions today AND no overdue reminders
  if (status.sessionsToday.length === 0 && overdueReminders.length === 0) {
    return null
  }

  const handleClick = () => {
    if (!status) return
    if (status.missingRecaps.length > 0) {
      setModal('blocked')
    } else {
      setModal('confirm')
    }
  }

  const handleConfirm = async () => {
    try {
      await complete.mutateAsync({
        locationId: status.primaryLocationId,
        sessionsRequiringRecap: status.sessionsToday.length,
        sessionsWithRecap: status.sessionsToday.length - status.missingRecaps.length,
        teacherName,
      })
      setModal(null)
      toast('Day closed out — great work today!', 'success')
    } catch (err: any) {
      toast(err.message ?? 'Failed to close out', 'error')
    }
  }

  return (
    <>
      {/* 24h recap reminder cards */}
      {overdueReminders.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <h3 style={{ fontSize: 13, fontWeight: 800, color: '#E0E0F4', margin: '0 0 10px' }}>
            Missing Recaps
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {overdueReminders.map((r) => (
              <div key={r.block_id} style={{
                padding: '12px 14px', borderRadius: 10,
                background: 'rgba(255,184,0,0.04)', border: '1px solid rgba(255,184,0,0.2)',
                display: 'flex', alignItems: 'center', gap: 10,
              }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#E0E0F4' }}>
                    📝 Add recap for {r.student_first_name}
                  </div>
                  <div style={{ fontSize: 11, color: '#8080A8', marginTop: 2 }}>
                    {dayLabel(r.block_date)} · {r.instrument ? `${getInstrumentEmoji(r.instrument)} ${r.instrument.charAt(0).toUpperCase() + r.instrument.slice(1)}` : '—'} · {formatTime(r.start_time)}
                  </div>
                </div>
                <button
                  onClick={() => onOpenNoteModal({
                    studentId: r.student_id,
                    studentName: r.student_first_name,
                    instrument: r.instrument,
                    blockId: r.block_id,
                    date: r.block_date,
                  })}
                  style={{
                    padding: '8px 12px', borderRadius: 6, fontSize: 11, fontWeight: 700,
                    background: 'rgba(255,184,0,0.12)', color: '#FFB800',
                    border: '1px solid rgba(255,184,0,0.3)', cursor: 'pointer',
                    flexShrink: 0, whiteSpace: 'nowrap',
                  }}
                >
                  Add Notes →
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Closeout section */}
      {status.sessionsToday.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          {status.existingCloseout ? (
            <div style={{
              padding: '14px 16px', borderRadius: 10,
              background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.25)',
              textAlign: 'center',
            }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#22C55E' }}>
                ✅ Day closed out at {formatTimeOfDay(status.existingCloseout.closed_at)} — great work today!
              </div>
            </div>
          ) : (
            <button
              onClick={handleClick}
              disabled={complete.isPending}
              style={{
                width: '100%', minHeight: 52, padding: '14px 20px', borderRadius: 12,
                background: '#FFB800', color: '#000', fontSize: 16, fontWeight: 800,
                border: 'none', cursor: complete.isPending ? 'wait' : 'pointer',
                boxShadow: '0 4px 16px rgba(255,184,0,0.25)',
                transition: 'transform 120ms ease, box-shadow 120ms ease',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 6px 20px rgba(255,184,0,0.35)' }}
              onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 4px 16px rgba(255,184,0,0.25)' }}
            >
              Close Out My Day
            </button>
          )}
        </div>
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
              background: '#0c0b16', borderRadius: 14, padding: 24, maxWidth: 420, width: '100%',
              border: '1px solid rgba(255,184,0,0.3)', boxShadow: '0 20px 60px rgba(0,0,0,0.6)',
            }}
          >
            <div style={{ fontSize: 18, fontWeight: 800, color: '#FFB800', marginBottom: 12 }}>
              ⚠️ Session Recaps Needed
            </div>
            <div style={{ fontSize: 13, color: '#C0C0E0', marginBottom: 14 }}>
              You still need to complete recaps for:
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 18 }}>
              {status.missingRecaps.map((m) => (
                <div key={m.block_id} style={{
                  padding: '10px 12px', borderRadius: 8,
                  background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)',
                  display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#E0E0F4',
                }}>
                  <span style={{ fontSize: 16 }}>{m.instrument ? getInstrumentEmoji(m.instrument) : '🎵'}</span>
                  <span style={{ fontWeight: 700, flex: 1 }}>{m.student_first_name}</span>
                  <span style={{ color: '#8080A8', fontSize: 12 }}>{formatTime(m.start_time)}</span>
                </div>
              ))}
            </div>
            <div style={{ fontSize: 12, color: '#8080A8', marginBottom: 18 }}>
              Complete these before closing out your day.
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={() => setModal(null)}
                style={{
                  flex: 1, padding: '12px', borderRadius: 8, fontSize: 13, fontWeight: 700,
                  background: 'rgba(255,255,255,0.04)', color: '#A0A0C8',
                  border: '1px solid rgba(255,255,255,0.08)', cursor: 'pointer',
                }}
              >
                Dismiss
              </button>
              <button
                onClick={() => { setModal(null); navigate('/teacher/students') }}
                style={{
                  flex: 1, padding: '12px', borderRadius: 8, fontSize: 13, fontWeight: 700,
                  background: '#FFB800', color: '#000', border: 'none', cursor: 'pointer',
                }}
              >
                Go to Students
              </button>
            </div>
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
              border: '1px solid rgba(255,184,0,0.3)', boxShadow: '0 20px 60px rgba(0,0,0,0.6)',
            }}
          >
            <div style={{ fontSize: 18, fontWeight: 800, color: '#FFB800', marginBottom: 12 }}>
              🌟 Ready to Close Out?
            </div>
            <div style={{ fontSize: 13, color: '#C0C0E0', marginBottom: 12, lineHeight: 1.55 }}>
              You've completed recaps for all <strong style={{ color: '#E0E0F4' }}>{status.sessionsToday.length}</strong> student{status.sessionsToday.length !== 1 ? 's' : ''} today. Nice work!
            </div>
            <div style={{ fontSize: 12, color: '#8080A8', marginBottom: 18, lineHeight: 1.55 }}>
              Closing out will log your end time for today: <strong style={{ color: '#A0A0C8' }}>{formatTimeOfDay(new Date().toISOString())}</strong>.
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
                  background: '#FFB800', color: '#000', border: 'none',
                  cursor: complete.isPending ? 'wait' : 'pointer',
                }}
              >
                {complete.isPending ? 'Closing...' : 'Close Out My Day'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
