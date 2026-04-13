# Execution report: `INTAKE_FORM_P0_EXECUTION.md`

Report format: **completed items**, **blockers**, **diffs / migrations**, **test evidence**. Phases were executed in order; proof is cited where possible.

---

## Phase 1 — Public form security

### Completed (with proof)

| Item | Proof |
|------|--------|
| `location_id` validated against `locations.tenant_id` | `supabase/functions/public-lead-submit/index.ts` — `assertTenantScopedPayload` |
| `secondary_location_ids` each validated for tenant | same |
| `matched_teacher_id` validated against `teachers.tenant_id` | same |
| `public-teacher-match` location ∈ tenant | `supabase/functions/public-teacher-match/index.ts` — query before teacher load |
| Family lookup scoped by tenant | `public-lead-submit`: `.eq('tenant_id', tenantId)` on `families` |
| Browser fallback removed (Option A) | `src/pages/SignupLanding.tsx` — only `safeFetch` to edge; `supabase` import removed |
| Reduced PII-adjacent logging | `public-lead-submit` logs `leadErr.code` only; `public-teacher-match` log line no longer prints raw `location_id` |

### Partial / not proven from git alone

| Item | Status |
|------|--------|
| `lp_prospects` RLS policies **in migrations** | **Not shipped** — requires Dashboard truth + `supabase db pull` or manual policy SQL. **Proof script added:** `supabase/operator/VERIFY_lp_prospects_rls.sql` (run in SQL Editor; paste results to PR). |
| Rate limiting / WAF | **Not implemented** (ops / platform). Documented as follow-up. |
| `verify_jwt` for edge functions | **Environment config** — confirm in Supabase Dashboard for `public-lead-submit` / `public-teacher-match`. |

### Phase 1 exit criterion

- **Cross-tenant FKs:** Addressed in edge code (reviewable in PR).  
- **`lp_prospects` RLS “captured in git”:** **Open** until operator runs verify script + adds migration from live policies.  
- **Fallback:** **Removed** — aligned with “edge only” (no second path).

---

## Phase 2 — `intake_submissions` (source of truth)

### Completed

| Item | Proof |
|------|--------|
| Table + `leads.intake_submission_id` + immutability trigger on `raw_payload` | `supabase/migrations/20260412100000_intake_submissions.sql` |
| RLS: staff `SELECT`/`UPDATE` by `profiles.tenant_id` | same migration |
| Edge writes raw payload, then leads, then updates `lead_ids` | `supabase/functions/public-lead-submit/index.ts` |
| API response includes `intake_submission_id` | same |

### Deploy order (required)

1. Apply migration `20260412100000_intake_submissions.sql` to the Supabase project **before** deploying the updated edge function.  
2. Deploy `public-lead-submit`.  

**DB verification after deploy (manual):** insert one test lead via form or `curl` to edge; `SELECT id, lead_ids, raw_payload FROM intake_submissions ORDER BY created_at DESC LIMIT 1;` and `SELECT intake_submission_id FROM leads WHERE id = '<lead_id>';`

### Partial

| Item | Status |
|------|--------|
| `lp_prospects` → `intake_submissions` | **Not implemented** — LP funnel still writes only `lp_prospects`; ticket allows documenting single-tenant story; add follow-up if product wants one table. |

---

## Phase 3 — DB logic in git + conversion

### Blockers (exit criteria **not** met)

| Item | Reason |
|------|--------|
| `convert_lead_to_student` in repo | **Not exported** from live DB in CI — **closure runbook:** `docs/operator/CLOSE_INTAKE_BLOCKERS.md` + `supabase/operator/extract_convert_lead_to_student.sql` |
| RLS for `leads`, `families`, `students`, `lp_prospects` as full migrations | **Not pulled** — same runbook; `db pull` failed here due to **migration history drift** (repair or SQL Editor path) |

**Note:** `npx supabase db pull` reached the remote project but reported local vs remote migration history mismatch — a developer with access must repair or use the SQL Editor export path (documented).

### Completed

| Item | Proof |
|------|--------|
| `LeadRow.intake_submission_id` | `src/hooks/useLeads.ts` |

RPC update for `p_intake_submission_id` — **deferred** until function body is in git.

---

## Phase 4 — QA automation (Playwright)

### Completed

| Item | Proof |
|------|--------|
| Config + public smoke tests | `playwright.config.ts`, `tests/e2e/public-funnel.spec.ts` |
| Script | `package.json` → `"test:e2e": "playwright test"` |
| Browsers | `npx playwright install` (full) |

### Test evidence (local run)

Command: `npx playwright test --reporter=list`

Result: **3 passed**, **1 skipped** (CRM test requires `E2E_EMAIL` / `E2E_PASSWORD`).

```
  ok  ... /get-started loads and shows questionnaire
  ok  ... /omaha/signup loads enrollment flow
  ok  ... /trial redirects to /get-started without sessionStorage
  -   ... CRM lead detail (skipped — no E2E creds)
```

**Note:** First run requires `npx playwright install` so Chromium/headless shell exists.

### Not automated yet (ticket asked for full coverage)

| Scenario | Status |
|----------|--------|
| Full `/omaha/signup` → `/thank-you` | **Not** in suite (multi-step + real edge); add when stable selectors + test env URL. |
| Forced edge failure | **N/A** — fallback removed; no “fallback path” test. |
| CRM lead detail open | **Skipped** until env creds; optional `E2E_EMAIL` / `E2E_PASSWORD`. |

---

## Diffs summary (files touched)

- `supabase/functions/public-lead-submit/index.ts` — validation, intake insert, `lead_ids` update, tenant-scoped family  
- `supabase/functions/public-teacher-match/index.ts` — location validation, log hygiene  
- `supabase/migrations/20260412100000_intake_submissions.sql` — **new**  
- `src/pages/SignupLanding.tsx` — remove fallback  
- `src/hooks/useLeads.ts` — `intake_submission_id` on `LeadRow`  
- `docs/operator/EXPORT_convert_lead_to_student.md` — **new**  
- `supabase/operator/VERIFY_lp_prospects_rls.sql` — **new**  
- `playwright.config.ts`, `tests/e2e/public-funnel.spec.ts` — **new**  
- `package.json` — `@playwright/test`, `test:e2e`  
- `.gitignore` — Playwright artifacts  

---

## Single-thread rule for remaining work

Do **not** merge “Phase 3 complete” until:

1. `convert_lead_to_student` SQL is in `supabase/migrations/` (or linked migration file).  
2. `lp_prospects` RLS query output is attached + migration matches Dashboard.  
3. Post-deploy SQL confirms `intake_submissions` + `leads.intake_submission_id` for a real submit.
