import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthContext } from '../../app/AuthContext'
import { usePreviewMode } from '../../hooks/usePreviewMode'
import { useLocations } from '../../hooks/useLocations'

const ROLE_ROUTES: Record<string, string> = {
  owner: '/admin/dashboard',
  company_director: '/admin/dashboard',
  studio_director: '/admin/dashboard',
  teacher: '/teacher/dashboard',
  parent: '/parent/dashboard',
}

const PREVIEW_ROLES = [
  { key: 'owner', label: 'Owner', emoji: '\uD83D\uDC51', minRole: 'owner' },
  { key: 'company_director', label: 'Co. Director', emoji: '\uD83D\uDCCB', minRole: 'owner' },
  { key: 'studio_director', label: 'Studio Dir.', emoji: '\uD83C\uDFB5', minRole: 'company_director' },
  { key: 'site', label: 'Location', emoji: '\uD83C\uDF10', minRole: 'company_director' },
  { key: 'teacher', label: 'Teacher', emoji: '\uD83D\uDC68\u200D\uD83C\uDFEB', minRole: 'company_director' },
  { key: 'parent', label: 'Parent', emoji: '\uD83D\uDC68\u200D\uD83D\uDC69\u200D\uD83D\uDC67', minRole: 'company_director' },
]

/** Map DB location name → public marketing route slug */
function locationSlug(name: string): string {
  return name.replace(/ Music Lessons$/i, '').trim().toLowerCase()
}

const ROLE_LEVEL: Record<string, number> = { owner: 100, admin: 80, company_director: 80, studio_director: 60, teacher: 20, parent: 10 }

export default function RoleSwitcher() {
  const { role } = useAuthContext()
  const { preview, startPreview, stopPreview } = usePreviewMode()
  const { data: locations } = useLocations()
  const navigate = useNavigate()
  const [showPicker, setShowPicker] = useState(false)
  const [pickerPos, setPickerPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 })
  const siteBtnRef = useRef<HTMLButtonElement>(null)

  const userLevel = ROLE_LEVEL[role ?? ''] ?? 0
  // Only owner and company_director can preview
  if (userLevel < 80) return null

  const availableRoles = PREVIEW_ROLES.filter(r => {
    const minLevel = ROLE_LEVEL[r.minRole] ?? 100
    return userLevel >= minLevel
  })

  const handleRoleClick = (roleKey: string) => {
    if (roleKey === role || roleKey === 'owner') {
      stopPreview()
      setShowPicker(false)
      navigate(ROLE_ROUTES[role ?? 'owner'] ?? '/admin/dashboard')
      return
    }
    // Location preview → open site picker
    if (roleKey === 'site') {
      if (siteBtnRef.current) {
        const rect = siteBtnRef.current.getBoundingClientRect()
        setPickerPos({ top: rect.bottom + 4, left: rect.left })
      }
      setShowPicker(true)
      return
    }
    startPreview(roleKey)
    setShowPicker(false)
    navigate(ROLE_ROUTES[roleKey] ?? '/admin/dashboard')
  }

  const handleLocationPick = (locName: string) => {
    setShowPicker(false)
    navigate(`/${locationSlug(locName)}`)
  }

  const effectiveRole = preview.active ? preview.role : role

  return (
    <div style={{ position: 'relative', maxWidth: '100%' }}>
      <div style={{ display: 'flex', gap: 3, padding: '3px 3px 3px 8px', background: 'rgba(255,255,255,0.03)', borderRadius: 8, border: '1px solid rgba(255,255,255,0.06)', overflowX: 'auto', WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
        {availableRoles.map(r => {
          const isActive = effectiveRole === r.key || (!preview.active && r.key === role)
          return (
            <button key={r.key} ref={r.key === 'site' ? siteBtnRef : undefined} onClick={() => handleRoleClick(r.key)} style={{
              padding: '6px 12px', borderRadius: 6, fontSize: 10, fontWeight: 600, cursor: 'pointer',
              background: isActive ? 'rgba(245,158,11,0.12)' : 'transparent',
              color: isActive ? '#f59e0b' : '#606088',
              border: 'none', display: 'flex', alignItems: 'center', gap: 4,
              whiteSpace: 'nowrap', flexShrink: 0, minHeight: 32,
            }}>
              <span style={{ fontSize: 12 }}>{r.emoji}</span>
              {r.label}
            </button>
          )
        })}
      </div>

      {/* Location picker — navigates to public marketing site for QA */}
      {showPicker && (
        <div style={{
          position: 'fixed', top: pickerPos.top, left: pickerPos.left, zIndex: 9999,
          background: '#101018', border: '1px solid #1a1a28', borderRadius: 10,
          boxShadow: '0 8px 24px rgba(0,0,0,0.5)', padding: 4, minWidth: 180,
        }}>
          <div style={{ padding: '6px 10px', fontSize: 10, color: '#8080A8', fontWeight: 600 }}>Preview site at which location?</div>
          {locations?.filter((l: any) => l.is_active).map((l: any) => (
            <button key={l.id} onClick={() => handleLocationPick(l.name)} style={{
              display: 'block', width: '100%', padding: '8px 10px', borderRadius: 6,
              background: 'none', border: 'none', color: '#E0E0F4', fontSize: 12,
              cursor: 'pointer', textAlign: 'left',
            }}
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.04)'}
              onMouseLeave={e => e.currentTarget.style.background = 'none'}
            >
              {l.name.replace(' Music Lessons', '')}
            </button>
          ))}
          <button onClick={() => setShowPicker(false)} style={{ display: 'block', width: '100%', padding: '6px 10px', borderRadius: 6, background: 'none', border: 'none', color: '#606088', fontSize: 11, cursor: 'pointer', textAlign: 'left' }}>Cancel</button>
        </div>
      )}
    </div>
  )
}
