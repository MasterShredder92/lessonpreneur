import { useMemo, useEffect, lazy, Suspense } from 'react'
import { useUrlFilters } from '../../hooks/useUrlFilters'
import { useUserLocations } from '../../hooks/useUserLocations'
import ScheduleOverview from '../../components/scheduling/ScheduleOverview'
import MusicLoader from '../../components/shared/MusicLoader'

// Lazy-load the full schedule detail — only fetched when a location is selected
const ScheduleDetail = lazy(() => import('./ScheduleDetail'))

/**
 * Two-stage Schedule page.
 *
 * Stage 1 (default): Overview — per-location cards scoped via `useUserLocations` (same as Dashboard).
 *
 * Stage 2: Full grid — when URL `?location=` is set (or user has exactly one allowed location).
 */
export default function Schedule() {
  const { data: userLocIds, isLoading: scopeLoading } = useUserLocations()
  const { getParam, setParam } = useUrlFilters()

  const urlLocation = getParam('location')

  const validatedUrlLocation = useMemo(() => {
    if (!urlLocation) return null
    if (userLocIds == null) return urlLocation
    return userLocIds.includes(urlLocation) ? urlLocation : null
  }, [urlLocation, userLocIds])

  useEffect(() => {
    if (scopeLoading) return
    if (urlLocation && validatedUrlLocation === null) {
      setParam('location', '')
    }
  }, [scopeLoading, urlLocation, validatedUrlLocation, setParam])

  useEffect(() => {
    if (scopeLoading) return
    if (userLocIds?.length === 1 && urlLocation !== userLocIds[0]) {
      setParam('location', userLocIds[0])
    }
  }, [scopeLoading, userLocIds, urlLocation, setParam])

  const detailLocationId = useMemo(() => {
    if (scopeLoading) return undefined
    if (userLocIds && userLocIds.length === 1) return userLocIds[0]
    return validatedUrlLocation
  }, [scopeLoading, userLocIds, validatedUrlLocation])

  const handleSelectLocation = (locationId: string) => {
    if (userLocIds && userLocIds.length > 0 && !userLocIds.includes(locationId)) return
    setParam('location', locationId)
  }

  const handleBack = () => {
    if (userLocIds && userLocIds.length === 1) return
    setParam('location', '')
  }

  if (scopeLoading) {
    return (
      <div className="page" style={{ maxWidth: 'none', padding: '24px 20px' }}>
        <ScheduleLoadingSkeleton />
      </div>
    )
  }

  if (detailLocationId) {
    return (
      <Suspense fallback={
        <div className="page" style={{ maxWidth: 'none' }}>
          <ScheduleLoadingSkeleton />
        </div>
      }>
        <ScheduleDetail
          initialLocationId={detailLocationId}
          onBack={handleBack}
        />
      </Suspense>
    )
  }

  return (
    <div className="page" style={{ maxWidth: 'none', padding: '24px 20px' }}>
      <ScheduleOverview onSelectLocation={handleSelectLocation} />
    </div>
  )
}

function ScheduleLoadingSkeleton() {
  return (
    <div style={{ padding: '16px 12px' }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px',
        background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)',
        borderRadius: 12, marginBottom: 12,
      }}>
        <div style={{ width: 60, height: 28, borderRadius: 8, background: 'rgba(255,255,255,0.04)' }} />
        <div style={{ width: 80, height: 28, borderRadius: 8, background: 'rgba(255,255,255,0.06)' }} />
        <div style={{ width: 80, height: 28, borderRadius: 8, background: 'rgba(255,255,255,0.04)' }} />
        <div style={{ flex: 1 }} />
        <div style={{ width: 180, height: 28, borderRadius: 8, background: 'rgba(255,255,255,0.04)' }} />
      </div>
      <div style={{
        borderRadius: 16, border: '1px solid rgba(255,255,255,0.06)',
        background: 'rgba(12,11,22,0.95)', padding: 20, minHeight: 400,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <MusicLoader />
      </div>
    </div>
  )
}
