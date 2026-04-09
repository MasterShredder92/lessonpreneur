import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { qk } from '../lib/queryKeys'

export interface StudentInstrument {
  id: string
  tenant_id: string
  student_id: string
  instrument: string
  teacher_id: string | null
  rate_per_session: number
  sessions_per_month: number
  is_primary: boolean
  status: string
}

export function useStudentInstruments(studentId: string | undefined) {
  return useQuery({
    queryKey: qk.students.instruments(studentId),
    enabled: !!studentId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('student_instruments')
        .select('*')
        .eq('student_id', studentId!)
        .eq('status', 'active')
        .order('is_primary', { ascending: false })
        .order('created_at', { ascending: true })
      if (error) throw error
      return (data ?? []) as StudentInstrument[]
    },
  })
}

export function useSaveStudentInstruments() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ studentId, tenantId, instruments, removedIds }: {
      studentId: string
      tenantId: string
      instruments: { id?: string; instrument: string; teacher_id: string | null; is_primary: boolean; rate_per_session: number; sessions_per_month: number }[]
      removedIds: string[]
    }) => {
      // Delete removed rows
      if (removedIds.length > 0) {
        await supabase.from('student_instruments').delete().in('id', removedIds)
      }

      // Upsert remaining rows
      for (const inst of instruments) {
        if (inst.id) {
          await supabase.from('student_instruments').update({
            instrument: inst.instrument,
            teacher_id: inst.teacher_id || null,
            is_primary: inst.is_primary,
            rate_per_session: inst.rate_per_session,
            sessions_per_month: inst.sessions_per_month,
          }).eq('id', inst.id)
        } else {
          await supabase.from('student_instruments').insert({
            tenant_id: tenantId,
            student_id: studentId,
            instrument: inst.instrument,
            teacher_id: inst.teacher_id || null,
            is_primary: inst.is_primary,
            rate_per_session: inst.rate_per_session,
            sessions_per_month: inst.sessions_per_month,
          })
        }
      }

      // Sync primary back to students table
      const primary = instruments.find(i => i.is_primary) ?? instruments[0]
      if (primary) {
        await supabase.from('students').update({
          instrument: primary.instrument,
          teacher_id: primary.teacher_id || null,
        }).eq('id', studentId)
      }
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: qk.students.instruments(vars.studentId) })
      qc.invalidateQueries({ queryKey: qk.students.detail })
      qc.invalidateQueries({ queryKey: qk.students.all })
    },
  })
}
