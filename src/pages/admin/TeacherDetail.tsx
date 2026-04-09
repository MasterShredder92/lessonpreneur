import { useState, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import MusicLoader from '../../components/shared/MusicLoader'
import { useAuthContext } from '../../app/AuthContext'
import { useTeacher, useTeacherAvailability, useTeacherStudents, useTeacherBlocks, useUpdateTeacher } from '../../hooks/useTeachers'
import { useLocations } from '../../hooks/useLocations'
import { useTeacherPaySummary } from '../../hooks/usePayTally'
import TeacherFormModal from '../../components/teachers/TeacherFormModal'
import AvailabilityEditModal from '../../components/teachers/AvailabilityEditModal'
import { supabase } from '../../lib/supabase'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Pencil, Camera, ChevronDown, ChevronRight, Upload, Trash2, FileText, Users, PhoneOff } from 'lucide-react'
import { useTeacherCalloutTally, useTeacherCalloutHistory } from '../../hooks/useTeacherCallout'
import { getInstrumentEmoji, instrumentWithEmojiTitle } from '../../utils/instrumentEmoji'
import ConfirmModal from '../../components/shared/ConfirmModal'
import TeacherDocumentsModal from '../../components/teachers/TeacherDocumentsModal'
import { toast } from '../../components/shared/Toast'
import { IssueContextProvider } from '../../contexts/IssueContext'
import ReportIssueButton from '../../components/shared/ReportIssueButton'
import TeachersPageGuide from '../../components/admin/TeachersPageGuide'
import { usePermissions } from '../../hooks/usePermissions'
import { qk } from '../../lib/queryKeys'

const DAYS_ORDERED = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] as const
const DAY_LABELS: Record<string, string> = {
  sunday: 'Sun', monday: 'Mon', tuesday: 'Tue', wednesday: 'Wed',
  thursday: 'Thu', friday: 'Fri', saturday: 'Sat',
}

function formatTime12(t: string | undefined | null): string {
  if (!t) return '—'
  const [hh, mm] = t.split(':').map(Number)
  const ampm = hh >= 12 ? 'pm' : 'am'
  const h = hh % 12 || 12
  return `${h}:${String(mm).padStart(2, '0')}${ampm}`
}

/* ── label styles (reusable) ── */
const sectionLabelStyle: React.CSSProperties = { fontSize: 10, fontWeight: 700, color: '#8080A8', textTransform: 'uppercase', letterSpacing: '0.08em' }
const fieldLabelStyle: React.CSSProperties = { fontSize: 9, fontWeight: 700, color: '#606088', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2 }
const fieldValueStyle: React.CSSProperties = { fontSize: 12, color: '#C0C0E0', lineHeight: 1.5 }

