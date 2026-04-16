import { useMemo } from 'react'

interface FamilyLocationGridProps {
  locations: any[] | undefined
  locationCounts: Record<string, number> | undefined
  locationColors: Record<string, string>
  totalActive: number | undefined
  onSelectLocation: (id: string) => void
  isStudioDirector: boolean
  lockedLocationId: string | null
}

export default function FamilyLocationGrid({
  locations,
  locationCounts,
  locationColors,
  totalActive,
  onSelectLocation,
  isStudioDirector,
  lockedLocationId,
}: FamilyLocationGridProps) {
  const visible = useMemo(() => {
    if (!locations) return []
    if (isStudioDirector && lockedLocationId)
      return locations.filter((l) => l.id === lockedLocationId)
    return locations.filter((l) => l.is_active)
  }, [locations, isStudioDirector, lockedLocationId])

  return (
    <div>
      <p style={{ fontSize: 13, color: '#8080A8', marginBottom: 20, marginTop: 4 }}>
        Click a location to view its family roster. Data loads on demand — no delay.
      </p>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))',
          gap: 14,
        }}
      >
        {visible.map((loc) => {
          const color = locationColors[loc.id] ?? '#D4226A'
          const count = locationCounts?.[loc.id]
          return (
            <button
              key={loc.id}
              onClick={() => onSelectLocation(loc.id)}
              style={{
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.06)',
                borderRadius: 16,
                padding: 0,
                cursor: 'pointer',
                textAlign: 'left',
                display: 'flex',
                overflow: 'hidden',
                transition:
                  'border-color 150ms ease, background 150ms ease, transform 150ms ease',
              }}
              onMouseEnter={(e) => {
                ;(e.currentTarget as HTMLElement).style.borderColor = color + '60'
                ;(e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.05)'
              }}
              onMouseLeave={(e) => {
                ;(e.currentTarget as HTMLElement).style.borderColor =
                  'rgba(255,255,255,0.06)'
                ;(e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.03)'
              }}
            >
              <div
                style={{
                  width: 5,
                  background: color,
                  flexShrink: 0,
                  borderRadius: '16px 0 0 16px',
                }}
              />
              <div style={{ padding: '22px 20px', flex: 1 }}>
                <div style={{ fontWeight: 800, color: '#E0E0F4', fontSize: 15, marginBottom: 10 }}>
                  {loc.name.replace(' Music Lessons', '')}
                </div>
                <div
                  style={{
                    fontWeight: 900,
                    color,
                    fontSize: 38,
                    lineHeight: 1,
                    fontFamily: "'Plus Jakarta Sans', sans-serif",
                    marginBottom: 2,
                  }}
                >
                  {count !== undefined ? count.toLocaleString() : '…'}
                </div>
                <div style={{ fontSize: 11, color: '#606088', marginBottom: 10 }}>active families</div>
                {loc.city && (
                  <div style={{ fontSize: 11, color: '#8080A8' }}>
                    {loc.city}, {loc.state}
                  </div>
                )}
              </div>
            </button>
          )
        })}

        {/* All Families aggregate card */}
        {!isStudioDirector && (
          <button
            onClick={() => onSelectLocation('all')}
            style={{
              background: 'rgba(212,34,106,0.04)',
              border: '1px solid rgba(212,34,106,0.12)',
              borderRadius: 16,
              padding: 0,
              cursor: 'pointer',
              textAlign: 'left',
              display: 'flex',
              overflow: 'hidden',
              transition: 'border-color 150ms ease, background 150ms ease',
            }}
            onMouseEnter={(e) => {
              ;(e.currentTarget as HTMLElement).style.borderColor = 'rgba(212,34,106,0.3)'
              ;(e.currentTarget as HTMLElement).style.background = 'rgba(212,34,106,0.07)'
            }}
            onMouseLeave={(e) => {
              ;(e.currentTarget as HTMLElement).style.borderColor = 'rgba(212,34,106,0.12)'
              ;(e.currentTarget as HTMLElement).style.background = 'rgba(212,34,106,0.04)'
            }}
          >
            <div
              style={{
                width: 5,
                background: '#D4226A',
                flexShrink: 0,
                borderRadius: '16px 0 0 16px',
              }}
            />
            <div style={{ padding: '22px 20px', flex: 1 }}>
              <div style={{ fontWeight: 800, color: '#E0E0F4', fontSize: 15, marginBottom: 10 }}>
                All Families
              </div>
              <div
                style={{
                  fontWeight: 900,
                  color: '#D4226A',
                  fontSize: 38,
                  lineHeight: 1,
                  fontFamily: "'Plus Jakarta Sans', sans-serif",
                  marginBottom: 2,
                }}
              >
                {totalActive !== undefined ? totalActive.toLocaleString() : '…'}
              </div>
              <div style={{ fontSize: 11, color: '#606088', marginBottom: 10 }}>active families</div>
              <div style={{ fontSize: 11, color: '#8080A8' }}>Across all locations</div>
            </div>
          </button>
        )}
      </div>
    </div>
  )
}

