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
import { checkCircuit, recordFailure, recordSuccess } from './circuitBreaker'

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
  /** Max retries for transient errors (default: 2). */
  maxRetries?: number
  /** Base delay in ms for exponential backoff (default: 1000). */
  retryBaseMs?: number
  /** HTTP status codes that trigger retry (default: [429, 502, 503, 504]). */
  retryStatuses?: number[]
}

const DEFAULT_RETRY_STATUSES = [429, 502, 503, 504]

function shouldRetry(status: number, retryStatuses: number[]): boolean {
  return retryStatuses.includes(status)
}

async function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
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
  const {
    method = 'POST',
    body,
    timeoutMs = 30_000,
    skipAuth = false,
    headers: extra = {},
    signal: externalSignal,
  } = opts

  const maxRetries = opts.maxRetries ?? 2
  const retryBaseMs = opts.retryBaseMs ?? 1000
  const retryStatuses = opts.retryStatuses ?? DEFAULT_RETRY_STATUSES

  // Auth — ensure token is fresh before sending
  let token: string | undefined
  if (!skipAuth) {
    token = await getFreshToken()
  }

  const circuitKey = new URL(url).pathname
  if (!checkCircuit(circuitKey)) {
    throw new SafeFetchError('Service temporarily unavailable (circuit open)', 503)
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

    let lastError: unknown
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const out = await doFetch(token)
        recordSuccess(circuitKey)
        return out
      } catch (err) {
        lastError = err

        // On 401, refresh the token once and retry — handles stale session cache
        if (attempt === 0 && !skipAuth && err instanceof SafeFetchError && err.status === 401) {
          const { data: { session: refreshed } } = await supabase.auth.refreshSession()
          const freshToken = refreshed?.access_token
          if (freshToken) {
            token = freshToken
            continue
          }
        }

        if (err instanceof SafeFetchError && err.status >= 500) {
          recordFailure(circuitKey)
        }

        if (err instanceof SafeFetchError && shouldRetry(err.status, retryStatuses) && attempt < maxRetries) {
          const backoff = retryBaseMs * Math.pow(2, attempt)
          const jitter = Math.random() * backoff * 0.2
          console.warn('[ZiroTelemetry:retry]', {
            url: circuitKey,
            attempt: attempt + 1,
            maxRetries,
            status: err.status,
            waitMs: Math.round(backoff + jitter),
            timestamp: Date.now(),
          })
          await delay(backoff + jitter)
          continue
        }

        if (
          !(err instanceof SafeFetchError) &&
          err instanceof Error &&
          (err.message === 'Failed to fetch' || err.message === 'Load failed') &&
          attempt < maxRetries
        ) {
          const backoff = retryBaseMs * Math.pow(2, attempt)
          console.warn('[ZiroTelemetry:retry]', {
            url: circuitKey,
            attempt: attempt + 1,
            maxRetries,
            status: 'network_error',
            waitMs: Math.round(backoff),
            timestamp: Date.now(),
          })
          await delay(backoff)
          continue
        }

        break
      }
    }

    throw lastError
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
