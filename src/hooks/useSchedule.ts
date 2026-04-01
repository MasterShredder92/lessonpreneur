import { useMutation } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

interface BlockGenResult {
  windows_processed: number
  blocks_created: number
  blocks_skipped: number
  recurring_propagated: number
  date_range: string
}

export function useGenerateBlocks() {
  return useMutation({
    mutationFn: async (tenantId: string) => {
      const { data, error } = await supabase.rpc('generate_schedule_blocks', {
        p_tenant_id: tenantId,
        p_weeks_ahead: 8,
      })
      if (error) throw error
      return data as BlockGenResult
    },
  })
}
