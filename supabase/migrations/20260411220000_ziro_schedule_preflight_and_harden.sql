-- =============================================================================
-- Ziro schedule moves: read-only preflight + hardened execute (overlap safety,
-- room conflicts, cross-teacher ack for studio_director, optional partial apply).
-- =============================================================================

CREATE OR REPLACE FUNCTION public._ziro_schedule_move_analyze_move(
  p_tenant_id uuid,
  p_src_id uuid,
  p_tgt_id uuid,
  p_exp_student uuid,
  p_role text,
  p_allowed_location_ids uuid[],
  p_move_index int,
  p_override_ack jsonb,
  p_mode text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $an$
DECLARE
  v_src record;
  v_tgt record;
  v_dur_src interval;
  v_dur_tgt interval;
  v_ack_cross boolean;
  v_elevated boolean := p_role IN ('owner', 'admin', 'company_director');
BEGIN
  IF p_mode NOT IN ('preflight', 'execute') THEN
    RETURN jsonb_build_object(
      'classification', 'blocked',
      'reason_code', 'internal',
      'message', 'Invalid analyzer mode'
    );
  END IF;

  SELECT * INTO v_src FROM schedule_blocks WHERE id = p_src_id AND tenant_id = p_tenant_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'classification', 'blocked',
      'reason_code', 'source_not_found',
      'message', format('Source block %s not found', p_src_id)
    );
  END IF;

  SELECT * INTO v_tgt FROM schedule_blocks WHERE id = p_tgt_id AND tenant_id = p_tenant_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'classification', 'blocked',
      'reason_code', 'target_not_found',
      'message', format('Target block %s not found', p_tgt_id)
    );
  END IF;

  IF p_src_id = p_tgt_id THEN
    RETURN jsonb_build_object(
      'classification', 'blocked',
      'reason_code', 'same_block',
      'message', 'Source and target block must differ'
    );
  END IF;

  IF v_src.status IS DISTINCT FROM 'booked' OR v_src.student_id IS NULL THEN
    RETURN jsonb_build_object(
      'classification', 'blocked',
      'reason_code', 'source_not_booked',
      'message', format('Source block %s is not a booked student session', p_src_id)
    );
  END IF;

  IF v_tgt.status IS DISTINCT FROM 'available' OR v_tgt.block_type IS DISTINCT FROM 'open_time' THEN
    RETURN jsonb_build_object(
      'classification', 'blocked',
      'reason_code', 'target_not_open',
      'message', format('Target block %s must be an available open slot', p_tgt_id)
    );
  END IF;

  IF v_src.block_date < CURRENT_DATE THEN
    RETURN jsonb_build_object(
      'classification', 'blocked',
      'reason_code', 'past_session',
      'message', 'Cannot move past sessions'
    );
  END IF;

  IF v_src.block_date IS DISTINCT FROM v_tgt.block_date THEN
    RETURN jsonb_build_object(
      'classification', 'blocked',
      'reason_code', 'day_mismatch',
      'message', 'Source and target must be on the same calendar day'
    );
  END IF;

  IF v_src.location_id IS DISTINCT FROM v_tgt.location_id THEN
    RETURN jsonb_build_object(
      'classification', 'blocked',
      'reason_code', 'location_mismatch',
      'message', 'Source and target must be at the same location'
    );
  END IF;

  IF p_role = 'studio_director' AND NOT (v_src.location_id = ANY(p_allowed_location_ids)) THEN
    RETURN jsonb_build_object(
      'classification', 'blocked',
      'reason_code', 'studio_director_location',
      'message', 'A block is outside your assigned locations'
    );
  END IF;

  IF p_exp_student IS NOT NULL AND v_src.student_id IS DISTINCT FROM p_exp_student THEN
    RETURN jsonb_build_object(
      'classification', 'blocked',
      'reason_code', 'stale_context',
      'message', 'Source block no longer has the expected student — refresh the schedule and try again'
    );
  END IF;

  v_dur_src := v_src.end_time::time - v_src.start_time::time;
  v_dur_tgt := v_tgt.end_time::time - v_tgt.start_time::time;
  IF v_dur_src IS DISTINCT FROM v_dur_tgt THEN
    RETURN jsonb_build_object(
      'classification', 'blocked',
      'reason_code', 'duration_mismatch',
      'message', 'Slot durations must match (30-minute grid)'
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM teacher_locations tl
    WHERE tl.teacher_id = v_tgt.teacher_id AND tl.location_id = v_tgt.location_id
  ) THEN
    RETURN jsonb_build_object(
      'classification', 'blocked',
      'reason_code', 'teacher_not_at_location',
      'message', 'Target teacher is not assigned to this location'
    );
  END IF;

  -- Would the target teacher already be teaching someone else at this time?
  IF EXISTS (
    SELECT 1 FROM schedule_blocks sb
    WHERE sb.tenant_id = p_tenant_id
      AND sb.teacher_id = v_tgt.teacher_id
      AND sb.block_date = v_tgt.block_date
      AND sb.id NOT IN (p_src_id, p_tgt_id)
      AND sb.status = 'booked'
      AND sb.student_id IS NOT NULL
      AND sb.start_time::time < v_tgt.end_time::time
      AND sb.end_time::time > v_tgt.start_time::time
  ) THEN
    RETURN jsonb_build_object(
      'classification', 'blocked',
      'reason_code', 'teacher_already_booked',
      'message', 'Target teacher already has a lesson overlapping this time slot'
    );
  END IF;

  -- Would the student already be in another lesson at this time (excluding source)?
  IF EXISTS (
    SELECT 1 FROM schedule_blocks sb
    WHERE sb.tenant_id = p_tenant_id
      AND sb.student_id = v_src.student_id
      AND sb.block_date = v_tgt.block_date
      AND sb.id <> p_src_id
      AND sb.status = 'booked'
      AND sb.start_time::time < v_tgt.end_time::time
      AND sb.end_time::time > v_tgt.start_time::time
  ) THEN
    RETURN jsonb_build_object(
      'classification', 'blocked',
      'reason_code', 'student_already_booked',
      'message', 'Student already has another lesson overlapping this time'
    );
  END IF;

  -- Room collision (when room is set on the target slot)
  IF v_tgt.room_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM schedule_blocks sb
    WHERE sb.tenant_id = p_tenant_id
      AND sb.location_id = v_tgt.location_id
      AND sb.room_id = v_tgt.room_id
      AND sb.block_date = v_tgt.block_date
      AND sb.id NOT IN (p_src_id, p_tgt_id)
      AND sb.status = 'booked'
      AND sb.start_time::time < v_tgt.end_time::time
      AND sb.end_time::time > v_tgt.start_time::time
  ) THEN
    RETURN jsonb_build_object(
      'classification', 'blocked',
      'reason_code', 'room_conflict',
      'message', 'Another booked lesson already uses this room at this time'
    );
  END IF;

  v_ack_cross := COALESCE(
    (p_override_ack->'cross_teacher') @> jsonb_build_array(p_move_index),
    false
  );

  IF v_src.teacher_id IS DISTINCT FROM v_tgt.teacher_id THEN
    IF v_elevated THEN
      RETURN jsonb_build_object(
        'classification', 'safe',
        'reason_code', null,
        'message', null,
        'flags', jsonb_build_object('cross_teacher', true)
      );
    END IF;

    IF p_role = 'studio_director' THEN
      IF p_mode = 'preflight' THEN
        RETURN jsonb_build_object(
          'classification', 'override_required',
          'reason_code', 'cross_teacher',
          'message', 'Moving to a different teacher — confirm to proceed',
          'flags', jsonb_build_object('cross_teacher', true)
        );
      END IF;

      IF v_ack_cross THEN
        RETURN jsonb_build_object(
          'classification', 'safe',
          'reason_code', null,
          'message', null,
          'flags', jsonb_build_object('cross_teacher', true)
        );
      END IF;

      RETURN jsonb_build_object(
        'classification', 'blocked',
        'reason_code', 'cross_teacher_ack_required',
        'message', 'Cross-teacher move requires confirmation (override ack missing)'
      );
    END IF;

    RETURN jsonb_build_object(
      'classification', 'blocked',
      'reason_code', 'cross_teacher_forbidden',
      'message', 'Your role cannot move lessons to another teacher'
    );
  END IF;

  RETURN jsonb_build_object(
    'classification', 'safe',
    'reason_code', null,
    'message', null,
    'flags', jsonb_build_object('cross_teacher', false)
  );
