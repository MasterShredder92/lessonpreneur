import { useState, type CSSProperties } from 'react'
import { useAuthContext } from '../../app/AuthContext'
import { usePermissions } from '../../hooks/usePermissions'
import {
  useSkills,
  useSkillProposals,
  useCreateSkill,
  useUpdateSkill,
  useToggleSkill,
  useDeleteSkill,
  useApproveProposal,
  useRejectProposal,
  type ZiroSkill,
  type ZiroSkillProposal,
  type SkillFormData,
} from '../../hooks/useSkills'
import { useWorkflows, type Workflow } from '../../hooks/useWorkflows'
import { toast } from '../../components/shared/Toast'
import MusicLoader from '../../components/shared/MusicLoader'
import { IssueContextProvider } from '../../contexts/IssueContext'
import ReportIssueButton from '../../components/shared/ReportIssueButton'
import {
  Sparkles,
  Plus,
  Power,
  Pencil,
  Trash2,
  CheckCircle2,
  XCircle,
  Shield,
  AlertTriangle,
  Zap,
  ChevronDown,
  ChevronUp,
  Clock,
  X,
} from 'lucide-react'

type Tab = 'active' | 'inactive' | 'proposals'

const RISK_COLORS: Record<string, string> = {
  low: '#22C55E',
  medium: '#FFB800',
  high: '#FF5500',
  critical: '#EF4444',
}

const COST_COLORS: Record<string, string> = {
  free: '#22C55E',
  low: '#3b82f6',
  medium: '#FFB800',
  high: '#EF4444',
}

const RUNTIME_OPTIONS = [
  { value: 'edge_function', label: 'Edge Function' },
  { value: 'prompt_only', label: 'Prompt Only' },
  { value: 'webhook', label: 'Webhook' },
]

const emptyForm: SkillFormData = {
  key: '',
  name: '',
  description: '',
  business_context: '',
  runtime: 'edge_function',
  allowed_tools: [],
  system_prompt_fragment: '',
  risk_tier: 'low',
  cost_tier: 'free',
}

