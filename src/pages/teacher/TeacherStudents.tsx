import { useState, useMemo } from 'react'
import { useTeacherStudents } from '../../hooks/useTeacherDashboard'
import { getLocationColor } from '../../utils/locationColor'
import { getInstrumentEmoji } from '../../utils/instrumentEmoji'
import MusicLoader from '../../components/shared/MusicLoader'
import StudentProfileCard from '../../components/teacher/StudentProfileCard'
import SessionNoteModal from '../../components/teacher/SessionNoteModal'
import { toast } from '../../components/shared/Toast'
import { Search } from 'lucide-react'

export default function TeacherStudents() {
  const { data: students, isLoading } = useTeacherStudents()
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null)
  const [selectedScheduleLabel, setSelectedScheduleLabel] = useState<string | undefined>()
  const [locationFilter, setLocationFilter] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [noteModal, setNoteModal] = useState<{ studentId: string; name: string; instrument: string | null } | null>(null)

  // Get unique locations for filter pills
  const locations = new Map<string, string>()
  for (const s of (students ?? [])) {
    if (s.location_id && !locations.has(s.location_id)) {
      locations.set(s.location_id, s.location_name)
    }
  }

  const filtered = useMemo(() => {
    let list = students ?? []
    if (locationFilter) list = list.filter(s => s.location_id === locationFilter)
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      list = list.filter(s =>
        s.first_name.toLowerCase().includes(q) ||
        (s.last_name && s.last_name.toLowerCase().includes(q))
      )
    }
    return list
  }, [students, locationFilter, search])

  const openCard = (studentId: string, scheduleLabel: string) => {
    setSelectedStudentId(studentId)
    setSelectedScheduleLabel(scheduleLabel)
  }

  return (
    <div className="page ts-page">
      <style>{styles}</style>

      <div className="ts-header">
        <h1 className="ts-title">Students on Your Schedule</h1>
        <p className="ts-count">
          {isLoading ? '...' : `${filtered.length} student${filtered.length !== 1 ? 's' : ''}`}
        </p>
      </div>

      {/* Search bar */}
      <div className="ts-search-wrap">
        <Search size={16} className="ts-search-icon" />
        <input
          type="text"
          className="ts-search"
          placeholder="Search students..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {/* Location filter pills */}
      {locations.size > 1 && (
        <div className="ts-filters">
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
        <div className="ts-empty">
          {search.trim() ? 'No students match your search.' : 'No students on your schedule.'}
        </div>
      ) : (
        <div className="ts-grid">
          {filtered.map(s => {
            const locColor = getLocationColor(s.location_id)
            const emoji = getInstrumentEmoji(s.instrument)
            const lastInitial = s.last_name ? ` ${s.last_name.charAt(0)}.` : ''
            const dayClean = s.day_label.replace(/s$/, '')
            const scheduleLabel = `${s.day_label} ${s.time_label}`

            return (
              <div
                key={s.student_id}
                className="ts-card"
                style={{ borderTopColor: `${locColor}40` }}
                onClick={() => openCard(s.student_id, scheduleLabel)}
              >
                {/* Row 1: Name + emoji */}
                <div className="ts-card-name">
                  {s.first_name}{lastInitial} <span className="ts-card-emoji">{emoji}</span>
                </div>

                {/* Row 2: Location pill + day/time */}
                <div className="ts-card-schedule">
                  <span
                    className="ts-loc-pill"
                    style={{
                      color: locColor,
                      borderColor: `${locColor}35`,
                      background: `${locColor}0A`,
                      boxShadow: `0 0 8px ${locColor}12`,
                    }}
                  >
                    {s.location_name}
                  </span>
                  <span className="ts-card-time">{dayClean} {s.time_label}</span>
                </div>

                {/* Row 3: Action buttons */}
                <div className="ts-card-actions" onClick={e => e.stopPropagation()}>
                  <button
                    className="ts-action-btn"
                    onClick={() => setNoteModal({
                      studentId: s.student_id,
                      name: s.first_name,
                      instrument: s.instrument,
                    })}
                  >
                    Add Session Note
                  </button>
                  <button
                    className="ts-action-btn"
                    onClick={() => toast('Coming soon')}
                  >
                    Upload File
                  </button>
                  <button
                    className="ts-action-btn"
                    onClick={() => {
                      openCard(s.student_id, scheduleLabel)
                    }}
                  >
                    Add Student Note
                  </button>
                </div>
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

      {/* Session Note Modal */}
      {noteModal && (
        <SessionNoteModal
          studentId={noteModal.studentId}
          studentName={noteModal.name}
          instrument={noteModal.instrument}
          onClose={() => setNoteModal(null)}
          onSaved={() => setNoteModal(null)}
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

const styles = `
.ts-page {
  max-width: 900px;
  margin: 0 auto;
}
.ts-header {
  margin-bottom: 20px;
}
.ts-title {
  font-size: 22px;
  font-weight: 800;
  color: #E0E0F4;
  margin: 0;
}
.ts-count {
  font-size: 13px;
  color: #A0A0C8;
  margin-top: 4px;
}

/* Search */
.ts-search-wrap {
  position: relative;
  margin-bottom: 16px;
}
.ts-search-icon {
  position: absolute;
  left: 14px;
  top: 50%;
  transform: translateY(-50%);
  color: #6868A0;
  pointer-events: none;
}
.ts-search {
  width: 100%;
  padding: 12px 14px 12px 40px;
  border-radius: 12px;
  border: 1px solid rgba(255,255,255,0.08);
  background: rgba(255,255,255,0.03);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  color: #E0E0F4;
  font-family: 'Plus Jakarta Sans', system-ui, sans-serif;
  font-size: 14px;
  font-weight: 500;
  outline: none;
  transition: border-color 150ms ease, box-shadow 150ms ease;
  box-sizing: border-box;
}
.ts-search::placeholder {
  color: #6868A0;
}
.ts-search:focus {
  border-color: rgba(212,34,106,0.3);
  box-shadow: 0 0 16px rgba(212,34,106,0.1);
}

/* Filters */
.ts-filters {
  display: flex;
  gap: 6px;
  margin-bottom: 16px;
  flex-wrap: wrap;
}

/* Empty */
.ts-empty {
  padding: 40px;
  text-align: center;
  color: #606088;
  font-size: 13px;
}

/* Grid */
.ts-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
}
@media (max-width: 900px) {
  .ts-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}
@media (max-width: 560px) {
  .ts-grid {
    grid-template-columns: 1fr;
  }
}

/* Card */
.ts-card {
  min-height: 140px;
  padding: 18px;
  border-radius: 14px;
  background: rgba(255,255,255,0.025);
  border: 1px solid rgba(255,255,255,0.06);
  border-top: 2px solid rgba(255,255,255,0.06);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  box-shadow: 0 2px 16px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.04);
  cursor: pointer;
  transition: all 150ms ease;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.ts-card:hover {
  border-color: rgba(212,34,106,0.2);
  background: rgba(255,255,255,0.04);
  box-shadow: 0 4px 24px rgba(212,34,106,0.12), 0 2px 16px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.06);
}

/* Row 1: Name */
.ts-card-name {
  font-family: 'Plus Jakarta Sans', system-ui, sans-serif;
  font-size: 17px;
  font-weight: 700;
  color: #E8E8FC;
  line-height: 1.3;
}
.ts-card-emoji {
  font-size: 16px;
  margin-left: 2px;
}

/* Row 2: Schedule */
.ts-card-schedule {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.ts-loc-pill {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: 10px;
  font-size: 10px;
  font-weight: 700;
  border: 1px solid;
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
  letter-spacing: 0.01em;
  white-space: nowrap;
}
.ts-card-time {
  font-size: 12px;
  font-weight: 600;
  color: #8080A8;
  white-space: nowrap;
}

/* Row 3: Actions */
.ts-card-actions {
  display: flex;
  gap: 6px;
  margin-top: auto;
  flex-wrap: wrap;
}
.ts-action-btn {
  padding: 5px 10px;
  border-radius: 8px;
  border: 1px solid rgba(255,255,255,0.06);
  background: rgba(255,255,255,0.03);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
  color: #A0A0C8;
  font-family: 'Plus Jakarta Sans', system-ui, sans-serif;
  font-size: 10px;
  font-weight: 700;
  cursor: pointer;
  transition: all 120ms ease;
  white-space: nowrap;
}
.ts-action-btn:hover {
  border-color: rgba(212,34,106,0.25);
  color: #D4226A;
  background: rgba(212,34,106,0.06);
}
`
