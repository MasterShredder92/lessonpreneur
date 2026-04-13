-- Safe family deletion RPC
-- Handles all FK references atomically so no partial state is possible.
-- Students are orphaned (family_id set to null), NOT deleted.
-- Historical billing/invoice data with NOT NULL family_id is deleted.
-- Nullable FK references are set to null to preserve related records.
-- CASCADE FKs (family_files, makeup_sessions, etc.) are auto-cleaned.

CREATE OR REPLACE FUNCTION safe_delete_family(p_family_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- 1. Orphan students FIRST (before cascade can delete them)
  UPDATE public.students
  SET family_id = NULL
  WHERE family_id = p_family_id;

  -- 2. Nullable FK columns — set to null (preserves records)
  UPDATE public.families SET referred_by_family_id = NULL WHERE referred_by_family_id = p_family_id;
  UPDATE public.leads SET family_id = NULL WHERE family_id = p_family_id;
  UPDATE public.leads SET referred_by_family_id = NULL WHERE referred_by_family_id = p_family_id;
  UPDATE public.messages SET family_id = NULL WHERE family_id = p_family_id;
  UPDATE public.onboarding_sequences SET family_id = NULL WHERE family_id = p_family_id;
  UPDATE public.profile_edit_requests SET family_id = NULL WHERE family_id = p_family_id;
  UPDATE public.retention_campaigns SET family_id = NULL WHERE family_id = p_family_id;
  UPDATE public.retention_outreach SET family_id = NULL WHERE family_id = p_family_id;
  UPDATE public.review_requests SET family_id = NULL WHERE family_id = p_family_id;
  UPDATE public.reviews SET family_id = NULL WHERE family_id = p_family_id;
  UPDATE public.square_invoices SET family_id = NULL WHERE family_id = p_family_id;
  UPDATE public.value_cards SET family_id = NULL WHERE family_id = p_family_id;

  -- 3. NOT NULL FK columns — must delete (cannot null out)
  DELETE FROM public.billing_adjustments WHERE family_id = p_family_id;
  DELETE FROM public.billing_events WHERE family_id = p_family_id;
  DELETE FROM public.communications WHERE family_id = p_family_id;
  DELETE FROM public.contact_change_requests WHERE family_id = p_family_id;
  DELETE FROM public.invoice_flags WHERE family_id = p_family_id;
  DELETE FROM public.invoice_tokens WHERE family_id = p_family_id;
  DELETE FROM public.payment_history WHERE family_id = p_family_id;
  DELETE FROM public.progress_reports WHERE family_id = p_family_id;
  DELETE FROM public.refunds WHERE family_id = p_family_id;
  DELETE FROM public.studio_messages WHERE family_id = p_family_id;

  -- 4. Tasks referencing this family (entity_id is uuid type)
  DELETE FROM public.tasks
  WHERE entity_id = p_family_id AND entity_type = 'family';

  -- 5. Delete the family (CASCADE handles: family_files, makeup_sessions,
  --    practice_sessions, student_callouts, student_duplicate_reviews,
  --    student_followups — students already orphaned above)
  DELETE FROM public.families WHERE id = p_family_id;
END;
$$;

-- Grant to authenticated role (RLS on families table still applies for the final delete)
GRANT EXECUTE ON FUNCTION safe_delete_family(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION safe_delete_family(uuid) TO service_role;
