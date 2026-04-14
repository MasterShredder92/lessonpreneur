import { useState, useRef, useCallback, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import TeacherDetail from './TeacherDetail'
import { useAuthContext } from '../../app/AuthContext'
import { usePermissions } from '../../hooks/usePermissions'
import { useTeacherOverview } from '../../hooks/useTeacherOverview'
import type { TeacherOverview } from '../../hooks/useTeacherOverview'
import { useLocations } from '../../hooks/useLocations'
import { Users, Calendar, LayoutGrid, ChevronRight, AlertTriangle, MapPin, List } from 'lucide-react'
import TeacherFormModal from '../../components/teachers/TeacherFormModal'
import CsvImportFlow from '../../components/shared/CsvImportFlow'
import { useImportTeachers, TEACHER_TEMPLATE } from '../../hooks/useImport'
import TeacherSpreadsheet from '../../components/teachers/TeacherSpreadsheet'
import W9ExportModal from '../../components/teachers/W9ExportModal'
import { useScrollRestore } from '../../hooks/useScrollRestore'
import { useUrlFilters } from '../../hooks/useUrlFilters'
import { IssueContextProvider } from '../../contexts/IssueContext'
import ReportIssueButton from '../../components/shared/ReportIssueButton'
import TeachersPageGuide from '../../components/admin/TeachersPageGuide'
import { CORE_INSTRUMENTS, OTHER_INSTRUMENTS } from '../../lib/constants'

/* ── tiny helpers ────────────────────────────────────────── */

function StatusDot({ status }: { status: string }) {
  const color = status === 'active' ? '#22C55E'
    : status === 'at_capacity' || status === 'at capacity' ? '#FFB800'
    : '#52526A'
  const glow = status === 'active' ? `0 0 6px ${color}90` : 'none'
  return (
    <span style={{
      display: 'inline-block', width: 8, height: 8, borderRadius: '50%',
      background: color, boxShadow: glow, flexShrink: 0,
    }} />
  )
}

/* ── Progressive list — renders PAGE_SIZE at a time ──────── */

const PAGE_SIZE = 50

function useProgressiveList<T>(items: T[]) {
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)
  const sentinelRef = useRef<HTMLDivElement | null>(null)

  // Reset when the underlying list changes (filter, tab switch)
  useEffect(() => { setVisibleCount(PAGE_SIZE) }, [items])

  const observerCallback = useCallback(
    (entries: IntersectionObserverEntry[]) => {
      if (entries[0]?.isIntersecting) {
        setVisibleCount((prev) => Math.min(prev + PAGE_SIZE, items.length))
      }
    },
    [items.length],
  )

  useEffect(() => {
    const node = sentinelRef.current
    if (!node) return
    const observer = new IntersectionObserver(observerCallback, { rootMargin: '200px' })
    observer.observe(node)
    return () => observer.disconnect()
  }, [observerCallback])

  return {
    visible: items.slice(0, visibleCount),
    hasMore: visibleCount < items.length,
    sentinelRef,
    total: items.length,
    showing: Math.min(visibleCount, items.length),
  }
}

/* ── Dashboard stat tile ─────────────────────────────────── */

