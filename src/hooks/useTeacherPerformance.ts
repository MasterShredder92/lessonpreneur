import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuthContext } from '../app/AuthContext'

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
    queryKey: ['teacher-performance', teacherId],
    enabled: !!teacherId && !!tenantId,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      if (!teacherId) return null
      const now = Date.now()
      const sixMonthsAgo = new Date(now - 180 * 86400000).toISOString().split('T')[0]
      const thirtyDaysAgo = new Date(now - 30 * 86400000).toISOString().split('T')[0]
      const today = new Date().toISOString().split('T')[0]

      // Teacher name
      const { data: teacher } = await supabase.from('teachers').select('first_name, last_name').eq('id', teacherId).single()
      const teacherName = teacher ? `${teacher.first_name} ${teacher.last_name}`.trim() : 'Unknown'

      // All students ever assigned to this teacher
      const { data: allStudents } = await supabase.from('students').select('id, status, created_at, deactivated_at').eq('teacher_id', teacherId)
      const totalEver = (allStudents ?? []).length
      const active = (allStudents ?? []).filter(s => s.status === 'active').length

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

      // Session consistency (last 30 days)
      const { data: recentSessions } = await supabase.from('session_log').select('student_id').eq('teacher_id', teacherId).gte('block_date', thirtyDaysAgo)
      const sessionsPerStudent = new Map<string, number>()
      recentSessions?.forEach(s => sessionsPerStudent.set(s.student_id, (sessionsPerStudent.get(s.student_id) ?? 0) + 1))
      const avgSessions = active > 0 ? [...sessionsPerStudent.values()].reduce((a, b) => a + b, 0) / active : 0

      // Missed sessions
      const { count: totalScheduled } = await supabase.from('schedule_blocks').select('id', { count: 'exact', head: true }).eq('teacher_id', teacherId).eq('status', 'booked').neq('block_type', 'call_out').gte('block_date', thirtyDaysAgo).lte('block_date', today)
      const { count: unchecked } = await supabase.from('schedule_blocks').select('id', { count: 'exact', head: true }).eq('teacher_id', teacherId).eq('status', 'booked').neq('block_type', 'call_out').eq('checked_in', false).gte('block_date', thirtyDaysAgo).lt('block_date', today)
      const missedRate = (totalScheduled ?? 0) > 0 ? Math.round(((unchecked ?? 0) / (totalScheduled ?? 1)) * 100) : 0

      // Parent engagement
      const studentIds = (allStudents ?? []).filter(s => s.status === 'active').map(s => s.id)
      let commsSent = 0, commsRead = 0
      if (studentIds.length > 0) {
        const { count: sent } = await supabase.from('communications').select('id', { count: 'exact', head: true }).eq('teacher_id', teacherId)
        const { count: read } = await supabase.from('communications').select('id', { count: 'exact', head: true }).eq('teacher_id', teacherId).eq('status', 'read')
        commsSent = sent ?? 0
        commsRead = read ?? 0
      }

      // Capacity (this week)
      const dow = new Date().getDay()
      const monday = new Date(); monday.setDate(monday.getDate() - (dow === 0 ? 6 : dow - 1))
      const sunday = new Date(monday); sunday.setDate(monday.getDate() + 6)
      const { count: booked } = await supabase.from('schedule_blocks').select('id', { count: 'exact', head: true }).eq('teacher_id', teacherId).eq('status', 'booked').gte('block_date', monday.toISOString().split('T')[0]).lte('block_date', sunday.toISOString().split('T')[0])
      const { count: available } = await supabase.from('schedule_blocks').select('id', { count: 'exact', head: true }).eq('teacher_id', teacherId).eq('status', 'available').gte('block_date', monday.toISOString().split('T')[0]).lte('block_date', sunday.toISOString().split('T')[0])

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
