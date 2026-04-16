/**
 * Hooks for Ziro Agent CRUD, lifecycle management, and orchestrator (Ziro) attachment.
 *
 * Agent = focused specialist with a clear purpose and attached skills.
 * Agents are the exception layer — skills are the default reusable unit.
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { qk } from '../lib/queryKeys'
import { VAGUE_AGENT_NAMES, findOverlappingAgent } from '../ziro-core/orchestrator'
import { MUSIC_SCHOOL_ZIRO_AGENT_CATALOG } from '../lib/ziro/musicSchoolAgentCatalog'

type MusicSchoolCatalogRow = (typeof MUSIC_SCHOOL_ZIRO_AGENT_CATALOG)[number]

/** Shared DB fields for catalog agents (install + repair). */
function catalogAgentDefaults(row: MusicSchoolCatalogRow) {
  return {
    name: row.name,
    purpose: row.purpose,
    role: row.role,
    instructions: row.instructions,
    profile_summary: row.profile_summary,
    usage_triggers: [...row.usage_triggers],
    auto_use_by_ziro: row.auto_use_by_ziro,
    invocation_rules: { catalog_slug: row.catalog_slug },
    is_visible_in_ui: true,
    is_archived: false,
    business_context: 'music_school' as const,
  }
}

/** Idempotent: attach primary catalog skill if missing (`ziro_agent_skills` unique on agent_id, skill_id). */
async function ensureMusicSchoolCatalogPrimarySkill(
  tenantId: string,
  agentId: string,
  skillKey: string,
): Promise<void> {
  const { data: skill, error: skErr } = await supabase
    .from('ziro_skills')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('key', skillKey)
    .eq('is_active', true)
    .maybeSingle()
  if (skErr) throw skErr
  if (!skill) {
    throw new Error(
      `Missing active skill "${skillKey}" for this tenant — provision system skills before installing catalog agents.`,
    )
  }
  const { error: upErr } = await supabase.from('ziro_agent_skills').upsert(
    {
      tenant_id: tenantId,
      agent_id: agentId,
      skill_id: skill.id,
      is_primary: true,
    },
    { onConflict: 'agent_id,skill_id', ignoreDuplicates: true },
  )
  if (upErr) throw upErr
}

// ── Types ───────────────────────────────────────────────

export interface ZiroAgent {
  id: string
  tenant_id: string
  name: string
  purpose: string | null
  status: 'active' | 'idle' | 'retired'
  owner_type: 'system' | 'user'
  lifecycle_type: 'temporary' | 'persistent'
  invocation_rules: Record<string, unknown>
  created_by: string | null
  created_at: string
  last_used_at: string | null
  retired_at: string | null
  role: string | null
  instructions: string | null
  usage_triggers: string[]
  auto_use_by_ziro: boolean
  profile_summary: string | null
  updated_at: string
  /** When false, hidden from Ziro Control catalog / CRM binding pickers (e.g. temp agents). */
  is_visible_in_ui?: boolean
  is_archived?: boolean
  /** music_school = catalog specialists; ephemeral = runtime temp agents. */
  business_context?: string | null
}

export interface ZiroStarConfig {
  id: string
  tenant_id: string
  instructions: string | null
  routing_rules: Record<string, unknown>
  default_skill_ids: string[]
  delegation_rules: unknown[]
  created_at: string
  updated_at: string
}

export interface ZiroAgentSkill {
  id: string
  agent_id: string
  skill_id: string
  is_primary: boolean
  attached_at: string
  skill_name?: string
  skill_key?: string
}

export interface ZiroStarAgent {
  id: string
  tenant_id: string
  agent_id: string
  attached_at: string
}

// ── Queries ─────────────────────────────────────────────

/** All agents for this tenant, ordered by status then name. */
export function useAgents(tenantId: string | null) {
  return useQuery({
    queryKey: qk.agents.list(tenantId),
    enabled: !!tenantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ziro_agents')
        .select('*')
        .eq('tenant_id', tenantId!)
        .eq('is_archived', false)
        .order('status')
        .order('name')
        .limit(100)
      if (error) throw error
      return (data ?? []) as ZiroAgent[]
    },
  })
}

/**
 * Music-school specialist catalog for Ziro Control + CRM page bindings (not ephemeral temp agents).
 * Requires columns from migration `20260416140000_ziro_agents_visibility_music_school.sql`.
 */
