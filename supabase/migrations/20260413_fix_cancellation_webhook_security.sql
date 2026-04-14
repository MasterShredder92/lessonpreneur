-- Fix: trg_cancellation_created_webhook was SECURITY INVOKER
-- while all other webhook trigger functions are SECURITY DEFINER.
--
-- Root cause: When an authenticated user (owner/admin/studio_director)
-- cancels a lesson, the trigger fires as INVOKER (the user's role).
-- The trigger calls queue_outbound_webhooks(), but the authenticated
-- role has no EXECUTE permission on that function → the entire
-- UPDATE transaction rolls back → cancellation silently fails.
--
-- Fix: Match the pattern of all other webhook triggers by making
-- this function SECURITY DEFINER. The trigger only fires on
-- legitimate schedule_blocks updates which are already gated by RLS,
-- so no privilege escalation occurs.

ALTER FUNCTION trg_cancellation_created_webhook() SECURITY DEFINER;
