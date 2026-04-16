import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { X } from 'lucide-react'
import type { ResolvedPageIntelligence } from '../../hooks/usePageIntelligence'
import { useUpsertPageIntelligenceBindings } from '../../hooks/usePageIntelligence'
import { useAgents, useZiroAgents } from '../../hooks/useAgents'
import { useSkills } from '../../hooks/useSkills'
import { IssueContextProvider } from '../../contexts/IssueContext'
import { ZiroWorkAgentCard } from './ZiroWorkAgentCard'
import { AgentFallback } from './AgentFallback'
import { toast } from '../shared/Toast'
import type { ZiroAgent } from '../../hooks/useAgents'
import {
  resolveSafeAgent,
  agentFlowDebug,
  assertValidAgent,
  navigateToZiroWorkAgentEditor,
} from '../../lib/ziro/agentSafe'

/**
 * Full-screen shell: same agent inspector as Ziro Work → Agents (ZiroWorkAgentCard), scoped by agent id.
 * Includes **persisted** page ↔ primary + supporting agent assignment (Supabase upsert).
 */
export default function AgentWorkspace({
  onClose,
  resolved,
  tenantId,
  entryAgentId,
}: {
  onClose: () => void
  resolved: ResolvedPageIntelligence
  tenantId: string | null
  /** Agent id that should be shown when the workspace opens (chip click). */
  entryAgentId: string | null
}) {
  const navigate = useNavigate()
  const safeAssigned = resolveSafeAgent(resolved.assignedAgent)
  const safeSuggested = resolveSafeAgent(resolved.suggestedAgent)
  const { data: agents } = useAgents(tenantId)
  const { data: ziroAgents } = useZiroAgents(tenantId)
  const { data: skills } = useSkills()
  const upsertBindings = useUpsertPageIntelligenceBindings(tenantId)

  const pickableAgents = useMemo(() => {
    const out: ZiroAgent[] = []
    for (const raw of agents ?? []) {
      const a = resolveSafeAgent(raw)
      if (!a) continue
      if (a.status !== 'active' && a.status !== 'idle') continue
      out.push(a)
    }
    return out
  }, [agents])

  const initialPrimaryPick =
    (typeof entryAgentId === 'string' && entryAgentId.trim() ? entryAgentId.trim() : '') ||
    safeAssigned?.id ||
    safeSuggested?.id ||
    resolved.pageBinding?.primary_agent_id ||
    ''

  const initialSupportingPick = useMemo(() => {
    const primary = initialPrimaryPick
    const fromDb = new Set(resolved.pageBinding?.supporting_agent_ids ?? [])
    if (primary) fromDb.delete(primary)
    return fromDb
  }, [resolved.pageBinding?.supporting_agent_ids, initialPrimaryPick])

  const [primaryPick, setPrimaryPick] = useState<string>(initialPrimaryPick)
  const [supportingPick, setSupportingPick] = useState<Set<string>>(initialSupportingPick)

  const orchestratorIds = useMemo(() => new Set((ziroAgents ?? []).map(s => s.agent_id)), [ziroAgents])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const saveAssignment = () => {
    if (!tenantId) {
      toast('Missing tenant — sign in again.', 'error')
      return
    }
    const primary = primaryPick || null
    const supporting = [...supportingPick].filter(id => id && id !== primary)
    upsertBindings.mutate(
      [
        {
          tenant_id: tenantId,
          page_key: resolved.surfaceKey,
          primary_agent_id: primary,
          supporting_agent_ids: supporting,
        },
      ],
      {
        onSuccess: () => {
          toast('Page agent assignment saved.', 'success')
          onClose()
        },
        onError: (e: Error) => toast(e.message ?? 'Could not save assignment', 'error'),
      },
    )
  }

  const clearAssignment = () => {
    if (!tenantId) {
      toast('Missing tenant — sign in again.', 'error')
      return
    }
    upsertBindings.mutate(
      [{ tenant_id: tenantId, page_key: resolved.surfaceKey, primary_agent_id: null, supporting_agent_ids: [] }],
      {
        onSuccess: () => {
          toast('Cleared page assignment.', 'success')
          setPrimaryPick('')
          setSupportingPick(new Set())
          onClose()
        },
        onError: (e: Error) => toast(e.message ?? 'Could not clear assignment', 'error'),
      },
    )
  }

  const toggleSupporting = (id: string) => {
    if (!id?.trim() || id === primaryPick) return
    setSupportingPick(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const displayAgentForCard = useMemo((): ZiroAgent | null => {
    const pickedId = primaryPick?.trim()
    if (pickedId) {
      const picked = pickableAgents.find(a => a.id === primaryPick)
      if (picked) return resolveSafeAgent(picked)
      return safeAssigned ?? safeSuggested
    }
    return safeAssigned ?? safeSuggested
  }, [primaryPick, pickableAgents, safeAssigned, safeSuggested])

  const cardAgent = resolveSafeAgent(displayAgentForCard)

  useEffect(() => {
    agentFlowDebug({
      action: 'open_workspace',
      agentId: cardAgent?.id ?? safeAssigned?.id ?? safeSuggested?.id ?? null,
      source: 'agent_workspace',
      meta: {
        surfaceKey: resolved.surfaceKey,
        resolution: resolved.resolution,
        assignedId: safeAssigned?.id ?? null,
        suggestedId: safeSuggested?.id ?? null,
        primaryPick: primaryPick || null,
        cardAgentId: cardAgent?.id ?? null,
      },
    })
    if (displayAgentForCard && !cardAgent) {
      console.warn('[AgentWorkspace] Invalid agent for card (missing id after resolve)', displayAgentForCard)
    }
  }, [
    resolved.surfaceKey,
    resolved.resolution,
    safeAssigned?.id,
    safeSuggested?.id,
    primaryPick,
    cardAgent,
    displayAgentForCard,
  ])

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
              {resolved.resolution === 'heuristic_suggestion' && safeSuggested && !safeAssigned && (
                <div style={{ fontSize: 12, color: '#A78BFA', marginTop: 4 }}>
                  Suggested match — pick a primary below and save to attach this page.
                </div>
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
            <section
              style={{
                marginBottom: 20,
                padding: 14,
                borderRadius: 12,
                border: '1px solid rgba(255,255,255,0.08)',
                background: 'rgba(255,255,255,0.03)',
              }}
            >
              <div style={{ fontSize: 12, fontWeight: 800, color: '#A0A0C8', marginBottom: 10 }}>PAGE ASSIGNMENT (PERSISTED)</div>
              <div style={{ fontSize: 11, color: '#707098', marginBottom: 10, fontFamily: 'ui-monospace, monospace' }}>
                page_key: {resolved.surfaceKey}
              </div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#C8C8E8', marginBottom: 6 }}>Primary agent</label>
              <select
                value={primaryPick}
                onChange={e => {
                  const v = e.target.value
                  setPrimaryPick(v)
                  setSupportingPick(prev => {
                    const next = new Set(prev)
                    next.delete(v)
                    return next
                  })
                }}
                style={{
                  width: '100%',
                  maxWidth: 420,
                  padding: '10px 12px',
                  borderRadius: 10,
                  border: '1px solid rgba(255,255,255,0.12)',
                  background: 'rgba(0,0,0,0.35)',
                  color: '#E8E8FF',
                  fontSize: 13,
                  marginBottom: 14,
                }}
              >
                <option value="">— None —</option>
                {pickableAgents.map(a => (
                  <option key={a.id} value={a.id}>
                    {a.name} ({a.status})
                  </option>
                ))}
              </select>

              <div style={{ fontSize: 12, fontWeight: 700, color: '#C8C8E8', marginBottom: 8 }}>Supporting agents (optional)</div>
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 6,
                  maxHeight: 160,
                  overflow: 'auto',
                  marginBottom: 14,
                }}
              >
                {pickableAgents.map(a => (
                  <label
                    key={a.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      fontSize: 13,
                      color: a.id === primaryPick ? '#606080' : '#D8D8F0',
                      cursor: a.id === primaryPick ? 'not-allowed' : 'pointer',
                    }}
                  >
                    <input
                      type="checkbox"
                      disabled={a.id === primaryPick}
                      checked={supportingPick.has(a.id)}
                      onChange={() => toggleSupporting(a.id)}
                    />
                    {a.name}
                  </label>
                ))}
              </div>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                <button
                  type="button"
                  disabled={upsertBindings.isPending}
                  onClick={saveAssignment}
                  style={{
                    padding: '10px 18px',
                    borderRadius: 10,
                    fontSize: 13,
                    fontWeight: 700,
                    background: 'rgba(34,197,94,0.18)',
                    border: '1px solid rgba(34,197,94,0.4)',
                    color: '#86EFAC',
                    cursor: upsertBindings.isPending ? 'not-allowed' : 'pointer',
                  }}
                >
                  {upsertBindings.isPending ? 'Saving…' : 'Save assignment'}
                </button>
                <button
                  type="button"
                  disabled={
                    upsertBindings.isPending ||
                    (!resolved.pageBinding?.primary_agent_id &&
                      !(resolved.pageBinding?.supporting_agent_ids?.length) &&
                      !primaryPick &&
                      supportingPick.size === 0)
                  }
                  onClick={clearAssignment}
                  style={{
                    padding: '10px 18px',
                    borderRadius: 10,
                    fontSize: 13,
                    fontWeight: 700,
                    background: 'rgba(248,113,113,0.1)',
                    border: '1px solid rgba(248,113,113,0.35)',
                    color: '#FCA5A5',
                    cursor: upsertBindings.isPending ? 'not-allowed' : 'pointer',
                  }}
                >
                  Clear assignment
                </button>
              </div>
            </section>

            {!cardAgent ? (
              <div style={{ textAlign: 'center', padding: '48px 24px', color: '#8080A8' }}>
                <AgentFallback />
                <p style={{ fontSize: 15, fontWeight: 700, marginBottom: 8, marginTop: 12 }}>No agent selected</p>
                <p style={{ fontSize: 13, lineHeight: 1.5, marginBottom: 16 }}>
                  Choose a primary agent above and save, or open the full library in Ziro Work.
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
              (assertValidAgent(cardAgent, 'AgentWorkspace:card'),
              <ZiroWorkAgentCard
                agent={cardAgent}
                tenantId={tenantId}
                isOrchestratorAttached={orchestratorIds.has(cardAgent.id)}
                isExpanded
                onToggle={() => {}}
                onEdit={() => {
                  const ok = navigateToZiroWorkAgentEditor(navigate, cardAgent, 'workspace_card', {
                    beforeNavigate: onClose,
                    meta: { surfaceKey: resolved.surfaceKey },
                  })
                  if (!ok) {
                    toast('No agent selected — cannot open editor.', 'error')
                  }
                }}
                skills={skills ?? []}
                lockedExpanded
              />)
            )}
          </div>
        </div>
      </div>
    </IssueContextProvider>
  )
}
