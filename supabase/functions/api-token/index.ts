/**
 * LP API Token Management — Edge Function
 *
 * Generates, lists, and revokes LP-issued API tokens.
 * Tokens are hashed before storage — the raw token is only
 * shown once at creation time.
 *
 * Deploy: supabase functions deploy api-token --no-verify-jwt --project-ref dhsyxyhtoadrqfrlmsqe
 *
 * Actions:
 *   POST { action: 'create', name, scopes, expires_in_days? }
 *   POST { action: 'list' }
 *   POST { action: 'revoke', token_id }
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type, authorization, apikey, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

const TENANT_ID = '00000000-0000-0000-0000-000000000001'
const ALLOWED_ROLES = ['owner', 'admin', 'company_director']

function generateToken(): string {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  const hex = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('')
  return `lp_tk_${hex}`
}

async function hashToken(token: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(token)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
}

const VALID_SCOPES = [
  'leads:read', 'leads:write',
  'students:read', 'students:write',
  'families:read', 'families:write',
  'schedule:read', 'schedule:write',
  'teachers:read',
  'locations:read',
  'webhooks:manage',
]

Deno.serve(async (req) => {
  // Preflight — always respond with CORS headers
  if (req.method === 'OPTIONS') return new Response(null, { status: 200, headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  try {
    // ─── Auth: validate JWT via Supabase ──────────────
    const authHeader = req.headers.get('authorization')
    if (!authHeader) return json({ error: 'Unauthorized' }, 401)

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authErr } = await supabase.auth.getUser(token)
    if (authErr || !user) return json({ error: 'Unauthorized' }, 401)

    // ─── Role check: must be owner/admin/company_director in tenant ──
    const { data: profile, error: profileErr } = await supabase
      .from('profiles')
      .select('role, tenant_id')
      .eq('id', user.id)
      .eq('tenant_id', TENANT_ID)
      .single()

    if (profileErr || !profile) {
      return json({ error: 'Forbidden — no profile in this tenant' }, 403)
    }

    if (!ALLOWED_ROLES.includes(profile.role)) {
      return json({ error: 'Forbidden — insufficient role' }, 403)
    }

    const body = await req.json()
    const { action } = body

    // ─── CREATE ────────────────────────────────────────
    if (action === 'create') {
      const { name, scopes = [], expires_in_days } = body

      if (!name || typeof name !== 'string' || name.trim().length === 0) {
        return json({ error: 'Token name is required' }, 400)
      }

      // Validate scopes
      const invalidScopes = scopes.filter((s: string) => !VALID_SCOPES.includes(s))
      if (invalidScopes.length > 0) {
        return json({ error: `Invalid scopes: ${invalidScopes.join(', ')}` }, 400)
      }

      const rawToken = generateToken()
      const tokenHash = await hashToken(rawToken)
      const tokenPrefix = rawToken.substring(0, 11) // "lp_tk_xxxxx"

      const expiresAt = expires_in_days
        ? new Date(Date.now() + expires_in_days * 24 * 60 * 60 * 1000).toISOString()
        : null

      const { data, error } = await supabase
        .from('api_tokens')
        .insert({
          tenant_id: TENANT_ID,
          name: name.trim(),
          token_hash: tokenHash,
          token_prefix: tokenPrefix,
          scopes: scopes.length > 0 ? scopes : ['leads:read', 'schedule:read', 'locations:read'],
          expires_at: expiresAt,
          created_by: user.id,
        })
        .select('id, name, token_prefix, scopes, expires_at, created_at')
        .single()

      if (error) {
        if (error.code === '23505') return json({ error: 'Token prefix conflict — try again' }, 409)
        throw error
      }

      // Return the raw token ONCE — it can never be retrieved again
      return json({
        ...data,
        token: rawToken,
        warning: 'Save this token now — it will not be shown again.',
      })
    }

    // ─── LIST ──────────────────────────────────────────
    if (action === 'list') {
      const { data, error } = await supabase
        .from('api_tokens')
        .select('id, name, token_prefix, scopes, last_used_at, expires_at, revoked_at, created_at')
        .eq('tenant_id', TENANT_ID)
        .order('created_at', { ascending: false })
        .limit(50)

      if (error) throw error
      return json(data)
    }

    // ─── REVOKE ────────────────────────────────────────
    if (action === 'revoke') {
      const { token_id } = body
      if (!token_id) return json({ error: 'token_id is required' }, 400)

      const { error } = await supabase
        .from('api_tokens')
        .update({ revoked_at: new Date().toISOString() })
        .eq('id', token_id)
        .eq('tenant_id', TENANT_ID)

      if (error) throw error
      return json({ revoked: true })
    }

    return json({ error: `Unknown action: ${action}` }, 400)
  } catch (err) {
    console.error('API token error:', err)
    return json({ error: 'Internal server error' }, 500)
  }
})
