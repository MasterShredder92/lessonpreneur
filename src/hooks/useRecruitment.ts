import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuthContext } from '../app/AuthContext'
import { qk } from '../lib/queryKeys'

export interface Prospect {
  id: string
  first_name: string
  last_name: string
  email: string | null
  phone: string | null
  instruments: string[]
  source: string | null
  source_detail: string | null
  status: string
  location_id: string | null
  location_name: string | null
  notes: string | null
  resume_url: string | null
  created_at: string
}

export const PIPELINE_STAGES = [
  { value: 'new', label: 'New', color: '#3b82f6' },
  { value: 'contacted', label: 'Contacted', color: '#8B5CF6' },
  { value: 'screening', label: 'Screening', color: '#fb923c' },
  { value: 'interview', label: 'Interview', color: '#FFB800' },
  { value: 'trial', label: 'Trial', color: '#22C55E' },
  { value: 'hired', label: 'Hired', color: '#16A34A' },
  { value: 'rejected', label: 'Rejected', color: '#EF4444' },
  { value: 'withdrawn', label: 'Withdrawn', color: '#8080A8' },
]

export function useProspects() {
  const { tenantId } = useAuthContext()
  return useQuery<Prospect[]>({
    queryKey: [...qk.recruitment.prospects, tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('recruitment_prospects')
        .select('*')
        .eq('tenant_id', tenantId!)
        .order('created_at', { ascending: false })
      if (error) throw error

      const locIds = [...new Set((data ?? []).map(p => p.location_id).filter(Boolean))]
      const locMap = new Map<string, string>()
      if (locIds.length > 0) {
        const { data: locs } = await supabase.from('locations').select('id, name').in('id', locIds)
        locs?.forEach((l: any) => locMap.set(l.id, l.name?.replace(' Music Lessons', '') ?? ''))
      }

      return (data ?? []).map((p: any): Prospect => ({
        ...p,
        location_name: p.location_id ? locMap.get(p.location_id) ?? null : null,
      }))
    },
  })
}

export function useCreateProspect() {
  const { tenantId } = useAuthContext()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (params: { first_name: string; last_name: string; email?: string; phone?: string; instruments?: string[]; source?: string; location_id?: string; notes?: string }) => {
      const { error } = await supabase.from('recruitment_prospects').insert({ ...params, tenant_id: tenantId! })
      if (error) throw error
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: qk.recruitment.prospects }) },
  })
}

export function useUpdateProspectStatus() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase.from('recruitment_prospects').update({ status }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: qk.recruitment.prospects }) },
  })
}

export function useUpdateProspect() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<Prospect> & { id: string }) => {
      const { error } = await supabase.from('recruitment_prospects').update(updates).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: qk.recruitment.prospects }) },
  })
}

export function useDeleteProspect() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('recruitment_prospects').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: qk.recruitment.prospects }) },
  })
}
