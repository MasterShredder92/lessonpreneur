import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuthContext } from '../app/AuthContext'
import { useUserLocations } from './useUserLocations'

export interface LocationOverview {
  locationId: string
  locationName: string
  color: string
  teachersToday: number
  teacherNames: string[]
  totalSessions: number
  openSpots: number
  cancellations: number
  reschedules: number
  utilizationPercent: number
  missedMonthlyRevenue: number
}

export interface ScheduleOverviewData {
  locations: LocationOverview[]
  totalTeachersToday: number
  totalSessions: number
  totalOpenSpots: number
  totalCancellations: number
  totalMissedRevenue: number
}

const LOCATION_COLORS: Record<string, string> = {
  'd48229c1-b70a-4d29-893e-5079887dab76': '#D41113',
  'f7b52dd5-12ee-437f-9c60-f8adf454ac31': '#A333FF',
  'cebd97d4-c241-4de2-8ade-49e5cc0070d5': '#00A5E8',
  '40c67ffc-91b5-46a9-94bd-6ddffdfb7638': '#00A651',
}

function toDateString(d: Date) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function useScheduleOverview() {
  const { tenantId } = useAuthContext()
  const { data: userLocIds } = useUserLocations()
  const today = toDateString(new Date())
  const scopeKey = userLocIds === null ? 'all' : userLocIds.join(',')

  return useQuery<ScheduleOverviewData>({
    queryKey: ['schedule-overview', tenantId, today, scopeKey],
    enabled: !!tenantId,
    staleTime: 60_000,
    queryFn: async () => {
      // Fetch today's blocks — scoped to allowed locations for studio directors / partial admins
      let blockQuery = supabase
        .from('schedule_blocks')
        .select('id, location_id, teacher_id, student_id, status, block_type')
        .eq('tenant_id', tenantId!)
        .eq('block_date', today)
      if (userLocIds && userLocIds.length > 0) {
        blockQuery = blockQuery.in('location_id', userLocIds)
      }
      const { data: blocks } = await blockQuery

      // Fetch locations (same scope)
      let locQuery = supabase
        .from('locations')
        .select('id, name, color')
        .eq('tenant_id', tenantId!)
        .eq('is_active', true)
        .order('name')
      if (userLocIds && userLocIds.length > 0) {
        locQuery = locQuery.in('id', userLocIds)
      }
      const { data: locations } = await locQuery

      // Fetch teacher names for today's teachers
      const teacherIds = new Set((blocks ?? []).map(b => b.teacher_id).filter(Boolean))
      let teacherNameMap = new Map<string, string>()
      if (teacherIds.size > 0) {
        const { data: teachers } = await supabase
          .from('teachers')
          .select('id, profile:profiles!teachers_profile_id_fkey(first_name, last_name)')
          .in('id', [...teacherIds])
        for (const t of teachers ?? []) {
          const p = t.profile as any
          if (p) teacherNameMap.set(t.id, `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim())
        }
      }

      const locMap = new Map((locations ?? []).map(l => [l.id, l]))

      // Build per-location stats
      const byLoc = new Map<string, {
        teacherIds: Set<string>
        sessions: number
        open: number
        cancellations: number
        reschedules: number
        total: number
      }>()

      for (const b of blocks ?? []) {
        if (!byLoc.has(b.location_id)) {
          byLoc.set(b.location_id, { teacherIds: new Set(), sessions: 0, open: 0, cancellations: 0, reschedules: 0, total: 0 })
        }
        const entry = byLoc.get(b.location_id)!
        if (b.teacher_id) entry.teacherIds.add(b.teacher_id)

        // Count sessions (block types that represent a real lesson)
        const isLesson = ['student_session', 'first_day', 'last_day', 'meet_greet', 'sub', 'makeup_session'].includes(b.block_type)
        if (isLesson && b.student_id && b.status === 'booked') {
          entry.sessions++
        }

        // Open spots
        if (b.block_type === 'open_time' || (b.status === 'available' && !b.student_id)) {
          entry.open++
        }

        // Cancellations (call_outs)
        if (b.block_type === 'call_out') {
          entry.cancellations++
        }

        // Reschedules (makeup sessions)
        if (b.block_type === 'makeup_session') {
          entry.reschedules++
        }

        // Total schedulable blocks
        if (b.block_type !== 'not_bookable' && b.block_type !== 'teacher_training') {
          entry.total++
        }
      }

      const locationOverviews: LocationOverview[] = (locations ?? []).map(loc => {
        const stats = byLoc.get(loc.id)
        const teachersToday = stats?.teacherIds.size ?? 0
        const teacherNames = stats ? [...stats.teacherIds].map(id => teacherNameMap.get(id) ?? 'Unknown').sort() : []
        const sessions = stats?.sessions ?? 0
        const open = stats?.open ?? 0
        const cancellations = stats?.cancellations ?? 0
        const reschedules = stats?.reschedules ?? 0
        const total = stats?.total ?? 0
        const utilization = total > 0 ? Math.round((sessions / total) * 100) : 0
        // $40/session average × 4 weeks/month = $160/month per unfilled slot
        const missedMonthlyRevenue = open * 160

        return {
          locationId: loc.id,
          locationName: (loc.name ?? '').replace(' Music Lessons', ''),
          color: LOCATION_COLORS[loc.id] ?? (loc as any).color ?? '#D4226A',
          teachersToday,
          teacherNames,
          totalSessions: sessions,
          openSpots: open,
          cancellations,
          reschedules,
          utilizationPercent: utilization,
          missedMonthlyRevenue,
        }
      })

      const totalTeachersToday = new Set((blocks ?? []).map(b => b.teacher_id).filter(Boolean)).size
      const totalSessions = locationOverviews.reduce((s, l) => s + l.totalSessions, 0)
      const totalOpenSpots = locationOverviews.reduce((s, l) => s + l.openSpots, 0)
      const totalCancellations = locationOverviews.reduce((s, l) => s + l.cancellations, 0)
      const totalMissedRevenue = locationOverviews.reduce((s, l) => s + l.missedMonthlyRevenue, 0)

      return {
        locations: locationOverviews,
        totalTeachersToday,
        totalSessions,
        totalOpenSpots,
        totalCancellations,
        totalMissedRevenue,
      }
    },
  })
}
