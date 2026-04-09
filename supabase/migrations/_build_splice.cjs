const fs = require("fs");
const path = require("path");
const defPath = path.join(__dirname, "_def.json");
const buf = fs.readFileSync(defPath);
const jsonText =
  buf[0] === 0xff && buf[1] === 0xfe ? buf.slice(2).toString("utf16le") : buf.toString("utf8");
const d = JSON.parse(jsonText.replace(/^\uFEFF/, ""))[0].d;
const m = d.match(/BEGIN\s*\n\s*(SELECT jsonb_build_object[\s\S]+?)\s+INTO v_result;/);
if (!m) throw new Error("Could not extract SELECT ... INTO v_result");
let sel = m[1].replace(/\\u003e/g, ">").replace(/\\u003c/g, "<");

const STU = ` AND (CASE WHEN v_role = 'studio_director' THEN s.location_id = ANY(v_allowed_location_ids) ELSE true END) AND (CASE WHEN v_role = 'teacher' THEN (v_teacher_row.id IS NOT NULL AND s.teacher_id = v_teacher_row.id) ELSE true END)`;

// --- students: unaliased -> s + scope ---
sel = sel.replace(
  /FROM students WHERE tenant_id = p_tenant_id/g,
  `FROM students s WHERE s.tenant_id = p_tenant_id${STU}`
);

// by_instrument block
sel = sel.replace(
  /FROM students\n          WHERE tenant_id = p_tenant_id AND status = 'active'/g,
  `FROM students s\n          WHERE s.tenant_id = p_tenant_id AND s.status = 'active'${STU}`
);

// at_risk (already s)
sel = sel.replace(
  /WHERE s\.tenant_id = p_tenant_id AND s\.status = 'active'\n        AND NOT EXISTS/,
  `WHERE s.tenant_id = p_tenant_id AND s.status = 'active'${STU}\n        AND NOT EXISTS`
);

// by_location inner
sel = sel.replace(
  /WHERE s\.tenant_id = p_tenant_id AND s\.status = 'active'\n          GROUP BY l\.name/,
  `WHERE s.tenant_id = p_tenant_id AND s.status = 'active'${STU}\n          GROUP BY l.name`
);

const FAM_SCOPE = ` AND (CASE WHEN v_role = 'studio_director' THEN EXISTS (SELECT 1 FROM students s WHERE s.family_id = f.id AND s.tenant_id = p_tenant_id AND s.location_id = ANY(v_allowed_location_ids)) ELSE true END) AND (CASE WHEN v_role = 'teacher' THEN (v_teacher_row.id IS NOT NULL AND EXISTS (SELECT 1 FROM students s WHERE s.family_id = f.id AND s.teacher_id = v_teacher_row.id AND s.tenant_id = p_tenant_id)) ELSE true END)`;
sel = sel.replace(/FROM families WHERE tenant_id = p_tenant_id/g, `FROM families f WHERE f.tenant_id = p_tenant_id${FAM_SCOPE}`);

const SER_SCOPE = ` AND (CASE WHEN v_role = 'studio_director' THEN ser.location_id = ANY(v_allowed_location_ids) ELSE true END) AND (CASE WHEN v_role = 'teacher' THEN (v_teacher_row.id IS NOT NULL AND EXISTS (SELECT 1 FROM students st WHERE st.id = ser.student_id AND st.teacher_id = v_teacher_row.id)) ELSE true END)`;
sel = sel.replace(
  /FROM student_effective_rate\n        WHERE tenant_id = p_tenant_id AND status = 'active'/g,
  `FROM student_effective_rate ser\n        WHERE ser.tenant_id = p_tenant_id AND ser.status = 'active'${SER_SCOPE}`
);

const LOC_MRR = ` AND (CASE WHEN v_role = 'studio_director' THEN l.id = ANY(v_allowed_location_ids) ELSE true END) AND (CASE WHEN v_role = 'teacher' THEN EXISTS (SELECT 1 FROM students s WHERE s.location_id = l.id AND s.teacher_id = v_teacher_row.id AND s.tenant_id = p_tenant_id AND s.status = 'active') ELSE true END)`;
sel = sel.replace(
  /WHERE l\.tenant_id = p_tenant_id AND l\.is_active = true\n          GROUP BY l\.name\n        \) t\n      \),/g,
  `WHERE l.tenant_id = p_tenant_id AND l.is_active = true${LOC_MRR}\n          GROUP BY l.name\n        ) t\n      ),`
);

