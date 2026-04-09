import { supabase } from '../lib/supabase'
import { getMonthStart, getNextCycleMonth, getMonthAfterNext } from '../hooks/useBillingPage'

/** Same shape as dashboard `useBillingSnapshot` — single source for Star + hook. */
export interface BillingSnapshotData {
  collectedCents: number
  totalInvoicedCents: number
  discountedCents: number
  nextMonthCents: number
  scheduledPaymentsCents: number
  nextMonthLabel: string
}

/**
 * Direct-query billing snapshot (Square invoices + student_effective_rate).
 * Must stay in lockstep with `useBillingSnapshot` in `useBillingSnapshot.ts`.
 */
export async function fetchBillingSnapshotData(
  tenantId: string,
  locationId?: string,
): Promise<BillingSnapshotData> {
  const monthStart = getMonthStart()
  const nextMonth = getNextCycleMonth()
  const monthAfterNext = getMonthAfterNext()

  let collectedQ = supabase.from('square_invoices')
    .select('amount_cents')
    .eq('tenant_id', tenantId)
    .eq('status', 'PAID')
    .gte('invoice_date', monthStart)
    .lt('invoice_date', nextMonth)
  if (locationId) collectedQ = collectedQ.eq('location_id', locationId)

  let refundQ = supabase.from('square_invoices')
    .select('amount_cents')
    .eq('tenant_id', tenantId)
    .in('status', ['REFUNDED', 'PARTIALLY_REFUNDED'])
    .gte('invoice_date', monthStart)
    .lt('invoice_date', nextMonth)
  if (locationId) refundQ = refundQ.eq('location_id', locationId)

  let totalInvoicedQ = supabase.from('square_invoices')
    .select('amount_cents')
    .eq('tenant_id', tenantId)
    .in('status', ['PAID', 'UNPAID', 'SCHEDULED'])
    .gte('invoice_date', monthStart)
    .lt('invoice_date', nextMonth)
  if (locationId) totalInvoicedQ = totalInvoicedQ.eq('location_id', locationId)

  let grossQ = supabase.from('student_effective_rate')
    .select('monthly_cents')
    .eq('billing_status', 'active')
  if (locationId) grossQ = grossQ.eq('location_id', locationId)

  let nextMonthQ = supabase.from('square_invoices')
    .select('amount_cents')
    .eq('tenant_id', tenantId)
    .eq('status', 'SCHEDULED')
    .gte('invoice_date', nextMonth)
    .lt('invoice_date', monthAfterNext)
  if (locationId) nextMonthQ = nextMonthQ.eq('location_id', locationId)

  let scheduledQ = supabase.from('square_invoices')
    .select('amount_cents')
    .eq('tenant_id', tenantId)
    .in('status', ['UNPAID', 'SCHEDULED'])
    .gte('invoice_date', monthStart)
    .lt('invoice_date', nextMonth)
  if (locationId) scheduledQ = scheduledQ.eq('location_id', locationId)

  const [collected, refunds, totalInvoiced, gross, nextMo, scheduled] = await Promise.all([
    collectedQ, refundQ, totalInvoicedQ, grossQ, nextMonthQ, scheduledQ,
  ])

  const collectedCents = (collected.data ?? []).reduce((s, r: { amount_cents?: number }) => s + (r.amount_cents ?? 0), 0)
  const refundCents = (refunds.data ?? []).reduce((s, r: { amount_cents?: number }) => s + (r.amount_cents ?? 0), 0)
  const totalInvoicedCents = (totalInvoiced.data ?? []).reduce((s, r: { amount_cents?: number }) => s + (r.amount_cents ?? 0), 0)
  const grossPotentialCents = (gross.data ?? []).reduce((s: number, r: { monthly_cents?: number }) => s + (r.monthly_cents ?? 0), 0)
  const nextMonthCents = (nextMo.data ?? []).reduce((s, r: { amount_cents?: number }) => s + (r.amount_cents ?? 0), 0)
  const scheduledPaymentsCents = (scheduled.data ?? []).reduce((s, r: { amount_cents?: number }) => s + (r.amount_cents ?? 0), 0)

  const discountedCents = Math.max(0, grossPotentialCents - totalInvoicedCents)

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
}
