import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuthContext } from '../app/AuthContext'

export interface Achievement {
  key: string
  name: string
  emoji: string
  category: 'milestone' | 'streak' | 'skill' | 'practice'
  description: string
  check: (data: StudentData) => boolean
}

interface StudentData {
  sessionCount: number
  consecutiveWeeks: number
  workedOnCounts: Record<string, number>
  practiceCount: number
  practiceStreak: number
}

export interface EarnedAchievement {
  id: string
  achievement_key: string
  achievement_name: string
  achievement_emoji: string
  category: string
  earned_at: string
}

export const ALL_ACHIEVEMENTS: Achievement[] = [
  // Milestones
  { key: 'first_note', name: 'First Note', emoji: '\uD83E\uDD49', category: 'milestone', description: 'Completed first session', check: d => d.sessionCount >= 1 },
  { key: 'getting_started', name: 'Getting Started', emoji: '\uD83E\uDD48', category: 'milestone', description: '5 sessions completed', check: d => d.sessionCount >= 5 },
  { key: 'dedicated', name: 'Dedicated', emoji: '\uD83E\uDD47', category: 'milestone', description: '25 sessions completed', check: d => d.sessionCount >= 25 },
  { key: 'committed', name: 'Committed', emoji: '\uD83C\uDFC6', category: 'milestone', description: '50 sessions completed', check: d => d.sessionCount >= 50 },
  { key: 'century_club', name: 'Century Club', emoji: '\uD83D\uDC8E', category: 'milestone', description: '100 sessions completed', check: d => d.sessionCount >= 100 },
  // Streaks
  { key: 'on_fire', name: 'On Fire', emoji: '\uD83D\uDD25', category: 'streak', description: '4 consecutive weeks', check: d => d.consecutiveWeeks >= 4 },
  { key: 'unstoppable', name: 'Unstoppable', emoji: '\u26A1', category: 'streak', description: '8 consecutive weeks', check: d => d.consecutiveWeeks >= 8 },
  { key: 'marathon', name: 'Marathon', emoji: '\u2B50', category: 'streak', description: '16 consecutive weeks', check: d => d.consecutiveWeeks >= 16 },
  // Skills
  { key: 'chord_master', name: 'Chord Master', emoji: '\uD83C\uDFB5', category: 'skill', description: 'Worked on chords 10+ times', check: d => (d.workedOnCounts['Chords'] ?? 0) >= 10 },
  { key: 'sight_reader', name: 'Sight Reader', emoji: '\uD83C\uDFBC', category: 'skill', description: 'Worked on sight reading 5+ times', check: d => (d.workedOnCounts['Sight Reading'] ?? 0) >= 5 },
  { key: 'song_builder', name: 'Song Builder', emoji: '\uD83C\uDFB8', category: 'skill', description: 'Worked on song practice 10+ times', check: d => (d.workedOnCounts['Song Practice'] ?? 0) >= 10 },
  { key: 'rhythm_king', name: 'Rhythm King', emoji: '\uD83E\uDD41', category: 'skill', description: 'Worked on rhythm 10+ times', check: d => ((d.workedOnCounts['Grooves'] ?? 0) + (d.workedOnCounts['Rudiments'] ?? 0)) >= 10 },
  // Practice
  { key: 'practice_perfect', name: 'Practice Makes Perfect', emoji: '\uD83C\uDFB9', category: 'practice', description: '10 Practice Lab sessions', check: d => d.practiceCount >= 10 },
  { key: 'daily_player', name: 'Daily Player', emoji: '\uD83D\uDCF1', category: 'practice', description: '7-day practice streak', check: d => d.practiceStreak >= 7 },
  { key: 'practice_pro', name: 'Practice Pro', emoji: '\uD83C\uDFC5', category: 'practice', description: '30 Practice Lab sessions', check: d => d.practiceCount >= 30 },
]

// ─── Get earned achievements for a student ───────────

export function useStudentAchievements(studentId: string | undefined) {
  return useQuery<EarnedAchievement[]>({
    queryKey: ['student-achievements', studentId],
    enabled: !!studentId,
    queryFn: async () => {
      const { data } = await supabase.from('student_achievements').select('*').eq('student_id', studentId!).order('earned_at', { ascending: false })
      return data ?? []
    },
  })
}

// ─── Check and award achievements ────────────────────

export function useCheckAchievements() {
  const { tenantId } = useAuthContext()
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (studentId: string) => {
      if (!tenantId) return []

      // Gather student data
      const { data: sessions } = await supabase.from('session_log').select('block_date, worked_on').eq('student_id', studentId).order('block_date', { ascending: false })
      const { data: practices } = await supabase.from('practice_sessions').select('created_at').eq('student_id', studentId)
      const { data: existing } = await supabase.from('student_achievements').select('achievement_key').eq('student_id', studentId)

      const existingKeys = new Set((existing ?? []).map(a => a.achievement_key))
      const sessionCount = (sessions ?? []).length

      // Calculate consecutive weeks
      const weekSet = new Set<string>()
      sessions?.forEach(s => {
        const d = new Date(s.block_date + 'T12:00:00')
        const weekStart = new Date(d); weekStart.setDate(d.getDate() - d.getDay())
        weekSet.add(weekStart.toISOString().split('T')[0])
      })
      const sortedWeeks = [...weekSet].sort().reverse()
      let consecutiveWeeks = 0
      if (sortedWeeks.length > 0) {
        let check = new Date(sortedWeeks[0] + 'T12:00:00')
        for (const w of sortedWeeks) {
          if (w === check.toISOString().split('T')[0]) { consecutiveWeeks++; check.setDate(check.getDate() - 7) }
          else break
        }
      }

      // Count worked_on tags
      const workedOnCounts: Record<string, number> = {}
      sessions?.forEach(s => (s.worked_on ?? []).forEach((t: string) => { workedOnCounts[t] = (workedOnCounts[t] ?? 0) + 1 }))

      // Practice stats
      const practiceCount = (practices ?? []).length
      const practiceDays = new Set((practices ?? []).map(p => new Date(p.created_at).toISOString().split('T')[0]))
      const sortedPDays = [...practiceDays].sort().reverse()
      let practiceStreak = 0
      if (sortedPDays.length > 0) {
        let check = new Date(sortedPDays[0] + 'T12:00:00')
        for (const d of sortedPDays) {
          if (d === check.toISOString().split('T')[0]) { practiceStreak++; check.setDate(check.getDate() - 1) }
          else break
        }
      }

      const studentData: StudentData = { sessionCount, consecutiveWeeks, workedOnCounts, practiceCount, practiceStreak }

      // Check each achievement
      const newAchievements: EarnedAchievement[] = []
      for (const ach of ALL_ACHIEVEMENTS) {
        if (existingKeys.has(ach.key)) continue
        if (ach.check(studentData)) {
          const { data: inserted } = await supabase.from('student_achievements').insert({
            tenant_id: tenantId, student_id: studentId,
            achievement_key: ach.key, achievement_name: ach.name,
            achievement_emoji: ach.emoji, category: ach.category,
          }).select('*').single()
          if (inserted) newAchievements.push(inserted)
        }
      }

      return newAchievements
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['student-achievements'] }) },
  })
}
