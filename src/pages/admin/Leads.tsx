import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import MusicLoader from '../../components/shared/MusicLoader'
import { useAuthContext } from '../../app/AuthContext'
import { useLeads, useUpdateLeadStage, useUpdateLead, useCreateLead, type LeadRow } from '../../hooks/useLeads'
import { useLocations } from '../../hooks/useLocations'
import { useAIMatch, type TeacherMatch } from '../../hooks/useAIMatch'
import { Star, Clock, MapPin, Music, UserPlus, X } from 'lucide-react'
import ConvertLeadModal from '../../components/leads/ConvertLeadModal'
import DataGrid from '../../components/shared/DataGrid'
import { CORE_INSTRUMENTS, OTHER_INSTRUMENTS } from '../../lib/constants'
import { toast } from '../../components/shared/Toast'

const STAGES = ['inquiry', 'contacted', 'scheduled', 'enrolled', 'lost'] as const

// No emojis — use Music lucide icon for all instruments (clean, monochrome)
const STAGE_LABELS: Record<string, string> = {
  inquiry: 'New Lead', contacted: 'Contacted', scheduled: 'Scheduled',
  enrolled: 'Enrolled', lost: 'Lost',
}
const STAGE_COLORS: Record<string, string> = {
  inquiry: 'var(--green)', contacted: 'var(--pink)',
  scheduled: 'var(--gold)', enrolled: 'var(--green)',
  lost: 'var(--text-muted)',
}
const NEXT_STAGE: Record<string, string> = {
  inquiry: 'contacted', contacted: 'scheduled', scheduled: 'enrolled',
}

function getActionPrompt(lead: LeadRow): { text: string; color: string; urgent: boolean } {
  const days = lead.days_since_created ?? 0
  const isStale = lead.needs_follow_up

  // Stale overrides everything
  if (isStale) {
    if (lead.stage === 'inquiry') return { text: 'Not Reached Out', color: '#EF4444', urgent: true }
    if (lead.stage === 'contacted') return { text: 'No Response Yet', color: '#EF4444', urgent: true }
    if (lead.stage === 'scheduled') return { text: 'Confirm Appointment', color: '#FFB800', urgent: true }
    return { text: 'Needs Follow-Up', color: '#EF4444', urgent: true }
  }

  // Stage-based prompts — colors match stage colors
  if (lead.stage === 'inquiry') {
    if (days === 0) return { text: 'Reach Out Today', color: '#22C55E', urgent: false }
    return { text: 'Send First Text', color: '#22C55E', urgent: false }
  }
  if (lead.stage === 'contacted') {
    return { text: 'Awaiting Reply', color: '#E8488A', urgent: false }
  }
  if (lead.stage === 'scheduled') {
    return { text: 'Trial Booked', color: '#FFB800', urgent: false }
  }
  return { text: '', color: '#8080A8', urgent: false }
}

