# Role handling — actual DB roles (linked project snapshot)

Distinct `profiles.role` values observed: **owner**, **admin**, **parent**, **student**, **studio_director**, **teacher**.

`company_director` was **not** present — **do not** put it in SQL whitelists. If product later adds the enum value, add it explicitly with intended scope (likely same as `admin`/`owner` for this RPC).

## Allowed to call `get_ziro_context` (after migration + splice)

| Role | Behavior |
|------|----------|
| **owner** | Full tenant aggregate (after live body splice). `v_allowed_location_ids` null. |
| **admin** | Same as owner unless product later differentiates. |
| **studio_director** | Requires ≥1 `profile_locations` row; aggregate must be location-filtered for scalars + arrays (splice); policy helper trims arrays / some billing. |
| **teacher** | Aggregate must be teacher-scoped in splice; policy strips money/leads/tasks/communications; `load_by_teacher` trimmed to self. |

## Blocked

| Role | Behavior |
|------|----------|
| **student** | `RAISE` — not authorized for this RPC. |
| **parent** | `RAISE` until parent linkage aggregate is implemented; then remove the `IF v_role = 'parent'` block and add scoped queries. |

## Unknown / future enum values

Any `profiles.role::text` not handled above hits: `unknown or disallowed role` → **fail closed**.

## SQL usage

Always use **`lower(trim(p.role::text))`** — `role` is an enum; `trim(role)` without cast will error.
