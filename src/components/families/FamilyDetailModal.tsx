import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query'
import {
  Bell,
  ChevronDown,
  ChevronRight,
  CreditCard,
  Download,
  FileText,
  Lock,
  MessageCircle,
  Pencil,
  Receipt,
  Send,
  Star,
  Trash2,
  UserMinus,
  Users,
  X,
} from 'lucide-react'

import MusicLoader from '../shared/MusicLoader'
import ConfirmModal from '../shared/ConfirmModal'
import CollapsedSection from '../shared/CollapsedSection'
import { toast } from '../shared/Toast'

import { useAuthContext } from '../../app/AuthContext'
import { useZiroShell } from '../../contexts/ZiroContext'
import { usePermissions } from '../../hooks/usePermissions'
import { DEFAULT_SESSIONS_PER_MONTH } from '../../lib/constants'
import { calculatePreviewRate, formatRate, getRateTierColor } from '../../hooks/useFamilyRate'
import {
  type ActivityEvent,
  type FamilyFile,
  useChangeFamilyBillingStatus,
  useDeleteFamilyFile,
  useFamilyActivityLog,
  useFamilyDetail,
  useFamilyInvoices,
  useUpdateFamilyInfo,
  useUploadFamilyFile,
} from '../../hooks/useFamilies'
import { useReactivateStudent } from '../../hooks/useRetention'
import { useLastReviewRequest } from '../../hooks/useReviewRequest'
import { useGenerateInvoice } from '../../hooks/useFamilyInvoices'
import { supabase } from '../../lib/supabase'
import { qk } from '../../lib/queryKeys'
import { logAudit } from '../../lib/auditLog'
import { useDeleteFamily, useRemoveStudentFromFamily } from '../../lib/enrollmentEngine'
import FamilyDocumentsSection from '../admin/FamilyDocumentsSection'
import ReviewRequestModal from '../admin/ReviewRequestModal'
import FamilyActivityLogModal from '../admin/FamilyActivityLogModal'
import { getInstrumentEmoji, instrumentWithEmojiTitle } from '../../utils/instrumentEmoji'
import {
  familyOperatorBlockFromDetail,
  formatDollars,
  labelStyle,
  sectionLabelStyle,
  stripFamily,
  valueStyle,
} from './familyHelpers'

const STATUS_BADGE: Record<string, { bg: string; border: string; color: string }> = {
  active:    { bg: 'rgba(34,197,94,0.12)',  border: 'rgba(34,197,94,0.25)',  color: '#22C55E' },
  paused:    { bg: 'rgba(255,184,0,0.12)',  border: 'rgba(255,184,0,0.25)',  color: '#FFB800' },
  suspended: { bg: 'rgba(255,120,0,0.12)',  border: 'rgba(255,120,0,0.25)',  color: '#FF7800' },
  cancelled: { bg: 'rgba(255,255,255,0.04)', border: 'rgba(255,255,255,0.08)', color: '#8080A8' },
}

// ═══════════════════════════════════════
// FAMILY DETAIL MODAL — 2-TAB (Account / Director)
// ═══════════════════════════════════════

type ModalTab = 'account' | 'director' | 'messages'
type MobileTab = 'account' | 'contact' | 'billing' | 'documents' | 'notifications'

