import { useQuery, useMutation, useQueryClient, useInfiniteQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuthContext } from '../app/AuthContext'
import { qk } from '../lib/queryKeys'

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

/** Calendar month bounds for invoice_date filters (monthStart inclusive, nextMonthStart exclusive). */
export function getInvoiceMonthBounds(d: Date): { monthStart: string; nextMonthStart: string } {
  const y = d.getFullYear()
  const m = d.getMonth()
  const monthStart = `${y}-${String(m + 1).padStart(2, '0')}-01`
  const next = new Date(y, m + 1, 1)
  const nextMonthStart = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-01`
  return { monthStart, nextMonthStart }
}

// ══════════════════════════════════════════
// 1. BILLING OVERVIEW (hero box values)
// ══════════════════════════════════════════

export function useBillingOverview(locationFilter: string) {
  const { tenantId, profile } = useAuthContext()
  return useQuery<BillingOverview>({
    queryKey: [...qk.billing.overview, tenantId, locationFilter],
    enabled: !!tenantId && profile?.role !== 'teacher' && profile?.role !== 'student',
    queryFn: async () => {
      let ratesQuery = supabase.from('student_effective_rate')
        .select('student_id, family_id, monthly_cents, sessions_per_month, location_id, billing_status')
        .eq('tenant_id', tenantId!)
      if (locationFilter) ratesQuery = ratesQuery.eq('location_id', locationFilter)
      const { data: rates } = await ratesQuery

      const activeRates = (rates ?? []).filter((r: any) => r.billing_status === 'active')
      const familyIds = [...new Set(activeRates.map((r: any) => r.family_id))]
      const nextMonthTotal = activeRates.reduce((s: number, r: any) => s + (r.monthly_cents ?? 0), 0)

      const monthStart = getMonthStart()
      let paidQuery = supabase.from('payment_history')
        .select('amount_cents, family_id')
        .eq('tenant_id', tenantId!)
        .gte('created_at', monthStart)
        .eq('status', 'completed')
      if (locationFilter && familyIds.length > 0) {
        paidQuery = paidQuery.in('family_id', familyIds)
      }
      const { data: paid } = await paidQuery
      const paidCents = (paid ?? []).reduce((s: number, p: any) => s + (p.amount_cents ?? 0), 0)

      let overdueQuery = supabase.from('families')
        .select('id, overdue_balance_cents')
        .eq('tenant_id', tenantId!)
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

export function useBillingFamilies(locationFilter: string, sectionEnabled = true) {
  const { tenantId, profile } = useAuthContext()
  return useQuery<BillingFamily[]>({
    queryKey: [...qk.billing.families, tenantId, locationFilter],
    enabled: !!tenantId && profile?.role !== 'teacher' && profile?.role !== 'student' && sectionEnabled,
    queryFn: async () => {
      let ratesQuery = supabase.from('student_effective_rate')
        .select('*')
        .eq('tenant_id', tenantId!)
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
        .eq('tenant_id', tenantId!)
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

export function useNextCycle(locationFilter: string, sectionEnabled = true) {
  const { tenantId, profile } = useAuthContext()
  return useQuery({
    queryKey: [...qk.billing.nextCycle, tenantId, locationFilter],
    enabled: !!tenantId && profile?.role !== 'teacher' && profile?.role !== 'student' && sectionEnabled,
    queryFn: async () => {
      let ratesQuery = supabase.from('student_effective_rate')
        .select('*')
        .eq('tenant_id', tenantId!)
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
        .eq('tenant_id', tenantId!)
        .in('id', [...familyMap.keys()])
        .eq('billing_status', 'active')

      const nextMonth = getNextCycleMonth()
      const { data: adjustments } = await supabase.from('billing_adjustments')
        .select('*')
        .eq('tenant_id', tenantId!)
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

export function useRemainingToCollect(locationFilter: string, sectionEnabled = true) {
  const { tenantId, profile } = useAuthContext()
  return useQuery({
    queryKey: [...qk.billing.remaining, tenantId, locationFilter],
    enabled: !!tenantId && profile?.role !== 'teacher' && profile?.role !== 'student' && sectionEnabled,
    queryFn: async () => {
      let query = supabase.from('families')
        .select('id, name, parent_name, balance, card_last_four, card_brand, billing_day')
        .eq('tenant_id', tenantId!)
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

export function useOverdueFamilies(locationFilter: string, sectionEnabled = true) {
  const { tenantId, profile } = useAuthContext()
  return useQuery({
    queryKey: [...qk.billing.overdue, tenantId, locationFilter],
    enabled: !!tenantId && profile?.role !== 'teacher' && profile?.role !== 'student' && sectionEnabled,
    queryFn: async () => {
      let query = supabase.from('families')
        .select('id, name, parent_name, overdue_balance_cents, billing_day, card_last_four, card_brand')
        .eq('tenant_id', tenantId!)
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

export function usePaidThisMonth(locationFilter: string, sectionEnabled = true) {
  const { tenantId, profile } = useAuthContext()
  return useQuery({
    queryKey: [...qk.billing.paid, tenantId, locationFilter],
    enabled: !!tenantId && profile?.role !== 'teacher' && profile?.role !== 'student' && sectionEnabled,
    queryFn: async () => {
      const monthStart = getMonthStart()
      const query = supabase.from('payment_history')
        .select('id, family_id, amount_cents, status, card_last_four, card_brand, created_at, billing_period_id')
        .eq('tenant_id', tenantId!)
        .gte('created_at', monthStart)
        .eq('status', 'completed')
        .order('created_at', { ascending: false })

      const { data: payments } = await query

      if (!payments || payments.length === 0) return { payments: [] as any[], totalCents: 0 }

      const familyIds = [...new Set(payments.map((p: any) => p.family_id))]
      const { data: families } = await supabase.from('families')
        .select('id, name, parent_name, primary_location_id')
        .eq('tenant_id', tenantId!)
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

export function useCreditsLedger(locationFilter: string, ledgerOpen = true) {
  const { tenantId, profile } = useAuthContext()
  return useQuery({
    queryKey: [...qk.billing.credits, tenantId, locationFilter],
    enabled: !!tenantId && profile?.role !== 'teacher' && profile?.role !== 'student' && ledgerOpen,
    queryFn: async () => {
      const { data } = await supabase.from('billing_adjustments')
        .select('id, family_id, student_id, adjustment_type, amount_cents, percent, reason, applies_to_cycle, applied, created_at, created_by, status')
        .eq('tenant_id', tenantId!)
        .order('created_at', { ascending: false })
        .limit(100)

      if (!data || data.length === 0) return []

      const familyIds = [...new Set(data.map((a: any) => a.family_id))]
      const { data: families } = await supabase.from('families')
        .select('id, name, primary_location_id')
        .eq('tenant_id', tenantId!)
        .in('id', familyIds)
      const familyMap = new Map<string, any>()
      families?.forEach((f: any) => familyMap.set(f.id, f))

      const studentIds = data.map((a: any) => a.student_id).filter(Boolean) as string[]
      const studentMap = new Map<string, string>()
      if (studentIds.length > 0) {
        const { data: students } = await supabase.from('students')
          .select('id, first_name, last_name')
          .eq('tenant_id', tenantId!)
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
      qc.invalidateQueries({ queryKey: qk.billing.nextCycle })
      qc.invalidateQueries({ queryKey: qk.billing.overview })
      qc.invalidateQueries({ queryKey: qk.billing.credits })
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
      qc.invalidateQueries({ queryKey: qk.billing.overview })
      qc.invalidateQueries({ queryKey: qk.billing.families })
      qc.invalidateQueries({ queryKey: qk.billing.familiesOneOff })
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
    queryKey: [...qk.billing.heroStats, tenantId, monthStart, locKey],
    enabled: !!tenantId,
    staleTime: 60_000,
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

// ══════════════════════════════════════════
// SQUARE INVOICES — lazy panel (summary + paginated list)
// ══════════════════════════════════════════

const INVOICE_PAGE_SIZE = 25

/** Calendar scope. Default this_month — archive only when user picks Full history or custom. */
export type InvoiceDatePreset = 'this_month' | 'prev_month' | 'custom' | 'all'

/**
 * operating = this month on invoice_date OR any overdue UNPAID (default operating view).
 * With datePreset `all`, operating = unpaid/scheduled Square invoice states (no date filter; not LP lesson recurrence).
 */
export type InvoicePanelStatusFilter = 'operating' | 'all' | 'open' | 'overdue' | 'paid'

export interface SquareInvoiceSummaryRow {
  id: string
  invoice_date: string | null
  due_date: string | null
  status: string
  requested_amount: number | null
  family_id: string | null
  family_name: string | null
}

export interface SquareInvoiceSummary {
  monthOperating: number
  paidThisMonth: number
  overdueUnpaid: number
  recent: SquareInvoiceSummaryRow[]
}

/** Square invoice JSON from sync — hosted payment page when present. */
export function extractSquareInvoicePublicUrl(rawData: unknown): string | null {
  if (rawData == null || typeof rawData !== 'object') return null
  const r = rawData as Record<string, unknown>
  const u = r.public_url
  return typeof u === 'string' && u.startsWith('http') ? u : null
}

/** Lightweight counts for default this-month operating view (no full-archive scan). */
export function useSquareInvoiceSummary(locationId: string | undefined, enabled: boolean) {
  const { tenantId, profile } = useAuthContext()
  const locKey = locationId || 'all'
  return useQuery<SquareInvoiceSummary>({
    queryKey: [...qk.billing.squareInvoiceSummary, tenantId, locKey],
    enabled: !!tenantId && enabled && profile?.role !== 'teacher' && profile?.role !== 'student',
    staleTime: 45_000,
    queryFn: async () => {
      const tid = tenantId!
      const today = new Date().toISOString().split('T')[0]
      const { monthStart, nextMonthStart } = getInvoiceMonthBounds(new Date())
      const operatingOr = `and(invoice_date.gte.${monthStart},invoice_date.lt.${nextMonthStart}),and(status.eq.UNPAID,due_date.lt.${today})`

      const base = () => {
        let q = supabase.from('square_invoices').eq('tenant_id', tid).not('status', 'in', '("CANCELED","DRAFT")')
        if (locationId) q = q.eq('location_id', locationId)
        return q
      }

      const [monthOp, paidMo, overdueAny] = await Promise.all([
        base().select('id', { count: 'exact', head: true }).or(operatingOr),
        base()
          .select('id', { count: 'exact', head: true })
          .gte('invoice_date', monthStart)
          .lt('invoice_date', nextMonthStart)
          .in('status', ['PAID', 'PARTIALLY_REFUNDED']),
        base().select('id', { count: 'exact', head: true }).eq('status', 'UNPAID').lt('due_date', today),
      ])

      const recentQ = base()
        .or(operatingOr)
        .select('id, invoice_date, due_date, status, requested_amount, family_id')
        .order('invoice_date', { ascending: false })
        .limit(3)
      const { data: recentRows } = await recentQ

      const famIds = [...new Set((recentRows ?? []).map((r: any) => r.family_id).filter(Boolean))]
      const famNames = new Map<string, string>()
      if (famIds.length) {
        const { data: fs } = await supabase.from('families').select('id, name').eq('tenant_id', tid).in('id', famIds as string[])
        fs?.forEach((f: any) => famNames.set(f.id, f.name))
      }

      const recent: SquareInvoiceSummaryRow[] = (recentRows ?? []).map((r: any) => ({
        id: r.id,
        invoice_date: r.invoice_date,
        due_date: r.due_date,
        status: r.status,
        requested_amount: r.requested_amount,
        family_id: r.family_id,
        family_name: r.family_id ? famNames.get(r.family_id) ?? null : null,
      }))

      return {
        monthOperating: monthOp.count ?? 0,
        paidThisMonth: paidMo.count ?? 0,
        overdueUnpaid: overdueAny.count ?? 0,
        recent,
      }
    },
  })
}

export interface SquareInvoiceListRow {
  id: string
  invoice_date: string | null
  due_date: string | null
  status: string
  requested_amount: number | null
  amount_paid: number | null
  family_id: string | null
  location_id: string | null
  family_name: string
  square_invoice_id: string | null
  public_url: string | null
}

export function useSquareInvoicesInfinite(opts: {
  tenantId: string | undefined
  locationId: string
  datePreset: InvoiceDatePreset
  customFrom: string
  customTo: string
  statusFilter: InvoicePanelStatusFilter
  search: string
  enabled: boolean
}) {
  const { tenantId, locationId, datePreset, customFrom, customTo, statusFilter, search, enabled } = opts
  return useInfiniteQuery({
    queryKey: [
      ...qk.billing.squareInvoicesPaged,
      tenantId,
      locationId,
      datePreset,
      customFrom,
      customTo,
      statusFilter,
      search.trim(),
    ],
    enabled: !!tenantId && enabled,
    initialPageParam: 0,
    staleTime: 30_000,
    queryFn: async ({ pageParam }): Promise<{ rows: SquareInvoiceListRow[]; totalCount: number }> => {
      const tid = tenantId!
      const today = new Date().toISOString().split('T')[0]
      const { monthStart, nextMonthStart } = getInvoiceMonthBounds(new Date())
      const prevAnchor = new Date()
      prevAnchor.setMonth(prevAnchor.getMonth() - 1)
      const { monthStart: prevMonthStart, nextMonthStart: prevNextStart } = getInvoiceMonthBounds(prevAnchor)

      let searchFamilyIds: string[] | null = null
      const qterm = search.trim().replace(/%/g, '').slice(0, 80)
      if (qterm) {
        const pattern = `%${qterm}%`
        const { data: fams } = await supabase
          .from('families')
          .select('id')
          .eq('tenant_id', tid)
          .or(`name.ilike.${pattern},parent_name.ilike.${pattern},primary_contact_name.ilike.${pattern}`)
        searchFamilyIds = (fams ?? []).map((f: any) => f.id)
        if (searchFamilyIds.length === 0) {
          return { rows: [], totalCount: 0 }
        }
      }

      const effectivePreset: InvoiceDatePreset =
        datePreset === 'custom' && (!customFrom.trim() || !customTo.trim()) ? 'this_month' : datePreset

      let q = supabase
        .from('square_invoices')
        .select(
          'id, invoice_date, due_date, status, requested_amount, amount_paid, family_id, location_id, square_invoice_id, raw_data',
          { count: 'exact' },
        )
        .eq('tenant_id', tid)
        .not('status', 'in', '("CANCELED","DRAFT")')

      if (locationId) q = q.eq('location_id', locationId)
      if (searchFamilyIds) q = q.in('family_id', searchFamilyIds)

      if (effectivePreset === 'all') {
        if (statusFilter === 'operating') {
          q = q.in('status', ['UNPAID', 'SCHEDULED', 'RECURRING'])
        } else if (statusFilter === 'paid') {
          q = q.in('status', ['PAID', 'PARTIALLY_REFUNDED'])
        } else if (statusFilter === 'overdue') {
          q = q.eq('status', 'UNPAID').lt('due_date', today)
        } else if (statusFilter === 'open') {
          q = q.or(`status.eq.SCHEDULED,and(status.eq.UNPAID,due_date.gte.${today})`)
        }
      } else if (effectivePreset === 'this_month') {
        if (statusFilter === 'operating') {
          q = q.or(
            `and(invoice_date.gte.${monthStart},invoice_date.lt.${nextMonthStart}),and(status.eq.UNPAID,due_date.lt.${today})`,
          )
        } else if (statusFilter === 'all') {
          q = q.gte('invoice_date', monthStart).lt('invoice_date', nextMonthStart)
        } else if (statusFilter === 'paid') {
          q = q
            .gte('invoice_date', monthStart)
            .lt('invoice_date', nextMonthStart)
            .in('status', ['PAID', 'PARTIALLY_REFUNDED'])
        } else if (statusFilter === 'overdue') {
          q = q.eq('status', 'UNPAID').lt('due_date', today)
        } else if (statusFilter === 'open') {
          q = q
            .gte('invoice_date', monthStart)
            .lt('invoice_date', nextMonthStart)
            .or(`status.eq.SCHEDULED,and(status.eq.UNPAID,due_date.gte.${today})`)
        }
      } else if (effectivePreset === 'prev_month') {
        if (statusFilter === 'operating') {
          q = q.or(
            `and(invoice_date.gte.${prevMonthStart},invoice_date.lt.${prevNextStart}),and(status.eq.UNPAID,due_date.lt.${today})`,
          )
        } else if (statusFilter === 'all') {
          q = q.gte('invoice_date', prevMonthStart).lt('invoice_date', prevNextStart)
        } else if (statusFilter === 'paid') {
          q = q
            .gte('invoice_date', prevMonthStart)
            .lt('invoice_date', prevNextStart)
            .in('status', ['PAID', 'PARTIALLY_REFUNDED'])
        } else if (statusFilter === 'overdue') {
          q = q.eq('status', 'UNPAID').lt('due_date', today)
        } else if (statusFilter === 'open') {
          q = q
            .gte('invoice_date', prevMonthStart)
            .lt('invoice_date', prevNextStart)
            .or(`status.eq.SCHEDULED,and(status.eq.UNPAID,due_date.gte.${today})`)
        }
      } else if (effectivePreset === 'custom') {
        const fromD = customFrom.trim()
        const toD = customTo.trim()
        if (statusFilter === 'operating') {
          q = q.or(`and(invoice_date.gte.${fromD},invoice_date.lte.${toD}),and(status.eq.UNPAID,due_date.lt.${today})`)
        } else if (statusFilter === 'all') {
          q = q.gte('invoice_date', fromD).lte('invoice_date', toD)
        } else if (statusFilter === 'paid') {
          q = q.gte('invoice_date', fromD).lte('invoice_date', toD).in('status', ['PAID', 'PARTIALLY_REFUNDED'])
        } else if (statusFilter === 'overdue') {
          q = q.eq('status', 'UNPAID').lt('due_date', today)
        } else if (statusFilter === 'open') {
          q = q
            .gte('invoice_date', fromD)
            .lte('invoice_date', toD)
            .or(`status.eq.SCHEDULED,and(status.eq.UNPAID,due_date.gte.${today})`)
        }
      }

      const page = pageParam as number
      const from = page * INVOICE_PAGE_SIZE
      const to = from + INVOICE_PAGE_SIZE - 1
      const { data, error, count } = await q
        .order('invoice_date', { ascending: false })
        .range(from, to)
      if (error) throw error

      const famIds = [...new Set((data ?? []).map((r: any) => r.family_id).filter(Boolean))]
      const famNames = new Map<string, string>()
      if (famIds.length) {
        const { data: fs } = await supabase.from('families').select('id, name').eq('tenant_id', tid).in('id', famIds as string[])
        fs?.forEach((f: any) => famNames.set(f.id, f.name))
      }

      const rows: SquareInvoiceListRow[] = (data ?? []).map((r: any) => ({
        id: r.id,
        invoice_date: r.invoice_date,
        due_date: r.due_date,
        status: r.status,
        requested_amount: r.requested_amount,
        amount_paid: r.amount_paid,
        family_id: r.family_id,
        location_id: r.location_id,
        square_invoice_id: r.square_invoice_id ?? null,
        public_url: extractSquareInvoicePublicUrl(r.raw_data),
        family_name: r.family_id ? famNames.get(r.family_id) ?? '—' : '—',
      }))

      return { rows, totalCount: count ?? 0 }
    },
    getNextPageParam: (lastPage, allPages) => {
      const loaded = allPages.reduce((s, p) => s + p.rows.length, 0)
      if (loaded >= lastPage.totalCount) return undefined
      return allPages.length
    },
  })
}

/** Minimal family + active students for One-Off invoice modal (avoids full student_effective_rate load). */
export function useBillingFamiliesForOneOff(shouldLoad: boolean) {
  const { tenantId, profile } = useAuthContext()
  return useQuery({
    queryKey: [...qk.billing.familiesOneOff, tenantId],
    enabled: !!tenantId && shouldLoad && profile?.role !== 'teacher' && profile?.role !== 'student',
    queryFn: async () => {
      const { data: families, error } = await supabase
        .from('families')
        .select('id, name, parent_name, billing_status')
        .eq('tenant_id', tenantId!)
        .eq('billing_status', 'active')
        .order('name')
        .limit(2000)
      if (error) throw error
      const ids = (families ?? []).map((f: any) => f.id)
      if (ids.length === 0) return []

      const { data: students } = await supabase
        .from('students')
        .select('id, family_id, first_name, last_name')
        .eq('tenant_id', tenantId!)
        .eq('status', 'active')
        .in('family_id', ids)

      const byFam = new Map<string, { id: string; first_name: string; last_name: string }[]>()
      for (const s of students ?? []) {
        const list = byFam.get(s.family_id) ?? []
        list.push({ id: s.id, first_name: s.first_name, last_name: s.last_name })
        byFam.set(s.family_id, list)
      }

      return (families ?? []).map((f: any) => ({
        ...f,
        students: byFam.get(f.id) ?? [],
        monthlyTotalCents: 0,
        activeStudentCount: (byFam.get(f.id) ?? []).length,
      }))
    },
  })
}
