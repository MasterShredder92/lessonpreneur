import { useState } from 'react'
import { Outlet } from 'react-router-dom'
import PageTransition from '../shared/PageTransition'
import { useAuthContext } from '../../app/AuthContext'
import ChangePasswordModal from '../shared/ChangePasswordModal'

export default function StudentShell() {
  const { profile, signOut } = useAuthContext()
  const [showChangePassword, setShowChangePassword] = useState(false)

  return (
    <div className="portal-shell">
      <header className="portal-header">
        <h1 className="text-gradient" style={{ fontSize: 'var(--text-lg)' }}>Music School OS</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span className="text-muted" style={{ fontSize: '13px' }}>
            {profile?.first_name}
          </span>
          <button className="btn-ghost" onClick={() => setShowChangePassword(true)} style={{ fontSize: '11px' }}>
            Password
          </button>
          <StudentSignOutButton signOut={signOut} />
          <ChangePasswordModal open={showChangePassword} onClose={() => setShowChangePassword(false)} />
        </div>
      </header>
      <main className="portal-main">
        <PageTransition><Outlet /></PageTransition>
      </main>
    </div>
  )
}

function StudentSignOutButton({ signOut }: { signOut: () => Promise<void> }) {
  const [busy, setBusy] = useState(false)
  return (
    <button
      type="button"
      className="btn-ghost"
      disabled={busy}
      onClick={async () => {
        if (busy) return
        setBusy(true)
        await signOut()
      }}
      style={{ minWidth: 44, minHeight: 44, padding: '10px 14px', fontSize: '11px', cursor: busy ? 'wait' : 'pointer', opacity: busy ? 0.5 : 1, touchAction: 'manipulation' }}
    >
      {busy ? 'Signing out…' : 'Sign Out'}
    </button>
  )
}
