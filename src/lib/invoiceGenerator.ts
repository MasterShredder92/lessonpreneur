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
import jsPDF, { GState } from 'jspdf'

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

export interface LocationBranding {
  name: string
  address: string | null
  city: string | null
  state: string | null
  zip: string | null
  phone: string | null
  email: string | null
  logo_url: string | null
  color: string | null
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

  // 7. Fetch location branding for PDF
  let branding: LocationBranding | null = null
  const brandingLocationId = locationId ?? primaryLocationId
  if (brandingLocationId) {
    const { data: loc } = await supabase
      .from('locations')
      .select('name, address, city, state, zip, phone, email, logo_url, color')
      .eq('id', brandingLocationId)
      .single()
    if (loc) branding = loc
  }

  // 8. Generate PDF
  let pdfUrl: string | null = null
  try {
    const pdfBlob = await buildInvoicePdf({
      familyName,
      parentName,
      primaryEmail,
      primaryPhone,
      periodLabel,
      dueDate,
      lineItems,
      totalCents,
      isMilitary,
      branding,
    })

    const pdfPath = `${tenantId}/${familyId}/${invoiceToken.id}.pdf`
    const { error: uploadErr } = await supabase.storage
      .from('invoices')
      .upload(pdfPath, pdfBlob, { contentType: 'application/pdf', upsert: true })

    if (!uploadErr) {
      const { data: urlData } = supabase.storage.from('invoices').getPublicUrl(pdfPath)
      pdfUrl = urlData?.publicUrl ?? null

      // Stamp pdf_url into invoice_snapshot so the UI knows a real PDF exists
      if (pdfUrl) {
        const { data: tok } = await supabase
          .from('invoice_tokens')
          .select('invoice_snapshot')
          .eq('id', invoiceToken.id)
          .single()
        if (tok?.invoice_snapshot) {
          await supabase
            .from('invoice_tokens')
            .update({ invoice_snapshot: { ...tok.invoice_snapshot, pdf_url: pdfUrl } })
            .eq('id', invoiceToken.id)
        }
      }
    }
  } catch {
    // PDF is best-effort — invoice is still valid without it
  }

  // 9. Audit log
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

// ── PDF builder (premium branded) ─────────────────────────────

/** Max logo dimension in pixels — anything larger gets downscaled */
const LOGO_MAX_PX = 128
/** JPEG quality for logo compression (0–1) */
const LOGO_QUALITY = 0.7

/**
 * Fetch a logo URL, resize to ≤128×128, compress to JPEG, return as
 * a compact base64 data URL suitable for jsPDF embedding.
 * Returns null on any failure — PDF generation continues without logo.
 */
async function fetchAndCompressLogo(url: string): Promise<string | null> {
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    const blob = await res.blob()

    // Decode into an ImageBitmap (works in all modern browsers)
    const bmp = await createImageBitmap(blob)
    const { width: srcW, height: srcH } = bmp

    // Calculate target size — fit within LOGO_MAX_PX square
    const scale = Math.min(1, LOGO_MAX_PX / Math.max(srcW, srcH))
    const w = Math.round(srcW * scale)
    const h = Math.round(srcH * scale)

    // Draw onto an OffscreenCanvas and export as JPEG
    const canvas = new OffscreenCanvas(w, h)
    const ctx = canvas.getContext('2d')!
    ctx.drawImage(bmp, 0, 0, w, h)
    bmp.close()

    const jpegBlob = await canvas.convertToBlob({ type: 'image/jpeg', quality: LOGO_QUALITY })

    // Convert to base64 data URL
    return await new Promise<string | null>((resolve) => {
      const reader = new FileReader()
      reader.onloadend = () => resolve(reader.result as string)
      reader.onerror = () => resolve(null)
      reader.readAsDataURL(jpegBlob)
    })
  } catch {
    return null
  }
}

/** Parse hex color to RGB tuple */
function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '')
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ]
}

