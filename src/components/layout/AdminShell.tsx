import { useState, useRef, useEffect, useContext, createContext, useCallback, type ReactNode } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import PageTransition from '../shared/PageTransition'
import MobileTabBar from './MobileTabBar'
import { useAuthContext } from '../../app/AuthContext'
import { usePermissions } from '../../hooks/usePermissions'
import { usePreviewMode } from '../../hooks/usePreviewMode'
import { ADMIN_NAV_ITEMS } from '../../lib/constants'
import { useTheme } from '../../hooks/useTheme'
import { LayoutDashboard, Users, CalendarDays, UserPlus, BookOpen, Settings2, LogOut, Star, ChevronDown, ShieldCheck, Guitar, Plug, KeyRound } from 'lucide-react'
import ChangePasswordModal from '../shared/ChangePasswordModal'
import TopViewTabs from '../shared/TopViewTabs'
import FloatingIssueReporter from '../shared/FloatingIssueReporter'
import StarModal from '../ai/StarModal'
import { OnboardingProvider } from '../../contexts/OnboardingContext'
import StudioDirectorIssueButton from '../shared/StudioDirectorIssueButton'

const NAV_ICONS: Record<string, ReactNode> = {
  'dashboard': <LayoutDashboard size={18} />,
  'user-plus': <UserPlus size={18} />,
  'calendar': <CalendarDays size={18} />,
  'users': <Users size={18} />,
  'shield': <ShieldCheck size={18} />,
  'guitar': <Guitar size={18} />,
  'book': <BookOpen size={18} />,
}