function StatTile({
  label, value, sub, color, onClick,
}: {
  label: string; value: number; sub?: string; color?: string; onClick?: () => void
}) {
  return (
    <div
      onClick={onClick}
      style={{
        background: 'linear-gradient(150deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.015) 100%)',
        border: '1px solid rgba(255,255,255,0.07)',
        borderRadius: 12, padding: '18px 20px',
        display: 'flex', flexDirection: 'column', gap: 5,
        cursor: onClick ? 'pointer' : 'default',
        transition: 'border-color 0.18s, box-shadow 0.18s',
        boxShadow: '0 2px 12px rgba(0,0,0,0.15)',
        position: 'relative', overflow: 'hidden',
      }}
      onMouseEnter={(e) => {
        if (!onClick) return
        e.currentTarget.style.borderColor = 'rgba(255,255,255,0.16)'
        e.currentTarget.style.boxShadow = '0 4px 20px rgba(0,0,0,0.25)'
      }}
      onMouseLeave={(e) => {
        if (!onClick) return
        e.currentTarget.style.borderColor = 'rgba(255,255,255,0.07)'
        e.currentTarget.style.boxShadow = '0 2px 12px rgba(0,0,0,0.15)'
      }}
    >
      {color && (
        <div style={{
          position: 'absolute', top: 0, left: '15%', right: '15%', height: 1,
          background: `linear-gradient(90deg, transparent, ${color}40, transparent)`,
          pointerEvents: 'none',
        }} />
      )}
      <span style={{ fontSize: 30, fontWeight: 900, color: color ?? '#E8E8F4', lineHeight: 1 }}>
        {value}
      </span>
      <span style={{ fontSize: 11, fontWeight: 700, color: '#7070A0', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</span>
      {sub && <span style={{ fontSize: 10, color: '#4A4A6A' }}>{sub}</span>}
    </div>
  )
}

/* ── Location breakdown tile ─────────────────────────────── */

function LocationTile({
  name, color, count, onClick,
}: {
  name: string; color: string; count: number; onClick: () => void
}) {
  return (
    <div
      onClick={onClick}
      style={{
        background: `${color}08`,
        border: `1px solid ${color}25`,
        borderRadius: 10, padding: '14px 16px',
        display: 'flex', alignItems: 'center', gap: 10,
        cursor: 'pointer', transition: 'border-color 0.15s',
      }}
      onMouseEnter={(e) => (e.currentTarget.style.borderColor = `${color}50`)}
      onMouseLeave={(e) => (e.currentTarget.style.borderColor = `${color}25`)}
    >
      <MapPin size={14} color={color} />
      <span style={{ fontSize: 13, fontWeight: 700, color }}>{name}</span>
      <span style={{ marginLeft: 'auto', fontSize: 18, fontWeight: 900, color }}>{count}</span>
    </div>
  )
}

/* ── MAIN COMPONENT ──────────────────────────────────────── */

export default function Teachers() {
  const { role } = useAuthContext()
  const { data: teachers, isLoading, error } = useTeacherOverview()
  const { data: locations } = useLocations()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const detailTeacherId = searchParams.get('id')
  const view = searchParams.get('view') // null = dashboard, 'list' = full roster
  const { isStudioDirector, isAtLeast } = usePermissions()
  const canEdit = isAtLeast('studio_director')
  const { saveScroll } = useScrollRestore('teachers')

  const [showForm, setShowForm] = useState(false)
  const [showSpreadsheet, setShowSpreadsheet] = useState(false)
  const [showCsvImport, setShowCsvImport] = useState(false)
  const teacherImport = useImportTeachers()
  const [showW9Export, setShowW9Export] = useState(false)

  // URL-persisted filters (used in list view)
  const { getParam, setParam } = useUrlFilters()
  const filterNeedsReview = getParam('needs_review') === '1'
  const teacherTab = (isStudioDirector ? 'active' : (getParam('status') || 'active')) as 'active' | 'inactive'
  const locationFilter = getParam('location')
  const instrumentFilter = getParam('instrument')
  const search = getParam('q')

  const setFilterNeedsReview = (v: boolean) => setParam('needs_review', v ? '1' : '')
  const setTeacherTab = (v: 'active' | 'inactive') => setParam('status', v === 'active' ? '' : v)
  const setLocationFilter = (v: string) => setParam('location', v)
  const setInstrumentFilter = (v: string) => setParam('instrument', v)
  const setSearch = (v: string) => setParam('q', v)

  /* ── detail view ───────────────────────────────────────── */
  if (detailTeacherId) {
    return (
      <TeacherDetail
        propId={detailTeacherId}
        onBack={() => navigate('/admin/teachers?view=list')}
      />
    )
  }

  /* ── derived data ──────────────────────────────────────── */
  const allActive = teachers?.filter((t) => t.is_active) ?? []
  const inactiveTeachers = teachers?.filter((t) => !t.is_active) ?? []
  const needsReviewCount = allActive.filter((t) => t.instruments_need_review).length
  const atCapacityCount = allActive.filter((t) => t.status === 'at_capacity' || t.status === 'at capacity').length
  const subsAvailable = allActive.filter((t) => t.is_sub_available).length
  const totalStudents = allActive.reduce((s, t) => s + t.student_count, 0)
  const totalBlocks = allActive.reduce((s, t) => s + t.blocks_this_week, 0)
  const baseActive = filterNeedsReview ? allActive.filter((t) => t.instruments_need_review) : allActive

  const applyFilters = (list: TeacherOverview[]): TeacherOverview[] =>
    list.filter((t) => {
      if (locationFilter && !t.location_names.some((n) => n.toLowerCase().includes(locationFilter.toLowerCase()))) return false
      if (instrumentFilter && !t.instruments.some((i) => i.toLowerCase() === instrumentFilter.toLowerCase())) return false
      if (search) {
        const name = `${t.first_name} ${t.last_name}`.toLowerCase()
        if (!name.includes(search.toLowerCase())) return false
      }
      return true
    })

  const sortAlpha = (list: TeacherOverview[]): TeacherOverview[] =>
    [...list].sort((a, b) => {
      const an = `${a.last_name} ${a.first_name}`.trim().toLowerCase()
      const bn = `${b.last_name} ${b.first_name}`.trim().toLowerCase()
      return an.localeCompare(bn)
    })

  const displayList = sortAlpha(applyFilters(teacherTab === 'active' ? baseActive : inactiveTeachers))
  const currentBase = teacherTab === 'active' ? baseActive : inactiveTeachers

  // Location breakdown for dashboard
  const activeLocations = locations?.filter((l: any) => l.is_active) ?? []
  const locationBreakdown = activeLocations.map((loc: any) => {
    const locName = loc.name.replace(' Music Lessons', '')
    return {
      id: loc.id,
      name: locName,
      color: loc.color ?? '#D4226A',
      count: allActive.filter((t) => t.location_names.some((n) => n.toLowerCase() === locName.toLowerCase())).length,
    }
  })

  /* ── Navigate to list with optional pre-filter ─────────── */
  const goToList = (preFilter?: { location?: string }) => {
    const params = new URLSearchParams({ view: 'list' })
    if (preFilter?.location) params.set('location', preFilter.location)
    navigate(`/admin/teachers?${params.toString()}`)
  }

  /* ═══════════════════════════════════════════════════════════
     DASHBOARD VIEW — lightweight front page
     ═══════════════════════════════════════════════════════════ */
  if (view !== 'list') {
    return (
      <IssueContextProvider page="The Band — Teachers">
        <div className="page">
          <div className="page-header">
            <h1>Teachers</h1>
            <span className="badge-secondary">{isLoading ? '—' : allActive.length} active</span>
            {canEdit && (
              <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
                <button className="btn-primary" onClick={() => setShowForm(true)}>
                  + Add Teacher
                </button>
              </div>
            )}
            <TeachersPageGuide />
            <ReportIssueButton />
          </div>

          {isLoading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}>
              <div style={{ color: '#52526A', fontSize: 13 }}>Loading teacher data...</div>
            </div>
          ) : error ? (
            <div className="form-error">Failed to load: {(error as Error).message}</div>
          ) : (
            <>
              {/* Needs-review banner */}
              {needsReviewCount > 0 && (
                <div
                  onClick={() => { setFilterNeedsReview(true); goToList() }}
                  style={{
                    background: 'rgba(255,184,0,0.06)', border: '1px solid rgba(255,184,0,0.2)',
                    borderRadius: 10, padding: '12px 16px', marginBottom: 16,
                    display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer',
                  }}
                >
                  <AlertTriangle size={15} color="#FFB800" />
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#FFB800' }}>
                    {needsReviewCount} teacher{needsReviewCount !== 1 ? 's' : ''} need instrument assignment
                  </span>
                  <ChevronRight size={14} color="#FFB800" style={{ marginLeft: 'auto' }} />
                </div>
              )}

              {/* Stat tiles */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
                gap: 10, marginBottom: 20,
              }}>
                <StatTile label="Active Teachers" value={allActive.length} color="#22C55E" onClick={() => goToList()} />
                <StatTile label="Inactive" value={inactiveTeachers.length} color="#52526A" onClick={() => { setTeacherTab('inactive'); goToList() }} />
                <StatTile label="At Capacity" value={atCapacityCount} color="#FFB800" />
                <StatTile label="Subs Available" value={subsAvailable} color="#A78BFA" />
                <StatTile label="Total Students" value={totalStudents} sub="across active teachers" />
                <StatTile label="Sessions This Week" value={totalBlocks} sub="booked blocks" />
              </div>

              {/* Location breakdown */}
              {locationBreakdown.length > 0 && (
                <>
                  <h3 style={{ fontSize: 13, fontWeight: 800, color: '#8080A8', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                    By Location
                  </h3>
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
                    gap: 8, marginBottom: 24,
                  }}>
                    {locationBreakdown.map((loc) => (
                      <LocationTile
                        key={loc.id}
                        name={loc.name}
                        color={loc.color}
                        count={loc.count}
                        onClick={() => goToList({ location: loc.name })}
                      />
                    ))}
                  </div>
                </>
              )}

              {/* View full roster CTA */}
              <button
                onClick={() => goToList()}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  width: '100%', justifyContent: 'center', padding: '14px 20px',
                  fontSize: 12.5, fontWeight: 700, cursor: 'pointer',
                  background: 'linear-gradient(135deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.018) 100%)',
                  border: '1px solid rgba(255,255,255,0.09)',
                  borderRadius: 12, color: '#8080A8',
                  transition: 'border-color 0.18s, color 0.18s, box-shadow 0.18s',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = 'rgba(255,255,255,0.18)'
                  e.currentTarget.style.color = '#C0C0E0'
                  e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.25)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = 'rgba(255,255,255,0.09)'
                  e.currentTarget.style.color = '#8080A8'
                  e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.15)'
                }}
              >
                <List size={15} />
                View Full Teacher Roster
                <ChevronRight size={14} />
              </button>
            </>
          )}

          {/* Modals (add teacher available from dashboard too) */}
          {showForm && <TeacherFormModal onClose={() => setShowForm(false)} />}
        </div>
      </IssueContextProvider>
    )
  }

  /* ═══════════════════════════════════════════════════════════
     LIST VIEW — scannable alphabetical table
     ═══════════════════════════════════════════════════════════ */
  return <TeacherListView
    displayList={displayList}
    currentBase={currentBase}
    allActive={allActive}
    inactiveTeachers={inactiveTeachers}
    needsReviewCount={needsReviewCount}
    isLoading={isLoading}
    error={error}
    teacherTab={teacherTab}
    setTeacherTab={setTeacherTab}
    locationFilter={locationFilter}
    setLocationFilter={setLocationFilter}
    instrumentFilter={instrumentFilter}
    setInstrumentFilter={setInstrumentFilter}
    search={search}
    setSearch={setSearch}
    filterNeedsReview={filterNeedsReview}
    setFilterNeedsReview={setFilterNeedsReview}
    locations={locations}
    canEdit={canEdit}
    role={role}
    isStudioDirector={isStudioDirector}
    showForm={showForm}
    setShowForm={setShowForm}
    showSpreadsheet={showSpreadsheet}
    setShowSpreadsheet={setShowSpreadsheet}
    showCsvImport={showCsvImport}
    setShowCsvImport={setShowCsvImport}
    showW9Export={showW9Export}
    setShowW9Export={setShowW9Export}
    teacherImport={teacherImport}
    saveScroll={saveScroll}
    navigate={navigate}
  />
}