sel = sel.replace(
  /SELECT rate_tier, COUNT\(\*\) AS cnt FROM families\n          WHERE tenant_id = p_tenant_id AND rate_tier IS NOT NULL/g,
  `SELECT rate_tier, COUNT(*) AS cnt FROM families f\n          WHERE f.tenant_id = p_tenant_id AND f.rate_tier IS NOT NULL${FAM_SCOPE}`
);

const TCH_STU = ` AND (CASE WHEN v_role = 'studio_director' THEN EXISTS (SELECT 1 FROM profile_locations plx WHERE plx.profile_id = t.profile_id AND plx.location_id = ANY(v_allowed_location_ids)) ELSE true END) AND (CASE WHEN v_role = 'teacher' THEN (v_teacher_row.id IS NOT NULL AND t.id = v_teacher_row.id) ELSE true END)`;

sel = sel.replace(
  /\(SELECT COUNT\(\*\) FROM teachers WHERE tenant_id = p_tenant_id AND is_active = true\)/g,
  `(SELECT COUNT(*) FROM teachers t WHERE t.tenant_id = p_tenant_id AND t.is_active = true${TCH_STU})`
);
sel = sel.replace(
  /\(SELECT COUNT\(\*\) FROM teachers WHERE tenant_id = p_tenant_id AND is_active = false\)/g,
  `(SELECT COUNT(*) FROM teachers t WHERE t.tenant_id = p_tenant_id AND t.is_active = false${TCH_STU})`
);

sel = sel.replace(
  /WHERE t\.tenant_id = p_tenant_id AND t\.is_active = true\n        AND NOT EXISTS \(SELECT 1 FROM students s WHERE s\.teacher_id = t\.id AND s\.status = 'active'\)/g,
  `WHERE t.tenant_id = p_tenant_id AND t.is_active = true${TCH_STU}\n        AND NOT EXISTS (SELECT 1 FROM students s WHERE s.teacher_id = t.id AND s.status = 'active'${STU})`
);

sel = sel.replace(
  /\(SELECT COUNT\(\*\) FROM teachers\n        WHERE tenant_id = p_tenant_id AND is_active = true\n        AND \(contract_status IS NULL OR contract_status NOT IN \('signed','complete'\)\)\)/g,
  `(SELECT COUNT(*) FROM teachers t\n        WHERE t.tenant_id = p_tenant_id AND t.is_active = true${TCH_STU}\n        AND (t.contract_status IS NULL OR t.contract_status NOT IN ('signed','complete')))`
);
sel = sel.replace(
  /\(SELECT COUNT\(\*\) FROM teachers\n        WHERE tenant_id = p_tenant_id AND is_active = true AND needs_1099 = true\n        AND \(w9_status IS NULL OR w9_status != 'complete'\)\)/g,
  `(SELECT COUNT(*) FROM teachers t\n        WHERE t.tenant_id = p_tenant_id AND t.is_active = true AND t.needs_1099 = true${TCH_STU}\n        AND (t.w9_status IS NULL OR t.w9_status != 'complete'))`
);

sel = sel.replace(
  /WHERE t\.tenant_id = p_tenant_id AND t\.is_active = true\n          GROUP BY t\.id, t\.first_name, t\.last_name, t\.instruments/g,
  `WHERE t.tenant_id = p_tenant_id AND t.is_active = true${TCH_STU}\n          GROUP BY t.id, t.first_name, t.last_name, t.instruments`
);
sel = sel.replace(
  /LEFT JOIN students s ON s\.teacher_id = t\.id AND s\.status = 'active'\n          WHERE t\.tenant_id = p_tenant_id AND t\.is_active = true\n          GROUP BY t\.id/,
  `LEFT JOIN students s ON s.teacher_id = t.id AND s.status = 'active' AND (CASE WHEN v_role != 'teacher' OR v_teacher_row.id IS NULL OR s.teacher_id = v_teacher_row.id THEN true ELSE false END)\n          WHERE t.tenant_id = p_tenant_id AND t.is_active = true${TCH_STU}\n          GROUP BY t.id`
);

