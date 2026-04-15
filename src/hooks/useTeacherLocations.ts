import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { qk } from '../lib/queryKeys'

export function useTeacherLocations(teacherId: string | undefined) {
  return useQuery({
    queryKey: qk.teachers.locations(teacherId),
    enabled: !!teacherId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('teacher_locations')
        .select('location_id, locations(id, name)')
        .eq('teacher_id', teacherId!)

      if (error) throw error
      return data as { location_id: string; locations: { id: string; name: string } }[]
    },
  })
}

export function useTeachersAtLocation(locationId: string | undefined) {
  return useQuery({
    queryKey: qk.teachers.atLocation(locationId),
    enabled: !!locationId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('teacher_locations')
        .select(`
          teacher_id,
          teachers(
            id,
            sub_available,
            profile:profiles!teachers_profile_id_fkey(first_name, last_name)
          )
        `)
        .eq('location_id', locationId!)

      if (error) throw error
      return data as {
        teacher_id: string
        teachers: {
          id: string
          sub_available: boolean
          profile: { first_name: string; last_name: string }
        }
      }[]
    },
  })
}

export function useToggleTeacherLocation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (params: {
      teacher_id: string
      location_id: string
      assigned: boolean
    }) => {
      if (params.assigned) {
        // Remove assignment
        const { error } = await supabase
          .from('teacher_locations')
          .delete()
          .eq('teacher_id', params.teacher_id)
          .eq('location_id', params.location_id)

        if (error) throw error
      } else {
        // Add assignment
        const { error } = await supabase
          .from('teacher_locations')
          .insert({
            teacher_id: params.teacher_id,
            location_id: params.location_id,
          })

        if (error) throw error
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.teachers.locations })
      qc.invalidateQueries({ queryKey: ['teachers-at-location'] })
      qc.invalidateQueries({ queryKey: qk.teachers.all })
      qc.invalidateQueries({ queryKey: ['teachers-overview'] })
      qc.invalidateQueries({ queryKey: ['teachers', 'schedule-roster'] })
    },
  })
}

export function useToggleSubAvailable() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (params: { teacher_id: string; sub_available: boolean }) => {
      const { error } = await supabase
        .from('teachers')
        .update({ sub_available: !params.sub_available })
        .eq('id', params.teacher_id)

      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.teachers.all })
      qc.invalidateQueries({ queryKey: ['teachers-at-location'] })
      qc.invalidateQueries({ queryKey: ['teachers-overview'] })
      qc.invalidateQueries({ queryKey: ['teachers', 'schedule-roster'] })
    },
  })
}
