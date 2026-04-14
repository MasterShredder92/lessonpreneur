import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import TeacherDetail from './TeacherDetail'
import MusicLoader from '../../components/shared/MusicLoader'
import { useAuthContext } from '../../app/AuthContext'
import { usePermissions } from '../../hooks/usePermissions'
import { useTeacherOverview } from '../../hooks/useTeacherOverview'
import type { TeacherOverview } from '../../hooks/useTeacherOverview'
import { useLocations } from '../../hooks/useLocations'
import { Guitar, Piano, Mic, Drum, Music, Music2, Users, Calendar, LayoutGrid } from 'lucide-react'
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

const INSTRUMENT_ICON: Record<string, any> = {
  guitar: Guitar, bass: Guitar, ukulele: Guitar, banjo: Guitar, mandolin: Guitar,
  piano: Piano, keyboard: Piano,
  drums: Drum, percussion: Drum,
  voice: Mic, vocals: Mic,
  violin: Music2, viola: Music2, cello: Music2, strings: Music2,
  flute: Music, clarinet: Music, saxophone: Music, trumpet: Music,
  trombone: Music, oboe: Music, brass: Music, woodwinds: Music,
}

function InstrumentIcon({ instrument, size = 20 }: { instrument: string; size?: number }) {
  const Icon = INSTRUMENT_ICON[instrument.toLowerCase()] ?? Music
  return <Icon size={size} />
}

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

function TeacherCard({
  t,
  onClick,
}: {
  t: TeacherOverview
  onClick: () => void
}) {
  const isInactive = !t.is_active
  const status = t.status
  const primaryInstrument = t.instruments[0] ?? ''

  // Build multi-color edge gradient from location brand colors
  const edgeColors = t.location_colors.length > 0 ? t.location_colors : ['#D4226A']
  const edgeBg = edgeColors.length === 1
    ? edgeColors[0]
    : `linear-gradient(180deg, ${edgeColors.map((c, i) =>
        `${c} ${(i / edgeColors.length) * 100}%, ${c} ${((i + 1) / edgeColors.length) * 100}%`
      ).join(', ')})`
  const edgeShadow = edgeColors.length === 1
    ? `0 0 14px ${edgeColors[0]}70`
    : `0 0 10px ${edgeColors[0]}60`

  return (
    <div
      className={`lead-card${isInactive ? ' lead-card-stale' : ''}`}
      onClick={onClick}
      style={{ cursor: 'pointer', padding: 0, overflow: 'hidden', position: 'relative', display: 'flex' }}
    >
      {/* Colored left edge */}
      <div
        className="lead-card-edge"
        style={{
          background: isInactive ? '#3A3A5A' : edgeBg,
          boxShadow: isInactive ? 'none' : edgeShadow,
          flexShrink: 0,
        }}
      />

      {/* Card body */}
      <div style={{ flex: 1, padding: '14px 14px 12px 12px', display: 'flex', flexDirection: 'column', gap: 0, minWidth: 0 }}>

        {/* Status dot — top right */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 10, gap: 8 }}>
          {/* Photo or instrument icon */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 0 }}>
            {t.photo_url ? (
              <img
                src={t.photo_url}
                alt=""
                style={{
                  width: 40, height: 40, borderRadius: 10,
                  objectFit: 'cover', flexShrink: 0,
                  border: '1px solid rgba(255,255,255,0.08)',
                  opacity: isInactive ? 0.45 : 1,
                }}
              />
            ) : (
              <div style={{
                width: 40, height: 40, borderRadius: 10, flexShrink: 0,
                background: isInactive ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.07)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: isInactive ? '#4A4A6A' : '#C0C0E0',
              }}>
                {primaryInstrument
                  ? <InstrumentIcon instrument={primaryInstrument} size={20} />
                  : <Music size={20} />}
              </div>
            )}

            {/* Name + role */}
            <div style={{ minWidth: 0 }}>
              <div style={{
                fontSize: 13, fontWeight: 800, lineHeight: 1.2,
                color: isInactive ? '#6060A8' : '#E8E8F4',
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              }}>
                {t.first_name} {t.last_name}
                {t.is_sub_available && (
                  <span style={{
                    marginLeft: 6, fontSize: 9, padding: '1px 5px', borderRadius: 4,
                    background: 'rgba(123,44,191,0.15)', color: '#A78BFA',
                    border: '1px solid rgba(123,44,191,0.25)', verticalAlign: 'middle',
                  }}>SUB</span>
                )}
              </div>
              <div style={{ fontSize: 11, color: isInactive ? '#4A4A6A' : '#8080A8', marginTop: 1 }}>
                {t.teacher_role
                  ? t.teacher_role.charAt(0).toUpperCase() + t.teacher_role.slice(1)
                  : 'Teacher'}
              </div>
            </div>
          </div>

          {/* Status dot */}
          <div style={{ paddingTop: 4, flexShrink: 0 }}>
            <StatusDot status={isInactive ? 'inactive' : status} />
          </div>
        </div>

        {/* Instrument tags */}
        {t.instruments.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 7 }}>
            {t.instruments.slice(0, 4).map((inst, i) => (
              <span
                key={i}
                style={{
                  fontSize: 10, padding: '2px 7px', borderRadius: 4, fontWeight: 700,
                  background: isInactive ? 'rgba(255,255,255,0.03)' : 'rgba(212,34,106,0.1)',
                  color: isInactive ? '#4A4A6A' : '#E8488A',
                  border: `1px solid ${isInactive ? 'rgba(255,255,255,0.05)' : 'rgba(212,34,106,0.2)'}`,
                }}
              >
                {inst.charAt(0).toUpperCase() + inst.slice(1)}
              </span>
            ))}
            {t.instruments.length > 4 && (
              <span style={{ fontSize: 10, color: '#52526A', padding: '2px 4px' }}>
                +{t.instruments.length - 4}
              </span>
            )}
          </div>
        )}

        {/* Location badges */}
        {t.location_names.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 10 }}>
            {t.location_names.map((name, i) => (
              <span
                key={i}
                style={{
                  fontSize: 10, padding: '2px 8px', borderRadius: 4, fontWeight: 700,
                  background: isInactive ? '#2A2A42' : (t.location_colors[i] ?? '#D4226A'),
                  color: isInactive ? '#4A4A6A' : '#fff',
                }}
              >
                {name}
              </span>
            ))}
          </div>
        )}

        {/* Stats row */}
        <div style={{
          display: 'flex', gap: 14, marginTop: 'auto',
          borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: 9,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <Users size={11} color={isInactive ? '#3A3A5A' : '#8080A8'} />
            <span style={{ fontSize: 12, fontWeight: 700, color: isInactive ? '#4A4A6A' : '#D0D0EC' }}>
              {t.student_count}
            </span>
            <span style={{ fontSize: 10, color: '#52526A' }}>students</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <Calendar size={11} color={isInactive ? '#3A3A5A' : '#8080A8'} />
            <span style={{ fontSize: 12, fontWeight: 700, color: isInactive ? '#4A4A6A' : '#D0D0EC' }}>
              {t.blocks_this_week}
            </span>
            <span style={{ fontSize: 10, color: '#52526A' }}>this wk</span>
          </div>
        </div>
      </div>
    </div>
  )
}

