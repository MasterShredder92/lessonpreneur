import { useEffect, useMemo, useRef, useState } from 'react'
import { X } from 'lucide-react'
import MusicLoader from '../shared/MusicLoader'
import { useFamiliesRosterInfinite } from '../../hooks/useFamilies'
import { getLocationColor } from '../../utils/locationColor'
import FamilyRosterRow from './FamilyRosterRow'

const RATE_OPTIONS = [
  { label: 'All Rates', value: 0 },
  { label: '$45.00', value: 4500 },
  { label: '$40.00', value: 4000 },
  { label: '$37.50', value: 3750 },
]

export default function LocationFamilyPanel({
  locationId,
  locations,
  canEdit,
  onClose,
  onAddFamily,
  onOpenFamily,
  navigate,
  locationColors,
}: {
  locationId: string
  locations: any[] | undefined
  canEdit: boolean
  onClose: () => void
  onAddFamily: () => void
  onOpenFamily: (id: string) => void
  navigate: (path: string) => void
  locationColors: Record<string, string>
}) {
  const [search, setSearch] = useState('')
  const [rateFilter, setRateFilter] = useState(0)
  const [sortBy, setSortBy] = useState<'az' | 'za' | 'newest' | 'oldest'>('az')
  const [activeTab, setActiveTab] = useState<'active' | 'inactive'>('active')

  const effectiveLocationId = locationId === 'all' ? null : locationId
  const loc = locationId === 'all' ? null : locations?.find((l: any) => l.id === locationId)
  const locColor = locationId === 'all' ? 'var(--pink)' : (locationColors[locationId] ?? getLocationColor(locationId))

  const rosterInfinite = useFamiliesRosterInfinite({
    familyTab: activeTab,
    locationId: effectiveLocationId,
    rateFilter,
    search,
    sortBy,
    enabled: true,
  })

  const rosterRows = useMemo(
    () => rosterInfinite.data?.pages.flatMap((p) => p.rows) ?? [],
    [rosterInfinite.data],
  )

  const loadMoreRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = loadMoreRef.current
    if (!el) return
    const obs = new IntersectionObserver(
      (entries) => {
        if (
          entries[0]?.isIntersecting &&
          rosterInfinite.hasNextPage &&
          !rosterInfinite.isFetchingNextPage
        ) {
          rosterInfinite.fetchNextPage()
        }
      },
      { rootMargin: '200px' },
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [rosterInfinite.hasNextPage, rosterInfinite.isFetchingNextPage, rosterInfinite.fetchNextPage])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  const gridCols =
    'minmax(140px,1.5fr) minmax(72px,0.55fr) minmax(160px,1.1fr) minmax(100px,0.75fr) minmax(200px,1.3fr) minmax(120px,0.85fr) minmax(100px,0.75fr) minmax(88px,0.65fr)'

  return (
    <>
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 300,
          background: 'color-mix(in srgb, var(--bg-base) 72%, transparent)',
          backdropFilter: 'blur(4px)',
          WebkitBackdropFilter: 'blur(4px)',
        }}
      />

      <div
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          width: 'min(900px, 100vw)',
          height: '100vh',
          zIndex: 301,
          display: 'flex',
          flexDirection: 'column',
          background: 'linear-gradient(160deg, var(--surface-modal) 0%, var(--bg-base) 100%)',
          borderLeft: 'var(--border-width) solid var(--white-8)',
          boxShadow: '-24px 0 80px var(--overlay-scrim-70)',
          animation: 'slideInRight 260ms cubic-bezier(0.22, 1, 0.36, 1)',
        }}
      >
        <div
          style={{
            padding: 'var(--space-inline-y-18) var(--space-xl)',
            borderBottom: 'var(--border-width) solid var(--white-6)',
            display: 'flex',
            alignItems: 'center',
            gap: 14,
            flexShrink: 0,
            background: 'color-mix(in srgb, #000000 20%, transparent)',
          }}
        >
          <div style={{ width: 4, height: 46, borderRadius: 2, background: locColor, flexShrink: 0 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2
              style={{
                margin: 0,
                fontWeight: 800,
                fontSize: 'var(--font-size-4xl)',
                color: 'var(--text-secondary)',
                letterSpacing: '-0.01em',
              }}
            >
              {locationId === 'all' ? 'All Families' : (loc?.name ?? 'Families')}
            </h2>
            <p style={{ margin: 'var(--space-3xs) 0 0', fontSize: 'var(--font-size-sm)', color: 'var(--text-placard)' }}>
              {locationId === 'all'
                ? 'Across all locations'
                : (loc?.city ? `${loc.city}, ${loc.state}` : '')}
            </p>
          </div>
          <button
            onClick={onAddFamily}
            style={{
              fontSize: 'var(--font-size-lg)',
              padding: '7px 14px',
              borderRadius: 'var(--radius-sm)',
              background: 'var(--pink)',
              border: 'none',
              color: 'var(--text-primary)',
              fontWeight: 'var(--font-weight-bold)',
              cursor: 'pointer',
              flexShrink: 0,
              letterSpacing: '-0.01em',
            }}
          >
            + Add Family
          </button>
          <button
            onClick={onClose}
            style={{
              width: 'var(--size-icon-button)',
              height: 'var(--size-icon-button)',
              borderRadius: 'var(--radius-sm)',
              background: 'var(--white-4)',
              border: 'var(--border-width) solid var(--white-8)',
              color: 'var(--text-placard)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <X size={14} />
          </button>
        </div>

        <div
          style={{
            padding: '0 24px',
            borderBottom: 'var(--border-width) solid var(--white-4)',
            flexShrink: 0,
            display: 'flex',
            gap: 0,
          }}
        >
          {(['active', 'inactive'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                padding: '11px 18px',
                fontWeight: 'var(--font-weight-bold)',
                fontSize: 'var(--font-size-lg)',
                color: activeTab === tab ? locColor : 'var(--text-caption)',
                background: 'none',
                border: 'none',
                borderBottom: `2px solid ${activeTab === tab ? locColor : 'transparent'}`,
                cursor: 'pointer',
                transition: 'color 150ms ease, border-color 150ms ease',
                textTransform: 'capitalize',
              }}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>

        <div
          style={{
            padding: '10px 24px',
            borderBottom: 'var(--border-width) solid var(--white-4)',
            display: 'flex',
            gap: 'var(--space-sm)',
            flexShrink: 0,
            flexWrap: 'wrap',
            background: 'color-mix(in srgb, #000000 10%, transparent)',
          }}
        >
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, email, phone..."
            className="filter-select"
            style={{ flex: '1 1 180px', minWidth: 0 }}
          />
          <select
            value={rateFilter}
            onChange={(e) => setRateFilter(Number(e.target.value))}
            className="filter-select"
            style={{ flex: '0 0 auto', minWidth: 110 }}
          >
            <option value={0}>All Rates</option>
            {RATE_OPTIONS.filter(r => r.value).map(r => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as 'az' | 'za' | 'newest' | 'oldest')}
            className="filter-select"
            style={{ flex: '0 0 auto', minWidth: 120 }}
          >
            <option value="az">A → Z</option>
            <option value="za">Z → A</option>
            <option value="newest">Newest First</option>
            <option value="oldest">Oldest First</option>
          </select>
        </div>

        <div style={{ padding: '6px var(--space-xl) 4px', fontSize: 'var(--font-size-sm)', color: 'var(--text-caption)', flexShrink: 0 }}>
          {rosterInfinite.isLoading
            ? 'Loading...'
            : `${rosterRows.length}${rosterInfinite.hasNextPage ? '+' : ''} famil${rosterRows.length !== 1 ? 'ies' : 'y'}`}
        </div>

        {!rosterInfinite.isLoading && (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: gridCols,
              gap: '0 var(--space-md)',
              padding: '7px var(--space-xl)',
              fontSize: 'var(--font-size-xs)',
              fontWeight: 'var(--font-weight-bold)',
              color: 'var(--text-placard)',
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              borderBottom: 'var(--border-width) solid var(--white-6)',
              background: 'color-mix(in srgb, #000000 20%, transparent)',
              flexShrink: 0,
            }}
          >
            <span>Family</span>
            <span>Monthly</span>
            <span>Email</span>
            <span>Phone</span>
            <span>Students</span>
            <span>Card</span>
            <span>Billing</span>
            <span>Agreement</span>
          </div>
        )}

        <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden' }}>
          {rosterInfinite.isLoading ? (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 200 }}>
              <MusicLoader />
            </div>
          ) : rosterRows.length === 0 ? (
            <div className="empty-state" style={{ border: 'none', padding: 28 }}>
              No {activeTab} families found{search ? ' matching your search' : ''}.
            </div>
          ) : (
            <>
              {rosterRows.map((f) => (
                <FamilyRosterRow key={f.id} family={f} onClick={() => onOpenFamily(f.id)} />
              ))}
              <div
                ref={loadMoreRef}
                style={{
                  height: 24,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: 16,
                }}
              >
                {rosterInfinite.isFetchingNextPage && (
                  <span style={{ fontSize: 'var(--font-size-lg)', color: 'var(--text-placard)' }}>Loading more…</span>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </>
  )
}

