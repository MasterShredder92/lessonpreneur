import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuthContext } from '../app/AuthContext'
import { qk } from '../lib/queryKeys'
import { logQueryPerf } from '../lib/performance/metrics'

export interface LeadRow {
  id: string
  tenant_id: string
  location_id: string | null
  first_name: string
  last_name: string | null
  parent_name: string | null
  email: string | null
  phone: string | null
  instrument: string | null
  age: string | null
  goals: string | null
  preferred_days: string[] | null
  preferred_times: string | null
  stage: 'inquiry' | 'contacted' | 'scheduled' | 'enrolled' | 'lost'
  source: string | null
  how_heard: string | null
  is_military: boolean
  assigned_teacher_id: string | null
  matched_block_id: string | null
  converted_student_id: string | null
  follow_up_count: number
  last_contact_at: string | null
  next_follow_up_at: string | null
  notes: string | null
  lost_category?: string | null
  lost_reason?: string | null
  tags: string[] | null
  next_action: string | null
  age_range: string | null
  experience: string | null
  has_instrument: string | null
  preferred_locations: string[] | null
  personality_notes: string | null
  student_name: string | null
  family_id: string | null
  compatibility_score: number | null
  matched_teacher_id: string | null
  referral_source: string | null
  secondary_location_ids: string[] | null
  intake_submission_id: string | null
  created_at: string
  updated_at: string
  // Enriched
  location_name?: string
  days_since_created?: number
  needs_follow_up?: boolean
}

export function useLeads(
  filters?: { locationId?: string; instrument?: string },
  options?: { enabled?: boolean },
) {
  const { tenantId } = useAuthContext()
  return useQuery({
    queryKey: qk.leads.list(tenantId, filters),
    enabled: !!tenantId && (options?.enabled !== false),
    queryFn: async () => {
      const _t0 = performance.now()
      const { data: bundle, error } = await supabase.rpc('get_leads_list_for_tenant', {
        p_tenant_id: tenantId!,
        p_location_id: filters?.locationId ?? null,
        p_instrument: filters?.instrument ?? null,
        p_limit: 500,
      })
      if (error) throw error
      const rows = (bundle as { leads?: LeadRow[] } | null)?.leads
      const result = (Array.isArray(rows) ? rows : []) as LeadRow[]
      logQueryPerf(tenantId!, 'leads.list', performance.now() - _t0, { tableName: 'leads', rowCount: result.length })
      return result
    },
  })
}

export function useUpdateLeadStage() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, stage, familyId }: { id: string; stage: string; familyId?: string | null }) => {
      const now = new Date().toISOString()
      if (familyId) {
        // Advance all leads in the family together
        const { error } = await supabase
          .from('leads')
          .update({ stage, updated_at: now })
          .eq('family_id', familyId)
        if (error) throw error
      } else {
        const { error } = await supabase
          .from('leads')
          .update({ stage, updated_at: now })
          .eq('id', id)
        if (error) throw error
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.leads.all })
      qc.invalidateQueries({ queryKey: qk.dashboard.all })
    },
  })
}

export function useUpdateLead() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<LeadRow> & { id: string }) => {
      const { error } = await supabase.from('leads').update(updates).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.leads.all })
      qc.invalidateQueries({ queryKey: qk.dashboard.all })
    },
  })
}

export function useUpdateLeadsInFamily() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ familyId, updates }: { familyId: string; updates: Partial<LeadRow> }) => {
      const { error } = await supabase.from('leads').update(updates).eq('family_id', familyId)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.leads.all })
      qc.invalidateQueries({ queryKey: qk.dashboard.all })
    },
  })
}

export function useCreateLead() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (lead: {
      tenant_id: string
      first_name: string
      last_name?: string
      parent_name?: string
      email?: string
      phone?: string
      instrument?: string
      location_id?: string
      stage: string
      source?: string
      notes?: string
      is_military?: boolean
    }) => {
      const { data, error } = await supabase.from('leads').insert({
        ...lead,
        last_name: lead.last_name || null,
        parent_name: lead.parent_name || null,
        email: lead.email || null,
        phone: lead.phone || null,
        instrument: lead.instrument || null,
        location_id: lead.location_id || null,
        source: lead.source || 'walk-in',
        notes: lead.notes || null,
        is_military: lead.is_military ?? false,
      }).select('id').single()
      if (error) throw error
      return data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.leads.all })
      qc.invalidateQueries({ queryKey: qk.dashboard.all })
    },
  })
}
