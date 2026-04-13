/**
 * Plaid Balance Sync — fetches current balances for all active Plaid items
 * and inserts snapshots into finance_balance_snapshots.
 *
 * Auth: JWT (owner | admin) or SYNC_SECRET header for cron.
 * Deploy: supabase functions deploy plaid-sync-balances --no-verify-jwt
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
}

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

const TENANT_ID = '00000000-0000-0000-0000-000000000001'
const PLAID_ENV = Deno.env.get('PLAID_ENV') ?? 'sandbox'
const PLAID_BASE: Record<string, string> = {
  sandbox: 'https://sandbox.plaid.com',
  development: 'https://development.plaid.com',
  production: 'https://production.plaid.com',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders })

  const started = Date.now()
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

  try {
    // Auth
    const syncSecret = Deno.env.get('SYNC_SECRET')
    const headerSecret = req.headers.get('x-sync-secret')
    let tenantId = TENANT_ID

    if (syncSecret && headerSecret === syncSecret) {
      // cron path
    } else {
      const authHeader = req.headers.get('authorization') ?? ''
      const anonClient = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_ANON_KEY')!,
        { global: { headers: { Authorization: authHeader } } },
      )
      const { data: { user }, error: authErr } = await anonClient.auth.getUser()
      if (authErr || !user) return json({ error: 'Unauthorized' }, 401)

      const { data: profile } = await anonClient
        .from('profiles')
        .select('role, tenant_id')
        .eq('id', user.id)
        .single()
      if (!profile || !['owner', 'admin'].includes(profile.role)) {
        return json({ error: 'Forbidden' }, 403)
      }
      tenantId = profile.tenant_id ?? TENANT_ID
    }

    const clientId = Deno.env.get('PLAID_CLIENT_ID')!
    const secret = Deno.env.get('PLAID_SECRET')!
    const base = PLAID_BASE[PLAID_ENV] ?? PLAID_BASE.sandbox

    // Get active items
    const { data: items, error: itemsErr } = await db
      .from('finance_plaid_items')
      .select('id, plaid_item_id, access_token')
      .eq('tenant_id', tenantId)
      .eq('status', 'active')

    if (itemsErr) return json({ error: `Failed to load items: ${itemsErr.message}` }, 500)
    if (!items || items.length === 0) return json({ success: true, message: 'No active Plaid items', snapshots: 0 })

    // Account lookup
    const { data: accounts } = await db
      .from('finance_accounts')
      .select('id, plaid_account_id')
      .eq('tenant_id', tenantId)
      .eq('is_active', true)

    const accountMap = new Map<string, string>()
    for (const a of accounts ?? []) {
      accountMap.set(a.plaid_account_id, a.id)
    }

    let totalSnapshots = 0

    for (const item of items) {
      if (!item.access_token) continue

      const balResp = await fetch(`${base}/accounts/balance/get`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_id: clientId, secret, access_token: item.access_token }),
      })

      const balBody = await balResp.json()
      if (!balResp.ok) {
        console.error(`Balance fetch failed for item ${item.id}:`, balBody?.error_message)
        await db
          .from('finance_plaid_items')
          .update({ error_code: 'BALANCE_ERROR', error_message: balBody?.error_message ?? 'Balance fetch failed' })
          .eq('id', item.id)
        continue
      }

      const plaidAccounts = balBody.accounts ?? []
      const snapshots = []

      for (const a of plaidAccounts) {
        const accountId = accountMap.get(a.account_id)
        if (!accountId) continue

        snapshots.push({
          tenant_id: tenantId,
          account_id: accountId,
          available_balance: a.balances?.available ?? null,
          current_balance: a.balances?.current ?? null,
          iso_currency_code: a.balances?.iso_currency_code ?? 'USD',
          source: 'plaid',
        })
      }

      if (snapshots.length > 0) {
        const { error } = await db.from('finance_balance_snapshots').insert(snapshots)
        if (error) console.error('Balance snapshot insert error:', error.message)
        else totalSnapshots += snapshots.length
      }

      // Update last sync time
      await db
        .from('finance_plaid_items')
        .update({ last_balances_sync_at: new Date().toISOString(), error_code: null, error_message: null })
        .eq('id', item.id)
    }

    return json({
      success: true,
      timing_ms: Date.now() - started,
      items_synced: items.length,
      snapshots: totalSnapshots,
    })
  } catch (err) {
    return json({ error: (err as Error).message ?? 'Internal error' }, 500)
  }
})
