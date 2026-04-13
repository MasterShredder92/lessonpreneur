/**
 * public-teacher-match — Public edge function for signup teacher matching.
 *
 * Called by the unauthenticated signup page to match a prospective student
 * with available teachers. Uses the service role key to bypass RLS.
 *
 * Customer-facing match summary; matched_teacher.id is required for signup submit.
 */
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
    const {
      school_slug,
      location_id,
      instruments,
      selected_days,
      age,
      personality_notes,
    } = body

    if (!school_slug || !location_id) {
      return json({ success: false, error: 'school_slug and location_id required' }, 400)
    }

    const sb = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // ── Resolve tenant ──
    const { data: tenant, error: tenantErr } = await sb
      .from('tenants')
      .select('id')
      .eq('slug', school_slug)
      .single()

    if (tenantErr || !tenant) {
      return json({ success: false, error: 'Unknown school' }, 400)
    }

    const { data: locRow, error: locErr } = await sb
      .from('locations')
      .select('id')
      .eq('id', location_id)
      .eq('tenant_id', tenant.id)
      .maybeSingle()

    if (locErr || !locRow) {
      return json({ success: false, error: 'Invalid location for this school' }, 400)
    }

    // ── Get active teachers with their match-relevant data ──
    const { data: teachers, error: teacherErr } = await sb
      .from('teachers')
      .select(`
        id, first_name, display_name, instruments,
        preferred_age_range, acceptable_age_range,
        customer_facing_match_summary, personality, lesson_style,
        ai_context
      `)
      .eq('tenant_id', tenant.id)
      .eq('is_active', true)
      .eq('status', 'active')

    if (teacherErr) {
      console.error('Teacher query error:', teacherErr)
      return json({ success: false, error: 'Failed to query teachers' }, 500)
    }

    // ── Get teacher availability at this location ──
    const { data: availability, error: availErr } = await sb
      .from('teacher_availability')
      .select('teacher_id, location_id, day_of_week')
      .eq('location_id', location_id)
      .eq('is_active', true)

    if (availErr) {
      console.error('Availability query error:', availErr)
      return json({ success: false, error: 'Failed to query availability' }, 500)
    }

    const teacherList = teachers ?? []
    const availList = availability ?? []

    console.log(`[public-teacher-match] teachers=${teacherList.length} availability_rows=${availList.length}`)

    // ── Build availability map: teacher_id → Set<day_of_week> ──
    const availMap = new Map<string, Set<string>>()
    for (const a of availList) {
      if (!availMap.has(a.teacher_id)) availMap.set(a.teacher_id, new Set())
      availMap.get(a.teacher_id)!.add(a.day_of_week)
    }

    // ── Map selected day labels to day_of_week values ──
    const dayMap: Record<string, string> = {
      'Monday 3:30-9p': 'monday',
      'Tuesday 3:30-9p': 'tuesday',
      'Wednesday 3:30-9p': 'wednesday',
      'Thursday 3:30-9p': 'thursday',
      'Saturday 10am-3p': 'saturday',
    }
    const userDays: string[] = Array.isArray(selected_days)
      ? selected_days.map((d: string) => dayMap[d]).filter(Boolean)
      : []

    const instrumentList: string[] = Array.isArray(instruments) ? instruments : []
    const anyDayFlex = Array.isArray(selected_days) && selected_days.includes('Any of These Work')

    // ── Score each teacher ──
    let bestScore = 0
    let bestTeacher: (typeof teacherList)[number] | null = null
    let candidateCount = 0

    for (const t of teacherList) {
      let score = 0
      const tInstruments: string[] = Array.isArray(t.instruments) ? t.instruments : []

      // Instrument match: +35
      const instMatch = instrumentList.some((si: string) =>
        tInstruments.some((ti: string) => ti.toLowerCase() === si.toLowerCase()),
      )
      if (instMatch) score += 35

      // Day overlap: +30 (proportional)
      const tDays = availMap.get(t.id)
      if (tDays && userDays.length > 0) {
        const overlap = userDays.filter((d: string) => tDays.has(d)).length
        score += Math.round((overlap / userDays.length) * 30)
      } else if (anyDayFlex && tDays && tDays.size > 0) {
        score += 30
      }

      // Age fit: +20
      const ageRanges = [
        ...(Array.isArray(t.preferred_age_range) ? t.preferred_age_range : []),
        ...(Array.isArray(t.acceptable_age_range) ? t.acceptable_age_range : []),
      ]
      if (age && ageRanges.length > 0) {
        const ageNum = parseInt(String(age))
        const ageLabel =
          ageNum < 5
            ? 'Younger Than 5'
            : ageNum <= 10
              ? '5-10'
              : ageNum <= 17
                ? '11-17'
                : ageNum <= 25
                  ? '18-25'
                  : '26 or older'
        if (ageRanges.some((r: string) => r?.toLowerCase().includes(ageLabel.toLowerCase()))) {
          score += 20
        }
      }

      // Location presence: +15 (teacher has availability at this location)
      if (tDays && tDays.size > 0) score += 15

      if (score > 0) candidateCount++

      if (score > bestScore) {
        bestScore = score
        bestTeacher = t
      }
    }

    console.log(`[public-teacher-match] bestScore=${bestScore}, candidates=${candidateCount}`)

    // ── Return customer-safe data only ──
    return json({
      success: true,
      match_score: bestScore,
      candidates_found: candidateCount,
      matched_teacher: bestTeacher
        ? {
            id: bestTeacher.id,
            display_name: bestTeacher.display_name || bestTeacher.first_name || 'Your Teacher',
            customer_facing_match_summary: bestTeacher.customer_facing_match_summary || null,
          }
        : null,
    })
  } catch (err) {
    console.error('[public-teacher-match] Unexpected error:', err)
    return json({ success: false, error: 'Internal server error' }, 500)
  }
})