const PL_LOC = ` AND (CASE WHEN v_role = 'studio_director' THEN l.id = ANY(v_allowed_location_ids) ELSE true END) AND (CASE WHEN v_role = 'teacher' THEN EXISTS (SELECT 1 FROM profile_locations pl2 WHERE pl2.profile_id = v_profile_id AND pl2.location_id = l.id) ELSE true END)`;
sel = sel.replace(
  /WHERE l\.tenant_id = p_tenant_id AND l\.is_active = true\n          GROUP BY l\.name\n        \) t\n      \)\n    \),/g,
  `WHERE l.tenant_id = p_tenant_id AND l.is_active = true${PL_LOC}\n          GROUP BY l.name\n        ) t\n      )\n    ),`
);

const SB_SCOPE = ` AND (CASE WHEN v_role = 'studio_director' THEN sb.location_id = ANY(v_allowed_location_ids) ELSE true END) AND (CASE WHEN v_role = 'teacher' THEN (v_teacher_row.id IS NOT NULL AND sb.teacher_id = v_teacher_row.id) ELSE true END)`;
sel = sel.replace(
  /FROM schedule_blocks\n        WHERE tenant_id = p_tenant_id AND block_date BETWEEN CURRENT_DATE AND CURRENT_DATE \+ 6 AND status = 'booked'/g,
  `FROM schedule_blocks sb WHERE sb.tenant_id = p_tenant_id AND sb.block_date BETWEEN CURRENT_DATE AND CURRENT_DATE + 6 AND sb.status = 'booked'${SB_SCOPE}`
);
sel = sel.replace(
  /FROM schedule_blocks\n        WHERE tenant_id = p_tenant_id AND block_date BETWEEN CURRENT_DATE AND CURRENT_DATE \+ 6 AND status = 'available'/g,
  `FROM schedule_blocks sb WHERE sb.tenant_id = p_tenant_id AND sb.block_date BETWEEN CURRENT_DATE AND CURRENT_DATE + 6 AND sb.status = 'available'${SB_SCOPE}`
);
sel = sel.replace(
  /FROM schedule_blocks\n        WHERE tenant_id = p_tenant_id\n        AND block_date BETWEEN DATE_TRUNC\('month', CURRENT_DATE\) AND \(DATE_TRUNC\('month', CURRENT_DATE\) \+ INTERVAL '1 month' - INTERVAL '1 day'\)\n        AND status = 'booked'/g,
  `FROM schedule_blocks sb WHERE sb.tenant_id = p_tenant_id\n        AND sb.block_date BETWEEN DATE_TRUNC('month', CURRENT_DATE) AND (DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '1 month' - INTERVAL '1 day')\n        AND sb.status = 'booked'${SB_SCOPE}`
);
sel = sel.replace(
  /FROM schedule_blocks\n        WHERE tenant_id = p_tenant_id AND block_date BETWEEN CURRENT_DATE AND CURRENT_DATE \+ 6 AND block_type = 'call_out'/g,
  `FROM schedule_blocks sb WHERE sb.tenant_id = p_tenant_id AND sb.block_date BETWEEN CURRENT_DATE AND CURRENT_DATE + 6 AND sb.block_type = 'call_out'${SB_SCOPE}`
);
sel = sel.replace(
  /FROM schedule_blocks\n          WHERE tenant_id = p_tenant_id AND block_date BETWEEN CURRENT_DATE AND CURRENT_DATE \+ 6\n        \) t/g,
  `FROM schedule_blocks sb\n          WHERE sb.tenant_id = p_tenant_id AND sb.block_date BETWEEN CURRENT_DATE AND CURRENT_DATE + 6${SB_SCOPE}\n        ) t`
);
sel = sel.replace(
  /WHERE sb\.tenant_id = p_tenant_id AND sb\.block_date BETWEEN CURRENT_DATE AND CURRENT_DATE \+ 6\n          GROUP BY l\.name/g,
  `WHERE sb.tenant_id = p_tenant_id AND sb.block_date BETWEEN CURRENT_DATE AND CURRENT_DATE + 6${SB_SCOPE}\n          GROUP BY l.name`
);

