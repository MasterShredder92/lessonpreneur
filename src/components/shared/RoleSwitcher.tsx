import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthContext } from '../../app/AuthContext'
import { usePreviewMode } from '../../hooks/usePreviewMode'
import { useLocations } from '../../hooks/useLocations'

const ROLE_ROUTES: Record<string, string> = {
  owner: '/admin',
  company_director: '/admin',
  studio_director: '/admin',
  teacher: '/teacher/dashboard',
  parent: '/parent/dashboard',
}

const PREVIEW_ROLES: { key: string; label: string; emoji: string; minRole: 'owner' | 'company_director' }[] = [
  { key: 'owner', label: 'Owner', emoji: '\uD83D\uDC51', minRole: 'owner' },
  { key: 'company_director', label: 'Co. Director', emoji: '\uD83D\uDCCB', minRole: 'company_director' },
  { key: 'studio_director', label: 'Studio Director', emoji: '\uD83C\uDFB5', minRole: 'company_director' },
  { key: 'teacher', label: 'Teacher', emoji: '\uD83D\uDC68\u200D\uD83C\uDFEB', minRole: 'company_director' },
  { key: 'parent', label: 'Parent', emoji: '\uD83D\uDC68\u200D\uD83D\uDC69\u200D\uD83D\uDC67', minRole: 'company_director' },
]

const ROLE_LEVEL: Record<string, number> = { owner: 100, admin: 80, company_director: 80, studio_director: 60, teacher: 20, parent: 10 }

function formatLocationLabel(name: string | null | undefined): string {
  if (!name) return ''
  return name.replace(/ Music Lessons$/i, '').trim()
}

export default function RoleSwitcher() {
  const { role } = useAuthContext()
  const { preview, startPreview, stopPreview } = usePreviewMode()
  const { data: locations } = useLocations()
  const navigate = useNavigate()

  const userLevel = ROLE_LEVEL[role ?? ''] ?? 0
  if (userLevel < 80) return null

  const activeLocations = useMemo(
    () => (locations ?? []).filter((l: { is_active?: boolean }) => l.is_active !== false),
    [locations],
  )
  const firstLocation = activeLocations[0] as { id: string; name: string } | undefined

  const availableRoles = PREVIEW_ROLES.filter(r => userLevel >= (ROLE_LEVEL[r.minRole] ?? 100))

  const identityKey =
    role === 'owner' ? 'owner' : role === 'admin' || role === 'company_director' ? 'company_director' : role ?? ''

  const handleRoleClick = (roleKey: string) => {
    if (roleKey === 'owner') {
      stopPreview()
      navigate(ROLE_ROUTES.owner)
      return
    }
    if (roleKey === 'company_director' && (role === 'company_director' || role === 'admin')) {
      stopPreview()
      navigate(ROLE_ROUTES.company_director)
      return
    }
    if (roleKey === 'studio_director') {
      if (!firstLocation) return
      startPreview('studio_director', { locationId: firstLocation.id, locationName: firstLocation.name })
      navigate(ROLE_ROUTES.studio_director)
      return
    }
    startPreview(roleKey)
    navigate(ROLE_ROUTES[roleKey] ?? '/admin')
  }

  const handleLocationChange = (locationId: string) => {
    const loc = activeLocations.find((l: { id: string }) => l.id === locationId) as { id: string; name: string } | undefined
    if (!loc) return
    startPreview('studio_director', { locationId: loc.id, locationName: loc.name })
  }

  const effectiveRole = preview.active && preview.role ? preview.role : role

  return (
    <div style={{ position: 'relative', maxWidth: '100%', display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', gap: 3, padding: '3px 3px 3px 8px', background: 'rgba(255,255,255,0.03)', borderRadius: 8, border: '1px solid rgba(255,255,255,0.06)', overflowX: 'auto', WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
        {availableRoles.map(r => {
          const isActive =
            (preview.active && effectiveRole === r.key) ||
            (!preview.active && r.key === identityKey)
          return (
            <button
              key={r.key}
              type="button"
              disabled={r.key === 'studio_director' && !firstLocation}
              onClick={() => handleRoleClick(r.key)}
              style={{
                padding: '6px 12px', borderRadius: 6, fontSize: 10, fontWeight: 600, cursor: r.key === 'studio_director' && !firstLocation ? 'not-allowed' : 'pointer',
                background: isActive ? 'rgba(245,158,11,0.12)' : 'transparent',
                color: isActive ? '#f59e0b' : '#606088',
                border: 'none', display: 'flex', alignItems: 'center', gap: 4,
                whiteSpace: 'nowrap', flexShrink: 0, minHeight: 32,
                opacity: r.key === 'studio_director' && !firstLocation ? 0.45 : 1,
              }}
            >
              <span style={{ fontSize: 12 }}>{r.emoji}</span>
              {r.label}
            </button>
          )
        })}
      </div>

      {preview.active && preview.role === 'studio_director' && activeLocations.length > 0 && (
        <div style={{ paddingLeft: 4 }}>
          <select
            value={preview.locationId ?? activeLocations[0]?.id ?? ''}
            onChange={e => handleLocationChange(e.target.value)}
            style={{
              width: '100%',
              maxWidth: 280,
              padding: '6px 10px',
              borderRadius: 6,
              border: '1px solid rgba(255,255,255,0.1)',
              background: 'rgba(0,165,232,0.08)',
              color: '#E0E0F4',
              fontSize: 11,
              fontFamily: 'inherit',
              cursor: 'pointer',
            }}
          >
            {activeLocations.map((l: { id: string; name: string }) => (
              <option key={l.id} value={l.id}>
                {formatLocationLabel(l.name)}
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  )
}
