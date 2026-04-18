import { useState, useEffect, useCallback, createContext, useContext } from 'react'
import { createPortal } from 'react-dom'

type ToastVariant = 'success' | 'error' | 'warning' | 'info'

interface ToastItem {
  id: number
  message: string
  variant: ToastVariant
}

const VARIANT_STYLES: Record<ToastVariant, { bg: string; border: string; color: string }> = {
  success: { bg: 'var(--success-12)', border: 'var(--success-30)', color: 'var(--color-success)' },
  error:   { bg: 'var(--danger-10)', border: 'var(--danger-30)', color: 'var(--color-danger)' },
  warning: { bg: 'var(--warning-12)', border: 'var(--warning-30)', color: 'var(--color-warning)' },
  info:    { bg: 'var(--sky-10)', border: 'var(--sky-20)', color: 'var(--color-sky)' },
}

let _nextId = 0
let _addToast: ((message: string, variant: ToastVariant) => void) | null = null

/** Fire-and-forget toast from anywhere (after ToastProvider mounts) */
export function toast(message: string, variant: ToastVariant = 'info') {
  _addToast?.(message, variant)
}

export function useToast() {
  return { toast }
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])

  const add = useCallback((message: string, variant: ToastVariant) => {
    const id = ++_nextId
    setToasts(prev => [...prev, { id, message, variant }])
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4000)
  }, [])

  useEffect(() => { _addToast = add; return () => { _addToast = null } }, [add])

  return (
    <>
      {children}
      {createPortal(
        <div style={{ position: 'fixed', top: 'var(--space-2xl)', right: 'var(--space-2xl)', zIndex: 999999, display: 'flex', flexDirection: 'column', gap: 'var(--space-sm)', pointerEvents: 'none' }}>
          {toasts.map(t => {
            const s = VARIANT_STYLES[t.variant]
            return (
              <div key={t.id} style={{
                pointerEvents: 'auto',
                padding: 'var(--space-md) var(--space-2xl)', borderRadius: 'var(--radius-md)',
                background: s.bg, border: `var(--border-width) solid ${s.border}`,
                boxShadow: 'var(--shadow-md)',
                color: s.color, fontSize: 'var(--font-size-md)', fontWeight: 'var(--font-weight-medium)',
                animation: 'toast-in 200ms ease',
                maxWidth: 'calc(var(--space-2xl) * 18)',
              }}>
                {t.message}
              </div>
            )
          })}
        </div>,
        document.body
      )}
      <style>{`@keyframes toast-in { from { opacity: 0; transform: translateX(var(--space-5xl)); } to { opacity: 1; transform: translateX(0); } }`}</style>
    </>
  )
}