const LD_SCOPE = ` AND (CASE WHEN v_role = 'studio_director' THEN ld.location_id = ANY(v_allowed_location_ids) ELSE true END) AND (CASE WHEN v_role = 'teacher' THEN (v_teacher_row.id IS NOT NULL AND (ld.assigned_teacher_id = v_teacher_row.id OR ld.matched_teacher_id = v_teacher_row.id)) ELSE true END)`;
sel = sel.replace(/FROM leads WHERE tenant_id = p_tenant_id/g, `FROM leads ld WHERE ld.tenant_id = p_tenant_id${LD_SCOPE}`);
sel = sel.replace(/FROM leads ld WHERE tenant_id = p_tenant_id AND stage NOT IN/g, `FROM leads ld WHERE ld.tenant_id = p_tenant_id${LD_SCOPE} AND ld.stage NOT IN`);
sel = sel.replace(
  /\(SELECT stage, COUNT\(\*\) AS cnt FROM leads WHERE tenant_id = p_tenant_id AND stage != 'lost' GROUP BY stage\) t/g,
  `(SELECT ld.stage, COUNT(*) AS cnt FROM leads ld WHERE ld.tenant_id = p_tenant_id${LD_SCOPE} AND ld.stage != 'lost' GROUP BY ld.stage) t`
);
sel = sel.replace(
  /SELECT instrument, COUNT\(\*\) AS cnt FROM leads\n          WHERE tenant_id = p_tenant_id AND stage NOT IN \('enrolled','lost'\) AND instrument IS NOT NULL/g,
  `SELECT ld.instrument, COUNT(*) AS cnt FROM leads ld\n          WHERE ld.tenant_id = p_tenant_id${LD_SCOPE} AND ld.stage NOT IN ('enrolled','lost') AND ld.instrument IS NOT NULL`
);
sel = sel.replace(
  /GROUP BY instrument ORDER BY cnt DESC/g,
  `GROUP BY ld.instrument ORDER BY cnt DESC`
);
sel = sel.replace(
  /WHERE ld\.tenant_id = p_tenant_id AND ld\.stage NOT IN \('enrolled','lost'\)\n          GROUP BY l\.name ORDER BY cnt DESC/g,
  `WHERE ld.tenant_id = p_tenant_id${LD_SCOPE} AND ld.stage NOT IN ('enrolled','lost')\n          GROUP BY l.name ORDER BY cnt DESC`
);

const SL_SCOPE = ` AND (CASE WHEN v_role = 'studio_director' THEN sl.location_id = ANY(v_allowed_location_ids) ELSE true END) AND (CASE WHEN v_role = 'teacher' THEN (v_teacher_row.id IS NOT NULL AND sl.teacher_id = v_teacher_row.id) ELSE true END)`;
sel = sel.replace(/FROM session_log WHERE tenant_id = p_tenant_id/g, `FROM session_log sl WHERE sl.tenant_id = p_tenant_id${SL_SCOPE}`);
sel = sel.replace(
  /FROM session_log\n        WHERE tenant_id = p_tenant_id AND block_date/g,
  `FROM session_log sl\n        WHERE sl.tenant_id = p_tenant_id${SL_SCOPE} AND sl.block_date`
);
sel = sel.replace(
  /FROM session_log sl JOIN locations l ON l\.id = sl\.location_id\n          WHERE sl\.tenant_id = p_tenant_id AND sl\.block_date/g,
  `FROM session_log sl JOIN locations l ON l.id = sl.location_id\n          WHERE sl.tenant_id = p_tenant_id${SL_SCOPE} AND sl.block_date`
);

// retention students (remaining FROM students - may already be scoped)
sel = sel.replace(
  /\(SELECT COUNT\(\*\) FROM students WHERE tenant_id = p_tenant_id AND status = 'paused'\)/g,
  `(SELECT COUNT(*) FROM students s WHERE s.tenant_id = p_tenant_id AND s.status = 'paused'${STU})`
);
sel = sel.replace(
  /\(SELECT COUNT\(\*\) FROM students WHERE tenant_id = p_tenant_id AND may_return = 'yes'\)/g,
  `(SELECT COUNT(*) FROM students s WHERE s.tenant_id = p_tenant_id AND s.may_return = 'yes'${STU})`
);
sel = sel.replace(
  /FROM students WHERE tenant_id = p_tenant_id\n        AND status IN \('inactive','former'\) AND deactivated_at/g,
  `FROM students s WHERE s.tenant_id = p_tenant_id${STU}\n        AND s.status IN ('inactive','former') AND s.deactivated_at`
);

