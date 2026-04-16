import type { NavigateFunction } from 'react-router-dom'
import type { ZiroAgent } from '../../hooks/useAgents'

/**
 * Normalize any agent-shaped value to a ZiroAgent with a non-empty string id, or null.
 * Use at UI boundaries so invalid rows never reach render paths that assume `agent.id`.
 */
export function resolveSafeAgent(agent: unknown): ZiroAgent | null {
  if (!agent || typeof agent !== 'object') return null
  const o = agent as Record<string, unknown>
  const id = o.id
  if (!id || typeof id !== 'string' || !id.trim()) return null
  return { ...(agent as ZiroAgent), id: id.trim() }
}

export type AgentFlowMeta = Record<string, unknown>

/** Standard agent-flow log shape (filter DevTools with "AgentFlow"). */
export type AgentFlowDebugPayload = {
  action: string
  agentId?: string | null
  source: string
  meta?: AgentFlowMeta
}

export function agentFlowDebug(payload: AgentFlowDebugPayload) {
  const { action, agentId, source, meta } = payload
  console.debug('AgentFlow', { action, agentId, source, meta: meta ?? {} })
}

/** Dev-only invariant: logs if an agent value is not safe to use. */
export function assertValidAgent(agent: unknown, context: string): void {
  if (!import.meta.env.DEV) return
  if (!resolveSafeAgent(agent)) {
    console.error('INVALID AGENT STATE', { context, agent })
  }
}

/**
 * Navigate to Ziro Work → Agents with a deeplink to edit/focus an agent.
 * Returns false when `agent` cannot be resolved (caller should show toast / fallback).
 */
export function navigateToZiroWorkAgentEditor(
  navigate: NavigateFunction,
  agent: unknown,
  source: string,
  options?: {
    replace?: boolean
    meta?: AgentFlowMeta
    beforeNavigate?: () => void
  },
): boolean {
  const safe = resolveSafeAgent(agent)
  if (!safe) {
    console.warn('Blocked navigation: invalid agent', { source, agent })
    return false
  }
  assertValidAgent(safe, `${source}:navigateToZiroWorkAgentEditor`)
  options?.beforeNavigate?.()
  agentFlowDebug({
    action: 'navigate_zirowork_agents',
    agentId: safe.id,
    source,
    meta: options?.meta,
  })
  navigate(`/admin/zirowork?zwtab=agents&agentId=${encodeURIComponent(safe.id)}`, { replace: options?.replace })
  return true
}
