/**
 * Square Proxy — Edge Function (read-only into LP policy)
 *
 * Outbound creation of cards, payments, customers, or invoices in Square is disabled.
 * Optional: list-customers (GET) for debugging — does not send LP records to Square.
 *
 * Deploy: supabase functions deploy square-proxy
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type, authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

const SQUARE_BASE = 'https://connect.squareup.com'
const SQUARE_VERSION = '2025-01-23'

async function squareFetch(
  path: string,
  token: string,
  method = 'GET',
  body?: unknown,
) {
  const res = await fetch(`${SQUARE_BASE}${path}`, {
    method,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Square-Version': SQUARE_VERSION,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })

  const data = await res.json().catch(() => null)

  if (!res.ok) {
    return { ok: false, status: res.status, data }
  }

  return { ok: true, status: res.status, data }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const SQUARE_TOKEN = Deno.env.get('SQUARE_ACCESS_TOKEN') ?? ''
    if (!SQUARE_TOKEN) {
      return json({ error: 'SQUARE_ACCESS_TOKEN not configured' }, 500)
    }

    // Authenticate user via Supabase JWT
    const authHeader = req.headers.get('authorization') ?? ''
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    )

    const { data: { user }, error: authErr } = await supabase.auth.getUser()
    if (authErr || !user) {
      return json({ error: 'Unauthorized' }, 401)
    }

    const body = await req.json().catch(() => ({}))
    const action = body.action as string

    if (!action) {
      return json({ error: 'Missing action field' }, 400)
    }

    // ── Route by action ──

    if (action === 'list-customers') {
      const limit = body.limit ?? 10
      const result = await squareFetch(
        `/v2/customers?limit=${limit}`,
        SQUARE_TOKEN,
      )
      return json(result.data, result.status)
    }

    if (action === 'create-card' || action === 'create-payment') {
      return json(
        {
          error:
            'Square outbound actions are disabled. Integration is read-only from Square into Lessonpreneur.',
        },
        403,
      )
    }

    return json({ error: `Unknown action: ${action}` }, 400)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('square-proxy error:', message)
    return json({ error: message }, 500)
  }
})
