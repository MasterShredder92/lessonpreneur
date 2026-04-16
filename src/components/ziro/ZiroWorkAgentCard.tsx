import { useState, type ReactNode } from 'react'
import {
  Bot,
  Zap,
  Sparkles,
  ChevronDown,
  ChevronUp,
  Unlink,
  Link2,
  Pencil,
  Copy,
  Power,
  Trash2,
  RefreshCw,
  ArrowUpRight,
} from 'lucide-react'
import type { ZiroAgent } from '../../hooks/useAgents'
import { resolveSafeAgent, agentFlowDebug, assertValidAgent } from '../../lib/ziro/agentSafe'
import { AgentFallback } from './AgentFallback'
import {
  useAgentSkills,
  useRetireAgent,
  useActivateAgent,
  useIdleAgent,
  useConvertTempAgent,
  useDeleteAgent,
  useAttachAgentToStar,
  useDetachAgentFromStar,
  useAttachSkillToAgent,
  useDetachSkillFromAgent,
  useCloneAgent,
} from '../../hooks/useAgents'
import type { ZiroSkill } from '../../hooks/useSkills'
import { toast } from '../shared/Toast'
import { CARD, pillStyle, sectionLabel, inputStyle } from './ziroWorkSharedStyles'

const STATUS_COLORS: Record<string, string> = {
  active: '#22C55E',
  idle: '#FFB800',
  retired: '#EF4444',
}

function ActionBtn({ icon, label, color, onClick }: { icon: ReactNode; label: string; color: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '7px 14px',
        borderRadius: 8,
        fontSize: 12,
        fontWeight: 600,
        background: `${color}12`,
        border: `1px solid ${color}30`,
        color,
        cursor: 'pointer',
      }}
    >
      {icon} {label}
    </button>
  )
}

/**
 * Single-agent inspector from Ziro Work → Agents tab (same UI, same mutations).
 * When `lockedExpanded`, used inside Agent Workspace overlay (no collapse).
 */
