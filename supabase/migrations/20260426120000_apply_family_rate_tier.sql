-- Family rate tier source of truth: families.rate_tier (cents), constrained to 4500 / 4000 / 3750.
-- Mirrors frontend calculatePreviewRate (useFamilyRate.ts): volume 16+ sessions, then multi/military/8+ sessions, else standard.
-- Respects families.rate_tier_override (manual lock — no auto change while true).

CREATE OR REPLACE FUNCTION public.apply_family_rate_tier(p_family_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_tenant uuid;
  v_override boolean;
  v_military boolean;
  v_active integer;
  v_sessions integer;
  v_tier integer;
BEGIN
  SELECT tenant_id, rate_tier_override, COALESCE(is_military, false)
  INTO v_tenant, v_override, v_military
  FROM public.families
  WHERE id = p_family_id;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF v_override THEN
    RETURN;
  END IF;

  SELECT
    COUNT(*)::integer,
    COALESCE(SUM(COALESCE(s.sessions_per_month, 4)), 0)::integer
  INTO v_active, v_sessions
  FROM public.students s
  WHERE s.family_id = p_family_id
    AND s.tenant_id = v_tenant
    AND s.status = 'active'::student_status
    AND s.counts_toward_family_tier = true;

  -- Align with calculatePreviewRate(activeStudents, totalSessions, isMilitary)
  IF v_sessions >= 16 THEN
    v_tier := 3750;
  ELSIF v_active >= 2 OR v_sessions >= 8 OR v_military THEN
    v_tier := 4000;
  ELSE
    v_tier := 4500;
  END IF;

  UPDATE public.families
  SET rate_tier = v_tier
  WHERE id = p_family_id
    AND tenant_id = v_tenant
    AND NOT rate_tier_override;
END;
$function$;

COMMENT ON FUNCTION public.apply_family_rate_tier(uuid) IS
  'Recalculates families.rate_tier from active students that count toward tier (status=active, counts_toward_family_tier=true), sessions_per_month sum, and is_military. Skips when rate_tier_override.';

GRANT EXECUTE ON FUNCTION public.apply_family_rate_tier(uuid) TO authenticated, service_role;

-- Keep family tier in sync whenever roster/tier inputs change (merge, deactivate, sessions, duplicate flags, family moves).
CREATE OR REPLACE FUNCTION public.trg_students_apply_family_rate_tier()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.apply_family_rate_tier(OLD.family_id);
    RETURN OLD;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.family_id IS DISTINCT FROM NEW.family_id THEN
    PERFORM public.apply_family_rate_tier(OLD.family_id);
  END IF;
  PERFORM public.apply_family_rate_tier(NEW.family_id);
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS students_apply_family_rate_tier_after ON public.students;
CREATE TRIGGER students_apply_family_rate_tier_after
  AFTER INSERT OR DELETE OR UPDATE OF status, sessions_per_month, counts_toward_family_tier, family_id
  ON public.students
  FOR EACH ROW
  EXECUTE PROCEDURE public.trg_students_apply_family_rate_tier();

COMMENT ON FUNCTION public.trg_students_apply_family_rate_tier IS
  'After student roster/tier eligibility changes, recalculate families.rate_tier for affected family (both old and new family_id on move).';

-- Military flag and clearing manual override should re-run automatic tier rules.
CREATE OR REPLACE FUNCTION public.trg_families_apply_family_rate_tier()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  IF TG_OP <> 'UPDATE' THEN
    RETURN NEW;
  END IF;
  IF OLD.is_military IS DISTINCT FROM NEW.is_military THEN
    PERFORM public.apply_family_rate_tier(NEW.id);
  ELSIF OLD.rate_tier_override IS TRUE AND NEW.rate_tier_override IS FALSE THEN
    PERFORM public.apply_family_rate_tier(NEW.id);
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS families_apply_family_rate_tier_after ON public.families;
CREATE TRIGGER families_apply_family_rate_tier_after
  AFTER UPDATE OF is_military, rate_tier_override
  ON public.families
  FOR EACH ROW
  EXECUTE PROCEDURE public.trg_families_apply_family_rate_tier();

COMMENT ON FUNCTION public.trg_families_apply_family_rate_tier IS
  'When is_military changes or manual rate override is cleared, recalculate automatic tier.';

-- One-time backfill for existing rows (idempotent per family).
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN SELECT id FROM public.families
  LOOP
    PERFORM public.apply_family_rate_tier(r.id);
  END LOOP;
END;
$$;

-- Ensure tier recalculates in the same transaction as duplicate resolution (merge path updates student status).
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

    PERFORM public.apply_family_rate_tier(v_review.family_id);
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

    PERFORM public.apply_family_rate_tier(v_review.family_id);
    RETURN jsonb_build_object('ok', true, 'resolution', 'merge_into_existing', 'kept_student_id', v_cand, 'family_id', v_review.family_id);

  ELSE
    RAISE EXCEPTION 'Invalid resolution (use keep_separate or merge_into_existing)';
  END IF;
END;
$function$;