export default function Leads() {
  const { role, tenantId } = useAuthContext()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { data: locations } = useLocations()
  const canEdit = role === 'owner' || role === 'admin'

  const [locationFilter, setLocationFilter] = useState(() => searchParams.get('location') ?? '')
  const [instrumentFilter, setInstrumentFilter] = useState(() => searchParams.get('instrument') ?? '')
  const [stageFilter, setStageFilter] = useState(() => searchParams.get('stage') ?? '')
  const [leadView, setLeadView] = useState<'active' | 'enrolled' | 'lost'>(() => (searchParams.get('view') as any) ?? 'active')
  const [detailLead, setDetailLead] = useState<LeadRow | null>(null)
  const [convertLead, setConvertLead] = useState<LeadRow | null>(null)
  const [editingNextAction, setEditingNextAction] = useState(false)
  const [nextActionDraft, setNextActionDraft] = useState('')
  const aiMatch = useAIMatch()
  const [showMasterSheet, setShowMasterSheet] = useState(false)
  const [showAddLead, setShowAddLead] = useState(false)

  // Sync filters to URL params for persistence
  useEffect(() => {
    const params = new URLSearchParams()
    if (locationFilter) params.set('location', locationFilter)
    if (instrumentFilter) params.set('instrument', instrumentFilter)
    if (stageFilter) params.set('stage', stageFilter)
    if (leadView !== 'active') params.set('view', leadView)
    setSearchParams(params, { replace: true })
  }, [locationFilter, instrumentFilter, stageFilter, leadView])

  const { data: leads, isLoading } = useLeads({
    locationId: locationFilter || undefined,
    instrument: instrumentFilter || undefined,
  })

  const updateStage = useUpdateLeadStage()
  const updateLead = useUpdateLead()

  const instruments = [...new Set(leads?.map((l) => l.instrument).filter(Boolean) ?? [])]

  // Counts per location and instrument for active leads
  const activeLeads = (leads ?? []).filter((l) => !['enrolled', 'lost'].includes(l.stage))
  const locationCounts: Record<string, number> = {}
  const instrumentCounts: Record<string, number> = {}
  activeLeads.forEach((l) => {
    if (l.location_id) locationCounts[l.location_id] = (locationCounts[l.location_id] ?? 0) + 1
    if (l.instrument) instrumentCounts[l.instrument] = (instrumentCounts[l.instrument] ?? 0) + 1
  })

  // Stage counts
  const stageCounts: Record<string, number> = {}
  leads?.forEach((l) => { stageCounts[l.stage] = (stageCounts[l.stage] ?? 0) + 1 })
  const followUpCount = leads?.filter((l) => l.needs_follow_up).length ?? 0

  // Tab counts
  const lostCount = leads?.filter((l) => l.stage === 'lost').length ?? 0
  const enrolledCount = leads?.filter((l) => l.stage === 'enrolled').length ?? 0
  const activeCount = (leads?.length ?? 0) - lostCount - enrolledCount

  // Filter for list view based on tab
  let filteredLeads: LeadRow[]
  if (leadView === 'lost') {
    filteredLeads = (leads ?? []).filter((l) => l.stage === 'lost')
  } else if (leadView === 'enrolled') {
    filteredLeads = (leads ?? []).filter((l) => l.stage === 'enrolled')
    // Sort enrolled by most recent first
    filteredLeads = [...filteredLeads].sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
  } else {
    filteredLeads = (leads ?? []).filter((l) => !['enrolled', 'lost'].includes(l.stage))
  }
  if (stageFilter) filteredLeads = filteredLeads.filter((l) => l.stage === stageFilter)
  // followUpOnly removed — stale leads are indicated by the action pill on each card
  // Sort: stale first (most days since created, non-terminal)
  filteredLeads = [...filteredLeads].sort((a, b) => {
    if (!['enrolled', 'lost'].includes(a.stage) && ['enrolled', 'lost'].includes(b.stage)) return -1
    if (['enrolled', 'lost'].includes(a.stage) && !['enrolled', 'lost'].includes(b.stage)) return 1
    return b.days_since_created - a.days_since_created
  })

  const handleAdvance = async (lead: LeadRow) => {
    const next = NEXT_STAGE[lead.stage]; if (!next) return
    await updateStage.mutateAsync({ id: lead.id, stage: next })
    setDetailLead({ ...lead, stage: next as any })
  }

  const handleMarkLost = async (lead: LeadRow) => {
    await updateStage.mutateAsync({ id: lead.id, stage: 'lost' }); setDetailLead(null)
  }

  const handleSaveNextAction = async () => {
    if (!detailLead) return
    await updateLead.mutateAsync({ id: detailLead.id, next_action: nextActionDraft })
    setDetailLead({ ...detailLead, next_action: nextActionDraft } as any)
    setEditingNextAction(false)
  }

  const handleExportLeads = () => {
    const rows = [
      ['Student', 'Parent', 'Email', 'Phone', 'Instrument', 'Location', 'Stage', 'Days', 'Source', 'Created', 'Notes']
    ]
    filteredLeads.forEach((l) => {
      rows.push([
        `${l.first_name} ${l.last_name ?? ''}`.trim(),
        l.parent_name ?? '',
        l.email ?? '',
        l.phone ?? '',
        l.instrument ?? '',
        l.location_name ?? '',
        STAGE_LABELS[l.stage] ?? l.stage,
        String(l.days_since_created ?? ''),
        l.source ?? '',
        new Date(l.created_at).toLocaleString(),
        (l.notes ?? '').replace(/\n/g, ' | ')
      ])
    })
    const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `leads-${leadView}-${new Date().toISOString().split('T')[0]}.csv`; a.click()
    URL.revokeObjectURL(url)
  }

  // Secondary role check (primary is RouteGuard)
  if (role !== 'owner' && role !== 'admin') {
    return <div className="page" style={{ padding: 40, textAlign: 'center', color: '#8080A8' }}>Access restricted to owners and admins.</div>
  }

  if (isLoading) {
    return (
      <div className="page" style={{ maxWidth: 'none' }}>
        <div className="page-header"><h1>Leads</h1></div>
        <div className="loading-screen" style={{ height: 300 }}><MusicLoader /></div>
      </div>
    )
  }

  return (
    <div className="page" style={{ maxWidth: 'none' }}>
      {/* Header — stage counts inline */}
      <div className="page-header">
        <h1>Leads</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 12.5, color: '#A0A0C8' }}>
          {STAGES.filter(s => s !== 'enrolled' && s !== 'lost').map((s) => (
            <span key={s} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: STAGE_COLORS[s], display: 'inline-block' }} />
              <span style={{ fontWeight: 600 }}>{stageCounts[s] ?? 0}</span>
              <span style={{ color: '#8080A8' }}>{STAGE_LABELS[s]}</span>
            </span>
          ))}
          {followUpCount > 0 && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#FFB800' }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#FFB800', display: 'inline-block', boxShadow: '0 0 6px rgba(255,184,0,0.5)' }} />
              <span style={{ fontWeight: 600 }}>{followUpCount}</span>
              <span>Follow-Up</span>
            </span>
          )}
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
          {canEdit && (
            <button
              onClick={() => setShowAddLead(true)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6, padding: '7px 16px',
                borderRadius: 10, border: 'none', background: '#D4226A', color: '#fff',
                fontSize: 12, fontWeight: 700, cursor: 'pointer',
                boxShadow: '0 4px 16px rgba(212,34,106,0.3)',
              }}
            >
              <UserPlus size={14} /> Add Active Lead
            </button>
          )}
          {role === 'owner' && (
            <button
              className="btn-ghost"
              onClick={() => setShowMasterSheet(true)}
              style={{ fontSize: 11, padding: '5px 12px', color: '#FFB800', borderColor: 'rgba(255,184,0,0.25)' }}
            >
              Master Sheet
            </button>
          )}
          <button className="btn-ghost" onClick={handleExportLeads} style={{ fontSize: 11, padding: '5px 12px' }}>
            Export CSV
          </button>
        </div>
      </div>

      {/* Active / Lost tabs */}
      <div className="lead-view-tabs">
        <button className={`lead-view-tab${leadView === 'active' ? ' active' : ''}`} onClick={() => setLeadView('active')}>
          Active Leads
          <span className="tab-count">{activeCount}</span>
        </button>
        <button className={`lead-view-tab${leadView === 'enrolled' ? ' active' : ''}`} onClick={() => setLeadView('enrolled')}>
          Enrolled
          <span className="tab-count">{enrolledCount}</span>
        </button>
        <button className={`lead-view-tab${leadView === 'lost' ? ' active' : ''}`} onClick={() => setLeadView('lost')}>
          Lost
          <span className="tab-count">{lostCount}</span>
        </button>
      </div>

      {/* Filters — only on active tab */}
      {leadView === 'active' && <div className="schedule-filters" style={{ marginBottom: '16px' }}>
        <div className="filter-group">
          <select value={stageFilter} onChange={(e) => setStageFilter(e.target.value)} className="filter-select lead-filter">
            <option value="">All Stages ({activeCount})</option>
            {STAGES.filter(s => s !== 'enrolled' && s !== 'lost').map((s) => (
              <option key={s} value={s}>{STAGE_LABELS[s]} ({stageCounts[s] ?? 0})</option>
            ))}
          </select>
          <select value={locationFilter} onChange={(e) => setLocationFilter(e.target.value)} className="filter-select lead-filter">
            <option value="">All Locations ({activeCount})</option>
            {locations?.map((l) => (
              <option key={l.id} value={l.id}>{l.name.replace(' Music Lessons', '')} ({locationCounts[l.id] ?? 0})</option>
            ))}
          </select>
          <select value={instrumentFilter} onChange={(e) => setInstrumentFilter(e.target.value)} className="filter-select lead-filter">
            <option value="">All Instruments ({activeCount})</option>
            {instruments.map((i) => (
              <option key={i} value={i}>{i.charAt(0).toUpperCase() + i.slice(1)} ({instrumentCounts[i] ?? 0})</option>
            ))}
          </select>
        </div>
        <span className="visibility-count">Showing {filteredLeads.length} lead{filteredLeads.length !== 1 ? 's' : ''}</span>
      </div>}

      {/* Lost view header */}
      {leadView !== 'active' && (
        <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span className="visibility-count">Showing {filteredLeads.length} {leadView} lead{filteredLeads.length !== 1 ? 's' : ''}</span>
        </div>
      )}

      {/* LIST VIEW (default) — premium lead cards */}
      <div className="lead-cards">
          {filteredLeads.map((lead) => {
            const studentName = `${lead.first_name} ${lead.last_name ?? ''}`.trim()
            const parentName = lead.parent_name && lead.parent_name !== studentName ? lead.parent_name : null
            const stageColor = STAGE_COLORS[lead.stage] ?? 'var(--text-muted)'
            const isStale = lead.needs_follow_up

            return (
              <div
                key={lead.id}
                className={`lead-card${isStale ? ' lead-card-stale' : ''}`}
                onClick={() => { setDetailLead(lead); aiMatch.clearMatch() }}
              >
                {/* Left edge accent */}
                <div className="lead-card-edge" style={{ background: stageColor, boxShadow: `0 0 12px ${stageColor}60` }} />
                {/* Inner color glow — top right */}
                <div className="lead-card-glow" style={{ background: `radial-gradient(circle, ${stageColor}18 0%, transparent 70%)` }} />
                {/* Inner color glow — bottom left */}
                <div className="lead-card-glow-bl" style={{ background: `radial-gradient(circle, ${stageColor}0C 0%, transparent 70%)` }} />

                {/* Main content */}
                <div className="lead-card-content">
                  {/* Stage zone — separated left thumbnail */}
                  <div className="lead-card-stage-zone">
                    {lead.stage === 'lost' ? (
                      <div className="lead-card-stage-lost">LOST</div>
                    ) : lead.stage === 'enrolled' ? (
                      <select
                        className="lead-card-stage-select"
                        value={lead.stage}
                        style={{ color: '#22C55E', borderColor: 'rgba(34,197,94,0.35)', background: 'rgba(34,197,94,0.1)' }}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => { e.stopPropagation(); updateStage.mutate({ id: lead.id, stage: e.target.value }) }}
                      >
                        <option value="enrolled">Enrolled</option>
                        <option value="inquiry">New Lead</option>
                        <option value="contacted">Contacted</option>
                        <option value="scheduled">Scheduled</option>
                      </select>
                    ) : (
                      <select
                        className="lead-card-stage-select"
                        value={lead.stage}
                        style={{ color: stageColor, borderColor: `${stageColor}35`, background: `${stageColor}10` }}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => { e.stopPropagation(); updateStage.mutate({ id: lead.id, stage: e.target.value }) }}
                      >
                        {(['inquiry', 'contacted', 'scheduled', 'enrolled'] as const)
                          .filter((s) => {
                            const order = ['inquiry', 'contacted', 'scheduled', 'enrolled']
                            return order.indexOf(s) >= order.indexOf(lead.stage)
                          })
                          .map((s) => (
                            <option key={s} value={s}>{STAGE_LABELS[s]}</option>
                          ))}
                      </select>
                    )}
                  </div>

                  {/* Names */}
                  <div className="lead-card-left">
                    <div className="lead-card-names">
                      <span className="lead-card-student">{studentName}</span>
                      {parentName && <span className="lead-card-parent">Parent: {parentName}</span>}
                      {!parentName && <span className="lead-card-parent">Adult Student</span>}
                    </div>
                  </div>

                  {/* Chips */}
                  <div className="lead-card-meta">
                    {lead.instrument && (
                      <span className="lead-card-chip">
                        <Music size={12} />
                        {lead.instrument.charAt(0).toUpperCase() + lead.instrument.slice(1)}
                      </span>
                    )}
                    {lead.location_name && (
                      <span className="lead-card-chip">
                        <MapPin size={12} />
                        {lead.location_name}
                      </span>
                    )}
                    <span className="lead-card-chip" style={isStale ? { color: '#FFB800', borderColor: 'rgba(255,184,0,0.25)' } : undefined}>
                      <Clock size={12} />
                      {lead.days_since_created === 0 ? 'Today' : `${lead.days_since_created}d ago`}
                    </span>
                    {(() => {
                      const action = getActionPrompt(lead)
                      if (!action.text) return null
                      return (
                        <span className={`lead-card-action${action.urgent ? ' urgent' : ''}`} style={{ color: action.color, borderColor: `${action.color}30`, background: `${action.color}0D` }}>
                          {action.urgent && <span className="lead-action-dot" style={{ background: action.color, boxShadow: `0 0 6px ${action.color}` }} />}
                          {action.text}
                        </span>
                      )
                    })()}
                  </div>
                </div>

                {/* Ask Star button */}
                <button
                  className="lead-card-ask-star"
                  onClick={(e) => {
                    e.stopPropagation()
                    setDetailLead(lead)
                    aiMatch.runMatch(lead.id, tenantId!)
                  }}
                >
                  <Star size={13} />
                  <span>{lead.stage === 'lost' ? 'Get Them Back' : 'Ask Star'}</span>
                </button>
              </div>
            )
          })}
          {filteredLeads.length === 0 && (
            <div className="empty-state">No leads found.</div>
          )}
      </div>

      {/* Lead Detail Modal — tabbed popup */}
      {detailLead && (
        <LeadDetailModal
          lead={detailLead}
          stageColors={STAGE_COLORS}
          stageLabels={STAGE_LABELS}
          nextStage={NEXT_STAGE}
          aiMatch={aiMatch}
          tenantId={tenantId}
          canEdit={canEdit}
          onClose={() => setDetailLead(null)}
          onAdvance={handleAdvance}
          onMarkLost={handleMarkLost}
          onConvert={() => setConvertLead(detailLead)}
          onEnroll={() => { setConvertLead(detailLead); setDetailLead(null) }}
          updateStage={updateStage}
          updateLead={updateLead}
        />
      )}

      {convertLead && (
        <ConvertLeadModal lead={convertLead} onClose={() => setConvertLead(null)} onConverted={() => { setConvertLead(null); setDetailLead(null) }} />
      )}

      {showAddLead && tenantId && (
        <AddLeadModal
          tenantId={tenantId}
          locations={locations ?? []}
          onClose={() => setShowAddLead(false)}
        />
      )}

      {/* Master Sheet */}
      {showMasterSheet && (
        <DataGrid
          title="Master Editor — Leads"
          table="leads"
          columns={[
            { key: 'student_name', label: 'Student Name', width: 150 },
            { key: 'parent_name', label: 'Parent Name', width: 150 },
            { key: 'stage', label: 'Stage', width: 110, type: 'select', options: ['inquiry', 'contacted', 'scheduled', 'enrolled', 'lost'] },
            { key: 'source', label: 'Source', width: 120 },
            { key: 'instrument', label: 'Instrument', width: 130 },
            { key: 'preferred_days', label: 'Preferred Days', width: 150 },
            { key: 'notes', label: 'Notes', width: 250 },
          ]}
          nameField="student_name"
          nameRenderer={(row: any) => row.student_name || row.parent_name || 'Unknown'}
          orderBy="created_at"
          onClose={() => setShowMasterSheet(false)}
        />
      )}
    </div>
  )
}

