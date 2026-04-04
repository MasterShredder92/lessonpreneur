import { useState, useRef, useEffect, useContext, createContext, useCallback, type ReactNode } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import PageTransition from '../shared/PageTransition'
import MobileTabBar from './MobileTabBar'
import { useQuery } from '@tanstack/react-query'
import { useAuthContext } from '../../app/AuthContext'
import { usePermissions } from '../../hooks/usePermissions'
import { usePreviewMode } from '../../hooks/usePreviewMode'
import { ADMIN_NAV_ITEMS } from '../../lib/constants'
import { useAI } from '../../hooks/useAI'
import { useStarContext } from '../../hooks/useStarContext'
import { useTheme } from '../../hooks/useTheme'
import { useOnboardingMode, getOnboardingSystemPrompt } from '../../hooks/useOnboardingMode'
import { supabase } from '../../lib/supabase'
import { LayoutDashboard, Users, CalendarDays, UserPlus, Music2, CreditCard, BookOpen, Settings2, LogOut, Send, Star, ChevronDown, ShieldCheck, Guitar, Plug } from 'lucide-react'
import NotificationBell from '../shared/NotificationBell'
import RoleSwitcher from '../shared/RoleSwitcher'
import FloatingIssueReporter from '../shared/FloatingIssueReporter'

const NAV_ICONS: Record<string, ReactNode> = {
  'dashboard': <LayoutDashboard size={18} />,
  'user-plus': <UserPlus size={18} />,
  'calendar': <CalendarDays size={18} />,
  'users': <Users size={18} />,
  'shield': <ShieldCheck size={18} />,
  'guitar': <Guitar size={18} />,
  'book': <BookOpen size={18} />,
}

const SUGGESTIONS = [
  "How are we doing today?",
  "Who needs attention right now?",
  "What's my revenue this month?",
  "Compare my locations",
]

