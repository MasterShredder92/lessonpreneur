import { useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import type { LocationConfig } from '../config/locations'
import { initTracking, trackPageView } from '../lib/tracking'

/**
 * Fires the correct GA4 config, Meta Pixel PageView, and TikTok page()
 * for a given location.
 *
 * The index.html script handles domain-based detection on initial load.
 * This hook handles SPA navigation between location routes (e.g. /omaha -> /bellevue)
 * by re-firing config/PageView with the correct IDs when the location changes.
 */
export function useLocationTracking(location: LocationConfig) {
  const prevKey = useRef<string | null>(null)
  const { pathname } = useLocation()

  // Re-init all pixels when location changes
  useEffect(() => {
    if (prevKey.current === location.key) return
    prevKey.current = location.key
    initTracking(location.key)
  }, [location.key])

  // Fire pageview on every route change within the same location
  useEffect(() => {
    trackPageView()
  }, [pathname])
}
