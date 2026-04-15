-- Primary skill attachments for music-school catalog agents (ziro_agent_skills).
-- Deterministic catalog_slug → ziro_skills.key; idempotent on (agent_id, skill_id).
-- Must match `primary_skill_key` in src/lib/ziro/musicSchoolAgentCatalog.ts.

INSERT INTO public.ziro_agent_skills (tenant_id, agent_id, skill_id, is_primary)
SELECT
  za.tenant_id,
  za.id,
  s.id,
  true
FROM public.ziro_agents za
INNER JOIN public.ziro_skills s
  ON s.tenant_id = za.tenant_id
 AND s.is_active = true
 AND s.key = CASE coalesce(za.invocation_rules::jsonb->>'catalog_slug', '')
   WHEN 'enrollment_coordinator' THEN 'lead_followup'
   WHEN 'scheduling_placement' THEN 'schedule_optimizer'
   WHEN 'retention' THEN 'churn_analysis'
   WHEN 'reactivation' THEN 'morning_briefing'
   WHEN 'billing_recovery' THEN 'billing_insight'
   WHEN 'parent_communication' THEN 'parent_comms'
   ELSE NULL
 END
WHERE za.business_context = 'music_school'
  AND coalesce(za.invocation_rules::jsonb->>'catalog_slug', '') <> ''
  AND s.key IS NOT NULL
ON CONFLICT ON CONSTRAINT ziro_agent_skills_agent_id_skill_id_key DO NOTHING;
