import { NavLink, Outlet } from 'react-router-dom'
import PageTransition from '../shared/PageTransition'
import { useAuthContext } from '../../app/AuthContext'
import { usePreviewMode } from '../../hooks/usePreviewMode'
import RoleSwitcher from '../shared/RoleSwitcher'
import { useTheme } from '../../hooks/useTheme'

export default function ParentShell() {
  const { profile, signOut } = useAuthContext()
  const { preview } = usePreviewMode()
  const theme = useTheme()

  return (
    <div className="portal-shell" style={preview.active ? { paddingTop: 40 } : undefined}>
      <header className="portal-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <img src={theme.logoUrl || '/lp-logo.png?v=2'} alt="" style={{ width: 24, height: 24, borderRadius: 6 }} />
          <h1 className="text-gradient" style={{ fontSize: 'var(--text-lg)', margin: 0 }}>{theme.studioName}</h1>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <RoleSwitcher />
          <span className="text-muted" style={{ fontSize: '13px' }}>
            {profile?.first_name}
          </span>
          <button className="btn-ghost" onClick={signOut} style={{ fontSize: '11px' }}>
            Sign Out
          </button>
        </div>
      </header>
      <nav className="portal-nav">
        <NavLink to="/parent/dashboard" className={({ isActive }) => isActive ? 'active' : ''}>Dashboard</NavLink>
      </nav>
      <main className="portal-main">
        <PageTransition><Outlet /></PageTransition>
      </main>
    </div>
  )
}