export default function SkillsManager() {
  const { role } = useAuthContext()
  const { isOwner } = usePermissions()
  const isAdmin = role === 'owner' || role === 'admin'

  const { data: skills, isLoading } = useSkills()
  const { data: proposals } = useSkillProposals()
  const { data: workflows } = useWorkflows()

  const [tab, setTab] = useState<Tab>('active')
  const [editingSkill, setEditingSkill] = useState<ZiroSkill | null>(null)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  if (!isAdmin) {
    return (
      <div className="page" style={{ padding: 40, textAlign: 'center', color: '#8080A8' }}>
        Access restricted to owners and admins.
      </div>
    )
  }

  const activeSkills = (skills ?? []).filter(s => s.is_active)
  const inactiveSkills = (skills ?? []).filter(s => !s.is_active)
  const pendingProposals = (proposals ?? []).filter(p => p.status === 'pending')

  const displayList =
    tab === 'active' ? activeSkills : tab === 'inactive' ? inactiveSkills : []

  return (
    <IssueContextProvider page="Settings" section="Skills Manager">
      <div className="page">
        <div className="page-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Sparkles size={18} style={{ color: '#D4226A' }} />
            <h1>Skills Manager</h1>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {isOwner && (
              <button onClick={() => setShowCreateModal(true)} style={btnPrimary}>
                <Plus size={14} /> New Skill
              </button>
            )}
            <ReportIssueButton />
          </div>
        </div>

        <div style={{ fontSize: 13, color: '#8080A8', marginBottom: 20, maxWidth: 640 }}>
          Modular AI capabilities that Ziro can use. Each skill defines what Ziro can do,
          what tools it can access, and how much risk it carries. New skills require owner
          approval before activation.
        </div>

        {/* Metrics */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 24 }}>
          <MetricCard label="Active Skills" value={String(activeSkills.length)} color="#22C55E" />
          <MetricCard label="Inactive" value={String(inactiveSkills.length)} color="#8080A8" />
          <MetricCard label="Pending Proposals" value={String(pendingProposals.length)} color="#FFB800" />
          <MetricCard
            label="Total Uses"
            value={String((skills ?? []).reduce((s, sk) => s + sk.use_count, 0))}
            color="#D4226A"
          />
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 20 }}>
          {([
            ['active', `Active (${activeSkills.length})`],
            ['inactive', `Inactive (${inactiveSkills.length})`],
            ['proposals', `Proposals (${pendingProposals.length})`],
          ] as [Tab, string][]).map(([t, label]) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                padding: '8px 18px',
                borderRadius: 8,
                fontSize: 12,
                fontWeight: 700,
                fontFamily: 'inherit',
                cursor: 'pointer',
                border: 'none',
                background: tab === t ? 'rgba(212,34,106,0.15)' : 'rgba(255,255,255,0.03)',
                color: tab === t ? '#D4226A' : '#8080A8',
              }}
            >
              {label}
            </button>
          ))}
        </div>

        {isLoading ? (
          <MusicLoader />
        ) : tab === 'proposals' ? (
          <ProposalsList
            proposals={pendingProposals}
            reviewedProposals={(proposals ?? []).filter(p => p.status !== 'pending')}
          />
        ) : displayList.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#606088', fontSize: 13 }}>
            No {tab} skills.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {displayList.map(skill => (
              <SkillCard
                key={skill.id}
                skill={skill}
                expanded={expandedId === skill.id}
                onToggleExpand={() => setExpandedId(expandedId === skill.id ? null : skill.id)}
                onEdit={() => setEditingSkill(skill)}
                workflows={workflows ?? []}
                isOwner={isOwner}
              />
            ))}
          </div>
        )}

        {/* Create modal */}
        {showCreateModal && (
          <SkillFormModal
            title="Create New Skill"
            initial={emptyForm}
            onClose={() => setShowCreateModal(false)}
            mode="create"
          />
        )}

        {/* Edit modal */}
        {editingSkill && (
          <SkillFormModal
            title={`Edit: ${editingSkill.name}`}
            initial={{
              key: editingSkill.key,
              name: editingSkill.name,
              description: editingSkill.description ?? '',
              business_context: editingSkill.business_context ?? '',
              runtime: editingSkill.runtime,
              allowed_tools: editingSkill.allowed_tools,
              system_prompt_fragment: editingSkill.system_prompt_fragment ?? '',
              risk_tier: editingSkill.risk_tier,
              cost_tier: editingSkill.cost_tier,
            }}
            skillId={editingSkill.id}
            isSystem={editingSkill.is_system}
            onClose={() => setEditingSkill(null)}
            mode="edit"
          />
        )}
      </div>
    </IssueContextProvider>
  )
}

// ── Skill Card ─────────────────────────────────────────

