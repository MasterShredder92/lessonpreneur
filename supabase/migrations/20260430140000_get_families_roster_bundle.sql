-- Families roster: one RPC replaces PostgREST families page + parallel enrich queries.

CREATE OR REPLACE FUNCTION public.get_families_roster_bundle(
  p_tenant_id uuid,
  p_family_tab text,
  p_location_id uuid DEFAULT NULL,
  p_rate_filter integer DEFAULT 0,
  p_search text DEFAULT '',
  p_sort_by text DEFAULT 'az',
  p_offset integer DEFAULT 0,
  p_limit integer DEFAULT 45
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_off integer;
  v_lim integer;
  v_search text;
  v_pat text;
  v_today date := (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date;
  result jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.profiles pr
    WHERE pr.id = v_uid AND pr.tenant_id = p_tenant_id
  ) THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  v_off := greatest(coalesce(p_offset, 0), 0);
  v_lim := least(greatest(coalesce(nullif(p_limit, 0), 45), 1), 200);

  v_search := trim(coalesce(p_search, ''));
  IF length(v_search) = 0 THEN
    v_pat := NULL;
  ELSE
    v_pat := '%' || replace(replace(replace(v_search, E'\\', E'\\\\'), '%', E'\\%'), '_', E'\\_') || '%';
  END IF;

  WITH   teacher_display AS (
    SELECT
      t.id,
      NULLIF(
        trim(both ' ' FROM concat_ws(
          ' ',
          coalesce(t.first_name, p.first_name),
          coalesce(t.last_name, p.last_name)
        )),
        ''
      ) AS display_name
    FROM public.teachers t
    LEFT JOIN public.profiles p ON p.id = t.profile_id
    WHERE t.tenant_id = p_tenant_id
  ),
  base AS (
    SELECT
      f.*,
      row_number() OVER (
        ORDER BY
          CASE WHEN p_sort_by = 'az' THEN lower(f.name) END ASC NULLS LAST,
          CASE WHEN p_sort_by = 'za' THEN lower(f.name) END DESC NULLS LAST,
          CASE WHEN p_sort_by = 'newest' THEN f.created_at END DESC NULLS LAST,
          CASE WHEN p_sort_by = 'oldest' THEN f.created_at END ASC NULLS LAST,
          f.id
      ) AS rn
    FROM public.families f
    WHERE f.tenant_id = p_tenant_id
      AND (
        CASE lower(coalesce(p_family_tab, 'active'))
          WHEN 'active' THEN f.billing_status IS DISTINCT FROM 'cancelled'
          WHEN 'inactive' THEN f.billing_status = 'cancelled'
          ELSE TRUE
        END
      )
      AND (p_location_id IS NULL OR f.primary_location_id = p_location_id)
      AND (coalesce(p_rate_filter, 0) = 0 OR f.rate_tier = p_rate_filter)
      AND (
        v_pat IS NULL
        OR f.name ILIKE v_pat ESCAPE E'\\'
        OR coalesce(f.primary_email, '') ILIKE v_pat ESCAPE E'\\'
        OR coalesce(f.primary_phone, '') ILIKE v_pat ESCAPE E'\\'
        OR coalesce(f.parent_name, '') ILIKE v_pat ESCAPE E'\\'
        OR coalesce(f.primary_contact_name, '') ILIKE v_pat ESCAPE E'\\'
      )
  ),
  page_families AS (
    SELECT b.*
    FROM base b
    WHERE b.rn > v_off AND b.rn <= v_off + v_lim
  ),
  page_ids AS (
    SELECT id FROM page_families
  ),
  locs AS (
    SELECT
      l.id,
      replace(l.name, ' Music Lessons', '') AS short_name,
      l.color
    FROM public.locations l
    WHERE l.tenant_id = p_tenant_id
  ),
  overdue_tokens AS (
    SELECT DISTINCT it.family_id
    FROM public.invoice_tokens it
    WHERE it.tenant_id = p_tenant_id
      AND it.family_id IN (SELECT id FROM page_ids)
      AND lower(coalesce(it.status, '')) NOT IN ('paid', 'cancelled', 'expired')
      AND it.due_date IS NOT NULL
      AND it.due_date < v_today
  ),
  monthly AS (
    SELECT ser.family_id, sum(coalesce(ser.monthly_cents, 0))::bigint AS monthly_total
    FROM public.student_effective_rate ser
    WHERE ser.tenant_id = p_tenant_id
      AND ser.family_id IN (SELECT id FROM page_ids)
    GROUP BY ser.family_id
  ),
  square_base AS (
    SELECT
      si.family_id,
      upper(coalesce(si.status, '')) AS st,
      coalesce(si.requested_amount, 0) AS requested_amount,
      coalesce(si.amount_paid, 0) AS amount_paid,
      si.due_date,
      si.invoice_date
    FROM public.square_invoices si
    WHERE si.tenant_id = p_tenant_id
      AND si.family_id IN (SELECT id FROM page_ids)
      AND si.family_id IS NOT NULL
      AND upper(coalesce(si.status, '')) NOT IN ('CANCELED', 'DRAFT')
  ),
  square_flags AS (
    SELECT
      sb.family_id,
      bool_or(sb.st IN ('SCHEDULED', 'RECURRING')) AS has_scheduled,
      bool_or(sb.st IN ('PAID', 'PARTIALLY_REFUNDED')) AS has_paid,
      bool_or(sb.st = 'UNPAID' AND sb.due_date IS NOT NULL AND sb.due_date < v_today) AS has_overdue,
      sum(
        CASE
          WHEN sb.st = 'UNPAID' AND sb.due_date IS NOT NULL AND sb.due_date < v_today
          THEN sb.requested_amount - sb.amount_paid
          ELSE 0
        END
      )::bigint AS overdue_cents
    FROM square_base sb
    GROUP BY sb.family_id
  ),
  square_latest AS (
    SELECT DISTINCT ON (sb.family_id)
      sb.family_id,
      sb.st AS latest_status,
      CASE
        WHEN sb.st = 'PARTIALLY_REFUNDED' THEN sb.amount_paid
        ELSE sb.requested_amount
      END AS latest_amount_cents,
      coalesce(sb.due_date::text, sb.invoice_date::text, '') AS latest_date
    FROM square_base sb
    ORDER BY sb.family_id, sb.invoice_date DESC NULLS LAST, sb.due_date DESC NULLS LAST
  ),
  agreements AS (
    SELECT DISTINCT ff.family_id
    FROM public.family_files ff
    WHERE ff.tenant_id = p_tenant_id
      AND ff.file_type = 'enrollment_agreement'
      AND ff.family_id IN (SELECT id FROM page_ids)
  ),
  stud_rows AS (
    SELECT
      s.family_id,
      jsonb_agg(
        jsonb_build_object(
          'id', s.id,
          'first_name', s.first_name,
          'last_name', s.last_name,
          'instrument', s.instrument,
          'status', s.status,
          'teacher_id', s.teacher_id,
          'student_display_id', s.student_display_id,
          'counts_toward_family_tier', s.counts_toward_family_tier,
          'teacher_name',
          CASE
            WHEN s.teacher_id IS NULL THEN '---'::text
            ELSE coalesce(td.display_name, '---')
          END
        )
        ORDER BY s.last_name NULLS LAST, s.first_name NULLS LAST, s.id
      ) AS students_json
    FROM public.students s
    LEFT JOIN teacher_display td ON td.id = s.teacher_id
    WHERE s.tenant_id = p_tenant_id
      AND s.family_id IN (SELECT id FROM page_ids)
    GROUP BY s.family_id
  ),
  stud_stats AS (
    SELECT
      s.family_id,
      count(*) FILTER (WHERE s.status = 'active')::integer AS active_cnt,
      count(*) FILTER (
        WHERE s.status = 'active' AND s.counts_toward_family_tier IS DISTINCT FROM false
      )::integer AS tier_eligible_cnt
    FROM public.students s
    WHERE s.tenant_id = p_tenant_id
      AND s.family_id IN (SELECT id FROM page_ids)
    GROUP BY s.family_id
  ),
  instruments AS (
    SELECT
      s.family_id,
      CASE
        WHEN count(*) FILTER (
          WHERE s.instrument IS NOT NULL AND btrim(s.instrument) <> ''
        ) = 0 THEN '[]'::jsonb
        ELSE to_jsonb(
          array_agg(DISTINCT s.instrument ORDER BY s.instrument)
            FILTER (WHERE s.instrument IS NOT NULL AND btrim(s.instrument) <> '')
        )
      END AS instrument_list
    FROM public.students s
    WHERE s.tenant_id = p_tenant_id
      AND s.family_id IN (SELECT id FROM page_ids)
      AND s.status = 'active'
    GROUP BY s.family_id
  ),
  tnames AS (
    SELECT
      s.family_id,
      CASE
        WHEN count(*) FILTER (
          WHERE td.display_name IS NOT NULL AND btrim(td.display_name) <> ''
        ) = 0 THEN '[]'::jsonb
        ELSE to_jsonb(
          array_agg(DISTINCT td.display_name ORDER BY td.display_name)
            FILTER (WHERE td.display_name IS NOT NULL AND btrim(td.display_name) <> '')
        )
      END AS teacher_names_json
    FROM public.students s
    INNER JOIN teacher_display td ON td.id = s.teacher_id
    WHERE s.tenant_id = p_tenant_id
      AND s.family_id IN (SELECT id FROM page_ids)
      AND s.status = 'active'
    GROUP BY s.family_id
  ),
  built AS (
    SELECT
      pf.id,
      pf.tenant_id,
      pf.name,
      pf.parent_name,
      pf.primary_contact_name,
      pf.primary_email,
      pf.primary_phone,
      coalesce(pf.billing_status, 'active') AS billing_status,
      coalesce(pf.rate_tier, 4500) AS rate_tier,
      pf.primary_location_id,
      pf.card_brand,
      pf.card_last_four,
      pf.square_customer_id,
      coalesce(pf.balance, 0) AS balance,
      pf.overdue_balance_cents,
      pf.created_at,
      pf.is_military,
      coalesce(ss.active_cnt, 0) AS active_student_count,
      coalesce(ss.tier_eligible_cnt, 0) AS tier_eligible_student_count,
      coalesce(sr.students_json, '[]'::jsonb) AS students,
      coalesce(ins.instrument_list, '[]'::jsonb) AS instrument_list_json,
      coalesce(tn.teacher_names_json, '[]'::jsonb) AS teacher_names_json,
      loc.short_name AS location_name,
      loc.color AS location_color,
      (ot.family_id IS NOT NULL
        OR coalesce(pf.overdue_balance_cents, 0) > 0
        OR coalesce(sf.has_overdue, false)
      ) AS has_overdue_invoice,
      CASE
        WHEN coalesce(pf.billing_status, 'active') = 'cancelled' THEN 'cancelled'
        WHEN coalesce(pf.billing_status, 'active') = 'paused' THEN 'paused'
        WHEN ot.family_id IS NOT NULL
          OR coalesce(pf.overdue_balance_cents, 0) > 0
          OR coalesce(sf.has_overdue, false)
        THEN 'overdue'
        WHEN coalesce(sf.has_scheduled, false) THEN 'scheduled'
        WHEN coalesce(sf.has_paid, false) THEN 'current'
        WHEN coalesce(ss.active_cnt, 0) > 0
          AND NOT EXISTS (SELECT 1 FROM square_base sb2 WHERE sb2.family_id = pf.id)
        THEN 'no_invoice'
        ELSE 'current'
      END::text AS payment_status,
      CASE
        WHEN greatest(
          coalesce(pf.overdue_balance_cents, 0),
          coalesce(sf.overdue_cents, 0)
        ) > 0
        THEN '$' || (
          greatest(
            coalesce(pf.overdue_balance_cents, 0),
            coalesce(sf.overdue_cents, 0)
          ) / 100
        )::text
        ELSE NULL::text
      END AS overdue_amount_display,
      coalesce(m.monthly_total, 0)::bigint AS monthly_total_cents,
      CASE
        WHEN sl.family_id IS NULL THEN NULL::jsonb
        ELSE jsonb_build_object(
          'status', sl.latest_status,
          'amountCents', sl.latest_amount_cents,
          'date', sl.latest_date
        )
      END AS latest_invoice,
      (ag.family_id IS NOT NULL) AS has_enrollment_agreement,
      pf.rn
    FROM page_families pf
    LEFT JOIN locs loc ON loc.id = pf.primary_location_id
    LEFT JOIN overdue_tokens ot ON ot.family_id = pf.id
    LEFT JOIN monthly m ON m.family_id = pf.id
    LEFT JOIN square_flags sf ON sf.family_id = pf.id
    LEFT JOIN square_latest sl ON sl.family_id = pf.id
    LEFT JOIN agreements ag ON ag.family_id = pf.id
    LEFT JOIN stud_rows sr ON sr.family_id = pf.id
    LEFT JOIN stud_stats ss ON ss.family_id = pf.id
    LEFT JOIN instruments ins ON ins.family_id = pf.id
    LEFT JOIN tnames tn ON tn.family_id = pf.id
  )
  SELECT jsonb_build_object(
    'families',
    coalesce(
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'id', b.id,
            'tenant_id', b.tenant_id,
            'name', b.name,
            'parent_name', b.parent_name,
            'primary_contact_name', b.primary_contact_name,
            'primary_email', b.primary_email,
            'primary_phone', b.primary_phone,
            'billing_status', b.billing_status,
            'rate_tier', b.rate_tier,
            'primary_location_id', b.primary_location_id,
            'card_brand', b.card_brand,
            'card_last_four', b.card_last_four,
            'square_customer_id', b.square_customer_id,
            'balance', b.balance,
            'overdue_balance_cents', b.overdue_balance_cents,
            'created_at', b.created_at,
            'is_military', b.is_military,
            'activeStudentCount', b.active_student_count,
            'tierEligibleStudentCount', b.tier_eligible_student_count,
            'students', b.students,
            'instrumentList', b.instrument_list_json,
            'teacherNames', b.teacher_names_json,
            'locationName', b.location_name,
            'locationColor', b.location_color,
            'hasOverdueInvoice', b.has_overdue_invoice,
            'paymentStatus', b.payment_status,
            'overdueAmountDisplay', b.overdue_amount_display,
            'monthlyTotalCents', b.monthly_total_cents,
            'latestInvoice', b.latest_invoice,
            'has_enrollment_agreement', b.has_enrollment_agreement
          )
          ORDER BY b.rn
        )
        FROM built b
      ),
      '[]'::jsonb
    )
  )
  INTO result;

  RETURN coalesce(result, jsonb_build_object('families', '[]'::jsonb));
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_families_roster_bundle(
  uuid, text, uuid, integer, text, text, integer, integer
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_families_roster_bundle(
  uuid, text, uuid, integer, text, text, integer, integer
) TO service_role;

CREATE INDEX IF NOT EXISTS idx_families_roster_tenant_tab_loc_rate_created
  ON public.families (tenant_id, billing_status, primary_location_id, rate_tier, created_at);

CREATE INDEX IF NOT EXISTS idx_families_roster_tenant_name
  ON public.families (tenant_id, lower(name));

CREATE INDEX IF NOT EXISTS idx_square_invoices_tenant_family_date
  ON public.square_invoices (tenant_id, family_id, invoice_date DESC NULLS LAST)
  WHERE family_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_invoice_tokens_tenant_family_due
  ON public.invoice_tokens (tenant_id, family_id, due_date)
  WHERE due_date IS NOT NULL;
