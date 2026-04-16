import { useState, useRef, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useQueryClient } from '@tanstack/react-query'
import { X, Send, Sparkles } from 'lucide-react'
import { useAuthContext } from '../../app/AuthContext'
import { useScheduleZiroChat, type ScheduleContext } from '../../hooks/useAI'
import { qk } from '../../lib/queryKeys'
import { useZiroShell } from '../../contexts/ZiroContext'
import { ZiroAssistantFeedback } from './ZiroAssistantFeedback'

const SUGGESTIONS = ['Move Maddox to 3:30 today', 'Find coverage for all callouts', "Cancel John's lesson today — sick"]

/**
 * Schedule-specific assistant (edge tool-use + grid). Mounted only on /admin/schedule when
 * `pageContext.scheduleContext` is set — keeps `useScheduleZiroChat` out of the business panel.
 */
export function ZiroScheduleAssistantPane({
  onClose,
  scheduleContext,
}: {
  onClose: () => void
  scheduleContext: ScheduleContext | null | undefined
}) {
  const { tenantId, profile } = useAuthContext()
  const { pendingSeedMessage, clearPendingSeed, pageContext } = useZiroShell()
  const qc = useQueryClient()
  const ctx = scheduleContext ?? null
  const ready = !!ctx

  const {
    messages,
    isLoading,
    sendMessage,
    clearConversation,
    pendingAction,
    confirmAction,
    rejectAction,
    aiSessionId,
  } = useScheduleZiroChat(tenantId, ctx, {
    getClientPageContext: () => pageContext as Record<string, unknown>,
  })

  const [input, setInput] = useState('')
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  const seedConsumed = useRef(false)
  useEffect(() => {
    if (!pendingSeedMessage || !ready || seedConsumed.current) return
    seedConsumed.current = true
    const msg = pendingSeedMessage
    clearPendingSeed()
    sendMessage(msg)
  }, [pendingSeedMessage, ready, clearPendingSeed, sendMessage])

  useEffect(() => {
    seedConsumed.current = false
  }, [ctx?.date, ctx?.location_id])

  const onSend = useCallback(() => {
    const t = input.trim()
    if (!t || !ready || isLoading) return
    sendMessage(t)
    setInput('')
  }, [input, ready, isLoading, sendMessage])

  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768
  const locLabel = ctx?.location_name ?? 'Schedule'
  const dateLabel = ctx?.date ?? ''

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
        onClick={(e) => e.stopPropagation()}
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
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: isMobile ? '12px 16px' : '14px 20px',
            borderBottom: '1px solid rgba(255,255,255,0.06)',
            flexShrink: 0,
          }}
        >
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: 10,
              background: 'linear-gradient(135deg, #FFB800, #FF5500)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <Sparkles size={16} color="#fff" />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 15, fontWeight: 800, color: '#fff' }}>Ziro</span>
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  color: 'rgba(255,255,255,0.45)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                }}
              >
                Schedule
              </span>
            </div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', fontWeight: 500 }}>
              {locLabel}
              {dateLabel ? ` · ${dateLabel}` : ''}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.08)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              color: 'rgba(255,255,255,0.5)',
              flexShrink: 0,
            }}
          >
            <X size={16} />
          </button>
        </div>

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0 }}>
          <div style={{ flex: 1, overflowY: 'auto', padding: isMobile ? '16px 16px 8px' : '20px 20px 8px' }}>
            {messages.length === 0 && (
              <div style={{ textAlign: 'center', padding: '24px 12px 12px' }}>
                <div
                  style={{
                    width: 48,
                    height: 48,
                    borderRadius: 14,
                    margin: '0 auto 14px',
                    background: 'linear-gradient(135deg, #FFB800, #FF5500)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Sparkles size={22} color="#fff" />
                </div>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#fff', marginBottom: 8 }}>
                  Schedule assistant
                </div>
                <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', lineHeight: 1.6, marginBottom: 16 }}>
                  Move lessons, find coverage, and adjust the grid for {dateLabel || 'this day'}. The current view is
                  sent with each message.
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 400, margin: '0 auto' }}>
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s}
                      type="button"
                      disabled={!ready}
                      onClick={() => {
                        if (!ready) return
                        sendMessage(s)
                      }}
                      style={{
                        padding: '10px 14px',
                        borderRadius: 10,
                        fontSize: 12,
                        fontWeight: 600,
                        cursor: ready ? 'pointer' : 'not-allowed',
                        background: 'rgba(255,255,255,0.04)',
                        border: '1px solid rgba(255,255,255,0.08)',
                        color: '#C0C0E0',
                        textAlign: 'left',
                        opacity: ready ? 1 : 0.45,
                      }}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((msg, i) => (
              <div key={i} style={{ marginBottom: 12 }}>
                <div
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    color: msg.role === 'user' ? '#E8488A' : '#FFB800',
                    marginBottom: 4,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                  }}
                >
                  {msg.role === 'assistant' && <Sparkles size={9} />}
                  {msg.role === 'user' ? 'You' : 'Ziro'}
                </div>
                <div style={{ fontSize: 13, color: '#E0E0F4', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{msg.content}</div>
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
              <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.45)', fontStyle: 'italic' }}>Working…</div>
            )}
            <div ref={endRef} />
          </div>

          {pendingAction && (
            <div
              style={{
                padding: '12px 16px',
                borderTop: '1px solid rgba(255,255,255,0.06)',
                background: 'rgba(168,85,247,0.06)',
                flexShrink: 0,
              }}
            >
              <div
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  color: '#A855F7',
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  marginBottom: 6,
                }}
              >
                Confirm action
              </div>
              <div style={{ fontSize: 12, color: '#E8E8FC', marginBottom: 10, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
                {pendingAction.description}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  type="button"
                  onClick={async () => {
                    await confirmAction()
                    await qc.invalidateQueries({ queryKey: qk.schedule.all })
                    await qc.invalidateQueries({ queryKey: qk.schedule.intelligence })
                  }}
                  disabled={isLoading}
                  style={{
                    flex: 1,
                    padding: '10px',
                    borderRadius: 8,
                    background: '#22C55E',
                    border: 'none',
                    color: '#fff',
                    fontWeight: 700,
                    fontSize: 12,
                    cursor: 'pointer',
                  }}
                >
                  Confirm
                </button>
                <button
                  type="button"
                  onClick={rejectAction}
                  style={{
                    flex: 1,
                    padding: '10px',
                    borderRadius: 8,
                    background: 'rgba(255,255,255,0.04)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    color: '#A0A0C8',
                    fontWeight: 600,
                    fontSize: 12,
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          <div
            style={{
              display: 'flex',
              gap: 8,
              padding: isMobile ? '12px 16px 20px' : '12px 20px 16px',
              borderTop: '1px solid rgba(255,255,255,0.06)',
              flexShrink: 0,
            }}
          >
            {messages.length > 0 && (
              <button
                type="button"
                onClick={() => clearConversation()}
                style={{
                  fontSize: 11,
                  color: '#8080A8',
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: 8,
                  padding: '8px 10px',
                  cursor: 'pointer',
                  flexShrink: 0,
                }}
              >
                Clear
              </button>
            )}
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') onSend()
              }}
              placeholder={ready ? 'Move John to 3:30…' : 'Loading schedule…'}
              disabled={isLoading || !ready}
              style={{
                flex: 1,
                padding: '10px 14px',
                borderRadius: 10,
                fontSize: 13,
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.08)',
                color: '#fff',
                outline: 'none',
                fontFamily: 'inherit',
              }}
            />
            <button
              type="button"
              onClick={onSend}
              disabled={isLoading || !input.trim() || !ready}
              style={{
                width: 44,
                height: 44,
                borderRadius: 10,
                border: 'none',
                cursor: input.trim() && ready ? 'pointer' : 'default',
                background: input.trim() ? 'linear-gradient(135deg, #D4226A, #FF5500)' : 'rgba(255,255,255,0.04)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#fff',
                flexShrink: 0,
              }}
            >
              <Send size={16} />
            </button>
          </div>
          {!ready && (
            <div style={{ padding: '0 20px 14px', fontSize: 11, color: 'rgba(255,255,255,0.35)' }}>
              Loading grid context… Ziro will enable when the schedule is ready.
            </div>
          )}
        </div>
      </div>
    </>
  )

  return createPortal(panel, document.body)
}
