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
  warning: { bg: 'var(--warning-8)', border: 'var(--warning-20)', icon: 'var(--color-warning)', btn: 'var(--color-warning)' },
  danger: { bg: 'var(--danger-8)', border: 'var(--danger-20)', icon: 'var(--color-danger)', btn: 'var(--red-dark)' },
  info: { bg: 'var(--sky-8)', border: 'var(--sky-20)', icon: 'var(--color-sky)', btn: 'var(--color-sky)' },
}

export default function ConfirmModal({ title, message, confirmLabel = 'Confirm', cancelLabel = 'Cancel', variant = 'warning', requireReason = false, reasonLabel = 'Reason — Required', onConfirm, onCancel }: ConfirmModalProps) {
  const [reason, setReason] = useState('')
  const colors = VARIANT_COLORS[variant]
  const canConfirm = !requireReason || reason.trim().length > 0

  return createPortal(
    <div style={{ position: 'fixed', inset: 0, zIndex: 99999, background: 'var(--overlay-scrim-70)', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={onCancel}>
      <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 'var(--max-width-confirm)', margin: '0 var(--space-lg)', background: 'var(--surface-modal)', border: `var(--border-width) solid ${colors.border}`, borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-elevated)', overflow: 'hidden' }}>
        {/* Header with icon */}
        <div style={{ padding: 'var(--space-2xl) var(--space-xl) var(--space-lg)', display: 'flex', alignItems: 'flex-start', gap: 'calc(var(--space-md) + var(--space-2xs))' }}>
          <div style={{ width: 'var(--space-5xl)', height: 'var(--space-5xl)', borderRadius: 'var(--radius-md)', background: colors.bg, border: `var(--border-width) solid ${colors.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <AlertTriangle size={20} style={{ color: colors.icon }} />
          </div>
          <div>
            <div style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 'var(--font-weight-bold)', color: 'var(--text-secondary)', marginBottom: 'var(--space-xs)' }}>{title}</div>
            <div style={{ fontSize: 'var(--font-size-md)', color: 'var(--text-muted)', lineHeight: 1.5 }}>{message}</div>
          </div>
        </div>

        {/* Reason field */}
        {requireReason && (
          <div style={{ padding: '0 var(--space-xl) var(--space-lg)' }}>
            <label style={{ fontSize: 'var(--font-size-xs)', fontWeight: 'var(--font-weight-bold)', color: colors.icon, textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: 'var(--space-6)' }}>{reasonLabel}</label>
            <textarea
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="Enter a reason..."
              autoFocus
              rows={2}
              style={{
                width: '100%', padding: 'var(--space-10) calc(var(--space-md) + var(--space-2xs))', borderRadius: 'var(--radius-md)',
                border: `var(--border-width) solid ${reason.trim() ? 'var(--white-10)' : colors.border}`,
                background: 'var(--white-4)', color: 'var(--text-secondary)', fontSize: 'var(--font-size-md)',
                outline: 'none', boxSizing: 'border-box', resize: 'vertical', fontFamily: 'inherit',
              }}
            />
          </div>
        )}

        {/* Actions */}
        <div style={{ padding: 'var(--space-md) var(--space-xl) var(--space-2xl)', display: 'flex', gap: 'var(--space-sm)' }}>
          <button
            onClick={onCancel}
            style={{ flex: 1, padding: 'var(--space-md) var(--space-lg)', borderRadius: 'var(--radius-md)', background: 'var(--white-4)', border: 'var(--border-width) solid var(--white-8)', color: 'var(--text-placard)', cursor: 'pointer', fontWeight: 'var(--font-weight-medium)', fontSize: 'var(--font-size-md)', minHeight: 'var(--space-message-send)' }}
          >
            {cancelLabel}
          </button>
          <button
            onClick={() => canConfirm && onConfirm(reason.trim() || undefined)}
            disabled={!canConfirm}
            style={{
              flex: 1, padding: 'var(--space-md) var(--space-lg)', borderRadius: 'var(--radius-md)', border: 'none', cursor: canConfirm ? 'pointer' : 'not-allowed',
              background: canConfirm ? colors.btn : 'var(--text-caption)', color: 'var(--text-primary)', fontWeight: 'var(--font-weight-bold)', fontSize: 'var(--font-size-md)',
              opacity: canConfirm ? 1 : 0.5, minHeight: 'var(--space-message-send)',
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
