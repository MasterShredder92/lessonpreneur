import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useNavigate, useSearchParams } from 'react-router-dom'
import StudentDetail from './StudentDetail'
import MusicLoader from '../../components/shared/MusicLoader'
import { useAuthContext } from '../../app/AuthContext'
import { usePermissions } from '../../hooks/usePermissions'
import {
  useStudents,
  useStudentsRosterInfinite,
  useStudentInstrumentOptions,
  useCreateStudent,
  useUpdateStudent,
  useFamilies,
  useStudentTabCounts,
  useStudentCountsByLocation,
  type StudentRow,
} from '../../hooks/useStudents'
import { useLeads } from '../../hooks/useLeads'
import { useZiroShell } from '../../contexts/ZiroContext'
import { useLocations } from '../../hooks/useLocations'
import { useTeachers } from '../../hooks/useTeachers'
import { Check, XCircle, X } from 'lucide-react'
import { toast } from '../../components/shared/Toast'
import RetentionCaptureModal from '../../components/students/RetentionCaptureModal'
import CsvImportFlow from '../../components/shared/CsvImportFlow'
import { useImportStudents, STUDENT_TEMPLATE } from '../../hooks/useImport'
import { DEFAULT_RATE_PER_SESSION } from '../../lib/constants'
import { useStudentInstruments, useSaveStudentInstruments } from '../../hooks/useStudentInstruments'
import { getInstrumentEmoji, instrumentWithEmojiTitle } from '../../utils/instrumentEmoji'
import AddStudentModal from '../../components/students/AddStudentModal'
import DataGrid from '../../components/shared/DataGrid'
import { useChurnRiskScores, RISK_TIERS, type ChurnRiskScore } from '../../hooks/useChurnRisk'
import { useScrollRestore } from '../../hooks/useScrollRestore'
import { IssueContextProvider } from '../../contexts/IssueContext'
import ReportIssueButton from '../../components/shared/ReportIssueButton'
import StudentsPageGuide from '../../components/admin/StudentsPageGuide'

const INSTRUMENTS = ['piano','guitar','vocals','drums','banjo','bass','brass','cello','clarinet','flute','mandolin','oboe','percussion','saxophone','strings','trombone','trumpet','ukulele','viola','violin','voice','woodwinds']
const EXIT_REASONS = ['Schedule Conflict', 'Moving Away', 'Financial', 'Lost Interest', 'Switching Schools', 'Taking a Break', 'Other']

// Location brand colors — keyed by Supabase UUID (CLAUDE.md authoritative source)
const LOCATION_COLORS: Record<string, string> = {
  'f7b52dd5-12ee-437f-9c60-f8adf454ac31': '#A333FF', // Bellevue
  'cebd97d4-c241-4de2-8ade-49e5cc0070d5': '#00A5E8', // Elkhorn
  '40c67ffc-91b5-46a9-94bd-6ddffdfb7638': '#00A651', // Gretna
  'd48229c1-b70a-4d29-893e-5079887dab76': '#D41113', // Omaha
}

type SortOption = 'az_first' | 'za_first' | 'az_last' | 'za_last' | 'newest' | 'oldest'

