import { useState, type CSSProperties } from 'react'
import { useAuthContext } from '../../app/AuthContext'
import { usePermissions } from '../../hooks/usePermissions'
import {
  useAgents,
  useStarAgents,
  useAgentSkills,
  useCreateAgent,
  useUpdateAgent,
  useRetireAgent,
  useActivateAgent,
  useIdleAgent,
  useConvertTempAgent,
  useDeleteAgent,
  useAttachSkillToAgent,
  useDetachSkillFromAgent,
  useAttachAgentToStar,
  useDetachAgentFromStar,
  useCloneAgent,
  useStarConfig,
  useUpsertStarConfig,
  type ZiroAgent,
} from '../../hooks/useAgents'
import { useSkills, type ZiroSkill } from '../../hooks/useSkills'
import { useTaskHistory, type TaskHistoryRow } from '../../hooks/useTaskHistory'
import { useRouteAnalytics } from '../../hooks/useRouteAnalytics'
import { toast } from '../../components/shared/Toast'
import MusicLoader from '../../components/shared/MusicLoader'
import { IssueContextProvider } from '../../contexts/IssueContext'
import ReportIssueButton from '../../components/shared/ReportIssueButton'
import SkillsManager from './SkillsManager'
import {
  Bot,
  Zap,
  History,
  Plus,
  Power,
  Trash2,
  Link2,
  Unlink,
  ArrowUpRight,
  ChevronDown,
  ChevronUp,
  Star,
  X,
  Shield,
  Clock,
  RefreshCw,
  BarChart3,
  Pencil,
  Copy,
} from 'lucide-react'

type MainTab = 'skills' | 'agents' | 'history' | 'analytics' | 'star'

const STATUS_COLORS: Record<string, string> = {
  active: '#22C55E',
  idle: '#FFB800',
  retired: '#EF4444',
}

const ROUTE_COLORS: Record<string, string> = {
  direct: '#8080A8',
  skill: '#22C55E',
  agent: '#3b82f6',
  temp_agent: '#FF5500',
}

const ROUTE_LABELS: Record<string, string> = {
  direct: 'Handled by Star',
  skill: 'Used Skill',
  agent: 'Used Agent',
  temp_agent: 'Created Temporary Agent',
}

const pillStyle = (color: string): CSSProperties => ({
  display: 'inline-block',
  fontSize: 9,
  fontWeight: 700,
  padding: '2px 8px',
  borderRadius: 6,
  background: `${color}18`,
  color,
})

export default function ZiroWorkPage() {
  const { role, tenantId } = useAuthContext()
  const { isOwner } = usePermissions()
  const isAdmin = role === 'owner' || role === 'admin'
  const [mainTab, setMainTab] = useState<MainTab>('skills')

  if (!isAdmin) {
    return (
      <div className="page" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
        <div style={{ textAlign: 'center', color: '#8080A8' }}>
          <Shield size={32} style={{ marginBottom: 12, opacity: 0.5 }} />
          <div style={{ fontSize: 15, fontWeight: 700 }}>Access Restricted</div>
          <div style={{ fontSize: 13, marginTop: 4 }}>ZiroWork is available to owners and admins only.</div>
        </div>
      </div>
    )
  }

  return (
    <IssueContextProvider pageId="zirowork">
      <div className="page">
        <div className="page-header" style={{ marginBottom: 20 }}>
          <div>
            <h1 style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Zap size={22} style={{ color: '#FFB800' }} />
              ZiroWork
            </h1>
            <p style={{ fontSize: 13, color: '#8080A8', marginTop: 4 }}>
              Skills, agents, and task routing — Star's orchestration layer.
            </p>
          </div>
          <ReportIssueButton />
        </div>

        {/* Main tabs */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 20, flexWrap: 'wrap' }}>
          {([
            { key: 'skills', label: 'Skills', icon: <Zap size={13} /> },
            { key: 'agents', label: 'Agents', icon: <Bot size={13} /> },
            { key: 'star', label: 'Star', icon: <Star size={13} /> },
            { key: 'history', label: 'Task History', icon: <History size={13} /> },
            { key: 'analytics', label: 'Route Analytics', icon: <BarChart3 size={13} /> },
          ] as const).map(t => (
            <button
              key={t.key}
              onClick={() => setMainTab(t.key)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '8px 18px', borderRadius: 8, fontSize: 12, fontWeight: 700,
                background: mainTab === t.key ? 'rgba(212,34,106,0.15)' : 'rgba(255,255,255,0.03)',
                color: mainTab === t.key ? '#D4226A' : '#8080A8',
                border: 'none', cursor: 'pointer',
              }}
            >
              {t.icon} {t.label}
            </button>
          ))}
        </div>

        {mainTab === 'skills' && <SkillsManager embedded />}
        {mainTab === 'agents' && <AgentsTab tenantId={tenantId} isOwner={isOwner} />}
        {mainTab === 'star' && <StarConfigTab tenantId={tenantId} />}
        {mainTab === 'history' && <TaskHistoryTab tenantId={tenantId} />}
        {mainTab === 'analytics' && <RouteAnalyticsTab tenantId={tenantId} />}
      </div>
    </IssueContextProvider>
  )
}

