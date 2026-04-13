/**
 * Plaid Link Token — creates a link_token for the frontend Plaid Link widget.
 *
 * Auth: JWT (owner | admin only).
 * Deploy: supabase functions deploy plaid-create-link-token
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

const PLAID_ENV = Deno.env.get('PLAID_ENV') ?? 'sandbox'
const PLAID_BASE: Record<string, string> = {
  sandbox: 'https://sandbox.plaid.com',
  development: 'https://development.plaid.com',
  production: 'https://production.plaid.com',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders })

  try {
    // Auth — verify JWT and check role
    const authHeader = req.headers.get('authorization') ?? ''
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    )
    const { data: { user }, error: authErr } = await supabase.auth.getUser()
    if (authErr || !user) return json({ error: 'Unauthorized' }, 401)

    const { data: profile } = await supabase
      .from('profiles')
      .select('role, tenant_id')
      .eq('id', user.id)
      .single()
    if (!profile || !['owner', 'admin'].includes(profile.role)) {
      return json({ error: 'Forbidden — owner or admin required' }, 403)
    }

    const clientId = Deno.env.get('PLAID_CLIENT_ID')
    const secret = Deno.env.get('PLAID_SECRET')
    if (!clientId || !secret) return json({ error: 'Plaid credentials not configured' }, 500)

    const base = PLAID_BASE[PLAID_ENV] ?? PLAID_BASE.sandbox

    const resp = await fetch(`${base}/link/token/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: clientId,
        secret,
        user: { client_user_id: user.id },
        client_name: 'Lessonpreneur',
        products: ['transactions'],
        country_codes: ['US'],
        language: 'en',
      }),
    })

    const body = await resp.json()
    if (!resp.ok) {
      return json({ error: body?.error_message ?? 'Plaid link/token/create failed', plaid_error: body }, 502)
    }

    return json({ link_token: body.link_token, expiration: body.expiration })
  } catch (err) {
    return json({ error: (err as Error).message ?? 'Internal error' }, 500)
  }
})
