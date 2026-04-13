-- Manual-review-first duplicate handling: never auto-merge students by name.
-- Family matching (email/phone) stays automatic. Ambiguous same-name siblings get a review queue
-- and the newer student is excluded from family tier counts until resolved.

ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS counts_toward_family_tier boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.students.counts_toward_family_tier IS 'When false, student is excluded from multi-student / family rate tier counts until duplicate review is resolved (keep separate or merge).';

CREATE TABLE IF NOT EXISTS public.student_duplicate_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,
  family_id uuid NOT NULL REFERENCES public.families (id) ON DELETE CASCADE,
  lead_id uuid REFERENCES public.leads (id) ON DELETE SET NULL,
  new_student_id uuid NOT NULL REFERENCES public.students (id) ON DELETE CASCADE,
  candidate_existing_student_id uuid NOT NULL REFERENCES public.students (id) ON DELETE CASCADE,
  reason text NOT NULL DEFAULT 'same_family_same_normalized_name',
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'resolved_keep_separate', 'resolved_merged', 'cancelled')),
  resolved_at timestamptz,
  resolved_by uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS student_duplicate_reviews_tenant_pending_idx
  ON public.student_duplicate_reviews (tenant_id, status)
  WHERE status = 'pending';

COMMENT ON TABLE public.student_duplicate_reviews IS 'Staff must resolve possible duplicate roster rows (same family + same name) before tier counting includes the newer student.';

ALTER TABLE public.student_duplicate_reviews ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenant_staff_duplicate_reviews" ON public.student_duplicate_reviews;
CREATE POLICY "tenant_staff_duplicate_reviews" ON public.student_duplicate_reviews
  FOR ALL
  USING (tenant_id = get_user_tenant_id())
  WITH CHECK (tenant_id = get_user_tenant_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.student_duplicate_reviews TO authenticated;
GRANT ALL ON public.student_duplicate_reviews TO service_role;

-- Replace conversion: always INSERT student; flag possible duplicate for manual review (no auto-merge).
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
  v_candidate_id UUID;
  v_student RECORD;
  v_block RECORD;
  v_caller_tenant_id UUID;
  v_email_norm text;
  v_phone_digits text;
  v_review_id UUID;
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

  -- Detect possible duplicate (same family + same normalized name) BEFORE insert — used only for review, not merge
  SELECT s.id INTO v_candidate_id
  FROM students s
  WHERE s.tenant_id = v_caller_tenant_id
    AND s.family_id = v_family_id
    AND s.status = 'active'::student_status
    AND lower(trim(s.first_name)) = lower(trim(v_lead.first_name))
    AND lower(trim(coalesce(s.last_name, ''))) = lower(trim(coalesce(v_lead.last_name, '')))
  ORDER BY s.created_at ASC
  LIMIT 1;

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
    CASE WHEN v_candidate_id IS NOT NULL THEN false ELSE true END
  )
  RETURNING id INTO v_student_id;

  IF v_candidate_id IS NOT NULL THEN
    INSERT INTO student_duplicate_reviews (
      tenant_id, family_id, lead_id, new_student_id, candidate_existing_student_id, reason, status
    ) VALUES (
      v_caller_tenant_id,
      v_family_id,
      p_lead_id,
      v_student_id,
      v_candidate_id,
      'same_family_same_normalized_name',
      'pending'
    )
    RETURNING id INTO v_review_id;

    v_dup_payload := jsonb_build_object(
      'review_id', v_review_id,
      'candidate_student_id', v_candidate_id,
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

-- Resolve a pending review: keep both as distinct billing students, or merge newer into canonical roster row.
CREATE OR REPLACE FUNCTION public.resolve_student_duplicate_review(
  p_review_id uuid,
  p_resolution text,
  p_canonical_student_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_tenant uuid;
  v_review RECORD;
  v_new uuid;
  v_cand uuid;
BEGIN
  v_tenant := get_user_tenant_id();
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'No tenant context';
  END IF;

  SELECT * INTO v_review
  FROM student_duplicate_reviews
  WHERE id = p_review_id AND tenant_id = v_tenant AND status = 'pending';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Review not found or already resolved';
  END IF;

  v_new := v_review.new_student_id;
  v_cand := v_review.candidate_existing_student_id;

  IF p_resolution = 'keep_separate' THEN
    UPDATE students
    SET counts_toward_family_tier = true
    WHERE id = v_new AND tenant_id = v_tenant;

    UPDATE student_duplicate_reviews
    SET status = 'resolved_keep_separate',
        resolved_at = now(),
        resolved_by = auth.uid()
    WHERE id = p_review_id;

    -- Tier recalculation: call apply_family_rate_tier from app after resolve if available on project.
    RETURN jsonb_build_object('ok', true, 'resolution', 'keep_separate', 'family_id', v_review.family_id);

  ELSIF p_resolution = 'merge_into_existing' THEN
    IF p_canonical_student_id IS NULL OR p_canonical_student_id <> v_cand THEN
      RAISE EXCEPTION 'Canonical student must match the suggested existing student for merge';
    END IF;

    UPDATE leads
    SET converted_student_id = v_cand
    WHERE converted_student_id = v_new AND tenant_id = v_tenant;

    UPDATE schedule_blocks
    SET student_id = v_cand
    WHERE student_id = v_new AND tenant_id = v_tenant;

    UPDATE students
    SET
      status = 'former',
      exit_reason = 'merged_duplicate_review',
      end_date = COALESCE(end_date, CURRENT_DATE),
      notes = trim(coalesce(notes, '') || E'\n\n[Merged into student ' || v_cand::text || ' on ' || to_char(now(), 'YYYY-MM-DD') || ']')
    WHERE id = v_new AND tenant_id = v_tenant;

    UPDATE student_duplicate_reviews
    SET status = 'resolved_merged',
        resolved_at = now(),
        resolved_by = auth.uid()
    WHERE id = p_review_id;

    RETURN jsonb_build_object('ok', true, 'resolution', 'merge_into_existing', 'kept_student_id', v_cand, 'family_id', v_review.family_id);

  ELSE
    RAISE EXCEPTION 'Invalid resolution (use keep_separate or merge_into_existing)';
  END IF;
END;
$function$;

COMMENT ON FUNCTION public.resolve_student_duplicate_review IS 'Staff resolves possible duplicate: keep_separate enables tier counting for both; merge_into_existing retires duplicate student row and points leads/blocks to canonical.';

GRANT EXECUTE ON FUNCTION public.resolve_student_duplicate_review(uuid, text, uuid) TO authenticated, service_role;
