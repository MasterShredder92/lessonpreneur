-- =============================================================================
-- Dashboard Snapshot: Missing indexes + RPC optimization
--
-- Addresses SPEED alert "slow_query dashboard.data avg 916ms"
--
-- Changes:
-- 1. Add missing composite indexes on teachers, students for dashboard patterns
-- 2. Rebuild get_dashboard_snapshot removing LIMIT antipatterns, fixing
--    correlated subqueries, and improving subs_available calculation
-- 3. Remove artificial LIMIT 500 on month_pay that silently truncates payroll
-- =============================================================================

-- ═══════════════════════════════════════════════════════════════════════════
-- INDEXES: Fill gaps that cause seq scans in the dashboard RPC
-- ═══════════════════════════════════════════════════════════════════════════

-- teachers: dashboard filters is_active=true frequently; 11K seq scans observed
CREATE INDEX IF NOT EXISTS idx_teachers_tenant_active
  ON public.teachers(tenant_id, is_active)
  WHERE is_active = true;

-- students: location-scoped active counts are the #1 dashboard metric
CREATE INDEX IF NOT EXISTS idx_students_tenant_status_location
  ON public.students(tenant_id, status, location_id);

-- session_log: month_pay aggregation needs tenant+status+block_date+teacher_rate
-- existing idx_session_log_tenant_status_date covers the filter; add covering index
CREATE INDEX IF NOT EXISTS idx_session_log_pay_agg
  ON public.session_log(tenant_id, status, block_date)
  INCLUDE (teacher_rate)
  WHERE status = 'completed';

-- students: reactivation due query
CREATE INDEX IF NOT EXISTS idx_students_reactivation
  ON public.students(tenant_id, status, reactivation_date)
  WHERE status = 'former' AND reactivation_date IS NOT NULL;

-- schedule_blocks: today's blocks filtered by location (loc_summary correlated subqueries)
CREATE INDEX IF NOT EXISTS idx_schedule_blocks_tenant_date_loc_status
  ON public.schedule_blocks(tenant_id, block_date, location_id, status);

