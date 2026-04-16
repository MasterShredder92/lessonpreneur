-- Immutable intake audit trail + link from leads.
-- Service role (edge functions) bypasses RLS; staff read via policies below.

CREATE TABLE IF NOT EXISTS public.intake_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,
  location_id uuid REFERENCES public.locations (id) ON DELETE SET NULL,
  source text NOT NULL DEFAULT 'website_form',
  form_version text NOT NULL DEFAULT '1',
  raw_payload jsonb NOT NULL,
  lead_ids uuid[] NOT NULL DEFAULT '{}',
  converted_student_id uuid REFERENCES public.students (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS intake_submissions_tenant_created_idx
  ON public.intake_submissions (tenant_id, created_at DESC);

COMMENT ON TABLE public.intake_submissions IS 'Append-only raw form payloads; source of truth for original intake.';

-- Prevent mutating raw_payload (service role included — use DEFINER maintenance if ever required)
CREATE OR REPLACE FUNCTION public.intake_submissions_forbid_raw_change()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.raw_payload IS DISTINCT FROM OLD.raw_payload THEN
    RAISE EXCEPTION 'intake_submissions.raw_payload is immutable';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_intake_submissions_immutable ON public.intake_submissions;
CREATE TRIGGER trg_intake_submissions_immutable
  BEFORE UPDATE ON public.intake_submissions
  FOR EACH ROW
  EXECUTE PROCEDURE public.intake_submissions_forbid_raw_change();

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS intake_submission_id uuid REFERENCES public.intake_submissions (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS leads_intake_submission_id_idx
  ON public.leads (intake_submission_id)
  WHERE intake_submission_id IS NOT NULL;

ALTER TABLE public.intake_submissions ENABLE ROW LEVEL SECURITY;

-- Authenticated staff: read submissions for their tenant (profiles.tenant_id)
CREATE POLICY intake_submissions_select_same_tenant ON public.intake_submissions
  FOR SELECT
  TO authenticated
  USING (
    tenant_id = (
      SELECT p.tenant_id FROM public.profiles p WHERE p.id = auth.uid() LIMIT 1
    )
  );

-- Optional: allow updating only linkage fields (not raw_payload — trigger blocks payload)
CREATE POLICY intake_submissions_update_linkage ON public.intake_submissions
  FOR UPDATE
  TO authenticated
  USING (
    tenant_id = (
      SELECT p.tenant_id FROM public.profiles p WHERE p.id = auth.uid() LIMIT 1
    )
  )
  WITH CHECK (
    tenant_id = (
      SELECT p.tenant_id FROM public.profiles p WHERE p.id = auth.uid() LIMIT 1
    )
  );

-- No INSERT/DELETE for authenticated — edge uses service_role only for inserts
