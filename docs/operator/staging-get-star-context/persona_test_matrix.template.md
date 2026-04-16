# Persona test matrix — `get_ziro_context`

**Invoke:** App login or `supabase.rpc('get_ziro_context', { p_tenant_id: '<UUID>' })` with that user’s session JWT.  
**Do not use** SQL Editor as superuser for these rows (no `auth.uid()`).

| Persona | Tenant id | Expected HTTP / RPC | Must hold | Must not hold (fail) |
|---------|-----------|---------------------|-----------|----------------------|
| owner | `<OWNER_TENANT>` | Success | Full JSON keys; billing non-zero if data exists | Error for valid tenant |
| admin | `<ADMIN_TENANT>` | Success | Same as owner for that tenant (unless product differs) | Stripped money vs owner incorrectly |
| studio_director | `<SD_TENANT>` | Success | Only allowed `profile_locations` in payload | Other locations’ data; tenant-wide scalars matching owner |
| teacher | `<TEACHER_TENANT>` | Success | `billing.estimated_mrr_cents === 0`; overdue zeroed; ≤1 `load_by_teacher` | Any MRR; other teachers in load |
| parent | `<PARENT_TENANT>` | **Error until parent implemented** | Documented exception text | Success with full tenant JSON |
| tenant mismatch | User tenant A, `p_tenant_id` = B | Error membership denied | — | Success |

**After parent splice:** replace parent row with success criteria + scoped JSON rules.

**Record:** Save JSON or error text per row to `evidence/persona-<role>.json` or `.txt`.