-- leads: dashboard touches stage pipeline + stale leads + new leads today
CREATE INDEX IF NOT EXISTS idx_leads_tenant_stage_updated
  ON public.leads(tenant_id, stage, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_leads_tenant_created
  ON public.leads(tenant_id, created_at DESC);

-- teacher_locations: joining active teachers to locations on every dashboard load
CREATE INDEX IF NOT EXISTS idx_teacher_locations_teacher_location
  ON public.teacher_locations(teacher_id, location_id);

-- dashboard_aggregate: SPEED alert attributes work here; add defensive indexes if table exists.
-- This is a no-op if the table isn't present in this environment.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'dashboard_aggregate'
  ) THEN
    -- common filter pattern: tenant + date bounds (+ optional location)
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'dashboard_aggregate' AND column_name = 'tenant_id'
    ) AND EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'dashboard_aggregate' AND column_name IN ('day', 'date', 'as_of_date')
    ) THEN
      -- Try a few likely date column names without hard-failing.
      BEGIN
        EXECUTE 'CREATE INDEX IF NOT EXISTS idx_dashboard_aggregate_tenant_day ON public.dashboard_aggregate(tenant_id, day)';
      EXCEPTION WHEN undefined_column THEN
        NULL;
      END;
      BEGIN
        EXECUTE 'CREATE INDEX IF NOT EXISTS idx_dashboard_aggregate_tenant_date ON public.dashboard_aggregate(tenant_id, date)';
      EXCEPTION WHEN undefined_column THEN
        NULL;
      END;
      BEGIN
        EXECUTE 'CREATE INDEX IF NOT EXISTS idx_dashboard_aggregate_tenant_as_of_date ON public.dashboard_aggregate(tenant_id, as_of_date)';
      EXCEPTION WHEN undefined_column THEN
        NULL;
      END;
    END IF;

    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'dashboard_aggregate' AND column_name = 'location_id'
    ) THEN
      BEGIN
        EXECUTE 'CREATE INDEX IF NOT EXISTS idx_dashboard_aggregate_tenant_loc_day ON public.dashboard_aggregate(tenant_id, location_id, day)';
      EXCEPTION WHEN undefined_column THEN
        NULL;
      END;
      BEGIN
        EXECUTE 'CREATE INDEX IF NOT EXISTS idx_dashboard_aggregate_tenant_loc_date ON public.dashboard_aggregate(tenant_id, location_id, date)';
      EXCEPTION WHEN undefined_column THEN
        NULL;
      END;
      BEGIN
        EXECUTE 'CREATE INDEX IF NOT EXISTS idx_dashboard_aggregate_tenant_loc_as_of_date ON public.dashboard_aggregate(tenant_id, location_id, as_of_date)';
      EXCEPTION WHEN undefined_column THEN
        NULL;
      END;
    END IF;
  END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- FUNCTION: Optimized get_dashboard_snapshot
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.get_dashboard_snapshot(
  p_tenant_id uuid,
  p_today date,
  p_week_start date,
  p_week_end date,
  p_month_start date,
  p_fourteen_days_ago date,
  p_sixty_days_ago date,
  p_seven_days_ago timestamptz,
  p_location_ids uuid[] DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  result jsonb;
BEGIN
  WITH
  -- ── Location reference (tiny table, always needed) ──
  locs AS (
    SELECT id, REPLACE(name, ' Music Lessons', '') AS short_name
    FROM locations WHERE tenant_id = p_tenant_id
  ),

  -- ── Students: pre-filter once, reuse everywhere ──
  all_active AS (
    SELECT id, location_id FROM students
    WHERE tenant_id = p_tenant_id AND status = 'active'
  ),
  scoped_active AS (
    SELECT a.* FROM all_active a
    WHERE p_location_ids IS NULL OR a.location_id = ANY(p_location_ids)
  ),
  students_by_loc AS (
    SELECT COALESCE(l.short_name, 'Unknown') AS loc, COUNT(*) AS cnt
    FROM scoped_active s LEFT JOIN locs l ON l.id = s.location_id
    GROUP BY l.short_name
  ),

  -- ── Leads: no artificial LIMIT, filter at source ──
  open_leads AS (
    SELECT id, stage, parent_name, first_name, updated_at, created_at, instrument
    FROM leads
    WHERE tenant_id = p_tenant_id AND stage NOT IN ('enrolled', 'lost')
  ),
  all_leads_by_stage AS (
    SELECT stage, COUNT(*) AS cnt
    FROM leads WHERE tenant_id = p_tenant_id
    GROUP BY stage
  ),
  stale_leads AS (
    SELECT COALESCE(parent_name, first_name) AS parent_name, stage::text AS stage,
           EXTRACT(DAY FROM now() - updated_at)::int AS days
    FROM open_leads
    WHERE updated_at < now() - interval '3 days'
  ),
  new_leads_today AS (
    SELECT COUNT(*) AS cnt FROM leads
    WHERE tenant_id = p_tenant_id AND created_at::date = p_today
  ),

  -- ── Schedule: open slots this week ──
  week_slots AS (
    SELECT id, location_id FROM schedule_blocks
    WHERE tenant_id = p_tenant_id AND status = 'available'
      AND block_date >= p_week_start AND block_date <= p_week_end
  ),
  scoped_week_slots AS (
    SELECT w.* FROM week_slots w
    WHERE p_location_ids IS NULL OR w.location_id = ANY(p_location_ids)
  ),
  slots_by_loc AS (
    SELECT COALESCE(l.short_name, 'Unknown') AS loc, COUNT(*) AS cnt
    FROM scoped_week_slots s LEFT JOIN locs l ON l.id = s.location_id
    GROUP BY l.short_name
  ),

  -- ── Today's blocks: single scan, reused for snippet + loc_summary ──
  today_blocks AS (
    SELECT id, status, location_id, teacher_id, student_id, start_time, block_type
    FROM schedule_blocks
    WHERE tenant_id = p_tenant_id AND block_date = p_today
  ),

  -- ── Teachers ──
  active_teachers AS (
    SELECT t.id, t.ai_context, t.is_sub_available, t.profile_id,
           t.first_name, t.last_name
    FROM teachers t WHERE t.tenant_id = p_tenant_id AND t.is_active = true
  ),
  needs_review AS (
    SELECT COUNT(*) AS cnt FROM active_teachers
    WHERE (ai_context->>'instruments_need_review')::boolean = true
  ),
  teacher_locs AS (
    SELECT tl.teacher_id, tl.location_id
    FROM teacher_locations tl
    WHERE EXISTS (SELECT 1 FROM active_teachers at2 WHERE at2.id = tl.teacher_id)
  ),
  teachers_by_loc AS (
    SELECT COALESCE(l.short_name, 'Unknown') AS loc, COUNT(DISTINCT tl.teacher_id) AS cnt
    FROM teacher_locs tl JOIN locs l ON l.id = tl.location_id
    GROUP BY l.short_name
  ),

  -- ── Today's teaching set (materialized once for subs calc) ──
  today_teacher_ids AS (
    SELECT DISTINCT teacher_id FROM today_blocks WHERE teacher_id IS NOT NULL
  ),

  -- ── Location summary: replace correlated subqueries with pre-aggregated joins ──
  today_stats_by_loc AS (
    SELECT
      tb.location_id,
      COUNT(*) FILTER (WHERE tb.status = 'available') AS open_slots_today,
      COUNT(DISTINCT tb.teacher_id) AS teachers_today
    FROM today_blocks tb
    GROUP BY tb.location_id
  ),
  active_by_loc AS (
    SELECT location_id, COUNT(*) AS cnt FROM all_active GROUP BY location_id
  ),
  subs_by_loc AS (
    SELECT tl.location_id, COUNT(*) AS cnt
    FROM teacher_locs tl
    JOIN active_teachers sub ON sub.id = tl.teacher_id AND sub.is_sub_available = true
    WHERE NOT EXISTS (SELECT 1 FROM today_teacher_ids tti WHERE tti.teacher_id = sub.id)
    GROUP BY tl.location_id
  ),
  loc_summary AS (
    SELECT
      l.id AS location_id,
      l.short_name AS name,
      COALESCE(ab.cnt, 0) AS students,
      COALESCE(ts.open_slots_today, 0) AS open_slots_today,
      COALESCE(ts.teachers_today, 0) AS teachers_today,
      COALESCE(sb.cnt, 0) AS subs_available
    FROM locs l
    LEFT JOIN active_by_loc ab ON ab.location_id = l.id
    LEFT JOIN today_stats_by_loc ts ON ts.location_id = l.id
    LEFT JOIN subs_by_loc sb ON sb.location_id = l.id
  ),

  -- ── Inventory ──
  flagged AS (
    SELECT COUNT(*) AS cnt FROM room_inventory
    WHERE tenant_id = p_tenant_id AND is_flagged = true
  ),

  -- ── Teacher pay: no LIMIT — sum ALL completed sessions this month ──
  month_pay AS (
    SELECT COALESCE(SUM(teacher_rate), 0) AS total
    FROM session_log
    WHERE tenant_id = p_tenant_id AND status = 'completed'
      AND block_date >= p_month_start
  ),

  -- ── Reactivation ──
  reactivation AS (
    SELECT COUNT(*) AS cnt FROM students
    WHERE tenant_id = p_tenant_id AND status = 'former'
      AND reactivation_date IS NOT NULL AND reactivation_date <= p_today
  ),

  -- ── Schedule snippet (today's booked sessions) ──
  snippet AS (
    SELECT
      COALESCE(l.short_name, '') AS location_name,
      COALESCE(at2.first_name || ' ' || at2.last_name, '') AS teacher_name,
      LEFT(tb.start_time::text, 5) AS time,
      CASE WHEN tb.student_id IS NOT NULL
        THEN (SELECT s.first_name || ' ' || s.last_name FROM students s WHERE s.id = tb.student_id)
        ELSE NULL END AS student_name,
      COALESCE(tb.block_type::text, 'student_session') AS block_type
    FROM today_blocks tb
    LEFT JOIN locs l ON l.id = tb.location_id
    LEFT JOIN active_teachers at2 ON at2.id = tb.teacher_id
    WHERE tb.status = 'booked'
    ORDER BY tb.start_time
    LIMIT 12
  ),

  -- ── Recent activity feed ──
  recent_leads_cte AS (
    SELECT
      CASE WHEN stage = 'enrolled' THEN 'enrollment' ELSE 'lead' END AS type,
      COALESCE(parent_name, first_name) || ' — ' || COALESCE(instrument, '?') || ' (' || stage || ')' AS description,
      created_at AS ts
    FROM leads WHERE tenant_id = p_tenant_id
    ORDER BY created_at DESC LIMIT 5
  ),
  recent_students_cte AS (
    SELECT 'student'::text AS type,
      first_name || ' ' || last_name || ' enrolled — ' || COALESCE(instrument, '?') AS description,
      created_at AS ts
    FROM students WHERE tenant_id = p_tenant_id
    ORDER BY created_at DESC LIMIT 5
  ),
  recent_activity AS (
    SELECT * FROM (
      SELECT * FROM recent_leads_cte
      UNION ALL
      SELECT * FROM recent_students_cte
    ) combined ORDER BY ts DESC LIMIT 10
  ),

  -- ── At-risk students ──
  at_risk AS (
    SELECT * FROM get_at_risk_students(p_tenant_id, p_fourteen_days_ago, p_sixty_days_ago, 20)
  ),

  -- ── Recent session logs ──
  enriched_logs AS (
    SELECT * FROM get_recent_session_logs_enriched(p_tenant_id, p_seven_days_ago, 10)
  )

  SELECT jsonb_build_object(
    'activeStudents', (SELECT COUNT(*) FROM scoped_active),
    'studentsByLocation', COALESCE((SELECT jsonb_object_agg(loc, cnt) FROM students_by_loc), '{}'::jsonb),
    'openSlotsThisWeek', (SELECT COUNT(*) FROM scoped_week_slots),
    'slotsByLocation', COALESCE((SELECT jsonb_object_agg(loc, cnt) FROM slots_by_loc), '{}'::jsonb),
    'leadsInPipeline', (SELECT COUNT(*) FROM open_leads),
    'leadsByStage', COALESCE((SELECT jsonb_object_agg(stage, cnt) FROM all_leads_by_stage), '{}'::jsonb),
    'staleLeadCount', (SELECT COUNT(*) FROM stale_leads),
    'staleLeads', COALESCE((SELECT jsonb_agg(jsonb_build_object('parent_name', parent_name, 'stage', stage, 'days', days)) FROM stale_leads), '[]'::jsonb),
    'activeTeachers', (SELECT COUNT(*) FROM active_teachers),
    'teachersByLocation', COALESCE((SELECT jsonb_object_agg(loc, cnt) FROM teachers_by_loc), '{}'::jsonb),
    'needsInstrumentReview', (SELECT cnt FROM needs_review),
    'locationSummary', COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'name', name, 'locationId', location_id, 'students', students,
      'openSlotsToday', open_slots_today, 'teachersToday', teachers_today,
      'subsAvailable', subs_available
    )) FROM loc_summary), '[]'::jsonb),
    'recentActivity', COALESCE((SELECT jsonb_agg(jsonb_build_object('type', type, 'description', description, 'timestamp', ts)) FROM recent_activity), '[]'::jsonb),
    'flaggedInventoryCount', (SELECT cnt FROM flagged),
    'newLeadsToday', (SELECT cnt FROM new_leads_today),
    'teacherPayThisMonth', (SELECT total FROM month_pay),
    'reactivationDueCount', (SELECT cnt FROM reactivation),
    'scheduleSnippet', COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'locationName', location_name, 'teacherName', teacher_name,
      'time', time, 'studentName', student_name, 'blockType', block_type
    )) FROM snippet), '[]'::jsonb),
    'atRiskStudents', COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'id', id, 'name', name, 'instrument', instrument,
      'locationName', location_name, 'daysSinceSession', days_since_session
    )) FROM at_risk), '[]'::jsonb),
    'recentSessionLogs', COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'studentName', student_name, 'teacherName', teacher_name,
      'instrument', instrument, 'workedOn', worked_on,
      'progressIndicator', progress_indicator, 'blockDate', block_date
    )) FROM enriched_logs), '[]'::jsonb),
    'sessionLogsToday', (SELECT COUNT(*) FROM enriched_logs WHERE block_date = p_today),
    'sessionLogsThisWeek', (SELECT COUNT(*) FROM enriched_logs WHERE block_date >= p_week_start AND block_date <= p_week_end)
  ) INTO result;

  RETURN result;
END;
$function$;

-- Grant execute to authenticated users (same as original)
GRANT EXECUTE ON FUNCTION public.get_dashboard_snapshot TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_dashboard_snapshot TO service_role;
