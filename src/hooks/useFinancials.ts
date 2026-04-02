import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuthContext } from '../app/AuthContext'

// ─── Types ───────────────────────────────────────────

export interface Expense {
  id: string
  location_id: string | null
  category: string
  description: string | null
  amount_cents: number
  is_recurring: boolean
  frequency: string
  effective_date: string | null
  end_date: string | null
  location_name: string | null
}

export interface PLSummary {
  grossRevenueCents: number
  teacherPayrollCents: number
  operatingExpensesCents: number
  ownerTakeHomeCents: number
  marginPercent: number
  prevMonthRevenueCents: number
  prevMonthTakeHomeCents: number
  prevMonthMarginPercent: number
  expensesByCategory: Record<string, number>
  locationBreakdown: {
    locationId: string
    locationName: string
    revenueCents: number
    expensesCents: number
    studentCount: number
    costPerStudentCents: number
    revenuePerRoomCents: number
    rooms: number
  }[]
}

export const EXPENSE_CATEGORIES = [
  { value: 'rent', label: 'Rent', icon: '\uD83C\uDFE0', color: '#D4226A' },
  { value: 'utilities', label: 'Utilities', icon: '\u26A1', color: '#FFB800' },
  { value: 'insurance', label: 'Insurance', icon: '\uD83D\uDEE1\uFE0F', color: '#3b82f6' },
  { value: 'software', label: 'Software', icon: '\uD83D\uDCBB', color: '#8B5CF6' },
  { value: 'marketing', label: 'Marketing', icon: '\uD83D\uDCE3', color: '#22C55E' },
  { value: 'supplies', label: 'Supplies', icon: '\uD83D\uDCE6', color: '#fb923c' },
  { value: 'repairs', label: 'Repairs', icon: '\uD83D\uDD27', color: '#EF4444' },
  { value: 'other', label: 'Other', icon: '\uD83D\uDCC4', color: '#8080A8' },
]

// ─── Query expenses ──────────────────────────────────

export function useExpenses() {
  const { tenantId } = useAuthContext()

  return useQuery<Expense[]>({
    queryKey: ['expenses', tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('expenses')
        .select('*')
        .eq('tenant_id', tenantId!)
        .order('category')
        .order('amount_cents', { ascending: false })

      if (error) throw error

      // Get location names
      const locIds = [...new Set((data ?? []).map(e => e.location_id).filter(Boolean))]
      const locMap = new Map<string, string>()
      if (locIds.length > 0) {
        const { data: locs } = await supabase.from('locations').select('id, name').in('id', locIds)
        locs?.forEach((l: any) => locMap.set(l.id, l.name?.replace(' Music Lessons', '') ?? ''))
      }

      return (data ?? []).map((e: any): Expense => ({
        ...e,
        location_name: e.location_id ? locMap.get(e.location_id) ?? null : null,
      }))
    },
  })
}

// ─── P&L Summary ─────────────────────────────────────

