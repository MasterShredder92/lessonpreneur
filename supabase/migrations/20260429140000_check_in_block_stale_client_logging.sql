-- Temporary: log check_in_block callers (Postgres logs) + reject known stale p_user_id.
-- Remove or replace after confirming no more bad traffic (see COMMENT on function).

CREATE OR REPLACE FUNCTION public.check_in_block(
  p_block_id uuid,
  p_action text DEFAULT 'check_in'::text,
  p_user_id uuid DEFAULT NULL::uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_block         record;
  v_new_checked   boolean;
  v_no_tally_type boolean;
  v_tally_granted boolean;
  v_headers_raw   text;
  v_user_agent    text;
  v_jwt_sub       text;
BEGIN
  -- PostgREST exposes HTTP headers as JSON (header names lowercased). May be NULL for internal callers.
  BEGIN
    v_headers_raw := current_setting('request.headers', true);
    IF v_headers_raw IS NOT NULL AND btrim(v_headers_raw) <> '' THEN
      v_user_agent := (v_headers_raw::json->>'user-agent');
    END IF;
  EXCEPTION
    WHEN OTHERS THEN
      v_user_agent := '(request.headers unavailable)';
  END;

  BEGIN
    v_jwt_sub := (current_setting('request.jwt.claim.sub', true));
  EXCEPTION
    WHEN OTHERS THEN
      v_jwt_sub := NULL;
  END;

  RAISE LOG 'check_in_block audit: p_user_id=% p_action=% block_id=% jwt.sub=% user_agent=%',
    p_user_id,
    p_action,
    p_block_id,
    coalesce(v_jwt_sub, '(none)'),
    coalesce(nullif(btrim(coalesce(v_user_agent, '')), ''), '(none)');

  IF p_user_id = '00000000-0000-0000-0000-000000000099'::uuid THEN
    RAISE EXCEPTION 'Invalid user id: stale client (hard refresh, close tabs, clear SW, re-login).'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT *
    INTO v_block
    FROM schedule_blocks
   WHERE id = p_block_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Block not found');
  END IF;

  IF v_block.block_type IN ('open_time', 'not_bookable') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Block type not checkable');
  END IF;

  IF p_action = 'check_in' THEN
    IF v_block.checked_in = true THEN
      RETURN jsonb_build_object('ok', false, 'error', 'Already checked in');
    END IF;
    v_new_checked := true;
  ELSIF p_action = 'undo' THEN
    IF v_block.checked_in = false THEN
      RETURN jsonb_build_object('ok', false, 'error', 'Not checked in');
    END IF;
    v_new_checked := false;
  ELSE
    RETURN jsonb_build_object('ok', false, 'error', 'Invalid action');
  END IF;

  v_no_tally_type := v_block.block_type IN ('makeup_session', 'teacher_training');
  v_tally_granted := v_new_checked AND NOT v_no_tally_type;

  UPDATE schedule_blocks
     SET checked_in    = v_new_checked,
         checked_in_at = CASE WHEN v_new_checked THEN now() ELSE NULL END,
         checked_in_by = CASE WHEN v_new_checked THEN p_user_id ELSE NULL END,
         teacher_tally = v_tally_granted
   WHERE id = p_block_id;

  RETURN jsonb_build_object(
    'ok',            true,
    'checked_in',    v_new_checked,
    'block_type',    v_block.block_type,
    'tally_granted', v_tally_granted
  );
END;
$function$;

COMMENT ON FUNCTION public.check_in_block(uuid, text, uuid) IS
  'TEMP: logs p_user_id + user-agent + jwt.sub via RAISE LOG; rejects legacy stale p_user_id 00000000-0000-0000-0000-000000000099. Revert logging/reject after investigation.';
