import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { X, Bot, Radio, Database, Zap, Wrench, ChevronRight } from 'lucide-react'
import type { ResolvedPageIntelligence } from '../../hooks/usePageIntelligence'
import type { ZiroAgentSkill } from '../../hooks/useAgents'
import { workspaceFlowForSurface } from '../../lib/ziro/workspaceFlowMap'

type NodeKind = 'trigger' | 'agent' | 'skill' | 'data' | 'action'

export type WorkspaceNode =
  | { kind: 'trigger'; id: string; label: string; sub: string }
  | { kind: 'agent'; id: string; label: string; sub: string; stale?: boolean }
  | { kind: 'skill'; id: string; label: string; key: string; isPrimary: boolean }
  | { kind: 'data'; id: string; label: string }
  | { kind: 'action'; id: string; label: string }

function NodeCard({
  x,
  y,
  w,
  h,
  accent,
  icon,
  title,
  subtitle,
  selected,
  onClick,
}: {
  x: number
  y: number
  w: number
  h: number
  accent: string
  icon: ReactNode
  title: string
  subtitle?: string
  selected?: boolean
  onClick?: () => void
}) {
  return (
    <foreignObject x={x} y={y} width={w} height={h}>
      <button
        type="button"
        onClick={onClick}
        style={{
          width: '100%',
          height: '100%',
          borderRadius: 12,
          border: selected ? `2px solid ${accent}` : '1px solid rgba(255,255,255,0.12)',
          background: selected ? 'rgba(255,255,255,0.08)' : 'rgba(12,11,22,0.92)',
          boxShadow: '0 4px 20px rgba(0,0,0,0.35)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-start',
          gap: 4,
          padding: '10px 12px',
          cursor: onClick ? 'pointer' : 'default',
          textAlign: 'left',
          fontFamily: 'inherit',
          color: '#E8E8F8',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%' }}>
          <span style={{ color: accent, display: 'flex' }}>{icon}</span>
          <span style={{ fontSize: 13, fontWeight: 800, flex: 1, lineHeight: 1.25 }}>{title}</span>
        </div>
        {subtitle ? (
          <span style={{ fontSize: 11, color: '#9090B8', lineHeight: 1.35, fontWeight: 500 }}>{subtitle}</span>
        ) : null}
      </button>
    </foreignObject>
  )
}

function edgePath(x1: number, y1: number, x2: number, y2: number) {
  const mx = (x1 + x2) / 2
  return `M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`
}

export default function AgentWorkspace({
  open,
  onClose,
  resolved,
  skills,
}: {
  open: boolean
  onClose: () => void
  resolved: ResolvedPageIntelligence
  skills: ZiroAgentSkill[]
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const flow = useMemo(() => workspaceFlowForSurface(resolved.surfaceKey), [resolved.surfaceKey])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  const nodes = useMemo(() => {
    const list: WorkspaceNode[] = [
      {
        kind: 'trigger',
        id: 'trig-1',
        label: 'Page',
        sub: `${resolved.surfaceTitle} · /admin/…`,
      },
    ]
    const agent = resolved.assignedAgent ?? resolved.suggestedAgent
    if (agent) {
      list.push({
        kind: 'agent',
        id: agent.id,
        label: agent.name,
        sub:
          resolved.assignedAgent
            ? agent.status === 'active'
              ? 'Assigned specialist · Active'
              : `Assigned · ${agent.status}`
            : `Suggested match · ${agent.status}`,
        stale: resolved.resolution === 'binding_stale',
      })
    } else {
      list.push({
        kind: 'agent',
        id: 'agent-none',
        label: 'No agent on this page',
        sub: 'Assign one in Ziro Work → Page intelligence',
      })
    }
    for (const s of skills) {
      list.push({
        kind: 'skill',
        id: `skill-${s.id}`,
        label: s.skill_name ?? 'Skill',
        key: s.skill_key ?? '',
        isPrimary: !!s.is_primary,
      })
    }
    for (const d of flow.dataEntities.slice(0, 4)) {
      list.push({ kind: 'data', id: `data-${d}`, label: d })
    }
    for (const a of flow.actionLabels.slice(0, 4)) {
      list.push({ kind: 'action', id: `act-${a}`, label: a })
    }
    return list
  }, [resolved, skills, flow])

  const selected = nodes.find(n => n.id === selectedId)

  if (!open) return null

  const W = 920
  const H = 520
  const cx = W / 2
  const triggerPos = { x: cx - 110, y: 28, w: 220, h: 72 }
  const agentPos = { x: cx - 130, y: 160, w: 260, h: 88 }

  const skillNodes = nodes.filter((n): n is Extract<WorkspaceNode, { kind: 'skill' }> => n.kind === 'skill')
  const skillY = 310
  const skillGap = 118
  const skillStartX = cx - ((skillNodes.length - 1) * skillGap) / 2 - 52

  const dataNodes = nodes.filter((n): n is Extract<WorkspaceNode, { kind: 'data' }> => n.kind === 'data')
  const actionNodes = nodes.filter((n): n is Extract<WorkspaceNode, { kind: 'action' }> => n.kind === 'action')

  return (
    <div
      role="dialog"
      aria-modal
      aria-label="Agent workspace"
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
          maxWidth: 1280,
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
            <div style={{ fontSize: 11, fontWeight: 800, color: '#707098', letterSpacing: '0.08em' }}>AGENT WORKSPACE</div>
            <div style={{ fontSize: 17, fontWeight: 800, color: '#F0F0FF', marginTop: 2 }}>{resolved.surfaceTitle}</div>
            <div style={{ fontSize: 12, color: '#9898B8', marginTop: 4, lineHeight: 1.4 }}>{resolved.intelligenceSummary}</div>
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
            title="Close"
          >
            <X size={20} />
          </button>
        </header>

        <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
          <div style={{ flex: 1, position: 'relative', overflow: 'auto', padding: '12px 8px 16px' }}>
            <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ display: 'block', margin: '0 auto' }}>
              <defs>
                <linearGradient id="edgeGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#22C55E" stopOpacity={0.15} />
                  <stop offset="100%" stopColor="#7B2CBF" stopOpacity={0.35} />
                </linearGradient>
              </defs>
              {/* Trigger → Agent */}
              <path
                d={edgePath(triggerPos.x + triggerPos.w / 2, triggerPos.y + triggerPos.h, agentPos.x + agentPos.w / 2, agentPos.y)}
                fill="none"
                stroke="url(#edgeGrad)"
                strokeWidth={2}
              />

              <NodeCard
                {...triggerPos}
                accent="#38BDF8"
                icon={<Radio size={18} />}
                title="Page trigger"
                subtitle={nodes[0]?.kind === 'trigger' ? nodes[0].sub : undefined}
                selected={selectedId === 'trig-1'}
                onClick={() => setSelectedId('trig-1')}
              />

              {(() => {
                const ag = nodes.find(n => n.kind === 'agent')
                if (!ag || ag.kind !== 'agent') return null
                return (
                  <>
                    <NodeCard
                      {...agentPos}
                      accent={ag.stale ? '#F97316' : resolved.assignedAgent ? '#22C55E' : '#A78BFA'}
                      icon={<Bot size={20} />}
                      title={ag.label}
                      subtitle={ag.sub}
                      selected={selectedId === ag.id}
                      onClick={() => setSelectedId(ag.id)}
                    />
                    {skillNodes.map((sk, i) => {
                      const sx = skillStartX + i * skillGap
                      const sy = skillY
                      const sw = 104
                      const sh = 64
                      return (
                        <g key={sk.id}>
                          <path
                            d={edgePath(agentPos.x + agentPos.w / 2, agentPos.y + agentPos.h, sx + sw / 2, sy)}
                            fill="none"
                            stroke="rgba(148,163,184,0.35)"
                            strokeWidth={1.5}
                          />
                          <NodeCard
                            x={sx}
                            y={sy}
                            w={sw}
                            h={sh}
                            accent={sk.isPrimary ? '#FACC15' : '#94A3B8'}
                            icon={<Wrench size={16} />}
                            title={sk.label}
                            subtitle={sk.isPrimary ? 'Primary skill' : sk.key}
                            selected={selectedId === sk.id}
                            onClick={() => setSelectedId(sk.id)}
                          />
                        </g>
                      )
                    })}

                    {dataNodes.map((d, i) => {
                      const dx = 32 + i * 108
                      const dy = 300
                      return (
                        <g key={d.id}>
                          <path
                            d={edgePath(agentPos.x, agentPos.y + agentPos.h / 2, dx + 90, dy + 28)}
                            fill="none"
                            stroke="rgba(34,197,94,0.25)"
                            strokeWidth={1.5}
                          />
                          <NodeCard
                            x={dx}
                            y={dy}
                            w={180}
                            h={56}
                            accent="#22C55E"
                            icon={<Database size={16} />}
                            title={d.label}
                            subtitle="Data touchpoint"
                            selected={selectedId === d.id}
                            onClick={() => setSelectedId(d.id)}
                          />
                        </g>
                      )
                    })}

                    {actionNodes.map((a, i) => {
                      const ax = W - 200 - i % 2 * 188
                      const ay = 292 + Math.floor(i / 2) * 72
                      return (
                        <g key={a.id}>
                          <path
                            d={edgePath(agentPos.x + agentPos.w, agentPos.y + agentPos.h / 2, ax + 180, ay + 28)}
                            fill="none"
                            stroke="rgba(250,204,21,0.28)"
                            strokeWidth={1.5}
                          />
                          <NodeCard
                            x={ax}
                            y={ay}
                            w={188}
                            h={56}
                            accent="#FACC15"
                            icon={<Zap size={16} />}
                            title={a.label}
                            subtitle="Typical action"
                            selected={selectedId === a.id}
                            onClick={() => setSelectedId(a.id)}
                          />
                        </g>
                      )
                    })}
                  </>
                )
              })()}
            </svg>
            <p style={{ textAlign: 'center', fontSize: 11, color: '#606080', marginTop: 4, maxWidth: 720, marginLeft: 'auto', marginRight: 'auto' }}>
              Visualization only — edges show typical flow. Live routing still follows Ziro Work bindings and skills in Supabase.
            </p>
          </div>

          <aside
            style={{
              width: 300,
              flexShrink: 0,
              borderLeft: '1px solid rgba(255,255,255,0.08)',
              padding: 16,
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
              background: 'rgba(0,0,0,0.2)',
            }}
          >
            <div style={{ fontSize: 12, fontWeight: 800, color: '#9090B0' }}>Inspector</div>
            {!selected ? (
              <p style={{ fontSize: 13, color: '#8080A8', lineHeight: 1.5 }}>Click a node on the canvas to see inputs and outputs.</p>
            ) : selected.kind === 'skill' ? (
              <div>
                <div style={{ fontSize: 15, fontWeight: 800, color: '#F4F4FF' }}>{selected.label}</div>
                <div style={{ fontSize: 12, color: '#9090B8', marginTop: 6 }}>Key: {selected.key || '—'}</div>
                <div style={{ fontSize: 12, color: '#9090B8', marginTop: 4 }}>Primary: {selected.isPrimary ? 'Yes' : 'No'}</div>
                <div style={{ marginTop: 12, fontSize: 11, color: '#707090', lineHeight: 1.5 }}>
                  Outputs: assistant tool calls, structured prompts, and UI affordances defined on the skill record.
                </div>
              </div>
            ) : selected.kind === 'agent' ? (
              <div>
                <div style={{ fontSize: 15, fontWeight: 800, color: '#F4F4FF' }}>{selected.label}</div>
                <div style={{ fontSize: 12, color: '#9090B8', marginTop: 6 }}>{selected.sub}</div>
                {resolved.assignedAgent && (
                  <div style={{ marginTop: 12, fontSize: 11, color: '#707090', lineHeight: 1.5 }}>
                    Inputs: page context from Ziro shell, tenant id, and surface key <code style={{ color: '#A0A0C8' }}>{resolved.surfaceKey}</code>.
                  </div>
                )}
              </div>
            ) : selected.kind === 'trigger' ? (
              <div>
                <div style={{ fontSize: 15, fontWeight: 800, color: '#F4F4FF' }}>Route mount</div>
                <div style={{ fontSize: 12, color: '#9090B8', marginTop: 6 }}>Fires when this CRM surface loads or updates.</div>
              </div>
            ) : (
              <div>
                <div style={{ fontSize: 15, fontWeight: 800, color: '#F4F4FF' }}>{selected.label}</div>
                <div style={{ fontSize: 12, color: '#9090B8', marginTop: 6 }}>
                  {selected.kind === 'data' ? 'Typical read/write scope for this page.' : 'Representative UI or API action.'}
                </div>
              </div>
            )}

            <div style={{ marginTop: 'auto', paddingTop: 12, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#707090', marginBottom: 6 }}>Related agents</div>
              {resolved.supportingAgents.length === 0 ? (
                <span style={{ fontSize: 12, color: '#606080' }}>None scored for this surface.</span>
              ) : (
                resolved.supportingAgents.map(a => (
                  <div key={a.id} style={{ fontSize: 12, color: '#A0A0C8', marginBottom: 4 }}>
                    <ChevronRight size={12} style={{ display: 'inline', verticalAlign: 'middle', opacity: 0.5 }} /> {a.name}
                  </div>
                ))
              )}
            </div>
          </aside>
        </div>
      </div>
    </div>
  )
}