export function usePLSummary() {
  const { tenantId } = useAuthContext()

  return useQuery<PLSummary>({
    queryKey: ['pl-summary', tenantId],
    enabled: !!tenantId,
    staleTime: 60_000,
    queryFn: async () => {
      const now = new Date()
      const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
      const monthStart = `${monthKey}-01`
      const prevMonth = now.getMonth() === 0
        ? `${now.getFullYear() - 1}-12`
        : `${now.getFullYear()}-${String(now.getMonth()).padStart(2, '0')}`
      const prevMonthStart = `${prevMonth}-01`
      const prevMonthEnd = monthStart

      // 1. Gross revenue — from square_invoices requested_amount this month
      const { data: invoices } = await supabase
        .from('square_invoices')
        .select('requested_amount, location_id')
        .eq('tenant_id', tenantId!)
        .gte('invoice_date', monthStart)

      const grossRevenueCents = (invoices ?? []).reduce((s, i: any) => s + (i.requested_amount ?? 0), 0)

      // Revenue by location
      const revByLoc = new Map<string, number>()
      invoices?.forEach((i: any) => {
        if (i.location_id) revByLoc.set(i.location_id, (revByLoc.get(i.location_id) ?? 0) + (i.requested_amount ?? 0))
      })

      // 2. Teacher payroll — from session_log this month
      const { data: sessions } = await supabase
        .from('session_log')
        .select('teacher_rate')
        .eq('status', 'completed')
        .gte('block_date', monthStart)

      const teacherPayrollCents = (sessions ?? []).reduce((s, r: any) => s + Math.round(Number(r.teacher_rate) * 100), 0)

      // 3. Operating expenses — recurring monthly from expenses table
      const { data: expenses } = await supabase
        .from('expenses')
        .select('amount_cents, category, location_id, is_recurring, frequency, end_date')
        .eq('tenant_id', tenantId!)

      // Calculate monthly equivalent
      let operatingExpensesCents = 0
      const expensesByCategory: Record<string, number> = {}
      const expByLoc = new Map<string, number>()

      for (const exp of expenses ?? []) {
        if (exp.end_date && exp.end_date < monthStart) continue
        let monthly = exp.amount_cents
        if (exp.frequency === 'quarterly') monthly = Math.round(exp.amount_cents / 3)
        else if (exp.frequency === 'annual') monthly = Math.round(exp.amount_cents / 12)
        else if (exp.frequency === 'one-time') monthly = 0 // only count in the month it occurs

        operatingExpensesCents += monthly
        expensesByCategory[exp.category] = (expensesByCategory[exp.category] ?? 0) + monthly
        if (exp.location_id) {
          expByLoc.set(exp.location_id, (expByLoc.get(exp.location_id) ?? 0) + monthly)
        }
      }

      // 4. Owner take-home
      const ownerTakeHomeCents = grossRevenueCents - teacherPayrollCents - operatingExpensesCents
      const marginPercent = grossRevenueCents > 0 ? (ownerTakeHomeCents / grossRevenueCents) * 100 : 0

      // 5. Previous month (simplified — just revenue from invoices)
      const { data: prevInvoices } = await supabase
        .from('square_invoices')
        .select('requested_amount')
        .eq('tenant_id', tenantId!)
        .gte('invoice_date', prevMonthStart)
        .lt('invoice_date', prevMonthEnd)

      const prevMonthRevenueCents = (prevInvoices ?? []).reduce((s, i: any) => s + (i.requested_amount ?? 0), 0)
      const prevMonthTakeHomeCents = prevMonthRevenueCents - teacherPayrollCents - operatingExpensesCents // approximate
      const prevMonthMarginPercent = prevMonthRevenueCents > 0 ? (prevMonthTakeHomeCents / prevMonthRevenueCents) * 100 : 0

      // 6. Location breakdown
      const { data: locations } = await supabase.from('locations').select('id, name').eq('is_active', true)
      const { data: rooms } = await supabase.from('rooms').select('id, location_id')
      const { data: students } = await supabase.from('students').select('id, location_id').eq('status', 'active')

      const roomsByLoc = new Map<string, number>()
      rooms?.forEach((r: any) => { if (r.location_id) roomsByLoc.set(r.location_id, (roomsByLoc.get(r.location_id) ?? 0) + 1) })

      const studentsByLoc = new Map<string, number>()
      students?.forEach((s: any) => { if (s.location_id) studentsByLoc.set(s.location_id, (studentsByLoc.get(s.location_id) ?? 0) + 1) })

      const locationBreakdown = (locations ?? []).map((loc: any) => {
        const locRevenue = revByLoc.get(loc.id) ?? 0
        const locExpenses = expByLoc.get(loc.id) ?? 0
        const locStudents = studentsByLoc.get(loc.id) ?? 0
        const locRooms = roomsByLoc.get(loc.id) ?? 0
        return {
          locationId: loc.id,
          locationName: loc.name?.replace(' Music Lessons', '') ?? '',
          revenueCents: locRevenue,
          expensesCents: locExpenses,
          studentCount: locStudents,
          costPerStudentCents: locStudents > 0 ? Math.round(locExpenses / locStudents) : 0,
          revenuePerRoomCents: locRooms > 0 ? Math.round(locRevenue / locRooms) : 0,
          rooms: locRooms,
        }
      })

      return {
        grossRevenueCents,
        teacherPayrollCents,
        operatingExpensesCents,
        ownerTakeHomeCents,
        marginPercent,
        prevMonthRevenueCents,
        prevMonthTakeHomeCents,
        prevMonthMarginPercent,
        expensesByCategory,
        locationBreakdown,
      }
    },
  })
}

// ─── Mutations ───────────────────────────────────────

export function useCreateExpense() {
  const { tenantId } = useAuthContext()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (params: Omit<Expense, 'id' | 'location_name'>) => {
      if (!tenantId) throw new Error('Not authenticated — please log in again')
      const { error } = await supabase.from('expenses').insert({ ...params, tenant_id: tenantId })
      if (error) { console.error('Expense insert failed:', error); throw error }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['expenses'] })
      qc.invalidateQueries({ queryKey: ['pl-summary'] })
    },
  })
}

export function useUpdateExpense() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<Expense> & { id: string }) => {
      const { error } = await supabase.from('expenses').update(updates).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['expenses'] })
      qc.invalidateQueries({ queryKey: ['pl-summary'] })
    },
  })
}

export function useDeleteExpense() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('expenses').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['expenses'] })
      qc.invalidateQueries({ queryKey: ['pl-summary'] })
    },
  })
}