export default function AdminShell() {
  const { profile, tenantId, signOut } = useAuthContext()
  const { isStudioDirector, isCompanyDirector, isOwner, role: effectiveRole } = usePermissions()
  const { preview } = usePreviewMode()
  const location = useLocation()
  const [aiPanelOpen, setAiPanelOpen] = useState(false)
  const [showChangePassword, setShowChangePassword] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true)
  const [hoverExpanded, setHoverExpanded] = useState(false)
  const hoverEnterTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const hoverLeaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768
  const sidebarPinned = !sidebarCollapsed
  const sidebarOpen = sidebarPinned || hoverExpanded

  const handleSidebarMouseEnter = () => {
    if (isMobile || sidebarPinned) return
    if (hoverLeaveTimer.current) { clearTimeout(hoverLeaveTimer.current); hoverLeaveTimer.current = null }
    hoverEnterTimer.current = setTimeout(() => setHoverExpanded(true), 400)
  }
  const handleSidebarMouseLeave = () => {
    if (isMobile || sidebarPinned) return
    if (hoverEnterTimer.current) { clearTimeout(hoverEnterTimer.current); hoverEnterTimer.current = null }
    hoverLeaveTimer.current = setTimeout(() => setHoverExpanded(false), 300)
  }

  // Cleanup hover timers on unmount
  useEffect(() => () => {
    if (hoverEnterTimer.current) clearTimeout(hoverEnterTimer.current)
    if (hoverLeaveTimer.current) clearTimeout(hoverLeaveTimer.current)
  }, [])

  const theme = useTheme()

  // Dropdown expand/collapse — auto-expand if on a child route
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(() => {
    const set = new Set<string>()
    for (const item of ADMIN_NAV_ITEMS) {
      if (item.children?.some(c => location.pathname.startsWith(c.path))) set.add(item.label)
    }
    return set
  })

  useEffect(() => {
    for (const item of ADMIN_NAV_ITEMS) {
      if (item.children?.some(c => location.pathname.startsWith(c.path))) {
        setExpandedGroups(prev => { const next = new Set(prev); next.add(item.label); return next })
      }
    }
  }, [location.pathname])

  const toggleGroup = (label: string) => {
    setExpandedGroups(prev => { const next = new Set(prev); if (next.has(label)) next.delete(label); else next.add(label); return next })
  }



  // Listen for AI panel open events from other components
  useEffect(() => {
    const handler = () => setAiPanelOpen(true)
    window.addEventListener('open-ai-panel', handler)
    return () => window.removeEventListener('open-ai-panel', handler)
  }, [])

  return (
    <OnboardingProvider>
    <div className="admin-shell" style={preview.active ? { paddingTop: 40 } : undefined}>
      {/* ATMOSPHERIC BACKGROUND - required for V9 design */}
      <div className="lp-bg">
        <svg viewBox="0 0 1200 780" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid slice">
          <defs>
            <radialGradient id="rg1" cx="28%" cy="16%" r="50%">
              <stop offset="0%" stopColor="#D4226A" stopOpacity={0.6}/>
              <stop offset="100%" stopColor="#D4226A" stopOpacity={0}/>
            </radialGradient>
            <radialGradient id="rg2" cx="88%" cy="92%" r="45%">
              <stop offset="0%" stopColor="#7B2CBF" stopOpacity={0.5}/>
              <stop offset="100%" stopColor="#7B2CBF" stopOpacity={0}/>
            </radialGradient>
            <filter id="f1"><feGaussianBlur stdDeviation={10}/></filter>
            <filter id="f2"><feGaussianBlur stdDeviation={5}/></filter>
          </defs>
          <circle cx={320} cy={130} r={260} fill="url(#rg1)" filter="url(#f1)"/>
          <circle cx={980} cy={660} r={240} fill="url(#rg2)" filter="url(#f1)"/>
          <g stroke="rgba(212,34,106,0.38)" strokeWidth={0.7} fill="none" filter="url(#f2)">
            <path d="M160,0 Q360,220 260,440 Q160,640 360,780"/>
            <path d="M210,0 Q460,170 310,420 Q180,640 420,780"/>
          </g>
          <g stroke="rgba(123,44,191,0.28)" strokeWidth={0.6} fill="none" filter="url(#f2)">
            <path d="M840,0 Q1040,220 940,440 Q840,640 1040,780"/>
          </g>
          <g stroke="rgba(255,120,0,0.16)" strokeWidth={0.5} fill="none" filter="url(#f2)">
            <path d="M530,0 Q730,290 630,510 Q530,720 730,780"/>
          </g>
          <circle cx={168} cy={110} r={55} stroke="rgba(212,34,106,0.2)" strokeWidth={0.6} fill="none" filter="url(#f2)"/>
          <circle cx={1012} cy={638} r={70} stroke="rgba(123,44,191,0.18)" strokeWidth={0.6} fill="none" filter="url(#f2)"/>
        </svg>
      </div>
      <div className="lp-atmo"></div>
      <div className="lp-vig"></div>

      <aside
        className={`admin-sidebar ${sidebarOpen ? '' : 'collapsed'}`}
        onMouseEnter={handleSidebarMouseEnter}
        onMouseLeave={handleSidebarMouseLeave}
        onClick={!sidebarOpen ? () => { setSidebarCollapsed(false); setHoverExpanded(false) } : undefined}
        style={!sidebarOpen ? { cursor: 'pointer' } : undefined}
      >
        <div className="sidebar-brand" onClick={sidebarOpen ? () => { setSidebarCollapsed(true); setHoverExpanded(false) } : undefined} style={{ cursor: 'pointer' }}>
          <img src={theme.logoUrl || '/lp-logo.png?v=2'} alt="" style={{ width: 28, height: 28, borderRadius: 8, objectFit: 'cover' }} />
          {sidebarOpen && (
            <div className="sidebar-brand-text">
              <div className="sidebar-brand-name">{theme.studioName}</div>
              <div className="sidebar-brand-sub">powered by Lessonpreneur</div>
            </div>
          )}
        </div>

        <NavTooltipProvider sidebarOpen={sidebarOpen}>
        <nav className="sidebar-nav">
          {ADMIN_NAV_ITEMS.filter(item => {
            // Role-based nav filtering — uses effectiveRole from usePermissions (respects preview mode)
            const HIDDEN_FOR_STUDIO_DIR = ['/admin/financials', '/admin/recruitment', '/admin/payroll', '/admin/integrations']
            const HIDDEN_FOR_COMPANY_DIR = ['/admin/financials'] // hide owner take-home from co. directors
            if (isStudioDirector) {
              if (item.path && HIDDEN_FOR_STUDIO_DIR.includes(item.path)) return false
              if (item.children) {
                const filtered = item.children.filter(c => !HIDDEN_FOR_STUDIO_DIR.includes(c.path))
                if (filtered.length === 0) return false
              }
            }
            if (isCompanyDirector && !isOwner) {
              if (item.path && HIDDEN_FOR_COMPANY_DIR.includes(item.path)) return false
            }
            return true
          }).map((item, idx) => {
            const showDividerBefore = idx === 3 || idx === 5
            const isGroup = !!item.children
            const isGroupOpen = expandedGroups.has(item.label)
            const isChildActive = item.children?.some(c => location.pathname.startsWith(c.path)) ?? false
            // Show tooltip: always when collapsed; when expanded, only for dropdown parents
            const showTip = !sidebarOpen || isGroup

            return (
              <div key={item.label}>
                {showDividerBefore && <div style={{ height: 1, background: 'rgba(255,255,255,0.04)', margin: '6px 14px' }} />}
                {isGroup ? (
                  <>
                    <NavTooltipTrigger label={item.label} children_list={item.children} show={showTip}>
                      <button
                        className={`nav-item${isChildActive ? ' active' : ''}`}
                        onClick={(e) => {
                          e.stopPropagation()
                          if (!sidebarOpen && item.children?.[0]) {
                            window.location.href = item.children[0].path
                            return
                          }
                          toggleGroup(item.label)
                        }}
                        style={{ width: '100%', textAlign: 'left', border: 'none', cursor: 'pointer', background: 'none', fontFamily: 'inherit' }}
                      >
                        {NAV_ICONS[item.icon]}
                        <span className="nav-label" style={{ flex: 1 }}>{item.label}</span>
                        {sidebarOpen && (
                          <ChevronDown size={12} style={{ transition: 'transform 200ms ease', transform: isGroupOpen ? 'rotate(0deg)' : 'rotate(-90deg)', color: '#606088', flexShrink: 0 }} />
                        )}
                      </button>
                    </NavTooltipTrigger>
                    {isGroupOpen && sidebarOpen && (
                      <div>
                        {item.children!.filter(c => {
                          const HIDDEN = ['/admin/financials', '/admin/recruitment', '/admin/payroll']
                          if (isStudioDirector && HIDDEN.includes(c.path)) return false
                          if (isCompanyDirector && !isOwner && c.path === '/admin/financials') return false
                          return true
                        }).map((child) => (
                          <NavTooltipTrigger key={child.path} label={child.label} show={false}>
                            <NavLink
                              to={child.path}
                              onClick={(e) => e.stopPropagation()}
                              className={({ isActive }) => `nav-item nav-child${isActive ? ' active' : ''}`}
                              data-tour-id={`${child.path.replace('/admin/', '')}-nav`}
                              style={{ paddingLeft: 42, fontSize: 13, fontWeight: 500 }}
                            >
                              <span className="nav-label">{child.label}</span>
                            </NavLink>
                          </NavTooltipTrigger>
                        ))}
                      </div>
                    )}
                  </>
                ) : (
                  <NavTooltipTrigger label={item.label} show={!sidebarOpen}>
                    <NavLink
                      to={item.path}
                      onClick={(e) => e.stopPropagation()}
                      className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
                      data-tour-id={item.path ? `${item.path.replace('/admin/', '')}-nav` : undefined}
                    >
                      {NAV_ICONS[item.icon]}
                      <span className="nav-label">{item.label}</span>
                    </NavLink>
                  </NavTooltipTrigger>
                )}
              </div>
            )
          })}
        </nav>
        </NavTooltipProvider>

        <div className="sidebar-footer">
          <button
            className={`nav-item ${aiPanelOpen ? 'active' : ''}`}
            onClick={(e) => { e.stopPropagation(); setAiPanelOpen(!aiPanelOpen) }}
            title={!sidebarOpen ? 'AI Assistant' : undefined}
          >
            <Star size={15} />
            <span className="nav-label">Star</span>
          </button>

<NavLink to="/admin/integrations" title={!sidebarOpen ? 'Integrations' : undefined} onClick={(e) => e.stopPropagation()} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} style={isStudioDirector ? { display: 'none' } : undefined}>
            <Plug size={15} />
            <span className="nav-label">Integrations</span>
          </NavLink>

          {isStudioDirector && sidebarOpen && (
            <div style={{ padding: '4px 10px' }}>
              <StudioDirectorIssueButton variant="sidebar" />
            </div>
          )}

          <NavLink to="/admin/settings" title={!sidebarOpen ? 'Settings' : undefined} onClick={(e) => e.stopPropagation()} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
            <Settings2 size={15} />
            <span className="nav-label">Settings</span>
          </NavLink>

          <div className="sidebar-user">
            <div className="sidebar-avatar">
              {profile?.first_name?.[0] ?? 'U'}
            </div>
            <span className="sidebar-username">
              {profile?.first_name} {profile?.last_name}
            </span>
            <button className="btn-ghost" onClick={(e) => { e.stopPropagation(); setShowChangePassword(true) }} title="Change Password" style={{ padding: '4px 6px', fontSize: '11px', color: 'var(--text-ghost)' }}>
              {sidebarOpen ? <KeyRound size={13} /> : <KeyRound size={13} />}
            </button>
            <SignOutButton sidebarOpen={sidebarOpen} signOut={signOut} />
          </div>
          <ChangePasswordModal open={showChangePassword} onClose={() => setShowChangePassword(false)} />
        </div>
      </aside>

      <main className="admin-main">
        <div style={{ padding: '8px 16px 0', maxWidth: '100%' }}>
          <TopViewTabs />
        </div>
        <PageTransition><Outlet /></PageTransition>
      </main>

      <MobileTabBar />
      <FloatingIssueReporter />

      <StarModal open={aiPanelOpen} onClose={() => setAiPanelOpen(false)} />
    </div>
    </OnboardingProvider>
  )
}

