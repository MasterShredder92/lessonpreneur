import { useState, useEffect, useMemo, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import MusicLoader from '../../components/shared/MusicLoader'
import { useAuthContext } from '../../app/AuthContext'
import { usePermissions } from '../../hooks/usePermissions'
import { useStudents, useCreateStudent, useUpdateStudent, useFamilies, type StudentRow } from '../../hooks/useStudents'
import { useLeads } from '../../hooks/useLeads'
import { supabase } from '../../lib/supabase'
import { useLocations } from '../../hooks/useLocations'
import { useTeachers } from '../../hooks/useTeachers'
import { Music, Music2, MapPin, Star, Guitar, Piano, Mic, Drum, Phone, Mail } from 'lucide-react'
import { toast } from '../../components/shared/Toast'
import RetentionCaptureModal from '../../components/students/RetentionCaptureModal'
import CsvImportFlow from '../../components/shared/CsvImportFlow'
import { useImportStudents, STUDENT_TEMPLATE } from '../../hooks/useImport'
import { DEFAULT_RATE_PER_SESSION } from '../../lib/constants'
import { useStudentInstruments, useSaveStudentInstruments } from '../../hooks/useStudentInstruments'
import { getInstrumentEmoji, instrumentWithEmojiTitle } from '../../utils/instrumentEmoji'
import AddStudentModal from '../../components/students/AddStudentModal'
import DataGrid from '../../components/shared/DataGrid'
import { useChurnRiskScores, RISK_TIERS } from '../../hooks/useChurnRisk'
import { useScrollRestore } from '../../hooks/useScrollRestore'
import { IssueContextProvider } from '../../contexts/IssueContext'
import ReportIssueButton from '../../components/shared/ReportIssueButton'
import StudentsPageGuide from '../../components/admin/StudentsPageGuide'

const INSTRUMENT_ICON: Record<string, any> = {
  guitar: Guitar, bass: Guitar, ukulele: Guitar, banjo: Guitar,
  piano: Piano, keyboard: Piano,
  drums: Drum,
  voice: Mic, vocals: Mic,
  violin: Music2, viola: Music2, cello: Music2,
  flute: Music, clarinet: Music, saxophone: Music, trumpet: Music, trombone: Music, oboe: Music,
}

function InstrumentIcon({ instrument, size = 16 }: { instrument: string; size?: number }) {
  const Icon = INSTRUMENT_ICON[instrument.toLowerCase()] ?? Music
  return <Icon size={size} />
}

const INSTRUMENTS = ['piano','guitar','vocals','drums','banjo','bass','brass','cello','clarinet','flute','mandolin','oboe','percussion','saxophone','strings','trombone','trumpet','ukulele','viola','violin','voice','woodwinds']
const EXIT_REASONS = ['Schedule Conflict', 'Moving Away', 'Financial', 'Lost Interest', 'Switching Schools', 'Taking a Break', 'Other']

type StatusTab = 'active' | 'former' | 'all'
type SortOption = 'az_first' | 'za_first' | 'az_last' | 'za_last' | 'newest' | 'oldest'

function isIncomplete(s: StudentRow): boolean {
  return !s.instrument || !s.teacher_id || !s.blocks_per_week || !s.rate_per_session || !s.location_id
}

export default function Students() {
  const { role, tenantId } = useAuthContext()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { data: locations } = useLocations()
  const { data: teacherList } = useTeachers()
  const { data: familyList } = useFamilies()
  const canEdit = role === 'owner' || role === 'admin'
  const canCreate = role === 'owner' || role === 'admin' || role === 'company_director' || role === 'studio_director'
  const canExport = role === 'owner' || role === 'admin' || role === 'company_director'
  const { canDo, isStudioDirector, locationIds: scopedLocationIds } = usePermissions()
  const lockedLocationId = isStudioDirector ? scopedLocationIds[0] ?? '' : null
  const canViewContact = canDo('students.view_contact')
  const canViewBilling = canDo('students.view_billing')
  const { saveScroll } = useScrollRestore('students')

  // ── Filter state — persisted in URL so browser back restores exact view ──
  const activeTab = (searchParams.get('tab') as StatusTab) || 'active'
  const locationFilter = searchParams.get('location') ?? ''
  const teacherFilter = searchParams.get('teacher') ?? ''
  const instrumentFilter = searchParams.get('instrument') ?? ''
  const search = searchParams.get('q') ?? ''
  const sortBy = (searchParams.get('sort') as SortOption) || 'az_first'
  const showIncomplete = searchParams.get('incomplete') === '1'

  const updateParam = (key: string, value: string) => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev)
      if (value === '' || value === undefined || value === null) next.delete(key)
      else next.set(key, value)
      return next
    }, { replace: true })
  }
  const setActiveTab = (v: StatusTab) => updateParam('tab', v === 'active' ? '' : v)
  const setLocationFilter = (v: string) => updateParam('location', v)
  const setTeacherFilter = (v: string) => updateParam('teacher', v)
  const setInstrumentFilter = (v: string) => updateParam('instrument', v)
  const setSearch = (v: string) => updateParam('q', v)
  const setSortBy = (v: SortOption) => updateParam('sort', v === 'az_first' ? '' : v)
  const setShowIncomplete = (v: boolean) => updateParam('incomplete', v ? '1' : '')
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [editStudent, setEditStudent] = useState<StudentRow | null>(null)
  const [exitStudent, setExitStudent] = useState<StudentRow | null>(null)
  const [retentionTarget, setRetentionTarget] = useState<{ student: StudentRow; newStatus: 'paused' | 'inactive'; pendingData: any } | null>(null)
  const [showExport, setShowExport] = useState(false)
  const [exportSelections, setExportSelections] = useState<Record<string, boolean>>({ active: true, former: false, leads: false })
  const [showImport, setShowImport] = useState(false)
  const studentImport = useImportStudents()
  const [starInsight, setStarInsight] = useState<string | null>(null)
  const [starLoading, setStarLoading] = useState(false)
  const [viewCompact, setViewCompact] = useState(() => localStorage.getItem('student-view') === 'compact')
  const [showMasterSheet, setShowMasterSheet] = useState(false)
  const [showMoreMenu, setShowMoreMenu] = useState(false)
  const [showAddStudent, setShowAddStudent] = useState(false)

  // Fetch all students for counts, then filter client-side for tab
  const statusFilter = isStudioDirector ? 'active' : (activeTab === 'former' ? 'former' : 'active')
  const locId = lockedLocationId || locationFilter || undefined
  const teachId = teacherFilter || undefined
  const filters = useMemo(() => ({ status: statusFilter, locationId: locId, teacherId: teachId }), [statusFilter, locId, teachId])
  const { data: allStudents, isLoading, isFetching } = useStudents(filters)

  // Also get all for counts
  const countsFilters = useMemo(() => ({}), [])
  const { data: allForCounts } = useStudents(countsFilters)

  const createStudent = useCreateStudent()
  const updateStudent = useUpdateStudent()
  const { data: allLeads } = useLeads({})
  const { data: riskScores } = useChurnRiskScores()
  const riskMap = new Map((riskScores ?? []).map(r => [r.studentId, r]))

  const activeCt = allForCounts?.filter((s) => s.status === 'active').length ?? 0
  const formerCt = allForCounts?.filter((s) => s.status === 'former' || s.status === 'inactive').length ?? 0
  const allCt = allForCounts?.length ?? 0

  // Apply search + instrument + incomplete filter, then sort
  const filtered = useMemo(() => {
    let list = (allStudents ?? []).filter((s) => {
      if (instrumentFilter && s.instrument !== instrumentFilter) return false
      if (showIncomplete && !isIncomplete(s)) return false
      if (!search) return true
      const name = `${s.first_name} ${s.last_name}`.toLowerCase()
      const fam = (s.family_name ?? '').toLowerCase()
      return name.includes(search.toLowerCase()) || fam.includes(search.toLowerCase())
    })
    list = [...list].sort((a, b) => {
      switch (sortBy) {
        case 'az_first': return a.first_name.localeCompare(b.first_name)
        case 'za_first': return b.first_name.localeCompare(a.first_name)
        case 'az_last': return a.last_name.localeCompare(b.last_name)
        case 'za_last': return b.last_name.localeCompare(a.last_name)
        case 'newest': return (b.start_date ?? '').localeCompare(a.start_date ?? '')
        case 'oldest': return (a.start_date ?? '').localeCompare(b.start_date ?? '')
        default: return 0
      }
    })
    return list
  }, [allStudents, instrumentFilter, showIncomplete, search, sortBy])

  const incompleteCount = useMemo(() => (allStudents ?? []).filter(isIncomplete).length, [allStudents])

  // Get instruments for filter dropdown
  const instruments = [...new Set((allStudents ?? []).map((s) => s.instrument).filter(Boolean))].sort()

  const handleEditSave = async (data: any) => {
    if (editStudent) {
      // Check if status is changing to former — trigger exit interview
      if (data.status === 'former' && editStudent.status !== 'former') {
        setExitStudent({ ...editStudent, ...data } as any)
        setEditStudent(null)
        return
      }
      // Check if status is changing to paused/inactive — trigger retention capture
      if ((data.status === 'paused' || data.status === 'inactive') && editStudent.status === 'active') {
        setRetentionTarget({ student: editStudent, newStatus: data.status, pendingData: data })
        setEditStudent(null)
        return
      }
      await updateStudent.mutateAsync({ id: editStudent.id, ...data })
    } else {
      await createStudent.mutateAsync({ ...data, tenant_id: tenantId! })
    }
    setShowCreateModal(false)
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

  return (
    <IssueContextProvider page="Roster — Students">
    <div className="page">
      <div className="page-header">
        <h1>Students</h1>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
          {/* Desktop buttons — hidden on mobile */}
          {role === 'owner' && (
            <button
              className="btn-ghost student-header-desktop"
              onClick={() => setShowMasterSheet(true)}
              style={{ fontSize: 11, color: '#FFB800', borderColor: 'rgba(255,184,0,0.25)' }}
            >
              Master Sheet
            </button>
          )}
          <button
            className="btn-ghost student-header-desktop"
            onClick={() => { const next = !viewCompact; setViewCompact(next); localStorage.setItem('student-view', next ? 'compact' : 'expanded') }}
            style={{ fontSize: 11 }}
          >
            {viewCompact ? 'Expanded View' : 'Compact View'}
          </button>
          {canEdit && (
            <button className="btn-ghost student-header-desktop" onClick={() => setShowImport(true)} style={{ fontSize: 11 }}>Import CSV</button>
          )}
          {canExport && <button className="btn-ghost student-header-desktop" onClick={() => setShowExport(true)} style={{ fontSize: 11 }}>Export CSV</button>}

          {/* Mobile "More" dropdown — visible only on mobile */}
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
                  <button onClick={() => { const next = !viewCompact; setViewCompact(next); localStorage.setItem('student-view', next ? 'compact' : 'expanded'); setShowMoreMenu(false) }}>
                    {viewCompact ? 'Expanded View' : 'Compact View'}
                  </button>
                  {canEdit && (
                    <button onClick={() => { setShowImport(true); setShowMoreMenu(false) }}>Import CSV</button>
                  )}
                  {canExport && (
                    <button onClick={() => { setShowExport(true); setShowMoreMenu(false) }}>Export CSV</button>
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

      {/* Tabs */}
      {!isStudioDirector && (
        <div className="lead-view-tabs">
          <button className={`lead-view-tab${activeTab === 'active' ? ' active' : ''}`} onClick={() => setActiveTab('active')}>
            Active <span className="tab-count">{activeCt}</span>
          </button>
          <button className={`lead-view-tab${activeTab === 'former' ? ' active' : ''}`} onClick={() => setActiveTab('former')}>
            Former <span className="tab-count">{formerCt}</span>
          </button>
        </div>
      )}

      {/* Filters */}
      <div data-tour-id="students-search" className="schedule-filters" style={{ marginBottom: '16px' }}>
        <div className="student-filter-row-1">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search students..."
            className="filter-select"
            style={{ minWidth: 160, flex: 1 }}
          />
          <button
            className="btn-outline"
            onClick={async () => {
              if (starLoading) return
              setStarLoading(true)
              setStarInsight(null)
              try {
                // Build a summary for Star
                const activeStudents = (allForCounts ?? []).filter((s) => s.status === 'active')
                const instrumentCounts: Record<string, number> = {}
                const locationCounts: Record<string, number> = {}
                const overdueStudents: string[] = []
                activeStudents.forEach((s) => {
                  if (s.instrument) instrumentCounts[s.instrument] = (instrumentCounts[s.instrument] ?? 0) + 1
                  if (s.location_name) locationCounts[s.location_name] = (locationCounts[s.location_name] ?? 0) + 1
                  if (Number((s as any).overdue_amount ?? 0) > 0) overdueStudents.push(`${s.first_name} ${s.last_name} ($${Number((s as any).overdue_amount).toFixed(0)})`)
                })
                const formerStudents = (allForCounts ?? []).filter((s) => s.status === 'former' || s.status === 'inactive')
                const leadsPipeline = (allLeads ?? []).filter((l) => !['enrolled', 'lost'].includes(l.stage))
                const leadsInstruments: Record<string, number> = {}
                leadsPipeline.forEach((l) => { if (l.instrument) leadsInstruments[l.instrument] = (leadsInstruments[l.instrument] ?? 0) + 1 })

                const question = `Give me a quick action plan for my student roster. Here's what I have:

Active Students: ${activeStudents.length}
By Instrument: ${Object.entries(instrumentCounts).map(([k, v]) => `${k}: ${v}`).join(', ') || 'none'}
By Location: ${Object.entries(locationCounts).map(([k, v]) => `${k}: ${v}`).join(', ') || 'none'}
Former Students: ${formerStudents.length}
Overdue Payments: ${overdueStudents.length > 0 ? overdueStudents.join(', ') : 'none'}
Leads in Pipeline: ${leadsPipeline.length}
Leads by Instrument: ${Object.entries(leadsInstruments).map(([k, v]) => `${k}: ${v}`).join(', ') || 'none'}

Tell me: How can I grow revenue? Which leads match my open teacher slots? Who should I reach out to? What instruments need more teachers? Keep it to 3-4 short action items, conversational, like you're my business coach.`

                const { data } = await supabase.functions.invoke('ai-assistant', {
                  body: { question, tenant_id: tenantId, conversation_history: [] },
                })
                setStarInsight(data?.response ?? 'Star could not generate insights right now.')
              } catch {
                setStarInsight('Something went wrong. Try again.')
              } finally {
                setStarLoading(false)
              }
            }}
            style={{ fontSize: 11, padding: '5px 14px', color: '#FFB800', borderColor: 'rgba(255,184,0,0.25)', display: 'flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap' }}
          >
            <Star size={12} />
            {starLoading ? 'Thinking...' : 'Ask Star About My Students'}
          </button>
        </div>
        <div className="student-filter-row-2">
          <select value={instrumentFilter} onChange={(e) => setInstrumentFilter(e.target.value)} className="filter-select" style={{ flex: 1, minWidth: 0 }}>
            <option value="">Instruments</option>
            {instruments.map((i) => <option key={i} value={i}>{i.charAt(0).toUpperCase() + i.slice(1)}</option>)}
          </select>
          <select value={teacherFilter} onChange={(e) => setTeacherFilter(e.target.value)} className="filter-select" style={{ flex: 1, minWidth: 0 }}>
            <option value="">Teachers</option>
            {teacherList?.filter((t: any) => { const s = t.status ?? (t.is_active ? 'active' : 'inactive'); return s !== 'inactive' }).map((t: any) => (
              <option key={t.id} value={t.id}>{t.first_name ?? t.profile?.first_name} {t.last_name ?? t.profile?.last_name}</option>
            ))}
          </select>
          {!isStudioDirector && (
            <select value={locationFilter} onChange={(e) => setLocationFilter(e.target.value)} className="filter-select" style={{ flex: 1, minWidth: 0 }}>
              <option value="">Locations</option>
              {locations?.map((l) => (
                <option key={l.id} value={l.id}>{l.name.replace(' Music Lessons', '')}</option>
              ))}
            </select>
          )}
        </div>
        <div className="student-filter-row-2" style={{ marginTop: 6 }}>
          <select value={sortBy} onChange={(e) => setSortBy(e.target.value as SortOption)} className="filter-select" style={{ flex: 1, minWidth: 0 }}>
            <option value="az_first">A → Z First Name</option>
            <option value="za_first">Z → A First Name</option>
            <option value="az_last">A → Z Last Name</option>
            <option value="za_last">Z → A Last Name</option>
            <option value="newest">Newest Enrolled</option>
            <option value="oldest">Oldest Enrolled</option>
          </select>
          <button
            onClick={() => setShowIncomplete(!showIncomplete)}
            className="filter-select"
            style={{
              flex: 'none',
              cursor: 'pointer',
              textAlign: 'center',
              fontWeight: showIncomplete ? 700 : 500,
              background: showIncomplete ? 'rgba(251,146,60,0.12)' : undefined,
              borderColor: showIncomplete ? 'rgba(251,146,60,0.35)' : undefined,
              color: showIncomplete ? '#FB923C' : '#A0A0C8',
              whiteSpace: 'nowrap',
            }}
          >
            Needs Attention{incompleteCount > 0 ? ` (${incompleteCount})` : ''}
          </button>
        </div>
        <span className="visibility-count">Showing {filtered.length} student{filtered.length !== 1 ? 's' : ''}</span>
      </div>

      {/* Star Insight Panel */}
      {starInsight && (
        <div className="lead-star-section" style={{ marginBottom: 16, background: 'rgba(255,184,0,0.03)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 26, height: 26, borderRadius: 8, background: 'linear-gradient(135deg, #FFB800, #FF8C00)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', boxShadow: '0 3px 10px rgba(255,184,0,0.3)' }}>
                <Star size={13} />
              </div>
              <span style={{ fontSize: 13, fontWeight: 700, color: '#FFB800' }}>Star's Student Insights</span>
            </div>
            <button className="btn-ghost" onClick={() => setStarInsight(null)} style={{ padding: '4px 8px', fontSize: 11 }}>Dismiss</button>
          </div>
          <div style={{ fontSize: 13.5, color: '#C0C0E0', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{starInsight}</div>
        </div>
      )}

      {(isLoading || (!allStudents && isFetching)) ? (
        <div className="loading-screen" style={{ height: 200 }}><MusicLoader /></div>
      ) : (
        <div data-tour-id="students-list" className="lead-cards">
          {filtered.map((s, studentIdx) => {
            const isFormer = s.status === 'former' || s.status === 'inactive'
            const loc = locations?.find((l: any) => l.id === s.location_id)
            const locColor = (loc as any)?.color ?? '#D4226A'
            return (
              <div
                key={s.id}
                data-tour-id={studentIdx === 0 ? 'first-student-row' : undefined}
                className={`lead-card${isFormer ? ' lead-card-stale' : ''}`}
                onClick={() => { saveScroll(); navigate(`/admin/students/${s.id}`) }}
              >
                {/* Edge accent — location color */}
                <div className="lead-card-edge" style={{
                  background: isFormer ? '#606088' : locColor,
                  boxShadow: isFormer ? 'none' : `0 0 12px ${locColor}80`,
                }} />

                {/* ── Mobile card layout ── */}
                <div className="student-card-mobile">
                  {/* Row 1: Name · Age */}
                  <div className="student-card-m-row">
                    <span className="student-card-m-name">{s.first_name} {s.last_name}</span>
                    {(s as any).student_display_id && (
                      <span style={{ fontSize: 10, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace', color: '#606088', fontWeight: 600 }}>
                        {(s as any).student_display_id}
                      </span>
                    )}
                    <span className="student-card-m-age">{(s as any).age ? `Age ${(s as any).age}` : ''}</span>
                    {(() => {
                      const risk = riskMap.get(s.id)
                      if (!risk || risk.tier === 'low') return null
                      const t = RISK_TIERS[risk.tier]
                      return <span style={{ fontSize: 8, fontWeight: 700, padding: '1px 6px', borderRadius: 4, background: t.bg, color: t.color }}>{t.label} ({risk.score})</span>
                    })()}
                  </div>
                  {/* Row 2: Email · Phone */}
                  <div className="student-card-m-row student-card-m-contact">
                    <span
                      onClick={(e) => { e.stopPropagation(); if (s.family_email) { navigator.clipboard.writeText(s.family_email); toast('Copied email', 'success') } }}
                      style={{ cursor: s.family_email ? 'pointer' : 'default' }}
                      title={s.family_email ? 'Click to copy' : undefined}
                    >{s.family_email ?? '—'}</span>
                    <span
                      onClick={(e) => { e.stopPropagation(); if (s.family_phone) { navigator.clipboard.writeText(s.family_phone); toast('Copied phone', 'success') } }}
                      style={{ cursor: s.family_phone ? 'pointer' : 'default' }}
                      title={s.family_phone ? 'Click to copy' : undefined}
                    >{s.family_phone ?? '—'}</span>
                  </div>
                  {/* Row 3: Emoji instrument · Teacher first name + last initial */}
                  <div className="student-card-m-row student-card-m-bottom">
                    <span className="student-card-m-emoji">{getInstrumentEmoji(s.instrument ?? '')}</span>
                    <span className="student-card-m-teacher">
                      {(() => {
                        const teachers = s.scheduled_teachers ?? []
                        if (teachers.length > 0) {
                          return teachers.map(st => {
                            const parts = (st.teacherName ?? '').split(' ')
                            return parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1][0]}.` : parts[0]
                          }).join(', ')
                        }
                        if (s.teacher_name && s.teacher_name !== '—') {
                          const parts = s.teacher_name.split(' ')
                          return parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1][0]}.` : parts[0]
                        }
                        return '—'
                      })()}
                    </span>
                  </div>
                  {/* Monthly badge — half-coin on right side */}
                  {canViewBilling && (
                    <div className="student-card-m-rate">
                      <span>${(s.rate_per_session * s.blocks_per_week * 4).toFixed(0)}</span>
                      {Number((s as any).overdue_amount ?? 0) > 0 && (
                        <span className="student-card-m-overdue">${Number((s as any).overdue_amount).toFixed(0)}</span>
                      )}
                    </div>
                  )}
                </div>

                {/* ── Desktop card layout ── */}
                <div className="student-card-content student-card-desktop">
                  {/* Icon */}
                  <div className="student-card-zone-icon">
                    <div style={{
                      width: 38, height: 38, borderRadius: 10,
                      background: isFormer ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.07)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: isFormer ? '#606088' : '#C0C0E0',
                    }}>
                      {s.instrument ? <InstrumentIcon instrument={s.instrument} size={22} /> : <Music size={22} />}
                    </div>
                  </div>

                  <div className="student-card-divider" />

                  {/* Name + Age + Risk */}
                  <div className="student-card-zone student-card-zone-name">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span className="lead-card-student">{s.first_name} {s.last_name}</span>
                      {(() => {
                        const risk = riskMap.get(s.id)
                        if (!risk || risk.tier === 'low') return null
                        const t = RISK_TIERS[risk.tier]
                        return <span style={{ fontSize: 8, fontWeight: 700, padding: '1px 6px', borderRadius: 4, background: t.bg, color: t.color }}>{t.label} ({risk.score})</span>
                      })()}
                    </div>
                    {(s as any).student_display_id && (
                      <span style={{ fontSize: 10, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace', color: '#606088', fontWeight: 600, marginTop: 2 }}>
                        {(s as any).student_display_id}
                      </span>
                    )}
                    <span style={{ fontSize: 13, color: '#A0A0C8', marginTop: 2 }}>Age {(s as any).age ?? '—'}</span>
                  </div>

                  <div className="student-card-divider" />

                  {/* Contact — email + phone from family */}
                  <div className="student-card-zone student-card-col student-card-col-contact" style={{ gap: 2, minWidth: 130 }}>
                    <span style={{ fontSize: 10, fontWeight: 700, color: '#8080A8', textTransform: 'uppercase' as const, letterSpacing: '0.08em' }}>Contact</span>
                    <span style={{ fontSize: 12, color: '#C0C0E0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const, maxWidth: 170, cursor: s.family_email ? 'pointer' : 'default' }}
                      onClick={(e) => { e.stopPropagation(); if (s.family_email) { navigator.clipboard.writeText(s.family_email); toast('Copied email', 'success') } }}
                      title={s.family_email ? 'Click to copy' : undefined}>
                      {s.family_email ?? '—'}
                    </span>
                    <span style={{ fontSize: 11, color: '#A0A0C8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const, cursor: s.family_phone ? 'pointer' : 'default' }}
                      onClick={(e) => { e.stopPropagation(); if (s.family_phone) { navigator.clipboard.writeText(s.family_phone); toast('Copied phone', 'success') } }}
                      title={s.family_phone ? 'Click to copy' : undefined}>
                      {s.family_phone ?? '—'}
                    </span>
                  </div>

                  <div className="student-card-divider" />

                  {/* Instrument(s) */}
                  <div className="student-card-zone student-card-col student-card-col-instrument" style={{ gap: 2 }}>
                    <span style={{ fontSize: 10, fontWeight: 700, color: '#8080A8', textTransform: 'uppercase' as const, letterSpacing: '0.08em' }}>Instrument</span>
                    {viewCompact ? (
                      <span style={{ fontSize: 13, fontWeight: 700, color: '#E0E0F4' }}>
                        {(s.scheduled_teachers ?? []).length > 1
                          ? 'Multiple'
                          : instrumentWithEmojiTitle(s.instrument)}
                      </span>
                    ) : (
                      (s.scheduled_teachers ?? []).length > 0 ? (
                        (s.scheduled_teachers ?? []).map((st, i) => (
                          <span key={i} style={{ fontSize: 13, fontWeight: 700, color: '#E0E0F4' }}>
                            {instrumentWithEmojiTitle(st.instrument ?? s.instrument)}
                          </span>
                        ))
                      ) : (
                        <span style={{ fontSize: 13, fontWeight: 700, color: '#E0E0F4' }}>{instrumentWithEmojiTitle(s.instrument)}</span>
                      )
                    )}
                  </div>

                  <div className="student-card-divider" />

                  {/* Teacher(s) */}
                  <div className="student-card-zone student-card-col student-card-col-teacher" style={{ gap: 2 }}>
                    <span style={{ fontSize: 10, fontWeight: 700, color: '#8080A8', textTransform: 'uppercase' as const, letterSpacing: '0.08em' }}>Teacher</span>
                    {viewCompact ? (
                      <span style={{ fontSize: 13, fontWeight: 700, color: '#E0E0F4' }}>
                        {(s.scheduled_teachers ?? []).length > 1
                          ? 'Multiple'
                          : s.teacher_name !== '—' ? s.teacher_name : '—'}
                      </span>
                    ) : (
                      (s.scheduled_teachers ?? []).length > 0 ? (
                        (s.scheduled_teachers ?? []).map((st, i) => (
                          <span key={i} style={{ fontSize: 13, fontWeight: 700, color: '#E0E0F4' }}>{st.teacherName}</span>
                        ))
                      ) : (
                        <span style={{ fontSize: 13, fontWeight: 700, color: '#E0E0F4' }}>{s.teacher_name !== '—' ? s.teacher_name : '—'}</span>
                      )
                    )}
                  </div>

                  {canViewBilling && (
                    <>
                  <div className="student-card-divider" />

                  {/* Monthly */}
                  <div className="student-card-zone student-card-col student-card-col-monthly" style={{ gap: 3 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: '#8080A8', textTransform: 'uppercase' as const, letterSpacing: '0.08em' }}>Monthly</span>
                    <span style={{ fontSize: 14, fontWeight: 700, color: '#E0E0F4' }}>${(s.rate_per_session * s.blocks_per_week * 4).toFixed(0)}</span>
                    <span style={{ fontSize: 12, fontWeight: 500, color: Number((s as any).overdue_amount ?? 0) > 0 ? '#B45555' : '#606088' }}>
                      {Number((s as any).overdue_amount ?? 0) > 0 ? `$${Number((s as any).overdue_amount).toFixed(0)} overdue` : '$0'}
                    </span>
                  </div>
                    </>
                  )}

                  <div className="student-card-divider" />

                  {/* Next Lesson */}
                  <div className="student-card-zone student-card-col student-card-col-next" style={{ gap: 3 }}>
                    <span style={{ fontSize: 10, fontWeight: 700, color: '#8080A8', textTransform: 'uppercase' as const, letterSpacing: '0.08em' }}>Next Lesson</span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: s.next_lesson_date ? '#E0E0F4' : '#606088' }}>
                      {s.next_lesson_date
                        ? new Date(s.next_lesson_date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
                        : 'Not scheduled'}
                    </span>
                    <span style={{ fontSize: 10.5, color: '#8080A8' }}>
                      {s.next_lesson_time ? (() => { const [h,m] = s.next_lesson_time!.split(':'); const hr = parseInt(h); return `${hr > 12 ? hr-12 : hr}:${m}${hr >= 12 ? 'pm' : 'am'}` })() + ' · ' : ''}{s.location_name ?? ''}
                    </span>
                    {!s.next_lesson_time && (
                      <span style={{ fontSize: 10.5, color: '#8080A8' }}>{s.location_name ?? ''}</span>
                    )}
                  </div>
                </div>

              </div>
            )
          })}
          {filtered.length === 0 && (
            <div className="empty-state">No students found.</div>
          )}
        </div>
      )}

      {/* Create / Edit Modal */}
      {(showCreateModal || editStudent) && (
        <StudentFormModal
          student={editStudent}
          families={familyList ?? []}
          locations={locations ?? []}
          teachers={(teacherList ?? []).filter((t: any) => { const s = t.status ?? (t.is_active ? 'active' : 'inactive'); return s !== 'inactive' })}
          tenantId={tenantId!}
          onSave={handleEditSave}
          onClose={() => { setShowCreateModal(false); setEditStudent(null); }}
          isSaving={createStudent.isPending || updateStudent.isPending}
        />
      )}

      {/* Exit Interview Modal */}
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

      {/* Retention Capture Modal */}
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

      {/* Export Modal */}
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
                  { key: 'active', label: 'Active Students', count: activeCt, color: '#22C55E' },
                  { key: 'former', label: 'Former Students', count: formerCt, color: '#8080A8' },
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
                onClick={() => {
                  const rows: string[][] = [['Type', 'Name', 'Parent', 'Email', 'Phone', 'Instrument', 'Location', 'Teacher', 'Monthly', 'Overdue', 'Status']]

                  if (exportSelections.active) {
                    const active = (allForCounts ?? []).filter((s) => s.status === 'active')
                    active.forEach((s) => rows.push(['Student', `${s.first_name} ${s.last_name}`, s.family_name ?? '', s.family_email ?? '', s.family_phone ?? '', s.instrument ?? '', s.location_name ?? '', s.teacher_name ?? '', `$${(s.rate_per_session * s.blocks_per_week * 4).toFixed(0)}`, `$${Number((s as any).overdue_amount ?? 0).toFixed(0)}`, 'Active']))
                  }

                  if (exportSelections.former) {
                    const former = (allForCounts ?? []).filter((s) => s.status === 'former' || s.status === 'inactive')
                    former.forEach((s) => rows.push(['Student', `${s.first_name} ${s.last_name}`, s.family_name ?? '', s.family_email ?? '', s.family_phone ?? '', s.instrument ?? '', s.location_name ?? '', s.teacher_name ?? '', '', '', 'Former']))
                  }

                  if (exportSelections.leads) {
                    (allLeads ?? []).forEach((l) => rows.push(['Lead', `${l.first_name} ${l.last_name ?? ''}`, l.parent_name ?? '', l.email ?? '', l.phone ?? '', l.instrument ?? '', l.location_name ?? '', '', '', '', l.stage]))
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
      {/* Import Modal */}
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
      {showAddStudent && (
        <AddStudentModal onClose={() => setShowAddStudent(false)} />
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

// ---- Student Form Modal ----
const CORE_FOUR_SET = new Set(['piano', 'guitar', 'vocals', 'drums'])

interface InstrumentFormRow {
  id?: string
  instrument: string
  teacher_id: string
  is_primary: boolean
}

function StudentFormModal({ student, families, locations, teachers, tenantId, onSave, onClose, isSaving }: {
  student: StudentRow | null
  families: any[]
  locations: any[]
  teachers: any[]
  tenantId: string
  onSave: (data: any) => Promise<void>
  onClose: () => void
  isSaving: boolean
}) {
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

  // Sync from DB when editing existing student
  useEffect(() => {
    if (student && existingInstruments && existingInstruments.length > 0) {
      setInstrumentRows(existingInstruments.map(si => ({
        id: si.id, instrument: si.instrument, teacher_id: si.teacher_id ?? '', is_primary: si.is_primary,
      })))
    }
  }, [existingInstruments]) // eslint-disable-line react-hooks/exhaustive-deps

  const updateRow = (idx: number, patch: Partial<InstrumentFormRow>) => {
    setInstrumentRows(prev => prev.map((r, i) => i === idx ? { ...r, ...patch } : r))
  }
  const addRow = () => setInstrumentRows(prev => [...prev, { instrument: '', teacher_id: '', is_primary: false }])
  const removeRow = (idx: number) => {
    const row = instrumentRows[idx]
    if (instrumentRows.length <= 1) return
    if (row.id) setRemovedIds(prev => [...prev, row.id!])
    const remaining = instrumentRows.filter((_, i) => i !== idx)
    if (row.is_primary && remaining.length > 0) remaining[0].is_primary = true
    setInstrumentRows(remaining)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!form.first_name || !form.last_name) { setError('First and last name are required.'); return }
    if (!instrumentRows[0]?.instrument) { setError('At least one instrument is required.'); return }
    const primary = instrumentRows.find(r => r.is_primary) ?? instrumentRows[0]
    try {
      await onSave({ ...form, instrument: primary.instrument, teacher_id: primary.teacher_id || null })
      // If editing, save instrument rows
      if (student) {
        await saveInstruments.mutateAsync({
          studentId: student.id, tenantId,
          instruments: instrumentRows.map(r => ({ id: r.id, instrument: r.instrument, teacher_id: r.teacher_id || null, is_primary: r.is_primary, rate_per_session: form.rate_per_session, sessions_per_month: form.blocks_per_week * 4 })),
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

          {/* Instruments & Teachers */}
          <div style={{ marginBottom: 14 }}>
            <label style={{ fontSize: 11, fontWeight: 700, color: '#A0A0C8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8, display: 'block' }}>Instruments & Teachers</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {instrumentRows.map((row, idx) => (
                <div key={idx} style={{ display: 'flex', gap: 6, alignItems: 'center', padding: '8px 10px', borderRadius: 10, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                  <span style={{ fontSize: 18, flexShrink: 0 }}>{row.instrument ? getInstrumentEmoji(row.instrument) : '\u{1F3B5}'}</span>
                  <select value={row.instrument} onChange={(e) => updateRow(idx, { instrument: e.target.value })} className="filter-select" style={{ flex: 1, minWidth: 0 }}>
                    <option value="">Select...</option>
                    <optgroup label="Core">
                      {INSTRUMENTS.filter(i => CORE_FOUR_SET.has(i)).map(i => <option key={i} value={i}>{i.charAt(0).toUpperCase() + i.slice(1)}</option>)}
                    </optgroup>
                    <optgroup label="Other">
                      {INSTRUMENTS.filter(i => !CORE_FOUR_SET.has(i)).map(i => <option key={i} value={i}>{i.charAt(0).toUpperCase() + i.slice(1)}</option>)}
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
                {families.map((f: any) => <option key={f.id} value={f.id}>{f.name}</option>)}
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