export function ZiroWorkAgentCard({
  agent: rawAgent,
  tenantId,
  isOrchestratorAttached,
  isExpanded,
  onToggle,
  onEdit,
  skills,
  lockedExpanded = false,
}: {
  agent: ZiroAgent
  tenantId: string | null
  isOrchestratorAttached: boolean
  isExpanded: boolean
  onToggle: () => void
  onEdit: () => void
  skills: ZiroSkill[]
  lockedExpanded?: boolean
}) {
  const resolvedAgent = resolveSafeAgent(rawAgent)
  const agentId = resolvedAgent?.id ?? null
  const expanded = lockedExpanded || isExpanded
  const { data: agentSkills } = useAgentSkills(expanded && agentId ? agentId : null)
  const retireAgent = useRetireAgent()
  const activateAgent = useActivateAgent()
  const idleAgent = useIdleAgent()
  const convertTemp = useConvertTempAgent()
  const deleteAgent = useDeleteAgent()
  const attachToStar = useAttachAgentToStar(tenantId)
  const detachFromStar = useDetachAgentFromStar(tenantId)
  const attachSkill = useAttachSkillToAgent()
  const detachSkill = useDetachSkillFromAgent()
  const cloneAgent = useCloneAgent(tenantId)
  const [showSkillPicker, setShowSkillPicker] = useState(false)

  if (!resolvedAgent || !agentId) {
    return (
      <div style={CARD}>
        <AgentFallback />
      </div>
    )
  }

  const agent = resolvedAgent
  assertValidAgent(agent, 'ZiroWorkAgentCard:render')
  const statusColor = STATUS_COLORS[agent.status] ?? '#8080A8'
  const attachedSkillIds = new Set((agentSkills ?? []).map(s => s.skill_id))
  const availableSkills = skills.filter(s => !attachedSkillIds.has(s.id) && s.is_active)

  return (
    <div
      style={{
        ...CARD,
        borderLeft: `3px solid ${statusColor}`,
        opacity: agent.status === 'retired' ? 0.55 : 1,
      }}
    >
      <div
        role={lockedExpanded ? undefined : 'button'}
        onClick={lockedExpanded ? undefined : onToggle}
        style={{
          padding: '16px 22px',
          cursor: lockedExpanded ? 'default' : 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: 14,
        }}
      >
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: 9,
            flexShrink: 0,
            background: `${statusColor}15`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Bot size={16} style={{ color: statusColor }} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 16, fontWeight: 800, color: '#E0E0F4', lineHeight: 1.3 }}>{agent.name}</span>
            <span style={pillStyle(statusColor)}>{agent.status.toUpperCase()}</span>
            <span style={pillStyle(agent.lifecycle_type === 'temporary' ? '#FF5500' : '#3b82f6')}>
              {agent.lifecycle_type === 'temporary' ? 'TEMP' : 'PERSISTENT'}
            </span>
            <span style={pillStyle(agent.owner_type === 'user' ? '#D4226A' : '#8080A8')}>
              {agent.owner_type === 'user' ? 'USER' : 'SYSTEM'}
            </span>
            {isOrchestratorAttached && (
              <span style={{ ...pillStyle('#FFB800'), display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                <Sparkles size={9} /> ZIRO
              </span>
            )}
            <span style={pillStyle(agent.auto_use_by_ziro ? '#22C55E' : '#8080A8')}>
              {agent.auto_use_by_ziro ? 'AUTO' : 'EXPLICIT'}
            </span>
          </div>
          {agent.role && (
            <div style={{ fontSize: 13, color: '#A0A0C8', marginTop: 4, fontStyle: 'italic', lineHeight: 1.4 }}>{agent.role}</div>
          )}
          {agent.purpose && (
            <div style={{ fontSize: 14, color: '#8080A8', marginTop: 3, lineHeight: 1.5 }}>{agent.purpose}</div>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12, color: '#606088', flexShrink: 0 }}>
          {agent.last_used_at && <span>Last used {new Date(agent.last_used_at).toLocaleDateString()}</span>}
          {!lockedExpanded && (expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />)}
        </div>
      </div>

      {expanded && (
        <div style={{ padding: '0 22px 20px', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
          {(agent.instructions || agent.profile_summary || (agent.usage_triggers && agent.usage_triggers.length > 0)) && (
            <div style={{ marginTop: 18, display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={sectionLabel}>Agent Profile</div>
              {agent.profile_summary && (
                <div
                  style={{
                    fontSize: 14,
                    color: '#A0A0C8',
                    padding: '12px 16px',
                    borderRadius: 10,
                    lineHeight: 1.6,
                    background: 'rgba(255,255,255,0.02)',
                    borderLeft: '3px solid rgba(34,197,94,0.3)',
                  }}
                >
                  {agent.profile_summary}
                </div>
              )}
              {agent.instructions && (
                <div>
                  <div
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      color: '#606088',
                      textTransform: 'uppercase',
                      letterSpacing: '0.06em',
                      marginBottom: 6,
                    }}
                  >
                    Instructions
                  </div>
                  <pre
                    style={{
                      fontSize: 13,
                      color: '#A0A0C8',
                      padding: '12px 16px',
                      borderRadius: 10,
                      lineHeight: 1.6,
                      background: 'rgba(255,255,255,0.02)',
                      overflow: 'auto',
                      maxHeight: 140,
                      whiteSpace: 'pre-wrap',
                      margin: 0,
                    }}
                  >
                    {agent.instructions}
                  </pre>
                </div>
              )}
              {agent.usage_triggers && agent.usage_triggers.length > 0 && (
                <div>
                  <div
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      color: '#606088',
                      textTransform: 'uppercase',
                      letterSpacing: '0.06em',
                      marginBottom: 6,
                    }}
                  >
                    Usage Triggers
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {agent.usage_triggers.map((t, i) => (
                      <span key={i} style={pillStyle('#8080A8')}>
                        {t}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          <div style={{ marginTop: 18 }}>
            <div style={{ ...sectionLabel, marginBottom: 10 }}>Attached Skills</div>
            {(agentSkills ?? []).length === 0 ? (
              <div style={{ fontSize: 14, color: '#606088', fontStyle: 'italic', lineHeight: 1.5 }}>No skills attached.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {(agentSkills ?? []).map(as => (
                  <div
                    key={as.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      padding: '10px 14px',
                      borderRadius: 10,
                      background: 'rgba(255,255,255,0.02)',
                      border: '1px solid rgba(255,255,255,0.06)',
                    }}
                  >
                    <Zap size={14} style={{ color: '#FFB800' }} />
                    <span style={{ flex: 1, fontSize: 14, color: '#E0E0F4', fontWeight: 600, lineHeight: 1.4 }}>{as.skill_name}</span>
                    {as.is_primary && <span style={pillStyle('#22C55E')}>PRIMARY</span>}
                    <button
                      type="button"
                      onClick={() =>
                        detachSkill.mutate(
                          { agentId, skillId: as.skill_id },
                          {
                            onSuccess: () => toast('Skill detached', 'success'),
                            onError: (e: unknown) =>
                              toast(e instanceof Error ? e.message : 'Could not detach skill', 'error'),
                          },
                        )
                      }
                      style={{ background: 'none', border: 'none', color: '#EF4444', cursor: 'pointer', padding: 4 }}
                    >
                      <Unlink size={13} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {showSkillPicker ? (
              <div style={{ marginTop: 10, display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
                <select
                  autoFocus
                  defaultValue=""
                  onChange={e => {
                    const skillId = e.target.value
                    const el = e.target
                    if (!skillId || !tenantId) return
                    attachSkill.mutate(
                      { tenantId, agentId, skillId },
                      {
                        onSuccess: () => {
                          el.value = ''
                          toast('Skill attached', 'success')
                          setShowSkillPicker(false)
                        },
                        onError: (err: unknown) =>
                          toast(err instanceof Error ? err.message : 'Could not attach skill', 'error'),
                      },
                    )
                  }}
                  style={{ ...inputStyle, fontSize: 13, flex: '1 1 220px', minWidth: 0 }}
                >
                  <option value="">Select a skill...</option>
                  {availableSkills.map(s => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.key})
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => setShowSkillPicker(false)}
                  style={{
                    padding: '8px 14px',
                    borderRadius: 8,
                    fontSize: 12,
                    fontWeight: 600,
                    background: 'rgba(255,255,255,0.04)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    color: '#A0A0C8',
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setShowSkillPicker(true)}
                style={{
                  marginTop: 10,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '7px 14px',
                  borderRadius: 8,
                  fontSize: 12,
                  fontWeight: 600,
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  color: '#8080A8',
                  cursor: 'pointer',
                }}
              >
                <Link2 size={12} /> Attach Skill
              </button>
            )}
          </div>

          {Object.keys(agent.invocation_rules).length > 0 && (
            <div style={{ marginTop: 18 }}>
              <div style={{ ...sectionLabel, marginBottom: 8 }}>Invocation Rules</div>
              <pre
                style={{
                  fontSize: 13,
                  color: '#A0A0C8',
                  padding: '12px 16px',
                  borderRadius: 10,
                  lineHeight: 1.6,
                  background: 'rgba(255,255,255,0.02)',
                  overflow: 'auto',
                  maxHeight: 140,
                }}
              >
                {JSON.stringify(agent.invocation_rules, null, 2)}
              </pre>
            </div>
          )}

          <div
            style={{
              display: 'flex',
              gap: 8,
              marginTop: 20,
              paddingTop: 16,
              borderTop: '1px solid rgba(255,255,255,0.05)',
              flexWrap: 'wrap',
            }}
          >
            <ActionBtn
              icon={<Pencil size={13} />}
              label="Edit"
              color="#22C55E"
              onClick={() => {
                if (!agentId?.trim()) {
                  console.warn('[ZiroWorkAgentCard] Blocked edit: missing agent id')
                  toast('No agent selected', 'error')
                  return
                }
                agentFlowDebug({
                  action: 'edit_click',
                  agentId: agentId.trim(),
                  source: 'agent_card',
                  meta: { lockedExpanded },
                })
                onEdit()
              }}
            />
            <ActionBtn
              icon={<Copy size={13} />}
              label="Clone"
              color="#3b82f6"
              onClick={() =>
                cloneAgent.mutate(agentId, {
                  onSuccess: () => toast('Agent cloned', 'success'),
                  onError: (e: unknown) => toast(e instanceof Error ? e.message : 'Could not clone agent', 'error'),
                })
              }
            />

            {isOrchestratorAttached ? (
              <ActionBtn
                icon={<Unlink size={13} />}
                label="Detach from Ziro"
                color="#FF5500"
                onClick={() => detachFromStar.mutate(agentId, { onSuccess: () => toast('Detached from Ziro', 'success') })}
              />
            ) : agent.status === 'active' ? (
              <ActionBtn
                icon={<Sparkles size={13} />}
                label="Attach to Ziro"
                color="#FFB800"
                onClick={() => attachToStar.mutate(agentId, { onSuccess: () => toast('Attached to Ziro', 'success') })}
              />
            ) : null}

            {agent.status === 'active' && (
              <ActionBtn icon={<Power size={13} />} label="Pause" color="#FFB800" onClick={() => idleAgent.mutate(agentId, { onSuccess: () => toast('Agent paused', 'success') })} />
            )}
            {agent.status === 'idle' && (
              <ActionBtn icon={<Power size={13} />} label="Activate" color="#22C55E" onClick={() => activateAgent.mutate(agentId, { onSuccess: () => toast('Agent activated', 'success') })} />
            )}
            {agent.status !== 'retired' && (
              <ActionBtn icon={<Power size={13} />} label="Retire" color="#EF4444" onClick={() => retireAgent.mutate(agentId, { onSuccess: () => toast('Agent retired', 'success') })} />
            )}
            {agent.status === 'retired' && (
              <ActionBtn icon={<RefreshCw size={13} />} label="Reactivate" color="#22C55E" onClick={() => activateAgent.mutate(agentId, { onSuccess: () => toast('Agent reactivated', 'success') })} />
            )}

            {agent.lifecycle_type === 'temporary' && agent.status !== 'retired' && (
              <ActionBtn
                icon={<ArrowUpRight size={13} />}
                label="Make Persistent"
                color="#3b82f6"
                onClick={() => convertTemp.mutate(agentId, { onSuccess: () => toast('Converted to persistent', 'success') })}
              />
            )}

            <ActionBtn
              icon={<Trash2 size={13} />}
              label="Delete"
              color="#EF4444"
              onClick={() => {
                if (confirm(`Delete agent "${agent.name}"?`)) deleteAgent.mutate(agentId, { onSuccess: () => toast('Agent deleted', 'success') })
              }}
            />
          </div>
        </div>
      )}
    </div>
  )
}
