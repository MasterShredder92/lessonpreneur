import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { FunctionsHttpError } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { useAuthContext } from '../app/AuthContext'
import { qk } from '../lib/queryKeys'
import { getMonthStart, getNextCycleMonth } from './useBillingPage'

/** YYYY-MM — used for payment-facts month selector */
export function getCurrentMonthKey(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

export function monthKeyToDateRange(monthKey: string): { start: string; end: string } {
  const [y, m] = monthKey.split('-').map(Number)
  const start = `${y}-${String(m).padStart(2, '0')}-01`
  const endDay = new Date(y, m, 0).getDate()
  const end = `${y}-${String(m).padStart(2, '0')}-${String(endDay).padStart(2, '0')}`
  return { start, end }
}

export function shiftMonthKey(monthKey: string, delta: number): string {
  const [y, m] = monthKey.split('-').map(Number)
  const d = new Date(y, m - 1 + delta, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

/** RFC 3339 window for `square-payments-sync` (full selected calendar month, UTC). */
export function monthKeyToSyncWindowIso(monthKey: string): { begin_time: string; end_time: string } {
  const { start, end } = monthKeyToDateRange(monthKey)
  return {
    begin_time: `${start}T00:00:00.000Z`,
    end_time: `${end}T23:59:59.999Z`,
  }
}

function minIsoDate(a: string | null, b: string | null): string | null {
  if (!a) return b
  if (!b) return a
  return a < b ? a : b
}

function maxIsoDate(a: string | null, b: string | null): string | null {
  if (!a) return b
  if (!b) return a
  return a > b ? a : b
}

async function paymentFactsSyncInvokeErrorMessage(error: unknown): Promise<string> {
  if (error instanceof FunctionsHttpError && error.context instanceof Response) {
    try {
      const body = await error.context.clone().json() as { error?: string; request_id?: string }
      let msg =
        body?.error && typeof body.error === 'string'
          ? body.error
          : 'Edge function returned a non-success status'
      if (body?.request_id && typeof body.request_id === 'string' && !msg.includes(body.request_id)) {
        msg = `${msg} (request_id: ${body.request_id})`
      }
      return msg
    } catch {
      /* fallback */
    }
  }
  if (error && typeof error === 'object' && 'message' in error && typeof (error as { message: string }).message === 'string') {
    return (error as { message: string }).message
  }
  return 'Square payment facts sync failed'
}

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

/** P&L hero uses synced Square **invoice** rows only — not Payments / dashboard gross sales (separate future layer). */
export interface PLSummary {
  /** Sum of requested_amount for PAID|UNPAID|SCHEDULED invoices with invoice_date in current calendar month (synced data). */
  syncedInvoiceMonthTotalCents: number
  teacherPayrollCents: number
  operatingExpensesCents: number
  ownerTakeHomeCents: number
  marginPercent: number
  prevMonthSyncedInvoiceTotalCents: number
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

/** Aggregates from `square_payments_fact` + `square_refunds_fact` (Square sync), not invoices. */
export interface PaymentFactsSummary {
  monthKey: string
  rangeStart: string
  rangeEnd: string
  paymentRowCount: number
  refundRowCount: number
  /** Sum of `total_money_cents` for counted payment statuses */
  totalCollectedCents: number
  /** Processing fees + application fees (same payments as collected) */
  feesCents: number
  /** Sum of `net_total_cents` on counted payments (after Square fees on each payment) */
  netTotalCents: number
  /** Sum of refund `amount_money_cents` in range */
  returnsCents: number
  tenderCardCents: number
  tenderCashAppCents: number
  tenderBankTransferCents: number
  tipsCents: number
  /** Earliest `reporting_date` among payment + refund rows in this calendar month (null if none). */
  dataSpanMin: string | null
  /** Latest `reporting_date` among payment + refund rows in this calendar month (null if none). */
  dataSpanMax: string | null
  /** Latest `synced_at` seen in payment rows for this month (refunds optional; null if no payments). */
  latestPaymentSyncedAt: string | null
  /**
   * True when at least one fact row exists and the span does not reach the calendar month start/end.
   * Means totals may omit days at the start or end of the month (missing sync or no activity — we do not guess).
   */
  partialCalendarCoverage: boolean
}

const PAYMENT_COUNTED_STATUSES = new Set(['COMPLETED', 'APPROVED'])

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
    queryKey: [...qk.financials.expenses, tenantId],
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
    queryKey: [...qk.financials.plSummary, tenantId, 'invoice-month-basis'],
    enabled: !!tenantId,
    staleTime: 60_000,
    queryFn: async () => {
      const monthStart = getMonthStart()
      const nextMonthStart = getNextCycleMonth()
      const now = new Date()
      const prevMonth = now.getMonth() === 0
        ? `${now.getFullYear() - 1}-12`
        : `${now.getFullYear()}-${String(now.getMonth()).padStart(2, '0')}`
      const prevMonthStart = `${prevMonth}-01`
      const prevMonthEnd = monthStart

      const invoiceSelect = 'requested_amount, location_id'

      // 1. Invoice AR basis — same calendar window + statuses as Billing “total invoiced” (not Square dashboard gross).
      const { data: invoices } = await supabase
        .from('square_invoices')
        .select(invoiceSelect)
        .eq('tenant_id', tenantId!)
        .in('status', ['PAID', 'UNPAID', 'SCHEDULED'])
        .gte('invoice_date', monthStart)
        .lt('invoice_date', nextMonthStart)

      const syncedInvoiceMonthTotalCents = (invoices ?? []).reduce((s, i: any) => s + (i.requested_amount ?? 0), 0)

      const revByLoc = new Map<string, number>()
      invoices?.forEach((i: any) => {
        if (i.location_id) revByLoc.set(i.location_id, (revByLoc.get(i.location_id) ?? 0) + (i.requested_amount ?? 0))
      })

      // 2. Illustrative payroll — 50% of invoice basis (not a payroll product until payments-based reporting exists).
      const teacherPayrollCents = Math.round(syncedInvoiceMonthTotalCents * 0.5)

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
      const ownerTakeHomeCents = syncedInvoiceMonthTotalCents - teacherPayrollCents - operatingExpensesCents
      const marginPercent = syncedInvoiceMonthTotalCents > 0 ? (ownerTakeHomeCents / syncedInvoiceMonthTotalCents) * 100 : 0

      // 5. Previous calendar month — same invoice basis + statuses
      const { data: prevInvoices } = await supabase
        .from('square_invoices')
        .select('requested_amount')
        .eq('tenant_id', tenantId!)
        .in('status', ['PAID', 'UNPAID', 'SCHEDULED'])
        .gte('invoice_date', prevMonthStart)
        .lt('invoice_date', prevMonthEnd)

      const prevMonthSyncedInvoiceTotalCents = (prevInvoices ?? []).reduce((s, i: any) => s + (i.requested_amount ?? 0), 0)
      const prevMonthPayrollCents = Math.round(prevMonthSyncedInvoiceTotalCents * 0.5)
      const prevMonthTakeHomeCents = prevMonthSyncedInvoiceTotalCents - prevMonthPayrollCents - operatingExpensesCents
      const prevMonthMarginPercent = prevMonthSyncedInvoiceTotalCents > 0 ? (prevMonthTakeHomeCents / prevMonthSyncedInvoiceTotalCents) * 100 : 0

      // 6. Location breakdown
      const { data: locations } = await supabase.from('locations').select('id, name').eq('tenant_id', tenantId!).eq('is_active', true)
      const { data: rooms } = await supabase.from('rooms').select('id, location_id').eq('tenant_id', tenantId!)
      const { data: students } = await supabase.from('students').select('id, location_id').eq('tenant_id', tenantId!).eq('status', 'active').limit(10000)

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
        syncedInvoiceMonthTotalCents,
        teacherPayrollCents,
        operatingExpensesCents,
        ownerTakeHomeCents,
        marginPercent,
        prevMonthSyncedInvoiceTotalCents,
        prevMonthTakeHomeCents,
        prevMonthMarginPercent,
        expensesByCategory,
        locationBreakdown,
      }
    },
  })
}