function useIsMobile(breakpoint = 900) {
  const [mobile, setMobile] = useState(typeof window !== 'undefined' && window.innerWidth < breakpoint)
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${breakpoint - 1}px)`)
    const handler = (e: MediaQueryListEvent) => setMobile(e.matches)
    setMobile(mq.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [breakpoint])
  return mobile
}

function MobileNotificationPrefs({ family, toggleStyle, thumbStyle }: {
  family: any
  toggleStyle: (on: boolean) => React.CSSProperties
  thumbStyle: (on: boolean) => React.CSSProperties
}) {
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
      qc.invalidateQueries({ queryKey: qk.families.fileDetail })
      qc.invalidateQueries({ queryKey: qk.families.all })
      toast('Notification preferences saved', 'success')
    } catch (e: any) {
      setError(e.message ?? 'Failed to save')
    } finally { setSaving(false) }
  }

  const sectionLabel = (text: string) => (
    <div style={{ fontSize: 11, fontWeight: 700, color: '#606088', textTransform: 'uppercase' as const, letterSpacing: '0.06em', marginBottom: 10 }}>{text}</div>
  )

  const row = (label: string, control: React.ReactNode) => (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', minHeight: 44, padding: '0 4px' }}>
      <span style={{ fontSize: 14, color: '#C0C0E0' }}>{label}</span>
      {control}
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {sectionLabel('How We Reach You')}
      {row('Text message', (
        <button style={toggleStyle(sms)} onClick={() => handleToggle('sms', !sms)}>
          <div style={thumbStyle(sms)} />
        </button>
      ))}
      {row('Email', (
        <button style={toggleStyle(email)} onClick={() => handleToggle('email', !email)}>
          <div style={thumbStyle(email)} />
        </button>
      ))}

      <div style={{ height: 12 }} />
      {sectionLabel('Session Reminders')}
      {row('24 hours before', (
        <span style={{ fontSize: 11, fontWeight: 700, color: '#22C55E', padding: '3px 12px', borderRadius: 8, background: 'rgba(34,197,94,0.1)' }}>Always on</span>
      ))}
      {row('4 hours before', (
        <button style={toggleStyle(rem4hr)} onClick={() => setRem4hr(!rem4hr)}>
          <div style={thumbStyle(rem4hr)} />
        </button>
      ))}
      {row('1 hour before', (
        <button style={toggleStyle(rem1hr)} onClick={() => setRem1hr(!rem1hr)}>
          <div style={thumbStyle(rem1hr)} />
        </button>
      ))}

      {error && <div style={{ fontSize: 13, color: '#EF4444', marginTop: 8, padding: '8px 12px', background: 'rgba(239,68,68,0.08)', borderRadius: 10 }}>{error}</div>}

      {dirty && (
        <button
          onClick={handleSave}
          disabled={saving}
          style={{
            width: '100%', padding: '12px 16px', borderRadius: 12, marginTop: 10,
            background: '#22C55E', border: 'none', cursor: 'pointer',
            color: '#fff', fontWeight: 700, fontSize: 14, minHeight: 44,
          }}
        >
          {saving ? 'Saving...' : 'Save Preferences'}
        </button>
      )}
    </div>
  )
}

// ═══════════════════════════════════════
// FAMILY INVOICE SECTION (collapsed)
// ═══════════════════════════════════════

const INVOICE_STATUS_STYLE: Record<string, { bg: string; border: string; color: string }> = {
  pending:  { bg: 'rgba(255,184,0,0.1)',  border: 'rgba(255,184,0,0.25)',  color: '#FFB800' },
  viewed:   { bg: 'rgba(99,102,241,0.1)', border: 'rgba(99,102,241,0.25)', color: '#6366F1' },
  paid:     { bg: 'rgba(34,197,94,0.1)',  border: 'rgba(34,197,94,0.25)',  color: '#22C55E' },
  expired:  { bg: 'rgba(255,255,255,0.04)', border: 'rgba(255,255,255,0.08)', color: '#8080A8' },
  cancelled: { bg: 'rgba(239,68,68,0.1)', border: 'rgba(239,68,68,0.25)', color: '#EF4444' },
}

function FamilyInvoiceSection({ familyId, family, invoices, open, onToggle }: {
  familyId: string; family: any; invoices: any[] | undefined; open: boolean; onToggle: () => void
}) {
  const { tenantId, role } = useAuthContext()
  const [showCreateInvoice, setShowCreateInvoice] = useState(false)

  const nextScheduled = invoices?.find((inv: any) => inv.status === 'pending' || inv.status === 'viewed')

  return (
    <CollapsedSection title="Invoices" count={invoices?.length ?? 0} open={open} onToggle={onToggle}>
      {/* Next scheduled / pending */}
      {nextScheduled && (
        <div style={{
          padding: '10px 14px', borderRadius: 10, marginBottom: 10,
          background: 'rgba(255,184,0,0.06)', border: '1px solid rgba(255,184,0,0.15)',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: '#FFB800', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              {nextScheduled.status === 'viewed' ? 'Viewed by Family' : 'Pending'}
            </span>
            <span style={{ fontSize: 12, fontWeight: 700, color: '#E0E0F4' }}>
              {formatDollars(nextScheduled.amount_cents)}
            </span>
          </div>
          <div style={{ fontSize: 11, color: '#A0A0C8' }}>
            {nextScheduled.billing_period_label}
            {nextScheduled.due_date && <span> &middot; Due {new Date(nextScheduled.due_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>}
          </div>
        </div>
      )}

      {/* Invoice history */}
      {invoices && invoices.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 10 }}>
          {invoices.map((inv: any) => {
            const st = INVOICE_STATUS_STYLE[inv.status] ?? INVOICE_STATUS_STYLE.pending
            return (
              <div key={inv.id} style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 8,
                background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)',
              }}>
                <FileText size={13} style={{ color: '#606088', flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: '#D0D0E8' }}>{inv.billing_period_label}</span>
                  <span style={{ fontSize: 10, color: '#606088', marginLeft: 8 }}>
                    {new Date(inv.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </span>
                </div>
                <span style={{
                  fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em',
                  padding: '2px 8px', borderRadius: 6, background: st.bg, border: `1px solid ${st.border}`, color: st.color,
                }}>{inv.status}</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: '#E0E0F4', minWidth: 60, textAlign: 'right' }}>
                  {formatDollars(inv.amount_cents)}
                </span>
                {inv.invoice_snapshot?.pdf_url && (
                  <button
                    title="View PDF"
                    onClick={() => window.open(inv.invoice_snapshot.pdf_url, '_blank')}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, color: '#606088' }}
                  >
                    <Download size={12} />
                  </button>
                )}
              </div>
            )
          })}
        </div>
      ) : (
        <div style={{ fontSize: 12, color: '#606088', padding: '8px 0' }}>No invoices yet.</div>
      )}

      {/* Generate Invoice button */}
      {(role === 'owner' || role === 'admin' || role === 'studio_director') && (
        <button
          onClick={() => setShowCreateInvoice(true)}
          style={{
            width: '100%', padding: '10px 0', borderRadius: 10, fontSize: 12, fontWeight: 700,
            background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)',
            color: '#22C55E', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          }}
        >
          <Receipt size={13} /> Generate Invoice
        </button>
      )}

      {showCreateInvoice && family && (
        <CreateInvoiceFromFamily family={family} onClose={() => setShowCreateInvoice(false)} />
      )}
    </CollapsedSection>
  )
}

export function FamilyDetailModal({ familyId, canEdit, onClose, onNavigateStudent }: {
  familyId: string; canEdit: boolean; onClose: () => void; onNavigateStudent: (studentId: string) => void
}) {
  const { role, tenantId, profile } = useAuthContext()
  const { isStudioDirector: sdFromPerm } = usePermissions()
  const { setPageContext } = useZiroShell()
  const { data: family, isLoading } = useFamilyDetail(familyId)
  const updateFamily = useUpdateFamilyInfo()
  const changeBillingStatus = useChangeFamilyBillingStatus()
  const uploadFile = useUploadFamilyFile()
  const deleteFile = useDeleteFamilyFile()

  useEffect(() => {
    if (!family) return
    const summary = familyOperatorBlockFromDetail(family)
    setPageContext((prev) => ({
      ...prev,
      page: 'family_detail',
      familyId: family.id,
      familyOperatorSummary: summary,
    }))
    return () => {
      setPageContext((prev) => {
        const next = { ...prev }
        if (next.familyId === family.id) {
          delete next.familyId
          delete next.familyOperatorSummary
          if (next.page === 'family_detail') delete next.page
        }
        return next
      })
    }
  }, [family, setPageContext])
  const { data: activityLog } = useFamilyActivityLog(familyId, 5)
  const [showFullActivityLog, setShowFullActivityLog] = useState(false)
  const [activityOpen, setActivityOpen] = useState(false)
  const [invoicesOpen, setInvoicesOpen] = useState(false)
  const { data: familyInvoices } = useFamilyInvoices(familyId)

  const isMobile = useIsMobile()
  const [tab, setTab] = useState<ModalTab>('account')
  const [mobileTab, setMobileTab] = useState<MobileTab>('account')
  const [confirmAction, setConfirmAction] = useState<{ status: string } | null>(null)
  const [editing, setEditing] = useState(false)
  const [showPausedStudents, setShowPausedStudents] = useState(false)
  const reactivateStudent = useReactivateStudent()
  const removeFromFamily = useRemoveStudentFromFamily()
  const deleteFamilyMut = useDeleteFamily()
  const [removeStudentConfirm, setRemoveStudentConfirm] = useState<{ id: string; name: string } | null>(null)
  const [deleteFamilyConfirm, setDeleteFamilyConfirm] = useState(false)
  const [uploadType, setUploadType] = useState<string>('other')
  const [uploadNotes, setUploadNotes] = useState('')
  const [showUploadModal, setShowUploadModal] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState<FamilyFile | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [showReviewModal, setShowReviewModal] = useState(false)
  const { data: lastReviewReq } = useLastReviewRequest(familyId)
  const reviewRecentlySent = lastReviewReq?.sent_at
    ? (Date.now() - new Date(lastReviewReq.sent_at).getTime()) < 90 * 24 * 60 * 60 * 1000
    : false
  const reviewSentDate = lastReviewReq?.sent_at
    ? new Date(lastReviewReq.sent_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    : null

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
      if (sdFromPerm && tenantId && profile?.id) {
        logAudit({
          tenantId, performedBy: profile.id,
          userName: `${profile.first_name ?? ''} ${profile.last_name ?? ''}`.trim() || 'Studio Director',
          userRole: 'studio_director', action: 'FAMILY_UPDATE_CONTACT',
          tableName: 'families', recordId: family.id,
          entityName: family.name ?? null,
          locationId: family.primary_location_id ?? null,
          newValue: updates,
        })
      }
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
      if (sdFromPerm && tenantId && profile?.id) {
        logAudit({
          tenantId, performedBy: profile.id,
          userName: `${profile.first_name ?? ''} ${profile.last_name ?? ''}`.trim() || 'Studio Director',
          userRole: 'studio_director', action: 'FAMILY_BILLING_STATUS_CHANGE',
          tableName: 'families', recordId: family.id,
          entityName: family.name ?? null,
          locationId: family.primary_location_id ?? null,
          oldValue: { billing_status: family.billing_status }, newValue: { billing_status: newStatus },
        })
      }
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

  const status = family?.billing_status ?? 'active'
  const statusStyle = STATUS_BADGE[status] ?? STATUS_BADGE.active
  const rateColor = family ? getRateTierColor(family.rate_tier) : getRateTierColor(4500)

  // ── Render helpers (plain functions, NOT components — avoids React type-instability on re-render) ──
  const fld = (label: string, value: React.ReactNode) => (
    <div style={{ marginBottom: 8 }}>
      <span style={labelStyle}>{label}</span>
      <div style={valueStyle}>{value || <span style={{ color: '#363656' }}>—</span>}</div>
    </div>
  )

  const inp = (field: string, label: string) => (
    <div key={field} style={{ marginBottom: 8 }}>
      <span style={labelStyle}>{label}</span>
      {editing ? (
        <input value={form[field] ?? ''} onChange={(e) => setForm(prev => ({ ...prev, [field]: e.target.value }))} className="filter-select" style={{ width: '100%', fontSize: 13, marginTop: 3 }} />
      ) : (
        <div style={valueStyle}>{(family as any)?.[field] || <span style={{ color: '#363656' }}>—</span>}</div>
      )}
    </div>
  )

  const txt = (field: string, label: string, placeholder?: string) => (
    <div key={field} style={{ marginBottom: 8 }}>
      <span style={labelStyle}>{label}</span>
      {editing ? (
        <textarea value={form[field] ?? ''} onChange={(e) => setForm(prev => ({ ...prev, [field]: e.target.value }))} rows={3} placeholder={placeholder} className="filter-select" style={{ width: '100%', fontSize: 13, marginTop: 3, resize: 'vertical', fontFamily: 'inherit' }} />
      ) : (
        <div style={{ ...valueStyle, whiteSpace: 'pre-wrap' }}>{(family as any)?.[field] || <span style={{ color: '#363656' }}>—</span>}</div>
      )}
    </div>
  )

  // ── Shared toggle styles ──
  const mToggle = (on: boolean): React.CSSProperties => ({
    width: 44, height: 24, borderRadius: 12, cursor: 'pointer',
    background: on ? '#22C55E' : '#333', position: 'relative',
    transition: 'background 200ms', flexShrink: 0, border: 'none',
  })
  const mThumb = (on: boolean): React.CSSProperties => ({
    position: 'absolute', top: 2, left: on ? 22 : 2,
    width: 20, height: 20, borderRadius: '50%', background: '#fff',
    transition: 'left 200ms', pointerEvents: 'none' as const,
  })

  // ── Tab switch handler ──
  const switchTab = (t: MobileTab) => {
    setMobileTab(t)
    if (editing) { setEditing(false) }
  }

  // ── Safe accessors ──
  const students = family?.students ?? []
  const activeStudents = students.filter((s: any) => s.status === 'active')

  // ── MOBILE LAYOUT ──
  if (isMobile) {
    return createPortal(
      <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.7)' }} onClick={onClose}>
        <div onClick={(e) => e.stopPropagation()} style={{
          position: 'absolute', bottom: 0, left: 0, right: 0, height: '95vh',
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
          background: '#141224', borderRadius: '20px 20px 0 0',
          border: '1px solid rgba(212,34,106,0.15)', borderBottom: 'none',
        }}>
          <div style={{ height: 3, background: 'linear-gradient(90deg, #D4226A, #7B2CBF)', borderRadius: '20px 20px 0 0', flexShrink: 0 }} />

          {isLoading || !family ? (
            <div style={{ padding: 40, textAlign: 'center' }}><MusicLoader /></div>
          ) : (<>
            {/* ── MOBILE HEADER ── */}
            <div style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 8, borderBottom: '1px solid rgba(255,255,255,0.06)', flexShrink: 0 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 18, fontWeight: 800, color: '#E0E0F4', overflowWrap: 'break-word' }}>{stripFamily(family.name)}</div>
              </div>
              <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 10px', borderRadius: 8, background: statusStyle.bg, border: `1px solid ${statusStyle.border}`, color: statusStyle.color, flexShrink: 0 }}>
                {status.charAt(0).toUpperCase() + status.slice(1)}
              </span>
              {canEdit && !editing && (
                <button onClick={startEditing} title="Edit" style={{ width: 32, height: 32, borderRadius: 8, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#8080A8', flexShrink: 0 }}>
                  <Pencil size={14} />
                </button>
              )}
              {editing && (
                <>
                  <button className="btn-ghost" onClick={() => setEditing(false)} style={{ fontSize: 11, padding: '5px 10px', flexShrink: 0 }}>Cancel</button>
                  <button className="btn-primary" onClick={handleSave} disabled={updateFamily.isPending} style={{ fontSize: 11, padding: '5px 12px', flexShrink: 0 }}>
                    {updateFamily.isPending ? 'Saving...' : 'Save'}
                  </button>
                </>
              )}
              <button onClick={onClose} style={{ width: 32, height: 32, borderRadius: 8, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#8080A8', flexShrink: 0 }}>
                <X size={16} />
              </button>
            </div>

            {/* ── MOBILE TABS ── */}
            <div style={{ display: 'flex', gap: 6, padding: '10px 16px', overflowX: 'auto', flexShrink: 0, borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
              {(['account', 'contact', 'billing', 'documents', 'notifications'] as MobileTab[]).map((t) => (
                <button key={t} data-guide-id={`family-tab-${t}`} onClick={() => switchTab(t)} style={{
                  padding: '6px 16px', fontSize: 12, fontWeight: 700, cursor: 'pointer', borderRadius: 20, whiteSpace: 'nowrap', flexShrink: 0,
                  background: mobileTab === t ? 'rgba(212,34,106,0.12)' : 'rgba(255,255,255,0.04)',
                  color: mobileTab === t ? '#E8488A' : '#8080A8',
                  border: mobileTab === t ? '1px solid rgba(212,34,106,0.25)' : '1px solid rgba(255,255,255,0.06)',
                }}>{t === 'account' ? 'Account' : t === 'contact' ? 'Contact' : t === 'billing' ? 'Billing' : t === 'documents' ? 'Documents' : 'Notifications'}</button>
              ))}
            </div>

            {/* ── MOBILE TAB CONTENT ── */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '16px 16px 24px' }}>

              {/* ── MOBILE: ACCOUNT ── */}
              {mobileTab === 'account' && (<>
                {inp('name', 'Account Name')}
                {fld('Member Since', family.created_at ? new Date(family.created_at).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) : '---')}
                {family.locationName && fld('Location', family.locationName)}
                {family.square_customer_id && (
                  <div style={{ marginBottom: 8 }}>
                    <span style={labelStyle}>Square ID</span>
                    <div style={{ marginTop: 3, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontSize: 12, color: '#606088', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 140 }}>{family.square_customer_id}</span>
                      <button onClick={() => { navigator.clipboard.writeText(family.square_customer_id); toast('Copied', 'success') }} style={{ fontSize: 10, fontWeight: 600, color: '#8080A8', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 4, padding: '2px 8px', cursor: 'pointer', flexShrink: 0 }}>Copy</button>
                    </div>
                  </div>
                )}

                {/* Students */}
                <div data-guide-id="family-students-list">
                <div style={{ ...sectionLabelStyle, marginTop: 16 }}>Students ({family.activeStudentCount ?? 0} active)</div>
                {activeStudents.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {activeStudents.map((s: any) => (
                      <div key={s.id} onClick={() => onNavigateStudent(s.id)} style={{
                        padding: '12px 14px', borderRadius: 10, cursor: 'pointer', minHeight: 44,
                        background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)',
                        display: 'flex', alignItems: 'center', gap: 10,
                      }}>
                        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 1 }}>
                          <span style={{ fontSize: 14, fontWeight: 700, color: '#E0E0F4', overflowWrap: 'break-word' }}>{s.first_name} {s.last_name}</span>
                          {s.student_display_id && (
                            <span style={{ fontSize: 10, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace', color: '#606088', fontWeight: 600 }}>{s.student_display_id}</span>
                          )}
                        </div>
                        <span style={{ fontSize: 12, color: '#A0A0C8', flexShrink: 0 }}>{s.instrument ? getInstrumentEmoji(s.instrument) : ''}</span>
                        <span style={{ fontSize: 11, color: '#8080A8', flexShrink: 0 }}>{s.teacher_name}</span>
                        <ChevronRight size={12} style={{ color: '#363656', flexShrink: 0 }} />
                      </div>
                    ))}
                  </div>
                ) : <div style={{ fontSize: 13, color: '#606088', padding: '12px 0' }}>No students linked.</div>}
                </div>

                {/* Activity — collapsed */}
                {canEdit && (
                  <CollapsedSection title="Recent Activity" count={activityLog?.length ?? 0} open={activityOpen} onToggle={() => setActivityOpen(!activityOpen)}>
                    {activityLog && activityLog.length > 0 ? (
                      <>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                          {activityLog.slice(0, 5).map((ev) => <ActivityRow key={ev.id} event={ev} />)}
                        </div>
                        <button onClick={() => setShowFullActivityLog(true)} style={{
                          background: 'none', border: 'none', color: '#6366F1', fontSize: 11, fontWeight: 600,
                          cursor: 'pointer', padding: '8px 0', textAlign: 'center', width: '100%',
                        }}>View Full Audit Log</button>
                      </>
                    ) : <div style={{ fontSize: 12, color: '#606088', padding: '8px 0' }}>No activity yet.</div>}
                  </CollapsedSection>
                )}

                {/* Invoices — collapsed */}
                {canEdit && (
                  <FamilyInvoiceSection familyId={familyId} family={family} invoices={familyInvoices} open={invoicesOpen} onToggle={() => setInvoicesOpen(!invoicesOpen)} />
                )}
              </>)}

              {/* ── MOBILE: CONTACT ── */}
              {mobileTab === 'contact' && (<>
                <div data-guide-id="family-parent-contact">
                <div style={sectionLabelStyle}>Primary Contact</div>
                {inp('parent_first_name', 'First Name')}
                {inp('parent_last_name', 'Last Name')}
                {editing ? inp('primary_email', 'Email') : (
                  <div style={{ marginBottom: 8 }}>
                    <span style={labelStyle}>Email</span>
                    <div style={{ ...valueStyle, overflowWrap: 'break-word', wordBreak: 'break-all' }}>{family.primary_email || <span style={{ color: '#363656' }}>—</span>}</div>
                  </div>
                )}
                {editing ? inp('primary_phone', 'Phone') : (
                  <div style={{ marginBottom: 8 }}>
                    <span style={labelStyle}>Phone</span>
                    <div style={valueStyle}>{family.primary_phone ? <a href={`tel:${family.primary_phone}`} style={{ color: '#D0D0E8', textDecoration: 'none' }}>{family.primary_phone}</a> : <span style={{ color: '#363656' }}>—</span>}</div>
                  </div>
                )}
                </div>

                <div data-guide-id="family-emergency-contact">
                <div style={{ ...sectionLabelStyle, marginTop: 20 }}>Emergency Contact</div>
                {inp('emergency_contact_name', 'Name')}
                {editing ? inp('emergency_contact_phone', 'Phone') : (
                  <div style={{ marginBottom: 8 }}>
                    <span style={labelStyle}>Phone</span>
                    <div style={valueStyle}>{family.emergency_contact_phone ? <a href={`tel:${family.emergency_contact_phone}`} style={{ color: '#D0D0E8', textDecoration: 'none' }}>{family.emergency_contact_phone}</a> : <span style={{ color: '#363656' }}>—</span>}</div>
                  </div>
                )}
                {inp('emergency_contact_relationship', 'Relationship')}
                </div>
              </>)}

              {/* ── MOBILE: BILLING ── */}
              {mobileTab === 'billing' && (<>
                <div style={{ marginBottom: 12 }}>
                  <span style={{
                    fontSize: 14, fontWeight: 700, padding: '5px 14px', borderRadius: 8,
                    background: rateColor.bg, border: `1px solid ${rateColor.border}`, color: rateColor.text,
                    display: 'inline-flex', alignItems: 'center', gap: 4,
                  }}>
                    ${formatRate(family.rate_tier)}/mo
                    {family.rate_tier_override && <Lock size={11} />}
                  </span>
                </div>
                <div data-guide-id="family-card-on-file">
                {fld('Card on File', family.card_last_four ? (
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#22C55E' }}><CreditCard size={13} /> {family.card_brand ?? 'Card'} ····{family.card_last_four}</span>
                ) : <span style={{ color: '#EF4444', fontWeight: 700 }}>No Card</span>)}
                </div>
                <div style={{ marginBottom: 12 }}>
                  <span style={labelStyle}>Balance</span>
                  <div style={{ marginTop: 3, fontSize: 18, fontWeight: 800, color: (family.balance ?? 0) > 0 ? '#22C55E' : (family.balance ?? 0) < 0 ? '#EF4444' : '#A0A0C8' }}>
                    {formatDollars(family.balance)}
                  </div>
                </div>
                {fld('Lifetime Paid', <span style={{ fontWeight: 700, color: '#A0A0C8' }}>{formatDollars(family.lifetime_paid_cents)}</span>)}
                {(family.overdue_balance_cents ?? 0) > 0 && fld('Overdue', <span style={{ fontWeight: 700, color: '#EF4444' }}>{formatDollars(family.overdue_balance_cents)}</span>)}

                <div style={{ ...sectionLabelStyle, marginTop: 20 }}>Notes</div>
                <div data-guide-id="family-scheduling-notes">
                  {txt('scheduling_notes', 'Scheduling Notes', 'e.g. No Mondays after 6pm, prefers same teacher for siblings...')}
                </div>
                <div data-guide-id="family-billing-notes">
                  {txt('billing_notes', 'Billing Notes', 'Billing-related notes...')}
                </div>

              </>)}

              {/* ── MOBILE: DOCUMENTS ── */}
              {mobileTab === 'documents' && (
                <FamilyDocumentsSection
                  familyId={family.id}
                  canUpload={canUpload}
                  variant="compact"
                  onUploadClick={() => { setUploadType('enrollment_agreement'); setShowUploadModal(true) }}
                  onDeleteRequest={setDeleteConfirm}
                />
              )}

              {/* ── MOBILE: NOTIFICATIONS ── */}
              {mobileTab === 'notifications' && (
                <MobileNotificationPrefs family={family} toggleStyle={mToggle} thumbStyle={mThumb} />
              )}
            </div>
          </>)}
        </div>

        {/* Modals (shared) */}
        {confirmAction && <ConfirmModal title={`${confirmAction.status === 'suspended' ? 'Suspend' : 'Cancel'} Family Billing?`} message={confirmAction.status === 'suspended' ? 'This will suspend billing.' : 'This will cancel billing.'} variant={confirmAction.status === 'cancelled' ? 'danger' : 'warning'} confirmLabel={confirmAction.status === 'suspended' ? 'Suspend' : 'Cancel Billing'} onConfirm={() => doStatusChange(confirmAction.status)} onCancel={() => setConfirmAction(null)} />}
        {deleteConfirm && <ConfirmModal title="Delete File?" message={`Delete "${deleteConfirm.file_name}"?`} variant="danger" confirmLabel="Delete" onConfirm={() => handleDeleteFile(deleteConfirm)} onCancel={() => setDeleteConfirm(null)} />}
        {showUploadModal && family && (
          <div style={{ position: 'fixed', inset: 0, zIndex: 10001, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={() => setShowUploadModal(false)}>
            <div onClick={(e) => e.stopPropagation()} style={{ background: '#1A1830', borderRadius: 16, padding: 24, width: '100%', maxWidth: 400, border: '1px solid rgba(255,255,255,0.1)' }}>
              <h3 style={{ fontSize: 16, fontWeight: 700, color: '#E0E0F4', marginBottom: 16 }}>Upload Document</h3>
              <div style={{ marginBottom: 12 }}>
                <span style={labelStyle}>Document Type</span>
                <select value={uploadType} onChange={(e) => setUploadType(e.target.value)} className="filter-select" style={{ width: '100%', marginTop: 4 }}>
                  <option value="enrollment_agreement">Enrollment Agreement</option>
                  <option value="contract">Contract</option>
                  <option value="id">ID</option>
                  <option value="insurance">Insurance</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div style={{ marginBottom: 12 }}>
                <span style={labelStyle}>Notes (optional)</span>
                <input value={uploadNotes} onChange={(e) => setUploadNotes(e.target.value)} className="filter-select" style={{ width: '100%', marginTop: 4 }} placeholder="Optional notes..." />
              </div>
              <input ref={fileInputRef} type="file" accept=".pdf,application/pdf" style={{ display: 'none' }} onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUpload(f) }} />
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" className="btn-ghost" onClick={() => setShowUploadModal(false)}>Cancel</button>
                <button type="button" className="btn-primary" onClick={() => fileInputRef.current?.click()} disabled={uploadFile.isPending}>{uploadFile.isPending ? 'Uploading...' : 'Choose File'}</button>
              </div>
            </div>
          </div>
        )}
      </div>,
      document.body
    )
  }

  // ── DESKTOP LAYOUT (unchanged) ──
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
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              {canEdit && !editing && (
                <button onClick={startEditing} className="btn-outline" style={{ fontSize: 11, padding: '5px 14px', display: 'flex', alignItems: 'center', gap: 5 }}>
                  <Pencil size={11} /> Edit
                </button>
              )}
              {editing && (
                <div style={{ display: 'flex', gap: 6 }}>
                  <button className="btn-ghost" onClick={cancelEditing} style={{ fontSize: 11, padding: '5px 12px' }}>Cancel</button>
                  <button className="btn-primary" onClick={handleSave} disabled={updateFamily.isPending} style={{ fontSize: 11, padding: '5px 14px' }}>
                    {updateFamily.isPending ? 'Saving...' : 'Save'}
                  </button>
                </div>
              )}
              <span style={{ fontSize: 11, fontWeight: 700, padding: '4px 12px', borderRadius: 8, background: statusStyle.bg, border: `1px solid ${statusStyle.border}`, color: statusStyle.color }}>
                {status.charAt(0).toUpperCase() + status.slice(1)}
              </span>
              <button
                disabled={reviewRecentlySent}
                onClick={() => { if (!reviewRecentlySent) setShowReviewModal(true) }}
                style={{
                  fontSize: 10, fontWeight: 700, padding: '4px 12px', borderRadius: 8,
                  background: reviewRecentlySent ? 'rgba(34,197,94,0.08)' : 'rgba(212,34,106,0.08)',
                  border: `1px solid ${reviewRecentlySent ? 'rgba(34,197,94,0.2)' : 'rgba(212,34,106,0.2)'}`,
                  color: reviewRecentlySent ? '#22C55E' : '#D4226A',
                  cursor: reviewRecentlySent ? 'default' : 'pointer',
                  display: 'flex', alignItems: 'center', gap: 4,
                }}
              >
                <Star size={10} /> {reviewRecentlySent ? `Review Requested ${reviewSentDate}` : 'Generate Review Request'}
              </button>
              <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, padding: 6, cursor: 'pointer', color: '#8080A8' }}><X size={16} /></button>
            </div>
          </div>

          {/* ── TABS + EDIT BUTTON ── */}
          <div style={{ display: 'flex', alignItems: 'center', padding: '16px 28px 0', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
            <div style={{ display: 'flex', gap: 4, flex: 1 }}>
              {(['account', 'director', 'messages'] as ModalTab[]).map((t) => (
                <button key={t} onClick={() => { setTab(t); if (editing) cancelEditing() }} style={{
                  padding: '8px 20px', fontSize: 12, fontWeight: 700, cursor: 'pointer', borderRadius: '8px 8px 0 0',
                  background: tab === t ? 'rgba(212,34,106,0.08)' : 'transparent',
                  color: tab === t ? '#E8488A' : '#8080A8',
                  border: tab === t ? '1px solid rgba(212,34,106,0.15)' : '1px solid transparent',
                  borderBottom: tab === t ? '1px solid #141224' : '1px solid transparent', marginBottom: -1,
                }}>{t === 'account' ? 'Account' : t === 'director' ? 'Director' : 'Messages'}</button>
              ))}
            </div>
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
                  {inp('parent_first_name', 'First Name')}
                  {inp('parent_last_name', 'Last Name')}
                  {inp('primary_email', 'Email')}
                  {inp('primary_phone', 'Phone')}
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
                  {inp('emergency_contact_name', 'Name')}
                  {inp('emergency_contact_phone', 'Phone')}
                  {inp('emergency_contact_relationship', 'Relationship')}
                </div>

                {/* RIGHT */}
                <div>
                  <div style={sectionLabelStyle}>Account</div>
                  {inp('name', 'Account Name')}
                  {fld('Member Since', family.created_at ? new Date(family.created_at).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) : '---')}
                  {family.square_customer_id && fld('Adkins Music Lessons ID', <span style={{ color: '#606088', fontSize: 11 }}>{family.square_customer_id}</span>)}
                  {family.locationName && fld('Location', family.locationName)}

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
                  {fld('Card on File', family.card_last_four ? (
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><CreditCard size={13} /> {family.card_brand ?? 'Card'} ····{family.card_last_four}</span>
                  ) : <span style={{ color: '#EF4444' }}>No Card</span>)}
                  <div style={{ marginBottom: 8 }}>
                    <span style={labelStyle}>Balance</span>
                    <div style={{ marginTop: 3, fontSize: 16, fontWeight: 800, color: (family.balance ?? 0) > 0 ? '#22C55E' : (family.balance ?? 0) < 0 ? '#EF4444' : '#A0A0C8' }}>
                      {formatDollars(family.balance)}
                    </div>
                  </div>
                </div>
              </div>

              {/* STUDENTS */}
              <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', marginTop: 20, paddingTop: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                  <Users size={14} style={{ color: '#8080A8' }} />
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#8080A8', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Students ({family.activeStudentCount} active)</span>
                </div>
                {(family.students?.length ?? 0) > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {family.students?.map((s) => {
                      const isActive = s.status === 'active'
                      return (
                        <div key={s.id} onClick={() => onNavigateStudent(s.id)} style={{
                          padding: '10px 14px', borderRadius: 10, cursor: 'pointer',
                          background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)',
                          display: 'flex', alignItems: 'center', gap: 12, opacity: isActive ? 1 : 0.5,
                        }}>
                          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 1 }}>
                            <span style={{ fontSize: 13, fontWeight: 700, color: '#E0E0F4' }}>{s.first_name} {s.last_name}</span>
                            {s.student_display_id && (
                              <span style={{ fontSize: 10, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace', color: '#606088', fontWeight: 600 }}>{s.student_display_id}</span>
                            )}
                          </div>
                          <span style={{ fontSize: 11, color: '#A0A0C8', padding: '2px 8px', borderRadius: 6, background: 'rgba(255,255,255,0.04)' }}>{instrumentWithEmojiTitle(s.instrument)}</span>
                          <span style={{ fontSize: 11, color: '#A0A0C8' }}>{s.teacher_name}</span>
                          <span style={{ fontSize: 10, color: '#A0A0C8' }}>{s.sessions_per_month ?? DEFAULT_SESSIONS_PER_MONTH} sessions</span>
                          {canEdit && isActive && (
                            <button
                              title="Remove from family"
                              onClick={(e) => { e.stopPropagation(); setRemoveStudentConfirm({ id: s.id, name: `${s.first_name} ${s.last_name}` }) }}
                              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: '#606088', display: 'flex', alignItems: 'center' }}
                              onMouseEnter={(e) => (e.currentTarget.style.color = '#EF4444')}
                              onMouseLeave={(e) => (e.currentTarget.style.color = '#606088')}
                            >
                              <UserMinus size={14} />
                            </button>
                          )}
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
                                <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 1 }}>
                                  <span style={{ fontSize: 13, fontWeight: 700, color: '#A0A0C8' }}>{s.first_name} {s.last_name}</span>
                                  {s.student_display_id && (
                                    <span style={{ fontSize: 10, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace', color: '#606088', fontWeight: 600 }}>{s.student_display_id}</span>
                                  )}
                                </div>
                                <span style={{ fontSize: 11, color: '#8080A8' }}>{instrumentWithEmojiTitle(s.instrument)}</span>
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

              {/* ACTIVITY — collapsed */}
              {canEdit && (
                <CollapsedSection title="Recent Activity" count={activityLog?.length ?? 0} open={activityOpen} onToggle={() => setActivityOpen(!activityOpen)}>
                  {activityLog && activityLog.length > 0 ? (
                    <>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        {activityLog.slice(0, 5).map((ev) => <ActivityRow key={ev.id} event={ev} />)}
                      </div>
                      <button onClick={() => setShowFullActivityLog(true)} style={{
                        background: 'none', border: 'none', color: '#6366F1', fontSize: 11, fontWeight: 600,
                        cursor: 'pointer', padding: '8px 0', textAlign: 'center', width: '100%',
                      }}>View Full Audit Log</button>
                    </>
                  ) : <div style={{ fontSize: 12, color: '#606088', padding: '8px 0' }}>No activity yet.</div>}
                </CollapsedSection>
              )}

              {/* INVOICES — collapsed */}
              {canEdit && (
                <FamilyInvoiceSection familyId={familyId} family={family} invoices={familyInvoices} open={invoicesOpen} onToggle={() => setInvoicesOpen(!invoicesOpen)} />
              )}

              {/* NOTIFICATIONS */}
              <NotificationPrefs family={family} />

              {/* DELETE FAMILY — owner only */}
              {role === 'owner' && (
                <div style={{ borderTop: '1px solid rgba(239,68,68,0.15)', marginTop: 28, paddingTop: 20 }}>
                  <button
                    onClick={() => setDeleteFamilyConfirm(true)}
                    disabled={deleteFamilyMut.isPending}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)',
                      borderRadius: 10, padding: '10px 18px', cursor: 'pointer',
                      color: '#EF4444', fontSize: 13, fontWeight: 700, width: '100%', justifyContent: 'center',
                    }}
                  >
                    <Trash2 size={14} />
                    {deleteFamilyMut.isPending ? 'Deleting…' : 'Delete Family'}
                  </button>
                  <p style={{ fontSize: 11, color: '#606088', marginTop: 8, textAlign: 'center' }}>
                    Students will be unlinked, not deleted. Billing history will be removed.
                  </p>
                </div>
              )}

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
                  {fld('Billing Day', family.billing_day ? `${family.billing_day}${family.billing_day === 1 ? 'st' : 'th'}` : '---')}
                  {fld('Card on File', family.card_last_four ? (
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><CreditCard size={13} /> {family.card_brand ?? 'Card'} ····{family.card_last_four}</span>
                  ) : <span style={{ color: '#EF4444' }}>No Card</span>)}
                  <div style={{ marginBottom: 8 }}>
                    <span style={labelStyle}>Balance</span>
                    <div style={{ marginTop: 3, fontSize: 16, fontWeight: 800, color: (family.balance ?? 0) > 0 ? '#22C55E' : (family.balance ?? 0) < 0 ? '#EF4444' : '#A0A0C8' }}>
                      {formatDollars(family.balance)}
                    </div>
                  </div>
                  {fld('Lifetime Paid', <span style={{ fontWeight: 700, color: '#A0A0C8' }}>{formatDollars(family.lifetime_paid_cents)}</span>)}
                  {(family.overdue_balance_cents ?? 0) > 0 && fld('Overdue', <span style={{ fontWeight: 700, color: '#EF4444' }}>{formatDollars(family.overdue_balance_cents)}</span>)}

                  <div style={{ ...sectionLabelStyle, marginTop: 20 }}>Sessions</div>
                  {fld('Instruments', (family.instrumentList?.length ?? 0) > 0 ? family.instrumentList?.map((i: string) => instrumentWithEmojiTitle(i)).join(', ') : '—')}
                  {fld('Session Days', family.sessionDays?.length ? family.sessionDays?.join(', ') : '—')}
                  {fld('Sessions / Month', String(family.totalSessionsPerMonth ?? 0))}
                </div>

                {/* RIGHT — Notes (editable) + family documents */}
                <div>
                  <div style={sectionLabelStyle}>Notes</div>
                  {txt('billing_notes', 'Billing Notes', 'Billing-related notes...')}
                  {txt('scheduling_notes', 'Scheduling Notes', 'e.g. No Mondays after 6pm, prefers same teacher for siblings...')}

                  <div style={{ marginTop: 20 }}>
                    <div style={sectionLabelStyle}>Documents</div>
                    <FamilyDocumentsSection
                      familyId={family.id}
                      canUpload={canUpload}
                      onUploadClick={() => { setUploadType('enrollment_agreement'); setShowUploadModal(true) }}
                      onDeleteRequest={setDeleteConfirm}
                    />
                  </div>
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

          {/* ── TAB 3: MESSAGES ── */}
          {tab === 'messages' && (
            <div style={{ padding: '20px 28px 24px' }}>
              <FamilyMessagesTab familyId={family.id} locationId={family.primary_location_id ?? null} familyPhone={family.primary_phone ?? null} />
            </div>
          )}
          </div>{/* end scroll wrapper */}
        </>)}
      </div>

      {/* Upload Modal */}
      {showUploadModal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 10001, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setShowUploadModal(false)}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: '#1A1830', borderRadius: 16, padding: 24, width: 400, border: '1px solid rgba(255,255,255,0.1)' }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: '#E0E0F4', marginBottom: 16 }}>Upload Document</h3>
            <div style={{ marginBottom: 12 }}>
              <span style={labelStyle}>Document Type</span>
              <select value={uploadType} onChange={(e) => setUploadType(e.target.value)} className="filter-select" style={{ width: '100%', marginTop: 4 }}>
                <option value="enrollment_agreement">Enrollment Agreement</option>
                <option value="contract">Contract</option>
                <option value="id">ID</option>
                <option value="insurance">Insurance</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div style={{ marginBottom: 12 }}>
              <span style={labelStyle}>Notes (optional)</span>
              <input value={uploadNotes} onChange={(e) => setUploadNotes(e.target.value)} className="filter-select" style={{ width: '100%', marginTop: 4 }} placeholder="Optional notes..." />
            </div>
            <input ref={fileInputRef} type="file" accept=".pdf,application/pdf" style={{ display: 'none' }} onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUpload(f) }} />
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

      {removeStudentConfirm && (
        <ConfirmModal
          title="Remove Student from Family?"
          message={`Remove "${removeStudentConfirm.name}" from this family? The student will become unlinked and family rates will be recalculated.`}
          variant="warning"
          confirmLabel="Remove"
          onConfirm={() => {
            removeFromFamily.mutate(
              { studentId: removeStudentConfirm.id, familyId, studentName: removeStudentConfirm.name },
              {
                onSuccess: () => { toast.success(`${removeStudentConfirm.name} removed from family`); setRemoveStudentConfirm(null) },
                onError: (err: any) => { toast.error(err.message ?? 'Failed to remove student'); setRemoveStudentConfirm(null) },
              },
            )
          }}
          onCancel={() => setRemoveStudentConfirm(null)}
        />
      )}

      {deleteFamilyConfirm && family && (
        <ConfirmModal
          title="Delete Family?"
          message={`Permanently delete the "${family.name}" family? All ${family.activeStudentCount ?? 0} student(s) will be unlinked (not deleted). Billing history will be removed.`}
          variant="danger"
          confirmLabel="Delete Family"
          onConfirm={() => {
            deleteFamilyMut.mutate(
              { familyId: family.id, familyName: family.name },
              {
                onSuccess: () => { toast.success(`${family.name} deleted`); setDeleteFamilyConfirm(false); onClose() },
                onError: (err: any) => { toast.error(err.message ?? 'Failed to delete family'); setDeleteFamilyConfirm(false) },
              },
            )
          }}
          onCancel={() => setDeleteFamilyConfirm(false)}
        />
      )}

      {showReviewModal && family && (
        <ReviewRequestModal
          familyId={family.id}
          familyName={family.name}
          parentName={family.parent_name ?? family.primary_contact_name ?? ''}
          locationId={family.primary_location_id ?? family.students?.[0]?.location_id ?? ''}
          students={(family.students ?? []).filter((s: any) => s.status === 'active').map((s: any) => ({
            name: `${s.first_name ?? ''} ${s.last_name ?? ''}`.trim(),
            instrument: s.instrument ?? 'music',
            createdAt: s.created_at ?? new Date().toISOString(),
          }))}
          onClose={() => setShowReviewModal(false)}
        />
      )}

      {showFullActivityLog && family && (
        <FamilyActivityLogModal
          familyId={family.id}
          familyName={family.name}
          onClose={() => setShowFullActivityLog(false)}
        />
      )}
    </div>,
    document.body
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

  // Fetch student effective rates + tier flags (exclude pending duplicate candidates from tier math)
  const { data: invoiceStudentBundle } = useQuery({
    queryKey: ['family_inv_students', TENANT_ID, family.id],
    queryFn: async () => {
      const { data: rows, error: rErr } = await supabase.from('student_effective_rate')
        .select('student_id, family_id, first_name, last_name, instrument, sessions_per_month, rate_per_session, monthly_cents, location_id')
        .eq('family_id', family.id)
      if (rErr) throw rErr
      const list = rows ?? []
      const ids = [...new Set(list.map((s: any) => s.student_id).filter(Boolean))]
      let tierMap = new Map<string, boolean | null>()
      if (ids.length) {
        const { data: flags, error: fErr } = await supabase
          .from('students')
          .select('id, counts_toward_family_tier')
          .eq('tenant_id', TENANT_ID)
          .in('id', ids)
        if (fErr) throw fErr
        tierMap = new Map((flags ?? []).map((f: any) => [f.id, f.counts_toward_family_tier]))
      }
      return { rows: list, tierMap }
    },
  })

  // Recalculate rates with military toggle (tier tier uses only students that count toward family tier)
  const students = useMemo(() => {
    if (!invoiceStudentBundle) return []
    const { rows: familyStudents, tierMap } = invoiceStudentBundle
    const eligible = familyStudents.filter((st: any) => tierMap.get(st.student_id) !== false)
    const activeCount = eligible.length
    const totalSessions = eligible.reduce((s: number, st: any) => s + (st.sessions_per_month ?? DEFAULT_SESSIONS_PER_MONTH), 0)
    const rate = calculatePreviewRate(activeCount, totalSessions, isMilitary)
    return familyStudents.map((s: any) => {
      const sessions = s.sessions_per_month ?? DEFAULT_SESSIONS_PER_MONTH
      return { ...s, computed_rate: rate, computed_monthly: rate * sessions }
    })
  }, [invoiceStudentBundle, isMilitary])

  const tierEligibleCountForLabel = useMemo(() => {
    if (!invoiceStudentBundle) return students.length
    return invoiceStudentBundle.rows.filter((st: any) => invoiceStudentBundle.tierMap.get(st.student_id) !== false).length
  }, [invoiceStudentBundle, students.length])

  const totalCents = students.reduce((s: number, st: any) => s + st.computed_monthly, 0)

  const generateInvoice = useGenerateInvoice()

  async function handleCreate() {
    if (students.length === 0) return
    setCreating(true)
    try {
      const result = await generateInvoice.mutateAsync({
        tenantId: TENANT_ID,
        familyId: family.id,
        familyName: family.name,
        parentName: family.parent_name ?? family.parent_first_name ?? '',
        primaryEmail: family.primary_email ?? null,
        primaryPhone: family.primary_phone ?? null,
        cardLastFour: family.card_last_four ?? null,
        isMilitary,
        billingDay: family.billing_day ?? 1,
        primaryLocationId: family.primary_location_id ?? null,
        periodLabel,
        dueDate,
        performedBy: user?.id ?? null,
        performerName: profile ? `${profile.first_name} ${profile.last_name}`.trim() : null,
      })
      toast(`Invoice created for ${formatDollars(result.totalCents)}${result.pdfUrl ? ' — PDF saved' : ''}`, 'success')
      onClose()
    } catch (err: any) {
      toast(err.message ?? 'Failed to create invoice', 'error')
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
                  <span>{instrumentWithEmojiTitle(s.instrument)}</span>
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
                {!isMilitary && tierEligibleCountForLabel >= 2 && <span style={{ color: '#FFB800', fontWeight: 700 }}> &middot; Multi-student rate</span>}
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
      qc.invalidateQueries({ queryKey: qk.families.fileDetail })
      qc.invalidateQueries({ queryKey: qk.families.all })
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

// ═══════════════════════════════════════
// FAMILY MESSAGES TAB (studio_messages)
// ═══════════════════════════════════════

interface StudioMessageRow {
  id: string
  message_text: string
  direction: string
  created_at: string
  sent_by_profile_id: string | null
  read: boolean | null
}

function FamilyMessagesTab({ familyId, locationId, familyPhone }: {
  familyId: string; locationId: string | null; familyPhone: string | null
}) {
  const { user, tenantId } = useAuthContext()
  const qc = useQueryClient()
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const [text, setText] = useState('')

  const { data: location } = useQuery({
    queryKey: qk.communications.adminFamilyLocation(locationId),
    enabled: !!locationId,
    queryFn: async () => {
      const { data } = await supabase.from('locations').select('id, phone, name').eq('id', locationId!).single()
      return data
    },
  })

  const { data: messages, isLoading } = useQuery<StudioMessageRow[]>({
    queryKey: qk.communications.adminFamily(familyId),
    queryFn: async () => {
      const { data } = await supabase
        .from('studio_messages')
        .select('id, message_text, direction, created_at, sent_by_profile_id, read')
        .eq('family_id', familyId)
        .order('created_at', { ascending: true })
        .limit(500)
      return (data ?? []) as StudioMessageRow[]
    },
    refetchInterval: 60_000,
  })

  useEffect(() => {
    if (!messages?.length) return
    const frame = requestAnimationFrame(() => {
      const el = scrollRef.current
      if (el) el.scrollTop = el.scrollHeight
    })
    return () => cancelAnimationFrame(frame)
  }, [messages])

  // Mark unread inbound messages as read — batched IN clauses + cancellation-safe invalidate
  useEffect(() => {
    if (!messages || !user) return
    let cancelled = false
    const unread = messages.filter(m => m.direction === 'inbound' && !m.read)
    if (unread.length === 0) return

    const ids = unread.map(m => m.id)
    const BATCH = 80

    ;(async () => {
      for (let i = 0; i < ids.length; i += BATCH) {
        if (cancelled) return
        const slice = ids.slice(i, i + BATCH)
        const { error } = await supabase.from('studio_messages').update({
          read: true, read_at: new Date().toISOString(), read_by: user.id,
        }).in('id', slice)
        if (error) return
      }
      if (!cancelled) {
        qc.invalidateQueries({ queryKey: qk.communications.adminFamily(familyId) })
      }
    })()

    return () => {
      cancelled = true
    }
  }, [messages, user, familyId, qc])

  const sendMessage = useMutation({
    mutationFn: async (body: string) => {
      if (!tenantId) throw new Error('No tenant')
      const { error } = await supabase.from('studio_messages').insert({
        tenant_id: tenantId,
        family_id: familyId,
        location_id: locationId,
        message_text: body,
        direction: 'outbound',
        sent_via: 'quo',
        quo_queued: true,
        to_phone: familyPhone,
        from_phone: location?.phone ?? null,
        sent_by_profile_id: user?.id ?? null,
      })
      if (error) throw error
    },
    onSuccess: () => {
      setText('')
      qc.invalidateQueries({ queryKey: qk.communications.adminFamily(familyId) })
      toast('Message queued for delivery', 'success')
    },
    onError: (err: any) => toast(err.message ?? 'Failed to send', 'error'),
  })

  const handleSend = () => {
    const body = text.trim()
    if (!body || sendMessage.isPending) return
    sendMessage.mutate(body)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '60vh', minHeight: 400 }}>
      <div style={{ fontSize: 11, color: '#8080A8', marginBottom: 10 }}>
        Two-way SMS with the family{location?.name ? ` via ${location.name}` : ''}. Delivered by QUO.
      </div>

      <div ref={scrollRef} style={{
        flex: 1, overflowY: 'auto', padding: 12, borderRadius: 10,
        background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)',
        display: 'flex', flexDirection: 'column', gap: 8,
      }}>
        {isLoading ? (
          <div style={{ margin: 'auto', color: '#606088', fontSize: 12 }}>Loading...</div>
        ) : !messages || messages.length === 0 ? (
          <div style={{ margin: 'auto', textAlign: 'center', color: '#606088', fontSize: 12, maxWidth: 280 }}>
            <MessageCircle size={24} style={{ color: '#606088', marginBottom: 8 }} />
            <div>No messages yet.</div>
          </div>
        ) : (
          messages.map(m => {
            const isOutbound = m.direction === 'outbound'
            return (
              <div key={m.id} style={{
                alignSelf: isOutbound ? 'flex-end' : 'flex-start',
                maxWidth: '78%', padding: '8px 12px', borderRadius: 12,
                background: isOutbound ? 'rgba(212,34,106,0.15)' : 'rgba(255,255,255,0.04)',
                border: `1px solid ${isOutbound ? 'rgba(212,34,106,0.25)' : 'rgba(255,255,255,0.06)'}`,
              }}>
                <div style={{ fontSize: 13, color: '#E0E0F4', lineHeight: 1.4, whiteSpace: 'pre-wrap' }}>{m.message_text}</div>
                <div style={{ fontSize: 9, color: '#606088', marginTop: 4, textAlign: isOutbound ? 'right' : 'left' }}>
                  {new Date(m.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                </div>
              </div>
            )
          })
        )}
      </div>

      <div style={{ marginTop: 10, display: 'flex', gap: 8, alignItems: 'flex-end' }}>
        <textarea
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); handleSend() } }}
          placeholder="Type a message to the family..."
          rows={2}
          style={{
            flex: 1, padding: '10px 12px', borderRadius: 10, resize: 'none',
            border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.04)',
            color: '#E8E8FC', fontSize: 13, fontFamily: 'inherit', outline: 'none',
          }}
        />
        <button
          onClick={handleSend}
          disabled={!text.trim() || sendMessage.isPending}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: 44, height: 44, borderRadius: 10, border: 'none',
            cursor: (!text.trim() || sendMessage.isPending) ? 'not-allowed' : 'pointer',
            background: text.trim() ? '#D4226A' : 'rgba(255,255,255,0.06)',
            color: text.trim() ? '#fff' : '#606088', flexShrink: 0,
            opacity: sendMessage.isPending ? 0.5 : 1,
          }}
        >
          <Send size={16} />
        </button>
      </div>
    </div>
  )
}

