# Execution ticket: Intake security, immutable submissions, DB-in-git, QA

**Goal:** Close P0 gaps for public forms, make Supabase the durable source of truth for original intake, align fallback with edge behavior, export DB logic to git, and automate critical QA paths.

**Agent stack (how to run the work):**

| Role | Use for |
|------|---------|
| **supabase-expert** | Migrations, `intake_submissions` DDL, RPCs, RLS policies, `tenant_id` patterns |
| **security-auditor** | Public edge + anon paths, validation rules, removal/alignment of browser fallback |
| **webapp-testing** | Playwright + `scripts/with_server.py`; happy path, fallback, `/get-started`, CRM smoke |
| **explore** | Repo tracing, dead routes (`/v2/start`), stale `EDGE_FUNCTIONS` registry cleanup |

**Execution order (mandatory):**

1. **Security first** — edge validation, RLS verification, fallback decision  
2. **Schema / source of truth second** — `intake_submissions` + links  
3. **Conversion logic third** — `convert_lead_to_student` in git + intake lineage  
4. **Playwright fourth** — after APIs and UI are stable  

---

## Phase 1 — Public form security (P0)

**Owner mindset:** security-auditor + supabase-expert (edge code + policies).

- [ ] **`public-lead-submit`:** After resolving `tenant_id` from `school_slug`, validate:
  - `location_id` exists and `locations.tenant_id = tenant_id`
  - `secondary_location_ids` (if present): every id belongs to same tenant
  - `matched_teacher_id` (if present): teacher belongs to tenant (via `teachers` / `teacher_locations` as appropriate)
  - Reject with 400 on mismatch; do not insert partial leads.
- [ ] **`public-teacher-match`:** Apply the same **location ∈ tenant** check (and any instrument/teacher scoping already implied by product rules).
- [ ] **`lp_prospects`:** In Supabase Dashboard, confirm **RLS enabled** and policies for anon `insert`/`update` (scoped so clients cannot read/update arbitrary rows). **Export** policies into a migration (see Phase 3).
- [ ] **Browser fallback (`SignupLanding` direct `families` + `leads` insert):**  
  - **Option A (preferred):** Remove fallback; show error + retry; all writes through edge (or a single `SECURITY DEFINER` RPC).  
  - **Option B:** Keep fallback only if it performs the **same validation** as the edge (tenant-scoped FK checks) and creates **identical** rows including multi-student + `intake_submissions` (Phase 2). Document why both paths exist.
- [ ] **Abuse / ops:** Rate limiting or platform WAF notes; redact PII from `console.error` in public edges; confirm `verify_jwt` config matches `safeFetch` + anon usage.

**Exit criteria:** No unvalidated cross-tenant FKs on public intake; `lp_prospects` RLS verified and captured in git; fallback either gone or provably equivalent.

---

## Phase 2 — `intake_submissions` (source of truth for original intake)

**Owner mindset:** supabase-expert.

- [ ] **Table** (names can be adjusted, intent fixed):
  - `id` (uuid), `tenant_id` (uuid, NOT NULL), `location_id` (nullable uuid FK)
  - `raw_payload` (jsonb NOT NULL) — **immutable** after insert (trigger or no `UPDATE` policy)
  - `source` (text): e.g. `website_form`, `lp_prospect`, `manual`
  - `form_version` or `schema_version` (text) for future form changes
  - `created_at` (timestamptz)
  - Optional: `idempotency_key`, `request_meta` (jsonb), `processing_status`
- [ ] **Links:**  
  - `lead_id` (nullable uuid FK → `leads.id`) set when lead(s) created  
  - `converted_student_id` (nullable uuid FK → `students.id`) set at conversion when applicable  
  - Or: `lead_ids uuid[]` if one submission spawns multiple leads — pick one model and stick to it
- [ ] **Writer:** `public-lead-submit` (service role) inserts **first** (or in same transaction as lead insert via RPC), storing **full** client payload as submitted.
- [ ] **`lp_prospects` path:** Either insert a parallel `intake_submissions` row with `source = 'lp_prospect'` + `tenant_id` if product table is multi-tenant, or document single-tenant LP prospect store — **do not** leave two silos without a story.
- [ ] **RLS:** Staff read by tenant (and location for studio_director); **no** anon write except via edge/service; align with project role hierarchy.

**Exit criteria:** Every successful public music-school submit has an immutable `raw_payload` row; CRM can load “as submitted” ordered fields from JSON in a later UI ticket.

---

## Phase 3 — DB logic in git + conversion

**Owner mindset:** supabase-expert; explore for any duplicate RPC names.

- [ ] **Export `convert_lead_to_student`** from live DB into `supabase/migrations/` (or `supabase/rpc/` + migration that applies it). Include grants and `SECURITY DEFINER` / search_path review.
- [ ] **Update RPC** (if needed): accept or derive `intake_submission_id`; copy/link to `students` and preserve lead row + FK to submission (no deletion of intake).
- [ ] **Pull RLS policies** for `leads`, `families`, `students`, `lp_prospects` into migrations (use `supabase db pull` / dashboard export — team standard). Add `intake_submissions` policies in same pass.
- [ ] **Types:** Align `LeadRow` / hooks with DB columns (`lost_category`, etc.) if migrations expose drift.

**Exit criteria:** `convert_lead_to_student` reviewable in PR; RLS for listed tables versioned; conversion path references immutable intake.

---

## Phase 4 — QA automation (webapp-testing)

**Owner mindset:** webapp-testing; explore for selectors / route fixes.

Use `python scripts/with_server.py --help`, then wire Playwright (Chromium headless, `networkidle` before asserts).

- [ ] **`/:loc/signup` happy path** — complete flow to thank-you; assert success (URL, visible confirmation, or network response).
- [ ] **Forced edge failure** — only if Phase 1 **keeps** fallback: mock or block edge URL, assert fallback still creates expected DB shape (or assert user-visible error if fallback removed).
- [ ] **`/get-started`** — silent save + final submit; assert no console errors and expected navigation (`/trial` or equivalent).
- [ ] **CRM lead detail smoke** — authenticated session (test user or seed): open Leads, open one lead, Contact Form tab renders, no crash.

Store scripts under e.g. `scripts/e2e/` or `tests/e2e/`; document env vars for CI.

**Exit criteria:** CI or local one-command run covers the four scenarios above.

---

## Single checklist (ordered)

1. Edge FK validation + teacher/location tenant checks  
2. `lp_prospects` RLS confirmed + migrated to git  
3. Fallback removed or aligned  
4. `intake_submissions` + immutability + link to lead/student  
5. `convert_lead_to_student` + RLS for CRM tables in git  
6. Playwright: signup, conditional fallback, get-started, CRM smoke  

---

## Out of scope for this ticket (follow-ups)

- CRM UI panel rendering ordered intake from JSON (can ship after row exists)  
- Ziro / `get_star_context` JSON injection (separate ticket)  
- Backfill historical leads without `intake_submissions` (optional migration script)  

---

## Verification (Lessonpreneur “done” subset)

- [ ] Real data: new submit creates `intake_submissions` + `leads` with matching linkage  
- [ ] RLS: anon cannot escalate; staff see tenant data only  
- [ ] No unbounded new queries on lead list  
- [ ] Playwright green locally  
- [ ] No new console errors on exercised paths  
