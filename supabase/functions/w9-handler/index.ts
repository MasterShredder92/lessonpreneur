/**
 * W9 Handler — Edge Function
 *
 * Encrypts TIN (SSN/EIN) server-side using AES-256-GCM so the
 * encryption key never reaches the browser.
 *
 * Deploy: supabase functions deploy w9-handler
 * URL:    https://dhsyxyhtoadrqfrlmsqe.supabase.co/functions/v1/w9-handler
 *
 * Supported actions:
 *   - encrypt-tin  — Encrypts a TIN string, returns base64 ciphertext
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

async function encryptTIN(tin: string, keyHex: string): Promise<string> {
  const encoder = new TextEncoder()
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(keyHex.padEnd(32).slice(0, 32)),
    { name: 'AES-GCM' },
    false,
    ['encrypt'],
  )
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    keyMaterial,
    encoder.encode(tin),
  )
  const combined = new Uint8Array(iv.length + new Uint8Array(encrypted).byteLength)
  combined.set(iv)
  combined.set(new Uint8Array(encrypted), iv.length)
  // Base64 encode
  let binary = ''
  for (const byte of combined) {
    binary += String.fromCharCode(byte)
  }
  return btoa(binary)
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const W9_KEY = Deno.env.get('W9_ENCRYPTION_KEY') ?? ''
    if (!W9_KEY) {
      return json({ error: 'W9_ENCRYPTION_KEY not configured' }, 500)
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

    if (action === 'encrypt-tin') {
      const tin = body.tin as string
      if (!tin || !/^\d{9}$/.test(tin)) {
        return json({ error: 'Invalid TIN: must be exactly 9 digits' }, 400)
      }

      const encrypted = await encryptTIN(tin, W9_KEY)
      return json({ encrypted })
    }

    return json({ error: `Unknown action: ${action}` }, 400)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('w9-handler error:', message)
    return json({ error: message }, 500)
  }
})
