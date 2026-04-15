import { useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { X } from 'lucide-react'
import type { ResolvedPageIntelligence } from '../../hooks/usePageIntelligence'
import { useAgents, useStarAgents } from '../../hooks/useAgents'
import { useSkills } from '../../hooks/useSkills'
import { IssueContextProvider } from '../../contexts/IssueContext'
import { ZiroWorkAgentCard } from './ZiroWorkAgentCard'

/**
 * Full-screen shell: same agent inspector as Ziro Work → Agents (ZiroWorkAgentCard), scoped by agent id.
 */
export default function AgentWorkspace({
  open,
  onClose,
  resolved,
  tenantId,
}: {
  open: boolean
  onClose: () => void
  resolved: ResolvedPageIntelligence
  tenantId: string | null
}) {
  const navigate = useNavigate()
  const { data: agents } = useAgents(tenantId)
  const { data: starAgents } = useStarAgents(tenantId)
  const { data: skills } = useSkills()

  const agentId = resolved.assignedAgent?.id ?? resolved.suggestedAgent?.id ?? null

  const agent = useMemo(() => {
    if (!agentId) return null
    return (agents ?? []).find(a => a.id === agentId) ?? resolved.assignedAgent ?? resolved.suggestedAgent
  }, [agents, agentId, resolved.assignedAgent, resolved.suggestedAgent])

  const orchestratorIds = useMemo(() => new Set((starAgents ?? []).map(s => s.agent_id)), [starAgents])
  const isOrchestratorAttached = agent ? orchestratorIds.has(agent.id) : false

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <IssueContextProvider page="Ziro Work — agent focus">
      <div
        role="dialog"
        aria-modal
        aria-label="Agent command center"
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 5000,
          background: 'rgba(2,2,12,0.88)',
          backdropFilter: 'blur(8px)',
          display: 'flex',
          alignItems: 'stretch',
          justifyContent: 'center',
        }}
      >
        <div
          style={{
            flex: 1,
            maxWidth: 960,
            margin: '12px',
            borderRadius: 16,
            border: '1px solid rgba(255,255,255,0.1)',
            background: 'linear-gradient(165deg, rgba(22,21,38,0.98) 0%, rgba(10,10,20,0.99) 100%)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            boxShadow: '0 24px 80px rgba(0,0,0,0.55)',
          }}
        >
          <header
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: '12px 16px',
              borderBottom: '1px solid rgba(255,255,255,0.08)',
              flexShrink: 0,
            }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: '#707098', letterSpacing: '0.08em' }}>ZIRO WORK · AGENT</div>
              <div style={{ fontSize: 16, fontWeight: 800, color: '#F0F0FF', marginTop: 2 }}>{resolved.surfaceTitle}</div>
              {resolved.resolution === 'heuristic_suggestion' && resolved.suggestedAgent && !resolved.assignedAgent && (
                <div style={{ fontSize: 12, color: '#A78BFA', marginTop: 4 }}>Showing suggested agent — assign a primary in Ziro Work for this page.</div>
              )}
            </div>
            <button
              type="button"
              onClick={onClose}
              style={{
                border: '1px solid rgba(255,255,255,0.12)',
                background: 'rgba(255,255,255,0.06)',
                borderRadius: 10,
                padding: 8,
                cursor: 'pointer',
                color: '#D0D0E8',
              }}
              title="Close (Esc)"
            >
              <X size={20} />
            </button>
          </header>

          <div style={{ flex: 1, overflow: 'auto', padding: 16 }}>
            {!agent ? (
              <div style={{ textAlign: 'center', padding: '48px 24px', color: '#8080A8' }}>
                <p style={{ fontSize: 15, fontWeight: 700, marginBottom: 8 }}>No agent on this page</p>
                <p style={{ fontSize: 13, lineHeight: 1.5, marginBottom: 16 }}>
                  Bind a specialist under <strong style={{ color: '#C8C8E8' }}>Ziro Work</strong> → page intelligence for <em>{resolved.surfaceTitle}</em>.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    onClose()
                    navigate(`/admin/zirowork?zwtab=ziro&surface=${encodeURIComponent(resolved.surfaceKey)}`)
                  }}
                  style={{
                    padding: '10px 18px',
                    borderRadius: 10,
                    fontSize: 13,
                    fontWeight: 700,
                    background: 'rgba(255,184,0,0.12)',
                    border: '1px solid rgba(255,184,0,0.28)',
                    color: '#FFD48A',
                    cursor: 'pointer',
                  }}
                >
                  Open Ziro Work
                </button>
              </div>
            ) : (
              <ZiroWorkAgentCard
                agent={agent}
                tenantId={tenantId}
                isOrchestratorAttached={isOrchestratorAttached}
                isExpanded
                onToggle={() => {}}
                onEdit={() => {
                  onClose()
                  navigate(`/admin/zirowork?zwtab=agents&agentId=${encodeURIComponent(agent.id)}`)
                }}
                skills={skills ?? []}
                lockedExpanded
              />
            )}
          </div>
        </div>
      </div>
    </IssueContextProvider>
  )
}
