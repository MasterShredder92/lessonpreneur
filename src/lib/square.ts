import { EDGE_FUNCTIONS } from './config'
import { safeFetch } from './safeFetch'

async function squareProxy<T = unknown>(action: string, payload: Record<string, unknown> = {}): Promise<T> {
  return safeFetch<T>(EDGE_FUNCTIONS.squareProxy, {
    body: { action, ...payload },
  })
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
