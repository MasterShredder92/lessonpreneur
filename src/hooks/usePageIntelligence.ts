import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { qk } from '../lib/queryKeys'
import { resolveOperatingSurface, type ZiroOperatingSurfaceKey } from '../lib/ziro/pageSurfaceRegistry'
import type { ZiroAgent } from './useAgents'

export interface ZiroPageIntelligenceBindingRow {
  id: string
  tenant_id: string
  page_key: string
  primary_agent_id: string | null
  updated_at: string
}

export function usePageIntelligenceBindings(tenantId: string | null) {
  return useQuery({
    queryKey: qk.ziro.pageIntelBindings(tenantId),
    enabled: !!tenantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ziro_page_intelligence_bindings')
        .select('id, tenant_id, page_key, primary_agent_id, updated_at')
        .eq('tenant_id', tenantId!)
        .limit(80)
      if (error) throw error
      return (data ?? []) as ZiroPageIntelligenceBindingRow[]
    },
  })
}

function tokenizeAgent(agent: ZiroAgent): string {
  const kw = (agent.invocation_rules as { keywords?: string[] } | undefined)?.keywords
  const parts = [
    agent.name,
    agent.purpose ?? '',
    agent.role ?? '',
    ...(agent.usage_triggers ?? []),
    ...(Array.isArray(kw) ? kw : []),
  ]
  return parts.join(' ').toLowerCase()
}

function scoreAgentForSurface(agent: ZiroAgent, hints: string[]): number {
  if (hints.length === 0) return 0
  const blob = tokenizeAgent(agent)
  let score = 0
  for (const h of hints) {
    if (!h) continue
    if (blob.includes(h)) score += h.length > 4 ? 3 : 2
  }
  if (agent.status !== 'active') score -= 5
  return score
}

export type PageIntelligenceResolution = 'tenant_binding' | 'heuristic' | 'orchestrator_only'

export interface ResolvedPageIntelligence {
  surfaceKey: ZiroOperatingSurfaceKey
  surfaceTitle: string
  intelligenceSummary: string
  seedPrompt: string
  primaryAgent: ZiroAgent | null
  /** Agents that scored > 0 for this surface (excluding primary), max 3 */
  supportingAgents: ZiroAgent[]
  resolution: PageIntelligenceResolution
}

export function useResolvedPageIntelligence(
  pathname: string,
  tenantId: string | null,
  agents: ZiroAgent[] | undefined,
  bindings: ZiroPageIntelligenceBindingRow[] | undefined,
): ResolvedPageIntelligence | null {
  return useMemo(() => {
    const surface = resolveOperatingSurface(pathname)
    const list = agents ?? []
    const bind = (bindings ?? []).find(b => b.page_key === surface.key)
    let primary: ZiroAgent | null = null
    let resolution: PageIntelligenceResolution = 'orchestrator_only'

    if (bind?.primary_agent_id) {
      primary = list.find(a => a.id === bind.primary_agent_id) ?? null
      if (primary) resolution = 'tenant_binding'
    }

    if (!primary && list.length > 0 && surface.agentMatchHints.length > 0) {
      let best: ZiroAgent | null = null
      let bestScore = 0
      for (const a of list) {
        const s = scoreAgentForSurface(a, surface.agentMatchHints)
        if (s > bestScore) {
          bestScore = s
          best = a
        }
      }
      if (best && bestScore >= 2) {
        primary = best
        resolution = 'heuristic'
      }
    }

    const supporting: ZiroAgent[] = []
    if (primary && surface.agentMatchHints.length > 0) {
      for (const a of list) {
        if (a.id === primary.id) continue
        const s = scoreAgentForSurface(a, surface.agentMatchHints)
        if (s >= 2) supporting.push(a)
      }
    }
    supporting.sort((a, b) => scoreAgentForSurface(b, surface.agentMatchHints) - scoreAgentForSurface(a, surface.agentMatchHints))

    return {
      surfaceKey: surface.key,
      surfaceTitle: surface.title,
      intelligenceSummary: surface.intelligenceSummary,
      seedPrompt: surface.seedPromptTemplate,
      primaryAgent: primary,
      supportingAgents: supporting.slice(0, 3),
      resolution,
    }
  }, [pathname, agents, bindings])
}
