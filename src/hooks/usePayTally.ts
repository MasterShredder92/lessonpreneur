import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { usePermissions } from './usePermissions'

interface MonthTally {
  month: string // 'YYYY-MM'
  label: string // 'March 2026'
  blocks: number
  rate: number
  total: number
}

interface PaySummary {
  currentMonth: MonthTally | null
  previousMonth: MonthTally | null
  ytdBlocks: number
  ytdTotal: number
  byMonth: MonthTally[]
}

export function useTeacherPaySummary(teacherId: string | undefined) {
  const { canViewTeacherCompensation } = usePermissions()
  return useQuery({
    queryKey: ['teacher-pay-summary', teacherId],
    enabled: !!teacherId && canViewTeacherCompensation,
    queryFn: async (): Promise<PaySummary> => {
      // Get all completed sessions for this teacher
      const { data: sessions, error } = await supabase
        .from('session_log')
        .select('teacher_rate, block_date, status')
        .eq('teacher_id', teacherId!)
        .eq('status', 'completed')
        .order('block_date', { ascending: true })

      if (error) throw error

      // Group by month
      const monthMap = new Map<string, { blocks: number; totalPay: number; rate: number }>()
      for (const s of sessions ?? []) {
        const month = s.block_date.substring(0, 7) // 'YYYY-MM'
        const entry = monthMap.get(month) ?? { blocks: 0, totalPay: 0, rate: s.teacher_rate }
        entry.blocks += 1
        entry.totalPay += Number(s.teacher_rate)
        entry.rate = Number(s.teacher_rate) // use latest rate for display
        monthMap.set(month, entry)
      }

      // Build month tallies
      const byMonth: MonthTally[] = Array.from(monthMap.entries())
        .sort((a, b) => b[0].localeCompare(a[0])) // descending
        .map(([month, data]) => {
          const [y, m] = month.split('-')
          const date = new Date(parseInt(y), parseInt(m) - 1, 1)
          return {
            month,
            label: date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
            blocks: data.blocks,
            rate: data.rate,
            total: data.totalPay,
          }
        })

      // Current and previous month
      const now = new Date()
      const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
      const prevDate = new Date(now.getFullYear(), now.getMonth() - 1, 1)
      const prevMonthKey = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}`

      const currentMonth = byMonth.find((m) => m.month === currentMonthKey) ?? null
      const previousMonth = byMonth.find((m) => m.month === prevMonthKey) ?? null

      // YTD
      const yearKey = String(now.getFullYear())
      const ytdMonths = byMonth.filter((m) => m.month.startsWith(yearKey))
      const ytdBlocks = ytdMonths.reduce((sum, m) => sum + m.blocks, 0)
      const ytdTotal = ytdMonths.reduce((sum, m) => sum + m.total, 0)

      return { currentMonth, previousMonth, ytdBlocks, ytdTotal, byMonth }
    },
  })
}

// For the teachers list — current month blocks × rate per teacher
export function useTeachersMonthlyTally() {
  const { canViewTeacherCompensation } = usePermissions()
  return useQuery({
    queryKey: ['teachers-monthly-tally'],
    enabled: canViewTeacherCompensation,
    queryFn: async () => {
      const now = new Date()
      const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
      const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1)
      const monthEnd = `${nextMonth.getFullYear()}-${String(nextMonth.getMonth() + 1).padStart(2, '0')}-01`

      const { data, error } = await supabase
        .from('session_log')
        .select('teacher_id, teacher_rate')
        .eq('status', 'completed')
        .gte('block_date', monthStart)
        .lt('block_date', monthEnd)

      if (error) throw error

      const tallyMap = new Map<string, { blocks: number; total: number }>()
      for (const row of data ?? []) {
        const entry = tallyMap.get(row.teacher_id) ?? { blocks: 0, total: 0 }
        entry.blocks += 1
        entry.total += Number(row.teacher_rate)
        tallyMap.set(row.teacher_id, entry)
      }

      return tallyMap
    },
  })
}