// Skeleton card shown during initial load
function TeacherCardSkeleton() {
  return (
    <div className="lead-card" style={{ padding: 0, overflow: 'hidden', display: 'flex', pointerEvents: 'none' }}>
      <div style={{ width: 4, background: 'rgba(255,255,255,0.05)', flexShrink: 0 }} />
      <div style={{ flex: 1, padding: '14px 14px 12px 12px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', gap: 9 }}>
          <div style={{ width: 40, height: 40, borderRadius: 10, background: 'rgba(255,255,255,0.05)' }} />
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ height: 13, width: '60%', borderRadius: 4, background: 'rgba(255,255,255,0.06)' }} />
            <div style={{ height: 11, width: '35%', borderRadius: 4, background: 'rgba(255,255,255,0.04)' }} />
          </div>
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          <div style={{ height: 20, width: 54, borderRadius: 4, background: 'rgba(255,255,255,0.04)' }} />
          <div style={{ height: 20, width: 44, borderRadius: 4, background: 'rgba(255,255,255,0.04)' }} />
        </div>
        <div style={{ height: 20, width: 70, borderRadius: 4, background: 'rgba(255,255,255,0.04)' }} />
        <div style={{ display: 'flex', gap: 14, borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: 9 }}>
          <div style={{ height: 12, width: 60, borderRadius: 4, background: 'rgba(255,255,255,0.04)' }} />
          <div style={{ height: 12, width: 60, borderRadius: 4, background: 'rgba(255,255,255,0.04)' }} />
        </div>
      </div>
    </div>
  )
}

