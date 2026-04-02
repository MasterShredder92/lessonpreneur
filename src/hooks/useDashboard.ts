import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

export interface DashboardData {
  activeStudents: number
  studentsByLocation: Record<string, number>
  openSlotsThisWeek: number
  slotsByLocation: Record<string, number>
  leadsInPipeline: number
  leadsByStage: Record<string, number>
  staleLeadCount: number
  staleLeads: { parent_name: string; stage: string; days: number }[]
  activeTeachers: number
  teachersByLocation: Record<string, number>
  needsInstrumentReview: number
  locationSummary: {
    name: string
    locationId: string
    students: number
    openSlotsToday: number
    teachersToday: number
    subsAvailable: number
  }[]
  recentActivity: {
    type: string
    description: string
    timestamp: string
  }[]
  flaggedInventoryCount: number
  newLeadsToday: number
  teacherPayThisMonth: number
  reactivationDueCount: number
  scheduleSnippet: { locationName: string; teacherName: string; time: string; studentName: string | null; blockType: string }[]
  // Task 6 additions
  atRiskStudents: { id: string; name: string; instrument: string | null; locationName: string; daysSinceSession: number }[]
  recentSessionLogs: { studentName: string; teacherName: string; instrument: string | null; workedOn: string[]; progressIndicator: string | null; blockDate: string }[]
  sessionLogsToday: number
  sessionLogsThisWeek: number
}

/**
 * @param locationIds - if provided, filters all data to these location IDs only.
 *   null = all locations (owner view). Used for director scoping.
 */
