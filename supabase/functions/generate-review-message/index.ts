/**
 * generate-review-message — AI-powered Google Review request SMS generator.
 *
 * Takes family/student context + location Google review URL and returns
 * a warm, personalized SMS message via Claude Haiku.
 *
 * Deploy: supabase functions deploy generate-review-message --no-verify-jwt --project-ref dhsyxyhtoadrqfrlmsqe
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')
const TENANT_ID = '00000000-0000-0000-0000-000000000001'
const ALLOWED_ROLES = ['owner', 'admin', 'company_director', 'studio_director']

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders })
  }

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

    // ─── Role check ──────────────────────────────────
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

    // ─── Validate Anthropic key ──────────────────────
    if (!ANTHROPIC_API_KEY) {
      return json({ error: 'ANTHROPIC_API_KEY not configured', fallback: true }, 200)
    }

    // ─── Parse body ──────────────────────────────────
    const {
      parent_first_name,
      students,
      location_name,
      google_review_url,
    } = await req.json()

    if (!parent_first_name || !students?.length || !location_name) {
      return json({ error: 'Missing required fields', fallback: true }, 200)
    }

    // ─── Build prompt ────────────────────────────────
    const studentDetails = students
      .map((s: { name: string; instrument: string; created_at: string }) => {
        const months = Math.round(
          (Date.now() - new Date(s.created_at).getTime()) /
            (30 * 24 * 60 * 60 * 1000),
        )
        return `${s.name} — ${s.instrument}${months > 0 ? `, enrolled ${months} months` : ''}`
      })
      .join('\n')

    const reviewUrlLine = google_review_url
      ? `- Google Review URL: ${google_review_url}\n- End with the Google review URL on its own line`
      : '- Do NOT include any URL — one will be added separately'

    const prompt = `You are writing a warm, personalized Google review request SMS message for a music school.

Context:
- Parent's first name: ${parent_first_name}
- Location: ${location_name}
- Students:
${studentDetails}
${reviewUrlLine}

Rules:
- Write a single SMS-length message (under 300 characters if possible, max 480)
- Be warm, genuine, and personal — reference the student(s) by name
- Reference their specific instrument(s)
- Mention something about their growth or progress
- Do NOT include quotation marks around the message
- Do NOT include a subject line or greeting like "Dear"
- Start with "Hey ${parent_first_name}!" or similar casual opener
- Use "session" not "lesson" when referring to their time at the studio
- Keep it feeling like a real text from someone who knows the family

Write the message now:`

    // ─── Call Anthropic ──────────────────────────────
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 300,
        messages: [{ role: 'user', content: prompt }],
      }),
    })

    if (!res.ok) {
      const errText = await res.text()
      console.error('Anthropic API error:', errText)
      return json({ error: 'AI generation failed', fallback: true }, 200)
    }

    const data = await res.json()
    const message = data.content?.[0]?.text?.trim() ?? ''

    if (!message) {
      return json({ error: 'Empty response from AI', fallback: true }, 200)
    }

    return json({ message })
  } catch (err) {
    console.error('generate-review-message error:', err)
    return json({ error: 'Internal error', fallback: true }, 200)
  }
})
