-- Run in SQL Editor against the project. Paste results into PR / ticket as proof.
-- Expected after hardening: RLS enabled on lp_prospects; policies listed; anon not over-privileged.

SELECT
  c.relname AS table_name,
  c.relrowsecurity AS rls_enabled
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relname = 'lp_prospects';

SELECT polname, polcmd, polroles::regrole[], pg_get_expr(polqual, polrelid) AS using_expr
FROM pg_policy
WHERE polrelid = 'public.lp_prospects'::regclass;
