import { useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Bot, Sparkles, SlidersHorizontal, ChevronRight } from 'lucide-react'
import { useAuthContext } from '../../app/AuthContext'
import { usePermissions } from '../../hooks/usePermissions'
import { useAgents } from '../../hooks/useAgents'
import { usePageIntelligenceBindings, useResolvedPageIntelligence } from '../../hooks/usePageIntelligence'
import { useZiroShell } from '../../contexts/ZiroContext'

/**
 * Connects each operating surface to Ziro (panel + Ziro Work) with real agent data
 * (tenant bindings from Supabase, else keyword match on ziro_agents).
 */
export default function PageIntelligenceStrip() {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const { tenantId } = useAuthContext()
  const { canUseZiro } = usePermissions()
  const { openPanel, setPageContext } = useZiroShell()
  const { data: agents } = useAgents(tenantId)
  const { data: bindings } = usePageIntelligenceBindings(tenantId)
  const resolved = useResolvedPageIntelligence(pathname, tenantId, agents, bindings)

  useEffect(() => {
    if (!resolved) return
    setPageContext(prev => ({
      ...prev,
      intelligenceSurfaceKey: resolved.surfaceKey,
      intelligenceSurfaceTitle: resolved.surfaceTitle,
      intelligenceSummary: resolved.intelligenceSummary,
      primaryAgentId: resolved.primaryAgent?.id ?? null,
      primaryAgentName: resolved.primaryAgent?.name ?? null,
      intelligenceResolution: resolved.resolution,
    }))
  }, [resolved, setPageContext])

  if (!canUseZiro || !resolved || pathname.startsWith('/admin/zirowork')) return null

  const primaryLabel = resolved.primaryAgent?.name ?? 'Ziro (orchestrator)'
  const sub =
    resolved.resolution === 'tenant_binding'
      ? 'Assigned specialist'
      : resolved.resolution === 'heuristic'
        ? 'Matched specialist'
        : 'Central orchestration'

  return (
    <div
      className="page-intelligence-strip"
      style={{
        margin: '0 16px 10px',
        padding: '10px 14px',
        borderRadius: 12,
        background: 'rgba(255,255,255,0.03)',
        border: '1px solid rgba(255,255,255,0.07)',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        flexWrap: 'wrap',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
        <Sparkles size={16} style={{ color: '#22C55E', flexShrink: 0 }} />
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#606088', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
            Ziro · {resolved.surfaceTitle}
          </div>
          <div style={{ fontSize: 13, color: '#A0A0C8', lineHeight: 1.45, marginTop: 2 }}>
            {resolved.intelligenceSummary}
          </div>
        </div>
      </div>

      <div
        style={{
          marginLeft: 'auto',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          flexWrap: 'wrap',
          justifyContent: 'flex-end',
        }}
      >
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '5px 10px',
            borderRadius: 8,
            background: 'rgba(34,197,94,0.08)',
            border: '1px solid rgba(34,197,94,0.2)',
            fontSize: 12,
            fontWeight: 700,
            color: '#B8F5C8',
            maxWidth: 220,
          }}
          title={sub}
        >
          <Bot size={13} style={{ flexShrink: 0, opacity: 0.9 }} />
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{primaryLabel}</span>
        </div>

        <button
          type="button"
          className="btn-ghost"
          onClick={() => openPanel({ seedMessage: resolved.seedPrompt })}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '7px 12px',
            borderRadius: 8,
            fontSize: 12,
            fontWeight: 700,
            border: '1px solid rgba(255,255,255,0.12)',
            background: 'rgba(255,255,255,0.05)',
            color: '#E0E0F4',
            cursor: 'pointer',
          }}
        >
          Ask Ziro
          <ChevronRight size={14} />
        </button>

        <button
          type="button"
          className="btn-ghost"
          onClick={() => navigate(`/admin/zirowork?zwtab=ziro&surface=${encodeURIComponent(resolved.surfaceKey)}`)}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '7px 12px',
            borderRadius: 8,
            fontSize: 12,
            fontWeight: 700,
            border: '1px solid rgba(255,184,0,0.25)',
            background: 'rgba(255,184,0,0.08)',
            color: '#FFD48A',
            cursor: 'pointer',
          }}
          title="Open Ziro Work — orchestration & routing"
        >
          <SlidersHorizontal size={14} />
          Ziro Work
        </button>
      </div>
    </div>
  )
}