// ---- Student Roster Row (full page roster, unchanged) ----
function StudentRosterRow({
  s,
  locations,
  riskMap,
  canViewBilling,
  onNavigate,
  guideId,
}: {
  s: StudentRow
  locations: { id: string; name?: string; color?: string }[] | undefined
  riskMap: Map<string, ChurnRiskScore>
  canViewBilling: boolean
  onNavigate: () => void
  guideId?: string
}) {
  const isFormer = s.status === 'former' || s.status === 'inactive'
  const loc = locations?.find((l: any) => l.id === s.location_id)
  const locColor = LOCATION_COLORS[s.location_id] ?? (loc as any)?.color ?? '#D4226A'
  const risk = riskMap.get(s.id)
  const nextTime = s.next_lesson_time
    ? (() => {
      const [h, m] = s.next_lesson_time!.split(':')
      const hr = parseInt(h, 10)
      return `${hr > 12 ? hr - 12 : hr}:${m}${hr >= 12 ? 'pm' : 'am'}`
    })()
    : ''

  const gridCols = canViewBilling
    ? 'minmax(140px,1.4fr) minmax(170px,1.15fr) minmax(100px,0.75fr) minmax(120px,0.9fr) minmax(72px,0.55fr) minmax(140px,1fr) minmax(72px,0.55fr)'
    : 'minmax(140px,1.4fr) minmax(170px,1.15fr) minmax(100px,0.75fr) minmax(120px,0.9fr) minmax(140px,1fr) minmax(72px,0.55fr)'

  return (
    <div
      className={`roster-row roster-row-student${isFormer ? ' roster-row-former' : ''}`}
      onClick={onNavigate}
      data-tour-id={guideId}
      style={{
        display: 'grid',
        gridTemplateColumns: gridCols,
        gap: '0 12px',
        alignItems: 'center',
        padding: '10px 14px',
        borderBottom: '1px solid rgba(255,255,255,0.04)',
        cursor: 'pointer',
        fontSize: 12,
        opacity: isFormer ? 0.75 : 1,
      }}
    >
      <div style={{ borderLeft: `3px solid ${isFormer ? '#606088' : locColor}`, paddingLeft: 10, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <span style={{ fontWeight: 700, color: '#E0E0F4' }}>{s.first_name} {s.last_name}</span>
          {risk && risk.tier !== 'low' && (() => {
            const t = RISK_TIERS[risk.tier]
            return <span style={{ fontSize: 8, fontWeight: 700, padding: '1px 6px', borderRadius: 4, background: t.bg, color: t.color }}>{t.label}</span>
          })()}
        </div>
        <div style={{ fontSize: 10, color: '#606088', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.family_name ?? '—'}</div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
        <span
          style={{ fontSize: 11, color: '#C0C0E0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', cursor: s.family_email ? 'pointer' : 'default' }}
          onClick={(e) => { e.stopPropagation(); if (s.family_email) { navigator.clipboard.writeText(s.family_email); toast('Copied email', 'success') } }}
        >{s.family_email ?? '—'}</span>
        <span
          style={{ fontSize: 10, color: '#8080A8', cursor: s.family_phone ? 'pointer' : 'default' }}
          onClick={(e) => { e.stopPropagation(); if (s.family_phone) { navigator.clipboard.writeText(s.family_phone); toast('Copied phone', 'success') } }}
        >{s.family_phone ?? '—'}</span>
      </div>
      <div style={{ fontWeight: 600, color: '#E0E0F4', fontSize: 12 }}>{instrumentWithEmojiTitle(s.instrument ?? '')}</div>
      <div style={{ color: '#E0E0F4', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.teacher_name !== '—' ? s.teacher_name : '—'}</div>
      {canViewBilling && (
        <div>
          <div style={{ fontWeight: 700, color: '#E0E0F4' }}>${((s.rate_per_session === 0 ? 0 : (s.family_rate_tier ? s.family_rate_tier / 100 : s.rate_per_session)) * (s.sessions_per_month ?? s.blocks_per_week * 4)).toFixed(0)}</div>
          {Number((s as any).overdue_amount ?? 0) > 0 && (
            <div style={{ fontSize: 10, color: '#F87171' }}>${Number((s as any).overdue_amount).toFixed(0)} due</div>
          )}
        </div>
      )}
      <div style={{ lineHeight: 1.3, minWidth: 0 }}>
        <div style={{ fontWeight: 600, color: s.next_lesson_date ? '#E0E0F4' : '#606088' }}>
          {s.next_lesson_date
            ? new Date(s.next_lesson_date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
            : '—'}
        </div>
        <div style={{ fontSize: 10, color: '#8080A8' }}>
          {nextTime ? `${nextTime} · ` : ''}{s.location_name ?? ''}
        </div>
      </div>
      <div>
        {s.has_enrollment_agreement ? (
          <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 100, background: 'rgba(34,197,94,0.12)', color: '#22C55E', border: '1px solid rgba(34,197,94,0.25)', display: 'inline-flex', alignItems: 'center', gap: 3 }}>
            <Check size={8} /> Yes
          </span>
        ) : (
          <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 100, background: 'rgba(239,68,68,0.12)', color: '#F87171', border: '1px solid rgba(239,68,68,0.3)', display: 'inline-flex', alignItems: 'center', gap: 3 }}>
            <XCircle size={8} /> No
          </span>
        )}
      </div>
    </div>
  )
}

// ---- Tier 1: Location Overview Grid ----
function LocationOverviewGrid({
  locations,
  locationCounts,
  totalActive,
  onSelectLocation,
  isStudioDirector,
  lockedLocationId,
}: {
  locations: any[] | undefined
  locationCounts: Record<string, number> | undefined
  totalActive: number | undefined
  onSelectLocation: (id: string) => void
  isStudioDirector: boolean
  lockedLocationId: string | null
}) {
  const visible = useMemo(() => {
    if (!locations) return []
    if (isStudioDirector && lockedLocationId) return locations.filter((l) => l.id === lockedLocationId)
    return locations.filter((l) => l.is_active)
  }, [locations, isStudioDirector, lockedLocationId])

  return (
    <div>
      <p style={{ fontSize: 13, color: '#8080A8', marginBottom: 20, marginTop: 4 }}>
        Click a location to view its student roster. Data loads on demand — no delay.
      </p>
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))',
        gap: 14,
      }}>
        {visible.map((loc) => {
          const color = LOCATION_COLORS[loc.id] ?? '#D4226A'
          const count = locationCounts?.[loc.id]
          return (
            <button
              key={loc.id}
              onClick={() => onSelectLocation(loc.id)}
              style={{
                background: 'rgba(255,255,255,0.03)',
                border: `1px solid rgba(255,255,255,0.06)`,
                borderRadius: 16,
                padding: 0,
                cursor: 'pointer',
                textAlign: 'left',
                display: 'flex',
                overflow: 'hidden',
                transition: 'border-color 150ms ease, background 150ms ease, transform 150ms ease',
              }}
              onMouseEnter={(e) => {
                ;(e.currentTarget as HTMLElement).style.borderColor = color + '60'
                ;(e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.05)'
              }}
              onMouseLeave={(e) => {
                ;(e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.06)'
                ;(e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.03)'
              }}
            >
              <div style={{ width: 5, background: color, flexShrink: 0, borderRadius: '16px 0 0 16px' }} />
              <div style={{ padding: '22px 20px', flex: 1 }}>
                <div style={{ fontWeight: 800, color: '#E0E0F4', fontSize: 15, marginBottom: 10 }}>
                  {loc.name.replace(' Music Lessons', '')}
                </div>
                <div style={{
                  fontWeight: 900,
                  color,
                  fontSize: 38,
                  lineHeight: 1,
                  fontFamily: "'Plus Jakarta Sans', sans-serif",
                  marginBottom: 2,
                }}>
                  {count !== undefined ? count.toLocaleString() : '…'}
                </div>
                <div style={{ fontSize: 11, color: '#606088', marginBottom: 10 }}>active students</div>
                {loc.city && (
                  <div style={{ fontSize: 11, color: '#8080A8' }}>
                    {loc.city}, {loc.state}
                  </div>
                )}
              </div>
            </button>
          )
        })}

        {/* All Students aggregate card */}
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
            <div style={{ width: 5, background: '#D4226A', flexShrink: 0, borderRadius: '16px 0 0 16px' }} />
            <div style={{ padding: '22px 20px', flex: 1 }}>
              <div style={{ fontWeight: 800, color: '#E0E0F4', fontSize: 15, marginBottom: 10 }}>All Students</div>
              <div style={{
                fontWeight: 900,
                color: '#D4226A',
                fontSize: 38,
                lineHeight: 1,
                fontFamily: "'Plus Jakarta Sans', sans-serif",
                marginBottom: 2,
              }}>
                {totalActive !== undefined ? totalActive.toLocaleString() : '…'}
              </div>
              <div style={{ fontSize: 11, color: '#606088', marginBottom: 10 }}>active students</div>
              <div style={{ fontSize: 11, color: '#8080A8' }}>Across all locations</div>
            </div>
          </button>
        )}
      </div>
    </div>
  )
}

