import { useNavigate } from 'react-router-dom'
import { usePreviewMode } from '../../hooks/usePreviewMode'
import { Eye, X } from 'lucide-react'

const ROLE_CONFIG: Record<string, { color: string; bg: string; border: string; label: string }> = {
  company_director: { color: '#f59e0b', bg: 'rgba(245,158,11,0.06)', border: 'rgba(245,158,11,0.15)', label: 'Company Director' },
  studio_director: { color: '#f59e0b', bg: 'rgba(245,158,11,0.06)', border: 'rgba(245,158,11,0.15)', label: 'Studio Director' },
  teacher: { color: '#22C55E', bg: 'rgba(34,197,94,0.06)', border: 'rgba(34,197,94,0.15)', label: 'Teacher' },
  parent: { color: '#3b82f6', bg: 'rgba(59,130,246,0.06)', border: 'rgba(59,130,246,0.15)', label: 'Parent' },
}

export default function PreviewBanner() {
  const { preview, stopPreview } = usePreviewMode()
  const navigate = useNavigate()
  if (!preview.active || !preview.role) return null

  const handleExit = () => {
    stopPreview()
    navigate('/admin/dashboard')
  }

  const config = ROLE_CONFIG[preview.role] ?? ROLE_CONFIG.teacher

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, zIndex: 9999,
      padding: '8px 20px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
      background: config.bg, borderBottom: `1px solid ${config.border}`,
    }}>
      <Eye size={14} style={{ color: config.color }} />
      <span style={{ fontSize: 12, fontWeight: 700, color: config.color }}>
        Previewing as {config.label}
        {preview.locationName && ` — ${preview.locationName}`}
        {preview.studentName && ` of ${preview.studentName}`}
      </span>
      <button onClick={handleExit} style={{
        display: 'flex', alignItems: 'center', gap: 4, padding: '3px 10px', borderRadius: 6,
        background: 'rgba(255,255,255,0.06)', color: '#A0A0C8', border: '1px solid rgba(255,255,255,0.08)',
        fontSize: 11, fontWeight: 600, cursor: 'pointer',
      }}>
        <X size={10} /> Exit Preview
      </button>
    </div>
  )
}
