import { supabase } from './supabase'

const SQUARE_BASE_URL = '/square-api'
const accessToken = import.meta.env.VITE_SQUARE_ACCESS_TOKEN

const squareHeaders = {
  'Authorization': `Bearer ${accessToken}`,
  'Content-Type': 'application/json',
  'Square-Version': '2025-01-23',
}

async function squareFetch<T = unknown>(path: string): Promise<T> {
  const res = await fetch(`${SQUARE_BASE_URL}${path}`, { headers: squareHeaders })
  if (!res.ok) {
    const body = await res.json().catch(() => null)
    throw new Error(`Square API error ${res.status}: ${JSON.stringify(body)}`)
  }
  return res.json()
}

async function squarePost<T = unknown>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${SQUARE_BASE_URL}${path}`, {
    method: 'POST',
    headers: squareHeaders,
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => null)
    throw new Error(`Square API error ${res.status}: ${JSON.stringify(err)}`)
  }
  return res.json()
}

export interface SquareCustomer {
  id: string
  given_name?: string
  family_name?: string
  email_address?: string
  phone_number?: string
  created_at?: string
}

export interface SyncResult {
  squareCustomers: number
  matched: number
  updated: number
  unmatched: SquareCustomer[]
}

/** Fetch ALL customers from Square, paginating through every page. */
async function fetchAllSquareCustomers(
  onProgress?: (fetched: number) => void,
): Promise<SquareCustomer[]> {
  const all: SquareCustomer[] = []
  let cursor: string | undefined

  do {
    const url = cursor
      ? `/v2/customers?limit=100&cursor=${encodeURIComponent(cursor)}`
      : '/v2/customers?limit=100'
    const data = await squareFetch<{ customers?: SquareCustomer[]; cursor?: string }>(url)
    if (data.customers) all.push(...data.customers)
    cursor = data.cursor
    onProgress?.(all.length)
  } while (cursor)

  return all
}

/** Fetch active Square location IDs, excluding the inactive Bellevue location. */
async function fetchLocationIds(): Promise<string[]> {
  const data = await squareFetch<{ locations?: { id: string; name?: string; status?: string }[] }>('/v2/locations')
  const locations = data.locations ?? []
  const active = locations.filter(l => {
    // Exclude inactive Bellevue location
    if (l.name && /bellevue/i.test(l.name) && l.status === 'INACTIVE') return false
    return l.status === 'ACTIVE'
  })
  return active.map(l => l.id)
}

/** Fetch all invoices across all locations (one location per request), paginating per location. */
async function fetchAllInvoices(
  locationIds: string[],
  onProgress?: (fetched: number) => void,
): Promise<any[]> {
  const all: any[] = []

  for (const locationId of locationIds) {
    let cursor: string | undefined
    do {
      const body: any = {
        query: {
          filter: {
            location_ids: [locationId],
          },
        },
        limit: 100,
        ...(cursor ? { cursor } : {}),
      }
      const result = await squarePost<{ invoices?: any[]; cursor?: string }>(
        '/v2/invoices/search',
        body,
      )
      if (result.invoices) all.push(...result.invoices)
      cursor = result.cursor
      onProgress?.(all.length)
    } while (cursor)
  }

  return all
}

/** Fetch all SCHEDULED invoices (upcoming recurring invoices for active students). */
export async function fetchScheduledInvoices(
  locationIds: string[],
  onProgress?: (fetched: number) => void,
): Promise<any[]> {
  const all = await fetchAllInvoices(locationIds, onProgress)
  const invoices = all.filter((inv: any) => inv.status === 'SCHEDULED')
  // dbg(`[Square] ${invoices.length} SCHEDULED invoices (of ${all.length} total):`, invoices)
  return invoices
}

/** Fetch all UNPAID invoices (overdue). */
export async function fetchUnpaidInvoices(
  locationIds: string[],
  onProgress?: (fetched: number) => void,
): Promise<any[]> {
  const all = await fetchAllInvoices(locationIds, onProgress)
  const invoices = all.filter((inv: any) => inv.status === 'UNPAID')
  // dbg(`[Square] ${invoices.length} UNPAID invoices (of ${all.length} total):`, invoices)
  return invoices
}

/**
 * Main sync: fetch all Square customers, match to Supabase families
 * by square_customer_id or email, then update square_customer_id on matches.
 */
export async function syncSquareCustomers(
  onProgress?: (status: string) => void,
  tenantId?: string,
): Promise<SyncResult> {
  // 1. Fetch all Square customers
  // dbg('[Square Sync] Step 1: Fetching Square customers...')
  onProgress?.('Fetching customers from Square...')
  const customers = await fetchAllSquareCustomers(
    (n) => onProgress?.(`Fetching customers from Square... (${n})`),
  )
  // dbg(`[Square Sync] Step 1 complete: ${customers.length} customers`)

  // 2. Fetch all families from Supabase in batches
  onProgress?.('Loading families from database...')
  // dbg('[Square Sync] Starting families fetch...')
  type FamilyRow = { id: string; name: string; primary_email: string | null; square_customer_id: string | null }
  const allFamilies: FamilyRow[] = []
  const BATCH_SIZE = 1000
  let from = 0

  while (true) {
    const batchPromise = supabase
      .from('families')
      .select('id, name, primary_email, square_customer_id')
      .range(from, from + BATCH_SIZE - 1)

    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`Families fetch timed out at offset ${from}`)), 30000),
    )

    const { data, error } = await Promise.race([batchPromise, timeout])
    if (error) throw new Error(`Failed to load families at offset ${from}: ${error.message}`)

    const batch = (data ?? []) as FamilyRow[]
    allFamilies.push(...batch)
    // dbg(`[Square Sync] Fetched families batch: offset=${from}, got=${batch.length}, total=${allFamilies.length}`)
    onProgress?.(`Loading families from database... (${allFamilies.length})`)

    if (batch.length < BATCH_SIZE) break
    from += BATCH_SIZE
  }
  // dbg(`[Square Sync] Families loaded: ${allFamilies.length} total`)

  // Build lookup maps
  const familyBySquareId = new Map<string, FamilyRow>()
  const familyByEmail = new Map<string, FamilyRow>()

  for (const f of allFamilies) {
    if (f.square_customer_id) familyBySquareId.set(f.square_customer_id, f)
    if (f.primary_email) familyByEmail.set(f.primary_email.toLowerCase(), f)
  }

  // 3. Match and collect updates
  // dbg('[Square Sync] Step 3: Matching customers to families...')
  const updates: { familyId: string; squareCustomerId: string }[] = []
  const unmatched: SquareCustomer[] = []

  for (const cust of customers) {
    // Already linked by square_customer_id?
    if (familyBySquareId.has(cust.id)) continue

    // Try email match
    const email = cust.email_address?.toLowerCase()
    const family = email ? familyByEmail.get(email) : undefined

    if (family) {
      updates.push({ familyId: family.id, squareCustomerId: cust.id })
      // Mark so we don't double-match
      familyBySquareId.set(cust.id, family)
    } else {
      unmatched.push(cust)
    }
  }

  // 4. Write updates to Supabase
  // dbg(`[Square Sync] Step 3 complete: ${updates.length} new matches, ${unmatched.length} unmatched`)
  if (updates.length > 0) {
    onProgress?.(`Updating ${updates.length} family records...`)
    for (const u of updates) {
      const { error: updateErr } = await supabase
        .from('families')
        .update({ square_customer_id: u.squareCustomerId })
        .eq('id', u.familyId)
      if (updateErr) console.error(`Failed to update family ${u.familyId}:`, updateErr)
    }
  }

  // 5. Fetch locations, then invoices (log only for now)
  onProgress?.('Fetching Square locations...')
  const locationIds = await fetchLocationIds()
  // dbg(`[Square] ${locationIds.length} locations:`, locationIds)

  onProgress?.('Fetching invoices...')
  const allInvoices = await fetchAllInvoices(
    locationIds,
    (n) => onProgress?.(`Fetching invoices... (${n})`),
  )
  const scheduled = allInvoices.filter((inv: any) => inv.status === 'SCHEDULED')
  const unpaidInv = allInvoices.filter((inv: any) => inv.status === 'UNPAID')
  // dbg(`[Square Sync] ${allInvoices.length} total invoices: ${scheduled.length} scheduled, ${unpaidInv.length} unpaid`)

  // 6. Deduplicate invoices by square_invoice_id (keep last occurrence)
  const deduped = [...new Map(allInvoices.map((inv: any) => [inv.id, inv])).values()]
  const dupeCount = allInvoices.length - deduped.length
  if (dupeCount > 0) {
    // dbg(`[Square Sync] Removed ${dupeCount} duplicate invoices (${allInvoices.length} → ${deduped.length})`)
  }

  // 7. Upsert invoices into square_invoices table
  onProgress?.(`Saving ${deduped.length} invoices to database...`)
  // dbg(`[Square Sync] Step 7: Upserting ${deduped.length} invoices to Supabase...`)

  if (!tenantId) throw new Error('tenantId is required for Square sync')
  const TENANT_ID = tenantId
  const UPSERT_BATCH = 100

  const invoiceRows = deduped.map((inv: any) => {
    const custId = inv.primary_recipient?.customer_id ?? null
    const family = custId ? familyBySquareId.get(custId) : undefined
    const payReq = inv.payment_requests?.[0]
    return {
      tenant_id: TENANT_ID,
      square_invoice_id: inv.id,
      square_customer_id: custId,
      square_location_id: inv.location_id ?? null,
      status: inv.status ?? null,
      amount_cents: payReq?.computed_amount_money?.amount ?? null,
      invoice_number: inv.invoice_number ?? null,
      title: inv.title ?? null,
      scheduled_at: inv.scheduled_at ?? null,
      due_date: payReq?.due_date ?? null,
      paid_at: payReq?.paid_at ?? null,
      square_created_at: inv.created_at ?? null,
      raw_data: inv,
      family_id: family?.id ?? null,
    }
  })

  let upserted = 0
  for (let i = 0; i < invoiceRows.length; i += UPSERT_BATCH) {
    const chunk = invoiceRows.slice(i, i + UPSERT_BATCH)
    const { error: upsertErr } = await supabase
      .from('square_invoices')
      .upsert(chunk, { onConflict: 'square_invoice_id' })
    if (upsertErr) {
      console.error(`[Square Sync] Upsert failed at offset ${i}:`, upsertErr)
    } else {
      upserted += chunk.length
    }
    onProgress?.(`Saving invoices... (${upserted}/${invoiceRows.length})`)
  }
  // dbg(`[Square Sync] Step 7 complete: ${upserted}/${invoiceRows.length} invoices upserted`)

  const matched = customers.length - unmatched.length

  return { squareCustomers: customers.length, matched, updated: updates.length, unmatched }
}
