-- =============================================================================
-- ziro_page_intelligence_bindings
-- Tenant-scoped mapping from operating-surface keys to primary specialist agents.
-- Batch 1: optional overrides; app falls back to keyword heuristics when null.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.ziro_page_intelligence_bindings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  page_key text NOT NULL,
  primary_agent_id uuid REFERENCES public.ziro_agents(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ziro_page_intelligence_bindings_page_key_nonempty CHECK (char_length(trim(page_key)) > 0),
  CONSTRAINT ziro_page_intelligence_bindings_tenant_page UNIQUE (tenant_id, page_key)
);

CREATE INDEX IF NOT EXISTS ziro_page_intelligence_bindings_tenant
  ON public.ziro_page_intelligence_bindings (tenant_id);

COMMENT ON TABLE public.ziro_page_intelligence_bindings IS
  'Links Ziro Work operating surfaces (page_key) to a primary ziro_agents row; RLS tenant-scoped.';

ALTER TABLE public.ziro_page_intelligence_bindings ENABLE ROW LEVEL SECURITY;

CREATE POLICY ziro_page_intelligence_bindings_select_tenant
  ON public.ziro_page_intelligence_bindings
  FOR SELECT USING (
    tenant_id = (SELECT p.tenant_id FROM public.profiles p WHERE p.id = auth.uid() LIMIT 1)
  );

CREATE POLICY ziro_page_intelligence_bindings_insert_tenant
  ON public.ziro_page_intelligence_bindings
  FOR INSERT WITH CHECK (
    tenant_id = (SELECT p.tenant_id FROM public.profiles p WHERE p.id = auth.uid() LIMIT 1)
  );

CREATE POLICY ziro_page_intelligence_bindings_update_tenant
  ON public.ziro_page_intelligence_bindings
  FOR UPDATE USING (
    tenant_id = (SELECT p.tenant_id FROM public.profiles p WHERE p.id = auth.uid() LIMIT 1)
  );

CREATE POLICY ziro_page_intelligence_bindings_delete_tenant
  ON public.ziro_page_intelligence_bindings
  FOR DELETE USING (
    tenant_id = (SELECT p.tenant_id FROM public.profiles p WHERE p.id = auth.uid() LIMIT 1)
  );
