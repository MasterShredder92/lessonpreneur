-- ziro_agents: visibility + business context for Ziro Work / CRM catalog vs ephemeral temp agents.
-- Seeds six music-school specialist agents per tenant (idempotent via invocation_rules.catalog_slug).

ALTER TABLE public.ziro_agents
  ADD COLUMN IF NOT EXISTS is_visible_in_ui boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS is_archived boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS business_context text NOT NULL DEFAULT 'music_school';

COMMENT ON COLUMN public.ziro_agents.is_visible_in_ui IS 'When false, hidden from Ziro Control catalog and CRM page-binding pickers.';
COMMENT ON COLUMN public.ziro_agents.is_archived IS 'Soft-archive; hidden from default Ziro Work lists.';
COMMENT ON COLUMN public.ziro_agents.business_context IS 'music_school = school OS specialists; ephemeral = runtime temp agents.';

-- Runtime temporary agents should not crowd the music-school catalog UI.
UPDATE public.ziro_agents
SET
  business_context = 'ephemeral',
  is_visible_in_ui = false
WHERE lifecycle_type = 'temporary';

-- Idempotent catalog seed (one row per tenant per catalog_slug).
INSERT INTO public.ziro_agents (
  tenant_id,
  name,
  purpose,
  status,
  owner_type,
  lifecycle_type,
  invocation_rules,
  usage_triggers,
  auto_use_by_star,
  is_visible_in_ui,
  is_archived,
  business_context,
  created_by
)
SELECT
  t.id,
  v.name,
  v.purpose,
  'active',
  'system',
  'persistent',
  jsonb_build_object('catalog_slug', v.catalog_slug),
  to_jsonb(string_to_array(v.usage_csv, '|')),
  true,
  true,
  false,
  'music_school',
  NULL::uuid
FROM public.tenants t
CROSS JOIN (
  VALUES
    (
      'enrollment_coordinator',
      'Enrollment Coordinator',
      'Trial conversion, pipeline follow-ups, and new member enrollment for the music school.',
      'lead|trial|enrollment|pipeline|prospect|sales'
    ),
    (
      'scheduling_placement',
      'Scheduling / Placement',
      'Lesson placement, calendar utilization, capacity, and schedule changes.',
      'schedule|placement|calendar|capacity'
    ),
    (
      'retention',
      'Retention',
      'At-risk students, engagement, and churn prevention.',
      'retention|churn|engagement|at-risk'
    ),
    (
      'reactivation',
      'Reactivation',
      'Win-back lapsed students and dormant households.',
      'win-back|reactivation|lapsed'
    ),
    (
      'billing_recovery',
      'Billing / Recovery',
      'Tuition, invoices, AR, collections, and payment recovery.',
      'bill|invoice|payment|collection|tuition|ar'
    ),
    (
      'parent_communication',
      'Parent Communication',
      'Household messaging, portal comms, and parent-facing coordination.',
      'parent|family|communication|portal|household'
    )
) AS v(catalog_slug, name, purpose, usage_csv)
WHERE NOT EXISTS (
  SELECT 1
  FROM public.ziro_agents za
  WHERE za.tenant_id = t.id
    AND coalesce(za.invocation_rules::jsonb->>'catalog_slug', '') = v.catalog_slug
);

-- Optional repair: system persistent rows that match catalog names but lack catalog_slug.
UPDATE public.ziro_agents za
SET
  invocation_rules = coalesce(za.invocation_rules::jsonb, '{}'::jsonb) || jsonb_build_object('catalog_slug', m.catalog_slug),
  is_visible_in_ui = true,
  is_archived = false,
  business_context = 'music_school'
FROM (
  VALUES
    ('Enrollment Coordinator', 'enrollment_coordinator'),
    ('Scheduling / Placement', 'scheduling_placement'),
    ('Retention', 'retention'),
    ('Reactivation', 'reactivation'),
    ('Billing / Recovery', 'billing_recovery'),
    ('Parent Communication', 'parent_communication')
) AS m(name, catalog_slug)
WHERE trim(za.name) = m.name
  AND coalesce(za.invocation_rules::jsonb->>'catalog_slug', '') = ''
  AND za.lifecycle_type = 'persistent'
  AND za.owner_type = 'system';
