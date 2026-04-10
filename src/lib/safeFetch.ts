/**
 * safeFetch — centralized edge-function / API fetch wrapper.
 *
 * Handles: auth token, apikey header, res.ok check, JSON parse safety,
 * abort timeout, and normalized error messages.
 *
 * Usage:
 *   const data = await safeFetch<{ url: string }>(EDGE_FUNCTIONS.createCheckout, {
 *     body: { tenant_id: tenantId },
 *   })
 */
import { supabase } from './supabase'
import { SUPABASE_ANON_KEY } from './config'

export class SafeFetchError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.name = 'SafeFetchError'
    this.status = status
  }
}

interface SafeFetchOptions {
  /** JSON body — automatically stringified. */
  body?: Record<string, unknown>
  /** Override HTTP method (default: POST). */
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH'
  /** Timeout in ms (default: 30_000). */
  timeoutMs?: number
  /** Skip auth token — for unauthenticated endpoints. */
  skipAuth?: boolean
  /** Extra headers merged after defaults. */
  headers?: Record<string, string>
  /** Existing AbortSignal to chain onto. */
  signal?: AbortSignal
}

/** Check if a JWT access token is expired or about to expire. */
function isTokenExpiringSoon(token: string, bufferMs = 30_000): boolean {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]))
    return (payload.exp * 1000) < (Date.now() + bufferMs)
  } catch {
    return true // Can't parse → treat as expired
  }
}

/** Get a valid (non-expired) access token, refreshing if needed. */
async function getFreshToken(): Promise<string> {
  const { data: { session } } = await supabase.auth.getSession()
  let token = session?.access_token

  // If token is expired or about to expire, force a refresh before using it
  if (token && isTokenExpiringSoon(token)) {
    const { data: { session: refreshed } } = await supabase.auth.refreshSession()
    token = refreshed?.access_token
  }

  if (!token) throw new Error('Not authenticated')
  return token
}

/**
 * Fetch a Supabase edge function (or any URL) with automatic auth, apikey,
 * timeout, res.ok enforcement, and safe JSON parsing.
 *
 * On 401, refreshes the session token and retries once before failing.
 *
 * Throws `SafeFetchError` on HTTP failures or `Error` on network/timeout.
 */
export async function safeFetch<T = unknown>(
  url: string,
  opts: SafeFetchOptions = {},
): Promise<T> {
  const { method = 'POST', body, timeoutMs = 30_000, skipAuth = false, headers: extra = {}, signal: externalSignal } = opts

  // Auth — ensure token is fresh before sending
  let token: string | undefined
  if (!skipAuth) {
    token = await getFreshToken()
  }

  // Timeout
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  // Chain external signal
  if (externalSignal) {
    if (externalSignal.aborted) {
      controller.abort()
    } else {
      externalSignal.addEventListener('abort', () => controller.abort(), { once: true })
    }
  }

  try {
    const doFetch = async (authToken: string | undefined): Promise<T> => {
      const baseHeaders: Record<string, string> = {
        'Content-Type': 'application/json',
      }
      if (authToken) baseHeaders['Authorization'] = `Bearer ${authToken}`
      if (SUPABASE_ANON_KEY) baseHeaders['apikey'] = SUPABASE_ANON_KEY

      const res = await fetch(url, {
        method,
        signal: controller.signal,
        headers: { ...baseHeaders, ...extra },
        body: body ? JSON.stringify(body) : undefined,
      })

      // Parse JSON safely
      let data: unknown
      const contentType = res.headers.get('content-type') ?? ''
      if (contentType.includes('application/json')) {
        try {
          data = await res.json()
        } catch {
          if (!res.ok) throw new SafeFetchError(`HTTP ${res.status}`, res.status)
          throw new Error('Invalid JSON response')
        }
      } else {
        const text = await res.text()
        if (!res.ok) throw new SafeFetchError(text || `HTTP ${res.status}`, res.status)
        // Try parsing as JSON anyway (some edge functions don't set content-type)
        try {
          data = JSON.parse(text)
        } catch {
          data = text as unknown
        }
      }

      if (!res.ok) {
        const errMsg = (data as any)?.error ?? (data as any)?.message ?? `HTTP ${res.status}`
        throw new SafeFetchError(String(errMsg), res.status)
      }

      return data as T
    }

    try {
      return await doFetch(token)
    } catch (err) {
      // On 401, refresh the token once and retry — handles stale session cache
      if (!skipAuth && err instanceof SafeFetchError && err.status === 401) {
        const { data: { session: refreshed } } = await supabase.auth.refreshSession()
        const freshToken = refreshed?.access_token
        if (freshToken) {
          return await doFetch(freshToken)
        }
      }
      throw err
    }
  } catch (err) {
    if (err instanceof SafeFetchError) throw err
    if ((err as any)?.name === 'AbortError') {
      throw new Error('Request timed out')
    }
    throw err instanceof Error ? err : new Error(String(err))
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Fire-and-forget variant — logs errors instead of throwing.
 * Use for non-critical background sends (e.g. email after progress update).
 */
export function safeFetchBackground(url: string, opts: SafeFetchOptions = {}): void {
  safeFetch(url, opts).catch((err) => {
    console.warn('[safeFetchBackground]', err instanceof Error ? err.message : err)
  })
}