/* ═══════════════════════════════════════════════════════════
   LIST VIEW COMPONENT — table-style, alphabetical, progressive
   ═══════════════════════════════════════════════════════════ */

function TeacherListView({
  displayList, currentBase, allActive, inactiveTeachers, needsReviewCount,
  isLoading, error, teacherTab, setTeacherTab, locationFilter, setLocationFilter,
  instrumentFilter, setInstrumentFilter, search, setSearch,
  filterNeedsReview, setFilterNeedsReview, locations, canEdit, role,
  isStudioDirector, showForm, setShowForm, showSpreadsheet, setShowSpreadsheet,
  showCsvImport, setShowCsvImport, showW9Export, setShowW9Export,
  teacherImport, saveScroll, navigate,
}: {
  displayList: TeacherOverview[]
  currentBase: TeacherOverview[]
  allActive: TeacherOverview[]
  inactiveTeachers: TeacherOverview[]
  needsReviewCount: number
  isLoading: boolean
  error: unknown
  teacherTab: 'active' | 'inactive'
  setTeacherTab: (v: 'active' | 'inactive') => void
  locationFilter: string
  setLocationFilter: (v: string) => void
  instrumentFilter: string
  setInstrumentFilter: (v: string) => void
  search: string
  setSearch: (v: string) => void
  filterNeedsReview: boolean
  setFilterNeedsReview: (v: boolean) => void
  locations: any
  canEdit: boolean
  role: string | null
  isStudioDirector: boolean
  showForm: boolean
  setShowForm: (v: boolean) => void
  showSpreadsheet: boolean
  setShowSpreadsheet: (v: boolean) => void
  showCsvImport: boolean
  setShowCsvImport: (v: boolean) => void
  showW9Export: boolean
  setShowW9Export: (v: boolean) => void
  teacherImport: any
  saveScroll: () => void
  navigate: ReturnType<typeof useNavigate>
}) {
  const { visible, hasMore, sentinelRef, total, showing } = useProgressiveList(displayList)

  return (
    <IssueContextProvider page="The Band — Teachers">
      <div className="page">
        {/* Page header */}
        <div className="page-header">
          <button
            className="btn-ghost"
            onClick={() => navigate('/admin/teachers')}
            style={{ padding: '4px 8px', marginRight: 4, fontSize: 12, color: '#8080A8' }}
          >
            &larr; Dashboard
          </button>
          <h1>Teacher Roster</h1>
          <span className="badge-secondary">{allActive.length} active</span>
          {canEdit && (
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
              <button
                className="btn-outline"
                onClick={() => setShowSpreadsheet(true)}
                style={{ display: 'flex', alignItems: 'center', gap: 5 }}
              >
                <LayoutGrid size={13} /> Master Editor
              </button>
              {role === 'owner' && (
                <button className="btn-outline" onClick={() => setShowW9Export(true)}>
                  Export W-9s
                </button>
              )}
              <button className="btn-outline" onClick={() => setShowCsvImport(true)}>
                Import CSV
              </button>
              <button className="btn-primary" onClick={() => setShowForm(true)}>
                + Add Teacher
              </button>
            </div>
          )}
          <TeachersPageGuide />
          <ReportIssueButton />
        </div>

        {/* Needs-review banner */}
        {needsReviewCount > 0 && (
          <div className="review-banner">
            <div className="review-banner-text">
              <span className="badge-gold">{needsReviewCount}</span>
              <span>teacher{needsReviewCount !== 1 ? 's' : ''} need instrument assignment</span>
            </div>
            <button
              className={filterNeedsReview ? 'btn-primary' : 'btn-outline'}
              onClick={() => setFilterNeedsReview(!filterNeedsReview)}
              style={{ fontSize: 11, padding: '4px 12px' }}
            >
              {filterNeedsReview ? 'Show All' : 'Show Only'}
            </button>
          </div>
        )}

        {/* Status tabs + location filter pills */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
          <div className="lead-view-tabs" style={{ marginBottom: 0 }}>
            <button
              className={`lead-view-tab${teacherTab === 'active' ? ' active' : ''}`}
              onClick={() => setTeacherTab('active')}
            >
              Active <span className="tab-count">{allActive.length}</span>
            </button>
            {!isStudioDirector && (
              <button
                className={`lead-view-tab${teacherTab === 'inactive' ? ' active' : ''}`}
                onClick={() => setTeacherTab('inactive')}
              >
                Inactive <span className="tab-count">{inactiveTeachers.length}</span>
              </button>
            )}
          </div>

          <div style={{
            display: 'flex', gap: 3,
            background: 'linear-gradient(135deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.02) 100%)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 11, padding: 4,
            boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
          }}>
            <LocationFilterPill
              label="All"
              isActive={!locationFilter}
              color="#D4226A"
              count={currentBase.length}
              onClick={() => setLocationFilter('')}
            />
            {locations?.filter((l: any) => l.is_active).map((loc: any) => {
              const locName = loc.name.replace(' Music Lessons', '')
              const isActive = locationFilter === locName
              const locColor = loc.color ?? '#D4226A'
              const count = currentBase.filter((t) =>
                t.location_names.some((n) => n.toLowerCase() === locName.toLowerCase()),
              ).length
              return (
                <LocationFilterPill
                  key={loc.id}
                  label={locName}
                  isActive={isActive}
                  color={locColor}
                  count={count}
                  onClick={() => setLocationFilter(isActive ? '' : locName)}
                />
              )
            })}
          </div>
        </div>

        {/* Premium location context banner — shown when filtering by a single location */}
        {locationFilter && (() => {
          const activeLoc = locations?.find((l: any) =>
            l.name.replace(' Music Lessons', '').toLowerCase() === locationFilter.toLowerCase()
          )
          const locColor = activeLoc?.color ?? '#D4226A'
          return (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 14,
              background: `linear-gradient(135deg, ${locColor}0C 0%, ${locColor}05 100%)`,
              border: `1px solid ${locColor}28`,
              borderLeft: `4px solid ${locColor}`,
              borderRadius: 12, padding: '14px 18px',
              marginBottom: 16,
              boxShadow: `0 4px 20px rgba(0,0,0,0.25), inset 0 1px 0 ${locColor}18`,
              position: 'relative', overflow: 'hidden',
            }}>
              {/* Subtle radial glow */}
              <div style={{
                position: 'absolute', top: -20, left: -10, width: 120, height: 120,
                background: `radial-gradient(circle, ${locColor}12 0%, transparent 70%)`,
                pointerEvents: 'none',
              }} />
              <MapPin size={15} color={locColor} style={{ flexShrink: 0 }} />
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: locColor, letterSpacing: 0.1 }}>
                  {locationFilter} Music Lessons
                </div>
                <div style={{ fontSize: 11, color: `${locColor}99`, marginTop: 2, fontWeight: 600 }}>
                  {displayList.length} teacher{displayList.length !== 1 ? 's' : ''} in this location
                </div>
              </div>
              <button
                onClick={() => setLocationFilter('')}
                style={{
                  fontSize: 10, fontWeight: 700, padding: '4px 12px',
                  borderRadius: 999, cursor: 'pointer',
                  background: `${locColor}18`, color: locColor,
                  border: `1px solid ${locColor}35`,
                  transition: 'all 0.15s', flexShrink: 0,
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = `${locColor}30`
                  e.currentTarget.style.borderColor = `${locColor}55`
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = `${locColor}18`
                  e.currentTarget.style.borderColor = `${locColor}35`
                }}
              >
                Clear Filter
              </button>
            </div>
          )
        })()}

        {/* Search + instrument filter */}
        <div className="schedule-filters" style={{ marginBottom: 16 }}>
          <div className="filter-group" style={{ flexWrap: 'wrap' }}>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name..."
              className="filter-select"
              style={{ minWidth: 160 }}
            />
            <select
              value={instrumentFilter}
              onChange={(e) => setInstrumentFilter(e.target.value)}
              className="filter-select"
            >
              <option value="">All Instruments</option>
              {CORE_INSTRUMENTS.map((i) => (
                <option key={i} value={i}>{i.charAt(0).toUpperCase() + i.slice(1)}</option>
              ))}
              <option disabled>────────────</option>
              {OTHER_INSTRUMENTS.map((i) => (
                <option key={i} value={i}>{i.charAt(0).toUpperCase() + i.slice(1)}</option>
              ))}
            </select>
          </div>
          <span className="visibility-count">
            Showing {isLoading ? '—' : `${showing} of ${total}`} teacher{total !== 1 ? 's' : ''}
          </span>
        </div>

        {/* Teacher list */}
        {isLoading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} style={{
                height: 66, background: 'linear-gradient(135deg, rgba(255,255,255,0.025) 0%, rgba(255,255,255,0.01) 100%)',
                borderRadius: 12, border: '1px solid rgba(255,255,255,0.045)',
              }} />
            ))}
          </div>
        ) : error ? (
          <div className="form-error">Failed to load: {(error as Error).message}</div>
        ) : displayList.length === 0 ? (
          <div className="empty-state">No {teacherTab} teachers found.</div>
        ) : (
          <>
            {/* Column labels — hidden on mobile via CSS */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 0,
              padding: '0 0 8px 0', marginBottom: 6,
              borderBottom: '1px solid rgba(255,255,255,0.06)',
            }}>
              <div style={{ width: 5, flexShrink: 0 }} />
              <div className="teacher-row-header" style={{
                fontSize: 9.5, fontWeight: 700, color: '#505080',
                textTransform: 'uppercase', letterSpacing: '0.09em',
              }}>
                <span>Teacher</span>
                <span>Instruments</span>
                <span>Locations</span>
                <span style={{ textAlign: 'right' }}>Students</span>
                <span style={{ textAlign: 'right' }}>Sessions</span>
                <span />
              </div>
            </div>

            {/* Card rows — progressive */}
            <div data-tour-id="teachers-list">
              {visible.map((t) => (
                <TeacherRow
                  key={t.id}
                  t={t}
                  onClick={() => {
                    saveScroll()
                    navigate(`/admin/teachers?id=${t.id}`)
                  }}
                />
              ))}

              {/* Sentinel for infinite scroll */}
              {hasMore && (
                <div ref={sentinelRef} style={{
                  padding: '14px 0', textAlign: 'center',
                  fontSize: 11, color: '#52526A',
                }}>
                  Loading more...
                </div>
              )}
            </div>
          </>
        )}

        {/* Modals */}
        {showForm && <TeacherFormModal onClose={() => setShowForm(false)} />}
        {showW9Export && <W9ExportModal onClose={() => setShowW9Export(false)} />}
        {showSpreadsheet && <TeacherSpreadsheet onClose={() => setShowSpreadsheet(false)} />}
        {showCsvImport && (
          <CsvImportFlow
            title="Import Teachers"
            templateCsv={TEACHER_TEMPLATE}
            templateFilename="teacher_import_template.csv"
            requiredColumns={['first_name', 'last_name']}
            onCheck={teacherImport.check}
            onRun={teacherImport.run}
            onReset={teacherImport.reset}
            status={teacherImport.status}
            progress={teacherImport.progress}
            preview={teacherImport.preview}
            result={teacherImport.result}
            onClose={() => {
              setShowCsvImport(false)
              teacherImport.reset()
            }}
          />
        )}
      </div>
    </IssueContextProvider>
  )
}

