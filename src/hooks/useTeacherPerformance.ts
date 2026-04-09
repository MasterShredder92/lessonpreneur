import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuthContext } from '../app/AuthContext'
import { qk } from '../lib/queryKeys'

export interface TeacherPerformanceData {
  teacherId: string
  teacherName: string
  // Retention
  totalStudentsEver: number
  activeStudents: number
  retentionRate6Mo: number // % still active after 6 months
  avgTenureMonths: number
  // Session consistency
  avgSessionsPerStudentPerMonth: number
  missedSessionRate: number // % of scheduled but unchecked-in
  // Parent engagement
  communicationsSent: number
  communicationsRead: number
  readRate: number
  // Capacity
  bookedSlots: number
  availableSlots: number
  utilizationRate: number
  growthPotential: number // open slots
}

export function useTeacherPerformance(teacherId: string | undefined) {
  const { tenantId } = useAuthContext()

  return useQuery<TeacherPerformanceData | null>({
    queryKey: qk.teachers.performance(teacherId),
    enabled: !!teacherId && !!tenantId,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      if (!teacherId) return null
      const now = Date.now()
      const sixMonthsAgo = new Date(now - 180 * 86400000).toISOString().split('T')[0]
      const thirtyDaysAgo = new Date(now - 30 * 86400000).toISOString().split('T')[0]
      const today = new Date().toISOString().split('T')[0]

      // Capacity date range (this week)
      const dow = new Date().getDay()
      const monday = new Date(); monday.setDate(monday.getDate() - (dow === 0 ? 6 : dow - 1))
      const sunday = new Date(monday); sunday.setDate(monday.getDate() + 6)
      const mondayStr = monday.toISOString().split('T')[0]
      const sundayStr = sunday.toISOString().split('T')[0]

      // Batch 1: Teacher name + all students (independent of each other)
      const [{ data: teacher }, { data: allStudents }] = await Promise.all([
        supabase.from('teachers').select('first_name, last_name').eq('id', teacherId).single(),
        supabase.from('students').select('id, status, created_at, deactivated_at').eq('teacher_id', teacherId),
      ])
      const teacherName = teacher ? `${teacher.first_name} ${teacher.last_name}`.trim() : 'Unknown'
      const totalEver = (allStudents ?? []).length
      const active = (allStudents ?? []).filter(s => s.status === 'active').length
      const studentIds = (allStudents ?? []).filter(s => s.status === 'active').map(s => s.id)

      // 6-month retention: of students enrolled 6+ months ago, how many are still active?
      const enrolledBefore6Mo = (allStudents ?? []).filter(s => s.created_at && s.created_at < sixMonthsAgo)
      const stillActive6Mo = enrolledBefore6Mo.filter(s => s.status === 'active').length
      const retentionRate6Mo = enrolledBefore6Mo.length > 0 ? Math.round((stillActive6Mo / enrolledBefore6Mo.length) * 100) : 0

      // Avg tenure
      const tenures = (allStudents ?? []).map(s => {
        const start = new Date(s.created_at).getTime()
        const end = s.deactivated_at ? new Date(s.deactivated_at).getTime() : now
        return (end - start) / (30 * 86400000)
      })
      const avgTenure = tenures.length > 0 ? tenures.reduce((a, b) => a + b, 0) / tenures.length : 0

      // Batch 2: All remaining queries in parallel (sessions, schedule counts, comms, capacity)
      const [
        { data: recentSessions },
        { count: totalScheduled },
        { count: unchecked },
        commsSentResult,
        commsReadResult,
        { count: booked },
        { count: available },
      ] = await Promise.all([
        // Session consistency (last 30 days)
        supabase.from('session_log').select('student_id').eq('teacher_id', teacherId).gte('block_date', thirtyDaysAgo),
        // Total scheduled (missed sessions numerator)
        supabase.from('schedule_blocks').select('id', { count: 'exact', head: true }).eq('teacher_id', teacherId).eq('status', 'booked').neq('block_type', 'call_out').gte('block_date', thirtyDaysAgo).lte('block_date', today),
        // Unchecked sessions
        supabase.from('schedule_blocks').select('id', { count: 'exact', head: true }).eq('teacher_id', teacherId).eq('status', 'booked').neq('block_type', 'call_out').eq('checked_in', false).gte('block_date', thirtyDaysAgo).lt('block_date', today),
        // Parent engagement — sent
        studentIds.length > 0
          ? supabase.from('communications').select('id', { count: 'exact', head: true }).eq('teacher_id', teacherId)
          : Promise.resolve({ count: 0 }),
        // Parent engagement — read
        studentIds.length > 0
          ? supabase.from('communications').select('id', { count: 'exact', head: true }).eq('teacher_id', teacherId).eq('status', 'read')
          : Promise.resolve({ count: 0 }),
        // Capacity — booked this week
        supabase.from('schedule_blocks').select('id', { count: 'exact', head: true }).eq('teacher_id', teacherId).eq('status', 'booked').gte('block_date', mondayStr).lte('block_date', sundayStr),
        // Capacity — available this week
        supabase.from('schedule_blocks').select('id', { count: 'exact', head: true }).eq('teacher_id', teacherId).eq('status', 'available').gte('block_date', mondayStr).lte('block_date', sundayStr),
      ])

      const sessionsPerStudent = new Map<string, number>()
      recentSessions?.forEach(s => sessionsPerStudent.set(s.student_id, (sessionsPerStudent.get(s.student_id) ?? 0) + 1))
      const avgSessions = active > 0 ? [...sessionsPerStudent.values()].reduce((a, b) => a + b, 0) / active : 0
      const missedRate = (totalScheduled ?? 0) > 0 ? Math.round(((unchecked ?? 0) / (totalScheduled ?? 1)) * 100) : 0
      const commsSent = (commsSentResult as any).count ?? 0
      const commsRead = (commsReadResult as any).count ?? 0

      return {
        teacherId,
        teacherName,
        totalStudentsEver: totalEver,
        activeStudents: active,
        retentionRate6Mo,
        avgTenureMonths: Math.round(avgTenure * 10) / 10,
        avgSessionsPerStudentPerMonth: Math.round(avgSessions * 10) / 10,
        missedSessionRate: missedRate,
        communicationsSent: commsSent,
        communicationsRead: commsRead,
        readRate: commsSent > 0 ? Math.round((commsRead / commsSent) * 100) : 0,
        bookedSlots: booked ?? 0,
        availableSlots: available ?? 0,
        utilizationRate: ((booked ?? 0) + (available ?? 0)) > 0 ? Math.round(((booked ?? 0) / ((booked ?? 0) + (available ?? 0))) * 100) : 0,
        growthPotential: available ?? 0,
      }
    },
  })
}
