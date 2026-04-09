# STAR + Supabase — backend execution package

For the engineer doing Supabase / RPC / edge deployment. **Client containment pass is complete** — do not change STAR client architecture from this doc.

---

## A. Exact SQL — inspect `get_star_context`

Run in **Supabase → SQL Editor** (or `psql`). Replace nothing unless noted.

### A1. Resolve OID and call signature

```sql
SELECT
  p.oid,
  n.nspname AS schema,
  p.proname AS name,
  pg_get_function_identity_arguments(p.oid) AS identity_args,
  pg_get_function_arguments(p.oid) AS full_args
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'get_star_context';
```

### A2. SECURITY DEFINER vs INVOKER

```sql
SELECT
  n.nspname AS schema,
  p.proname AS name,
  p.prosecdef AS security_definer,
  CASE WHEN p.prosecdef THEN 'DEFINER' ELSE 'INVOKER' END AS security,
  r.rolname AS owner
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
JOIN pg_authid r ON r.oid = p.proowner
WHERE n.nspname = 'public'
  AND p.proname = 'get_star_context';
```

- **`security_definer = true`** → function runs with **owner’s** privileges (typical for controlled RPCs). Confirm owner is intentional (often `postgres` / migration role).
- **`false`** → runs as **current_user** (invoker); table RLS and grants apply to the caller.

### A3. Full function definition (source)

```sql
SELECT pg_get_functiondef(p.oid) AS definition
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'get_star_context';
```

(Optional) Shorter view via `information_schema` (may truncate very large bodies in some clients):

```sql
SELECT routine_schema, routine_name, routine_type, security_type, data_type AS return_type
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name = 'get_star_context';
```

### A4. Who can EXECUTE — grants

```sql
SELECT
  table_schema AS routine_schema,
  grantee,
  privilege_type,
  is_grantable
FROM information_schema.routine_privileges
WHERE routine_schema = 'public'
  AND routine_name = 'get_star_context'
ORDER BY grantee, privilege_type;
```

Current session’s ability to call:

```sql
SELECT has_function_privilege(
  current_user,
  'public.get_star_context(uuid)'::regprocedure,
  'EXECUTE'
) AS current_user_can_execute;
```

(If the signature is not `(uuid)`, use the exact identity from **A1**, e.g. `'public.get_star_context(uuid, uuid)'::regprocedure`.)

List roles that have EXECUTE (broader than `information_schema` alone):

```sql
SELECT
  r.rolname AS grantee,
  has_function_privilege(r.oid, p.oid, 'EXECUTE') AS can_execute
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
CROSS JOIN pg_roles r
WHERE n.nspname = 'public'
  AND p.proname = 'get_star_context'
  AND r.rolname NOT LIKE 'pg_%'
ORDER BY r.rolname;
```

### A5. Dependencies via `pg_depend`

PostgreSQL records many dependencies in `pg_depend` (not guaranteed for every dynamic SQL path or plpgsql edge case).

**A5a — Objects referenced by `get_star_context` (what the function depends on)**  
In `pg_depend`, `objid` = dependent, `refobjid` = referenced. Here the function is the dependent.

```sql
WITH f AS (
  SELECT p.oid
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'get_star_context'
)
SELECT
  CASE d.refclassid
    WHEN 'pg_class'::regclass THEN (d.refobjid::regclass)::text
    WHEN 'pg_proc'::regclass THEN (d.refobjid::regprocedure)::text
    ELSE d.refobjid::text
  END AS referenced_object,
  d.deptype
FROM pg_depend d
JOIN f ON d.objid = f.oid
WHERE d.deptype = 'n'
ORDER BY 1;
```

**A5b — Objects that depend on `get_star_context` (e.g. views wrapping the RPC)**  
Here the function is the referenced object.

```sql
WITH f AS (
  SELECT p.oid
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'get_star_context'
)
SELECT
  CASE d.classid
    WHEN 'pg_proc'::regclass THEN 'function'
    WHEN 'pg_class'::regclass THEN 'relation'
    WHEN 'pg_type'::regclass THEN 'type'
    ELSE d.classid::regclass::text
  END AS dep_kind,
  CASE d.classid
    WHEN 'pg_class'::regclass THEN (d.objid::regclass)::text
    WHEN 'pg_proc'::regclass THEN (d.objid::regprocedure)::text
    ELSE d.objid::text
  END AS dependent_object
FROM pg_depend d
JOIN f ON d.refobjid = f.oid
WHERE d.deptype = 'n'
ORDER BY 1, 2;
```

