/**
 * Plaid Exchange Token — exchanges a public_token from Plaid Link for an access_token,
 * stores the item + accounts in the finance tables.
 *
 * Auth: JWT (owner | admin only).
 * Deploy: supabase functions deploy plaid-exchange-token
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

  try {
    // Auth
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
    const tenantId = profile.tenant_id ?? TENANT_ID

    const { public_token, institution, location_id } = await req.json()
    if (!public_token) return json({ error: 'public_token is required' }, 400)

    const clientId = Deno.env.get('PLAID_CLIENT_ID')!
    const secret = Deno.env.get('PLAID_SECRET')!
    const base = PLAID_BASE[PLAID_ENV] ?? PLAID_BASE.sandbox

    // 1. Exchange public_token → access_token + item_id
    const exchangeResp = await fetch(`${base}/item/public_token/exchange`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id: clientId, secret, public_token }),
    })
    const exchangeBody = await exchangeResp.json()
    if (!exchangeResp.ok) {
      return json({ error: exchangeBody?.error_message ?? 'Token exchange failed', plaid_error: exchangeBody }, 502)
    }

    const { access_token, item_id } = exchangeBody

    // 2. Get accounts from Plaid
    const accountsResp = await fetch(`${base}/accounts/get`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id: clientId, secret, access_token }),
    })
    const accountsBody = await accountsResp.json()
    if (!accountsResp.ok) {
      return json({ error: 'Failed to fetch accounts after exchange' }, 502)
    }

    // 3. Write to DB using service_role (bypasses RLS)
    const db = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // Upsert plaid item
    const { data: itemRow, error: itemErr } = await db
      .from('finance_plaid_items')
      .upsert({
        tenant_id: tenantId,
        plaid_item_id: item_id,
        access_token,
        institution_id: institution?.institution_id ?? null,
        institution_name: institution?.name ?? null,
        status: 'active',
      }, { onConflict: 'plaid_item_id' })
      .select('id')
      .single()

    if (itemErr) return json({ error: `DB item insert failed: ${itemErr.message}` }, 500)

    // Resolve finance_location for location mapping
    let financeLocationId: string | null = null
    if (location_id) {
      const { data: fl } = await db
        .from('finance_locations')
        .select('id')
        .eq('core_location_id', location_id)
        .eq('tenant_id', tenantId)
        .single()
      financeLocationId = fl?.id ?? null
    }

    // Upsert accounts
    const plaidAccounts = accountsBody.accounts ?? []
    const accountRows = plaidAccounts.map((a: Record<string, unknown>) => ({
      tenant_id: tenantId,
      plaid_item_id: itemRow.id,
      plaid_account_id: a.account_id,
      account_name: a.name ?? 'Unknown',
      official_name: (a as Record<string, string>).official_name ?? null,
      mask: (a as Record<string, string>).mask ?? null,
      account_type: (a as Record<string, string>).type ?? null,
      account_subtype: (a as Record<string, string>).subtype ?? null,
      institution_name: institution?.name ?? null,
      location_id: financeLocationId,
      is_active: true,
    }))

    const { error: accErr } = await db
      .from('finance_accounts')
      .upsert(accountRows, { onConflict: 'plaid_account_id' })

    if (accErr) return json({ error: `DB account insert failed: ${accErr.message}` }, 500)

    // 4. Snapshot initial balances
    const balanceRows = plaidAccounts.map((a: Record<string, unknown>) => {
      const bal = a.balances as Record<string, unknown> | undefined
      return {
        tenant_id: tenantId,
        plaid_account_id: a.account_id as string,
        available_balance: bal?.available ?? null,
        current_balance: bal?.current ?? null,
        iso_currency_code: (bal?.iso_currency_code as string) ?? 'USD',
        source: 'plaid',
      }
    })

    // Look up account IDs for balance snapshots
    for (const br of balanceRows) {
      const { data: acc } = await db
        .from('finance_accounts')
        .select('id')
        .eq('plaid_account_id', br.plaid_account_id)
        .single()
      if (acc) {
        await db.from('finance_balance_snapshots').insert({
          tenant_id: tenantId,
          account_id: acc.id,
          available_balance: br.available_balance,
          current_balance: br.current_balance,
          iso_currency_code: br.iso_currency_code,
          source: br.source,
        })
      }
    }

    return json({
      success: true,
      item_id: itemRow.id,
      accounts_linked: plaidAccounts.length,
    })
  } catch (err) {
    return json({ error: (err as Error).message ?? 'Internal error' }, 500)
  }
})
