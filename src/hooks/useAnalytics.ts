import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuthContext } from '../app/AuthContext'
import { qk } from '../lib/queryKeys'

export interface MonthlyMetric {
  month: string // YYYY-MM
  label: string // "Jan", "Feb" etc
  value: number
}

export interface CohortRow {
  enrollMonth: string
  label: string
  retention: number[] // percentage retained at months 1,2,3...12
}

export interface AnalyticsData {
  enrollmentTrend: MonthlyMetric[]
  churnTrend: MonthlyMetric[]
  netGrowth: MonthlyMetric[]
  revenueTrend: MonthlyMetric[]
  cohorts: CohortRow[]
  churnByInstrument: { instrument: string; count: number; total: number; rate: number }[]
}

export function useAnalytics(months = 12, locationId?: string) {
  const { tenantId } = useAuthContext()

  return useQuery<AnalyticsData>({
    queryKey: [...qk.analytics.all, tenantId, months, locationId],
    enabled: !!tenantId,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const now = new Date()
      const startDate = new Date(now.getFullYear(), now.getMonth() - months + 1, 1)
      const startStr = startDate.toISOString().split('T')[0]

      // Get all students with created_at and status
      let stuQuery = supabase.from('students').select('id, status, instrument, created_at, deactivated_at, location_id').eq('tenant_id', tenantId!).limit(5000)
      if (locationId) stuQuery = stuQuery.eq('location_id', locationId)
      const { data: students } = await stuQuery

      // Revenue from invoices
      const { data: invoices } = await supabase
        .from('square_invoices')
        .select('invoice_date, requested_amount, amount_paid, location_id')
        .eq('tenant_id', tenantId!)
        .gte('invoice_date', startStr)
        .lte('invoice_date', new Date().toISOString().split('T')[0])

      // Build monthly metrics
      const enrollmentByMonth = new Map<string, number>()
      const churnByMonth = new Map<string, number>()

      for (const s of students ?? []) {
        const enrollMonth = s.created_at?.substring(0, 7)
        if (enrollMonth && enrollMonth >= startStr.substring(0, 7)) {
          enrollmentByMonth.set(enrollMonth, (enrollmentByMonth.get(enrollMonth) ?? 0) + 1)
        }
        if (s.deactivated_at) {
          const churnMonth = s.deactivated_at.substring(0, 7)
          if (churnMonth >= startStr.substring(0, 7)) {
            churnByMonth.set(churnMonth, (churnByMonth.get(churnMonth) ?? 0) + 1)
          }
        }
      }

      const revenueByMonth = new Map<string, number>()
      for (const inv of invoices ?? []) {
        const m = inv.invoice_date?.substring(0, 7)
        if (m) revenueByMonth.set(m, (revenueByMonth.get(m) ?? 0) + (inv.requested_amount ?? 0))
      }

      // Generate month labels
      const monthKeys: string[] = []
      for (let i = 0; i < months; i++) {
        const d = new Date(now.getFullYear(), now.getMonth() - months + 1 + i, 1)
        monthKeys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
      }

      const monthLabel = (key: string) => {
        const [, m] = key.split('-')
        return ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][parseInt(m) - 1]
      }

      const enrollmentTrend = monthKeys.map(k => ({ month: k, label: monthLabel(k), value: enrollmentByMonth.get(k) ?? 0 }))
      const churnTrend = monthKeys.map(k => ({ month: k, label: monthLabel(k), value: churnByMonth.get(k) ?? 0 }))
      const netGrowth = monthKeys.map(k => ({ month: k, label: monthLabel(k), value: (enrollmentByMonth.get(k) ?? 0) - (churnByMonth.get(k) ?? 0) }))
      const revenueTrend = monthKeys.map(k => ({ month: k, label: monthLabel(k), value: (revenueByMonth.get(k) ?? 0) / 100 }))

      // Cohort analysis
      const cohorts: CohortRow[] = []
      const cohortMonths = monthKeys.slice(0, Math.min(12, monthKeys.length))
      for (const cohortMonth of cohortMonths) {
        const cohortStudents = (students ?? []).filter(s => s.created_at?.substring(0, 7) === cohortMonth)
        if (cohortStudents.length === 0) continue
        const total = cohortStudents.length
        const retention: number[] = []
        for (let m = 1; m <= 12; m++) {
          const checkDate = new Date(parseInt(cohortMonth.split('-')[0]), parseInt(cohortMonth.split('-')[1]) - 1 + m, 1)
          if (checkDate > now) { retention.push(-1); continue } // future
          const stillActive = cohortStudents.filter(s => {
            if (s.status === 'active') return true
            if (s.deactivated_at) return new Date(s.deactivated_at) >= checkDate
            return true
          }).length
          retention.push(Math.round((stillActive / total) * 100))
        }
        cohorts.push({ enrollMonth: cohortMonth, label: monthLabel(cohortMonth), retention })
      }

      // Churn by instrument
      const instrMap = new Map<string, { churned: number; total: number }>()
      for (const s of students ?? []) {
        const instr = s.instrument ?? 'Unknown'
        const entry = instrMap.get(instr) ?? { churned: 0, total: 0 }
        entry.total++
        if (s.status === 'former' || s.status === 'inactive') entry.churned++
        instrMap.set(instr, entry)
      }
      const churnByInstrument = [...instrMap.entries()]
        .map(([instrument, { churned, total }]) => ({ instrument, count: churned, total, rate: total > 0 ? Math.round((churned / total) * 100) : 0 }))
        .sort((a, b) => b.rate - a.rate)

      return { enrollmentTrend, churnTrend, netGrowth, revenueTrend, cohorts, churnByInstrument }
    },
  })
}
