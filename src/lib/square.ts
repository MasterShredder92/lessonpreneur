const SQUARE_BASE_URL = '/square-api'
const accessToken = import.meta.env.VITE_SQUARE_ACCESS_TOKEN

if (!accessToken) {
  console.warn('Missing VITE_SQUARE_ACCESS_TOKEN environment variable')
}

async function squareFetch<T = unknown>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${SQUARE_BASE_URL}${path}`, {
    ...options,
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'Square-Version': '2025-01-23',
      ...options.headers,
    },
  })

  if (!res.ok) {
    const body = await res.json().catch(() => null)
    throw new Error(`Square API error ${res.status}: ${JSON.stringify(body)}`)
  }

  return res.json()
}

export async function testListCustomers(): Promise<{ customers: any[]; cursor?: string }> {
  const data = await squareFetch<any>('/v2/customers?limit=10')
  return {
    customers: data.customers ?? [],
    cursor: data.cursor,
  }
}
