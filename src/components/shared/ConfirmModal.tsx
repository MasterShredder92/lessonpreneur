import { useState } from 'react'
import { createPortal } from 'react-dom'
import { AlertTriangle } from 'lucide-react'

interface ConfirmModalProps {
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  variant?: 'warning' | 'danger' | 'info'
  requireReason?: boolean
  reasonLabel?: string
  onConfirm: (reason?: string) => void
  onCancel: () => void
}

const VARIANT_COLORS = {
  warning: { bg: 'rgba(255,184,0,0.08)', border: 'rgba(255,184,0,0.2)', icon: '#FFB800', btn: '#FFB800' },
  danger: { bg: 'rgba(239,68,68,0.08)', border: 'rgba(239,68,68,0.2)', icon: '#EF4444', btn: '#DC0000' },
  info: { bg: 'rgba(56,189,248,0.08)', border: 'rgba(56,189,248,0.2)', icon: '#38BDF8', btn: '#38BDF8' },
}

export default function ConfirmModal({ title, message, confirmLabel = 'Confirm', cancelLabel = 'Cancel', variant = 'warning', requireReason = false, reasonLabel = 'Reason — Required', onConfirm, onCancel }: ConfirmModalProps) {
  const [reason, setReason] = useState('')
  const colors = VARIANT_COLORS[variant]
  const canConfirm = !requireReason || reason.trim().length > 0

  return createPortal(
    <div style={{ position: 'fixed', inset: 0, zIndex: 99999, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={onCancel}>
      <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 420, margin: '0 16px', background: '#141224', border: `1px solid ${colors.border}`, borderRadius: 16, boxShadow: '0 16px 48px rgba(0,0,0,0.6)', overflow: 'hidden' }}>
        {/* Header with icon */}
        <div style={{ padding: '20px 24px 16px', display: 'flex', alignItems: 'flex-start', gap: 14 }}>
          <div style={{ width: 40, height: 40, borderRadius: 10, background: colors.bg, border: `1px solid ${colors.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <AlertTriangle size={20} style={{ color: colors.icon }} />
          </div>
          <div>
            <div style={{ fontSize: 16, fontWeight: 800, color: '#E0E0F4', marginBottom: 4 }}>{title}</div>
            <div style={{ fontSize: 13, color: '#A0A0C8', lineHeight: 1.5 }}>{message}</div>
          </div>
        </div>

        {/* Reason field */}
        {requireReason && (
          <div style={{ padding: '0 24px 16px' }}>
            <label style={{ fontSize: 10, fontWeight: 700, color: colors.icon, textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: 6 }}>{reasonLabel}</label>
            <textarea
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="Enter a reason..."
              autoFocus
              rows={2}
              style={{
                width: '100%', padding: '10px 14px', borderRadius: 10,
                border: `1px solid ${reason.trim() ? 'rgba(255,255,255,0.1)' : colors.border}`,
                background: 'rgba(255,255,255,0.04)', color: '#E0E0F4', fontSize: 13,
                outline: 'none', boxSizing: 'border-box', resize: 'vertical', fontFamily: 'inherit',
              }}
            />
          </div>
        )}

        {/* Actions */}
        <div style={{ padding: '12px 24px 20px', display: 'flex', gap: 8 }}>
          <button
            onClick={onCancel}
            style={{ flex: 1, padding: '12px 16px', borderRadius: 10, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#8080A8', cursor: 'pointer', fontWeight: 600, fontSize: 13, minHeight: 44 }}
          >
            {cancelLabel}
          </button>
          <button
            onClick={() => canConfirm && onConfirm(reason.trim() || undefined)}
            disabled={!canConfirm}
            style={{
              flex: 1, padding: '12px 16px', borderRadius: 10, border: 'none', cursor: canConfirm ? 'pointer' : 'not-allowed',
              background: canConfirm ? colors.btn : '#606088', color: '#fff', fontWeight: 700, fontSize: 13,
              opacity: canConfirm ? 1 : 0.5, minHeight: 44,
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
