import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuthContext } from '../app/AuthContext'
import { qk } from '../lib/queryKeys'

// ─── Teacher's LIMITED view of a student ─────────────

export interface TeacherStudentData {
  id: string
  firstName: string
  instrument: string | null
  parentFirstName: string | null
  locationName: string | null
  // Session history
  recentSessions: {
    blockDate: string
    workedOn: string[]
    engagementLevel: number | null
    progressIndicator: string | null
  }[]
  totalSessions: number
  lastSessionDate: string | null
  // Achievements
  achievements: { key: string; name: string; emoji: string; earnedAt: string }[]
  // Practice
  practiceCount: number
  practiceStreak: number
}

export function useTeacherStudentDetail(studentId: string | undefined) {
  const { profile } = useAuthContext()

  return useQuery<TeacherStudentData | null>({
    queryKey: qk.teachers.studentDetail(studentId!),
    enabled: !!studentId && !!profile?.id,
    queryFn: async () => {
      if (!studentId) return null

      // Batch 1: Teacher + student lookups in parallel (both independent)
      const [{ data: teacher }, { data: student }] = await Promise.all([
        supabase.from('teachers').select('id').eq('profile_id', profile!.id).single(),
        supabase.from('students').select('id, first_name, instrument, family_id, location_id').eq('id', studentId).single(),
      ])
      if (!teacher || !student) return null

      // Batch 2: All remaining lookups in parallel (family, location, sessions, achievements, practice)
      const [familyResult, locationResult, { data: sessions }, { data: achievements }, { count: practiceCount }] = await Promise.all([
        // Parent FIRST NAME only
        student.family_id
          ? supabase.from('families').select('parent_name').eq('id', student.family_id).single()
          : Promise.resolve({ data: null }),
        // Location name
        student.location_id
          ? supabase.from('locations').select('name').eq('id', student.location_id).single()
          : Promise.resolve({ data: null }),
        // Session history (teacher's own sessions with this student)
        supabase.from('session_log').select('block_date, worked_on, engagement_level, progress_indicator').eq('student_id', studentId).eq('teacher_id', teacher.id).order('block_date', { ascending: false }).limit(20),
        // Achievements
        supabase.from('student_achievements').select('achievement_key, achievement_name, achievement_emoji, earned_at').eq('student_id', studentId).order('earned_at', { ascending: false }),
        // Practice stats
        supabase.from('practice_sessions').select('id', { count: 'exact', head: true }).eq('student_id', studentId),
      ])

      const parentFirstName = (familyResult.data as any)?.parent_name?.split(' ')[0] ?? null
      const locationName = (locationResult.data as any)?.name?.replace(' Music Lessons', '') ?? null

      return {
        id: student.id,
        firstName: student.first_name,
        instrument: student.instrument,
        parentFirstName,
        locationName,
        recentSessions: (sessions ?? []).map(s => ({
          blockDate: s.block_date,
          workedOn: s.worked_on ?? [],
          engagementLevel: s.engagement_level,
          progressIndicator: s.progress_indicator,
        })),
        totalSessions: (sessions ?? []).length,
        lastSessionDate: sessions?.[0]?.block_date ?? null,
        achievements: (achievements ?? []).map(a => ({ key: a.achievement_key, name: a.achievement_name, emoji: a.achievement_emoji, earnedAt: a.earned_at })),
        practiceCount: practiceCount ?? 0,
        practiceStreak: 0, // simplified for now
      }
    },
  })
}
