import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuthContext } from '../app/AuthContext'
import { useTeacherRecord } from './useTeacherDashboard'
import { qk } from '../lib/queryKeys'

export interface SessionNeedingRecap {
  block_id: string
  student_id: string
  student_first_name: string
  instrument: string | null
  start_time: string
  block_date: string
}

export interface CloseoutStatus {
  teacherId: string | null
  today: string
  sessionsToday: SessionNeedingRecap[] // only non-callout, student_session blocks
  missingRecaps: SessionNeedingRecap[]
  existingCloseout: { id: string; closed_at: string } | null
  primaryLocationId: string | null
}

export function useTeacherCloseoutStatus() {
  const { data: teacherId } = useTeacherRecord()
  const { tenantId } = useAuthContext()
  const today = new Date().toISOString().split('T')[0]

  return useQuery<CloseoutStatus>({
    queryKey: ['teacher-closeout-status', teacherId, today],
    enabled: !!teacherId && !!tenantId,
    staleTime: 60_000,
    queryFn: async () => {
      const empty: CloseoutStatus = {
        teacherId: teacherId ?? null,
        today,
        sessionsToday: [],
        missingRecaps: [],
        existingCloseout: null,
        primaryLocationId: null,
      }
      if (!teacherId) return empty

      // Today's booked student sessions (excluding family callouts)
      const { data: blocks } = await supabase
        .from('schedule_blocks')
        .select('id, student_id, block_date, start_time, location_id, block_type, status, is_family_callout')
        .eq('teacher_id', teacherId)
        .eq('block_date', today)
        .eq('status', 'booked')
        .eq('block_type', 'student_session')
        .not('student_id', 'is', null)
        .order('start_time')

      const validBlocks = (blocks ?? []).filter((b: any) => !b.is_family_callout)

      // Student names + instruments
      const studentIds = [...new Set(validBlocks.map((b: any) => b.student_id))]
      const studentMap = new Map<string, { first_name: string; instrument: string | null }>()
      if (studentIds.length > 0) {
        const { data: students } = await supabase
          .from('students')
          .select('id, first_name, instrument')
          .in('id', studentIds)
        students?.forEach((s: any) => studentMap.set(s.id, { first_name: s.first_name, instrument: s.instrument }))
      }

      const sessionsToday: SessionNeedingRecap[] = validBlocks.map((b: any) => {
        const stu = studentMap.get(b.student_id)
        return {
          block_id: b.id,
          student_id: b.student_id,
          student_first_name: stu?.first_name ?? 'Student',
          instrument: stu?.instrument ?? null,
          start_time: b.start_time,
          block_date: b.block_date,
        }
      })

      // Check which have teacher_session_notes
      const blockIds = sessionsToday.map(s => s.block_id)
      const notedBlocks = new Set<string>()
      if (blockIds.length > 0) {
        const { data: notes } = await supabase
          .from('teacher_session_notes')
          .select('schedule_block_id')
          .eq('teacher_id', teacherId)
          .in('schedule_block_id', blockIds)
        notes?.forEach((n: any) => n.schedule_block_id && notedBlocks.add(n.schedule_block_id))
      }
      const missingRecaps = sessionsToday.filter(s => !notedBlocks.has(s.block_id))

      // Today's closeout (if any)
      const { data: closeoutRow } = await supabase
        .from('teacher_closeouts')
        .select('id, closed_at')
        .eq('teacher_id', teacherId)
        .eq('closeout_date', today)
        .maybeSingle()

      // Primary location = most frequent location among today's blocks
      const locCount = new Map<string, number>()
      validBlocks.forEach((b: any) => locCount.set(b.location_id, (locCount.get(b.location_id) ?? 0) + 1))
      const primaryLocationId = [...locCount.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null

      return {
        teacherId,
        today,
        sessionsToday,
        missingRecaps,
        existingCloseout: closeoutRow ? { id: closeoutRow.id, closed_at: closeoutRow.closed_at } : null,
        primaryLocationId,
      }
    },
  })
}

export function useCompleteTeacherCloseout() {
  const { profile, tenantId } = useAuthContext()
  const { data: teacherId } = useTeacherRecord()
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (params: {
      locationId: string | null
      sessionsRequiringRecap: number
      sessionsWithRecap: number
      teacherName: string
    }) => {
      if (!tenantId || !teacherId) throw new Error('Not authenticated')
      const today = new Date().toISOString().split('T')[0]
      const closedAt = new Date().toISOString()

      const { error } = await supabase.from('teacher_closeouts').insert({
        tenant_id: tenantId,
        teacher_id: teacherId,
        location_id: params.locationId,
        closeout_date: today,
        closed_at: closedAt,
        sessions_requiring_recap: params.sessionsRequiringRecap,
        sessions_with_recap: params.sessionsWithRecap,
        is_complete: true,
      })
      if (error) throw error

      await supabase.from('audit_log').insert({
        tenant_id: tenantId,
        performed_by: profile?.id ?? null,
        user_name: params.teacherName,
        user_role: 'teacher',
        action: 'TEACHER_CLOSEOUT',
        table_name: 'teacher_closeouts',
        record_id: teacherId,
        entity_name: params.teacherName,
        location_id: params.locationId,
        new_value: { closeout_date: today, closed_at: closedAt },
      })

      return { closedAt }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.teachers.closeoutStatus })
    },
  })
}

