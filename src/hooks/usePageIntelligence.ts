import { useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { qk } from '../lib/queryKeys'
import {
  PAGE_INTEL_BINDING_KEYS,
  getSurfaceByKey,
  resolveOperatingSurface,
  type PageIntelBindingKey,
  type ZiroOperatingSurfaceKey,
} from '../lib/ziro/pageSurfaceRegistry'
import { matrixRowForPageKey } from '../lib/ziro/pageBindingMatrix'
import type { MusicSchoolAgentCatalogSlug } from '../lib/ziro/musicSchoolAgentCatalog'
import { resolveSafeAgent } from '../lib/ziro/agentSafe'
import type { ZiroAgent } from './useAgents'

export interface ZiroPageIntelligenceBindingRow {
  id: string
  tenant_id: string
  page_key: string
  primary_agent_id: string | null
  supporting_agent_ids: string[]
  updated_at: string
}

function catalogSlugOf(agent: ZiroAgent): MusicSchoolAgentCatalogSlug | null {
  const slug = (agent.invocation_rules as { catalog_slug?: string } | undefined)?.catalog_slug
  if (!slug) return null
  return slug as MusicSchoolAgentCatalogSlug
}

export function usePageIntelligenceBindings(tenantId: string | null) {
  return useQuery({
    queryKey: qk.ziro.pageIntelBindings(tenantId),
    enabled: !!tenantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ziro_page_intelligence_bindings')
        .select('id, tenant_id, page_key, primary_agent_id, supporting_agent_ids, updated_at')
        .eq('tenant_id', tenantId!)
        .limit(120)
      if (error) throw error
      return (data ?? []).map(row => ({
        ...row,
        supporting_agent_ids: Array.isArray(row.supporting_agent_ids) ? row.supporting_agent_ids : [],
      })) as ZiroPageIntelligenceBindingRow[]
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

function pickPrimaryHeuristic(pageKey: string, active: ZiroAgent[], usageCount: Map<string, number>): ZiroAgent {
  const surface = getSurfaceByKey(pageKey as ZiroOperatingSurfaceKey)
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
  const i = PAGE_INTEL_BINDING_KEYS.indexOf(pageKey as PageIntelBindingKey)
  return best ?? active[Math.max(0, i) % active.length]!
}

/**
 * Matrix-first catalog slug picks, then hint-based spread across pages when a slug is missing.
 * Emits `supporting_agent_ids` from matrix when those catalog agents exist.
 */
export function suggestPageIntelBindingAssignments(agents: ZiroAgent[]): {
  page_key: string
  primary_agent_id: string
  supporting_agent_ids: string[]
}[] {
  const active = agents.filter(a => a.status === 'active')
  if (active.length === 0) return []

  const usageCount = new Map<string, number>()
  const bySlug = (slug: MusicSchoolAgentCatalogSlug) => active.find(a => catalogSlugOf(a) === slug) ?? null

  const assignments: { page_key: string; primary_agent_id: string; supporting_agent_ids: string[] }[] = []

  for (const pageKey of PAGE_INTEL_BINDING_KEYS) {
    const row = matrixRowForPageKey(pageKey)
    let primary: ZiroAgent | null = null
    if (row?.recommendedPrimarySlug) primary = bySlug(row.recommendedPrimarySlug)
    if (!primary) primary = pickPrimaryHeuristic(pageKey, active, usageCount)

    usageCount.set(primary.id, (usageCount.get(primary.id) ?? 0) + 1)

    const supportingIds: string[] = []
    if (row) {
      for (const s of row.recommendedSupportingSlugs) {
        const ag = bySlug(s)
        if (ag && ag.id !== primary.id && !supportingIds.includes(ag.id)) supportingIds.push(ag.id)
      }
    }

    assignments.push({
      page_key: pageKey,
      primary_agent_id: primary.id,
      supporting_agent_ids: supportingIds,
    })
  }

  return assignments
}

/** @deprecated Use suggestPageIntelBindingAssignments (includes supporting ids). */
export function suggestCrmPageBindingAssignments(agents: ZiroAgent[]): { page_key: string; primary_agent_id: string }[] {
  return suggestPageIntelBindingAssignments(agents).map(({ page_key, primary_agent_id }) => ({
    page_key,
    primary_agent_id,
  }))
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
  /** DB-persisted supporting agents for this page (excluding primary). */
  assignedSupportingAgents: ZiroAgent[]
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
    const list = (agents ?? [])
      .map(a => resolveSafeAgent(a))
      .filter((a): a is ZiroAgent => a !== null)
    const bind = (bindings ?? []).find(b => b.page_key === surface.key) ?? null

    let assigned: ZiroAgent | null = null
    if (bind?.primary_agent_id) {
      assigned = list.find(a => a.id === bind.primary_agent_id) ?? null
    }

    const supportingIds = (bind?.supporting_agent_ids ?? []).filter(id => id && id !== bind?.primary_agent_id)
    const assignedSupportingAgents: ZiroAgent[] = []
    for (const id of supportingIds) {
      const ag = list.find(a => a.id === id)
      if (ag) assignedSupportingAgents.push(ag)
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
    supporting.sort(
      (a, b) => scoreAgentForSurface(b, surface.agentMatchHints) - scoreAgentForSurface(a, surface.agentMatchHints),
    )

    const assignedOut = assigned ? resolveSafeAgent(assigned) : null
    const suggestedOut = suggested ? resolveSafeAgent(suggested) : null
    const supportingOut = supporting
      .slice(0, 3)
      .map(a => resolveSafeAgent(a))
      .filter((a): a is ZiroAgent => a !== null)
    const assignedSupportingOut = assignedSupportingAgents
      .map(a => resolveSafeAgent(a))
      .filter((a): a is ZiroAgent => a !== null)

    return {
      surfaceKey: surface.key,
      surfaceTitle: surface.title,
      intelligenceSummary: surface.intelligenceSummary,
      seedPrompt: surface.seedPromptTemplate,
      assignedAgent: assignedOut,
      suggestedAgent: suggestedOut,
      pageBinding: bind,
      assignedSupportingAgents: assignedSupportingOut,
      supportingAgents: supportingOut,
      resolution,
    }
  }, [pathname, agents, bindings])
}

export type UpsertPageIntelBindingRow = {
  tenant_id: string
  page_key: string
  primary_agent_id: string | null
  supporting_agent_ids: string[]
}

/** Upsert CRM page ↔ agent rows (tenant RLS). */
export function useUpsertPageIntelligenceBindings(tenantId: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (rows: UpsertPageIntelBindingRow[]) => {
      if (!tenantId) throw new Error('Missing tenant')
      if (rows.length === 0) throw new Error('No binding rows')
      const sanitized = rows.map(r => ({
        tenant_id: r.tenant_id,
        page_key: r.page_key,
        primary_agent_id: r.primary_agent_id,
        supporting_agent_ids: (r.supporting_agent_ids ?? []).filter(id => id && id !== r.primary_agent_id),
      }))
      const { error } = await supabase.from('ziro_page_intelligence_bindings').upsert(sanitized, {
        onConflict: 'tenant_id,page_key',
      })
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.ziro.pageIntelBindings(tenantId) })
    },
  })
}

/** Build upsert payload from live agents (matrix + heuristic fallback). */
export function buildCrmPageBindingUpsertRows(tenantId: string, agents: ZiroAgent[]): UpsertPageIntelBindingRow[] {
  return suggestPageIntelBindingAssignments(agents).map(r => ({
    tenant_id: tenantId,
    page_key: r.page_key,
    primary_agent_id: r.primary_agent_id,
    supporting_agent_ids: r.supporting_agent_ids,
  }))
}