export default function AdminShell() {
  const { profile, tenantId, signOut } = useAuthContext()
  const { isStudioDirector, isCompanyDirector, isOwner, role: effectiveRole } = usePermissions()
  const { preview } = usePreviewMode()
  const location = useLocation()
  const [aiPanelOpen, setAiPanelOpen] = useState(false)
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

  const [inputValue, setInputValue] = useState('')
  const { data: starContext } = useStarContext()
  const theme = useTheme()
  const onboarding = useOnboardingMode()

  // Use onboarding prompt for new tenants, business context for established ones
  const aiContext = onboarding.needsOnboarding
    ? getOnboardingSystemPrompt(onboarding.tenantName, onboarding.progress, onboarding.studentCount, onboarding.teacherCount)
    : starContext?.summary ?? null
  const { messages, isLoading, sendMessage, clearConversation, pendingAction, confirmAction, rejectAction } = useAI(tenantId, null, aiContext)
  const messagesEndRef = useRef<HTMLDivElement>(null)

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


  // Get tenant info for Star's branding
  const { data: tenant } = useQuery({
    queryKey: ['tenant-shell', tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data } = await supabase.from('tenants').select('name, logo_url').eq('id', tenantId!).single()
      return data
    },
  })

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Listen for AI panel open events from other components
  useEffect(() => {
    const handler = () => setAiPanelOpen(true)
    window.addEventListener('open-ai-panel', handler)
    return () => window.removeEventListener('open-ai-panel', handler)
  }, [])

  // Auto-open Star for new tenants
  useEffect(() => {
    if (onboarding.isNew && messages.length === 0) setAiPanelOpen(true)
  }, [onboarding.isNew])

  const handleSend = () => {
    if (!inputValue.trim() || isLoading) return
    sendMessage(inputValue)
    setInputValue('')
  }

  const handleSuggestion = (q: string) => {
    sendMessage(q)
  }

  return (
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
          {theme.logoUrl ? (
            <img src={theme.logoUrl} alt="" style={{ width: 28, height: 28, borderRadius: 8, objectFit: 'cover' }} />
          ) : (
            <div className="sidebar-logomark">{theme.studioName[0] ?? 'L'}</div>
          )}
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
            const HIDDEN_FOR_STUDIO_DIR = ['/admin/financials', '/admin/recruitment', '/admin/settings']
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
                        {item.children!.map((child) => (
                          <NavTooltipTrigger key={child.path} label={child.label} show={false}>
                            <NavLink
                              to={child.path}
                              onClick={(e) => e.stopPropagation()}
                              className={({ isActive }) => `nav-item nav-child${isActive ? ' active' : ''}`}
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

          <div className="nav-item" style={{ cursor: 'default', padding: '4px 12px' }}>
            <NotificationBell />
          </div>

          <NavLink to="/admin/integrations" title={!sidebarOpen ? 'Integrations' : undefined} onClick={(e) => e.stopPropagation()} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
            <Plug size={15} />
            <span className="nav-label">Integrations</span>
          </NavLink>

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
            <button className="btn-ghost" onClick={(e) => { e.stopPropagation(); signOut() }} style={{ padding: '4px 6px', fontSize: '11px', color: 'var(--text-ghost)' }}>
              {sidebarOpen ? 'Sign Out' : <LogOut size={13} />}
            </button>
          </div>
        </div>
      </aside>

      <main className="admin-main">
        <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '8px 16px 0', maxWidth: '100%', overflowX: 'visible', overflow: 'visible' }}>
          <RoleSwitcher />
        </div>
        <PageTransition><Outlet /></PageTransition>
      </main>

      <MobileTabBar />
      <FloatingIssueReporter />

      {aiPanelOpen && (
        <aside className="ai-panel">
          <div className="ai-panel-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div className="star-avatar">
                <Star size={14} />
              </div>
              <div>
                <div className="star-name">Star</div>
                <div className="star-subtitle">Your Music School Coach</div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              {messages.length > 0 && (
                <button className="btn-ghost" onClick={clearConversation} style={{ fontSize: '11px', padding: '2px 8px' }}>Clear</button>
              )}
              <button className="btn-ghost" onClick={(e) => { e.stopPropagation(); setAiPanelOpen(false) }} style={{ padding: '4px 8px' }}>X</button>
            </div>
          </div>

          <div className="ai-panel-body">
            {messages.length === 0 && (
              <>
                <div className="star-welcome">
                  <div className="star-welcome-avatar">
                    <Star size={20} />
                  </div>
                  <p style={{ fontSize: 13, color: '#C8C8E0', lineHeight: 1.6, marginTop: 10 }}>
                    Hey{profile?.first_name ? ` ${profile.first_name}` : ''}! I'm <strong>Star</strong> — your music school coach. I'm here to help you grow {tenant?.name ?? 'your business'}, fill more slots, and make your life easier.
                  </p>
                  <p style={{ fontSize: 12, color: '#A0A0C8', marginTop: 8 }}>
                    Ask me anything or pick a suggestion below.
                  </p>
                </div>
                <div className="ai-panel-suggestions">
                  {SUGGESTIONS.map((q) => (
                    <button key={q} className="ai-suggestion-btn" onClick={() => handleSuggestion(q)}>{q}</button>
                  ))}
                </div>
              </>
            )}

            {messages.map((msg, i) => (
              <div key={i} className={`ai-message ${msg.role}`}>
                {msg.role === 'user' ? (
                  <div className="ai-message-label" style={{ color: '#E8488A' }}>
                    {tenant?.name ?? 'You'}
                  </div>
                ) : (
                  <div className="ai-message-label" style={{ display: 'flex', alignItems: 'center', gap: 5, color: '#FFB800' }}>
                    <Star size={10} />
                    Star
                  </div>
                )}
                <div className="ai-message-content">{msg.content}</div>
              </div>
            ))}

            {isLoading && (
              <div className="ai-message assistant">
                <div className="ai-message-label">AI</div>
                <div className="ai-message-content ai-typing">Thinking...</div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Action confirmation card */}
          {pendingAction && (
            <div style={{ padding: '12px 14px', margin: '0 12px 8px', background: 'rgba(168,85,247,0.08)', border: '1px solid rgba(168,85,247,0.2)', borderRadius: 12 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#A855F7', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Proposed Action</div>
              <div style={{ fontSize: 13, color: '#E8E8FC', marginBottom: 10, lineHeight: 1.5 }}>{pendingAction.description}</div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button onClick={confirmAction} disabled={isLoading} style={{ flex: 1, padding: '9px', borderRadius: 8, background: '#22C55E', border: 'none', color: '#fff', fontWeight: 700, fontSize: 12, cursor: 'pointer', boxShadow: '0 2px 8px rgba(34,197,94,0.3)' }}>
                  Confirm
                </button>
                <button onClick={rejectAction} style={{ flex: 1, padding: '9px', borderRadius: 8, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: '#A0A0C8', fontWeight: 600, fontSize: 12, cursor: 'pointer' }}>
                  Cancel
                </button>
              </div>
            </div>
          )}

          <div className="ai-panel-input">
            <input
              type="text"
              placeholder={pendingAction ? "Confirm or cancel the action above..." : "Ask a question or give a command..."}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleSend(); }}
              disabled={isLoading}
            />
            <button className="btn-primary" onClick={handleSend} disabled={isLoading || !inputValue.trim()} style={{ padding: '8px 12px' }}>
              <Send size={14} />
            </button>
          </div>
        </aside>
      )}
    </div>
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