export function useMusicSchoolZiroAgents(tenantId: string | null) {
  return useQuery({
    queryKey: [...qk.agents.list(tenantId), 'music_school_catalog'],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ziro_agents')
        .select('*')
        .eq('tenant_id', tenantId!)
        .eq('is_visible_in_ui', true)
        .eq('is_archived', false)
        .eq('business_context', 'music_school')
        .in('status', ['active', 'idle'])
        .order('status')
        .order('name')
        .limit(100)
      if (error) throw error
      return (data ?? []) as ZiroAgent[]
    },
  })
}

/**
 * Insert catalog specialists for this tenant if missing (idempotent on `catalog_slug`),
 * and ensure each has a primary row in `ziro_agent_skills` (idempotent upsert on agent_id, skill_id).
 */
export function useSeedMusicSchoolCatalogAgents(tenantId: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      if (!tenantId) throw new Error('Missing tenant')
      const requiredKeys = [...new Set(MUSIC_SCHOOL_ZIRO_AGENT_CATALOG.map(r => r.primary_skill_key))]
      const { data: skillRows, error: preErr } = await supabase
        .from('ziro_skills')
        .select('key')
        .eq('tenant_id', tenantId)
        .eq('is_active', true)
        .in('key', requiredKeys)
      if (preErr) throw preErr
      const found = new Set((skillRows ?? []).map(s => s.key))
      const missing = requiredKeys.filter(k => !found.has(k))
      if (missing.length > 0) {
        throw new Error(
          `Cannot install catalog agents: missing active skills: ${missing.join(', ')}. Provision system skills first.`,
        )
      }

      for (const row of MUSIC_SCHOOL_ZIRO_AGENT_CATALOG) {
        const { data: existing } = await supabase
          .from('ziro_agents')
          .select('id')
          .eq('tenant_id', tenantId)
          .contains('invocation_rules', { catalog_slug: row.catalog_slug })
          .maybeSingle()

        const defaults = catalogAgentDefaults(row)
        let agentId: string
        if (existing?.id) {
          agentId = existing.id
          const { error: patchErr } = await supabase.from('ziro_agents').update(defaults).eq('id', agentId)
          if (patchErr) throw patchErr
        } else {
          const { data: inserted, error: insErr } = await supabase
            .from('ziro_agents')
            .insert({
              tenant_id: tenantId,
              status: 'active',
              owner_type: 'system',
              lifecycle_type: 'persistent',
              created_by: null,
              ...defaults,
            })
            .select('id')
            .single()
          if (insErr) throw insErr
          if (!inserted?.id) throw new Error('Catalog agent insert returned no id')
          agentId = inserted.id
        }

        await ensureMusicSchoolCatalogPrimarySkill(tenantId, agentId, row.primary_skill_key)
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.agents.all })
      qc.invalidateQueries({ queryKey: ['ziro-agent-skills'] })
      if (tenantId) {
        qc.invalidateQueries({ queryKey: [...qk.agents.list(tenantId), 'music_school_catalog'] })
      }
    },
  })
}

/** Skills attached to a specific agent. */
export function useAgentSkills(agentId: string | null) {
  return useQuery({
    queryKey: qk.agents.skills(agentId ?? ''),
    enabled: !!agentId,
    refetchOnMount: 'always',
    staleTime: 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ziro_agent_skills')
        .select('id, agent_id, skill_id, is_primary, attached_at, ziro_skills!inner(name, key)')
        .eq('agent_id', agentId!)
        .order('is_primary', { ascending: false })
        .limit(20)
      if (error) throw error
      return (data ?? []).map((row: any) => ({
        id: row.id,
        agent_id: row.agent_id,
        skill_id: row.skill_id,
        is_primary: row.is_primary,
        attached_at: row.attached_at,
        skill_name: row.ziro_skills?.name ?? 'Unknown',
        skill_key: row.ziro_skills?.key ?? '',
      })) as ZiroAgentSkill[]
    },
  })
}

/** Agents attached to Ziro (orchestrator roster) for this tenant. */
export function useZiroAgents(tenantId: string | null) {
  return useQuery({
    queryKey: qk.agents.ziroOrchestratorRoster(tenantId),
    enabled: !!tenantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ziro_agents')
        .select('id, tenant_id, agent_id, attached_at')
        .eq('tenant_id', tenantId!)
        .limit(50)
      if (error) throw error
      return (data ?? []) as ZiroStarAgent[]
    },
  })
}

// ── Mutations ───────────────────────────────────────────

