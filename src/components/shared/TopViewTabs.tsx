import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthContext } from '../../app/AuthContext'
import { usePreviewMode } from '../../hooks/usePreviewMode'
import { useLocations } from '../../hooks/useLocations'
import { Crown, ClipboardList, MapPin, GraduationCap, Users } from 'lucide-react'

const VIEW_TABS = [
  { key: 'owner', label: 'Owner', icon: Crown, route: '/admin/dashboard', minRole: 'owner' },
  { key: 'company_director', label: 'Co-Director', icon: ClipboardList, route: '/admin/dashboard', minRole: 'owner' },
  { key: 'locations', label: 'Locations', icon: MapPin, route: null, minRole: 'company_director' },
  { key: 'teacher', label: 'Teachers', icon: GraduationCap, route: '/teacher/dashboard', minRole: 'company_director' },
  { key: 'parent', label: 'Parents', icon: Users, route: '/parent/dashboard', minRole: 'company_director' },
]

const ROLE_LEVEL: Record<string, number> = {
  owner: 100, admin: 80, company_director: 80, studio_director: 60, teacher: 20, parent: 10,
}

function locationSlug(name: string): string {
  return name.replace(/ Music Lessons$/i, '').trim().toLowerCase()
}

export default function TopViewTabs() {
  const { role } = useAuthContext()
  const { preview, startPreview, stopPreview } = usePreviewMode()
  const { data: locations } = useLocations()
  const navigate = useNavigate()
  const [showLocPicker, setShowLocPicker] = useState(false)
  const locBtnRef = useRef<HTMLButtonElement>(null)
  const [pickerPos, setPickerPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 })

  const userLevel = ROLE_LEVEL[role ?? ''] ?? 0
  if (userLevel < 80) return null

  const effectiveRole = preview.active ? preview.role : role
  const activeKey =
    effectiveRole === 'studio_director' ? 'locations' :
    effectiveRole === 'company_director' ? 'company_director' :
    effectiveRole === 'teacher' ? 'teacher' :
    effectiveRole === 'parent' ? 'parent' :
    'owner'

  const handleTabClick = (tab: typeof VIEW_TABS[number]) => {
    if (tab.key === 'locations') {
      if (locBtnRef.current) {
        const rect = locBtnRef.current.getBoundingClientRect()
        setPickerPos({ top: rect.bottom + 6, left: rect.left })
      }
      setShowLocPicker(prev => !prev)
      return
    }

    setShowLocPicker(false)

    if (tab.key === 'owner') {
      stopPreview()
      navigate(tab.route!)
      return
    }

    startPreview(tab.key)
    navigate(tab.route!)
  }

  const handleLocationPick = (locName: string) => {
    setShowLocPicker(false)
    startPreview('studio_director')
    navigate(`/${locationSlug(locName)}`)
  }

  return (
    <div style={{ position: 'relative', width: '100%' }}>
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
        {VIEW_TABS.filter(t => userLevel >= (ROLE_LEVEL[t.minRole] ?? 100)).map(tab => {
          const isActive = activeKey === tab.key
          const Icon = tab.icon
          return (
            <button
              key={tab.key}
              ref={tab.key === 'locations' ? locBtnRef : undefined}
              onClick={() => handleTabClick(tab)}
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
                cursor: 'pointer',
                border: 'none',
                fontFamily: 'inherit',
                transition: 'all 200ms ease',
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

      {showLocPicker && (
        <>
          <div
            style={{ position: 'fixed', inset: 0, zIndex: 9998 }}
            onClick={() => setShowLocPicker(false)}
          />
          <div style={{
            position: 'fixed',
            top: pickerPos.top,
            left: pickerPos.left,
            zIndex: 9999,
            background: 'rgba(16,16,32,0.96)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 10,
            boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
            padding: 4,
            minWidth: 200,
            backdropFilter: 'blur(16px)',
            WebkitBackdropFilter: 'blur(16px)',
          }}>
            <div style={{ padding: '8px 12px', fontSize: 10, color: '#8080A8', fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
              Select Location
            </div>
            {locations?.filter((l: any) => l.is_active).map((l: any) => (
              <button
                key={l.id}
                onClick={() => handleLocationPick(l.name)}
                style={{
                  display: 'block',
                  width: '100%',
                  padding: '10px 12px',
                  borderRadius: 6,
                  background: 'none',
                  border: 'none',
                  color: '#E0E0F4',
                  fontSize: 13,
                  fontWeight: 500,
                  cursor: 'pointer',
                  textAlign: 'left',
                  fontFamily: 'inherit',
                }}
                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.04)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'none')}
              >
                <MapPin size={12} style={{ marginRight: 8, opacity: 0.5, verticalAlign: 'middle' }} />
                {l.name.replace(' Music Lessons', '')}
              </button>
            ))}
            <button
              onClick={() => setShowLocPicker(false)}
              style={{
                display: 'block',
                width: '100%',
                padding: '8px 12px',
                borderRadius: 6,
                background: 'none',
                border: 'none',
                color: '#606088',
                fontSize: 11,
                cursor: 'pointer',
                textAlign: 'left',
                fontFamily: 'inherit',
              }}
            >
              Cancel
            </button>
          </div>
        </>
      )}
    </div>
  )
}
