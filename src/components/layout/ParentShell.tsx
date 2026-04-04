import { useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import PageTransition from '../shared/PageTransition'
import { useAuthContext } from '../../app/AuthContext'
import { usePreviewMode } from '../../hooks/usePreviewMode'
import RoleSwitcher from '../shared/RoleSwitcher'
import { useTheme } from '../../hooks/useTheme'
import ChangePasswordModal from '../shared/ChangePasswordModal'
import { Home, Calendar, Music, CreditCard, UserCog } from 'lucide-react'

const TABS = [
  { path: '/parent/dashboard', label: 'Home', icon: Home },
  { path: '/parent/schedule', label: 'Schedule', icon: Calendar },
  { path: '/parent/practice', label: 'Practice', icon: Music },
  { path: '/parent/billing', label: 'Billing', icon: CreditCard },
  { path: '/parent/account', label: 'Account', icon: UserCog },
]

export default function ParentShell() {
  const { profile, signOut } = useAuthContext()
  const [showChangePassword, setShowChangePassword] = useState(false)
  const { preview } = usePreviewMode()
  const theme = useTheme()

  return (
    <div style={{ minHeight: '100vh', background: '#08080c', display: 'flex', flexDirection: 'column', ...(preview.active ? { paddingTop: 40 } : {}) }}>
      {/* Header */}
      <header style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '10px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)', flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <img src={theme.logoUrl || '/lp-logo.png?v=2'} alt="" style={{ width: 24, height: 24, borderRadius: 6 }} />
          <span style={{ fontSize: 15, fontWeight: 700, color: '#E0E0F4' }}>{theme.studioName}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <RoleSwitcher />
          <span style={{ fontSize: 12, color: '#8080A8' }}>{profile?.first_name}</span>
          <button onClick={signOut} style={{ background: 'none', border: 'none', color: '#606088', fontSize: 11, cursor: 'pointer' }}>
            Sign Out
          </button>
        </div>
      </header>

      {/* Content */}
      <main style={{ flex: 1, overflowY: 'auto', paddingBottom: 72 }}>
        <PageTransition><Outlet /></PageTransition>
      </main>

      {/* Bottom tab bar */}
      <nav style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 100,
        display: 'flex', justifyContent: 'space-around', alignItems: 'center',
        height: 60, background: 'rgba(12,11,22,0.98)', borderTop: '1px solid rgba(255,255,255,0.06)',
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}>
        {TABS.map(tab => (
          <NavLink
            key={tab.path}
            to={tab.path}
            style={({ isActive }) => ({
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
              padding: '6px 12px', textDecoration: 'none',
              color: isActive ? '#D4226A' : '#606088',
              fontSize: 10, fontWeight: isActive ? 700 : 500,
            })}
          >
            <tab.icon size={20} />
            {tab.label}
          </NavLink>
        ))}
      </nav>

      <ChangePasswordModal open={showChangePassword} onClose={() => setShowChangePassword(false)} />
    </div>
  )
}
