# Square payment sync — product scope

**Lessonpreneur** is the system of record for schedules, students, lesson recurrence, and billing rules. **Square** data is **read** into LP for invoice/payment reconciliation only. No LP billing data is written to Square from this repo (see `square-proxy` — outbound card/payment creation disabled).

## This edge function

- Calls Square **Invoices** (read) and upserts rows into `square_invoices`
- Links rows to LP families when `square_customer_id` or email matches
- Updates LP **money** fields derived from synced invoice data (e.g. family overdue balance)

## Explicitly out of scope

- Creating or managing **lesson schedules** in Square
- Owning **recurring lesson series** in Square
- Any **automatic recurring** sync job in this repo (none defined)
- Treating Square subscription/recurrence IDs as LP lesson or billing recurrence logic — stored only as opaque payment metadata where the API provides it

## How runs are triggered

- **Primary:** Billing UI **Sync Now** (authenticated user JWT)
- **Optional:** Server-to-server calls with `Authorization: Bearer <SYNC_SECRET>` if you add your own automation later — **not required** for normal product use

## Secrets (Supabase → Edge Functions)

| Name | Required for Billing UI? | Purpose |
|------|---------------------------|---------|
| `SQUARE_ACCESS_TOKEN` | Yes | Square API |
| `SYNC_SECRET` | No | Optional non-browser callers only |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | Auto | Injected |

## Deploy

```text
supabase functions deploy square-payment-sync --no-verify-jwt
```
