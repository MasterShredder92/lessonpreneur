import { useEffect, useRef } from 'react'
import type { LocationConfig } from '../config/locations'

declare global {
  interface Window {
    gtag?: (...args: any[]) => void
    fbq?: (...args: any[]) => void
    dataLayer?: any[]
  }
}

/**
 * Fires the correct GA4 config and Meta Pixel PageView for a given location.
 *
 * The index.html script handles domain-based detection on initial load.
 * This hook handles SPA navigation between location routes (e.g. /omaha → /bellevue)
 * by re-firing config/PageView with the correct IDs when the location changes.
 */
export function useLocationTracking(location: LocationConfig) {
  const prevGa4 = useRef<string | null>(null)

  useEffect(() => {
    // Skip if this is the same GA4 ID (no location change)
    if (prevGa4.current === location.ga4) return
    prevGa4.current = location.ga4

    // Re-configure GA4 for the new location
    if (window.gtag) {
      window.gtag('config', location.ga4, {
        page_path: location.route,
        page_title: location.fullName,
      })
    }

    // Fire Meta Pixel PageView for the new location
    if (window.fbq) {
      // Re-init with the new pixel ID and fire PageView
      window.fbq('init', location.metaPixel)
      window.fbq('track', 'PageView')
    }
  }, [location.ga4, location.metaPixel, location.route, location.fullName])
}
