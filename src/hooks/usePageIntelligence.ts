import { useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { qk } from '../lib/queryKeys'
import {
  CRM_PAGE_INTEL_BINDING_KEYS,
  getSurfaceByKey,
  resolveOperatingSurface,
  type ZiroOperatingSurfaceKey,
} from '../lib/ziro/pageSurfaceRegistry'
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

export function scoreAgentForSurface(agent: ZiroAgent, hints: string[]): number {
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

/**
 * Pick one active agent per CRM surface using registry match hints; prefers spreading
 * agents across pages when scores tie. Falls back to round-robin if all scores are 0.
 */
export function suggestCrmPageBindingAssignments(agents: ZiroAgent[]): { page_key: string; primary_agent_id: string }[] {
  const active = agents.filter(a => a.status === 'active')
  if (active.length === 0) return []

  const assignments: { page_key: string; primary_agent_id: string }[] = []
  const usageCount = new Map<string, number>()

  for (let i = 0; i < CRM_PAGE_INTEL_BINDING_KEYS.length; i++) {
    const pageKey = CRM_PAGE_INTEL_BINDING_KEYS[i]
    const surface = getSurfaceByKey(pageKey)
    const hints = surface?.agentMatchHints ?? []

    let best: ZiroAgent | null = null
    let bestScore = -Infinity
    for (const a of active) {
      const base = scoreAgentForSurface(a, hints)
      const used = usageCount.get(a.id) ?? 0
      const adjusted = base - used * 0.5
      if (adjusted > bestScore) {
        bestScore = adjusted
        best = a
      }
    }

    const chosen =
      best ??
      active[i % active.length]!

    usageCount.set(chosen.id, (usageCount.get(chosen.id) ?? 0) + 1)
    assignments.push({ page_key: pageKey, primary_agent_id: chosen.id })
  }

  return assignments
}

/** `tenant_binding` = ziro_page_intelligence_bindings.primary_agent_id resolves to an agent. No heuristic fallback for page assignment. */
export type PageIntelligenceResolution =
  | 'tenant_binding'
  | 'unassigned'
  | 'binding_stale'
  | 'heuristic_suggestion'

export interface ResolvedPageIntelligence {
  surfaceKey: ZiroOperatingSurfaceKey
  surfaceTitle: string
  intelligenceSummary: string
  seedPrompt: string
  /** Page owner agent — only from tenant DB binding (exactly one or none). */
  assignedAgent: ZiroAgent | null
  /** Optional keyword match when no binding exists (workspace hint only, not the page agent). */
  suggestedAgent: ZiroAgent | null
  /** Binding row for this surface, if any */
  pageBinding: ZiroPageIntelligenceBindingRow | null
  /** Agents that scored > 0 for this surface (excluding assigned), max 3 */
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
    const bind = (bindings ?? []).find(b => b.page_key === surface.key) ?? null

    let assigned: ZiroAgent | null = null
    if (bind?.primary_agent_id) {
      assigned = list.find(a => a.id === bind.primary_agent_id) ?? null
    }

    let suggested: ZiroAgent | null = null
    if (!assigned && list.length > 0 && surface.agentMatchHints.length > 0) {
      let best: ZiroAgent | null = null
      let bestScore = 0
      for (const a of list) {
        const s = scoreAgentForSurface(a, surface.agentMatchHints)
        if (s > bestScore) {
          bestScore = s
          best = a
        }
      }
      if (best && bestScore >= 2) suggested = best
    }

    let resolution: PageIntelligenceResolution
    if (bind?.primary_agent_id && !assigned) resolution = 'binding_stale'
    else if (assigned) resolution = 'tenant_binding'
    else if (suggested) resolution = 'heuristic_suggestion'
    else resolution = 'unassigned'

    const anchor = assigned ?? suggested
    const supporting: ZiroAgent[] = []
    if (anchor && surface.agentMatchHints.length > 0) {
      for (const a of list) {
        if (a.id === anchor.id) continue
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
      assignedAgent: assigned,
      suggestedAgent: suggested,
      pageBinding: bind,
      supportingAgents: supporting.slice(0, 3),
      resolution,
    }
  }, [pathname, agents, bindings])
}

type UpsertBindingRow = { tenant_id: string; page_key: string; primary_agent_id: string }

/** Upsert CRM page ↔ primary agent rows (tenant RLS). */
export function useUpsertPageIntelligenceBindings(tenantId: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (rows: UpsertBindingRow[]) => {
      if (!tenantId) throw new Error('Missing tenant')
      if (rows.length === 0) throw new Error('No binding rows')
      const { error } = await supabase.from('ziro_page_intelligence_bindings').upsert(rows, {
        onConflict: 'tenant_id,page_key',
      })
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.ziro.pageIntelBindings(tenantId) })
    },
  })
}

/** Build upsert payload from live agents (see suggestCrmPageBindingAssignments). */
export function buildCrmPageBindingUpsertRows(tenantId: string, agents: ZiroAgent[]): UpsertBindingRow[] {
  return suggestCrmPageBindingAssignments(agents).map(r => ({
    tenant_id: tenantId,
    page_key: r.page_key,
    primary_agent_id: r.primary_agent_id,
  }))
}
