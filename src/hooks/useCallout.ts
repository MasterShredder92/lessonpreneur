import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

interface CoverageBlock {
  block_id: string
  start_time: string
  end_time: string
  student_name: string
  instrument: string
  room_id: string | null
  suggestions: {
    teacher_id: string
    teacher_name: string
    instruments: string[]
    priority: number
    match_score: number
    available_block_id: string | null
  }[]
}

export interface CoverageResult {
  teacher_id: string
  date: string
  location_id: string
  blocks: CoverageBlock[]
  total_blocks: number
}

export function useFindCoverage() {
  return useMutation({
    mutationFn: async ({ teacherId, date, tenantId }: { teacherId: string; date: string; tenantId: string }) => {
      const { data, error } = await supabase.rpc('find_coverage', {
        p_teacher_id: teacherId,
        p_date: date,
        p_tenant_id: tenantId,
      })
      if (error) throw error
      return data as CoverageResult
    },
  })
}

export function useTransferBlock() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ blockId, newTeacherId, availableBlockId }: { blockId: string; newTeacherId: string; availableBlockId?: string | null }) => {
      const { data, error } = await supabase.rpc('transfer_block_to_sub', {
        p_block_id: blockId,
        p_new_teacher_id: newTeacherId,
        p_available_block_id: availableBlockId ?? null,
      })
      if (error) throw error
      return data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['schedule-grid'] })
      qc.invalidateQueries({ queryKey: ['schedule-intelligence'] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
    },
  })
}
