/**
 * Square Payments / Refunds sync — read-only financial facts for LP reporting.
 *
 * Sources: GET /v2/payments (paginated), GET /v2/refunds (paginated).
 * Writes: public.square_payments_fact, public.square_refunds_fact (tenant-scoped upsert).
 *
 * Auth: same as square-payment-sync — SYNC_SECRET or user JWT (owner | admin | company_director).
 *
 * Deploy: supabase functions deploy square-payments-sync --no-verify-jwt
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

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

const TENANT_ID = '00000000-0000-0000-0000-000000000001'
const SQUARE_BASE = 'https://connect.squareup.com'
const SQUARE_VERSION = '2025-01-23'

const LOCATION_MAP: Record<string, string> = {
  'L80Q1SNMM4WQ0': 'd48229c1-b70a-4d29-893e-5079887dab76',
  'LVE6DMP299BR6': 'f7b52dd5-12ee-437f-9c60-f8adf454ac31',
  'LW7VEGDX50ZYZ': 'cebd97d4-c241-4de2-8ade-49e5cc0070d5',
  'LRBGW656E86S1': '40c67ffc-91b5-46a9-94bd-6ddffdfb7638',
}

const ACTIVE_SQUARE_LOCATIONS = Object.keys(LOCATION_MAP)

type Money = { amount?: number; currency?: string } | null | undefined

function moneyCents(m: Money): number | null {
  if (m == null || typeof m !== 'object' || m.amount == null) return null
  return typeof m.amount === 'number' ? m.amount : null
}

function sumProcessingFees(fees: unknown): number {
  if (!Array.isArray(fees)) return 0
  let s = 0
  for (const f of fees) {
    const m = (f as { amount_money?: { amount?: number } })?.amount_money
    if (m?.amount != null) s += m.amount
  }
  return s
}

/** Normalized tender for reporting; not identical to Square source_type. */
function tenderBucket(p: Record<string, unknown>): string {
  const st = String(p.source_type ?? '').toUpperCase()
  if (st === 'CARD') return 'card'
  if (st === 'CASH') return 'cash'
  if (st === 'BANK_ACCOUNT') return 'bank_transfer'
  if (st === 'WALLET') {
    const w = p.wallet_details as Record<string, unknown> | undefined
    const hint = JSON.stringify(w ?? {}).toUpperCase()
    if (hint.includes('CASH_APP') || hint.includes('CASHAPP')) return 'cash_app'
    return 'wallet_other'
  }
  if (st === 'EXTERNAL') return 'external'
  return 'other'
}

function reportingDateUtc(iso: string | undefined): string {
  if (!iso) return new Date().toISOString().slice(0, 10)
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return new Date().toISOString().slice(0, 10)
  return d.toISOString().slice(0, 10)
}

async function squareGet(pathWithQuery: string, token: string): Promise<Response> {
  return await fetch(`${SQUARE_BASE}${pathWithQuery}`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Square-Version': SQUARE_VERSION,
    },
  })
}

async function fetchAllPayments(
  squareLocId: string,
  beginTime: string,
  endTime: string,
  token: string,
): Promise<Record<string, unknown>[]> {
  const all: Record<string, unknown>[] = []
  let cursor: string | undefined
  do {
    const params = new URLSearchParams({
      location_id: squareLocId,
      begin_time: beginTime,
      end_time: endTime,
      sort_order: 'ASC',
      limit: '100',
    })
    if (cursor) params.set('cursor', cursor)
    const res = await squareGet(`/v2/payments?${params.toString()}`, token)
    const data = (await res.json()) as { payments?: Record<string, unknown>[]; cursor?: string; errors?: unknown[] }
    if (!res.ok) {
      const msg = JSON.stringify(data.errors ?? data)
      throw new Error(`Square payments ${res.status}: ${msg}`)
    }
    if (data.payments?.length) all.push(...data.payments)
    cursor = data.cursor || undefined
  } while (cursor)
  return all
}

async function fetchAllRefunds(
  squareLocId: string,
  beginTime: string,
  endTime: string,
  token: string,
): Promise<Record<string, unknown>[]> {
  const all: Record<string, unknown>[] = []
  let cursor: string | undefined
  do {
    const params = new URLSearchParams({
      location_id: squareLocId,
      begin_time: beginTime,
      end_time: endTime,
      sort_order: 'ASC',
      limit: '100',
    })
    if (cursor) params.set('cursor', cursor)
    const res = await squareGet(`/v2/refunds?${params.toString()}`, token)
    const data = (await res.json()) as { refunds?: Record<string, unknown>[]; cursor?: string; errors?: unknown[] }
    if (!res.ok) {
      const msg = JSON.stringify(data.errors ?? data)
      throw new Error(`Square refunds ${res.status}: ${msg}`)
    }
    if (data.refunds?.length) all.push(...data.refunds)
    cursor = data.cursor || undefined
  } while (cursor)
  return all
}

