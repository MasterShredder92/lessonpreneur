import { useState, useEffect } from 'react'
import { X, Download } from 'lucide-react'

export default function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null)
  const [dismissed, setDismissed] = useState(() => localStorage.getItem('pwa-install-dismissed') === 'true')

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault()
      setDeferredPrompt(e)
    }
    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  if (!deferredPrompt || dismissed) return null

  const handleInstall = async () => {
    deferredPrompt.prompt()
    const { outcome } = await deferredPrompt.userChoice
    if (outcome === 'accepted') setDeferredPrompt(null)
  }

  const handleDismiss = () => {
    setDismissed(true)
    localStorage.setItem('pwa-install-dismissed', 'true')
  }

  return (
    <div style={{
      position: 'fixed', bottom: 16, left: '50%', transform: 'translateX(-50%)',
      zIndex: 9999, maxWidth: 400, width: 'calc(100% - 32px)',
      padding: '12px 16px', borderRadius: 12,
      background: '#101018', border: '1px solid rgba(245,158,11,0.2)',
      boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
      display: 'flex', alignItems: 'center', gap: 12,
      animation: 'fadeIn 300ms ease',
    }}>
      <Download size={18} style={{ color: '#f59e0b', flexShrink: 0 }} />
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#E0E0F4' }}>Install Lessonpreneur</div>
        <div style={{ fontSize: 11, color: '#8080A8' }}>Add to your home screen for the best experience</div>
      </div>
      <button onClick={handleInstall} style={{
        padding: '6px 14px', borderRadius: 6, fontSize: 12, fontWeight: 700,
        background: '#f59e0b', color: '#000', border: 'none', cursor: 'pointer', whiteSpace: 'nowrap',
      }}>Install</button>
      <button onClick={handleDismiss} style={{ background: 'none', border: 'none', color: '#606088', cursor: 'pointer', padding: 4 }}>
        <X size={14} />
      </button>
    </div>
  )
}
