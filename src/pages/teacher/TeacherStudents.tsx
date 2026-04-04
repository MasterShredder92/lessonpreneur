import { useState } from 'react'
import { useTeacherStudents } from '../../hooks/useTeacherDashboard'
import { getLocationColor } from '../../utils/locationColor'
import MusicLoader from '../../components/shared/MusicLoader'
import StudentProfileCard from '../../components/teacher/StudentProfileCard'
import { MessageSquare } from 'lucide-react'

export default function TeacherStudents() {
  const { data: students, isLoading } = useTeacherStudents()
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null)
  const [selectedScheduleLabel, setSelectedScheduleLabel] = useState<string | undefined>()
  const [locationFilter, setLocationFilter] = useState<string | null>(null)

  // Get unique locations for filter pills
  const locations = new Map<string, string>()
  for (const s of (students ?? [])) {
    if (s.location_id && !locations.has(s.location_id)) {
      locations.set(s.location_id, s.location_name)
    }
  }

  const filtered = locationFilter
    ? (students ?? []).filter(s => s.location_id === locationFilter)
    : (students ?? [])

  const openCard = (studentId: string, scheduleLabel: string) => {
    setSelectedStudentId(studentId)
    setSelectedScheduleLabel(scheduleLabel)
  }

  return (
    <div className="page" style={{ maxWidth: 720, margin: '0 auto' }}>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: '#E0E0F4', margin: 0 }}>Students on Your Schedule</h1>
        <p style={{ fontSize: 13, color: '#A0A0C8', marginTop: 4 }}>
          {isLoading ? '...' : `${filtered.length} student${filtered.length !== 1 ? 's' : ''}`}
        </p>
      </div>

      {/* Location filter pills */}
      {locations.size > 1 && (
        <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
          <FilterPill label="All" active={locationFilter === null} onClick={() => setLocationFilter(null)} />
          {Array.from(locations.entries()).map(([id, name]) => (
            <FilterPill
              key={id}
              label={name}
              active={locationFilter === id}
              color={getLocationColor(id)}
              onClick={() => setLocationFilter(locationFilter === id ? null : id)}
            />
          ))}
        </div>
      )}

      {isLoading ? (
        <div style={{ padding: 60, textAlign: 'center' }}><MusicLoader /></div>
      ) : filtered.length === 0 ? (
        <div style={{ padding: 40, textAlign: 'center', color: '#606088', fontSize: 13 }}>
          No students on your schedule.
        </div>
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
          gap: 10,
        }}>
          {filtered.map(s => {
            const locColor = getLocationColor(s.location_id)
            return (
              <div
                key={s.student_id}
                onClick={() => openCard(s.student_id, `${s.day_label} ${s.time_label}`)}
                style={{
                  padding: '16px', borderRadius: 12,
                  background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)',
                  boxShadow: '0 2px 12px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.04)',
                  cursor: 'pointer', transition: 'all 150ms ease',
                  position: 'relative',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = 'rgba(212,34,106,0.2)'
                  e.currentTarget.style.background = 'rgba(255,255,255,0.04)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)'
                  e.currentTarget.style.background = 'rgba(255,255,255,0.03)'
                }}
              >
                {/* Notes indicator */}
                {s.has_notes && (
                  <div style={{ position: 'absolute', top: 12, right: 12 }} title="Has session notes">
                    <MessageSquare size={12} style={{ color: '#D4226A', opacity: 0.6 }} />
                  </div>
                )}

                <div style={{ fontSize: 15, fontWeight: 700, color: '#E0E0F4', marginBottom: 6 }}>
                  {s.first_name}
                </div>

                {s.instrument && (
                  <span style={{
                    display: 'inline-block', padding: '2px 8px', borderRadius: 10,
                    fontSize: 10, fontWeight: 600, marginBottom: 6,
                    color: '#D4226A', background: 'rgba(212,34,106,0.08)',
                  }}>
                    {s.instrument.charAt(0).toUpperCase() + s.instrument.slice(1)}
                  </span>
                )}

                <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4 }}>
                  <span style={{
                    padding: '2px 6px', borderRadius: 8, fontSize: 9, fontWeight: 700,
                    color: locColor, background: `${locColor}15`,
                  }}>
                    {s.location_name}
                  </span>
                </div>

                <div style={{ fontSize: 11, color: '#8080A8', marginBottom: 2 }}>
                  {s.day_label} {s.time_label}
                </div>

                {s.experience && (
                  <span style={{
                    display: 'inline-block', marginTop: 4, padding: '2px 6px', borderRadius: 4,
                    fontSize: 9, fontWeight: 600,
                    color: '#A0A0C8', background: 'rgba(255,255,255,0.04)',
                  }}>
                    {s.experience}
                  </span>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Student Profile Card Modal */}
      {selectedStudentId && (
        <StudentProfileCard
          studentId={selectedStudentId}
          scheduleLabel={selectedScheduleLabel}
          onClose={() => setSelectedStudentId(null)}
        />
      )}
    </div>
  )
}

function FilterPill({ label, active, color, onClick }: {
  label: string; active: boolean; color?: string; onClick: () => void
}) {
  const c = color ?? '#D4226A'
  return (
    <button onClick={onClick} style={{
      padding: '5px 12px', borderRadius: 20, fontSize: 11, fontWeight: 700,
      background: active ? `${c}18` : 'rgba(255,255,255,0.03)',
      color: active ? c : '#8080A8',
      border: `1px solid ${active ? `${c}30` : 'rgba(255,255,255,0.06)'}`,
      cursor: 'pointer', transition: 'all 100ms ease',
    }}>
      {label}
    </button>
  )
}
