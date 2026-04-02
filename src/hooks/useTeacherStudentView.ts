import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuthContext } from '../app/AuthContext'

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
    queryKey: ['teacher-student-detail', studentId],
    enabled: !!studentId && !!profile?.id,
    queryFn: async () => {
      if (!studentId) return null

      // Get teacher ID
      const { data: teacher } = await supabase.from('teachers').select('id').eq('profile_id', profile!.id).single()
      if (!teacher) return null

      // Get student LIMITED data (no parent contact info)
      const { data: student } = await supabase
        .from('students')
        .select('id, first_name, instrument, family_id, location_id')
        .eq('id', studentId)
        .single()
      if (!student) return null

      // Parent FIRST NAME only
      let parentFirstName: string | null = null
      if (student.family_id) {
        const { data: family } = await supabase.from('families').select('parent_name').eq('id', student.family_id).single()
        if (family?.parent_name) parentFirstName = family.parent_name.split(' ')[0]
      }

      // Location name
      let locationName: string | null = null
      if (student.location_id) {
        const { data: loc } = await supabase.from('locations').select('name').eq('id', student.location_id).single()
        locationName = loc?.name?.replace(' Music Lessons', '') ?? null
      }

      // Session history (teacher's own sessions with this student)
      const { data: sessions } = await supabase
        .from('session_log')
        .select('block_date, worked_on, engagement_level, progress_indicator')
        .eq('student_id', studentId)
        .eq('teacher_id', teacher.id)
        .order('block_date', { ascending: false })
        .limit(20)

      // Achievements
      const { data: achievements } = await supabase
        .from('student_achievements')
        .select('achievement_key, achievement_name, achievement_emoji, earned_at')
        .eq('student_id', studentId)
        .order('earned_at', { ascending: false })

      // Practice stats
      const { count: practiceCount } = await supabase.from('practice_sessions').select('id', { count: 'exact', head: true }).eq('student_id', studentId)

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
