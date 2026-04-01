import { createContext, useContext } from 'react'
import type { LocKey } from './locations'

/**
 * Provides the active location key from the route to child components.
 * This is set by the route wrapper and consumed by AdkinsLanding and
 * instrument pages so they know which location is active.
 */
export const LocationContext = createContext<LocKey | null>(null)

export function useRouteLocationKey(): LocKey | null {
  return useContext(LocationContext)
}