export function useCreateAgent(tenantId: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      name: string
      purpose: string
      lifecycle_type: 'temporary' | 'persistent'
      owner_type?: 'system' | 'user'
      invocation_rules?: Record<string, unknown>
      created_by?: string | null
      role?: string
      instructions?: string
      usage_triggers?: string[]
      auto_use_by_ziro?: boolean
      profile_summary?: string
    }) => {
      // Guard: block vague agent names (Policy P2)
      if (VAGUE_AGENT_NAMES.some(v => input.name.toLowerCase().includes(v))) {
        throw new Error(`Agent name "${input.name}" is too vague. Use a specific specialist name.`)
      }
      if (!input.purpose.trim()) {
        throw new Error('Every agent must have a clear purpose.')
      }
      // Guard: check for overlapping active agents (Policy P3)
      const { data: existing } = await supabase
        .from('ziro_agents')
        .select('id, name, purpose')
        .eq('tenant_id', tenantId!)
        .eq('status', 'active')
        .limit(50)
      if (existing) {
        const overlap = findOverlappingAgent(existing, input.name, input.purpose)
        if (overlap) throw new Error(`Active agent "${overlap.name}" already covers a similar purpose.`)
      }
      const { data, error } = await supabase
        .from('ziro_agents')
        .insert({
          tenant_id: tenantId!,
          name: input.name,
          purpose: input.purpose,
          status: 'active',
          owner_type: input.owner_type ?? 'user',
          lifecycle_type: input.lifecycle_type,
          invocation_rules: input.invocation_rules ?? {},
          created_by: input.created_by ?? null,
          role: input.role ?? null,
          instructions: input.instructions ?? null,
          usage_triggers: input.usage_triggers ?? [],
          auto_use_by_ziro: input.auto_use_by_ziro ?? true,
          profile_summary: input.profile_summary ?? null,
          is_visible_in_ui: true,
          is_archived: false,
          business_context: 'music_school',
        })
        .select()
        .single()
      if (error) throw error
      return data as ZiroAgent
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.agents.all })
    },
  })
}

export function useUpdateAgent() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      id: string
      name?: string
      purpose?: string
      invocation_rules?: Record<string, unknown>
      lifecycle_type?: 'temporary' | 'persistent'
      role?: string | null
      instructions?: string | null
      usage_triggers?: string[]
      auto_use_by_ziro?: boolean
      profile_summary?: string | null
      is_visible_in_ui?: boolean
      is_archived?: boolean
      business_context?: string | null
    }) => {
      const { id, ...updates } = input
      const { error } = await supabase
        .from('ziro_agents')
        .update(updates)
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.agents.all })
    },
  })
}

export function useRetireAgent() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (agentId: string) => {
      // Retire agent AND detach from orchestrator roster to prevent ghost attachments
      const [retireResult, detachResult] = await Promise.all([
        supabase.from('ziro_agents').update({ status: 'retired', retired_at: new Date().toISOString() }).eq('id', agentId),
        supabase.from('ziro_agents').delete().eq('agent_id', agentId),
      ])
      if (retireResult.error) throw retireResult.error
      // detach failure is non-fatal (agent may not be attached)
    },
    onSuccess: () => {
      // Invalidate both agents list and star attachments
      qc.invalidateQueries({ queryKey: ['ziro-orchestrator-roster'] })
      qc.invalidateQueries({ queryKey: qk.agents.all })
    },
  })
}

export function useActivateAgent() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (agentId: string) => {
      const { error } = await supabase
        .from('ziro_agents')
        .update({ status: 'active', retired_at: null })
        .eq('id', agentId)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.agents.all })
    },
  })
}

export function useIdleAgent() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (agentId: string) => {
      const { error } = await supabase
        .from('ziro_agents')
        .update({ status: 'idle' })
        .eq('id', agentId)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.agents.all })
    },
  })
}

export function useConvertTempAgent() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (agentId: string) => {
      const { error } = await supabase
        .from('ziro_agents')
        .update({ lifecycle_type: 'persistent' })
        .eq('id', agentId)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.agents.all })
    },
  })
}

export function useDeleteAgent() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (agentId: string) => {
      // Cascade handles agent_skills and ziro_agents
      const { error } = await supabase
        .from('ziro_agents')
        .delete()
        .eq('id', agentId)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.agents.all })
    },
  })
}

// ── Skill attachment ────────────────────────────────────

