-- =============================================================================
-- Ziro: move booked lesson(s) to open slot(s) — mirrors Schedule executeDrop.
-- Same calendar day, same location, same slot duration; auth + studio_director scope.
-- Idempotency: ziro_idempotency_keys.action_type = 'move_schedule_sessions'
-- =============================================================================

CREATE OR REPLACE FUNCTION public.ziro_move_schedule_sessions(
  p_tenant_id uuid,
  p_moves jsonb,
  p_idempotency_key text
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
  v_allowed_location_ids uuid[];
  v_cached jsonb;
  v_n int;
  v_i int;
  v_len int;
  v_elem jsonb;
  v_src_id uuid;
  v_tgt_id uuid;
  v_exp_student uuid;
  v_src record;
  v_tgt record;
  v_dur_src interval;
  v_dur_tgt interval;
  v_all_ids uuid[];
  v_lock_count int;
  v_upd int;
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
  ELSE
    v_allowed_location_ids := NULL;
  END IF;

  -- Collect all block ids for locking + uniqueness
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

  SELECT id FROM schedule_blocks WHERE id = ANY(v_all_ids) AND tenant_id = p_tenant_id FOR UPDATE;
  GET DIAGNOSTICS v_lock_count = ROW_COUNT;
  IF v_lock_count <> array_length(v_all_ids, 1) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'validation', 'message', 'One or more blocks not found for this tenant');
  END IF;

  -- Phase 1: validate all moves (no mutations) — avoids partial failure leaving half-applied updates.
  FOR v_i IN 0 .. v_len - 1 LOOP
    v_elem := p_moves->v_i;
    v_src_id := (v_elem->>'source_block_id')::uuid;
    v_tgt_id := (v_elem->>'target_block_id')::uuid;
    IF v_elem ? 'expected_student_id' AND v_elem->>'expected_student_id' IS NOT NULL AND v_elem->>'expected_student_id' != '' THEN
      v_exp_student := (v_elem->>'expected_student_id')::uuid;
    ELSE
      v_exp_student := NULL;
    END IF;

    SELECT * INTO v_src FROM schedule_blocks WHERE id = v_src_id AND tenant_id = p_tenant_id;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('ok', false, 'code', 'validation', 'message', format('Source block %s not found', v_src_id));
    END IF;
    SELECT * INTO v_tgt FROM schedule_blocks WHERE id = v_tgt_id AND tenant_id = p_tenant_id;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('ok', false, 'code', 'validation', 'message', format('Target block %s not found', v_tgt_id));
    END IF;

    IF v_src.status IS DISTINCT FROM 'booked' OR v_src.student_id IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'code', 'validation', 'message', format('Source block %s is not a booked student session', v_src_id));
    END IF;

    IF v_tgt.status IS DISTINCT FROM 'available' OR v_tgt.block_type IS DISTINCT FROM 'open_time' THEN
      RETURN jsonb_build_object('ok', false, 'code', 'validation', 'message', format('Target block %s must be an available open slot', v_tgt_id));
    END IF;

    IF v_src.block_date < CURRENT_DATE THEN
      RETURN jsonb_build_object('ok', false, 'code', 'validation', 'message', 'Cannot move past sessions');
    END IF;

    IF v_src.block_date IS DISTINCT FROM v_tgt.block_date THEN
      RETURN jsonb_build_object('ok', false, 'code', 'validation', 'message', 'Source and target must be on the same calendar day');
    END IF;

    IF v_src.location_id IS DISTINCT FROM v_tgt.location_id THEN
      RETURN jsonb_build_object('ok', false, 'code', 'validation', 'message', 'Source and target must be at the same location');
    END IF;

    IF v_role = 'studio_director' AND NOT (v_src.location_id = ANY(v_allowed_location_ids)) THEN
      RETURN jsonb_build_object('ok', false, 'code', 'forbidden', 'message', 'A block is outside your assigned locations');
    END IF;

    IF v_exp_student IS NOT NULL AND v_src.student_id IS DISTINCT FROM v_exp_student THEN
      RETURN jsonb_build_object(
        'ok', false,
        'code', 'stale_context',
        'message', 'Source block no longer has the expected student — refresh the schedule and try again'
      );
    END IF;

    v_dur_src := v_src.end_time::time - v_src.start_time::time;
    v_dur_tgt := v_tgt.end_time::time - v_tgt.start_time::time;
    IF v_dur_src IS DISTINCT FROM v_dur_tgt THEN
      RETURN jsonb_build_object('ok', false, 'code', 'validation', 'message', 'Slot durations must match (30-minute grid)');
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM teacher_locations tl
      WHERE tl.teacher_id = v_tgt.teacher_id AND tl.location_id = v_tgt.location_id
    ) THEN
      RETURN jsonb_build_object('ok', false, 'code', 'validation', 'message', 'Target teacher is not assigned to this location');
    END IF;
  END LOOP;

  -- Phase 2: apply all moves
  v_n := 0;
  FOR v_i IN 0 .. v_len - 1 LOOP
    v_elem := p_moves->v_i;
    v_src_id := (v_elem->>'source_block_id')::uuid;
    v_tgt_id := (v_elem->>'target_block_id')::uuid;

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
      RAISE EXCEPTION 'ziro_move_schedule_sessions: target row update failed (expected 1 row)'
        USING ERRCODE = 'P0001';
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
      RAISE EXCEPTION 'ziro_move_schedule_sessions: source row clear failed (expected 1 row)'
        USING ERRCODE = 'P0001';
    END IF;

    v_n := v_n + 1;
  END LOOP;

  v_cached := jsonb_build_object(
    'ok', true,
    'code', 'ok',
    'message', format('Moved %s session(s) on the schedule.', v_n),
    'moves_applied', v_n
  );

  INSERT INTO public.ziro_idempotency_keys (tenant_id, action_type, idempotency_key, profile_id, result)
  VALUES (p_tenant_id, 'move_schedule_sessions', p_idempotency_key, v_profile_id, v_cached)
  ON CONFLICT (tenant_id, action_type, idempotency_key) DO UPDATE
  SET result = EXCLUDED.result;

  RETURN v_cached;
END;
$fn$;

REVOKE ALL ON FUNCTION public.ziro_move_schedule_sessions(uuid, jsonb, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ziro_move_schedule_sessions(uuid, jsonb, text) FROM anon;

GRANT EXECUTE ON FUNCTION public.ziro_move_schedule_sessions(uuid, jsonb, text) TO authenticated;

COMMENT ON FUNCTION public.ziro_move_schedule_sessions IS
  'Ziro CRM: move booked blocks onto open_time targets (same day, location, duration).';
