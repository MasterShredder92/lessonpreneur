-- Repair music-school catalog agents that lost invocation_rules.catalog_slug (e.g. only keywords).
-- Idempotent: only fills empty catalog_slug; merges into existing jsonb.

UPDATE public.ziro_agents za
SET
  invocation_rules = coalesce(za.invocation_rules::jsonb, '{}'::jsonb) || jsonb_build_object('catalog_slug', m.catalog_slug)
FROM (
  VALUES
    ('Enrollment Coordinator', 'enrollment_coordinator'),
    ('Scheduling / Placement', 'scheduling_placement'),
    ('Retention', 'retention'),
    ('Reactivation', 'reactivation'),
    ('Billing / Recovery', 'billing_recovery'),
    ('Parent Communication', 'parent_communication')
) AS m(name, catalog_slug)
WHERE za.business_context = 'music_school'
  AND trim(za.name) = m.name
  AND coalesce(za.invocation_rules::jsonb->>'catalog_slug', '') = '';
