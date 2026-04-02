import { useState, useMemo, useRef } from 'react'
import { createPortal } from 'react-dom'
import MusicLoader from '../../components/shared/MusicLoader'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuthContext } from '../../app/AuthContext'
import { usePermissions } from '../../hooks/usePermissions'
import { useLocations } from '../../hooks/useLocations'
import { useFamiliesPage, useFamilyDetail, useUpdateFamilyInfo, useChangeFamilyBillingStatus, useFamilyFiles, useUploadFamilyFile, useDeleteFamilyFile, useFamilyActivityLog, type Family, type FamilyFile, type ActivityEvent } from '../../hooks/useFamilies'
import { formatRate, getRateTierColor } from '../../hooks/useFamilyRate'
import { useAI } from '../../hooks/useAI'
import { toast } from '../../components/shared/Toast'
import ConfirmModal from '../../components/shared/ConfirmModal'
import { X, Lock, Shield, CreditCard, Users, Pencil, Upload, Trash2, FileText, Star, ChevronRight, ChevronDown, Receipt, Bell } from 'lucide-react'
import { useReactivateStudent } from '../../hooks/useRetention'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { DEFAULT_SESSIONS_PER_MONTH } from '../../lib/constants'
import { supabase, getCurrentBillingCycleId } from '../../lib/supabase'
import { calculatePreviewRate } from '../../hooks/useFamilyRate'

// ═══════════════════════════════════════
// DISPLAY HELPERS
// ═══════════════════════════════════════

function stripFamily(name: string | null | undefined): string {
  if (!name) return '---'
  return name.replace(/\s+family$/i, '').trim() || name
}

function formatDollars(cents: number | null | undefined): string {
  if (cents == null || cents === 0) return '$0.00'
  const abs = Math.abs(cents) / 100
  const formatted = abs.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return cents < 0 ? `-$${formatted}` : `$${formatted}`
}

// ═══════════════════════════════════════
// RATE TIER COLORS (edge + filter)
// ═══════════════════════════════════════

const RATE_EDGE_COLORS: Record<number, { solid: string; bg: string }> = {
  4500: { solid: '#22C55E', bg: 'rgba(34,197,94,0.15)' },    // Full price — green
  4000: { solid: '#FFB800', bg: 'rgba(255,184,0,0.15)' },    // Discount — yellow
  3750: { solid: '#EF4444', bg: 'rgba(239,68,68,0.15)' },    // Deep discount — red
}

function getRateEdge(rateTier: number) {
  return RATE_EDGE_COLORS[rateTier] ?? RATE_EDGE_COLORS[4500]
}

const RATE_OPTIONS = [
  { label: 'All Rates', value: 0 },
  { label: '$45.00', value: 4500 },
  { label: '$40.00', value: 4000 },
  { label: '$37.50', value: 3750 },
]

const STATUS_BADGE: Record<string, { bg: string; border: string; color: string }> = {
  active:    { bg: 'rgba(34,197,94,0.12)',  border: 'rgba(34,197,94,0.25)',  color: '#22C55E' },
  paused:    { bg: 'rgba(255,184,0,0.12)',  border: 'rgba(255,184,0,0.25)',  color: '#FFB800' },
  suspended: { bg: 'rgba(255,120,0,0.12)',  border: 'rgba(255,120,0,0.25)',  color: '#FF7800' },
  cancelled: { bg: 'rgba(255,255,255,0.04)', border: 'rgba(255,255,255,0.08)', color: '#8080A8' },
}

// Inline-editable field styles
const labelStyle: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: '#A0A0C8', textTransform: 'uppercase', letterSpacing: '0.08em' }
const valueStyle: React.CSSProperties = { marginTop: 3, fontSize: 14, color: '#D0D0E8' }
const sectionLabelStyle: React.CSSProperties = { fontSize: 12, fontWeight: 700, color: '#6060A0', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10, paddingBottom: 6, borderBottom: '1px solid rgba(255,255,255,0.06)' }

// ═══════════════════════════════════════
// FAMILIES PAGE
// ═══════════════════════════════════════

