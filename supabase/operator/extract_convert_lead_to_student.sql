-- Run in Supabase SQL Editor (production or staging with same RPC).
-- Copy the result of pg_get_functiondef into a new migration:
--   supabase/migrations/YYYYMMDDHHMMSS_convert_lead_to_student_from_live.sql
-- Then add GRANT lines if the audit query shows non-default ACLs.

SELECT pg_get_functiondef(p.oid) AS ddl
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'convert_lead_to_student'
  AND pg_function_is_visible(p.oid);

-- Optional: see grants / owner
SELECT p.proname,
       pg_get_userbyid(p.proowner) AS owner,
       p.proacl::text AS acl
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'convert_lead_to_student';