// ---- Tier 2: Location Student Panel (lazy-loaded slide panel) ----
function LocationStudentPanel({
  locationId,
  locations,
  teachers,
  riskMap,
  canViewBilling,
  onClose,
  onNavigate,
  onAddStudent,
}: {
  locationId: string // 'all' or a location UUID
  locations: any[] | undefined
  teachers: any[] | undefined
  riskMap: Map<string, ChurnRiskScore>
  canViewBilling: boolean
  onClose: () => void
  onNavigate: (studentId: string) => void
  onAddStudent: () => void
}) {
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState<SortOption>('az_last')
  const [instrumentFilter, setInstrumentFilter] = useState('')
  const [teacherFilter, setTeacherFilter] = useState('')
  const [activeTab, setActiveTab] = useState<'active' | 'former'>('active')

  const effectiveLocationId = locationId === 'all' ? undefined : locationId
  const loc = locationId === 'all' ? null : locations?.find((l) => l.id === locationId)
  const locColor = locationId === 'all' ? '#D4226A' : (LOCATION_COLORS[locationId] ?? '#D4226A')

  const statusFilter = activeTab === 'former' ? 'former' : 'active'

  const rosterInfinite = useStudentsRosterInfinite({
    status: statusFilter,
    locationId: effectiveLocationId,
    teacherId: teacherFilter || undefined,
    instrumentFilter,
    search,
    sortBy,
    enabled: true,
  })

  const { data: instrumentOptions } = useStudentInstrumentOptions({ locationId: effectiveLocationId })

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
        if (entries[0]?.isIntersecting && rosterInfinite.hasNextPage && !rosterInfinite.isFetchingNextPage) {
          rosterInfinite.fetchNextPage()
        }
      },
      { rootMargin: '200px' },
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [rosterInfinite.hasNextPage, rosterInfinite.isFetchingNextPage, rosterInfinite.fetchNextPage])

  // Close on Escape key
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  const gridCols = canViewBilling
    ? 'minmax(140px,1.5fr) minmax(90px,0.7fr) minmax(110px,0.85fr) minmax(65px,0.5fr) minmax(130px,1fr) minmax(62px,0.5fr)'
    : 'minmax(140px,1.5fr) minmax(90px,0.7fr) minmax(110px,0.85fr) minmax(130px,1fr) minmax(62px,0.5fr)'

  return (
    <>
      {/* Backdrop */}
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

      {/* Slide panel */}
      <div
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          width: 'min(740px, 100vw)',
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
        {/* Panel header */}
        <div style={{
          padding: '18px 24px',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          display: 'flex',
          alignItems: 'center',
          gap: 14,
          flexShrink: 0,
          background: 'rgba(0,0,0,0.2)',
        }}>
          <div style={{ width: 4, height: 46, borderRadius: 2, background: locColor, flexShrink: 0 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2 style={{ margin: 0, fontWeight: 800, fontSize: 17, color: '#E0E0F4', letterSpacing: '-0.01em' }}>
              {locationId === 'all' ? 'All Students' : (loc?.name ?? 'Students')}
            </h2>
            <p style={{ margin: '3px 0 0', fontSize: 11, color: '#8080A8' }}>
              {locationId === 'all'
                ? 'Across all locations'
                : (loc?.city ? `${loc.city}, ${loc.state}` : '')}
            </p>
          </div>
          <button
            onClick={onAddStudent}
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
            + Add Student
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

        {/* Status tabs */}
        <div style={{
          padding: '0 24px',
          borderBottom: '1px solid rgba(255,255,255,0.04)',
          flexShrink: 0,
          display: 'flex',
          gap: 0,
        }}>
          {(['active', 'former'] as const).map((tab) => (
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

        {/* Filters */}
        <div style={{
          padding: '10px 24px',
          borderBottom: '1px solid rgba(255,255,255,0.04)',
          display: 'flex',
          gap: 8,
          flexShrink: 0,
          flexWrap: 'wrap',
          background: 'rgba(0,0,0,0.1)',
        }}>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or family..."
            className="filter-select"
            style={{ flex: '1 1 160px', minWidth: 0 }}
          />
          <select
            value={instrumentFilter}
            onChange={(e) => setInstrumentFilter(e.target.value)}
            className="filter-select"
            style={{ flex: '0 0 auto', minWidth: 120 }}
          >
            <option value="">All Instruments</option>
            {(instrumentOptions ?? []).map((i) => (
              <option key={i} value={i}>{i.charAt(0).toUpperCase() + i.slice(1)}</option>
            ))}
          </select>
          <select
            value={teacherFilter}
            onChange={(e) => setTeacherFilter(e.target.value)}
            className="filter-select"
            style={{ flex: '0 0 auto', minWidth: 130 }}
          >
            <option value="">All Teachers</option>
            {(teachers ?? [])
              .filter((t: any) => {
                const s = t.status ?? (t.is_active ? 'active' : 'inactive')
                return s !== 'inactive'
              })
              .map((t: any) => (
                <option key={t.id} value={t.id}>
                  {t.first_name ?? t.profile?.first_name} {t.last_name ?? t.profile?.last_name}
                </option>
              ))}
          </select>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortOption)}
            className="filter-select"
            style={{ flex: '0 0 auto', minWidth: 130 }}
          >
            <option value="az_first">A→Z First Name</option>
            <option value="za_first">Z→A First Name</option>
            <option value="az_last">A→Z Last Name</option>
            <option value="za_last">Z→A Last Name</option>
            <option value="newest">Newest Enrolled</option>
            <option value="oldest">Oldest Enrolled</option>
          </select>
        </div>

        {/* Row count */}
        <div style={{ padding: '6px 24px 4px', fontSize: 11, color: '#606088', flexShrink: 0 }}>
          {rosterInfinite.isLoading
            ? 'Loading...'
            : `${rosterRows.length}${rosterInfinite.hasNextPage ? '+' : ''} student${rosterRows.length !== 1 ? 's' : ''}`}
        </div>

        {/* Column headers */}
        {!rosterInfinite.isLoading && (
          <div style={{
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
          }}>
            <span>Student</span>
            <span>Instrument</span>
            <span>Teacher</span>
            {canViewBilling && <span>Monthly</span>}
            <span>Next Lesson</span>
            <span>Agreement</span>
          </div>
        )}

        {/* Roster rows */}
        <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden' }}>
          {rosterInfinite.isLoading ? (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 200 }}>
              <MusicLoader />
            </div>
          ) : (
            <>
              {rosterRows.map((s) => {
                const rowLocColor = locationId === 'all'
                  ? (LOCATION_COLORS[s.location_id] ?? '#D4226A')
                  : locColor
                const isFormer = s.status === 'former' || s.status === 'inactive'
                const risk = riskMap.get(s.id)
                const nextTime = s.next_lesson_time
                  ? (() => {
                    const [h, m] = s.next_lesson_time!.split(':')
                    const hr = parseInt(h, 10)
                    return `${hr > 12 ? hr - 12 : hr}:${m}${hr >= 12 ? 'pm' : 'am'}`
                  })()
                  : ''

                return (
                  <div
                    key={s.id}
                    onClick={() => onNavigate(s.id)}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: gridCols,
                      gap: '0 12px',
                      alignItems: 'center',
                      padding: '10px 24px',
                      borderBottom: '1px solid rgba(255,255,255,0.04)',
                      cursor: 'pointer',
                      fontSize: 12,
                      opacity: isFormer ? 0.75 : 1,
                      transition: 'background 120ms ease',
                    }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.025)' }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent' }}
                  >
                    {/* Student name + family */}
                    <div style={{ borderLeft: `3px solid ${isFormer ? '#606088' : rowLocColor}`, paddingLeft: 10, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        <span style={{ fontWeight: 700, color: '#E0E0F4' }}>{s.first_name} {s.last_name}</span>
                        {risk && risk.tier !== 'low' && (() => {
                          const t = RISK_TIERS[risk.tier]
                          return <span style={{ fontSize: 8, fontWeight: 700, padding: '1px 5px', borderRadius: 4, background: t.bg, color: t.color }}>{t.label}</span>
                        })()}
                      </div>
                      <div style={{ fontSize: 10, color: '#606088', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.family_name ?? '—'}</div>
                    </div>
                    {/* Instrument */}
                    <div style={{ fontWeight: 600, color: '#E0E0F4', fontSize: 12 }}>
                      {instrumentWithEmojiTitle(s.instrument ?? '')}
                    </div>
                    {/* Teacher */}
                    <div style={{ color: '#C0C0E0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 11 }}>
                      {s.teacher_name !== '—' ? s.teacher_name : '—'}
                    </div>
                    {/* Monthly billing */}
                    {canViewBilling && (
                      <div>
                        <div style={{ fontWeight: 700, color: '#E0E0F4' }}>
                          ${((s.rate_per_session === 0 ? 0 : (s.family_rate_tier ? s.family_rate_tier / 100 : s.rate_per_session)) * (s.sessions_per_month ?? s.blocks_per_week * 4)).toFixed(0)}
                        </div>
                        {Number((s as any).overdue_amount ?? 0) > 0 && (
                          <div style={{ fontSize: 9, color: '#F87171' }}>${Number((s as any).overdue_amount).toFixed(0)} due</div>
                        )}
                      </div>
                    )}
                    {/* Next lesson */}
                    <div style={{ lineHeight: 1.3, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, color: s.next_lesson_date ? '#E0E0F4' : '#606088', fontSize: 11 }}>
                        {s.next_lesson_date
                          ? new Date(s.next_lesson_date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
                          : '—'}
                      </div>
                      {nextTime && <div style={{ fontSize: 10, color: '#8080A8' }}>{nextTime}</div>}
                    </div>
                    {/* Enrollment agreement */}
                    <div>
                      {s.has_enrollment_agreement ? (
                        <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 5px', borderRadius: 100, background: 'rgba(34,197,94,0.12)', color: '#22C55E', border: '1px solid rgba(34,197,94,0.25)', display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                          <Check size={8} /> Yes
                        </span>
                      ) : (
                        <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 5px', borderRadius: 100, background: 'rgba(239,68,68,0.12)', color: '#F87171', border: '1px solid rgba(239,68,68,0.3)', display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                          <XCircle size={8} /> No
                        </span>
                      )}
                    </div>
                  </div>
                )
              })}

              {/* Infinite scroll sentinel */}
              <div ref={loadMoreRef} style={{ height: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 12 }}>
                {rosterInfinite.isFetchingNextPage && (
                  <span style={{ fontSize: 11, color: '#8080A8' }}>Loading more…</span>
                )}
              </div>

              {rosterRows.length === 0 && !rosterInfinite.isLoading && (
                <div style={{ padding: '40px 24px', textAlign: 'center', color: '#606088', fontSize: 13 }}>
                  No students found.
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </>
  )
}

// ---- Main Students Page ----
export default function Students() {
  const { role, tenantId } = useAuthContext()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const detailStudentId = searchParams.get('id')
  const { data: locations } = useLocations()
  const { data: teacherList } = useTeachers()
  const canEdit = role === 'owner' || role === 'admin'
  const canCreate = role === 'owner' || role === 'admin' || role === 'company_director' || role === 'studio_director'
  const canExport = role === 'owner' || role === 'admin' || role === 'company_director'
  const { canDo, isStudioDirector, locationIds: scopedLocationIds } = usePermissions()
  const lockedLocationId = isStudioDirector ? scopedLocationIds[0] ?? '' : null
  const canViewBilling = canDo('students.view_billing')
  const { saveScroll } = useScrollRestore('students')

  // ── Two-tier navigation state ──
  // null = Tier 1 (location overview), 'all' or UUID = Tier 2 (location panel)
  const [selectedLocationId, setSelectedLocationId] = useState<string | null>(null)

  // ── Modal state ──
  const [showAddStudent, setShowAddStudent] = useState(false)
  const [editStudent, setEditStudent] = useState<StudentRow | null>(null)
  const [exitStudent, setExitStudent] = useState<StudentRow | null>(null)
  const [retentionTarget, setRetentionTarget] = useState<{ student: StudentRow; newStatus: 'paused' | 'inactive'; pendingData: any } | null>(null)
  const [showExport, setShowExport] = useState(false)
  const [exportSelections, setExportSelections] = useState<Record<string, boolean>>({ active: true, former: false, leads: false })
  const [showImport, setShowImport] = useState(false)
  const [showMasterSheet, setShowMasterSheet] = useState(false)
  const [showMoreMenu, setShowMoreMenu] = useState(false)

  const studentImport = useImportStudents()
  const createStudent = useCreateStudent()
  const updateStudent = useUpdateStudent()

  // ── Tier 1: location counts (fast — just counts, no row data) ──
  const activeLocationIds = useMemo(
    () => (locations ?? []).filter((l) => l.is_active).map((l) => l.id),
    [locations],
  )
  const { data: locationCounts } = useStudentCountsByLocation(activeLocationIds)
  const { data: tabCounts } = useStudentTabCounts()
  const totalActive = tabCounts?.active

  // ── Export dependencies (only fetched when user opens export modal) ──
  const [leadsNeeded, setLeadsNeeded] = useState(false)
  const { data: allLeads } = useLeads({}, { enabled: leadsNeeded })
  const { refetch: refetchAllStudentsForExport } = useStudents(
    { status: 'all' },
    { enabled: false },
  )

  // ── Churn risk (deferred — loads after first paint) ──
  const [riskEnabled, setRiskEnabled] = useState(false)
  useEffect(() => {
    const id = requestAnimationFrame(() => setRiskEnabled(true))
    return () => cancelAnimationFrame(id)
  }, [])
  const { data: riskScores } = useChurnRiskScores({ enabled: riskEnabled })
  const riskMap = useMemo(
    () => new Map((riskScores ?? []).map((r) => [r.studentId, r])),
    [riskScores],
  )

  // ── Ziro context ──
  const { setPageContext: setZiroPageContext } = useZiroShell()
  useEffect(() => {
    setZiroPageContext({ page: 'students', locationId: selectedLocationId ?? null })
  }, [setZiroPageContext, selectedLocationId])

  const handleNavigateToStudent = useCallback((studentId: string) => {
    setSelectedLocationId(null)
    saveScroll()
    navigate(`/admin/students?id=${studentId}`)
  }, [navigate, saveScroll])

  const handleEditSave = async (data: any) => {
    if (editStudent) {
      if (data.status === 'former' && editStudent.status !== 'former') {
        setExitStudent({ ...editStudent, ...data } as any)
        setEditStudent(null)
        return
      }
      if ((data.status === 'paused' || data.status === 'inactive') && editStudent.status === 'active') {
        setRetentionTarget({ student: editStudent, newStatus: data.status, pendingData: data })
        setEditStudent(null)
        return
      }
      await updateStudent.mutateAsync({ id: editStudent.id, ...data })
    } else {
      await createStudent.mutateAsync({ ...data, tenant_id: tenantId! })
    }
    setEditStudent(null)
  }

  const handleExitSave = async (exitData: { exit_reason: string; exit_notes: string; may_return: string; reactivation_date: string }) => {
    if (!exitStudent) return
    await updateStudent.mutateAsync({
      id: exitStudent.id,
      status: 'former',
      end_date: new Date().toISOString().split('T')[0],
      exit_reason: exitData.exit_reason,
      exit_notes: exitData.exit_notes,
      may_return: exitData.may_return,
      reactivation_date: exitData.reactivation_date || null,
    })
    setExitStudent(null)
  }

  if (detailStudentId) {
    return (
      <StudentDetail
        propId={detailStudentId}
        onBack={() => navigate('/admin/students')}
      />
    )
  }

  return (
    <IssueContextProvider page="Roster — Students">
    <div className="page">
      {/* Page header */}
      <div className="page-header">
        <h1>Students</h1>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
          {role === 'owner' && (
            <button
              className="btn-ghost student-header-desktop"
              onClick={() => setShowMasterSheet(true)}
              style={{ fontSize: 11, color: '#FFB800', borderColor: 'rgba(255,184,0,0.25)' }}
            >
              Master Sheet
            </button>
          )}
          {canEdit && (
            <button className="btn-ghost student-header-desktop" onClick={() => setShowImport(true)} style={{ fontSize: 11 }}>
              Import CSV
            </button>
          )}
          {canExport && (
            <button
              className="btn-ghost student-header-desktop"
              onClick={() => { setLeadsNeeded(true); setShowExport(true) }}
              style={{ fontSize: 11 }}
            >
              Export CSV
            </button>
          )}

          {/* Mobile "More" dropdown */}
          <div className="student-more-wrap" style={{ position: 'relative' }}>
            <button className="btn-ghost student-header-more" onClick={() => setShowMoreMenu(!showMoreMenu)} style={{ fontSize: 11 }}>
              More ▾
            </button>
            {showMoreMenu && (
              <>
                <div style={{ position: 'fixed', inset: 0, zIndex: 90, cursor: 'pointer' }} onClick={() => setShowMoreMenu(false)} onTouchEnd={(e) => { e.preventDefault(); setShowMoreMenu(false) }} />
                <div className="student-more-dropdown">
                  {role === 'owner' && (
                    <button onClick={() => { setShowMasterSheet(true); setShowMoreMenu(false) }}>Master Sheet</button>
                  )}
                  {canEdit && (
                    <button onClick={() => { setShowImport(true); setShowMoreMenu(false) }}>Import CSV</button>
                  )}
                  {canExport && (
                    <button onClick={() => { setLeadsNeeded(true); setShowExport(true); setShowMoreMenu(false) }}>Export CSV</button>
                  )}
                  <button onClick={() => setShowMoreMenu(false)} style={{ color: '#8080A8', borderTop: '1px solid rgba(255,255,255,0.06)', marginTop: 2 }}>Close</button>
                </div>
              </>
            )}
          </div>

          {canCreate && (
            <button className="btn-primary" onClick={() => setShowAddStudent(true)}>
              + Add Student
            </button>
          )}
        </div>
        <ReportIssueButton />
        <StudentsPageGuide mode="list" />
      </div>

      {/* Tier 1 — Location overview grid */}
      <LocationOverviewGrid
        locations={locations}
        locationCounts={locationCounts}
        totalActive={totalActive}
        onSelectLocation={setSelectedLocationId}
        isStudioDirector={isStudioDirector}
        lockedLocationId={lockedLocationId}
      />

      {/* Tier 2 — Location student panel (lazy loaded, slides in on card click) */}
      {selectedLocationId !== null && (
        <LocationStudentPanel
          locationId={selectedLocationId}
          locations={locations}
          teachers={teacherList}
          riskMap={riskMap}
          canViewBilling={canViewBilling}
          onClose={() => setSelectedLocationId(null)}
          onNavigate={handleNavigateToStudent}
          onAddStudent={() => setShowAddStudent(true)}
        />
      )}

      {/* Add Student modal */}
      {showAddStudent && (
        <AddStudentModal onClose={() => setShowAddStudent(false)} />
      )}

      {/* Edit Student modal */}
      {editStudent && (
        <StudentFormModal
          student={editStudent}
          locations={locations ?? []}
          teachers={(teacherList ?? []).filter((t: any) => { const s = t.status ?? (t.is_active ? 'active' : 'inactive'); return s !== 'inactive' })}
          tenantId={tenantId!}
          onSave={handleEditSave}
          onClose={() => setEditStudent(null)}
          isSaving={updateStudent.isPending}
        />
      )}

      {/* Exit Interview modal */}
      {exitStudent && (
        <ExitInterviewModal
          student={exitStudent}
          onSave={handleExitSave}
          onClose={() => {
            toast('Status change cancelled — student remains ' + exitStudent.status, 'info')
            setExitStudent(null)
          }}
          isSaving={updateStudent.isPending}
        />
      )}

      {/* Retention Capture modal */}
      {retentionTarget && (
        <RetentionCaptureModal
          studentId={retentionTarget.student.id}
          studentFirstName={retentionTarget.student.first_name}
          familyId={retentionTarget.student.family_id}
          newStatus={retentionTarget.newStatus}
          onComplete={() => setRetentionTarget(null)}
          onCancel={() => {
            toast('Status change cancelled — student remains ' + retentionTarget.student.status, 'info')
            setRetentionTarget(null)
          }}
        />
      )}

      {/* Export CSV modal */}
      {showExport && (
        <div className="modal-overlay" onClick={() => setShowExport(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 400 }}>
            <div className="modal-header">
              <span className="modal-title">Export CSV</span>
              <button className="btn-ghost" onClick={() => setShowExport(false)} style={{ padding: '4px 8px' }}>X</button>
            </div>
            <div style={{ padding: 22 }}>
              <p style={{ fontSize: 12.5, color: '#A0A0C8', marginBottom: 16 }}>Select what to include in your export:</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {[
                  { key: 'active', label: 'Active Students', count: tabCounts?.active ?? 0, color: '#22C55E' },
                  { key: 'former', label: 'Former Students', count: tabCounts?.former ?? 0, color: '#8080A8' },
                  { key: 'leads', label: 'Leads', count: allLeads?.length ?? 0, color: '#E8488A' },
                ].map((opt) => (
                  <label key={opt.key} style={{
                    display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px',
                    background: exportSelections[opt.key] ? 'rgba(212,34,106,0.06)' : 'rgba(255,255,255,0.03)',
                    border: `1px solid ${exportSelections[opt.key] ? 'rgba(212,34,106,0.2)' : 'rgba(255,255,255,0.06)'}`,
                    borderRadius: 10, cursor: 'pointer', transition: 'all 140ms ease',
                  }}>
                    <input
                      type="checkbox"
                      checked={exportSelections[opt.key]}
                      onChange={() => setExportSelections({ ...exportSelections, [opt.key]: !exportSelections[opt.key] })}
                      style={{ accentColor: '#D4226A' }}
                    />
                    <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: '#E0E0F4' }}>{opt.label}</span>
                    <span style={{ fontSize: 11, color: opt.color, fontWeight: 600 }}>{opt.count}</span>
                  </label>
                ))}
                <button
                  className="btn-ghost"
                  onClick={() => {
                    const allSelected = exportSelections.active && exportSelections.former && exportSelections.leads
                    setExportSelections({ active: !allSelected, former: !allSelected, leads: !allSelected })
                  }}
                  style={{ fontSize: 11, padding: '6px 12px', alignSelf: 'flex-start', marginTop: 4 }}
                >
                  {exportSelections.active && exportSelections.former && exportSelections.leads ? 'Deselect All' : 'Select All'}
                </button>
              </div>
              <button
                className="btn-primary"
                style={{ width: '100%', justifyContent: 'center', marginTop: 18, padding: 12 }}
                onClick={async () => {
                  const { data: allRows = [] } = await refetchAllStudentsForExport()
                  const rows: string[][] = [['Type', 'Name', 'Parent', 'Email', 'Phone', 'Instrument', 'Location', 'Teacher', 'Monthly', 'Overdue', 'Status']]
                  if (exportSelections.active) {
                    allRows.filter((s) => s.status === 'active').forEach((s) =>
                      rows.push(['Student', `${s.first_name} ${s.last_name}`, s.family_name ?? '', s.family_email ?? '', s.family_phone ?? '', s.instrument ?? '', s.location_name ?? '', s.teacher_name ?? '', `$${((s.rate_per_session === 0 ? 0 : (s.family_rate_tier ? s.family_rate_tier / 100 : s.rate_per_session)) * (s.sessions_per_month ?? s.blocks_per_week * 4)).toFixed(0)}`, `$${Number((s as any).overdue_amount ?? 0).toFixed(0)}`, 'Active'])
                    )
                  }
                  if (exportSelections.former) {
                    allRows.filter((s) => s.status === 'former' || s.status === 'inactive').forEach((s) =>
                      rows.push(['Student', `${s.first_name} ${s.last_name}`, s.family_name ?? '', s.family_email ?? '', s.family_phone ?? '', s.instrument ?? '', s.location_name ?? '', s.teacher_name ?? '', '', '', 'Former'])
                    )
                  }
                  if (exportSelections.leads) {
                    (allLeads ?? []).forEach((l) =>
                      rows.push(['Lead', `${l.first_name} ${l.last_name ?? ''}`, l.parent_name ?? '', l.email ?? '', l.phone ?? '', l.instrument ?? '', l.location_name ?? '', '', '', '', l.stage])
                    )
                  }
                  const csv = rows.map((r) => r.map((c) => `"${c}"`).join(',')).join('\n')
                  const blob = new Blob([csv], { type: 'text/csv' })
                  const url = URL.createObjectURL(blob)
                  const a = document.createElement('a')
                  a.href = url
                  a.download = `export-${new Date().toISOString().split('T')[0]}.csv`
                  a.click()
                  URL.revokeObjectURL(url)
                  setShowExport(false)
                }}
              >
                Export Selected
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Import CSV modal */}
      {showImport && (
        <CsvImportFlow
          title="Import Students"
          templateCsv={STUDENT_TEMPLATE}
          templateFilename="student_import_template.csv"
          requiredColumns={['first_name', 'last_name']}
          onCheck={studentImport.check}
          onRun={studentImport.run}
          onReset={studentImport.reset}
          status={studentImport.status}
          progress={studentImport.progress}
          preview={studentImport.preview}
          result={studentImport.result}
          onClose={() => { setShowImport(false); studentImport.reset() }}
        />
      )}

      {/* Master Sheet */}
      {showMasterSheet && (
        <DataGrid
          title="Master Editor — Students"
          table="students"
          columns={[
            { key: 'first_name', label: 'First Name', width: 120 },
            { key: 'last_name', label: 'Last Name', width: 120 },
            { key: 'status', label: 'Status', width: 100, type: 'select', options: ['active', 'paused', 'inactive', 'former'] },
            { key: 'instrument', label: 'Instrument', width: 130 },
            { key: 'location_id', label: 'Location ID', width: 140 },
            { key: 'teacher_id', label: 'Teacher ID', width: 140 },
            { key: 'blocks_per_week', label: 'Blocks/Week', width: 110 },
            { key: 'rate_per_session', label: 'Rate/Session', width: 120 },
            { key: 'start_date', label: 'Start Date', width: 120 },
            { key: 'notes', label: 'Notes', width: 250 },
          ]}
          nameRenderer={(row: any) => `${row.first_name ?? ''} ${row.last_name ?? ''}`.trim()}
          orderBy="first_name"
          onClose={() => setShowMasterSheet(false)}
        />
      )}
    </div>
    </IssueContextProvider>
  )
}

// ---- Student Form Modal (edit only — create goes through AddStudentModal) ----
const CORE_FOUR_SET = new Set(['piano', 'guitar', 'vocals', 'drums'])

interface InstrumentFormRow {
  id?: string
  instrument: string
  teacher_id: string
  is_primary: boolean
}

function StudentFormModal({ student, locations, teachers, tenantId, onSave, onClose, isSaving }: {
  student: StudentRow | null
  locations: any[]
  teachers: any[]
  tenantId: string
  onSave: (data: any) => Promise<void>
  onClose: () => void
  isSaving: boolean
}) {
  const { data: families } = useFamilies()
  const { data: existingInstruments } = useStudentInstruments(student?.id)
  const saveInstruments = useSaveStudentInstruments()

  const [form, setForm] = useState({
    first_name: student?.first_name ?? '',
    last_name: student?.last_name ?? '',
    family_id: student?.family_id ?? '',
    location_id: student?.location_id ?? '',
    blocks_per_week: student?.blocks_per_week ?? 1,
    rate_per_session: student?.rate_per_session ?? DEFAULT_RATE_PER_SESSION,
    start_date: student?.start_date ?? '',
    status: student?.status ?? 'active',
    notes: student?.notes ?? '',
  })

  const [instrumentRows, setInstrumentRows] = useState<InstrumentFormRow[]>([
    { instrument: student?.instrument ?? '', teacher_id: student?.teacher_id ?? '', is_primary: true },
  ])
  const [removedIds, setRemovedIds] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (student && existingInstruments && existingInstruments.length > 0) {
      setInstrumentRows(existingInstruments.map((si) => ({
        id: si.id, instrument: si.instrument, teacher_id: si.teacher_id ?? '', is_primary: si.is_primary,
      })))
    }
  }, [existingInstruments]) // eslint-disable-line react-hooks/exhaustive-deps

  const updateRow = (idx: number, patch: Partial<InstrumentFormRow>) =>
    setInstrumentRows((prev) => prev.map((r, i) => i === idx ? { ...r, ...patch } : r))
  const addRow = () => setInstrumentRows((prev) => [...prev, { instrument: '', teacher_id: '', is_primary: false }])
  const removeRow = (idx: number) => {
    const row = instrumentRows[idx]
    if (instrumentRows.length <= 1) return
    if (row.id) setRemovedIds((prev) => [...prev, row.id!])
    const remaining = instrumentRows.filter((_, i) => i !== idx)
    if (row.is_primary && remaining.length > 0) remaining[0].is_primary = true
    setInstrumentRows(remaining)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!form.first_name || !form.last_name) { setError('First and last name are required.'); return }
    if (!instrumentRows[0]?.instrument) { setError('At least one instrument is required.'); return }
    const primary = instrumentRows.find((r) => r.is_primary) ?? instrumentRows[0]
    try {
      await onSave({ ...form, instrument: primary.instrument, teacher_id: primary.teacher_id || null })
      if (student) {
        await saveInstruments.mutateAsync({
          studentId: student.id,
          tenantId,
          instruments: instrumentRows.map((r) => ({
            id: r.id, instrument: r.instrument, teacher_id: r.teacher_id || null,
            is_primary: r.is_primary, rate_per_session: form.rate_per_session,
            sessions_per_month: form.blocks_per_week * 4,
          })),
          removedIds,
        })
      }
    } catch (err: any) { setError(err.message) }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 560 }}>
        <div className="modal-header">
          <h2>{student ? 'Edit Student' : 'New Student'}</h2>
          <button className="btn-ghost" onClick={onClose}>✕</button>
        </div>
        <form onSubmit={handleSubmit} className="modal-form">
          <div className="form-row">
            <div className="form-field" style={{ flex: 1 }}><label>First Name *</label><input value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })} /></div>
            <div className="form-field" style={{ flex: 1 }}><label>Last Name *</label><input value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })} /></div>
          </div>

          <div style={{ marginBottom: 14 }}>
            <label style={{ fontSize: 11, fontWeight: 700, color: '#A0A0C8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8, display: 'block' }}>Instruments & Teachers</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {instrumentRows.map((row, idx) => (
                <div key={idx} style={{ display: 'flex', gap: 6, alignItems: 'center', padding: '8px 10px', borderRadius: 10, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                  <span style={{ fontSize: 18, flexShrink: 0 }}>{row.instrument ? getInstrumentEmoji(row.instrument) : '\u{1F3B5}'}</span>
                  <select value={row.instrument} onChange={(e) => updateRow(idx, { instrument: e.target.value })} className="filter-select" style={{ flex: 1, minWidth: 0 }}>
                    <option value="">Select...</option>
                    <optgroup label="Core">
                      {INSTRUMENTS.filter((i) => CORE_FOUR_SET.has(i)).map((i) => <option key={i} value={i}>{i.charAt(0).toUpperCase() + i.slice(1)}</option>)}
                    </optgroup>
                    <optgroup label="Other">
                      {INSTRUMENTS.filter((i) => !CORE_FOUR_SET.has(i)).map((i) => <option key={i} value={i}>{i.charAt(0).toUpperCase() + i.slice(1)}</option>)}
                    </optgroup>
                  </select>
                  <span style={{ fontSize: 11, color: '#606088', flexShrink: 0 }}>with</span>
                  <select value={row.teacher_id} onChange={(e) => updateRow(idx, { teacher_id: e.target.value })} className="filter-select" style={{ flex: 1, minWidth: 0 }}>
                    <option value="">Unassigned</option>
                    {teachers.map((t: any) => <option key={t.id} value={t.id}>{t.first_name ?? t.profile?.first_name} {t.last_name ?? t.profile?.last_name}</option>)}
                  </select>
                  {row.is_primary && instrumentRows.length > 1 && <span style={{ fontSize: 8, fontWeight: 800, padding: '2px 6px', borderRadius: 4, background: 'rgba(212,34,106,0.15)', color: '#D4226A', textTransform: 'uppercase', letterSpacing: '0.06em', flexShrink: 0 }}>Primary</span>}
                  {instrumentRows.length > 1 && (
                    <button type="button" onClick={() => removeRow(idx)} style={{ width: 28, height: 28, minWidth: 28, borderRadius: 6, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.15)', color: '#EF4444', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, flexShrink: 0, padding: 0 }}>×</button>
                  )}
                </div>
              ))}
            </div>
            <button type="button" onClick={addRow} style={{ marginTop: 6, padding: '6px 14px', borderRadius: 8, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#A0A0C8', cursor: 'pointer', fontSize: 11, fontWeight: 600 }}>+ Add Another Instrument</button>
          </div>

          <div className="form-row">
            <div className="form-field" style={{ flex: 1 }}>
              <label>Family *</label>
              <select value={form.family_id} onChange={(e) => setForm({ ...form, family_id: e.target.value })} className="filter-select" style={{ width: '100%' }}>
                <option value="">Select...</option>
                {(families ?? []).map((f: any) => <option key={f.id} value={f.id}>{f.name}</option>)}
              </select>
            </div>
            <div className="form-field" style={{ flex: 1 }}>
              <label>Location *</label>
              <select value={form.location_id} onChange={(e) => setForm({ ...form, location_id: e.target.value })} className="filter-select" style={{ width: '100%' }}>
                <option value="">Select...</option>
                {locations.filter((l: any) => l.is_active).map((l: any) => <option key={l.id} value={l.id}>{l.name.replace(' Music Lessons', '')}</option>)}
              </select>
            </div>
          </div>
          <div className="form-row">
            <div className="form-field" style={{ flex: 1 }}><label>Blocks/Week</label><input type="number" min="1" max="10" value={form.blocks_per_week} onChange={(e) => setForm({ ...form, blocks_per_week: parseInt(e.target.value) || 1 })} /></div>
            <div className="form-field" style={{ flex: 1 }}><label>Rate/Session ($)</label><input type="number" step="0.50" value={form.rate_per_session} onChange={(e) => setForm({ ...form, rate_per_session: parseFloat(e.target.value) || 45 })} /></div>
            <div className="form-field" style={{ flex: 1 }}><label>Start Date</label><input type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} /></div>
          </div>
          {student && (
            <div className="form-field">
              <label>Status</label>
              <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as any })} className="filter-select" style={{ width: '100%' }}>
                <option value="active">Active</option>
                <option value="paused">Paused</option>
                <option value="inactive">Inactive</option>
                <option value="former">Former</option>
              </select>
            </div>
          )}
          <div className="form-field"><label>Notes</label><textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} /></div>
          {error && <div className="form-error">{error}</div>}
          <div className="modal-actions">
            <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={isSaving}>{isSaving ? 'Saving...' : student ? 'Save Changes' : 'Create Student'}</button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ---- Exit Interview Modal ----
