import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables')
}

// Global fetch wrapper with a 30s timeout — prevents hung requests from
// leaving mutations in a permanent "isPending" state (stuck Save buttons).
const fetchWithTimeout: typeof fetch = (input, init) => {
  const controller = new AbortController()
  const existingSignal = init?.signal
  if (existingSignal) {
    if (existingSignal.aborted) controller.abort()
    else existingSignal.addEventListener('abort', () => controller.abort(), { once: true })
  }
  const timeoutId = setTimeout(() => controller.abort(new DOMException('Request timed out after 30s', 'TimeoutError')), 30000)
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
