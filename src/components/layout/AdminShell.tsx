import { useState, useRef, useEffect, useContext, createContext, useCallback, lazy, Suspense, useMemo, type CSSProperties, type ReactNode } from 'react'
import { AgentPanel } from '../../lib/components/AgentPanel'
import { AgentPanelProvider, useAgentPanel } from '../../lib/components/AgentPanelContext'
import { getAgent } from '../../lib/agents/agents'
import { getAgentIdForSurface } from '../../lib/agents/pageMap'
import { getAgentPanelActions } from '../../lib/agents/actions'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuthContext } from '../../app/AuthContext'
import { usePermissions } from '../../hooks/usePermissions'
import { usePreviewMode } from '../../hooks/usePreviewMode'
import { ADMIN_NAV_ITEMS } from '../../lib/constants'
import { useTheme } from '../../hooks/useTheme'
import { LayoutDashboard, Users, CalendarDays, UserPlus, BookOpen, Settings2, LogOut, Sparkles, ChevronDown, ShieldCheck, Guitar, Plug, KeyRound, LineChart, Zap } from 'lucide-react'
import ChangePasswordModal from '../shared/ChangePasswordModal'
import NotificationBell from '../shared/NotificationBell'
import FloatingIssueReporter from '../shared/FloatingIssueReporter'
import AgentSidebar from '../shell/AgentSidebar'
import TopBar from '../shell/TopBar'
import Surface from '../shell/Surface'
import Card from '../shell/Card'
import CommandButton from '../shell/CommandButton'
import '../shell/adminShell.css'

const ZiroPanel = lazy(() => import('../ziro/ZiroPanel'))
import { OnboardingProvider } from '../../contexts/OnboardingContext'
import { ZiroShellProvider, useZiroShell } from '../../contexts/ZiroContext'
import StudioDirectorIssueButton from '../shared/StudioDirectorIssueButton'
import PageIntelligenceStrip from '../ziro/PageIntelligenceStrip'
import ZiroDashboard from '../dashboard/ZiroDashboard'
import LeadFailsafePanel from '../admin/LeadFailsafePanel'
import { CommandPalette } from '../../lib/components/CommandPalette'
import { AdminSurfaceProvider, adminPathToSurface, surfaceToVirtualPathname, type AdminSurfaceKey } from '../../contexts/AdminSurfaceContext'
import { getSurfaceByKey } from '../../lib/ziro/pageSurfaceRegistry'
import { setAdminSurface as setAdminSurfaceBus } from '../../lib/admin/adminSurfaceBus'

const NAV_ICONS: Record<string, ReactNode> = {
  dashboard: <LayoutDashboard size={18} strokeWidth={2} />,
  'user-plus': <UserPlus size={18} strokeWidth={2} />,
  calendar: <CalendarDays size={18} strokeWidth={2} />,
  users: <Users size={18} strokeWidth={2} />,
  shield: <ShieldCheck size={18} strokeWidth={2} />,
  guitar: <Guitar size={18} strokeWidth={2} />,
  book: <BookOpen size={18} strokeWidth={2} />,
  zap: <Zap size={18} strokeWidth={2} />,
}

function navItemStyle(active: boolean): CSSProperties {
  return {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    width: '100%',
    padding: '10px 12px',
    borderRadius: 12,
    border: active ? '1px solid rgba(57,255,20,0.38)' : '1px solid transparent',
    background: active
      ? 'linear-gradient(90deg, rgba(57,255,20,0.12) 0%, rgba(200,255,0,0.06) 100%)'
      : 'transparent',
    color: active ? '#f0f2fa' : 'rgba(198,202,222,0.92)',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
    textAlign: 'left',
    fontFamily: 'inherit',
    transition: 'background 0.15s ease, border-color 0.15s ease',
    boxShadow: active ? '0 0 20px rgba(57,255,20,0.08)' : undefined,
  }
}

