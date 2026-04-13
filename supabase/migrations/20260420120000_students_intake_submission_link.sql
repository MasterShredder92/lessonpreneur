-- Permanent student ↔ immutable intake link + RPC updates intake_submissions on conversion.

ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS intake_submission_id uuid REFERENCES public.intake_submissions (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS students_intake_submission_id_idx
  ON public.students (intake_submission_id)
  WHERE intake_submission_id IS NOT NULL;

COMMENT ON COLUMN public.students.intake_submission_id IS 'Website intake row this student originated from (immutable snapshot in intake_submissions).';

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

  IF p_family_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM families WHERE id = p_family_id AND tenant_id = v_caller_tenant_id) THEN
      RAISE EXCEPTION 'Family not found';
    END IF;
    v_family_id := p_family_id;
  ELSE
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
      updated_at = now()
  WHERE id = p_lead_id AND tenant_id = v_caller_tenant_id;

  SELECT * INTO v_student FROM students WHERE id = v_student_id;

  RETURN jsonb_build_object(
    'student_id', v_student_id,
    'family_id', v_family_id,
    'student_name', v_student.first_name || ' ' || v_student.last_name,
    'instrument', v_student.instrument,
    'lead_stage', 'enrolled',
    'intake_submission_id', v_lead.intake_submission_id
  );

EXCEPTION WHEN OTHERS THEN
  RAISE;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.convert_lead_to_student(uuid, uuid, text, uuid, uuid, boolean, numeric, integer) TO anon, authenticated, service_role;
