  SELECT jsonb_build_object(

    'generated_at', NOW(),
    'tenant_id', p_tenant_id,

    -- STUDENTS
    'students', jsonb_build_object(
      'active',   (SELECT COUNT(*) FROM students s WHERE s.tenant_id = p_tenant_id AND (CASE WHEN v_role = 'studio_director' THEN s.location_id = ANY(v_allowed_location_ids) ELSE true END) AND (CASE WHEN v_role = 'teacher' THEN (v_teacher_row.id IS NOT NULL AND s.teacher_id = v_teacher_row.id) ELSE true END) AND s.status = 'active'),
      'paused',   (SELECT COUNT(*) FROM students s WHERE s.tenant_id = p_tenant_id AND (CASE WHEN v_role = 'studio_director' THEN s.location_id = ANY(v_allowed_location_ids) ELSE true END) AND (CASE WHEN v_role = 'teacher' THEN (v_teacher_row.id IS NOT NULL AND s.teacher_id = v_teacher_row.id) ELSE true END) AND s.status = 'paused'),
      'inactive', (SELECT COUNT(*) FROM students s WHERE s.tenant_id = p_tenant_id AND (CASE WHEN v_role = 'studio_director' THEN s.location_id = ANY(v_allowed_location_ids) ELSE true END) AND (CASE WHEN v_role = 'teacher' THEN (v_teacher_row.id IS NOT NULL AND s.teacher_id = v_teacher_row.id) ELSE true END) AND s.status IN ('inactive','former')),
      'total',    (SELECT COUNT(*) FROM students s WHERE s.tenant_id = p_tenant_id AND (CASE WHEN v_role = 'studio_director' THEN s.location_id = ANY(v_allowed_location_ids) ELSE true END) AND (CASE WHEN v_role = 'teacher' THEN (v_teacher_row.id IS NOT NULL AND s.teacher_id = v_teacher_row.id) ELSE true END)),
      'new_last_30_days', (SELECT COUNT(*) FROM students s WHERE s.tenant_id = p_tenant_id AND (CASE WHEN v_role = 'studio_director' THEN s.location_id = ANY(v_allowed_location_ids) ELSE true END) AND (CASE WHEN v_role = 'teacher' THEN (v_teacher_row.id IS NOT NULL AND s.teacher_id = v_teacher_row.id) ELSE true END) AND s.created_at >= NOW() - INTERVAL '30 days'),
      'new_last_7_days',  (SELECT COUNT(*) FROM students s WHERE s.tenant_id = p_tenant_id AND (CASE WHEN v_role = 'studio_director' THEN s.location_id = ANY(v_allowed_location_ids) ELSE true END) AND (CASE WHEN v_role = 'teacher' THEN (v_teacher_row.id IS NOT NULL AND s.teacher_id = v_teacher_row.id) ELSE true END) AND s.created_at >= NOW() - INTERVAL '7 days'),
      'military_count',   (SELECT COUNT(*) FROM students s WHERE s.tenant_id = p_tenant_id AND (CASE WHEN v_role = 'studio_director' THEN s.location_id = ANY(v_allowed_location_ids) ELSE true END) AND (CASE WHEN v_role = 'teacher' THEN (v_teacher_row.id IS NOT NULL AND s.teacher_id = v_teacher_row.id) ELSE true END) AND s.status = 'active' AND s.is_military = true),
      'at_risk_no_lesson_30_days', (
        SELECT COUNT(*) FROM students s
        WHERE s.tenant_id = p_tenant_id AND s.status = 'active' AND (CASE WHEN v_role = 'studio_director' THEN s.location_id = ANY(v_allowed_location_ids) ELSE true END) AND (CASE WHEN v_role = 'teacher' THEN (v_teacher_row.id IS NOT NULL AND s.teacher_id = v_teacher_row.id) ELSE true END)
        AND NOT EXISTS (SELECT 1 FROM session_log sl WHERE sl.student_id = s.id AND sl.block_date >= CURRENT_DATE - 30)
      ),
      'by_location', (
        SELECT COALESCE(jsonb_agg(jsonb_build_object('location', location, 'count', student_count) ORDER BY student_count DESC), '[]')
        FROM (
          SELECT l.name AS location, COUNT(s.id) AS student_count
          FROM students s JOIN locations l ON s.location_id = l.id
          WHERE s.tenant_id = p_tenant_id AND s.status = 'active' AND (CASE WHEN v_role = 'studio_director' THEN s.location_id = ANY(v_allowed_location_ids) ELSE true END) AND (CASE WHEN v_role = 'teacher' THEN (v_teacher_row.id IS NOT NULL AND s.teacher_id = v_teacher_row.id) ELSE true END)
          GROUP BY l.name
        ) t
      ),
      'by_instrument', (
        SELECT COALESCE(jsonb_agg(jsonb_build_object('instrument', instrument, 'count', cnt) ORDER BY cnt DESC), '[]')
        FROM (
          SELECT INITCAP(LOWER(instrument)) AS instrument, COUNT(*) AS cnt
          FROM students s
          WHERE s.tenant_id = p_tenant_id AND s.status = 'active' AND (CASE WHEN v_role = 'studio_director' THEN s.location_id = ANY(v_allowed_location_ids) ELSE true END) AND (CASE WHEN v_role = 'teacher' THEN (v_teacher_row.id IS NOT NULL AND s.teacher_id = v_teacher_row.id) ELSE true END) AND instrument IS NOT NULL AND instrument != ''
          GROUP BY INITCAP(LOWER(instrument))
          ORDER BY cnt DESC LIMIT 15
        ) t
      )
    ),

    -- FAMILIES
    'families', jsonb_build_object(
      'total',               (SELECT COUNT(*) FROM families f WHERE f.tenant_id = p_tenant_id AND (CASE WHEN v_role = 'studio_director' THEN EXISTS (SELECT 1 FROM students s WHERE s.family_id = f.id AND s.tenant_id = p_tenant_id AND s.location_id = ANY(v_allowed_location_ids)) ELSE true END) AND (CASE WHEN v_role = 'teacher' THEN (v_teacher_row.id IS NOT NULL AND EXISTS (SELECT 1 FROM students s WHERE s.family_id = f.id AND s.teacher_id = v_teacher_row.id AND s.tenant_id = p_tenant_id)) ELSE true END)),
      'no_card_on_file',     (SELECT COUNT(*) FROM families f WHERE f.tenant_id = p_tenant_id AND (CASE WHEN v_role = 'studio_director' THEN EXISTS (SELECT 1 FROM students s WHERE s.family_id = f.id AND s.tenant_id = p_tenant_id AND s.location_id = ANY(v_allowed_location_ids)) ELSE true END) AND (CASE WHEN v_role = 'teacher' THEN (v_teacher_row.id IS NOT NULL AND EXISTS (SELECT 1 FROM students s WHERE s.family_id = f.id AND s.teacher_id = v_teacher_row.id AND s.tenant_id = p_tenant_id)) ELSE true END) AND card_last_four IS NULL),
      'with_card_on_file',   (SELECT COUNT(*) FROM families f WHERE f.tenant_id = p_tenant_id AND (CASE WHEN v_role = 'studio_director' THEN EXISTS (SELECT 1 FROM students s WHERE s.family_id = f.id AND s.tenant_id = p_tenant_id AND s.location_id = ANY(v_allowed_location_ids)) ELSE true END) AND (CASE WHEN v_role = 'teacher' THEN (v_teacher_row.id IS NOT NULL AND EXISTS (SELECT 1 FROM students s WHERE s.family_id = f.id AND s.teacher_id = v_teacher_row.id AND s.tenant_id = p_tenant_id)) ELSE true END) AND card_last_four IS NOT NULL),
      'autopay_enabled',     (SELECT COUNT(*) FROM families f WHERE f.tenant_id = p_tenant_id AND (CASE WHEN v_role = 'studio_director' THEN EXISTS (SELECT 1 FROM students s WHERE s.family_id = f.id AND s.tenant_id = p_tenant_id AND s.location_id = ANY(v_allowed_location_ids)) ELSE true END) AND (CASE WHEN v_role = 'teacher' THEN (v_teacher_row.id IS NOT NULL AND EXISTS (SELECT 1 FROM students s WHERE s.family_id = f.id AND s.teacher_id = v_teacher_row.id AND s.tenant_id = p_tenant_id)) ELSE true END) AND autopay_enabled = true),
      'military',            (SELECT COUNT(*) FROM families f WHERE f.tenant_id = p_tenant_id AND (CASE WHEN v_role = 'studio_director' THEN EXISTS (SELECT 1 FROM students s WHERE s.family_id = f.id AND s.tenant_id = p_tenant_id AND s.location_id = ANY(v_allowed_location_ids)) ELSE true END) AND (CASE WHEN v_role = 'teacher' THEN (v_teacher_row.id IS NOT NULL AND EXISTS (SELECT 1 FROM students s WHERE s.family_id = f.id AND s.teacher_id = v_teacher_row.id AND s.tenant_id = p_tenant_id)) ELSE true END) AND is_military = true),
      'total_overdue_cents', (SELECT COALESCE(SUM(overdue_balance_cents), 0) FROM families f WHERE f.tenant_id = p_tenant_id AND (CASE WHEN v_role = 'studio_director' THEN EXISTS (SELECT 1 FROM students s WHERE s.family_id = f.id AND s.tenant_id = p_tenant_id AND s.location_id = ANY(v_allowed_location_ids)) ELSE true END) AND (CASE WHEN v_role = 'teacher' THEN (v_teacher_row.id IS NOT NULL AND EXISTS (SELECT 1 FROM students s WHERE s.family_id = f.id AND s.teacher_id = v_teacher_row.id AND s.tenant_id = p_tenant_id)) ELSE true END)),
      'families_overdue',    (SELECT COUNT(*) FROM families f WHERE f.tenant_id = p_tenant_id AND (CASE WHEN v_role = 'studio_director' THEN EXISTS (SELECT 1 FROM students s WHERE s.family_id = f.id AND s.tenant_id = p_tenant_id AND s.location_id = ANY(v_allowed_location_ids)) ELSE true END) AND (CASE WHEN v_role = 'teacher' THEN (v_teacher_row.id IS NOT NULL AND EXISTS (SELECT 1 FROM students s WHERE s.family_id = f.id AND s.teacher_id = v_teacher_row.id AND s.tenant_id = p_tenant_id)) ELSE true END) AND overdue_balance_cents > 0),
      'sms_opted_out',       (SELECT COUNT(*) FROM families f WHERE f.tenant_id = p_tenant_id AND (CASE WHEN v_role = 'studio_director' THEN EXISTS (SELECT 1 FROM students s WHERE s.family_id = f.id AND s.tenant_id = p_tenant_id AND s.location_id = ANY(v_allowed_location_ids)) ELSE true END) AND (CASE WHEN v_role = 'teacher' THEN (v_teacher_row.id IS NOT NULL AND EXISTS (SELECT 1 FROM students s WHERE s.family_id = f.id AND s.teacher_id = v_teacher_row.id AND s.tenant_id = p_tenant_id)) ELSE true END) AND sms_opted_out = true)
    ),

    -- BILLING / REVENUE
    'billing', jsonb_build_object(
      'estimated_mrr_cents', (
        SELECT COALESCE(SUM(monthly_cents), 0) FROM student_effective_rate ser
        WHERE ser.tenant_id = p_tenant_id AND ser.status = 'active' AND (CASE WHEN v_role = 'studio_director' THEN ser.location_id = ANY(v_allowed_location_ids) ELSE true END) AND (CASE WHEN v_role = 'teacher' THEN (v_teacher_row.id IS NOT NULL AND EXISTS (SELECT 1 FROM students st WHERE st.id = ser.student_id AND st.teacher_id = v_teacher_row.id)) ELSE true END)
      ),
      'rate_tiers', (
        SELECT COALESCE(jsonb_agg(jsonb_build_object('rate_tier_cents', rate_tier, 'family_count', cnt) ORDER BY rate_tier DESC), '[]')
        FROM (
          SELECT rate_tier, COUNT(*) AS cnt FROM families f
          WHERE f.tenant_id = p_tenant_id AND f.rate_tier IS NOT NULL AND (CASE WHEN v_role = 'studio_director' THEN EXISTS (SELECT 1 FROM students s WHERE s.family_id = f.id AND s.tenant_id = p_tenant_id AND s.location_id = ANY(v_allowed_location_ids)) ELSE true END) AND (CASE WHEN v_role = 'teacher' THEN (v_teacher_row.id IS NOT NULL AND EXISTS (SELECT 1 FROM students s WHERE s.family_id = f.id AND s.teacher_id = v_teacher_row.id AND s.tenant_id = p_tenant_id)) ELSE true END)
          GROUP BY rate_tier
        ) t
      ),
      'mrr_by_location', (
        SELECT COALESCE(jsonb_agg(jsonb_build_object('location', loc_name, 'mrr_cents', loc_mrr) ORDER BY loc_mrr DESC), '[]')
        FROM (
          SELECT l.name AS loc_name, COALESCE(SUM(ser.monthly_cents), 0) AS loc_mrr
          FROM locations l
          LEFT JOIN student_effective_rate ser ON ser.location_id = l.id AND ser.tenant_id = p_tenant_id AND ser.status = 'active'
            AND (CASE WHEN v_role = 'teacher' THEN (v_teacher_row.id IS NOT NULL AND EXISTS (SELECT 1 FROM students st WHERE st.id = ser.student_id AND st.teacher_id = v_teacher_row.id)) ELSE true END)
          WHERE l.tenant_id = p_tenant_id AND l.is_active = true AND (CASE WHEN v_role = 'studio_director' THEN l.id = ANY(v_allowed_location_ids) ELSE true END) AND (CASE WHEN v_role = 'teacher' THEN EXISTS (SELECT 1 FROM students s WHERE s.location_id = l.id AND s.teacher_id = v_teacher_row.id AND s.tenant_id = p_tenant_id AND s.status = 'active') ELSE true END)
          GROUP BY l.name
        ) t
      ),
      'latest_billing_cycle', (
        SELECT jsonb_build_object(
          'label', bc.label,
          'status', bc.status,
          'total_base_cents', bc.total_base_cents,
          'total_adjusted_cents', bc.total_adjusted_cents,
          'total_paid_cents', bc.total_paid_cents,
          'billing_month', bc.billing_month
        )
        FROM billing_cycles bc
        WHERE bc.tenant_id = p_tenant_id
        ORDER BY bc.billing_month DESC LIMIT 1
      )
    ),

    -- TEACHERS
    'teachers', jsonb_build_object(
      'active',   (SELECT COUNT(*) FROM teachers t WHERE t.tenant_id = p_tenant_id AND t.is_active = true AND (CASE WHEN v_role = 'studio_director' THEN EXISTS (SELECT 1 FROM profile_locations plx WHERE plx.profile_id = t.profile_id AND plx.location_id = ANY(v_allowed_location_ids)) ELSE true END) AND (CASE WHEN v_role = 'teacher' THEN (v_teacher_row.id IS NOT NULL AND t.id = v_teacher_row.id) ELSE true END)),
      'inactive', (SELECT COUNT(*) FROM teachers t WHERE t.tenant_id = p_tenant_id AND t.is_active = false AND (CASE WHEN v_role = 'studio_director' THEN EXISTS (SELECT 1 FROM profile_locations plx WHERE plx.profile_id = t.profile_id AND plx.location_id = ANY(v_allowed_location_ids)) ELSE true END) AND (CASE WHEN v_role = 'teacher' THEN (v_teacher_row.id IS NOT NULL AND t.id = v_teacher_row.id) ELSE true END)),
      'no_students', (
        SELECT COUNT(*) FROM teachers t
        WHERE t.tenant_id = p_tenant_id AND t.is_active = true AND (CASE WHEN v_role = 'studio_director' THEN EXISTS (SELECT 1 FROM profile_locations plx WHERE plx.profile_id = t.profile_id AND plx.location_id = ANY(v_allowed_location_ids)) ELSE true END) AND (CASE WHEN v_role = 'teacher' THEN (v_teacher_row.id IS NOT NULL AND t.id = v_teacher_row.id) ELSE true END)
        AND NOT EXISTS (SELECT 1 FROM students s WHERE s.teacher_id = t.id AND s.status = 'active' AND (CASE WHEN v_role = 'studio_director' THEN s.location_id = ANY(v_allowed_location_ids) ELSE true END) AND (CASE WHEN v_role = 'teacher' THEN (v_teacher_row.id IS NOT NULL AND s.teacher_id = v_teacher_row.id) ELSE true END))
      ),
      'contract_missing', (
        SELECT COUNT(*) FROM teachers t
        WHERE t.tenant_id = p_tenant_id AND t.is_active = true
        AND (t.contract_status IS NULL OR t.contract_status NOT IN ('signed','complete'))
        AND (CASE WHEN v_role = 'studio_director' THEN EXISTS (SELECT 1 FROM profile_locations plx WHERE plx.profile_id = t.profile_id AND plx.location_id = ANY(v_allowed_location_ids)) ELSE true END)
        AND (CASE WHEN v_role = 'teacher' THEN (v_teacher_row.id IS NOT NULL AND t.id = v_teacher_row.id) ELSE true END)
      ),
      'w9_missing', (
        SELECT COUNT(*) FROM teachers t
        WHERE t.tenant_id = p_tenant_id AND t.is_active = true AND t.needs_1099 = true
        AND (t.w9_status IS NULL OR t.w9_status != 'complete')
        AND (CASE WHEN v_role = 'studio_director' THEN EXISTS (SELECT 1 FROM profile_locations plx WHERE plx.profile_id = t.profile_id AND plx.location_id = ANY(v_allowed_location_ids)) ELSE true END)
        AND (CASE WHEN v_role = 'teacher' THEN (v_teacher_row.id IS NOT NULL AND t.id = v_teacher_row.id) ELSE true END)
      ),
      'load_by_teacher', (
        SELECT COALESCE(jsonb_agg(jsonb_build_object(
          'name', teacher_name,
          'active_students', student_count,
          'instruments', instruments
        ) ORDER BY student_count DESC), '[]')
        FROM (
          SELECT
            t.first_name || ' ' || t.last_name AS teacher_name,
            COUNT(s.id) AS student_count,
            t.instruments
          FROM teachers t
          LEFT JOIN students s ON s.teacher_id = t.id AND s.status = 'active'
            AND (CASE WHEN v_role = 'studio_director' THEN s.location_id = ANY(v_allowed_location_ids) ELSE true END)
            AND (CASE WHEN v_role = 'teacher' THEN (v_teacher_row.id IS NULL OR s.teacher_id = v_teacher_row.id) ELSE true END)
          WHERE t.tenant_id = p_tenant_id AND t.is_active = true AND (CASE WHEN v_role = 'studio_director' THEN EXISTS (SELECT 1 FROM profile_locations plx WHERE plx.profile_id = t.profile_id AND plx.location_id = ANY(v_allowed_location_ids)) ELSE true END) AND (CASE WHEN v_role = 'teacher' THEN (v_teacher_row.id IS NOT NULL AND t.id = v_teacher_row.id) ELSE true END)
          GROUP BY t.id, t.first_name, t.last_name, t.instruments
        ) t
      ),
      'by_location', (
        SELECT COALESCE(jsonb_agg(jsonb_build_object('location', loc_name, 'teacher_count', cnt) ORDER BY cnt DESC), '[]')
        FROM (
          SELECT l.name AS loc_name, COUNT(DISTINCT pl.profile_id) AS cnt
          FROM profile_locations pl
          JOIN locations l ON l.id = pl.location_id
          WHERE l.tenant_id = p_tenant_id AND l.is_active = true AND (CASE WHEN v_role = 'studio_director' THEN l.id = ANY(v_allowed_location_ids) ELSE true END) AND (CASE WHEN v_role = 'teacher' THEN EXISTS (SELECT 1 FROM profile_locations pl2 WHERE pl2.profile_id = v_profile_id AND pl2.location_id = l.id) ELSE true END)
          GROUP BY l.name
        ) t
      )
    ),

    -- SCHEDULE
    'schedule', jsonb_build_object(
      'booked_this_week', (
        SELECT COUNT(*) FROM schedule_blocks sb WHERE sb.tenant_id = p_tenant_id AND sb.block_date BETWEEN CURRENT_DATE AND CURRENT_DATE + 6 AND sb.status = 'booked' AND (CASE WHEN v_role = 'studio_director' THEN sb.location_id = ANY(v_allowed_location_ids) ELSE true END) AND (CASE WHEN v_role = 'teacher' THEN (v_teacher_row.id IS NOT NULL AND sb.teacher_id = v_teacher_row.id) ELSE true END)
      ),
      'available_this_week', (
        SELECT COUNT(*) FROM schedule_blocks sb WHERE sb.tenant_id = p_tenant_id AND sb.block_date BETWEEN CURRENT_DATE AND CURRENT_DATE + 6 AND sb.status = 'available' AND (CASE WHEN v_role = 'studio_director' THEN sb.location_id = ANY(v_allowed_location_ids) ELSE true END) AND (CASE WHEN v_role = 'teacher' THEN (v_teacher_row.id IS NOT NULL AND sb.teacher_id = v_teacher_row.id) ELSE true END)
      ),
      'booked_this_month', (
        SELECT COUNT(*) FROM schedule_blocks sb WHERE sb.tenant_id = p_tenant_id
        AND sb.block_date BETWEEN DATE_TRUNC('month', CURRENT_DATE) AND (DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '1 month' - INTERVAL '1 day')
        AND sb.status = 'booked' AND (CASE WHEN v_role = 'studio_director' THEN sb.location_id = ANY(v_allowed_location_ids) ELSE true END) AND (CASE WHEN v_role = 'teacher' THEN (v_teacher_row.id IS NOT NULL AND sb.teacher_id = v_teacher_row.id) ELSE true END)
      ),
      'callouts_this_week', (
        SELECT COUNT(*) FROM schedule_blocks sb WHERE sb.tenant_id = p_tenant_id AND sb.block_date BETWEEN CURRENT_DATE AND CURRENT_DATE + 6 AND sb.block_type = 'call_out' AND (CASE WHEN v_role = 'studio_director' THEN sb.location_id = ANY(v_allowed_location_ids) ELSE true END) AND (CASE WHEN v_role = 'teacher' THEN (v_teacher_row.id IS NOT NULL AND sb.teacher_id = v_teacher_row.id) ELSE true END)
      ),
      'utilization_pct', (
        SELECT CASE WHEN (booked + avail) = 0 THEN 0
          ELSE ROUND(booked::numeric / (booked + avail) * 100, 1) END
        FROM (
          SELECT
            COUNT(CASE WHEN sb.status = 'booked' THEN 1 END) AS booked,
            COUNT(CASE WHEN sb.status = 'available' THEN 1 END) AS avail
          FROM schedule_blocks sb
          WHERE sb.tenant_id = p_tenant_id AND sb.block_date BETWEEN CURRENT_DATE AND CURRENT_DATE + 6 AND (CASE WHEN v_role = 'studio_director' THEN sb.location_id = ANY(v_allowed_location_ids) ELSE true END) AND (CASE WHEN v_role = 'teacher' THEN (v_teacher_row.id IS NOT NULL AND sb.teacher_id = v_teacher_row.id) ELSE true END)
        ) t
      ),
      'by_location_this_week', (
        SELECT COALESCE(jsonb_agg(jsonb_build_object('location', loc_name, 'booked', booked, 'available', avail) ORDER BY booked DESC), '[]')
        FROM (
          SELECT l.name AS loc_name,
            COUNT(CASE WHEN sb.status = 'booked' THEN 1 END) AS booked,
            COUNT(CASE WHEN sb.status = 'available' THEN 1 END) AS avail
          FROM schedule_blocks sb JOIN locations l ON l.id = sb.location_id
          WHERE sb.tenant_id = p_tenant_id AND sb.block_date BETWEEN CURRENT_DATE AND CURRENT_DATE + 6 AND (CASE WHEN v_role = 'studio_director' THEN sb.location_id = ANY(v_allowed_location_ids) ELSE true END) AND (CASE WHEN v_role = 'teacher' THEN (v_teacher_row.id IS NOT NULL AND sb.teacher_id = v_teacher_row.id) ELSE true END)
          GROUP BY l.name
        ) t
      )
    ),

    -- LEADS
    'leads', jsonb_build_object(
      'active_total',          (SELECT COUNT(*) FROM leads ld WHERE ld.tenant_id = p_tenant_id AND (CASE WHEN v_role = 'studio_director' THEN ld.location_id = ANY(v_allowed_location_ids) ELSE true END) AND (CASE WHEN v_role = 'teacher' THEN (v_teacher_row.id IS NOT NULL AND (ld.assigned_teacher_id = v_teacher_row.id OR ld.matched_teacher_id = v_teacher_row.id)) ELSE true END) AND ld.stage NOT IN ('enrolled','lost')),
      'needing_followup',      (SELECT COUNT(*) FROM leads ld WHERE ld.tenant_id = p_tenant_id AND (CASE WHEN v_role = 'studio_director' THEN ld.location_id = ANY(v_allowed_location_ids) ELSE true END) AND (CASE WHEN v_role = 'teacher' THEN (v_teacher_row.id IS NOT NULL AND (ld.assigned_teacher_id = v_teacher_row.id OR ld.matched_teacher_id = v_teacher_row.id)) ELSE true END) AND ld.stage NOT IN ('enrolled','lost') AND (ld.next_follow_up_at < NOW() OR ld.next_follow_up_at IS NULL)),
      'new_last_7_days',       (SELECT COUNT(*) FROM leads ld WHERE ld.tenant_id = p_tenant_id AND (CASE WHEN v_role = 'studio_director' THEN ld.location_id = ANY(v_allowed_location_ids) ELSE true END) AND (CASE WHEN v_role = 'teacher' THEN (v_teacher_row.id IS NOT NULL AND (ld.assigned_teacher_id = v_teacher_row.id OR ld.matched_teacher_id = v_teacher_row.id)) ELSE true END) AND ld.created_at >= NOW() - INTERVAL '7 days'),
      'new_last_30_days',      (SELECT COUNT(*) FROM leads ld WHERE ld.tenant_id = p_tenant_id AND (CASE WHEN v_role = 'studio_director' THEN ld.location_id = ANY(v_allowed_location_ids) ELSE true END) AND (CASE WHEN v_role = 'teacher' THEN (v_teacher_row.id IS NOT NULL AND (ld.assigned_teacher_id = v_teacher_row.id OR ld.matched_teacher_id = v_teacher_row.id)) ELSE true END) AND ld.created_at >= NOW() - INTERVAL '30 days'),
      'converted_last_30_days',(SELECT COUNT(*) FROM leads ld WHERE ld.tenant_id = p_tenant_id AND (CASE WHEN v_role = 'studio_director' THEN ld.location_id = ANY(v_allowed_location_ids) ELSE true END) AND (CASE WHEN v_role = 'teacher' THEN (v_teacher_row.id IS NOT NULL AND (ld.assigned_teacher_id = v_teacher_row.id OR ld.matched_teacher_id = v_teacher_row.id)) ELSE true END) AND ld.stage = 'enrolled' AND ld.updated_at >= NOW() - INTERVAL '30 days'),
      'lost_last_30_days',     (SELECT COUNT(*) FROM leads ld WHERE ld.tenant_id = p_tenant_id AND (CASE WHEN v_role = 'studio_director' THEN ld.location_id = ANY(v_allowed_location_ids) ELSE true END) AND (CASE WHEN v_role = 'teacher' THEN (v_teacher_row.id IS NOT NULL AND (ld.assigned_teacher_id = v_teacher_row.id OR ld.matched_teacher_id = v_teacher_row.id)) ELSE true END) AND ld.stage = 'lost' AND ld.updated_at >= NOW() - INTERVAL '30 days'),
      'by_stage', (
        SELECT COALESCE(jsonb_agg(jsonb_build_object('stage', stage::text, 'count', cnt)), '[]')
        FROM (SELECT ld.stage, COUNT(*) AS cnt FROM leads ld WHERE ld.tenant_id = p_tenant_id AND (CASE WHEN v_role = 'studio_director' THEN ld.location_id = ANY(v_allowed_location_ids) ELSE true END) AND (CASE WHEN v_role = 'teacher' THEN (v_teacher_row.id IS NOT NULL AND (ld.assigned_teacher_id = v_teacher_row.id OR ld.matched_teacher_id = v_teacher_row.id)) ELSE true END) AND ld.stage != 'lost' GROUP BY ld.stage) t
      ),
      'by_instrument', (
        SELECT COALESCE(jsonb_agg(jsonb_build_object('instrument', instrument, 'count', cnt) ORDER BY cnt DESC), '[]')
        FROM (
          SELECT ld.instrument, COUNT(*) AS cnt FROM leads ld
          WHERE ld.tenant_id = p_tenant_id AND (CASE WHEN v_role = 'studio_director' THEN ld.location_id = ANY(v_allowed_location_ids) ELSE true END) AND (CASE WHEN v_role = 'teacher' THEN (v_teacher_row.id IS NOT NULL AND (ld.assigned_teacher_id = v_teacher_row.id OR ld.matched_teacher_id = v_teacher_row.id)) ELSE true END) AND ld.stage NOT IN ('enrolled','lost') AND ld.instrument IS NOT NULL
          GROUP BY ld.instrument ORDER BY cnt DESC
        ) t
      ),
      'by_location', (
        SELECT COALESCE(jsonb_agg(jsonb_build_object('location', loc_name, 'count', cnt) ORDER BY cnt DESC), '[]')
        FROM (
          SELECT l.name AS loc_name, COUNT(*) AS cnt
          FROM leads ld JOIN locations l ON l.id = ld.location_id
          WHERE ld.tenant_id = p_tenant_id AND (CASE WHEN v_role = 'studio_director' THEN ld.location_id = ANY(v_allowed_location_ids) ELSE true END) AND (CASE WHEN v_role = 'teacher' THEN (v_teacher_row.id IS NOT NULL AND (ld.assigned_teacher_id = v_teacher_row.id OR ld.matched_teacher_id = v_teacher_row.id)) ELSE true END) AND ld.stage NOT IN ('enrolled','lost')
          GROUP BY l.name ORDER BY cnt DESC
        ) t
      )
    ),

    -- SESSIONS
    'sessions', jsonb_build_object(
      'total_last_30_days', (SELECT COUNT(*) FROM session_log sl WHERE sl.tenant_id = p_tenant_id AND (CASE WHEN v_role = 'studio_director' THEN sl.location_id = ANY(v_allowed_location_ids) ELSE true END) AND (CASE WHEN v_role = 'teacher' THEN (v_teacher_row.id IS NOT NULL AND sl.teacher_id = v_teacher_row.id) ELSE true END) AND sl.block_date >= CURRENT_DATE - 30),
      'total_last_7_days',  (SELECT COUNT(*) FROM session_log sl WHERE sl.tenant_id = p_tenant_id AND (CASE WHEN v_role = 'studio_director' THEN sl.location_id = ANY(v_allowed_location_ids) ELSE true END) AND (CASE WHEN v_role = 'teacher' THEN (v_teacher_row.id IS NOT NULL AND sl.teacher_id = v_teacher_row.id) ELSE true END) AND sl.block_date >= CURRENT_DATE - 7),
      'notes_written_last_7_days', (
        SELECT COUNT(*) FROM session_log sl
        WHERE sl.tenant_id = p_tenant_id AND (CASE WHEN v_role = 'studio_director' THEN sl.location_id = ANY(v_allowed_location_ids) ELSE true END) AND (CASE WHEN v_role = 'teacher' THEN (v_teacher_row.id IS NOT NULL AND sl.teacher_id = v_teacher_row.id) ELSE true END) AND sl.block_date >= CURRENT_DATE - 7 AND sl.lesson_notes IS NOT NULL AND sl.lesson_notes != ''
      ),
      'avg_engagement_last_30_days', (
        SELECT ROUND(AVG(sl.engagement_level)::numeric, 1)
        FROM session_log sl WHERE sl.tenant_id = p_tenant_id AND (CASE WHEN v_role = 'studio_director' THEN sl.location_id = ANY(v_allowed_location_ids) ELSE true END) AND (CASE WHEN v_role = 'teacher' THEN (v_teacher_row.id IS NOT NULL AND sl.teacher_id = v_teacher_row.id) ELSE true END) AND sl.block_date >= CURRENT_DATE - 30 AND sl.engagement_level IS NOT NULL
      ),
      'by_location_last_30_days', (
        SELECT COALESCE(jsonb_agg(jsonb_build_object('location', loc_name, 'sessions', cnt) ORDER BY cnt DESC), '[]')
        FROM (
          SELECT l.name AS loc_name, COUNT(*) AS cnt
          FROM session_log sl JOIN locations l ON l.id = sl.location_id
          WHERE sl.tenant_id = p_tenant_id AND (CASE WHEN v_role = 'studio_director' THEN sl.location_id = ANY(v_allowed_location_ids) ELSE true END) AND (CASE WHEN v_role = 'teacher' THEN (v_teacher_row.id IS NOT NULL AND sl.teacher_id = v_teacher_row.id) ELSE true END) AND sl.block_date >= CURRENT_DATE - 30
          GROUP BY l.name ORDER BY cnt DESC
        ) t
      )
    ),

    -- RETENTION
    'retention', jsonb_build_object(
      'students_paused',             (SELECT COUNT(*) FROM students s WHERE s.tenant_id = p_tenant_id AND (CASE WHEN v_role = 'studio_director' THEN s.location_id = ANY(v_allowed_location_ids) ELSE true END) AND (CASE WHEN v_role = 'teacher' THEN (v_teacher_row.id IS NOT NULL AND s.teacher_id = v_teacher_row.id) ELSE true END) AND s.status = 'paused'),
      'students_may_return',         (SELECT COUNT(*) FROM students s WHERE s.tenant_id = p_tenant_id AND (CASE WHEN v_role = 'studio_director' THEN s.location_id = ANY(v_allowed_location_ids) ELSE true END) AND (CASE WHEN v_role = 'teacher' THEN (v_teacher_row.id IS NOT NULL AND s.teacher_id = v_teacher_row.id) ELSE true END) AND s.may_return = 'yes'),
      'students_inactive_last_60_days', (
        SELECT COUNT(*) FROM students s WHERE s.tenant_id = p_tenant_id AND (CASE WHEN v_role = 'studio_director' THEN s.location_id = ANY(v_allowed_location_ids) ELSE true END) AND (CASE WHEN v_role = 'teacher' THEN (v_teacher_row.id IS NOT NULL AND s.teacher_id = v_teacher_row.id) ELSE true END)
        AND s.status IN ('inactive','former') AND s.deactivated_at >= NOW() - INTERVAL '60 days'
      ),
      'active_campaigns',            (SELECT COUNT(*) FROM retention_campaigns rc WHERE rc.tenant_id = p_tenant_id AND rc.status = 'pending' AND (CASE WHEN v_role = 'studio_director' THEN (rc.location_id IS NULL OR rc.location_id = ANY(v_allowed_location_ids)) ELSE true END) AND (CASE WHEN v_role = 'teacher' THEN EXISTS (SELECT 1 FROM students s WHERE s.id = rc.student_id AND s.teacher_id = v_teacher_row.id) ELSE true END)),
      'sent_campaigns_last_30_days', (SELECT COUNT(*) FROM retention_campaigns rc WHERE rc.tenant_id = p_tenant_id AND (CASE WHEN v_role = 'studio_director' THEN (rc.location_id IS NULL OR rc.location_id = ANY(v_allowed_location_ids)) ELSE true END) AND (CASE WHEN v_role = 'teacher' THEN EXISTS (SELECT 1 FROM students s WHERE s.id = rc.student_id AND s.teacher_id = v_teacher_row.id) ELSE true END) AND rc.sent_at >= NOW() - INTERVAL '30 days')
    ),

    -- TASKS
    'tasks', jsonb_build_object(
      'open',               (SELECT COUNT(*) FROM tasks tk WHERE tk.tenant_id = p_tenant_id AND tk.status = 'open' AND (CASE WHEN v_role = 'studio_director' THEN (tk.location_id IS NULL OR tk.location_id = ANY(v_allowed_location_ids)) ELSE true END) AND (CASE WHEN v_role = 'teacher' THEN (tk.assigned_to = v_uid OR tk.location_id IN (SELECT DISTINCT s.location_id FROM students s WHERE s.teacher_id = v_teacher_row.id AND s.tenant_id = p_tenant_id AND s.status = 'active')) ELSE true END)),
      'overdue',            (SELECT COUNT(*) FROM tasks tk WHERE tk.tenant_id = p_tenant_id AND tk.status = 'open' AND (CASE WHEN v_role = 'studio_director' THEN (tk.location_id IS NULL OR tk.location_id = ANY(v_allowed_location_ids)) ELSE true END) AND (CASE WHEN v_role = 'teacher' THEN (tk.assigned_to = v_uid OR tk.location_id IN (SELECT DISTINCT s.location_id FROM students s WHERE s.teacher_id = v_teacher_row.id AND s.tenant_id = p_tenant_id AND s.status = 'active')) ELSE true END) AND tk.due_date < CURRENT_DATE),
      'high_priority_open', (SELECT COUNT(*) FROM tasks tk WHERE tk.tenant_id = p_tenant_id AND tk.status = 'open' AND (CASE WHEN v_role = 'studio_director' THEN (tk.location_id IS NULL OR tk.location_id = ANY(v_allowed_location_ids)) ELSE true END) AND (CASE WHEN v_role = 'teacher' THEN (tk.assigned_to = v_uid OR tk.location_id IN (SELECT DISTINCT s.location_id FROM students s WHERE s.teacher_id = v_teacher_row.id AND s.tenant_id = p_tenant_id AND s.status = 'active')) ELSE true END) AND tk.priority = 'high')
    ),

    -- LOCATIONS (per-location breakdown)
    'locations', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', l.id,
        'name', l.name,
        'active_students',   (SELECT COUNT(*) FROM students s WHERE s.location_id = l.id AND s.status = 'active' AND (CASE WHEN v_role = 'studio_director' THEN s.location_id = ANY(v_allowed_location_ids) ELSE true END) AND (CASE WHEN v_role = 'teacher' THEN (v_teacher_row.id IS NOT NULL AND s.teacher_id = v_teacher_row.id) ELSE true END)),
        'active_teachers',   (SELECT COUNT(DISTINCT t.id) FROM teachers t JOIN profile_locations pl ON pl.profile_id = t.profile_id WHERE pl.location_id = l.id AND t.is_active = true AND (CASE WHEN v_role = 'studio_director' THEN EXISTS (SELECT 1 FROM profile_locations plx WHERE plx.profile_id = t.profile_id AND plx.location_id = ANY(v_allowed_location_ids)) ELSE true END) AND (CASE WHEN v_role = 'teacher' THEN (v_teacher_row.id IS NOT NULL AND t.id = v_teacher_row.id) ELSE true END)),
        'booked_this_week',  (SELECT COUNT(*) FROM schedule_blocks sb WHERE sb.location_id = l.id AND sb.block_date BETWEEN CURRENT_DATE AND CURRENT_DATE + 6 AND sb.status = 'booked' AND (CASE WHEN v_role = 'studio_director' THEN sb.location_id = ANY(v_allowed_location_ids) ELSE true END) AND (CASE WHEN v_role = 'teacher' THEN (v_teacher_row.id IS NOT NULL AND sb.teacher_id = v_teacher_row.id) ELSE true END)),
        'available_this_week',(SELECT COUNT(*) FROM schedule_blocks sb WHERE sb.location_id = l.id AND sb.block_date BETWEEN CURRENT_DATE AND CURRENT_DATE + 6 AND sb.status = 'available' AND (CASE WHEN v_role = 'studio_director' THEN sb.location_id = ANY(v_allowed_location_ids) ELSE true END) AND (CASE WHEN v_role = 'teacher' THEN (v_teacher_row.id IS NOT NULL AND sb.teacher_id = v_teacher_row.id) ELSE true END)),
        'mrr_cents',         (SELECT COALESCE(SUM(ser.monthly_cents),0) FROM student_effective_rate ser WHERE ser.location_id = l.id AND ser.tenant_id = p_tenant_id AND ser.status = 'active' AND (CASE WHEN v_role = 'studio_director' THEN ser.location_id = ANY(v_allowed_location_ids) ELSE true END) AND (CASE WHEN v_role = 'teacher' THEN (v_teacher_row.id IS NOT NULL AND EXISTS (SELECT 1 FROM students st WHERE st.id = ser.student_id AND st.teacher_id = v_teacher_row.id)) ELSE true END))
      ) ORDER BY l.name), '[]')
      FROM locations l WHERE l.tenant_id = p_tenant_id AND l.is_active = true AND (CASE WHEN v_role = 'studio_director' THEN l.id = ANY(v_allowed_location_ids) ELSE true END) AND (CASE WHEN v_role = 'teacher' THEN EXISTS (SELECT 1 FROM students s WHERE s.location_id = l.id AND s.teacher_id = v_teacher_row.id AND s.tenant_id = p_tenant_id AND s.status = 'active') ELSE true END)
    ),

    -- COMMUNICATIONS
    'communications', jsonb_build_object(
      'sent_last_7_days',  (SELECT COUNT(*) FROM communications c WHERE c.tenant_id = p_tenant_id AND (CASE WHEN v_role = 'studio_director' THEN EXISTS (SELECT 1 FROM students s WHERE s.tenant_id = p_tenant_id AND s.location_id = ANY(v_allowed_location_ids) AND ((c.student_id IS NOT NULL AND c.student_id = s.id) OR (c.family_id IS NOT NULL AND s.family_id = c.family_id))) ELSE true END) AND (CASE WHEN v_role = 'teacher' THEN (c.teacher_id = v_teacher_row.id OR EXISTS (SELECT 1 FROM students s WHERE s.id = c.student_id AND s.teacher_id = v_teacher_row.id) OR EXISTS (SELECT 1 FROM students s WHERE c.family_id IS NOT NULL AND s.family_id = c.family_id AND s.teacher_id = v_teacher_row.id)) ELSE true END) AND c.sent_at >= NOW() - INTERVAL '7 days'),
      'sent_last_30_days', (SELECT COUNT(*) FROM communications c WHERE c.tenant_id = p_tenant_id AND (CASE WHEN v_role = 'studio_director' THEN EXISTS (SELECT 1 FROM students s WHERE s.tenant_id = p_tenant_id AND s.location_id = ANY(v_allowed_location_ids) AND ((c.student_id IS NOT NULL AND c.student_id = s.id) OR (c.family_id IS NOT NULL AND s.family_id = c.family_id))) ELSE true END) AND (CASE WHEN v_role = 'teacher' THEN (c.teacher_id = v_teacher_row.id OR EXISTS (SELECT 1 FROM students s WHERE s.id = c.student_id AND s.teacher_id = v_teacher_row.id) OR EXISTS (SELECT 1 FROM students s WHERE c.family_id IS NOT NULL AND s.family_id = c.family_id AND s.teacher_id = v_teacher_row.id)) ELSE true END) AND c.sent_at >= NOW() - INTERVAL '30 days')
    ),

    -- PAYROLL
    'payroll', jsonb_build_object(
      'latest_period', (
        SELECT jsonb_build_object(
          'period_id',   pp.id,
          'period_label', pp.period_label,
          'start_date',  pp.start_date,
          'end_date',    pp.end_date,
          'is_closed',   pp.is_closed
        )
        FROM payroll_periods pp
        WHERE pp.tenant_id = p_tenant_id
        ORDER BY pp.created_at DESC LIMIT 1
      )
    )

  ) INTO v_result;