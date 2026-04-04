import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuthContext } from '../app/AuthContext'

// ══════════════════════════════════════════
// TYPES
// ══════════════════════════════════════════

export interface BillingFamily {
  id: string
  name: string
  parent_name: string | null
  primary_email: string | null
  billing_status: string
  billing_day: number | null
  rate_tier: number
  card_last_four: string | null
  card_brand: string | null
  balance: number
  overdue_balance_cents: number
  square_customer_id: string | null
  primary_location_id: string | null
  students: {
    id: string
    first_name: string
    last_name: string
    instrument: string | null
    sessions_per_month: number
    rate_per_session: number
    monthly_cents: number
    location_id: string | null
  }[]
  monthlyTotalCents: number
  activeStudentCount: number
}

export interface BillingOverview {
  activeFamilyCount: number
  nextMonthTotal: number
  remainingToCollect: number
  overdueTotalCents: number
  overdueCount: number
  paidThisMonthCents: number
  paidThisMonthCount: number
}

export interface PendingAdjustment {
  id: string
  family_id: string
  student_id: string | null
  adjustment_type: string
  amount_cents: number | null
  percent: number | null
  reason: string
  applies_to_cycle: string
  created_at: string
  status: string
  student_name?: string
  family_name?: string
}

export interface BillingHeroStats {
  collectedCents: number
  collectedCount: number
  awaitingCents: number
  awaitingCount: number
  discountedCents: number
  fullPotentialCents: number
  pastDueCents: number
  pastDueFamilies: number
  nextMonthCents: number
  nextMonthCount: number
  nextMonthLabel: string
}

// ══════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════

export function getMonthStart(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
}

