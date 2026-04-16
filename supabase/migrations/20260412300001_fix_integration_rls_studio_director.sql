-- =============================================================================
-- Fix integration_configs, api_tokens, webhook_events RLS policies
-- to include studio_director role.
--
-- Root cause: All three tables had policies allowing only
-- owner/admin/company_director. Studio directors were getting 403 (42501)
-- on any PostgREST call to these tables.
--
-- Fix: Add 'studio_director' to the role array in each policy.
-- Teacher/parent/student remain blocked.
-- =============================================================================

-- ── integration_configs ─────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Owner/admin manage integrations" ON public.integration_configs;

CREATE POLICY "Owner/admin/director manage integrations"
  ON public.integration_configs
  FOR ALL
  TO authenticated
  USING (
    tenant_id = '00000000-0000-0000-0000-000000000001'::uuid
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.tenant_id = integration_configs.tenant_id
        AND profiles.role = ANY (ARRAY[
          'owner'::user_role,
          'admin'::user_role,
          'company_director'::user_role,
          'studio_director'::user_role
        ])
    )
  )
  WITH CHECK (
    tenant_id = '00000000-0000-0000-0000-000000000001'::uuid
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.tenant_id = integration_configs.tenant_id
        AND profiles.role = ANY (ARRAY[
          'owner'::user_role,
          'admin'::user_role,
          'company_director'::user_role,
          'studio_director'::user_role
        ])
    )
  );

-- ── api_tokens ──────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Owner/admin manage api_tokens" ON public.api_tokens;

CREATE POLICY "Owner/admin/director manage api_tokens"
  ON public.api_tokens
  FOR ALL
  TO authenticated
  USING (
    tenant_id = '00000000-0000-0000-0000-000000000001'::uuid
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.tenant_id = api_tokens.tenant_id
        AND profiles.role = ANY (ARRAY[
          'owner'::user_role,
          'admin'::user_role,
          'company_director'::user_role,
          'studio_director'::user_role
        ])
    )
  )
  WITH CHECK (
    tenant_id = '00000000-0000-0000-0000-000000000001'::uuid
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.tenant_id = api_tokens.tenant_id
        AND profiles.role = ANY (ARRAY[
          'owner'::user_role,
          'admin'::user_role,
          'company_director'::user_role,
          'studio_director'::user_role
        ])
    )
  );

-- ── webhook_events (read policy) ────────────────────────────────────────────

DROP POLICY IF EXISTS "Owner/admin read webhook_events" ON public.webhook_events;

CREATE POLICY "Owner/admin/director read webhook_events"
  ON public.webhook_events
  FOR SELECT
  TO authenticated
  USING (
    tenant_id = '00000000-0000-0000-0000-000000000001'::uuid
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.tenant_id = webhook_events.tenant_id
        AND profiles.role = ANY (ARRAY[
          'owner'::user_role,
          'admin'::user_role,
          'company_director'::user_role,
          'studio_director'::user_role
        ])
    )
  );

-- Note: "Service insert webhook_events" policy is untouched — it allows
-- service_role/edge-function inserts with tenant_id check only.
