import { useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { createPortal } from 'react-dom'
import { LayoutDashboard, CalendarDays, Users, UserPlus, Menu, ShieldCheck, Guitar, BookOpen, Settings2, Plug, ChevronRight } from 'lucide-react'
import { useAuthContext } from '../../app/AuthContext'

const TABS = [
  { path: '/admin/dashboard', icon: LayoutDashboard, label: 'Studio' },
  { path: '/admin/schedule', icon: CalendarDays, label: 'Schedule' },
  { path: '/admin/students', icon: Users, label: 'Roster' },
  { path: '/admin/leads', icon: UserPlus, label: 'New Members' },
  { path: '__more__', icon: Menu, label: 'More' },
]

const MORE_SECTIONS = [
  { header: 'ROSTER', items: [
    { path: '/admin/families', icon: Users, label: 'Families' },
  ]},
  { header: 'BACKSTAGE', items: [
    { path: '/admin/retention', icon: ShieldCheck, label: 'Retention' },
    { path: '/admin/recruitment', icon: ShieldCheck, label: 'Recruitment' },
  ]},
  { header: 'THE BAND', items: [
    { path: '/admin/teachers', icon: Guitar, label: 'Teachers' },
    { path: '/admin/payroll', icon: Guitar, label: 'Payroll' },
  ]},
  { header: 'YOUR BOOKS', items: [
    { path: '/admin/billing', icon: BookOpen, label: 'Billing' },
    { path: '/admin/financials', icon: BookOpen, label: 'Financials' },
  ]},
]

export default function MobileTabBar() {
  const [moreOpen, setMoreOpen] = useState(false)
  const navigate = useNavigate()
  const { profile, role } = useAuthContext()

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
        /* display is controlled by CSS: hidden by default, flex on mobile */
        alignItems: 'flex-start',
        justifyContent: 'space-around',
        zIndex: 9990,
      }}>
        {TABS.map(tab => {
          if (tab.path === '__more__') {
            return (
              <button
                key="more"
                onClick={() => setMoreOpen(true)}
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

      {/* More bottom sheet */}
      {moreOpen && createPortal(
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 9995,
            background: 'rgba(0,0,0,0.6)',
            backdropFilter: 'blur(2px)',
          }}
          onClick={() => setMoreOpen(false)}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              position: 'absolute',
              bottom: 0,
              left: 0,
              right: 0,
              background: 'rgba(16, 14, 30, 0.99)',
              borderRadius: '20px 20px 0 0',
              paddingBottom: `calc(16px + env(safe-area-inset-bottom))`,
              boxShadow: '0 -4px 40px rgba(0,0,0,0.6)',
              animation: 'sheetSlideUp 300ms cubic-bezier(0.32, 0.72, 0, 1)',
            }}
          >
            {/* Drag handle */}
            <div style={{ display: 'flex', justifyContent: 'center', padding: '10px 0 8px' }}>
              <div style={{ width: 36, height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.15)' }} />
            </div>

            <div style={{ padding: '0 20px' }}>
              {MORE_SECTIONS.map(section => (
                <div key={section.header}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.25)', letterSpacing: '0.08em', padding: '14px 0 6px' }}>
                    {section.header}
                  </div>
                  {section.items.map(item => (
                    <button
                      key={item.path}
                      onClick={() => { navigate(item.path); setMoreOpen(false) }}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 14,
                        width: '100%',
                        padding: '12px 0',
                        background: 'none',
                        border: 'none',
                        borderBottom: '0.5px solid rgba(255,255,255,0.04)',
                        cursor: 'pointer',
                        color: '#C0C0E0',
                        WebkitTapHighlightColor: 'transparent',
                      }}
                    >
                      <item.icon size={20} style={{ color: '#8080A8', flexShrink: 0 }} />
                      <span style={{ fontSize: 15, fontWeight: 600, flex: 1, textAlign: 'left' }}>{item.label}</span>
                      <ChevronRight size={16} style={{ color: '#363656' }} />
                    </button>
                  ))}
                </div>
              ))}

              {/* Divider + Integrations + Settings */}
              <div style={{ borderTop: '0.5px solid rgba(255,255,255,0.08)', marginTop: 8 }}>
                <button
                  onClick={() => { navigate('/admin/integrations'); setMoreOpen(false) }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 14,
                    width: '100%',
                    padding: '14px 0',
                    background: 'none',
                    border: 'none',
                    borderBottom: '0.5px solid rgba(255,255,255,0.04)',
                    cursor: 'pointer',
                    color: '#C0C0E0',
                    WebkitTapHighlightColor: 'transparent',
                  }}
                >
                  <Plug size={20} style={{ color: '#8080A8', flexShrink: 0 }} />
                  <span style={{ fontSize: 15, fontWeight: 600, flex: 1, textAlign: 'left' }}>Integrations</span>
                  <ChevronRight size={16} style={{ color: '#363656' }} />
                </button>
                <button
                  onClick={() => { navigate('/admin/settings'); setMoreOpen(false) }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 14,
                    width: '100%',
                    padding: '14px 0',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: '#C0C0E0',
                    WebkitTapHighlightColor: 'transparent',
                  }}
                >
                  <Settings2 size={20} style={{ color: '#8080A8', flexShrink: 0 }} />
                  <span style={{ fontSize: 15, fontWeight: 600, flex: 1, textAlign: 'left' }}>Settings</span>
                  <ChevronRight size={16} style={{ color: '#363656' }} />
                </button>
              </div>
            </div>

            {/* User info at bottom */}
            {profile && (
              <div style={{ padding: '16px 20px 0', borderTop: '0.5px solid rgba(255,255,255,0.04)', marginTop: 8 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#A0A0C8' }}>
                  {profile.first_name} {profile.last_name}
                </div>
                <div style={{ fontSize: 11, color: '#606088', textTransform: 'capitalize' }}>{role}</div>
              </div>
            )}
          </div>
        </div>,
        document.body
      )}
    </>
  )
}
