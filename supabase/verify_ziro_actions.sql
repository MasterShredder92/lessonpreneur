-- Run in Supabase SQL Editor (or psql) against the Lessonpreneur project after migrations.
-- Purpose: confirm Ziro RPCs exist and grants; full behavioral tests need an authenticated JWT (use the app or Postman).
--
-- Apply migrations first (including 20260411220000_ziro_schedule_preflight_and_harden.sql).
-- CLI: set SUPABASE_ACCESS_TOKEN or run `supabase login`, then `npx supabase db push` (or your linked workflow).

-- 1) Functions present
-- Note: ziro_move_schedule_sessions may list two rows (3-arg wrapper + 5-arg body) — expected.
SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN (
    'ziro_reassign_students_to_teacher',
    'ziro_move_schedule_sessions',
    'ziro_preflight_schedule_moves',
    '_ziro_schedule_move_analyze_move'
  )
ORDER BY 1, 2;

-- 2) Idempotency table
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'ziro_idempotency_keys'
ORDER BY ordinal_position;

-- 3) If PostgREST returns 404 / PGRST202 for a new RPC: Dashboard → Settings → API → Reload schema, or:
-- NOTIFY pgrst, 'reload schema';

-- 4) AI / Ziro observability (after 20260413120000_ai_observability.sql)
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN (
    'ai_conversations',
    'ai_messages',
    'ai_action_logs',
    'ai_feedback',
    'ai_legacy_message_log'
  )
ORDER BY 1;
