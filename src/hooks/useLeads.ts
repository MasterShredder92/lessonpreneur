import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuthContext } from '../app/AuthContext'

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
  created_at: string
  updated_at: string
  // Enriched
  location_name?: string
  days_since_created?: number
  needs_follow_up?: boolean
}

export function useLeads(filters?: { locationId?: string; instrument?: string }) {
  const { tenantId } = useAuthContext()
  return useQuery({
    queryKey: ['leads', tenantId, filters],
    enabled: !!tenantId,
    queryFn: async () => {
      let query = supabase
        .from('leads')
        .select('*')
        .eq('tenant_id', tenantId!)
        .order('created_at', { ascending: false })

      if (filters?.locationId) query = query.eq('location_id', filters.locationId)
      if (filters?.instrument) query = query.eq('instrument', filters.instrument)

      const { data, error } = await query
      if (error) throw error

      const locIds = [...new Set(data.filter((l: any) => l.location_id).map((l: any) => l.location_id))]
      const locMap = new Map<string, string>()
      if (locIds.length > 0) {
        const { data: locs } = await supabase.from('locations').select('id, name').eq('tenant_id', tenantId!).in('id', locIds)
        locs?.forEach((l: any) => locMap.set(l.id, l.name?.replace(' Music Lessons', '') ?? ''))
      }

      const now = Date.now()
      return data.map((l: any) => {
        const created = new Date(l.created_at).getTime()
        const daysSince = Math.floor((now - created) / (1000 * 60 * 60 * 24))
        const lastChange = new Date(l.updated_at).getTime()
        const daysSinceChange = Math.floor((now - lastChange) / (1000 * 60 * 60 * 24))
        return {
          ...l,
          location_name: l.location_id ? locMap.get(l.location_id) ?? '—' : '—',
          days_since_created: daysSince,
          needs_follow_up: daysSinceChange >= 3 && !['enrolled', 'lost'].includes(l.stage),
        }
      }) as LeadRow[]
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
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['leads'] }) },
  })
}

export function useUpdateLead() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<LeadRow> & { id: string }) => {
      const { error } = await supabase.from('leads').update(updates).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['leads'] }) },
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
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['leads'] }) },
  })
}
