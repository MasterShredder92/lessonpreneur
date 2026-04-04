import { useState, useRef, useCallback } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { createPortal } from 'react-dom'
import PageTransition from '../shared/PageTransition'
import { useAuthContext } from '../../app/AuthContext'
import { usePreviewMode } from '../../hooks/usePreviewMode'
import RoleSwitcher from '../shared/RoleSwitcher'
import { useTheme } from '../../hooks/useTheme'
import ChangePasswordModal from '../shared/ChangePasswordModal'
import { Home, Calendar, Music, CreditCard, Menu, UserCog, LogOut, X, ChevronRight, KeyRound } from 'lucide-react'

const TABS = [
  { path: '/parent/dashboard', label: 'Home', icon: Home },
  { path: '/parent/schedule', label: 'Schedule', icon: Calendar },
  { path: '/parent/practice', label: 'Practice', icon: Music },
  { path: '/parent/billing', label: 'Billing', icon: CreditCard },
  { path: '__more__', label: 'More', icon: Menu },
]

const DISMISS_THRESHOLD = 80

export default function ParentShell() {
  const { profile, signOut } = useAuthContext()
  const [showChangePassword, setShowChangePassword] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)
  const { preview } = usePreviewMode()
  const theme = useTheme()
  const navigate = useNavigate()

  const sheetRef = useRef<HTMLDivElement>(null)
  const dragStartY = useRef(0)
  const dragOffset = useRef(0)
  const isDragging = useRef(false)

  const closeSheet = useCallback(() => setMoreOpen(false), [])

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    dragStartY.current = e.touches[0].clientY
    dragOffset.current = 0
    isDragging.current = true
    if (sheetRef.current) sheetRef.current.style.transition = 'none'
  }, [])

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!isDragging.current) return
    const dy = e.touches[0].clientY - dragStartY.current
    dragOffset.current = Math.max(0, dy)
    if (sheetRef.current) sheetRef.current.style.transform = `translateY(${dragOffset.current}px)`
  }, [])

  const handleTouchEnd = useCallback(() => {
    if (!isDragging.current) return
    isDragging.current = false
    if (dragOffset.current > DISMISS_THRESHOLD) {
      if (sheetRef.current) {
        sheetRef.current.style.transition = 'transform 200ms ease-out'
        sheetRef.current.style.transform = 'translateY(100%)'
      }
      setTimeout(closeSheet, 200)
    } else {
      if (sheetRef.current) {
        sheetRef.current.style.transition = 'transform 200ms ease-out'
        sheetRef.current.style.transform = 'translateY(0)'
      }
    }
    dragOffset.current = 0
  }, [closeSheet])

  const goTo = useCallback((path: string) => {
    navigate(path)
    setMoreOpen(false)
  }, [navigate])

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
        {TABS.map(tab => {
          if (tab.path === '__more__') {
            return (
              <button
                key="more"
                onClick={() => setMoreOpen(prev => !prev)}
                style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
                  padding: '6px 12px', background: 'none', border: 'none', cursor: 'pointer',
                  color: moreOpen ? '#D4226A' : '#606088',
                  fontSize: 10, fontWeight: moreOpen ? 700 : 500,
                  WebkitTapHighlightColor: 'transparent',
                }}
              >
                <tab.icon size={20} />
                {tab.label}
              </button>
            )
          }
          return (
            <NavLink
              key={tab.path}
              to={tab.path}
              onClick={() => setMoreOpen(false)}
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
          )
        })}
      </nav>

      {/* More bottom sheet */}
      {moreOpen && createPortal(
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 9995,
            background: 'rgba(0,0,0,0.6)',
            backdropFilter: 'blur(2px)',
          }}
          onClick={closeSheet}
        >
          <div
            ref={sheetRef}
            onClick={e => e.stopPropagation()}
            style={{
              position: 'absolute', bottom: 0, left: 0, right: 0,
              maxHeight: '70vh', overflowY: 'auto',
              background: 'rgba(16, 14, 30, 0.99)',
              borderRadius: '20px 20px 0 0',
              paddingBottom: `calc(16px + env(safe-area-inset-bottom))`,
              boxShadow: '0 -4px 40px rgba(0,0,0,0.6)',
              animation: 'sheetSlideUp 300ms cubic-bezier(0.32, 0.72, 0, 1)',
            }}
          >
            {/* Drag handle */}
            <div
              onTouchStart={handleTouchStart}
              onTouchMove={handleTouchMove}
              onTouchEnd={handleTouchEnd}
              style={{
                display: 'flex', justifyContent: 'center',
                padding: '12px 0 10px', cursor: 'grab', touchAction: 'none',
              }}
            >
              <div style={{ width: 36, height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.2)' }} />
            </div>

            {/* Close */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '0 16px 4px' }}>
              <button
                onClick={closeSheet}
                style={{
                  width: 32, height: 32, borderRadius: 8,
                  background: 'rgba(255,255,255,0.06)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: 'pointer', color: '#8080A8',
                  WebkitTapHighlightColor: 'transparent',
                }}
              >
                <X size={16} />
              </button>
            </div>

            {/* User profile + Sign Out */}
            {profile && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '8px 20px 16px', borderBottom: '0.5px solid rgba(255,255,255,0.08)',
              }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 16, fontWeight: 700, color: '#E0E0F4', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {profile.first_name} {profile.last_name}
                  </div>
                  <div style={{ fontSize: 11, color: '#606088', marginTop: 2 }}>Parent</div>
                </div>
                <button
                  onClick={() => { signOut(); setMoreOpen(false) }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    minHeight: 44, padding: '0 16px', borderRadius: 10,
                    background: 'rgba(212,34,106,0.12)', border: '1px solid rgba(212,34,106,0.3)',
                    color: '#D4226A', fontSize: 13, fontWeight: 700, cursor: 'pointer',
                    WebkitTapHighlightColor: 'transparent', flexShrink: 0,
                  }}
                >
                  <LogOut size={15} />
                  Sign Out
                </button>
              </div>
            )}

            <div style={{ padding: '0 20px' }}>
              <button
                onClick={() => goTo('/parent/account')}
                style={{
                  display: 'flex', alignItems: 'center', gap: 14, width: '100%',
                  padding: '14px 0', background: 'none', border: 'none',
                  borderBottom: '0.5px solid rgba(255,255,255,0.04)',
                  cursor: 'pointer', color: '#C0C0E0',
                  WebkitTapHighlightColor: 'transparent',
                }}
              >
                <UserCog size={20} style={{ color: '#8080A8', flexShrink: 0 }} />
                <span style={{ fontSize: 15, fontWeight: 600, flex: 1, textAlign: 'left' }}>Account</span>
                <ChevronRight size={16} style={{ color: '#363656' }} />
              </button>
              <button
                onClick={() => { setShowChangePassword(true); setMoreOpen(false) }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 14, width: '100%',
                  padding: '14px 0', background: 'none', border: 'none',
                  cursor: 'pointer', color: '#C0C0E0',
                  WebkitTapHighlightColor: 'transparent',
                }}
              >
                <KeyRound size={20} style={{ color: '#8080A8', flexShrink: 0 }} />
                <span style={{ fontSize: 15, fontWeight: 600, flex: 1, textAlign: 'left' }}>Change Password</span>
                <ChevronRight size={16} style={{ color: '#363656' }} />
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      <ChangePasswordModal open={showChangePassword} onClose={() => setShowChangePassword(false)} />
    </div>
  )
}
