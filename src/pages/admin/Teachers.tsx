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
        background: 'rgba(255,255,255,0.03)',
        border: '1px solid rgba(255,255,255,0.06)',
        borderRadius: 10, padding: '16px 18px',
        display: 'flex', flexDirection: 'column', gap: 4,
        cursor: onClick ? 'pointer' : 'default',
        transition: 'border-color 0.15s',
      }}
      onMouseEnter={(e) => onClick && (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.14)')}
      onMouseLeave={(e) => onClick && (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)')}
    >
      <span style={{ fontSize: 28, fontWeight: 900, color: color ?? '#E8E8F4', lineHeight: 1 }}>
        {value}
      </span>
      <span style={{ fontSize: 12, fontWeight: 700, color: '#8080A8' }}>{label}</span>
      {sub && <span style={{ fontSize: 11, color: '#52526A' }}>{sub}</span>}
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
                className="btn-outline"
                onClick={() => goToList()}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  width: '100%', justifyContent: 'center', padding: '14px 20px',
                  fontSize: 13, fontWeight: 700,
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

          <div style={{ display: 'flex', gap: 3, background: 'rgba(255,255,255,0.04)', borderRadius: 8, padding: 3 }}>
            <button
              onClick={() => setLocationFilter('')}
              style={{
                padding: '5px 12px', borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: 'pointer',
                background: !locationFilter ? 'rgba(212,34,106,0.12)' : 'transparent',
                color: !locationFilter ? '#E8488A' : '#8080A8',
                border: !locationFilter ? '1px solid rgba(212,34,106,0.2)' : '1px solid transparent',
              }}
            >
              All
            </button>
            {locations?.filter((l: any) => l.is_active).map((loc: any) => {
              const locName = loc.name.replace(' Music Lessons', '')
              const isActive = locationFilter === locName
              const locColor = loc.color ?? '#D4226A'
              const count = currentBase.filter((t) =>
                t.location_names.some((n) => n.toLowerCase() === locName.toLowerCase()),
              ).length
              return (
                <button
                  key={loc.id}
                  onClick={() => setLocationFilter(isActive ? '' : locName)}
                  style={{
                    padding: '5px 12px', borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: 'pointer',
                    background: isActive ? `${locColor}20` : 'transparent',
                    color: isActive ? locColor : '#8080A8',
                    border: isActive ? `1px solid ${locColor}40` : '1px solid transparent',
                  }}
                >
                  {locName} <span style={{ opacity: 0.6, marginLeft: 2 }}>{count}</span>
                </button>
              )
            })}
          </div>
        </div>

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

        {/* Teacher table */}
        {isLoading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {Array.from({ length: 12 }).map((_, i) => (
              <div key={i} style={{
                height: 44, background: 'rgba(255,255,255,0.02)',
                borderRadius: 6, marginBottom: 1,
              }} />
            ))}
          </div>
        ) : error ? (
          <div className="form-error">Failed to load: {(error as Error).message}</div>
        ) : displayList.length === 0 ? (
          <div className="empty-state">No {teacherTab} teachers found.</div>
        ) : (
          <>
            {/* Table header */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 120px 140px 70px 70px 30px',
                gap: 8, padding: '8px 14px',
                fontSize: 10, fontWeight: 700, color: '#52526A',
                textTransform: 'uppercase', letterSpacing: 0.5,
                borderBottom: '1px solid rgba(255,255,255,0.06)',
                marginBottom: 2,
              }}
            >
              <span>Name</span>
              <span>Instruments</span>
              <span>Location</span>
              <span style={{ textAlign: 'right' }}>Students</span>
              <span style={{ textAlign: 'right' }}>This Wk</span>
              <span />
            </div>

            {/* Table rows — progressive */}
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

/* ── Single table row ────────────────────────────────────── */

function TeacherRow({ t, onClick }: { t: TeacherOverview; onClick: () => void }) {
  const isInactive = !t.is_active

  return (
    <div
      onClick={onClick}
      style={{
        display: 'grid',
        gridTemplateColumns: '1fr 120px 140px 70px 70px 30px',
        gap: 8, padding: '10px 14px',
        alignItems: 'center', cursor: 'pointer',
        borderBottom: '1px solid rgba(255,255,255,0.03)',
        transition: 'background 0.1s',
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.03)')}
      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
    >
      {/* Name + role */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
        {t.photo_url ? (
          <img
            src={t.photo_url}
            alt=""
            style={{
              width: 30, height: 30, borderRadius: 8,
              objectFit: 'cover', flexShrink: 0,
              border: '1px solid rgba(255,255,255,0.08)',
              opacity: isInactive ? 0.45 : 1,
            }}
          />
        ) : (
          <div style={{
            width: 30, height: 30, borderRadius: 8, flexShrink: 0,
            background: isInactive ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.06)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 12, fontWeight: 800,
            color: isInactive ? '#4A4A6A' : '#8080A8',
          }}>
            {(t.first_name[0] ?? '').toUpperCase()}{(t.last_name[0] ?? '').toUpperCase()}
          </div>
        )}
        <div style={{ minWidth: 0 }}>
          <div style={{
            fontSize: 13, fontWeight: 800, lineHeight: 1.2,
            color: isInactive ? '#6060A8' : '#E8E8F4',
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>
            {t.last_name}, {t.first_name}
            {t.is_sub_available && (
              <span style={{
                marginLeft: 6, fontSize: 9, padding: '1px 5px', borderRadius: 4,
                background: 'rgba(123,44,191,0.15)', color: '#A78BFA',
                border: '1px solid rgba(123,44,191,0.25)', verticalAlign: 'middle',
              }}>SUB</span>
            )}
          </div>
          <div style={{ fontSize: 11, color: isInactive ? '#4A4A6A' : '#52526A' }}>
            {t.teacher_role ? t.teacher_role.charAt(0).toUpperCase() + t.teacher_role.slice(1) : 'Teacher'}
          </div>
        </div>
      </div>

      {/* Instruments — compact inline */}
      <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap', minWidth: 0 }}>
        {t.instruments.slice(0, 3).map((inst, i) => (
          <span key={i} style={{
            fontSize: 10, padding: '1px 6px', borderRadius: 3, fontWeight: 700,
            background: isInactive ? 'rgba(255,255,255,0.03)' : 'rgba(212,34,106,0.08)',
            color: isInactive ? '#4A4A6A' : '#E8488A',
          }}>
            {inst.charAt(0).toUpperCase() + inst.slice(1)}
          </span>
        ))}
        {t.instruments.length > 3 && (
          <span style={{ fontSize: 10, color: '#52526A' }}>+{t.instruments.length - 3}</span>
        )}
      </div>

      {/* Locations — colored dots + short name */}
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', minWidth: 0 }}>
        {t.location_names.map((name, i) => (
          <span key={i} style={{
            fontSize: 10, padding: '1px 6px', borderRadius: 3, fontWeight: 700,
            background: isInactive ? '#2A2A42' : `${t.location_colors[i] ?? '#D4226A'}20`,
            color: isInactive ? '#4A4A6A' : (t.location_colors[i] ?? '#D4226A'),
          }}>
            {name}
          </span>
        ))}
      </div>

      {/* Student count */}
      <div style={{ textAlign: 'right' }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: isInactive ? '#4A4A6A' : '#D0D0EC' }}>
          {t.student_count}
        </span>
      </div>

      {/* Blocks this week */}
      <div style={{ textAlign: 'right' }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: isInactive ? '#4A4A6A' : '#D0D0EC' }}>
          {t.blocks_this_week}
        </span>
      </div>

      {/* Status + arrow */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'flex-end' }}>
        <StatusDot status={isInactive ? 'inactive' : t.status} />
      </div>
    </div>
  )
}
