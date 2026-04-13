import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from './useAuth'

const TENANT_ID = '00000000-0000-0000-0000-000000000001'

export interface DirectorNote {
  id: string
  tenant_id: string
  student_id: string
  author_id: string
  author_name: string
  note_text: string
  created_at: string
}

export function useDirectorNotes(studentId: string | undefined) {
  return useQuery({
    queryKey: ['director_notes', studentId],
    queryFn: async () => {
      if (!studentId) return []
      const { data, error } = await supabase
        .from('student_director_notes')
        .select('id, tenant_id, student_id, author_id, author_name, note_text, created_at')
        .eq('tenant_id', TENANT_ID)
        .eq('student_id', studentId)
        .order('created_at', { ascending: false })
        .limit(200)
      if (error) throw error
      return (data ?? []) as DirectorNote[]
    },
    enabled: !!studentId,
  })
}

export function useAddDirectorNote() {
  const qc = useQueryClient()
  const { profile } = useAuth()

  return useMutation({
    mutationFn: async ({ studentId, noteText }: { studentId: string; noteText: string }) => {
      const authorName = profile
        ? `${profile.first_name ?? ''} ${profile.last_name ?? ''}`.trim() || 'Unknown'
        : 'Unknown'

      const { data, error } = await supabase
        .from('student_director_notes')
        .insert({
          tenant_id: TENANT_ID,
          student_id: studentId,
          author_id: profile?.id ?? '',
          author_name: authorName,
          note_text: noteText,
        })
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ['director_notes', variables.studentId] })
    },
  })
}
