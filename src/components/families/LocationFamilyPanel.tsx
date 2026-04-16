import { useEffect, useMemo, useRef, useState } from 'react'
import { X } from 'lucide-react'
import MusicLoader from '../shared/MusicLoader'
import { useFamiliesRosterInfinite } from '../../hooks/useFamilies'
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
  const locColor = locationId === 'all' ? '#D4226A' : (locationColors[locationId] ?? '#D4226A')

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
          background: 'rgba(2,2,9,0.72)',
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
          background: 'linear-gradient(160deg, #0C0C18 0%, #08080F 100%)',
          borderLeft: '1px solid rgba(255,255,255,0.08)',
          boxShadow: '-24px 0 80px rgba(0,0,0,0.7)',
          animation: 'slideInRight 260ms cubic-bezier(0.22, 1, 0.36, 1)',
        }}
      >
        <div
          style={{
            padding: '18px 24px',
            borderBottom: '1px solid rgba(255,255,255,0.06)',
            display: 'flex',
            alignItems: 'center',
            gap: 14,
            flexShrink: 0,
            background: 'rgba(0,0,0,0.2)',
          }}
        >
          <div style={{ width: 4, height: 46, borderRadius: 2, background: locColor, flexShrink: 0 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2
              style={{
                margin: 0,
                fontWeight: 800,
                fontSize: 17,
                color: '#E0E0F4',
                letterSpacing: '-0.01em',
              }}
            >
              {locationId === 'all' ? 'All Families' : (loc?.name ?? 'Families')}
            </h2>
            <p style={{ margin: '3px 0 0', fontSize: 11, color: '#8080A8' }}>
              {locationId === 'all'
                ? 'Across all locations'
                : (loc?.city ? `${loc.city}, ${loc.state}` : '')}
            </p>
          </div>
          <button
            onClick={onAddFamily}
            style={{
              fontSize: 12,
              padding: '7px 14px',
              borderRadius: 8,
              background: '#D4226A',
              border: 'none',
              color: '#fff',
              fontWeight: 700,
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
              width: 32,
              height: 32,
              borderRadius: 8,
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.08)',
              color: '#8080A8',
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
            borderBottom: '1px solid rgba(255,255,255,0.04)',
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
                fontWeight: 700,
                fontSize: 12,
                color: activeTab === tab ? locColor : '#606088',
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
            borderBottom: '1px solid rgba(255,255,255,0.04)',
            display: 'flex',
            gap: 8,
            flexShrink: 0,
            flexWrap: 'wrap',
            background: 'rgba(0,0,0,0.1)',
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

        <div style={{ padding: '6px 24px 4px', fontSize: 11, color: '#606088', flexShrink: 0 }}>
          {rosterInfinite.isLoading
            ? 'Loading...'
            : `${rosterRows.length}${rosterInfinite.hasNextPage ? '+' : ''} famil${rosterRows.length !== 1 ? 'ies' : 'y'}`}
        </div>

        {!rosterInfinite.isLoading && (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: gridCols,
              gap: '0 12px',
              padding: '7px 24px',
              fontSize: 10,
              fontWeight: 700,
              color: '#8080A8',
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              borderBottom: '1px solid rgba(255,255,255,0.06)',
              background: 'rgba(0,0,0,0.2)',
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
                  <span style={{ fontSize: 12, color: '#8080A8' }}>Loading more…</span>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </>
  )
}

