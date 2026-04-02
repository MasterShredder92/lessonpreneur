import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuthContext } from '../app/AuthContext'

export interface PracticeStats {
  totalSessions: number
  totalMinutes: number
  currentStreak: number
  longestStreak: number
  lastPracticeDate: string | null
  recentSuggestions: string[]
}

export function usePracticeStats(studentId: string | undefined) {
  return useQuery<PracticeStats>({
    queryKey: ['practice-stats', studentId],
    enabled: !!studentId,
    queryFn: async () => {
      const { data: sessions } = await supabase
        .from('practice_sessions')
        .select('created_at, duration_seconds')
        .eq('student_id', studentId!)
        .order('created_at', { ascending: false })

      const total = (sessions ?? []).length
      const totalSeconds = (sessions ?? []).reduce((s, r: any) => s + (r.duration_seconds ?? 0), 0)

      // Calculate streak (consecutive days with at least one session)
      const daySet = new Set<string>()
      sessions?.forEach(s => daySet.add(new Date(s.created_at).toISOString().split('T')[0]))
      const sortedDays = [...daySet].sort().reverse()

      let currentStreak = 0
      const today = new Date().toISOString().split('T')[0]
      const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0]

      // Check if today or yesterday is in the set to start counting
      if (sortedDays[0] === today || sortedDays[0] === yesterday) {
        let checkDate = new Date(sortedDays[0] + 'T12:00:00')
        for (const day of sortedDays) {
          if (day === checkDate.toISOString().split('T')[0]) {
            currentStreak++
            checkDate.setDate(checkDate.getDate() - 1)
          } else break
        }
      }

      // Longest streak ever
      let longestStreak = 0, tempStreak = 0
      const allDays = [...daySet].sort()
      for (let i = 0; i < allDays.length; i++) {
        if (i === 0) { tempStreak = 1 }
        else {
          const prev = new Date(allDays[i - 1] + 'T12:00:00')
          const curr = new Date(allDays[i] + 'T12:00:00')
          const diff = (curr.getTime() - prev.getTime()) / 86400000
          tempStreak = diff === 1 ? tempStreak + 1 : 1
        }
        longestStreak = Math.max(longestStreak, tempStreak)
      }

      // Get recent teacher suggestions (from session_log worked_on tags)
      const { data: recentLogs } = await supabase
        .from('session_log')
        .select('worked_on')
        .eq('student_id', studentId!)
        .order('block_date', { ascending: false })
        .limit(3)

      const suggestions = [...new Set((recentLogs ?? []).flatMap((l: any) => l.worked_on ?? []))].slice(0, 4)

      return {
        totalSessions: total,
        totalMinutes: Math.floor(totalSeconds / 60),
        currentStreak,
        longestStreak,
        lastPracticeDate: sortedDays[0] ?? null,
        recentSuggestions: suggestions,
      }
    },
  })
}

export function useLogPractice() {
  const { tenantId } = useAuthContext()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (params: { studentId: string; instrument: string; toolUsed: string; durationSeconds: number }) => {
      if (!tenantId) throw new Error('No tenant')
      await supabase.from('practice_sessions').insert({
        tenant_id: tenantId,
        student_id: params.studentId,
        instrument: params.instrument,
        tool_used: params.toolUsed,
        duration_seconds: params.durationSeconds,
      })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['practice-stats'] })
    },
  })
}
