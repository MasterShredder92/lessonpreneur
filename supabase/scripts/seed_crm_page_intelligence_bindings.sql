-- Optional: backfill ziro_page_intelligence_bindings for ALL tenants that have ≥1 active agent.
-- Run in Supabase SQL editor (prod) after review. Does not change schema.
-- Prefers filling only when primary_agent_id is NULL on conflict (preserves manual picks).
--
-- Prefer using the app: Ziro Work → Ziro Control → "Assign agents to core CRM pages"
-- (uses hint-based assignment + upsert).

INSERT INTO public.ziro_page_intelligence_bindings (tenant_id, page_key, primary_agent_id)
SELECT
  t.id AS tenant_id,
  v.page_key,
  (
    SELECT za.id
    FROM public.ziro_agents za
    WHERE za.tenant_id = t.id
      AND za.status = 'active'
    ORDER BY
      CASE WHEN za.lifecycle_type = 'persistent' THEN 0 ELSE 1 END,
      za.name
    LIMIT 1
  ) AS primary_agent_id
FROM public.tenants t
CROSS JOIN (
  VALUES
    ('dashboard'),
    ('leads'),
    ('schedule'),
    ('students'),
    ('families'),
    ('retention'),
    ('teachers'),
    ('payroll'),
    ('recruitment'),
    ('billing'),
    ('financials'),
    ('integrations'),
    ('settings'),
    ('zirowork'),
    ('ziro_insights'),
    ('workflows'),
    ('analytics'),
    ('import'),
    ('platform'),
    ('performance'),
    ('skills_standalone')
) AS v(page_key)
WHERE EXISTS (
  SELECT 1 FROM public.ziro_agents za2
  WHERE za2.tenant_id = t.id AND za2.status = 'active'
)
ON CONFLICT (tenant_id, page_key) DO UPDATE SET
  primary_agent_id = COALESCE(
    ziro_page_intelligence_bindings.primary_agent_id,
    EXCLUDED.primary_agent_id
  ),
  updated_at = CASE
    WHEN ziro_page_intelligence_bindings.primary_agent_id IS NULL THEN now()
    ELSE ziro_page_intelligence_bindings.updated_at
  END;
