-- Audit: list RLS policies for CRM + LP prospect tables (proof for PR / closure).
-- Use this output to confirm what is live, then ensure the same statements exist in migrations.

SELECT
  n.nspname AS schema,
  c.relname AS table_name,
  c.relrowsecurity AS rls_enabled,
  c.relforcerowsecurity AS rls_forced,
  pol.polname AS policy_name,
  CASE pol.polcmd
    WHEN 'r' THEN 'SELECT'
    WHEN 'a' THEN 'INSERT'
    WHEN 'w' THEN 'UPDATE'
    WHEN 'd' THEN 'DELETE'
    WHEN '*' THEN 'ALL'
  END AS cmd,
  pg_get_expr(pol.polqual, pol.polrelid) AS using_expr,
  pg_get_expr(pol.polwithcheck, pol.polrelid) AS with_check
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
LEFT JOIN pg_policy pol ON pol.polrelid = c.oid
WHERE n.nspname = 'public'
  AND c.relname IN ('leads', 'families', 'students', 'lp_prospects')
ORDER BY c.relname, pol.polname;
