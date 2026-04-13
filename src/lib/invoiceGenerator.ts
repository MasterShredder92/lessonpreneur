/**
 * Invoice PDF generator and billing record creator.
 *
 * Handles the complete "Generate Invoice" workflow:
 * 1. Calculate line items from student_effective_rate
 * 2. Resolve or create billing_periods row (FK parent for billing_events)
 * 3. Get billing cycle (for invoice_tokens)
 * 4. Create billing_event + billing_line_items
 * 5. Create invoice_token (family payment link)
 * 6. Generate PDF and store in Supabase Storage
 * 7. Return the invoice record
 *
 * All steps are atomic — if any persistence fails, the whole
 * operation fails and no success toast is shown.
 */

import { supabase, getCurrentBillingCycleId } from './supabase'
import { calculatePreviewRate } from '../hooks/useFamilyRate'
import { DEFAULT_SESSIONS_PER_MONTH } from './constants'
import jsPDF from 'jspdf'

// ── Types ─────────────────────────────────────────────────────

export interface InvoiceLineItem {
  studentId: string
  studentName: string
  instrument: string
  sessions: number
  rateCents: number
  monthlyCents: number
}

export interface GeneratedInvoice {
  invoiceTokenId: string
  billingEventId: string
  totalCents: number
  lineItems: InvoiceLineItem[]
  pdfUrl: string | null
  periodLabel: string
  dueDate: string
}

export interface GenerateInvoiceParams {
  tenantId: string
  familyId: string
  familyName: string
  parentName: string
  primaryEmail: string | null
  primaryPhone: string | null
  cardLastFour: string | null
  isMilitary: boolean
  billingDay: number
  primaryLocationId: string | null
  periodLabel: string
  dueDate: string
  performedBy: string | null
  performerName: string | null
}

// ── Billing period resolution ─────────────────────────────────

/**
 * Resolve or create a billing_periods row for this invoice run.
 * billing_events.billing_period_id FK points to billing_periods — NOT billing_cycles.
 * This function ensures a real parent row exists before we insert events.
 */
async function resolveOrCreateBillingPeriod(
  tenantId: string,
  periodLabel: string,
  billingDate: string,
): Promise<string> {
  // Try to find existing period for this tenant + label
  const { data: existing, error: findErr } = await supabase
    .from('billing_periods')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('period_label', periodLabel)
    .limit(1)
    .maybeSingle()
  if (findErr) throw new Error(`Failed to query billing periods: ${findErr.message}`)

  if (existing) return existing.id

  // Create new period
  const { data: created, error: createErr } = await supabase
    .from('billing_periods')
    .insert({
      tenant_id: tenantId,
      period_label: periodLabel,
      billing_date: billingDate,
      status: 'pending',
    })
    .select('id')
    .single()
  if (createErr) throw new Error(`Failed to create billing period: ${createErr.message}`)

  return created.id
}

// ── Main generator ────────────────────────────────────────────