function AdminAgentRouteSync({ surface, virtualPathname }: { surface: AdminSurfaceKey; virtualPathname: string }) {
  const { agentSay, agentSet, agentRemember, agentRecall } = useAgentPanel()
  useEffect(() => {
    const id = getAgentIdForSurface(surface)
    const segment = virtualPathname.replace(/^\/admin\/?/, '').split('/')[0] || 'dashboard'
    const prevPage = agentRecall<string>('lastPage')
    const prevAgent = agentRecall<typeof id>('lastAgent')
    const lastAction = agentRecall<string>('lastAction')
    const agent = getAgent(id)

    agentSet(id)

    if (prevPage === segment && prevAgent === id) {
      const tail = lastAction ? ` Last time you ran “${lastAction}.”` : ''
      agentSay(`Welcome back!${tail} ${agent.defaultMessage}`)
    } else {
      agentSay(agent.defaultMessage)
    }

    agentRemember('lastPage', segment)
  }, [agentRecall, agentRemember, agentSay, agentSet, surface, virtualPathname])
  return null
}

function AdminShellInner() {
  const navigate = useNavigate()
  const { profile, signOut, role: authRole } = useAuthContext()
  const { isStudioDirector, isCompanyDirector, isOwner, canUseZiro } = usePermissions()
  const showZiroInsights = isOwner || isCompanyDirector
  const { preview } = usePreviewMode()
  const location = useLocation()
  const { panelOpen: aiPanelOpen, togglePanel, closePanel } = useZiroShell()
  const [showChangePassword, setShowChangePassword] = useState(false)
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false)
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const theme = useTheme()

  useEffect(() => {
    if (!location.pathname.startsWith('/admin')) return
    if (location.pathname.startsWith('/admin/') && location.pathname !== '/admin') navigate('/admin', { replace: true })
  }, [location.pathname, navigate])

  const [surface, setSurface] = useState<AdminSurfaceKey>(() => {
    const fromPath = adminPathToSurface(location.pathname)
    return fromPath ?? 'dashboard'
  })

  const virtualPathname = useMemo(() => surfaceToVirtualPathname(surface), [surface])
  const activeAgent = useMemo(() => getAgent(getAgentIdForSurface(surface)), [surface])

  useEffect(() => {
    setAdminSurfaceBus(surface)
  }, [surface])

  useEffect(() => {
    const fromPath = adminPathToSurface(location.pathname)
    if (fromPath && fromPath !== surface) setSurface(fromPath)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname])

  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(() => {
    const set = new Set<string>()
    for (const item of ADMIN_NAV_ITEMS) {
      if (item.children?.some(c => c.surface === surface)) set.add(item.label)
    }
    return set
  })

  useEffect(() => {
    for (const item of ADMIN_NAV_ITEMS) {
      if (item.children?.some(c => c.surface === surface)) {
        setExpandedGroups(prev => {
          const next = new Set(prev)
          next.add(item.label)
          return next
        })
      }
    }
  }, [surface])

  const agentPanelActions = useMemo(() => getAgentPanelActions(getAgentIdForSurface(surface)), [surface])

  const toggleGroup = (label: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev)
      if (next.has(label)) next.delete(label)
      else next.add(label)
      return next
    })
  }

  useEffect(() => {
    const onNav = (e: Event) => {
      const detail = (e as CustomEvent<{ path: string }>).detail
      if (detail?.path?.startsWith('/admin')) {
        const next = adminPathToSurface(detail.path)
        if (next) setSurface(next)
      }
    }
    window.addEventListener('ziro-navigate', onNav as EventListener)
    return () => window.removeEventListener('ziro-navigate', onNav as EventListener)
  }, [])

  useEffect(() => {
    const onSurface = (e: Event) => {
      const detail = (e as CustomEvent<{ surface: AdminSurfaceKey }>).detail
      if (detail?.surface) setSurface(detail.surface)
    }
    window.addEventListener('admin-surface', onSurface as EventListener)
    return () => window.removeEventListener('admin-surface', onSurface as EventListener)
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setCommandPaletteOpen((o) => !o)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const surfaceMeta = getSurfaceByKey(surface)
  const surfaceTitle = surfaceMeta?.title ?? surface
  const surfaceSubtitle = surfaceMeta?.intelligenceSummary ?? ''

  const navContent = (
    <NavTooltipProvider>
      {ADMIN_NAV_ITEMS.filter((item) => {
        if (item.surface === 'zirowork' && !(authRole === 'owner' || authRole === 'admin')) return false
        const HIDDEN_FOR_STUDIO_DIR: AdminSurfaceKey[] = ['financials', 'recruitment', 'payroll', 'integrations']
        const HIDDEN_FOR_COMPANY_DIR: AdminSurfaceKey[] = ['financials']
        if (isStudioDirector) {
          if (item.surface && HIDDEN_FOR_STUDIO_DIR.includes(item.surface as AdminSurfaceKey)) return false
          if (item.children) {
            const filtered = item.children.filter((c) => !HIDDEN_FOR_STUDIO_DIR.includes(c.surface as AdminSurfaceKey))
            if (filtered.length === 0) return false
          }
        }
        if (isCompanyDirector && !isOwner) {
          if (item.surface && HIDDEN_FOR_COMPANY_DIR.includes(item.surface as AdminSurfaceKey)) return false
        }
        return true
      }).map((item, idx) => {
        const showDividerBefore = idx === 3 || idx === 5
        const isGroup = !!item.children
        const isGroupOpen = expandedGroups.has(item.label)
        const isChildActive = item.children?.some((c) => c.surface === surface) ?? false
        const showTip = isGroup

        return (
          <div key={item.label}>
            {showDividerBefore ? (
              <div style={{ height: 1, background: 'rgba(255,255,255,0.06)', margin: '10px 8px' }} />
            ) : null}
            {isGroup ? (
              <>
                <NavTooltipTrigger label={item.label} children_list={item.children} show={showTip}>
                  <button
                    type="button"
                    className={isChildActive ? 'active' : ''}
                    onClick={(e) => {
                      e.stopPropagation()
                      if (item.children?.[0]) setSurface(item.children[0].surface as AdminSurfaceKey)
                      toggleGroup(item.label)
                    }}
                    style={navItemStyle(isChildActive)}
                  >
                    <span style={{ opacity: 0.85 }}>{NAV_ICONS[item.icon]}</span>
                    <span style={{ flex: 1 }}>{item.label}</span>
                    <ChevronDown
                      size={14}
                      style={{
                        transition: 'transform 200ms ease',
                        transform: isGroupOpen ? 'rotate(0deg)' : 'rotate(-90deg)',
                        color: 'rgba(139,144,168,0.85)',
                        flexShrink: 0,
                      }}
                    />
                  </button>
                </NavTooltipTrigger>
                {isGroupOpen && (
                  <div style={{ marginLeft: 6, marginTop: 2 }}>
                    {item.children!
                      .filter((c) => {
                        const HIDDEN: AdminSurfaceKey[] = ['financials', 'recruitment', 'payroll']
                        if (isStudioDirector && HIDDEN.includes(c.surface as AdminSurfaceKey)) return false
                        if (isCompanyDirector && !isOwner && c.surface === 'financials') return false
                        return true
                      })
                      .map((child) => (
                        <NavTooltipTrigger key={child.surface} label={child.label} show={false}>
                          <button
                            type="button"
                            onClick={(e) => e.stopPropagation()}
                            onMouseDown={(e) => e.preventDefault()}
                            onClickCapture={() => {
                              setSurface(child.surface as AdminSurfaceKey)
                              setMobileNavOpen(false)
                            }}
                            style={{
                              ...navItemStyle(surface === (child.surface as AdminSurfaceKey)),
                              paddingLeft: 20,
                              fontSize: 12,
                              fontWeight: 600,
                              marginTop: 2,
                            }}
                          >
                            <span className="nav-label">{child.label}</span>
                          </button>
                        </NavTooltipTrigger>
                      ))}
                  </div>
                )}
              </>
            ) : (
              <NavTooltipTrigger label={item.label} show>
                <button
                  type="button"
                  onClick={(e) => e.stopPropagation()}
                  onMouseDown={(e) => e.preventDefault()}
                  onClickCapture={() => {
                    setSurface(item.surface as AdminSurfaceKey)
                    setMobileNavOpen(false)
                  }}
                  style={navItemStyle(surface === (item.surface as AdminSurfaceKey))}
                >
                  <span style={{ opacity: 0.85 }}>{NAV_ICONS[item.icon]}</span>
                  <span>{item.label}</span>
                </button>
              </NavTooltipTrigger>
            )}
          </div>
        )
      })}

      <div style={{ height: 1, background: 'rgba(255,255,255,0.06)', margin: '12px 8px' }} />

      {canUseZiro ? (
        <button
          type="button"
          onClick={() => {
            togglePanel()
            setMobileNavOpen(false)
          }}
          style={navItemStyle(aiPanelOpen)}
        >
          <Sparkles size={17} strokeWidth={2} />
          <span>Ziro</span>
        </button>
      ) : null}

      {showZiroInsights ? (
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            setSurface('ziro_insights')
            setMobileNavOpen(false)
          }}
          style={navItemStyle(surface === 'ziro_insights')}
        >
          <LineChart size={17} strokeWidth={2} />
          <span>Insights</span>
        </button>
      ) : null}

      {!isStudioDirector ? (
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            setSurface('integrations')
            setMobileNavOpen(false)
          }}
          style={navItemStyle(surface === 'integrations')}
        >
          <Plug size={17} strokeWidth={2} />
          <span>Integrations</span>
        </button>
      ) : null}

      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => {
          setSurface('settings')
          setMobileNavOpen(false)
        }}
        style={navItemStyle(surface === 'settings')}
      >
        <Settings2 size={17} strokeWidth={2} />
        <span>Settings</span>
      </button>
    </NavTooltipProvider>
  )

  const sidebarFooter = (
    <>
      {isStudioDirector ? (
        <div style={{ marginBottom: 10 }}>
          <StudioDirectorIssueButton variant="sidebar" />
        </div>
      ) : null}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        <div
          style={{
            width: 40,
            height: 40,
            borderRadius: 12,
            background: 'linear-gradient(135deg, rgba(57,255,20,0.2), rgba(200,255,0,0.12))',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 800,
            color: '#39ff14',
            fontSize: 15,
            border: '1px solid rgba(255,255,255,0.08)',
          }}
        >
          {profile?.first_name?.[0] ?? 'U'}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#e8eaf4', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {profile?.first_name} {profile?.last_name}
          </div>
          <div style={{ fontSize: 11, color: 'rgba(139,144,168,0.9)', textTransform: 'capitalize' }}>{authRole}</div>
        </div>
        <button
          type="button"
          className="btn-ghost"
          onClick={() => setShowChangePassword(true)}
          title="Change password"
          style={{ padding: 8, color: 'rgba(184,188,208,0.9)', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, cursor: 'pointer' }}
        >
          <KeyRound size={16} />
        </button>
        <SignOutButton signOut={signOut} />
      </div>
      <ChangePasswordModal open={showChangePassword} onClose={() => setShowChangePassword(false)} />
    </>
  )

  return (
    <AdminSurfaceProvider value={{ surface, setSurface, virtualPathname }}>
      <div className="zw-shell" style={preview.active ? { paddingTop: 48 } : undefined}>
        <div className="zw-shell__bg" aria-hidden />

        <div className="zw-shell__grid">
          <AgentSidebar
            agent={activeAgent}
            studioLogoUrl={theme.logoUrl || '/lp-logo.png?v=2'}
            studioName={theme.studioName}
            mobileOpen={mobileNavOpen}
            onMobileClose={() => setMobileNavOpen(false)}
            footer={sidebarFooter}
          >
            {navContent}
          </AgentSidebar>

          <div className="zw-shell__main">
            <AdminAgentRouteSync surface={surface} virtualPathname={virtualPathname} />
            <TopBar
              title={surfaceTitle}
              subtitle={surfaceSubtitle}
              studioName={theme.studioName}
              showMobileMenu
              onOpenMobileNav={() => setMobileNavOpen(true)}
              trailing={<NotificationBell sidebarOpen />}
            />
            <Surface>
              {surface === 'dashboard' ? (
                <>
                  <ZiroDashboard />
                  <LeadFailsafePanel />
                </>
              ) : (
                <>
                  <Card elevated title="Surface">
                    <p style={{ margin: 0, fontSize: 15, lineHeight: 1.6, color: 'rgba(210,214,232,0.92)' }}>{surfaceSubtitle}</p>
                  </Card>
                  <div style={{ marginTop: 24 }}>
                    <PageIntelligenceStrip />
                  </div>
                </>
              )}
            </Surface>
          </div>
        </div>

        <AgentPanel variant="floating" agentActions={agentPanelActions} />

        <CommandButton onClick={() => setCommandPaletteOpen(true)} />
        <FloatingIssueReporter />

        {canUseZiro ? (
          <Suspense fallback={null}>
            <ZiroPanel open={aiPanelOpen} onClose={closePanel} />
          </Suspense>
        ) : null}

        <CommandPalette open={commandPaletteOpen} onClose={() => setCommandPaletteOpen(false)} />
      </div>
    </AdminSurfaceProvider>
  )
}