export default function Families() {
  const { role } = useAuthContext()
  const { isAtLeast } = usePermissions()
  const navigate = useNavigate()
  const { data: families, isLoading, error } = useFamiliesPage()
  const { data: locations } = useLocations()

  const [search, setSearch] = useState('')
  const [familyTab, setFamilyTab] = useState<'active' | 'inactive' | 'all'>('active')
  const [locationFilters, setLocationFilters] = useState<Set<string>>(new Set())
  const [rateFilter, setRateFilter] = useState<number>(0)
  const [searchParams] = useSearchParams()
  const initialFamily = searchParams.get('family')
  const [selectedFamilyId, setSelectedFamilyId] = useState<string | null>(initialFamily)

  const canEdit = role === 'owner' || role === 'admin'
  const canExport = role === 'owner' || role === 'admin' || role === 'company_director'
  const canView = isAtLeast('studio_director')
  const [showExport, setShowExport] = useState(false)

  if (!canView && !isLoading) {
    navigate('/login', { replace: true })
    return null
  }

  const allActive = useMemo(() => families?.filter((f) => (f.billing_status ?? 'active') !== 'cancelled') ?? [], [families])
  const allInactive = useMemo(() => families?.filter((f) => (f.billing_status ?? 'active') === 'cancelled') ?? [], [families])
  const allFamilies = families ?? []
  const baseList = familyTab === 'all' ? allFamilies : familyTab === 'active' ? allActive : allInactive

  const filtered = useMemo(() => {
    return baseList.filter((f) => {
      if (locationFilters.size > 0 && (!f.locationName || !locationFilters.has(f.locationName))) return false
      if (rateFilter && f.rate_tier !== rateFilter) return false
      if (search) {
        const q = search.toLowerCase()
        const haystack = `${f.name} ${f.parent_name ?? ''} ${f.primary_contact_name ?? ''} ${f.primary_email ?? ''} ${f.primary_phone ?? ''}`.toLowerCase()
        if (!haystack.includes(q)) return false
      }
      return true
    })
  }, [baseList, search, locationFilters, rateFilter])

  // Location counts from the current baseList
  const locCounts = useMemo(() => {
    const map = new Map<string, number>()
    baseList.forEach(f => { if (f.locationName) map.set(f.locationName, (map.get(f.locationName) ?? 0) + 1) })
    return map
  }, [baseList])

  function toggleLoc(name: string) {
    setLocationFilters(s => { const n = new Set(s); n.has(name) ? n.delete(name) : n.add(name); return n })
  }

  if (isLoading) {
    return (
      <div className="page">
        <div className="page-header"><h1>Families</h1></div>
        <div className="loading-screen" style={{ height: 200 }}><MusicLoader /></div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="page">
        <div className="page-header"><h1>Families</h1></div>
        <div className="form-error">Failed to load: {(error as Error).message}</div>
      </div>
    )
  }

  return (
    <div className="page">
      {/* HEADER — stat bar */}
      <div className="page-header">
        <h1 style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 28, letterSpacing: '0.5px', marginRight: 16 }}>Families</h1>
        <span style={{ fontSize: 13, color: '#94A3B8' }}>
          <strong style={{ color: '#E0E0F4' }}>{allActive.length}</strong> Active
          <span style={{ margin: '0 6px', color: '#363656' }}>&middot;</span>
          <strong style={{ color: '#E0E0F4' }}>{allInactive.length}</strong> Inactive
          <span style={{ margin: '0 6px', color: '#363656' }}>&middot;</span>
          <strong style={{ color: '#E0E0F4' }}>{allFamilies.length}</strong> Total
        </span>
        {canExport && (
          <button className="btn-ghost" onClick={() => setShowExport(true)} style={{ fontSize: 11, marginLeft: 'auto' }}>Export CSV</button>
        )}
      </div>

      {/* SEARCH + FILTERS — one line */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="\u{1F50D} Search families..." className="filter-select" style={{ flex: 1, minWidth: 180, fontSize: 13, padding: '8px 14px', borderRadius: 10, background: '#141420', border: '1px solid #1C1C2A', color: '#F0EEF8' }} />
        <select value={familyTab} onChange={e => setFamilyTab(e.target.value as any)} style={{
          padding: '8px 14px', borderRadius: 10, background: '#141420', border: '1px solid #1C1C2A',
          color: '#F0EEF8', fontSize: 13, fontFamily: 'inherit', outline: 'none', cursor: 'pointer',
        }}>
          <option value="all">All</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
        <select value={rateFilter} onChange={e => setRateFilter(Number(e.target.value))} style={{
          padding: '8px 14px', borderRadius: 10, background: '#141420', border: '1px solid #1C1C2A',
          color: '#F0EEF8', fontSize: 13, fontFamily: 'inherit', outline: 'none', cursor: 'pointer',
        }}>
          <option value={0}>All Rates</option>
          {RATE_OPTIONS.filter(r => r.value).map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
        </select>
        <span style={{ fontSize: 12, color: '#8080A8', whiteSpace: 'nowrap' }}>{filtered.length} showing</span>
      </div>

      {/* LOCATION PILLS — prominent, color-coded, multi-select */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        {locations?.filter((l: any) => l.is_active).map((loc: any) => {
          const locName = loc.name.replace(' Music Lessons', '')
          const isOn = locationFilters.has(locName)
          const c = loc.color ?? '#D4226A'
          const count = locCounts.get(locName) ?? 0
          return (
            <button key={loc.id} onClick={() => toggleLoc(locName)} style={{
              padding: '9px 24px', borderRadius: 100, fontSize: 14, fontWeight: 700, cursor: 'pointer',
              background: isOn ? c : '#1C1C2A',
              color: isOn ? '#fff' : c,
              border: isOn ? 'none' : `1.5px solid ${c}66`,
              boxShadow: isOn ? `0 0 14px ${c}66` : 'none',
              transition: 'all 0.2s',
            }}>
              {locName} ({count})
            </button>
          )
        })}
      </div>

      {/* Family Cards with alpha grouping */}
      <div className="lead-cards">
        {filtered.length > 0 ? (() => {
          if (locationFilters.size > 0) {
            return filtered.map((f) => (
              <FamilyCard key={f.id} family={f} onClick={() => setSelectedFamilyId(f.id)} />
            ))
          }
          let lastLetter = ''
          return filtered.map((f) => {
            const letter = stripFamily(f.name).charAt(0).toUpperCase() || '#'
            const showHeader = letter !== lastLetter
            lastLetter = letter
            return (
              <div key={f.id}>
                {showHeader && (
                  <div style={{ fontSize: 11, fontWeight: 600, color: '#606088', padding: '12px 0 4px 16px', letterSpacing: '0.05em', textTransform: 'uppercase' }}>{letter}</div>
                )}
                <FamilyCard family={f} onClick={() => setSelectedFamilyId(f.id)} />
              </div>
            )
          })
        })() : (
          <div className="empty-state">No {familyTab} families found.</div>
        )}
      </div>

      {selectedFamilyId && (
        <FamilyDetailModal
          familyId={selectedFamilyId}
          canEdit={canEdit}
          onClose={() => setSelectedFamilyId(null)}
          onNavigateStudent={(id) => { setSelectedFamilyId(null); navigate(`/admin/students/${id}`) }}
        />
      )}

      {/* Export Modal */}
      {showExport && families && (
        <div className="modal-overlay" onClick={() => setShowExport(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 400 }}>
            <div className="modal-header">
              <span className="modal-title">Export Families CSV</span>
              <button className="btn-ghost" onClick={() => setShowExport(false)} style={{ padding: '4px 8px' }}>X</button>
            </div>
            <div style={{ padding: 22 }}>
              <p style={{ fontSize: 12.5, color: '#A0A0C8', marginBottom: 16 }}>
                Export {filtered.length} families currently shown (with filters applied).
              </p>
              <button className="btn-primary" style={{ width: '100%', justifyContent: 'center', padding: 12 }} onClick={() => {
                const headers = ['Family Name', 'Parent Name', 'Email', 'Phone', 'Location', 'Rate', 'Billing Status', 'Students', 'Teachers', 'Instruments', 'Lifetime Paid', 'Balance', 'Military']
                const rows = filtered.map((f) => [
                  f.name ?? '',
                  f.parent_name ?? '',
                  f.primary_email ?? '',
                  f.primary_phone ?? '',
                  f.locationName ?? '',
                  `$${(f.rate_tier / 100).toFixed(2)}`,
                  f.billing_status ?? 'active',
                  String(f.activeStudentCount),
                  f.teacherNames?.join('; ') ?? '',
                  f.instrumentList?.join(', ') ?? '',
                  `$${((f.lifetime_paid_cents ?? 0) / 100).toFixed(2)}`,
                  `$${((f.balance ?? 0) / 100).toFixed(2)}`,
                  f.is_military ? 'Yes' : 'No',
                ])
                const csv = [headers, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n')
                const blob = new Blob([csv], { type: 'text/csv' })
                const url = URL.createObjectURL(blob)
                const a = document.createElement('a')
                a.href = url; a.download = `families_export_${new Date().toISOString().split('T')[0]}.csv`; a.click()
                URL.revokeObjectURL(url)
                setShowExport(false)
                toast('Export downloaded', 'success')
              }}>
                Export {filtered.length} Families
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ═══════════════════════════════════════
// FAMILY CARD (inline card pattern)
// ═══════════════════════════════════════

function FamilyCard({ family: f, onClick }: { family: Family; onClick: () => void }) {
  const rateEdge = getRateEdge(f.rate_tier)
  const locColor = f.locationColor ?? '#606088'
  const isInactive = (f.billing_status ?? 'active') === 'cancelled'

  // Build student summary: "1 student · Drums · Payton" or "2 students · Piano, Guitar · Jamie, Jesse"
  const activeStudents = (f.students ?? []).filter(s => s.status === 'active')
  const studentNames = activeStudents.slice(0, 3).map(s => s.first_name).join(', ')
  const studentInstruments = [...new Set(activeStudents.map(s => s.instrument).filter(Boolean))].slice(0, 2).map(i => i.charAt(0).toUpperCase() + i.slice(1)).join(', ')

  return (
    <div className="lead-card" onClick={onClick} style={{ position: 'relative' }}>
      <div className="lead-card-edge" style={{
        background: isInactive ? '#606088' : locColor,
        boxShadow: isInactive ? 'none' : `0 0 12px ${locColor}80`,
      }} />
      <div style={{ flex: 1, padding: '14px 16px', position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
        {/* Row 1: Family name + rate */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: '#E0E0F4' }}>
            {stripFamily(f.name)}
          </span>
          {f.is_military && <span style={{ fontSize: 9, padding: '1px 6px', borderRadius: 4, background: 'rgba(255,184,0,0.15)', color: '#FFB800', border: '1px solid rgba(255,184,0,0.25)', fontWeight: 700, flexShrink: 0 }}>MIL</span>}
          <span style={{
            fontSize: 12, fontWeight: 800, padding: '2px 8px', borderRadius: 6, flexShrink: 0,
            background: isInactive ? 'rgba(255,255,255,0.06)' : rateEdge.solid,
            color: isInactive ? '#606088' : '#1A1A2E',
          }}>
            ${(f.rate_tier / 100).toFixed(0)}
          </span>
        </div>

        {/* Row 2: Email · Phone */}
        <div style={{ display: 'flex', gap: 10, fontSize: 12, color: '#A0A0C8' }}>
          {f.primary_email && <CopyText value={f.primary_email} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 200 }} />}
          {f.primary_phone && <CopyText value={f.primary_phone} />}
        </div>

        {/* Row 3: Students · Instrument · Names */}
        <div style={{ fontSize: 12, color: '#C0C0E0' }}>
          {f.activeStudentCount} student{f.activeStudentCount !== 1 ? 's' : ''}
          {studentInstruments && <span style={{ color: '#8080A8' }}> · {studentInstruments}</span>}
          {studentNames && <span style={{ color: '#8080A8' }}> · {studentNames}</span>}
        </div>

        {/* Row 4: Status pills */}
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 100, ...(f.card_last_four ? { background: 'rgba(74,222,128,0.12)', color: '#4ADE80', border: '1px solid rgba(74,222,128,0.3)' } : { background: 'rgba(248,113,113,0.12)', color: '#F87171', border: '1px solid rgba(248,113,113,0.3)' }) }}>
            {f.card_last_four ? 'Card ✓' : 'No Card'}
          </span>
          <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 100, ...(f.hasOverdueInvoice ? { background: 'rgba(248,113,113,0.12)', color: '#F87171', border: '1px solid rgba(248,113,113,0.3)' } : f.billing_status === 'paused' ? { background: 'rgba(148,163,184,0.12)', color: '#94A3B8', border: '1px solid rgba(148,163,184,0.3)' } : { background: 'rgba(74,222,128,0.12)', color: '#4ADE80', border: '1px solid rgba(74,222,128,0.3)' }) }}>
            {f.hasOverdueInvoice ? 'Overdue' : f.billing_status === 'paused' ? 'Paused' : 'Current'}
          </span>
        </div>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════
// FAMILY DETAIL MODAL — 2-TAB (Account / Director)
// ═══════════════════════════════════════

type ModalTab = 'account' | 'director'

function FamilyDetailModal({ familyId, canEdit, onClose, onNavigateStudent }: {
  familyId: string; canEdit: boolean; onClose: () => void; onNavigateStudent: (studentId: string) => void
}) {
  const { role, tenantId } = useAuthContext()
  const { data: family, isLoading } = useFamilyDetail(familyId)
  const { data: files } = useFamilyFiles(familyId)
  const updateFamily = useUpdateFamilyInfo()
  const changeBillingStatus = useChangeFamilyBillingStatus()
  const uploadFile = useUploadFamilyFile()
  const deleteFile = useDeleteFamilyFile()
  const { messages: aiMessages, isLoading: aiLoading, sendMessage: aiSend, clearConversation: aiClear } = useAI(tenantId)
  const [activityLimit, setActivityLimit] = useState(20)
  const { data: activityLog } = useFamilyActivityLog(familyId, activityLimit)

  const [tab, setTab] = useState<ModalTab>('account')
  const [confirmAction, setConfirmAction] = useState<{ status: string } | null>(null)
  const [editing, setEditing] = useState(false)
  const [showStar, setShowStar] = useState(false)
  const [showPausedStudents, setShowPausedStudents] = useState(false)
  const reactivateStudent = useReactivateStudent()
  const [uploadType, setUploadType] = useState<string>('other')
  const [uploadNotes, setUploadNotes] = useState('')
  const [showUploadModal, setShowUploadModal] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState<FamilyFile | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [showCreateInvoice, setShowCreateInvoice] = useState(false)
  const [reviewRequested, setReviewRequested] = useState(false)

  // Edit form — one form for all editable fields, toggled by single Edit button
  const [form, setForm] = useState<Record<string, string>>({})

  const canUpload = role === 'owner' || role === 'admin' || role === 'company_director'

  const startEditing = () => {
    if (!family) return
    setForm({
      name: family.name ?? '',
      parent_first_name: family.parent_first_name ?? '',
      parent_last_name: family.parent_last_name ?? '',
      primary_email: family.primary_email ?? '',
      primary_phone: family.primary_phone ?? '',
      emergency_contact_name: family.emergency_contact_name ?? '',
      emergency_contact_phone: family.emergency_contact_phone ?? '',
      emergency_contact_relationship: family.emergency_contact_relationship ?? '',
      billing_notes: family.billing_notes ?? '',
      scheduling_notes: family.scheduling_notes ?? '',
    })
    setEditing(true)
  }

  const cancelEditing = () => { setEditing(false) }

  const handleSave = async () => {
    if (!family) return
    // Build only changed fields
    const updates: Record<string, string> = {}
    const fields = ['name', 'parent_first_name', 'parent_last_name', 'primary_email', 'primary_phone',
      'emergency_contact_name', 'emergency_contact_phone', 'emergency_contact_relationship',
      'billing_notes', 'scheduling_notes']
    for (const f of fields) {
      const original = (family as any)[f] ?? ''
      if (form[f] !== original) updates[f] = form[f]
    }
    if (Object.keys(updates).length === 0) { setEditing(false); return }
    try {
      await updateFamily.mutateAsync({ id: family.id, ...updates })
      toast('Saved', 'success')
      setEditing(false)
    } catch (err: any) { toast(err.message ?? 'Failed to save', 'error') }
  }

  const handleStatusChange = async (newStatus: string) => {
    if (!family) return
    if (newStatus === 'suspended' || newStatus === 'cancelled') { setConfirmAction({ status: newStatus }); return }
    await doStatusChange(newStatus)
  }

  const doStatusChange = async (newStatus: string) => {
    if (!family) return
    try {
      await changeBillingStatus.mutateAsync({ familyId: family.id, oldStatus: family.billing_status, newStatus })
      toast(`Status changed to ${newStatus}`, 'success')
      setConfirmAction(null)
    } catch (err: any) { toast(err.message ?? 'Failed', 'error') }
  }

  const handleUpload = async (file: File) => {
    if (!family || !tenantId) return
    try {
      await uploadFile.mutateAsync({ tenantId, familyId: family.id, file, fileType: uploadType, notes: uploadNotes || undefined })
      toast('File uploaded', 'success')
      setShowUploadModal(false); setUploadNotes('')
    } catch (err: any) { toast(err.message ?? 'Upload failed', 'error') }
  }

  const handleDeleteFile = async (f: FamilyFile) => {
    try {
      await deleteFile.mutateAsync({ fileId: f.id, familyId: f.family_id, fileUrl: f.file_url })
      toast('File deleted', 'success'); setDeleteConfirm(null)
    } catch (err: any) { toast(err.message ?? 'Delete failed', 'error') }
  }

  const askStar = () => {
    if (!family) return
    aiClear(); setShowStar(true)
    const ctx = [
      `Family: ${family.name}`, `Parent: ${family.parent_first_name ?? ''} ${family.parent_last_name ?? family.parent_name ?? ''}`.trim(),
      `Location: ${family.locationName ?? 'Unknown'}`, `Status: ${family.billing_status}`,
      `Rate: $${(family.rate_tier / 100).toFixed(2)}/mo${family.rate_tier_override ? ' (override)' : ''}`,
      `Balance: ${formatDollars(family.balance)}`,
      family.overdue_balance_cents && family.overdue_balance_cents > 0 ? `Overdue: ${formatDollars(family.overdue_balance_cents)}` : null,
      `Lifetime Paid: ${formatDollars(family.lifetime_paid_cents)}`, `Active Students: ${family.activeStudentCount}`,
      family.students.filter(s => s.status === 'active').map(s => `  - ${s.first_name} ${s.last_name}: ${s.instrument}, teacher: ${s.teacher_name}`).join('\n'),
      family.scheduling_notes ? `Scheduling Notes: ${family.scheduling_notes}` : null,
      family.is_military ? 'Military family' : null,
    ].filter(Boolean).join('\n')
    aiSend(`Here is the full context for a family account. Please provide a concise operator summary:\n\n${ctx}`)
  }

  const status = family?.billing_status ?? 'active'
  const statusStyle = STATUS_BADGE[status] ?? STATUS_BADGE.active
  const rateColor = family ? getRateTierColor(family.rate_tier) : getRateTierColor(4500)

  // Field display helpers
  const Field = ({ label, value }: { label: string; value: React.ReactNode }) => (
    <div style={{ marginBottom: 8 }}>
      <span style={labelStyle}>{label}</span>
      <div style={valueStyle}>{value || <span style={{ color: '#363656' }}>—</span>}</div>
    </div>
  )

  const EditInput = ({ field, label }: { field: string; label: string }) => (
    <div style={{ marginBottom: 8 }}>
      <span style={labelStyle}>{label}</span>
      {editing ? (
        <input value={form[field] ?? ''} onChange={(e) => setForm({ ...form, [field]: e.target.value })} className="filter-select" style={{ width: '100%', fontSize: 13, marginTop: 3 }} />
      ) : (
        <div style={valueStyle}>{(family as any)?.[field] || <span style={{ color: '#363656' }}>—</span>}</div>
      )}
    </div>
  )

  const EditTextarea = ({ field, label, placeholder }: { field: string; label: string; placeholder?: string }) => (
    <div style={{ marginBottom: 8 }}>
      <span style={labelStyle}>{label}</span>
      {editing ? (
        <textarea value={form[field] ?? ''} onChange={(e) => setForm({ ...form, [field]: e.target.value })} rows={3} placeholder={placeholder} className="filter-select" style={{ width: '100%', fontSize: 13, marginTop: 3, resize: 'vertical', fontFamily: 'inherit' }} />
      ) : (
        <div style={{ ...valueStyle, whiteSpace: 'pre-wrap' }}>{(family as any)?.[field] || <span style={{ color: '#363656' }}>—</span>}</div>
      )}
    </div>
  )

  return createPortal(
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{
        width: '100%', maxWidth: 800, height: '85vh', display: 'flex', flexDirection: 'column', overflow: 'hidden',
        background: '#141224', borderRadius: 20, border: '1px solid rgba(212,34,106,0.15)',
        boxShadow: '0 0 60px rgba(212,34,106,0.08), 0 24px 60px rgba(0,0,0,0.5)',
      }}>
        <div style={{ height: 3, background: 'linear-gradient(90deg, #D4226A, #7B2CBF)', borderRadius: '20px 20px 0 0' }} />

        {isLoading || !family ? (
          <div style={{ padding: 40, textAlign: 'center' }}><MusicLoader /></div>
        ) : (<>
          {/* ── HEADER ── */}
          <div style={{ padding: '24px 28px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div style={{ fontSize: 22, fontWeight: 800, color: '#E0E0F4' }}>{stripFamily(family.name)}</div>
              <div style={{ fontSize: 14, color: '#A0A0C8', marginTop: 4 }}>
                {family.parent_first_name || family.parent_last_name
                  ? `${family.parent_first_name ?? ''} ${family.parent_last_name ?? ''}`.trim()
                  : family.parent_name ?? '---'}
                {family.is_military && <span style={{ marginLeft: 8, fontSize: 9, padding: '1px 6px', borderRadius: 4, background: 'rgba(255,184,0,0.15)', color: '#FFB800', border: '1px solid rgba(255,184,0,0.25)', fontWeight: 700 }}>MIL</span>}
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 11, fontWeight: 700, padding: '4px 12px', borderRadius: 8, background: statusStyle.bg, border: `1px solid ${statusStyle.border}`, color: statusStyle.color }}>
                {status.charAt(0).toUpperCase() + status.slice(1)}
              </span>
              <button
                disabled={reviewRequested}
                onClick={async () => {
                  if (!family || reviewRequested) return
                  try {
                    await supabase.from('review_requests').insert({
                      tenant_id: family.tenant_id ?? '00000000-0000-0000-0000-000000000001',
                      family_id: family.id,
                      location_id: family.location_id ?? family.students?.[0]?.location_id,
                      sent_at: new Date().toISOString(),
                      trigger_reason: 'manual_family_profile',
                    })
                    setReviewRequested(true)
                    toast(`Review request sent to ${stripFamily(family.name)}`, 'success')
                  } catch { toast('Failed to send review request', 'error') }
                }}
                style={{
                  fontSize: 10, fontWeight: 700, padding: '4px 12px', borderRadius: 8,
                  background: reviewRequested ? 'rgba(34,197,94,0.08)' : 'rgba(212,34,106,0.08)',
                  border: `1px solid ${reviewRequested ? 'rgba(34,197,94,0.2)' : 'rgba(212,34,106,0.2)'}`,
                  color: reviewRequested ? '#22C55E' : '#D4226A',
                  cursor: reviewRequested ? 'default' : 'pointer',
                  display: 'flex', alignItems: 'center', gap: 4,
                }}
              >
                <Star size={10} /> {reviewRequested ? 'Review Requested' : 'Request Review'}
              </button>
              <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, padding: 6, cursor: 'pointer', color: '#8080A8' }}><X size={16} /></button>
            </div>
          </div>

          {/* ── TABS + EDIT BUTTON ── */}
          <div style={{ display: 'flex', alignItems: 'center', padding: '16px 28px 0', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
            <div style={{ display: 'flex', gap: 4, flex: 1 }}>
              {(['account', 'director'] as ModalTab[]).map((t) => (
                <button key={t} onClick={() => { setTab(t); if (editing) cancelEditing() }} style={{
                  padding: '8px 20px', fontSize: 12, fontWeight: 700, cursor: 'pointer', borderRadius: '8px 8px 0 0',
                  background: tab === t ? 'rgba(212,34,106,0.08)' : 'transparent',
                  color: tab === t ? '#E8488A' : '#8080A8',
                  border: tab === t ? '1px solid rgba(212,34,106,0.15)' : '1px solid transparent',
                  borderBottom: tab === t ? '1px solid #141224' : '1px solid transparent', marginBottom: -1,
                }}>{t === 'account' ? 'Account' : 'Director'}</button>
              ))}
            </div>
            {canEdit && !editing && (
              <button onClick={startEditing} className="btn-outline" style={{ fontSize: 11, padding: '5px 14px', display: 'flex', alignItems: 'center', gap: 5, marginBottom: 4 }}>
                <Pencil size={11} /> Edit
              </button>
            )}
            {editing && (
              <div style={{ display: 'flex', gap: 6, marginBottom: 4 }}>
                <button className="btn-ghost" onClick={cancelEditing} style={{ fontSize: 11, padding: '5px 12px' }}>Cancel</button>
                <button className="btn-primary" onClick={handleSave} disabled={updateFamily.isPending} style={{ fontSize: 11, padding: '5px 14px' }}>
                  {updateFamily.isPending ? 'Saving...' : 'Save'}
                </button>
              </div>
            )}
          </div>

          {/* Tab content — scrollable, fixed height */}
          <div style={{ flex: 1, overflowY: 'auto' }}>

          {/* ── TAB 1: ACCOUNT ── */}
          {tab === 'account' && (
            <div style={{ padding: '20px 28px 24px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
                {/* LEFT */}
                <div>
                  <div style={sectionLabelStyle}>Primary Contact</div>
                  <EditInput field="parent_first_name" label="First Name" />
                  <EditInput field="parent_last_name" label="Last Name" />
                  <EditInput field="primary_email" label="Email" />
                  <EditInput field="primary_phone" label="Phone" />
                  {editing && (
                    <div style={{ marginBottom: 8 }}>
                      <span style={labelStyle}>Military</span>
                      <div style={{ marginTop: 4 }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#C0C0E0', cursor: 'pointer' }}>
                          <input type="checkbox" checked={family.is_military} onChange={async (e) => {
                            try { await updateFamily.mutateAsync({ id: family.id, is_military: e.target.checked }); toast('Saved', 'success') } catch { toast('Failed', 'error') }
                          }} style={{ accentColor: '#D4226A' }} />
                          {family.is_military ? 'Yes' : 'No'}
                        </label>
                      </div>
                    </div>
                  )}

                  <div style={{ ...sectionLabelStyle, marginTop: 20 }}>Emergency Contact</div>
                  <EditInput field="emergency_contact_name" label="Name" />
                  <EditInput field="emergency_contact_phone" label="Phone" />
                  <EditInput field="emergency_contact_relationship" label="Relationship" />
                </div>

                {/* RIGHT */}
                <div>
                  <div style={sectionLabelStyle}>Account</div>
                  <EditInput field="name" label="Account Name" />
                  <Field label="Member Since" value={family.created_at ? new Date(family.created_at).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) : '---'} />
                  {family.square_customer_id && <Field label="Adkins Music Lessons ID" value={<span style={{ color: '#606088', fontSize: 11 }}>{family.square_customer_id}</span>} />}
                  {family.locationName && <Field label="Location" value={family.locationName} />}

                  <div style={{ ...sectionLabelStyle, marginTop: 20 }}>Billing</div>
                  <div style={{ marginBottom: 8 }}>
                    <span style={labelStyle}>Rate</span>
                    <div style={{ marginTop: 4 }}>
                      <span style={{
                        fontSize: 13, fontWeight: 700, padding: '4px 12px', borderRadius: 8,
                        background: rateColor.bg, border: `1px solid ${rateColor.border}`, color: rateColor.text,
                        display: 'inline-flex', alignItems: 'center', gap: 4,
                      }}>
                        ${formatRate(family.rate_tier)}/mo
                        {family.rate_tier_override && <Lock size={11} />}
                      </span>
                    </div>
                  </div>
                  <Field label="Card on File" value={family.card_last_four ? (
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><CreditCard size={13} /> {family.card_brand ?? 'Card'} ····{family.card_last_four}</span>
                  ) : <span style={{ color: '#EF4444' }}>No Card</span>} />
                  <div style={{ marginBottom: 8 }}>
                    <span style={labelStyle}>Balance</span>
                    <div style={{ marginTop: 3, fontSize: 16, fontWeight: 800, color: (family.balance ?? 0) > 0 ? '#22C55E' : (family.balance ?? 0) < 0 ? '#EF4444' : '#A0A0C8' }}>
                      {formatDollars(family.balance)}
                    </div>
                  </div>
                  {canEdit && (
                    <button onClick={() => setShowCreateInvoice(true)} style={{
                      marginTop: 8, width: '100%', padding: '10px 0', borderRadius: 10, fontSize: 12, fontWeight: 700,
                      cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                      background: 'rgba(34,197,94,0.1)', color: '#22C55E',
                      border: '1px solid rgba(34,197,94,0.25)',
                    }}>
                      <Receipt size={13} /> Create Invoice
                    </button>
                  )}
                </div>
              </div>

              {/* STUDENTS */}
              <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', marginTop: 20, paddingTop: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                  <Users size={14} style={{ color: '#8080A8' }} />
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#8080A8', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Students ({family.activeStudentCount} active)</span>
                </div>
                {family.students.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {family.students.map((s) => {
                      const isActive = s.status === 'active'
                      return (
                        <div key={s.id} onClick={() => onNavigateStudent(s.id)} style={{
                          padding: '10px 14px', borderRadius: 10, cursor: 'pointer',
                          background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)',
                          display: 'flex', alignItems: 'center', gap: 12, opacity: isActive ? 1 : 0.5,
                        }}>
                          <span style={{ fontSize: 13, fontWeight: 700, color: '#E0E0F4', flex: 1 }}>{s.first_name} {s.last_name}</span>
                          <span style={{ fontSize: 11, color: '#A0A0C8', padding: '2px 8px', borderRadius: 6, background: 'rgba(255,255,255,0.04)' }}>{s.instrument?.charAt(0).toUpperCase()}{s.instrument?.slice(1)}</span>
                          <span style={{ fontSize: 11, color: '#A0A0C8' }}>{s.teacher_name}</span>
                          <span style={{ fontSize: 10, color: '#A0A0C8' }}>{s.sessions_per_month ?? DEFAULT_SESSIONS_PER_MONTH} sessions</span>
                          <ChevronRight size={12} style={{ color: '#363656' }} />
                        </div>
                      )
                    })}
                  </div>
                ) : <div style={{ fontSize: 13, color: '#606088', padding: '12px 0' }}>No students linked to this account.</div>}

                {/* Paused / Inactive students */}
                {(() => {
                  const pausedStudents = family.students.filter((s) => s.status === 'paused' || s.status === 'inactive')
                  if (pausedStudents.length === 0) return null
                  return (
                    <div style={{ marginTop: 12 }}>
                      <button onClick={() => setShowPausedStudents(!showPausedStudents)} style={{
                        background: 'none', border: 'none', cursor: 'pointer', color: '#8080A8',
                        fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6, padding: '4px 0',
                      }}>
                        <ChevronDown size={12} style={{ transform: showPausedStudents ? 'rotate(0deg)' : 'rotate(-90deg)', transition: 'transform 200ms' }} />
                        Paused / Inactive ({pausedStudents.length})
                      </button>
                      {showPausedStudents && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 6 }}>
                          {pausedStudents.map((s) => {
                            const pausedAgo = (s as any).deactivated_at
                              ? Math.round((Date.now() - new Date((s as any).deactivated_at).getTime()) / (30 * 24 * 60 * 60 * 1000))
                              : null
                            return (
                              <div key={s.id} style={{
                                padding: '10px 14px', borderRadius: 10, background: 'rgba(255,255,255,0.02)',
                                border: '1px solid rgba(255,255,255,0.04)', display: 'flex', alignItems: 'center', gap: 12, opacity: 0.7,
                              }}>
                                <span style={{ fontSize: 13, fontWeight: 700, color: '#A0A0C8', flex: 1 }}>{s.first_name} {s.last_name}</span>
                                <span style={{ fontSize: 11, color: '#8080A8' }}>{s.instrument?.charAt(0).toUpperCase()}{s.instrument?.slice(1)}</span>
                                {pausedAgo != null && <span style={{ fontSize: 10, color: '#606088' }}>{pausedAgo}mo ago</span>}
                                {(s as any).pause_reason && <span style={{ fontSize: 10, color: '#606088' }}>{(s as any).pause_reason}</span>}
                                {canEdit && (
                                  <button onClick={(e) => {
                                    e.stopPropagation()
                                    reactivateStudent.mutateAsync({ studentId: s.id, familyId: family.id, tenantId: family.tenant_id })
                                      .then(() => toast('Student reactivated', 'success'))
                                      .catch((err: any) => toast(err.message ?? 'Failed', 'error'))
                                  }} style={{
                                    fontSize: 10, fontWeight: 700, color: '#22C55E', background: 'rgba(34,197,94,0.08)',
                                    border: '1px solid rgba(34,197,94,0.2)', borderRadius: 6, padding: '3px 10px', cursor: 'pointer',
                                  }}>Reactivate</button>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )
                })()}
              </div>

              {/* ACTIVITY LOG */}
              {canEdit && (
                <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', marginTop: 20, paddingTop: 16 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: '#8080A8', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Activity</span>
                    {activityLog && activityLog.length > 0 && <span className="badge-secondary" style={{ fontSize: 9 }}>{activityLog.length}</span>}
                  </div>
                  {activityLog && activityLog.length > 0 ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      {activityLog.map((ev) => (
                        <ActivityRow key={ev.id} event={ev} />
                      ))}
                      {activityLog.length >= activityLimit && (
                        <button onClick={() => setActivityLimit((l) => l + 20)} style={{
                          background: 'none', border: 'none', color: '#8080A8', fontSize: 11, cursor: 'pointer',
                          padding: '8px 0', textAlign: 'center',
                        }}>Show more</button>
                      )}
                    </div>
                  ) : (
                    <div style={{ fontSize: 12, color: '#363656', padding: '8px 0' }}>No activity yet.</div>
                  )}
                </div>
              )}

              {/* NOTIFICATIONS */}
              <NotificationPrefs family={family} />

              {/* STAR AI */}
              <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', marginTop: 16, paddingTop: 16 }}>
                {!showStar ? (
                  <button onClick={askStar} style={{
                    width: '100%', padding: '12px 20px', borderRadius: 12, cursor: 'pointer',
                    background: 'transparent', border: '1px solid rgba(212,34,106,0.25)',
                    color: '#E8488A', fontSize: 13, fontWeight: 700,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                    boxShadow: '0 0 20px rgba(212,34,106,0.06)',
                  }}><Star size={14} /> Ask Star About This Family</button>
                ) : (
                  <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12, padding: 16 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#FFB800', fontSize: 12, fontWeight: 700 }}><Star size={12} /> Star's Summary</div>
                      <button className="btn-ghost" onClick={() => setShowStar(false)} style={{ fontSize: 10, padding: '2px 8px' }}>Close</button>
                    </div>
                    {aiLoading ? <div style={{ fontSize: 13, color: '#8080A8' }}>Thinking...</div>
                      : aiMessages.length > 0 ? <div style={{ fontSize: 13, color: '#C0C0E0', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{aiMessages[aiMessages.length - 1]?.content}</div> : null}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── TAB 2: DIRECTOR ── */}
          {tab === 'director' && (
            <div style={{ padding: '20px 28px 24px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
                {/* LEFT — Billing + Sessions (locked) */}
                <div>
                  <div style={sectionLabelStyle}>Billing</div>
                  <div style={{ marginBottom: 8 }}>
                    <span style={labelStyle}>Rate</span>
                    <div style={{ marginTop: 4 }}>
                      <span style={{
                        fontSize: 13, fontWeight: 700, padding: '4px 12px', borderRadius: 8,
                        background: rateColor.bg, border: `1px solid ${rateColor.border}`, color: rateColor.text,
                        display: 'inline-flex', alignItems: 'center', gap: 4,
                      }}>
                        ${formatRate(family.rate_tier)}/mo
                        {family.rate_tier_override && <Lock size={11} />}
                      </span>
                    </div>
                  </div>
                  <Field label="Billing Day" value={family.billing_day ? `${family.billing_day}${family.billing_day === 1 ? 'st' : 'th'}` : '---'} />
                  <Field label="Card on File" value={family.card_last_four ? (
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><CreditCard size={13} /> {family.card_brand ?? 'Card'} ····{family.card_last_four}</span>
                  ) : <span style={{ color: '#EF4444' }}>No Card</span>} />
                  <div style={{ marginBottom: 8 }}>
                    <span style={labelStyle}>Balance</span>
                    <div style={{ marginTop: 3, fontSize: 16, fontWeight: 800, color: (family.balance ?? 0) > 0 ? '#22C55E' : (family.balance ?? 0) < 0 ? '#EF4444' : '#A0A0C8' }}>
                      {formatDollars(family.balance)}
                    </div>
                  </div>
                  <Field label="Lifetime Paid" value={<span style={{ fontWeight: 700, color: '#A0A0C8' }}>{formatDollars(family.lifetime_paid_cents)}</span>} />
                  {(family.overdue_balance_cents ?? 0) > 0 && <Field label="Overdue" value={<span style={{ fontWeight: 700, color: '#EF4444' }}>{formatDollars(family.overdue_balance_cents)}</span>} />}

                  <div style={{ ...sectionLabelStyle, marginTop: 20 }}>Sessions</div>
                  <Field label="Instruments" value={family.instrumentList.length > 0 ? family.instrumentList.map(i => i.charAt(0).toUpperCase() + i.slice(1)).join(', ') : '—'} />
                  <Field label="Session Days" value={family.sessionDays?.length ? family.sessionDays.join(', ') : '—'} />
                  <Field label="Sessions / Month" value={String(family.totalSessionsPerMonth ?? 0)} />
                </div>

                {/* RIGHT — Notes (editable) + Files */}
                <div>
                  <div style={sectionLabelStyle}>Notes</div>
                  <EditTextarea field="billing_notes" label="Billing Notes" placeholder="Billing-related notes..." />
                  <EditTextarea field="scheduling_notes" label="Scheduling Notes" placeholder="e.g. No Mondays after 6pm, prefers same teacher for siblings..." />

                  <div style={{ ...sectionLabelStyle, marginTop: 20 }}>Files</div>
                  <FileSection label="Contract" fileType="contract" files={files ?? []} canUpload={canUpload} onUpload={() => { setUploadType('contract'); setShowUploadModal(true) }} onDelete={setDeleteConfirm} />
                  <FileSection label="Enrollment Form" fileType="enrollment_form" files={files ?? []} canUpload={canUpload} onUpload={() => { setUploadType('enrollment_form'); setShowUploadModal(true) }} onDelete={setDeleteConfirm} />
                  {(files ?? []).filter(f => !['contract', 'enrollment_form'].includes(f.file_type)).map((f) => (
                    <FileRow key={f.id} file={f} canDelete={canUpload} onDelete={() => setDeleteConfirm(f)} />
                  ))}
                  {canUpload && (
                    <button onClick={() => { setUploadType('other'); setShowUploadModal(true) }} style={{
                      display: 'flex', alignItems: 'center', gap: 6, marginTop: 8, padding: '8px 16px',
                      borderRadius: 8, background: 'rgba(34,197,94,0.06)', border: '1px dashed rgba(34,197,94,0.2)',
                      color: '#22C55E', fontSize: 11, fontWeight: 600, cursor: 'pointer',
                    }}><Upload size={12} /> Add Document</button>
                  )}
                </div>
              </div>

              {/* STATUS ACTIONS */}
              {canEdit && (
                <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', marginTop: 20, paddingTop: 16, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {status !== 'active' && <button className="btn-outline" onClick={() => handleStatusChange('active')} style={{ fontSize: 12, color: '#22C55E', borderColor: 'rgba(34,197,94,0.3)' }}>Set Active</button>}
                  {status !== 'paused' && <button className="btn-outline" onClick={() => handleStatusChange('paused')} style={{ fontSize: 12, color: '#FFB800', borderColor: 'rgba(255,184,0,0.3)' }}>Pause</button>}
                  {status !== 'suspended' && <button className="btn-outline" onClick={() => handleStatusChange('suspended')} style={{ fontSize: 12, color: '#FF7800', borderColor: 'rgba(255,120,0,0.3)' }}>Suspend</button>}
                  {status !== 'cancelled' && <button className="btn-outline" onClick={() => handleStatusChange('cancelled')} style={{ fontSize: 12, color: '#EF4444', borderColor: 'rgba(239,68,68,0.3)' }}>Cancel</button>}
                </div>
              )}
            </div>
          )}
          </div>{/* end scroll wrapper */}
        </>)}
      </div>

      {/* Upload Modal */}
      {showUploadModal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 10001, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setShowUploadModal(false)}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: '#1A1830', borderRadius: 16, padding: 24, width: 400, border: '1px solid rgba(255,255,255,0.1)' }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: '#E0E0F4', marginBottom: 16 }}>Upload {uploadType.replace('_', ' ')}</h3>
            {uploadType === 'other' && (
              <div style={{ marginBottom: 12 }}>
                <span style={labelStyle}>Type</span>
                <select value={uploadType} onChange={(e) => setUploadType(e.target.value)} className="filter-select" style={{ width: '100%', marginTop: 4 }}>
                  <option value="id">ID</option><option value="insurance">Insurance</option><option value="other">Other</option>
                </select>
              </div>
            )}
            <div style={{ marginBottom: 12 }}>
              <span style={labelStyle}>Notes (optional)</span>
              <input value={uploadNotes} onChange={(e) => setUploadNotes(e.target.value)} className="filter-select" style={{ width: '100%', marginTop: 4 }} placeholder="Optional notes..." />
            </div>
            <input ref={fileInputRef} type="file" style={{ display: 'none' }} onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUpload(f) }} />
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn-ghost" onClick={() => setShowUploadModal(false)}>Cancel</button>
              <button className="btn-primary" onClick={() => fileInputRef.current?.click()} disabled={uploadFile.isPending}>{uploadFile.isPending ? 'Uploading...' : 'Choose File'}</button>
            </div>
          </div>
        </div>
      )}

      {confirmAction && (
        <ConfirmModal
          title={`${confirmAction.status === 'suspended' ? 'Suspend' : 'Cancel'} Family Billing?`}
          message={confirmAction.status === 'suspended' ? 'This will suspend billing. Sessions will not be charged until reactivated.' : 'This will cancel billing. Typically used when a family is leaving permanently.'}
          variant={confirmAction.status === 'cancelled' ? 'danger' : 'warning'}
          confirmLabel={confirmAction.status === 'suspended' ? 'Suspend' : 'Cancel Billing'}
          onConfirm={() => doStatusChange(confirmAction.status)} onCancel={() => setConfirmAction(null)}
        />
      )}
      {deleteConfirm && (
        <ConfirmModal title="Delete File?" message={`Delete "${deleteConfirm.file_name}"? This cannot be undone.`} variant="danger" confirmLabel="Delete"
          onConfirm={() => handleDeleteFile(deleteConfirm)} onCancel={() => setDeleteConfirm(null)} />
      )}

      {/* Create Invoice from Family */}
      {showCreateInvoice && family && (
        <CreateInvoiceFromFamily family={family} onClose={() => setShowCreateInvoice(false)} />
      )}
    </div>,
    document.body
  )
}

// ═══════════════════════════════════════
// FILE HELPERS
// ═══════════════════════════════════════

function FileSection({ label, fileType, files, canUpload, onUpload, onDelete }: {
  label: string; fileType: string; files: FamilyFile[]; canUpload: boolean
  onUpload: () => void; onDelete: (f: FamilyFile) => void
}) {
  const match = files.filter(f => f.file_type === fileType)
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={sectionLabelStyle}>{label}</div>
      {match.length > 0 ? match.map((f) => (
        <FileRow key={f.id} file={f} canDelete={canUpload} onDelete={() => onDelete(f)} />
      )) : (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderRadius: 10, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)' }}>
          <span style={{ fontSize: 12, color: '#EF4444', opacity: 0.7 }}>Missing</span>
          {canUpload && (
            <button onClick={onUpload} style={{ fontSize: 11, fontWeight: 600, color: '#22C55E', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
              <Upload size={11} /> Upload {label}
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function FileRow({ file, canDelete, onDelete }: { file: FamilyFile; canDelete: boolean; onDelete: () => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 14px', borderRadius: 10, background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.05)', marginBottom: 6 }}>
      <FileText size={14} style={{ color: '#8080A8', flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: '#C0C0E0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file.file_name}</div>
        <div style={{ fontSize: 10, color: '#606088' }}>
          {file.uploader_name} · {new Date(file.created_at).toLocaleDateString()}
          {file.notes && <span> · {file.notes}</span>}
        </div>
      </div>
      <a href={file.file_url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, color: '#38BDF8', fontWeight: 600, textDecoration: 'none' }}>View</a>
      {canDelete && (
        <button onClick={(e) => { e.stopPropagation(); onDelete() }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#606088', padding: 2 }}
          onMouseEnter={e => (e.currentTarget.style.color = '#EF4444')} onMouseLeave={e => (e.currentTarget.style.color = '#606088')}>
          <Trash2 size={12} />
        </button>
      )}
    </div>
  )
}

// ═══════════════════════════════════════
// ACTIVITY LOG ROW
// ═══════════════════════════════════════

const EVENT_ICON: Record<string, { icon: string; color: string }> = {
  session_completed: { icon: '✅', color: '#22C55E' },
  sub_session:       { icon: '✅', color: '#A78BFA' },
  callout:           { icon: '⚠️', color: '#FFB800' },
  fifth_week:        { icon: '📅', color: '#38BDF8' },
  cancelled:         { icon: '❌', color: '#EF4444' },
  billing_status:    { icon: '💳', color: '#A78BFA' },
  payment_failed:    { icon: '💳', color: '#EF4444' },
  rate_changed:      { icon: '💰', color: '#FFB800' },
  notification:      { icon: '🔔', color: '#00BCD4' },
  other:             { icon: '•',  color: '#8080A8' },
}

function CopyText({ value, style }: { value: string | null | undefined; style?: React.CSSProperties }) {
  if (!value) return <span style={style}>---</span>
  return (
    <span
      style={{ ...style, cursor: 'pointer' }}
      title="Click to copy"
      onClick={(e) => {
        e.stopPropagation()
        navigator.clipboard.writeText(value)
        toast('Copied', 'success')
      }}
    >
      {value}
    </span>
  )
}

function ActivityRow({ event }: { event: ActivityEvent }) {
  const cfg = EVENT_ICON[event.type] ?? EVENT_ICON.other
  const dateLabel = event.date ? new Date(event.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—'

  return (
    <div style={{ display: 'flex', gap: 10, padding: '6px 0', alignItems: 'flex-start' }}>
      <span style={{ fontSize: 13, lineHeight: '18px', width: 20, textAlign: 'center', flexShrink: 0 }}>{cfg.icon}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 10, color: '#606088', fontWeight: 600, flexShrink: 0 }}>{dateLabel}</span>
          <span style={{ fontSize: 12, color: '#C0C0E0', fontWeight: 600 }}>{event.description}</span>
        </div>
        {event.detail && (
          <div style={{ fontSize: 11, color: '#8080A8', marginTop: 1 }}>{event.detail}</div>
        )}
      </div>
    </div>
  )
}

// ═══════════════════════════════════════
// CREATE INVOICE FROM FAMILY MODAL
// ═══════════════════════════════════════

function CreateInvoiceFromFamily({ family, onClose }: { family: any; onClose: () => void }) {
  const { user, profile, tenantId } = useAuthContext()
  const TENANT_ID = tenantId!
  const qc = useQueryClient()
  const [creating, setCreating] = useState(false)
  const [isMilitary, setIsMilitary] = useState(family.is_military ?? false)
  const [dueDate, setDueDate] = useState(() => {
    const now = new Date()
    const next = new Date(now.getFullYear(), now.getMonth() + 1, 1)
    return next.toISOString().slice(0, 10)
  })
  const [periodLabel, setPeriodLabel] = useState(() => {
    const now = new Date()
    const next = new Date(now.getFullYear(), now.getMonth() + 1, 1)
    return next.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
  })

  // Fetch student effective rates for this family
  const { data: familyStudents } = useQuery({
    queryKey: ['family_inv_students', family.id],
    queryFn: async () => {
      const { data } = await supabase.from('student_effective_rate')
        .select('student_id, family_id, first_name, last_name, instrument, sessions_per_month, rate_per_session, monthly_cents, location_id')
        .eq('family_id', family.id)
      return data ?? []
    },
  })

  // Recalculate rates with military toggle
  const students = useMemo(() => {
    if (!familyStudents) return []
    const activeCount = familyStudents.length
    const totalSessions = familyStudents.reduce((s: number, st: any) => s + (st.sessions_per_month ?? DEFAULT_SESSIONS_PER_MONTH), 0)
    const rate = calculatePreviewRate(activeCount, totalSessions, isMilitary)
    return familyStudents.map((s: any) => {
      const sessions = s.sessions_per_month ?? DEFAULT_SESSIONS_PER_MONTH
      return { ...s, computed_rate: rate, computed_monthly: rate * sessions }
    })
  }, [familyStudents, isMilitary])

  const totalCents = students.reduce((s: number, st: any) => s + st.computed_monthly, 0)

  async function handleCreate() {
    if (students.length === 0) return
    setCreating(true)
    try {
      const cycleId = await getCurrentBillingCycleId(TENANT_ID)
      const locationId = students[0]?.location_id ?? family.primary_location_id ?? null
      const { error } = await supabase.from('invoice_tokens').insert({
        tenant_id: TENANT_ID,
        family_id: family.id,
        location_id: locationId,
        billing_period_label: periodLabel,
        billing_cycle_id: cycleId,
        amount_cents: totalCents,
        base_amount_cents: totalCents,
        due_date: dueDate,
        billing_day: family.billing_day ?? 1,
        status: 'pending',
        expires_at: new Date(new Date(dueDate).getTime() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        invoice_snapshot: {
          family_name: family.name,
          parent_name: family.parent_name ?? family.parent_first_name,
          email: family.primary_email,
          phone: family.primary_phone,
          card_on_file: !!family.card_last_four,
          is_military: isMilitary,
          students: students.map((s: any) => ({
            name: `${s.first_name} ${s.last_name}`,
            instrument: s.instrument,
            sessions: s.sessions_per_month ?? DEFAULT_SESSIONS_PER_MONTH,
            rate: s.computed_rate,
            monthly: s.computed_monthly,
          })),
        },
      })
      if (error) throw error

      await supabase.from('audit_log').insert({
        action: 'INVOICE_CREATED',
        table_name: 'invoice_tokens',
        record_id: family.id,
        new_value: JSON.stringify({ amount_cents: totalCents, period: periodLabel, family: family.name }),
        performed_by: user?.id ?? null,
        metadata: { created_by_name: profile ? `${profile.first_name} ${profile.last_name}`.trim() : 'Unknown', type: 'family', source: 'family_detail' },
      })

      toast(`Invoice created for ${formatDollars(totalCents)}`, 'success')
      qc.invalidateQueries({ queryKey: ['invoice_tokens_list'] })
      qc.invalidateQueries({ queryKey: ['invoice_pending_count'] })
      onClose()
    } catch (err) {
      toast('Failed to create invoice', 'error')
    } finally {
      setCreating(false)
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 10002, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={onClose}>
      <div style={{ width: '100%', maxWidth: 540, background: '#141224', borderRadius: 20, border: '1px solid rgba(34,197,94,0.2)', boxShadow: '0 40px 100px rgba(0,0,0,0.6)' }} onClick={e => e.stopPropagation()}>

        <div style={{ padding: '18px 24px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 800, color: '#E0E0F4' }}>Create Invoice — {stripFamily(family.name)}</div>
            <div style={{ fontSize: 12, color: '#8080A8' }}>
              {family.parent_first_name || family.parent_last_name
                ? `${family.parent_first_name ?? ''} ${family.parent_last_name ?? ''}`.trim()
                : family.parent_name ?? ''}
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#8080A8' }}><X size={20} /></button>
        </div>

        <div style={{ padding: '18px 24px' }}>
          {/* Controls */}
          <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
            <div>
              <label style={{ fontSize: 10, fontWeight: 700, color: '#8080A8', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 4 }}>Billing Period</label>
              <input value={periodLabel} onChange={e => setPeriodLabel(e.target.value)} style={{ padding: '8px 14px', borderRadius: 8, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: '#E0E0F4', fontFamily: 'inherit', fontSize: 13, outline: 'none' }} />
            </div>
            <div>
              <label style={{ fontSize: 10, fontWeight: 700, color: '#8080A8', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 4 }}>Due Date</label>
              <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} style={{ padding: '8px 14px', borderRadius: 8, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: '#E0E0F4', fontFamily: 'inherit', fontSize: 13, outline: 'none' }} />
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-end', paddingBottom: 2 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, fontWeight: 700, color: isMilitary ? '#FFB800' : '#8080A8', padding: '8px 16px', borderRadius: 8, background: isMilitary ? 'rgba(255,184,0,0.12)' : 'rgba(255,255,255,0.04)', border: `1px solid ${isMilitary ? 'rgba(255,184,0,0.3)' : 'rgba(255,255,255,0.08)'}` }}>
                <input type="checkbox" checked={isMilitary} onChange={e => setIsMilitary(e.target.checked)} style={{ accentColor: '#FFB800' }} />
                Military
              </label>
            </div>
          </div>

          {/* Student line items */}
          {students.length > 0 ? (
            <div style={{ marginBottom: 16 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 0.7fr 0.8fr 1fr', gap: 8, padding: '6px 0', fontSize: 10, fontWeight: 700, color: '#606088', textTransform: 'uppercase', letterSpacing: '0.06em', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                <span>Student</span><span>Instrument</span><span>Sessions</span><span>Rate</span><span style={{ textAlign: 'right' }}>Monthly</span>
              </div>
              {students.map((s: any) => (
                <div key={s.student_id} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 0.7fr 0.8fr 1fr', gap: 8, padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.03)', fontSize: 12, color: '#C0C0D8' }}>
                  <span style={{ fontWeight: 600, color: '#E0E0F4' }}>{s.first_name} {s.last_name}</span>
                  <span>{s.instrument?.charAt(0).toUpperCase()}{s.instrument?.slice(1)}</span>
                  <span>{s.sessions_per_month ?? DEFAULT_SESSIONS_PER_MONTH}</span>
                  <span>${(s.computed_rate / 100).toFixed(2)}</span>
                  <span style={{ textAlign: 'right', fontWeight: 700 }}>${(s.computed_monthly / 100).toFixed(2)}</span>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ padding: 20, textAlign: 'center', color: '#606088', fontSize: 13 }}>No active students found.</div>
          )}

          {/* Summary */}
          {students.length > 0 && (
            <div style={{ display: 'flex', gap: 16, marginBottom: 16, padding: '12px 16px', background: 'rgba(34,197,94,0.06)', borderRadius: 12, border: '1px solid rgba(34,197,94,0.15)', alignItems: 'center' }}>
              <div><div style={{ fontSize: 20, fontWeight: 800, color: '#22C55E' }}>{formatDollars(totalCents)}</div><div style={{ fontSize: 10, color: '#8080A8' }}>Total</div></div>
              <div style={{ width: 1, height: 32, background: 'rgba(255,255,255,0.06)' }} />
              <div style={{ fontSize: 11, color: '#A0A0C8' }}>
                {students.length} student{students.length !== 1 ? 's' : ''} &middot; ${(students[0]?.computed_rate / 100).toFixed(2)}/session
                {isMilitary && <span style={{ color: '#FFB800', fontWeight: 700 }}> &middot; Military rate</span>}
                {!isMilitary && students.length >= 2 && <span style={{ color: '#FFB800', fontWeight: 700 }}> &middot; Multi-student rate</span>}
              </div>
            </div>
          )}

          <button onClick={handleCreate} disabled={creating || students.length === 0} style={{
            width: '100%', padding: '13px 0', borderRadius: 12, border: 'none',
            background: creating || students.length === 0 ? '#606088' : '#22C55E',
            color: '#fff', fontSize: 14, fontWeight: 700, cursor: creating ? 'default' : 'pointer',
            boxShadow: creating ? 'none' : '0 4px 20px rgba(34,197,94,0.3)',
          }}>
            {creating ? 'Creating...' : `Create Invoice — ${formatDollars(totalCents)}`}
          </button>
        </div>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════
// NOTIFICATION PREFERENCES
// ═══════════════════════════════════════

function NotificationPrefs({ family }: { family: any }) {
  const qc = useQueryClient()
  const [sms, setSms] = useState(family.notify_via_sms ?? true)
  const [email, setEmail] = useState(family.notify_via_email ?? true)
  const [rem4hr, setRem4hr] = useState(family.reminder_4hr ?? true)
  const [rem1hr, setRem1hr] = useState(family.reminder_1hr ?? false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const dirty = sms !== (family.notify_via_sms ?? true) ||
    email !== (family.notify_via_email ?? true) ||
    rem4hr !== (family.reminder_4hr ?? true) ||
    rem1hr !== (family.reminder_1hr ?? false)

  const handleToggle = (field: 'sms' | 'email', val: boolean) => {
    setError('')
    if (field === 'sms') {
      if (!val && !email) { setError('At least one notification method is required.'); return }
      setSms(val)
    } else {
      if (!val && !sms) { setError('At least one notification method is required.'); return }
      setEmail(val)
    }
  }

  const handleSave = async () => {
    setSaving(true)
    setError('')
    try {
      const { error: err } = await supabase.from('families').update({
        notify_via_sms: sms,
        notify_via_email: email,
        reminder_4hr: rem4hr,
        reminder_1hr: rem1hr,
      }).eq('id', family.id)
      if (err) throw err
      qc.invalidateQueries({ queryKey: ['family_detail'] })
      qc.invalidateQueries({ queryKey: ['families'] })
      toast('Notification preferences saved', 'success')
    } catch (e: any) {
      setError(e.message ?? 'Failed to save')
    } finally { setSaving(false) }
  }

  const toggleStyle = (on: boolean): React.CSSProperties => ({
    width: 40, height: 22, borderRadius: 11, cursor: 'pointer',
    background: on ? '#22C55E' : '#333',
    position: 'relative', transition: 'background 200ms',
    flexShrink: 0, border: 'none',
  })
  const thumbStyle = (on: boolean): React.CSSProperties => ({
    position: 'absolute', top: 2, left: on ? 20 : 2,
    width: 18, height: 18, borderRadius: '50%', background: '#fff',
    transition: 'left 200ms', pointerEvents: 'none',
  })

  return (
    <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', marginTop: 16, paddingTop: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
        <Bell size={13} style={{ color: '#8080A8' }} />
        <span style={{ fontSize: 10, fontWeight: 700, color: '#8080A8', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Notifications</span>
      </div>

      <div style={{ fontSize: 10, fontWeight: 700, color: '#606088', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>How We Reach You</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 13, color: '#C0C0E0' }}>Text message</span>
          <button style={toggleStyle(sms)} onClick={() => handleToggle('sms', !sms)}>
            <div style={thumbStyle(sms)} />
          </button>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 13, color: '#C0C0E0' }}>Email</span>
          <button style={toggleStyle(email)} onClick={() => handleToggle('email', !email)}>
            <div style={thumbStyle(email)} />
          </button>
        </div>
      </div>

      <div style={{ fontSize: 10, fontWeight: 700, color: '#606088', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Session Reminders</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 13, color: '#C0C0E0' }}>24 hours before</span>
          <span style={{ fontSize: 10, fontWeight: 700, color: '#22C55E', padding: '2px 10px', borderRadius: 6, background: 'rgba(34,197,94,0.1)' }}>Always on</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 13, color: '#C0C0E0' }}>4 hours before</span>
          <button style={toggleStyle(rem4hr)} onClick={() => setRem4hr(!rem4hr)}>
            <div style={thumbStyle(rem4hr)} />
          </button>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 13, color: '#C0C0E0' }}>1 hour before</span>
          <button style={toggleStyle(rem1hr)} onClick={() => setRem1hr(!rem1hr)}>
            <div style={thumbStyle(rem1hr)} />
          </button>
        </div>
      </div>

      {error && <div style={{ fontSize: 12, color: '#EF4444', marginBottom: 8, padding: '6px 10px', background: 'rgba(239,68,68,0.08)', borderRadius: 8 }}>{error}</div>}

      {dirty && (
        <button
          onClick={handleSave}
          disabled={saving}
          style={{
            width: '100%', padding: '9px 16px', borderRadius: 10,
            background: '#22C55E', border: 'none', cursor: 'pointer',
            color: '#fff', fontWeight: 700, fontSize: 12,
          }}
        >
          {saving ? 'Saving...' : 'Save Notification Preferences'}
        </button>
      )}
    </div>
  )
}
