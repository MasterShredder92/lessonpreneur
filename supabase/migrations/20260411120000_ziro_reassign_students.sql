-- =============================================================================
-- Ziro: reassign students to a primary instructor (students.teacher_id) +
-- move matching future booked schedule blocks that still use the prior primary.
-- Auth: owner, admin, company_director, studio_director only.
-- Idempotency: ziro_idempotency_keys (per-tenant action + key → cached jsonb result).
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.ziro_idempotency_keys (
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  action_type text NOT NULL,
  idempotency_key text NOT NULL,
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  result jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, action_type, idempotency_key)
);

CREATE INDEX IF NOT EXISTS ziro_idempotency_keys_created_at_idx
  ON public.ziro_idempotency_keys (created_at DESC);

ALTER TABLE public.ziro_idempotency_keys ENABLE ROW LEVEL SECURITY;

-- No direct client access; RPC only (SECURITY DEFINER).
REVOKE ALL ON public.ziro_idempotency_keys FROM PUBLIC;
REVOKE ALL ON public.ziro_idempotency_keys FROM anon;
REVOKE ALL ON public.ziro_idempotency_keys FROM authenticated;

COMMENT ON TABLE public.ziro_idempotency_keys IS
  'Caches idempotent Ziro CRM action results (replay-safe).';

-- -----------------------------------------------------------------------------
-- RPC
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ziro_reassign_students_to_teacher(
  p_tenant_id uuid,
  p_student_ids uuid[],
  p_target_teacher_id uuid,
  p_expected_prior_teacher_id uuid,
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
  v_n_students int;
  v_n_blocks int;
  v_target record;
  sid uuid;
  srec record;
BEGIN
  IF p_idempotency_key IS NULL OR length(trim(p_idempotency_key)) < 8 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'validation', 'message', 'idempotency_key required');
  END IF;

  IF p_student_ids IS NULL OR cardinality(p_student_ids) = 0 OR cardinality(p_student_ids) > 50 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'validation', 'message', 'Between 1 and 50 student ids required');
  END IF;

  SELECT result INTO v_cached
  FROM public.ziro_idempotency_keys
  WHERE tenant_id = p_tenant_id
    AND action_type = 'reassign_students'
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
    RETURN jsonb_build_object('ok', false, 'code', 'forbidden', 'message', 'Your role cannot reassign students');
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

  SELECT * INTO v_target
  FROM teachers t
  WHERE t.id = p_target_teacher_id AND t.tenant_id = p_tenant_id AND t.is_active = true;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'validation', 'message', 'Target teacher not found or inactive');
  END IF;

  -- Validate every student + target can teach at student location
  FOREACH sid IN ARRAY p_student_ids
  LOOP
    SELECT s.id, s.tenant_id, s.location_id, s.teacher_id, s.status
    INTO srec
    FROM students s
    WHERE s.id = sid;

    IF NOT FOUND THEN
      RETURN jsonb_build_object('ok', false, 'code', 'validation', 'message', format('Student %s not found', sid));
    END IF;

    IF srec.tenant_id IS DISTINCT FROM p_tenant_id THEN
      RETURN jsonb_build_object('ok', false, 'code', 'validation', 'message', 'Student tenant mismatch');
    END IF;

    IF srec.status IS DISTINCT FROM 'active' THEN
      RETURN jsonb_build_object('ok', false, 'code', 'validation', 'message', format('Student %s is not active', sid));
    END IF;

    IF v_role = 'studio_director' AND NOT (srec.location_id = ANY(v_allowed_location_ids)) THEN
      RETURN jsonb_build_object('ok', false, 'code', 'forbidden', 'message', 'A student is outside your assigned locations');
    END IF;

    IF p_expected_prior_teacher_id IS NOT NULL THEN
      IF srec.teacher_id IS DISTINCT FROM p_expected_prior_teacher_id THEN
        RETURN jsonb_build_object(
          'ok', false,
          'code', 'stale_context',
          'message', 'A student''s current teacher does not match the expected value — refresh and try again'
        );
      END IF;
    END IF;

    IF srec.teacher_id IS NOT DISTINCT FROM p_target_teacher_id THEN
      CONTINUE;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM teacher_locations tl
      WHERE tl.teacher_id = p_target_teacher_id AND tl.location_id = srec.location_id
    ) THEN
      RETURN jsonb_build_object(
        'ok', false,
        'code', 'validation',
        'message', 'Target teacher is not assigned to one of the student locations'
      );
    END IF;
  END LOOP;

  -- Move future booked blocks that still match the student's *prior* primary teacher on the block.
  UPDATE schedule_blocks sb
  SET teacher_id = p_target_teacher_id
  FROM students s
  WHERE sb.student_id = s.id
    AND s.id = ANY(p_student_ids)
    AND sb.tenant_id = p_tenant_id
    AND s.tenant_id = p_tenant_id
    AND sb.status = 'booked'
    AND sb.block_date >= CURRENT_DATE
    AND sb.teacher_id = s.teacher_id
    AND (p_expected_prior_teacher_id IS NULL OR s.teacher_id = p_expected_prior_teacher_id)
    AND sb.block_type IN ('student_session', 'first_day', 'last_day', 'meet_greet', 'sub');

  GET DIAGNOSTICS v_n_blocks = ROW_COUNT;

  UPDATE students s
  SET teacher_id = p_target_teacher_id
  WHERE s.id = ANY(p_student_ids)
    AND s.tenant_id = p_tenant_id
    AND s.status = 'active'
    AND (p_expected_prior_teacher_id IS NULL OR s.teacher_id = p_expected_prior_teacher_id)
    AND s.teacher_id IS DISTINCT FROM p_target_teacher_id;

  GET DIAGNOSTICS v_n_students = ROW_COUNT;

  v_cached := jsonb_build_object(
    'ok', true,
    'code', 'ok',
    'message', format(
      'Reassigned %s student(s); updated %s future booked block(s) tied to the prior primary teacher.',
      v_n_students,
      v_n_blocks
    ),
    'updated_students', v_n_students,
    'updated_blocks', v_n_blocks
  );

  INSERT INTO public.ziro_idempotency_keys (tenant_id, action_type, idempotency_key, profile_id, result)
  VALUES (p_tenant_id, 'reassign_students', p_idempotency_key, v_profile_id, v_cached)
  ON CONFLICT (tenant_id, action_type, idempotency_key) DO UPDATE
  SET result = EXCLUDED.result;

  RETURN v_cached;
END;
$fn$;

REVOKE ALL ON FUNCTION public.ziro_reassign_students_to_teacher(uuid, uuid[], uuid, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ziro_reassign_students_to_teacher(uuid, uuid[], uuid, uuid, text) FROM anon;

GRANT EXECUTE ON FUNCTION public.ziro_reassign_students_to_teacher(uuid, uuid[], uuid, uuid, text) TO authenticated;

COMMENT ON FUNCTION public.ziro_reassign_students_to_teacher IS
  'Ziro CRM: reassign primary instructor + future booked blocks aligned with prior primary. Studio-director scoped.';