/* ── Location filter pill ────────────────────────────────── */

function LocationFilterPill({
  label, isActive, color, count, onClick,
}: {
  label: string; isActive: boolean; color: string; count: number; onClick: () => void
}) {
  const [hovered, setHovered] = useState(false)
  const active = isActive || hovered

  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        padding: '6px 14px', borderRadius: 8, fontSize: 11, fontWeight: 700, cursor: 'pointer',
        background: active ? `${color}22` : 'transparent',
        color: active ? color : '#5858A0',
        border: active ? `1px solid ${color}44` : '1px solid transparent',
        transition: 'all 0.15s cubic-bezier(0.4,0,0.2,1)',
        boxShadow: isActive ? `0 0 14px ${color}25, inset 0 1px 0 ${color}18` : 'none',
        letterSpacing: 0.2, whiteSpace: 'nowrap',
        display: 'flex', alignItems: 'center', gap: 5,
      }}
    >
      {label}
      <span style={{
        fontSize: 9.5, fontWeight: 600,
        opacity: isActive ? 0.75 : 0.45,
        transition: 'opacity 0.15s',
      }}>
        {count}
      </span>
    </button>
  )
}

/* ── Single teacher card row ─────────────────────────────── */

function TeacherRow({ t, onClick }: { t: TeacherOverview; onClick: () => void }) {
  const isInactive = !t.is_active
  const railColors = isInactive
    ? ['#2E2E48']
    : t.location_colors.length > 0
      ? t.location_colors
      : ['#52526A']

  // Gradient background for initials avatar using location color(s)
  const avatarBg = isInactive
    ? 'rgba(255,255,255,0.025)'
    : railColors.length >= 2
      ? `linear-gradient(135deg, ${railColors[0]}28, ${railColors[1]}18)`
      : `linear-gradient(135deg, ${railColors[0]}28, ${railColors[0]}0e)`
  const avatarBorder = isInactive ? 'rgba(255,255,255,0.04)' : `${railColors[0]}35`
  const avatarColor = isInactive ? '#3A3A5A' : `${railColors[0]}E0`

  const primaryColor = isInactive ? null : (railColors[0] ?? null)

  return (
    <div
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'stretch', gap: 0,
        background: 'linear-gradient(135deg, rgba(255,255,255,0.042) 0%, rgba(255,255,255,0.018) 100%)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 13, cursor: 'pointer',
        transition: 'border-color 0.18s ease, box-shadow 0.18s ease, background 0.18s ease',
        overflow: 'hidden', marginBottom: 7,
        boxShadow: '0 2px 14px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.04)',
        position: 'relative',
      }}
      onMouseEnter={(e) => {
        const hoverColor = primaryColor ?? 'rgba(255,255,255,0.06)'
        e.currentTarget.style.borderColor = primaryColor
          ? `${primaryColor}35`
          : 'rgba(255,255,255,0.16)'
        e.currentTarget.style.boxShadow = primaryColor
          ? `0 6px 28px rgba(0,0,0,0.38), 0 0 0 1px ${primaryColor}12, inset 0 1px 0 rgba(255,255,255,0.07)`
          : '0 6px 28px rgba(0,0,0,0.38), inset 0 1px 0 rgba(255,255,255,0.07)'
        e.currentTarget.style.background = 'linear-gradient(135deg, rgba(255,255,255,0.062) 0%, rgba(255,255,255,0.028) 100%)'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'
        e.currentTarget.style.boxShadow = '0 2px 14px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.04)'
        e.currentTarget.style.background = 'linear-gradient(135deg, rgba(255,255,255,0.042) 0%, rgba(255,255,255,0.018) 100%)'
      }}
    >
      {/* Color rail — multi-segment with subtle edge glow */}
      <div style={{
        width: 5, display: 'flex', flexDirection: 'column', flexShrink: 0,
        boxShadow: !isInactive && primaryColor ? `2px 0 10px ${primaryColor}30` : 'none',
      }}>
        {railColors.map((c, i) => (
          <div key={i} style={{
            flex: 1, background: c,
            opacity: isInactive ? 0.18 : 1,
          }} />
        ))}
      </div>

      {/* Card content */}
      <div className="teacher-row-grid">
        {/* Left: Avatar + name + role */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
          {t.photo_url ? (
            <img
              src={t.photo_url}
              alt=""
              style={{
                width: 40, height: 40, borderRadius: 11,
                objectFit: 'cover', flexShrink: 0,
                border: `1px solid ${avatarBorder}`,
                boxShadow: !isInactive && primaryColor ? `0 0 10px ${primaryColor}30` : 'none',
                opacity: isInactive ? 0.35 : 1,
              }}
            />
          ) : (
            <div style={{
              width: 40, height: 40, borderRadius: 11, flexShrink: 0,
              background: avatarBg,
              border: `1px solid ${avatarBorder}`,
              boxShadow: !isInactive && primaryColor ? `0 0 10px ${primaryColor}25` : 'none',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 12.5, fontWeight: 900, letterSpacing: 0.5,
              color: avatarColor,
            }}>
              {(t.first_name[0] ?? '').toUpperCase()}{(t.last_name[0] ?? '').toUpperCase()}
            </div>
          )}
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{
              fontSize: 13.5, fontWeight: 800, lineHeight: 1.25,
              color: isInactive ? '#4E4E78' : '#F2F2FC',
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              display: 'flex', alignItems: 'center', gap: 6,
            }}>
              {t.first_name} {t.last_name}
              {t.is_sub_available && (
                <span style={{
                  fontSize: 8.5, padding: '2px 8px', borderRadius: 999, fontWeight: 700,
                  background: 'rgba(167,139,250,0.12)', color: '#B09DFC',
                  border: '1px solid rgba(167,139,250,0.28)', lineHeight: 1,
                  textTransform: 'uppercase', letterSpacing: 0.6, flexShrink: 0,
                  boxShadow: '0 0 8px rgba(167,139,250,0.2)',
                }}>Sub</span>
              )}
            </div>
            <div style={{
              fontSize: 10.5, color: isInactive ? '#3C3C62' : '#6868A0',
              marginTop: 2.5, fontWeight: 600, letterSpacing: 0.1,
            }}>
              {t.teacher_role ? t.teacher_role.charAt(0).toUpperCase() + t.teacher_role.slice(1) : 'Teacher'}
            </div>
          </div>
        </div>

        {/* Instruments — pill-shaped, premium palette */}
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', minWidth: 0, alignItems: 'center' }}>
          {t.instruments.slice(0, 3).map((inst, i) => (
            <span key={i} style={{
              fontSize: 10, padding: '4px 11px', borderRadius: 999, fontWeight: 700,
              background: isInactive
                ? 'rgba(255,255,255,0.025)'
                : 'linear-gradient(135deg, rgba(212,34,106,0.13) 0%, rgba(212,34,106,0.07) 100%)',
              color: isInactive ? '#3A3A60' : '#D96EA0',
              border: `1px solid ${isInactive ? 'rgba(255,255,255,0.045)' : 'rgba(212,34,106,0.22)'}`,
              lineHeight: 1, letterSpacing: 0.25, whiteSpace: 'nowrap',
              boxShadow: isInactive ? 'none' : 'inset 0 1px 0 rgba(212,34,106,0.1)',
            }}>
              {inst.charAt(0).toUpperCase() + inst.slice(1)}
            </span>
          ))}
          {t.instruments.length > 3 && (
            <span style={{
              fontSize: 9.5, color: '#484870', fontWeight: 700,
              alignSelf: 'center', letterSpacing: 0.1,
            }}>
              +{t.instruments.length - 3}
            </span>
          )}
        </div>

        {/* Locations — color-aware pill chips */}
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', minWidth: 0, alignItems: 'center' }}>
          {t.location_names.map((name, i) => {
            const c = t.location_colors[i] ?? '#D4226A'
            return (
              <span key={i} style={{
                fontSize: 10, padding: '4px 11px', borderRadius: 999, fontWeight: 700,
                background: isInactive ? 'rgba(255,255,255,0.025)' : `${c}18`,
                color: isInactive ? '#3A3A60' : c,
                border: `1px solid ${isInactive ? 'rgba(255,255,255,0.045)' : `${c}40`}`,
                lineHeight: 1, letterSpacing: 0.25, whiteSpace: 'nowrap',
                boxShadow: isInactive ? 'none' : `inset 0 1px 0 ${c}18`,
              }}>
                {name}
              </span>
            )
          })}
        </div>

        {/* Stats — collapse into inline row on mobile */}
        <div className="teacher-row-stats">
          <div style={{ textAlign: 'right' }}>
            <span style={{
              fontSize: 15, fontWeight: 900,
              color: isInactive ? '#383858' : t.student_count > 0 ? '#E0E2F8' : '#3A3A5A',
            }}>
              {t.student_count}
            </span>
            <span className="teacher-row-stats-label"> students</span>
          </div>

          <div style={{ textAlign: 'right' }}>
            <span style={{
              fontSize: 15, fontWeight: 900,
              color: isInactive ? '#383858' : t.blocks_this_week > 0 ? '#E0E2F8' : '#3A3A5A',
            }}>
              {t.blocks_this_week}
            </span>
            <span className="teacher-row-stats-label"> this wk</span>
          </div>

          {/* Status indicator + chevron */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, justifyContent: 'flex-end', marginLeft: 'auto' }}>
            <StatusDot status={isInactive ? 'inactive' : t.status} />
            <ChevronRight size={14} color="#38384E" />
          </div>
        </div>
      </div>
    </div>
  )
}
