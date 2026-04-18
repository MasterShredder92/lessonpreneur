import type { ReactNode } from 'react'
import type { AgentDefinition } from '../../lib/agents/agents'
import { useAgentAvatarImage } from '../../hooks/useAgentAvatarImage'

export type AgentSidebarProps = {
  agent: AgentDefinition
  studioLogoUrl?: string | null
  studioName?: string
  children: ReactNode
  footer: ReactNode
  mobileOpen?: boolean
  onMobileClose?: () => void
}

export default function AgentSidebar({
  agent,
  studioLogoUrl,
  studioName,
  children,
  footer,
  mobileOpen,
  onMobileClose,
}: AgentSidebarProps) {
  const neon = agent.colorTheme.neonGreen
  const { avatar, showImg, onImgError } = useAgentAvatarImage(agent.id)

  const inner = (
    <>
      <div
        style={{
          padding: '20px 16px 16px',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
          {studioLogoUrl ? (
            <img
              src={studioLogoUrl}
              alt=""
              style={{ width: 36, height: 36, borderRadius: 10, objectFit: 'cover', border: '1px solid rgba(255,255,255,0.08)' }}
            />
          ) : null}
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.14em', color: 'rgba(139,144,168,0.9)', textTransform: 'uppercase' }}>
              Operating layer
            </div>
            {studioName ? (
              <div style={{ fontSize: 13, fontWeight: 600, color: '#e8eaf4', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {studioName}
              </div>
            ) : null}
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            textAlign: 'center',
            padding: '8px 4px 4px',
          }}
        >
          <div
            style={{
              position: 'relative',
              width: 96,
              height: 96,
              borderRadius: 22,
              padding: 3,
              background: `linear-gradient(135deg, ${neon}55, rgba(200,255,0,0.25), transparent)`,
              boxShadow: `0 0 40px ${neon}22, 0 12px 28px rgba(0,0,0,0.45)`,
            }}
          >
            <div
              style={{
                width: '100%',
                height: '100%',
                borderRadius: 19,
                overflow: 'hidden',
                background: 'linear-gradient(180deg, #1a1d28 0%, #0e1016 100%)',
                border: '1px solid rgba(255,255,255,0.08)',
              }}
            >
              {showImg ? (
                <img
                  src={avatar}
                  alt=""
                  width={96}
                  height={96}
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
                    fontSize: 28,
                    fontWeight: 800,
                    color: neon,
                  }}
                >
                  {agent.name.slice(0, 2).toUpperCase()}
                </div>
              )}
            </div>
          </div>
          <div style={{ marginTop: 14, fontSize: 18, fontWeight: 700, color: '#f0f2fa', letterSpacing: '-0.02em' }}>{agent.name}</div>
          <div style={{ marginTop: 6, fontSize: 12, lineHeight: 1.45, color: 'rgba(184,188,208,0.88)', maxWidth: 240 }}>
            {agent.description}
          </div>
        </div>
      </div>

      <nav
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
          padding: '12px 10px',
          display: 'flex',
          flexDirection: 'column',
          gap: 2,
        }}
      >
        {children}
      </nav>

      <div
        style={{
          flexShrink: 0,
          borderTop: '1px solid rgba(255,255,255,0.06)',
          padding: '12px 10px 16px',
          background: 'linear-gradient(180deg, transparent, rgba(0,0,0,0.25))',
        }}
      >
        {footer}
      </div>
    </>
  )

  return (
    <>
      {mobileOpen ? (
        <button
          type="button"
          aria-label="Close menu"
          onClick={onMobileClose}
          className="zw-agent-sidebar__backdrop"
        />
      ) : null}

      <aside className={`zw-agent-sidebar${mobileOpen ? ' zw-agent-sidebar--open' : ''}`.trim()}>{inner}</aside>

      <style>{`
        .zw-agent-sidebar {
          display: flex;
          flex-direction: column;
          width: 300px;
          min-height: 100vh;
          border-right: 1px solid rgba(255,255,255,0.07);
          background: linear-gradient(180deg, rgba(20,22,30,0.98) 0%, rgba(10,11,15,0.99) 100%);
          box-shadow: 4px 0 32px rgba(0,0,0,0.35);
          z-index: 2;
        }
        .zw-agent-sidebar__backdrop {
          display: none;
        }
        @media (max-width: 900px) {
          .zw-agent-sidebar {
            position: fixed;
            top: 0;
            left: 0;
            bottom: 0;
            z-index: 71;
            transform: translateX(-100%);
            transition: transform 0.22s cubic-bezier(0.32, 0.72, 0, 1);
            width: min(300px, 92vw);
            box-shadow: 8px 0 40px rgba(0,0,0,0.5);
          }
          .zw-agent-sidebar--open {
            transform: translateX(0);
          }
          .zw-agent-sidebar__backdrop {
            display: block;
            position: fixed;
            inset: 0;
            z-index: 70;
            background: rgba(0,0,0,0.55);
            border: none;
            cursor: pointer;
            padding: 0;
            margin: 0;
          }
        }
      `}</style>
    </>
  )
}
