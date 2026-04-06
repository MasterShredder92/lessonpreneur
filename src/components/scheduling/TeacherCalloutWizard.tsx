import { useState } from 'react'
import { createPortal } from 'react-dom'
import { useAuthContext } from '../../app/AuthContext'
import { useMarkTeacherCalledOut } from '../../hooks/useTeacherCallout'
import { PhoneOff, AlertTriangle, Check } from 'lucide-react'
import { toast } from '../shared/Toast'

interface Props {
  date: string
  locationId: string
  teachers: { id: string; name: string }[]
  onClose: () => void
  preSelectedTeacherId?: string
}

export default function TeacherCalloutWizard({ date, locationId, teachers, onClose, preSelectedTeacherId }: Props) {
  const { tenantId, profile } = useAuthContext()
  const markCalledOut = useMarkTeacherCalledOut()

  const [teacherId, setTeacherId] = useState(preSelectedTeacherId ?? '')
  const [reason, setReason] = useState('')
  const [confirming, setConfirming] = useState(false)
  const [done, setDone] = useState(false)
  const [blocksAffected, setBlocksAffected] = useState(0)
  const [error, setError] = useState<string | null>(null)

  const selectedTeacher = teachers.find(t => t.id === teacherId)

  const handleConfirm = async () => {
    if (!teacherId || !tenantId || !profile) return
    setConfirming(true)
    setError(null)
    try {
      const result = await markCalledOut.mutateAsync({
        teacherId,
        locationId,
        date,
        reason: reason.trim(),
        initiatedBy: profile.id,
        tenantId,
      })
      setBlocksAffected(result.blocksAffected)
      setDone(true)
      toast(`${selectedTeacher?.name ?? 'Teacher'} marked called out — ${result.blocksAffected} blocks affected`, 'success')
    } catch (err: any) {
      setError(err.message || 'Failed to mark teacher called out')
    } finally {
      setConfirming(false)
    }
  }

  const dateLabel = new Date(date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })

  return createPortal(
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{ width: 420, maxWidth: '92vw', borderRadius: 16, background: '#1A1830', border: '1px solid rgba(255,255,255,0.08)', boxShadow: '0 20px 60px rgba(0,0,0,0.5)', overflow: 'hidden' }}
      >
        {/* Header */}
        <div style={{ padding: '18px 22px 14px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: 'rgba(217,119,6,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <PhoneOff size={16} style={{ color: '#D97706' }} />
          </div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 800, color: '#E0E0F4' }}>Teacher Call Out</div>
            <div style={{ fontSize: 11, color: '#8080A8' }}>{dateLabel}</div>
          </div>
          <button onClick={onClose} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: '#8080A8', cursor: 'pointer', fontSize: 20, lineHeight: 1 }}>&times;</button>
        </div>

        <div style={{ padding: '18px 22px 22px' }}>
          {done ? (
            /* ── Success state ── */
            <div style={{ textAlign: 'center', padding: '12px 0' }}>
              <div style={{ width: 48, height: 48, borderRadius: '50%', background: 'rgba(34,197,94,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
                <Check size={24} style={{ color: '#22C55E' }} />
              </div>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#E0E0F4', marginBottom: 6 }}>{selectedTeacher?.name} marked called out</div>
              <div style={{ fontSize: 12, color: '#8080A8' }}>{blocksAffected} block{blocksAffected !== 1 ? 's' : ''} updated to Called Out</div>
              <button
                onClick={onClose}
                style={{ marginTop: 18, padding: '10px 28px', borderRadius: 10, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: '#E0E0F4', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
              >
                Done
              </button>
            </div>
          ) : (
            /* ── Form ── */
            <>
              {/* Teacher selector */}
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', fontSize: 10, fontWeight: 700, color: '#8080A8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Teacher</label>
                {preSelectedTeacherId ? (
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#E0E0F4', padding: '10px 14px', borderRadius: 10, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
                    {selectedTeacher?.name ?? 'Unknown'}
                  </div>
                ) : (
                  <select
                    value={teacherId}
                    onChange={e => setTeacherId(e.target.value)}
                    style={{ width: '100%', padding: '10px 14px', borderRadius: 10, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: '#E0E0F4', fontSize: 13, fontWeight: 600, outline: 'none', boxSizing: 'border-box' }}
                  >
                    <option value="">Select teacher...</option>
                    {teachers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                )}
              </div>

              {/* Reason (optional) */}
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', fontSize: 10, fontWeight: 700, color: '#8080A8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Reason <span style={{ fontWeight: 500, textTransform: 'none', letterSpacing: 0 }}>(optional)</span></label>
                <input
                  type="text"
                  value={reason}
                  onChange={e => setReason(e.target.value)}
                  placeholder="e.g. Sick, car trouble, personal..."
                  style={{ width: '100%', padding: '10px 14px', borderRadius: 10, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: '#E0E0F4', fontSize: 13, outline: 'none', boxSizing: 'border-box' }}
                />
              </div>

              {/* Confirmation warning */}
              {teacherId && (
                <div style={{ padding: '12px 14px', borderRadius: 10, background: 'rgba(217,119,6,0.08)', border: '1px solid rgba(217,119,6,0.2)', marginBottom: 16, display: 'flex', gap: 10 }}>
                  <AlertTriangle size={16} style={{ color: '#D97706', flexShrink: 0, marginTop: 1 }} />
                  <div style={{ fontSize: 12, color: '#D4C5A0', lineHeight: 1.5 }}>
                    This will mark <strong>all</strong> of {selectedTeacher?.name ?? 'this teacher'}'s blocks on {dateLabel} as called out. Booked students will need to be rescheduled.
                  </div>
                </div>
              )}

              {/* Error */}
              {error && (
                <div style={{ padding: '10px 14px', borderRadius: 10, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', marginBottom: 16, fontSize: 12, color: '#EF4444' }}>
                  {error}
                </div>
              )}

              {/* Actions */}
              <div style={{ display: 'flex', gap: 10 }}>
                <button
                  onClick={onClose}
                  style={{ flex: 1, padding: '11px 16px', borderRadius: 10, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#A0A0C8', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleConfirm}
                  disabled={!teacherId || confirming}
                  style={{
                    flex: 1, padding: '11px 16px', borderRadius: 10, border: 'none', fontSize: 13, fontWeight: 700, cursor: teacherId && !confirming ? 'pointer' : 'not-allowed',
                    background: teacherId && !confirming ? '#D97706' : '#44403C',
                    color: teacherId && !confirming ? '#fff' : '#8080A8',
                    opacity: teacherId ? 1 : 0.5,
                  }}
                >
                  {confirming ? 'Marking...' : 'Mark Called Out'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}
