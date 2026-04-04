import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

export function useCheckIn() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ blockId, action, userId }: { blockId: string; action: 'check_in' | 'call_out' | 'no_show'; userId: string }) => {
      if (action === 'check_in') {
        const { error } = await supabase
          .from('schedule_blocks')
          .update({ checked_in: true })
          .eq('id', blockId)
        if (error) throw error
      } else if (action === 'call_out') {
        const { error } = await supabase
          .from('schedule_blocks')
          .update({ block_type: 'call_out' })
          .eq('id', blockId)
        if (error) throw error
      } else if (action === 'no_show') {
        const { error } = await supabase
          .from('schedule_blocks')
          .update({ notes: '[No Show]' })
          .eq('id', blockId)
        if (error) throw error
      }
      return { action }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['schedule-grid'] })
      qc.invalidateQueries({ queryKey: ['schedule-intelligence'] })
      qc.invalidateQueries({ queryKey: ['student-blocks'] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
      qc.invalidateQueries({ queryKey: ['teacher-pay-summary'] })
      qc.invalidateQueries({ queryKey: ['teachers-monthly-tally'] })
      // DB trigger updates students.teacher_id on check-in
      qc.invalidateQueries({ queryKey: ['students'] })
      qc.invalidateQueries({ queryKey: ['student-detail'] })
      qc.invalidateQueries({ queryKey: ['families_page'] })
      qc.invalidateQueries({ queryKey: ['family_detail'] })
      qc.invalidateQueries({ queryKey: ['family_activity'] })
    },
  })
}
