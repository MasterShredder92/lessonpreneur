-- Lead → student conversion: resolve family by email/phone (not only manual pick)
-- and prevent duplicate active student rows for the same child across multiple inquiries.

CREATE OR REPLACE FUNCTION public.normalize_phone_digits(p_phone text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT NULLIF(regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g'), '');
$$;

COMMENT ON FUNCTION public.normalize_phone_digits(text) IS 'Strip non-digits for matching parent phone across forms.';

CREATE OR REPLACE FUNCTION public.convert_lead_to_student(
  p_lead_id uuid,
  p_family_id uuid DEFAULT NULL::uuid,
  p_family_name text DEFAULT NULL::text,
  p_teacher_id uuid DEFAULT NULL::uuid,
  p_block_id uuid DEFAULT NULL::uuid,
  p_recurring boolean DEFAULT false,
  p_rate numeric DEFAULT 45.00,
  p_blocks_per_week integer DEFAULT 1
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_lead RECORD;
  v_family_id UUID;
  v_student_id UUID;
  v_student RECORD;
  v_block RECORD;
  v_caller_tenant_id UUID;
  v_email_norm text;
  v_phone_digits text;
  v_merged_existing boolean := false;
BEGIN
  v_caller_tenant_id := get_user_tenant_id();
  IF v_caller_tenant_id IS NULL THEN
    RAISE EXCEPTION 'No tenant context — cannot convert lead';
  END IF;

  SELECT * INTO v_lead FROM leads WHERE id = p_lead_id AND tenant_id = v_caller_tenant_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lead not found';
  END IF;
  IF v_lead.stage = 'enrolled' THEN
    RAISE EXCEPTION 'Lead is already enrolled';
  END IF;
  IF v_lead.converted_student_id IS NOT NULL THEN
    RAISE EXCEPTION 'Lead already converted';
  END IF;

  v_email_norm := NULLIF(lower(trim(coalesce(v_lead.email, ''))), '');
  v_phone_digits := public.normalize_phone_digits(v_lead.phone);

  -- ── Resolve family ──
  IF p_family_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM families WHERE id = p_family_id AND tenant_id = v_caller_tenant_id) THEN
      RAISE EXCEPTION 'Family not found';
    END IF;
    v_family_id := p_family_id;
  ELSE
    -- Match existing family by email (strongest)
    IF v_email_norm IS NOT NULL AND v_email_norm <> '' THEN
      SELECT f.id INTO v_family_id
      FROM families f
      WHERE f.tenant_id = v_caller_tenant_id
        AND f.primary_email IS NOT NULL
        AND lower(trim(f.primary_email)) = v_email_norm
      LIMIT 1;
    END IF;

    -- Then by normalized phone (same tenant)
    IF v_family_id IS NULL AND v_phone_digits IS NOT NULL AND length(v_phone_digits) >= 10 THEN
      SELECT f.id INTO v_family_id
      FROM families f
      WHERE f.tenant_id = v_caller_tenant_id
        AND public.normalize_phone_digits(f.primary_phone) = v_phone_digits
      LIMIT 1;
    END IF;

    IF v_family_id IS NULL THEN
      INSERT INTO families (tenant_id, name, primary_contact_name, primary_email, primary_phone, is_military)
      VALUES (
        v_caller_tenant_id,
        COALESCE(p_family_name, 'The ' || COALESCE(v_lead.last_name, v_lead.first_name) || ' Family'),
        v_lead.parent_name,
        v_lead.email,
        v_lead.phone,
        v_lead.is_military
      )
      RETURNING id INTO v_family_id;
    END IF;
  END IF;

  -- ── Duplicate student guard: same family + same name as an active student ──
  SELECT s.id INTO v_student_id
  FROM students s
  WHERE s.tenant_id = v_caller_tenant_id
    AND s.family_id = v_family_id
    AND s.status = 'active'
    AND lower(trim(s.first_name)) = lower(trim(v_lead.first_name))
    AND lower(trim(coalesce(s.last_name, ''))) = lower(trim(coalesce(v_lead.last_name, '')))
  ORDER BY s.created_at ASC
  LIMIT 1;

  IF v_student_id IS NOT NULL THEN
    v_merged_existing := true;
    -- Roster location follows this conversion (latest inquiry wins — ops can edit in Students)
    UPDATE students
    SET
      location_id = v_lead.location_id,
      teacher_id = COALESCE(p_teacher_id, teacher_id),
      notes = CASE
        WHEN v_lead.goals IS NOT NULL AND trim(v_lead.goals) <> ''
        THEN trim(coalesce(notes, '') || E'\n\n[Inquiry merge ' || to_char(now(), 'YYYY-MM-DD') || '] ' || v_lead.goals)
        ELSE notes
      END
    WHERE id = v_student_id AND tenant_id = v_caller_tenant_id;

    IF v_lead.intake_submission_id IS NOT NULL THEN
      UPDATE public.intake_submissions
      SET converted_student_id = v_student_id
      WHERE id = v_lead.intake_submission_id
        AND tenant_id = v_caller_tenant_id
        AND converted_student_id IS NULL;
    END IF;
  ELSE
    INSERT INTO students (
      tenant_id, family_id, location_id, teacher_id,
      first_name, last_name, instrument, status,
      start_date, blocks_per_week, rate_per_session,
      notes, ai_context, intake_submission_id
    ) VALUES (
      v_caller_tenant_id,
      v_family_id,
      v_lead.location_id,
      p_teacher_id,
      v_lead.first_name,
      COALESCE(v_lead.last_name, ''),
      COALESCE(v_lead.instrument, 'unknown'),
      'active',
      CURRENT_DATE,
      p_blocks_per_week,
      p_rate,
      v_lead.goals,
      jsonb_build_object(
        'converted_from_lead', p_lead_id,
        'lead_source', v_lead.source,
        'lead_created', v_lead.created_at,
        'preferred_days', v_lead.preferred_days,
        'preferred_times', v_lead.preferred_times,
        'intake_submission_id', v_lead.intake_submission_id
      ),
      v_lead.intake_submission_id
    )
    RETURNING id INTO v_student_id;

    IF v_lead.intake_submission_id IS NOT NULL THEN
      UPDATE public.intake_submissions
      SET converted_student_id = v_student_id
      WHERE id = v_lead.intake_submission_id
        AND tenant_id = v_caller_tenant_id
        AND converted_student_id IS NULL;
    END IF;
  END IF;

  IF p_block_id IS NOT NULL THEN
    SELECT * INTO v_block
    FROM schedule_blocks
    WHERE id = p_block_id AND tenant_id = v_caller_tenant_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Block not found';
    END IF;
    IF v_block.status != 'available' THEN
      RAISE EXCEPTION 'Block is not available';
    END IF;

    UPDATE schedule_blocks
    SET student_id = v_student_id, status = 'booked', is_recurring = p_recurring
    WHERE id = p_block_id AND tenant_id = v_caller_tenant_id;

    IF p_recurring THEN
      UPDATE schedule_blocks
      SET student_id = v_student_id, status = 'booked', is_recurring = true
      WHERE teacher_id = v_block.teacher_id
        AND tenant_id = v_caller_tenant_id
        AND start_time = v_block.start_time
        AND status = 'available'
        AND block_date > v_block.block_date
        AND EXTRACT(DOW FROM block_date) = EXTRACT(DOW FROM v_block.block_date);
    END IF;
  END IF;

  UPDATE leads
  SET stage = 'enrolled',
      converted_student_id = v_student_id,
      family_id = v_family_id,
      updated_at = now()
  WHERE id = p_lead_id AND tenant_id = v_caller_tenant_id;

  SELECT * INTO v_student FROM students WHERE id = v_student_id;

  RETURN jsonb_build_object(
    'student_id', v_student_id,
    'family_id', v_family_id,
    'student_name', v_student.first_name || ' ' || v_student.last_name,
    'instrument', v_student.instrument,
    'lead_stage', 'enrolled',
    'intake_submission_id', v_lead.intake_submission_id,
    'merged_existing_student', v_merged_existing
  );

EXCEPTION WHEN OTHERS THEN
  RAISE;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.convert_lead_to_student(uuid, uuid, text, uuid, uuid, boolean, numeric, integer) TO anon, authenticated, service_role;