// ─── Square payment facts (read-only sync tables) ────

export function usePaymentFactsSummary(monthKey: string) {
  const { tenantId } = useAuthContext()
  const { start, end } = monthKeyToDateRange(monthKey)

  return useQuery<PaymentFactsSummary>({
    queryKey: [...qk.financials.paymentFacts(tenantId, monthKey)],
    enabled: !!tenantId,
    staleTime: 60_000,
    queryFn: async () => {
      const tid = tenantId!

      const pageSize = 1000
      const payments: {
        reporting_date: string | null
        synced_at: string | null
        total_money_cents: number | null
        processing_fee_total_cents: number | null
        application_fee_money_cents: number | null
        net_total_cents: number | null
        tip_money_cents: number | null
        tender_bucket: string | null
        status: string | null
      }[] = []

      for (let from = 0; ; from += pageSize) {
        const { data, error } = await supabase
          .from('square_payments_fact')
          .select(
            'reporting_date, synced_at, total_money_cents, processing_fee_total_cents, application_fee_money_cents, net_total_cents, tip_money_cents, tender_bucket, status',
          )
          .eq('tenant_id', tid)
          .gte('reporting_date', start)
          .lte('reporting_date', end)
          .order('reporting_date', { ascending: true })
          .range(from, from + pageSize - 1)

        if (error) throw error
        const chunk = data ?? []
        payments.push(...chunk)
        if (chunk.length < pageSize) break
      }

      const refunds: { reporting_date: string | null; amount_money_cents: number | null }[] = []
      for (let from = 0; ; from += pageSize) {
        const { data, error } = await supabase
          .from('square_refunds_fact')
          .select('reporting_date, amount_money_cents')
          .eq('tenant_id', tid)
          .gte('reporting_date', start)
          .lte('reporting_date', end)
          .order('reporting_date', { ascending: true })
          .range(from, from + pageSize - 1)

        if (error) throw error
        const chunk = data ?? []
        refunds.push(...chunk)
        if (chunk.length < pageSize) break
      }

      let totalCollectedCents = 0
      let feesCents = 0
      let netTotalCents = 0
      let tipsCents = 0
      let tenderCardCents = 0
      let tenderCashAppCents = 0
      let tenderBankTransferCents = 0

      for (const p of payments) {
        const st = (p.status ?? '').toUpperCase()
        if (!PAYMENT_COUNTED_STATUSES.has(st)) continue

        const total = p.total_money_cents ?? 0
        const proc = p.processing_fee_total_cents ?? 0
        const app = p.application_fee_money_cents ?? 0
        const net = p.net_total_cents ?? total - app - proc
        const tip = p.tip_money_cents ?? 0

        totalCollectedCents += total
        feesCents += proc + app
        netTotalCents += net
        tipsCents += tip

        const bucket = p.tender_bucket ?? ''
        if (bucket === 'card') tenderCardCents += total
        else if (bucket === 'cash_app') tenderCashAppCents += total
        else if (bucket === 'bank_transfer') tenderBankTransferCents += total
      }

      const returnsCents = refunds.reduce((s, r) => s + (r.amount_money_cents ?? 0), 0)

      const pd = payments.map(p => p.reporting_date).filter((d): d is string => !!d)
      const rd = refunds.map(r => r.reporting_date).filter((d): d is string => !!d)
      const pMin = pd.length ? pd.reduce((a, b) => (a < b ? a : b)) : null
      const pMax = pd.length ? pd.reduce((a, b) => (a > b ? a : b)) : null
      const rMin = rd.length ? rd.reduce((a, b) => (a < b ? a : b)) : null
      const rMax = rd.length ? rd.reduce((a, b) => (a > b ? a : b)) : null
      const dataSpanMin = minIsoDate(pMin, rMin)
      const dataSpanMax = maxIsoDate(pMax, rMax)
      const hasRows = payments.length > 0 || refunds.length > 0
      const partialCalendarCoverage =
        hasRows &&
        dataSpanMin != null &&
        dataSpanMax != null &&
        (dataSpanMin > start || dataSpanMax < end)

      let latestPaymentSyncedAt: string | null = null
      for (const p of payments) {
        const t = p.synced_at
        if (t && (!latestPaymentSyncedAt || t > latestPaymentSyncedAt)) latestPaymentSyncedAt = t
      }

      return {
        monthKey,
        rangeStart: start,
        rangeEnd: end,
        paymentRowCount: payments.length,
        refundRowCount: refunds.length,
        totalCollectedCents,
        feesCents,
        netTotalCents,
        returnsCents,
        tenderCardCents,
        tenderCashAppCents,
        tenderBankTransferCents,
        tipsCents,
        dataSpanMin,
        dataSpanMax,
        latestPaymentSyncedAt,
        partialCalendarCoverage,
      }
    },
  })
}

