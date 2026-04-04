import { useState, useRef, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { X, Send, Star, MessageSquare, BarChart3, Layout } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, PieChart, Pie } from 'recharts'
import { useAuthContext } from '../../app/AuthContext'
import { useStarContext, type StarContext } from '../../hooks/useStarContext'
import { useAI } from '../../hooks/useAI'
import { useTheme } from '../../hooks/useTheme'

// ─── Constants ──────────────────────────────────

const LOCATION_COLORS: Record<string, string> = {
  'Gretna Music Lessons': '#00A651',
  'Bellevue Music Lessons': '#A333FF',
  'Elkhorn Music Lessons': '#00A5E8',
  'Omaha Music Lessons': '#D41113',
}
const LOC_FALLBACK = '#FFB800'

const DEFAULT_CHIPS = [
  'How is my business doing overall?',
  'Which teachers have the most available capacity?',
  'Where should I focus to grow revenue this month?',
]

function getContextualChips(lastMessage: string): string[] {
  const chips: string[] = []
  const lower = lastMessage.toLowerCase()
  if (lower.includes('overdue') || lower.includes('card') || lower.includes('collection'))
    chips.push('Build me a card collection plan for next billing cycle', 'How much revenue am I at risk of not collecting?')
  if (lower.includes('utilization') || lower.includes('open slot') || lower.includes('available'))
    chips.push('Which location has the most open slots I should fill first?', 'How many new students could I take on right now?')
  if (lower.includes('no students') || lower.includes('no active'))
    chips.push('List the teachers with no students and suggest next steps')
  if (lower.includes('lead') || lower.includes('pipeline'))
    chips.push('Which leads need follow-up right now?', 'What was our conversion rate this month?')
  if (lower.includes('retention') || lower.includes('at-risk') || lower.includes('paused'))
    chips.push('Which students are at risk of leaving?', 'What should I do about paused students?')
  return chips.length > 0 ? chips.slice(0, 3) : DEFAULT_CHIPS
}

