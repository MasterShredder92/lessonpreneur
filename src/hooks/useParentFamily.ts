import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuthContext } from '../app/AuthContext'
import { qk } from '../lib/queryKeys'

export interface FamilyStudent {
  id: string
  first_name: string
  last_name: string
  instrument: string | null
  status: string
  teacher_id: string | null
  teacher_name: string | null
  location_id: string
}

export function useParentFamily() {
  const { profile, tenantId } = useAuthContext()

  const { data: familyId, isLoading: familyLoading } = useQuery({
    queryKey: [...qk.parent.familyId, profile?.id],
    enabled: !!profile,
    queryFn: async () => {
      // Primary: lookup via families.profile_id
      const { data: byProfile } = await supabase
        .from('families')
        .select('id')
        .eq('profile_id', profile!.id)
        .limit(1)
        .single()
      if (byProfile) return byProfile.id

      // Fallback: lookup via email match
      if (profile!.email) {
        const { data: byEmail } = await supabase
          .from('families')
          .select('id')
          .ilike('primary_email', profile!.email!)
          .limit(1)
          .single()
        if (byEmail) return byEmail.id
      }
      return null
    },
  })

  const { data: students, isLoading: studentsLoading } = useQuery<FamilyStudent[]>({
    queryKey: [...qk.parent.students, familyId],
    enabled: !!familyId,
    queryFn: async () => {
      const { data } = await supabase
        .from('students')
        .select('id, first_name, last_name, instrument, status, teacher_id, location_id')
        .eq('family_id', familyId!)
        .eq('status', 'active')
        .order('first_name')

      if (!data || data.length === 0) return []

      const teacherIds = [...new Set(data.map(s => s.teacher_id).filter(Boolean))]
      const teacherMap = new Map<string, string>()
      if (teacherIds.length > 0) {
        const { data: teachers } = await supabase
          .from('teachers')
          .select('id, first_name, last_name')
          .in('id', teacherIds)
        teachers?.forEach((t: any) => teacherMap.set(t.id, `${t.first_name} ${t.last_name}`.trim()))
      }

      return data.map((s: any) => ({
        ...s,
        teacher_name: s.teacher_id ? teacherMap.get(s.teacher_id) ?? null : null,
      }))
    },
  })

  return {
    familyId: familyId ?? null,
    students: students ?? [],
    tenantId,
    isLoading: familyLoading || studentsLoading,
  }
}
