import { useState } from 'react'
import { createPortal } from 'react-dom'
import { X, Lock } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { toast } from './Toast'

interface Props {
  open: boolean
  onClose: () => void
}

export default function ChangePasswordModal({ open, onClose }: Props) {
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const reset = () => {
    setCurrentPassword('')
    setNewPassword('')
    setConfirmPassword('')
    setError(null)
  }

  const handleClose = () => {
    if (!submitting) { reset(); onClose() }
  }

  const handleSubmit = async () => {
    setError(null)

    if (!currentPassword.trim()) { setError('Current password is required'); return }
    if (newPassword.length < 8) { setError('New password must be at least 8 characters'); return }
    if (newPassword !== confirmPassword) { setError('New passwords do not match'); return }

    setSubmitting(true)
    try {
      // Verify current password by re-authenticating
      const { data: { user } } = await supabase.auth.getUser()
      if (!user?.email) { setError('Could not verify account'); setSubmitting(false); return }

      const { error: signInErr } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: currentPassword,
      })
      if (signInErr) { setError('Current password is incorrect'); setSubmitting(false); return }

      // Update password
      const { error: updateErr } = await supabase.auth.updateUser({ password: newPassword })
      if (updateErr) throw updateErr

      toast('Password updated successfully', 'success')
      reset()
      onClose()
    } catch (err: any) {
      setError(err?.message ?? 'Failed to update password')
    } finally {
      setSubmitting(false)
    }
  }

  if (!open) return null

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '10px 12px', borderRadius: 8,
    border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.04)',
    color: '#E8E8FC', fontSize: 13, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box',
  }

  return createPortal(
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 10000,
        background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
      onClick={handleClose}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: 400, maxWidth: 'calc(100vw - 32px)',
          background: 'rgba(16, 14, 30, 0.99)', border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 16, padding: 24, boxShadow: '0 24px 80px rgba(0,0,0,0.8)',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 32, height: 32, borderRadius: '50%',
              background: 'rgba(212, 34, 106, 0.15)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Lock size={16} style={{ color: '#D4226A' }} />
            </div>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#E8E8FC' }}>Change Password</div>
          </div>
          <button onClick={handleClose} style={{ background: 'none', border: 'none', color: '#8080A8', cursor: 'pointer', padding: 4 }}>
            <X size={18} />
          </button>
        </div>

        {/* Form */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: '#A0A0C8', marginBottom: 4, display: 'block' }}>Current Password</label>
            <input
              type="password"
              value={currentPassword}
              onChange={e => setCurrentPassword(e.target.value)}
              placeholder="Enter current password"
              autoComplete="current-password"
              style={inputStyle}
            />
          </div>

          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: '#A0A0C8', marginBottom: 4, display: 'block' }}>New Password</label>
            <input
              type="password"
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
              placeholder="Minimum 8 characters"
              autoComplete="new-password"
              style={inputStyle}
            />
          </div>

          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: '#A0A0C8', marginBottom: 4, display: 'block' }}>Confirm New Password</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              placeholder="Re-enter new password"
              autoComplete="new-password"
              onKeyDown={e => { if (e.key === 'Enter') handleSubmit() }}
              style={inputStyle}
            />
          </div>

          {error && (
            <div style={{ fontSize: 12, color: '#EF4444', background: 'rgba(239,68,68,0.08)', padding: '8px 12px', borderRadius: 8 }}>
              {error}
            </div>
          )}

          <button
            onClick={handleSubmit}
            disabled={submitting}
            style={{
              width: '100%', padding: 12, borderRadius: 10, border: 'none',
              background: submitting ? 'rgba(212,34,106,0.3)' : '#D4226A',
              color: '#fff', fontSize: 14, fontWeight: 700, cursor: submitting ? 'wait' : 'pointer',
              fontFamily: 'inherit', transition: 'background 150ms ease',
            }}
          >
            {submitting ? 'Updating...' : 'Update Password'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
