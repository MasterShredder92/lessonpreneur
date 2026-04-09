-- Run against target DB (staging first). Save output to evidence/grants-before.txt then grants-after.txt.

-- BEFORE migration apply
SELECT grantee, privilege_type, is_grantable
FROM information_schema.routine_privileges
WHERE routine_schema = 'public' AND routine_name = 'get_star_context'
ORDER BY grantee, privilege_type;

-- AFTER migration apply (same query; save as grants-after.txt)
SELECT grantee, privilege_type, is_grantable
FROM information_schema.routine_privileges
WHERE routine_schema = 'public' AND routine_name = 'get_star_context'
ORDER BY grantee, privilege_type;

-- Optional: helper policy function grants
SELECT grantee, privilege_type
FROM information_schema.routine_privileges
WHERE routine_schema = 'public' AND routine_name = 'star_apply_star_context_policy'
ORDER BY grantee, privilege_type;
