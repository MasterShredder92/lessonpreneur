import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import type { AgentAction } from '../agents/agents'
import { useAgentAvatarImage } from '../../hooks/useAgentAvatarImage'
import { adminPathToPageSegment, usePageInsights } from '../agents/pageIntelligence'
import { useAgentPanel, type AgentPanelState } from './AgentPanelContext'
import { useAdminSurface } from '../../contexts/AdminSurfaceContext'

const PANEL_BG = 'linear-gradient(165deg, rgba(18,20,28,0.97) 0%, rgba(10,11,16,0.98) 100%)'
const BORDER_BASE = '1px solid rgba(255,255,255,0.08)'

const actionButtonStyle = (accent: string, _accentSoft: string): CSSProperties => ({
  padding: '6px 10px',
  borderRadius: 999,
  fontSize: 11,
  fontWeight: 600,
  cursor: 'pointer',
  border: `1px solid ${accent}59`,
  background: `${accent}14`,
  color: '#d8ffd8',
  fontFamily: 'inherit',
  textDecoration: 'none',
  display: 'inline-block',
  textAlign: 'center',
  boxSizing: 'border-box',
})

export type AgentPanelProps = {
  /** Route-specific actions; falls back to the active agent definition if omitted. */
  agentActions?: AgentAction[]
  /** `sidebar` docks in the left column; `floating` keeps the legacy fixed panel. */
  variant?: 'floating' | 'sidebar'
}

function stateAccent(agentState: AgentPanelState, neon: string, neonSoft: string): { topBarOpacity: number; avatarGlow: string; borderTint: string } {
  switch (agentState) {
    case 'executing':
      return { topBarOpacity: 0.9, avatarGlow: `0 0 30px ${neonSoft}`, borderTint: neon }
    case 'listening':
      return { topBarOpacity: 0.72, avatarGlow: `0 0 22px ${neonSoft}`, borderTint: neon }
    case 'waitingForUser':
      return { topBarOpacity: 0.55, avatarGlow: '0 0 20px rgba(255, 200, 120, 0.22)', borderTint: 'rgba(255, 200, 120, 0.55)' }
    case 'error':
      return { topBarOpacity: 0.5, avatarGlow: '0 0 18px rgba(255, 80, 80, 0.28)', borderTint: 'rgba(255, 100, 100, 0.45)' }
    default:
      return { topBarOpacity: 0.55, avatarGlow: `0 0 24px ${neonSoft}`, borderTint: neon }
  }
}