If **A5a** is empty or incomplete, treat **`pg_get_functiondef` output (A3)** as the source of truth and grep for table/view names manually.

### A6. Sample invocation shape (matches client)

Client calls: `supabase.rpc('get_star_context', { p_tenant_id: '<tenant_uuid>' })`.

```sql
-- Use a real tenant id from your tenants table:
-- SELECT id FROM tenants LIMIT 1;

SELECT public.get_star_context('00000000-0000-0000-0000-000000000000'::uuid);
```

Replace the UUID with a valid `tenants.id`. Adjust the function name/signature if **A1** shows parameters other than a single `uuid`.

### A7. Role / location scoping — what SQL can prove

The RPC cannot “see” JWT claims in plain SQL without helper functions. Use this **verification matrix**:

| Check | SQL / action |
|--------|----------------|
| Parameter surface | **A1** — confirm only `p_tenant_id` (or document extra args for location / profile). |
| Whether definition filters by location | **A3** — search body for `profile_locations`, `location_id`, `auth.uid()`, JWT helpers. |
| Whether financial fields are redacted server-side | **A3** + compare JSON keys to `StarContextData` in `app/src/services/starContext.ts`. |
| Invoker vs definer behavior | **A2** — if INVOKER, RLS on underlying tables must enforce scoping; if DEFINER, logic **inside** the function must enforce scoping. |

Ad-hoc: run **A6** as a user/role that mirrors production (e.g. `authenticated` via Supabase request) only if you have a safe way to impersonate; otherwise verify logic in **A3** and add automated tests against staging.

---

## B. Backend execution checklist (implementation)

### B1. SQL / RPC

- [ ] Export current production `get_star_context` (result of **A3**) into a dated migration in git before any edit.
- [ ] Confirm function signature matches client: `p_tenant_id` (see `fetchStarContext` in `app/src/services/starContext.ts`).
- [ ] Implement **server-side** role and location scoping (no reliance on client stripping for security).
- [ ] Align returned JSON with `StarContextData` or version the RPC and update the client contract explicitly.
- [ ] Add migration(s) for any new indexes or views the RPC depends on.
- [ ] Document breaking changes and rollback steps.

### B2. Security / grants

- [ ] Decide **SECURITY DEFINER** vs **INVOKER** (**A2**) and justify owner role.
- [ ] Restrict `EXECUTE` to intended roles only (**A4**); remove `PUBLIC` if present unless required.
- [ ] If DEFINER: ensure fixed `search_path` in function (avoid hijack) and least-privilege owner.
- [ ] Re-verify RLS policies on underlying tables for INVOKER path.
- [ ] Confirm no sensitive fields leak for `teacher` / `parent` / `studio_director` in the **JSON** (not only UI).

### B3. Edge function deployment

