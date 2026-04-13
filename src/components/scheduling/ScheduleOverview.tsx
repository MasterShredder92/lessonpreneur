import { useScheduleOverview, type LocationOverview } from '../../hooks/useScheduleOverview'
import { Users, Music, Calendar, DollarSign, AlertTriangle, RefreshCw } from 'lucide-react'
import MusicLoader from '../shared/MusicLoader'

interface Props {
  onSelectLocation: (locationId: string) => void
}

function StatCard({ label, value, sub, color, icon }: { label: string; value: string | number; sub?: string; color: string; icon: React.ReactNode }) {
  return (
    <div style={{
      flex: '1 1 160px',
      padding: '20px 18px',
      borderRadius: 16,
      background: 'rgba(255,255,255,0.02)',
      border: `1px solid ${color}20`,
      display: 'flex',
      flexDirection: 'column',
      gap: 6,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ width: 32, height: 32, borderRadius: 10, background: `${color}15`, display: 'flex', alignItems: 'center', justifyContent: 'center', color, flexShrink: 0 }}>
          {icon}
        </div>
        <span style={{ fontSize: 11, fontWeight: 700, color: '#8080A8', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</span>
      </div>
      <div style={{ fontSize: 28, fontWeight: 900, color: '#E0E0F4', letterSpacing: '-0.03em', lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: '#606088', fontWeight: 500 }}>{sub}</div>}
    </div>
  )
}

function LocationCard({ loc, onClick }: { loc: LocationOverview; onClick: () => void }) {
  const utilizationColor = loc.utilizationPercent >= 80 ? '#22C55E' : loc.utilizationPercent >= 50 ? '#FFB800' : '#EF4444'

  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 14,
        padding: '22px 20px',
        borderRadius: 16,
        background: 'rgba(255,255,255,0.02)',
        border: `1px solid ${loc.color}25`,
        cursor: 'pointer',
        textAlign: 'left',
        transition: 'all 180ms ease',
        position: 'relative',
        overflow: 'hidden',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = `${loc.color}10`
        e.currentTarget.style.borderColor = `${loc.color}50`
        e.currentTarget.style.transform = 'translateY(-2px)'
        e.currentTarget.style.boxShadow = `0 8px 32px ${loc.color}15`
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'rgba(255,255,255,0.02)'
        e.currentTarget.style.borderColor = `${loc.color}25`
        e.currentTarget.style.transform = 'translateY(0)'
        e.currentTarget.style.boxShadow = 'none'
      }}
    >
      {/* Location accent bar */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: loc.color, opacity: 0.6 }} />

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 12, height: 12, borderRadius: 4, background: loc.color, boxShadow: `0 0 10px ${loc.color}50` }} />
          <span style={{ fontSize: 16, fontWeight: 800, color: '#E0E0F4', letterSpacing: '-0.02em' }}>{loc.locationName}</span>
        </div>
        <span style={{ fontSize: 12, fontWeight: 700, color: loc.color, padding: '4px 10px', borderRadius: 8, background: `${loc.color}12` }}>
          Open Schedule &rarr;
        </span>
      </div>

      {/* Utilization bar */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
          <span style={{ fontSize: 11, color: '#8080A8', fontWeight: 600 }}>Today's Capacity</span>
          <span style={{ fontSize: 12, fontWeight: 800, color: utilizationColor, fontFamily: 'monospace' }}>{loc.utilizationPercent}%</span>
        </div>
        <div style={{ height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
          <div style={{
            height: '100%',
            width: `${Math.min(loc.utilizationPercent, 100)}%`,
            borderRadius: 3,
            background: utilizationColor,
            transition: 'width 600ms ease',
          }} />
        </div>
      </div>

      {/* Stats grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 800, color: '#E0E0F4', letterSpacing: '-0.02em' }}>{loc.totalSessions}</div>
          <div style={{ fontSize: 10, color: '#8080A8', fontWeight: 600 }}>Sessions</div>
        </div>
        <div>
          <div style={{ fontSize: 20, fontWeight: 800, color: '#22C55E', letterSpacing: '-0.02em' }}>{loc.openSpots}</div>
          <div style={{ fontSize: 10, color: '#8080A8', fontWeight: 600 }}>Open Spots</div>
        </div>
        <div>
          <div style={{ fontSize: 20, fontWeight: 800, color: loc.cancellations > 0 ? '#EF4444' : '#606088', letterSpacing: '-0.02em' }}>{loc.cancellations}</div>
          <div style={{ fontSize: 10, color: '#8080A8', fontWeight: 600 }}>Call Outs</div>
        </div>
      </div>

      {/* Teachers */}
      {loc.teacherNames.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <Users size={12} style={{ color: '#606088', flexShrink: 0 }} />
          <span style={{ fontSize: 11, color: '#8080A8', fontWeight: 500 }}>
            {loc.teacherNames.length <= 4
              ? loc.teacherNames.map(n => n.split(' ')[0]).join(', ')
              : `${loc.teacherNames.slice(0, 3).map(n => n.split(' ')[0]).join(', ')} +${loc.teacherNames.length - 3} more`}
          </span>
        </div>
      )}

      {/* Revenue opportunity */}
      {loc.missedMonthlyRevenue > 0 && (
        <div style={{ fontSize: 11, color: '#D4226A', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', borderRadius: 8, background: 'rgba(212,34,106,0.06)', border: '1px solid rgba(212,34,106,0.1)' }}>
          <DollarSign size={12} />
          <span>${loc.missedMonthlyRevenue.toLocaleString()}/mo missed from {loc.openSpots} unfilled spots</span>
        </div>
      )}
    </button>
  )
}

export default function ScheduleOverview({ onSelectLocation }: Props) {
  const { data, isLoading } = useScheduleOverview()

  if (isLoading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 300 }}>
        <MusicLoader />
      </div>
    )
  }

  if (!data) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: '#8080A8' }}>
        Unable to load schedule overview.
      </div>
    )
  }

  const today = new Date()
  const dayLabel = today.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
          <Calendar size={20} style={{ color: '#D4226A' }} />
          <h1 style={{ fontSize: 22, fontWeight: 900, color: '#E0E0F4', letterSpacing: '-0.03em', margin: 0 }}>Schedule</h1>
        </div>
        <p style={{ fontSize: 13, color: '#8080A8', fontWeight: 500, margin: 0 }}>{dayLabel} &mdash; Select a location to view the full teaching grid</p>
      </div>

      {/* Top-level stats */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 28, flexWrap: 'wrap' }}>
        <StatCard
          label="Teachers Today"
          value={data.totalTeachersToday}
          sub={`across ${data.locations.filter(l => l.teachersToday > 0).length} locations`}
          color="#A855F7"
          icon={<Users size={16} />}
        />
        <StatCard
          label="Sessions Booked"
          value={data.totalSessions}
          sub="student lessons today"
          color="#FFB800"
          icon={<Music size={16} />}
        />
        <StatCard
          label="Open Spots"
          value={data.totalOpenSpots}
          sub="available for booking"
          color="#22C55E"
          icon={<Calendar size={16} />}
        />
        {data.totalCancellations > 0 && (
          <StatCard
            label="Call Outs"
            value={data.totalCancellations}
            sub="today"
            color="#EF4444"
            icon={<AlertTriangle size={16} />}
          />
        )}
        {data.totalMissedRevenue > 0 && (
          <StatCard
            label="Missed Revenue"
            value={`$${data.totalMissedRevenue.toLocaleString()}`}
            sub="per month from unfilled spots"
            color="#D4226A"
            icon={<DollarSign size={16} />}
          />
        )}
      </div>

      {/* Location cards */}
      <div style={{ marginBottom: 12 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: '#606088', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Locations</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
        {data.locations.map(loc => (
          <LocationCard
            key={loc.locationId}
            loc={loc}
            onClick={() => onSelectLocation(loc.locationId)}
          />
        ))}
      </div>

      {/* Empty state */}
      {data.locations.length === 0 && (
        <div style={{ padding: 48, textAlign: 'center' }}>
          <Calendar size={32} style={{ color: '#606088', marginBottom: 10 }} />
          <p style={{ fontSize: 14, color: '#8080A8', fontWeight: 600 }}>No locations configured</p>
          <p style={{ fontSize: 12, color: '#606088', marginTop: 4 }}>Add locations in Settings to see the schedule.</p>
        </div>
      )}
    </div>
  )
}
