import { useState, useEffect, useCallback, createContext, useContext } from 'react'
import { createPortal } from 'react-dom'

type ToastVariant = 'success' | 'error' | 'warning' | 'info'

interface ToastItem {
  id: number
  message: string
  variant: ToastVariant
}

const VARIANT_STYLES: Record<ToastVariant, { bg: string; border: string; color: string }> = {
  success: { bg: 'rgba(34,197,94,0.12)', border: 'rgba(34,197,94,0.3)', color: '#22C55E' },
  error:   { bg: 'rgba(239,68,68,0.12)', border: 'rgba(239,68,68,0.3)', color: '#EF4444' },
  warning: { bg: 'rgba(255,184,0,0.12)', border: 'rgba(255,184,0,0.3)', color: '#FFB800' },
  info:    { bg: 'rgba(56,189,248,0.12)', border: 'rgba(56,189,248,0.3)', color: '#38BDF8' },
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
        <div style={{ position: 'fixed', top: 20, right: 20, zIndex: 999999, display: 'flex', flexDirection: 'column', gap: 8, pointerEvents: 'none' }}>
          {toasts.map(t => {
            const s = VARIANT_STYLES[t.variant]
            return (
              <div key={t.id} style={{
                pointerEvents: 'auto',
                padding: '12px 20px', borderRadius: 10,
                background: '#1A1830', border: `1px solid ${s.border}`,
                boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
                color: s.color, fontSize: 13, fontWeight: 600,
                animation: 'toast-in 200ms ease',
                maxWidth: 360,
              }}>
                {t.message}
              </div>
            )
          })}
        </div>,
        document.body
      )}
      <style>{`@keyframes toast-in { from { opacity: 0; transform: translateX(40px); } to { opacity: 1; transform: translateX(0); } }`}</style>
    </>
  )
}
