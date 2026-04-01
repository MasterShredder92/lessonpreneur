import { NavLink, Outlet } from 'react-router-dom'
import PageTransition from '../shared/PageTransition'
import { useAuthContext } from '../../app/AuthContext'

export default function TeacherShell() {
  const { profile, signOut } = useAuthContext()

  return (
    <div className="portal-shell">
      <header className="portal-header">
        <h1 className="text-gradient" style={{ fontSize: 'var(--text-lg)' }}>Music School OS</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span className="text-muted" style={{ fontSize: '13px' }}>
            {profile?.first_name}
          </span>
          <button className="btn-ghost" onClick={signOut} style={{ fontSize: '11px' }}>
            Sign Out
          </button>
        </div>
      </header>
      <nav className="portal-nav">
        <NavLink to="/teacher/schedule" className={({ isActive }) => isActive ? 'active' : ''}>Schedule</NavLink>
        <NavLink to="/teacher/students" className={({ isActive }) => isActive ? 'active' : ''}>Students</NavLink>
      </nav>
      <main className="portal-main">
        <PageTransition><Outlet /></PageTransition>
      </main>
    </div>
  )
}
