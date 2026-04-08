import { supabase } from './supabase'

const EDGE_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/square-proxy`

async function squareProxy<T = unknown>(action: string, payload: Record<string, unknown> = {}): Promise<T> {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.access_token) throw new Error('Not authenticated')

  const res = await fetch(EDGE_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({ action, ...payload }),
  })

  if (!res.ok) {
    const body = await res.json().catch(() => null)
    throw new Error(`Square proxy error ${res.status}: ${JSON.stringify(body)}`)
  }

  return res.json()
}

export async function testListCustomers(): Promise<{ customers: any[]; cursor?: string }> {
  const data = await squareProxy<any>('list-customers', { limit: 10 })
  return {
    customers: data.customers ?? [],
    cursor: data.cursor,
  }
}

export async function createCard(sourceId: string, referenceId?: string): Promise<any> {
  return squareProxy('create-card', { source_id: sourceId, reference_id: referenceId })
}

export async function createPayment(params: {
  sourceId: string
  amountCents: number
  referenceId?: string
  note?: string
}): Promise<any> {
  return squareProxy('create-payment', {
    source_id: params.sourceId,
    amount_cents: params.amountCents,
    reference_id: params.referenceId,
    note: params.note,
  })
}