END;
$an$;

REVOKE ALL ON FUNCTION public._ziro_schedule_move_analyze_move(uuid, uuid, uuid, uuid, text, uuid[], int, jsonb, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public._ziro_schedule_move_analyze_move(uuid, uuid, uuid, uuid, text, uuid[], int, jsonb, text) FROM anon;
REVOKE ALL ON FUNCTION public._ziro_schedule_move_analyze_move(uuid, uuid, uuid, uuid, text, uuid[], int, jsonb, text) FROM authenticated;


-- -----------------------------------------------------------------------------
-- Preflight: zero writes, same auth/role rules as execute (without idempotency).
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.ziro_preflight_schedule_moves(
  p_tenant_id uuid,
  p_moves jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $pf$
DECLARE
  v_uid uuid := auth.uid();
  v_profile_id uuid;
  v_role text;
  v_allowed_location_ids uuid[] := ARRAY[]::uuid[];
  v_len int;
  v_i int;
  v_elem jsonb;
  v_src_id uuid;
  v_tgt_id uuid;
  v_exp_student uuid;
  v_row jsonb;
  v_moves jsonb := '[]'::jsonb;
  v_safe int := 0;
  v_blocked int := 0;
  v_override int := 0;
BEGIN
  IF p_moves IS NULL OR jsonb_typeof(p_moves) != 'array' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'validation', 'message', 'p_moves must be a JSON array');
  END IF;

  v_len := jsonb_array_length(p_moves);
  IF v_len < 1 OR v_len > 20 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'validation', 'message', 'Between 1 and 20 moves allowed');
  END IF;

  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'auth', 'message', 'Authentication required');
  END IF;

  SELECT p.id, lower(trim(p.role::text))
  INTO v_profile_id, v_role
  FROM profiles p
  WHERE p.id = v_uid AND p.tenant_id = p_tenant_id;

  IF v_profile_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'auth', 'message', 'Tenant membership denied');
  END IF;

  IF v_role NOT IN ('owner', 'admin', 'company_director', 'studio_director') THEN
    RETURN jsonb_build_object('ok', false, 'code', 'forbidden', 'message', 'Your role cannot analyze schedule moves');
  END IF;

  IF v_role = 'studio_director' THEN
    SELECT COALESCE(array_agg(pl.location_id ORDER BY pl.location_id), ARRAY[]::uuid[])
    INTO v_allowed_location_ids
    FROM profile_locations pl
    WHERE pl.profile_id = v_profile_id;
    IF cardinality(v_allowed_location_ids) = 0 THEN
      RETURN jsonb_build_object('ok', false, 'code', 'forbidden', 'message', 'No locations assigned to your profile');
    END IF;
  END IF;

  FOR v_i IN 0 .. v_len - 1 LOOP
    v_elem := p_moves->v_i;
    IF jsonb_typeof(v_elem) != 'object' THEN
      RETURN jsonb_build_object('ok', false, 'code', 'validation', 'message', 'Each move must be an object');
    END IF;

    v_src_id := (v_elem->>'source_block_id')::uuid;
    v_tgt_id := (v_elem->>'target_block_id')::uuid;
    IF v_src_id IS NULL OR v_tgt_id IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'code', 'validation', 'message', 'source_block_id and target_block_id required');
    END IF;

    IF v_elem ? 'expected_student_id' AND v_elem->>'expected_student_id' IS NOT NULL AND v_elem->>'expected_student_id' != '' THEN
      v_exp_student := (v_elem->>'expected_student_id')::uuid;
    ELSE
      v_exp_student := NULL;
    END IF;

    v_row := public._ziro_schedule_move_analyze_move(
      p_tenant_id,
      v_src_id,
      v_tgt_id,
      v_exp_student,
      v_role,
      v_allowed_location_ids,
      v_i,
      '{}'::jsonb,
      'preflight'
    );

    v_moves := v_moves || jsonb_build_array(
      jsonb_build_object(
        'index', v_i,
        'source_block_id', v_src_id,
        'target_block_id', v_tgt_id,
        'classification', v_row->>'classification',
        'reason_code', v_row->'reason_code',
        'message', v_row->>'message',
        'flags', COALESCE(v_row->'flags', '{}'::jsonb)
      )
    );

    IF (v_row->>'classification') = 'safe' THEN
      v_safe := v_safe + 1;
    ELSIF (v_row->>'classification') = 'override_required' THEN
      v_override := v_override + 1;
    ELSE
      v_blocked := v_blocked + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true,
    'code', 'ok',
    'moves', v_moves,
    'summary', jsonb_build_object(
      'safe_count', v_safe,
      'blocked_count', v_blocked,
      'override_required_count', v_override
    )
  );