export async function generateFamilyInvoice(params: GenerateInvoiceParams): Promise<GeneratedInvoice> {
  const {
    tenantId, familyId, familyName, parentName,
    primaryEmail, primaryPhone, cardLastFour, isMilitary,
    billingDay, primaryLocationId, periodLabel, dueDate,
    performedBy, performerName,
  } = params

  // 1. Fetch student effective rates
  const { data: rateRows, error: rateErr } = await supabase
    .from('student_effective_rate')
    .select('student_id, first_name, last_name, instrument, sessions_per_month, rate_per_session, monthly_cents, location_id')
    .eq('family_id', familyId)
  if (rateErr) throw new Error(`Failed to load student rates: ${rateErr.message}`)

  const students = rateRows ?? []
  if (students.length === 0) throw new Error('No active students found for this family')

  // Fetch tier eligibility flags
  const studentIds = students.map((s: any) => s.student_id).filter(Boolean)
  let tierMap = new Map<string, boolean | null>()
  if (studentIds.length > 0) {
    const { data: flags } = await supabase
      .from('students')
      .select('id, counts_toward_family_tier')
      .eq('tenant_id', tenantId)
      .in('id', studentIds)
    tierMap = new Map((flags ?? []).map((f: any) => [f.id, f.counts_toward_family_tier]))
  }

  // Calculate rates using family tier logic
  const eligible = students.filter((s: any) => tierMap.get(s.student_id) !== false)
  const activeCount = eligible.length
  const totalSessions = eligible.reduce((sum: number, s: any) => sum + (s.sessions_per_month ?? DEFAULT_SESSIONS_PER_MONTH), 0)
  const computedRate = calculatePreviewRate(activeCount, totalSessions, isMilitary)

  const lineItems: InvoiceLineItem[] = students.map((s: any) => {
    const sessions = s.sessions_per_month ?? DEFAULT_SESSIONS_PER_MONTH
    return {
      studentId: s.student_id,
      studentName: `${s.first_name ?? ''} ${s.last_name ?? ''}`.trim(),
      instrument: s.instrument ?? 'Music',
      sessions,
      rateCents: computedRate,
      monthlyCents: computedRate * sessions,
    }
  })

  const totalCents = lineItems.reduce((sum, li) => sum + li.monthlyCents, 0)
  const locationId = students[0]?.location_id ?? primaryLocationId

  // 2. Resolve billing period (parent row for billing_events FK)
  const billingPeriodId = await resolveOrCreateBillingPeriod(tenantId, periodLabel, dueDate)

  // 3. Get billing cycle (used for invoice_tokens, separate from billing_periods)
  const cycleId = await getCurrentBillingCycleId(tenantId)

  // 4. Create billing_event (billing_period_id FK → billing_periods.id)
  const idempotencyKey = `manual_${familyId}_${periodLabel.replace(/\s/g, '_')}_${Date.now()}`
  const { data: billingEvent, error: beErr } = await supabase
    .from('billing_events')
    .insert({
      tenant_id: tenantId,
      family_id: familyId,
      billing_period_id: billingPeriodId,
      amount_cents: totalCents,
      idempotency_key: idempotencyKey,
      status: 'pending',
    })
    .select('id')
    .single()
  if (beErr) throw new Error(`Failed to create billing event: ${beErr.message}`)

  // 5. Create billing_line_items
  const lineItemRows = lineItems.map((li) => ({
    billing_event_id: billingEvent.id,
    student_id: li.studentId,
    sessions_count: li.sessions,
    rate_per_session_cents: li.rateCents,
    subtotal_cents: li.monthlyCents,
  }))
  const { error: liErr } = await supabase.from('billing_line_items').insert(lineItemRows)
  if (liErr) throw new Error(`Failed to create line items: ${liErr.message}`)

  // 6. Create invoice_token
  const { data: invoiceToken, error: itErr } = await supabase
    .from('invoice_tokens')
    .insert({
      tenant_id: tenantId,
      family_id: familyId,
      location_id: locationId,
      billing_period_label: periodLabel,
      billing_cycle_id: cycleId,
      amount_cents: totalCents,
      base_amount_cents: totalCents,
      due_date: dueDate,
      billing_day: billingDay,
      status: 'pending',
      expires_at: new Date(new Date(dueDate).getTime() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      invoice_snapshot: {
        family_name: familyName,
        parent_name: parentName,
        email: primaryEmail,
        phone: primaryPhone,
        card_on_file: !!cardLastFour,
        is_military: isMilitary,
        billing_event_id: billingEvent.id,
        students: lineItems.map((li) => ({
          name: li.studentName,
          instrument: li.instrument,
          sessions: li.sessions,
          rate: li.rateCents,
          monthly: li.monthlyCents,
        })),
      },
    })
    .select('id')
    .single()
  if (itErr) throw new Error(`Failed to create invoice token: ${itErr.message}`)

  // 7. Generate PDF
  let pdfUrl: string | null = null
  try {
    const pdfBlob = buildInvoicePdf({
      familyName,
      parentName,
      periodLabel,
      dueDate,
      lineItems,
      totalCents,
      isMilitary,
    })

    const pdfPath = `${tenantId}/${familyId}/${invoiceToken.id}.pdf`
    const { error: uploadErr } = await supabase.storage
      .from('invoices')
      .upload(pdfPath, pdfBlob, { contentType: 'application/pdf', upsert: true })

    if (!uploadErr) {
      const { data: urlData } = supabase.storage.from('invoices').getPublicUrl(pdfPath)
      pdfUrl = urlData?.publicUrl ?? null
    }
  } catch {
    // PDF is best-effort — invoice is still valid without it
  }

  // 8. Audit log
  await supabase.from('audit_log').insert({
    tenant_id: tenantId,
    action: 'INVOICE_CREATED',
    table_name: 'invoice_tokens',
    record_id: invoiceToken.id,
    new_value: JSON.stringify({
      amount_cents: totalCents,
      period: periodLabel,
      family: familyName,
      billing_event_id: billingEvent.id,
      line_items: lineItems.length,
    }),
    performed_by: performedBy,
    user_name: performerName,
    entity_name: familyName,
  })

  return {
    invoiceTokenId: invoiceToken.id,
    billingEventId: billingEvent.id,
    totalCents,
    lineItems,
    pdfUrl,
    periodLabel,
    dueDate,
  }
}

// ── PDF builder ───────────────────────────────────────────────

function buildInvoicePdf(params: {
  familyName: string
  parentName: string
  periodLabel: string
  dueDate: string
  lineItems: InvoiceLineItem[]
  totalCents: number
  isMilitary: boolean
}): Blob {
  const { familyName, parentName, periodLabel, dueDate, lineItems, totalCents, isMilitary } = params
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'letter' })

  const pageW = doc.internal.pageSize.getWidth()
  const margin = 20

  // Header
  doc.setFontSize(22)
  doc.setFont('helvetica', 'bold')
  doc.text('INVOICE', margin, 28)

  doc.setFontSize(10)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(120, 120, 140)
  doc.text(`Billing Period: ${periodLabel}`, margin, 38)
  doc.text(`Due Date: ${formatDateForPdf(dueDate)}`, margin, 44)
  doc.text(`Generated: ${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`, margin, 50)

  // Family info
  doc.setTextColor(40, 40, 60)
  doc.setFontSize(12)
  doc.setFont('helvetica', 'bold')
  doc.text(`Bill To: ${familyName}`, margin, 64)
  doc.setFontSize(10)
  doc.setFont('helvetica', 'normal')
  doc.text(parentName, margin, 71)
  if (isMilitary) {
    doc.setTextColor(200, 150, 0)
    doc.text('Military Family Discount Applied', margin, 78)
    doc.setTextColor(40, 40, 60)
  }

  // Table header
  let y = isMilitary ? 90 : 84
  doc.setFillColor(240, 240, 245)
  doc.rect(margin, y, pageW - margin * 2, 8, 'F')
  doc.setFontSize(9)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(80, 80, 100)
  doc.text('Student', margin + 3, y + 5.5)
  doc.text('Instrument', margin + 60, y + 5.5)
  doc.text('Sessions', margin + 100, y + 5.5)
  doc.text('Rate', margin + 125, y + 5.5)
  doc.text('Monthly', pageW - margin - 3, y + 5.5, { align: 'right' })

  // Line items
  y += 12
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(40, 40, 60)
  for (const li of lineItems) {
    doc.setFontSize(10)
    doc.text(li.studentName, margin + 3, y)
    doc.text(li.instrument, margin + 60, y)
    doc.text(String(li.sessions), margin + 105, y)
    doc.text(formatCents(li.rateCents), margin + 125, y)
    doc.text(formatCents(li.monthlyCents), pageW - margin - 3, y, { align: 'right' })
    y += 8
  }

  // Total
  y += 4
  doc.setDrawColor(200, 200, 210)
  doc.line(margin, y, pageW - margin, y)
  y += 8
  doc.setFontSize(13)
  doc.setFont('helvetica', 'bold')
  doc.text('Total Due:', margin + 3, y)
  doc.text(formatCents(totalCents), pageW - margin - 3, y, { align: 'right' })

  // Footer
  doc.setFontSize(8)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(160, 160, 180)
  doc.text('Generated by Lessonpreneur', margin, doc.internal.pageSize.getHeight() - 15)

  return doc.output('blob')
}

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`
}

function formatDateForPdf(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
}
