import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Bot, ChevronRight, MessageSquare, SlidersHorizontal, AlertTriangle } from 'lucide-react'
import { useAuthContext } from '../../app/AuthContext'
import { usePermissions } from '../../hooks/usePermissions'
import { useAgents } from '../../hooks/useAgents'
import { usePageIntelligenceBindings, useResolvedPageIntelligence } from '../../hooks/usePageIntelligence'
import { useZiroShell } from '../../contexts/ZiroContext'
import AgentWorkspace from './AgentWorkspace'

/**
 * Batch 2 — Page agent chrome: one binding-backed agent (or explicit unassigned), clickable → Agent Workspace.
 * Replaces the old marketing strip; still syncs Ziro shell page context for the assistant.
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
  const [workspaceOpen, setWorkspaceOpen] = useState(false)

  useEffect(() => {
    if (!resolved) return
    setPageContext(prev => ({
      ...prev,
      intelligenceSurfaceKey: resolved.surfaceKey,
      intelligenceSurfaceTitle: resolved.surfaceTitle,
      intelligenceSummary: resolved.intelligenceSummary,
      primaryAgentId: resolved.assignedAgent?.id ?? null,
      primaryAgentName: resolved.assignedAgent?.name ?? null,
      intelligenceResolution: resolved.resolution,
    }))
  }, [resolved, setPageContext])

  if (!canUseZiro || !resolved || pathname.startsWith('/admin/zirowork')) return null

  const chip = (() => {
    if (resolved.resolution === 'binding_stale') {
      return {
        label: 'Assignment missing',
        sub: 'Primary agent id in binding no longer exists',
        tone: 'stale' as const,
        clickable: true,
      }
    }
    if (resolved.assignedAgent) {
      const st = resolved.assignedAgent.status
      return {
        label: resolved.assignedAgent.name,
        sub: st === 'active' ? 'Active' : st === 'idle' ? 'Idle' : st,
        tone: 'ok' as const,
        clickable: true,
      }
    }
    return {
      label: 'No agent assigned',
      sub: resolved.suggestedAgent ? `Suggested: ${resolved.suggestedAgent.name}` : 'Configure in Ziro Work',
      tone: 'empty' as const,
      clickable: true,
    }
  })()

  const toneStyles =
    chip.tone === 'ok'
      ? { bg: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.28)', color: '#B8F5C8' }
      : chip.tone === 'stale'
        ? { bg: 'rgba(249,115,22,0.1)', border: '1px solid rgba(249,115,22,0.35)', color: '#FDBA74' }
        : { bg: 'rgba(148,163,184,0.08)', border: '1px solid rgba(148,163,184,0.22)', color: '#CBD5E1' }

  return (
    <>
      <div
        className="page-agent-strip"
        style={{
          margin: '0 16px 10px',
          padding: '8px 12px',
          borderRadius: 12,
          background: 'rgba(255,255,255,0.03)',
          border: '1px solid rgba(255,255,255,0.07)',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          flexWrap: 'wrap',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, flex: '1 1 160px' }}>
          <div style={{ fontSize: 10, fontWeight: 800, color: '#606088', letterSpacing: '0.07em' }}>PAGE · {resolved.surfaceTitle.toUpperCase()}</div>
        </div>

        <button
          type="button"
          onClick={() => chip.clickable && setWorkspaceOpen(true)}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            padding: '8px 12px',
            borderRadius: 10,
            ...toneStyles,
            fontSize: 13,
            fontWeight: 800,
            cursor: chip.clickable ? 'pointer' : 'default',
            maxWidth: 320,
            textAlign: 'left',
            fontFamily: 'inherit',
          }}
        >
          {chip.tone === 'stale' ? <AlertTriangle size={16} style={{ flexShrink: 0 }} /> : <Bot size={17} style={{ flexShrink: 0 }} />}
          <span style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{chip.label}</span>
            <span style={{ fontSize: 10, fontWeight: 700, opacity: 0.85, textTransform: 'capitalize' }}>{chip.sub}</span>
          </span>
          <ChevronRight size={16} style={{ flexShrink: 0, opacity: 0.6 }} />
        </button>

        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
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
            <MessageSquare size={14} />
            Ask Ziro
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
            title="Bindings & orchestration"
          >
            <SlidersHorizontal size={14} />
            Ziro Work
          </button>
        </div>
      </div>

      {workspaceOpen && (
        <AgentWorkspace open={workspaceOpen} onClose={() => setWorkspaceOpen(false)} resolved={resolved} tenantId={tenantId} />
      )}
    </>
  )
}
