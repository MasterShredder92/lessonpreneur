-- Central duplicate detection for ALL student inserts (lead conversion + direct Add Student + API).
-- AFTER INSERT trigger matches convert_lead_to_student rules: same tenant, family, normalized name,
-- another active student (oldest match = candidate). Sets counts_toward_family_tier = false and opens student_duplicate_reviews.
-- Lead conversion still sets ai_context->converted_from_lead so trigger can attach lead_id to the review.

CREATE OR REPLACE FUNCTION public.students_after_insert_duplicate_review()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_candidate_id uuid;
  v_lead_id uuid;
BEGIN
  IF NEW.status IS DISTINCT FROM 'active'::student_status THEN
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM student_duplicate_reviews r
    WHERE r.new_student_id = NEW.id
      AND r.status = 'pending'
  ) THEN
    RETURN NEW;
  END IF;

  SELECT s.id INTO v_candidate_id
  FROM students s
  WHERE s.tenant_id = NEW.tenant_id
    AND s.family_id = NEW.family_id
    AND s.status = 'active'::student_status
    AND s.id <> NEW.id
    AND lower(trim(s.first_name)) = lower(trim(NEW.first_name))
    AND lower(trim(coalesce(s.last_name, ''))) = lower(trim(coalesce(NEW.last_name, '')))
  ORDER BY s.created_at ASC, s.id ASC
  LIMIT 1;

  IF v_candidate_id IS NULL THEN
    RETURN NEW;
  END IF;

  v_lead_id := NULL;
  IF NEW.ai_context IS NOT NULL AND (NEW.ai_context ? 'converted_from_lead') THEN
    BEGIN
      v_lead_id := (NEW.ai_context->>'converted_from_lead')::uuid;
    EXCEPTION
      WHEN OTHERS THEN
        v_lead_id := NULL;
    END;
  END IF;

  UPDATE students
  SET counts_toward_family_tier = false
  WHERE id = NEW.id
    AND tenant_id = NEW.tenant_id;

  INSERT INTO student_duplicate_reviews (
    tenant_id, family_id, lead_id, new_student_id, candidate_existing_student_id, reason, status
  ) VALUES (
    NEW.tenant_id,
    NEW.family_id,
    v_lead_id,
    NEW.id,
    v_candidate_id,
    'same_family_same_normalized_name',
    'pending'
  );

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS students_duplicate_review_after_insert ON public.students;
CREATE TRIGGER students_duplicate_review_after_insert
  AFTER INSERT ON public.students
  FOR EACH ROW
  EXECUTE PROCEDURE public.students_after_insert_duplicate_review();

COMMENT ON FUNCTION public.students_after_insert_duplicate_review IS
  'On insert of an active student, if another active student in the same family shares the same normalized name, queue manual duplicate review and exclude the new row from tier counts until resolved.';

-- convert_lead_to_student: rely on trigger for duplicate rows + tier flag; build RPC response from student_duplicate_reviews.
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
  v_review_id UUID;
  v_dup_candidate_id UUID;
  v_dup_payload jsonb := 'null'::jsonb;
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

  IF p_family_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM families WHERE id = p_family_id AND tenant_id = v_caller_tenant_id) THEN
      RAISE EXCEPTION 'Family not found';
    END IF;
    v_family_id := p_family_id;
  ELSE
    IF v_email_norm IS NOT NULL AND v_email_norm <> '' THEN
      SELECT f.id INTO v_family_id
      FROM families f
      WHERE f.tenant_id = v_caller_tenant_id
        AND f.primary_email IS NOT NULL
        AND lower(trim(f.primary_email)) = v_email_norm
      LIMIT 1;
    END IF;

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

  INSERT INTO students (
    tenant_id, family_id, location_id, teacher_id,
    first_name, last_name, instrument, status,
    start_date, blocks_per_week, rate_per_session,
    notes, ai_context, intake_submission_id,
    counts_toward_family_tier
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
    v_lead.intake_submission_id,
    true
  )
  RETURNING id INTO v_student_id;

  SELECT r.id, r.candidate_existing_student_id
  INTO v_review_id, v_dup_candidate_id
  FROM student_duplicate_reviews r
  WHERE r.tenant_id = v_caller_tenant_id
    AND r.new_student_id = v_student_id
    AND r.status = 'pending'
  ORDER BY r.created_at DESC
  LIMIT 1;

  IF v_review_id IS NOT NULL THEN
    v_dup_payload := jsonb_build_object(
      'review_id', v_review_id,
      'candidate_student_id', v_dup_candidate_id,
      'new_student_id', v_student_id,
      'reason', 'same_family_same_normalized_name'
    );
  END IF;

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
    'possible_duplicate_review', v_dup_payload
  );

EXCEPTION WHEN OTHERS THEN
  RAISE;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.convert_lead_to_student(uuid, uuid, text, uuid, uuid, boolean, numeric, integer) TO anon, authenticated, service_role;
