-- =============================================================================
-- SPEED slow-query remediation (server-side only)
--
-- Targets (reported averages before deploy â€” verify on SPEED after):
--   leads.list      ~707ms  â†’ single RPC + covering indexes
--   teachers.list   ~642ms  â†’ single bundle RPC + supporting indexes
--   dashboard.data  ~820ms  â†’ rely on existing get_dashboard_snapshot (20260414180000);
--                              add indexes here that still help dashboard scans
--   schedule.grid   ~513ms  â†’ session_log index for block_id lookups
-- =============================================================================

-- â”€â”€ Indexes: leads list (tenant + optional filters + order by created_at) â”€â”€
CREATE INDEX IF NOT EXISTS idx_leads_tenant_location_created
  ON public.leads (tenant_id, location_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_leads_tenant_instrument_created
  ON public.leads (tenant_id, instrument, created_at DESC)
  WHERE instrument IS NOT NULL;

-- â”€â”€ session_log: schedule grid joins logs by (tenant, block ids) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
CREATE INDEX IF NOT EXISTS idx_session_log_tenant_schedule_block
  ON public.session_log (tenant_id, schedule_block_id)
  WHERE schedule_block_id IS NOT NULL;

-- â”€â”€ students: teacher roster counts (teachers.list parallel query) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
CREATE INDEX IF NOT EXISTS idx_students_tenant_active_teacher
  ON public.students (tenant_id, teacher_id)
  WHERE status = 'active' AND teacher_id IS NOT NULL;

-- â”€â”€ schedule_blocks: weekly booked counts by teacher â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
CREATE INDEX IF NOT EXISTS idx_schedule_blocks_tenant_booked_week_teacher
  ON public.schedule_blocks (tenant_id, block_date, teacher_id)
  WHERE status = 'booked' AND student_id IS NOT NULL;

-- â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
-- RPC: Teacher â†” location rows for a tenant (was missing from repo; used by
-- useTeachers / useTeacherOverview). Keeps index-friendly join on teachers.
-- â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

CREATE OR REPLACE FUNCTION public.get_teacher_locations_for_tenant(p_tenant_id uuid)
RETURNS TABLE (teacher_id uuid, location_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
  SELECT tl.teacher_id, tl.location_id
  FROM public.teacher_locations tl
  INNER JOIN public.teachers t ON t.id = tl.teacher_id AND t.tenant_id = p_tenant_id;
$function$;

GRANT EXECUTE ON FUNCTION public.get_teacher_locations_for_tenant(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_teacher_locations_for_tenant(uuid) TO service_role;


-- â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
-- RPC: Leads list â€” one round trip, join locations, compute list enrichments
-- â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

CREATE OR REPLACE FUNCTION public.get_leads_list_for_tenant(
  p_tenant_id uuid,
  p_location_id uuid DEFAULT NULL,
  p_instrument text DEFAULT NULL,
  p_limit integer DEFAULT 500
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
  WITH locs AS (
    SELECT id, REPLACE(name, ' Music Lessons', '') AS short_name
    FROM public.locations
    WHERE tenant_id = p_tenant_id
  ),
  base AS (
    SELECT
      l.id,
      l.tenant_id,
      l.location_id,
      l.first_name,
      l.last_name,
      l.parent_name,
      l.email,
      l.phone,
      l.instrument,
      l.age,
      l.goals,
      l.preferred_days,
      l.preferred_times,
      l.stage,
      l.source,
      l.how_heard,
      l.is_military,
      l.assigned_teacher_id,
      l.matched_block_id,
      l.converted_student_id,
      l.follow_up_count,
      l.last_contact_at,
      l.next_follow_up_at,
      l.notes,
      l.lost_category,
      l.lost_reason,
      l.tags,
      l.next_action,
      l.age_range,
      l.experience,
      l.has_instrument,
      l.preferred_locations,
      l.personality_notes,
      l.student_name,
      l.family_id,
      l.compatibility_score,
      l.matched_teacher_id,
      NULL::text AS referral_source,
      l.secondary_location_ids,
      l.intake_submission_id,
      l.created_at,
      l.updated_at,
      CASE WHEN l.location_id IS NULL THEN 'â€”' ELSE COALESCE(lf.short_name, 'â€”') END AS location_name,
      (CURRENT_DATE - (l.created_at AT TIME ZONE 'UTC')::date)::integer AS days_since_created,
      (
        (now() - l.updated_at) >= interval '3 days'
        AND l.stage IS NOT NULL
        AND l.stage::text NOT IN ('enrolled', 'lost')
      ) AS needs_follow_up
    FROM public.leads l
    LEFT JOIN locs lf ON lf.id = l.location_id
    WHERE l.tenant_id = p_tenant_id
      AND (p_location_id IS NULL OR l.location_id = p_location_id)
      AND (p_instrument IS NULL OR l.instrument = p_instrument)
    ORDER BY l.created_at DESC
    LIMIT LEAST(GREATEST(COALESCE(p_limit, 500), 1), 500)
  )
  SELECT jsonb_build_object(
    'leads',
    COALESCE(
      (SELECT jsonb_agg(to_jsonb(b) ORDER BY b.created_at DESC) FROM base b),
      '[]'::jsonb
    )
  );
$function$;

GRANT EXECUTE ON FUNCTION public.get_leads_list_for_tenant(uuid, uuid, text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_leads_list_for_tenant(uuid, uuid, text, integer) TO service_role;


-- â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
-- RPC: Teachers list bundle â€” one DB round-trip; aggregates on the server
-- â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

CREATE OR REPLACE FUNCTION public.get_teachers_list_bundle(
  p_tenant_id uuid,
  p_week_start date,
  p_week_end date
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  result jsonb;
BEGIN
  WITH locs AS (
    SELECT id, name
    FROM public.locations
    WHERE tenant_id = p_tenant_id
  ),
  student_counts AS (
    SELECT teacher_id, COUNT(*)::integer AS c
    FROM public.students
    WHERE tenant_id = p_tenant_id
      AND status = 'active'
      AND teacher_id IS NOT NULL
    GROUP BY teacher_id
  ),
  block_counts AS (
    SELECT teacher_id, COUNT(*)::integer AS c
    FROM public.schedule_blocks
    WHERE tenant_id = p_tenant_id
      AND status = 'booked'
      AND student_id IS NOT NULL
      AND block_date >= p_week_start
      AND block_date <= p_week_end
    GROUP BY teacher_id
  ),
  tl AS (
    SELECT tl.teacher_id, array_agg(tl.location_id ORDER BY tl.location_id) AS location_ids
    FROM public.teacher_locations tl
    INNER JOIN public.teachers tt ON tt.id = tl.teacher_id AND tt.tenant_id = p_tenant_id
    GROUP BY tl.teacher_id
  ),
  teacher_rows AS (
    SELECT
      t.id,
      t.tenant_id,
      t.profile_id,
      t.first_name,
      t.last_name,
      t.email,
      t.phone,
      t.photo_url,
      t.is_active,
      t.status,
      t.instruments,
      t.bio,
      t.rate_per_block,
      t.pay_rate_per_half_hour,
      t.hire_date,
      t.termination_date,
      t.teacher_role,
      t.is_sub_available,
      t.sub_available,
      t.needs_1099,
      t.ai_context,
      t.personality,
      t.lesson_style,
      t.best_age_range,
      t.square_team_member_id,
      t.primary_instruments,
      t.secondary_instruments,
      t.style_genre_strengths,
      t.preferred_age_range,
      t.acceptable_age_range,
      t.skill_levels_by_instrument,
      t.teaching_strengths,
      t.musical_strengths_background,
      t.best_first_lesson_fit,
      t.best_match_students,
      t.use_caution_internal_placement_notes,
      t.meet_and_greet_fit,
      t.substitute_coverage,
      t.customer_facing_match_summary,
      t.internal_matching_tags,
      t.director_notes,
      t.w9_status,
      t.w9_completed_at,
      t.contract_status,
      t.contract_signed_at,
      t.contract_pdf_url,
      t.created_at,
      t.updated_at,
      jsonb_build_object(
        'id', p.id,
        'first_name', p.first_name,
        'last_name', p.last_name,
        'email', p.email,
        'phone', p.phone,
        'is_active', p.is_active
      ) AS prof,
      COALESCE(tl.location_ids, ARRAY[]::uuid[]) AS location_ids,
      COALESCE(sc.c, 0) AS student_count,
      COALESCE(bc.c, 0) AS blocks_this_week
    FROM public.teachers t
    LEFT JOIN public.profiles p ON p.id = t.profile_id
    LEFT JOIN tl ON tl.teacher_id = t.id
    LEFT JOIN student_counts sc ON sc.teacher_id = t.id
    LEFT JOIN block_counts bc ON bc.teacher_id = t.id
    WHERE t.tenant_id = p_tenant_id
    ORDER BY t.first_name NULLS LAST, t.last_name NULLS LAST
    LIMIT 500
  )
  SELECT jsonb_build_object(
    'teachers', COALESCE((
      SELECT jsonb_agg(
        ((to_jsonb(tr) - 'prof') || jsonb_build_object('profile', tr.prof))
        ORDER BY tr.first_name NULLS LAST, tr.last_name NULLS LAST
      )
      FROM teacher_rows tr
    ), '[]'::jsonb),
    'locations', COALESCE((SELECT jsonb_agg(to_jsonb(l) ORDER BY l.name) FROM locs l), '[]'::jsonb)
  )
  INTO result;

  RETURN result;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_teachers_list_bundle(uuid, date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_teachers_list_bundle(uuid, date, date) TO service_role;

-- Dashboard RPC body is already maintained in 20260414180000_dashboard_snapshot_indexes_and_optimize.sql.
-- Further snippet/join tuning should be a small targeted migration once helper RPCs are in-repo.
