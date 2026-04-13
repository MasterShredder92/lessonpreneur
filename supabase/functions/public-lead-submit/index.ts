import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type, authorization, apikey, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

/** Reject cross-tenant FK injection: location(s) and optional teacher must belong to tenant. */
async function assertTenantScopedPayload(
  supabase: SupabaseClient,
  tenantId: string,
  body: Record<string, unknown>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const locationId = body.location_id as string

  const { data: loc, error: locErr } = await supabase
    .from('locations')
    .select('id')
    .eq('id', locationId)
    .eq('tenant_id', tenantId)
    .maybeSingle()

  if (locErr || !loc) {
    return { ok: false, error: 'Invalid location for this school' }
  }

  const secondary = body.secondary_location_ids
  if (Array.isArray(secondary) && secondary.length > 0) {
    for (const sid of secondary) {
      if (typeof sid !== 'string') continue
      const { data: sLoc } = await supabase
        .from('locations')
        .select('id')
        .eq('id', sid)
        .eq('tenant_id', tenantId)
        .maybeSingle()
      if (!sLoc) {
        return { ok: false, error: 'Invalid secondary location for this school' }
      }
    }
  }

  const teacherId = body.matched_teacher_id
  if (teacherId != null && teacherId !== '') {
    const { data: t, error: tErr } = await supabase
      .from('teachers')
      .select('id')
      .eq('id', teacherId as string)
      .eq('tenant_id', tenantId)
      .maybeSingle()
    if (tErr || !t) {
      return { ok: false, error: 'Invalid teacher for this school' }
    }
  }

  return { ok: true }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return json({ success: false, error: 'Method not allowed' }, 405)
  }

  try {
    const body = await req.json() as Record<string, unknown>

    // ── Validate required fields ──
    const { school_slug, location_id, first_name, email, phone } = body
    const missing: string[] = []
    if (!school_slug) missing.push('school_slug')
    if (!location_id) missing.push('location_id')
    if (!first_name) missing.push('first_name')
    if (!email) missing.push('email')
    if (!phone) missing.push('phone')
    if (missing.length > 0) {
      return json({ success: false, error: `Missing required fields: ${missing.join(', ')}` }, 400)
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const { data: tenant, error: tenantErr } = await supabase
      .from('tenants')
      .select('id')
      .eq('slug', school_slug)
      .single()

    if (tenantErr || !tenant) {
      return json({ success: false, error: 'Unknown school' }, 400)
    }

    const tenantId = tenant.id

    const scope = await assertTenantScopedPayload(supabase, tenantId, body)
    if (!scope.ok) {
      return json({ success: false, error: scope.error }, 400)
    }

    // ── Immutable intake row (source of truth) ──
    const { data: intakeRow, error: intakeErr } = await supabase
      .from('intake_submissions')
      .insert({
        tenant_id: tenantId,
        location_id: location_id as string,
        source: (body.source as string) || 'website_form',
        form_version: '1',
        raw_payload: body,
        lead_ids: [],
      })
      .select('id')
      .single()

    if (intakeErr || !intakeRow) {
      console.error('intake_submissions insert failed:', intakeErr?.code, intakeErr?.message)
      return json({ success: false, error: 'Failed to record intake' }, 500)
    }

    const intakeSubmissionId = intakeRow.id

    const students: Array<{
      name?: string
      instrument?: string
      personality_notes?: string
      goals?: string
    }> = Array.isArray(body.students) ? body.students : []

    const firstStudent = students[0] || {}
    let notes = ''
    if (students.length > 1) {
      notes = students
        .map((s, i) => {
          const parts = [`Student ${i + 1}: ${s.name || 'unnamed'}`]
          if (s.instrument) parts.push(`Instrument: ${s.instrument}`)
          if (s.goals) parts.push(`Goals: ${s.goals}`)
          if (s.personality_notes) parts.push(`Notes: ${s.personality_notes}`)
          return parts.join(' | ')
        })
        .join('\n')
    }

    let familyId: string | null = null
    const cleanEmail = (email as string).trim().toLowerCase()
    const phoneDigits = String(phone as string).replace(/\D/g, '')

    const { data: existingByEmail } = await supabase
      .from('families')
      .select('id')
      .eq('primary_email', cleanEmail)
      .eq('tenant_id', tenantId)
      .limit(1)
      .maybeSingle()

    if (existingByEmail) {
      familyId = existingByEmail.id
    } else if (phoneDigits.length >= 10) {
      const { data: familiesForPhone } = await supabase
        .from('families')
        .select('id, primary_phone')
        .eq('tenant_id', tenantId)
        .not('primary_phone', 'is', null)
        .limit(500)

      const match = familiesForPhone?.find((f: { id: string; primary_phone: string | null }) => {
        const d = String(f.primary_phone ?? '').replace(/\D/g, '')
        return d.length >= 10 && d === phoneDigits
      })
      if (match) familyId = match.id
    }

    if (!familyId && (body.parent_name || first_name)) {
      const contactName = ((body.parent_name as string) || (first_name as string)).trim()
      const nameParts = contactName.split(' ')
      const familyName = `${nameParts[nameParts.length - 1]} Family`

      const { data: newFamily, error: famErr } = await supabase
        .from('families')
        .insert({
          name: familyName,
          parent_name: contactName,
          primary_email: cleanEmail,
          primary_phone: (phone as string).trim(),
          is_military: Boolean(body.is_military),
          tenant_id: tenantId,
          billing_status: 'active',
        })
        .select('id')
        .single()

      if (!famErr && newFamily) {
        familyId = newFamily.id
      }
    }

    const submissionId = students.length > 1 ? crypto.randomUUID() : null

    const leadBase: Record<string, unknown> = {
      tenant_id: tenantId,
      location_id,
      family_id: familyId,
      submission_id: submissionId,
      intake_submission_id: intakeSubmissionId,
      stage: 'inquiry',
      source: body.source || 'website_form',
      how_heard: body.referral_source || body.source || 'website_form',
      first_name: (first_name as string).trim(),
      last_name: (body.last_name as string | undefined)?.trim() || null,
      student_name: (body.student_name as string | undefined)?.trim() || (first_name as string).trim(),
      parent_name: (body.parent_name as string | undefined)?.trim() || null,
      email: cleanEmail,
      phone: (phone as string).trim(),
      instrument: body.instrument || firstStudent.instrument || null,
      age_range: body.age_range || null,
      experience: body.experience || null,
      preferred_days: body.preferred_days || null,
      preferred_locations: body.preferred_locations || null,
      secondary_location_ids: body.secondary_location_ids || null,
      has_instrument: body.has_instrument || null,
      personality_notes: body.personality_notes || firstStudent.personality_notes || null,
      goals: body.goals || firstStudent.goals || null,
      is_military: Boolean(body.is_military),
      compatibility_score: body.compatibility_score || null,
      matched_teacher_id: body.matched_teacher_id || null,
      notes: notes || null,
    }

    const { data: inserted, error: leadErr } = await supabase
      .from('leads')
      .insert(leadBase)
      .select('id')
      .single()

    if (leadErr) {
      console.error('Lead insert error:', leadErr.code)
      return json({ success: false, error: 'Failed to create lead' }, 500)
    }

    const allLeadIds: string[] = [inserted.id]

    if (students.length > 1) {
      for (const student of students.slice(1)) {
        const { data: subLead, error: subErr } = await supabase
          .from('leads')
          .insert({
            ...leadBase,
            student_name: student.name?.trim() || null,
            first_name: student.name?.split(' ')[0]?.trim() || (first_name as string).trim(),
            last_name: student.name?.split(' ').slice(1).join(' ')?.trim() || null,
            instrument: student.instrument || null,
            personality_notes: student.personality_notes || null,
            goals: student.goals || null,
            compatibility_score: null,
            matched_teacher_id: null,
            notes: null,
          })
          .select('id')
          .single()
        if (!subErr && subLead?.id) allLeadIds.push(subLead.id)
        if (subErr) console.error('Secondary lead insert error:', subErr.code)
      }
    }

    await supabase
      .from('intake_submissions')
      .update({ lead_ids: allLeadIds })
      .eq('id', intakeSubmissionId)

    return json({ success: true, lead_id: inserted.id, intake_submission_id: intakeSubmissionId })
  } catch (err) {
    console.error('Unexpected error:', err instanceof Error ? err.name : 'unknown')
    return json({ success: false, error: 'Internal server error' }, 500)
  }
})
