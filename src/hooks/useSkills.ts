import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuthContext } from '../app/AuthContext'
import { qk } from '../lib/queryKeys'

// ── Types ───────────────────────────────────────────────

export interface ZiroSkill {
  id: string
  tenant_id: string
  key: string
  name: string
  description: string | null
  business_context: string | null
  runtime: string
  allowed_tools: string[]
  system_prompt_fragment: string | null
  risk_tier: 'low' | 'medium' | 'high' | 'critical'
  cost_tier: 'free' | 'low' | 'medium' | 'high'
  is_active: boolean
  is_system: boolean
  created_by: string | null
  approved_by: string | null
  approved_at: string | null
  last_used_at: string | null
  use_count: number
  created_at: string
  updated_at: string
}

export interface ZiroSkillProposal {
  id: string
  tenant_id: string
  proposed_key: string
  proposed_name: string
  proposed_description: string | null
  proposed_business_context: string | null
  proposed_runtime: string
  proposed_allowed_tools: string[]
  proposed_system_prompt_fragment: string | null
  proposed_risk_tier: string
  proposed_cost_tier: string
  reason: string | null
  status: 'pending' | 'approved' | 'rejected'
  reviewed_by: string | null
  reviewed_at: string | null
  promoted_skill_id: string | null
  created_at: string
}

export interface ZiroSkillAssignment {
  id: string
  skill_id: string
  workflow_id: string
  assigned_at: string
}

export type SkillFormData = {
  key: string
  name: string
  description: string
  business_context: string
  runtime: string
  allowed_tools: string[]
  system_prompt_fragment: string
  risk_tier: 'low' | 'medium' | 'high' | 'critical'
  cost_tier: 'free' | 'low' | 'medium' | 'high'
}

// ── Queries ─────────────────────────────────────────────

export function useSkills() {
  const { tenantId } = useAuthContext()
  return useQuery<ZiroSkill[]>({
    queryKey: qk.skills.list(tenantId),
    enabled: !!tenantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ziro_skills')
        .select('*')
        .eq('tenant_id', tenantId!)
        .order('is_active', { ascending: false })
        .order('name')
      if (error) throw error
      return data ?? []
    },
  })
}

export function useSkillProposals() {
  const { tenantId } = useAuthContext()
  return useQuery<ZiroSkillProposal[]>({
    queryKey: qk.skills.proposals(tenantId),
    enabled: !!tenantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ziro_skill_proposals')
        .select('*')
        .eq('tenant_id', tenantId!)
        .order('created_at', { ascending: false })
        .limit(50)
      if (error) throw error
      return data ?? []
    },
  })
}

export function useSkillAssignments(skillId?: string) {
  const { tenantId } = useAuthContext()
  return useQuery<ZiroSkillAssignment[]>({
    queryKey: qk.skills.assignments(skillId ?? ''),
    enabled: !!tenantId && !!skillId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ziro_skill_assignments')
        .select('*')
        .eq('skill_id', skillId!)
        .eq('tenant_id', tenantId!)
      if (error) throw error
      return data ?? []
    },
  })
}

// ── Mutations ───────────────────────────────────────────

export function useCreateSkill() {
  const { tenantId, user } = useAuthContext()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (form: SkillFormData) => {
      const { data, error } = await supabase
        .from('ziro_skills')
        .insert({
          tenant_id: tenantId!,
          key: form.key,
          name: form.name,
          description: form.description || null,
          business_context: form.business_context || null,
          runtime: form.runtime,
          allowed_tools: form.allowed_tools,
          system_prompt_fragment: form.system_prompt_fragment || null,
          risk_tier: form.risk_tier,
          cost_tier: form.cost_tier,
          is_active: false, // new skills start inactive — require approval
          created_by: user?.id,
        })
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.skills.all })
    },
  })
}

export function useUpdateSkill() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<SkillFormData> & { id: string }) => {
      const { error } = await supabase
        .from('ziro_skills')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.skills.all })
    },
  })
}

export function useToggleSkill() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const updates: Record<string, unknown> = { is_active, updated_at: new Date().toISOString() }
      // If activating, record approval
      if (is_active) {
        updates.approved_at = new Date().toISOString()
      }
      const { error } = await supabase.from('ziro_skills').update(updates).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.skills.all })
    },
  })
}

export function useDeleteSkill() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('ziro_skills').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.skills.all })
    },
  })
}

// ── Proposal actions ────────────────────────────────────

export function useApproveProposal() {
  const { tenantId, user } = useAuthContext()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (proposal: ZiroSkillProposal) => {
      // Create the skill from the proposal
      const { data: skill, error: createErr } = await supabase
        .from('ziro_skills')
        .insert({
          tenant_id: tenantId!,
          key: proposal.proposed_key,
          name: proposal.proposed_name,
          description: proposal.proposed_description,
          business_context: proposal.proposed_business_context,
          runtime: proposal.proposed_runtime,
          allowed_tools: proposal.proposed_allowed_tools,
          system_prompt_fragment: proposal.proposed_system_prompt_fragment,
          risk_tier: proposal.proposed_risk_tier,
          cost_tier: proposal.proposed_cost_tier,
          is_active: true,
          approved_by: user?.id,
          approved_at: new Date().toISOString(),
        })
        .select()
        .single()
      if (createErr) throw createErr

      // Mark proposal as approved
      const { error: updateErr } = await supabase
        .from('ziro_skill_proposals')
        .update({
          status: 'approved',
          reviewed_by: user?.id,
          reviewed_at: new Date().toISOString(),
          promoted_skill_id: skill.id,
        })
        .eq('id', proposal.id)
      if (updateErr) throw updateErr

      return skill
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.skills.all })
    },
  })
}

export function useRejectProposal() {
  const { user } = useAuthContext()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (proposalId: string) => {
      const { error } = await supabase
        .from('ziro_skill_proposals')
        .update({
          status: 'rejected',
          reviewed_by: user?.id,
          reviewed_at: new Date().toISOString(),
        })
        .eq('id', proposalId)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.skills.all })
    },
  })
}

// ── Workflow assignment ─────────────────────────────────

export function useAssignSkillToWorkflow() {
  const { tenantId, user } = useAuthContext()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ skillId, workflowId }: { skillId: string; workflowId: string }) => {
      const { error } = await supabase.from('ziro_skill_assignments').insert({
        tenant_id: tenantId!,
        skill_id: skillId,
        workflow_id: workflowId,
        assigned_by: user?.id,
      })
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.skills.all })
    },
  })
}

export function useUnassignSkillFromWorkflow() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ skillId, workflowId }: { skillId: string; workflowId: string }) => {
      const { error } = await supabase
        .from('ziro_skill_assignments')
        .delete()
        .eq('skill_id', skillId)
        .eq('workflow_id', workflowId)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.skills.all })
    },
  })
}
