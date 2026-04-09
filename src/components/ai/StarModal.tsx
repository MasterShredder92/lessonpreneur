import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { X, Send, Star, MessageSquare } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, PieChart, Pie } from 'recharts'
import { useAuthContext } from '../../app/AuthContext'
import { useStarGlobalContext, type StarContext } from '../../hooks/useStarContext'
import { useStarBusinessChat } from '../../hooks/useAI'
import { useTheme } from '../../hooks/useTheme'
import { instrumentWithEmojiTitle } from '../../utils/instrumentEmoji'
import type { BillingSnapshotData } from '../../services/billingSnapshotQuery'

// ─── Constants ──────────────────────────────────

/** Non-empty `system_override` while `get_star_context` is loading — keeps business path; never scheduling mode. */
const STAR_BUSINESS_LOADING_PROMPT =
  '[STAR INTERNAL] School snapshot is still loading. Do not use scheduling tools or invent metrics. If the user sends a message, reply only: "School data is still loading — please wait a moment."'

const DEFAULT_CHIPS = [
  'How is my business doing overall?',
  'Which teachers have the most available capacity?',
  'Where should I focus to grow revenue this month?',
]

function getContextualChips(lastMessage: string): string[] {
  const chips: string[] = []
  const lower = lastMessage.toLowerCase()
  if (lower.includes('utilization') || lower.includes('open slot') || lower.includes('available'))
    chips.push('Which location has the most open slots I should fill first?', 'How many new students could I take on right now?')
  if (lower.includes('no students') || lower.includes('no active'))
    chips.push('List the teachers with no students and suggest next steps')
  if (lower.includes('lead') || lower.includes('pipeline'))
    chips.push('Which leads need follow-up right now?', 'What was our conversion rate this month?')
  if (lower.includes('retention') || lower.includes('at-risk') || lower.includes('paused'))
    chips.push('Which students are at risk of leaving?', 'What should I do about paused students?')
  if (lower.includes('bill') || lower.includes('collect') || lower.includes('invoic'))
    chips.push('Summarize billing performance this month from the snapshot', 'What should I watch for next billing cycle?')
  return chips.length > 0 ? chips.slice(0, 3) : DEFAULT_CHIPS
}

// ─── Main Component ─────────────────────────────

interface StarModalProps {
  open: boolean
  onClose: () => void
}

