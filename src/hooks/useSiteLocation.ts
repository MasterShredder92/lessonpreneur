import { useMemo } from 'react'
import { useLocation } from 'react-router-dom'
import {
  LOCATIONS,
  getLocationByDomain,
  getLocationByRoute,
  type LocationConfig,
} from '../config/locations'

/**
 * Detects the active Adkins location from:
 *  1. URL path (first segment) — /omaha/drums, /gretna/piano, /bellevue, etc.
 *  2. Hostname — omahaguitarandmusiclessons.com, etc. (for custom domain deploys)
 *  3. Fallback — Omaha
 */
export function useSiteLocation(): LocationConfig {
  const { pathname } = useLocation()

  return useMemo(() => {
    // 1. Check first path segment: /omaha, /gretna/drums, /bellevue/piano, etc.
    const fromPath = getLocationByRoute(pathname)
    if (fromPath) return fromPath

    // 2. Check hostname (for custom domain deploys via Vercel rewrites)
    if (typeof window !== 'undefined') {
      const fromDomain = getLocationByDomain(window.location.hostname)
      if (fromDomain) return fromDomain
    }

    // 3. Fallback to Omaha
    return LOCATIONS.omaha
  }, [pathname])
}
