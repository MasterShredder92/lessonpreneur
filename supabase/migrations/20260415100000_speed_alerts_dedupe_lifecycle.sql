-- SPEED: alert deduplication, rollups, lifecycle (auto-resolve fields), upsert RPC
-- One row per (tenant_id, dedupe_key); repeated analysis updates last_seen / counts.

-- ─── New columns ─────────────────────────────────────────────────────────────

ALTER TABLE public.performance_alerts
  ADD COLUMN IF NOT EXISTS dedupe_key text,
  ADD COLUMN IF NOT EXISTS first_seen_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_seen_at timestamptz,
  ADD COLUMN IF NOT EXISTS occurrence_count integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS worst_metric numeric,
  ADD COLUMN IF NOT EXISTS latest_metric numeric,
  ADD COLUMN IF NOT EXISTS resolution_reason text,
  ADD COLUMN IF NOT EXISTS regressed_at timestamptz,
  ADD COLUMN IF NOT EXISTS muted_until timestamptz;

-- Backfill dedupe_key from existing rows (stable signature, severity NOT in key)
UPDATE public.performance_alerts
SET dedupe_key = CASE alert_type
  WHEN 'slow_query' THEN 'slow_query|label:' || COALESCE(NULLIF(trim(details->>'query_label'), ''), 'unknown')
  WHEN 'high_slow_query_rate' THEN 'high_slow_query_rate|global'
  WHEN 'slow_lcp' THEN 'slow_lcp|route:' || COALESCE(NULLIF(trim(details->>'route'), ''), 'unknown')
  WHEN 'slow_fcp' THEN 'slow_fcp|route:' || COALESCE(NULLIF(trim(details->>'route'), ''), 'unknown')
  WHEN 'slow_inp' THEN 'slow_inp|route:' || COALESCE(NULLIF(trim(details->>'route'), ''), 'unknown')
  WHEN 'high_cls' THEN 'high_cls|route:' || COALESCE(NULLIF(trim(details->>'route'), ''), 'unknown')
  ELSE COALESCE(alert_type, 'unknown') || '|legacy:' || id::text
END
WHERE dedupe_key IS NULL;

-- Timestamps for existing rows
UPDATE public.performance_alerts
SET
  first_seen_at = COALESCE(first_seen_at, created_at),
  last_seen_at = COALESCE(last_seen_at, created_at)
WHERE first_seen_at IS NULL OR last_seen_at IS NULL;

ALTER TABLE public.performance_alerts
  ALTER COLUMN dedupe_key SET NOT NULL,
  ALTER COLUMN first_seen_at SET NOT NULL,
  ALTER COLUMN last_seen_at SET NOT NULL;

-- Keep a single row per (tenant_id, dedupe_key): retain newest by created_at
DELETE FROM public.performance_alerts a
WHERE a.id NOT IN (
  SELECT DISTINCT ON (tenant_id, dedupe_key) id
  FROM public.performance_alerts
  ORDER BY tenant_id, dedupe_key, created_at DESC, id DESC
);

CREATE UNIQUE INDEX IF NOT EXISTS perf_alerts_tenant_dedupe_key_unique
  ON public.performance_alerts(tenant_id, dedupe_key);

CREATE INDEX IF NOT EXISTS perf_alerts_tenant_active_last_seen
  ON public.performance_alerts(tenant_id, resolved, last_seen_at DESC);

-- ─── Upsert RPC (dedupe + cooldown on occurrence_count) ─────────────────────

CREATE OR REPLACE FUNCTION public.speed_upsert_performance_alerts(p_rows jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  elem jsonb;
  v_tenant uuid;
  v_dk text;
  v_metric numeric;
BEGIN
  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' THEN
    RETURN;
  END IF;

  FOR elem IN SELECT * FROM jsonb_array_elements(p_rows)
  LOOP
    v_tenant := (elem->>'tenant_id')::uuid;
    IF v_tenant IS NULL OR v_tenant IS DISTINCT FROM public.get_user_tenant_id() THEN
      RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
    END IF;

    v_dk := elem->>'dedupe_key';
    IF v_dk IS NULL OR length(trim(v_dk)) = 0 THEN
      CONTINUE;
    END IF;

    v_metric := NULL;
    IF (elem ? 'metric_value') AND jsonb_typeof(elem->'metric_value') = 'number' THEN
      v_metric := (elem->>'metric_value')::numeric;
    ELSIF (elem ? 'metric_value') AND elem->>'metric_value' IS NOT NULL AND elem->>'metric_value' <> '' THEN
      v_metric := (elem->>'metric_value')::numeric;
    END IF;

    INSERT INTO public.performance_alerts (
      tenant_id,
      dedupe_key,
      alert_type,
      severity,
      message,
      details,
      resolved,
      resolved_at,
      created_at,
      first_seen_at,
      last_seen_at,
      occurrence_count,
      worst_metric,
      latest_metric,
      resolution_reason,
      regressed_at,
      muted_until
    ) VALUES (
      v_tenant,
      v_dk,
      COALESCE(elem->>'alert_type', 'unknown'),
      COALESCE(elem->>'severity', 'warning'),
      COALESCE(elem->>'message', ''),
      COALESCE(elem->'details', '{}'::jsonb),
      false,
      NULL,
      now(),
      now(),
      now(),
      1,
      v_metric,
      v_metric,
      NULL,
      NULL,
      NULL
    )
    ON CONFLICT (tenant_id, dedupe_key) DO UPDATE SET
      alert_type = EXCLUDED.alert_type,
      severity = CASE
        WHEN EXCLUDED.severity = 'critical' OR performance_alerts.severity = 'critical' THEN 'critical'
        ELSE EXCLUDED.severity
      END,
      message = EXCLUDED.message,
      details = EXCLUDED.details,
      resolved = false,
      resolved_at = NULL,
      resolution_reason = NULL,
      last_seen_at = now(),
      latest_metric = EXCLUDED.latest_metric,
      worst_metric = CASE
        WHEN performance_alerts.worst_metric IS NULL THEN EXCLUDED.worst_metric
        WHEN EXCLUDED.worst_metric IS NULL THEN performance_alerts.worst_metric
        ELSE GREATEST(performance_alerts.worst_metric, EXCLUDED.worst_metric)
      END,
      occurrence_count = performance_alerts.occurrence_count + CASE
        WHEN performance_alerts.last_seen_at < now() - interval '2 minutes' THEN 1
        ELSE 0
      END,
      first_seen_at = performance_alerts.first_seen_at,
      regressed_at = CASE WHEN performance_alerts.resolved THEN now() ELSE performance_alerts.regressed_at END;
  END LOOP;
END;
$function$;

REVOKE ALL ON FUNCTION public.speed_upsert_performance_alerts(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.speed_upsert_performance_alerts(jsonb) TO authenticated;