// 24-hour missing recap prompt (distinct from the 3-day useMissingNotesItems
// which uses the separate teacher_student_notes table)
export interface RecapReminderItem {
  block_id: string
  student_id: string
  student_first_name: string
  instrument: string | null
  start_time: string
  block_date: string
  hours_ago: number
}

export function useRecapReminders24h() {
  const { data: teacherId } = useTeacherRecord()

  return useQuery<RecapReminderItem[]>({
    queryKey: ['teacher-recap-reminders-24h', teacherId],
    enabled: !!teacherId,
    staleTime: 60_000,
    queryFn: async () => {
      if (!teacherId) return []
      const now = new Date()
      const cutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000)
      const cutoffDate = cutoff.toISOString().split('T')[0]

      const { data: blocks } = await supabase
        .from('schedule_blocks')
        .select('id, student_id, block_date, start_time, is_family_callout, status, block_type')
        .eq('teacher_id', teacherId)
        .eq('status', 'booked')
        .eq('block_type', 'student_session')
        .not('student_id', 'is', null)
        .gte('block_date', cutoffDate)
        .order('block_date', { ascending: false })

      const valid = (blocks ?? []).filter((b: any) => {
        if (b.is_family_callout) return false
        const dt = new Date(`${b.block_date}T${b.start_time}`)
        return dt.getTime() <= now.getTime() && dt.getTime() >= cutoff.getTime()
      })

      if (valid.length === 0) return []

      const blockIds = valid.map((b: any) => b.id)
      const { data: notes } = await supabase
        .from('teacher_session_notes')
        .select('schedule_block_id')
        .eq('teacher_id', teacherId)
        .in('schedule_block_id', blockIds)
      const noted = new Set<string>()
      notes?.forEach((n: any) => n.schedule_block_id && noted.add(n.schedule_block_id))

      const missing = valid.filter((b: any) => !noted.has(b.id))
      if (missing.length === 0) return []

      const studentIds = [...new Set(missing.map((b: any) => b.student_id))]
      const studentMap = new Map<string, { first_name: string; instrument: string | null }>()
      const { data: students } = await supabase
        .from('students')
        .select('id, first_name, instrument')
        .in('id', studentIds)
      students?.forEach((s: any) => studentMap.set(s.id, { first_name: s.first_name, instrument: s.instrument }))

      return missing.map((b: any): RecapReminderItem => {
        const dt = new Date(`${b.block_date}T${b.start_time}`)
        const stu = studentMap.get(b.student_id)
        return {
          block_id: b.id,
          student_id: b.student_id,
          student_first_name: stu?.first_name ?? 'Student',
          instrument: stu?.instrument ?? null,
          start_time: b.start_time,
          block_date: b.block_date,
          hours_ago: Math.floor((now.getTime() - dt.getTime()) / (60 * 60 * 1000)),
        }
      })
    },
  })
}
