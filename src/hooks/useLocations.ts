import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import type { Location } from '../lib/types'
import { qk } from '../lib/queryKeys'

/** @param opts.select PostgREST select list; default `*` (full row). Narrow selects use a separate cache key. */
export function useLocations(opts?: { select?: string; enabled?: boolean }) {
  const select = opts?.select ?? '*'
  return useQuery({
    queryKey: select === '*' ? qk.locations.all : ([...qk.locations.all, 'pick', select] as const),
    enabled: opts?.enabled !== false,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('locations')
        .select(select)
        .order('name')
      if (error) throw error
      return data as Location[]
    },
  })
}

export function useCreateLocation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (loc: Omit<Location, 'id' | 'created_at' | 'updated_at'>) => {
      const { data, error } = await supabase
        .from('locations')
        .insert(loc)
        .select()
        .single()
      if (error) throw error
      return data as Location
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.locations.all }),
  })
}

export function useUpdateLocation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<Location> & { id: string }) => {
      const { data, error } = await supabase
        .from('locations')
        .update(updates)
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      return data as Location
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.locations.all }),
  })
}