// ═══════════════════════════════════════════════════════
// STAR CONFIG TAB
// ═══════════════════════════════════════════════════════

function StarConfigTab({ tenantId }: { tenantId: string | null }) {
  const { data: config, isLoading } = useStarConfig(tenantId)
  const upsert = useUpsertStarConfig(tenantId)
  const [instructions, setInstructions] = useState('')
  const [dirty, setDirty] = useState(false)
  const [initialized, setInitialized] = useState(false)

  // Sync from server on load
  if (config && !initialized) {
    setInstructions(config.instructions ?? '')
    setInitialized(true)
  }

  const handleSave = () => {
    upsert.mutate({ instructions: instructions.trim() || null }, {
      onSuccess: () => { toast('Star config saved', 'success'); setDirty(false) },
      onError: (e: any) => toast(e.message, 'error'),
    })
  }

  if (isLoading) return <MusicLoader />

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
        <Star size={18} style={{ color: '#FFB800' }} />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: '#E0E0F4' }}>Star Configuration</div>
          <div style={{ fontSize: 12, color: '#8080A8', marginTop: 2 }}>Global instructions and persona for Star's AI orchestration layer.</div>
        </div>
        {dirty && (
          <button onClick={handleSave} disabled={upsert.isPending} style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '8px 16px', borderRadius: 8, fontSize: 12, fontWeight: 700,
            background: 'rgba(212,34,106,0.12)', color: '#D4226A',
            border: '1px solid rgba(212,34,106,0.25)', cursor: 'pointer',
          }}>
            {upsert.isPending ? 'Saving...' : 'Save Changes'}
          </button>
        )}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div>
          <label style={labelStyle}>Global Instructions</label>
          <textarea
            value={instructions}
            onChange={e => { setInstructions(e.target.value); setDirty(true) }}
            placeholder="Custom instructions appended to Star's system prompt. Guide Star's personality, priorities, and boundaries..."
            style={{ ...inputStyle, minHeight: 160, resize: 'vertical' }}
          />
          <div style={{ fontSize: 11, color: '#606088', marginTop: 4 }}>
            These instructions are injected into Star's context on every interaction.
          </div>
        </div>

        {config && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div style={{ padding: '14px 16px', borderRadius: 10, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#8080A8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Routing Rules</div>
              <pre style={{ fontSize: 11, color: '#A0A0C8', margin: 0, overflow: 'auto', maxHeight: 100 }}>
                {Object.keys(config.routing_rules).length > 0 ? JSON.stringify(config.routing_rules, null, 2) : 'Default (direct > skill > agent > temp_agent)'}
              </pre>
            </div>
            <div style={{ padding: '14px 16px', borderRadius: 10, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#8080A8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Default Skills</div>
              <div style={{ fontSize: 12, color: '#A0A0C8' }}>
                {config.default_skill_ids.length > 0 ? `${config.default_skill_ids.length} skill(s) pinned` : 'None pinned'}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════
// AGENTS TAB
// ═══════════════════════════════════════════════════════

function AgentsTab({ tenantId, isOwner }: { tenantId: string | null; isOwner: boolean }) {
  const { data: agents, isLoading } = useAgents(tenantId)
  const { data: starAgents } = useStarAgents(tenantId)
  const { data: skills } = useSkills()
  const [expanded, setExpanded] = useState<string | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [editingAgent, setEditingAgent] = useState<ZiroAgent | null>(null)

  const starAgentIds = new Set((starAgents ?? []).map(sa => sa.agent_id))

  const activeAgents = (agents ?? []).filter(a => a.status === 'active')
  const idleAgents = (agents ?? []).filter(a => a.status === 'idle')
  const tempAgents = (agents ?? []).filter(a => a.lifecycle_type === 'temporary' && a.status !== 'retired')
  const retiredAgents = (agents ?? []).filter(a => a.status === 'retired')

  if (isLoading) return <MusicLoader />

  return (
    <div>
      {/* Metrics */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 24 }}>
        <MetricCard label="Active" value={activeAgents.length} color="#22C55E" />
        <MetricCard label="Paused" value={idleAgents.length} color="#FFB800" />
        <MetricCard label="Temporary" value={tempAgents.length} color="#FF5500" />
        <MetricCard label="Retired" value={retiredAgents.length} color="#EF4444" />
      </div>

      {/* Create button */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
        <button
          onClick={() => setShowCreate(true)}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '8px 16px', borderRadius: 8, fontSize: 12, fontWeight: 700,
            background: 'rgba(212,34,106,0.12)', color: '#D4226A',
            border: '1px solid rgba(212,34,106,0.25)', cursor: 'pointer',
          }}
        >
          <Plus size={14} /> Create Agent
        </button>
      </div>

      {/* Agent cards */}
      {(agents ?? []).length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#606088' }}>
          <Bot size={32} style={{ marginBottom: 12, opacity: 0.4 }} />
          <div style={{ fontSize: 14, fontWeight: 700 }}>No agents created yet</div>
          <div style={{ fontSize: 12, marginTop: 4 }}>Agents are narrow specialists. Skills are the default reusable layer.</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {(agents ?? []).map(agent => (
            <AgentCard
              key={agent.id}
              agent={agent}
              tenantId={tenantId}
              isStarAttached={starAgentIds.has(agent.id)}
              isExpanded={expanded === agent.id}
              onToggle={() => setExpanded(expanded === agent.id ? null : agent.id)}
              onEdit={() => setEditingAgent(agent)}
              skills={skills ?? []}
            />
          ))}
        </div>
      )}

      {showCreate && (
        <AgentFormModal tenantId={tenantId} onClose={() => setShowCreate(false)} />
      )}
      {editingAgent && (
        <AgentFormModal tenantId={tenantId} agent={editingAgent} onClose={() => setEditingAgent(null)} />
      )}
    </div>
  )
}

function AgentCard({ agent, tenantId, isStarAttached, isExpanded, onToggle, onEdit, skills }: {
  agent: ZiroAgent
  tenantId: string | null
  isStarAttached: boolean
  isExpanded: boolean
  onToggle: () => void
  onEdit: () => void
  skills: ZiroSkill[]
}) {
  const { data: agentSkills } = useAgentSkills(isExpanded ? agent.id : null)
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

  const statusColor = STATUS_COLORS[agent.status] ?? '#8080A8'
  const attachedSkillIds = new Set((agentSkills ?? []).map(s => s.skill_id))
  const availableSkills = skills.filter(s => !attachedSkillIds.has(s.id) && s.is_active)

  return (
    <div style={{
      borderRadius: 12,
      background: 'rgba(255,255,255,0.02)',
      border: '1px solid rgba(255,255,255,0.08)',
      borderLeft: `3px solid ${statusColor}`,
      opacity: agent.status === 'retired' ? 0.6 : 1,
    }}>
      {/* Header */}
      <div
        onClick={onToggle}
        style={{ padding: '14px 18px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12 }}
      >
        <Bot size={16} style={{ color: statusColor, flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: '#E0E0F4' }}>{agent.name}</span>
            <span style={pillStyle(statusColor)}>{agent.status.toUpperCase()}</span>
            <span style={pillStyle(agent.lifecycle_type === 'temporary' ? '#FF5500' : '#3b82f6')}>
              {agent.lifecycle_type === 'temporary' ? 'TEMP' : 'PERSISTENT'}
            </span>
            <span style={pillStyle(agent.owner_type === 'user' ? '#D4226A' : '#8080A8')}>
              {agent.owner_type === 'user' ? 'USER' : 'SYSTEM'}
            </span>
            {isStarAttached && (
              <span style={{ ...pillStyle('#FFB800'), display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                <Star size={8} /> STAR
              </span>
            )}
            <span style={pillStyle(agent.auto_use_by_star ? '#22C55E' : '#8080A8')}>
              {agent.auto_use_by_star ? 'AUTO' : 'EXPLICIT'}
            </span>
          </div>
          {agent.role && (
            <div style={{ fontSize: 11, color: '#A0A0C8', marginTop: 2, fontStyle: 'italic' }}>{agent.role}</div>
          )}
          {agent.purpose && (
            <div style={{ fontSize: 12, color: '#8080A8', marginTop: 2 }}>{agent.purpose}</div>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: '#606088' }}>
          {agent.last_used_at && (
            <span>Last used {new Date(agent.last_used_at).toLocaleDateString()}</span>
          )}
          {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </div>
      </div>

      {/* Expanded detail */}
      {isExpanded && (
        <div style={{ padding: '0 18px 16px', borderTop: '1px solid rgba(255,255,255,0.04)' }}>
          {/* Agent profile */}
          {(agent.instructions || agent.profile_summary || (agent.usage_triggers && agent.usage_triggers.length > 0)) && (
            <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={sectionLabelStyle}>Agent Profile</div>
              {agent.profile_summary && (
                <div style={{ fontSize: 12, color: '#A0A0C8', padding: '8px 10px', borderRadius: 8, background: 'rgba(255,255,255,0.02)', borderLeft: '2px solid rgba(212,34,106,0.3)' }}>
                  {agent.profile_summary}
                </div>
              )}
              {agent.instructions && (
                <div>
                  <div style={{ fontSize: 10, fontWeight: 700, color: '#606088', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Instructions</div>
                  <pre style={{ fontSize: 11, color: '#A0A0C8', padding: '8px 10px', borderRadius: 8, background: 'rgba(255,255,255,0.02)', overflow: 'auto', maxHeight: 120, whiteSpace: 'pre-wrap', margin: 0 }}>
                    {agent.instructions}
                  </pre>
                </div>
              )}
              {agent.usage_triggers && agent.usage_triggers.length > 0 && (
                <div>
                  <div style={{ fontSize: 10, fontWeight: 700, color: '#606088', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Usage Triggers</div>
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                    {agent.usage_triggers.map((t, i) => (
                      <span key={i} style={pillStyle('#8080A8')}>{t}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Attached skills */}
          <div style={{ marginTop: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#8080A8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
              Attached Skills
            </div>
            {(agentSkills ?? []).length === 0 ? (
              <div style={{ fontSize: 12, color: '#606088', fontStyle: 'italic' }}>No skills attached.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {(agentSkills ?? []).map(as => (
                  <div key={as.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', borderRadius: 8, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
                    <Zap size={12} style={{ color: '#FFB800' }} />
                    <span style={{ flex: 1, fontSize: 12, color: '#E0E0F4', fontWeight: 600 }}>{as.skill_name}</span>
                    {as.is_primary && <span style={pillStyle('#22C55E')}>PRIMARY</span>}
                    <button
                      onClick={() => detachSkill.mutate({ agentId: agent.id, skillId: as.skill_id }, { onSuccess: () => toast('Skill detached', 'success'), onError: (e: any) => toast(e.message, 'error') })}
                      style={{ background: 'none', border: 'none', color: '#EF4444', cursor: 'pointer', padding: 2 }}
                    >
                      <Unlink size={12} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Attach skill */}
            {showSkillPicker ? (
              <div style={{ marginTop: 8 }}>
                <select
                  autoFocus
                  onChange={(e) => {
                    if (!e.target.value || !tenantId) return
                    attachSkill.mutate(
                      { tenantId, agentId: agent.id, skillId: e.target.value },
                      { onSuccess: () => { toast('Skill attached', 'success'); setShowSkillPicker(false) }, onError: (err: any) => toast(err.message, 'error') },
                    )
                  }}
                  onBlur={() => setShowSkillPicker(false)}
                  style={{ width: '100%', padding: '6px 10px', fontSize: 12, borderRadius: 8, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#E0E0F4' }}
                >
                  <option value="">Select a skill...</option>
                  {availableSkills.map(s => <option key={s.id} value={s.id}>{s.name} ({s.key})</option>)}
                </select>
              </div>
            ) : (
              <button
                onClick={() => setShowSkillPicker(true)}
                style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', color: '#8080A8', cursor: 'pointer' }}
              >
                <Link2 size={10} /> Attach Skill
              </button>
            )}
          </div>

          {/* Invocation rules */}
          {Object.keys(agent.invocation_rules).length > 0 && (
            <div style={{ marginTop: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#8080A8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
                Invocation Rules
              </div>
              <pre style={{ fontSize: 11, color: '#A0A0C8', padding: '8px 10px', borderRadius: 8, background: 'rgba(255,255,255,0.02)', overflow: 'auto', maxHeight: 120 }}>
                {JSON.stringify(agent.invocation_rules, null, 2)}
              </pre>
            </div>
          )}

          {/* Actions */}
          <div style={{ display: 'flex', gap: 6, marginTop: 16, flexWrap: 'wrap' }}>
            {/* Edit / Clone */}
            <ActionBtn icon={<Pencil size={11} />} label="Edit" color="#D4226A" onClick={onEdit} />
            <ActionBtn icon={<Copy size={11} />} label="Clone" color="#3b82f6"
              onClick={() => cloneAgent.mutate(agent.id, { onSuccess: () => toast('Agent cloned', 'success'), onError: (e: any) => toast(e.message, 'error') })} />

            {/* Star attach/detach */}
            {isStarAttached ? (
              <ActionBtn icon={<Unlink size={11} />} label="Detach from Star" color="#FF5500"
                onClick={() => detachFromStar.mutate(agent.id, { onSuccess: () => toast('Detached from Star', 'success') })} />
            ) : agent.status === 'active' ? (
              <ActionBtn icon={<Star size={11} />} label="Attach to Star" color="#FFB800"
                onClick={() => attachToStar.mutate(agent.id, { onSuccess: () => toast('Attached to Star', 'success') })} />
            ) : null}

            {/* Status transitions */}
            {agent.status === 'active' && (
              <ActionBtn icon={<Power size={11} />} label="Pause" color="#FFB800"
                onClick={() => idleAgent.mutate(agent.id, { onSuccess: () => toast('Agent paused', 'success') })} />
            )}
            {agent.status === 'idle' && (
              <ActionBtn icon={<Power size={11} />} label="Activate" color="#22C55E"
                onClick={() => activateAgent.mutate(agent.id, { onSuccess: () => toast('Agent activated', 'success') })} />
            )}
            {agent.status !== 'retired' && (
              <ActionBtn icon={<Power size={11} />} label="Retire" color="#EF4444"
                onClick={() => retireAgent.mutate(agent.id, { onSuccess: () => toast('Agent retired', 'success') })} />
            )}
            {agent.status === 'retired' && (
              <ActionBtn icon={<RefreshCw size={11} />} label="Reactivate" color="#22C55E"
                onClick={() => activateAgent.mutate(agent.id, { onSuccess: () => toast('Agent reactivated', 'success') })} />
            )}

            {/* Convert temp → persistent */}
            {agent.lifecycle_type === 'temporary' && agent.status !== 'retired' && (
              <ActionBtn icon={<ArrowUpRight size={11} />} label="Make Persistent" color="#3b82f6"
                onClick={() => convertTemp.mutate(agent.id, { onSuccess: () => toast('Converted to persistent', 'success') })} />
            )}

            {/* Delete */}
            <ActionBtn icon={<Trash2 size={11} />} label="Delete" color="#EF4444"
              onClick={() => { if (confirm(`Delete agent "${agent.name}"?`)) deleteAgent.mutate(agent.id, { onSuccess: () => toast('Agent deleted', 'success') }) }} />
          </div>
        </div>
      )}
    </div>
  )
}

function ActionBtn({ icon, label, color, onClick }: { icon: React.ReactNode; label: string; color: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 4,
        padding: '5px 12px', borderRadius: 6, fontSize: 11, fontWeight: 600,
        background: `${color}12`, border: `1px solid ${color}30`, color,
        cursor: 'pointer',
      }}
    >
      {icon} {label}
    </button>
  )
}

// ═══════════════════════════════════════════════════════
// AGENT FORM MODAL (CREATE / EDIT)
// ═══════════════════════════════════════════════════════

function AgentFormModal({ tenantId, agent, onClose }: { tenantId: string | null; agent?: ZiroAgent; onClose: () => void }) {
  const isEdit = !!agent
  const { user } = useAuthContext()
  const createAgent = useCreateAgent(tenantId)
  const updateAgent = useUpdateAgent()

  const [name, setName] = useState(agent?.name ?? '')
  const [purpose, setPurpose] = useState(agent?.purpose ?? '')
  const [role, setRole] = useState(agent?.role ?? '')
  const [instructions, setInstructions] = useState(agent?.instructions ?? '')
  const [profileSummary, setProfileSummary] = useState(agent?.profile_summary ?? '')
  const [lifecycle, setLifecycle] = useState<'temporary' | 'persistent'>(agent?.lifecycle_type ?? 'persistent')
  const [autoUse, setAutoUse] = useState(agent?.auto_use_by_star ?? true)
  const [keywords, setKeywords] = useState(
    (agent?.invocation_rules as any)?.keywords?.join(', ') ?? ''
  )
  const [usageTriggers, setUsageTriggers] = useState(
    (agent?.usage_triggers ?? []).join(', ')
  )

  const isPending = createAgent.isPending || updateAgent.isPending

  const handleSubmit = () => {
    if (!name.trim() || !purpose.trim()) {
      toast('Name and purpose are required', 'error')
      return
    }
    const vague = ['builder', 'helper', 'assistant', 'worker', 'bot']
    if (vague.some(v => name.toLowerCase().includes(v))) {
      toast('Agent name is too vague — use a specific specialist name', 'error')
      return
    }

    const invocationRules = keywords.trim()
      ? { keywords: keywords.split(',').map(k => k.trim()).filter(Boolean) }
      : {}
    const triggers = usageTriggers.trim()
      ? usageTriggers.split(',').map(t => t.trim()).filter(Boolean)
      : []

    if (isEdit) {
      updateAgent.mutate({
        id: agent!.id,
        name: name.trim(),
        purpose: purpose.trim(),
        role: role.trim() || null,
        instructions: instructions.trim() || null,
        profile_summary: profileSummary.trim() || null,
        lifecycle_type: lifecycle,
        auto_use_by_star: autoUse,
        invocation_rules: invocationRules,
        usage_triggers: triggers,
      }, {
        onSuccess: () => { toast('Agent updated', 'success'); onClose() },
        onError: (err: any) => toast(err.message, 'error'),
      })
    } else {
      createAgent.mutate({
        name: name.trim(),
        purpose: purpose.trim(),
        role: role.trim() || undefined,
        instructions: instructions.trim() || undefined,
        profile_summary: profileSummary.trim() || undefined,
        lifecycle_type: lifecycle,
        auto_use_by_star: autoUse,
        owner_type: 'user',
        invocation_rules: invocationRules,
        usage_triggers: triggers,
        created_by: user?.id ?? null,
      }, {
        onSuccess: () => { toast('Agent created', 'success'); onClose() },
        onError: (err: any) => toast(err.message, 'error'),
      })
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(2,2,9,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }} onClick={onClose}>
      <div style={{ width: '100%', maxWidth: 580, maxHeight: '90vh', overflow: 'auto', background: '#0d0d1a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 16, padding: 24 }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 20 }}>
          <h3 style={{ fontSize: 16, fontWeight: 800, color: '#E0E0F4', display: 'flex', alignItems: 'center', gap: 8 }}>
            <Bot size={18} style={{ color: '#D4226A' }} /> {isEdit ? 'Edit Agent' : 'Create Agent'}
          </h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#606088', cursor: 'pointer' }}><X size={18} /></button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Identity */}
          <div>
            <label style={labelStyle}>Agent Name</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Billing Analyst, Lead Qualifier" style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Role <span style={{ fontWeight: 400, color: '#606088' }}>(optional)</span></label>
            <input value={role} onChange={e => setRole(e.target.value)} placeholder="e.g. Financial Specialist, Scheduling Assistant" style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Purpose</label>
            <textarea value={purpose} onChange={e => setPurpose(e.target.value)} placeholder="What does this agent specialize in?" style={{ ...inputStyle, minHeight: 60, resize: 'vertical' }} />
          </div>
          <div>
            <label style={labelStyle}>Profile Summary <span style={{ fontWeight: 400, color: '#606088' }}>(optional, shown in agent card)</span></label>
            <textarea value={profileSummary} onChange={e => setProfileSummary(e.target.value)} placeholder="Brief summary of this agent's identity and approach" style={{ ...inputStyle, minHeight: 48, resize: 'vertical' }} />
          </div>

          {/* Behavior */}
          <div>
            <label style={labelStyle}>Instructions <span style={{ fontWeight: 400, color: '#606088' }}>(injected into agent's context)</span></label>
            <textarea value={instructions} onChange={e => setInstructions(e.target.value)} placeholder="Custom instructions that guide this agent's behavior..." style={{ ...inputStyle, minHeight: 80, resize: 'vertical' }} />
          </div>

          {/* Configuration */}
          <div>
            <label style={labelStyle}>Lifecycle</label>
            <div style={{ display: 'flex', gap: 8 }}>
              {(['persistent', 'temporary'] as const).map(l => (
                <button key={l} onClick={() => setLifecycle(l)} style={{
                  flex: 1, padding: '8px 12px', borderRadius: 8, fontSize: 12, fontWeight: 700,
                  background: lifecycle === l ? 'rgba(212,34,106,0.15)' : 'rgba(255,255,255,0.03)',
                  color: lifecycle === l ? '#D4226A' : '#8080A8',
                  border: lifecycle === l ? '1px solid rgba(212,34,106,0.3)' : '1px solid rgba(255,255,255,0.06)',
                  cursor: 'pointer', textTransform: 'capitalize',
                }}>
                  {l}
                </button>
              ))}
            </div>
          </div>

          {/* Delegation mode */}
          <div>
            <label style={labelStyle}>Star Delegation Mode</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setAutoUse(true)} style={{
                flex: 1, padding: '8px 12px', borderRadius: 8, fontSize: 12, fontWeight: 700,
                background: autoUse ? 'rgba(34,197,94,0.12)' : 'rgba(255,255,255,0.03)',
                color: autoUse ? '#22C55E' : '#8080A8',
                border: autoUse ? '1px solid rgba(34,197,94,0.3)' : '1px solid rgba(255,255,255,0.06)',
                cursor: 'pointer',
              }}>
                Auto — Star delegates automatically
              </button>
              <button onClick={() => setAutoUse(false)} style={{
                flex: 1, padding: '8px 12px', borderRadius: 8, fontSize: 12, fontWeight: 700,
                background: !autoUse ? 'rgba(128,128,168,0.12)' : 'rgba(255,255,255,0.03)',
                color: !autoUse ? '#A0A0C8' : '#8080A8',
                border: !autoUse ? '1px solid rgba(128,128,168,0.3)' : '1px solid rgba(255,255,255,0.06)',
                cursor: 'pointer',
              }}>
                Explicit — User must invoke
              </button>
            </div>
          </div>

          <div>
            <label style={labelStyle}>Invocation Keywords <span style={{ fontWeight: 400, color: '#606088' }}>(comma-separated)</span></label>
            <input value={keywords} onChange={e => setKeywords(e.target.value)} placeholder="e.g. billing, invoice, payment" style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Usage Triggers <span style={{ fontWeight: 400, color: '#606088' }}>(comma-separated, when Star should consider this agent)</span></label>
            <input value={usageTriggers} onChange={e => setUsageTriggers(e.target.value)} placeholder="e.g. student asks about billing, invoice question" style={inputStyle} />
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 }}>
          <button onClick={onClose} style={{ padding: '8px 16px', borderRadius: 8, fontSize: 12, fontWeight: 600, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', color: '#8080A8', cursor: 'pointer' }}>Cancel</button>
          <button onClick={handleSubmit} disabled={isPending} style={{ padding: '8px 16px', borderRadius: 8, fontSize: 12, fontWeight: 700, background: 'rgba(212,34,106,0.15)', border: '1px solid rgba(212,34,106,0.3)', color: '#D4226A', cursor: 'pointer' }}>
            {isPending ? (isEdit ? 'Saving...' : 'Creating...') : (isEdit ? 'Save Agent' : 'Create Agent')}
          </button>
        </div>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════
// TASK HISTORY TAB
// ═══════════════════════════════════════════════════════

function TaskHistoryTab({ tenantId }: { tenantId: string | null }) {
  const [routeFilter, setRouteFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [page, setPage] = useState(0)

  const { data, isLoading } = useTaskHistory(tenantId, {
    route: routeFilter || undefined,
    status: statusFilter || undefined,
    page,
  })

  if (isLoading) return <MusicLoader />

  const rows = data?.rows ?? []
  const total = data?.total ?? 0
  const pageSize = data?.pageSize ?? 30
  const totalPages = Math.ceil(total / pageSize)

  return (
    <div>
      {/* Filters */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        <select value={routeFilter} onChange={e => { setRouteFilter(e.target.value); setPage(0) }} style={filterSelectStyle}>
          <option value="">All Routes</option>
          <option value="direct">Direct</option>
          <option value="skill">Skill</option>
          <option value="agent">Agent</option>
          <option value="temp_agent">Temp Agent</option>
        </select>
        <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(0) }} style={filterSelectStyle}>
          <option value="">All Statuses</option>
          <option value="completed">Completed</option>
          <option value="running">Running</option>
          <option value="failed">Failed</option>
          <option value="pending">Pending</option>
        </select>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 11, color: '#606088', alignSelf: 'center' }}>{total} task run{total !== 1 ? 's' : ''}</span>
      </div>

      {rows.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#606088' }}>
          <History size={32} style={{ marginBottom: 12, opacity: 0.4 }} />
          <div style={{ fontSize: 14, fontWeight: 700 }}>No task runs yet</div>
          <div style={{ fontSize: 12, marginTop: 4 }}>Task history appears when Star routes actionable work.</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {rows.map(row => (
            <TaskRunRow key={row.id} row={row} />
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 16 }}>
          <button disabled={page === 0} onClick={() => setPage(p => p - 1)} style={pageBtnStyle}>Prev</button>
          <span style={{ fontSize: 12, color: '#8080A8', alignSelf: 'center' }}>Page {page + 1} of {totalPages}</span>
          <button disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)} style={pageBtnStyle}>Next</button>
        </div>
      )}
    </div>
  )
}

function TaskRunRow({ row }: { row: TaskHistoryRow }) {
  const [expanded, setExpanded] = useState(false)
  const routeColor = ROUTE_COLORS[row.route_chosen ?? 'direct'] ?? '#8080A8'
  const statusColor = row.status === 'completed' ? '#22C55E' : row.status === 'failed' ? '#EF4444' : row.status === 'running' ? '#3b82f6' : '#8080A8'

  return (
    <div style={{ borderRadius: 10, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', overflow: 'hidden' }}>
      <div
        onClick={() => setExpanded(!expanded)}
        style={{ padding: '10px 14px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10 }}
      >
        <Clock size={12} style={{ color: '#606088', flexShrink: 0 }} />
        <span style={{ fontSize: 11, color: '#606088', flexShrink: 0, width: 90 }}>
          {new Date(row.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
          {' '}
          {new Date(row.created_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
        </span>
        <span style={{ flex: 1, fontSize: 12, color: '#E0E0F4', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {row.intent_summary ?? row.classification}
        </span>
        <span style={pillStyle(routeColor)}>{ROUTE_LABELS[row.route_chosen ?? 'direct'] ?? 'Direct'}</span>
        {row.skill_name && <span style={{ fontSize: 10, color: '#8080A8' }}>{row.skill_name}</span>}
        {row.agent_name && <span style={{ fontSize: 10, color: '#8080A8' }}>{row.agent_name}</span>}
        <span style={pillStyle(statusColor)}>{row.status.toUpperCase()}</span>
        {expanded ? <ChevronUp size={12} style={{ color: '#606088' }} /> : <ChevronDown size={12} style={{ color: '#606088' }} />}
      </div>

      {expanded && (
        <div style={{ padding: '0 14px 12px', borderTop: '1px solid rgba(255,255,255,0.04)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 10 }}>
            <DetailBlock label="Route" value={row.route_chosen ?? 'direct'} />
            <DetailBlock label="Classification" value={row.classification} />
            {row.routing_explanation && <DetailBlock label="Routing Explanation" value={row.routing_explanation} span2 />}
            {row.result_summary && <DetailBlock label="Result" value={row.result_summary} span2 />}
            {row.error_text && <DetailBlock label="Error" value={row.error_text} span2 />}
            {row.created_temp_agent && <DetailBlock label="Temp Agent" value={row.retained_after_task ? 'Created & retained' : 'Created & retired'} />}
          </div>
        </div>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════
// ROUTE ANALYTICS TAB
// ═══════════════════════════════════════════════════════

function RouteAnalyticsTab({ tenantId }: { tenantId: string | null }) {
  const { data, isLoading } = useRouteAnalytics(tenantId)

  if (isLoading) return <MusicLoader />
  if (!data || data.totalRuns === 0) {
    return (
      <div style={{ textAlign: 'center', padding: 40, color: '#606088' }}>
        <BarChart3 size={32} style={{ marginBottom: 12, opacity: 0.4 }} />
        <div style={{ fontSize: 14, fontWeight: 700 }}>No routing data yet</div>
        <div style={{ fontSize: 12, marginTop: 4 }}>Analytics appear after Star routes actionable tasks.</div>
      </div>
    )
  }

  const { distribution, topSkills, topAgents, tempAgentStats, failedCount, totalRuns } = data
  const pct = (n: number) => totalRuns > 0 ? `${Math.round((n / totalRuns) * 100)}%` : '0%'

  return (
    <div>
      {/* Route distribution */}
      <div style={{ fontSize: 11, fontWeight: 700, color: '#8080A8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>
        Route Distribution <span style={{ fontWeight: 400, color: '#606088' }}>(last 90 days, {totalRuns} runs)</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 28 }}>
        <RouteMetricCard label="Handled by Star" value={distribution.direct} pct={pct(distribution.direct)} color="#8080A8" />
        <RouteMetricCard label="Used Skill" value={distribution.skill} pct={pct(distribution.skill)} color="#22C55E" />
        <RouteMetricCard label="Used Agent" value={distribution.agent} pct={pct(distribution.agent)} color="#3b82f6" />
        <RouteMetricCard label="Temp Agent" value={distribution.temp_agent} pct={pct(distribution.temp_agent)} color="#FF5500" />
      </div>

      {/* Route distribution bar */}
      <div style={{ display: 'flex', height: 8, borderRadius: 4, overflow: 'hidden', marginBottom: 28, background: 'rgba(255,255,255,0.04)' }}>
        {distribution.direct > 0 && <div style={{ flex: distribution.direct, background: '#8080A8' }} />}
        {distribution.skill > 0 && <div style={{ flex: distribution.skill, background: '#22C55E' }} />}
        {distribution.agent > 0 && <div style={{ flex: distribution.agent, background: '#3b82f6' }} />}
        {distribution.temp_agent > 0 && <div style={{ flex: distribution.temp_agent, background: '#FF5500' }} />}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, marginBottom: 28 }}>
        {/* Top skills */}
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#8080A8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>
            Most Used Skills
          </div>
          {topSkills.length === 0 ? (
            <div style={{ fontSize: 12, color: '#606088', fontStyle: 'italic' }}>No skill usage recorded.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {topSkills.map(s => (
                <div key={s.skill_key} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 8, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
                  <Zap size={12} style={{ color: '#22C55E', flexShrink: 0 }} />
                  <span style={{ flex: 1, fontSize: 12, color: '#E0E0F4', fontWeight: 600 }}>{s.skill_name ?? s.skill_key}</span>
                  <span style={{ fontSize: 11, color: '#8080A8', fontFamily: 'monospace' }}>{s.count}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Top agents */}
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#8080A8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>
            Most Used Agents
          </div>
          {topAgents.length === 0 ? (
            <div style={{ fontSize: 12, color: '#606088', fontStyle: 'italic' }}>No agent usage recorded.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {topAgents.map(a => (
                <div key={a.agent_id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 8, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
                  <Bot size={12} style={{ color: '#3b82f6', flexShrink: 0 }} />
                  <span style={{ flex: 1, fontSize: 12, color: '#E0E0F4', fontWeight: 600 }}>{a.agent_name ?? 'Unknown Agent'}</span>
                  <span style={{ fontSize: 11, color: '#8080A8', fontFamily: 'monospace' }}>{a.count}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Temp agent stats + failures */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
        <MetricCard label="Temp Created" value={tempAgentStats.created} color="#FF5500" />
        <MetricCard label="Temp Retained" value={tempAgentStats.retained} color="#3b82f6" />
        <MetricCard label="Temp Retired" value={tempAgentStats.retired} color="#8080A8" />
        <MetricCard label="Failed Routes" value={failedCount} color="#EF4444" />
      </div>
    </div>
  )
}

function RouteMetricCard({ label, value, pct, color }: { label: string; value: number; pct: string; color: string }) {
  return (
    <div style={{ padding: '16px 18px', borderRadius: 12, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderTop: `3px solid ${color}` }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
        <span style={{ fontSize: 24, fontWeight: 800, color: '#E0E0F4', fontFamily: 'monospace' }}>{value}</span>
        <span style={{ fontSize: 13, fontWeight: 700, color, fontFamily: 'monospace' }}>{pct}</span>
      </div>
      <div style={{ fontSize: 11, fontWeight: 600, color: '#8080A8', marginTop: 2 }}>{label}</div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════
// SHARED UI COMPONENTS
// ═══════════════════════════════════════════════════════

function MetricCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{ padding: '16px 18px', borderRadius: 12, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderTop: `3px solid ${color}` }}>
      <div style={{ fontSize: 24, fontWeight: 800, color: '#E0E0F4', fontFamily: 'monospace' }}>{value}</div>
      <div style={{ fontSize: 11, fontWeight: 600, color: '#8080A8', marginTop: 2 }}>{label}</div>
    </div>
  )
}

function DetailBlock({ label, value, span2 }: { label: string; value: string; span2?: boolean }) {
  return (
    <div style={span2 ? { gridColumn: 'span 2' } : undefined}>
      <div style={{ fontSize: 10, fontWeight: 700, color: '#606088', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: 12, color: '#A0A0C8', wordBreak: 'break-word' }}>{value}</div>
    </div>
  )
}

const labelStyle: CSSProperties = {
  display: 'block', fontSize: 11, fontWeight: 700, color: '#8080A8',
  textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6,
}

const inputStyle: CSSProperties = {
  width: '100%', padding: '8px 12px', fontSize: 13, color: '#E0E0F4',
  background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: 8, fontFamily: 'var(--font-body)',
}

const filterSelectStyle: CSSProperties = {
  padding: '6px 10px', fontSize: 11, borderRadius: 6, fontWeight: 600,
  background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
  color: '#A0A0C8', cursor: 'pointer',
}

const pageBtnStyle: CSSProperties = {
  padding: '6px 14px', borderRadius: 6, fontSize: 11, fontWeight: 600,
  background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)',
  color: '#8080A8', cursor: 'pointer',
}

const sectionLabelStyle: CSSProperties = {
  fontSize: 11, fontWeight: 700, color: '#8080A8',
  textTransform: 'uppercase', letterSpacing: '0.06em',
}
