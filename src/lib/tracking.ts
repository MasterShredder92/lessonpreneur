/**
 * Unified tracking helpers for GA4, Meta Pixel, and TikTok Pixel.
 *
 * All three platforms fire from these shared functions so tracking
 * is never duplicated or missed across the site.
 */

import { LOCATIONS, type LocKey } from '../config/locations'

declare global {
  interface Window {
    gtag?: (...args: any[]) => void
    fbq?: (...args: any[]) => void
    ttq?: any
    dataLayer?: any[]
    __gtagInitedFor?: Set<string>
    __fbqInitedFor?: Set<string>
    __ttqLoadedFor?: Set<string>
  }
}

let currentLocKey: LocKey | null = null

function initGtagOnce(gaId: string) {
  if (!window.gtag || !gaId) return
  if (!window.__gtagInitedFor) window.__gtagInitedFor = new Set()
  if (window.__gtagInitedFor.has(gaId)) return
  window.__gtagInitedFor.add(gaId)
  window.gtag('config', gaId, { send_page_view: false })
}

function initFbqOnce(pixelId: string) {
  if (!window.fbq || !pixelId) return
  if (!window.__fbqInitedFor) window.__fbqInitedFor = new Set()
  if (window.__fbqInitedFor.has(pixelId)) return
  window.__fbqInitedFor.add(pixelId)
  window.fbq('init', pixelId)
}

function loadTtqOnce(pixelId: string) {
  if (!window.ttq || !pixelId) return
  if (!window.__ttqLoadedFor) window.__ttqLoadedFor = new Set()
  if (window.__ttqLoadedFor.has(pixelId)) return
  window.__ttqLoadedFor.add(pixelId)
  window.ttq.load(pixelId)
}

/**
 * Initialize (or re-initialize) all tracking pixels for a given location.
 * Called on first load and whenever the active location changes.
 */
export function initTracking(locKey: LocKey) {
  if (currentLocKey === locKey) return
  currentLocKey = locKey
  const loc = LOCATIONS[locKey]

  initGtagOnce(loc.ga4)
  initFbqOnce(loc.metaPixel)
  loadTtqOnce(loc.tiktokPixel)
}

/**
 * Track a page view across all platforms.
 * Call on every SPA route change.
 */
export function trackPageView() {
  if (!currentLocKey) return
  const loc = LOCATIONS[currentLocKey]
  const path = window.location.pathname
  const title = loc.fullName

  if (window.gtag && loc.ga4) {
    window.gtag('event', 'page_view', {
      page_path: path,
      page_title: title,
    })
  }

  if (window.fbq && loc.metaPixel) {
    window.fbq('track', 'PageView')
  }

  if (window.ttq && loc.tiktokPixel) {
    window.ttq.page()
  }
}

// ─── MICRO-EVENTS (funnel tracking) ───

/**
 * Fire when user clicks any opening button (For a kid, For myself, etc.)
 */
export function trackEnrollmentStarted(locationName: string, type: string) {
  if (window.fbq) {
    window.fbq('trackCustom', 'EnrollmentStarted', {
      content_name: 'enrollment_flow',
      location: locationName,
      type,
    })
  }
  if (window.gtag) {
    window.gtag('event', 'enrollment_started', { location: locationName, type })
  }
}

/**
 * Fire when first student name is confirmed.
 */
export function trackStudentNameEntered(studentNumber: number) {
  if (window.fbq) {
    window.fbq('trackCustom', 'StudentNameEntered', { student_number: studentNumber })
  }
  if (window.gtag) {
    window.gtag('event', 'student_name_entered', { student_number: studentNumber })
  }
}

/**
 * Fire when an instrument is selected per student.
 */
export function trackInstrumentSelected(instrument: string, studentNumber: number) {
  if (window.fbq) {
    window.fbq('trackCustom', 'InstrumentSelected', {
      instrument,
      student_number: studentNumber,
    })
  }
  if (window.gtag) {
    window.gtag('event', 'instrument_selected', { instrument, student_number: studentNumber })
  }
}

/**
 * Fire when "Add Another Student" is clicked.
 */
export function trackAdditionalStudentAdded(totalStudents: number) {
  if (window.fbq) {
    window.fbq('trackCustom', 'AdditionalStudentAdded', { total_students: totalStudents })
  }
  if (window.gtag) {
    window.gtag('event', 'additional_student_added', { total_students: totalStudents })
  }
}

// ─── FULL EVENTS ───

/**
 * Track a lead submission (signup/inquiry form completed).
 */
export function trackLead(locationName: string, studentCount?: number, instruments?: string[]) {
  // GA4
  if (window.gtag) {
    window.gtag('event', 'generate_lead', { location: locationName, student_count: studentCount })
    window.gtag('event', 'lead_submitted', { location: locationName })
  }

  // Meta Pixel — standard Lead event with details
  if (window.fbq) {
    window.fbq('track', 'Lead', {
      content_name: 'enrollment_form',
      location: locationName,
      student_count: studentCount || 1,
      instruments: instruments || [],
    })
  }

  // TikTok
  if (window.ttq) {
    window.ttq.track('SubmitForm')
  }
}

/**
 * Track an instrument page view (ViewContent).
 */
export function trackInstrumentView(instrument: string) {
  // GA4
  if (window.gtag) {
    window.gtag('event', 'view_content', { content_name: instrument })
  }

  // Meta Pixel
  if (window.fbq) {
    window.fbq('track', 'ViewContent', { content_name: instrument })
  }

  // TikTok
  if (window.ttq) {
    window.ttq.track('ViewContent', { content_name: instrument })
  }
}
