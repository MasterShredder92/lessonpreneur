/**
 * Plaid Transaction Sync — uses /transactions/sync (cursor-based) to pull
 * transactions for all active Plaid items and upsert into finance_transactions.
 *
 * Auth: JWT (owner | admin) or SYNC_SECRET header for cron.
 * Deploy: supabase functions deploy plaid-sync-transactions --no-verify-jwt
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
    // Auth — SYNC_SECRET for cron, or JWT for manual trigger
    const syncSecret = Deno.env.get('SYNC_SECRET')
    const headerSecret = req.headers.get('x-sync-secret')
    let tenantId = TENANT_ID

    if (syncSecret && headerSecret === syncSecret) {
      // cron path — OK
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

    // Get all active plaid items for this tenant
    const { data: items, error: itemsErr } = await db
      .from('finance_plaid_items')
      .select('id, plaid_item_id, access_token, transactions_cursor')
      .eq('tenant_id', tenantId)
      .eq('status', 'active')

    if (itemsErr) return json({ error: `Failed to load plaid items: ${itemsErr.message}` }, 500)
    if (!items || items.length === 0) return json({ success: true, message: 'No active Plaid items', items_synced: 0 })

    // Build account lookup: plaid_account_id → { id, location_id }
    const { data: accounts } = await db
      .from('finance_accounts')
      .select('id, plaid_account_id, location_id')
      .eq('tenant_id', tenantId)
      .eq('is_active', true)

    const accountMap = new Map<string, { id: string; location_id: string | null }>()
    for (const a of accounts ?? []) {
      accountMap.set(a.plaid_account_id, { id: a.id, location_id: a.location_id })
    }

    let totalAdded = 0
    let totalModified = 0
    let totalRemoved = 0

    for (const item of items) {
      if (!item.access_token) continue

      // Create sync run record
      const { data: syncRun } = await db
        .from('finance_sync_runs')
        .insert({
          tenant_id: tenantId,
          plaid_item_id: item.id,
          sync_type: 'transactions',
          status: 'running',
        })
        .select('id')
        .single()

      let cursor = item.transactions_cursor ?? ''
      let hasMore = true
      let itemAdded = 0
      let itemModified = 0
      let itemRemoved = 0

      try {
        while (hasMore) {
          const syncResp = await fetch(`${base}/transactions/sync`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              client_id: clientId,
              secret,
              access_token: item.access_token,
              cursor: cursor || undefined,
              count: 500,
            }),
          })

          const syncBody = await syncResp.json()
          if (!syncResp.ok) {
            throw new Error(syncBody?.error_message ?? `Plaid transactions/sync failed (${syncResp.status})`)
          }

          const { added, modified, removed, next_cursor, has_more } = syncBody

          // Process added transactions
          if (added?.length > 0) {
            const rows = added.map((t: Record<string, unknown>) => mapTransaction(t, tenantId, accountMap))
            const { error } = await db.from('finance_transactions').upsert(rows, { onConflict: 'plaid_transaction_id' })
            if (error) console.error('Upsert added error:', error.message)
            itemAdded += added.length
          }

          // Process modified transactions
          if (modified?.length > 0) {
            const rows = modified.map((t: Record<string, unknown>) => mapTransaction(t, tenantId, accountMap))
            const { error } = await db.from('finance_transactions').upsert(rows, { onConflict: 'plaid_transaction_id' })
            if (error) console.error('Upsert modified error:', error.message)
            itemModified += modified.length
          }

          // Process removed transactions
          if (removed?.length > 0) {
            const ids = removed.map((r: { transaction_id: string }) => r.transaction_id)
            const { error } = await db
              .from('finance_transactions')
              .delete()
              .in('plaid_transaction_id', ids)
              .eq('tenant_id', tenantId)
            if (error) console.error('Delete removed error:', error.message)
            itemRemoved += removed.length
          }

          cursor = next_cursor
          hasMore = has_more
        }

        // Update cursor on plaid item
        await db
          .from('finance_plaid_items')
          .update({ transactions_cursor: cursor, last_transactions_sync_at: new Date().toISOString() })
          .eq('id', item.id)

        // Complete sync run
        if (syncRun) {
          await db
            .from('finance_sync_runs')
            .update({
              status: 'completed',
              completed_at: new Date().toISOString(),
              added_count: itemAdded,
              modified_count: itemModified,
              removed_count: itemRemoved,
            })
            .eq('id', syncRun.id)
        }
      } catch (err) {
        // Mark sync run as failed
        if (syncRun) {
          await db
            .from('finance_sync_runs')
            .update({
              status: 'failed',
              completed_at: new Date().toISOString(),
              error_message: (err as Error).message,
            })
            .eq('id', syncRun.id)
        }

        // Mark item error
        await db
          .from('finance_plaid_items')
          .update({ error_code: 'SYNC_ERROR', error_message: (err as Error).message })
          .eq('id', item.id)
      }

      totalAdded += itemAdded
      totalModified += itemModified
      totalRemoved += itemRemoved
    }

    return json({
      success: true,
      timing_ms: Date.now() - started,
      items_synced: items.length,
      added: totalAdded,
      modified: totalModified,
      removed: totalRemoved,
    })
  } catch (err) {
    return json({ error: (err as Error).message ?? 'Internal error' }, 500)
  }
})

function mapTransaction(
  t: Record<string, unknown>,
  tenantId: string,
  accountMap: Map<string, { id: string; location_id: string | null }>,
) {
  const acct = accountMap.get(t.account_id as string)
  const postedDate = (t.date as string) ?? null
  const monthBucket = postedDate ? postedDate.substring(0, 7) + '-01' : null
  const personalFinance = t.personal_finance_category as Record<string, string> | undefined

  return {
    tenant_id: tenantId,
    account_id: acct?.id ?? null,
    location_id: acct?.location_id ?? null,
    plaid_transaction_id: t.transaction_id,
    pending_plaid_transaction_id: (t.pending_transaction_id as string) ?? null,
    posted_date: postedDate,
    authorized_date: (t.authorized_date as string) ?? null,
    month_bucket: monthBucket,
    transaction_name: (t.name as string) ?? 'Unknown',
    merchant_name: (t.merchant_name as string) ?? null,
    amount: t.amount as number,
    iso_currency_code: (t.iso_currency_code as string) ?? 'USD',
    unofficial_currency_code: (t.unofficial_currency_code as string) ?? null,
    plaid_primary_category: personalFinance?.primary ?? null,
    plaid_detailed_category: personalFinance?.detailed ?? null,
    payment_channel: (t.payment_channel as string) ?? null,
    is_pending: (t.pending as boolean) ?? false,
    is_recurring: false,
    is_transfer: false,
    is_excluded: false,
    raw_payload: t,
  }
}