/* ================================
   LEAD DETAIL MODAL — Tabbed Popup
================================ */

type DetailTab = 'overview' | 'form'

function LeadDetailModal({ lead, stageColors, stageLabels, nextStage, aiMatch, tenantId, canEdit, onClose, onAdvance, onMarkLost, onConvert, onEnroll, updateStage, updateLead }: {
  lead: LeadRow
  stageColors: Record<string, string>
  stageLabels: Record<string, string>
  nextStage: Record<string, string>
  aiMatch: any
  tenantId: string | null
  canEdit: boolean
  onClose: () => void
  onAdvance: (lead: LeadRow) => void
  onMarkLost: (lead: LeadRow) => void
  onConvert: () => void
  onEnroll: () => void
  updateStage: any
  updateLead: any
}) {
  const [tab, setTab] = useState<DetailTab>('overview')
  const [noteDraft, setNoteDraft] = useState('')
  const [showNoteInput, setShowNoteInput] = useState(false)
  const [editInstrument, setEditInstrument] = useState(false)
  const [editLocation, setEditLocation] = useState(false)
  const { data: locations } = useLocations()
  const studentName = `${lead.first_name} ${lead.last_name ?? ''}`.trim()
  const parentName = lead.parent_name && lead.parent_name !== studentName ? lead.parent_name : null
  const stageColor = stageColors[lead.stage] ?? '#A0A0C8'
  const instrumentDisplay = lead.instrument ? lead.instrument.charAt(0).toUpperCase() + lead.instrument.slice(1) : null

  const { profile } = useAuthContext()
  const [showAllNotes, setShowAllNotes] = useState(false)

  // Personality notes — editable with debounced save
  // Sync: prefer personality_notes, fall back to goals (from online form submissions)
  const [personalityDraft, setPersonalityDraft] = useState(lead.personality_notes ?? lead.goals ?? '')
  const personalityTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const savePersonality = useCallback((value: string) => {
    if (personalityTimer.current) clearTimeout(personalityTimer.current)
    personalityTimer.current = setTimeout(() => {
      updateLead.mutate({ id: lead.id, personality_notes: value || null })
      lead.personality_notes = value || null
    }, 800)
  }, [lead.id, updateLead])

  const handleAddNote = () => {
    if (!noteDraft.trim()) return
    const existingNotes = lead.notes ?? ''
    const userName = profile?.first_name ?? 'Unknown'
    const timestamp = new Date().toLocaleString()
    const newNote = `[${timestamp}] ${userName}: ${noteDraft.trim()}`
    const updated = existingNotes ? `${newNote}\n${existingNotes}` : newNote
    updateLead.mutate({ id: lead.id, notes: updated })
    lead.notes = updated
    setNoteDraft('')
    setShowNoteInput(false)
  }

  const handleExportLead = () => {
    const studentName = `${lead.first_name} ${lead.last_name ?? ''}`.trim()
    const rows = [
      ['Student Name', 'Parent', 'Email', 'Phone', 'Instrument', 'Location', 'Stage', 'Age', 'Experience', 'Source', 'Created', 'Notes'],
      [studentName, lead.parent_name ?? '', lead.email ?? '', lead.phone ?? '', lead.instrument ?? '', lead.location_name ?? '', lead.stage, lead.age ?? '', (lead as any).experience ?? '', lead.source ?? '', new Date(lead.created_at).toLocaleString(), (lead.notes ?? '').replace(/\n/g, ' | ')]
    ]
    const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `lead-${studentName.replace(/\s/g, '-').toLowerCase()}.csv`; a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="lead-detail-modal" onClick={(e) => e.stopPropagation()}>
        {/* Inner color glows */}
        <div className="lead-modal-glow-tr" style={{ background: `radial-gradient(circle, ${stageColor}14 0%, transparent 65%)` }} />
        <div className="lead-modal-glow-bl" style={{ background: `radial-gradient(circle, rgba(123,44,191,0.08) 0%, transparent 65%)` }} />

        {/* Close button */}
        <div style={{ position: 'absolute', top: 16, right: 16, display: 'flex', gap: 6, zIndex: 5 }}>
          <button className="btn-ghost" onClick={handleExportLead} style={{ padding: '4px 8px', fontSize: 10 }}>Export</button>
          <button className="btn-ghost" onClick={onClose} style={{ padding: '4px 8px' }}>X</button>
        </div>

        {/* Header — centered student info */}
        <div className="lead-detail-hero">
          <div className="lead-detail-stage-pill" style={{ color: stageColor, borderColor: `${stageColor}30`, background: `${stageColor}10` }}>
            {stageLabels[lead.stage]}
          </div>
          <h2 className="lead-detail-name">{studentName}</h2>
          <div className="lead-detail-sub">
            {parentName && <span>Parent: {parentName}</span>}
            {parentName && (lead.email || lead.phone) && <span style={{ color: '#606088' }}>·</span>}
            {lead.email && <span>{lead.email}</span>}
            {lead.email && lead.phone && <span style={{ color: '#606088' }}>·</span>}
            {lead.phone && <span>{lead.phone}</span>}
          </div>
          <div className="lead-detail-sub" style={{ marginTop: 2 }}>
            <span style={{ color: '#8080A8' }}>{lead.days_since_created === 0 ? 'Submitted today' : `${lead.days_since_created} days ago`}</span>
          </div>
        </div>

        {/* Tabs — just 2 */}
        <div className="lead-detail-tabs">
          <button className={`lead-detail-tab${tab === 'overview' ? ' active' : ''}`} onClick={() => setTab('overview')}>Overview</button>
          <button className={`lead-detail-tab${tab === 'form' ? ' active' : ''}`} onClick={() => setTab('form')}>Contact Form</button>
        </div>

        {/* Star's Recommendation — STATIC between tabs, always visible */}
        {canEdit && lead.stage !== 'enrolled' && (
          <div style={{ padding: '12px 18px 0', flexShrink: 0, maxHeight: '40vh', overflowY: 'auto' }} className="star-recommendation-scroll">
                <div className="lead-star-section" style={lead.stage === 'lost' ? { background: 'rgba(239,68,68,0.03)', borderColor: 'rgba(239,68,68,0.12)' } : undefined}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div className="lead-star-icon" style={lead.stage === 'lost' ? { background: 'linear-gradient(135deg, #EF4444, #FF7730)' } : undefined}><Star size={13} /></div>
                      <span style={{ fontSize: 13, fontWeight: 700, color: lead.stage === 'lost' ? '#EF4444' : '#FFB800' }}>
                        {lead.stage === 'lost' ? "Here's How We Get Them Back" : "Star's Recommendation"}
                      </span>
                    </div>
                    <button
                      className="btn-outline"
                      onClick={() => aiMatch.runMatch(lead.id, tenantId!)}
                      disabled={aiMatch.isLoading}
                      style={{ fontSize: 11, padding: '5px 14px' }}
                    >
                      {aiMatch.isLoading ? 'Analyzing...' : aiMatch.result ? 'Re-analyze' : lead.stage === 'lost' ? 'Get Recovery Plan' : 'Find Best Teacher'}
                    </button>
                  </div>
                  {aiMatch.error && <div className="form-error" style={{ fontSize: 11 }}>{aiMatch.error}</div>}
                  {aiMatch.result && aiMatch.result.recommendations.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {aiMatch.result.recommendations.map((rec: TeacherMatch, i: number) => (
                        <div key={rec.teacher_id} className="lead-star-match">
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                            <span className="lead-star-rank">#{i + 1}</span>
                            <span style={{ fontSize: 14, fontWeight: 700, color: '#FFFFFF' }}>{rec.teacher_name}</span>
                            <span className={rec.match_score >= 80 ? 'badge-green' : rec.match_score >= 65 ? 'badge-gold' : 'badge-red'} style={{ fontSize: 10 }}>{rec.match_score}%</span>
                          </div>
                          <p style={{ fontSize: 12.5, color: '#A0A0C8', lineHeight: 1.5, marginBottom: 8 }}>{rec.match_reason}</p>
                          {rec.suggested_slots.length > 0 && (
                            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                              {rec.suggested_slots.slice(0, 3).map((slot: any) => (
                                <button key={slot.block_id} className="lead-star-slot" onClick={onConvert}>
                                  {new Date(slot.date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                                  {' '}
                                  {(() => { const [h,m] = slot.start.split(':'); const hr = parseInt(h); return `${hr > 12 ? hr-12 : hr}:${m}${hr >= 12 ? 'pm' : 'am'}` })()}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                  {aiMatch.result && aiMatch.result.recommendations.length === 0 && !aiMatch.result.recovery_analysis && (
                    <p style={{ fontSize: 12.5, color: '#8080A8' }}>No matching teachers found. Try adjusting the lead's location or instrument.</p>
                  )}
                  {/* Recovery analysis for lost leads */}
                  {aiMatch.result?.recovery_analysis && (
                    <div style={{ marginTop: 12, padding: 14, background: lead.stage === 'lost' ? 'rgba(239,68,68,0.04)' : 'rgba(255,184,0,0.03)', border: `1px solid ${lead.stage === 'lost' ? 'rgba(239,68,68,0.12)' : 'rgba(255,184,0,0.1)'}`, borderRadius: 12 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                        <Star size={11} style={{ color: lead.stage === 'lost' ? '#EF4444' : '#FFB800' }} />
                        <span style={{ fontSize: 11, fontWeight: 700, color: lead.stage === 'lost' ? '#EF4444' : '#FFB800', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                          {lead.stage === 'lost' ? 'Recovery Analysis' : "Star's Analysis"}
                        </span>
                      </div>
                      <div style={{ fontSize: 13, color: '#C0C0E0', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
                        {aiMatch.result.recovery_analysis}
                      </div>
                    </div>
                  )}
                  {!aiMatch.result && !aiMatch.isLoading && (
                    <p style={{ fontSize: 12.5, color: '#8080A8' }}>
                      {lead.stage === 'lost'
                        ? 'Click "Get Recovery Plan" to find out why this lead was lost and how to get them back.'
                        : 'Click "Find Best Teacher" to get Star\'s personalized recommendation.'}
                    </p>
                  )}
                </div>
          </div>
        )}

        {/* Scrollable content */}
        <div className="lead-detail-scroll">

          {/* OVERVIEW TAB */}
          {tab === 'overview' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

              {/* Preferred days — editable */}
              <div className="lead-preferred-days">
                <span className="lead-preferred-label">Preferred Days</span>
                <div className="lead-preferred-list">
                  {['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Saturday'].map((day) => {
                    const currentDays = lead.preferred_days ?? []
                    const isSelected = currentDays.some((d) => d.toLowerCase().startsWith(day.toLowerCase()))
                    return (
                      <span
                        key={day}
                        className={`lead-preferred-day${isSelected ? ' selected' : ''}`}
                        onClick={() => {
                          if (!canEdit) return
                          let updated: string[]
                          if (isSelected) {
                            updated = currentDays.filter((d) => !d.toLowerCase().startsWith(day.toLowerCase()))
                          } else {
                            updated = [...currentDays, day]
                          }
                          updateLead.mutate({ id: lead.id, preferred_days: updated })
                          lead.preferred_days = updated
                        }}
                        style={{ cursor: canEdit ? 'pointer' : 'default' }}
                      >
                        {day.slice(0, 3)}
                      </span>
                    )
                  })}
                </div>
              </div>

              {/* Personality, Learning Style & Goals — editable textarea */}
              <div className="lead-star-section" style={{ background: 'rgba(255,184,0,0.03)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                  <Star size={12} style={{ color: '#FFB800' }} />
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#FFB800', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Personality, Learning Style & Goals</span>
                </div>
                {canEdit ? (
                  <textarea
                    value={personalityDraft}
                    onChange={(e) => { setPersonalityDraft(e.target.value); savePersonality(e.target.value) }}
                    placeholder="Describe the student's personality, learning style, and goals. Star uses this to recommend the best teacher match..."
                    style={{
                      width: '100%', minHeight: 80, fontSize: 13, color: '#E0E0F4', lineHeight: 1.6,
                      background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)',
                      borderRadius: 10, padding: '10px 12px', resize: 'vertical', fontFamily: 'var(--font-body)',
                    }}
                  />
                ) : (
                  <div style={{ fontSize: 13, color: personalityDraft ? '#E0E0F4' : '#8080A8', lineHeight: 1.6, fontStyle: personalityDraft ? 'normal' : 'italic' }}>
                    {personalityDraft || 'No personality or learning style notes provided yet.'}
                  </div>
                )}
                <p style={{ fontSize: 10.5, color: '#8080A8', marginTop: 8, fontStyle: 'italic' }}>
                  Star uses this to build a compatibility profile and recommend the best teacher match.
                </p>
              </div>

              {/* Editable chips — instrument & location can be changed */}
              <div className="lead-modal-chips">
                {/* Instrument — clickable to edit */}
                {editInstrument ? (
                  <select
                    className="lead-modal-chip-edit"
                    value={lead.instrument ?? ''}
                    autoFocus
                    onChange={(e) => { updateLead.mutate({ id: lead.id, instrument: e.target.value }); lead.instrument = e.target.value; setEditInstrument(false) }}
                    onBlur={() => setEditInstrument(false)}
                  >
                    {['guitar','bass','piano','drums','voice','violin','cello','flute','clarinet','saxophone','trumpet','trombone','ukulele'].map((i) => (
                      <option key={i} value={i}>{i.charAt(0).toUpperCase() + i.slice(1)}</option>
                    ))}
                  </select>
                ) : (
                  <div className="lead-modal-chip lead-modal-chip-editable" onClick={() => canEdit && setEditInstrument(true)}>
                    <Music size={12} />
                    {instrumentDisplay ?? '—'}
                  </div>
                )}

                {/* Location — clickable to edit */}
                {editLocation ? (
                  <select
                    className="lead-modal-chip-edit"
                    value={lead.location_id ?? ''}
                    autoFocus
                    onChange={(e) => {
                      const loc = locations?.find((l) => l.id === e.target.value)
                      updateLead.mutate({ id: lead.id, location_id: e.target.value })
                      if (loc) lead.location_name = loc.name
                      lead.location_id = e.target.value
                      setEditLocation(false)
                    }}
                    onBlur={() => setEditLocation(false)}
                  >
                    {locations?.map((l) => <option key={l.id} value={l.id}>{l.name.replace(' Music Lessons', '')}</option>)}
                  </select>
                ) : (
                  <div className="lead-modal-chip lead-modal-chip-editable" onClick={() => canEdit && setEditLocation(true)}>
                    <MapPin size={12} />
                    {lead.location_name ?? '—'}
                  </div>
                )}

                <div className="lead-modal-chip">
                  <Clock size={12} />
                  {lead.days_since_created === 0 ? 'Today' : `${lead.days_since_created}d ago`}
                </div>
                {(() => {
                  const action = getActionPrompt(lead)
                  return action.text ? (
                    <div className="lead-modal-chip" style={{ color: action.color, borderColor: `${action.color}30`, background: `${action.color}0D` }}>
                      {action.urgent && <span style={{ width: 5, height: 5, borderRadius: '50%', background: action.color, boxShadow: `0 0 6px ${action.color}` }} />}
                      {action.text}
                    </div>
                  ) : null
                })()}
              </div>

              {/* Preferred days removed — moved above chips */}

              {/* Notes */}
              <div className="lead-section-label">Director Notes</div>
              {showNoteInput ? (
                <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                  <input
                    className="form-input"
                    value={noteDraft}
                    onChange={(e) => setNoteDraft(e.target.value)}
                    placeholder="Add a note about this lead..."
                    autoFocus
                    onKeyDown={(e) => { if (e.key === 'Enter') handleAddNote() }}
                    style={{ flex: 1, fontSize: 13, padding: '8px 12px', borderRadius: 10 }}
                  />
                  <button className="btn-primary" onClick={handleAddNote} style={{ fontSize: 11, padding: '6px 14px' }}>Save</button>
                  <button className="btn-ghost" onClick={() => setShowNoteInput(false)} style={{ fontSize: 11 }}>X</button>
                </div>
              ) : (
                <button className="btn-outline" onClick={() => setShowNoteInput(true)} style={{ fontSize: 11, padding: '6px 14px', marginBottom: 8 }}>
                  + Add Note
                </button>
              )}
              {lead.notes ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {(() => {
                    const allNotes = lead.notes.split('\n').filter(Boolean)
                    const visible = showAllNotes ? allNotes : allNotes.slice(0, 2)
                    return (
                      <>
                        {visible.map((note, i) => {
                          // Parse "[timestamp] Name: message" format
                          const match = note.match(/^\[(.+?)\]\s*(\w+):\s*(.+)$/)
                          return (
                            <div key={i} className="lead-note-item">
                              {match ? (
                                <>
                                  <div className="lead-note-header">
                                    <span className="lead-note-author">{match[2]}</span>
                                    <span className="lead-note-time">{match[1]}</span>
                                  </div>
                                  <div className="lead-note-text">{match[3]}</div>
                                </>
                              ) : (
                                <div className="lead-note-text">{note}</div>
                              )}
                            </div>
                          )
                        })}
                        {allNotes.length > 2 && (
                          <button className="btn-ghost" onClick={() => setShowAllNotes(!showAllNotes)} style={{ fontSize: 11, padding: '4px 8px', alignSelf: 'flex-start' }}>
                            {showAllNotes ? 'Show less' : `Show all ${allNotes.length} notes`}
                          </button>
                        )}
                      </>
                    )
                  })()}
                </div>
              ) : (
                <div style={{ fontSize: 12, color: '#8080A8', fontStyle: 'italic' }}>No notes yet. Add a note to track your outreach.</div>
              )}

              {/* Actions */}
              {canEdit && (
                <>
                  {lead.stage === 'lost' ? (
                    <>
                      <div className="lead-section-label">Recovery</div>
                      <button
                        onClick={() => updateStage.mutate({ id: lead.id, stage: 'inquiry' })}
                        disabled={updateStage.isPending}
                        style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '14px 16px', borderRadius: 12, background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.3)', color: '#22C55E', fontSize: 15, fontWeight: 700, cursor: 'pointer', transition: 'all 140ms ease', fontFamily: 'var(--font-body)' }}
                      >
                        Move Back to Active Leads
                      </button>
                    </>
                  ) : (
                    <>
                      <div className="lead-section-label">Move to Stage</div>
                      {(() => {
                        const stageOrder = ['inquiry', 'contacted', 'scheduled'] as const
                        const currentIdx = stageOrder.indexOf(lead.stage as any)
                        const forwardStages = stageOrder.filter((_, i) => i > currentIdx)
                        const stageButtonColors: Record<string, { color: string; bg: string; border: string }> = {
                          inquiry: { color: '#FF7730', bg: 'rgba(255,119,48,0.08)', border: 'rgba(255,119,48,0.2)' },
                          contacted: { color: '#E0E0F4', bg: 'rgba(255,255,255,0.06)', border: 'rgba(255,255,255,0.15)' },
                          scheduled: { color: '#FFB800', bg: 'rgba(255,184,0,0.08)', border: 'rgba(255,184,0,0.2)' },
                        }
                        return forwardStages.length > 0 ? (
                          <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
                            {forwardStages.map((s) => {
                              const c = stageButtonColors[s]
                              return (
                                <button key={s} className="lead-stage-btn" onClick={() => updateStage.mutate({ id: lead.id, stage: s })} disabled={updateStage.isPending}
                                  style={{ flex: 1, color: c.color, background: c.bg, borderColor: c.border }}>
                                  {stageLabels[s]}
                                </button>
                              )
                            })}
                          </div>
                        ) : null
                      })()}
                      {!['enrolled', 'lost'].includes(lead.stage) && (
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button onClick={onEnroll} disabled={updateStage.isPending}
                            style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '12px 16px', borderRadius: 12, background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.3)', color: '#22C55E', fontSize: 14, fontWeight: 700, cursor: 'pointer', transition: 'all 140ms ease', fontFamily: 'var(--font-body)' }}>
                            Enroll Student
                          </button>
                          <button onClick={() => onMarkLost(lead)} disabled={updateStage.isPending}
                            style={{ padding: '12px 16px', borderRadius: 12, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: '#EF4444', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
                            Lost
                          </button>
                        </div>
                      )}
                    </>
                  )}
                </>
              )}

              {/* Activity — always last */}
              <div className="lead-section-label" style={{ marginTop: 8 }}>Activity</div>
              <div className="lead-activity-item">
                <div className="lead-activity-dot" />
                <div>
                  <div style={{ fontSize: 12.5, color: '#E0E0F4' }}>Lead created from {lead.source ?? 'intake form'}</div>
                  <div style={{ fontSize: 10, color: '#606088', marginTop: 2 }}>{new Date(lead.created_at).toLocaleString()}</div>
                </div>
              </div>
            </div>
          )}

          {/* CONTACT FORM TAB — complete intake snapshot */}
          {tab === 'form' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

              {/* Student Info */}
              <div className="lead-form-section">
                <div className="lead-form-section-title">Student Information</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <div className="lead-modal-field"><div className="lead-modal-field-label">Student Name</div><div className="lead-modal-field-value">{studentName}</div></div>
                  <div className="lead-modal-field"><div className="lead-modal-field-label">Parent / Guardian</div><div className="lead-modal-field-value">{parentName ?? '—'}</div></div>
                  <div className="lead-modal-field"><div className="lead-modal-field-label">Email</div><div className="lead-modal-field-value">{lead.email ?? '—'}</div></div>
                  <div className="lead-modal-field"><div className="lead-modal-field-label">Phone</div><div className="lead-modal-field-value">{lead.phone ?? '—'}</div></div>
                  <div className="lead-modal-field"><div className="lead-modal-field-label">Age Range</div><div className="lead-modal-field-value">{lead.age ?? (lead as any).age_range ?? '—'}</div></div>
                </div>
              </div>

              {/* Personality & Goals — synced with Overview tab via personalityDraft */}
              <div className="lead-star-section" style={{ background: 'rgba(255,184,0,0.03)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                  <Star size={12} style={{ color: '#FFB800' }} />
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#FFB800', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Personality, Learning Style & Goals</span>
                </div>
                {canEdit ? (
                  <textarea
                    value={personalityDraft}
                    onChange={(e) => { setPersonalityDraft(e.target.value); savePersonality(e.target.value) }}
                    placeholder="Describe the student's personality, learning style, and goals. Star uses this to recommend the best teacher match..."
                    style={{
                      width: '100%', minHeight: 80, fontSize: 13, color: '#E0E0F4', lineHeight: 1.6,
                      background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)',
                      borderRadius: 10, padding: '10px 12px', resize: 'vertical', fontFamily: 'var(--font-body)',
                    }}
                  />
                ) : (
                  <div style={{ fontSize: 13, color: personalityDraft ? '#E0E0F4' : '#8080A8', lineHeight: 1.6, fontStyle: personalityDraft ? 'normal' : 'italic' }}>
                    {personalityDraft || 'No personality or learning style notes provided yet.'}
                  </div>
                )}
                <p style={{ fontSize: 10.5, color: '#8080A8', marginTop: 10, fontStyle: 'italic' }}>
                  Star uses this to build a compatibility profile and recommend the best teacher match.
                </p>
              </div>

              {/* Lesson Preferences */}
              <div className="lead-form-section">
                <div className="lead-form-section-title">Lesson Preferences</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <div className="lead-modal-field"><div className="lead-modal-field-label">Instrument</div><div className="lead-modal-field-value">{instrumentDisplay ?? '—'}</div></div>
                  <div className="lead-modal-field"><div className="lead-modal-field-label">Experience Level</div><div className="lead-modal-field-value">{(lead as any).experience ?? '—'}</div></div>
                  <div className="lead-modal-field"><div className="lead-modal-field-label">Has Instrument</div><div className="lead-modal-field-value">{(lead as any).has_instrument ?? '—'}</div></div>
                  <div className="lead-modal-field"><div className="lead-modal-field-label">Military</div><div className="lead-modal-field-value">{lead.is_military ? <span className="badge-gold">Yes</span> : 'No'}</div></div>
                </div>
              </div>

              {/* Location & Scheduling */}
              <div className="lead-form-section">
                <div className="lead-form-section-title">Location & Scheduling</div>
                <div className="lead-modal-field"><div className="lead-modal-field-label">Preferred Location</div><div className="lead-modal-field-value">{lead.location_name ?? '—'}</div></div>
                {(lead as any).preferred_locations && (lead as any).preferred_locations.length > 0 && (
                  <div className="lead-modal-field" style={{ marginTop: 8 }}>
                    <div className="lead-modal-field-label">Also Works</div>
                    <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginTop: 4 }}>
                      {(lead as any).preferred_locations.map((loc: string) => <span key={loc} className="lead-info-chip" style={{ fontSize: 11 }}>{loc}</span>)}
                    </div>
                  </div>
                )}
                {lead.preferred_days && lead.preferred_days.length > 0 && (
                  <div className="lead-modal-field" style={{ marginTop: 8 }}>
                    <div className="lead-modal-field-label">What Days Work Best</div>
                    <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginTop: 4 }}>
                      {lead.preferred_days.map((d) => <span key={d} className="lead-info-chip" style={{ fontSize: 11 }}>{d}</span>)}
                    </div>
                  </div>
                )}
                {lead.preferred_times && (
                  <div className="lead-modal-field" style={{ marginTop: 8 }}><div className="lead-modal-field-label">Preferred Time</div><div className="lead-modal-field-value">{lead.preferred_times}</div></div>
                )}
              </div>

              {/* Source */}
              <div className="lead-form-section">
                <div className="lead-form-section-title">Source</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <div className="lead-modal-field"><div className="lead-modal-field-label">How They Heard About Us</div><div className="lead-modal-field-value">{lead.source ?? '—'}</div></div>
                  <div className="lead-modal-field"><div className="lead-modal-field-label">Submitted</div><div className="lead-modal-field-value">{new Date(lead.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</div></div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════
// ADD LEAD MODAL
// ═══════════════════════════════════════

const SOURCES = ['walk-in', 'google', 'referral', 'facebook', 'instagram', 'website', 'phone-call', 'event', 'flyer', 'other'] as const

function AddLeadModal({ tenantId, locations, onClose }: { tenantId: string; locations: any[]; onClose: () => void }) {
  const createLead = useCreateLead()

  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [parentName, setParentName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [instrument, setInstrument] = useState('')
  const [locationId, setLocationId] = useState(locations.find(l => l.is_active)?.id ?? '')
  const [stage, setStage] = useState<string>('inquiry')
  const [source, setSource] = useState<string>('walk-in')
  const [isMilitary, setIsMilitary] = useState(false)
  const [notes, setNotes] = useState('')

  // Second student
  const [hasSecondStudent, setHasSecondStudent] = useState(false)
  const [firstName2, setFirstName2] = useState('')
  const [lastName2, setLastName2] = useState('')
  const [instrument2, setInstrument2] = useState('')

  const canSave = firstName.trim().length > 0 && instrument !== ''

  async function handleSave() {
    if (!canSave) return
    try {
      const shared = {
        tenant_id: tenantId,
        parent_name: parentName.trim() || undefined,
        email: email.trim() || undefined,
        phone: phone.trim() || undefined,
        location_id: locationId || undefined,
        stage,
        source,
        notes: notes.trim() || undefined,
        is_military: isMilitary,
      }
      await createLead.mutateAsync({
        ...shared,
        first_name: firstName.trim(),
        last_name: lastName.trim() || undefined,
        instrument: instrument || undefined,
      })
      // Create second student lead under same family info
      if (hasSecondStudent && firstName2.trim()) {
        await createLead.mutateAsync({
          ...shared,
          first_name: firstName2.trim(),
          last_name: lastName2.trim() || lastName.trim() || undefined,
          instrument: instrument2 || undefined,
        })
      }
      toast(hasSecondStudent && firstName2.trim() ? '2 leads added' : 'Lead added', 'success')
      onClose()
    } catch {
      toast('Failed to create lead', 'error')
    }
  }

  const labelStyle: React.CSSProperties = { fontSize: 10, fontWeight: 700, color: '#A0A0C0', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 4 }
  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '10px 14px', borderRadius: 8, boxSizing: 'border-box',
    background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
    color: '#F0F0FF', fontFamily: 'inherit', fontSize: 13, outline: 'none',
  }
  const selectStyle: React.CSSProperties = { ...inputStyle, cursor: 'pointer' }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 10000, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', overflowY: 'auto', padding: '40px 16px' }} onClick={onClose}>
      <div style={{
        width: '100%', maxWidth: 560, background: '#141224', borderRadius: 20,
        border: '1px solid rgba(212,34,106,0.2)',
        boxShadow: '0 40px 100px rgba(0,0,0,0.6), 0 0 80px rgba(212,34,106,0.08)',
      }} onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div style={{ padding: '20px 24px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 20, fontWeight: 800, color: '#F0F0FF', letterSpacing: '-0.02em' }}>Add Active Lead</div>
            <div style={{ fontSize: 12, color: '#A0A0C8', marginTop: 2 }}>Walk-in, phone call, or manual entry</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#A0A0C8' }}><X size={20} /></button>
        </div>

        <div style={{ padding: '20px 24px' }}>
          {/* Stage selector — prominent */}
          <div style={{ marginBottom: 20 }}>
            <label style={labelStyle}>What stage are they at?</label>
            <div style={{ display: 'flex', gap: 6 }}>
              {(['inquiry', 'contacted', 'scheduled'] as const).map(s => (
                <button key={s} onClick={() => setStage(s)} style={{
                  flex: 1, padding: '10px 0', borderRadius: 10, fontSize: 12, fontWeight: 700, cursor: 'pointer',
                  background: stage === s ? `${STAGE_COLORS[s]}18` : 'rgba(255,255,255,0.03)',
                  color: stage === s ? STAGE_COLORS[s] : '#A0A0C8',
                  border: `1.5px solid ${stage === s ? STAGE_COLORS[s] : 'rgba(255,255,255,0.06)'}`,
                  transition: 'all 140ms ease',
                }}>
                  {STAGE_LABELS[s]}
                </button>
              ))}
            </div>
            <div style={{ fontSize: 11, color: '#8080A8', marginTop: 6 }}>
              {stage === 'inquiry' && 'Brand new — hasn\'t been contacted yet'}
              {stage === 'contacted' && 'Already spoken to — awaiting their reply'}
              {stage === 'scheduled' && 'Trial lesson or tour is booked'}
            </div>
          </div>

          {/* Name row */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
            <div>
              <label style={labelStyle}>Student First Name *</label>
              <input value={firstName} onChange={e => setFirstName(e.target.value)} placeholder="First name" style={inputStyle} autoFocus />
            </div>
            <div>
              <label style={labelStyle}>Last Name</label>
              <input value={lastName} onChange={e => setLastName(e.target.value)} placeholder="Last name" style={inputStyle} />
            </div>
          </div>

          {/* Parent + contact */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
            <div>
              <label style={labelStyle}>Parent / Guardian</label>
              <input value={parentName} onChange={e => setParentName(e.target.value)} placeholder="Parent name" style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Phone</label>
              <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="(555) 123-4567" style={inputStyle} />
            </div>
          </div>

          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>Email</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="email@example.com" style={inputStyle} />
          </div>

          {/* Instrument + Location + Source */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 14 }}>
            <div>
              <label style={labelStyle}>Instrument *</label>
              <select value={instrument} onChange={e => setInstrument(e.target.value)} style={{ ...selectStyle, borderColor: instrument ? 'rgba(255,255,255,0.1)' : 'rgba(239,68,68,0.3)' }}>
                <option value="">— Select —</option>
                {CORE_INSTRUMENTS.map(i => <option key={i} value={i}>{i.charAt(0).toUpperCase() + i.slice(1)}</option>)}
                <option disabled>──────────</option>
                {OTHER_INSTRUMENTS.map(i => <option key={i} value={i}>{i.charAt(0).toUpperCase() + i.slice(1)}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Location</label>
              <select value={locationId} onChange={e => setLocationId(e.target.value)} style={selectStyle}>
                <option value="">— Select —</option>
                {locations.filter(l => l.is_active).map(l => (
                  <option key={l.id} value={l.id}>{l.name.replace(' Music Lessons', '')}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Source</label>
              <select value={source} onChange={e => setSource(e.target.value)} style={selectStyle}>
                {SOURCES.map(s => (
                  <option key={s} value={s}>{s.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Add second student toggle */}
          <div style={{ marginBottom: 14 }}>
            <label style={{
              display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600,
              color: hasSecondStudent ? '#D4226A' : '#A0A0C8',
              padding: '8px 14px', borderRadius: 8,
              background: hasSecondStudent ? 'rgba(212,34,106,0.08)' : 'rgba(255,255,255,0.03)',
              border: `1px solid ${hasSecondStudent ? 'rgba(212,34,106,0.2)' : 'rgba(255,255,255,0.06)'}`,
              width: 'fit-content', transition: 'all 140ms ease',
            }}>
              <input type="checkbox" checked={hasSecondStudent} onChange={e => setHasSecondStudent(e.target.checked)} style={{ accentColor: '#D4226A' }} />
              Add a second student (sibling)
            </label>
          </div>

          {/* Second student fields */}
          {hasSecondStudent && (
            <div style={{
              marginBottom: 14, padding: '14px 16px', borderRadius: 12,
              background: 'rgba(212,34,106,0.04)', border: '1px solid rgba(212,34,106,0.12)',
            }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#E8488A', marginBottom: 10 }}>Second Student</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                <div>
                  <label style={labelStyle}>First Name *</label>
                  <input value={firstName2} onChange={e => setFirstName2(e.target.value)} placeholder="First name" style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Last Name</label>
                  <input value={lastName2} onChange={e => setLastName2(e.target.value)} placeholder={lastName || 'Last name'} style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Instrument</label>
                  <select value={instrument2} onChange={e => setInstrument2(e.target.value)} style={selectStyle}>
                    <option value="">— Select —</option>
                    {CORE_INSTRUMENTS.map(i => <option key={i} value={i}>{i.charAt(0).toUpperCase() + i.slice(1)}</option>)}
                    <option disabled>──────────</option>
                    {OTHER_INSTRUMENTS.map(i => <option key={i} value={i}>{i.charAt(0).toUpperCase() + i.slice(1)}</option>)}
                  </select>
                </div>
              </div>
              <div style={{ fontSize: 11, color: '#A0A0C8', marginTop: 8 }}>
                Same parent, contact info, and location will be shared.
              </div>
            </div>
          )}

          {/* Military toggle */}
          <div style={{ marginBottom: 14 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600, color: isMilitary ? '#FFB800' : '#A0A0C8', padding: '8px 14px', borderRadius: 8, background: isMilitary ? 'rgba(255,184,0,0.1)' : 'rgba(255,255,255,0.03)', border: `1px solid ${isMilitary ? 'rgba(255,184,0,0.25)' : 'rgba(255,255,255,0.06)'}`, width: 'fit-content' }}>
              <input type="checkbox" checked={isMilitary} onChange={e => setIsMilitary(e.target.checked)} style={{ accentColor: '#FFB800' }} />
              Military Family
            </label>
          </div>

          {/* Notes */}
          <div style={{ marginBottom: 20 }}>
            <label style={labelStyle}>Notes</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Any context — walk-in details, what they're looking for, etc." rows={3} style={{ ...inputStyle, resize: 'vertical' }} />
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={onClose} style={{
              flex: 1, padding: '12px 0', borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: 'pointer',
              background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#A0A0C8',
            }}>
              Cancel
            </button>
            <button onClick={handleSave} disabled={!canSave || createLead.isPending} style={{
              flex: 2, padding: '12px 0', borderRadius: 10, border: 'none', fontSize: 14, fontWeight: 700,
              cursor: !canSave || createLead.isPending ? 'default' : 'pointer',
              background: !canSave || createLead.isPending ? '#606088' : '#D4226A', color: '#fff',
              boxShadow: !canSave ? 'none' : '0 4px 20px rgba(212,34,106,0.3)',
              transition: 'all 140ms ease',
            }}>
              {createLead.isPending ? 'Adding...' : 'Add Lead'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
