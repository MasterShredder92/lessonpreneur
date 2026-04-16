import { useState, useRef, useEffect, useCallback, useMemo, lazy, Suspense } from 'react'
import { createPortal } from 'react-dom'
import { useQueryClient } from '@tanstack/react-query'
import { X, Send, Sparkles, MessageSquare, AlertTriangle, Zap } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, PieChart, Pie } from 'recharts'
import { useAuthContext } from '../../app/AuthContext'
import { useZiroGlobalContext, type ZiroGlobalSnapshot } from '../../hooks/useZiroGlobalContext'
import { useZiroBusinessChat } from '../../hooks/useAI'
import { usePermissions } from '../../hooks/usePermissions'
import { executeZiroAction } from '../../ziro/actions/executeZiroAction'
import { parseZiroActionFromAssistantText } from '../../ziro/actions/parseZiroActionFromAssistantText'
import { validateZiroReassignProposal, type ZiroReassignProposal } from '../../ziro/actions/reassignStudents'
import {
  validateZiroScheduleMoveProposal,
  pickMovesForExecute,
  preflightZiroScheduleMoves,
  type ZiroScheduleMoveProposal,
  type ZiroScheduleMovePreflightOk,
} from '../../ziro/actions/scheduleMoveSessions'
import { qk } from '../../lib/queryKeys'
import { useTheme } from '../../hooks/useTheme'
import { useZiroShell } from '../../contexts/ZiroContext'
import type { ScheduleContext } from '../../hooks/useAI'
import { instrumentWithEmojiTitle } from '../../utils/instrumentEmoji'
import type { BillingSnapshotData } from '../../services/billingSnapshotQuery'
import { ZiroErrorBoundary } from './ZiroErrorBoundary'
import { ZiroAssistantFeedback } from './ZiroAssistantFeedback'

const ZiroScheduleAssistantPane = lazy(async () => {
  const m = await import('./ZiroScheduleAssistantPane')
  return { default: m.ZiroScheduleAssistantPane }
})

// ─── Constants ──────────────────────────────────

/** Non-empty `system_override` while `get_ziro_context` is loading — keeps business path; never scheduling mode. */
const ZIRO_BUSINESS_LOADING_PROMPT =
  '[ZIRO INTERNAL] School snapshot is still loading. Do not use scheduling tools or invent metrics. If the user sends a message, reply only: "School data is still loading — please wait a moment."'

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

// ─── Shell: mounts only when open so heavy hooks (RPC) do not run across the CRM ───

interface ZiroPanelProps {
  open: boolean
  onClose: () => void
}

export default function ZiroPanel({ open, onClose }: ZiroPanelProps) {
  if (!open) return null
  return (
    <ZiroErrorBoundary onReset={onClose}>
      <ZiroPanelEntry onClose={onClose} />
    </ZiroErrorBoundary>
  )
}

/** Routes schedule tool-use vs business snapshot without violating Rules of Hooks. */
function ZiroPanelEntry({ onClose }: { onClose: () => void }) {
  const { pageContext } = useZiroShell()
  const scheduleMode = pageContext.page === 'schedule'
  if (scheduleMode) {
    return (
      <Suspense fallback={null}>
        <ZiroScheduleAssistantPane
          onClose={onClose}
          scheduleContext={pageContext.scheduleContext as ScheduleContext | null | undefined}
        />
      </Suspense>
    )
  }
  return <ZiroPanelBody onClose={onClose} />
}