export default function Teachers() {
  const { role } = useAuthContext()
  const { data: teachers, isLoading, error } = useTeacherOverview()
  const { data: locations } = useLocations()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const detailTeacherId = searchParams.get('id')
  const { isStudioDirector, isAtLeast } = usePermissions()
  const canEdit = isAtLeast('studio_director')
  const { saveScroll } = useScrollRestore('teachers')

  const [showForm, setShowForm] = useState(false)
  const [showSpreadsheet, setShowSpreadsheet] = useState(false)
  const [showCsvImport, setShowCsvImport] = useState(false)
  const teacherImport = useImportTeachers()
  const [showW9Export, setShowW9Export] = useState(false)

  // URL-persisted filters
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

  // Render detail view inline when ?id= is present
  if (detailTeacherId) {
    return (
      <TeacherDetail
        propId={detailTeacherId}
        onBack={() => navigate('/admin/teachers')}
      />
    )
  }

  // Split active / inactive
  const allActive = teachers?.filter((t) => t.is_active) ?? []
  const inactiveTeachers = teachers?.filter((t) => !t.is_active) ?? []
  const needsReviewCount = allActive.filter((t) => t.instruments_need_review).length
  const baseActive = filterNeedsReview
    ? allActive.filter((t) => t.instruments_need_review)
    : allActive

  // Apply filters
  const applyFilters = (list: TeacherOverview[]): TeacherOverview[] =>
    list.filter((t) => {
      if (locationFilter) {
        if (!t.location_names.some((n) => n.toLowerCase().includes(locationFilter.toLowerCase()))) return false
      }
      if (instrumentFilter) {
        if (!t.instruments.some((i) => i.toLowerCase() === instrumentFilter.toLowerCase())) return false
      }
      if (search) {
        const name = `${t.first_name} ${t.last_name}`.toLowerCase()
        if (!name.includes(search.toLowerCase())) return false
      }
      return true
    })

  // Sort alphabetical by last name (per global rule)
  const sortAlpha = (list: TeacherOverview[]): TeacherOverview[] =>
    [...list].sort((a, b) => {
      const an = `${a.last_name} ${a.first_name}`.trim().toLowerCase()
      const bn = `${b.last_name} ${b.first_name}`.trim().toLowerCase()
      return an.localeCompare(bn)
    })

  const displayList = sortAlpha(applyFilters(teacherTab === 'active' ? baseActive : inactiveTeachers))
  const currentBase = teacherTab === 'active' ? baseActive : inactiveTeachers

  return (
    <IssueContextProvider page="The Band — Teachers">
      <div className="page">
        {/* Page header */}
        <div className="page-header">
          <h1>Teachers</h1>
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
              <span>
                teacher{needsReviewCount !== 1 ? 's' : ''} need instrument assignment
              </span>
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

          {/* Location filter pills */}
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
              placeholder="Search teachers..."
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
                <option key={i} value={i}>
                  {i.charAt(0).toUpperCase() + i.slice(1)}
                </option>
              ))}
              <option disabled>────────────</option>
              {OTHER_INSTRUMENTS.map((i) => (
                <option key={i} value={i}>
                  {i.charAt(0).toUpperCase() + i.slice(1)}
                </option>
              ))}
            </select>
          </div>
          <span className="visibility-count">
            Showing {isLoading ? '—' : displayList.length} teacher{displayList.length !== 1 ? 's' : ''}
          </span>
        </div>

        {/* Teacher grid */}
        {isLoading ? (
          /* Skeleton grid while loading */
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(255px, 1fr))',
              gap: 12,
            }}
          >
            {Array.from({ length: 12 }).map((_, i) => (
              <TeacherCardSkeleton key={i} />
            ))}
          </div>
        ) : error ? (
          <div className="form-error">Failed to load: {(error as Error).message}</div>
        ) : displayList.length === 0 ? (
          <div className="empty-state">No {teacherTab} teachers found.</div>
        ) : (
          <div
            data-tour-id="teachers-list"
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(255px, 1fr))',
              gap: 12,
            }}
          >
            {displayList.map((t, idx) => (
              <TeacherCard
                key={t.id}
                t={t}
                onClick={() => {
                  saveScroll()
                  navigate(`/admin/teachers?id=${t.id}`)
                }}
              />
            ))}
          </div>
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
