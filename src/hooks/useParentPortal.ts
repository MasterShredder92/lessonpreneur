import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { qk } from '../lib/queryKeys'

// Get family + active students
export function usePortalFamily(familyId: string | undefined) {
  return useQuery({
    queryKey: [...qk.portal.family, familyId],
    enabled: !!familyId,
    queryFn: async () => {
      const { data: family } = await supabase
        .from('families')
        .select('id, name, parent_name, primary_email, primary_phone, billing_status, rate_tier, square_customer_id, card_last_four, card_brand, balance, created_at')
        .eq('id', familyId!)
        .single()
      if (!family) throw new Error('Family not found')

      const { data: students } = await supabase
        .from('students')
        .select('id, first_name, last_name, instrument, teacher_id, created_at, status, rate_per_session, blocks_per_week, location_id')
        .eq('family_id', familyId!)
        .eq('status', 'active')
        .order('first_name')

      const teacherIds = [...new Set((students ?? []).map((s: any) => s.teacher_id).filter(Boolean))]
      const teacherMap = new Map<string, string>()
      if (teacherIds.length > 0) {
        const { data: teachers } = await supabase
          .from('teachers')
          .select('id, first_name, last_name')
          .in('id', teacherIds)
        teachers?.forEach((t: any) => teacherMap.set(t.id, `${t.first_name} ${t.last_name}`.trim()))
      }

      const locIds = [...new Set((students ?? []).map((s: any) => s.location_id).filter(Boolean))]
      const locMap = new Map<string, string>()
      if (locIds.length > 0) {
        const { data: locs } = await supabase
          .from('locations')
          .select('id, name')
          .in('id', locIds)
        locs?.forEach((l: any) => locMap.set(l.id, l.name?.replace(' Music Lessons', '') ?? ''))
      }

      const enrichedStudents = (students ?? []).map((s: any) => ({
        ...s,
        teacherName: s.teacher_id ? teacherMap.get(s.teacher_id) ?? null : null,
        locationName: s.location_id ? locMap.get(s.location_id) ?? null : null,
      }))

      return { family, students: enrichedStudents }
    }
  })
}

// Get upcoming schedule for all students in family
export function usePortalSchedule(studentIds: string[]) {
  return useQuery({
    queryKey: [...qk.portal.schedule, studentIds],
    enabled: studentIds.length > 0,
    queryFn: async () => {
      const today = new Date().toISOString().split('T')[0]
      const twoWeeks = new Date()
      twoWeeks.setDate(twoWeeks.getDate() + 14)
      const endDate = twoWeeks.toISOString().split('T')[0]

      const { data: blocks } = await supabase
        .from('schedule_blocks')
        .select('id, student_id, teacher_id, block_date, start_time, end_time, status, location_id')
        .in('student_id', studentIds)
        .gte('block_date', today)
        .lte('block_date', endDate)
        .eq('status', 'booked')
        .eq('block_type', 'student_session')
        .order('block_date')
        .order('start_time')

      const teacherIds = [...new Set((blocks ?? []).map((b: any) => b.teacher_id).filter(Boolean))]
      const teacherMap = new Map<string, string>()
      if (teacherIds.length > 0) {
        const { data: teachers } = await supabase
          .from('teachers')
          .select('id, first_name, last_name')
          .in('id', teacherIds)
        teachers?.forEach((t: any) => teacherMap.set(t.id, `${t.first_name} ${t.last_name}`.trim()))
      }

      const { data: studentsData } = await supabase
        .from('students')
        .select('id, first_name, instrument')
        .in('id', studentIds)
      const studentMap = new Map<string, { firstName: string; instrument: string | null }>()
      studentsData?.forEach((s: any) => studentMap.set(s.id, { firstName: s.first_name, instrument: s.instrument }))

      const locIds = [...new Set((blocks ?? []).map((b: any) => b.location_id).filter(Boolean))]
      const locMap = new Map<string, string>()
      if (locIds.length > 0) {
        const { data: locs } = await supabase
          .from('locations')
          .select('id, name')
          .in('id', locIds)
        locs?.forEach((l: any) => locMap.set(l.id, l.name?.replace(' Music Lessons', '') ?? ''))
      }

      return (blocks ?? []).map((b: any) => ({
        ...b,
        teacherName: teacherMap.get(b.teacher_id) ?? null,
        studentName: studentMap.get(b.student_id)?.firstName ?? null,
        studentInstrument: studentMap.get(b.student_id)?.instrument ?? null,
        locationName: locMap.get(b.location_id) ?? null,
      }))
    }
  })
}