function dollars(cents: number): string {
  return '$' + (cents / 100).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

function locColor(name: string): string {
  return LOCATION_COLORS[name] ?? LOC_FALLBACK
}

function shortLoc(name: string): string {
  return name.replace(' Music Lessons', '')
}

// ─── Types ─────────────────────────────��────────

type ViewMode = 'split' | 'dashboard' | 'chat'

interface StarModalProps {
  open: boolean
  onClose: () => void
}

// ─��─ Main Component ─────────────────────────────

export default function StarModal({ open, onClose }: StarModalProps) {
  const { tenantId, profile } = useAuthContext()
  const { data: starContext } = useStarContext()
  const theme = useTheme()
  const aiContext = starContext?.summary ?? null
  const { messages, isLoading, sendMessage, clearConversation, pendingAction, confirmAction, rejectAction } = useAI(tenantId, null, aiContext)

  const [inputValue, setInputValue] = useState('')
  const [view, setView] = useState<ViewMode>('split')
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768
  const isTablet = typeof window !== 'undefined' && window.innerWidth >= 768 && window.innerWidth < 1024

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Focus input when opening
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 100)
  }, [open])

  // ESC to close
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose])

  const handleSend = useCallback(() => {
    if (!inputValue.trim() || isLoading) return
    sendMessage(inputValue.trim())
    setInputValue('')
  }, [inputValue, isLoading, sendMessage])

  const handleChip = useCallback((text: string) => {
    sendMessage(text)
  }, [sendMessage])

  const handleNewChat = useCallback(() => {
    clearConversation()
  }, [clearConversation])

  if (!open) return null

  const raw = starContext?.raw
  const schoolName = theme.studioName || 'Your School'

  // Determine effective view based on screen size
  const effectiveView = isMobile ? (view === 'dashboard' ? 'dashboard' : 'chat') : view
  const showChat = effectiveView === 'split' || effectiveView === 'chat'
  const showDashboard = effectiveView === 'split' || effectiveView === 'dashboard'

  // Suggested chips
  const lastAssistantMsg = [...messages].reverse().find(m => m.role === 'assistant')?.content ?? ''
  const chips = messages.length === 0 ? DEFAULT_CHIPS : getContextualChips(lastAssistantMsg)

  const modal = (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={onClose}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: isMobile ? '100vw' : isTablet ? '95vw' : '100%',
          maxWidth: isMobile ? '100vw' : 1200,
          height: isMobile ? '100vh' : isTablet ? '90vh' : '90vh',
          maxHeight: isMobile ? '100vh' : '90vh',
          background: '#020209',
          borderRadius: isMobile ? 0 : 14,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          border: isMobile ? 'none' : '1px solid rgba(255,255,255,0.08)',
          boxShadow: '0 24px 80px rgba(0,0,0,0.8)',
        }}
      >
        {/* HEADER */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10, padding: isMobile ? '12px 16px' : '14px 20px',
          borderBottom: '1px solid rgba(255,255,255,0.06)', flexShrink: 0,
        }}>
          {/* Star logo */}
          <div style={{
            width: 32, height: 32, borderRadius: 10,
            background: 'linear-gradient(135deg, #D4226A, #FF5500)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            <Star size={16} fill="#fff" color="#fff" />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 15, fontWeight: 800, color: '#fff' }}>Star</span>
              <span style={{ width: 6, height: 6, borderRadius: 3, background: '#22C55E', boxShadow: '0 0 6px rgba(34,197,94,0.6)' }} />
            </div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', fontWeight: 500 }}>Live · {schoolName}</div>
          </div>

          {/* View switcher */}
          <div style={{ display: 'flex', gap: 2, background: 'rgba(255,255,255,0.04)', borderRadius: 8, padding: 2 }}>
            {isMobile ? (
              <>
                <ViewTab active={effectiveView === 'chat'} onClick={() => setView('chat')} icon={<MessageSquare size={13} />} label="Chat" />
                <ViewTab active={effectiveView === 'dashboard'} onClick={() => setView('dashboard')} icon={<BarChart3 size={13} />} label="Dashboard" />
              </>
            ) : (
              <>
                <ViewTab active={view === 'split'} onClick={() => setView('split')} icon={<Layout size={13} />} label={isTablet ? 'Both' : 'Chat + Charts'} />
                {!isTablet && <ViewTab active={view === 'dashboard'} onClick={() => setView('dashboard')} icon={<BarChart3 size={13} />} label="Dashboard" />}
                <ViewTab active={view === 'chat'} onClick={() => setView('chat')} icon={<MessageSquare size={13} />} label="Chat Only" />
              </>
            )}
          </div>

          <button onClick={onClose} style={{
            width: 32, height: 32, borderRadius: 8, background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', color: 'rgba(255,255,255,0.5)', flexShrink: 0,
          }}>
            <X size={16} />
          </button>
        </div>

        {/* BODY — split or single */}
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden', minHeight: 0 }}>
          {/* CHAT PANEL */}
          {showChat && (
            <div style={{
              width: (showDashboard && !isMobile) ? (isTablet ? 380 : 400) : '100%',
              minWidth: (showDashboard && !isMobile) ? (isTablet ? 380 : 400) : undefined,
              display: 'flex', flexDirection: 'column',
              borderRight: (showDashboard && !isMobile) ? '1px solid rgba(255,255,255,0.06)' : 'none',
            }}>
              {/* Messages */}
              <div style={{ flex: 1, overflowY: 'auto', padding: isMobile ? '16px 16px 8px' : '20px 20px 8px' }}>
                {messages.length === 0 && (
                  <div style={{ textAlign: 'center', padding: '40px 20px 20px' }}>
                    <div style={{
                      width: 48, height: 48, borderRadius: 14, margin: '0 auto 14px',
                      background: 'linear-gradient(135deg, #D4226A, #FF5500)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      <Star size={22} fill="#fff" color="#fff" />
                    </div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: '#fff', marginBottom: 6 }}>
                      Hey{profile?.first_name ? ` ${profile.first_name}` : ''}!
                    </div>
                    <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', lineHeight: 1.6 }}>
                      I'm <strong style={{ color: '#D4226A' }}>Star</strong> — your music school intelligence. I'm looking at {schoolName}'s live data right now. Ask me anything.
                    </div>
                  </div>
                )}

                {messages.map((msg, i) => (
                  <div key={i} style={{
                    display: 'flex', flexDirection: 'column',
                    alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start',
                    marginBottom: 14,
                  }}>
                    {msg.role === 'assistant' && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 4 }}>
                        <div style={{
                          width: 18, height: 18, borderRadius: 6,
                          background: 'linear-gradient(135deg, #D4226A, #FF5500)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                          <Star size={9} fill="#fff" color="#fff" />
                        </div>
                        <span style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.4)' }}>Star</span>
                      </div>
                    )}
                    <div style={{
                      maxWidth: '88%', padding: '10px 14px', borderRadius: 12,
                      fontSize: 13, lineHeight: 1.65, whiteSpace: 'pre-wrap',
                      ...(msg.role === 'user'
                        ? { background: 'rgba(212,34,106,0.12)', border: '1px solid rgba(212,34,106,0.2)', color: '#fff' }
                        : { background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.85)' }),
                    }}>
                      {msg.content}
                    </div>
                  </div>
                ))}

                {isLoading && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 14 }}>
                    <div style={{
                      width: 18, height: 18, borderRadius: 6,
                      background: 'linear-gradient(135deg, #D4226A, #FF5500)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      <Star size={9} fill="#fff" color="#fff" />
                    </div>
                    <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', fontStyle: 'italic' }}>Thinking...</span>
                  </div>
                )}

                <div ref={messagesEndRef} />
              </div>

              {/* Action confirmation */}
              {pendingAction && (
                <div style={{ padding: '10px 16px', margin: '0 12px 6px', background: 'rgba(168,85,247,0.08)', border: '1px solid rgba(168,85,247,0.2)', borderRadius: 10 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: '#A855F7', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Proposed Action</div>
                  <div style={{ fontSize: 12, color: '#E8E8FC', marginBottom: 8, lineHeight: 1.5 }}>{pendingAction.description}</div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button onClick={confirmAction} disabled={isLoading} style={{ flex: 1, padding: 8, borderRadius: 8, background: '#22C55E', border: 'none', color: '#fff', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>Confirm</button>
                    <button onClick={rejectAction} style={{ flex: 1, padding: 8, borderRadius: 8, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: '#A0A0C8', fontWeight: 600, fontSize: 12, cursor: 'pointer' }}>Cancel</button>
                  </div>
                </div>
              )}

              {/* Suggested chips */}
              <div style={{ padding: '6px 16px', display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {chips.map(chip => (
                  <button
                    key={chip}
                    onClick={() => handleChip(chip)}
                    disabled={isLoading}
                    style={{
                      fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.5)',
                      background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
                      borderRadius: 20, padding: '5px 12px', cursor: 'pointer',
                      whiteSpace: 'normal', textAlign: 'left',
                    }}
                  >
                    {chip}
                  </button>
                ))}
              </div>

              {/* Input bar */}
              <div style={{
                display: 'flex', gap: 8, padding: isMobile ? '10px 16px 20px' : '10px 16px 14px',
                borderTop: '1px solid rgba(255,255,255,0.06)', flexShrink: 0,
              }}>
                {messages.length > 0 && (
                  <button onClick={handleNewChat} title="New chat" style={{
                    width: 38, height: 38, borderRadius: 10, background: 'rgba(255,255,255,0.04)',
                    border: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    cursor: 'pointer', color: 'rgba(255,255,255,0.4)', flexShrink: 0,
                  }}>
                    <MessageSquare size={14} />
                  </button>
                )}
                <input
                  ref={inputRef}
                  type="text"
                  value={inputValue}
                  onChange={e => setInputValue(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleSend() }}
                  disabled={isLoading}
                  placeholder="Ask Star anything about your business..."
                  style={{
                    flex: 1, padding: '10px 14px', borderRadius: 10, fontSize: 13,
                    background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
                    color: '#fff', outline: 'none', fontFamily: 'inherit',
                  }}
                />
                <button
                  onClick={handleSend}
                  disabled={isLoading || !inputValue.trim()}
                  style={{
                    width: 38, height: 38, borderRadius: 10, flexShrink: 0,
                    background: inputValue.trim() ? 'linear-gradient(135deg, #D4226A, #FF5500)' : 'rgba(255,255,255,0.04)',
                    border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    cursor: inputValue.trim() ? 'pointer' : 'default',
                    color: inputValue.trim() ? '#fff' : 'rgba(255,255,255,0.3)',
                  }}
                >
                  <Send size={14} />
                </button>
              </div>
            </div>
          )}

          {/* DASHBOARD PANEL */}
          {showDashboard && raw && (
            <div style={{ flex: 1, overflowY: 'auto', padding: isMobile ? 16 : 20, minWidth: 0 }}>
              <DashboardPanel raw={raw} isMobile={isMobile} isTablet={isTablet} onChipClick={(t) => { setView('chat'); handleChip(t) }} />
            </div>
          )}
        </div>
      </div>
    </div>
  )

  return createPortal(modal, document.body)
}

// ─── View Tab Button ────────────────────────────

function ViewTab({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px', borderRadius: 6,
        fontSize: 11, fontWeight: 700, cursor: 'pointer', border: 'none',
        background: active ? 'rgba(212,34,106,0.15)' : 'transparent',
        color: active ? '#D4226A' : 'rgba(255,255,255,0.4)',
      }}
    >
      {icon}
      {label}
    </button>
  )
}

// ─── Dashboard Panel ────────────────────────────

function DashboardPanel({ raw, isMobile, isTablet, onChipClick }: {
  raw: StarContext['raw']
  isMobile: boolean
  isTablet: boolean
  onChipClick: (text: string) => void
}) {
  const mrr = (raw.billing?.estimated_mrr_cents ?? 0) / 100
  const overdue = (raw.families?.total_overdue_cents ?? 0) / 100
  const utilPct = raw.schedule?.utilization_pct ?? 0
  const activeStudents = raw.students?.active ?? 0

  // Chart data
  const mrrByLoc = (raw.billing?.mrr_by_location ?? []).map(l => ({
    name: shortLoc(l.location),
    value: (l.mrr_cents ?? 0) / 100,
    fill: locColor(l.location),
  }))

  const booked = raw.schedule?.booked_this_week ?? 0
  const available = raw.schedule?.available_this_week ?? 0
  const scheduleData = [
    { name: 'Booked', value: booked, fill: '#D4226A' },
    { name: 'Available', value: available, fill: 'rgba(255,255,255,0.07)' },
  ]

  const instruments = (raw.students?.by_instrument ?? []).slice(0, 6).map(i => ({
    name: i.instrument ? i.instrument.charAt(0).toUpperCase() + i.instrument.slice(1) : '?',
    count: i.count,
  }))

  const kpiCols = isMobile ? 2 : isTablet ? 2 : 4
  const chartH = isMobile ? 200 : isTablet ? 180 : 160

  return (
    <>
      {/* KPI STRIP */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${kpiCols}, 1fr)`,
        gap: isMobile ? 10 : 12,
        marginBottom: isMobile ? 20 : 24,
      }}>
        <KpiCard label="Est. MRR" value={`$${mrr.toLocaleString('en-US', { minimumFractionDigits: 0 })}`} color="#22C55E" isMobile={isMobile} />
        <KpiCard label="Active Students" value={String(activeStudents)} color="#D4226A" isMobile={isMobile} />
        <KpiCard label="Utilization" value={`${utilPct}%`} color="#38BDF8" isMobile={isMobile} />
        <KpiCard label="Overdue" value={overdue > 0 ? `$${overdue.toLocaleString('en-US', { minimumFractionDigits: 0 })}` : '$0'} color="#EF4444" isMobile={isMobile} />
      </div>

      {/* REVENUE BY LOCATION */}
      {mrrByLoc.length > 0 && (
        <ChartCard title="Revenue by Location" isMobile={isMobile}>
          <ResponsiveContainer width="100%" height={chartH}>
            <BarChart data={mrrByLoc} layout="vertical" margin={{ left: 0, right: 20, top: 5, bottom: 5 }}>
              <XAxis type="number" tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} tick={{ fill: 'rgba(255,255,255,0.5)', fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="name" width={70} tick={{ fill: 'rgba(255,255,255,0.6)', fontSize: 12, fontWeight: 600 }} axisLine={false} tickLine={false} />
              <Tooltip
                formatter={(v: number) => [`$${v.toLocaleString('en-US')}/mo`, 'MRR']}
                contentStyle={{ background: '#1a1a2e', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 12 }}
                labelStyle={{ color: '#fff', fontWeight: 700 }}
                itemStyle={{ color: 'rgba(255,255,255,0.8)' }}
              />
              <Bar dataKey="value" radius={[0, 6, 6, 0]} barSize={isMobile ? 24 : 20}>
                {mrrByLoc.map((entry, idx) => (
                  <Cell key={idx} fill={entry.fill} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      )}

      {/* Bottom charts — 2-column on desktop, stacked on mobile/tablet */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: (isMobile || isTablet) ? '1fr' : '1fr 1fr',
        gap: isMobile ? 16 : 20,
      }}>
        {/* SCHEDULE UTILIZATION DONUT */}
        <ChartCard title="Schedule Utilization" isMobile={isMobile}>
          <div style={{ position: 'relative' }}>
            <ResponsiveContainer width="100%" height={chartH + 30}>
              <PieChart>
                <Pie
                  data={scheduleData}
                  cx="50%" cy="45%"
                  innerRadius={isMobile ? 55 : 48}
                  outerRadius={isMobile ? 75 : 65}
                  dataKey="value"
                  startAngle={90}
                  endAngle={-270}
                  stroke="none"
                >
                  {scheduleData.map((entry, idx) => (
                    <Cell key={idx} fill={entry.fill} />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            {/* Center label */}
            <div style={{
              position: 'absolute', top: '38%', left: '50%', transform: 'translate(-50%, -50%)',
              textAlign: 'center', pointerEvents: 'none',
            }}>
              <div style={{ fontSize: isMobile ? 22 : 20, fontWeight: 800, color: '#D4226A' }}>{utilPct}%</div>
              <div style={{ fontSize: 9, fontWeight: 700, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Utilized</div>
            </div>
            {/* Legend */}
            <div style={{ display: 'flex', justifyContent: 'center', gap: 16, marginTop: -10 }}>
              <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>
                <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 4, background: '#D4226A', marginRight: 5, verticalAlign: 'middle' }} />
                {booked} booked
              </span>
              <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>
                <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 4, background: 'rgba(255,255,255,0.15)', marginRight: 5, verticalAlign: 'middle' }} />
                {available} available
              </span>
            </div>
          </div>
        </ChartCard>

        {/* STUDENTS BY INSTRUMENT */}
        {instruments.length > 0 && (
          <ChartCard title="Students by Instrument" isMobile={isMobile}>
            <ResponsiveContainer width="100%" height={chartH + 30}>
              <BarChart data={instruments} margin={{ left: 0, right: 10, top: 5, bottom: 5 }}>
                <XAxis dataKey="name" tick={{ fill: 'rgba(255,255,255,0.5)', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 11 }} axisLine={false} tickLine={false} width={30} />
                <Tooltip
                  formatter={(v: number) => [v, 'Students']}
                  contentStyle={{ background: '#1a1a2e', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 12 }}
                  labelStyle={{ color: '#fff', fontWeight: 700 }}
                  itemStyle={{ color: 'rgba(255,255,255,0.8)' }}
                />
                <Bar dataKey="count" radius={[6, 6, 0, 0]} barSize={isMobile ? 30 : 24} fill="rgba(212,34,106,0.7)">
                  {instruments.map((_, idx) => (
                    <Cell key={idx} fill="rgba(212,34,106,0.7)" />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        )}
      </div>

      {/* ALERT STRIP — card collection */}
      {(raw.families?.no_card_on_file ?? 0) > 50 && (
        <div style={{
          marginTop: isMobile ? 16 : 20, padding: '12px 16px', borderRadius: 12,
          background: 'rgba(255,184,0,0.06)', border: '1px solid rgba(255,184,0,0.15)',
          display: 'flex', alignItems: isMobile ? 'flex-start' : 'center',
          flexDirection: isMobile ? 'column' : 'row', gap: 10,
        }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#FFB800' }}>
              {raw.families.no_card_on_file} families without a card on file
            </div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>
              That's potential revenue at risk of not being collected.
            </div>
          </div>
          <button
            onClick={() => onChipClick('Build me a plan to collect cards from families who don\'t have one on file')}
            style={{
              fontSize: 11, fontWeight: 700, color: '#FFB800', background: 'rgba(255,184,0,0.1)',
              border: '1px solid rgba(255,184,0,0.2)', borderRadius: 8, padding: '6px 14px',
              cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
            }}
          >
            Build a plan
          </button>
        </div>
      )}
    </>
  )
}

// ──��� KPI Card ─���─────────────────────────────────

function KpiCard({ label, value, color, isMobile }: { label: string; value: string; color: string; isMobile: boolean }) {
  return (
    <div style={{
      padding: isMobile ? '14px 12px' : '14px 16px',
      borderRadius: 12, background: 'rgba(255,255,255,0.03)',
      border: '1px solid rgba(255,255,255,0.06)',
    }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.4)', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: isMobile ? 20 : 22, fontWeight: 800, color }}>{value}</div>
    </div>
  )
}

// ─── Chart Card ─────────────────────────────────

function ChartCard({ title, isMobile, children }: { title: string; isMobile: boolean; children: React.ReactNode }) {
  return (
    <div style={{
      padding: isMobile ? 14 : 16, borderRadius: 12,
      background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)',
      marginBottom: isMobile ? 16 : 20,
    }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.5)', marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{title}</div>
      {children}
    </div>
  )
}
