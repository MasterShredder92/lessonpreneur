import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuthContext } from '../app/AuthContext'
import { getMonthStart, getNextCycleMonth, getMonthAfterNext } from './useBillingPage'

// ══════════════════════════════════════════
// TYPES
// ══════════════════════════════════════════

export interface BillingSnapshotData {
  collectedCents: number
  totalInvoicedCents: number
  discountedCents: number
  nextMonthCents: number
  scheduledPaymentsCents: number
  nextMonthLabel: string
}

// ══════════════════════════════════════════
// HOOK — queries square_invoices for 5 metrics
// locationId: LP location UUID (optional — omit for all-location aggregate)
// ══════════════════════════════════════════

export function useBillingSnapshot(locationId?: string) {
  const { tenantId, profile } = useAuthContext()
  const monthStart = getMonthStart()
  const nextMonth = getNextCycleMonth()
  const monthAfterNext = getMonthAfterNext()
  const locKey = locationId || 'all'

  return useQuery<BillingSnapshotData>({
    queryKey: ['billing_snapshot', tenantId, monthStart, locKey],
    enabled: !!tenantId && profile?.role !== 'teacher' && profile?.role !== 'student',
    staleTime: 60_000,
    queryFn: async (): Promise<BillingSnapshotData> => {

      // 1. Collected: PAID invoices, current month by invoice_date
      let collectedQ = supabase.from('square_invoices')
        .select('amount_cents')
        .eq('tenant_id', tenantId!)
        .eq('status', 'PAID')
        .gte('invoice_date', monthStart)
        .lt('invoice_date', nextMonth)
      if (locationId) collectedQ = collectedQ.eq('location_id', locationId)

      // 1b. Refunds: REFUNDED + PARTIALLY_REFUNDED, current month
      let refundQ = supabase.from('square_invoices')
        .select('amount_cents')
        .eq('tenant_id', tenantId!)
        .in('status', ['REFUNDED', 'PARTIALLY_REFUNDED'])
        .gte('invoice_date', monthStart)
        .lt('invoice_date', nextMonth)
      if (locationId) refundQ = refundQ.eq('location_id', locationId)

      // 2. Total Invoiced: PAID + UNPAID + SCHEDULED, current month by invoice_date
      let totalInvoicedQ = supabase.from('square_invoices')
        .select('amount_cents')
        .eq('tenant_id', tenantId!)
        .in('status', ['PAID', 'UNPAID', 'SCHEDULED'])
        .gte('invoice_date', monthStart)
        .lt('invoice_date', nextMonth)
      if (locationId) totalInvoicedQ = totalInvoicedQ.eq('location_id', locationId)

      // 3. Gross potential from student_effective_rate (active students)
      let grossQ = supabase.from('student_effective_rate')
        .select('monthly_cents')
        .eq('billing_status', 'active')
      if (locationId) grossQ = grossQ.eq('location_id', locationId)

      // 4. Next month: SCHEDULED invoices, next month by invoice_date
      let nextMonthQ = supabase.from('square_invoices')
        .select('amount_cents')
        .eq('tenant_id', tenantId!)
        .eq('status', 'SCHEDULED')
        .gte('invoice_date', nextMonth)
        .lt('invoice_date', monthAfterNext)
      if (locationId) nextMonthQ = nextMonthQ.eq('location_id', locationId)

      // 5. Scheduled Payments: UNPAID + SCHEDULED, current month by invoice_date
      let scheduledQ = supabase.from('square_invoices')
        .select('amount_cents')
        .eq('tenant_id', tenantId!)
        .in('status', ['UNPAID', 'SCHEDULED'])
        .gte('invoice_date', monthStart)
        .lt('invoice_date', nextMonth)
      if (locationId) scheduledQ = scheduledQ.eq('location_id', locationId)

      const [collected, refunds, totalInvoiced, gross, nextMo, scheduled] = await Promise.all([
        collectedQ, refundQ, totalInvoicedQ, grossQ, nextMonthQ, scheduledQ,
      ])

      const collectedCents = (collected.data ?? []).reduce((s, r: any) => s + (r.amount_cents ?? 0), 0)
      const refundCents = (refunds.data ?? []).reduce((s, r: any) => s + (r.amount_cents ?? 0), 0)
      const totalInvoicedCents = (totalInvoiced.data ?? []).reduce((s, r: any) => s + (r.amount_cents ?? 0), 0)
      const grossPotentialCents = (gross.data ?? []).reduce((s: number, r: any) => s + (r.monthly_cents ?? 0), 0)
      const nextMonthCents = (nextMo.data ?? []).reduce((s, r: any) => s + (r.amount_cents ?? 0), 0)
      const scheduledPaymentsCents = (scheduled.data ?? []).reduce((s, r: any) => s + (r.amount_cents ?? 0), 0)

      // Discounted = gross potential - total invoiced (always positive)
      const discountedCents = Math.max(0, grossPotentialCents - totalInvoicedCents)

      // Next month label (e.g. "May")
      const nextMonthDate = new Date(nextMonth + 'T12:00:00')
      const nextMonthLabel = nextMonthDate.toLocaleDateString('en-US', { month: 'long' })

      return {
        collectedCents: collectedCents - refundCents,
        totalInvoicedCents,
        discountedCents,
        nextMonthCents,
        scheduledPaymentsCents,
        nextMonthLabel,
      }
    },
  })
}