export function getNextCycleMonth(): string {
  const now = new Date()
  const next = new Date(now.getFullYear(), now.getMonth() + 1, 1)
  return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-01`
}

function getCurrentMonthKey(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

function nextMonthStr(monthKey: string): string {
  const [y, m] = monthKey.split('-').map(Number)
  if (m === 12) return `${y + 1}-01-01`
  return `${y}-${String(m + 1).padStart(2, '0')}-01`
}

export function getMonthAfterNext(): string {
  const now = new Date()
  const d = new Date(now.getFullYear(), now.getMonth() + 2, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

// ══════════════════════════════════════════
// 1. BILLING OVERVIEW (hero box values)
// ══════════════════════════════════════════

export function useBillingOverview(locationFilter: string) {
  return useQuery<BillingOverview>({
    queryKey: ['billing_overview', locationFilter],
    queryFn: async () => {
      let ratesQuery = supabase.from('student_effective_rate')
        .select('student_id, family_id, monthly_cents, sessions_per_month, location_id, billing_status')
      if (locationFilter) ratesQuery = ratesQuery.eq('location_id', locationFilter)
      const { data: rates } = await ratesQuery

      const activeRates = (rates ?? []).filter((r: any) => r.billing_status === 'active')
      const familyIds = [...new Set(activeRates.map((r: any) => r.family_id))]
      const nextMonthTotal = activeRates.reduce((s: number, r: any) => s + (r.monthly_cents ?? 0), 0)

      const monthStart = getMonthStart()
      let paidQuery = supabase.from('payment_history')
        .select('amount_cents, family_id')
        .gte('created_at', monthStart)
        .eq('status', 'completed')
      if (locationFilter && familyIds.length > 0) {
        paidQuery = paidQuery.in('family_id', familyIds)
      }
      const { data: paid } = await paidQuery
      const paidCents = (paid ?? []).reduce((s: number, p: any) => s + (p.amount_cents ?? 0), 0)

      let overdueQuery = supabase.from('families')
        .select('id, overdue_balance_cents')
        .gt('overdue_balance_cents', 0)
        .eq('billing_status', 'active')
      if (locationFilter) overdueQuery = overdueQuery.eq('primary_location_id', locationFilter)
      const { data: overdue } = await overdueQuery
      const overdueCents = (overdue ?? []).reduce((s: number, f: any) => s + (f.overdue_balance_cents ?? 0), 0)

      return {
        activeFamilyCount: familyIds.length,
        nextMonthTotal,
        remainingToCollect: Math.max(0, nextMonthTotal - paidCents),
        overdueTotalCents: overdueCents,
        overdueCount: (overdue ?? []).length,
        paidThisMonthCents: paidCents,
        paidThisMonthCount: (paid ?? []).length,
      }
    },
  })
}

// ══════════════════════════════════════════
// 2. FAMILIES INVOICES
// ══════════════════════════════════════════

export function useBillingFamilies(locationFilter: string) {
  return useQuery<BillingFamily[]>({
    queryKey: ['billing_families', locationFilter],
    queryFn: async () => {
      let ratesQuery = supabase.from('student_effective_rate')
        .select('*')
        .eq('status', 'active')
      if (locationFilter) ratesQuery = ratesQuery.eq('location_id', locationFilter)
      const { data: rates } = await ratesQuery

      const familyMap = new Map<string, any[]>()
      for (const r of (rates ?? [])) {
        const list = familyMap.get(r.family_id) ?? []
        list.push(r)
        familyMap.set(r.family_id, list)
      }

      if (familyMap.size === 0) return []

      const { data: families } = await supabase.from('families')
        .select('id, name, parent_name, primary_email, billing_status, billing_day, rate_tier, card_last_four, card_brand, balance, overdue_balance_cents, square_customer_id, primary_location_id')
        .in('id', [...familyMap.keys()])
        .eq('billing_status', 'active')

      return (families ?? []).map((f: any): BillingFamily => {
        const students = familyMap.get(f.id) ?? []
        const monthlyTotal = students.reduce((s: number, st: any) => s + (st.monthly_cents ?? 0), 0)
        return {
          ...f,
          overdue_balance_cents: f.overdue_balance_cents ?? 0,
          students: students.map((st: any) => ({
            id: st.student_id,
            first_name: st.first_name,
            last_name: st.last_name,
            instrument: st.instrument,
            sessions_per_month: st.sessions_per_month,
            rate_per_session: Number(st.rate_per_session),
            monthly_cents: st.monthly_cents ?? 0,
            location_id: st.location_id,
          })),
          monthlyTotalCents: monthlyTotal,
          activeStudentCount: students.length,
        }
      }).sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''))
    },
  })
}

// ══════════════════════════════════════════
// 3. NEXT CYCLE
// ══════════════════════════════════════════

export function useNextCycle(locationFilter: string) {
  return useQuery({
    queryKey: ['billing_next_cycle', locationFilter],
    queryFn: async () => {
      let ratesQuery = supabase.from('student_effective_rate')
        .select('*')
        .eq('status', 'active')
      if (locationFilter) ratesQuery = ratesQuery.eq('location_id', locationFilter)
      const { data: rates } = await ratesQuery

      const familyMap = new Map<string, any[]>()
      for (const r of (rates ?? [])) {
        const list = familyMap.get(r.family_id) ?? []
        list.push(r)
        familyMap.set(r.family_id, list)
      }

      if (familyMap.size === 0) return { families: [] as any[], adjustments: [] as any[], totalCents: 0, totalSessions: 0 }

      const { data: families } = await supabase.from('families')
        .select('id, name, parent_name, billing_status, billing_day, card_last_four, card_brand')
        .in('id', [...familyMap.keys()])
        .eq('billing_status', 'active')

      const nextMonth = getNextCycleMonth()
      const { data: adjustments } = await supabase.from('billing_adjustments')
        .select('*')
        .eq('applied', false)
        .lte('applies_to_cycle', nextMonth)

      const adjByFamily = new Map<string, any[]>()
      for (const a of (adjustments ?? [])) {
        const list = adjByFamily.get(a.family_id) ?? []
        list.push(a)
        adjByFamily.set(a.family_id, list)
      }

      const enriched = (families ?? []).map((f: any) => {
        const students = familyMap.get(f.id) ?? []
        const baseCents = students.reduce((s: number, st: any) => s + (st.monthly_cents ?? 0), 0)
        const totalSessions = students.reduce((s: number, st: any) => s + (st.sessions_per_month ?? 0), 0)
        const familyAdj = adjByFamily.get(f.id) ?? []
        const creditCents = familyAdj.reduce((s: number, a: any) => s + Math.abs(a.amount_cents ?? 0), 0)
        return {
          ...f,
          students: students.map((st: any) => ({
            id: st.student_id,
            first_name: st.first_name,
            instrument: st.instrument,
            sessions_per_month: st.sessions_per_month,
            monthly_cents: st.monthly_cents,
          })),
          baseCents,
          totalSessions,
          creditCents,
          adjustedCents: Math.max(0, baseCents - creditCents),
          adjustments: familyAdj,
        }
      }).sort((a: any, b: any) => (a.name ?? '').localeCompare(b.name ?? ''))

      return {
        families: enriched,
        adjustments: adjustments ?? [],
        totalCents: enriched.reduce((s: number, f: any) => s + f.adjustedCents, 0),
        totalSessions: enriched.reduce((s: number, f: any) => s + f.totalSessions, 0),
      }
    },
  })
}

// ══════════════════════════════════════════
// 4. REMAINING TO COLLECT
// ══════════════════════════════════════════

export function useRemainingToCollect(locationFilter: string) {
  return useQuery({
    queryKey: ['billing_remaining', locationFilter],
    queryFn: async () => {
      let query = supabase.from('families')
        .select('id, name, parent_name, balance, card_last_four, card_brand, billing_day')
        .gt('balance', 0)
        .eq('billing_status', 'active')
      if (locationFilter) query = query.eq('primary_location_id', locationFilter)
      const { data } = await query

      return (data ?? []).map((f: any) => ({
        ...f,
        remainingCents: f.balance ?? 0,
      })).sort((a: any, b: any) => b.remainingCents - a.remainingCents)
    },
  })
}

// ══════════════════════════════════════════
// 5. OVERDUE FAMILIES
// ══════════════════════════════════════════

export function useOverdueFamilies(locationFilter: string) {
  return useQuery({
    queryKey: ['billing_overdue', locationFilter],
    queryFn: async () => {
      let query = supabase.from('families')
        .select('id, name, parent_name, overdue_balance_cents, billing_day, card_last_four, card_brand')
        .gt('overdue_balance_cents', 0)
        .eq('billing_status', 'active')
      if (locationFilter) query = query.eq('primary_location_id', locationFilter)
      const { data } = await query

      return (data ?? []).map((f: any) => ({
        ...f,
        overdueCents: f.overdue_balance_cents ?? 0,
      })).sort((a: any, b: any) => b.overdueCents - a.overdueCents)
    },
  })
}

// ══════════════════════════════════════════
// 6. PAID THIS MONTH
// ══════════════════════════════════════════

export function usePaidThisMonth(locationFilter: string) {
  return useQuery({
    queryKey: ['billing_paid', locationFilter],
    queryFn: async () => {
      const monthStart = getMonthStart()
      const query = supabase.from('payment_history')
        .select('id, family_id, amount_cents, status, card_last_four, card_brand, created_at, billing_period_id')
        .gte('created_at', monthStart)
        .eq('status', 'completed')
        .order('created_at', { ascending: false })

      const { data: payments } = await query

      if (!payments || payments.length === 0) return { payments: [] as any[], totalCents: 0 }

      const familyIds = [...new Set(payments.map((p: any) => p.family_id))]
      const { data: families } = await supabase.from('families')
        .select('id, name, parent_name, primary_location_id')
        .in('id', familyIds)
      const familyMap = new Map<string, any>()
      families?.forEach((f: any) => familyMap.set(f.id, f))

      let filtered = payments.map((p: any) => ({
        ...p,
        familyName: familyMap.get(p.family_id)?.name ?? 'Unknown',
        parentName: familyMap.get(p.family_id)?.parent_name ?? null,
        locationId: familyMap.get(p.family_id)?.primary_location_id ?? null,
      }))

      if (locationFilter) {
        filtered = filtered.filter((p: any) => p.locationId === locationFilter)
      }

      return {
        payments: filtered,
        totalCents: filtered.reduce((s: number, p: any) => s + (p.amount_cents ?? 0), 0),
      }
    },
  })
}

// ══════════════════════════════════════════
// 7. CREDITS LEDGER
// ══════════════════════════════════════════

export function useCreditsLedger(locationFilter: string) {
  return useQuery({
    queryKey: ['billing_credits', locationFilter],
    queryFn: async () => {
      const { data } = await supabase.from('billing_adjustments')
        .select('id, family_id, student_id, adjustment_type, amount_cents, percent, reason, applies_to_cycle, applied, created_at, created_by, status')
        .order('created_at', { ascending: false })
        .limit(100)

      if (!data || data.length === 0) return []

      const familyIds = [...new Set(data.map((a: any) => a.family_id))]
      const { data: families } = await supabase.from('families')
        .select('id, name, primary_location_id')
        .in('id', familyIds)
      const familyMap = new Map<string, any>()
      families?.forEach((f: any) => familyMap.set(f.id, f))

      const studentIds = data.map((a: any) => a.student_id).filter(Boolean) as string[]
      const studentMap = new Map<string, string>()
      if (studentIds.length > 0) {
        const { data: students } = await supabase.from('students')
          .select('id, first_name, last_name')
          .in('id', studentIds)
        students?.forEach((s: any) => studentMap.set(s.id, `${s.first_name} ${s.last_name}`.trim()))
      }

      let results = data.map((a: any) => ({
        ...a,
        familyName: familyMap.get(a.family_id)?.name ?? 'Unknown',
        studentName: a.student_id ? studentMap.get(a.student_id) ?? null : null,
        locationId: familyMap.get(a.family_id)?.primary_location_id ?? null,
      }))

      if (locationFilter) {
        results = results.filter((a: any) => a.locationId === locationFilter)
      }

      return results
    },
  })
}

// ══════════════════════════════════════════
// 8. CREATE BILLING ADJUSTMENT
// ══════════════════════════════════════════

export function useCreateBillingAdjustment() {
  const { tenantId, profile } = useAuthContext()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (params: {
      familyId: string
      studentId?: string
      adjustmentType: string
      amountCents: number
      reason: string
    }) => {
      if (!tenantId) throw new Error('No tenant')
      const nextMonth = getNextCycleMonth()
      const { error } = await supabase.from('billing_adjustments').insert({
        tenant_id: tenantId,
        family_id: params.familyId,
        student_id: params.studentId || null,
        adjustment_type: params.adjustmentType,
        amount_cents: params.amountCents,
        reason: params.reason,
        applies_to_cycle: nextMonth,
        applied: false,
        created_by: profile?.id ?? null,
        status: 'pending',
      })
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['billing_next_cycle'] })
      qc.invalidateQueries({ queryKey: ['billing_overview'] })
      qc.invalidateQueries({ queryKey: ['billing_credits'] })
    },
  })
}

// ══════════════════════════════════════════
// 9. CREATE ONE-OFF INVOICE
// ══════════════════════════════════════════

export function useCreateOneOffInvoice() {
  const { tenantId } = useAuthContext()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (params: {
      familyId: string
      studentId?: string
      description: string
      amountCents: number
      dueDate: string
      note?: string
    }) => {
      if (!tenantId) throw new Error('No tenant')
      const { error } = await supabase.from('billing_events').insert({
        tenant_id: tenantId,
        family_id: params.familyId,
        status: 'pending',
        amount_cents: params.amountCents,
      })
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['billing_overview'] })
      qc.invalidateQueries({ queryKey: ['billing_families'] })
    },
  })
}

// ══════════════════════════════════════════
// BILLING HERO STATS — shared with Dashboard
// Queries square_invoices with strict calendar month boundaries
// ══════════════════════════════════════════

export function useBillingHeroStats(locationId?: string) {
  const { tenantId } = useAuthContext()
  const monthStart = getMonthStart()
  const nextMonth = getNextCycleMonth()
  const monthAfterNext = getMonthAfterNext()
  const locKey = locationId || 'all'

  return useQuery<BillingHeroStats>({
    queryKey: ['billing_hero_stats', tenantId, monthStart, locKey],
    enabled: !!tenantId,
    staleTime: 0,
    queryFn: async (): Promise<BillingHeroStats> => {
      const today = new Date().toISOString().split('T')[0]

      // 1. Collected: PAID invoices, current month by invoice_date
      let collectedQ = supabase.from('square_invoices')
        .select('amount_cents')
        .eq('tenant_id', tenantId!)
        .eq('status', 'PAID')
        .gte('invoice_date', monthStart)
        .lt('invoice_date', nextMonth)
      if (locationId) collectedQ = collectedQ.eq('location_id', locationId)

      // 2. Awaiting: SCHEDULED invoices, current month by due_date
      let awaitingQ = supabase.from('square_invoices')
        .select('amount_cents')
        .eq('tenant_id', tenantId!)
        .eq('status', 'SCHEDULED')
        .gte('due_date', monthStart)
        .lt('due_date', nextMonth)
      if (locationId) awaitingQ = awaitingQ.eq('location_id', locationId)

      // 3. Past due: UNPAID invoices, current month by due_date, due before today
      let pastDueQ = supabase.from('square_invoices')
        .select('amount_cents, family_id')
        .eq('tenant_id', tenantId!)
        .eq('status', 'UNPAID')
        .gte('due_date', monthStart)
        .lt('due_date', nextMonth)
        .lt('due_date', today)
      if (locationId) pastDueQ = pastDueQ.eq('location_id', locationId)

      // 4. Next month: SCHEDULED invoices, next month by due_date
      let nextMonthQ = supabase.from('square_invoices')
        .select('amount_cents')
        .eq('tenant_id', tenantId!)
        .eq('status', 'SCHEDULED')
        .gte('due_date', nextMonth)
        .lt('due_date', monthAfterNext)
      if (locationId) nextMonthQ = nextMonthQ.eq('location_id', locationId)

      // 5. Discounted: billing_adjustments, current month by applies_to_cycle
      const discountQ = supabase.from('billing_adjustments')
        .select('amount_cents')
        .eq('tenant_id', tenantId!)
        .gte('applies_to_cycle', monthStart)
        .lt('applies_to_cycle', nextMonth)

      const [collected, awaiting, pastDue, nextMo, discounts] = await Promise.all([
        collectedQ, awaitingQ, pastDueQ, nextMonthQ, discountQ,
      ])

      const collectedCents = (collected.data ?? []).reduce((s, r: any) => s + (r.amount_cents ?? 0), 0)
      const awaitingCents = (awaiting.data ?? []).reduce((s, r: any) => s + (r.amount_cents ?? 0), 0)
      const pastDueRows = pastDue.data ?? []
      const pastDueCents = pastDueRows.reduce((s, r: any) => s + (r.amount_cents ?? 0), 0)
      const pastDueFamilies = new Set(pastDueRows.filter((r: any) => r.family_id).map((r: any) => r.family_id)).size
      const nextMonthCents = (nextMo.data ?? []).reduce((s, r: any) => s + (r.amount_cents ?? 0), 0)
      const nextMonthCount = (nextMo.data ?? []).length
      const discountedCents = (discounts.data ?? []).reduce((s: number, a: any) => s + (a.amount_cents ?? 0), 0)
      const fullPotentialCents = collectedCents + awaitingCents + discountedCents

      // Next month label (e.g. "May")
      const nextMonthDate = new Date(nextMonth + 'T12:00:00')
      const nextMonthLabel = nextMonthDate.toLocaleDateString('en-US', { month: 'long' })

      return {
        collectedCents,
        collectedCount: (collected.data ?? []).length,
        awaitingCents,
        awaitingCount: (awaiting.data ?? []).length,
        discountedCents,
        fullPotentialCents,
        pastDueCents,
        pastDueFamilies,
        nextMonthCents,
        nextMonthCount,
        nextMonthLabel,
      }
    },
  })
}
