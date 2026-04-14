/**
 * SPEED Agent — Performance Monitor
 *
 * Collects Web Vitals (FCP, LCP, CLS, INP, TTFB) via the browser
 * PerformanceObserver API and flushes them to Supabase in the background.
 *
 * Usage: call startPerformanceMonitoring(tenantId) once on app boot.
 * The monitor is a singleton — subsequent calls are no-ops.
 */

import { flushPageMetrics } from './metrics'

// One UUID per browser tab, grouping metrics from the same session
const SESSION_ID = crypto.randomUUID()

/** Accumulated vitals for the current page route */
interface PendingVitals {
  route: string
  loadTimeMs?: number
  fcpMs?: number
  lcpMs?: number
  clsScore?: number
  inpMs?: number
  ttfbMs?: number
}

let pending: PendingVitals | null = null
let tenantIdRef: string | null = null
let flushTimer: ReturnType<typeof setTimeout> | null = null
let started = false
const observers: PerformanceObserver[] = []

// Flush after 5 s of accumulation so we capture LCP (which fires late)
const FLUSH_DELAY_MS = 5_000

function scheduleFlush() {
  if (flushTimer) clearTimeout(flushTimer)
  flushTimer = setTimeout(() => {
    flushTimer = null
    if (pending && tenantIdRef) {
      flushPageMetrics(tenantIdRef, SESSION_ID, { ...pending })
      pending = null
    }
  }, FLUSH_DELAY_MS)
}

function ensurePending(route: string) {
  if (!pending || pending.route !== route) {
    // New route — flush any previous entry immediately
    if (pending && tenantIdRef) {
      if (flushTimer) { clearTimeout(flushTimer); flushTimer = null }
      flushPageMetrics(tenantIdRef, SESSION_ID, { ...pending })
    }
    pending = { route }
  }
  scheduleFlush()
}

function currentRoute(): string {
  return typeof window !== 'undefined' ? window.location.pathname : '/'
}

function observeFCP() {
  try {
    const obs = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.name === 'first-contentful-paint') {
          ensurePending(currentRoute())
          pending!.fcpMs = Math.round(entry.startTime)
        }
      }
    })
    obs.observe({ type: 'paint', buffered: true })
    observers.push(obs)
  } catch (_) { /* not supported */ }
}

function observeLCP() {
  try {
    const obs = new PerformanceObserver((list) => {
      // LCP fires multiple times — take the last one
      const entries = list.getEntries()
      const last = entries[entries.length - 1]
      if (last) {
        ensurePending(currentRoute())
        pending!.lcpMs = Math.round(last.startTime)
      }
    })
    obs.observe({ type: 'largest-contentful-paint', buffered: true })
    observers.push(obs)
  } catch (_) { /* not supported */ }
}

function observeCLS() {
  let clsValue = 0
  let sessionValue = 0
  let sessionEntries: PerformanceEntry[] = []
  let prevEntry: PerformanceEntry | null = null

  try {
    const obs = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        const layoutShift = entry as PerformanceEntry & { hadRecentInput?: boolean; value?: number }
        if (!layoutShift.hadRecentInput) {
          const firstEntry = sessionEntries[0]
          const lastEntry = sessionEntries[sessionEntries.length - 1]
          // New session gap > 1s or gap between entries > 5s
          if (
            sessionEntries.length &&
            firstEntry &&
            lastEntry &&
            (entry.startTime - lastEntry.startTime > 1000 ||
              entry.startTime - firstEntry.startTime > 5000)
          ) {
            if (sessionValue > clsValue) clsValue = sessionValue
            sessionEntries = []
            sessionValue = 0
          }
          sessionEntries.push(entry)
          sessionValue += layoutShift.value ?? 0
          if (sessionValue > clsValue) clsValue = sessionValue
          prevEntry = entry

          ensurePending(currentRoute())
          pending!.clsScore = Math.round(clsValue * 10000) / 10000
        }
      }
    })
    obs.observe({ type: 'layout-shift', buffered: true })
    observers.push(obs)
  } catch (_) { /* not supported */ }
}

function observeINP() {
  try {
    const obs = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        const evt = entry as PerformanceEntry & { processingStart?: number; processingEnd?: number; duration?: number }
        const inp = evt.duration ?? 0
        if (inp > 0) {
          ensurePending(currentRoute())
          // Keep the worst INP seen
          if (!pending!.inpMs || inp > pending!.inpMs) {
            pending!.inpMs = Math.round(inp)
          }
        }
      }
    })
    obs.observe({ type: 'event', buffered: true, durationThreshold: 16 } as PerformanceObserverInit)
    observers.push(obs)
  } catch (_) { /* not supported */ }
}

function observeNavigation() {
  try {
    const obs = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        const nav = entry as PerformanceNavigationTiming
        ensurePending(currentRoute())
        pending!.ttfbMs = Math.round(nav.responseStart - nav.requestStart)
        pending!.loadTimeMs = Math.round(nav.loadEventEnd - nav.startTime)
      }
    })
    obs.observe({ type: 'navigation', buffered: true })
    observers.push(obs)
  } catch (_) { /* not supported */ }
}

/**
 * Call once on app boot with the authenticated tenant ID.
 * Safe to call before auth resolves — monitors won't flush until
 * tenantId is set via setMonitorTenantId().
 */
export function startPerformanceMonitoring(tenantId: string): void {
  if (started || typeof window === 'undefined') return
  started = true
  tenantIdRef = tenantId

  observeNavigation()
  observeFCP()
  observeLCP()
  observeCLS()
  observeINP()
}

/** Call when tenantId becomes available (e.g., after auth resolves). */
export function setMonitorTenantId(tenantId: string): void {
  tenantIdRef = tenantId
}

/** Stop all observers (useful for testing or teardown). */
export function stopPerformanceMonitoring(): void {
  observers.forEach(obs => { try { obs.disconnect() } catch (_) {} })
  observers.length = 0
  if (flushTimer) { clearTimeout(flushTimer); flushTimer = null }
  started = false
  pending = null
}

export { SESSION_ID }
