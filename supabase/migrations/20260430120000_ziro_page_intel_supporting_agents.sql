-- Additional specialist agents bound to the same operating surface (Star + UI).
-- Application is responsible for de-duplicating against primary_agent_id.

ALTER TABLE public.ziro_page_intelligence_bindings
  ADD COLUMN IF NOT EXISTS supporting_agent_ids uuid[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN public.ziro_page_intelligence_bindings.supporting_agent_ids IS
  'Extra ziro_agents ids consulted for this page_key; primary remains in primary_agent_id.';