const RC_SCOPE = ` AND (CASE WHEN v_role = 'studio_director' THEN (rc.location_id IS NULL OR rc.location_id = ANY(v_allowed_location_ids)) ELSE true END) AND (CASE WHEN v_role = 'teacher' THEN EXISTS (SELECT 1 FROM students s WHERE s.id = rc.student_id AND s.teacher_id = v_teacher_row.id) ELSE true END)`;
sel = sel.replace(
  /\(SELECT COUNT\(\*\) FROM retention_campaigns WHERE tenant_id = p_tenant_id AND status = 'pending'\)/g,
  `(SELECT COUNT(*) FROM retention_campaigns rc WHERE rc.tenant_id = p_tenant_id AND rc.status = 'pending'${RC_SCOPE})`
);
sel = sel.replace(
  /\(SELECT COUNT\(\*\) FROM retention_campaigns WHERE tenant_id = p_tenant_id AND sent_at/g,
  `(SELECT COUNT(*) FROM retention_campaigns rc WHERE rc.tenant_id = p_tenant_id AND rc.sent_at`
);
// fix second retention - need RC_SCOPE before AND sent
sel = sel.replace(
  /FROM retention_campaigns rc WHERE rc\.tenant_id = p_tenant_id AND rc\.sent_at >= NOW\(\) - INTERVAL '30 days'\)/g,
  `FROM retention_campaigns rc WHERE rc.tenant_id = p_tenant_id${RC_SCOPE} AND rc.sent_at >= NOW() - INTERVAL '30 days')`
);

const TK_SCOPE = ` AND (CASE WHEN v_role = 'studio_director' THEN (tk.location_id IS NULL OR tk.location_id = ANY(v_allowed_location_ids)) ELSE true END) AND (CASE WHEN v_role = 'teacher' THEN (tk.assigned_to = v_uid OR tk.location_id IN (SELECT DISTINCT s.location_id FROM students s WHERE s.teacher_id = v_teacher_row.id AND s.tenant_id = p_tenant_id AND s.status = 'active')) ELSE true END)`;
sel = sel.replace(/FROM tasks WHERE tenant_id = p_tenant_id AND status = 'open'/g, `FROM tasks tk WHERE tk.tenant_id = p_tenant_id AND tk.status = 'open'${TK_SCOPE}`);
sel = sel.replace(
  /FROM tasks WHERE tenant_id = p_tenant_id AND status = 'open' AND due_date/g,
  `FROM tasks tk WHERE tk.tenant_id = p_tenant_id AND tk.status = 'open'${TK_SCOPE} AND tk.due_date`
);
sel = sel.replace(
  /FROM tasks WHERE tenant_id = p_tenant_id AND status = 'open' AND priority = 'high'/g,
  `FROM tasks tk WHERE tk.tenant_id = p_tenant_id AND tk.status = 'open'${TK_SCOPE} AND tk.priority = 'high'`
);

const COMM_SCOPE = ` AND (CASE WHEN v_role = 'studio_director' THEN EXISTS (SELECT 1 FROM students s WHERE s.tenant_id = p_tenant_id AND s.location_id = ANY(v_allowed_location_ids) AND ((c.student_id IS NOT NULL AND c.student_id = s.id) OR (c.family_id IS NOT NULL AND s.family_id = c.family_id))) ELSE true END) AND (CASE WHEN v_role = 'teacher' THEN (c.teacher_id = v_teacher_row.id OR EXISTS (SELECT 1 FROM students s WHERE s.id = c.student_id AND s.teacher_id = v_teacher_row.id) OR EXISTS (SELECT 1 FROM students s WHERE c.family_id IS NOT NULL AND s.family_id = c.family_id AND s.teacher_id = v_teacher_row.id)) ELSE true END)`;
sel = sel.replace(
  /FROM communications WHERE tenant_id = p_tenant_id AND sent_at >= NOW\(\) - INTERVAL '7 days'/g,
  `FROM communications c WHERE c.tenant_id = p_tenant_id${COMM_SCOPE} AND c.sent_at >= NOW() - INTERVAL '7 days'`
);
sel = sel.replace(
  /FROM communications WHERE tenant_id = p_tenant_id AND sent_at >= NOW\(\) - INTERVAL '30 days'/g,
  `FROM communications c WHERE c.tenant_id = p_tenant_id${COMM_SCOPE} AND c.sent_at >= NOW() - INTERVAL '30 days'`
);

