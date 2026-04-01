import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { LESSON_LOOKBACK_DAYS } from '../lib/constants'

export interface StudentBlock {
  id: string
  block_date: string
  start_time: string
  end_time: string
  status: string
  is_recurring: boolean
  teacher_name: string
  location_name: string
}

export function useStudentBlocks(studentId: string | undefined) {
  return useQuery({
    queryKey: ['student-blocks', studentId],
    enabled: !!studentId,
    queryFn: async () => {
      const today = new Date().toISOString().split('T')[0]
      const fourWeeks = new Date()
      fourWeeks.setDate(fourWeeks.getDate() + LESSON_LOOKBACK_DAYS)
      const endDate = fourWeeks.toISOString().split('T')[0]

      const { data: blocks, error } = await supabase
        .from('schedule_blocks')
        .select('id, block_date, start_time, end_time, status, is_recurring, teacher_id, location_id')
        .eq('student_id', studentId!)
        .gte('block_date', today)
        .lte('block_date', endDate)
        .order('block_date')
        .order('start_time')

      if (error) throw error
      if (!blocks || blocks.length === 0) return []

      // Get teacher names
      const teacherIds = [...new Set(blocks.map((b: any) => b.teacher_id))]
      const { data: teachers } = await supabase
        .from('teachers')
        .select('id, first_name, last_name, profile:profiles!teachers_profile_id_fkey(first_name, last_name)')
        .in('id', teacherIds)
      const teacherMap = new Map(teachers?.map((t: any) => [t.id, `${t.first_name ?? t.profile?.first_name ?? ''} ${t.last_name ?? t.profile?.last_name ?? ''}`.trim()]) ?? [])

      // Get location names
      const locIds = [...new Set(blocks.map((b: any) => b.location_id))]
      const { data: locations } = await supabase.from('locations').select('id, name').in('id', locIds)
      const locMap = new Map(locations?.map((l: any) => [l.id, l.name?.replace(' Music Lessons', '')]) ?? [])

      return blocks.map((b: any) => ({
        id: b.id,
        block_date: b.block_date,
        start_time: b.start_time,
        end_time: b.end_time,
        status: b.status,
        is_recurring: b.is_recurring,
        teacher_name: teacherMap.get(b.teacher_id) ?? 'Unknown',
        location_name: locMap.get(b.location_id) ?? 'Unknown',
      })) as StudentBlock[]
    },
  })
}

export function useAvailableBlocksForStudent(studentId: string | undefined, locationId: string | undefined, teacherId: string | null | undefined) {
  return useQuery({
    queryKey: ['available-blocks-for-student', studentId, locationId, teacherId],
    enabled: !!studentId && !!locationId,
    queryFn: async () => {
      const today = new Date().toISOString().split('T')[0]
      const fourWeeks = new Date()
      fourWeeks.setDate(fourWeeks.getDate() + LESSON_LOOKBACK_DAYS)
      const endDate = fourWeeks.toISOString().split('T')[0]

      let query = supabase
        .from('schedule_blocks')
        .select('id, block_date, start_time, end_time, teacher_id, location_id')
        .eq('status', 'available')
        .eq('location_id', locationId!)
        .gte('block_date', today)
        .lte('block_date', endDate)
        .order('block_date')
        .order('start_time')

      if (teacherId) {
        query = query.eq('teacher_id', teacherId)
      }

      const { data: blocks, error } = await query
      if (error) throw error

      // Get teacher names
      const teacherIds = [...new Set(blocks?.map((b: any) => b.teacher_id) ?? [])]
      const teacherMap = new Map<string, string>()
      if (teacherIds.length > 0) {
        const { data: teachers } = await supabase
          .from('teachers')
          .select('id, first_name, last_name, profile:profiles!teachers_profile_id_fkey(first_name, last_name)')
          .in('id', teacherIds)
        teachers?.forEach((t: any) => teacherMap.set(t.id, `${t.first_name ?? t.profile?.first_name ?? ''} ${t.last_name ?? t.profile?.last_name ?? ''}`.trim()))
      }

      return (blocks ?? []).map((b: any) => ({
        ...b,
        teacher_name: teacherMap.get(b.teacher_id) ?? 'Unknown',
      }))
    },
  })
}