// Session notes for a student (parent-visible only)
export function usePortalNotes(studentId: string | undefined) {
  return useQuery({
    queryKey: [...qk.portal.notes, studentId],
    enabled: !!studentId,
    queryFn: async () => {
      const { data } = await supabase
        .from('teacher_session_notes')
        .select('id, note_date, raw_note, ai_enhanced_note, topics_covered, mood, teacher_id, created_at')
        .eq('student_id', studentId!)
        .eq('is_visible_to_parent', true)
        .order('note_date', { ascending: false })
        .limit(20)

      const teacherIds = [...new Set((data ?? []).map((n: any) => n.teacher_id))]
      const teacherMap = new Map<string, string>()
      if (teacherIds.length > 0) {
        const { data: teachers } = await supabase
          .from('teachers')
          .select('id, first_name, last_name')
          .in('id', teacherIds)
        teachers?.forEach((t: any) => teacherMap.set(t.id, `${t.first_name} ${t.last_name}`.trim()))
      }

      return (data ?? []).map((n: any) => ({
        ...n,
        teacherName: teacherMap.get(n.teacher_id) ?? 'Teacher',
      }))
    }
  })
}

// Milestones for a student
export function usePortalMilestones(studentId: string | undefined) {
  return useQuery({
    queryKey: [...qk.portal.milestones, studentId],
    enabled: !!studentId,
    queryFn: async () => {
      const { data } = await supabase
        .from('student_milestones')
        .select('id, milestone_type, milestone_label, milestone_value, achieved_at')
        .eq('student_id', studentId!)
        .order('achieved_at', { ascending: false })
      return data ?? []
    }
  })
}

// Progress reports for a student
export function usePortalReports(studentId: string | undefined) {
  return useQuery({
    queryKey: [...qk.portal.reports, studentId],
    enabled: !!studentId,
    queryFn: async () => {
      const { data } = await supabase
        .from('progress_reports')
        .select('id, report_type, period_start, period_end, sessions_attended, sessions_scheduled, attendance_rate, ai_summary, ai_highlights, ai_encouragement, created_at')
        .eq('student_id', studentId!)
        .order('period_end', { ascending: false })
        .limit(10)
      return data ?? []
    }
  })
}

// Sessions this month count per student
export function usePortalSessionCount(studentIds: string[]) {
  return useQuery({
    queryKey: [...qk.portal.sessionCount, studentIds],
    enabled: studentIds.length > 0,
    queryFn: async () => {
      const now = new Date()
      const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
      const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0)
      const monthEndStr = monthEnd.toISOString().split('T')[0]
      const { data } = await supabase
        .from('schedule_blocks')
        .select('student_id')
        .in('student_id', studentIds)
        .gte('block_date', monthStart)
        .lte('block_date', monthEndStr)
        .neq('block_type', 'call_out')
        .eq('checked_in', true)

      const counts = new Map<string, number>()
      data?.forEach((b: any) => counts.set(b.student_id, (counts.get(b.student_id) ?? 0) + 1))
      return counts
    }
  })
}

// Family files (teacher uploads for family students)
export function usePortalFiles(studentIds: string[]) {
  return useQuery({
    queryKey: [...qk.portal.files, studentIds],
    enabled: studentIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase
        .from('teacher_uploads')
        .select('id, student_id, file_name, storage_path, created_at, teacher_id, visible_to_parent')
        .in('student_id', studentIds)
        .eq('visible_to_parent', true)
        .order('created_at', { ascending: false })
      return data ?? []
    }
  })
}
