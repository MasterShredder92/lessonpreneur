import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return json({ success: false, error: 'Method not allowed' }, 405)
  }

  try {
    const body = await req.json()

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

    // ── Init Supabase with service role (bypasses RLS) ──
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // ── Resolve tenant from slug ──
    const { data: tenant, error: tenantErr } = await supabase
      .from('tenants')
      .select('id')
      .eq('slug', school_slug)
      .single()

    if (tenantErr || !tenant) {
      return json({ success: false, error: 'Unknown school' }, 400)
    }

    const tenantId = tenant.id

    // ── Build notes from students array ──
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

    // ── Check for existing family by email ──
    let familyId: string | null = null
    const cleanEmail = email.trim().toLowerCase()

    const { data: existingFamily } = await supabase
      .from('families')
      .select('id')
      .eq('primary_email', cleanEmail)
      .limit(1)
      .single()

    if (existingFamily) {
      familyId = existingFamily.id
    } else if (body.parent_name || first_name) {
      const contactName = (body.parent_name || first_name).trim()
      const nameParts = contactName.split(' ')
      const familyName = `${nameParts[nameParts.length - 1]} Family`

      const { data: newFamily, error: famErr } = await supabase
        .from('families')
        .insert({
          name: familyName,
          parent_name: contactName,
          primary_email: cleanEmail,
          primary_phone: phone.trim(),
          is_military: body.is_military || false,
          tenant_id: tenantId,
          billing_status: 'active',
        })
        .select('id')
        .single()

      if (!famErr && newFamily) {
        familyId = newFamily.id
      }
    }

    // ── Generate submission_id for multi-student batches ──
    const submissionId = students.length > 1 ? crypto.randomUUID() : null

    // ── Insert primary lead ──
    const lead: Record<string, unknown> = {
      tenant_id: tenantId,
      location_id,
      family_id: familyId,
      submission_id: submissionId,
      stage: 'inquiry',
      source: body.source || 'website_form',
      how_heard: body.referral_source || body.source || 'website_form',
      first_name: first_name.trim(),
      last_name: body.last_name?.trim() || null,
      student_name: body.student_name?.trim() || first_name.trim(),
      parent_name: body.parent_name?.trim() || null,
      email: cleanEmail,
      phone: phone.trim(),
      instrument: body.instrument || firstStudent.instrument || null,
      age_range: body.age_range || null,
      experience: body.experience || null,
      preferred_days: body.preferred_days || null,
      preferred_locations: body.preferred_locations || null,
      secondary_location_ids: body.secondary_location_ids || null,
      has_instrument: body.has_instrument || null,
      personality_notes: body.personality_notes || firstStudent.personality_notes || null,
      goals: body.goals || firstStudent.goals || null,
      is_military: body.is_military || false,
      compatibility_score: body.compatibility_score || null,
      matched_teacher_id: body.matched_teacher_id || null,
      notes: notes || null,
    }

    const { data: inserted, error: leadErr } = await supabase
      .from('leads')
      .insert(lead)
      .select('id')
      .single()

    if (leadErr) {
      console.error('Lead insert error:', leadErr)
      return json({ success: false, error: 'Failed to create lead' }, 500)
    }

    // ── Insert additional student leads ──
    if (students.length > 1) {
      for (const student of students.slice(1)) {
        await supabase.from('leads').insert({
          ...lead,
          student_name: student.name?.trim() || null,
          first_name: student.name?.split(' ')[0]?.trim() || first_name.trim(),
          last_name: student.name?.split(' ').slice(1).join(' ')?.trim() || null,
          instrument: student.instrument || null,
          personality_notes: student.personality_notes || null,
          goals: student.goals || null,
          compatibility_score: null,
          matched_teacher_id: null,
          notes: null,
        })
      }
    }

    return json({ success: true, lead_id: inserted.id })
  } catch (err) {
    console.error('Unexpected error:', err)
    return json({ success: false, error: 'Internal server error' }, 500)
  }
})
