import { useState, useRef, useEffect, type ReactNode } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import PageTransition from '../shared/PageTransition'
import { useQuery } from '@tanstack/react-query'
import { useAuthContext } from '../../app/AuthContext'
import { ADMIN_NAV_ITEMS } from '../../lib/constants'
import { useAI } from '../../hooks/useAI'
import { supabase } from '../../lib/supabase'
import { LayoutDashboard, Users, Calendar, GraduationCap, Music2, CreditCard, DollarSign, Sparkles, Settings2, LogOut, Send, Star, Home, ChevronDown, UsersRound } from 'lucide-react'

const NAV_ICONS: Record<string, ReactNode> = {
  grid: <LayoutDashboard size={15} />,
  target: <Users size={15} />,
  calendar: <Calendar size={15} />,
  users: <GraduationCap size={15} />,
  families: <Home size={15} />,
  roster: <UsersRound size={15} />,
  music: <Music2 size={15} />,
  dollar: <CreditCard size={15} />,
  payroll: <DollarSign size={15} />,
}

const SUGGESTIONS = [
  "What should I focus on today?",
  "How can I fill more open slots this week?",
  "Which leads need attention right now?",
  "Find coverage for today's callouts",
]

export default function AdminShell() {
  const { profile, tenantId, signOut } = useAuthContext()
  const location = useLocation()
  const [aiPanelOpen, setAiPanelOpen] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [inputValue, setInputValue] = useState('')
  const { messages, isLoading, sendMessage, clearConversation, pendingAction, confirmAction, rejectAction } = useAI(tenantId)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Roster group expand/collapse
  const [rosterExpanded, setRosterExpanded] = useState(() => {
    const stored = localStorage.getItem('nav_roster_expanded')
    return stored !== null ? stored === 'true' : true // expanded by default
  })

  // Auto-expand Roster if on a child route
  useEffect(() => {
    const rosterPaths = ['/admin/students', '/admin/families']
    if (rosterPaths.some(p => location.pathname.startsWith(p)) && !rosterExpanded) {
      setRosterExpanded(true)
    }
  }, [location.pathname])

  useEffect(() => {
    localStorage.setItem('nav_roster_expanded', String(rosterExpanded))
  }, [rosterExpanded])

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

  const handleSend = () => {
    if (!inputValue.trim() || isLoading) return
    sendMessage(inputValue)
    setInputValue('')
  }

  const handleSuggestion = (q: string) => {
    sendMessage(q)
  }

  return (
    <div className="admin-shell">
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
        className={`admin-sidebar ${sidebarCollapsed ? 'collapsed' : ''}`}
        onClick={sidebarCollapsed ? () => setSidebarCollapsed(false) : undefined}
        style={sidebarCollapsed ? { cursor: 'pointer' } : undefined}
      >
        <div className="sidebar-brand" onClick={!sidebarCollapsed ? () => setSidebarCollapsed(true) : undefined} style={{ cursor: 'pointer' }}>
          <div className="sidebar-logomark">L</div>
          {!sidebarCollapsed && (
            <div className="sidebar-brand-text">
              <div className="sidebar-brand-name">Lessonpreneur</div>
              <div className="sidebar-brand-sub">Music School OS</div>
            </div>
          )}
        </div>

        <nav className="sidebar-nav">
          <div className="nav-group-label">Main</div>
          {ADMIN_NAV_ITEMS.map((item) => {
            // Collapsible group (Roster)
            if (item.children) {
              const childPaths = item.children.map(c => c.path)
              const isChildActive = childPaths.some(p => location.pathname.startsWith(p))
              return (
                <div key={item.label}>
                  <button
                    className={`nav-item ${isChildActive ? 'active' : ''}`}
                    onClick={(e) => { e.stopPropagation(); setRosterExpanded(!rosterExpanded) }}
                    title={sidebarCollapsed ? item.label : undefined}
                    style={{ width: '100%', textAlign: 'left', border: 'none', cursor: 'pointer' }}
                  >
                    {NAV_ICONS[item.icon]}
                    <span className="nav-label" style={{ flex: 1 }}>{item.label}</span>
                    {!sidebarCollapsed && (
                      <ChevronDown size={12} style={{
                        transition: 'transform 200ms ease',
                        transform: rosterExpanded ? 'rotate(0deg)' : 'rotate(-90deg)',
                        color: '#8080A8',
                      }} />
                    )}
                  </button>
                  {rosterExpanded && !sidebarCollapsed && (
                    <div style={{ paddingLeft: 14 }}>
                      {item.children.map((child) => (
                        <NavLink
                          key={child.path}
                          to={child.path}
                          onClick={(e) => e.stopPropagation()}
                          className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
                          style={{ paddingLeft: 22, fontSize: 13, borderLeft: '2px solid transparent', ...(location.pathname.startsWith(child.path) ? { borderLeftColor: '#D4226A' } : {}) }}
                        >
                          <span className="nav-label">{child.label}</span>
                        </NavLink>
                      ))}
                    </div>
                  )}
                </div>
              )
            }

            return (
              <NavLink
                key={item.path}
                to={item.path}
                title={sidebarCollapsed ? item.label : undefined}
                onClick={(e) => e.stopPropagation()}
                className={({ isActive }) =>
                  `nav-item ${isActive ? 'active' : ''}`
                }
              >
                {NAV_ICONS[item.icon]}
                <span className="nav-label">{item.label}</span>
              </NavLink>
            )
          })}
        </nav>

        <div className="sidebar-footer">
          <button
            className={`nav-item ${aiPanelOpen ? 'active' : ''}`}
            onClick={(e) => { e.stopPropagation(); setAiPanelOpen(!aiPanelOpen) }}
            title={sidebarCollapsed ? 'AI Assistant' : undefined}
          >
            <Star size={15} />
            <span className="nav-label">Star</span>
          </button>

          <NavLink to="/admin/settings" title={sidebarCollapsed ? 'Settings' : undefined} onClick={(e) => e.stopPropagation()} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
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
              {sidebarCollapsed ? <LogOut size={13} /> : 'Sign Out'}
            </button>
          </div>
        </div>
      </aside>

      <main className="admin-main">
        <PageTransition><Outlet /></PageTransition>
      </main>

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
