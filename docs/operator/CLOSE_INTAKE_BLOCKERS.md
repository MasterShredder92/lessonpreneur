# Close remaining intake / RLS / RPC blockers (no new scope)

**Definition of done**

| # | Requirement |
|---|----------------|
| 1 | All **live** RLS policies for `leads`, `families`, `students`, `lp_prospects` are represented in **tracked** `supabase/migrations/*.sql` |
| 2 | **`convert_lead_to_student`** function definition (+ grants) is in **tracked** migrations |
| 3 | Pending migrations (including `20260412100000_intake_submissions.sql`) are **applied** to the project **before** deploying `public-lead-submit` |
| 4 | **Post-deploy verification** queries pass; attach results (screenshot or pasted rows) to PR |
| 5 | `npm run test:e2e` passes public flow; CRM test passes when `E2E_EMAIL` / `E2E_PASSWORD` are set |

**Do not** start UI redesign, new tables beyond what is already merged, or RPC signature changes unless the live function already includes them.

---

## Order of operations (mandatory)

1. **Apply database migrations** (Dashboard → SQL, or `supabase db push` with a clean history story).
2. **Deploy edge function** `public-lead-submit` (and `public-teacher-match` if changed).
3. Run **`supabase/operator/post_deploy_verify_intake.sql`** against the project.
4. Run **`npm run test:e2e`** locally (and CRM with env creds).

---

## A — Pull live RLS + RPC into git (pick one path)

### Path 1 — `supabase db pull` (best when migration history matches)

```powershell
cd c:\Users\alici\lessonpreneur
npx supabase login
npx supabase link --project-ref dhsyxyhtoadrqfrlmsqe
npx supabase db pull tracked_rls_and_rpc_from_remote
```

If you see **migration history does not match**:

- Align remote `supabase_migrations.schema_migrations` with reality (see [Supabase migration repair](https://supabase.com/docs/guides/cli/managing-environments)), **or**
- Use Path 2 so you do not guess repair IDs.

Review the generated migration: it may include more than RLS/RPC — **keep only** (or split into a PR-sized file) policies for `leads`, `families`, `students`, `lp_prospects`, and the `convert_lead_to_student` definition, plus any `GRANT`/`REVOKE` those objects need.

### Path 2 — SQL Editor export (when CLI history is messy or Docker blocks `db dump`)

1. Open **Supabase Dashboard → SQL** for project `dhsyxyhtoadrqfrlmsqe`.
2. Run **`supabase/operator/extract_convert_lead_to_student.sql`**. Copy the full `CREATE OR REPLACE FUNCTION` output into a **new** migration file:  
   `supabase/migrations/YYYYMMDDHHMMSS_convert_lead_to_student_from_live.sql`
3. For policies: run **`supabase/operator/extract_policies_audit.sql`**. Use the output as **proof** in the PR. Then either:
   - paste equivalent `CREATE POLICY` / `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` statements from Dashboard (Database → table → Policies) into the same or a second migration, **or**
   - use Path 1 once history is repaired so `db pull` generates them.

**Rule:** Whatever is live must be what git contains — no hand-waved “assumed” policies.

---

## B — Apply pending migrations before edge deploy

At minimum, ensure this migration is applied before the updated edge function runs:

- `supabase/migrations/20260412100000_intake_submissions.sql`

If you add new files from Path 1 or 2, apply those in the same release window, in timestamp order.

---

## C — Post-deploy verification (attach proof)

Run **`supabase/operator/post_deploy_verify_intake.sql`**. Expect:

- `intake_submissions` exists; recent row has `raw_payload` and non-empty `lead_ids` after a test submit.
- `leads.intake_submission_id` populated for that flow.
- Policy audit rows present for `leads`, `families`, `students`, `lp_prospects` (counts > 0 if RLS is enabled on those tables).

---

## D — Playwright

```powershell
cd c:\Users\alici\lessonpreneur
npx playwright install   # once per machine
npm run test:e2e
```

For CRM tab:

```powershell
$env:E2E_EMAIL="owner@example.com"
$env:E2E_PASSWORD="***"
npm run test:e2e
```

---

## E — Docker note

`npx supabase db dump` on some Windows setups requires **Docker Desktop**. If dump fails, use Path 2 (SQL Editor) or `db pull` after link + history fix.

---

## Related files

- `supabase/operator/extract_convert_lead_to_student.sql`
- `supabase/operator/extract_policies_audit.sql`
- `supabase/operator/post_deploy_verify_intake.sql`
- `supabase/operator/VERIFY_lp_prospects_rls.sql` (narrow check — superseded by full audit query)
