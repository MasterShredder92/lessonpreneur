-- Deploy teachers.list bundle RPC + supporting indexes to environments where
-- 20260429120000 was not applied (e.g. leads RPC blocked by schema drift).
-- Skips get_leads_list_for_tenant — fix leads columns in a separate migration.

CREATE INDEX IF NOT EXISTS idx_leads_tenant_location_created
  ON public.leads (tenant_id, location_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_leads_tenant_instrument_created
  ON public.leads (tenant_id, instrument, created_at DESC)
  WHERE instrument IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_session_log_tenant_schedule_block
  ON public.session_log (tenant_id, schedule_block_id)
  WHERE schedule_block_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_students_tenant_active_teacher
  ON public.students (tenant_id, teacher_id)
  WHERE status = 'active' AND teacher_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_schedule_blocks_tenant_booked_week_teacher
  ON public.schedule_blocks (tenant_id, block_date, teacher_id)
  WHERE status = 'booked' AND student_id IS NOT NULL;

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

-- Supports get_teachers_list_bundle: WHERE tenant_id = ? ORDER BY first_name, last_name
CREATE INDEX IF NOT EXISTS idx_teachers_tenant_name_sort
  ON public.teachers (tenant_id, first_name, last_name);
