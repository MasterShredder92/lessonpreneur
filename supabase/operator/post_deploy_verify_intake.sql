-- Post-deploy checks after: migrations applied + edge functions deployed.
-- Attach query results to PR as proof (no "works in UI" without DB rows).

-- 1) intake_submissions present and wired
SELECT EXISTS (
  SELECT 1 FROM information_schema.tables
  WHERE table_schema = 'public' AND table_name = 'intake_submissions'
) AS intake_submissions_exists;

SELECT id, tenant_id, source, array_length(lead_ids, 1) AS lead_count, created_at
FROM public.intake_submissions
ORDER BY created_at DESC
LIMIT 5;

-- 2) Leads link back (after a test form submit)
SELECT id, intake_submission_id, stage, created_at
FROM public.leads
WHERE intake_submission_id IS NOT NULL
ORDER BY created_at DESC
LIMIT 5;

-- 3) RPC exists in database
SELECT proname, pg_get_function_identity_arguments(p.oid) AS args
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND proname = 'convert_lead_to_student';

-- 4) Policy coverage (same as extract_policies_audit — expect rows if RLS used)
SELECT c.relname AS table_name, c.relrowsecurity AS rls_on, COUNT(pol.polname) AS policy_count
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
LEFT JOIN pg_policy pol ON pol.polrelid = c.oid
WHERE n.nspname = 'public'
  AND c.relname IN ('leads', 'families', 'students', 'lp_prospects')
GROUP BY c.relname, c.relrowsecurity
ORDER BY c.relname;
