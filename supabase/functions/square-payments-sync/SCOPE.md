# Square payments sync — read-only reporting facts

**Lessonpreneur** stores facts; **Square** is read-only. No LP → Square writes.

## Square APIs

| API | Method | Use |
|-----|--------|-----|
| [List payments](https://developer.squareup.com/reference/square/payments-api/list-payments) | `GET /v2/payments` | Paginated; `location_id`, `begin_time`, `end_time` (RFC 3339). |
| [List payment refunds](https://developer.squareup.com/reference/square/refunds-api/list-payment-refunds) | `GET /v2/refunds` | Same time + location filters. |

Requires OAuth scope **PAYMENTS_READ** on the Square access token.

## Tables

- **`square_payments_fact`** — one row per `payment.id`; upsert on `(tenant_id, square_payment_id)`.
- **`square_refunds_fact`** — one row per refund `id`; upsert on `(tenant_id, square_refund_id)`.

## Date dimension

`reporting_date` = **UTC calendar date** from Square `created_at`. For merchant-timezone reporting, add a later migration or computed column.

## Request body (POST)

```json
{
  "begin_time": "2026-04-01T00:00:00Z",
  "end_time": "2026-04-12T23:59:59Z",
  "include_refunds": true
}
```

Defaults: last **7 days** to **now**; refunds **on**.

## Backfill

Call repeatedly with non-overlapping or overlapping windows; upserts are **idempotent**. Prefer **daily** chunks for very large history to avoid edge timeouts.

## Deploy

```text
supabase functions deploy square-payments-sync --no-verify-jwt
```

## DB migration

Apply `supabase/migrations/*_square_payments_reporting.sql` to the project before first run.
