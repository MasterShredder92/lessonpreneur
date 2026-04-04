import { useState, useRef, useEffect } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import PageTransition from '../shared/PageTransition'
import { useAuthContext } from '../../app/AuthContext'
import { usePreviewMode } from '../../hooks/usePreviewMode'
import RoleSwitcher from '../shared/RoleSwitcher'
import { useTheme } from '../../hooks/useTheme'
import { LayoutDashboard, Calendar, Users, FileText, LogOut, KeyRound } from 'lucide-react'
import ChangePasswordModal from '../shared/ChangePasswordModal'
import TeacherMobileTabBar from './TeacherMobileTabBar'

const NAV_ITEMS = [
  { label: 'Dashboard', path: '/teacher/dashboard', icon: <LayoutDashboard size={18} /> },
  { label: 'Schedule', path: '/teacher/schedule', icon: <Calendar size={18} /> },
  { label: 'Students', path: '/teacher/students', icon: <Users size={18} /> },
  { label: 'My Documents', path: '/teacher/documents', icon: <FileText size={18} /> },
]

export default function TeacherShell() {
  const { profile, locationIds, signOut } = useAuthContext()
  const { preview } = usePreviewMode()
  const theme = useTheme()
  const [showChangePassword, setShowChangePassword] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true)
  const [hoverExpanded, setHoverExpanded] = useState(false)
  const hoverEnterTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const hoverLeaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768
  const sidebarPinned = !sidebarCollapsed
  const sidebarOpen = sidebarPinned || hoverExpanded

  const handleMouseEnter = () => {
    if (isMobile || sidebarPinned) return
    if (hoverLeaveTimer.current) { clearTimeout(hoverLeaveTimer.current); hoverLeaveTimer.current = null }
    hoverEnterTimer.current = setTimeout(() => setHoverExpanded(true), 400)
  }
  const handleMouseLeave = () => {
    if (isMobile || sidebarPinned) return
    if (hoverEnterTimer.current) { clearTimeout(hoverEnterTimer.current); hoverEnterTimer.current = null }
    hoverLeaveTimer.current = setTimeout(() => setHoverExpanded(false), 300)
  }

  useEffect(() => () => {
    if (hoverEnterTimer.current) clearTimeout(hoverEnterTimer.current)
    if (hoverLeaveTimer.current) clearTimeout(hoverLeaveTimer.current)
  }, [])

  // Location names for display
  const [locationNames, setLocationNames] = useState<string[]>([])
  useEffect(() => {
    if (locationIds.length === 0) return
    import('../../lib/supabase').then(({ supabase }) => {
      supabase.from('locations').select('name').in('id', locationIds).then(({ data }: any) => {
        if (data) setLocationNames(data.map((l: any) => l.name?.replace(' Music Lessons', '') ?? ''))
      })
    })
  }, [locationIds])

  return (
    <div className="admin-shell" style={preview.active ? { paddingTop: 40 } : undefined}>
      {/* ATMOSPHERIC BACKGROUND */}
      <div className="lp-bg">
        <svg viewBox="0 0 1200 780" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid slice">
          <defs>
            <radialGradient id="trg1" cx="28%" cy="16%" r="50%">
              <stop offset="0%" stopColor="#D4226A" stopOpacity={0.6}/>
              <stop offset="100%" stopColor="#D4226A" stopOpacity={0}/>
            </radialGradient>
            <radialGradient id="trg2" cx="88%" cy="92%" r="45%">
              <stop offset="0%" stopColor="#7B2CBF" stopOpacity={0.5}/>
              <stop offset="100%" stopColor="#7B2CBF" stopOpacity={0}/>
            </radialGradient>
            <filter id="tf1"><feGaussianBlur stdDeviation={10}/></filter>
            <filter id="tf2"><feGaussianBlur stdDeviation={5}/></filter>
          </defs>
          <circle cx={320} cy={130} r={260} fill="url(#trg1)" filter="url(#tf1)"/>
          <circle cx={980} cy={660} r={240} fill="url(#trg2)" filter="url(#tf1)"/>
          <g stroke="rgba(212,34,106,0.38)" strokeWidth={0.7} fill="none" filter="url(#tf2)">
            <path d="M160,0 Q360,220 260,440 Q160,640 360,780"/>
            <path d="M210,0 Q460,170 310,420 Q180,640 420,780"/>
          </g>
          <g stroke="rgba(123,44,191,0.28)" strokeWidth={0.6} fill="none" filter="url(#tf2)">
            <path d="M840,0 Q1040,220 940,440 Q840,640 1040,780"/>
          </g>
        </svg>
      </div>
      <div className="lp-atmo"></div>
      <div className="lp-vig"></div>

      <aside
        className={`admin-sidebar ${sidebarOpen ? '' : 'collapsed'}`}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onClick={!sidebarOpen ? () => { setSidebarCollapsed(false); setHoverExpanded(false) } : undefined}
        style={!sidebarOpen ? { cursor: 'pointer' } : undefined}
      >
        <div className="sidebar-brand" onClick={sidebarOpen ? () => { setSidebarCollapsed(true); setHoverExpanded(false) } : undefined} style={{ cursor: 'pointer' }}>
          <img src={theme.logoUrl || '/lp-logo.png?v=2'} alt="" style={{ width: 28, height: 28, borderRadius: 8, objectFit: 'cover' }} />
          {sidebarOpen && (
            <div className="sidebar-brand-text">
              <div className="sidebar-brand-name">{theme.studioName}</div>
              <div className="sidebar-brand-sub">Teacher Portal</div>
            </div>
          )}
        </div>

        <nav className="sidebar-nav">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              onClick={(e) => e.stopPropagation()}
              className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
            >
              {item.icon}
              <span className="nav-label">{item.label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="sidebar-user">
            <div className="sidebar-avatar">
              {profile?.first_name?.[0] ?? 'T'}
            </div>
            {sidebarOpen && (
              <div style={{ flex: 1, minWidth: 0 }}>
                <span className="sidebar-username">
                  {profile?.first_name} {profile?.last_name}
                </span>
                {locationNames.length > 0 && (
                  <div style={{ fontSize: 10, color: '#606088', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {locationNames.join(', ')}
                  </div>
                )}
              </div>
            )}
            <button className="btn-ghost" onClick={(e) => { e.stopPropagation(); setShowChangePassword(true) }} title="Change Password" style={{ padding: '4px 6px', fontSize: '11px', color: 'var(--text-ghost)' }}>
              <KeyRound size={13} />
            </button>
            <button
              type="button"
              className="btn-ghost"
              onClick={(e) => { e.stopPropagation(); signOut() }}
              onTouchEnd={(e) => { e.stopPropagation(); e.preventDefault(); signOut() }}
              style={{ minWidth: 44, minHeight: 44, padding: '10px 12px', fontSize: '11px', color: 'var(--text-ghost)', cursor: 'pointer', touchAction: 'manipulation' }}
            >
              {sidebarOpen ? 'Sign Out' : <LogOut size={13} />}
            </button>
          </div>
          <ChangePasswordModal open={showChangePassword} onClose={() => setShowChangePassword(false)} />
        </div>
      </aside>

      <main className="admin-main">
        <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '8px 16px 0', maxWidth: '100%' }}>
          <RoleSwitcher />
        </div>
        <PageTransition><Outlet /></PageTransition>
      </main>

      <TeacherMobileTabBar />
    </div>
  )
}
