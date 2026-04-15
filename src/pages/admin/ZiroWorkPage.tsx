import { useState, useEffect, useRef, type CSSProperties } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAuthContext } from '../../app/AuthContext'
import { usePermissions } from '../../hooks/usePermissions'
import {
  useAgents,
  useStarAgents,
  useCreateAgent,
  useUpdateAgent,
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
import { ZiroWorkAgentCard } from '../../components/ziro/ZiroWorkAgentCard'
import {
  CARD,
  pillStyle,
  sectionLabel,
  labelStyle,
  inputStyle,
  filterSelectStyle,
  pageBtnStyle,
} from '../../components/ziro/ziroWorkSharedStyles'
import SkillsManager from './SkillsManager'
import {
  Bot,
  Zap,
  History,
  Plus,
  ChevronDown,
  ChevronUp,
  Sparkles,
  X,
  Shield,
  Clock,
  BarChart3,
} from 'lucide-react'

type MainTab = 'skills' | 'agents' | 'history' | 'analytics' | 'ziro'

const ROUTE_COLORS: Record<string, string> = {
  direct: '#8080A8',
  skill: '#22C55E',
  agent: '#3b82f6',
  temp_agent: '#FF5500',
}

const ROUTE_LABELS: Record<string, string> = {
  direct: 'Handled by Ziro',
  skill: 'Used Skill',
  agent: 'Used Agent',
  temp_agent: 'Created Temporary Agent',
}

// ═══════════════════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════════════════

export default function ZiroWorkPage() {
  const { role, tenantId } = useAuthContext()
  const { isOwner } = usePermissions()
  const isAdmin = role === 'owner' || role === 'admin'
  const [searchParams] = useSearchParams()
  const [mainTab, setMainTab] = useState<MainTab>(() => {
    if (typeof window === 'undefined') return 'skills'
    const sp = new URLSearchParams(window.location.search)
    if (sp.get('agentId')) return 'agents'
    const t = sp.get('zwtab')
    if (t === 'skills' || t === 'agents' || t === 'ziro' || t === 'history' || t === 'analytics') return t
    return 'skills'
  })

  useEffect(() => {
    const t = searchParams.get('zwtab')
    if (t === 'skills' || t === 'agents' || t === 'ziro' || t === 'history' || t === 'analytics') setMainTab(t)
    else if (searchParams.get('agentId')) setMainTab('agents')
  }, [searchParams])

  if (!isAdmin) {
    return (
      <div className="page" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
        <div style={{ textAlign: 'center', color: '#8080A8' }}>
          <Shield size={36} style={{ marginBottom: 16, opacity: 0.5 }} />
          <div style={{ fontSize: 17, fontWeight: 800, lineHeight: 1.4 }}>Access Restricted</div>
          <div style={{ fontSize: 14, marginTop: 6, lineHeight: 1.5, color: '#606088' }}>ZiroWork is available to owners and admins only.</div>
        </div>
      </div>
    )
  }

  return (
    <IssueContextProvider page="Ziro Work">
      <div className="page">
        {/* Page header with wordmark */}
        <div className="page-header" style={{ marginBottom: 28 }}>
          <div>
            <h1 style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 24, fontWeight: 900, letterSpacing: '-0.02em', lineHeight: 1.2 }}>
              <div style={{
                width: 36, height: 36, borderRadius: 10,
                background: 'linear-gradient(135deg, rgba(34,197,94,0.15), rgba(34,197,94,0.05))',
                border: '1px solid rgba(34,197,94,0.2)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <Zap size={18} style={{ color: '#22C55E' }} />
              </div>
              <span style={{ color: '#E0E0F4' }}>ZIRO</span>
              <span style={{ color: '#22C55E' }}>WORK</span>
            </h1>
            <p style={{ fontSize: 14, color: '#8080A8', marginTop: 6, lineHeight: 1.5 }}>
              Skills, agents, and task routing — Ziro orchestration for Ziro Work.
            </p>
          </div>
          <ReportIssueButton />
        </div>

        {/* Main tabs */}
        <div style={{ display: 'flex', gap: 2, marginBottom: 28, borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: 0 }}>
          {([
            { key: 'skills', label: 'Skills', icon: <Zap size={15} /> },
            { key: 'agents', label: 'Agents', icon: <Bot size={15} /> },
            { key: 'ziro', label: 'Ziro Control', icon: <Sparkles size={15} /> },
            { key: 'history', label: 'Task History', icon: <History size={15} /> },
            { key: 'analytics', label: 'Route Analytics', icon: <BarChart3 size={15} /> },
          ] as const).map(t => (
            <button
              key={t.key}
              onClick={() => setMainTab(t.key)}
              style={{
                display: 'flex', alignItems: 'center', gap: 7,
                padding: '10px 20px', fontSize: 13, fontWeight: 700,
                background: 'transparent',
                color: mainTab === t.key ? '#22C55E' : '#8080A8',
                border: 'none',
                borderBottom: mainTab === t.key ? '2px solid #22C55E' : '2px solid transparent',
                cursor: 'pointer',
                marginBottom: -1,
                transition: 'color 0.15s, border-color 0.15s',
              }}
            >
              {t.icon} {t.label}
            </button>
          ))}
        </div>

        {mainTab === 'skills' && <SkillsManager embedded />}
        {mainTab === 'agents' && <AgentsTab tenantId={tenantId} isOwner={isOwner} />}
        {mainTab === 'ziro' && <ZiroOrchestratorConfigTab tenantId={tenantId} />}
        {mainTab === 'history' && <TaskHistoryTab tenantId={tenantId} />}
        {mainTab === 'analytics' && <RouteAnalyticsTab tenantId={tenantId} />}
      </div>
    </IssueContextProvider>
  )
}

// ═══════════════════════════════════════════════════════
// ZIRO ORCHESTRATOR (control center) TAB
// ═══════════════════════════════════════════════════════

function ZiroOrchestratorConfigTab({ tenantId }: { tenantId: string | null }) {
  const { data: config, isLoading } = useStarConfig(tenantId)
  const upsert = useUpsertStarConfig(tenantId)
  const [instructions, setInstructions] = useState('')
  const [dirty, setDirty] = useState(false)
  const [initialized, setInitialized] = useState(false)

  if (config && !initialized) {
    setInstructions(config.instructions ?? '')
    setInitialized(true)
  }

  const handleSave = () => {
    upsert.mutate({ instructions: instructions.trim() || null }, {
      onSuccess: () => { toast('Ziro configuration saved', 'success'); setDirty(false) },
      onError: (e: any) => toast(e.message, 'error'),
    })
  }

  if (isLoading) return <MusicLoader />

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 28 }}>
        <div style={{
          width: 40, height: 40, borderRadius: 12,
          background: 'linear-gradient(135deg, rgba(255,184,0,0.15), rgba(255,184,0,0.05))',
          border: '1px solid rgba(255,184,0,0.2)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>
          <Sparkles size={20} style={{ color: '#FFB800' }} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 18, fontWeight: 800, color: '#E0E0F4', lineHeight: 1.3 }}>Ziro Control Center</div>
          <div style={{ fontSize: 14, color: '#8080A8', marginTop: 4, lineHeight: 1.5 }}>
            Global instructions and persona for Ziro — the central orchestrator inside Ziro Work.
          </div>
        </div>
        {dirty && (
          <button onClick={handleSave} disabled={upsert.isPending} style={{
            display: 'flex', alignItems: 'center', gap: 7,
            padding: '10px 20px', borderRadius: 10, fontSize: 13, fontWeight: 700,
            background: 'rgba(34,197,94,0.12)', color: '#22C55E',
            border: '1px solid rgba(34,197,94,0.25)', cursor: 'pointer',
          }}>
            {upsert.isPending ? 'Saving...' : 'Save Changes'}
          </button>
        )}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div style={{ ...CARD, padding: '20px 24px' }}>
          <label style={labelStyle}>Global Instructions</label>
          <textarea
            value={instructions}
            onChange={e => { setInstructions(e.target.value); setDirty(true) }}
            placeholder="Custom instructions appended to Ziro's system prompt. Guide Ziro's personality, priorities, and boundaries..."
            style={{ ...inputStyle, minHeight: 180, resize: 'vertical' }}
          />
          <div style={{ fontSize: 13, color: '#606088', marginTop: 8, lineHeight: 1.5 }}>
            These instructions are injected into Ziro's context on every interaction.
          </div>
        </div>

        {config && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div style={{ ...CARD, padding: '18px 22px' }}>
              <div style={{ ...sectionLabel, marginBottom: 10 }}>Routing Rules</div>
              <pre style={{ fontSize: 13, color: '#A0A0C8', margin: 0, overflow: 'auto', maxHeight: 120, lineHeight: 1.6 }}>
                {Object.keys(config.routing_rules).length > 0 ? JSON.stringify(config.routing_rules, null, 2) : 'Default (direct > skill > agent > temp_agent)'}
              </pre>
            </div>
            <div style={{ ...CARD, padding: '18px 22px' }}>
              <div style={{ ...sectionLabel, marginBottom: 10 }}>Default Skills</div>
              <div style={{ fontSize: 14, color: '#A0A0C8', lineHeight: 1.5 }}>
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
  const [searchParams, setSearchParams] = useSearchParams()
  const { data: agents, isLoading } = useAgents(tenantId)
  const { data: orchestratorAgents } = useStarAgents(tenantId)
  const { data: skills } = useSkills()
  const [expanded, setExpanded] = useState<string | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [editingAgent, setEditingAgent] = useState<ZiroAgent | null>(null)
  const deepLinkHandledRef = useRef<string | null>(null)

  const orchestratorAgentIds = new Set((orchestratorAgents ?? []).map(sa => sa.agent_id))

  const activeAgents = (agents ?? []).filter(a => a.status === 'active')
  const idleAgents = (agents ?? []).filter(a => a.status === 'idle')
  const tempAgents = (agents ?? []).filter(a => a.lifecycle_type === 'temporary' && a.status !== 'retired')
  const retiredAgents = (agents ?? []).filter(a => a.status === 'retired')

  useEffect(() => {
    if (isLoading) return
    const id = searchParams.get('agentId')
    if (!id) {
      deepLinkHandledRef.current = null
      return
    }
    const list = agents ?? []
    if (!list.some(a => a.id === id)) return
    if (deepLinkHandledRef.current === id) return
    deepLinkHandledRef.current = id
    setExpanded(id)
    const scrollT = window.setTimeout(() => {
      document.getElementById(`ziro-agent-card-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }, 100)
    setSearchParams(
      prev => {
        const next = new URLSearchParams(prev)
        next.delete('agentId')
        return next
      },
      { replace: true },
    )
    return () => window.clearTimeout(scrollT)
  }, [isLoading, agents, searchParams, setSearchParams])

  if (isLoading) return <MusicLoader />

  return (
    <div>
      {/* Metrics */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 28 }}>
        <MetricCard label="Active" value={activeAgents.length} color="#22C55E" />
        <MetricCard label="Paused" value={idleAgents.length} color="#FFB800" />
        <MetricCard label="Temporary" value={tempAgents.length} color="#FF5500" />
        <MetricCard label="Retired" value={retiredAgents.length} color="#EF4444" />
      </div>

      {/* Create button */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 20 }}>
        <button
          onClick={() => setShowCreate(true)}
          style={{
            display: 'flex', alignItems: 'center', gap: 7,
            padding: '10px 20px', borderRadius: 10, fontSize: 13, fontWeight: 700,
            background: 'rgba(34,197,94,0.12)', color: '#22C55E',
            border: '1px solid rgba(34,197,94,0.25)', cursor: 'pointer',
          }}
        >
          <Plus size={15} /> Create Agent
        </button>
      </div>

      {/* Agent cards */}
      {(agents ?? []).length === 0 ? (
        <div style={{ textAlign: 'center', padding: 56, color: '#606088' }}>
          <Bot size={40} style={{ marginBottom: 16, opacity: 0.3 }} />
          <div style={{ fontSize: 16, fontWeight: 700, lineHeight: 1.4 }}>No agents created yet</div>
          <div style={{ fontSize: 14, marginTop: 6, lineHeight: 1.5 }}>Agents are narrow specialists. Skills are the default reusable layer.</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {(agents ?? []).map(agent => (
            <div key={agent.id} id={`ziro-agent-card-${agent.id}`}>
              <ZiroWorkAgentCard
                agent={agent}
                tenantId={tenantId}
                isOrchestratorAttached={orchestratorAgentIds.has(agent.id)}
                isExpanded={expanded === agent.id}
                onToggle={() => setExpanded(expanded === agent.id ? null : agent.id)}
                onEdit={() => setEditingAgent(agent)}
                skills={skills ?? []}
              />
            </div>
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

  const segBtn = (active: boolean, activeColor: string): CSSProperties => ({
    flex: 1, padding: '10px 14px', borderRadius: 10, fontSize: 13, fontWeight: 700,
    background: active ? `${activeColor}14` : 'rgba(255,255,255,0.03)',
    color: active ? activeColor : '#606088',
    border: active ? `1px solid ${activeColor}40` : '1px solid rgba(255,255,255,0.06)',
    cursor: 'pointer',
    lineHeight: 1.4,
  })

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(2,2,9,0.85)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 24,
    }} onClick={onClose}>
      <div style={{
        width: '100%', maxWidth: 620, maxHeight: '90vh', overflow: 'auto',
        background: '#0c0c18', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 18, padding: 28,
        boxShadow: '0 8px 40px rgba(0,0,0,0.5)',
      }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <h3 style={{ fontSize: 20, fontWeight: 800, color: '#E0E0F4', display: 'flex', alignItems: 'center', gap: 10, lineHeight: 1.3 }}>
            <div style={{
              width: 32, height: 32, borderRadius: 9,
              background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.2)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Bot size={16} style={{ color: '#22C55E' }} />
            </div>
            {isEdit ? 'Edit Agent' : 'Create Agent'}
          </h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#606088', cursor: 'pointer', padding: 4 }}>
            <X size={20} />
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          {/* Section: Identity */}
          <div style={{ ...sectionLabel, marginBottom: -8 }}>Identity</div>
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
            <textarea value={purpose} onChange={e => setPurpose(e.target.value)} placeholder="What does this agent specialize in?" style={{ ...inputStyle, minHeight: 68, resize: 'vertical' }} />
          </div>
          <div>
            <label style={labelStyle}>Profile Summary <span style={{ fontWeight: 400, color: '#606088' }}>(shown in agent card)</span></label>
            <textarea value={profileSummary} onChange={e => setProfileSummary(e.target.value)} placeholder="Brief summary of this agent's identity and approach" style={{ ...inputStyle, minHeight: 56, resize: 'vertical' }} />
          </div>

          {/* Section: Behavior */}
          <div style={{ ...sectionLabel, marginBottom: -8, marginTop: 4 }}>Behavior</div>
          <div>
            <label style={labelStyle}>Instructions <span style={{ fontWeight: 400, color: '#606088' }}>(injected into agent's context)</span></label>
            <textarea value={instructions} onChange={e => setInstructions(e.target.value)} placeholder="Custom instructions that guide this agent's behavior..." style={{ ...inputStyle, minHeight: 90, resize: 'vertical' }} />
          </div>

          {/* Section: Configuration */}
          <div style={{ ...sectionLabel, marginBottom: -8, marginTop: 4 }}>Configuration</div>
          <div>
            <label style={labelStyle}>Lifecycle</label>
            <div style={{ display: 'flex', gap: 10 }}>
              {(['persistent', 'temporary'] as const).map(l => (
                <button key={l} onClick={() => setLifecycle(l)} style={segBtn(lifecycle === l, '#22C55E')}>
                  {l === 'persistent' ? 'Persistent' : 'Temporary'}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label style={labelStyle}>Ziro delegation mode</label>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setAutoUse(true)} style={segBtn(autoUse, '#22C55E')}>
                Auto — Ziro delegates automatically
              </button>
              <button onClick={() => setAutoUse(false)} style={segBtn(!autoUse, '#8080A8')}>
                Explicit — User must invoke
              </button>
            </div>
          </div>

          <div>
            <label style={labelStyle}>Invocation Keywords <span style={{ fontWeight: 400, color: '#606088' }}>(comma-separated)</span></label>
            <input value={keywords} onChange={e => setKeywords(e.target.value)} placeholder="e.g. billing, invoice, payment" style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Usage Triggers <span style={{ fontWeight: 400, color: '#606088' }}>(comma-separated)</span></label>
            <input value={usageTriggers} onChange={e => setUsageTriggers(e.target.value)} placeholder="e.g. student asks about billing, invoice question" style={inputStyle} />
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 24, paddingTop: 20, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          <button onClick={onClose} style={{
            padding: '10px 20px', borderRadius: 10, fontSize: 13, fontWeight: 600,
            background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#8080A8', cursor: 'pointer',
          }}>Cancel</button>
          <button onClick={handleSubmit} disabled={isPending} style={{
            padding: '10px 20px', borderRadius: 10, fontSize: 13, fontWeight: 700,
            background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.3)', color: '#22C55E', cursor: 'pointer',
          }}>
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
      <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
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
        <span style={{ fontSize: 13, color: '#606088' }}>{total} task run{total !== 1 ? 's' : ''}</span>
      </div>

      {rows.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 56, color: '#606088' }}>
          <History size={40} style={{ marginBottom: 16, opacity: 0.3 }} />
          <div style={{ fontSize: 16, fontWeight: 700, lineHeight: 1.4 }}>No task runs yet</div>
          <div style={{ fontSize: 14, marginTop: 6, lineHeight: 1.5 }}>Task history appears when Ziro routes actionable work.</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {rows.map(row => (
            <TaskRunRow key={row.id} row={row} />
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: 10, marginTop: 20 }}>
          <button disabled={page === 0} onClick={() => setPage(p => p - 1)} style={pageBtnStyle}>Prev</button>
          <span style={{ fontSize: 13, color: '#8080A8', alignSelf: 'center' }}>Page {page + 1} of {totalPages}</span>
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
    <div style={{ ...CARD, overflow: 'hidden' }}>
      <div
        onClick={() => setExpanded(!expanded)}
        style={{ padding: '12px 18px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12 }}
      >
        <Clock size={14} style={{ color: '#606088', flexShrink: 0 }} />
        <span style={{ fontSize: 13, color: '#606088', flexShrink: 0, width: 100, lineHeight: 1.4 }}>
          {new Date(row.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
          {' '}
          {new Date(row.created_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
        </span>
        <span style={{ flex: 1, fontSize: 14, color: '#E0E0F4', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', lineHeight: 1.4 }}>
          {row.intent_summary ?? row.classification}
        </span>
        <span style={pillStyle(routeColor)}>{ROUTE_LABELS[row.route_chosen ?? 'direct'] ?? 'Direct'}</span>
        {row.skill_name && <span style={{ fontSize: 12, color: '#8080A8' }}>{row.skill_name}</span>}
        {row.agent_name && <span style={{ fontSize: 12, color: '#8080A8' }}>{row.agent_name}</span>}
        <span style={pillStyle(statusColor)}>{row.status.toUpperCase()}</span>
        {expanded ? <ChevronUp size={14} style={{ color: '#606088' }} /> : <ChevronDown size={14} style={{ color: '#606088' }} />}
      </div>

      {expanded && (
        <div style={{ padding: '0 18px 16px', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginTop: 14 }}>
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
      <div style={{ textAlign: 'center', padding: 56, color: '#606088' }}>
        <BarChart3 size={40} style={{ marginBottom: 16, opacity: 0.3 }} />
        <div style={{ fontSize: 16, fontWeight: 700, lineHeight: 1.4 }}>No routing data yet</div>
        <div style={{ fontSize: 14, marginTop: 6, lineHeight: 1.5 }}>Analytics appear after Ziro routes actionable tasks.</div>
      </div>
    )
  }

  const { distribution, topSkills, topAgents, tempAgentStats, failedCount, totalRuns } = data
  const pct = (n: number) => totalRuns > 0 ? `${Math.round((n / totalRuns) * 100)}%` : '0%'

  return (
    <div>
      {/* Route distribution */}
      <div style={{ ...sectionLabel, marginBottom: 14 }}>
        Route Distribution <span style={{ fontWeight: 400, color: '#606088' }}>(last 90 days, {totalRuns} runs)</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 32 }}>
        <RouteMetricCard label="Handled by Ziro" value={distribution.direct} pct={pct(distribution.direct)} color="#8080A8" />
        <RouteMetricCard label="Used Skill" value={distribution.skill} pct={pct(distribution.skill)} color="#22C55E" />
        <RouteMetricCard label="Used Agent" value={distribution.agent} pct={pct(distribution.agent)} color="#3b82f6" />
        <RouteMetricCard label="Temp Agent" value={distribution.temp_agent} pct={pct(distribution.temp_agent)} color="#FF5500" />
      </div>

      {/* Route distribution bar */}
      <div style={{ display: 'flex', height: 10, borderRadius: 5, overflow: 'hidden', marginBottom: 32, background: 'rgba(255,255,255,0.04)' }}>
        {distribution.direct > 0 && <div style={{ flex: distribution.direct, background: '#8080A8' }} />}
        {distribution.skill > 0 && <div style={{ flex: distribution.skill, background: '#22C55E' }} />}
        {distribution.agent > 0 && <div style={{ flex: distribution.agent, background: '#3b82f6' }} />}
        {distribution.temp_agent > 0 && <div style={{ flex: distribution.temp_agent, background: '#FF5500' }} />}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 28, marginBottom: 32 }}>
        {/* Top skills */}
        <div>
          <div style={{ ...sectionLabel, marginBottom: 12 }}>Most Used Skills</div>
          {topSkills.length === 0 ? (
            <div style={{ fontSize: 14, color: '#606088', fontStyle: 'italic', lineHeight: 1.5 }}>No skill usage recorded.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {topSkills.map(s => (
                <div key={s.skill_key} style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 10,
                  background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)',
                }}>
                  <Zap size={14} style={{ color: '#22C55E', flexShrink: 0 }} />
                  <span style={{ flex: 1, fontSize: 14, color: '#E0E0F4', fontWeight: 600, lineHeight: 1.4 }}>{s.skill_name ?? s.skill_key}</span>
                  <span style={{ fontSize: 13, color: '#8080A8', fontFamily: 'monospace' }}>{s.count}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Top agents */}
        <div>
          <div style={{ ...sectionLabel, marginBottom: 12 }}>Most Used Agents</div>
          {topAgents.length === 0 ? (
            <div style={{ fontSize: 14, color: '#606088', fontStyle: 'italic', lineHeight: 1.5 }}>No agent usage recorded.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {topAgents.map(a => (
                <div key={a.agent_id} style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 10,
                  background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)',
                }}>
                  <Bot size={14} style={{ color: '#3b82f6', flexShrink: 0 }} />
                  <span style={{ flex: 1, fontSize: 14, color: '#E0E0F4', fontWeight: 600, lineHeight: 1.4 }}>{a.agent_name ?? 'Unknown Agent'}</span>
                  <span style={{ fontSize: 13, color: '#8080A8', fontFamily: 'monospace' }}>{a.count}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Temp agent stats + failures */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }}>
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
    <div style={{ ...CARD, padding: '20px 22px', borderTop: `3px solid ${color}` }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <span style={{ fontSize: 28, fontWeight: 800, color: '#E0E0F4', fontFamily: 'monospace', lineHeight: 1.1 }}>{value}</span>
        <span style={{ fontSize: 14, fontWeight: 700, color, fontFamily: 'monospace' }}>{pct}</span>
      </div>
      <div style={{ fontSize: 13, fontWeight: 600, color: '#8080A8', marginTop: 6, lineHeight: 1.3 }}>{label}</div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════
// SHARED UI COMPONENTS
// ═══════════════════════════════════════════════════════

function MetricCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{ ...CARD, padding: '20px 22px', borderTop: `3px solid ${color}` }}>
      <div style={{ fontSize: 28, fontWeight: 800, color: '#E0E0F4', fontFamily: 'monospace', lineHeight: 1.1 }}>{value}</div>
      <div style={{ fontSize: 13, fontWeight: 600, color: '#8080A8', marginTop: 6, lineHeight: 1.3 }}>{label}</div>
    </div>
  )
}

function DetailBlock({ label, value, span2 }: { label: string; value: string; span2?: boolean }) {
  return (
    <div style={span2 ? { gridColumn: 'span 2' } : undefined}>
      <div style={{ fontSize: 11, fontWeight: 700, color: '#606088', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 14, color: '#A0A0C8', wordBreak: 'break-word', lineHeight: 1.5 }}>{value}</div>
    </div>
  )
}