function ZiroPanelBody({ onClose }: { onClose: () => void }) {
  const { tenantId, profile } = useAuthContext()
  const ziroShell = useZiroShell()
  const { pendingSeedMessage, clearPendingSeed } = ziroShell
  const { data: ziroContext, isLoading: ziroCtxLoading, isFetching: ziroCtxFetching, error: ziroCtxError } = useZiroGlobalContext()
  const theme = useTheme()

  // Gate only on initial load — allow background refetches to proceed without blocking the UI.
  // Also treat errors as "ready" so the panel degrades gracefully instead of hanging.
  const ziroSnapshotReady = !ziroCtxLoading || !!ziroCtxError
  const businessSystemPrompt = useMemo(() => {
    if (!ziroSnapshotReady) return ZIRO_BUSINESS_LOADING_PROMPT
    const base =
      ziroContext?.summary?.trim() ||
      'Business context unavailable — answer only from what the user tells you.'
    const ctxBlock = [
      '--- ZIRO SHELL CONTEXT (structured; do not ignore) ---',
      JSON.stringify(
        {
          pathname: ziroShell.pathname,
          search: ziroShell.search,
          role: ziroShell.role,
          locationIds: ziroShell.locationIds,
          isStudioDirector: ziroShell.isStudioDirector,
          pageContext: ziroShell.pageContext,
        },
        null,
        0,
      ),
    ].join('\n')
    const actionHint = [
      '',
      'STRUCTURED CRM ACTIONS (optional):',
      '1) Navigation — only when the user asks to open a screen: append one line at the very end:',
      'ZIRO_ACTION crm.navigate {"path":"/admin/scheduling"}',
      'Use only paths under /admin.',
      '2) Reassign primary instructor — only when the user explicitly asks to move specific students to another teacher, and you have real UUIDs from context (never invent). Append:',
      'ZIRO_ACTION crm.reassign_students {"student_ids":["uuid"],"target_teacher_id":"uuid","expected_prior_teacher_id":"uuid"}',
      'expected_prior_teacher_id may be omitted or null. The user must confirm in the app before any database change.',
      '3) Move lesson on schedule (drag-drop equivalent) — same calendar day, same location, open target slot; use real schedule block UUIDs from context:',
      'ZIRO_ACTION crm.move_schedule_sessions {"moves":[{"source_block_id":"uuid","target_block_id":"uuid","expected_student_id":"uuid"}]}',
      'expected_student_id optional stale-guard. User must confirm before the RPC runs.',
      'Do not append ZIRO_ACTION lines for normal Q&A.',
    ].join('\n')
    return `${base}\n\n${ctxBlock}${actionHint}`
  }, [ziroSnapshotReady, ziroContext?.summary, ziroShell])

  const [pendingReassign, setPendingReassign] = useState<ZiroReassignProposal | null>(null)
  const [reassignWorking, setReassignWorking] = useState(false)
  const [reassignFeedback, setReassignFeedback] = useState<string | null>(null)
  const [pendingScheduleMove, setPendingScheduleMove] = useState<ZiroScheduleMoveProposal | null>(null)
  const [scheduleMoveWorking, setScheduleMoveWorking] = useState(false)
  const [scheduleMoveFeedback, setScheduleMoveFeedback] = useState<string | null>(null)
  const [scheduleMovePreflight, setScheduleMovePreflight] = useState<ZiroScheduleMovePreflightOk | null>(null)
  const [crossTeacherAck, setCrossTeacherAck] = useState(false)
  const [scheduleMovePreflightLoading, setScheduleMovePreflightLoading] = useState(false)

  useEffect(() => {
    if (!pendingScheduleMove || !tenantId) {
      setScheduleMovePreflight(null)
      setCrossTeacherAck(false)
      setScheduleMovePreflightLoading(false)
      return
    }
    setScheduleMovePreflight(null)
    setCrossTeacherAck(false)
    setScheduleMovePreflightLoading(true)
    setScheduleMoveFeedback(null)
    let cancelled = false
    preflightZiroScheduleMoves(pendingScheduleMove, tenantId).then((pf) => {
      if (cancelled) return
      setScheduleMovePreflightLoading(false)
      if (pf.ok) setScheduleMovePreflight(pf.value)
      else setScheduleMoveFeedback(pf.message)
    })
    return () => {
      cancelled = true
    }
  }, [pendingScheduleMove, tenantId])
  const qc = useQueryClient()
  const { isAtLeast } = usePermissions()
  /** Latest persisted Ziro session id — updated after `useZiroBusinessChat` (confirm handlers read at click time). */
  const ziroAiSessionRef = useRef<string | null>(null)

  const transformBusinessAssistantText = useCallback(
    (text: string, aiSessionId: string | null) => {
      const { displayText, action } = parseZiroActionFromAssistantText(text)
      if (!action || !tenantId || !profile) return displayText

      if (action.actionId === 'crm.reassign_students') {
        const pr = validateZiroReassignProposal(action.payload)
        if (pr.ok) {
          setReassignFeedback(null)
          setPendingReassign(pr.value)
        } else if (import.meta.env.DEV) {
          console.warn('[Ziro] reassign proposal invalid:', pr.message)
        }
        return displayText
      }

      if (action.actionId === 'crm.move_schedule_sessions') {
        const pr = validateZiroScheduleMoveProposal(action.payload)
        if (pr.ok) {
          setScheduleMoveFeedback(null)
          setPendingScheduleMove(pr.value)
        } else if (import.meta.env.DEV) {
          console.warn('[Ziro] schedule move proposal invalid:', pr.message)
        }
        return displayText
      }

      void executeZiroAction(
        { actionId: action.actionId, payload: action.payload },
        {
          tenantId,
          profileId: profile.id,
          userName: `${profile.first_name} ${profile.last_name}`.trim(),
          role: ziroShell.role,
          conversationId: aiSessionId,
        },
      ).then((res) => {
        if (!res.ok && import.meta.env.DEV) console.warn('[Ziro] action:', res)
      })
      return displayText
    },
    [tenantId, profile, ziroShell.role],
  )

  const confirmReassign = useCallback(async () => {
    if (!pendingReassign || !tenantId || !profile) return
    if (!isAtLeast('studio_director')) {
      setReassignFeedback('Your role cannot reassign students.')
      return
    }
    const idempotencyKey = crypto.randomUUID()
    setReassignWorking(true)
    setReassignFeedback(null)
    try {
      const res = await executeZiroAction(
        {
          actionId: 'crm.reassign_students',
          payload: { ...pendingReassign, idempotency_key: idempotencyKey },
        },
        {
          tenantId,
          profileId: profile.id,
          userName: `${profile.first_name} ${profile.last_name}`.trim(),
          role: ziroShell.role,
          conversationId: ziroAiSessionRef.current,
        },
      )
      if (res.ok) {
        setPendingReassign(null)
        setReassignFeedback(res.message)
        await Promise.all([
          qc.invalidateQueries({ queryKey: qk.students.all }),
          qc.invalidateQueries({ queryKey: qk.students.roster }),
          qc.invalidateQueries({ queryKey: qk.schedule.all }),
        ])
      } else {
        setReassignFeedback(res.message)
      }
    } finally {
      setReassignWorking(false)
    }
  }, [pendingReassign, tenantId, profile, isAtLeast, qc, ziroShell.role])

  const confirmScheduleMove = useCallback(async () => {
    if (!pendingScheduleMove || !tenantId || !profile) return
    if (!isAtLeast('studio_director')) {
      setScheduleMoveFeedback('Your role cannot move schedule sessions.')
      return
    }
    setScheduleMoveWorking(true)
    setScheduleMoveFeedback(null)
    try {
      const pf = await preflightZiroScheduleMoves(pendingScheduleMove, tenantId)
      if (!pf.ok) {
        setScheduleMoveFeedback(pf.message)
        return
      }
      const preflight = pf.value
      setScheduleMovePreflight(preflight)

      const needsCrossTeacherAck = preflight.moves.some(
        (m) => m.classification === 'override_required' && m.reason_code === 'cross_teacher',
      )
      if (needsCrossTeacherAck && !crossTeacherAck) {
        setScheduleMoveFeedback(
          'Cross-teacher move(s) need confirmation — check the box below, then confirm again.',
        )
        return
      }

      const picked = pickMovesForExecute(pendingScheduleMove, preflight, needsCrossTeacherAck ? crossTeacherAck : false)
      if (picked.moves.length === 0) {
        setScheduleMoveFeedback(
          'No moves passed conflict checks — nothing was sent to the server. Review blocked items above.',
        )
        return
      }

      const idempotencyKey = crypto.randomUUID()
      const res = await executeZiroAction(
        {
          actionId: 'crm.move_schedule_sessions',
          payload: {
            moves: picked.moves,
            idempotency_key: idempotencyKey,
            override_ack: picked.override_ack,
            apply_partial: true,
          },
        },
        {
          tenantId,
          profileId: profile.id,
          userName: `${profile.first_name} ${profile.last_name}`.trim(),
          role: ziroShell.role,
          conversationId: ziroAiSessionRef.current,
        },
      )
      if (res.ok) {
        setPendingScheduleMove(null)
        setScheduleMovePreflight(null)
        setCrossTeacherAck(false)
        const sm = res.scheduleMove
        const extra =
          sm?.partial && sm.failedMoves.length > 0
            ? ` (${sm.failedMoves.length} move(s) could not be applied — see server message.)`
            : ''
        setScheduleMoveFeedback(res.message + extra)
        await Promise.all([
          qc.invalidateQueries({ queryKey: qk.schedule.all }),
          qc.invalidateQueries({ queryKey: qk.schedule.intelligence }),
        ])
      } else {
        setScheduleMoveFeedback(res.message)
      }
    } finally {
      setScheduleMoveWorking(false)
    }
  }, [pendingScheduleMove, tenantId, profile, isAtLeast, qc, ziroShell.role, crossTeacherAck])

  const {
    messages,
    isLoading,
    sendMessage,
    clearConversation,
    pendingAction,
    confirmAction,
    rejectAction,
    aiSessionId,
  } = useZiroBusinessChat(tenantId, businessSystemPrompt, {
    transformBusinessAssistantText,
    getClientPageContext: () => ziroShell.pageContext as Record<string, unknown>,
    profileId: profile?.id ?? null,
  })
  ziroAiSessionRef.current = aiSessionId

  const ziroChatReady = ziroSnapshotReady

  const [inputValue, setInputValue] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const seedSentRef = useRef(false)

  useEffect(() => {
    if (!pendingSeedMessage || !ziroChatReady || seedSentRef.current) return
    seedSentRef.current = true
    const msg = pendingSeedMessage
    clearPendingSeed()
    sendMessage(msg)
  }, [pendingSeedMessage, ziroChatReady, clearPendingSeed, sendMessage])

  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768
  const isTablet = typeof window !== 'undefined' && window.innerWidth >= 768 && window.innerWidth < 1024

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 100)
  }, [])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  const handleSend = useCallback(() => {
    if (!inputValue.trim() || isLoading || !ziroChatReady) return
    sendMessage(inputValue.trim())
    setInputValue('')
  }, [inputValue, isLoading, sendMessage, ziroChatReady])

  const handleChip = useCallback(
    (text: string) => {
      if (!ziroChatReady || isLoading) return
      sendMessage(text)
    },
    [sendMessage, ziroChatReady, isLoading],
  )

  const handleNewChat = useCallback(() => {
    clearConversation()
  }, [clearConversation])

  const raw = ziroContext?.raw ?? null
  const billingSnapshot = ziroContext?.billingSnapshot ?? null
  const schoolName = theme.studioName || 'Your School'

  const lastAssistantMsg = [...messages].reverse().find(m => m.role === 'assistant')?.content ?? ''
  const chips = messages.length === 0 ? DEFAULT_CHIPS : getContextualChips(lastAssistantMsg)

  const panel = (
    <>
      <div
        aria-hidden
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 9997,
          background: 'rgba(0,0,0,0.35)',
          backdropFilter: 'blur(2px)',
        }}
        onClick={onClose}
      />
      <div
        onClick={e => e.stopPropagation()}
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          zIndex: 9998,
          width: isMobile ? '100vw' : 'min(100vw, 1100px)',
          maxWidth: '100vw',
          height: '100vh',
          background: '#020209',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          borderLeft: '1px solid rgba(255,255,255,0.08)',
          boxShadow: '-12px 0 48px rgba(0,0,0,0.55)',
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
            <Sparkles size={16} color="#fff" />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 15, fontWeight: 800, color: '#fff' }}>Ziro</span>
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
                    <Sparkles size={22} color="#fff" />
                  </div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: '#fff', marginBottom: 6 }}>
                    Hey{profile?.first_name ? ` ${profile.first_name}` : ''}!
                  </div>
                  <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', lineHeight: 1.6 }}>
                    I'm <strong style={{ color: '#D4226A' }}>Ziro</strong> — your CRM operating layer. I'm looking at {schoolName}'s live data right now. Ask me anything.
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
                        <Sparkles size={9} color="#fff" />
                      </div>
                      <span style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.4)' }}>Ziro</span>
                    </div>
                  )}
                  <div style={{
                    maxWidth: '88%', padding: '10px 14px', borderRadius: 12,
                    fontSize: 13, lineHeight: 1.5, whiteSpace: 'pre-wrap',
                    ...(msg.role === 'user'
                      ? { background: 'rgba(212,34,106,0.12)', border: '1px solid rgba(212,34,106,0.2)', color: '#fff' }
                      : { background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.85)' }),
                  }}>
                    {msg.content}
                  </div>
                  {/* Routing label — one short reason line, not a wall of text */}
                  {msg.role === 'assistant' && msg.routeLabel && msg.routeType && msg.routeType !== 'direct' && (
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: 4,
                      fontSize: 10, color: '#606088', marginTop: 3, paddingLeft: 2,
                    }}>
                      <Zap size={8} style={{ color: msg.routeType === 'skill' ? '#22C55E' : msg.routeType === 'agent' ? '#3b82f6' : '#FF5500' }} />
                      <span style={{ fontWeight: 600, color: msg.routeType === 'skill' ? '#22C55E' : msg.routeType === 'agent' ? '#3b82f6' : '#FF5500' }}>
                        {msg.routeType === 'skill' ? 'Used Skill' : msg.routeType === 'agent' ? 'Used Agent' : 'Created Temporary Agent'}
                      </span>
                      <span style={{ opacity: 0.7 }}>&mdash;</span>
                      <span>{msg.routeLabel}</span>
                    </div>
                  )}
                  {msg.role === 'assistant' && tenantId && profile && (
                    <ZiroAssistantFeedback
                      tenantId={tenantId}
                      profileId={profile.id}
                      assistantMessageId={msg.assistantMessageId}
                      conversationId={aiSessionId}
                    />
                  )}
                </div>
              ))}

              {isLoading && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 14 }}>
                  <div style={{
                    width: 18, height: 18, borderRadius: 6,
                    background: 'linear-gradient(135deg, #D4226A, #FF5500)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <Sparkles size={9} color="#fff" />
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

            {pendingReassign && !isAtLeast('studio_director') && (
              <div style={{ padding: '10px 16px', margin: '0 12px 6px', fontSize: 12, color: '#FCA5A5' }}>
                A reassignment was suggested, but your role cannot confirm this action.
                <button type="button" className="btn-ghost" style={{ marginLeft: 8, fontSize: 11 }} onClick={() => setPendingReassign(null)}>Dismiss</button>
              </div>
            )}

            {pendingReassign && isAtLeast('studio_director') && (
              <div style={{ padding: '10px 16px', margin: '0 12px 6px', background: 'rgba(251,191,36,0.06)', border: '1px solid rgba(251,191,36,0.25)', borderRadius: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                  <AlertTriangle size={14} color="#FBBF24" />
                  <span style={{ fontSize: 10, fontWeight: 700, color: '#FBBF24', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Confirm reassignment</span>
                </div>
                <div style={{ fontSize: 12, color: '#E8E8FC', marginBottom: 8, lineHeight: 1.55 }}>
                  Reassign <strong>{pendingReassign.student_ids.length}</strong> student(s) to teacher{' '}
                  <code style={{ fontSize: 11, color: '#F472B6' }}>{pendingReassign.target_teacher_id.slice(0, 8)}…</code>
                  {pendingReassign.expected_prior_teacher_id != null && (
                    <> (expecting prior primary <code style={{ fontSize: 11 }}>{pendingReassign.expected_prior_teacher_id.slice(0, 8)}…</code>)</>
                  )}
                  . This updates primary instructor and future booked blocks that still match the prior primary.
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button
                    type="button"
                    onClick={confirmReassign}
                    disabled={reassignWorking || isLoading}
                    style={{
                      flex: 1, padding: 8, borderRadius: 8, background: '#F59E0B', border: 'none', color: '#0f172a',
                      fontWeight: 700, fontSize: 12, cursor: reassignWorking ? 'wait' : 'pointer',
                    }}
                  >
                    {reassignWorking ? 'Working…' : 'Confirm reassign'}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setPendingReassign(null); setReassignFeedback(null) }}
                    disabled={reassignWorking}
                    style={{
                      flex: 1, padding: 8, borderRadius: 8, background: 'rgba(255,255,255,0.04)',
                      border: '1px solid rgba(255,255,255,0.1)', color: '#A0A0C8', fontWeight: 600, fontSize: 12, cursor: 'pointer',
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {reassignFeedback && (
              <div style={{ padding: '0 16px 8px', fontSize: 12, color: reassignFeedback.startsWith('Reassigned') || reassignFeedback.includes('student') ? '#86EFAC' : '#FCA5A5' }}>
                {reassignFeedback}
              </div>
            )}

            {pendingScheduleMove && !isAtLeast('studio_director') && (
              <div style={{ padding: '10px 16px', margin: '0 12px 6px', fontSize: 12, color: '#FCA5A5' }}>
                A schedule move was suggested, but your role cannot confirm this action.
                <button type="button" className="btn-ghost" style={{ marginLeft: 8, fontSize: 11 }} onClick={() => setPendingScheduleMove(null)}>Dismiss</button>
              </div>
            )}

            {pendingScheduleMove && isAtLeast('studio_director') && (
              <div style={{ padding: '10px 16px', margin: '0 12px 6px', background: 'rgba(56,189,248,0.06)', border: '1px solid rgba(56,189,248,0.25)', borderRadius: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                  <AlertTriangle size={14} color="#38BDF8" />
                  <span style={{ fontSize: 10, fontWeight: 700, color: '#38BDF8', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Confirm schedule move</span>
                </div>
                <div style={{ fontSize: 12, color: '#E8E8FC', marginBottom: 8, lineHeight: 1.55 }}>
                  Apply <strong>{pendingScheduleMove.moves.length}</strong> move(s): booked source → open target (same day & location, matching slot length). Ziro runs a server preflight first (no writes), then applies only safe moves — or cross-teacher moves after you confirm below.
                </div>
                {scheduleMovePreflight && scheduleMovePreflight.summary.blocked_count > 0 && (
                  <div style={{ fontSize: 11, color: '#FCA5A5', marginBottom: 8, lineHeight: 1.45 }}>
                    <strong>Blocked (will not run):</strong>
                    <ul style={{ margin: '6px 0 0 16px', padding: 0 }}>
                      {scheduleMovePreflight.moves
                        .filter((m) => m.classification === 'blocked')
                        .map((m) => (
                          <li key={`b-${m.index}`}>
                            #{m.index + 1}: {m.message ?? m.reason_code ?? 'blocked'}
                          </li>
                        ))}
                    </ul>
                  </div>
                )}
                {scheduleMovePreflight &&
                  scheduleMovePreflight.moves.some(
                    (m) => m.classification === 'override_required' && m.reason_code === 'cross_teacher',
                  ) && (
                    <label
                      style={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: 8,
                        fontSize: 11,
                        color: '#E8E8FC',
                        marginBottom: 10,
                        cursor: 'pointer',
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={crossTeacherAck}
                        onChange={(e) => setCrossTeacherAck(e.target.checked)}
                        style={{ marginTop: 2 }}
                      />
                      <span>I confirm moving one or more lessons to a different teacher&apos;s column (same as the schedule drag warning).</span>
                    </label>
                  )}
                <div style={{ display: 'flex', gap: 6 }}>
                  <button
                    type="button"
                    onClick={confirmScheduleMove}
                    disabled={scheduleMoveWorking || isLoading || scheduleMovePreflightLoading}
                    style={{
                      flex: 1, padding: 8, borderRadius: 8, background: '#0EA5E9', border: 'none', color: '#0f172a',
                      fontWeight: 700, fontSize: 12, cursor: scheduleMoveWorking ? 'wait' : 'pointer',
                    }}
                  >
                    {scheduleMovePreflightLoading
                      ? 'Checking conflicts…'
                      : scheduleMoveWorking
                        ? 'Working…'
                        : 'Apply moves'}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setPendingScheduleMove(null); setScheduleMoveFeedback(null) }}
                    disabled={scheduleMoveWorking}
                    style={{
                      flex: 1, padding: 8, borderRadius: 8, background: 'rgba(255,255,255,0.04)',
                      border: '1px solid rgba(255,255,255,0.1)', color: '#A0A0C8', fontWeight: 600, fontSize: 12, cursor: 'pointer',
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {scheduleMoveFeedback && (
              <div style={{ padding: '0 16px 8px', fontSize: 12, color: scheduleMoveFeedback.includes('Moved') ? '#86EFAC' : '#FCA5A5' }}>
                {scheduleMoveFeedback}
              </div>
            )}

            <div style={{ padding: '6px 16px', display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {chips.map(chip => (
                <button
                  key={chip}
                  onClick={() => handleChip(chip)}
                  disabled={isLoading || !ziroChatReady}
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
                disabled={isLoading || !ziroChatReady}
                placeholder={ziroChatReady ? 'Ask Ziro anything about your business...' : 'Loading school snapshot…'}
                style={{
                  flex: 1, padding: '10px 14px', borderRadius: 10, fontSize: 13,
                  background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
                  color: '#fff', outline: 'none', fontFamily: 'inherit',
                }}
              />
              <button
                onClick={handleSend}
                disabled={isLoading || !inputValue.trim() || !ziroChatReady}
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
            {!ziroSnapshotReady ? (
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
    </>
  )

  return createPortal(panel, document.body)
}

// ─── Dashboard Panel ────────────────────────────

function snapDollars(cents: number): string {
  const abs = Math.abs(cents) / 100
  const formatted = abs.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
  return `${cents < 0 ? '-' : ''}$${formatted}`
}

function DashboardPanel({ raw, billingSnapshot, isMobile, isTablet }: {
  raw: NonNullable<ZiroGlobalSnapshot['raw']>
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
