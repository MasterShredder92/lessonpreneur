import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuthContext } from '../app/AuthContext'

interface ActivityEntry {
  id: string
  user_name: string
  action: string
  entity_type: string
  entity_name: string | null
  details: string | null
  created_at: string
}

export function useLogActivity() {
  const { profile, tenantId } = useAuthContext()
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (params: {
      action: string
      entity_type: string
      entity_id?: string
      entity_name?: string
      details?: string
    }) => {
      if (!tenantId || !profile) return
      const { error } = await supabase.from('activity_log').insert({
        tenant_id: tenantId,
        user_id: profile.id,
        user_name: `${profile.first_name} ${profile.last_name}`,
        ...params,
      })
      if (error) { /* silently fail — activity logging is non-critical */ }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['activity-log'] })
    },
  })
}

export function useEntityActivity(entityType: string, entityId: string | undefined) {
  return useQuery({
    queryKey: ['activity-log', entityType, entityId],
    enabled: !!entityId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('activity_log')
        .select('id, user_name, action, entity_type, entity_name, details, created_at')
        .eq('entity_type', entityType)
        .eq('entity_id', entityId!)
        .order('created_at', { ascending: false })
        .limit(20)
      if (error) throw error
      return data as ActivityEntry[]
    },
  })
}
