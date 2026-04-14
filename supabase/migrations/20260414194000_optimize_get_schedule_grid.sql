-- =============================================================================
-- SPEED alert: schedule.grid (schedule_blocks) ~513ms
--
-- Root cause:
-- The RPC `get_schedule_grid` used `(p_location_id IS NULL OR location_id = p_location_id)`
-- which can lead to a generic plan and prevent optimal index usage when a location
-- is provided (especially under prepared/generic planning).
--
-- Fix:
-- Branch the query so the planner sees either:
--   - tenant_id + block_date
--   - tenant_id + block_date + location_id
-- and can use the best composite index.
--
-- Also add a defensive LIMIT 500 on raw_blocks (grid should never be unbounded).
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_schedule_grid(
  p_tenant_id uuid,
  p_block_date date,
  p_location_id uuid DEFAULT NULL::uuid
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
  IF p_location_id IS NULL THEN
    WITH
    raw_blocks AS (
      SELECT id, tenant_id, location_id, teacher_id, student_id,
             block_date, start_time, end_time, status, block_type,
             is_recurring, checked_in, teacher_tally, fifth_week, room, room_id, notes,
             original_teacher_id, original_teacher_name,
             is_virtual, meet_link, meet_event_id,
             callout_reason, is_family_callout, callout_id, is_makeup_session, makeup_session_id
      FROM public.schedule_blocks
      WHERE tenant_id = p_tenant_id
        AND block_date = p_block_date
      ORDER BY start_time
      LIMIT 500
    ),
    teacher_info AS (
      SELECT DISTINCT ON (t.id)
        t.id,
        COALESCE(
          NULLIF(TRIM(t.first_name || ' ' || COALESCE(t.last_name, '')), ''),
          TRIM(COALESCE(p.first_name, '') || ' ' || COALESCE(p.last_name, '')),
          'Unknown'
        ) AS name,
        t.photo_url
      FROM raw_blocks rb
      JOIN public.teachers t ON t.id = rb.teacher_id
      LEFT JOIN public.profiles p ON p.id = t.profile_id
    ),
    student_info AS (
      SELECT DISTINCT ON (s.id)
        s.id, s.first_name || ' ' || s.last_name AS name, s.instrument
      FROM raw_blocks rb
      JOIN public.students s ON s.id = rb.student_id
      WHERE rb.student_id IS NOT NULL
    ),
    room_info AS (
      SELECT DISTINCT ON (r.id) r.id, r.name
      FROM raw_blocks rb
      JOIN public.rooms r ON r.id = rb.room_id
      WHERE rb.room_id IS NOT NULL
    ),
    loc_info AS (
      SELECT l.name
      FROM public.locations l
      WHERE l.tenant_id = p_tenant_id
        AND l.id = (SELECT location_id FROM raw_blocks LIMIT 1)
      LIMIT 1
    ),
    log_info AS (
      SELECT sl.schedule_block_id, sl.id, sl.worked_on, sl.engagement_level,
             sl.progress_indicator, sl.teacher_note, sl.parent_update_status
      FROM public.session_log sl
      WHERE sl.tenant_id = p_tenant_id
        AND sl.schedule_block_id IN (SELECT id FROM raw_blocks)
    ),
    enriched AS (
      SELECT jsonb_build_object(
        'block_id', rb.id,
        'tenant_id', rb.tenant_id,
        'location_id', rb.location_id,
        'location_name', COALESCE((SELECT name FROM loc_info), ''),
        'teacher_id', rb.teacher_id,
        'teacher_name', COALESCE(ti.name, 'Unknown'),
        'student_id', rb.student_id,
        'student_name', si.name,
        'instrument', si.instrument,
        'block_date', rb.block_date,
        'start_time', rb.start_time,
        'end_time', rb.end_time,
        'status', rb.status,
        'block_type', COALESCE(rb.block_type::text, 'open_time'),
        'is_recurring', rb.is_recurring,
        'checked_in', COALESCE(rb.checked_in, false),
        'teacher_tally', COALESCE(rb.teacher_tally, false),
        'fifth_week', COALESCE(rb.fifth_week, false),
        'room', CASE WHEN rb.room_id IS NOT NULL THEN COALESCE(ri.name, rb.room) ELSE rb.room END,
        'room_id', rb.room_id,
        'notes', rb.notes,
        'original_teacher_id', rb.original_teacher_id,
        'original_teacher_name', rb.original_teacher_name,
        'has_session_log', li.id IS NOT NULL,
        'session_log', CASE WHEN li.id IS NOT NULL THEN jsonb_build_object(
          'id', li.id, 'worked_on', COALESCE(li.worked_on, '{}'),
          'engagement_level', li.engagement_level, 'progress_indicator', li.progress_indicator,
          'teacher_note', li.teacher_note, 'parent_update_status', li.parent_update_status
        ) ELSE NULL END,
        'is_virtual', COALESCE(rb.is_virtual, false),
        'meet_link', rb.meet_link,
        'meet_event_id', rb.meet_event_id,
        'callout_reason', rb.callout_reason,
        'is_family_callout', COALESCE(rb.is_family_callout, false),
        'callout_id', rb.callout_id,
        'is_makeup_session', COALESCE(rb.is_makeup_session, false),
        'makeup_session_id', rb.makeup_session_id
      ) AS block
      FROM raw_blocks rb
      LEFT JOIN teacher_info ti ON ti.id = rb.teacher_id
      LEFT JOIN student_info si ON si.id = rb.student_id
      LEFT JOIN room_info ri ON ri.id = rb.room_id
      LEFT JOIN log_info li ON li.schedule_block_id = rb.id
    )
    SELECT jsonb_build_object(
      'blocks', COALESCE((SELECT jsonb_agg(e.block) FROM enriched e), '[]'::jsonb),
      'teachers', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', ti.id, 'name', ti.name, 'photo_url', ti.photo_url) ORDER BY ti.name) FROM teacher_info ti), '[]'::jsonb),
      'timeSlots', COALESCE((SELECT jsonb_agg(DISTINCT rb.start_time ORDER BY rb.start_time) FROM raw_blocks rb), '[]'::jsonb)
    ) INTO result;
  ELSE
    WITH
    raw_blocks AS (
      SELECT id, tenant_id, location_id, teacher_id, student_id,
             block_date, start_time, end_time, status, block_type,
             is_recurring, checked_in, teacher_tally, fifth_week, room, room_id, notes,
             original_teacher_id, original_teacher_name,
             is_virtual, meet_link, meet_event_id,
             callout_reason, is_family_callout, callout_id, is_makeup_session, makeup_session_id
      FROM public.schedule_blocks
      WHERE tenant_id = p_tenant_id
        AND block_date = p_block_date
        AND location_id = p_location_id
      ORDER BY start_time
      LIMIT 500
    ),
    teacher_info AS (
      SELECT DISTINCT ON (t.id)
        t.id,
        COALESCE(
          NULLIF(TRIM(t.first_name || ' ' || COALESCE(t.last_name, '')), ''),
          TRIM(COALESCE(p.first_name, '') || ' ' || COALESCE(p.last_name, '')),
          'Unknown'
        ) AS name,
        t.photo_url
      FROM raw_blocks rb
      JOIN public.teachers t ON t.id = rb.teacher_id
      LEFT JOIN public.profiles p ON p.id = t.profile_id
    ),
    student_info AS (
      SELECT DISTINCT ON (s.id)
        s.id, s.first_name || ' ' || s.last_name AS name, s.instrument
      FROM raw_blocks rb
      JOIN public.students s ON s.id = rb.student_id
      WHERE rb.student_id IS NOT NULL
    ),
    room_info AS (
      SELECT DISTINCT ON (r.id) r.id, r.name
      FROM raw_blocks rb
      JOIN public.rooms r ON r.id = rb.room_id
      WHERE rb.room_id IS NOT NULL
    ),
    loc_info AS (
      SELECT l.name
      FROM public.locations l
      WHERE l.tenant_id = p_tenant_id
        AND l.id = p_location_id
      LIMIT 1
    ),
    log_info AS (
      SELECT sl.schedule_block_id, sl.id, sl.worked_on, sl.engagement_level,
             sl.progress_indicator, sl.teacher_note, sl.parent_update_status
      FROM public.session_log sl
      WHERE sl.tenant_id = p_tenant_id
        AND sl.schedule_block_id IN (SELECT id FROM raw_blocks)
    ),
    enriched AS (
      SELECT jsonb_build_object(
        'block_id', rb.id,
        'tenant_id', rb.tenant_id,
        'location_id', rb.location_id,
        'location_name', COALESCE((SELECT name FROM loc_info), ''),
        'teacher_id', rb.teacher_id,
        'teacher_name', COALESCE(ti.name, 'Unknown'),
        'student_id', rb.student_id,
        'student_name', si.name,
        'instrument', si.instrument,
        'block_date', rb.block_date,
        'start_time', rb.start_time,
        'end_time', rb.end_time,
        'status', rb.status,
        'block_type', COALESCE(rb.block_type::text, 'open_time'),
        'is_recurring', rb.is_recurring,
        'checked_in', COALESCE(rb.checked_in, false),
        'teacher_tally', COALESCE(rb.teacher_tally, false),
        'fifth_week', COALESCE(rb.fifth_week, false),
        'room', CASE WHEN rb.room_id IS NOT NULL THEN COALESCE(ri.name, rb.room) ELSE rb.room END,
        'room_id', rb.room_id,
        'notes', rb.notes,
        'original_teacher_id', rb.original_teacher_id,
        'original_teacher_name', rb.original_teacher_name,
        'has_session_log', li.id IS NOT NULL,
        'session_log', CASE WHEN li.id IS NOT NULL THEN jsonb_build_object(
          'id', li.id, 'worked_on', COALESCE(li.worked_on, '{}'),
          'engagement_level', li.engagement_level, 'progress_indicator', li.progress_indicator,
          'teacher_note', li.teacher_note, 'parent_update_status', li.parent_update_status
        ) ELSE NULL END,
        'is_virtual', COALESCE(rb.is_virtual, false),
        'meet_link', rb.meet_link,
        'meet_event_id', rb.meet_event_id,
        'callout_reason', rb.callout_reason,
        'is_family_callout', COALESCE(rb.is_family_callout, false),
        'callout_id', rb.callout_id,
        'is_makeup_session', COALESCE(rb.is_makeup_session, false),
        'makeup_session_id', rb.makeup_session_id
      ) AS block
      FROM raw_blocks rb
      LEFT JOIN teacher_info ti ON ti.id = rb.teacher_id
      LEFT JOIN student_info si ON si.id = rb.student_id
      LEFT JOIN room_info ri ON ri.id = rb.room_id
      LEFT JOIN log_info li ON li.schedule_block_id = rb.id
    )
    SELECT jsonb_build_object(
      'blocks', COALESCE((SELECT jsonb_agg(e.block) FROM enriched e), '[]'::jsonb),
      'teachers', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', ti.id, 'name', ti.name, 'photo_url', ti.photo_url) ORDER BY ti.name) FROM teacher_info ti), '[]'::jsonb),
      'timeSlots', COALESCE((SELECT jsonb_agg(DISTINCT rb.start_time ORDER BY rb.start_time) FROM raw_blocks rb), '[]'::jsonb)
    ) INTO result;
  END IF;

  RETURN result;
END;
$function$;