// ═══════════════════════════════════════
// SIGN OUT BUTTON (with loading state)
// ═══════════════════════════════════════

function SignOutButton({ sidebarOpen, signOut }: { sidebarOpen: boolean; signOut: () => Promise<void> }) {
  const [busy, setBusy] = useState(false)
  return (
    <button
      type="button"
      className="btn-ghost"
      disabled={busy}
      onClick={async (e) => {
        e.stopPropagation()
        if (busy) return
        setBusy(true)
        await signOut()
      }}
      style={{ minWidth: 44, minHeight: 44, padding: '10px 12px', fontSize: '11px', color: 'var(--text-ghost)', cursor: busy ? 'wait' : 'pointer', opacity: busy ? 0.5 : 1, touchAction: 'manipulation' }}
    >
      {sidebarOpen ? (busy ? 'Signing out…' : 'Sign Out') : <LogOut size={13} />}
    </button>
  )
}

// ═══════════════════════════════════════
// NAV TOOLTIP SYSTEM
// ═══════════════════════════════════════

interface TooltipState { label: string; children_list?: { label: string; path: string }[]; rect: DOMRect }
const TooltipCtx = createContext<{
  show: (s: TooltipState) => void
  hide: () => void
}>({ show: () => {}, hide: () => {} })

function NavTooltipProvider({ children, sidebarOpen }: { children: ReactNode; sidebarOpen: boolean }) {
  const [tip, setTip] = useState<TooltipState | null>(null)
  const [visible, setVisible] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const showTip = useCallback((s: TooltipState) => {
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => { setTip(s); setVisible(true) }, 300)
  }, [])
  const hideTip = useCallback(() => {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null }
    setVisible(false)
    setTimeout(() => setTip(null), 150)
  }, [])

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current) }, [])

  const sidebarWidth = sidebarOpen ? 216 : 58

  return (
    <TooltipCtx.Provider value={{ show: showTip, hide: hideTip }}>
      {children}
      {tip && (
        <div style={{
          position: 'fixed',
          left: sidebarWidth + 8,
          top: tip.rect.top + tip.rect.height / 2,
          transform: 'translateY(-50%)',
          zIndex: 9999,
          pointerEvents: 'none',
          padding: '6px 10px',
          background: 'rgba(16,16,32,0.95)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 8,
          boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
          maxWidth: 180,
          opacity: visible ? 1 : 0,
          transition: 'opacity 150ms ease',
        }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#E0E0F4', whiteSpace: 'nowrap' }}>{tip.label}</div>
          {tip.children_list && tip.children_list.length > 0 && (
            <div style={{ marginTop: 3 }}>
              {tip.children_list.map(c => (
                <div key={c.path} style={{ fontSize: 11, color: '#8080A8', paddingLeft: 10, lineHeight: 1.6 }}>· {c.label}</div>
              ))}
            </div>
          )}
        </div>
      )}
    </TooltipCtx.Provider>
  )
}

function NavTooltipTrigger({ label, children_list, show, children }: {
  label: string
  children_list?: { label: string; path: string }[]
  show: boolean
  children: ReactNode
}) {
  const { show: showTip, hide: hideTip } = useContext(TooltipCtx)
  const ref = useRef<HTMLDivElement>(null)

  const handleEnter = () => {
    if (!show || !ref.current) return
    showTip({ label, children_list, rect: ref.current.getBoundingClientRect() })
  }

  return (
    <div ref={ref} onMouseEnter={handleEnter} onMouseLeave={hideTip}>
      {children}
    </div>
  )
}
