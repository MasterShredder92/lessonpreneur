import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import MusicLoader from '../../components/shared/MusicLoader'
import { useAuthContext } from '../../app/AuthContext'
import { usePermissions } from '../../hooks/usePermissions'
import { useTeachers } from '../../hooks/useTeachers'
import { useLocations } from '../../hooks/useLocations'
import { useTeachersMonthlyTally } from '../../hooks/usePayTally'
import { Guitar, Piano, Mic, Drum, Music, Music2, MapPin, Users, DollarSign, LayoutGrid } from 'lucide-react'
import TeacherFormModal from '../../components/teachers/TeacherFormModal'
import CsvImportFlow from '../../components/shared/CsvImportFlow'
import { useImportTeachers, TEACHER_TEMPLATE } from '../../hooks/useImport'
import TeacherSpreadsheet from '../../components/teachers/TeacherSpreadsheet'
import W9ExportModal from '../../components/teachers/W9ExportModal'
import { useScrollRestore } from '../../hooks/useScrollRestore'
import { useUrlFilters } from '../../hooks/useUrlFilters'
import { IssueContextProvider } from '../../contexts/IssueContext'
import ReportIssueButton from '../../components/shared/ReportIssueButton'

const INSTRUMENT_ICON: Record<string, any> = {
  guitar: Guitar, bass: Guitar, ukulele: Guitar, banjo: Guitar,
  piano: Piano, keyboard: Piano,
  drums: Drum, percussion: Drum,
  voice: Mic, vocals: Mic,
  violin: Music2, viola: Music2, cello: Music2, strings: Music2,
  flute: Music, clarinet: Music, saxophone: Music, trumpet: Music, trombone: Music, oboe: Music, brass: Music, woodwinds: Music, mandolin: Guitar,
}

import { CORE_INSTRUMENTS, OTHER_INSTRUMENTS } from '../../lib/constants'

const LOCATION_OPTIONS = ['Omaha', 'Bellevue', 'Elkhorn', 'Gretna']

function InstrumentIcon({ instrument, size = 16 }: { instrument: string; size?: number }) {
  const Icon = INSTRUMENT_ICON[instrument.toLowerCase()] ?? Music
  return <Icon size={size} />
}