export default function TeacherDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { role, tenantId, profile: authProfile } = useAuthContext()
  const { data: teacher, isLoading, error: teacherError } = useTeacher(id)
  const { data: availabilityData } = useTeacherAvailability(id)
  const availability = availabilityData?.flat
  const { data: students } = useTeacherStudents(id)
  const { data: blocks } = useTeacherBlocks(id)
  const { data: locations } = useLocations()
  const updateTeacher = useUpdateTeacher()
  const { canViewTeacherCompensation, canViewTeacherDocuments, isStudioDirector: isSD, locationIds: sdLocationIds, isAtLeast } = usePermissions()
  const { data: paySummary } = useTeacherPaySummary(id)
  const { data: calloutTally } = useTeacherCalloutTally(id)
  const { data: calloutHistory } = useTeacherCalloutHistory(id)
  const [showCalloutHistory, setShowCalloutHistory] = useState(false)
  const qc = useQueryClient()
  const canEdit = isAtLeast('studio_director')
  const photoInputRef = useRef<HTMLInputElement>(null)

  // ─── State ───
  const [showEditForm, setShowEditForm] = useState(false)
  const [showAvailForm, setShowAvailForm] = useState(false)
  const [showAiContext, setShowAiContext] = useState(false)
  const [photoUploading, setPhotoUploading] = useState(false)
  const [payMonthView, setPayMonthView] = useState<string>('')
  const [expandedLocId, setExpandedLocId] = useState<string | null>(null)
  const [noteText, setNoteText] = useState('')
  const [noteSubmitting, setNoteSubmitting] = useState(false)
  const [docCategory, setDocCategory] = useState<string>('Other')
  const [docUploading, setDocUploading] = useState(false)
  const [showDocsModal, setShowDocsModal] = useState(false)
  const docInputRef = useRef<HTMLInputElement>(null)
  const [pendingConfirm, setPendingConfirm] = useState<{ title: string; message: string; variant?: 'warning' | 'danger' | 'info'; onConfirm: () => void } | null>(null)
  const [mobileTab, setMobileTab] = useState<'overview' | 'profile' | 'documents'>('overview')

  // ─── Availability editor (shared modal) ───

  // ─── Teacher Notes query (gated to canEdit — owner/admin only) ───
  const { data: teacherNotes, refetch: refetchNotes } = useQuery({
    queryKey: ['teacher-notes', id],
    enabled: !!id && canEdit,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('teacher_notes')
        .select('*')
        .eq('teacher_id', id!)
        .order('created_at', { ascending: false })
      if (error) throw error

      // Resolve author names
      const authorIds = [...new Set((data ?? []).filter((n: any) => n.created_by).map((n: any) => n.created_by))]
      const authorMap = new Map<string, string>()
      if (authorIds.length > 0) {
        const { data: profiles } = await supabase.from('profiles').select('id, first_name, last_name').in('id', authorIds)
        profiles?.forEach((p: any) => authorMap.set(p.id, `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim()))
      }

      return (data ?? []).map((n: any) => ({
        ...n,
        author_name: n.created_by ? authorMap.get(n.created_by) ?? 'Unknown' : 'Unknown',
      })) as { id: string; teacher_id: string; note_text: string; created_by: string; created_at: string; author_name: string }[]
    },
  })

  // ─── Teacher Documents query (restricted — never fetched for studio directors) ───
  const { data: teacherDocs, refetch: refetchDocs } = useQuery({
    queryKey: ['teacher-documents', id],
    enabled: !!id && canViewTeacherDocuments,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('teacher_documents')
        .select('*')
        .eq('teacher_id', id!)
        .order('uploaded_at', { ascending: false })
      if (error) throw error
      return data as { id: string; teacher_id: string; file_url: string; file_name: string; category: string; uploaded_by: string; uploaded_at: string }[]
    },
  })

  // ─── Photo Upload ───
  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !tenantId || !id) return
    setPhotoUploading(true)
    try {
      const ext = file.name.split('.').pop()
      const path = `${tenantId}/teachers/${id}.${ext}`
      await supabase.storage.from('tenant-assets').upload(path, file, { upsert: true })
      const { data: urlData } = supabase.storage.from('tenant-assets').getPublicUrl(path)
      await supabase.from('teachers').update({ photo_url: urlData.publicUrl }).eq('id', id).eq('tenant_id', tenantId!)
      qc.invalidateQueries({ queryKey: qk.teachers.record(id) })
    } catch (err) { toast('Photo upload failed', 'error') }
    finally { setPhotoUploading(false) }
  }

  // ─── Note Submit ───
  const handleAddNote = async () => {
    if (!noteText.trim() || !id || !tenantId) return
    setNoteSubmitting(true)
    try {
      const { error } = await supabase.from('teacher_notes').insert({ teacher_id: id, note_text: noteText.trim(), created_by: authProfile?.id ?? null })
      if (error) throw error
      setNoteText('')
      refetchNotes()
      toast('Note added', 'success')
    } catch (err: any) { toast('Failed to add note: ' + (err.message ?? 'Unknown error'), 'error') }
    finally { setNoteSubmitting(false) }
  }

  // ─── Document Upload ───
  const handleDocUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !tenantId || !id) return
    setDocUploading(true)
    try {
      const ts = Date.now()
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
      const path = `${tenantId}/teachers/${id}/docs/${ts}_${safeName}`
      await supabase.storage.from('tenant-assets').upload(path, file)
      const { data: urlData } = supabase.storage.from('tenant-assets').getPublicUrl(path)
      const uploadedBy = authProfile ? `${authProfile.first_name} ${authProfile.last_name}`.trim() : 'Admin'
      await supabase.from('teacher_documents').insert({
        teacher_id: id,
        file_url: urlData.publicUrl,
        file_name: file.name,
        category: docCategory,
        uploaded_by: uploadedBy,
      })
      refetchDocs()
    } catch (err) { toast('Document upload failed', 'error') }
    finally { setDocUploading(false) }
  }

  // ─── Document Delete ───
  const handleDocDelete = (docId: string) => {
    setPendingConfirm({
      title: 'Delete Document',
      message: 'Are you sure you want to delete this document? This cannot be undone.',
      variant: 'danger',
      onConfirm: async () => {
        setPendingConfirm(null)
        await supabase.from('teacher_documents').delete().eq('id', docId)
        refetchDocs()
        toast('Document deleted', 'success')
      },
    })
  }

  const openAvailEditor = () => setShowAvailForm(true)

  // ─── Loading / Error ───
  if (isLoading) {
    return (
      <div className="page">
        <div className="loading-screen" style={{ height: 200 }}><MusicLoader /></div>
      </div>
    )
  }

  if (teacherError || !teacher) {
    return (
      <div className="page">
        <button className="btn-ghost" onClick={() => navigate('/admin/teachers')} style={{ marginBottom: 16 }}>← Back to Teachers</button>
        <div className="form-error">Failed to load teacher: {(teacherError as Error)?.message ?? 'Not found'}</div>
      </div>
    )
  }

  // ─── Derived data ───
  const t = teacher as any
  const teacherName = `${t.first_name ?? t.profile?.first_name ?? ''} ${t.last_name ?? t.profile?.last_name ?? ''}`.trim()
  const teacherEmail = t.email ?? t.profile?.email ?? null
  const teacherPhone = t.phone ?? t.profile?.phone ?? null
  const ai = t.ai_context ?? {}

  const statusColor = t.status === 'at_capacity' ? '#FFB800' : t.status === 'inactive' ? '#EF4444' : t.is_active === false ? '#EF4444' : '#22C55E'
  const statusLabel = t.status === 'at_capacity' ? 'At Capacity' : t.status === 'inactive' ? 'Inactive' : t.is_active === false ? 'Inactive' : 'Active'
  const statusBorder = t.status === 'at_capacity' ? 'rgba(255,184,0,0.3)' : t.status === 'inactive' || t.is_active === false ? 'rgba(239,68,68,0.3)' : 'rgba(34,197,94,0.3)'
  const statusBg = t.status === 'at_capacity' ? 'rgba(255,184,0,0.1)' : t.status === 'inactive' || t.is_active === false ? 'rgba(239,68,68,0.1)' : 'rgba(34,197,94,0.1)'

  // Group availability by location for display
  const availByLocation = new Map<string, typeof availability>()
  availability?.forEach((a) => {
    const list = availByLocation.get(a.location_id) ?? []
    list.push(a)
    availByLocation.set(a.location_id, list)
  })

  // All location IDs relevant: those with availability or in teacher_locations
  const relevantLocIds = new Set<string>()
  availability?.forEach((a) => relevantLocIds.add(a.location_id))

  const payRate = Number(t.pay_rate_per_half_hour ?? t.rate_per_block ?? 0)

  return (
    <IssueContextProvider page="The Band — Teachers" section="Teacher Detail">
    <div className="page teacher-detail-page">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <button className="btn-ghost" onClick={() => navigate('/admin/teachers')}>
          ← Back to Teachers
        </button>
        <ReportIssueButton />
        <TeachersPageGuide />
      </div>

      {/* ── Mobile tab bar ── */}
      <div className="td-mobile-tabs">
        <button className={`td-mobile-tab${mobileTab === 'overview' ? ' active' : ''}`} onClick={() => setMobileTab('overview')}>Overview</button>
        <button className={`td-mobile-tab${mobileTab === 'profile' ? ' active' : ''}`} onClick={() => setMobileTab('profile')}>Profile</button>
        {canViewTeacherDocuments && (
          <button className={`td-mobile-tab${mobileTab === 'documents' ? ' active' : ''}`} onClick={() => setMobileTab('documents')}>Documents</button>
        )}
      </div>

      {/* ══════════════════════════════════════════════════ */}
      {/* 1. HERO CARD                                       */}
      {/* ══════════════════════════════════════════════════ */}
      <div className={`location-card td-section td-tab-overview${mobileTab !== 'overview' ? ' td-tab-hidden' : ''}`} style={{ padding: '24px 28px', marginBottom: 14, cursor: 'default' }}>
        <div className="loc-card-edge" style={{ background: 'linear-gradient(180deg, #D4226A, #FF5500)', boxShadow: '0 0 14px rgba(212,34,106,0.5)' }} />
        <div className="loc-card-glow" style={{ background: 'radial-gradient(circle, rgba(212,34,106,0.08) 0%, transparent 70%)' }} />

        {/* ─── Desktop hero layout (hidden on mobile) ─── */}
        <div className="td-hero-desktop" style={{ display: 'flex', alignItems: 'stretch', gap: 0, position: 'relative', zIndex: 1 }}>

          {/* Edit pencil */}
          {canEdit && (
            <button
              onClick={() => setShowEditForm(true)}
              title="Edit Teacher"
              style={{ position: 'absolute', top: 0, right: 0, width: 32, height: 32, borderRadius: 9, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#8080A8', transition: 'all 140ms ease', zIndex: 2 }}
              onMouseEnter={(e) => { e.currentTarget.style.color = '#E8488A'; e.currentTarget.style.borderColor = 'rgba(212,34,106,0.3)'; e.currentTarget.style.background = 'rgba(212,34,106,0.08)' }}
              onMouseLeave={(e) => { e.currentTarget.style.color = '#8080A8'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'; e.currentTarget.style.background = 'rgba(255,255,255,0.06)' }}
            >
              <Pencil size={14} />
            </button>
          )}

          {/* Left — Photo + Info */}
          <div style={{ flex: 1, paddingRight: 24, display: 'flex', gap: 18 }}>
            {/* Photo */}
            <div style={{ flexShrink: 0 }}>
              <div style={{ position: 'relative', width: 72, height: 72 }}>
                {t.photo_url ? (
                  <img src={t.photo_url} alt="" style={{ width: 72, height: 72, borderRadius: '50%', objectFit: 'cover', border: '2px solid rgba(255,255,255,0.1)' }} />
                ) : (
                  <div style={{ width: 72, height: 72, borderRadius: '50%', background: 'linear-gradient(135deg, #D4226A, #FF5500)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 24, fontWeight: 800 }}>
                    {(t.first_name?.[0] ?? '').toUpperCase()}{(t.last_name?.[0] ?? '').toUpperCase()}
                  </div>
                )}
                {canEdit && (
                  <label style={{ position: 'absolute', bottom: -4, right: -4, width: 24, height: 24, borderRadius: '50%', background: 'rgba(20,18,36,0.9)', border: '1px solid rgba(255,255,255,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#A0A0C8' }}>
                    <Camera size={12} />
                    <input ref={photoInputRef} type="file" accept="image/*" onChange={handlePhotoUpload} style={{ display: 'none' }} />
                  </label>
                )}
                {photoUploading && <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><MusicLoader size={20} /></div>}
              </div>
            </div>

            {/* Name + status + instruments + bio */}
            <div style={{ minWidth: 0 }}>
              <span style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', padding: '3px 12px', borderRadius: 8, border: '1px solid', color: statusColor, borderColor: statusBorder, background: statusBg }}>
                {statusLabel}
              </span>
              {(t.sub_available || t.is_sub_available) && (
                <span style={{ marginLeft: 6, fontSize: 9, padding: '3px 8px', borderRadius: 6, background: 'rgba(168,85,247,0.15)', color: '#A78BFA', border: '1px solid rgba(168,85,247,0.25)', fontWeight: 700 }}>SUB</span>
              )}
              <h1 style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-0.03em', margin: '10px 0 2px', color: '#E0E0F4' }}>{teacherName || 'Unknown Teacher'}</h1>
              <div style={{ fontSize: 12, color: '#A0A0C8' }}>{t.teacher_role ?? 'Music Teacher'}</div>

              {/* Instrument pills */}
              <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
                {t.instruments?.map((inst: string) => (
                  <span key={inst} style={{ fontSize: 11, padding: '3px 10px', borderRadius: 6, background: 'rgba(212,34,106,0.1)', color: '#E8488A', fontWeight: 600 }}>{inst.charAt(0).toUpperCase() + inst.slice(1)}</span>
                ))}
              </div>

              {/* Bio / customer summary — 2-line clamp */}
              {(t.bio || ai.customer_summary) && (
                <p style={{ fontSize: 12, color: '#A0A0C8', lineHeight: 1.6, marginTop: 12, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const, overflow: 'hidden' }}>
                  {t.bio || ai.customer_summary}
                </p>
              )}
            </div>
          </div>

          {/* Vertical divider */}
          <div style={{ width: 1, background: 'rgba(255,255,255,0.08)', alignSelf: 'stretch', margin: '0 4px' }} />

          {/* Right — Contact + Stats */}
          <div style={{ minWidth: 220, paddingLeft: 24 }}>
            <div style={{ ...sectionLabelStyle, marginBottom: 12 }}>Contact</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div>
                <div style={fieldLabelStyle}>Email</div>
                <span style={{ fontSize: 12, color: '#C0C0E0', fontWeight: 600 }}>{teacherEmail ?? '—'}</span>
              </div>
              <div>
                <div style={fieldLabelStyle}>Phone</div>
                <span style={{ fontSize: 13, color: '#E0E0F4', fontWeight: 700 }}>{teacherPhone ?? '—'}</span>
              </div>
              {canViewTeacherCompensation && (
                <div>
                  <div style={fieldLabelStyle}>Pay Rate</div>
                  <span style={{ fontSize: 16, color: '#22C55E', fontWeight: 800 }}>${payRate.toFixed(2)}<span style={{ fontSize: 11, color: '#8080A8', fontWeight: 500 }}>/30 min</span></span>
                </div>
              )}
            </div>
            <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', marginTop: 12, paddingTop: 10, display: 'flex', gap: 16 }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 18, fontWeight: 800, color: '#E0E0F4' }}>{students?.filter((s) => s.status === 'active').length ?? 0}</div>
                <div style={{ fontSize: 8, fontWeight: 700, color: '#606088', textTransform: 'uppercase' }}>Students</div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 18, fontWeight: 800, color: '#E0E0F4' }}>{blocks?.length ?? 0}</div>
                <div style={{ fontSize: 8, fontWeight: 700, color: '#606088', textTransform: 'uppercase' }}>This Week</div>
              </div>
              {ai.meet_greet && (
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 14, fontWeight: 800, color: ai.meet_greet === 'Amazing' ? '#22C55E' : ai.meet_greet === 'Yes' ? '#FFB800' : '#8080A8' }}>{ai.meet_greet}</div>
                  <div style={{ fontSize: 8, fontWeight: 700, color: '#606088', textTransform: 'uppercase' }}>M&G Fit</div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ─── Mobile hero layout (hidden on desktop) ─── */}
        <div className="td-hero-mobile" style={{ position: 'relative', zIndex: 1 }}>
          {/* Edit pencil */}
          {canEdit && (
            <button
              onClick={() => setShowEditForm(true)}
              title="Edit Teacher"
              style={{ position: 'absolute', top: 0, right: 0, width: 32, height: 32, borderRadius: 9, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#8080A8', zIndex: 2 }}
            >
              <Pencil size={14} />
            </button>
          )}

          {/* Name first */}
          <div style={{ textAlign: 'center', marginBottom: 12 }}>
            <h1 style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.03em', margin: '0 0 4px', color: '#E0E0F4' }}>{teacherName || 'Unknown Teacher'}</h1>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', padding: '3px 10px', borderRadius: 8, border: '1px solid', color: statusColor, borderColor: statusBorder, background: statusBg }}>
                {statusLabel}
              </span>
              {(t.sub_available || t.is_sub_available) && (
                <span style={{ fontSize: 9, padding: '3px 8px', borderRadius: 6, background: 'rgba(168,85,247,0.15)', color: '#A78BFA', border: '1px solid rgba(168,85,247,0.25)', fontWeight: 700 }}>SUB</span>
              )}
            </div>
          </div>

          {/* Photo centered */}
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 12 }}>
            <div style={{ position: 'relative', width: 64, height: 64 }}>
              {t.photo_url ? (
                <img src={t.photo_url} alt="" style={{ width: 64, height: 64, borderRadius: '50%', objectFit: 'cover', border: '2px solid rgba(255,255,255,0.1)' }} />
              ) : (
                <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'linear-gradient(135deg, #D4226A, #FF5500)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 20, fontWeight: 800 }}>
                  {(t.first_name?.[0] ?? '').toUpperCase()}{(t.last_name?.[0] ?? '').toUpperCase()}
                </div>
              )}
              {canEdit && (
                <label style={{ position: 'absolute', bottom: -2, right: -2, width: 22, height: 22, borderRadius: '50%', background: 'rgba(20,18,36,0.9)', border: '1px solid rgba(255,255,255,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#A0A0C8' }}>
                  <Camera size={11} />
                  <input ref={photoInputRef} type="file" accept="image/*" onChange={handlePhotoUpload} style={{ display: 'none' }} />
                </label>
              )}
              {photoUploading && <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><MusicLoader size={18} /></div>}
            </div>
          </div>

          {/* Role + instruments row */}
          <div style={{ textAlign: 'center', marginBottom: 10 }}>
            <div style={{ fontSize: 12, color: '#A0A0C8', marginBottom: 8 }}>{t.teacher_role ?? 'Music Teacher'}</div>
            <div style={{ display: 'flex', gap: 6, justifyContent: 'center', flexWrap: 'wrap' }}>
              {t.instruments?.map((inst: string) => (
                <span key={inst} style={{ fontSize: 10, padding: '3px 10px', borderRadius: 6, background: 'rgba(212,34,106,0.1)', color: '#E8488A', fontWeight: 600 }}>{inst.charAt(0).toUpperCase() + inst.slice(1)}</span>
              ))}
            </div>
          </div>

          {/* Contact info centered */}
          <div style={{ display: 'flex', justifyContent: 'center', gap: 16, flexWrap: 'wrap', marginBottom: 10, padding: '10px 0', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
            <div style={{ textAlign: 'center' }}>
              <div style={fieldLabelStyle}>Email</div>
              <span style={{ fontSize: 11, color: '#C0C0E0', fontWeight: 600, wordBreak: 'break-all' as const }}>{teacherEmail ?? '—'}</span>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={fieldLabelStyle}>Phone</div>
              <span style={{ fontSize: 12, color: '#E0E0F4', fontWeight: 700 }}>{teacherPhone ?? '—'}</span>
            </div>
            {canViewTeacherCompensation && (
              <div style={{ textAlign: 'center' }}>
                <div style={fieldLabelStyle}>Pay Rate</div>
                <span style={{ fontSize: 14, color: '#22C55E', fontWeight: 800 }}>${payRate.toFixed(2)}<span style={{ fontSize: 10, color: '#8080A8', fontWeight: 500 }}>/30m</span></span>
              </div>
            )}
          </div>

          {/* Stats row */}
          <div style={{ display: 'flex', justifyContent: 'center', gap: 20, paddingTop: 8, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 18, fontWeight: 800, color: '#E0E0F4' }}>{students?.filter((s) => s.status === 'active').length ?? 0}</div>
              <div style={{ fontSize: 8, fontWeight: 700, color: '#606088', textTransform: 'uppercase' }}>Students</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 18, fontWeight: 800, color: '#E0E0F4' }}>{blocks?.length ?? 0}</div>
              <div style={{ fontSize: 8, fontWeight: 700, color: '#606088', textTransform: 'uppercase' }}>This Week</div>
            </div>
            {ai.meet_greet && (
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 14, fontWeight: 800, color: ai.meet_greet === 'Amazing' ? '#22C55E' : ai.meet_greet === 'Yes' ? '#FFB800' : '#8080A8' }}>{ai.meet_greet}</div>
                <div style={{ fontSize: 8, fontWeight: 700, color: '#606088', textTransform: 'uppercase' }}>M&G Fit</div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Star AI Profile + Quick Actions — side by side (desktop) / stacked (mobile overview) */}
      <div className={`td-section td-star-actions-grid td-tab-overview${mobileTab !== 'overview' ? ' td-tab-hidden' : ''}`} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12, marginBottom: 14 }}>
        <div className="location-card" data-tour-id="star-ai-profile" style={{ padding: 18, cursor: 'default' }}>
          <div className="loc-card-edge" style={{ background: 'linear-gradient(180deg, #FFB800, #FF8C00)', boxShadow: '0 0 12px rgba(255,184,0,0.4)' }} />
          <div className="loc-card-glow" style={{ background: 'radial-gradient(circle, rgba(255,184,0,0.06) 0%, transparent 70%)' }} />
          <div style={{ position: 'relative', zIndex: 1 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={sectionLabelStyle}>Star AI Profile</span>
              <button onClick={() => setShowAiContext(!showAiContext)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, color: '#FFB800', fontWeight: 600 }}>{showAiContext ? 'Collapse' : 'View Full Profile →'}</button>
            </div>
            {showAiContext && ai && (
              <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 300, overflowY: 'auto' }}>
                {[
                  { label: 'Primary Instruments', value: ai.primary_instruments?.join(', ') },
                  { label: 'Secondary Instruments', value: ai.secondary_instruments?.join(', ') },
                  { label: 'Style & Genres', value: ai.style_genre },
                  { label: 'Preferred Age Range', value: ai.preferred_age },
                  { label: 'Personality', value: ai.personality },
                  { label: 'Lesson Style', value: ai.lesson_style },
                  { label: 'Teaching Strengths', value: ai.teaching_strengths },
                  { label: 'Musical Background', value: ai.musical_background },
                  { label: 'Ideal Students', value: ai.best_match },
                  { label: 'Placement Notes', value: ai.use_caution },
                  { label: 'Meet & Greet Fit', value: ai.meet_greet },
                  { label: 'Sub Coverage', value: ai.sub_coverage },
                  { label: 'Customer Summary', value: ai.customer_summary },
                  { label: 'Internal Tags', value: ai.internal_tags },
                  { label: 'Director Notes', value: ai.director_notes },
                ].filter((r) => r.value).map((row) => (
                  <div key={row.label} style={{ padding: '6px 10px', background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.04)', borderRadius: 8 }}>
                    <div style={{ ...fieldLabelStyle, color: '#8080A8', marginBottom: 2 }}>{row.label}</div>
                    <div style={{ ...fieldValueStyle, fontSize: 11 }}>{row.value}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="location-card" style={{ padding: 18, cursor: 'default' }}>
          <div className="loc-card-edge" style={{ background: 'linear-gradient(180deg, #D4226A, #FF5500)', boxShadow: '0 0 12px rgba(212,34,106,0.4)' }} />
          <div className="loc-card-glow" style={{ background: 'radial-gradient(circle, rgba(212,34,106,0.06) 0%, transparent 70%)' }} />
          <div style={{ position: 'relative', zIndex: 1 }}>
            <div style={{ ...sectionLabelStyle, marginBottom: 12 }}>Quick Actions</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <button className="btn-outline" onClick={() => navigate('/admin/schedule?teacher=' + teacher.id)} style={{ fontSize: 12, padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                <span>View Schedule</span><span style={{ color: '#8080A8', fontSize: 11 }}>{blocks?.length ?? 0} this week</span>
              </button>
              <button className="btn-outline" onClick={() => navigate('/admin/students?teacher=' + teacher.id)} style={{ fontSize: 12, padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                <span>View Students</span><span style={{ color: '#8080A8', fontSize: 11 }}>{students?.filter((s: any) => s.status === 'active').length ?? 0}</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════ */}
      {/* 2b. STUDENT ROSTER (Overview tab)                   */}
      {/* ══════════════════════════════════════════════════ */}
      {(() => {
        const allActive = students?.filter((s: any) => s.status === 'active') ?? []
        // Studio directors: only see students at their assigned location(s)
        const active = isSD
          ? allActive.filter((s: any) => sdLocationIds.includes(s.location_id))
          : allActive
        if (active.length === 0) return null
        return (
          <div className={`td-section td-tab-overview${mobileTab !== 'overview' ? ' td-tab-hidden' : ''}`} style={{ marginBottom: 14 }}>
            <div className="location-card" data-tour-id="teacher-students-list" style={{ padding: 18, cursor: 'default' }}>
              <div className="loc-card-edge" style={{ background: 'linear-gradient(180deg, #3b82f6, #6366f1)', boxShadow: '0 0 12px rgba(59,130,246,0.4)' }} />
              <div className="loc-card-glow" style={{ background: 'radial-gradient(circle, rgba(59,130,246,0.06) 0%, transparent 70%)' }} />
              <div style={{ position: 'relative', zIndex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Users size={13} style={{ color: '#3b82f6' }} />
                    <span style={sectionLabelStyle}>Students ({active.length})</span>
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {active.map((s: any) => {
                    const loc = locations?.find((l: any) => l.id === s.location_id)
                    return (
                      <div
                        key={s.id}
                        onClick={() => navigate(`/admin/students/${s.id}`)}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 10,
                          padding: '10px 12px', borderRadius: 10, cursor: 'pointer',
                          background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)',
                          transition: 'background 150ms',
                        }}
                        onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.06)')}
                        onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.03)')}
                      >
                        <span style={{ fontSize: 16, flexShrink: 0 }}>{s.instrument ? getInstrumentEmoji(s.instrument) : '\u{1F3B5}'}</span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 700, color: '#E0E0F4', overflowWrap: 'break-word' }}>{s.first_name} {s.last_name}</div>
                          <div style={{ fontSize: 11, color: '#8080A8' }}>{s.instrument ? s.instrument.charAt(0).toUpperCase() + s.instrument.slice(1) : '—'}</div>
                        </div>
                        {loc && <span style={{ fontSize: 10, fontWeight: 600, color: loc.color ?? '#8080A8', padding: '2px 8px', borderRadius: 6, background: `${loc.color ?? '#8080A8'}15`, flexShrink: 0 }}>{loc.name?.replace(' Music Lessons', '')}</span>}
                        <ChevronRight size={14} style={{ color: '#363656', flexShrink: 0 }} />
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          </div>
        )
      })()}

      {/* ══════════════════════════════════════════════════ */}
      {/* 2c. CALLOUT HISTORY (Overview tab)                   */}
      {/* ══════════════════════════════════════════════════ */}
      <div className={`td-section td-tab-overview${mobileTab !== 'overview' ? ' td-tab-hidden' : ''}`} style={{ marginBottom: 14 }}>
        <div className="location-card" style={{ padding: 18, cursor: 'default' }}>
          <div className="loc-card-edge" style={{ background: 'linear-gradient(180deg, #D97706, #B45309)', boxShadow: '0 0 12px rgba(217,119,6,0.4)' }} />
          <div className="loc-card-glow" style={{ background: 'radial-gradient(circle, rgba(217,119,6,0.06) 0%, transparent 70%)' }} />
          <div style={{ position: 'relative', zIndex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 14 }}>
              <PhoneOff size={13} style={{ color: '#D97706' }} />
              <span style={sectionLabelStyle}>Callout History</span>
            </div>

            {/* Tally stats */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))', gap: 8, marginBottom: calloutHistory && calloutHistory.length > 0 ? 14 : 0 }}>
              {[
                { label: 'Total Callouts', value: calloutTally?.total_callouts ?? 0 },
                { label: 'This Month', value: calloutTally?.callouts_this_month ?? 0 },
                { label: 'Last 60 Days', value: calloutTally?.callouts_last_60_days ?? 0 },
                { label: 'Blocks Affected', value: calloutTally?.total_blocks_affected ?? 0 },
              ].map(stat => (
                <div key={stat.label} style={{ padding: '10px 12px', background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.04)', borderRadius: 8, textAlign: 'center' }}>
                  <div style={{ fontSize: 18, fontWeight: 800, color: stat.value > 0 ? '#D97706' : '#606088' }}>{stat.value}</div>
                  <div style={{ fontSize: 9, fontWeight: 700, color: '#606088', textTransform: 'uppercase', letterSpacing: '0.04em', marginTop: 2 }}>{stat.label}</div>
                </div>
              ))}
            </div>

            {/* Last callout date */}
            {calloutTally?.last_callout_date && (
              <div style={{ fontSize: 11, color: '#8080A8', marginBottom: 10 }}>
                Last callout: {new Date(calloutTally.last_callout_date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
              </div>
            )}

            {/* Collapsible history list */}
            {calloutHistory && calloutHistory.length > 0 && (
              <>
                <button
                  onClick={() => setShowCalloutHistory(v => !v)}
                  style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', color: '#D97706', fontSize: 11, fontWeight: 600, cursor: 'pointer', padding: 0 }}
                >
                  {showCalloutHistory ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                  {showCalloutHistory ? 'Hide' : 'Show'} individual records ({calloutHistory.length})
                </button>
                {showCalloutHistory && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 10 }}>
                    {calloutHistory.map(record => {
                      const loc = locations?.find((l: any) => l.id === record.location_id)
                      return (
                        <div key={record.id} style={{ padding: '8px 12px', background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.04)', borderRadius: 8 }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <span style={{ fontSize: 12, fontWeight: 700, color: '#E0E0F4' }}>
                              {new Date(record.callout_date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                            </span>
                            <span style={{ fontSize: 10, color: '#8080A8' }}>{record.blocks_affected} block{record.blocks_affected !== 1 ? 's' : ''}</span>
                          </div>
                          {record.reason && (
                            <div style={{ fontSize: 11, color: '#A0A0C8', marginTop: 3 }}>— {record.reason}</div>
                          )}
                          {loc && (
                            <span style={{ fontSize: 9, fontWeight: 600, color: (loc as any).color ?? '#8080A8', marginTop: 3, display: 'inline-block' }}>
                              {loc.name?.replace(' Music Lessons', '')}
                            </span>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </>
            )}

            {!calloutTally && (!calloutHistory || calloutHistory.length === 0) && (
              <p style={{ fontSize: 12, color: '#606088', margin: 0 }}>No callouts on record.</p>
            )}
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════ */}
      {/* 3. TEACHING PROFILE + BEST MATCH (side by side)    */}
      {/* ══════════════════════════════════════════════════ */}
      <div className={`td-section td-profile-grid td-tab-profile${mobileTab !== 'profile' ? ' td-tab-hidden' : ''}`} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
        {/* Teaching Profile */}
        <div className="location-card" data-tour-id="teaching-profile" style={{ padding: 18, cursor: 'default' }}>
          <div className="loc-card-edge" style={{ background: 'linear-gradient(180deg, #FF5500, #FF8C00)', boxShadow: '0 0 12px rgba(255,85,0,0.4)' }} />
          <div className="loc-card-glow" style={{ background: 'radial-gradient(circle, rgba(255,85,0,0.06) 0%, transparent 70%)' }} />
          <div style={{ position: 'relative', zIndex: 1 }}>
            <div style={{ ...sectionLabelStyle, marginBottom: 10 }}>Teaching Profile</div>
            {(t.personality || ai.personality) && (
              <div style={{ marginBottom: 8 }}>
                <span style={fieldLabelStyle}>Personality</span>
                <div style={fieldValueStyle}>{t.personality || ai.personality}</div>
              </div>
            )}
            {(t.lesson_style || ai.lesson_style) && (
              <div style={{ marginBottom: 8 }}>
                <span style={fieldLabelStyle}>Lesson Style</span>
                <div style={fieldValueStyle}>{t.lesson_style || ai.lesson_style}</div>
              </div>
            )}
            {(t.best_age_range || ai.preferred_age) && (
              <div>
                <span style={fieldLabelStyle}>Best Age Range</span>
                <div style={fieldValueStyle}>{t.best_age_range || ai.preferred_age}</div>
              </div>
            )}
            {!t.personality && !ai.personality && !t.lesson_style && !ai.lesson_style && !t.best_age_range && !ai.preferred_age && (
              <p style={{ fontSize: 12, color: '#606088' }}>No teaching profile data yet.</p>
            )}
          </div>
        </div>

        {/* Best Match */}
        <div className="location-card" style={{ padding: 18, cursor: 'default' }}>
          <div className="loc-card-edge" style={{ background: 'linear-gradient(180deg, #D97706, #FFB800)', boxShadow: '0 0 12px rgba(255,184,0,0.4)' }} />
          <div className="loc-card-glow" style={{ background: 'radial-gradient(circle, rgba(255,184,0,0.06) 0%, transparent 70%)' }} />
          <div style={{ position: 'relative', zIndex: 1 }}>
            <div style={{ ...sectionLabelStyle, marginBottom: 10 }}>Best Match</div>
            {ai.best_match && (
              <div style={{ marginBottom: 8 }}>
                <span style={fieldLabelStyle}>Ideal Students</span>
                <div style={fieldValueStyle}>{ai.best_match}</div>
              </div>
            )}
            {ai.use_caution && (
              <div style={{ marginBottom: 8 }}>
                <span style={{ ...fieldLabelStyle, color: '#FF8C00' }}>Placement Notes</span>
                <div style={{ ...fieldValueStyle, color: '#A0A0C8' }}>{ai.use_caution}</div>
              </div>
            )}
            {ai.style_genre && (
              <div>
                <span style={fieldLabelStyle}>Style / Genres</span>
                <div style={fieldValueStyle}>{ai.style_genre}</div>
              </div>
            )}
            {!ai.best_match && !ai.use_caution && !ai.style_genre && (
              <p style={{ fontSize: 12, color: '#606088' }}>No match data yet.</p>
            )}
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════ */}
      {/* AVAILABILITY & LOCATIONS (moved before notes)      */}
      {/* ══════════════════════════════════════════════════ */}
      <div className={`location-card td-section td-tab-profile${mobileTab !== 'profile' ? ' td-tab-hidden' : ''}`} style={{ padding: 18, marginBottom: 14, cursor: 'default' }}>
        <div className="loc-card-edge" style={{ background: 'linear-gradient(180deg, #FF5500, #FF8C00)', boxShadow: '0 0 12px rgba(255,85,0,0.4)' }} />
        <div className="loc-card-glow" style={{ background: 'radial-gradient(circle, rgba(255,85,0,0.06) 0%, transparent 70%)' }} />
        <div style={{ position: 'relative', zIndex: 1 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <span style={sectionLabelStyle}>Availability & Locations</span>
            {canEdit && <button className="btn-outline" onClick={openAvailEditor} style={{ fontSize: 10, padding: '4px 10px' }}>Edit</button>}
          </div>
          {locations?.filter((l: any) => l.is_active).map((loc: any) => {
            const locAvail2 = availByLocation.get(loc.id) ?? []
            const isAssigned2 = locAvail2.length > 0
            if (!isAssigned2 && !relevantLocIds.has(loc.id)) return null
            const isExpanded2 = expandedLocId === loc.id
            const daysSummary2 = locAvail2.map((a: any) => DAY_LABELS[a.day_of_week]).join(' ')
            const times2 = locAvail2.map((a: any) => a.start_time)
            const timesEnd2 = locAvail2.map((a: any) => a.end_time)
            const minStart2 = times2.length > 0 ? formatTime12(times2.sort()[0]) : ''
            const maxEnd2 = timesEnd2.length > 0 ? formatTime12(timesEnd2.sort().reverse()[0]) : ''
            const summaryLine2 = isAssigned2 ? `${daysSummary2} · ${minStart2} – ${maxEnd2}` : 'Not assigned'
            return (
              <div key={loc.id} style={{ marginBottom: 8, padding: '10px 14px', background: isAssigned2 ? 'rgba(255,85,0,0.04)' : 'rgba(255,255,255,0.02)', border: `1px solid ${isAssigned2 ? 'rgba(255,85,0,0.12)' : 'rgba(255,255,255,0.04)'}`, borderRadius: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: isAssigned2 ? 'pointer' : 'default' }} onClick={() => isAssigned2 && setExpandedLocId(isExpanded2 ? null : loc.id)}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {isAssigned2 && (isExpanded2 ? <ChevronDown size={14} style={{ color: '#8080A8' }} /> : <ChevronRight size={14} style={{ color: '#8080A8' }} />)}
                    <span style={{ fontSize: 12, fontWeight: 700, color: isAssigned2 ? '#FF5500' : '#606088' }}>{loc.name.replace(' Music Lessons', '')}</span>
                  </div>
                  <span style={{ fontSize: 10, color: isAssigned2 ? '#A0A0C8' : '#363656' }}>{summaryLine2}</span>
                </div>
                {isExpanded2 && isAssigned2 && (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, marginTop: 10, paddingTop: 10, borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                    {DAYS_ORDERED.map((day) => {
                      const slot2 = locAvail2.find((a: any) => a.day_of_week === day)
                      return (
                        <div key={day} style={{ textAlign: 'center' }}>
                          <div style={{ fontSize: 9, fontWeight: 700, color: '#606088', marginBottom: 3 }}>{DAY_LABELS[day]}</div>
                          {slot2 ? (<div style={{ fontSize: 10, color: '#C0C0E0', fontWeight: 600 }}>{formatTime12(slot2.start_time)}<br />{formatTime12(slot2.end_time)}</div>) : (<div style={{ fontSize: 10, color: '#363656' }}>—</div>)}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* ══════════════════════════════════════════════════ */}
      {/* INTERNAL NOTES                                     */}
      {/* ══════════════════════════════════════════════════ */}
      {canEdit && (
        <div className={`location-card td-section td-tab-profile${mobileTab !== 'profile' ? ' td-tab-hidden' : ''}`} style={{ padding: 18, marginBottom: 14, cursor: 'default' }}>
          <div className="loc-card-edge" style={{ background: 'linear-gradient(180deg, #D4226A, #FF5500)', boxShadow: '0 0 12px rgba(212,34,106,0.4)' }} />
          <div className="loc-card-glow" style={{ background: 'radial-gradient(circle, rgba(212,34,106,0.06) 0%, transparent 70%)' }} />
          <div style={{ position: 'relative', zIndex: 1 }}>
            <div style={{ ...sectionLabelStyle, marginBottom: 12 }}>Internal Notes</div>

            {/* Add note input */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
              <input
                type="text"
                placeholder="Add a note..."
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleAddNote() }}
                style={{ flex: 1, fontSize: 12, padding: '8px 12px', borderRadius: 8, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#E0E0F4', outline: 'none' }}
              />
              <button
                className="btn-outline"
                onClick={handleAddNote}
                disabled={noteSubmitting || !noteText.trim()}
                style={{ fontSize: 11, padding: '6px 14px', whiteSpace: 'nowrap' }}
              >
                {noteSubmitting ? 'Adding...' : 'Add Note'}
              </button>
            </div>

            {/* Notes list */}
            {teacherNotes && teacherNotes.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {teacherNotes.map((note) => (
                  <div key={note.id} style={{ padding: '10px 12px', background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.04)', borderRadius: 8 }}>
                    <div style={{ fontSize: 12, color: '#C0C0E0', lineHeight: 1.5, marginBottom: 4 }}>{note.note_text}</div>
                    <div style={{ fontSize: 10, color: '#606088' }}>
                      {note.author_name} · {new Date(note.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} at {new Date(note.created_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p style={{ fontSize: 12, color: '#606088' }}>No notes yet.</p>
            )}
          </div>
        </div>
      )}

      {/* (Availability moved above Internal Notes) */}

      {/* Private Documents + Pay Summary — side by side (desktop) / stacked (mobile documents tab) */}
      {/* Studio directors: this entire section does not render — no placeholder, no restricted label */}
      {canViewTeacherDocuments && canEdit && (
        <div className={`td-section td-docs-grid td-tab-documents${mobileTab !== 'documents' ? ' td-tab-hidden' : ''}`} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
        <div className="location-card" data-tour-id="private-documents" style={{ padding: 18, cursor: 'default' }}>
          <div className="loc-card-edge" style={{ background: 'linear-gradient(180deg, #606088, #363656)', boxShadow: 'none' }} />
          <div className="loc-card-glow" style={{ background: 'none' }} />
          <div style={{ position: 'relative', zIndex: 1 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <span style={sectionLabelStyle}>Private Documents</span>
              <button onClick={() => setShowDocsModal(true)} className="btn-outline" style={{ fontSize: 10, padding: '4px 10px' }}>Open Documents Panel</button>
            </div>

            {/* Upload row */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 14, alignItems: 'center' }}>
              <select
                value={docCategory}
                onChange={(e) => setDocCategory(e.target.value)}
                style={{ fontSize: 11, padding: '6px 10px', borderRadius: 8, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#C0C0E0', outline: 'none' }}
              >
                <option value="W-9">W-9</option>
                <option value="Contract">Contract</option>
                <option value="Other">Other</option>
              </select>
              <button
                className="btn-outline"
                onClick={() => docInputRef.current?.click()}
                disabled={docUploading}
                style={{ fontSize: 11, padding: '6px 12px', display: 'flex', alignItems: 'center', gap: 6 }}
              >
                <Upload size={12} />
                {docUploading ? 'Uploading...' : 'Upload File'}
              </button>
              <input ref={docInputRef} type="file" onChange={handleDocUpload} style={{ display: 'none' }} />
            </div>

            {/* Compliance status at a glance */}
            {teacher && (
              <div onClick={() => setShowDocsModal(true)} style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 14, cursor: 'pointer' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.04)', borderRadius: 8 }}>
                  <span style={{ fontSize: 12, color: '#C0C0E0', fontWeight: 600 }}>Contract</span>
                  <span style={{
                    fontSize: 10, fontWeight: 700, padding: '3px 10px', borderRadius: 100,
                    background: teacher.contract_status === 'signed' ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
                    color: teacher.contract_status === 'signed' ? '#22C55E' : '#EF4444',
                    border: `1px solid ${teacher.contract_status === 'signed' ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}`,
                  }}>
                    {teacher.contract_status === 'signed' ? 'Signed' : 'Missing'}
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.04)', borderRadius: 8 }}>
                  <span style={{ fontSize: 12, color: '#C0C0E0', fontWeight: 600 }}>W-9</span>
                  <span style={{
                    fontSize: 10, fontWeight: 700, padding: '3px 10px', borderRadius: 100,
                    background: (teacher.w9_status === 'complete' || teacher.w9_status === 'completed') ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
                    color: (teacher.w9_status === 'complete' || teacher.w9_status === 'completed') ? '#22C55E' : '#EF4444',
                    border: `1px solid ${(teacher.w9_status === 'complete' || teacher.w9_status === 'completed') ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}`,
                  }}>
                    {(teacher.w9_status === 'complete' || teacher.w9_status === 'completed') ? 'Completed' : 'Missing'}
                  </span>
                </div>
              </div>
            )}

            {/* File list */}
            {teacherDocs && teacherDocs.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {teacherDocs.map((doc) => (
                  <div key={doc.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.04)', borderRadius: 8 }}>
                    <FileText size={14} style={{ color: '#8080A8', flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <a href={doc.file_url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: '#C0C0E0', fontWeight: 600, textDecoration: 'none' }}
                        onMouseEnter={(e) => { e.currentTarget.style.color = '#E8488A' }}
                        onMouseLeave={(e) => { e.currentTarget.style.color = '#C0C0E0' }}
                      >
                        {doc.file_name}
                      </a>
                      <div style={{ fontSize: 10, color: '#606088' }}>
                        {doc.category} · {new Date(doc.uploaded_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} · {doc.uploaded_by}
                      </div>
                    </div>
                    <button
                      onClick={() => handleDocDelete(doc.id)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#8080A8', padding: 4 }}
                      onMouseEnter={(e) => { e.currentTarget.style.color = '#EF4444' }}
                      onMouseLeave={(e) => { e.currentTarget.style.color = '#8080A8' }}
                      title="Delete document"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              !(teacher?.contract_status === 'signed' || teacher?.w9_status === 'complete' || teacher?.w9_status === 'completed') && (
                <p style={{ fontSize: 12, color: '#606088' }}>No documents uploaded yet.</p>
              )
            )}
          </div>
        </div>

        <div className="location-card" style={{ padding: 18, cursor: 'default' }}>
          <div className="loc-card-edge" style={{ background: 'linear-gradient(180deg, #D97706, #FFB800)', boxShadow: '0 0 12px rgba(255,184,0,0.4)' }} />
          <div className="loc-card-glow" style={{ background: 'radial-gradient(circle, rgba(255,184,0,0.06) 0%, transparent 70%)' }} />
          <div style={{ position: 'relative', zIndex: 1 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={sectionLabelStyle}>Pay Summary</span>
              {paySummary && paySummary.byMonth.length > 0 && (
                <select
                  className="filter-select"
                  style={{ fontSize: 11, padding: '3px 8px', width: 'auto' }}
                  value={payMonthView}
                  onChange={(e) => setPayMonthView(e.target.value)}
                >
                  <option value="">Current + Previous</option>
                  {paySummary.byMonth.map((m) => (
                    <option key={m.month} value={m.month}>{m.label}</option>
                  ))}
                </select>
              )}
            </div>

            <div style={{ marginTop: 4 }}>
              <span style={{ fontSize: 11, color: '#8080A8' }}>Rate: <span style={{ color: '#22C55E', fontWeight: 700 }}>${payRate.toFixed(2)}</span>/30 min</span>
            </div>

            {!paySummary || paySummary.byMonth.length === 0 ? (
              <p className="text-muted" style={{ fontSize: 13, marginTop: 12 }}>No sessions checked in yet.</p>
            ) : payMonthView ? (
              (() => {
                const m = paySummary.byMonth.find((x) => x.month === payMonthView)
                if (!m) return <p className="text-muted" style={{ fontSize: 13 }}>No sessions this month.</p>
                return (
                  <div className="pay-tally-grid" style={{ marginTop: 12 }}>
                    <div className="pay-tally-card">
                      <span className="pay-tally-label">{m.label}</span>
                      <span className="pay-tally-value">{m.blocks} blocks</span>
                      <span className="pay-tally-sub">× ${m.rate.toFixed(2)} = <strong style={{ color: 'var(--green)' }}>${m.total.toFixed(2)}</strong></span>
                    </div>
                  </div>
                )
              })()
            ) : (
              <div className="pay-tally-grid" style={{ marginTop: 12 }}>
                <div className="pay-tally-card">
                  <span className="pay-tally-label">This Month</span>
                  <span className="pay-tally-value">
                    {paySummary.currentMonth ? `${paySummary.currentMonth.blocks} blocks` : '0 blocks'}
                  </span>
                  <span className="pay-tally-sub">
                    {paySummary.currentMonth
                      ? `× $${paySummary.currentMonth.rate.toFixed(2)} = `
                      : `× $${payRate.toFixed(2)} = `}
                    <strong style={{ color: 'var(--green)' }}>
                      ${(paySummary.currentMonth?.total ?? 0).toFixed(2)}
                    </strong>
                  </span>
                </div>
                <div className="pay-tally-card">
                  <span className="pay-tally-label">Last Month</span>
                  <span className="pay-tally-value">
                    {paySummary.previousMonth ? `${paySummary.previousMonth.blocks} blocks` : '0 blocks'}
                  </span>
                  <span className="pay-tally-sub">
                    <strong style={{ color: 'var(--text-secondary)' }}>
                      ${(paySummary.previousMonth?.total ?? 0).toFixed(2)}
                    </strong>
                  </span>
                </div>
                <div className="pay-tally-card">
                  <span className="pay-tally-label">Year to Date</span>
                  <span className="pay-tally-value">{paySummary.ytdBlocks} blocks</span>
                  <span className="pay-tally-sub">
                    <strong style={{ color: 'var(--gold)' }}>
                      ${paySummary.ytdTotal.toFixed(2)}
                    </strong>
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════ */}
      {/* 9. EDIT FORM MODAL                                 */}
      {/* ══════════════════════════════════════════════════ */}
      {showEditForm && (
        <TeacherFormModal
          teacher={{ ...teacher, location_ids: availability?.map((a) => a.location_id).filter((v, i, arr) => arr.indexOf(v) === i) ?? [] }}
          locations={locations ?? []}
          onClose={() => setShowEditForm(false)}
        />
      )}

      {/* ══════════════════════════════════════════════════ */}
      {/* 10. AVAILABILITY EDIT MODAL                        */}
      {/* ══════════════════════════════════════════════════ */}
      {showAvailForm && id && tenantId && (
        <AvailabilityEditModal
          teacherId={id}
          teacherName={`${teacher?.first_name ?? ''} ${teacher?.last_name ?? ''}`.trim()}
          tenantId={tenantId}
          onClose={() => setShowAvailForm(false)}
        />
      )}
      {showDocsModal && teacher && (
        <TeacherDocumentsModal
          teacherId={teacher.id}
          teacherName={`${teacher.first_name ?? ''} ${teacher.last_name ?? ''}`.trim()}
          w9Status={teacher.w9_status ?? null}
          w9CompletedAt={teacher.w9_completed_at ?? null}
          contractStatus={teacher.contract_status ?? null}
          contractSignedAt={teacher.contract_signed_at ?? null}
          contractPdfUrl={teacher.contract_pdf_url ?? null}
          onClose={() => setShowDocsModal(false)}
        />
      )}
      {pendingConfirm && (
        <ConfirmModal
          title={pendingConfirm.title}
          message={pendingConfirm.message}
          variant={pendingConfirm.variant ?? 'warning'}
          confirmLabel="Yes, Continue"
          onConfirm={pendingConfirm.onConfirm}
          onCancel={() => setPendingConfirm(null)}
        />
      )}
    </div>
    </IssueContextProvider>
  )
}
