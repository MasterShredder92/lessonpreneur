import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import MusicLoader from '../../components/shared/MusicLoader'
import { useAuthContext } from '../../app/AuthContext'
import { usePermissions } from '../../hooks/usePermissions'
import { useStudentBlocks, useAvailableBlocksForStudent } from '../../hooks/useStudentSchedule'
import { useAssignStudent, useUnassignBlock } from '../../hooks/useScheduleGrid'
import { useUpdateStudent } from '../../hooks/useStudents'
import SeriesControlModal from '../../components/scheduling/SeriesControlModal'
import RetentionCaptureModal from '../../components/students/RetentionCaptureModal'
import { useLocations } from '../../hooks/useLocations'
import { useTeachers } from '../../hooks/useTeachers'
import { supabase } from '../../lib/supabase'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Star, Music, MapPin, Phone, Mail, DollarSign, Upload, FileText, Trash2, Pencil, Download, Send, Lock } from 'lucide-react'
import { useFamilyRate, useOverrideFamilyRate, useRemoveFamilyRateOverride, useAddSessionCredit, getRateTierLabel, getRateTierColor, formatRate } from '../../hooks/useFamilyRate'
import ConfirmModal from '../../components/shared/ConfirmModal'
import { toast } from '../../components/shared/Toast'
import { useLogActivity } from '../../hooks/useActivityLog'
import { useStudentCommunications } from '../../hooks/useParentUpdates'
import { useStudentChurnRisk, RISK_TIERS } from '../../hooks/useChurnRisk'
import { DEFAULT_RATE_PER_SESSION, DEFAULT_RATE_TIER_CENTS } from '../../lib/constants'
import { useStudentInstruments, useSaveStudentInstruments } from '../../hooks/useStudentInstruments'
import { getInstrumentEmoji } from '../../utils/instrumentEmoji'
import { IssueContextProvider } from '../../contexts/IssueContext'
import ReportIssueButton from '../../components/shared/ReportIssueButton'

function formatTime(t: string) {
  const [h, m] = t.split(':')
  const hour = parseInt(h)
  const ampm = hour >= 12 ? 'pm' : 'am'
  const display = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour
  return `${display}:${m}${ampm}`
}