END;
$pf$;

REVOKE ALL ON FUNCTION public.ziro_preflight_schedule_moves(uuid, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ziro_preflight_schedule_moves(uuid, jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.ziro_preflight_schedule_moves(uuid, jsonb) TO authenticated;

COMMENT ON FUNCTION public.ziro_preflight_schedule_moves IS
  'Ziro CRM: read-only conflict analysis for schedule moves (no writes).';


-- -----------------------------------------------------------------------------
-- Replace execute RPC with hardened body + partial apply + override ack.
-- -----------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.ziro_move_schedule_sessions(uuid, jsonb, text);

CREATE OR REPLACE FUNCTION public.ziro_move_schedule_sessions(
  p_tenant_id uuid,
  p_moves jsonb,
  p_idempotency_key text,
  p_override_ack jsonb DEFAULT '{}'::jsonb,
  p_apply_partial boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_uid uuid := auth.uid();
  v_profile_id uuid;
  v_role text;
  v_allowed_location_ids uuid[] := ARRAY[]::uuid[];
  v_cached jsonb;
  v_len int;
  v_i int;
  v_elem jsonb;
  v_src_id uuid;
  v_tgt_id uuid;
  v_exp_student uuid;
  v_row jsonb;
  v_all_ids uuid[];
  v_lock_count int;
  v_upd int;
  v_n int := 0;
  v_failed jsonb := '[]'::jsonb;
  v_applied jsonb := '[]'::jsonb;
  v_apply_indexes int[] := ARRAY[]::int[];
  v_idx int;
  v_mode text := 'execute';
BEGIN
  IF p_idempotency_key IS NULL OR length(trim(p_idempotency_key)) < 8 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'validation', 'message', 'idempotency_key required');
  END IF;

  IF p_moves IS NULL OR jsonb_typeof(p_moves) != 'array' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'validation', 'message', 'p_moves must be a JSON array');
  END IF;

  v_len := jsonb_array_length(p_moves);
  IF v_len < 1 OR v_len > 20 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'validation', 'message', 'Between 1 and 20 moves allowed');
  END IF;

  SELECT result INTO v_cached
  FROM public.ziro_idempotency_keys
  WHERE tenant_id = p_tenant_id
    AND action_type = 'move_schedule_sessions'
    AND idempotency_key = p_idempotency_key;
  IF FOUND THEN
    RETURN v_cached;
  END IF;

  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'auth', 'message', 'Authentication required');
  END IF;

  SELECT p.id, lower(trim(p.role::text))
  INTO v_profile_id, v_role
  FROM profiles p
  WHERE p.id = v_uid AND p.tenant_id = p_tenant_id;

  IF v_profile_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'auth', 'message', 'Tenant membership denied');
  END IF;

  IF v_role NOT IN ('owner', 'admin', 'company_director', 'studio_director') THEN
    RETURN jsonb_build_object('ok', false, 'code', 'forbidden', 'message', 'Your role cannot move schedule sessions');
  END IF;

  IF v_role = 'studio_director' THEN
    SELECT COALESCE(array_agg(pl.location_id ORDER BY pl.location_id), ARRAY[]::uuid[])
    INTO v_allowed_location_ids
    FROM profile_locations pl
    WHERE pl.profile_id = v_profile_id;
    IF cardinality(v_allowed_location_ids) = 0 THEN
      RETURN jsonb_build_object('ok', false, 'code', 'forbidden', 'message', 'No locations assigned to your profile');
    END IF;
  END IF;

  v_all_ids := ARRAY[]::uuid[];
  FOR v_i IN 0 .. v_len - 1 LOOP
    v_elem := p_moves->v_i;
    IF jsonb_typeof(v_elem) != 'object' THEN
      RETURN jsonb_build_object('ok', false, 'code', 'validation', 'message', 'Each move must be an object');
    END IF;
    v_src_id := (v_elem->>'source_block_id')::uuid;
    v_tgt_id := (v_elem->>'target_block_id')::uuid;
    IF v_src_id IS NULL OR v_tgt_id IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'code', 'validation', 'message', 'source_block_id and target_block_id required');
    END IF;
    IF v_src_id = v_tgt_id THEN
      RETURN jsonb_build_object('ok', false, 'code', 'validation', 'message', 'Source and target block must differ');
    END IF;
    v_all_ids := v_all_ids || ARRAY[v_src_id, v_tgt_id];
  END LOOP;

  IF (SELECT COUNT(*) FROM unnest(v_all_ids) AS u) <>
     (SELECT COUNT(DISTINCT u) FROM unnest(v_all_ids) AS u) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'validation', 'message', 'Duplicate block id in request');
  END IF;

  -- Classify each move (execute mode — honors p_override_ack)
  FOR v_i IN 0 .. v_len - 1 LOOP
    v_elem := p_moves->v_i;
    v_src_id := (v_elem->>'source_block_id')::uuid;
    v_tgt_id := (v_elem->>'target_block_id')::uuid;
    IF v_elem ? 'expected_student_id' AND v_elem->>'expected_student_id' IS NOT NULL AND v_elem->>'expected_student_id' != '' THEN
      v_exp_student := (v_elem->>'expected_student_id')::uuid;
    ELSE
      v_exp_student := NULL;
    END IF;

    v_row := public._ziro_schedule_move_analyze_move(
      p_tenant_id,
      v_src_id,
      v_tgt_id,
      v_exp_student,
      v_role,
      v_allowed_location_ids,
      v_i,
      COALESCE(p_override_ack, '{}'::jsonb),
      v_mode
    );

    IF (v_row->>'classification') = 'safe' THEN
      v_apply_indexes := array_append(v_apply_indexes, v_i);
    ELSIF NOT p_apply_partial THEN
      RETURN jsonb_build_object(
        'ok', false,
        'code', COALESCE(v_row->>'reason_code', 'validation'),
        'message', COALESCE(v_row->>'message', 'Move rejected'),
        'failed_index', v_i,
        'partial_available', true
      );
    ELSE
      v_failed := v_failed || jsonb_build_array(
        jsonb_build_object(
          'index', v_i,
          'source_block_id', v_src_id,
          'target_block_id', v_tgt_id,
          'reason_code', v_row->'reason_code',
          'message', v_row->>'message',
          'classification', v_row->>'classification'
        )
      );
    END IF;
  END LOOP;

  IF cardinality(v_apply_indexes) = 0 THEN
    v_cached := jsonb_build_object(
      'ok', false,
      'code', 'no_moves_applied',
      'message', 'No moves passed validation — nothing was written.',
      'failed_moves', v_failed,
      'applied_moves', '[]'::jsonb,
      'moves_applied', 0
    );
    INSERT INTO public.ziro_idempotency_keys (tenant_id, action_type, idempotency_key, profile_id, result)
    VALUES (p_tenant_id, 'move_schedule_sessions', p_idempotency_key, v_profile_id, v_cached)
    ON CONFLICT (tenant_id, action_type, idempotency_key) DO UPDATE
    SET result = EXCLUDED.result;
    RETURN v_cached;
  END IF;

  -- Lock only blocks participating in applicable moves
  v_all_ids := ARRAY[]::uuid[];
  FOREACH v_idx IN ARRAY v_apply_indexes LOOP
    v_elem := p_moves->v_idx;
    v_all_ids := v_all_ids
      || ARRAY[(v_elem->>'source_block_id')::uuid, (v_elem->>'target_block_id')::uuid];
  END LOOP;

  SELECT id FROM schedule_blocks WHERE id = ANY(v_all_ids) AND tenant_id = p_tenant_id FOR UPDATE;
  GET DIAGNOSTICS v_lock_count = ROW_COUNT;
  IF v_lock_count <> array_length(v_all_ids, 1) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'validation', 'message', 'One or more blocks not found for this tenant (after lock)');
  END IF;

  -- Re-validate under lock (race safety)
  FOREACH v_idx IN ARRAY v_apply_indexes LOOP
    v_elem := p_moves->v_idx;
    v_src_id := (v_elem->>'source_block_id')::uuid;
    v_tgt_id := (v_elem->>'target_block_id')::uuid;
    IF v_elem ? 'expected_student_id' AND v_elem->>'expected_student_id' IS NOT NULL AND v_elem->>'expected_student_id' != '' THEN
      v_exp_student := (v_elem->>'expected_student_id')::uuid;
    ELSE
      v_exp_student := NULL;
    END IF;

    v_row := public._ziro_schedule_move_analyze_move(
      p_tenant_id,
      v_src_id,
      v_tgt_id,
      v_exp_student,
      v_role,
      v_allowed_location_ids,
      v_idx,
      COALESCE(p_override_ack, '{}'::jsonb),
      v_mode
    );

    IF (v_row->>'classification') IS DISTINCT FROM 'safe' THEN
      IF NOT p_apply_partial THEN
        RETURN jsonb_build_object(
          'ok', false,
          'code', COALESCE(v_row->>'reason_code', 'stale_state'),
          'message', COALESCE(v_row->>'message', 'Move no longer valid under lock'),
          'failed_index', v_idx
        );
      END IF;

      v_failed := v_failed || jsonb_build_array(
        jsonb_build_object(
          'index', v_idx,
          'source_block_id', v_src_id,
          'target_block_id', v_tgt_id,
          'reason_code', v_row->'reason_code',
          'message', v_row->>'message',
          'classification', 'blocked',
          'phase', 'post_lock'
        )
      );
      CONTINUE;
    END IF;

    -- Paired writes are atomic per move: never leave target booked without clearing source.
    EXECUTE format('SAVEPOINT ziro_mv_%s', v_idx);
    UPDATE schedule_blocks t
    SET
      student_id = s.student_id,
      status = 'booked',
      block_type = s.block_type,
      original_teacher_id = s.original_teacher_id,
      original_teacher_name = s.original_teacher_name
    FROM schedule_blocks s
    WHERE t.id = v_tgt_id AND t.tenant_id = p_tenant_id
      AND s.id = v_src_id AND s.tenant_id = p_tenant_id;

    GET DIAGNOSTICS v_upd = ROW_COUNT;
    IF v_upd <> 1 THEN
      EXECUTE format('ROLLBACK TO SAVEPOINT ziro_mv_%s', v_idx);
      IF NOT p_apply_partial THEN
        RAISE EXCEPTION 'ziro_move_schedule_sessions: target row update failed (expected 1 row)'
          USING ERRCODE = 'P0001';
      END IF;
      v_failed := v_failed || jsonb_build_array(
        jsonb_build_object(
          'index', v_idx,
          'source_block_id', v_src_id,
          'target_block_id', v_tgt_id,
          'reason_code', 'apply_failed',
          'message', 'Target row could not be updated (concurrent change?)',
          'phase', 'apply'
        )
      );
      CONTINUE;
    END IF;

    UPDATE schedule_blocks
    SET
      student_id = NULL,
      status = 'available',
      block_type = 'open_time',
      is_recurring = false,
      original_teacher_id = NULL,
      original_teacher_name = NULL
    WHERE id = v_src_id
      AND tenant_id = p_tenant_id;

    GET DIAGNOSTICS v_upd = ROW_COUNT;
    IF v_upd <> 1 THEN
      EXECUTE format('ROLLBACK TO SAVEPOINT ziro_mv_%s', v_idx);
      IF NOT p_apply_partial THEN
        RAISE EXCEPTION 'ziro_move_schedule_sessions: source row clear failed (expected 1 row)'
          USING ERRCODE = 'P0001';
      END IF;
      v_failed := v_failed || jsonb_build_array(
        jsonb_build_object(
          'index', v_idx,
          'source_block_id', v_src_id,
          'target_block_id', v_tgt_id,
          'reason_code', 'apply_failed',
          'message', 'Source row could not be cleared — rolled back this move',
          'phase', 'apply'
        )
      );
      CONTINUE;
    END IF;

    EXECUTE format('RELEASE SAVEPOINT ziro_mv_%s', v_idx);

    v_n := v_n + 1;
    v_applied := v_applied || jsonb_build_array(
      jsonb_build_object(
        'index', v_idx,
        'source_block_id', v_src_id,
        'target_block_id', v_tgt_id
      )
    );
  END LOOP;

  IF v_n = 0 AND jsonb_array_length(v_failed) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'internal', 'message', 'No updates applied');
  END IF;

  v_cached := jsonb_build_object(
    'ok', v_n > 0,
    'code', CASE WHEN v_n > 0 THEN 'ok' ELSE 'no_moves_applied' END,
    'message',
      CASE
        WHEN jsonb_array_length(v_failed) = 0 THEN format('Moved %s session(s) on the schedule.', v_n)
        WHEN v_n > 0 THEN format('Moved %s session(s). %s move(s) could not be applied — see failed_moves.', v_n, jsonb_array_length(v_failed)::int)
        ELSE format('No sessions moved. %s move(s) failed — see failed_moves.', jsonb_array_length(v_failed)::int)
      END,
    'moves_applied', v_n,
    'applied_moves', v_applied,
    'failed_moves', v_failed
  );

  INSERT INTO public.ziro_idempotency_keys (tenant_id, action_type, idempotency_key, profile_id, result)
  VALUES (p_tenant_id, 'move_schedule_sessions', p_idempotency_key, v_profile_id, v_cached)
  ON CONFLICT (tenant_id, action_type, idempotency_key) DO UPDATE
  SET result = EXCLUDED.result;

  RETURN v_cached;
