import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

export interface ScheduleInsight {
  type: 'utilization' | 'coverage' | 'opportunity'
  priority: 'high' | 'medium' | 'low'
  message: string
  metric?: string
  metricLabel?: string
}

export interface LocationUtilization {
  locationId: string
  locationName: string
  color: string
  totalBlocks: number
  bookedBlocks: number
  openBlocks: number
  utilizationPercent: number
}

const LOCATION_COLORS: Record<string, string> = {
  'd48229c1-b70a-4d29-893e-5079887dab76': '#D41113',
  'f7b52dd5-12ee-437f-9c60-f8adf454ac31': '#A333FF',
  'cebd97d4-c241-4de2-8ade-49e5cc0070d5': '#00A5E8',
  '40c67ffc-91b5-46a9-94bd-6ddffdfb7638': '#00A651',
}

export function useScheduleIntelligence(weekStart: string, weekEnd: string) {
  return useQuery<{ utilization: LocationUtilization[]; insights: ScheduleInsight[] }>({
    queryKey: ['schedule-intelligence', weekStart, weekEnd],
    enabled: !!weekStart && !!weekEnd,
    staleTime: 60_000,
    queryFn: async () => {
      // Get all blocks for the week
      const { data: blocks } = await supabase
        .from('schedule_blocks')
        .select('id, status, location_id, teacher_id, student_id, block_date, block_type')
        .gte('block_date', weekStart)
        .lte('block_date', weekEnd)

      const { data: locations } = await supabase.from('locations').select('id, name').eq('is_active', true)
      const locMap = new Map((locations ?? []).map(l => [l.id, l.name?.replace(' Music Lessons', '') ?? '']))

      // Calculate utilization per location
      const byLoc = new Map<string, { total: number; booked: number; open: number }>()
      for (const b of blocks ?? []) {
        const entry = byLoc.get(b.location_id) ?? { total: 0, booked: 0, open: 0 }
        entry.total++
        if (b.status === 'booked') entry.booked++
        else if (b.status === 'available') entry.open++
        byLoc.set(b.location_id, entry)
      }

      const utilization: LocationUtilization[] = [...byLoc.entries()].map(([locId, data]) => ({
        locationId: locId,
        locationName: locMap.get(locId) ?? 'Unknown',
        color: LOCATION_COLORS[locId] ?? '#D4226A',
        totalBlocks: data.total,
        bookedBlocks: data.booked,
        openBlocks: data.open,
        utilizationPercent: data.total > 0 ? Math.round((data.booked / data.total) * 100) : 0,
      })).sort((a, b) => b.utilizationPercent - a.utilizationPercent)

      // Generate insights
      const insights: ScheduleInsight[] = []

      // Underutilized locations
      for (const loc of utilization) {
        if (loc.utilizationPercent < 50 && loc.openBlocks > 5) {
          insights.push({
            type: 'utilization',
            priority: 'medium',
            message: `${loc.locationName} is at ${loc.utilizationPercent}% capacity — ${loc.openBlocks} open prime-time slots this week.`,
            metric: `${loc.utilizationPercent}%`,
            metricLabel: loc.locationName,
          })
        }
      }

      // High utilization alert
      for (const loc of utilization) {
        if (loc.utilizationPercent >= 90) {
          insights.push({
            type: 'utilization',
            priority: 'low',
            message: `${loc.locationName} is nearly full at ${loc.utilizationPercent}%. Consider adding teacher capacity.`,
            metric: `${loc.utilizationPercent}%`,
            metricLabel: loc.locationName,
          })
        }
      }

      // Coverage: blocks that are call_outs with students needing coverage
      const callouts = (blocks ?? []).filter(b => b.block_type === 'call_out' && b.student_id)
      if (callouts.length > 0) {
        const affectedDates = [...new Set(callouts.map(b => b.block_date))]
        insights.push({
          type: 'coverage',
          priority: 'high',
          message: `${callouts.length} student${callouts.length !== 1 ? 's' : ''} need coverage due to teacher callouts${affectedDates.length > 0 ? ` on ${affectedDates.slice(0, 3).join(', ')}` : ''}.`,
          metric: String(callouts.length),
          metricLabel: 'need coverage',
        })
      }

      // Revenue opportunity
      const totalOpen = utilization.reduce((s, l) => s + l.openBlocks, 0)
      if (totalOpen > 10) {
        insights.push({
          type: 'opportunity',
          priority: 'low',
          message: `${totalOpen} open slots this week = $${(totalOpen * 160).toLocaleString()}/month potential revenue if filled.`,
          metric: `$${(totalOpen * 160).toLocaleString()}`,
          metricLabel: 'potential/mo',
        })
      }

      return { utilization, insights }
    },
  })
}
