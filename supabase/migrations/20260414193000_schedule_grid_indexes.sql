-- =============================================================================
-- SPEED alert: schedule.grid (schedule_blocks)
--
-- The schedule grid RPC filters schedule_blocks by tenant + date range (week)
-- and optionally location, then orders by start_time for rendering.
--
-- Add composite indexes that match those filter/order patterns to avoid
-- large bitmap/seq scans as the schedule_blocks table grows.
-- =============================================================================

-- Primary grid query: tenant + date bounds (+ optional location) ordered by start_time.
CREATE INDEX IF NOT EXISTS idx_schedule_blocks_grid_tenant_date_loc_start
  ON public.schedule_blocks (tenant_id, block_date, location_id, start_time);

-- When viewing across locations / location_id not specified:
CREATE INDEX IF NOT EXISTS idx_schedule_blocks_grid_tenant_date_start
  ON public.schedule_blocks (tenant_id, block_date, start_time);

-- Secondary access pattern used by grid enrichment and teacher columns:
CREATE INDEX IF NOT EXISTS idx_schedule_blocks_grid_tenant_teacher_date_start
  ON public.schedule_blocks (tenant_id, teacher_id, block_date, start_time);

