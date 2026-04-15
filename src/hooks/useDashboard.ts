import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuthContext } from '../app/AuthContext'
import { qk } from '../lib/queryKeys'
import { logQueryPerf } from '../lib/performance/metrics'

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
  const { tenantId } = useAuthContext()
  return useQuery({
    queryKey: qk.dashboard.data(tenantId, locationIds ?? 'all'),
    enabled: !!tenantId,
    queryFn: async (): Promise<DashboardData> => {
      const _t0 = performance.now()
      const now = new Date()
      const today = now.toISOString().split('T')[0]
      const dow = now.getDay()
      const monday = new Date(now)
      monday.setDate(now.getDate() - (dow === 0 ? 6 : dow - 1))
      const sunday = new Date(monday)
      sunday.setDate(monday.getDate() + 6)
      const mondayStr = monday.toISOString().split('T')[0]
      const sundayStr = sunday.toISOString().split('T')[0]
      const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
      const fourteenDaysAgo = new Date(now)
      fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14)
      const sixtyDaysAgo = new Date(now)
      sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60)
      const sevenDaysAgo = new Date()
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)

      const { data, error } = await supabase.rpc('get_dashboard_snapshot', {
        p_tenant_id: tenantId!,
        p_today: today,
        p_week_start: mondayStr,
        p_week_end: sundayStr,
        p_month_start: monthStart,
        p_fourteen_days_ago: fourteenDaysAgo.toISOString().split('T')[0],
        p_sixty_days_ago: sixtyDaysAgo.toISOString().split('T')[0],
        p_seven_days_ago: sevenDaysAgo.toISOString(),
        p_location_ids: locationIds ?? null,
      })

      if (error) throw error
      const d = data as any

      logQueryPerf(tenantId!, 'dashboard.data', performance.now() - _t0, {
        tableName: 'get_dashboard_snapshot',
      })
      return {
        activeStudents: d.activeStudents ?? 0,
        studentsByLocation: d.studentsByLocation ?? {},
        openSlotsThisWeek: d.openSlotsThisWeek ?? 0,
        slotsByLocation: d.slotsByLocation ?? {},
        leadsInPipeline: d.leadsInPipeline ?? 0,
        leadsByStage: d.leadsByStage ?? {},
        staleLeadCount: d.staleLeadCount ?? 0,
        staleLeads: d.staleLeads ?? [],
        activeTeachers: d.activeTeachers ?? 0,
        teachersByLocation: d.teachersByLocation ?? {},
        needsInstrumentReview: d.needsInstrumentReview ?? 0,
        locationSummary: (d.locationSummary ?? []).map((l: any) => ({
          name: l.name,
          locationId: l.locationId,
          students: l.students,
          openSlotsToday: l.openSlotsToday,
          teachersToday: l.teachersToday,
          subsAvailable: l.subsAvailable,
        })),
        recentActivity: d.recentActivity ?? [],
        flaggedInventoryCount: d.flaggedInventoryCount ?? 0,
        newLeadsToday: d.newLeadsToday ?? 0,
        teacherPayThisMonth: d.teacherPayThisMonth ?? 0,
        reactivationDueCount: d.reactivationDueCount ?? 0,
        scheduleSnippet: (d.scheduleSnippet ?? []).map((s: any) => ({
          locationName: s.locationName,
          teacherName: s.teacherName,
          time: s.time,
          studentName: s.studentName,
          blockType: s.blockType,
        })),
        atRiskStudents: (d.atRiskStudents ?? []).map((r: any) => ({
          id: r.id,
          name: r.name,
          instrument: r.instrument,
          locationName: r.locationName,
          daysSinceSession: r.daysSinceSession,
        })),
        recentSessionLogs: (d.recentSessionLogs ?? []).map((l: any) => ({
          studentName: l.studentName,
          teacherName: l.teacherName,
          instrument: l.instrument,
          workedOn: l.workedOn ?? [],
          progressIndicator: l.progressIndicator,
          blockDate: l.blockDate,
        })),
        sessionLogsToday: d.sessionLogsToday ?? 0,
        sessionLogsThisWeek: d.sessionLogsThisWeek ?? 0,
      }
    },
    staleTime: 1000 * 60,
  })
}
