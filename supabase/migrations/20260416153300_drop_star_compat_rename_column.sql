ALTER TABLE ziro_agents RENAME COLUMN auto_use_by_star TO auto_use_by_ziro;
DROP VIEW IF EXISTS ziro_star_agents;
DROP VIEW IF EXISTS ziro_star_config;
DROP FUNCTION IF EXISTS get_star_context(uuid);
