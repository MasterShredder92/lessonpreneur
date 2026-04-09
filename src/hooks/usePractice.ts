import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuthContext } from '../app/AuthContext'
import { qk } from '../lib/queryKeys'

export interface PracticeStats {
  totalSessions: number
  totalMinutes: number
  currentStreak: number
  longestStreak: number
  lastPracticeDate: string | null
  recentSuggestions: string[]
}

export interface PracticeHistoryRow {
  id: string
  practice_date: string
  duration_minutes: number
  instrument: string | null
  tool_used: string | null
  notes: string | null
  is_manual_entry: boolean
  created_at: string
}

export function usePracticeStats(studentId: string | undefined) {
  return useQuery<PracticeStats>({
    queryKey: qk.practice.stats(studentId),
    enabled: !!studentId,
    queryFn: async () => {
      const { data: sessions } = await supabase
        .from('practice_sessions')
        .select('practice_date, duration_minutes, duration_seconds, created_at')
        .eq('student_id', studentId!)
        .gte('created_at', new Date(Date.now() - 180 * 24 * 60 * 60 * 1000).toISOString())
        .order('practice_date', { ascending: false })
        .limit(500)

      const rows = sessions ?? []
      const total = rows.length
      const totalMinutes = rows.reduce((s, r: any) => {
        const mins = r.duration_minutes ?? Math.floor((r.duration_seconds ?? 0) / 60)
        return s + (mins ?? 0)
      }, 0)

      // Calculate streak (consecutive days with at least one session)
      const daySet = new Set<string>()
      rows.forEach((r: any) => {
        const d = r.practice_date ?? new Date(r.created_at).toISOString().split('T')[0]
        daySet.add(d)
      })
      const sortedDays = [...daySet].sort().reverse()

      let currentStreak = 0
      const today = new Date().toISOString().split('T')[0]
      const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0]

      if (sortedDays[0] === today || sortedDays[0] === yesterday) {
        let checkDate = new Date(sortedDays[0] + 'T12:00:00')
        for (const day of sortedDays) {
          if (day === checkDate.toISOString().split('T')[0]) {
            currentStreak++
            checkDate.setDate(checkDate.getDate() - 1)
          } else break
        }
      }

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

      const { data: recentLogs } = await supabase
        .from('session_log')
        .select('worked_on')
        .eq('student_id', studentId!)
        .order('block_date', { ascending: false })
        .limit(3)

      const suggestions = [...new Set((recentLogs ?? []).flatMap((l: any) => l.worked_on ?? []))].slice(0, 4)

      return {
        totalSessions: total,
        totalMinutes,
        currentStreak,
        longestStreak,
        lastPracticeDate: sortedDays[0] ?? null,
        recentSuggestions: suggestions,
      }
    },
  })
}

export function usePracticeHistory(studentId: string | undefined) {
  return useQuery<PracticeHistoryRow[]>({
    queryKey: qk.practice.history(studentId),
    enabled: !!studentId,
    queryFn: async () => {
      const { data } = await supabase
        .from('practice_sessions')
        .select('id, practice_date, duration_minutes, duration_seconds, instrument, tool_used, notes, is_manual_entry, created_at')
        .eq('student_id', studentId!)
        .order('practice_date', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(20)
      return (data ?? []).map((r: any) => ({
        id: r.id,
        practice_date: r.practice_date ?? new Date(r.created_at).toISOString().split('T')[0],
        duration_minutes: r.duration_minutes ?? Math.floor((r.duration_seconds ?? 0) / 60),
        instrument: r.instrument,
        tool_used: r.tool_used,
        notes: r.notes,
        is_manual_entry: !!r.is_manual_entry,
        created_at: r.created_at,
      }))
    },
  })
}

export function useLogPractice() {
  const { tenantId, user } = useAuthContext()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (params: {
      studentId: string
      familyId?: string | null
      instrument: string
      toolUsed: string
      durationSeconds: number
    }) => {
      if (!tenantId) throw new Error('No tenant')
      const minutes = Math.max(1, Math.round(params.durationSeconds / 60))
      const { error } = await supabase.from('practice_sessions').insert({
        tenant_id: tenantId,
        student_id: params.studentId,
        family_id: params.familyId ?? null,
        logged_by: user?.id ?? null,
        instrument: params.instrument,
        tool_used: params.toolUsed,
        duration_seconds: params.durationSeconds,
        duration_minutes: minutes,
        practice_date: new Date().toISOString().split('T')[0],
        is_manual_entry: false,
      })
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.practice.stats })
      qc.invalidateQueries({ queryKey: qk.practice.history })
    },
  })
}

export function useLogPracticeManual() {
  const { tenantId, user } = useAuthContext()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (params: {
      studentId: string
      familyId?: string | null
      instrument: string | null
      practiceDate: string
      durationMinutes: number
      notes?: string | null
    }) => {
      if (!tenantId) throw new Error('No tenant')
      const { error } = await supabase.from('practice_sessions').insert({
        tenant_id: tenantId,
        student_id: params.studentId,
        family_id: params.familyId ?? null,
        logged_by: user?.id ?? null,
        instrument: params.instrument,
        tool_used: 'manual',
        duration_seconds: params.durationMinutes * 60,
        duration_minutes: params.durationMinutes,
        practice_date: params.practiceDate,
        notes: params.notes ?? null,
        is_manual_entry: true,
      })
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.practice.stats })
      qc.invalidateQueries({ queryKey: qk.practice.history })
    },
  })
}
