import { createPortal } from 'react-dom'
import { Lock } from 'lucide-react'

interface Props {
  message?: string
  onClose: () => void
}

export default function AccessDenied({ message = "You don't have permission to perform this action.", onClose }: Props) {
  return createPortal(
    <div style={{ position: 'fixed', inset: 0, zIndex: 99999, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ width: 360, background: '#141224', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 16, boxShadow: '0 16px 48px rgba(0,0,0,0.6)', padding: '28px 24px', textAlign: 'center' }}>
        <Lock size={32} style={{ color: '#EF4444', marginBottom: 12 }} />
        <div style={{ fontSize: 16, fontWeight: 800, color: '#E0E0F4', marginBottom: 8 }}>Access Restricted</div>
        <div style={{ fontSize: 13, color: '#A0A0C8', lineHeight: 1.5, marginBottom: 20 }}>{message}</div>
        <button onClick={onClose} style={{ padding: '10px 24px', borderRadius: 10, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: '#A0A0C8', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>Got it</button>
      </div>
    </div>,
    document.body
  )
}
