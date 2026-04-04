import { Outlet } from 'react-router-dom'
import StickyRevenueCounter from './StickyRevenueCounter'

/**
 * Layout wrapper for all public funnel routes (/start, /get-started, /trial, /onboarding).
 * Mounts the sticky revenue counter so it persists across page transitions.
 */
export default function PublicFunnelLayout() {
  return (
    <>
      <Outlet />
      <StickyRevenueCounter />
    </>
  )
}