export default function StarModal({ open, onClose }: StarModalProps) {
  const { tenantId, profile } = useAuthContext()
  const { data: starContext, isLoading: starCtxLoading, isFetching: starCtxFetching } = useStarGlobalContext()
  const theme = useTheme()

  const starSnapshotReady = !starCtxLoading && !starCtxFetching
  const businessSystemPrompt = useMemo(() => {
    if (!starSnapshotReady) return STAR_BUSINESS_LOADING_PROMPT
    return (
      starContext?.summary?.trim() ||
      'Business context unavailable — answer only from what the user tells you.'
    )
  }, [starSnapshotReady, starContext?.summary])

  const { messages, isLoading, sendMessage, clearConversation, pendingAction, confirmAction, rejectAction } =
    useStarBusinessChat(tenantId, businessSystemPrompt)

  const starChatReady = starSnapshotReady

  const [inputValue, setInputValue] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768
  const isTablet = typeof window !== 'undefined' && window.innerWidth >= 768 && window.innerWidth < 1024

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 100)
  }, [open])

  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose])

  const handleSend = useCallback(() => {
    if (!inputValue.trim() || isLoading || !starChatReady) return
    sendMessage(inputValue.trim())
    setInputValue('')
  }, [inputValue, isLoading, sendMessage, starChatReady])

  const handleChip = useCallback(
    (text: string) => {
      if (!starChatReady || isLoading) return
      sendMessage(text)
    },
    [sendMessage, starChatReady, isLoading],
  )

  const handleNewChat = useCallback(() => {
    clearConversation()
  }, [clearConversation])

  if (!open) return null

  const raw = starContext?.raw ?? null
  const billingSnapshot = starContext?.billingSnapshot ?? null
  const schoolName = theme.studioName || 'Your School'

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
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10, padding: isMobile ? '12px 16px' : '14px 20px',
          borderBottom: '1px solid rgba(255,255,255,0.06)', flexShrink: 0,
        }}>
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

          <button onClick={onClose} style={{
            width: 32, height: 32, borderRadius: 8, background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', color: 'rgba(255,255,255,0.5)', flexShrink: 0,
          }}>
            <X size={16} />
          </button>
        </div>

        <div style={{
          flex: 1,
          display: 'flex',
          flexDirection: isMobile ? 'column' : 'row',
          overflow: 'hidden',
          minHeight: 0,
        }}>
          {/* Chat — left (first on mobile) */}
          <div style={{
            width: isMobile ? '100%' : isTablet ? 380 : 400,
            minWidth: isMobile ? undefined : isTablet ? 380 : 400,
            flex: isMobile ? '1 1 42%' : '0 0 auto',
            minHeight: isMobile ? 200 : 0,
            display: 'flex',
            flexDirection: 'column',
            borderRight: isMobile ? 'none' : '1px solid rgba(255,255,255,0.06)',
            borderBottom: isMobile ? '1px solid rgba(255,255,255,0.06)' : 'none',
          }}>
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

            <div style={{ padding: '6px 16px', display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {chips.map(chip => (
                <button
                  key={chip}
                  onClick={() => handleChip(chip)}
                  disabled={isLoading || !starChatReady}
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
                disabled={isLoading || !starChatReady}
                placeholder={starChatReady ? 'Ask Star anything about your business...' : 'Loading school snapshot…'}
                style={{
                  flex: 1, padding: '10px 14px', borderRadius: 10, fontSize: 13,
                  background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
                  color: '#fff', outline: 'none', fontFamily: 'inherit',
                }}
              />
              <button
                onClick={handleSend}
                disabled={isLoading || !inputValue.trim() || !starChatReady}
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

          {/* Charts / KPIs — right */}
          <div style={{
            flex: 1,
            overflowY: 'auto',
            padding: isMobile ? 16 : 20,
            minWidth: 0,
            minHeight: isMobile ? 240 : 0,
          }}>
            {!starSnapshotReady ? (
              <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.45)', padding: 24 }}>
                Loading school snapshot…
              </div>
            ) : !raw ? (
              <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.45)', padding: 24 }}>
                School snapshot could not be loaded. Try again in a moment.
              </div>
            ) : (
              <DashboardPanel
                raw={raw}
                billingSnapshot={billingSnapshot}
                isMobile={isMobile}
                isTablet={isTablet}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  )

  return createPortal(modal, document.body)
}

// ─── Dashboard Panel ────────────────────────────

function snapDollars(cents: number): string {
  const abs = Math.abs(cents) / 100
  const formatted = abs.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
  return `${cents < 0 ? '-' : ''}$${formatted}`
}

function DashboardPanel({ raw, billingSnapshot, isMobile, isTablet }: {
  raw: NonNullable<StarContext['raw']>
  billingSnapshot: BillingSnapshotData | null
  isMobile: boolean
  isTablet: boolean
}) {
  const utilPct = raw.schedule?.utilization_pct ?? 0
  const activeStudents = raw.students?.active ?? 0

  const booked = raw.schedule?.booked_this_week ?? 0
  const available = raw.schedule?.available_this_week ?? 0
  const scheduleData = [
    { name: 'Booked', value: booked, fill: '#D4226A' },
    { name: 'Available', value: available, fill: 'rgba(255,255,255,0.07)' },
  ]

  const instruments = (raw.students?.by_instrument ?? []).slice(0, 6).map(i => ({
    name: i.instrument ? instrumentWithEmojiTitle(i.instrument) : '?',
    count: i.count,
  }))

  const kpiCols = isMobile ? 2 : isTablet ? 3 : 5
  const chartH = isMobile ? 200 : isTablet ? 180 : 160

  return (
    <>
      <div style={{
        fontSize: 12,
        fontWeight: 700,
        color: 'rgba(255,255,255,0.5)',
        marginBottom: 12,
        textTransform: 'uppercase',
        letterSpacing: '0.06em',
      }}>
        Billing snapshot
      </div>
      {billingSnapshot ? (
        <div style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${kpiCols}, 1fr)`,
          gap: isMobile ? 10 : 12,
          marginBottom: isMobile ? 16 : 20,
        }}>
          <KpiCard label="Collected This Month" value={snapDollars(billingSnapshot.collectedCents)} color="#22C55E" isMobile={isMobile} />
          <KpiCard label="Total Invoiced This Month" value={snapDollars(billingSnapshot.totalInvoicedCents)} color="#38BDF8" isMobile={isMobile} />
          <KpiCard label="Discounted This Month" value={snapDollars(billingSnapshot.discountedCents)} color="#A78BFA" isMobile={isMobile} />
          <KpiCard label="Next Month (Projected)" value={snapDollars(billingSnapshot.nextMonthCents)} color="#F472B6" isMobile={isMobile} />
          <KpiCard label="Scheduled Payments" value={snapDollars(billingSnapshot.scheduledPaymentsCents)} color="#94A3B8" isMobile={isMobile} />
        </div>
      ) : (
        <div style={{
          padding: 14,
          borderRadius: 12,
          background: 'rgba(255,255,255,0.03)',
          border: '1px solid rgba(255,255,255,0.06)',
          marginBottom: isMobile ? 16 : 20,
          fontSize: 12,
          color: 'rgba(255,255,255,0.45)',
          lineHeight: 1.5,
        }}>
          Billing metrics are not shown for your role, or data is temporarily unavailable.
        </div>
      )}

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(2, 1fr)',
        gap: isMobile ? 10 : 12,
        marginBottom: isMobile ? 16 : 20,
      }}>
        <KpiCard label="Active Students" value={String(activeStudents)} color="#D4226A" isMobile={isMobile} />
        <KpiCard label="Utilization" value={`${utilPct}%`} color="#38BDF8" isMobile={isMobile} />
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: (isMobile || isTablet) ? '1fr' : '1fr 1fr',
        gap: isMobile ? 16 : 20,
      }}>
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
            <div style={{
              position: 'absolute', top: '38%', left: '50%', transform: 'translate(-50%, -50%)',
              textAlign: 'center', pointerEvents: 'none',
            }}>
              <div style={{ fontSize: isMobile ? 22 : 20, fontWeight: 800, color: '#D4226A' }}>{utilPct}%</div>
              <div style={{ fontSize: 9, fontWeight: 700, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Utilized</div>
            </div>
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
    </>
  )
}

function KpiCard({ label, value, color, isMobile }: { label: string; value: string; color: string; isMobile: boolean }) {
  return (
    <div style={{
      padding: isMobile ? '14px 12px' : '14px 16px',
      borderRadius: 12, background: 'rgba(255,255,255,0.03)',
      border: '1px solid rgba(255,255,255,0.06)',
    }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.4)', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: isMobile ? 18 : 20, fontWeight: 800, color, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
    </div>
  )
}

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