export function AgentPanel({ agentActions: agentActionsProp, variant = 'floating' }: AgentPanelProps) {
  const { virtualPathname } = useAdminSurface()
  const { activeAgent, activeAgentId, chatHistory, addToHistory, agentSay, runAgentAction, agentState } = useAgentPanel()
  const [chatInput, setChatInput] = useState('')
  const feedRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = feedRef.current
    if (!el) return
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
  }, [chatHistory])

  const insights = usePageInsights(adminPathToPageSegment(virtualPathname))

  const accent = activeAgent.colorTheme.neonGreen
  const accentSoft = `${activeAgent.colorTheme.neonGreen}24`
  const charcoal = activeAgent.colorTheme.charcoal
  const { avatar, showImg, onImgError } = useAgentAvatarImage(activeAgent.id)
  const cue = useMemo(() => stateAccent(agentState, accent, accentSoft), [agentState, accent, accentSoft])

  const actions = agentActionsProp ?? activeAgent.actions

  const parseIntent = (text: string): { actionLabel?: string } => {
    const trimmed = text.trim()
    if (!trimmed) return {}
    const hit = actions.find((a) => a.label.toLowerCase() === trimmed.toLowerCase())
    return hit ? { actionLabel: hit.label } : {}
  }

  const runAction = (a: AgentAction | string) => {
    const label = typeof a === 'string' ? a : a.label
    void runAgentAction(activeAgentId, label)
  }

  const sendChatMessage = () => {
    const text = chatInput.trim()
    if (!text) return
    addToHistory('user', text)
    const intent = parseIntent(text)
    if (intent.actionLabel) {
      void runAction(intent.actionLabel)
    } else {
      agentSay("I'm not sure yet, but I'm learning.")
    }
    setChatInput('')
  }

  const btnStyle = actionButtonStyle(accent, accentSoft)

  const isSidebar = variant === 'sidebar'

  return (
    <aside
      className={`agent-panel${isSidebar ? '' : ' agent-panel--floating'}`.trim()}
      data-agent-state={agentState}
      aria-label={`Agent ${activeAgent.name}`}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: isSidebar ? 10 : 12,
        padding: isSidebar ? 12 : 14,
        borderRadius: isSidebar ? 0 : 16,
        background: isSidebar ? 'transparent' : PANEL_BG,
        border: isSidebar ? 'none' : BORDER_BASE,
        boxShadow: isSidebar ? 'none' : `0 18px 48px rgba(0,0,0,0.55), 0 0 0 1px ${accentSoft} inset`,
        backdropFilter: isSidebar ? undefined : 'blur(12px)',
        flex: isSidebar ? 1 : undefined,
        minHeight: isSidebar ? 0 : undefined,
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 14,
          right: 14,
          height: 2,
          borderRadius: 2,
          background: `linear-gradient(90deg, transparent, ${accent}, transparent)`,
          opacity: cue.topBarOpacity,
          transition: 'opacity 0.35s ease',
        }}
      />

      {!isSidebar ? (
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
          <div
            style={{
              width: 52,
              height: 52,
              borderRadius: 14,
              overflow: 'hidden',
              flexShrink: 0,
              background: `linear-gradient(145deg, ${charcoal}, #0a0b10)`,
              border: `1px solid ${cue.borderTint}59`,
              boxShadow: cue.avatarGlow,
              transition: 'box-shadow 0.35s ease, border-color 0.35s ease',
            }}
          >
            {showImg ? (
              <img
                src={avatar}
                alt=""
                width={52}
                height={52}
                style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                onError={onImgError}
              />
            ) : (
              <div
                style={{
                  width: '100%',
                  height: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 15,
                  fontWeight: 800,
                  color: accent,
                  letterSpacing: '-0.02em',
                }}
              >
                {activeAgent.name.slice(0, 2).toUpperCase()}
              </div>
            )}
          </div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#E8E8F2', letterSpacing: '-0.02em' }}>{activeAgent.name}</div>
            <div style={{ marginTop: 4, fontSize: 11.5, lineHeight: 1.45, color: 'rgba(200,200,220,0.72)' }}>
              {activeAgent.description}
            </div>
          </div>
        </div>
      ) : (
        <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.1em', color: 'rgba(139,144,168,0.9)', textTransform: 'uppercase' }}>
          Agent
        </div>
      )}

      <div
        ref={feedRef}
        role="log"
        aria-live="polite"
        aria-relevant="additions"
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          paddingRight: 2,
        }}
      >
        {chatHistory.length === 0 ? (
          <div style={{ fontSize: 11, color: 'rgba(160,160,185,0.55)', fontStyle: 'italic' }}>Agent message…</div>
        ) : (
          chatHistory.map((entry, i) => {
            const isAgent = entry.sender === 'agent'
            return (
              <div
                key={`${entry.ts}-${i}`}
                style={{
                  alignSelf: isAgent ? 'flex-start' : 'flex-end',
                  maxWidth: '92%',
                  padding: '8px 10px',
                  borderRadius: 12,
                  border: BORDER_BASE,
                  fontSize: 12.5,
                  lineHeight: 1.5,
                  color: 'rgba(235,235,245,0.92)',
                  background: isAgent ? 'rgba(22,24,31,0.95)' : 'rgba(36,40,52,0.95)',
                  boxShadow: '0 4px 16px rgba(0,0,0,0.25)',
                }}
              >
                {isAgent && (
                  <span style={{ color: accent, fontWeight: 700, marginRight: 6 }} aria-hidden>
                    ●
                  </span>
                )}
                {entry.text}
              </div>
            )
          })
        )}
      </div>

      {actions.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {actions.map((a, i) => {
            const key = `${a.label}-${i}`
            const title = a.description
            return (
              <button key={key} type="button" title={title} onClick={() => runAction(a)} style={btnStyle}>
                {a.label}
              </button>
            )
          })}
        </div>
      )}

      {insights.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', color: 'rgba(180,180,205,0.55)', textTransform: 'uppercase' }}>
            Insights
          </div>
          <ul
            style={{
              margin: 0,
              paddingLeft: 16,
              fontSize: 11.5,
              lineHeight: 1.45,
              color: 'rgba(210,210,228,0.82)',
            }}
          >
            {insights.map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ul>
        </div>
      )}

      <input
        type="text"
        value={chatInput}
        onChange={(e) => setChatInput(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            sendChatMessage()
          }
        }}
        placeholder="Message…"
        aria-label="Message the agent"
        style={{
          width: '100%',
          marginTop: 'auto',
          boxSizing: 'border-box',
          padding: '8px 10px',
          borderRadius: 10,
          border: BORDER_BASE,
          background: 'rgba(14,15,20,0.92)',
          color: 'rgba(235,235,245,0.92)',
          fontSize: 12,
          fontFamily: 'inherit',
          outline: 'none',
        }}
      />
    </aside>
  )
}