export default function AdminShell() {
  return (
    <OnboardingProvider>
      <ZiroShellProvider>
        <AgentPanelProvider>
          <AdminShellInner />
        </AgentPanelProvider>
      </ZiroShellProvider>
    </OnboardingProvider>
  )
}

function SignOutButton({ signOut }: { signOut: () => Promise<void> }) {
  const [busy, setBusy] = useState(false)
  return (
    <button
      type="button"
      disabled={busy}
      onClick={async () => {
        if (busy) return
        setBusy(true)
        await signOut()
      }}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 40,
        height: 40,
        borderRadius: 10,
        border: '1px solid rgba(255,255,255,0.1)',
        background: 'rgba(255,255,255,0.04)',
        color: 'rgba(232,234,244,0.9)',
        cursor: busy ? 'wait' : 'pointer',
        opacity: busy ? 0.6 : 1,
      }}
      title="Sign out"
    >
      <LogOut size={16} />
    </button>
  )
}

interface TooltipState {
  label: string
  children_list?: { label: string; surface: string }[]
  rect: DOMRect
}
const TooltipCtx = createContext<{
  show: (s: TooltipState) => void
  hide: () => void
}>({ show: () => {}, hide: () => {} })

function NavTooltipProvider({ children }: { children: ReactNode }) {
  const [tip, setTip] = useState<TooltipState | null>(null)
  const [visible, setVisible] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const showTip = useCallback((s: TooltipState) => {
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      setTip(s)
      setVisible(true)
    }, 280)
  }, [])
  const hideTip = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    setVisible(false)
    setTimeout(() => setTip(null), 150)
  }, [])

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current)
  }, [])

  return (
    <TooltipCtx.Provider value={{ show: showTip, hide: hideTip }}>
      {children}
      {tip ? (
        <div
          style={{
            position: 'fixed',
            left: 308,
            top: tip.rect.top + tip.rect.height / 2,
            transform: 'translateY(-50%)',
            zIndex: 9999,
            pointerEvents: 'none',
            padding: '8px 12px',
            background: 'rgba(18,20,28,0.95)',
            border: '1px solid rgba(57,255,20,0.2)',
            borderRadius: 10,
            boxShadow: '0 12px 32px rgba(0,0,0,0.45)',
            maxWidth: 200,
            opacity: visible ? 1 : 0,
            transition: 'opacity 150ms ease',
          }}
        >
          <div style={{ fontSize: 12, fontWeight: 700, color: '#e8eaf4', whiteSpace: 'nowrap' }}>{tip.label}</div>
          {tip.children_list && tip.children_list.length > 0 ? (
            <div style={{ marginTop: 6 }}>
              {tip.children_list.map((c) => (
                <div key={c.surface} style={{ fontSize: 11, color: 'rgba(184,188,208,0.88)', lineHeight: 1.5 }}>
                  · {c.label}
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </TooltipCtx.Provider>
  )
}

function NavTooltipTrigger({
  label,
  children_list,
  show,
  children,
}: {
  label: string
  children_list?: { label: string; surface: string }[]
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