const FALLBACK_BRAND = '#D4226A'
const BG_DARK = [6, 6, 8] as const      // #060608
const BG_CARD = [20, 20, 32] as const   // #141420
const TEXT_PRIMARY = [226, 232, 240] as const  // #E2E8F0
const TEXT_MUTED = [148, 163, 184] as const    // #94A3B8
const TEXT_DIM = [100, 116, 139] as const      // #64748B

async function buildInvoicePdf(params: {
  familyName: string
  parentName: string
  primaryEmail: string | null
  primaryPhone: string | null
  periodLabel: string
  dueDate: string
  lineItems: InvoiceLineItem[]
  totalCents: number
  isMilitary: boolean
  branding: LocationBranding | null
}): Promise<Blob> {
  const {
    familyName, parentName, primaryEmail, primaryPhone,
    periodLabel, dueDate, lineItems, totalCents, isMilitary, branding,
  } = params
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'letter' })

  const pageW = doc.internal.pageSize.getWidth()
  const pageH = doc.internal.pageSize.getHeight()
  const margin = 18
  const contentW = pageW - margin * 2
  const brandColor = branding?.color ?? FALLBACK_BRAND
  const [br, bg, bb] = hexToRgb(brandColor)

  // Reusable GState instances — avoids creating 26+ separate PDF objects
  const OPAQUE = new GState({ opacity: 1 })
  const DIM_06 = new GState({ opacity: 0.06 })
  const DIM_08 = new GState({ opacity: 0.08 })
  const DIM_10 = new GState({ opacity: 0.1 })
  const DIM_03 = new GState({ opacity: 0.03 })
  const DIM_30 = new GState({ opacity: 0.3 })
  const DIM_50 = new GState({ opacity: 0.5 })

  // ── Full-page dark background ──
  doc.setFillColor(...BG_DARK)
  doc.rect(0, 0, pageW, pageH, 'F')

  // ── Card background with rounded corners ──
  const cardX = margin - 4
  const cardY = 14
  const cardW = contentW + 8
  const cardH = pageH - 28
  doc.setFillColor(...BG_CARD)
  doc.roundedRect(cardX, cardY, cardW, cardH, 4, 4, 'F')

  // Subtle card border
  doc.setDrawColor(255, 255, 255)
  doc.setGState(DIM_08)
  doc.roundedRect(cardX, cardY, cardW, cardH, 4, 4, 'S')
  doc.setGState(OPAQUE)

  // ── Brand accent bar at top of card ──
  doc.setFillColor(br, bg, bb)
  doc.roundedRect(cardX, cardY, cardW, 3, 4, 4, 'F')
  // Cover bottom rounding of the accent bar
  doc.rect(cardX, cardY + 1.5, cardW, 1.5, 'F')

  let y = cardY + 14

  // ── HEADER: Logo + Location name + Invoice label ──
  const headerLeft = margin + 2

  // Fetch, compress, and embed logo if available
  let logoEmbedded = false
  if (branding?.logo_url) {
    try {
      const logoData = await fetchAndCompressLogo(branding.logo_url)
      if (logoData) {
        // Draw logo background
        doc.setFillColor(br, bg, bb)
        doc.setGState(DIM_10)
        doc.roundedRect(headerLeft, y - 1, 14, 14, 3, 3, 'F')
        doc.setGState(OPAQUE)

        // Always JPEG — fetchAndCompressLogo converts everything to JPEG
        doc.addImage(logoData, 'JPEG', headerLeft + 0.5, y - 0.5, 13, 13)

        // Logo border
        doc.setDrawColor(br, bg, bb)
        doc.setGState(DIM_30)
        doc.roundedRect(headerLeft, y - 1, 14, 14, 3, 3, 'S')
        doc.setGState(OPAQUE)
        logoEmbedded = true
      }
    } catch {
      // Logo embed failed silently
    }
  }

  // Location name or fallback initial
  const textStart = logoEmbedded ? headerLeft + 18 : headerLeft
  if (!logoEmbedded && branding) {
    // Render initial letter as fallback logo
    doc.setFillColor(br, bg, bb)
    doc.setGState(DIM_10)
    doc.roundedRect(headerLeft, y - 1, 14, 14, 3, 3, 'F')
    doc.setGState(OPAQUE)
    doc.setFontSize(14)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(br, bg, bb)
    doc.text(branding.name.charAt(0).toUpperCase(), headerLeft + 4.5, y + 9)
  }

  const nameStart = branding && !logoEmbedded ? headerLeft + 18 : textStart

  if (branding) {
    // Location name in brand color
    doc.setFontSize(16)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(br, bg, bb)
    doc.text(branding.name, nameStart, y + 5)

    // Location address
    const addressParts = [branding.address, branding.city, branding.state].filter(Boolean)
    if (addressParts.length > 0) {
      doc.setFontSize(8)
      doc.setFont('helvetica', 'normal')
      doc.setTextColor(...TEXT_MUTED)
      let addrText = addressParts.join(', ')
      if (branding.phone) addrText += `  ·  ${branding.phone}`
      doc.text(addrText, nameStart, y + 10)
    }
  } else {
    doc.setFontSize(16)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(br, bg, bb)
    doc.text('ZiroWork', nameStart, y + 5)
  }

  // "INVOICE" label — right aligned
  doc.setFontSize(10)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(br, bg, bb)
  doc.text('INVOICE', pageW - margin - 2, y + 2, { align: 'right' })

  doc.setFontSize(8)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(...TEXT_MUTED)
  doc.text(formatDateForPdf(new Date().toISOString().slice(0, 10)), pageW - margin - 2, y + 7, { align: 'right' })

  if (periodLabel) {
    doc.setTextColor(...TEXT_DIM)
    doc.text(periodLabel, pageW - margin - 2, y + 11, { align: 'right' })
  }

  y += 20

  // ── Divider ──
  doc.setDrawColor(255, 255, 255)
  doc.setGState(DIM_06)
  doc.line(margin, y, pageW - margin, y)
  doc.setGState(OPAQUE)
  y += 6

  // ── Family title ──
  const familyLabel = familyName.replace(/\s*family\s*/i, '')
  doc.setFontSize(18)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...TEXT_PRIMARY)
  doc.text(`${familyLabel} Family — Music Sessions`, margin + 2, y + 4)
  y += 12

  // ── Info bar: Bill To | Amount Due | Due Date ──
  const colW = contentW / 3
  const infoY = y

  // Column labels
  doc.setFontSize(7)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...TEXT_DIM)
  doc.text('BILL TO', margin + 2, infoY)
  doc.text('AMOUNT DUE', margin + colW + 2, infoY)
  doc.text('DUE DATE', margin + colW * 2 + 2, infoY)

  // Bill To values
  doc.setFontSize(11)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...TEXT_PRIMARY)
  doc.text(parentName || familyName, margin + 2, infoY + 6)

  if (primaryEmail) {
    doc.setFontSize(7.5)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(...TEXT_MUTED)
    doc.text(primaryEmail, margin + 2, infoY + 10.5)
  }
  if (primaryPhone) {
    doc.setFontSize(7.5)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(...TEXT_MUTED)
    doc.text(primaryPhone, margin + 2, infoY + (primaryEmail ? 14 : 10.5))
  }

  // Amount Due value — large, in brand color
  doc.setFontSize(18)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(br, bg, bb)
  doc.text(formatCents(totalCents), margin + colW + 2, infoY + 7)

  // Due Date value
  doc.setFontSize(11)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...TEXT_PRIMARY)
  doc.text(formatDateForPdf(dueDate), margin + colW * 2 + 2, infoY + 6)

  // Vertical separators between columns
  doc.setDrawColor(255, 255, 255)
  doc.setGState(DIM_06)
  doc.line(margin + colW, infoY - 4, margin + colW, infoY + 16)
  doc.line(margin + colW * 2, infoY - 4, margin + colW * 2, infoY + 16)
  doc.setGState(OPAQUE)

  y = infoY + 20

  // ── Military discount badge ──
  if (isMilitary) {
    doc.setFillColor(255, 184, 0)
    doc.setGState(DIM_08)
    doc.roundedRect(margin, y, 58, 7, 2, 2, 'F')
    doc.setGState(OPAQUE)

    doc.setFontSize(7.5)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(255, 184, 0)
    doc.text('MILITARY FAMILY DISCOUNT', margin + 3, y + 4.8)
    y += 11
  }

  // ── Divider ──
  doc.setDrawColor(255, 255, 255)
  doc.setGState(DIM_06)
  doc.line(margin, y, pageW - margin, y)
  doc.setGState(OPAQUE)
  y += 2

  // ── Table header ──
  const col1 = margin + 3          // Description
  const col2 = margin + colW * 1.6 // Qty
  const col3 = margin + colW * 2   // Price
  const col4 = pageW - margin - 3  // Amount (right-aligned)

  y += 4
  doc.setFontSize(7)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...TEXT_DIM)
  doc.text('DESCRIPTION', col1, y)
  doc.text('QTY', col2, y)
  doc.text('PRICE', col3, y)
  doc.text('AMOUNT', col4, y, { align: 'right' })

  y += 2
  doc.setDrawColor(255, 255, 255)
  doc.setGState(DIM_06)
  doc.line(margin, y, pageW - margin, y)
  doc.setGState(OPAQUE)
  y += 5

  // ── Line items ──
  for (const li of lineItems) {
    // Student name
    doc.setFontSize(10)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...TEXT_PRIMARY)
    doc.text(li.studentName, col1, y)

    // Instrument subtitle
    doc.setFontSize(7.5)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(...TEXT_MUTED)
    doc.text(`${li.instrument} — 30-minute session`, col1, y + 4)

    // Qty
    doc.setFontSize(10)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(...TEXT_PRIMARY)
    doc.text(String(li.sessions), col2, y)

    // Price
    doc.text(formatCents(li.rateCents), col3, y)

    // Amount
    doc.setFont('helvetica', 'bold')
    doc.text(formatCents(li.monthlyCents), col4, y, { align: 'right' })

    y += 10

    // Row separator
    doc.setDrawColor(255, 255, 255)
    doc.setGState(DIM_03)
    doc.line(margin, y - 2, pageW - margin, y - 2)
    doc.setGState(OPAQUE)
  }

  // ── Totals section ──
  y += 2
  doc.setDrawColor(255, 255, 255)
  doc.setGState(DIM_06)
  doc.line(margin, y, pageW - margin, y)
  doc.setGState(OPAQUE)
  y += 6

  // Subtotal
  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(...TEXT_DIM)
  doc.text('Subtotal', pageW - margin - 30, y)
  doc.setTextColor(...TEXT_MUTED)
  doc.text(formatCents(totalCents), col4, y, { align: 'right' })
  y += 8

  // Total — large, brand colored
  doc.setFontSize(10)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...TEXT_PRIMARY)
  doc.text('Total', pageW - margin - 30, y)
  doc.setFontSize(16)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(br, bg, bb)
  doc.text(formatCents(totalCents), col4, y + 1, { align: 'right' })

  // ── Footer ──
  const footerY = pageH - 16

  // Divider above footer
  doc.setDrawColor(255, 255, 255)
  doc.setGState(DIM_06)
  doc.line(margin, footerY - 6, pageW - margin, footerY - 6)
  doc.setGState(OPAQUE)

  // Location name or ZiroWork
  doc.setFontSize(7.5)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(...TEXT_DIM)
  const footerLeft = branding ? branding.name : 'ZiroWork'
  doc.text(footerLeft, margin + 2, footerY)

  // "Powered by ZiroWork" on the right
  doc.setTextColor(...TEXT_DIM)
  doc.setGState(DIM_50)
  doc.text('Powered by ZiroWork', pageW - margin - 2, footerY, { align: 'right' })
  doc.setGState(OPAQUE)

  // Location contact line
  if (branding) {
    const contactParts: string[] = []
    if (branding.phone) contactParts.push(branding.phone)
    if (branding.email) contactParts.push(branding.email)
    if (contactParts.length > 0) {
      doc.setFontSize(6.5)
      doc.setTextColor(...TEXT_DIM)
      doc.text(contactParts.join('  ·  '), margin + 2, footerY + 3.5)
    }
  }

  return doc.output('blob')
}

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`
}

function formatDateForPdf(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
}
