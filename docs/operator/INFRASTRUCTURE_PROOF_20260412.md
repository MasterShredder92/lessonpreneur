# Infrastructure proof — intake / RLS / RPC closure (2026-04-12)

Scope: **infrastructure only** (no redesign). Commands run from `c:\Users\alici\lessonpreneur` on Windows PowerShell.

---

## 1. Migration added and applied (before edge deploy)

**File:** `supabase/migrations/20260413190000_live_rls_and_convert_lead_to_student_from_remote.sql`

- Source: live policies for `leads`, `families`, `students`, `lp_prospects` via `npx supabase db query --linked` (pg_policies JSON).
- `convert_lead_to_student`: `pg_get_functiondef` from live (same CLI).

**Apply:**

```text
npx supabase db push --yes
```

**Result:**

```text
Applying migration 20260413190000_live_rls_and_convert_lead_to_student_from_remote.sql...
Finished supabase db push.
```

**Remote migration list** (local | remote aligned after push): all timestamps including `20260413190000` — run `npx supabase migration list` to confirm in your session.

---

## 2. Edge functions deployed (after DB migration)

Order satisfied: DB migration applied first, then:

```text
npx supabase functions deploy public-lead-submit --project-ref dhsyxyhtoadrqfrlmsqe
npx supabase functions deploy public-teacher-match --project-ref dhsyxyhtoadrqfrlmsqe
```

**Result:** both reported `Deployed Functions on project dhsyxyhtoadrqfrlmsqe` (Docker warning only; deploy succeeded).

---

## 3. Post-deploy verification SQL (`supabase/operator/post_deploy_verify_intake.sql`)

### Policy coverage (query #4)

```text
 table_name  | rls_on | policy_count 
 families     | true   | 4            
 leads        | true   | 4            
 lp_prospects | true   | 2            
 students     | true   | 6            
```

### `intake_submissions` exists

```text
 intake_submissions_exists 
 true                      
```

### RPC present

```text
 proname                 | args                                                                                                                                                      
 convert_lead_to_student | p_lead_id uuid, p_family_id uuid, p_family_name text, p_teacher_id uuid, p_block_id uuid, p_recurring boolean, p_rate numeric, p_blocks_per_week integer 
```

### Sample rows (`intake_submissions` / `leads.intake_submission_id`)

Run when ready (depends on traffic):

```sql
SELECT id, tenant_id, source, array_length(lead_ids, 1), created_at
FROM public.intake_submissions ORDER BY created_at DESC LIMIT 5;

SELECT id, intake_submission_id, stage, created_at
FROM public.leads WHERE intake_submission_id IS NOT NULL ORDER BY created_at DESC LIMIT 5;
```

*Attach row counts from production after the next live signup if empty.*

---

## 4. Playwright (`npm run test:e2e`)

```text
  ok  ... /get-started loads and shows questionnaire
  ok  ... /omaha/signup loads enrollment flow
  ok  ... /trial redirects to /get-started without sessionStorage
  -   ... CRM lead detail (skipped — set E2E_EMAIL and E2E_PASSWORD)
  3 passed (7.9s)
```

**CRM test:** not run — requires `E2E_EMAIL` / `E2E_PASSWORD`. Definition of done: pass once creds are supplied.

---

## 5. CLI note

Occasional `supabase db query --linked` failures: `password authentication failed for user "cli_login_postgres"` — retry. Does not affect applied migration (push used successful connection).
