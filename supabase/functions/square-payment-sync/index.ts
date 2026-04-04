/**
 * Square Payment Sync — Edge Function
 *
 * Called by n8n on a schedule (or manually). Fetches all invoices from Square,
 * upserts into square_invoices, matches to families, and updates overdue balances.
 *
 * Deploy: supabase functions deploy square-payment-sync --no-verify-jwt
 * URL:    https://dhsyxyhtoadrqfrlmsqe.supabase.co/functions/v1/square-payment-sync
 *
 * Auth: Pass SYNC_SECRET in the Authorization header or as ?secret= query param.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type, authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

// ── Constants ──
const TENANT_ID = '00000000-0000-0000-0000-000000000001'
const SQUARE_BASE = 'https://connect.squareup.com'
const SQUARE_VERSION = '2025-01-23'

// Square location ID → Supabase location UUID
const LOCATION_MAP: Record<string, string> = {
  'L80Q1SNMM4WQ0': 'd48229c1-b70a-4d29-893e-5079887dab76', // Omaha
  'LVE6DMP299BR6': 'f7b52dd5-12ee-437f-9c60-f8adf454ac31', // Bellevue
  'LW7VEGDX50ZYZ': 'cebd97d4-c241-4de2-8ade-49e5cc0070d5', // Elkhorn
  'LRBGW656E86S1': '40c67ffc-91b5-46a9-94bd-6ddffdfb7638', // Gretna
}

const ACTIVE_SQUARE_LOCATIONS = Object.keys(LOCATION_MAP)

// ── Square API helpers ──
async function squareFetch(path: string, token: string, method = 'GET', body?: unknown) {
  const res = await fetch(`${SQUARE_BASE}${path}`, {
    method,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Square-Version': SQUARE_VERSION,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
  if (!res.ok) {
    const err = await res.text().catch(() => 'unknown')
    throw new Error(`Square ${res.status}: ${err}`)
  }
  return res.json()
}

async function fetchAllInvoicesForLocation(locationId: string, token: string): Promise<any[]> {
  const all: any[] = []
  let cursor: string | undefined

  do {
    const body: any = {
      query: { filter: { location_ids: [locationId] } },
      limit: 200,
      ...(cursor ? { cursor } : {}),
    }
    const result = await squareFetch('/v2/invoices/search', token, 'POST', body)
    if (result.invoices) all.push(...result.invoices)
    cursor = result.cursor
  } while (cursor)

  return all
}

// ── Main handler ──
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Auth: check secret
    const SYNC_SECRET = Deno.env.get('SYNC_SECRET') ?? ''
    const SQUARE_TOKEN = Deno.env.get('SQUARE_ACCESS_TOKEN') ?? ''
    const url = new URL(req.url)
    const authHeader = req.headers.get('authorization')?.replace('Bearer ', '') ?? ''
    const querySecret = url.searchParams.get('secret') ?? ''
    const providedSecret = authHeader || querySecret

    if (!SYNC_SECRET || providedSecret !== SYNC_SECRET) {
      return json({ error: 'Unauthorized' }, 401)
    }
    if (!SQUARE_TOKEN) {
      return json({ error: 'SQUARE_ACCESS_TOKEN not configured' }, 500)
    }

    // Supabase client with service role (bypasses RLS)
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // ── Step 1: Fetch ALL families for matching ──
    const { data: families, error: famErr } = await supabase
      .from('families')
      .select('id, name, primary_email, square_customer_id')
    if (famErr) throw new Error(`Failed to load families: ${famErr.message}`)

    const familyBySquareId = new Map<string, string>()
    const familyByEmail = new Map<string, string>()
    for (const f of (families ?? [])) {
      if (f.square_customer_id) familyBySquareId.set(f.square_customer_id, f.id)
      if (f.primary_email) familyByEmail.set(f.primary_email.toLowerCase(), f.id)
    }

    // ── Step 2: Fetch invoices from ALL active Square locations ──
    let allInvoices: any[] = []
    for (const locId of ACTIVE_SQUARE_LOCATIONS) {
      const locInvoices = await fetchAllInvoicesForLocation(locId, SQUARE_TOKEN)
      allInvoices.push(...locInvoices)
    }

    // Deduplicate by invoice ID
    const deduped = [...new Map(allInvoices.map(inv => [inv.id, inv])).values()]

    // ── Step 3: Transform to DB rows ──
    const now = new Date().toISOString()
    const rows = deduped.map((inv: any) => {
      const custId = inv.primary_recipient?.customer_id ?? null
      const custEmail = inv.primary_recipient?.email_address?.toLowerCase() ?? null
      const custName = [inv.primary_recipient?.given_name, inv.primary_recipient?.family_name].filter(Boolean).join(' ') || null
      const payReq = inv.payment_requests?.[0]
      const requestedAmount = payReq?.computed_amount_money?.amount ?? null
      const completedAmount = payReq?.total_completed_amount_money?.amount ?? 0
      const squareLocId = inv.location_id ?? null
      const supabaseLocId = squareLocId ? (LOCATION_MAP[squareLocId] ?? null) : null

      // Match to family: by square_customer_id first, then email
      let familyId: string | null = null
      if (custId) familyId = familyBySquareId.get(custId) ?? null
      if (!familyId && custEmail) familyId = familyByEmail.get(custEmail) ?? null

      // Recurring series ID (for identifying subscription chains)
      const recurringId = inv.subscription_id ?? inv.recurring_details?.subscription_id ?? ''

      return {
        tenant_id: TENANT_ID,
        square_invoice_id: inv.id,
        square_customer_id: custId,
        square_location_id: squareLocId,
        location_id: supabaseLocId,
        family_id: familyId,
        status: inv.status ?? null,
        amount_cents: requestedAmount,
        requested_amount: requestedAmount,
        amount_paid: completedAmount,
        invoice_number: inv.invoice_number ?? null,
        title: inv.title ?? null,
        invoice_date: payReq?.due_date ?? null,
        scheduled_at: inv.scheduled_at ?? null,
        due_date: payReq?.due_date ?? null,
        paid_at: completedAmount > 0 ? (inv.updated_at ?? now) : null,
        square_created_at: inv.created_at ?? null,
        synced_at: now,
        recurring_series_id: recurringId || null,
        customer_email: custEmail,
        customer_name: custName,
        raw_data: inv,
      }
    })

    // ── Step 4: Upsert in batches ──
    const BATCH = 100
    let upserted = 0
    let upsertErrors = 0
    for (let i = 0; i < rows.length; i += BATCH) {
      const chunk = rows.slice(i, i + BATCH)
      const { error: upErr } = await supabase
        .from('square_invoices')
        .upsert(chunk, { onConflict: 'square_invoice_id' })
      if (upErr) {
        console.error(`Upsert batch ${i} failed:`, upErr.message)
        upsertErrors++
      } else {
        upserted += chunk.length
      }
    }

    // ── Step 4b: Backfill square_customer_id on families matched by email ──
    // If a family was matched via email but has no square_customer_id, save it
    let backfilled = 0
    const seen = new Set<string>()
    for (const row of rows) {
      if (!row.family_id || !row.square_customer_id) continue
      const key = `${row.family_id}:${row.square_customer_id}`
      if (seen.has(key)) continue
      seen.add(key)

      // Only backfill if family doesn't already have a square_customer_id
      const existing = familyBySquareId.get(row.square_customer_id)
      if (existing) continue // already linked

      // Check if this family was matched by email (no square_customer_id on record)
      const fam = (families ?? []).find((f: any) => f.id === row.family_id)
      if (fam && !fam.square_customer_id) {
        const { error } = await supabase
          .from('families')
          .update({ square_customer_id: row.square_customer_id })
          .eq('id', row.family_id)
        if (!error) {
          backfilled++
          // Update in-memory map so overdue calc uses it
          familyBySquareId.set(row.square_customer_id, row.family_id)
        }
      }
    }

    // ── Step 5: Compute per-family overdue and update families ──
    // Overdue = UNPAID invoices where due_date is past + 2 day grace period
    const today = new Date()
    const overdueByFamily = new Map<string, number>()
    const paidByFamily = new Map<string, boolean>()

    for (const row of rows) {
      if (!row.family_id) continue

      if (row.status === 'PAID' || (row.amount_paid && row.amount_paid > 0)) {
        paidByFamily.set(row.family_id, true)
      }

      if (row.status === 'UNPAID' || (row.status === 'SCHEDULED' && row.due_date)) {
        const dueDate = new Date(row.due_date + 'T00:00:00')
        const grace = new Date(dueDate)
        grace.setDate(grace.getDate() + 2)
        if (today > grace && row.requested_amount && row.amount_paid < row.requested_amount) {
          const owed = row.requested_amount - (row.amount_paid ?? 0)
          overdueByFamily.set(row.family_id, (overdueByFamily.get(row.family_id) ?? 0) + owed)
        }
      }
    }

    // Batch-update overdue families
    let overdueUpdated = 0
    for (const [familyId, overdueCents] of overdueByFamily) {
      const { error } = await supabase
        .from('families')
        .update({ overdue_balance_cents: overdueCents })
        .eq('id', familyId)
      if (!error) overdueUpdated++
    }

    // Clear overdue for families that are now current (had invoices but no overdue)
    const familyIdsWithInvoices = new Set(rows.filter(r => r.family_id).map(r => r.family_id!))
    let clearedCount = 0
    for (const fid of familyIdsWithInvoices) {
      if (!overdueByFamily.has(fid)) {
        const { error } = await supabase
          .from('families')
          .update({ overdue_balance_cents: 0 })
          .eq('id', fid)
          .gt('overdue_balance_cents', 0)
        if (!error) clearedCount++
      }
    }

    // ── Step 6: Summary stats ──
    const statusCounts: Record<string, number> = {}
    for (const row of rows) {
      statusCounts[row.status ?? 'UNKNOWN'] = (statusCounts[row.status ?? 'UNKNOWN'] ?? 0) + 1
    }

    const matchedFamilies = rows.filter(r => r.family_id).length
    const unmatchedCount = rows.filter(r => !r.family_id).length

    return json({
      success: true,
      synced_at: now,
      invoices: {
        fetched: allInvoices.length,
        deduplicated: deduped.length,
        upserted,
        upsert_errors: upsertErrors,
        by_status: statusCounts,
      },
      families: {
        matched: matchedFamilies,
        unmatched: unmatchedCount,
        overdue_updated: overdueUpdated,
        overdue_cleared: clearedCount,
        square_id_backfilled: backfilled,
      },
    })
  } catch (err: any) {
    console.error('square-payment-sync error:', err)
    return json({ error: err.message ?? 'Unknown error' }, 500)
  }
})