export default function Teachers() {
  const { role } = useAuthContext()
  const { data: teachers, isLoading, error } = useTeachers()
  const { data: locations } = useLocations()
  const { data: monthlyTally } = useTeachersMonthlyTally()
  const navigate = useNavigate()
  const { isStudioDirector } = usePermissions()
  const canEdit = (role === 'owner' || role === 'admin') && !isStudioDirector
  const { saveScroll } = useScrollRestore('teachers')

  const [showForm, setShowForm] = useState(false)
  const [showSpreadsheet, setShowSpreadsheet] = useState(false)
  const [showCsvImport, setShowCsvImport] = useState(false)
  const teacherImport = useImportTeachers()
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
  const [showW9Export, setShowW9Export] = useState(false)

  if (isLoading) {
    return (
      <div className="page">
        <div className="page-header"><h1>Teachers</h1></div>
        <div className="loading-screen" style={{ height: 200 }}><MusicLoader /></div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="page">
        <div className="page-header"><h1>Teachers</h1></div>
        <div className="form-error">Failed to load: {(error as Error).message}</div>
      </div>
    )
  }

  const allActive = teachers?.filter((t) => t.is_active) ?? []
  const needsReviewCount = allActive.filter((t: any) => t.ai_context?.instruments_need_review).length
  const baseActive = filterNeedsReview
    ? allActive.filter((t: any) => t.ai_context?.instruments_need_review)
    : allActive
  const inactiveTeachers = teachers?.filter((t) => !t.is_active) ?? []

  // Apply filters
  const applyFilters = (list: any[]) => {
    return list.filter((t: any) => {
      // Location filter
      if (locationFilter) {
        const locs = (t.location_names ?? []).map((n: string) => n.replace(' Music Lessons', '').toLowerCase())
        if (!locs.some((l: string) => l.includes(locationFilter.toLowerCase()))) return false
      }
      // Instrument filter
      if (instrumentFilter) {
        if (!(t.instruments ?? []).some((i: string) => i.toLowerCase() === instrumentFilter.toLowerCase())) return false
      }
      // Search by name
      if (search) {
        const name = `${t.first_name ?? ''} ${t.last_name ?? ''}`.toLowerCase()
        if (!name.includes(search.toLowerCase())) return false
      }
      return true
    })
  }

  const sortAlpha = (list: any[]) => [...list].sort((a, b) => {
    const an = `${a.first_name ?? ''} ${a.last_name ?? ''}`.trim().toLowerCase()
    const bn = `${b.first_name ?? ''} ${b.last_name ?? ''}`.trim().toLowerCase()
    return an.localeCompare(bn)
  })
  const activeTeachers = sortAlpha(applyFilters(baseActive))
  const filteredInactive = sortAlpha(applyFilters(inactiveTeachers))
  const displayList = teacherTab === 'active' ? activeTeachers : filteredInactive

  return (
    <IssueContextProvider page="The Band — Teachers">
    <div className="page">
      <div className="page-header">
        <h1>Teachers</h1>
        <span className="badge-secondary">{allActive.length} active</span>
        {canEdit && (
          <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px' }}>
            {canEdit && <button className="btn-outline" onClick={() => setShowSpreadsheet(true)} style={{ display: 'flex', alignItems: 'center', gap: 5 }}><LayoutGrid size={13} /> Master Editor</button>}
            {role === 'owner' && <button className="btn-outline" onClick={() => setShowW9Export(true)}>Export W-9s</button>}
            <button className="btn-outline" onClick={() => setShowCsvImport(true)}>Import CSV</button>
            <button className="btn-primary" onClick={() => setShowForm(true)}>+ Add Teacher</button>
          </div>
        )}
        <ReportIssueButton />
      </div>

      {needsReviewCount > 0 && (
        <div className="review-banner">
          <div className="review-banner-text">
            <span className="badge-gold">{needsReviewCount}</span>
            <span>teacher{needsReviewCount !== 1 ? 's' : ''} need instrument assignment</span>
          </div>
          <button
            className={filterNeedsReview ? 'btn-primary' : 'btn-outline'}
            onClick={() => setFilterNeedsReview(!filterNeedsReview)}
            style={{ fontSize: '11px', padding: '4px 12px' }}
          >
            {filterNeedsReview ? 'Show All' : 'Show Only'}
          </button>
        </div>
      )}

      {/* Status + Location Tabs */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
        <div className="lead-view-tabs" style={{ marginBottom: 0 }}>
          <button className={`lead-view-tab${teacherTab === 'active' ? ' active' : ''}`} onClick={() => setTeacherTab('active')}>
            Active <span className="tab-count">{allActive.length}</span>
          </button>
          {!isStudioDirector && (
            <button className={`lead-view-tab${teacherTab === 'inactive' ? ' active' : ''}`} onClick={() => setTeacherTab('inactive')}>
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
          >All</button>
          {locations?.filter((l: any) => l.is_active).map((loc: any) => {
            const locName = loc.name.replace(' Music Lessons', '')
            const isActive = locationFilter === locName
            const locColor = (loc as any).color ?? '#D4226A'
            const count = (teacherTab === 'active' ? baseActive : inactiveTeachers).filter((t: any) =>
              (t.location_names ?? []).some((n: string) => n.replace(' Music Lessons', '').toLowerCase() === locName.toLowerCase())
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

      {/* Filters */}
      <div className="schedule-filters" style={{ marginBottom: '16px' }}>
        <div className="filter-group" style={{ flexWrap: 'wrap' }}>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search teachers..."
            className="filter-select"
            style={{ minWidth: 160 }}
          />
          <select value={instrumentFilter} onChange={(e) => setInstrumentFilter(e.target.value)} className="filter-select">
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
        <span className="visibility-count">Showing {displayList.length} teacher{displayList.length !== 1 ? 's' : ''}</span>
      </div>

      {/* Teacher cards */}
      <div className="lead-cards">
        {displayList.map((t: any) => {
          const isInactive = !t.is_active
          const status = t.status ?? (t.is_active ? 'active' : 'inactive')
          const primaryInstrument = (t.instruments ?? [])[0] ?? ''
          const payRate = t.pay_rate_per_half_hour ?? t.rate_per_block ?? null
          const locationNames = (t.location_names ?? []).map((n: string) => n.replace(' Music Lessons', ''))
          // Build multi-color edge from all assigned locations
          const locColors = (t.location_ids ?? []).map((lid: string) => {
            const loc = locations?.find((l: any) => l.id === lid)
            return (loc as any)?.color ?? '#D4226A'
          }).filter(Boolean)
          const edgeColors = locColors.length > 0 ? locColors : ['#D4226A']
          const edgeBg = edgeColors.length === 1
            ? edgeColors[0]
            : `linear-gradient(180deg, ${edgeColors.map((c: string, i: number) => `${c} ${(i / edgeColors.length) * 100}%, ${c} ${((i + 1) / edgeColors.length) * 100}%`).join(', ')})`
          const edgeShadow = edgeColors.length === 1 ? `0 0 12px ${edgeColors[0]}80` : `0 0 10px ${edgeColors[0]}60`
          const instruments = t.instruments ?? []
          const w9Done = t.w9_status === 'complete' || t.w9_status === 'completed' || t.w9_status === 'signed' || !!t.w9_completed_at
          const contractDone = t.contract_status === 'complete' || t.contract_status === 'completed' || t.contract_status === 'signed' || !!t.contract_signed_at

          return (
            <div
              key={t.id}
              className={`lead-card${isInactive ? ' lead-card-stale' : ''}`}
              onClick={() => { saveScroll(); navigate(`/admin/teachers/${t.id}`) }}
            >
              {/* Edge accent */}
              <div className="lead-card-edge" style={{
                background: isInactive ? '#606088' : edgeBg,
                boxShadow: isInactive ? 'none' : edgeShadow,
              }} />

              {/* Content row */}
              <div className="student-card-content">
                {/* Photo or Instrument Icon */}
                <div className="student-card-zone-icon">
                  {t.photo_url ? (
                    <img src={t.photo_url} alt="" style={{
                      width: 38, height: 38, borderRadius: 10, objectFit: 'cover',
                      border: '1px solid rgba(255,255,255,0.1)',
                      opacity: isInactive ? 0.5 : 1,
                    }} />
                  ) : (
                    <div style={{
                      width: 38, height: 38, borderRadius: 10,
                      background: isInactive ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.07)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: isInactive ? '#606088' : '#C0C0E0',
                    }}>
                      {primaryInstrument ? <InstrumentIcon instrument={primaryInstrument} size={22} /> : <Music size={22} />}
                    </div>
                  )}
                </div>

                <div className="student-card-divider" />

                {/* Name + Role */}
                <div className="student-card-zone student-card-zone-name">
                  <span className="lead-card-student">
                    {t.first_name} {t.last_name}
                    {(t.sub_available || t.is_sub_available) && (
                      <span style={{ marginLeft: 6, fontSize: 9, padding: '1px 6px', borderRadius: 4, background: 'rgba(123,44,191,0.15)', color: '#A78BFA', border: '1px solid rgba(123,44,191,0.25)' }}>SUB</span>
                    )}
                  </span>
                  <span style={{ fontSize: 13, color: '#A0A0C8', marginTop: 2 }}>
                    {t.teacher_role ? t.teacher_role.charAt(0).toUpperCase() + t.teacher_role.slice(1) : 'Teacher'}
                  </span>
                </div>

                <div className="student-card-divider" />

                {/* Contact */}
                <div className="student-card-zone student-card-col" style={{ gap: 2, minWidth: 130 }}>
                  <span style={{ fontSize: 10, fontWeight: 700, color: '#8080A8', textTransform: 'uppercase' as const, letterSpacing: '0.08em' }}>Contact</span>
                  <span style={{ fontSize: 12, color: '#C0C0E0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 160, cursor: 'pointer' }}
                    onClick={(e) => { e.stopPropagation(); if (t.email) { navigator.clipboard.writeText(t.email); import('../../components/shared/Toast').then(m => m.toast('Copied', 'success')) } }}
                    title={t.email ? 'Click to copy' : undefined}>
                    {t.email ?? '—'}
                  </span>
                  <span style={{ fontSize: 11, color: '#A0A0C8', cursor: 'pointer' }}
                    onClick={(e) => { e.stopPropagation(); if (t.phone) { navigator.clipboard.writeText(t.phone); import('../../components/shared/Toast').then(m => m.toast('Copied', 'success')) } }}
                    title={t.phone ? 'Click to copy' : undefined}>
                    {t.phone ?? '—'}
                  </span>
                </div>

                <div className="student-card-divider" />

                {/* Instruments */}
                <div className="student-card-zone student-card-col" style={{ gap: 2 }}>
                  <span style={{ fontSize: 10, fontWeight: 700, color: '#8080A8', textTransform: 'uppercase' as const, letterSpacing: '0.08em' }}>Instruments</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#E0E0F4' }}>
                    {instruments.length > 0
                      ? instruments.slice(0, 2).map((i: string) => i.charAt(0).toUpperCase() + i.slice(1)).join(', ') + (instruments.length > 2 ? '...' : '')
                      : 'TBD'}
                  </span>
                </div>

                <div className="student-card-divider" />

                {/* Locations */}
                <div className="student-card-zone student-card-col" style={{ gap: 2 }}>
                  <span style={{ fontSize: 10, fontWeight: 700, color: '#8080A8', textTransform: 'uppercase' as const, letterSpacing: '0.08em' }}>Locations</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#E0E0F4' }}>
                    {locationNames.length > 0 ? (
                      <span style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
                        {locationNames.map((name: string, li: number) => {
                          const lid = (t.location_ids ?? [])[li]
                          const loc = locations?.find((l: any) => l.id === lid)
                          const c = (loc as any)?.color ?? '#D4226A'
                          return <span key={li} style={{ fontSize: 10, padding: '3px 0', borderRadius: 6, background: c, color: '#fff', fontWeight: 700, minWidth: 65, textAlign: 'center', display: 'inline-block' }}>{name}</span>
                        })}
                      </span>
                    ) : '—'}
                  </span>
                </div>

                <div className="student-card-divider" />

                {/* Students */}
                <div className="student-card-zone student-card-col" style={{ gap: 2 }}>
                  <span style={{ fontSize: 10, fontWeight: 700, color: '#8080A8', textTransform: 'uppercase' as const, letterSpacing: '0.08em' }}>Students</span>
                  <span style={{ fontSize: 14, fontWeight: 700, color: '#E0E0F4' }}>{t.student_count ?? 0}</span>
                </div>

                <div className="student-card-divider" />

                {/* Pay Rate */}
                <div className="student-card-zone student-card-col" style={{ gap: 2 }}>
                  <span style={{ fontSize: 10, fontWeight: 700, color: '#8080A8', textTransform: 'uppercase' as const, letterSpacing: '0.08em' }}>Rate</span>
                  <span style={{ fontSize: 14, fontWeight: 700, color: '#E0E0F4' }}>
                    {payRate != null ? `$${Number(payRate).toFixed(0)}/30 min` : '—'}
                  </span>
                </div>

                <div className="student-card-divider" />

                {/* Status */}
                <div className="student-card-zone student-card-col" style={{ gap: 2 }}>
                  <span style={{ fontSize: 10, fontWeight: 700, color: '#8080A8', textTransform: 'uppercase' as const, letterSpacing: '0.08em' }}>Status</span>
                  <span style={{
                    fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 6,
                    ...(status === 'active'
                      ? { background: 'rgba(34,197,94,0.12)', color: '#22C55E', border: '1px solid rgba(34,197,94,0.25)' }
                      : status === 'at_capacity' || status === 'at capacity'
                        ? { background: 'rgba(255,184,0,0.12)', color: '#FFB800', border: '1px solid rgba(255,184,0,0.25)' }
                        : { background: 'rgba(239,68,68,0.12)', color: '#EF4444', border: '1px solid rgba(239,68,68,0.25)' }),
                  }}>
                    {status === 'at_capacity' ? 'At Capacity' : status.charAt(0).toUpperCase() + status.slice(1)}
                  </span>
                  <div style={{ display: 'flex', gap: 3, marginTop: 3 }}>
                    <span style={{
                      fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 4,
                      ...(w9Done
                        ? { background: 'rgba(34,197,94,0.1)', color: '#22C55E', border: '1px solid rgba(34,197,94,0.2)' }
                        : { background: 'rgba(255,184,0,0.1)', color: '#FFB800', border: '1px solid rgba(255,184,0,0.2)' }),
                    }}>{w9Done ? 'W-9 \u2713' : 'W-9'}</span>
                    <span style={{
                      fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 4,
                      ...(contractDone
                        ? { background: 'rgba(34,197,94,0.1)', color: '#22C55E', border: '1px solid rgba(34,197,94,0.2)' }
                        : { background: 'rgba(255,184,0,0.1)', color: '#FFB800', border: '1px solid rgba(255,184,0,0.2)' }),
                    }}>{contractDone ? 'Contract \u2713' : 'Contract'}</span>
                  </div>
                </div>
              </div>
            </div>
          )
        })}
        {displayList.length === 0 && (
          <div className="empty-state">No {teacherTab} teachers found.</div>
        )}
      </div>

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
          onClose={() => { setShowCsvImport(false); teacherImport.reset() }}
        />
      )}
    </div>
    </IssueContextProvider>
  )
}