export function useAttachSkillToAgent() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { tenantId: string; agentId: string; skillId: string; isPrimary?: boolean }) => {
      const { error } = await supabase
        .from('ziro_agent_skills')
        .insert({
          tenant_id: input.tenantId,
          agent_id: input.agentId,
          skill_id: input.skillId,
          is_primary: input.isPrimary ?? false,
        })
        .select('id')
        .maybeSingle()
      if (error) throw error
    },
    onSuccess: async (_d, v) => {
      await qc.invalidateQueries({ queryKey: qk.agents.skills(v.agentId) })
      await qc.invalidateQueries({ queryKey: qk.agents.all })
      await qc.refetchQueries({ queryKey: qk.agents.skills(v.agentId) })
    },
  })
}

export function useDetachSkillFromAgent() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { agentId: string; skillId: string }) => {
      const { error } = await supabase
        .from('ziro_agent_skills')
        .delete()
        .eq('agent_id', input.agentId)
        .eq('skill_id', input.skillId)
      if (error) throw error
    },
    onSuccess: async (_d, v) => {
      await qc.invalidateQueries({ queryKey: qk.agents.skills(v.agentId) })
      await qc.invalidateQueries({ queryKey: qk.agents.all })
      await qc.refetchQueries({ queryKey: qk.agents.skills(v.agentId) })
    },
  })
}

// ── Orchestrator (Ziro) attachment ──────────────────────

export function useAttachAgentToZiro(tenantId: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (agentId: string) => {
      const { error } = await supabase
        .from('ziro_agents')
        .insert({ tenant_id: tenantId!, agent_id: agentId })
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.agents.ziroOrchestratorRoster(tenantId) })
    },
  })
}

export function useDetachAgentFromZiro(tenantId: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (agentId: string) => {
      const { error } = await supabase
        .from('ziro_agents')
        .delete()
        .eq('tenant_id', tenantId!)
        .eq('agent_id', agentId)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.agents.ziroOrchestratorRoster(tenantId) })
    },
  })
}

// ── Clone agent ─────────────────────────────────────────

export function useCloneAgent(tenantId: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (sourceAgentId: string) => {
      // Fetch source agent
      const { data: source, error: fetchErr } = await supabase
        .from('ziro_agents')
        .select('*')
        .eq('id', sourceAgentId)
        .single()
      if (fetchErr || !source) throw fetchErr ?? new Error('Agent not found')

      const invRaw = (typeof source.invocation_rules === 'object' && source.invocation_rules
        ? { ...source.invocation_rules }
        : {}) as Record<string, unknown>
      delete invRaw.catalog_slug

      // Insert clone
      const { data: clone, error: insertErr } = await supabase
        .from('ziro_agents')
        .insert({
          tenant_id: tenantId!,
          name: `${source.name} (Copy)`,
          purpose: source.purpose,
          status: 'active',
          owner_type: 'user',
          lifecycle_type: 'persistent',
          invocation_rules: invRaw,
          role: source.role,
          instructions: source.instructions,
          usage_triggers: source.usage_triggers ?? [],
          auto_use_by_ziro: source.auto_use_by_ziro ?? true,
          profile_summary: source.profile_summary,
          is_visible_in_ui: true,
          is_archived: false,
          business_context: 'music_school',
        })
        .select()
        .single()
      if (insertErr || !clone) throw insertErr ?? new Error('Clone insert failed')

      // Copy skill attachments
      const { data: skills } = await supabase
        .from('ziro_agent_skills')
        .select('skill_id, is_primary')
        .eq('agent_id', sourceAgentId)
        .limit(20)

      if (skills && skills.length > 0) {
        await supabase.from('ziro_agent_skills').insert(
          skills.map(s => ({
            tenant_id: tenantId!,
            agent_id: clone.id,
            skill_id: s.skill_id,
            is_primary: s.is_primary,
          })),
        )
      }

      return clone as ZiroAgent
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.agents.all })
    },
  })
}

// ── Ziro orchestrator config ────────────────────────────

export function useZiroConfig(tenantId: string | null) {
  return useQuery({
    queryKey: ['ziro-orchestrator-config', tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ziro_config')
        .select('*')
        .eq('tenant_id', tenantId!)
        .maybeSingle()
      if (error) throw error
      return data as ZiroStarConfig | null
    },
  })
}

export function useUpsertZiroConfig(tenantId: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      instructions?: string | null
      routing_rules?: Record<string, unknown>
      delegation_rules?: unknown[]
    }) => {
      const { error } = await supabase
        .from('ziro_config')
        .upsert({
          tenant_id: tenantId!,
          instructions: input.instructions ?? null,
          routing_rules: input.routing_rules ?? {},
          delegation_rules: input.delegation_rules ?? [],
          updated_at: new Date().toISOString(),
        }, { onConflict: 'tenant_id' })
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ziro-orchestrator-config', tenantId] })
    },
  })
}