function ExitInterviewModal({ student, onSave, onClose, isSaving }: {
  student: StudentRow
  onSave: (data: { exit_reason: string; exit_notes: string; may_return: string; reactivation_date: string }) => Promise<void>
  onClose: () => void
  isSaving: boolean
}) {
  const [form, setForm] = useState({
    exit_reason: '',
    exit_notes: '',
    may_return: '',
    reactivation_date: '',
  })
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!form.exit_reason) { setError('Please select a reason.'); return }
    if (!form.may_return) { setError('Please indicate if the student may return.'); return }
    if ((form.may_return === 'yes' || form.may_return === 'maybe') && !form.reactivation_date) {
      setError('Please set a follow-up date for potential returnees.')
      return
    }
    try { await onSave(form) } catch (err: any) { setError(err.message) }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 480 }}>
        <div className="modal-header">
          <h2>Exit Interview — {student.first_name} {student.last_name}</h2>
          <button className="btn-ghost" onClick={onClose}>✕</button>
        </div>
        <form onSubmit={handleSubmit} className="modal-form">
          <p className="text-muted" style={{ fontSize: '13px', marginBottom: '12px' }}>
            This information helps us improve and identify reactivation opportunities.
          </p>

          <div className="form-field">
            <label>Why is this student leaving? *</label>
            <select value={form.exit_reason} onChange={(e) => setForm({ ...form, exit_reason: e.target.value })} className="filter-select" style={{ width: '100%' }}>
              <option value="">Select a reason...</option>
              {EXIT_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>

          <div className="form-field">
            <label>Additional notes</label>
            <textarea value={form.exit_notes} onChange={(e) => setForm({ ...form, exit_notes: e.target.value })} rows={2} placeholder="Any additional context..." />
          </div>

          <div className="form-field">
            <label>Will this student potentially return? *</label>
            <div className="exit-return-options">
              {['yes', 'maybe', 'no'].map((opt) => (
                <button
                  key={opt}
                  type="button"
                  className={`exit-return-btn${form.may_return === opt ? ' active' : ''}`}
                  onClick={() => setForm({ ...form, may_return: opt })}
                >
                  {opt === 'yes' ? '✓ Yes' : opt === 'maybe' ? '? Maybe' : '✗ No'}
                </button>
              ))}
            </div>
          </div>

          {(form.may_return === 'yes' || form.may_return === 'maybe') && (
            <div className="form-field">
              <label>When should we follow up? *</label>
              <input type="date" value={form.reactivation_date} onChange={(e) => setForm({ ...form, reactivation_date: e.target.value })} />
              <span className="text-dim" style={{ fontSize: '11px', marginTop: '4px' }}>
                A reminder will appear on the dashboard when this date arrives.
              </span>
            </div>
          )}

          {error && <div className="form-error">{error}</div>}

          <div className="modal-actions">
            <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={isSaving} style={{ background: '#EF4444' }}>
              {isSaving ? 'Saving...' : 'Mark as Former'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