export interface SquarePaymentFactsSyncResponse {
  success?: boolean
  request_id?: string
  timing_ms?: number
  window?: { begin_time?: string; end_time?: string }
  payments_upserted?: number
  refunds_upserted?: number
  error?: string
}

/** Read-only Square → `square_*_fact` upsert. Same auth as edge function (owner | admin | company_director JWT). */
export function useSyncSquarePaymentFacts() {
  const qc = useQueryClient()
  const { tenantId } = useAuthContext()

  return useMutation({
    mutationFn: async (window: { begin_time: string; end_time: string }) => {
      const { data, error } = await supabase.functions.invoke<SquarePaymentFactsSyncResponse>('square-payments-sync', {
        method: 'POST',
        body: { ...window, include_refunds: true },
      })
      if (error) throw new Error(await paymentFactsSyncInvokeErrorMessage(error))
      if (data && typeof data === 'object' && 'error' in data && (data as SquarePaymentFactsSyncResponse).error) {
        const d = data as SquarePaymentFactsSyncResponse
        const tail = d.request_id ? ` (request_id: ${d.request_id})` : ''
        throw new Error(`${d.error ?? 'Sync failed'}${tail}`)
      }
      return data as SquarePaymentFactsSyncResponse
    },
    onSuccess: () => {
      if (tenantId) {
        qc.invalidateQueries({ queryKey: qk.financials.all })
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
      qc.invalidateQueries({ queryKey: qk.financials.expenses })
      qc.invalidateQueries({ queryKey: qk.financials.plSummary })
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
      qc.invalidateQueries({ queryKey: qk.financials.expenses })
      qc.invalidateQueries({ queryKey: qk.financials.plSummary })
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
      qc.invalidateQueries({ queryKey: qk.financials.expenses })
      qc.invalidateQueries({ queryKey: qk.financials.plSummary })
    },
  })
}
