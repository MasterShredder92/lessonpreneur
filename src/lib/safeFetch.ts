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

/**
 * Fetch a Supabase edge function (or any URL) with automatic auth, apikey,
 * timeout, res.ok enforcement, and safe JSON parsing.
 *
 * Throws `SafeFetchError` on HTTP failures or `Error` on network/timeout.
 */
export async function safeFetch<T = unknown>(
  url: string,
  opts: SafeFetchOptions = {},
): Promise<T> {
  const { method = 'POST', body, timeoutMs = 30_000, skipAuth = false, headers: extra = {}, signal: externalSignal } = opts

  // Auth
  let token: string | undefined
  if (!skipAuth) {
    const { data: { session } } = await supabase.auth.getSession()
    token = session?.access_token
    if (!token) throw new Error('Not authenticated')
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

  const baseHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
  }
  if (token) baseHeaders['Authorization'] = `Bearer ${token}`
  if (SUPABASE_ANON_KEY) baseHeaders['apikey'] = SUPABASE_ANON_KEY

  try {
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
