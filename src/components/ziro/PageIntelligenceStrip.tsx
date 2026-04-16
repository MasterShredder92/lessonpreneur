import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { Bot, ChevronRight, MessageSquare, SlidersHorizontal, AlertTriangle } from 'lucide-react'
import { useAuthContext } from '../../app/AuthContext'
import { usePermissions } from '../../hooks/usePermissions'
import { useAgents, type ZiroAgent } from '../../hooks/useAgents'
import { usePageIntelligenceBindings, useResolvedPageIntelligence } from '../../hooks/usePageIntelligence'
import { useZiroShell } from '../../contexts/ZiroContext'
import AgentWorkspace from './AgentWorkspace'
import { agentFlowDebug, resolveSafeAgent } from '../../lib/ziro/agentSafe'

/**
 * Batch 2 — Page agent chrome: one binding-backed agent (or explicit unassigned), clickable → Agent Workspace.
 * Replaces the old marketing strip; still syncs Ziro shell page context for the assistant.
 *
 * On-screen debug: append `?stripDebug=1` to any `/admin/*` URL (remove after investigation).
 */
export default function PageIntelligenceStrip() {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const stripDebug = searchParams.get('stripDebug') === '1'

  const { tenantId } = useAuthContext()
  const { canUseZiro, role: effectiveRole, actualRole, isPreviewActive } = usePermissions()
  const { openPanel, setPageContext } = useZiroShell()
  const { data: agents } = useAgents(tenantId)
  const { data: bindings } = usePageIntelligenceBindings(tenantId)
  const resolved = useResolvedPageIntelligence(pathname, tenantId, agents, bindings)
  const [workspaceOpen, setWorkspaceOpen] = useState(false)

  const hideOnZirowork = pathname.startsWith('/admin/zirowork')
  const onAdmin = pathname.startsWith('/admin')
  /** `useResolvedPageIntelligence` always returns an object; kept for clarity if that changes. */
  const hasResolved = !!resolved
  const showMainStrip = canUseZiro && hasResolved && !hideOnZirowork

  const debugPanel = useMemo(() => {
    if (!stripDebug || !onAdmin) return null
    const surfaceKey = resolved?.surfaceKey ?? '—'
    const agentName = resolved?.assignedAgent?.name ?? 'none'
    const blockers: string[] = []
    if (!canUseZiro) blockers.push('canUseZiro=false (real role not owner/admin/co-director/studio director)')
    if (!hasResolved) blockers.push('no resolved surface')
    if (hideOnZirowork) blockers.push('hidden on /admin/zirowork')
    return (
      <div
        className="page-intelligence-strip-debug"
        style={{
          flexShrink: 0,
          margin: '0 16px 8px',
          padding: '8px 10px',
          borderRadius: 8,
          fontSize: 11,
          fontFamily: 'ui-monospace, monospace',
          lineHeight: 1.45,
          color: '#E0E0F4',
          background: 'rgba(255, 184, 0, 0.12)',
          border: '1px solid rgba(255, 184, 0, 0.45)',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-all',
        }}
      >
        <strong style={{ color: '#FFB800' }}>[stripDebug]</strong> strip={showMainStrip ? 'visible' : 'hidden'}
        {blockers.length > 0 ? ` — ${blockers.join(' · ')}` : ''}
        {'\n'}
        canUseZiro={String(canUseZiro)} · effectiveRole={effectiveRole ?? 'null'} · actualRole={actualRole ?? 'null'} ·
        isPreviewActive={String(isPreviewActive)}
        {'\n'}
        pathname={pathname}
        {'\n'}
        surfaceKey={surfaceKey} · assignedAgent={agentName}
      </div>
    )
  }, [
    stripDebug,
    onAdmin,
    showMainStrip,
    canUseZiro,
    hasResolved,
    hideOnZirowork,
    effectiveRole,
    actualRole,
    isPreviewActive,
    pathname,
    resolved?.surfaceKey,
    resolved?.assignedAgent?.name,
  ])

  useEffect(() => {
    if (!resolved) return
    const primary = resolveSafeAgent(resolved.assignedAgent)
    const supportingSafe = resolved.assignedSupportingAgents
      .map(a => resolveSafeAgent(a))
      .filter((a): a is ZiroAgent => a !== null)
    setPageContext(prev => ({
      ...prev,
      intelligenceSurfaceKey: resolved.surfaceKey,
      intelligenceSurfaceTitle: resolved.surfaceTitle,
      intelligenceSummary: resolved.intelligenceSummary,
      primaryAgentId: primary?.id ?? null,
      primaryAgentName: primary?.name ?? null,
      supportingAgentIds: supportingSafe.map(a => a.id),
      supportingAgentNames: supportingSafe.map(a => a.name),
      intelligenceResolution: resolved.resolution,
    }))
  }, [resolved, setPageContext])

  if (!showMainStrip) {
    return debugPanel ? <div style={{ flexShrink: 0 }}>{debugPanel}</div> : null
  }

  const safeAssigned = resolveSafeAgent(resolved.assignedAgent)
  const safeSuggested = resolveSafeAgent(resolved.suggestedAgent)

  const chip = (() => {
    if (resolved.resolution === 'binding_stale') {
      return {
        label: 'Assignment missing',
        sub: 'Primary agent id in binding no longer exists',
        tone: 'stale' as const,
        clickable: true,
      }
    }
    if (safeAssigned) {
      const st = safeAssigned.status
      const extra =
        resolved.assignedSupportingAgents.length > 0
          ? ` +${resolved.assignedSupportingAgents.length} supporting`
          : ''
      return {
        label: safeAssigned.name,
        sub: `${st === 'active' ? 'Active' : st === 'idle' ? 'Idle' : st}${extra}`,
        tone: 'ok' as const,
        clickable: true,
      }
    }
    return {
      label: 'No agent assigned',
      sub: safeSuggested ? `Suggested: ${safeSuggested.name}` : 'Configure in Ziro Work',
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
    <div style={{ flexShrink: 0 }}>
      {debugPanel}
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
          <div style={{ fontSize: 10, fontWeight: 800, color: '#606088', letterSpacing: '0.07em' }}>
            PAGE · {resolved.surfaceTitle.toUpperCase()}
          </div>
        </div>

        <button
          type="button"
          onClick={() => {
            if (!chip.clickable) return
            agentFlowDebug({
              action: 'agent_click',
              agentId: safeAssigned?.id ?? safeSuggested?.id ?? null,
              source: 'page_chip',
              meta: {
                surfaceKey: resolved.surfaceKey,
                resolution: resolved.resolution,
                assignedId: safeAssigned?.id ?? null,
                suggestedId: safeSuggested?.id ?? null,
              },
            })
            setWorkspaceOpen(true)
          }}
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
        <AgentWorkspace
          key={resolved.surfaceKey}
          open={workspaceOpen}
          onClose={() => setWorkspaceOpen(false)}
          resolved={resolved}
          tenantId={tenantId}
        />
      )}
    </div>
  )
}