function SkillCard({
  skill,
  expanded,
  onToggleExpand,
  onEdit,
  workflows,
  isOwner,
}: {
  skill: ZiroSkill
  expanded: boolean
  onToggleExpand: () => void
  onEdit: () => void
  workflows: Workflow[]
  isOwner: boolean
}) {
  const toggle = useToggleSkill()
  const deleteSkill = useDeleteSkill()

  const handleToggle = async () => {
    // Critical/high risk skills need owner confirmation
    if (!skill.is_active && (skill.risk_tier === 'high' || skill.risk_tier === 'critical')) {
      if (!isOwner) {
        toast('Only the owner can activate high/critical risk skills', 'error')
        return
      }
      if (!confirm(`Activate "${skill.name}"? This is a ${skill.risk_tier}-risk skill.`)) return
    }
    try {
      await toggle.mutateAsync({ id: skill.id, is_active: !skill.is_active })
      toast(`${skill.name} ${skill.is_active ? 'deactivated' : 'activated'}`, 'success')
    } catch {
      toast('Failed to toggle skill', 'error')
    }
  }

  const handleDelete = async () => {
    if (skill.is_system) {
      toast('System skills cannot be deleted', 'error')
      return
    }
    if (!confirm(`Delete "${skill.name}"? This cannot be undone.`)) return
    try {
      await deleteSkill.mutateAsync(skill.id)
      toast(`${skill.name} deleted`, 'success')
    } catch {
      toast('Failed to delete skill', 'error')
    }
  }

  const riskColor = RISK_COLORS[skill.risk_tier] ?? '#8080A8'
  const costColor = COST_COLORS[skill.cost_tier] ?? '#8080A8'
  const Chevron = expanded ? ChevronUp : ChevronDown

  return (
    <div
      style={{
        borderRadius: 12,
        background: 'rgba(255,255,255,0.02)',
        border: `1px solid ${skill.is_active ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.04)'}`,
        borderLeft: `3px solid ${skill.is_active ? '#D4226A' : '#363656'}`,
        opacity: skill.is_active ? 1 : 0.7,
      }}
    >
      {/* Header row */}
      <div
        style={{ padding: '14px 18px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12 }}
        onClick={onToggleExpand}
      >
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <span style={{ fontSize: 15, fontWeight: 700, color: '#E0E0F4' }}>{skill.name}</span>
            <span style={pillStyle(riskColor)}>{skill.risk_tier}</span>
            <span style={pillStyle(costColor)}>{skill.cost_tier}</span>
            {skill.is_system && <span style={pillStyle('#3b82f6')}>system</span>}
          </div>
          <div style={{ fontSize: 12, color: '#8080A8' }}>{skill.description}</div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 11, color: '#606088', flexShrink: 0 }}>
          {skill.use_count > 0 && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <Zap size={11} /> {skill.use_count} uses
            </span>
          )}
          {skill.last_used_at && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <Clock size={11} /> {new Date(skill.last_used_at).toLocaleDateString()}
            </span>
          )}
          <Chevron size={14} />
        </div>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div style={{ padding: '0 18px 16px', borderTop: '1px solid rgba(255,255,255,0.04)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 14 }}>
            <DetailBlock label="Key" value={skill.key} />
            <DetailBlock label="Runtime" value={skill.runtime} />
            <DetailBlock label="Business Context" value={skill.business_context ?? '—'} span={2} />
            <DetailBlock label="Allowed Tools" value={skill.allowed_tools.join(', ') || 'None'} span={2} />
            <DetailBlock label="System Prompt Fragment" value={skill.system_prompt_fragment ?? '—'} span={2} mono />
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', gap: 8, marginTop: 16, paddingTop: 12, borderTop: '1px solid rgba(255,255,255,0.04)' }}>
            <button onClick={handleToggle} style={btnSmall(skill.is_active ? '#EF4444' : '#22C55E')}>
              <Power size={12} /> {skill.is_active ? 'Deactivate' : 'Activate'}
            </button>
            <button onClick={onEdit} style={btnSmall('#3b82f6')}>
              <Pencil size={12} /> Edit
            </button>
            {!skill.is_system && (
              <button onClick={handleDelete} style={btnSmall('#EF4444')}>
                <Trash2 size={12} /> Delete
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Proposals List ─────────────────────────────────────

function ProposalsList({
  proposals,
  reviewedProposals,
}: {
  proposals: ZiroSkillProposal[]
  reviewedProposals: ZiroSkillProposal[]
}) {
  const approve = useApproveProposal()
  const reject = useRejectProposal()

  const handleApprove = async (p: ZiroSkillProposal) => {
    try {
      await approve.mutateAsync(p)
      toast(`"${p.proposed_name}" approved and activated`, 'success')
    } catch {
      toast('Failed to approve', 'error')
    }
  }

  const handleReject = async (p: ZiroSkillProposal) => {
    if (!confirm(`Reject "${p.proposed_name}"?`)) return
    try {
      await reject.mutateAsync(p.id)
      toast(`"${p.proposed_name}" rejected`, 'success')
    } catch {
      toast('Failed to reject', 'error')
    }
  }

  return (
    <div>
      {proposals.length === 0 && reviewedProposals.length === 0 && (
        <div style={{ padding: 40, textAlign: 'center', color: '#606088', fontSize: 13 }}>
          No proposals yet. When Ziro encounters a task it can't handle with existing skills,
          it will propose a new skill here for your approval.
        </div>
      )}

      {proposals.length > 0 && (
        <>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#FFB800', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
            <AlertTriangle size={14} /> Pending Approval ({proposals.length})
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 24 }}>
            {proposals.map(p => (
              <div
                key={p.id}
                style={{
                  padding: '16px 18px',
                  borderRadius: 12,
                  background: 'rgba(255,184,0,0.04)',
                  border: '1px solid rgba(255,184,0,0.15)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 15, fontWeight: 700, color: '#E0E0F4', marginBottom: 4 }}>
                      {p.proposed_name}
                      <span style={{ ...pillStyle(RISK_COLORS[p.proposed_risk_tier] ?? '#8080A8'), marginLeft: 8 }}>
                        {p.proposed_risk_tier}
                      </span>
                    </div>
                    <div style={{ fontSize: 12, color: '#8080A8', marginBottom: 8 }}>{p.proposed_description}</div>
                    {p.reason && (
                      <div style={{ fontSize: 11, color: '#606088', fontStyle: 'italic' }}>
                        Ziro's reason: {p.reason}
                      </div>
                    )}
                    <div style={{ fontSize: 11, color: '#606088', marginTop: 6 }}>
                      Key: <code style={{ color: '#9090b8' }}>{p.proposed_key}</code> | Tools:{' '}
                      {p.proposed_allowed_tools.join(', ') || 'None'}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                    <button onClick={() => handleApprove(p)} style={btnSmall('#22C55E')} disabled={approve.isPending}>
                      <CheckCircle2 size={12} /> Approve
                    </button>
                    <button onClick={() => handleReject(p)} style={btnSmall('#EF4444')} disabled={reject.isPending}>
                      <XCircle size={12} /> Reject
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {reviewedProposals.length > 0 && (
        <>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#606088', marginBottom: 8 }}>
            Previously Reviewed
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {reviewedProposals.slice(0, 20).map(p => (
              <div
                key={p.id}
                style={{
                  padding: '10px 14px',
                  borderRadius: 10,
                  background: 'rgba(255,255,255,0.01)',
                  border: '1px solid rgba(255,255,255,0.04)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  opacity: 0.6,
                }}
              >
                {p.status === 'approved' ? (
                  <CheckCircle2 size={14} style={{ color: '#22C55E' }} />
                ) : (
                  <XCircle size={14} style={{ color: '#EF4444' }} />
                )}
                <span style={{ fontSize: 13, color: '#c8c8e8', flex: 1 }}>{p.proposed_name}</span>
                <span style={{ fontSize: 10, color: '#606088' }}>
                  {p.reviewed_at ? new Date(p.reviewed_at).toLocaleDateString() : ''}
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

// ── Skill Form Modal ───────────────────────────────────

function SkillFormModal({
  title,
  initial,
  skillId,
  isSystem,
  onClose,
  mode,
}: {
  title: string
  initial: SkillFormData
  skillId?: string
  isSystem?: boolean
  onClose: () => void
  mode: 'create' | 'edit'
}) {
  const [form, setForm] = useState<SkillFormData>(initial)
  const [toolInput, setToolInput] = useState('')
  const create = useCreateSkill()
  const update = useUpdateSkill()
  const saving = create.isPending || update.isPending

  const set = <K extends keyof SkillFormData>(k: K, v: SkillFormData[K]) =>
    setForm(prev => ({ ...prev, [k]: v }))

  const addTool = () => {
    const t = toolInput.trim()
    if (t && !form.allowed_tools.includes(t)) {
      set('allowed_tools', [...form.allowed_tools, t])
      setToolInput('')
    }
  }

  const removeTool = (t: string) =>
    set('allowed_tools', form.allowed_tools.filter(x => x !== t))

  const handleSubmit = async () => {
    if (!form.key || !form.name) {
      toast('Key and Name are required', 'error')
      return
    }
    // Validate key format
    if (!/^[a-z][a-z0-9_]*$/.test(form.key)) {
      toast('Key must be lowercase snake_case (letters, numbers, underscores)', 'error')
      return
    }
    try {
      if (mode === 'create') {
        await create.mutateAsync(form)
        toast(`"${form.name}" created (inactive — activate when ready)`, 'success')
      } else {
        await update.mutateAsync({ id: skillId!, ...form })
        toast(`"${form.name}" updated`, 'success')
      }
      onClose()
    } catch (err: any) {
      toast(err.message ?? 'Failed to save skill', 'error')
    }
  }

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={modalStyle} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h2 style={{ fontSize: 18, fontWeight: 800, color: '#E0E0F4', margin: 0 }}>{title}</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#8080A8', cursor: 'pointer' }}>
            <X size={18} />
          </button>
        </div>

        {isSystem && (
          <div style={{ padding: '8px 12px', borderRadius: 8, background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.2)', fontSize: 11, color: '#93b8f6', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 6 }}>
            <Shield size={12} /> System skill — key and runtime are locked.
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <FormField label="Key" disabled={isSystem && mode === 'edit'}>
            <input
              value={form.key}
              onChange={e => set('key', e.target.value)}
              placeholder="lead_followup"
              disabled={isSystem && mode === 'edit'}
              style={inputStyle}
            />
          </FormField>
          <FormField label="Name">
            <input value={form.name} onChange={e => set('name', e.target.value)} placeholder="Lead Follow-Up" style={inputStyle} />
          </FormField>
          <FormField label="Description" span={2}>
            <textarea value={form.description} onChange={e => set('description', e.target.value)} rows={2} style={{ ...inputStyle, resize: 'vertical' }} />
          </FormField>
          <FormField label="Business Context" span={2}>
            <textarea value={form.business_context} onChange={e => set('business_context', e.target.value)} rows={2} style={{ ...inputStyle, resize: 'vertical' }} />
          </FormField>
          <FormField label="Runtime" disabled={isSystem && mode === 'edit'}>
            <select
              value={form.runtime}
              onChange={e => set('runtime', e.target.value)}
              disabled={isSystem && mode === 'edit'}
              style={inputStyle}
            >
              {RUNTIME_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </FormField>
          <FormField label="Risk Tier">
            <select value={form.risk_tier} onChange={e => set('risk_tier', e.target.value as SkillFormData['risk_tier'])} style={inputStyle}>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="critical">Critical</option>
            </select>
          </FormField>
          <FormField label="Cost Tier">
            <select value={form.cost_tier} onChange={e => set('cost_tier', e.target.value as SkillFormData['cost_tier'])} style={inputStyle}>
              <option value="free">Free</option>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
          </FormField>
          <FormField label="Allowed Tools">
            <div style={{ display: 'flex', gap: 6 }}>
              <input
                value={toolInput}
                onChange={e => setToolInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addTool())}
                placeholder="sms.draft"
                style={{ ...inputStyle, flex: 1 }}
              />
              <button onClick={addTool} style={{ ...btnSmall('#3b82f6'), padding: '6px 12px' }}>Add</button>
            </div>
            {form.allowed_tools.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 6 }}>
                {form.allowed_tools.map(t => (
                  <span key={t} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 6, background: 'rgba(59,130,246,0.1)', color: '#93b8f6', fontSize: 11, fontWeight: 600 }}>
                    {t}
                    <X size={10} style={{ cursor: 'pointer' }} onClick={() => removeTool(t)} />
                  </span>
                ))}
              </div>
            )}
          </FormField>
          <FormField label="System Prompt Fragment" span={2}>
            <textarea
              value={form.system_prompt_fragment}
              onChange={e => set('system_prompt_fragment', e.target.value)}
              rows={4}
              style={{ ...inputStyle, resize: 'vertical', fontFamily: 'monospace', fontSize: 12 }}
              placeholder="Instructions Ziro will receive when this skill is active..."
            />
          </FormField>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20, paddingTop: 16, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          <button onClick={onClose} style={btnCancel}>Cancel</button>
          <button onClick={handleSubmit} disabled={saving} style={btnPrimary}>
            {saving ? 'Saving...' : mode === 'create' ? 'Create Skill' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Shared Components ──────────────────────────────────

function MetricCard({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{ padding: '16px 18px', borderRadius: 12, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderTop: `3px solid ${color}` }}>
      <div style={{ fontSize: 24, fontWeight: 800, color: '#E0E0F4', fontFamily: 'monospace' }}>{value}</div>
      <div style={{ fontSize: 11, fontWeight: 600, color: '#8080A8', marginTop: 2 }}>{label}</div>
    </div>
  )
}

function DetailBlock({ label, value, span, mono }: { label: string; value: string; span?: number; mono?: boolean }) {
  return (
    <div style={{ gridColumn: span === 2 ? '1 / -1' : undefined }}>
      <div style={{ fontSize: 10, fontWeight: 600, color: '#606088', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 12, color: '#c8c8e8', lineHeight: 1.5, fontFamily: mono ? 'monospace' : 'inherit', whiteSpace: mono ? 'pre-wrap' : undefined, wordBreak: 'break-word' }}>{value}</div>
    </div>
  )
}

function FormField({ label, children, span, disabled }: { label: string; children: React.ReactNode; span?: number; disabled?: boolean }) {
  return (
    <div style={{ gridColumn: span === 2 ? '1 / -1' : undefined, opacity: disabled ? 0.5 : 1 }}>
      <label style={{ fontSize: 11, fontWeight: 600, color: '#8080A8', marginBottom: 4, display: 'block' }}>{label}</label>
      {children}
    </div>
  )
}

// ── Styles ─────────────────────────────────────────────

const pillStyle = (color: string): CSSProperties => ({
  display: 'inline-block',
  fontSize: 9,
  fontWeight: 700,
  padding: '2px 8px',
  borderRadius: 6,
  background: `${color}18`,
  color,
})

const btnPrimary: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  padding: '8px 16px',
  borderRadius: 8,
  border: 'none',
  background: '#D4226A',
  color: '#fff',
  fontSize: 12,
  fontWeight: 700,
  fontFamily: 'inherit',
  cursor: 'pointer',
}

const btnCancel: CSSProperties = {
  ...btnPrimary,
  background: 'rgba(255,255,255,0.06)',
  color: '#8080A8',
}

const btnSmall = (color: string): CSSProperties => ({
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
  padding: '6px 12px',
  borderRadius: 6,
  border: 'none',
  background: `${color}18`,
  color,
  fontSize: 11,
  fontWeight: 600,
  fontFamily: 'inherit',
  cursor: 'pointer',
})

const inputStyle: CSSProperties = {
  width: '100%',
  padding: '8px 12px',
  borderRadius: 8,
  border: '1px solid rgba(255,255,255,0.08)',
  background: 'rgba(255,255,255,0.04)',
  color: '#E0E0F4',
  fontSize: 13,
  fontFamily: 'inherit',
  outline: 'none',
  boxSizing: 'border-box',
}

const overlayStyle: CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(2,2,9,0.8)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 1000,
  padding: 24,
}

const modalStyle: CSSProperties = {
  width: '100%',
  maxWidth: 680,
  maxHeight: '90vh',
  overflow: 'auto',
  background: '#0d0d1a',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: 16,
  padding: 28,
}
