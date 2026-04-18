import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthContext } from '../../app/AuthContext'
import { usePreviewMode } from '../../hooks/usePreviewMode'
import { useLocations } from '../../hooks/useLocations'
import { Crown, ClipboardList, GraduationCap, Users, Music2, MapPin } from 'lucide-react'

type TabKey = 'owner' | 'company_director' | 'studio_director' | 'teacher' | 'parent'

const VIEW_TABS: {
  key: TabKey
  label: string
  icon: typeof Crown
  route: string
  /** Minimum role level required to see this tab (person-role preview only). */
  minRole: 'owner' | 'company_director'
}[] = [
  { key: 'owner', label: 'Owner', icon: Crown, route: '/admin', minRole: 'owner' },
  { key: 'company_director', label: 'Co-Director', icon: ClipboardList, route: '/admin', minRole: 'company_director' },
  { key: 'studio_director', label: 'Studio Director', icon: Music2, route: '/admin', minRole: 'company_director' },
  { key: 'teacher', label: 'Teachers', icon: GraduationCap, route: '/teacher/dashboard', minRole: 'company_director' },
  { key: 'parent', label: 'Parents', icon: Users, route: '/parent/dashboard', minRole: 'company_director' },
]

const ROLE_LEVEL: Record<string, number> = {
  owner: 100, admin: 80, company_director: 80, studio_director: 60, teacher: 20, parent: 10,
}

function formatLocationLabel(name: string | null | undefined): string {
  if (!name) return ''
  return name.replace(/ Music Lessons$/i, '').trim()
}

/** How the signed-in user maps to a “home” tab when not previewing. */
function identityTabKey(role: string | null): TabKey {
  if (role === 'owner') return 'owner'
  if (role === 'admin' || role === 'company_director') return 'company_director'
  return 'company_director'
}

export default function TopViewTabs() {
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

  const activeKey: TabKey = (() => {
    if (preview.active && preview.role) {
      if (preview.role === 'studio_director') return 'studio_director'
      if (preview.role === 'teacher') return 'teacher'
      if (preview.role === 'parent') return 'parent'
      if (preview.role === 'company_director' || preview.role === 'admin') return 'company_director'
      if (preview.role === 'owner') return 'owner'
    }
    return identityTabKey(role)
  })()

  const firstLocation = activeLocations[0] as { id: string; name: string } | undefined

  const handleTabClick = (tab: (typeof VIEW_TABS)[number]) => {
    if (tab.key === 'owner') {
      stopPreview()
      navigate(tab.route)
      return
    }

    if (tab.key === 'company_director' && (role === 'company_director' || role === 'admin')) {
      stopPreview()
      navigate(tab.route)
      return
    }

    if (tab.key === 'studio_director') {
      if (!firstLocation) return
      startPreview('studio_director', {
        locationId: firstLocation.id,
        locationName: firstLocation.name,
      })
      navigate('/admin')
      return
    }

    startPreview(tab.key === 'company_director' ? 'company_director' : tab.key)
    navigate(tab.route)
  }

  const handleLocationChange = (locationId: string) => {
    const loc = activeLocations.find((l: { id: string }) => l.id === locationId) as { id: string; name: string } | undefined
    if (!loc) return
    startPreview('studio_director', { locationId: loc.id, locationName: loc.name })
  }

  const visibleTabs = VIEW_TABS.filter(t => userLevel >= (ROLE_LEVEL[t.minRole] ?? 100))

  const showLocationContext = preview.active && preview.role === 'studio_director'

  return (
    <div style={{ position: 'relative', width: '100%', display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{
        display: 'flex',
        gap: 2,
        padding: '4px',
        background: 'rgba(255,255,255,0.03)',
        borderRadius: 10,
        border: '1px solid rgba(255,255,255,0.06)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
      }}>
        {visibleTabs.map(tab => {
          const isActive = activeKey === tab.key
          const Icon = tab.icon
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => handleTabClick(tab)}
              disabled={tab.key === 'studio_director' && !firstLocation}
              title={tab.key === 'studio_director' && !firstLocation ? 'No active locations' : undefined}
              style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                padding: '10px 12px',
                borderRadius: 8,
                fontSize: 12,
                fontWeight: 700,
                letterSpacing: '0.02em',
                cursor: tab.key === 'studio_director' && !firstLocation ? 'not-allowed' : 'pointer',
                border: 'none',
                fontFamily: 'inherit',
                transition: 'all 200ms ease',
                opacity: tab.key === 'studio_director' && !firstLocation ? 0.45 : 1,
                background: isActive
                  ? 'linear-gradient(135deg, rgba(212,34,106,0.15), rgba(255,85,0,0.10))'
                  : 'transparent',
                color: isActive ? '#F0E0F4' : '#606088',
                boxShadow: isActive
                  ? '0 0 12px rgba(212,34,106,0.08), inset 0 1px 0 rgba(255,255,255,0.06)'
                  : 'none',
              }}
            >
              <Icon size={14} style={{ opacity: isActive ? 1 : 0.6 }} />
              <span>{tab.label}</span>
            </button>
          )
        })}
      </div>

      {showLocationContext && activeLocations.length > 0 && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '8px 12px',
          borderRadius: 8,
          background: 'rgba(0,165,232,0.06)',
          border: '1px solid rgba(0,165,232,0.12)',
        }}>
          <MapPin size={14} style={{ color: '#00A5E8', flexShrink: 0 }} />
          <label style={{ fontSize: 11, fontWeight: 700, color: '#8080A8', textTransform: 'uppercase', letterSpacing: '0.06em', flexShrink: 0 }}>
            Preview location
          </label>
          <select
            value={preview.locationId ?? activeLocations[0]?.id ?? ''}
            onChange={e => handleLocationChange(e.target.value)}
            style={{
              flex: 1,
              minWidth: 0,
              padding: '8px 10px',
              borderRadius: 8,
              border: '1px solid rgba(255,255,255,0.1)',
              background: 'rgba(0,0,0,0.25)',
              color: '#E0E0F4',
              fontSize: 13,
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
