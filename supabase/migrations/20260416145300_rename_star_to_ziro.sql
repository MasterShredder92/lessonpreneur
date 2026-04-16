-- ═══════════════════════════════════════════════════════════════
-- Part E: STAR → Ziro Database Migration
-- Run against STAGING first, verify, then PRODUCTION
-- NON-DESTRUCTIVE: backward-compatible views keep old names working
-- ═══════════════════════════════════════════════════════════════

BEGIN;

-- Step 1: Rename tables
ALTER TABLE IF EXISTS ziro_star_agents RENAME TO ziro_agents;
ALTER TABLE IF EXISTS ziro_star_config RENAME TO ziro_config;

-- Step 2: Backward-compatible views (zero downtime)
CREATE OR REPLACE VIEW ziro_star_agents AS SELECT * FROM ziro_agents;
CREATE OR REPLACE VIEW ziro_star_config AS SELECT * FROM ziro_config;

-- Step 3: New RPC function
CREATE OR REPLACE FUNCTION get_ziro_context(p_org_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'agents', COALESCE((
      SELECT jsonb_agg(row_to_json(a.*))
      FROM ziro_agents a
      WHERE (p_org_id IS NULL OR a.org_id = p_org_id)
    ), '[]'::jsonb),
    'config', COALESCE((
      SELECT row_to_json(c.*)::jsonb
      FROM ziro_config c
      WHERE (p_org_id IS NULL OR c.org_id = p_org_id)
      LIMIT 1
    ), '{}'::jsonb)
  ) INTO result;
  RETURN result;
END;
$$;

-- Step 4: Old RPC delegates to new (keeps existing calls working)
CREATE OR REPLACE FUNCTION get_star_context(p_org_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN RETURN get_ziro_context(p_org_id); END;
$$;

-- Step 5: Rename any RLS policies containing "star"
DO $$ DECLARE pol RECORD;
BEGIN
  FOR pol IN SELECT policyname, tablename FROM pg_policies
    WHERE tablename IN ('ziro_agents','ziro_config')
    AND policyname ILIKE '%star%'
  LOOP
    EXECUTE format('ALTER POLICY %I ON %I RENAME TO %I',
      pol.policyname, pol.tablename,
      replace(pol.policyname, 'star', 'ziro'));
  END LOOP;
END; $$;

COMMIT;

-- ═══════════════════════════════════════════════════════════════
-- CLEANUP — Run 7 days after production migration
-- ═══════════════════════════════════════════════════════════════
-- DROP VIEW IF EXISTS ziro_star_agents;
-- DROP VIEW IF EXISTS ziro_star_config;
-- DROP FUNCTION IF EXISTS get_star_context(uuid);
