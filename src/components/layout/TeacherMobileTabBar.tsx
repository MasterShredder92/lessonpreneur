import { useState, useRef, useCallback } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { createPortal } from 'react-dom'
import { LayoutDashboard, CalendarDays, Users, Menu, FileText, LogOut, X, ChevronRight } from 'lucide-react'
import { useAuthContext } from '../../app/AuthContext'

const TABS = [
  { path: '/teacher/dashboard', icon: LayoutDashboard, label: 'Home' },
  { path: '/teacher/schedule', icon: CalendarDays, label: 'Schedule' },
  { path: '/teacher/students', icon: Users, label: 'Students' },
  { path: '__more__', icon: Menu, label: 'More' },
]

const DISMISS_THRESHOLD = 80

export default function TeacherMobileTabBar() {
  const [moreOpen, setMoreOpen] = useState(false)
  const navigate = useNavigate()
  const { profile, signOut } = useAuthContext()

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
    <>
      <nav className="mobile-tab-bar" style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        height: `calc(56px + env(safe-area-inset-bottom))`,
        paddingBottom: 'env(safe-area-inset-bottom)',
        background: 'rgba(2, 2, 9, 0.95)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        borderTop: '0.5px solid rgba(255,255,255,0.08)',
        alignItems: 'flex-start',
        justifyContent: 'space-around',
        zIndex: 9990,
      }}>
        {TABS.map(tab => {
          if (tab.path === '__more__') {
            return (
              <button
                key="more"
                onClick={() => setMoreOpen(prev => !prev)}
                style={{
                  flex: 1,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 2,
                  height: 56,
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: moreOpen ? '#D4226A' : 'rgba(255,255,255,0.4)',
                  WebkitTapHighlightColor: 'transparent',
                }}
              >
                <tab.icon size={22} />
                <span style={{ fontSize: 10, fontWeight: 600 }}>{tab.label}</span>
              </button>
            )
          }
          return (
            <NavLink
              key={tab.path}
              to={tab.path}
              onClick={() => setMoreOpen(false)}
              style={({ isActive }) => ({
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 2,
                height: 56,
                textDecoration: 'none',
                color: isActive ? '#D4226A' : 'rgba(255,255,255,0.4)',
                WebkitTapHighlightColor: 'transparent',
                transition: 'color 150ms ease',
              })}
            >
              <tab.icon size={22} />
              <span style={{ fontSize: 10, fontWeight: 600 }}>{tab.label}</span>
            </NavLink>
          )
        })}
      </nav>

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
              position: 'absolute',
              bottom: 0,
              left: 0,
              right: 0,
              maxHeight: '70vh',
              overflowY: 'auto',
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
                display: 'flex',
                justifyContent: 'center',
                padding: '12px 0 10px',
                cursor: 'grab',
                touchAction: 'none',
              }}
            >
              <div style={{ width: 36, height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.2)' }} />
            </div>

            {/* Close button */}
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

            {/* User profile + Sign Out at top */}
            {profile && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '8px 20px 16px', borderBottom: '0.5px solid rgba(255,255,255,0.08)',
              }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 16, fontWeight: 700, color: '#E0E0F4', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {profile.first_name} {profile.last_name}
                  </div>
                  <div style={{ fontSize: 11, color: '#606088', marginTop: 2 }}>Teacher</div>
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
              {/* Documents */}
              <button
                onClick={() => goTo('/teacher/documents')}
                style={{
                  display: 'flex', alignItems: 'center', gap: 14, width: '100%',
                  padding: '14px 0', background: 'none', border: 'none',
                  cursor: 'pointer', color: '#C0C0E0',
                  WebkitTapHighlightColor: 'transparent',
                }}
              >
                <FileText size={20} style={{ color: '#8080A8', flexShrink: 0 }} />
                <span style={{ fontSize: 15, fontWeight: 600, flex: 1, textAlign: 'left' }}>My Documents</span>
                <ChevronRight size={16} style={{ color: '#363656' }} />
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  )
}