function formatDate(d: string) {
  return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

export default function StudentDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { role, profile, tenantId } = useAuthContext()
  const canEdit = role === 'owner' || role === 'admin'
  const { canDo, isAtLeast } = usePermissions()
  const canViewSensitive = canDo('files.view_sensitive')
  const qc = useQueryClient()

  const updateStudent = useUpdateStudent()
  const [showSlotPicker, setShowSlotPicker] = useState(false)
  const [selectedBlockId, setSelectedBlockId] = useState('')
  const [recurring, setRecurring] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [handoffReport, setHandoffReport] = useState<string | null>(null)
  const [handoffLoading, setHandoffLoading] = useState(false)
  const [showAllNotes, setShowAllNotes] = useState(false)
  const [showBioModal, setShowBioModal] = useState(false)
  const [showDirectorNotes, setShowDirectorNotes] = useState(false)
  const [showTeacherNotes, setShowTeacherNotes] = useState(false)
  const [bioGenerating, setBioGenerating] = useState(false)
  const [showDocsModal, setShowDocsModal] = useState(false)
  const [docsFolder, setDocsFolder] = useState<'materials' | 'sensitive'>('materials')
  const [handoffTeacherId, setHandoffTeacherId] = useState('')
  const [handoffSending, setHandoffSending] = useState(false)
  const [handoffSent, setHandoffSent] = useState(false)
  const [seriesControlBlock, setSeriesControlBlock] = useState<{ id: string; is_recurring: boolean; teacher_name: string; start_time: string; block_date: string } | null>(null)
  const [pendingConfirm, setPendingConfirm] = useState<{ title: string; message: string; variant?: 'warning' | 'danger' | 'info'; onConfirm: () => void } | null>(null)
  const [showBillingDetails, setShowBillingDetails] = useState(false)
  const [showRateOverrideModal, setShowRateOverrideModal] = useState(false)
  const [showSessionCreditModal, setShowSessionCreditModal] = useState(false)
  const [editingFamilyName, setEditingFamilyName] = useState(false)
  const [familyNameValue, setFamilyNameValue] = useState('')
  const logActivity = useLogActivity()
  const overrideMutation = useOverrideFamilyRate()
  const removeOverrideMutation = useRemoveFamilyRateOverride()
  const addCreditMutation = useAddSessionCredit()
  const churnRisk = useStudentChurnRisk(id)
  const { data: studentInstruments } = useStudentInstruments(id)

  // Load student with family + teacher + location
  const { data: student, isLoading, error } = useQuery({
    queryKey: ['student-detail', id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('students')
        .select('*')
        .eq('id', id!)
        .single()
      if (error) throw error

      const { data: family } = await supabase.from('families').select('name, primary_contact_name, parent_name, primary_phone, primary_email, card_last_four, card_brand, billing_status, rate_tier, rate_tier_override, rate_tier_reason, is_military').eq('id', data.family_id).single()
      const { count: familyStudentCount } = await supabase.from('students').select('id', { count: 'exact', head: true }).eq('family_id', data.family_id)
      const teacherName = data.teacher_id
        ? await supabase.from('teachers').select('first_name, last_name, profile:profiles!teachers_profile_id_fkey(first_name, last_name)').eq('id', data.teacher_id).single().then(r => r.data ? `${r.data.first_name ?? r.data.profile?.first_name ?? ''} ${r.data.last_name ?? r.data.profile?.last_name ?? ''}`.trim() || '—' : '—')
        : '—'
      const { data: loc } = await supabase.from('locations').select('name').eq('id', data.location_id).single()

      // Get siblings (other students in same family)
      const { data: siblings } = await supabase.from('students').select('id, first_name, last_name, instrument, status').eq('family_id', data.family_id).neq('id', data.id)

      const activeStudentCount = (siblings ?? []).filter((s: any) => s.status === 'active').length + (data.status === 'active' ? 1 : 0)

      // Resolve first teacher name if different from current
      let firstTeacherDisplay: string | null = null
      if (data.first_teacher_name && data.first_teacher_id && data.first_teacher_id !== data.teacher_id) {
        firstTeacherDisplay = data.first_teacher_name
      }

      return { ...data, family_name: family?.name, family_contact: family?.primary_contact_name, family_parent_name: family?.parent_name, family_phone: family?.primary_phone, family_email: family?.primary_email, family_card_last_four: family?.card_last_four ?? data.card_last_four, family_card_brand: family?.card_brand ?? data.card_brand, family_billing_status: family?.billing_status ?? 'active', family_student_count: familyStudentCount ?? 1, family_rate_tier: family?.rate_tier ?? DEFAULT_RATE_TIER_CENTS, family_rate_tier_override: family?.rate_tier_override ?? false, family_rate_tier_reason: family?.rate_tier_reason ?? null, family_is_military: family?.is_military ?? false, family_active_students: activeStudentCount, teacher_name: teacherName, first_teacher_display: firstTeacherDisplay, location_name: loc?.name?.replace(' Music Lessons', ''), siblings: siblings ?? [] }
    },
  })

  const { data: blocks } = useStudentBlocks(id)
  const { data: availableBlocks } = useAvailableBlocksForStudent(
    showSlotPicker ? id : undefined,
    student?.location_id,
    student?.teacher_id,
  )
  const assignStudent = useAssignStudent()
  const { data: allTeachers } = useTeachers()
  const unassignBlock = useUnassignBlock()

  // Student files
  const { data: studentFiles } = useQuery({
    queryKey: ['student-files', id],
    enabled: !!id,
    queryFn: async () => {
      const { data } = await supabase.from('student_files').select('*').eq('student_id', id!).order('created_at', { ascending: false })
      return data ?? []
    },
  })

  const handleAssign = async () => {
    if (!selectedBlockId || !id) return
    await assignStudent.mutateAsync({ blockId: selectedBlockId, studentId: id, recurring })
    setShowSlotPicker(false)
    setSelectedBlockId('')
    setRecurring(false)
  }

  const handleUnassign = (block: { id: string; is_recurring: boolean; teacher_name: string; start_time: string; block_date: string }) => {
    if (block.is_recurring) {
      setSeriesControlBlock(block)
    } else {
      unassignBlock.mutateAsync(block.id)
    }
  }

  if (isLoading) {
    return <div className="page"><div className="loading-screen" style={{ height: 200 }}><MusicLoader /></div></div>
  }

  if (error || !student) {
    return (
      <div className="page">
        <button className="btn-ghost" onClick={() => navigate('/admin/students')}>← Back</button>
        <div className="form-error" style={{ marginTop: '16px' }}>Failed to load student.</div>
      </div>
    )
  }

  // Group available blocks by date for the slot picker
  const blocksByDate = new Map<string, any[]>()
  availableBlocks?.forEach((b: any) => {
    const list = blocksByDate.get(b.block_date) ?? []
    list.push(b)
    blocksByDate.set(b.block_date, list)
  })

  const monthlyTotal = student ? student.rate_per_session * student.blocks_per_week * 4 : 0
  const overdue = Number(student?.overdue_amount ?? 0)

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, folder: 'materials' | 'sensitive' = 'materials') => {
    const file = e.target.files?.[0]
    if (!file || !id || !tenantId) return
    const path = `${tenantId}/${id}/${Date.now()}-${file.name}`
    const { error: uploadErr } = await supabase.storage.from('student-files').upload(path, file, { upsert: true })
    if (uploadErr) { toast('Upload failed: ' + uploadErr.message, 'error'); return }
    const { data: urlData } = supabase.storage.from('student-files').getPublicUrl(path)
    const { error: insertErr } = await supabase.from('student_files').insert({
      tenant_id: tenantId, student_id: id, file_name: file.name,
      file_url: urlData.publicUrl, file_size: file.size,
      uploaded_by: profile?.first_name ?? 'Admin', uploaded_by_role: 'admin',
      folder,
    })
    if (insertErr) { toast('File uploaded but record failed: ' + insertErr.message, 'error'); return }
    qc.invalidateQueries({ queryKey: ['student-files', id] })
    toast('File uploaded', 'success')
  }

  const handleDeleteFile = (fileId: string, filePath: string) => {
    setPendingConfirm({
      title: 'Delete File',
      message: 'Are you sure you want to delete this file? This cannot be undone.',
      variant: 'danger',
      onConfirm: async () => {
        setPendingConfirm(null)
        await supabase.from('student_files').delete().eq('id', fileId)
        qc.invalidateQueries({ queryKey: ['student-files', id] })
        toast('File deleted', 'success')
      },
    })
  }

  return (
    <IssueContextProvider page="Roster — Students" section="Student Detail">
    <div className="page">
      <button className="btn-ghost" onClick={() => navigate('/admin/students')} style={{ marginBottom: 12 }}>
        ← Back to Students
      </button>

      {/* === COMPRESSED STUDENT PROFILE === */}
      <div className="location-card" style={{ padding: '24px 28px', marginBottom: 14, cursor: 'default' }}>
        <div className="loc-card-edge" style={{ background: student.status === 'active' ? 'linear-gradient(180deg, #22C55E, #16A34A)' : 'linear-gradient(180deg, #EF4444, #B91C1C)', boxShadow: student.status === 'active' ? '0 0 14px rgba(34,197,94,0.5)' : '0 0 14px rgba(239,68,68,0.5)' }} />
        <div className="loc-card-glow" style={{ background: student.status === 'active' ? 'radial-gradient(circle, rgba(34,197,94,0.08) 0%, transparent 70%)' : 'radial-gradient(circle, rgba(239,68,68,0.06) 0%, transparent 70%)' }} />
        <div style={{ position: 'relative', zIndex: 1 }}>
          {/* ── Student Name Row ── */}
          <div style={{ marginBottom: 4 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <span style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.08em', padding: '3px 12px', borderRadius: 8, border: '1px solid', flexShrink: 0, color: student.status === 'active' ? '#22C55E' : '#EF4444', borderColor: student.status === 'active' ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)', background: student.status === 'active' ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)' }}>
                {student.status}
              </span>
              {churnRisk && churnRisk.tier !== 'low' && (() => {
                const t = RISK_TIERS[churnRisk.tier]
                return (
                  <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 10px', borderRadius: 6, background: t.bg, color: t.color, border: `1px solid ${t.color}30`, flexShrink: 0, whiteSpace: 'nowrap' }} title={churnRisk.signals.map(s => s.label).join(', ')}>
                    {t.label} Risk ({churnRisk.score})
                  </span>
                )
              })()}
              <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center' }}>
                {canEdit && (
                  <button
                    onClick={() => setShowEditModal(true)}
                    title="Edit Student"
                    style={{ width: 30, height: 30, borderRadius: 8, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#8080A8', transition: 'all 140ms ease', flexShrink: 0 }}
                    onMouseEnter={(e) => { e.currentTarget.style.color = '#E8488A'; e.currentTarget.style.borderColor = 'rgba(212,34,106,0.3)'; e.currentTarget.style.background = 'rgba(212,34,106,0.08)' }}
                    onMouseLeave={(e) => { e.currentTarget.style.color = '#8080A8'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'; e.currentTarget.style.background = 'rgba(255,255,255,0.06)' }}
                  >
                    <Pencil size={14} />
                  </button>
                )}
                <ReportIssueButton />
              </div>
            </div>
            <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-0.03em', margin: 0, minWidth: 0, overflowWrap: 'break-word', wordBreak: 'break-word' }}>
              {student.first_name} {student.last_name}
            </h1>
          </div>

          {/* ── Student Details ── */}
          <div style={{ fontSize: 13, color: '#A0A0C8' }}>Age {student.age ?? '—'}</div>
          <div style={{ display: 'flex', gap: 14, marginTop: 8, flexWrap: 'wrap' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 13, color: '#C0C0E0' }}><MapPin size={13} /> {student.location_name ?? '—'}</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 13, color: '#C0C0E0' }}><DollarSign size={13} /> ${monthlyTotal}/mo</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 10 }}>
            {studentInstruments && studentInstruments.length > 1 ? (
              studentInstruments.map((si) => {
                const teacherName = si.teacher_id ? (() => { const t = allTeachers?.find((t: any) => t.id === si.teacher_id); return t ? `${t.first_name ?? t.profile?.first_name ?? ''} ${t.last_name ?? t.profile?.last_name ?? ''}`.trim() : null })() : null
                return (
                  <div key={si.id} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#C0C0E0', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 15 }}>{getInstrumentEmoji(si.instrument)}</span>
                    <span style={{ fontWeight: 600 }}>{si.instrument ? si.instrument.charAt(0).toUpperCase() + si.instrument.slice(1) : 'Unknown'}</span>
                    {teacherName && <span style={{ color: '#8080A8' }}>with <strong style={{ color: '#A0A0C8' }}>{teacherName}</strong></span>}
                    {si.is_primary && studentInstruments.length > 1 && <span style={{ fontSize: 8, fontWeight: 800, padding: '1px 5px', borderRadius: 3, background: 'rgba(212,34,106,0.12)', color: '#D4226A', textTransform: 'uppercase', letterSpacing: '0.04em' }}>primary</span>}
                  </div>
                )
              })
            ) : (
              <>
                <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 13, color: '#C0C0E0' }}><Music size={13} /> {student.instrument ? student.instrument.charAt(0).toUpperCase() + student.instrument.slice(1) : '—'}</span>
                {student.teacher_name && student.teacher_name !== '—' && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 12, color: '#A0A0C8' }}>Teacher: <strong style={{ color: '#C0C0E0' }}>{student.teacher_name}</strong></span>
                    {student.first_teacher_display && (
                      <span style={{ fontSize: 11, color: '#606088' }}>· Started with {student.first_teacher_display}</span>
                    )}
                  </div>
                )}
              </>
            )}
          </div>

          {/* ── Family Section ── */}
          <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid rgba(255,255,255,0.06)', width: '100%' }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#8080A8', textTransform: 'uppercase' as const, letterSpacing: '0.08em', marginBottom: 8 }}>Family</div>

            {/* Family name + edit pencil */}
            {editingFamilyName ? (
              <input value={familyNameValue} onChange={(e) => setFamilyNameValue(e.target.value)}
                onBlur={async () => {
                  if (familyNameValue && familyNameValue !== student.family_name) {
                    const { error: famErr } = await supabase.from('families').update({ name: familyNameValue }).eq('id', student.family_id)
                    if (famErr) { toast('Failed to update family name: ' + famErr.message, 'error'); return }
                    qc.invalidateQueries({ queryKey: ['student-detail'] })
                    qc.invalidateQueries({ queryKey: ['families'] })
                    qc.invalidateQueries({ queryKey: ['families_page'] })
                    qc.invalidateQueries({ queryKey: ['family_detail'] })
                    toast('Family name updated', 'success')
                  }
                  setEditingFamilyName(false)
                }}
                onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') setEditingFamilyName(false) }}
                autoFocus
                style={{ fontSize: 15, fontWeight: 700, color: '#E0E0F4', background: 'transparent', border: 'none', borderBottom: '2px solid #D4226A', outline: 'none', width: '100%', maxWidth: 300, padding: 0, display: 'block' }}
              />
            ) : (
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <span
                  onClick={() => { if (canEdit) { setFamilyNameValue(student.family_name ?? ''); setEditingFamilyName(true) } }}
                  style={{ fontSize: 15, fontWeight: 700, color: '#E0E0F4', cursor: canEdit ? 'pointer' : 'default' }}
                >
                  {student.family_name?.replace(/\s+family$/i, '') ?? '—'}
                </span>
                {canEdit && (
                  <button
                    onClick={() => { setFamilyNameValue(student.family_name ?? ''); setEditingFamilyName(true) }}
                    title="Edit Family"
                    style={{ width: 24, height: 24, borderRadius: 6, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#606088', transition: 'all 140ms ease', flexShrink: 0 }}
                    onMouseEnter={(e) => { e.currentTarget.style.color = '#E8488A'; e.currentTarget.style.borderColor = 'rgba(212,34,106,0.3)'; e.currentTarget.style.background = 'rgba(212,34,106,0.08)' }}
                    onMouseLeave={(e) => { e.currentTarget.style.color = '#606088'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'; e.currentTarget.style.background = 'rgba(255,255,255,0.06)' }}
                  >
                    <Pencil size={12} />
                  </button>
                )}
              </div>
            )}

            {/* Contact + family name */}
            <div style={{ fontSize: 12, color: '#A0A0C8', marginTop: 6, overflowWrap: 'break-word', wordBreak: 'break-word' }}>{student.family_contact ?? '—'}</div>
            {/* Phone */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: '#A0A0C8', marginTop: 4, overflowWrap: 'break-word', wordBreak: 'break-word' }}>
              <Phone size={11} style={{ flexShrink: 0 }} /> {student.family_phone ?? '—'}
            </div>
            {/* Email */}
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 5, fontSize: 11, color: '#8080A8', marginTop: 4, overflowWrap: 'break-word', wordBreak: 'break-word' }}>
              <Mail size={11} style={{ flexShrink: 0, marginTop: 2 }} />
              <span style={{ minWidth: 0, overflowWrap: 'break-word', wordBreak: 'break-word' }}>{student.family_email ?? '—'}</span>
            </div>

            {/* Siblings */}
            {student.siblings && student.siblings.length > 0 && (
              <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                <div style={{ fontSize: 9, fontWeight: 700, color: '#606088', textTransform: 'uppercase' as const, letterSpacing: '0.06em', marginBottom: 6 }}>Siblings</div>
                {student.siblings.map((sib: any) => (
                  <div key={sib.id} onClick={() => navigate(`/admin/students/${sib.id}`)} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#A0A0C8', cursor: 'pointer', padding: '3px 0' }}>
                    <span style={{ fontWeight: 600, color: '#C0C0E0' }}>{sib.first_name}</span>
                    <span style={{ color: '#8080A8' }}>{sib.instrument}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Row 1: Billing + Family + Lesson Stats — 3 cards */}
      <div className="sd-row-3">
        <div className="location-card" style={{ padding: 18, cursor: 'default' }}>
          <div className="loc-card-edge" style={{ background: 'linear-gradient(180deg, #D97706, #FFB800)', boxShadow: '0 0 12px rgba(255,184,0,0.4)' }} />
          <div className="loc-card-glow" style={{ background: 'radial-gradient(circle, rgba(255,184,0,0.07) 0%, transparent 70%)' }} />
          <div style={{ position: 'relative', zIndex: 1, maxWidth: '100%', overflowWrap: 'break-word', wordBreak: 'break-word' }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: '#8080A8', textTransform: 'uppercase' as const, letterSpacing: '0.08em', display: 'block', marginBottom: 8 }}>Billing</span>

            {/* Family name */}
            <div style={{ fontSize: 14, fontWeight: 700, color: '#E0E0F4', marginBottom: 6 }}>
              {student.family_name?.replace(/\s+family$/i, '') ?? '—'}
            </div>

            {/* Monthly total — big, bold, gold */}
            <div style={{ fontSize: 28, fontWeight: 800, color: '#FFB800', lineHeight: 1, marginBottom: 8 }}>
              ${monthlyTotal}<span style={{ fontSize: 13, fontWeight: 600, color: '#8080A8' }}>/mo</span>
            </div>

            {/* Payment status badge */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
              {overdue > 0 ? (
                <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 10px', borderRadius: 6, background: 'rgba(239,68,68,0.12)', color: '#EF4444', border: '1px solid rgba(239,68,68,0.25)' }}>
                  Overdue ${overdue}
                </span>
              ) : (
                <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 10px', borderRadius: 6, background: 'rgba(34,197,94,0.12)', color: '#22C55E', border: '1px solid rgba(34,197,94,0.25)' }}>
                  Current
                </span>
              )}
            </div>

            {/* Bill Family button */}
            <button className="btn-primary" onClick={() => navigate(`/admin/families?family=${student.family_id}`)} style={{ fontSize: 11, padding: '8px 0', width: '100%', justifyContent: 'center' }}>
              Bill Family
            </button>

            {/* Details toggle */}
            <button onClick={() => setShowBillingDetails(!showBillingDetails)} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, width: '100%',
              marginTop: 10, padding: '6px 0', fontSize: 11, fontWeight: 600, color: '#8080A8',
              background: 'none', border: 'none', cursor: 'pointer',
              borderTop: '1px solid rgba(255,255,255,0.06)',
            }}>
              {showBillingDetails ? 'Hide Details \u25B4' : 'View Details \u25BE'}
            </button>

            {/* Expanded details */}
            {showBillingDetails && (
              <div style={{ paddingTop: 8 }}>
                <div className="sd-inner-3" style={{ marginBottom: 10 }}>
                  <div>
                    <div style={{ fontSize: 9, fontWeight: 700, color: '#606088', textTransform: 'uppercase' as const, letterSpacing: '0.06em', marginBottom: 2 }}>Overdue</div>
                    <div style={{ fontSize: 16, fontWeight: 800, color: overdue > 0 ? '#B45555' : '#22C55E' }}>{overdue > 0 ? `$${overdue}` : '$0'}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 9, fontWeight: 700, color: '#606088', textTransform: 'uppercase' as const, letterSpacing: '0.06em', marginBottom: 2 }}>Lifetime</div>
                    <div style={{ fontSize: 16, fontWeight: 800, color: '#A0A0C8' }}>${student.total_paid ?? 0}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 9, fontWeight: 700, color: '#606088', textTransform: 'uppercase' as const, letterSpacing: '0.06em', marginBottom: 2 }}>Sessions/mo</div>
                    <div style={{ fontSize: 16, fontWeight: 800, color: '#C0C0E0' }}>{student.sessions_per_month ?? student.blocks_per_week * 4}</div>
                  </div>
                </div>

                <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 8, marginBottom: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#A0A0C8', marginBottom: 3 }}>
                    <span>Rate/session</span>
                    <span style={{ fontWeight: 700, color: '#C0C0E0' }}>${(student.rate_per_session ?? DEFAULT_RATE_PER_SESSION).toFixed(2)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#A0A0C8' }}>
                    <span>Monthly est.</span>
                    <span style={{ fontWeight: 700, color: '#FFB800' }}>${((student.sessions_per_month ?? student.blocks_per_week * 4) * (student.rate_per_session ?? DEFAULT_RATE_PER_SESSION)).toFixed(2)}</span>
                  </div>
                </div>

                {student.family_card_last_four && (
                  <div style={{ fontSize: 11, color: '#8080A8', marginBottom: 8 }}>
                    {student.family_card_brand ?? 'Card'} ending in {student.family_card_last_four}
                  </div>
                )}

                {canEdit && (
                  <button className="btn-outline" onClick={() => setShowSessionCreditModal(true)} style={{ fontSize: 10, padding: '5px 14px', width: '100%', justifyContent: 'center', color: '#22C55E', borderColor: 'rgba(34,197,94,0.25)' }}>
                    + Session Credit
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Family Card */}
        <div className="location-card" style={{ padding: 18, cursor: 'default' }}>
          <div className="loc-card-edge" style={{ background: 'linear-gradient(180deg, #6366F1, #818CF8)', boxShadow: '0 0 12px rgba(99,102,241,0.4)' }} />
          <div className="loc-card-glow" style={{ background: 'radial-gradient(circle, rgba(99,102,241,0.07) 0%, transparent 70%)' }} />
          <div style={{ position: 'relative', zIndex: 1, maxWidth: '100%', overflowWrap: 'break-word', wordBreak: 'break-word' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 6 }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: '#8080A8', textTransform: 'uppercase' as const, letterSpacing: '0.08em' }}>Family</span>
              {(() => {
                const bs = (student as any).family_billing_status ?? 'active'
                const colors: Record<string, { bg: string; border: string; text: string }> = {
                  active: { bg: 'rgba(34,197,94,0.1)', border: 'rgba(34,197,94,0.3)', text: '#22C55E' },
                  paused: { bg: 'rgba(255,184,0,0.1)', border: 'rgba(255,184,0,0.3)', text: '#FFB800' },
                  suspended: { bg: 'rgba(239,68,68,0.1)', border: 'rgba(239,68,68,0.3)', text: '#EF4444' },
                  cancelled: { bg: 'rgba(255,255,255,0.04)', border: 'rgba(255,255,255,0.08)', text: '#8080A8' },
                }
                const c = colors[bs] ?? colors.active
                return (
                  <span style={{
                    fontSize: 9, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.06em',
                    padding: '2px 8px', borderRadius: 6, background: c.bg, border: `1px solid ${c.border}`, color: c.text,
                  }}>
                    {bs}
                  </span>
                )
              })()}
            </div>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#E0E0F4', marginBottom: 4 }}>{student.family_name ?? '—'}</div>
            <div style={{ fontSize: 12, color: '#A0A0C8', marginBottom: 6 }}>{(student as any).family_parent_name ?? student.family_contact ?? '—'}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginBottom: 10, minWidth: 0 }}>
              <span style={{ display: 'flex', alignItems: 'flex-start', gap: 5, fontSize: 11.5, color: '#A0A0C8', minWidth: 0 }}><Mail size={11} style={{ flexShrink: 0, marginTop: 2 }} /> <span style={{ minWidth: 0, overflowWrap: 'break-word', wordBreak: 'break-word' }}>{student.family_email ?? '—'}</span></span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11.5, color: '#A0A0C8' }}><Phone size={11} style={{ flexShrink: 0 }} /> {student.family_phone ?? '—'}</span>
            </div>
            {/* Rate Tier Badge */}
            {(() => {
              const tier = student.family_rate_tier ?? DEFAULT_RATE_TIER_CENTS
              const tierColor = getRateTierColor(tier)
              const tierLabel = getRateTierLabel(tier, student.family_is_military, student.family_active_students)
              return (
                <div style={{ marginBottom: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4, flexWrap: 'wrap' }}>
                    <span style={{
                      fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 8,
                      background: tierColor.bg, border: `1px solid ${tierColor.border}`, color: tierColor.text,
                      overflowWrap: 'break-word', wordBreak: 'break-word',
                    }}>
                      ${formatRate(tier)} — {tierLabel}
                    </span>
                    {student.family_rate_tier_override && (
                      <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 10, color: '#E8488A', fontWeight: 600 }}>
                        <Lock size={10} /> Manually set
                      </span>
                    )}
                  </div>
                  {student.family_rate_tier_reason && (
                    <div style={{ fontSize: 10, color: '#8080A8', fontStyle: 'italic', marginTop: 2 }}>
                      {student.family_rate_tier_reason}
                    </div>
                  )}
                </div>
              )
            })()}
            <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
              <span style={{ fontSize: 11, color: '#8080A8' }}>{(student as any).family_student_count ?? 1} student{((student as any).family_student_count ?? 1) !== 1 ? 's' : ''} in family</span>
              <div style={{ display: 'flex', gap: 6 }}>
                {(canDo('teachers.edit_pay_rate') || role === 'owner') && (
                  <button className="btn-ghost" onClick={() => setShowRateOverrideModal(true)} style={{ fontSize: 10, color: '#6366F1', padding: '3px 8px' }}>
                    Override Rate
                  </button>
                )}
                <span style={{ fontSize: 11, color: '#606088', cursor: 'default' }}>View Family</span>
              </div>
            </div>
          </div>
        </div>

        <div className="location-card" style={{ padding: 18, cursor: 'default' }}>
          <div className="loc-card-edge" style={{ background: 'linear-gradient(180deg, #FF5500, #FF8C00)', boxShadow: '0 0 12px rgba(255,85,0,0.4)' }} />
          <div className="loc-card-glow" style={{ background: 'radial-gradient(circle, rgba(255,85,0,0.06) 0%, transparent 70%)' }} />
          <div style={{ position: 'relative', zIndex: 1, maxWidth: '100%', overflowWrap: 'break-word', wordBreak: 'break-word' }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: '#8080A8', textTransform: 'uppercase' as const, letterSpacing: '0.08em', display: 'block', marginBottom: 12 }}>Lesson Stats & 5th Week</span>
            <div className="sd-inner-3" style={{ marginBottom: 12 }}>
              <div>
                <div style={{ fontSize: 9, fontWeight: 700, color: '#606088', textTransform: 'uppercase' as const, letterSpacing: '0.06em', marginBottom: 2 }}>Total Lessons</div>
                <div style={{ fontSize: 20, fontWeight: 800, color: '#E0E0F4' }}>{student.total_lessons_taken ?? 0}</div>
              </div>
              <div>
                <div style={{ fontSize: 9, fontWeight: 700, color: '#606088', textTransform: 'uppercase' as const, letterSpacing: '0.06em', marginBottom: 2 }}>First Lesson</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#A0A0C8' }}>{student.first_lesson_date ? new Date(student.first_lesson_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}</div>
              </div>
              <div>
                <div style={{ fontSize: 9, fontWeight: 700, color: '#606088', textTransform: 'uppercase' as const, letterSpacing: '0.06em', marginBottom: 2 }}>Rate</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#A0A0C8' }}>${student.rate_per_session}/lesson</div>
              </div>
            </div>
            <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 10 }}>
              <div style={{ fontSize: 9, fontWeight: 700, color: '#606088', textTransform: 'uppercase' as const, letterSpacing: '0.06em', marginBottom: 8 }}>5th Week Balance</div>
              <div style={{ display: 'flex', gap: 18 }}>
                {[{ v: student.total_fifth_weeks ?? 0, l: 'Banked', c: '#E0E0F4' }, { v: student.total_callouts ?? 0, l: 'Used', c: '#E0E0F4' }, { v: (student.total_fifth_weeks ?? 0) - (student.total_callouts ?? 0), l: 'Balance', c: ((student.total_fifth_weeks ?? 0) - (student.total_callouts ?? 0)) >= 0 ? '#22C55E' : '#EF4444' }].map((s, i) => (
                  <div key={i} style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 18, fontWeight: 800, color: s.c }}>{s.v}</div>
                    <div style={{ fontSize: 8, fontWeight: 700, color: '#606088', textTransform: 'uppercase' as const, letterSpacing: '0.06em', marginTop: 1 }}>{s.l}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Row 2: Bio — full width */}
      <div className="location-card" style={{ padding: 18, marginBottom: 14, cursor: 'pointer' }} onClick={() => setShowBioModal(true)}>
        <div className="loc-card-edge" style={{ background: 'linear-gradient(180deg, #D4226A, #FF5500)', boxShadow: '0 0 12px rgba(212,34,106,0.4)' }} />
        <div className="loc-card-glow" style={{ background: 'radial-gradient(circle, rgba(212,34,106,0.06) 0%, transparent 70%)' }} />
        <div style={{ position: 'relative', zIndex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Star size={12} style={{ color: '#FFB800' }} />
              <span style={{ fontSize: 10, fontWeight: 700, color: '#8080A8', textTransform: 'uppercase' as const, letterSpacing: '0.08em' }}>Student Bio</span>
            </div>
            <span style={{ fontSize: 11, color: '#E8488A' }}>View Full Bio →</span>
          </div>
          <p style={{ fontSize: 13, color: '#A0A0C8', lineHeight: 1.6, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const, overflow: 'hidden' }}>
            {student.bio ?? 'No bio yet. Use Edit Student to add personality, learning style, and goals.'}
          </p>
        </div>
      </div>

      {/* Row 3: Director Notes + Teacher Notes — side by side */}
      <div className="sd-row-2">
        {/* Director Notes */}
        <div className="location-card" style={{ padding: 18, cursor: 'pointer' }} onClick={() => setShowDirectorNotes(true)}>
          <div className="loc-card-edge" style={{ background: 'linear-gradient(180deg, #FF5500, #FF8C00)', boxShadow: '0 0 12px rgba(255,85,0,0.4)' }} />
          <div className="loc-card-glow" style={{ background: 'radial-gradient(circle, rgba(255,85,0,0.06) 0%, transparent 70%)' }} />
          <div style={{ position: 'relative', zIndex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: '#8080A8', textTransform: 'uppercase' as const, letterSpacing: '0.08em' }}>Director Notes</span>
              {student.notes && <span style={{ fontSize: 10, color: '#FF7730' }}>View All ({student.notes.split('\n').filter(Boolean).length}) →</span>}
            </div>
            {student.notes ? (
              student.notes.split('\n').filter(Boolean).slice(0, 2).map((note: string, i: number) => {
                const match = note.match(/^\[(.+?)\]\s*(\w+):\s*(.+)$/)
                return (
                  <div key={i} style={{ fontSize: 11.5, marginBottom: 4 }}>
                    <span style={{ color: '#E8488A', fontWeight: 600 }}>{match?.[2] ?? ''}</span>
                    <span style={{ color: '#8080A8' }}> {match?.[3]?.substring(0, 60) ?? note.substring(0, 60)}...</span>
                  </div>
                )
              })
            ) : (
              <p style={{ fontSize: 12, color: '#606088', fontStyle: 'italic' }}>No director notes.</p>
            )}
          </div>
        </div>

        {/* Teacher Notes */}
        <div className="location-card" style={{ padding: 18, cursor: 'pointer' }} onClick={() => setShowTeacherNotes(true)}>
          <div className="loc-card-edge" style={{ background: 'linear-gradient(180deg, #D97706, #FFB800)', boxShadow: '0 0 12px rgba(255,184,0,0.4)' }} />
          <div className="loc-card-glow" style={{ background: 'radial-gradient(circle, rgba(255,184,0,0.06) 0%, transparent 70%)' }} />
          <div style={{ position: 'relative', zIndex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: '#8080A8', textTransform: 'uppercase' as const, letterSpacing: '0.08em' }}>Teacher Notes</span>
              {student.teacher_notes && <span style={{ fontSize: 10, color: '#FFB800' }}>View All ({student.teacher_notes.split('\n').filter(Boolean).length}) →</span>}
            </div>
            {student.teacher_notes ? (
              student.teacher_notes.split('\n').filter(Boolean).slice(0, 2).map((note: string, i: number) => {
                const match = note.match(/^\[(.+?)\]\s*(.+?):\s*(.+)$/)
                return (
                  <div key={i} style={{ fontSize: 11.5, marginBottom: 4 }}>
                    <span style={{ color: '#FFB800', fontWeight: 600 }}>{match?.[2] ?? ''}</span>
                    <span style={{ color: '#8080A8' }}> {match?.[3]?.substring(0, 60) ?? note.substring(0, 60)}...</span>
                  </div>
                )
              })
            ) : (
              <p style={{ fontSize: 12, color: '#606088', fontStyle: 'italic' }}>No teacher notes yet.</p>
            )}
          </div>
        </div>
      </div>

      {/* Row 3: Exit Info (former only) */}
      {student.status === 'former' && (
        <div className="card" style={{ marginBottom: 14, padding: 18 }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: '#EF4444', textTransform: 'uppercase' as const, letterSpacing: '0.08em', display: 'block', marginBottom: 12 }}>Exit Information</span>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div><span style={{ fontSize: 10, fontWeight: 700, color: '#8080A8', textTransform: 'uppercase' as const, letterSpacing: '0.06em', display: 'block', marginBottom: 3 }}>Reason</span><span style={{ fontSize: 13, color: '#E0E0F4', fontWeight: 600 }}>{student.exit_reason ?? '—'}</span></div>
            <div><span style={{ fontSize: 10, fontWeight: 700, color: '#8080A8', textTransform: 'uppercase' as const, letterSpacing: '0.06em', display: 'block', marginBottom: 3 }}>May Return</span><span className={student.may_return === 'yes' ? 'badge-green' : student.may_return === 'maybe' ? 'badge-gold' : 'badge-gray'} style={{ fontSize: 11 }}>{student.may_return ?? '—'}</span></div>
          </div>
          {student.exit_notes && <p style={{ fontSize: 12.5, color: '#A0A0C8', marginTop: 10, lineHeight: 1.6 }}>{student.exit_notes}</p>}
          {canEdit && <button className="btn-outline" style={{ marginTop: 12, fontSize: 11, padding: '6px 14px' }} onClick={() => { const d = prompt('Follow-up date (YYYY-MM-DD):'); if (d) updateStudent.mutate({ id: student.id, reactivation_date: d }) }}>Set Reactivation Date</button>}
        </div>
      )}

      {/* Row 4: Documents + Teacher Handoff — side by side */}
      <div className="sd-row-2">
        <div className="location-card" style={{ padding: 18, cursor: 'default' }}>
          <div className="loc-card-edge" style={{ background: 'linear-gradient(180deg, #D97706, #FFB800)', boxShadow: '0 0 12px rgba(255,184,0,0.4)' }} />
          <div className="loc-card-glow" style={{ background: 'radial-gradient(circle, rgba(255,184,0,0.06) 0%, transparent 70%)' }} />
          <div style={{ position: 'relative', zIndex: 1 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: '#8080A8', textTransform: 'uppercase' as const, letterSpacing: '0.08em' }}>Files & Documents</span>
              <button className="btn-ghost" onClick={() => { setDocsFolder('materials'); setShowDocsModal(true) }} style={{ fontSize: 10, color: '#FFB800', padding: '4px 8px' }}>
                Open File Manager →
              </button>
            </div>
            {(() => {
              const materialFiles = (studentFiles ?? []).filter((f: any) => f.folder !== 'sensitive')
              const sensitiveFiles = (studentFiles ?? []).filter((f: any) => f.folder === 'sensitive')
              const totalVisible = materialFiles.length + (canViewSensitive ? sensitiveFiles.length : 0)
              if (totalVisible === 0) return (
                <div style={{ textAlign: 'center', padding: '16px 0' }}>
                  <FileText size={22} style={{ color: '#606088', marginBottom: 6 }} />
                  <p style={{ fontSize: 12, color: '#606088' }}>No documents yet</p>
                </div>
              )
              return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  {materialFiles.slice(0, 2).map((f: any) => (
                    <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 9, fontSize: 12 }}>
                      <FileText size={13} style={{ color: '#A78BFA', flexShrink: 0 }} />
                      <span style={{ flex: 1, color: '#C0C0E0', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>{f.file_name}</span>
                    </div>
                  ))}
                  <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                    <button className="btn-ghost" onClick={() => { setDocsFolder('materials'); setShowDocsModal(true) }} style={{ fontSize: 10, color: '#A78BFA', padding: '3px 0' }}>
                      Lesson Materials ({materialFiles.length})
                    </button>
                    {canViewSensitive && (
                      <button className="btn-ghost" onClick={() => { setDocsFolder('sensitive'); setShowDocsModal(true) }} style={{ fontSize: 10, color: '#EF4444', padding: '3px 0' }}>
                        Private ({sensitiveFiles.length})
                      </button>
                    )}
                  </div>
                </div>
              )
            })()}
          </div>
        </div>

        <div className="location-card" style={{ padding: 18, cursor: 'default' }}>
          <div className="loc-card-edge" style={{ background: 'linear-gradient(180deg, #FFB800, #FF8C00)', boxShadow: '0 0 12px rgba(255,184,0,0.4)' }} />
          <div className="loc-card-glow" style={{ background: 'radial-gradient(circle, rgba(255,184,0,0.06) 0%, transparent 70%)' }} />
          <div style={{ position: 'relative', zIndex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 26, height: 26, borderRadius: 8, background: 'linear-gradient(135deg, #FFB800, #FF8C00)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', boxShadow: '0 3px 10px rgba(255,184,0,0.3)' }}><Star size={12} /></div>
                <div>
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#FFB800', display: 'block' }}>Teacher Handoff</span>
                  <span style={{ fontSize: 10, color: '#8080A8' }}>AI summary — no contact info</span>
                </div>
              </div>
            </div>

            {!handoffReport ? (
              <button
                className="btn-outline"
                disabled={handoffLoading}
                onClick={async () => {
                  setHandoffLoading(true)
                  setHandoffReport(null)
                  setHandoffSent(false)
                  try {
                    const { data, error } = await supabase.functions.invoke('teacher-handoff', { body: { student_id: id } })
                    if (error || !data?.report) {
                      toast(data?.error ?? error?.message ?? 'Failed to generate report. Check that ANTHROPIC_API_KEY is set.', 'error')
                    } else {
                      setHandoffReport(data.report)
                    }
                  } catch (err: any) { toast(err.message ?? 'Something went wrong.', 'error') }
                  finally { setHandoffLoading(false) }
                }}
                style={{ fontSize: 11, padding: '6px 16px', width: '100%', justifyContent: 'center', color: '#FFB800', borderColor: 'rgba(255,184,0,0.25)' }}
              >
                {handoffLoading ? 'Generating Report...' : 'Generate Handoff Report'}
              </button>
            ) : (
              <>
                <div style={{ padding: 12, background: 'rgba(255,184,0,0.03)', border: '1px solid rgba(255,184,0,0.1)', borderRadius: 10, fontSize: 12.5, color: '#C0C0E0', lineHeight: 1.6, whiteSpace: 'pre-wrap', maxHeight: 180, overflowY: 'auto', marginBottom: 12 }}>
                  {handoffReport}
                </div>

                {handoffSent ? (
                  <div style={{ textAlign: 'center', padding: '8px 0' }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: '#22C55E' }}>Sent to {(() => { const t = allTeachers?.find((t: any) => t.id === handoffTeacherId); return t?.first_name ?? t?.profile?.first_name ?? 'teacher'; })()}</span>
                  </div>
                ) : (
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <select
                      className="filter-select"
                      value={handoffTeacherId}
                      onChange={(e) => setHandoffTeacherId(e.target.value)}
                      style={{ flex: 1, fontSize: 12, padding: '6px 10px' }}
                    >
                      <option value="">Select teacher to send to...</option>
                      {allTeachers?.filter((t: any) => t.id !== student.teacher_id).map((t: any) => (
                        <option key={t.id} value={t.id}>{t.first_name ?? t.profile?.first_name} {t.last_name ?? t.profile?.last_name}</option>
                      ))}
                    </select>
                    <button
                      className="btn-primary"
                      disabled={!handoffTeacherId || handoffSending}
                      onClick={async () => {
                        if (!handoffTeacherId || !handoffReport || !tenantId) return
                        setHandoffSending(true)
                        try {
                          const { error } = await supabase.from('teacher_handoffs').insert({
                            tenant_id: tenantId,
                            student_id: id,
                            from_teacher_id: student.teacher_id || null,
                            to_teacher_id: handoffTeacherId,
                            report: handoffReport,
                            sent_by: profile?.id,
                          })
                          if (error) throw error
                          setHandoffSent(true)
                        } catch (err: any) {
                          toast('Failed to send handoff: ' + (err.message ?? 'Unknown error'), 'error')
                        } finally { setHandoffSending(false) }
                      }}
                      style={{ fontSize: 11, padding: '6px 14px', display: 'inline-flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap' as const }}
                    >
                      <Send size={12} /> {handoffSending ? 'Sending...' : 'Send'}
                    </button>
                  </div>
                )}

                <div style={{ display: 'flex', gap: 6, marginTop: 8, justifyContent: 'flex-end' }}>
                  <button className="btn-ghost" onClick={() => {
                    const blob = new Blob([`TEACHER HANDOFF REPORT\n${student.first_name} ${student.last_name}\n${'='.repeat(40)}\n\n${handoffReport}`], { type: 'text/plain' })
                    const url = URL.createObjectURL(blob)
                    const a = document.createElement('a')
                    a.href = url; a.download = `handoff-${student.first_name}-${student.last_name}.txt`; a.click()
                    URL.revokeObjectURL(url)
                  }} style={{ fontSize: 10, padding: '3px 10px', color: '#8080A8' }}>Download .txt</button>
                  <button className="btn-ghost" onClick={() => { setHandoffReport(null); setHandoffSent(false); setHandoffTeacherId('') }} style={{ fontSize: 10, padding: '3px 10px', color: '#8080A8' }}>Regenerate</button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Row 5: Session History + Parent Communications */}
      <SessionHistorySection studentId={id!} studentName={`${student.first_name} ${student.last_name}`} />

      {/* Bio Modal */}
      {showBioModal && (
        <div className="modal-overlay" onClick={() => setShowBioModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 560 }}>
            <div className="modal-header">
              <span className="modal-title">Student Bio — {student.first_name} {student.last_name}</span>
              <button className="btn-ghost" onClick={() => setShowBioModal(false)} style={{ padding: '4px 8px' }}>X</button>
            </div>
            <div style={{ padding: 22 }}>
              {student.bio ? (
                <p style={{ fontSize: 14, color: '#C0C0E0', lineHeight: 1.75 }}>{student.bio}</p>
              ) : (
                <p style={{ fontSize: 13, color: '#606088', fontStyle: 'italic' }}>No bio yet.</p>
              )}
              <div style={{ marginTop: 18, paddingTop: 16, borderTop: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 24, height: 24, borderRadius: 7, background: 'linear-gradient(135deg, #FFB800, #FF8C00)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', boxShadow: '0 2px 8px rgba(255,184,0,0.3)' }}><Star size={11} /></div>
                  <span style={{ fontSize: 12, color: '#A0A0C8' }}>{student.bio ? 'Want Star to update this bio?' : 'Want Star to create a bio for this student?'}</span>
                </div>
                <button
                  className="btn-outline"
                  disabled={bioGenerating}
                  onClick={async () => {
                    setBioGenerating(true)
                    try {
                      const { data, error } = await supabase.functions.invoke('generate-student-bio', { body: { student_id: id } })
                      if (error) throw error
                      if (data?.bio) {
                        qc.invalidateQueries({ queryKey: ['student-detail', id] })
                        toast('Bio updated', 'success')
                      }
                    } catch (err: any) {
                      toast('Failed to generate bio: ' + (err.message ?? 'Unknown error'), 'error')
                    } finally { setBioGenerating(false) }
                  }}
                  style={{ fontSize: 10, padding: '5px 14px', color: '#FFB800', borderColor: 'rgba(255,184,0,0.25)' }}
                >
                  {bioGenerating ? 'Generating...' : student.bio ? 'Update Bio' : 'Generate Bio'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Director Notes Modal */}
      {showDirectorNotes && (
        <div className="modal-overlay" onClick={() => setShowDirectorNotes(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 560, maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}>
            <div className="modal-header">
              <span className="modal-title">Director Notes — {student.first_name}</span>
              <div style={{ display: 'flex', gap: 6 }}>
                <button className="btn-ghost" onClick={() => {
                  const allNotes = [...(student.notes?.split('\n').filter(Boolean) ?? []), ...(student.teacher_notes?.split('\n').filter(Boolean) ?? [])]
                  const csv = 'Date,Author,Note\n' + allNotes.map((n: string) => { const m = n.match(/^\[(.+?)\]\s*(.+?):\s*(.+)$/); return m ? `"${m[1]}","${m[2]}","${m[3]}"` : `"","","${n}"` }).join('\n')
                  const blob = new Blob([csv], { type: 'text/csv' }); const url = URL.createObjectURL(blob)
                  const a = document.createElement('a'); a.href = url; a.download = `notes-${student.first_name}-${student.last_name}.csv`; a.click()
                }} style={{ fontSize: 10, padding: '4px 10px' }}>Export Timeline</button>
                <button className="btn-ghost" onClick={() => setShowDirectorNotes(false)} style={{ padding: '4px 8px' }}>X</button>
              </div>
            </div>
            <div style={{ padding: 22, overflowY: 'auto', flex: 1 }}>
              {student.notes ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {student.notes.split('\n').filter(Boolean).map((note: string, i: number) => {
                    const match = note.match(/^\[(.+?)\]\s*(\w+):\s*(.+)$/)
                    return (
                      <div key={i} style={{ padding: '10px 12px', background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 10 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                          <span style={{ fontSize: 12, fontWeight: 700, color: '#E8488A' }}>{match?.[2] ?? 'Note'}</span>
                          <span style={{ fontSize: 10, color: '#606088' }}>{match?.[1] ?? ''}</span>
                        </div>
                        <p style={{ fontSize: 13, color: '#C0C0E0', lineHeight: 1.5 }}>{match?.[3] ?? note}</p>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <p style={{ fontSize: 13, color: '#606088' }}>No director notes.</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Teacher Notes Modal */}
      {showTeacherNotes && (
        <div className="modal-overlay" onClick={() => setShowTeacherNotes(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 560, maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}>
            <div className="modal-header">
              <span className="modal-title">Teacher Notes — {student.first_name}</span>
              <div style={{ display: 'flex', gap: 6 }}>
                <button className="btn-ghost" onClick={() => {
                  const notes = student.teacher_notes?.split('\n').filter(Boolean) ?? []
                  const csv = 'Date,Teacher,Note\n' + notes.map((n: string) => { const m = n.match(/^\[(.+?)\]\s*(.+?):\s*(.+)$/); return m ? `"${m[1]}","${m[2]}","${m[3]}"` : `"","","${n}"` }).join('\n')
                  const blob = new Blob([csv], { type: 'text/csv' }); const url = URL.createObjectURL(blob)
                  const a = document.createElement('a'); a.href = url; a.download = `teacher-notes-${student.first_name}-${student.last_name}.csv`; a.click()
                }} style={{ fontSize: 10, padding: '4px 10px' }}>Export Timeline</button>
                <button className="btn-ghost" onClick={() => setShowTeacherNotes(false)} style={{ padding: '4px 8px' }}>X</button>
              </div>
            </div>
            <div style={{ padding: 22, overflowY: 'auto', flex: 1 }}>
              {student.teacher_notes ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {student.teacher_notes.split('\n').filter(Boolean).map((note: string, i: number) => {
                    const match = note.match(/^\[(.+?)\]\s*(.+?):\s*(.+)$/)
                    return (
                      <div key={i} style={{ padding: '10px 12px', background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 10 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                          <span style={{ fontSize: 12, fontWeight: 700, color: '#FFB800' }}>{match?.[2] ?? 'Teacher'}</span>
                          <span style={{ fontSize: 10, color: '#606088' }}>{match?.[1] ?? ''}</span>
                        </div>
                        <p style={{ fontSize: 13, color: '#C0C0E0', lineHeight: 1.5 }}>{match?.[3] ?? note}</p>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <p style={{ fontSize: 13, color: '#606088' }}>No teacher notes yet.</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Documents Modal — Two-Folder */}
      {showDocsModal && (
        <div className="modal-overlay" onClick={() => setShowDocsModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 640, maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}>
            <div className="modal-header">
              <span className="modal-title">Files — {student.first_name} {student.last_name}</span>
              <div style={{ display: 'flex', gap: 6 }}>
                {/* Upload — materials: all roles; sensitive: admin+ only */}
                {(docsFolder === 'materials' || canEdit) && (
                  <label className="btn-outline" style={{ fontSize: 10, padding: '4px 12px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    <Upload size={11} /> Upload
                    <input type="file" onChange={(e) => { handleFileUpload(e, docsFolder); }} style={{ display: 'none' }} />
                  </label>
                )}
                <button className="btn-ghost" onClick={() => setShowDocsModal(false)} style={{ padding: '4px 8px' }}>X</button>
              </div>
            </div>
            {/* Folder tabs */}
            <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid rgba(255,255,255,0.06)', padding: '0 20px' }}>
              <button
                onClick={() => setDocsFolder('materials')}
                style={{
                  padding: '10px 18px', fontSize: 12, fontWeight: 700, cursor: 'pointer',
                  background: 'none', border: 'none',
                  color: docsFolder === 'materials' ? '#A78BFA' : '#8080A8',
                  borderBottom: docsFolder === 'materials' ? '2px solid #A78BFA' : '2px solid transparent',
                }}
              >
                Lesson Materials
              </button>
              {canViewSensitive && (
                <button
                  onClick={() => setDocsFolder('sensitive')}
                  style={{
                    padding: '10px 18px', fontSize: 12, fontWeight: 700, cursor: 'pointer',
                    background: 'none', border: 'none',
                    color: docsFolder === 'sensitive' ? '#EF4444' : '#8080A8',
                    borderBottom: docsFolder === 'sensitive' ? '2px solid #EF4444' : '2px solid transparent',
                  }}
                >
                  Private Documents
                </button>
              )}
            </div>
            <div style={{ padding: 22, overflowY: 'auto', flex: 1 }}>
              {(() => {
                const folderFiles = (studentFiles ?? []).filter((f: any) =>
                  docsFolder === 'sensitive' ? f.folder === 'sensitive' : f.folder !== 'sensitive'
                )
                if (folderFiles.length === 0) return (
                  <div style={{ textAlign: 'center', padding: '30px 0' }}>
                    <FileText size={28} style={{ color: '#606088', marginBottom: 8 }} />
                    <p style={{ fontSize: 13, color: '#606088' }}>
                      {docsFolder === 'sensitive' ? 'No private documents yet.' : 'No lesson materials yet.'}
                    </p>
                  </div>
                )
                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {folderFiles.map((f: any) => (
                      <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 10, fontSize: 13 }}>
                        <FileText size={15} style={{ color: docsFolder === 'sensitive' ? '#EF4444' : '#A78BFA', flexShrink: 0 }} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <a href={f.file_url} target="_blank" rel="noopener noreferrer" style={{ color: '#C0C0E0', fontWeight: 600, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>{f.file_name}</a>
                          <span style={{ fontSize: 10, color: '#606088' }}>Uploaded by {f.uploaded_by} · {new Date(f.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                        </div>
                        <a href={f.file_url} target="_blank" rel="noopener noreferrer" style={{ color: '#A0A0C8', padding: '4px 6px' }}><Download size={13} /></a>
                        {/* Delete: admin+ always; materials: teacher/parent see flag instead */}
                        {canEdit ? (
                          <button className="btn-ghost" onClick={() => handleDeleteFile(f.id, f.file_url)} style={{ padding: '4px 6px', color: '#EF4444' }}><Trash2 size={13} /></button>
                        ) : docsFolder === 'materials' ? (
                          <button className="btn-ghost" onClick={() => {
                            setPendingConfirm({
                              title: 'Flag for Review',
                              message: 'Flag this file for admin review?',
                              variant: 'warning',
                              onConfirm: async () => {
                                setPendingConfirm(null)
                                await logActivity.mutateAsync({
                                  action: 'flagged_for_review',
                                  entity_type: 'student',
                                  entity_id: id,
                                  entity_name: `${student.first_name} ${student.last_name}`,
                                  details: `File "${f.file_name}" flagged for review`,
                                })
                                toast('File flagged for review', 'success')
                              },
                            })
                          }} style={{ padding: '4px 6px', color: '#FFB800', fontSize: 10 }} title="Flag for review">Flag</button>
                        ) : null}
                      </div>
                    ))}
                  </div>
                )
              })()}
            </div>
          </div>
        </div>
      )}

      {/* Slot Picker Modal */}
      {showSlotPicker && (
        <div className="modal-overlay" onClick={() => setShowSlotPicker(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 520, maxHeight: '80vh' }}>
            <div className="modal-header">
              <h2>Assign {student.first_name} to a Block</h2>
              <button className="btn-ghost" onClick={() => setShowSlotPicker(false)}>✕</button>
            </div>
            <div className="modal-form" style={{ overflowY: 'auto' }}>
              <div className="assign-context">
                <span className="badge-secondary">{student.location_name}</span>
                {student.teacher_name !== '—' && <span className="badge-primary">{student.teacher_name}</span>}
                <span className="badge-primary">{student.instrument}</span>
              </div>

              {(!availableBlocks || availableBlocks.length === 0) ? (
                <p className="text-muted" style={{ padding: '16px', textAlign: 'center' }}>No available blocks found for this location and teacher in the next 4 weeks.</p>
              ) : (
                <div className="slot-picker">
                  {Array.from(blocksByDate.entries()).slice(0, 14).map(([date, dateBlocks]) => (
                    <div key={date} className="slot-picker-day">
                      <div className="slot-picker-date">{formatDate(date)}</div>
                      <div className="slot-picker-slots">
                        {dateBlocks.map((b: any) => (
                          <button
                            key={b.id}
                            type="button"
                            className={`slot-picker-slot ${selectedBlockId === b.id ? 'selected' : ''}`}
                            onClick={() => setSelectedBlockId(b.id)}
                          >
                            <span>{formatTime(b.start_time)}</span>
                            <span className="text-dim" style={{ fontSize: '10px' }}>{b.teacher_name}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <label className="checkbox-row">
                <input type="checkbox" checked={recurring} onChange={(e) => setRecurring(e.target.checked)} />
                <span>Recurring — assign to all future weeks at this time</span>
              </label>

              <div className="modal-actions">
                <button className="btn-ghost" onClick={() => setShowSlotPicker(false)}>Cancel</button>
                <button className="btn-primary" onClick={handleAssign} disabled={!selectedBlockId || assignStudent.isPending}>
                  {assignStudent.isPending ? 'Assigning...' : 'Assign Block'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Series Control Modal */}
      {seriesControlBlock && (
        <SeriesControlModal
          blockId={seriesControlBlock.id}
          action="unassign"
          studentName={`${student.first_name} ${student.last_name}`}
          teacherName={seriesControlBlock.teacher_name}
          time={formatTime(seriesControlBlock.start_time)}
          dayOfWeek={new Date(seriesControlBlock.block_date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long' })}
          onClose={() => setSeriesControlBlock(null)}
          onComplete={() => setSeriesControlBlock(null)}
        />
      )}

      {/* Edit Student Modal */}
      {showEditModal && (
        <EditStudentModal
          student={student}
          onClose={() => setShowEditModal(false)}
          onSaved={() => { setShowEditModal(false); }}
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

      {/* Rate Override Modal */}
      {showRateOverrideModal && (
        <RateOverrideModal
          familyId={student.family_id}
          currentTier={student.family_rate_tier ?? DEFAULT_RATE_TIER_CENTS}
          isOverride={student.family_rate_tier_override}
          onClose={() => setShowRateOverrideModal(false)}
          overrideMutation={overrideMutation}
          removeOverrideMutation={removeOverrideMutation}
          onSuccess={() => { setShowRateOverrideModal(false); qc.invalidateQueries({ queryKey: ['student-detail', id] }) }}
        />
      )}

      {/* Session Credit Modal */}
      {showSessionCreditModal && (
        <SessionCreditModal
          familyId={student.family_id}
          studentId={student.id}
          studentName={`${student.first_name} ${student.last_name}`}
          defaultAmountCents={student.family_rate_tier ?? DEFAULT_RATE_TIER_CENTS}
          onClose={() => setShowSessionCreditModal(false)}
          addCreditMutation={addCreditMutation}
          onSuccess={() => { setShowSessionCreditModal(false); toast('Session credit added', 'success') }}
        />
      )}
    </div>
    </IssueContextProvider>
  )
}

const INSTRUMENTS = ['piano','guitar','vocals','drums','banjo','bass','brass','cello','clarinet','flute','mandolin','oboe','percussion','saxophone','strings','trombone','trumpet','ukulele','viola','violin','voice','woodwinds']
const CORE_FOUR = new Set(['piano', 'guitar', 'vocals', 'drums'])

interface InstrumentRow {
  id?: string
  instrument: string
  teacher_id: string
  is_primary: boolean
  rate_per_session: number
  sessions_per_month: number
}

function EditStudentModal({ student, onClose, onSaved }: { student: any; onClose: () => void; onSaved: () => void }) {
  const updateStudent = useUpdateStudent()
  const { data: locations } = useLocations()
  const { data: teachers } = useTeachers()
  const { tenantId } = useAuthContext()
  const qc = useQueryClient()
  const [showRetention, setShowRetention] = useState<'paused' | 'inactive' | null>(null)

  const { data: existingInstruments } = useStudentInstruments(student.id)
  const saveInstruments = useSaveStudentInstruments()

  const [form, setForm] = useState({
    first_name: student.first_name ?? '',
    last_name: student.last_name ?? '',
    location_id: student.location_id ?? '',
    blocks_per_week: student.blocks_per_week ?? 1,
    rate_per_session: student.rate_per_session ?? DEFAULT_RATE_PER_SESSION,
    start_date: student.start_date ?? '',
    end_date: student.end_date ?? '',
    status: student.status ?? 'active',
    notes: student.notes ?? '',
  })

  const [instrumentRows, setInstrumentRows] = useState<InstrumentRow[]>([])
  const [removedIds, setRemovedIds] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)

  // Initialize instrument rows from DB or fallback to student record
  useEffect(() => {
    if (existingInstruments && existingInstruments.length > 0) {
      setInstrumentRows(existingInstruments.map(si => ({
        id: si.id,
        instrument: si.instrument,
        teacher_id: si.teacher_id ?? '',
        is_primary: si.is_primary,
        rate_per_session: Number(si.rate_per_session),
        sessions_per_month: si.sessions_per_month,
      })))
    } else if (instrumentRows.length === 0) {
      setInstrumentRows([{
        instrument: student.instrument ?? '',
        teacher_id: student.teacher_id ?? '',
        is_primary: true,
        rate_per_session: student.rate_per_session ?? DEFAULT_RATE_PER_SESSION,
        sessions_per_month: student.sessions_per_month ?? 4,
      }])
    }
  }, [existingInstruments]) // eslint-disable-line react-hooks/exhaustive-deps

  const updateRow = (idx: number, patch: Partial<InstrumentRow>) => {
    setInstrumentRows(prev => prev.map((r, i) => i === idx ? { ...r, ...patch } : r))
  }

  const addRow = () => {
    setInstrumentRows(prev => [...prev, { instrument: '', teacher_id: '', is_primary: false, rate_per_session: form.rate_per_session, sessions_per_month: 4 }])
  }

  const removeRow = (idx: number) => {
    const row = instrumentRows[idx]
    if (instrumentRows.length <= 1) return
    if (row.id) setRemovedIds(prev => [...prev, row.id!])
    const remaining = instrumentRows.filter((_, i) => i !== idx)
    if (row.is_primary && remaining.length > 0) remaining[0].is_primary = true
    setInstrumentRows(remaining)
  }

  const getTeacherName = (tid: string) => {
    const t = teachers?.find((t: any) => t.id === tid)
    if (!t) return ''
    return `${t.first_name ?? t.profile?.first_name ?? ''} ${t.last_name ?? t.profile?.last_name ?? ''}`.trim()
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!form.first_name || !form.last_name) { setError('First and last name are required.'); return }
    if (instrumentRows.length === 0 || !instrumentRows[0].instrument) { setError('At least one instrument is required.'); return }
    if ((form.status === 'paused' || form.status === 'inactive') && student.status === 'active') {
      setShowRetention(form.status as 'paused' | 'inactive')
      return
    }
    try {
      const primary = instrumentRows.find(r => r.is_primary) ?? instrumentRows[0]
      await updateStudent.mutateAsync({
        id: student.id,
        first_name: form.first_name,
        last_name: form.last_name,
        instrument: primary.instrument,
        location_id: form.location_id,
        teacher_id: primary.teacher_id || null,
        blocks_per_week: form.blocks_per_week,
        rate_per_session: form.rate_per_session,
        start_date: form.start_date || null,
        end_date: form.end_date || null,
        status: form.status as any,
        notes: form.notes || null,
      })
      if (tenantId) {
        await saveInstruments.mutateAsync({
          studentId: student.id,
          tenantId,
          instruments: instrumentRows.map(r => ({
            id: r.id,
            instrument: r.instrument,
            teacher_id: r.teacher_id || null,
            is_primary: r.is_primary,
            rate_per_session: r.rate_per_session,
            sessions_per_month: r.sessions_per_month,
          })),
          removedIds,
        })
      }
      qc.invalidateQueries({ queryKey: ['student-detail'] })
      onSaved()
    } catch (err: any) {
      setError(err.message)
    }
  }

  const saving = updateStudent.isPending || saveInstruments.isPending

  return (<>
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 560 }}>
        <div className="modal-header">
          <h2>Edit Student</h2>
          <button className="btn-ghost" onClick={onClose}>✕</button>
        </div>
        <form onSubmit={handleSubmit} className="modal-form">
          <div className="form-row">
            <div className="form-field" style={{ flex: 1 }}>
              <label>First Name *</label>
              <input value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })} />
            </div>
            <div className="form-field" style={{ flex: 1 }}>
              <label>Last Name *</label>
              <input value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })} />
            </div>
          </div>

          {/* ── Instruments & Teachers ── */}
          <div style={{ marginBottom: 14 }}>
            <label style={{ fontSize: 11, fontWeight: 700, color: '#A0A0C8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8, display: 'block' }}>Instruments & Teachers</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {instrumentRows.map((row, idx) => (
                <div key={idx} style={{ display: 'flex', gap: 6, alignItems: 'center', padding: '8px 10px', borderRadius: 10, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                  <span style={{ fontSize: 18, flexShrink: 0 }}>{row.instrument ? getInstrumentEmoji(row.instrument) : '🎵'}</span>
                  <select value={row.instrument} onChange={(e) => updateRow(idx, { instrument: e.target.value })} className="filter-select" style={{ flex: 1, minWidth: 0 }}>
                    <option value="">Select...</option>
                    <optgroup label="Core">
                      {INSTRUMENTS.filter(i => CORE_FOUR.has(i)).map(i => <option key={i} value={i}>{i.charAt(0).toUpperCase() + i.slice(1)}</option>)}
                    </optgroup>
                    <optgroup label="Other">
                      {INSTRUMENTS.filter(i => !CORE_FOUR.has(i)).map(i => <option key={i} value={i}>{i.charAt(0).toUpperCase() + i.slice(1)}</option>)}
                    </optgroup>
                  </select>
                  <span style={{ fontSize: 11, color: '#606088', flexShrink: 0 }}>with</span>
                  <select value={row.teacher_id} onChange={(e) => updateRow(idx, { teacher_id: e.target.value })} className="filter-select" style={{ flex: 1, minWidth: 0 }}>
                    <option value="">Unassigned</option>
                    {teachers?.map((t: any) => <option key={t.id} value={t.id}>{t.first_name ?? t.profile?.first_name} {t.last_name ?? t.profile?.last_name}</option>)}
                  </select>
                  {row.is_primary && <span style={{ fontSize: 8, fontWeight: 800, padding: '2px 6px', borderRadius: 4, background: 'rgba(212,34,106,0.15)', color: '#D4226A', textTransform: 'uppercase', letterSpacing: '0.06em', flexShrink: 0 }}>Primary</span>}
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
              <label>Location *</label>
              <select value={form.location_id} onChange={(e) => setForm({ ...form, location_id: e.target.value })} className="filter-select" style={{ width: '100%' }}>
                <option value="">Select...</option>
                {locations?.filter((l: any) => l.is_active).map((l: any) => <option key={l.id} value={l.id}>{l.name.replace(' Music Lessons', '')}</option>)}
              </select>
            </div>
            <div className="form-field" style={{ flex: 1 }}>
              <label>Status</label>
              <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className="filter-select" style={{ width: '100%' }}>
                <option value="active">Active</option>
                <option value="paused">Paused</option>
                <option value="inactive">Inactive</option>
                <option value="former">Former</option>
              </select>
            </div>
          </div>

          <div className="form-row">
            <div className="form-field" style={{ flex: 1 }}>
              <label>Blocks/Week</label>
              <input type="number" min="1" max="10" value={form.blocks_per_week} onChange={(e) => setForm({ ...form, blocks_per_week: parseInt(e.target.value) || 1 })} />
            </div>
            <div className="form-field" style={{ flex: 1 }}>
              <label>Rate/Session ($)</label>
              <input type="number" step="0.50" value={form.rate_per_session} onChange={(e) => setForm({ ...form, rate_per_session: parseFloat(e.target.value) || 45 })} />
            </div>
          </div>

          <div className="form-row">
            <div className="form-field" style={{ flex: 1 }}>
              <label>Start Date</label>
              <input type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} />
            </div>
            <div className="form-field" style={{ flex: 1 }}>
              <label>End Date</label>
              <input type="date" value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} />
            </div>
          </div>

          <div className="form-field">
            <label>Notes</label>
            <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} />
          </div>

          {error && <div className="form-error">{error}</div>}

          <div className="modal-actions">
            <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>

    {showRetention && (
      <RetentionCaptureModal
        studentId={student.id}
        studentFirstName={student.first_name ?? form.first_name}
        familyId={student.family_id}
        newStatus={showRetention}
        onComplete={() => { setShowRetention(null); onSaved(); onClose() }}
        onCancel={() => setShowRetention(null)}
      />
    )}
    </>
  )
}

// ═══════════════════════════════════════
// RATE OVERRIDE MODAL
// ═══════════════════════════════════════

const RATE_OPTIONS = [
  { value: 4500, label: '$45.00' },
  { value: 4000, label: '$40.00' },
  { value: 3750, label: '$37.50' },
]

function RateOverrideModal({ familyId, currentTier, isOverride, onClose, overrideMutation, removeOverrideMutation, onSuccess }: {
  familyId: string
  currentTier: number
  isOverride: boolean
  onClose: () => void
  overrideMutation: ReturnType<typeof useOverrideFamilyRate>
  removeOverrideMutation: ReturnType<typeof useRemoveFamilyRateOverride>
  onSuccess: () => void
}) {
  const [selectedRate, setSelectedRate] = useState(currentTier)
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)

  const handleSave = async () => {
    if (!reason.trim()) { setError('Reason is required.'); return }
    try {
      await overrideMutation.mutateAsync({ familyId, rateTier: selectedRate, reason: reason.trim() })
      onSuccess()
    } catch (err: any) {
      setError(err.message ?? 'Failed to override rate.')
    }
  }

  const handleRemove = async () => {
    try {
      await removeOverrideMutation.mutateAsync({ familyId })
      onSuccess()
    } catch (err: any) {
      setError(err.message ?? 'Failed to remove override.')
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose} style={{ zIndex: 9999 }}>
      <div
        className="location-card"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 440, width: '92vw', margin: 'auto', padding: 0, cursor: 'default', position: 'relative' }}
      >
        <div className="loc-card-edge" style={{
          background: 'linear-gradient(180deg, #6366F1, #818CF8)',
          boxShadow: '0 0 14px rgba(99,102,241,0.5)',
        }} />
        <div className="loc-card-glow" style={{
          background: 'radial-gradient(circle, rgba(99,102,241,0.08) 0%, transparent 70%)',
        }} />
        <div style={{ position: 'relative', zIndex: 1, padding: '24px 28px 28px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
            <h2 style={{ fontSize: 18, fontWeight: 800, letterSpacing: '-0.02em', margin: 0, color: '#E0E0F4' }}>Override Rate Tier</h2>
            <button type="button" className="btn-ghost" onClick={onClose} style={{ padding: '4px 10px', fontSize: 14 }}>&times;</button>
          </div>

          <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.1em', color: '#8080A8', marginBottom: 10 }}>
            Select Rate
          </div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
            {RATE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setSelectedRate(opt.value)}
                style={{
                  flex: 1,
                  padding: '10px 0',
                  borderRadius: 10,
                  fontSize: 14,
                  fontWeight: 700,
                  cursor: 'pointer',
                  transition: 'all 140ms ease',
                  background: selectedRate === opt.value ? 'rgba(99,102,241,0.12)' : 'rgba(255,255,255,0.04)',
                  border: `1px solid ${selectedRate === opt.value ? 'rgba(99,102,241,0.4)' : 'rgba(255,255,255,0.08)'}`,
                  color: selectedRate === opt.value ? '#818CF8' : '#585878',
                  textAlign: 'center' as const,
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.1em', color: '#8080A8', marginBottom: 8 }}>
            Reason <span style={{ color: '#E8488A' }}>*</span>
          </div>
          <textarea
            value={reason}
            onChange={(e) => { setReason(e.target.value); setError(null) }}
            rows={3}
            placeholder="Why is this rate being manually overridden?"
            style={{
              width: '100%', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 10, padding: '10px 14px', color: '#E0E0F4', fontSize: 13, resize: 'vertical',
              marginBottom: 16,
            }}
          />

          {error && <div className="form-error" style={{ marginBottom: 12 }}>{error}</div>}

          <button
            type="button"
            onClick={handleSave}
            disabled={overrideMutation.isPending}
            style={{
              width: '100%', padding: '12px 24px', borderRadius: 12, border: 'none',
              background: 'linear-gradient(135deg, #6366F1, #818CF8)', color: '#fff',
              fontSize: 13, fontWeight: 800, cursor: overrideMutation.isPending ? 'not-allowed' : 'pointer',
              opacity: overrideMutation.isPending ? 0.7 : 1, transition: 'all 140ms ease',
              boxShadow: '0 4px 16px rgba(99,102,241,0.3)', letterSpacing: '-0.01em',
            }}
          >
            {overrideMutation.isPending ? 'Saving...' : 'Save Override'}
          </button>

          {isOverride && (
            <button
              type="button"
              onClick={handleRemove}
              disabled={removeOverrideMutation.isPending}
              style={{
                width: '100%', marginTop: 10, padding: '10px 24px', borderRadius: 12,
                background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)',
                color: '#EF4444', fontSize: 12, fontWeight: 700, cursor: removeOverrideMutation.isPending ? 'not-allowed' : 'pointer',
                transition: 'all 140ms ease',
              }}
            >
              {removeOverrideMutation.isPending ? 'Removing...' : 'Remove Override (Auto-Calculate)'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════
// SESSION CREDIT MODAL
// ═══════════════════════════════════════

const CREDIT_REASON_PRESETS = ['Teacher Callout', 'Studio Cancellation', 'Other']

function SessionCreditModal({ familyId, studentId, studentName, defaultAmountCents, onClose, addCreditMutation, onSuccess }: {
  familyId: string
  studentId: string
  studentName: string
  defaultAmountCents: number
  onClose: () => void
  addCreditMutation: ReturnType<typeof useAddSessionCredit>
  onSuccess: () => void
}) {
  const [reasonPreset, setReasonPreset] = useState('')
  const [reasonText, setReasonText] = useState('')
  const [amountDisplay, setAmountDisplay] = useState((defaultAmountCents / 100).toFixed(2))
  const nextMonth = (() => {
    const d = new Date()
    d.setMonth(d.getMonth() + 1, 1)
    return d.toISOString().split('T')[0]
  })()
  const [appliesTo, setAppliesTo] = useState(nextMonth)
  const [error, setError] = useState<string | null>(null)

  const handleSave = async () => {
    const finalReason = reasonPreset === 'Other' ? reasonText.trim() : (reasonPreset || reasonText.trim())
    if (!finalReason) { setError('Reason is required.'); return }
    const cents = Math.round(parseFloat(amountDisplay || '0') * 100)
    if (cents <= 0) { setError('Amount must be greater than $0.'); return }
    try {
      await addCreditMutation.mutateAsync({
        familyId,
        studentId,
        reason: finalReason,
        amountCents: cents,
        appliesToCycle: appliesTo,
        notes: reasonPreset === 'Other' ? undefined : reasonText.trim() || undefined,
      })
      onSuccess()
    } catch (err: any) {
      setError(err.message ?? 'Failed to add credit.')
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose} style={{ zIndex: 9999 }}>
      <div
        className="location-card"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 440, width: '92vw', margin: 'auto', padding: 0, cursor: 'default', position: 'relative' }}
      >
        <div className="loc-card-edge" style={{
          background: 'linear-gradient(180deg, #22C55E, #16A34A)',
          boxShadow: '0 0 14px rgba(34,197,94,0.5)',
        }} />
        <div className="loc-card-glow" style={{
          background: 'radial-gradient(circle, rgba(34,197,94,0.08) 0%, transparent 70%)',
        }} />
        <div style={{ position: 'relative', zIndex: 1, padding: '24px 28px 28px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <h2 style={{ fontSize: 18, fontWeight: 800, letterSpacing: '-0.02em', margin: 0, color: '#E0E0F4' }}>Add Session Credit</h2>
            <button type="button" className="btn-ghost" onClick={onClose} style={{ padding: '4px 10px', fontSize: 14 }}>&times;</button>
          </div>
          <div style={{ fontSize: 12, color: '#A0A0C8', marginBottom: 20 }}>For {studentName}</div>

          <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.1em', color: '#8080A8', marginBottom: 10 }}>
            Reason
          </div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
            {CREDIT_REASON_PRESETS.map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => setReasonPreset(reasonPreset === preset ? '' : preset)}
                style={{
                  flex: 1,
                  padding: '8px 0',
                  borderRadius: 999,
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all 140ms ease',
                  background: reasonPreset === preset ? 'rgba(34,197,94,0.12)' : 'rgba(255,255,255,0.04)',
                  border: `1px solid ${reasonPreset === preset ? 'rgba(34,197,94,0.35)' : 'rgba(255,255,255,0.08)'}`,
                  color: reasonPreset === preset ? '#22C55E' : '#585878',
                  textAlign: 'center' as const,
                }}
              >
                {preset}
              </button>
            ))}
          </div>

          <textarea
            value={reasonText}
            onChange={(e) => { setReasonText(e.target.value); setError(null) }}
            rows={2}
            placeholder={reasonPreset === 'Other' ? 'Describe the reason...' : 'Additional notes (optional)'}
            style={{
              width: '100%', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 10, padding: '10px 14px', color: '#E0E0F4', fontSize: 13, resize: 'vertical',
              marginBottom: 16,
            }}
          />

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.1em', color: '#8080A8', marginBottom: 6 }}>
                Credit Amount ($)
              </div>
              <input
                type="number"
                step="0.01"
                value={amountDisplay}
                onChange={(e) => setAmountDisplay(e.target.value)}
                className="filter-select"
                style={{ width: '100%' }}
              />
            </div>
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.1em', color: '#8080A8', marginBottom: 6 }}>
                Applies To
              </div>
              <input
                type="date"
                value={appliesTo}
                onChange={(e) => setAppliesTo(e.target.value)}
                className="filter-select"
                style={{ width: '100%' }}
              />
            </div>
          </div>

          {error && <div className="form-error" style={{ marginBottom: 12 }}>{error}</div>}

          <button
            type="button"
            onClick={handleSave}
            disabled={addCreditMutation.isPending}
            style={{
              width: '100%', padding: '12px 24px', borderRadius: 12, border: 'none',
              background: 'linear-gradient(135deg, #22C55E, #16A34A)', color: '#fff',
              fontSize: 13, fontWeight: 800, cursor: addCreditMutation.isPending ? 'not-allowed' : 'pointer',
              opacity: addCreditMutation.isPending ? 0.7 : 1, transition: 'all 140ms ease',
              boxShadow: '0 4px 16px rgba(34,197,94,0.3)', letterSpacing: '-0.01em',
            }}
          >
            {addCreditMutation.isPending ? 'Adding Credit...' : 'Add Session Credit'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════
// SESSION HISTORY + COMMUNICATIONS
// ═══════════════════════════════════════

const PROGRESS_COLORS: Record<string, { label: string; color: string }> = {
  crushing_it: { label: 'Crushing It', color: '#22C55E' },
  on_track: { label: 'On Track', color: '#FFB800' },
  struggling: { label: 'Needs Work', color: '#EF4444' },
}
const ENGAGE_EMOJI: Record<number, string> = { 1: '😴', 2: '😐', 3: '🙂', 4: '😄', 5: '🔥' }

function SessionHistorySection({ studentId, studentName }: { studentId: string; studentName: string }) {
  const [tab, setTab] = useState<'sessions' | 'updates'>('sessions')

  // Session logs
  const { data: sessionLogs } = useQuery({
    queryKey: ['student-session-logs', studentId],
    enabled: !!studentId,
    queryFn: async () => {
      const { data } = await supabase
        .from('session_log')
        .select('id, block_date, worked_on, engagement_level, progress_indicator, teacher_note, teacher_id, instrument, parent_update_status')
        .eq('student_id', studentId)
        .order('block_date', { ascending: false })
        .limit(20)

      if (!data || data.length === 0) return []

      const teacherIds = [...new Set(data.map(l => l.teacher_id))]
      const { data: teachers } = await supabase.from('teachers').select('id, first_name, last_name').in('id', teacherIds)
      const tMap = new Map((teachers ?? []).map((t: any) => [t.id, `${t.first_name} ${t.last_name}`.trim()]))

      return data.map((l: any) => ({ ...l, teacher_name: tMap.get(l.teacher_id) ?? 'Unknown' }))
    },
  })

  // Communications (parent updates)
  const { data: comms } = useStudentCommunications(studentId)

  return (
    <div style={{ marginBottom: 14 }}>
      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 12 }}>
        <button onClick={() => setTab('sessions')} style={{
          padding: '6px 14px', borderRadius: 8, fontSize: 11, fontWeight: 700, cursor: 'pointer',
          background: tab === 'sessions' ? 'rgba(212,34,106,0.12)' : 'rgba(255,255,255,0.03)',
          color: tab === 'sessions' ? '#E8488A' : '#8080A8',
          border: tab === 'sessions' ? '1px solid rgba(212,34,106,0.2)' : '1px solid rgba(255,255,255,0.06)',
        }}>
          Session History {sessionLogs?.length ? `(${sessionLogs.length})` : ''}
        </button>
        <button onClick={() => setTab('updates')} style={{
          padding: '6px 14px', borderRadius: 8, fontSize: 11, fontWeight: 700, cursor: 'pointer',
          background: tab === 'updates' ? 'rgba(255,184,0,0.12)' : 'rgba(255,255,255,0.03)',
          color: tab === 'updates' ? '#FFB800' : '#8080A8',
          border: tab === 'updates' ? '1px solid rgba(255,184,0,0.2)' : '1px solid rgba(255,255,255,0.06)',
        }}>
          Parent Updates {comms?.length ? `(${comms.length})` : ''}
        </button>
      </div>

      {/* Session logs */}
      {tab === 'sessions' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {!sessionLogs || sessionLogs.length === 0 ? (
            <div style={{ padding: '24px 16px', textAlign: 'center', color: '#606088', fontSize: 12, background: 'rgba(255,255,255,0.02)', borderRadius: 10, border: '1px solid rgba(255,255,255,0.04)' }}>
              No session logs yet. Teachers log sessions via the quick-input after each lesson.
            </div>
          ) : sessionLogs.map((log: any) => {
            const prog = PROGRESS_COLORS[log.progress_indicator]
            return (
              <div key={log.id} style={{
                padding: '10px 14px', borderRadius: 10,
                background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: '#E0E0F4' }}>
                      {new Date(log.block_date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </span>
                    <span style={{ fontSize: 11, color: '#8080A8' }}>with {log.teacher_name}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    {log.engagement_level && <span style={{ fontSize: 13 }}>{ENGAGE_EMOJI[log.engagement_level]}</span>}
                    {prog && <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 8px', borderRadius: 6, background: prog.color + '18', color: prog.color }}>{prog.label}</span>}
                  </div>
                </div>
                {log.worked_on?.length > 0 && (
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 4 }}>
                    {log.worked_on.map((tag: string) => (
                      <span key={tag} style={{ fontSize: 9, padding: '2px 7px', borderRadius: 4, background: 'rgba(212,34,106,0.08)', color: '#D4226A', fontWeight: 600 }}>{tag}</span>
                    ))}
                  </div>
                )}
                {log.teacher_note && <div style={{ fontSize: 11, color: '#A0A0C8', fontStyle: 'italic' }}>"{log.teacher_note}"</div>}
                {log.parent_update_status === 'sent' && <div style={{ fontSize: 9, color: '#22C55E', marginTop: 3 }}>Parent update sent</div>}
              </div>
            )
          })}
        </div>
      )}

      {/* Parent updates (communications) */}
      {tab === 'updates' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {!comms || comms.length === 0 ? (
            <div style={{ padding: '24px 16px', textAlign: 'center', color: '#606088', fontSize: 12, background: 'rgba(255,255,255,0.02)', borderRadius: 10, border: '1px solid rgba(255,255,255,0.04)' }}>
              No parent updates sent yet.
            </div>
          ) : comms.map(c => (
            <div key={c.id} style={{
              padding: '12px 14px', borderRadius: 10,
              background: 'rgba(255,184,0,0.02)', border: '1px solid rgba(255,184,0,0.08)',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: '#FFB800' }}>
                  {new Date(c.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} — by {c.teacher_name}
                </span>
                <span style={{ fontSize: 9, color: c.status === 'read' ? '#22C55E' : '#8080A8' }}>
                  {c.status === 'read' ? 'Read' : c.status === 'sent' ? 'Sent' : c.status}
                </span>
              </div>
              <div style={{ fontSize: 12, color: '#C0C0E0', lineHeight: 1.5 }}>{c.body}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