END;
$fn$;

REVOKE ALL ON FUNCTION public.ziro_move_schedule_sessions(uuid, jsonb, text, jsonb, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ziro_move_schedule_sessions(uuid, jsonb, text, jsonb, boolean) FROM anon;
GRANT EXECUTE ON FUNCTION public.ziro_move_schedule_sessions(uuid, jsonb, text, jsonb, boolean) TO authenticated;

-- Back-compat: 3-arg calls from older clients
CREATE OR REPLACE FUNCTION public.ziro_move_schedule_sessions(
  p_tenant_id uuid,
  p_moves jsonb,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $wrap$
  SELECT public.ziro_move_schedule_sessions(
    p_tenant_id,
    p_moves,
    p_idempotency_key,
    '{}'::jsonb,
    true
  );
$wrap$;

REVOKE ALL ON FUNCTION public.ziro_move_schedule_sessions(uuid, jsonb, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ziro_move_schedule_sessions(uuid, jsonb, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.ziro_move_schedule_sessions(uuid, jsonb, text) TO authenticated;

COMMENT ON FUNCTION public.ziro_move_schedule_sessions(uuid, jsonb, text, jsonb, boolean) IS
  'Ziro CRM: move booked blocks onto open_time targets with conflict checks, optional partial apply, override ack.';
