/**
 * Square Payment Sync — Edge Function
 *
 * Payment rail only: reads Square Invoices, upserts `square_invoices`, reconciles to LP families and money fields.
 * Lesson schedules and lesson recurrence live in Lessonpreneur only — not in Square.
 *
 * Auth: (1) Optional `SYNC_SECRET` (Bearer or ?secret=) for server-to-server callers only.
 *       (2) Supabase user JWT — owner | admin | company_director (tenant-scoped profile).
 *
 * Deploy: supabase functions deploy square-payment-sync --no-verify-jwt
 * Scope: see SCOPE.md in this folder.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

/** Every response must include these so browser + supabase-js (apikey, x-client-info) pass CORS. */
const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
}

function json(body: Record<string, unknown>, status = 200, requestId?: string) {
  const headers: Record<string, string> = { ...corsHeaders, 'Content-Type': 'application/json' }
  if (requestId) headers['X-Request-Id'] = requestId
  return new Response(JSON.stringify(body), { status, headers })
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
  const requestId = crypto.randomUUID()

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: { ...corsHeaders, 'X-Request-Id': requestId } })
  }

  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed', request_id: requestId }, 405, requestId)
  }

  let t0 = 0
  try {
    // Auth: (1) optional SYNC_SECRET for server-only callers, or (2) Supabase session JWT for owner/admin/company_director
    const SYNC_SECRET = Deno.env.get('SYNC_SECRET') ?? ''
    const SQUARE_TOKEN = Deno.env.get('SQUARE_ACCESS_TOKEN') ?? ''
    const url = new URL(req.url)
    const authHeader = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? ''
    const querySecret = url.searchParams.get('secret') ?? ''
    const provided = authHeader || querySecret

    const authorizedBySecret = !!SYNC_SECRET && provided === SYNC_SECRET

    let authorizedByUser = false
    if (!authorizedBySecret && provided && provided.split('.').length === 3) {
      try {
        const authClient = createClient(
          Deno.env.get('SUPABASE_URL')!,
          Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
        )
        const { data: userData, error: jwtErr } = await authClient.auth.getUser(provided)
        if (!jwtErr && userData.user) {
          const { data: prof } = await authClient
            .from('profiles')
            .select('role, tenant_id')
            .eq('id', userData.user.id)
            .eq('tenant_id', TENANT_ID)
            .maybeSingle()
          const role = prof?.role as string | undefined
          if (role === 'owner' || role === 'admin' || role === 'company_director') {
            authorizedByUser = true
          }
        }
      } catch {
        // invalid JWT
      }
    }

    if (!authorizedBySecret && !authorizedByUser) {
      console.warn(JSON.stringify({ msg: 'square-payment-sync', request_id: requestId, event: 'auth_failed' }))
      return json({ error: 'Unauthorized', request_id: requestId }, 401, requestId)
    }
    if (!SQUARE_TOKEN) {
      console.error(JSON.stringify({ msg: 'square-payment-sync', request_id: requestId, event: 'missing_square_token' }))
      return json({ error: 'SQUARE_ACCESS_TOKEN not configured', request_id: requestId }, 500, requestId)
    }

    console.log(
      JSON.stringify({
        msg: 'square-payment-sync',
        request_id: requestId,
        event: 'start',
        auth_mode: authorizedBySecret ? 'sync_secret' : 'user_jwt',
      }),
    )

    t0 = performance.now()

    // Supabase client with service role (bypasses RLS)
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // ── Step 1: Fetch families for matching (tenant-scoped) ──
    const { data: families, error: famErr } = await supabase
      .from('families')
      .select('id, name, primary_email, square_customer_id')
      .eq('tenant_id', TENANT_ID)
    if (famErr) throw new Error(`Failed to load families: ${famErr.message}`)

    console.log(
      JSON.stringify({
        msg: 'square-payment-sync',
        request_id: requestId,
        event: 'step_timing',
        step: 'families_loaded',
        elapsed_ms: Math.round(performance.now() - t0),
        family_count: (families ?? []).length,
      }),
    )

    const familyBySquareId = new Map<string, string>()
    const familyByEmail = new Map<string, string>()
    for (const f of (families ?? [])) {
      if (f.square_customer_id) familyBySquareId.set(f.square_customer_id, f.id)
      if (f.primary_email) familyByEmail.set(f.primary_email.toLowerCase(), f.id)
    }

    // ── Step 2: Fetch invoices from ALL active Square locations ──
    let allInvoices: any[] = []
    for (const locId of ACTIVE_SQUARE_LOCATIONS) {
      try {
        const locInvoices = await fetchAllInvoicesForLocation(locId, SQUARE_TOKEN)
        allInvoices.push(...locInvoices)
      } catch (locErr: unknown) {
        const m = locErr instanceof Error ? locErr.message : String(locErr)
        console.error(JSON.stringify({ msg: 'square-payment-sync', request_id: requestId, event: 'square_location_error', location: locId, error: m }))
        throw new Error(`Square invoice fetch failed for location ${locId}: ${m}`)
      }
    }

    // Deduplicate by invoice ID
    const deduped = [...new Map(allInvoices.map(inv => [inv.id, inv])).values()]

    console.log(
      JSON.stringify({
        msg: 'square-payment-sync',
        request_id: requestId,
        event: 'step_timing',
        step: 'square_fetch_done',
        elapsed_ms: Math.round(performance.now() - t0),
        raw_invoices: allInvoices.length,
        deduplicated: deduped.length,
      }),
    )

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

      // Square payment/subscription reference from their API only (opaque metadata). Not LP lesson recurrence.
      const squarePaymentRef = inv.subscription_id ?? inv.recurring_details?.subscription_id ?? ''

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
        recurring_series_id: squarePaymentRef || null,
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
        console.error(
          JSON.stringify({
            msg: 'square-payment-sync',
            request_id: requestId,
            event: 'upsert_batch_failed',
            batch_index: i,
            error: upErr.message,
          }),
        )
        upsertErrors++
      } else {
        upserted += chunk.length
      }
    }

    if (upsertErrors > 0) {
      throw new Error(
        `square_invoices upsert failed for ${upsertErrors} batch(es); overdue updates skipped. request_id=${requestId}`,
      )
    }

    console.log(
      JSON.stringify({
        msg: 'square-payment-sync',
        request_id: requestId,
        event: 'step_timing',
        step: 'upsert_done',
        elapsed_ms: Math.round(performance.now() - t0),
        row_count: rows.length,
        upserted,
      }),
    )

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
          .eq('tenant_id', TENANT_ID)
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
        .eq('tenant_id', TENANT_ID)
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
          .eq('tenant_id', TENANT_ID)
          .gt('overdue_balance_cents', 0)
        if (!error) clearedCount++
      }
    }

    console.log(
      JSON.stringify({
        msg: 'square-payment-sync',
        request_id: requestId,
        event: 'step_timing',
        step: 'overdue_updates_done',
        elapsed_ms: Math.round(performance.now() - t0),
        overdue_updated: overdueUpdated,
        overdue_cleared: clearedCount,
      }),
    )

    // ── Step 6: Summary stats ──
    const statusCounts: Record<string, number> = {}
    for (const row of rows) {
      statusCounts[row.status ?? 'UNKNOWN'] = (statusCounts[row.status ?? 'UNKNOWN'] ?? 0) + 1
    }

    const matchedFamilies = rows.filter(r => r.family_id).length
    const unmatchedCount = rows.filter(r => !r.family_id).length

    const payload = {
      success: true,
      request_id: requestId,
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
    }
    const totalMs = Math.round(performance.now() - t0)
    console.log(
      JSON.stringify({
        msg: 'square-payment-sync',
        request_id: requestId,
        event: 'complete',
        total_ms: totalMs,
        upserted,
        upsert_errors: upsertErrors,
        deduplicated: deduped.length,
      }),
    )
    return json({ ...payload, timing_ms: totalMs } as Record<string, unknown>, 200, requestId)
  } catch (err: unknown) {
    const m = err instanceof Error ? err.message : String(err)
    const totalMs = t0 > 0 ? Math.round(performance.now() - t0) : undefined
    console.error(
      JSON.stringify({
        msg: 'square-payment-sync',
        request_id: requestId,
        event: 'error',
        error: m,
        total_ms: totalMs,
      }),
    )
    return json({ error: m, request_id: requestId, ...(totalMs != null ? { timing_ms: totalMs } : {}) }, 500, requestId)
  }
})