- [ ] Single canonical source for `ai-assistant` (see **Section D** — repo has **two** paths; only one should drive deploys).
- [ ] Deploy from the canonical path after aligning with `app/src/services/aiAssistantClient.ts` (business `system_override` vs scheduling `schedule_context`).
- [ ] Set secrets: `ANTHROPIC_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (Dashboard → Edge Functions → Secrets).
- [ ] Confirm function name in Supabase is `ai-assistant` (or document alias if different).
- [ ] Smoke-test `OPTIONS` + `POST` from a client token (CORS headers already in code).

### B4. Validation / test queries

- [ ] **A3** saved in repo matches deployed DB after migration apply.
- [ ] **A6** returns plausible JSON for a known tenant; spot-check location and financial fields per role requirements.
- [ ] Edge: POST with `system_override` returns 200 and uses business path (no tool-only scheduling error).
- [ ] Edge: POST with `schedule_context`, no `system_override`, exercises scheduling/tools path.
- [ ] Regression: studio director cannot obtain other locations’ aggregates (define expected failure: empty, error, or redacted).

---

## C. Deployment verification checklist — duplicate `ai-assistant`

**Repo fact:** two copies exist:

| Path | `system_override` (business fast path) |
|------|----------------------------------------|
| `app/supabase/functions/ai-assistant/index.ts` | **Yes** — parses `system_override`, early return to Claude with `system: system_override`. |
| `supabase/functions/ai-assistant/index.ts` (repo root) | **No** — destructures only `question, conversation_history, tenant_id, schedule_context, timezone`. |

File hashes differ — **drift risk is active** if deploys use the wrong tree.

### C1. Which source is deployed?

- [ ] **Supabase Dashboard → Edge Functions → `ai-assistant`**: note last deployment time and editor preview if available.
- [ ] **CLI** (with project linked): `supabase functions list` — confirm `ai-assistant` exists and note version metadata if shown.
- [ ] Ask the team **which working directory** was used for the last `supabase functions deploy` (must match canonical path after cleanup).
- [ ] If the dashboard allows **download / view bundle**, search the bundle for the string **`system_override`** (see C2).

### C2. Does the deployed version support `system_override`?

- [ ] In deployed source or bundle, confirm **`system_override`** appears in `req.json()` destructuring and an early branch sets Claude `system` from it (see reference: `app/supabase/functions/ai-assistant/index.ts`).
- [ ] **Live test:** `POST` to the project’s functions URL with body including `"system_override": "test marker"`, valid `question`, `tenant_id`, and `Authorization: Bearer <user_jwt>`. Success: response content reflects the override path (not full scheduling system prompt). Failure modes: 400/500 or scheduling-only behavior indicate old bundle.

### C3. Does production match `app/supabase/functions/ai-assistant/index.ts`?

- [ ] From the machine that deploys, run a **hash** of the deployed artifact vs local file (if CLI bundles deterministically) **or** diff downloaded dashboard source vs `app/supabase/functions/ai-assistant/index.ts`.
- [ ] Confirm line-level presence of: `system_override` in JSON parse; comment `FAST PATH: business context mode`; scheduling path comment that `system_override` was handled above.
- [ ] **Pass:** semantic match to `app/.../index.ts`. **Fail:** match to root `supabase/.../index.ts` (no `system_override`) or any third variant.

### C4. Duplicate repo tree — drift risk now?

- [ ] Record **which path is canonical** in README or internal runbook (single sentence).
- [ ] Delete or symlink the non-canonical copy **or** add a CI check that both files stay identical if both must exist temporarily.
- [ ] **Pass:** one deploy path, one reviewed `index.ts`. **Fail:** two differing files with no automation; anyone can deploy the wrong tree.

---

## D. Engineer handoff block (paste-ready)

**What is already fixed on the client**

- Fail-closed calls: business flows require real `system_override`; interactive flow requires business and/or schedule context where applicable.
- STAR UI waits for `get_star_context` / grid context before enabling chat; `useStarBusinessChat` enforces non-empty business context.
- `postAiAssistantBusinessOverride` / `postAiAssistantInteractive` centralize HTTP to `ai-assistant`; business snapshot is sent as **`system_override`** per `aiAssistantClient.ts` and `formatStarPrompt`.

**What must be verified server-side**

- `get_star_context`: definition in DB (**A3**), DEFINER/INVOKER (**A2**), EXECUTE grants (**A4**), dependencies (**A5**), and that JSON reflects **role/location** policy (not client-only masking).
- `ai-assistant`: deployed bundle is built from **`app/supabase/functions/ai-assistant/index.ts`**, includes **`system_override`** fast path, secrets set, CORS OK.
- Remove ambiguity: **root `supabase/functions/ai-assistant/index.ts` does not implement `system_override`** — if production matches that file, STAR business chat is wrong.

**Production readiness — pass / fail**

| Area | Pass | Fail |
|------|------|------|
| RPC | Migration in git matches prod; scoping documented and enforced in SQL | Tenant-wide sensitive aggregates for scoped roles; `PUBLIC` execute on sensitive DEFINER RPC |
| Security | Least privilege EXECUTE; server-side redaction for restricted roles | Reliance on client stripping only |
| Edge | Deployed `ai-assistant` contains `system_override` path; matches `app/.../ai-assistant/index.ts` | Deployed code matches root `supabase/...` only, or bundle missing `system_override` |
| Drift | Single canonical edge source; deploy procedure documented | Two differing `index.ts` with no guardrails |

---

## Quick reference — files

| Area | File |
|------|------|
| HTTP + edge contract | `app/src/services/aiAssistantClient.ts` |
| Star snapshot + RPC params | `app/src/services/starContext.ts` (`p_tenant_id`) |
| Edge (canonical reference for business path) | `app/supabase/functions/ai-assistant/index.ts` |
| Legacy / duplicate edge (scheduling-only; do not deploy for STAR business) | `supabase/functions/ai-assistant/index.ts` |