function paymentToRow(p: Record<string, unknown>, lpLocationId: string | null) {
  const id = String(p.id ?? '')
  const proc = sumProcessingFees(p.processing_fee)
  const total = moneyCents(p.total_money as Money) ?? 0
  const appFee = moneyCents(p.application_fee_money as Money) ?? 0
  const net = total - appFee - proc
  const created = p.created_at as string | undefined
  return {
    tenant_id: TENANT_ID,
    square_payment_id: id,
    square_location_id: (p.location_id as string) ?? null,
    location_id: lpLocationId,
    status: String(p.status ?? ''),
    source_type: p.source_type != null ? String(p.source_type) : null,
    tender_bucket: tenderBucket(p),
    amount_money_cents: moneyCents(p.amount_money as Money),
    tip_money_cents: moneyCents(p.tip_money as Money),
    total_money_cents: moneyCents(p.total_money as Money),
    application_fee_money_cents: moneyCents(p.application_fee_money as Money),
    processing_fee_total_cents: proc,
    refunded_money_cents: moneyCents(p.refunded_money as Money),
    net_total_cents: net,
    reporting_date: reportingDateUtc(created),
    created_at_square: created ?? null,
    updated_at_square: (p.updated_at as string) ?? null,
    raw_json: p,
  }
}

function refundToRow(
  r: Record<string, unknown>,
  lpLocationId: string | null,
  fallbackSquareLocId: string,
) {
  const id = String(r.id ?? '')
  const pid = String(r.payment_id ?? '')
  const amt = moneyCents(r.amount_money as Money) ?? 0
  const created = r.created_at as string | undefined
  const sqLoc = (r.location_id != null ? String(r.location_id) : null) ?? fallbackSquareLocId
  return {
    tenant_id: TENANT_ID,
    square_refund_id: id,
    square_payment_id: pid,
    square_location_id: sqLoc,
    location_id: lpLocationId,
    status: r.status != null ? String(r.status) : null,
    amount_money_cents: amt,
    reporting_date: reportingDateUtc(created),
    created_at_square: created ?? null,
    updated_at_square: (r.updated_at as string) ?? null,
    raw_json: r,
  }
}

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
        /* invalid JWT */
      }
    }

    if (!authorizedBySecret && !authorizedByUser) {
      return json({ error: 'Unauthorized', request_id: requestId }, 401, requestId)
    }
    if (!SQUARE_TOKEN) {
      return json({ error: 'SQUARE_ACCESS_TOKEN not configured', request_id: requestId }, 500, requestId)
    }

    const body = await req.json().catch(() => ({})) as {
      begin_time?: string
      end_time?: string
      include_refunds?: boolean
    }

    const end = body.end_time ?? new Date().toISOString()
    const begin = body.begin_time ?? new Date(Date.now() - 7 * 86400000).toISOString()
    const includeRefunds = body.include_refunds !== false

    t0 = performance.now()
    console.log(
      JSON.stringify({
        msg: 'square-payments-sync',
        request_id: requestId,
        event: 'start',
        begin,
        end,
        include_refunds: includeRefunds,
      }),
    )

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    let paymentsUpserted = 0
    let refundsUpserted = 0

    for (const squareLocId of ACTIVE_SQUARE_LOCATIONS) {
      const lpLoc = LOCATION_MAP[squareLocId] ?? null

      const payments = await fetchAllPayments(squareLocId, begin, end, SQUARE_TOKEN)
      const rows = payments.map(p => paymentToRow(p, lpLoc))

      const BATCH = 50
      for (let i = 0; i < rows.length; i += BATCH) {
        const chunk = rows.slice(i, i + BATCH)
        const { error } = await supabase.from('square_payments_fact').upsert(chunk, {
          onConflict: 'tenant_id,square_payment_id',
        })
        if (error) throw new Error(`square_payments_fact upsert: ${error.message}`)
        paymentsUpserted += chunk.length
      }

      if (includeRefunds) {
        const refunds = await fetchAllRefunds(squareLocId, begin, end, SQUARE_TOKEN)
        const rrows = refunds.map(r => refundToRow(r, lpLoc, squareLocId))
        for (let i = 0; i < rrows.length; i += BATCH) {
          const chunk = rrows.slice(i, i + BATCH)
          const { error } = await supabase.from('square_refunds_fact').upsert(chunk, {
            onConflict: 'tenant_id,square_refund_id',
          })
          if (error) throw new Error(`square_refunds_fact upsert: ${error.message}`)
          refundsUpserted += chunk.length
        }
      }
    }

    const totalMs = Math.round(performance.now() - t0)
    const payload = {
      success: true,
      request_id: requestId,
      timing_ms: totalMs,
      window: { begin_time: begin, end_time: end },
      payments_upserted: paymentsUpserted,
      refunds_upserted: refundsUpserted,
    }
    console.log(JSON.stringify({ msg: 'square-payments-sync', request_id: requestId, event: 'complete', ...payload }))
    return json(payload as Record<string, unknown>, 200, requestId)
  } catch (err: unknown) {
    const m = err instanceof Error ? err.message : String(err)
    const totalMs = t0 > 0 ? Math.round(performance.now() - t0) : undefined
    console.error(JSON.stringify({ msg: 'square-payments-sync', request_id: requestId, event: 'error', error: m, total_ms: totalMs }))
    return json({ error: m, request_id: requestId, ...(totalMs != null ? { timing_ms: totalMs } : {}) }, 500, requestId)
  }
})
