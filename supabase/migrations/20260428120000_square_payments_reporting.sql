-- Square read-only financial facts: Payments + Refunds APIs → LP reporting layer.
-- Tenant-scoped; RLS for authenticated read; edge functions use service_role (bypass RLS).

-- ═══════════════════════════════════════════════════════════════════════════
-- square_payments_fact — one row per Square Payment (idempotent upsert)
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.square_payments_fact (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  square_payment_id text NOT NULL,
  square_location_id text,
  location_id uuid REFERENCES public.locations (id) ON DELETE SET NULL,
  status text NOT NULL,
  source_type text,
  tender_bucket text NOT NULL,
  amount_money_cents bigint,
  tip_money_cents bigint,
  total_money_cents bigint,
  application_fee_money_cents bigint,
  processing_fee_total_cents bigint NOT NULL DEFAULT 0,
  refunded_money_cents bigint,
  net_total_cents bigint,
  reporting_date date NOT NULL,
  created_at_square timestamptz,
  updated_at_square timestamptz,
  raw_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  synced_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT square_payments_fact_tenant_payment UNIQUE (tenant_id, square_payment_id)
);

CREATE INDEX IF NOT EXISTS idx_square_payments_fact_tenant_reporting
  ON public.square_payments_fact (tenant_id, reporting_date DESC);

CREATE INDEX IF NOT EXISTS idx_square_payments_fact_tenant_loc_reporting
  ON public.square_payments_fact (tenant_id, location_id, reporting_date DESC);

CREATE INDEX IF NOT EXISTS idx_square_payments_fact_tender
  ON public.square_payments_fact (tenant_id, tender_bucket, reporting_date DESC);

COMMENT ON TABLE public.square_payments_fact IS 'Read-only sync from Square List Payments. reporting_date = UTC date of payment created_at (document if merchant TZ needed later).';

-- ═══════════════════════════════════════════════════════════════════════════
-- square_refunds_fact — one row per PaymentRefund (List Refunds API)
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.square_refunds_fact (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  square_refund_id text NOT NULL,
  square_payment_id text NOT NULL,
  square_location_id text,
  location_id uuid REFERENCES public.locations (id) ON DELETE SET NULL,
  status text,
  amount_money_cents bigint NOT NULL,
  reporting_date date NOT NULL,
  created_at_square timestamptz,
  updated_at_square timestamptz,
  raw_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  synced_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT square_refunds_fact_tenant_refund UNIQUE (tenant_id, square_refund_id)
);

CREATE INDEX IF NOT EXISTS idx_square_refunds_fact_tenant_reporting
  ON public.square_refunds_fact (tenant_id, reporting_date DESC);

CREATE INDEX IF NOT EXISTS idx_square_refunds_fact_payment
  ON public.square_refunds_fact (tenant_id, square_payment_id);

COMMENT ON TABLE public.square_refunds_fact IS 'Read-only sync from Square GET /v2/refunds. Returns metric ties to refund created_at.';

-- ═══════════════════════════════════════════════════════════════════════════
-- RLS — financial facts: owner + admin + company_director (all locations);
-- studio_director = assigned locations only. Teachers/students/parents: no access.
-- ═══════════════════════════════════════════════════════════════════════════
ALTER TABLE public.square_payments_fact ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.square_refunds_fact ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenant_select_square_payments_fact" ON public.square_payments_fact;
DROP POLICY IF EXISTS "square_payments_fact_owner_admin_company_select" ON public.square_payments_fact;
DROP POLICY IF EXISTS "square_payments_fact_studio_director_select" ON public.square_payments_fact;

CREATE POLICY "square_payments_fact_owner_admin_company_select" ON public.square_payments_fact
  FOR SELECT TO authenticated
  USING (
    tenant_id = get_user_tenant_id()
    AND get_user_role() IN ('owner'::user_role, 'admin'::user_role, 'company_director'::user_role)
  );

CREATE POLICY "square_payments_fact_studio_director_select" ON public.square_payments_fact
  FOR SELECT TO authenticated
  USING (
    tenant_id = get_user_tenant_id()
    AND get_user_role() = 'studio_director'::user_role
    AND location_id IS NOT NULL
    AND location_id = ANY (get_user_location_ids())
  );

DROP POLICY IF EXISTS "tenant_select_square_refunds_fact" ON public.square_refunds_fact;
DROP POLICY IF EXISTS "square_refunds_fact_owner_admin_company_select" ON public.square_refunds_fact;
DROP POLICY IF EXISTS "square_refunds_fact_studio_director_select" ON public.square_refunds_fact;

CREATE POLICY "square_refunds_fact_owner_admin_company_select" ON public.square_refunds_fact
  FOR SELECT TO authenticated
  USING (
    tenant_id = get_user_tenant_id()
    AND get_user_role() IN ('owner'::user_role, 'admin'::user_role, 'company_director'::user_role)
  );

CREATE POLICY "square_refunds_fact_studio_director_select" ON public.square_refunds_fact
  FOR SELECT TO authenticated
  USING (
    tenant_id = get_user_tenant_id()
    AND get_user_role() = 'studio_director'::user_role
    AND location_id IS NOT NULL
    AND location_id = ANY (get_user_location_ids())
  );

REVOKE ALL ON public.square_payments_fact FROM PUBLIC;
REVOKE ALL ON public.square_refunds_fact FROM PUBLIC;
REVOKE ALL ON public.square_payments_fact FROM anon;
REVOKE ALL ON public.square_refunds_fact FROM anon;
GRANT SELECT ON public.square_payments_fact TO authenticated;
GRANT SELECT ON public.square_refunds_fact TO authenticated;
GRANT ALL ON public.square_payments_fact TO service_role;
GRANT ALL ON public.square_refunds_fact TO service_role;
