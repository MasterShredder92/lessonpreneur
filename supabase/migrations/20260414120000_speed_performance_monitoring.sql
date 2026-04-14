-- SPEED Agent: Site Performance Enhancement & Error Detection
-- Creates tables for tracking page metrics, query performance, and system alerts.

-- ═══════════════════════════════════════════════════════════════════════════
-- TABLE: performance_metrics
-- Stores client-side Web Vitals captured per page load / route visit
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.performance_metrics (
  id           uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id    uuid        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  session_id   text        NOT NULL,              -- browser session grouping (random UUID per tab)
  page_route   text        NOT NULL,              -- e.g. '/admin/dashboard'
  load_time_ms integer,                           -- full page load (navigation timing)
  fcp_ms       integer,                           -- First Contentful Paint
  lcp_ms       integer,                           -- Largest Contentful Paint
  cls_score    numeric(6,4),                      -- Cumulative Layout Shift (0.0000 - 9.9999)
  inp_ms       integer,                           -- Interaction to Next Paint
  ttfb_ms      integer,                           -- Time to First Byte
  created_at   timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS perf_metrics_tenant_created
  ON public.performance_metrics(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS perf_metrics_route
  ON public.performance_metrics(tenant_id, page_route, created_at DESC);

-- ═══════════════════════════════════════════════════════════════════════════
-- TABLE: query_performance
-- Stores timed query observations logged from the client-side data layer
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.query_performance (
  id                 uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id          uuid        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  query_label        text        NOT NULL,         -- human-readable label (query key string)
  table_name         text,                         -- primary table queried (if known)
  execution_time_ms  integer     NOT NULL,
  row_count          integer,
  is_slow            boolean     GENERATED ALWAYS AS (execution_time_ms > 500) STORED,
  created_at         timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS query_perf_tenant_created
  ON public.query_performance(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS query_perf_slow
  ON public.query_performance(tenant_id, is_slow, created_at DESC);
CREATE INDEX IF NOT EXISTS query_perf_label
  ON public.query_performance(tenant_id, query_label, created_at DESC);

-- ═══════════════════════════════════════════════════════════════════════════
-- TABLE: performance_alerts
-- Stores threshold-triggered alerts for regressions and anomalies
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.performance_alerts (
  id          uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id   uuid        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  alert_type  text        NOT NULL,  -- 'slow_lcp' | 'slow_query' | 'high_cls' | 'slow_fcp' | 'slow_inp'
  severity    text        NOT NULL,  -- 'warning' | 'critical'
  message     text        NOT NULL,
  details     jsonb       DEFAULT '{}'::jsonb,
  resolved    boolean     DEFAULT false,
  resolved_at timestamptz,
  created_at  timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS perf_alerts_tenant_active
  ON public.performance_alerts(tenant_id, resolved, created_at DESC);

-- ═══════════════════════════════════════════════════════════════════════════
-- RLS: performance_metrics
-- ═══════════════════════════════════════════════════════════════════════════
ALTER TABLE public.performance_metrics ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenant_access_performance_metrics" ON public.performance_metrics;
CREATE POLICY "tenant_access_performance_metrics"
  ON public.performance_metrics FOR ALL TO authenticated
  USING  (tenant_id = get_user_tenant_id())
  WITH CHECK (tenant_id = get_user_tenant_id());

-- ═══════════════════════════════════════════════════════════════════════════
-- RLS: query_performance
-- ═══════════════════════════════════════════════════════════════════════════
ALTER TABLE public.query_performance ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenant_access_query_performance" ON public.query_performance;
CREATE POLICY "tenant_access_query_performance"
  ON public.query_performance FOR ALL TO authenticated
  USING  (tenant_id = get_user_tenant_id())
  WITH CHECK (tenant_id = get_user_tenant_id());

-- ═══════════════════════════════════════════════════════════════════════════
-- RLS: performance_alerts
-- ═══════════════════════════════════════════════════════════════════════════
ALTER TABLE public.performance_alerts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenant_access_performance_alerts" ON public.performance_alerts;
CREATE POLICY "tenant_access_performance_alerts"
  ON public.performance_alerts FOR ALL TO authenticated
  USING  (tenant_id = get_user_tenant_id())
  WITH CHECK (tenant_id = get_user_tenant_id());
