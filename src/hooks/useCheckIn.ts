import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

export interface CheckInResult {
  session_id: string
  action: string
  status: string
  teacher_rate: number
  tally_granted: boolean
  payment_gated: boolean
}

export function useCheckIn() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ blockId, action, userId }: { blockId: string; action: 'check_in' | 'call_out' | 'no_show'; userId: string }): Promise<CheckInResult> => {
      const { data, error } = await supabase.rpc('check_in_block', {
        p_block_id: blockId,
        p_action: action,
        p_user_id: userId,
      })
      if (error) throw error
      return data as CheckInResult
    },
    onSuccess: async () => {
      qc.invalidateQueries({ queryKey: ['schedule-grid'] })
      qc.invalidateQueries({ queryKey: ['schedule-intelligence'] })
      qc.invalidateQueries({ queryKey: ['student-blocks'] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
      qc.invalidateQueries({ queryKey: ['teacher-pay-summary'] })
      qc.invalidateQueries({ queryKey: ['teachers-monthly-tally'] })
      // DB trigger updates students.teacher_id on check-in
      qc.invalidateQueries({ queryKey: ['students'] })
      qc.invalidateQueries({ queryKey: ['students_roster'] })
      qc.invalidateQueries({ queryKey: ['student-detail'] })
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['families_page'] }),
        qc.invalidateQueries({ queryKey: ['families_roster'] }),
      ])
      qc.invalidateQueries({ queryKey: ['family_detail'] })
      qc.invalidateQueries({ queryKey: ['family_activity'] })
    },
  })
}