const LOC_OUT = ` AND (CASE WHEN v_role = 'studio_director' THEN l.id = ANY(v_allowed_location_ids) ELSE true END) AND (CASE WHEN v_role = 'teacher' THEN EXISTS (SELECT 1 FROM students s WHERE s.location_id = l.id AND s.teacher_id = v_teacher_row.id AND s.tenant_id = p_tenant_id AND s.status = 'active') ELSE true END)`;
sel = sel.replace(
  /FROM locations l WHERE l\.tenant_id = p_tenant_id AND l\.is_active = true\n    \),/g,
  `FROM locations l WHERE l.tenant_id = p_tenant_id AND l.is_active = true${LOC_OUT}\n    ),`
);

// Correlated subqueries inside locations json for active_students on s
sel = sel.replace(
  /\(SELECT COUNT\(\*\) FROM students s WHERE s\.location_id = l\.id AND s\.status = 'active'\)/g,
  `(SELECT COUNT(*) FROM students s WHERE s.location_id = l.id AND s.status = 'active'${STU})`
);

// teachers t inside locations - add TCH_STU for inner count - uses t
sel = sel.replace(
  /\(SELECT COUNT\(DISTINCT t\.id\) FROM teachers t JOIN profile_locations pl ON pl\.profile_id = t\.profile_id WHERE pl\.location_id = l\.id AND t\.is_active = true\)/g,
  `(SELECT COUNT(DISTINCT t.id) FROM teachers t JOIN profile_locations pl ON pl.profile_id = t.profile_id WHERE pl.location_id = l.id AND t.is_active = true${TCH_STU})`
);

// schedule_blocks inside locations object
sel = sel.replace(
  /\(SELECT COUNT\(\*\) FROM schedule_blocks sb WHERE sb\.location_id = l\.id AND sb\.block_date BETWEEN CURRENT_DATE AND CURRENT_DATE \+ 6 AND sb\.status = 'booked'\)/g,
  `(SELECT COUNT(*) FROM schedule_blocks sb WHERE sb.location_id = l.id AND sb.block_date BETWEEN CURRENT_DATE AND CURRENT_DATE + 6 AND sb.status = 'booked'${SB_SCOPE})`
);
sel = sel.replace(
  /\(SELECT COUNT\(\*\) FROM schedule_blocks sb WHERE sb\.location_id = l\.id AND sb\.block_date BETWEEN CURRENT_DATE AND CURRENT_DATE \+ 6 AND sb\.status = 'available'\)/g,
  `(SELECT COUNT(*) FROM schedule_blocks sb WHERE sb.location_id = l.id AND sb.block_date BETWEEN CURRENT_DATE AND CURRENT_DATE + 6 AND sb.status = 'available'${SB_SCOPE})`
);

const SER_IN_LOC = ` AND (CASE WHEN v_role = 'studio_director' THEN ser.location_id = ANY(v_allowed_location_ids) ELSE true END) AND (CASE WHEN v_role = 'teacher' THEN (v_teacher_row.id IS NOT NULL AND EXISTS (SELECT 1 FROM students st WHERE st.id = ser.student_id AND st.teacher_id = v_teacher_row.id)) ELSE true END)`;
sel = sel.replace(
  /\(SELECT COALESCE\(SUM\(ser\.monthly_cents\),0\) FROM student_effective_rate ser WHERE ser\.location_id = l\.id AND ser\.tenant_id = p_tenant_id AND ser\.status = 'active'\)/g,
  `(SELECT COALESCE(SUM(ser.monthly_cents),0) FROM student_effective_rate ser WHERE ser.location_id = l.id AND ser.tenant_id = p_tenant_id AND ser.status = 'active'${SER_IN_LOC})`
);

// Fix leads replacements that broke - re-read output
// billing_cycles unchanged (tenant-wide; policy nulls for studio)

fs.writeFileSync(path.join(__dirname, "_spliced_select.sql"), "  " + sel + "\n  INTO v_result;", "utf8");
console.log("Wrote _spliced_select.sql");
