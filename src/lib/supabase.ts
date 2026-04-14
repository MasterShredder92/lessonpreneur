import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables')
}

/** Edge Function calls (e.g. Square sync) can run minutes; 30s abort caused (canceled) in DevTools. */
const DEFAULT_FETCH_TIMEOUT_MS = 30_000
const EDGE_FUNCTION_FETCH_TIMEOUT_MS = 300_000

function requestUrlString(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input
  if (input instanceof Request) return input.url
  return input.href
}

/**
 * SPEED: `performance_alerts` rows must be created via `speed_upsert_performance_alerts` (dedupe + lifecycle).
 * Direct PostgREST POST to `/rest/v1/performance_alerts` omits NOT NULL columns and caused 23502 in production.
 */
function blocksDirectPerformanceAlertsInsert(input: RequestInfo | URL, init?: RequestInit): boolean {
  const method = (
    init?.method
    ?? (typeof Request !== 'undefined' && input instanceof Request ? input.method : undefined)
    ?? 'GET'
  ).toUpperCase()
  if (method !== 'POST') return false
  const url = requestUrlString(input)
  if (url.includes('/rpc/')) return false
  try {
    const pathname = new URL(url, supabaseUrl).pathname
    return /\/rest\/v1\/performance_alerts\/?(\?|$)/.test(pathname)
  } catch {
    return /\/rest\/v1\/performance_alerts\/?(\?|$)/.test(url)
  }
}

// Global fetch wrapper with timeout — prevents hung mutations; Edge Functions get a longer budget.
const fetchWithTimeout: typeof fetch = (input, init) => {
  if (blocksDirectPerformanceAlertsInsert(input, init)) {
    return Promise.reject(
      new Error(
        'Direct insert to performance_alerts is disabled. Use applyPerformanceAlerts() → speed_upsert_performance_alerts (SPEED → Run Analysis).',
      ),
    )
  }
  const controller = new AbortController()
  const existingSignal = init?.signal
  if (existingSignal) {
    if (existingSignal.aborted) controller.abort()
    else existingSignal.addEventListener('abort', () => controller.abort(), { once: true })
  }
  const url = requestUrlString(input)
  const timeoutMs = url.includes('/functions/v1/') ? EDGE_FUNCTION_FETCH_TIMEOUT_MS : DEFAULT_FETCH_TIMEOUT_MS
  const timeoutId = setTimeout(() => {
    controller.abort(
      new DOMException(`Request timed out after ${Math.round(timeoutMs / 1000)}s`, 'TimeoutError'),
    )
  }, timeoutMs)
  return fetch(input, { ...init, signal: controller.signal }).finally(() => clearTimeout(timeoutId))
}

// Window-level singleton guard — prevents duplicate GoTrueClient instances
// even if Vite HMR re-evaluates this module or React Strict Mode double-mounts
const GLOBAL_KEY = '__supabase_singleton__'
if (!(window as any)[GLOBAL_KEY]) {
  (window as any)[GLOBAL_KEY] = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true,
      flowType: 'pkce',
      // Disable navigator locks — prevents NavigatorLockAcquireTimeoutError
      // caused by React Strict Mode double-mounting auth subscriptions.
      // Safe for single-tab usage; token refresh is still handled by the client.
      lock: async (_name: string, _acquireTimeout: number, fn: () => Promise<any>) => fn(),
    },
    global: {
      fetch: fetchWithTimeout,
    },
    realtime: {
      timeout: 30000,
    },
  })
}
export const supabase = (window as any)[GLOBAL_KEY]

/** Get the current open billing cycle ID for the tenant, or null if none exists */
export async function getCurrentBillingCycleId(tenantId: string): Promise<string | null> {
  const { data } = await supabase
    .from('billing_cycles')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('status', 'open')
    .order('billing_month', { ascending: false })
    .limit(1)
    .single()
  return data?.id ?? null
}
