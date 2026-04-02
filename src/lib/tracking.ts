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
  }
}

let currentLocKey: LocKey | null = null

/**
 * Initialize (or re-initialize) all tracking pixels for a given location.
 * Called on first load and whenever the active location changes.
 */
export function initTracking(locKey: LocKey) {
  if (currentLocKey === locKey) return
  currentLocKey = locKey
  const loc = LOCATIONS[locKey]

  // GA4 — re-config with new measurement ID
  if (window.gtag) {
    window.gtag('config', loc.ga4, {
      page_path: window.location.pathname,
      page_title: loc.fullName,
    })
  }

  // Meta Pixel — re-init with new pixel ID
  if (window.fbq) {
    window.fbq('init', loc.metaPixel)
    window.fbq('track', 'PageView')
  }

  // TikTok Pixel — load with new pixel ID
  if (window.ttq) {
    window.ttq.load(loc.tiktokPixel)
    window.ttq.page()
  }
}

/**
 * Track a page view across all platforms.
 * Call on every SPA route change.
 */
export function trackPageView() {
  if (!currentLocKey) return
  const loc = LOCATIONS[currentLocKey]

  if (window.gtag) {
    window.gtag('event', 'page_view', {
      page_path: window.location.pathname,
      page_title: document.title,
    })
  }

  if (window.fbq) {
    window.fbq('track', 'PageView')
  }

  if (window.ttq) {
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
