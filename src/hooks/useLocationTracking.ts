import { useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import type { LocationConfig } from '../config/locations'
import { initTracking, trackPageView } from '../lib/tracking'

/**
 * Fires the correct GA4 config, Meta Pixel PageView, and TikTok page()
 * for a given location.
 *
 * Tracking libraries are loaded in index.html, but initialization and PageView events
 * are handled here (SPA-driven) so there is a single source of truth.
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
