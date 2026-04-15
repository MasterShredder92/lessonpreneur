import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { qk } from '../lib/queryKeys'

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
    mutationFn: async ({ blockId, action }: { blockId: string; action: 'check_in' | 'call_out' | 'no_show' }): Promise<CheckInResult> => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user?.id) throw new Error('Not authenticated')
      const { data, error } = await supabase.rpc('check_in_block', {
        p_block_id: blockId,
        p_action: action,
        p_user_id: user.id,
      })
      if (error) throw error
      return data as CheckInResult
    },
    onSuccess: async () => {
      qc.invalidateQueries({ queryKey: qk.schedule.all })
      qc.invalidateQueries({ queryKey: qk.schedule.intelligence })
      qc.invalidateQueries({ queryKey: qk.students.blocks })
      qc.invalidateQueries({ queryKey: qk.dashboard.all })
      qc.invalidateQueries({ queryKey: qk.teachers.paySummary })
      qc.invalidateQueries({ queryKey: qk.teachers.monthlyTally })
      // DB trigger updates students.teacher_id on check-in
      qc.invalidateQueries({ queryKey: qk.students.all })
      qc.invalidateQueries({ queryKey: qk.students.roster })
      qc.invalidateQueries({ queryKey: qk.students.detail })
      await Promise.all([
        qc.invalidateQueries({ queryKey: qk.families.page }),
        qc.invalidateQueries({ queryKey: qk.families.roster }),
      ])
      qc.invalidateQueries({ queryKey: qk.families.fileDetail })
      qc.invalidateQueries({ queryKey: ['family_activity'] })
      qc.invalidateQueries({ queryKey: qk.billing.snapshot })
    },
  })
}