export function useDashboard(locationIds?: string[] | null) {
  return useQuery({
    queryKey: ['dashboard', locationIds ?? 'all'],
    queryFn: async (): Promise<DashboardData> => {
      const now = new Date()
      const today = now.toISOString().split('T')[0]
      const dow = now.getDay()
      const monday = new Date(now)
      monday.setDate(now.getDate() - (dow === 0 ? 6 : dow - 1))
      const sunday = new Date(monday)
      sunday.setDate(monday.getDate() + 6)
      const mondayStr = monday.toISOString().split('T')[0]
      const sundayStr = sunday.toISOString().split('T')[0]

      const [
        { data: students },
        { data: leads },
        { data: weekBlocks },
        { data: todayBlocks },
        { data: teachers },
        { data: locations },
        { data: recentLeads },
        { data: recentStudents },
      ] = await Promise.all([
        supabase.from('students').select('id, status, location_id'),
        supabase.from('leads').select('id, stage, parent_name, first_name, updated_at, created_at, instrument'),
        supabase.from('schedule_blocks').select('id, status, location_id, teacher_id').gte('block_date', mondayStr).lte('block_date', sundayStr),
        supabase.from('schedule_blocks').select('id, status, location_id, teacher_id').eq('block_date', today),
        supabase.from('teachers').select('id, is_active, ai_context, profile:profiles!teachers_profile_id_fkey(first_name, last_name)'),
        supabase.from('locations').select('id, name'),
        supabase.from('leads').select('first_name, parent_name, instrument, created_at, stage').order('created_at', { ascending: false }).limit(5),
        supabase.from('students').select('first_name, last_name, instrument, created_at').order('created_at', { ascending: false }).limit(5),
      ])

      const locMap = new Map(locations?.map((l: any) => [l.id, l.name?.replace(' Music Lessons', '')]) ?? [])

      // Location filter helper — returns true if item passes the location filter
      const locFilter = locationIds
        ? (locId: string) => locationIds.includes(locId)
        : () => true

      // Active students (filtered by location if scoped)
      const active = (students?.filter((s: any) => s.status === 'active' && locFilter(s.location_id)) ?? [])
      const studentsByLoc: Record<string, number> = {}
      active.forEach((s: any) => {
        const loc = locMap.get(s.location_id) ?? 'Unknown'
        studentsByLoc[loc] = (studentsByLoc[loc] ?? 0) + 1
      })

      // Open slots this week (filtered by location if scoped)
      const openWeek = weekBlocks?.filter((b: any) => b.status === 'available' && locFilter(b.location_id)) ?? []
      const slotsByLoc: Record<string, number> = {}
      openWeek.forEach((b: any) => {
        const loc = locMap.get(b.location_id) ?? 'Unknown'
        slotsByLoc[loc] = (slotsByLoc[loc] ?? 0) + 1
      })

      // Leads pipeline
      const openLeads = leads?.filter((l: any) => !['enrolled', 'lost'].includes(l.stage)) ?? []
      const leadsByStage: Record<string, number> = {}
      leads?.forEach((l: any) => { leadsByStage[l.stage] = (leadsByStage[l.stage] ?? 0) + 1 })

      // Stale leads
      const nowMs = Date.now()
      const stale = openLeads.filter((l: any) => {
        const lastChange = new Date(l.updated_at).getTime()
        return (nowMs - lastChange) / 86400000 >= 3
      })
      const staleLeads = stale.map((l: any) => ({
        parent_name: l.parent_name ?? l.first_name,
        stage: l.stage,
        days: Math.floor((nowMs - new Date(l.updated_at).getTime()) / 86400000),
      }))

      // Teachers
      const activeTeachers = teachers?.filter((t: any) => t.is_active) ?? []
      const needsReview = activeTeachers.filter((t: any) => t.ai_context?.instruments_need_review).length

      // Teacher location mapping via teacher_locations
      const teacherIds = activeTeachers.map((t: any) => t.id)
      const { data: profLocs } = await supabase.from('teacher_locations').select('teacher_id, location_id').in('teacher_id', teacherIds)
      const teachersByLoc: Record<string, number> = {}

      // Location summary
      const locationSummary = (locations ?? []).map((loc: any) => {
        const locName = loc.name?.replace(' Music Lessons', '')
        const locStudents = active.filter((s: any) => s.location_id === loc.id).length
        const locOpenToday = todayBlocks?.filter((b: any) => b.location_id === loc.id && b.status === 'available').length ?? 0
        const locTeacherIds = new Set(todayBlocks?.filter((b: any) => b.location_id === loc.id).map((b: any) => b.teacher_id) ?? [])

        // Count teachers at location
        const teachersAtLoc = profLocs?.filter((pl: any) => pl.location_id === loc.id).length ?? 0
        teachersByLoc[locName] = teachersAtLoc

        return {
          name: locName,
          students: locStudents,
          openSlotsToday: locOpenToday,
          teachersToday: locTeacherIds.size,
        }
      })

      // Recent activity (merge leads + students, sort by date)
      const activity: { type: string; description: string; timestamp: string }[] = []
      recentLeads?.forEach((l: any) => {
        activity.push({
          type: l.stage === 'enrolled' ? 'enrollment' : 'lead',
          description: `${l.parent_name ?? l.first_name} — ${l.instrument ?? '?'} (${l.stage})`,
          timestamp: l.created_at,
        })
      })
      recentStudents?.forEach((s: any) => {
        activity.push({
          type: 'student',
          description: `${s.first_name} ${s.last_name} enrolled — ${s.instrument}`,
          timestamp: s.created_at,
        })
      })
      activity.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())

      // Flagged inventory count
      const { count: flaggedCount } = await supabase.from('room_inventory').select('*', { count: 'exact', head: true }).eq('is_flagged', true)

      // New leads today
      const newLeadsToday = leads?.filter((l: any) => l.created_at.startsWith(today)).length ?? 0

      // Teacher pay this month (from session_log)
      const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
      const { data: monthSessions } = await supabase
        .from('session_log')
        .select('teacher_rate')
        .eq('status', 'completed')
        .gte('block_date', monthStart)
      const teacherPayThisMonth = (monthSessions ?? []).reduce((sum: number, s: any) => sum + Number(s.teacher_rate), 0)

      // Reactivation-due former students
      const { count: reactivationDueCount } = await supabase
        .from('students')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'former')
        .not('reactivation_date', 'is', null)
        .lte('reactivation_date', today)

      // Sub-available teachers count per location
      const subTeachers = activeTeachers.filter((t: any) => t.is_sub_available)
      const subTeacherProfileIds = new Set(subTeachers.map((t: any) => t.profile_id))
      const todayTeacherIds = new Set(todayBlocks?.map((b: any) => b.teacher_id) ?? [])

      // Enrich location summary with subs available
      const enrichedLocationSummary = locationSummary.map((loc: any) => {
        const locationObj = locations?.find((l: any) => l.name?.replace(' Music Lessons', '') === loc.name)
        const subsAtLoc = profLocs?.filter((pl: any) =>
          pl.location_id === locationObj?.id && subTeacherProfileIds.has(pl.profile_id)
        ).length ?? 0
        // Subtract those already teaching today
        const teachingSubCount = subTeachers.filter((t: any) => todayTeacherIds.has(t.id)).length
        return { ...loc, locationId: locationObj?.id ?? '', subsAvailable: Math.max(0, subsAtLoc - teachingSubCount) }
      })

      // Schedule snippet: first 12 booked blocks today across all locations
      const bookedToday = todayBlocks?.filter((b: any) => b.status === 'booked').slice(0, 12) ?? []
      const snippetTeacherIds = [...new Set(bookedToday.map((b: any) => b.teacher_id))]
      const { data: snippetTeachers } = snippetTeacherIds.length > 0
        ? await supabase.from('teachers').select('id, first_name, last_name, profile:profiles!teachers_profile_id_fkey(first_name, last_name)').in('id', snippetTeacherIds)
        : { data: [] }
      const snippetTeacherMap = new Map((snippetTeachers ?? []).map((t: any) => [t.id, `${t.first_name ?? t.profile?.first_name ?? ''} ${t.last_name ?? t.profile?.last_name ?? ''}`.trim()]))

      const snippetStudentIds = bookedToday.filter((b: any) => b.student_id).map((b: any) => b.student_id)
      const { data: snippetStudents } = snippetStudentIds.length > 0
        ? await supabase.from('students').select('id, first_name, last_name').in('id', [...new Set(snippetStudentIds)])
        : { data: [] }
      const snippetStudentMap = new Map((snippetStudents ?? []).map((s: any) => [s.id, `${s.first_name} ${s.last_name}`]))

      const scheduleSnippet = bookedToday.map((b: any) => ({
        locationName: locMap.get(b.location_id) ?? '',
        teacherName: snippetTeacherMap.get(b.teacher_id) ?? '',
        time: b.start_time?.slice(0, 5) ?? '',
        studentName: b.student_id ? snippetStudentMap.get(b.student_id) ?? null : null,
        blockType: b.block_type ?? 'student_session',
      }))

      // === Task 6: At-risk students (no session log in 14+ days) ===
      const fourteenDaysAgo = new Date(now)
      fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14)
      const fourteenDaysAgoStr = fourteenDaysAgo.toISOString().split('T')[0]

      // Get the most recent session_log date per active student
      const activeStudentIds = active.map((s: any) => s.id)
      let atRiskStudents: DashboardData['atRiskStudents'] = []
      if (activeStudentIds.length > 0) {
        const { data: recentLogs } = await supabase
          .from('session_log')
          .select('student_id, block_date')
          .in('student_id', activeStudentIds)
          .order('block_date', { ascending: false })

        const lastSessionByStudent = new Map<string, string>()
        recentLogs?.forEach((l: any) => {
          if (!lastSessionByStudent.has(l.student_id)) lastSessionByStudent.set(l.student_id, l.block_date)
        })

        // Find students with no log or last log > 14 days ago
        const { data: atRiskStudentRows } = await supabase
          .from('students')
          .select('id, first_name, last_name, instrument, location_id')
          .in('id', activeStudentIds.filter((id: string) => {
            const lastDate = lastSessionByStudent.get(id)
            return !lastDate || lastDate < fourteenDaysAgoStr
          }))
          .limit(20)

        atRiskStudents = (atRiskStudentRows ?? []).map((s: any) => {
          const lastDate = lastSessionByStudent.get(s.id)
          const daysSince = lastDate
            ? Math.floor((nowMs - new Date(lastDate).getTime()) / 86400000)
            : 999
          return {
            id: s.id,
            name: `${s.first_name} ${s.last_name}`.trim(),
            instrument: s.instrument,
            locationName: locMap.get(s.location_id) ?? 'Unknown',
            daysSinceSession: daysSince,
          }
        }).sort((a, b) => b.daysSinceSession - a.daysSinceSession)
      }

      // === Task 6: Recent session logs (last 10 across all teachers) ===
      const { data: recentLogRows } = await supabase
        .from('session_log')
        .select('student_id, teacher_id, worked_on, progress_indicator, block_date, instrument')
        .order('created_at', { ascending: false })
        .limit(10)

      const logStudentIds = [...new Set((recentLogRows ?? []).map((l: any) => l.student_id))]
      const logTeacherIds = [...new Set((recentLogRows ?? []).map((l: any) => l.teacher_id))]
      const { data: logStudents } = logStudentIds.length > 0
        ? await supabase.from('students').select('id, first_name, last_name').in('id', logStudentIds)
        : { data: [] }
      const { data: logTeachers } = logTeacherIds.length > 0
        ? await supabase.from('teachers').select('id, first_name, last_name').in('id', logTeacherIds)
        : { data: [] }
      const logStudentMap = new Map((logStudents ?? []).map((s: any) => [s.id, `${s.first_name} ${s.last_name}`.trim()]))
      const logTeacherMap = new Map((logTeachers ?? []).map((t: any) => [t.id, `${t.first_name} ${t.last_name}`.trim()]))

      const recentSessionLogs: DashboardData['recentSessionLogs'] = (recentLogRows ?? []).map((l: any) => ({
        studentName: logStudentMap.get(l.student_id) ?? 'Unknown',
        teacherName: logTeacherMap.get(l.teacher_id) ?? 'Unknown',
        instrument: l.instrument,
        workedOn: l.worked_on ?? [],
        progressIndicator: l.progress_indicator,
        blockDate: l.block_date,
      }))

      // Session log counts
      const sessionLogsToday = (recentLogRows ?? []).filter((l: any) => l.block_date === today).length
      const sessionLogsThisWeek = (recentLogRows ?? []).filter((l: any) => l.block_date >= mondayStr && l.block_date <= sundayStr).length

      return {
        activeStudents: active.length,
        studentsByLocation: studentsByLoc,
        openSlotsThisWeek: openWeek.length,
        slotsByLocation: slotsByLoc,
        leadsInPipeline: openLeads.length,
        leadsByStage,
        staleLeadCount: stale.length,
        staleLeads,
        activeTeachers: activeTeachers.length,
        teachersByLocation: teachersByLoc,
        needsInstrumentReview: needsReview,
        locationSummary: enrichedLocationSummary,
        recentActivity: activity.slice(0, 10),
        flaggedInventoryCount: flaggedCount ?? 0,
        newLeadsToday,
        teacherPayThisMonth,
        reactivationDueCount: reactivationDueCount ?? 0,
        scheduleSnippet,
        atRiskStudents,
        recentSessionLogs,
        sessionLogsToday,
        sessionLogsThisWeek,
      }
    },
    staleTime: 1000 * 60,
  })
}
