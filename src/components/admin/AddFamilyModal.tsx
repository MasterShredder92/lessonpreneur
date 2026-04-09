import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useAuthContext } from '../../app/AuthContext'
import { usePermissions } from '../../hooks/usePermissions'
import { useLocations } from '../../hooks/useLocations'
import { useTeachers } from '../../hooks/useTeachers'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { toast } from '../shared/Toast'
import { ALL_INSTRUMENTS, DEFAULT_SESSIONS_PER_MONTH, DEFAULT_RATE_PER_SESSION } from '../../lib/constants'
import { X, Plus, Trash2, Users, Check } from 'lucide-react'
import { qk } from '../../lib/queryKeys'

interface Props {
  onClose: () => void
  onCreated?: (familyId: string) => void
}

interface StudentEntry {
  firstName: string
  lastName: string
  instrument: string
  teacherId: string
  sessionsPerMonth: number
  ratePerSession: number
  startDate: string
  notes: string
}

function emptyStudent(defaultLastName: string): StudentEntry {
  return {
    firstName: '',
    lastName: defaultLastName,
    instrument: '',
    teacherId: '',
    sessionsPerMonth: DEFAULT_SESSIONS_PER_MONTH,
    ratePerSession: DEFAULT_RATE_PER_SESSION,
    startDate: new Date().toISOString().split('T')[0],
    notes: '',
  }
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '10px 14px', borderRadius: 10,
  background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)',
  color: '#E0E0F4', fontSize: 13, outline: 'none', boxSizing: 'border-box',
}
const selectStyle: React.CSSProperties = { ...inputStyle, cursor: 'pointer' }
const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: 11, fontWeight: 700, color: '#8080A8',
  textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 5,
}

function Label({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <label style={labelStyle}>
      {children}{required && <span style={{ color: '#E8488A' }}> *</span>}
    </label>
  )
}

export default function AddFamilyModal({ onClose, onCreated }: Props) {
  const { tenantId } = useAuthContext()
  const { isStudioDirector, locationIds: scopedLocationIds } = usePermissions()
  const { data: locations } = useLocations()
  const { data: teachers } = useTeachers()
  const qc = useQueryClient()

  // Step: 'family' | 'students' | 'saving'
  const [step, setStep] = useState<'family' | 'students' | 'saving'>('family')

  // Family fields
  const [parentFirst, setParentFirst] = useState('')
  const [parentLast, setParentLast] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [locationId, setLocationId] = useState('')
  const [isMilitary, setIsMilitary] = useState(false)
  const [billingNotes, setBillingNotes] = useState('')
  const [emergencyName, setEmergencyName] = useState('')
  const [emergencyPhone, setEmergencyPhone] = useState('')
  const [emergencyRelationship, setEmergencyRelationship] = useState('')
  const [schedulingNotes, setSchedulingNotes] = useState('')

  // Student entries
  const [wantsStudents, setWantsStudents] = useState<boolean | null>(null)
  const [students, setStudents] = useState<StudentEntry[]>([])

  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const activeLocations = (locations ?? []).filter((l: any) => l.is_active !== false)

  // Lock location for studio directors
  useEffect(() => {
    if (isStudioDirector && scopedLocationIds.length > 0 && !locationId) {
      setLocationId(scopedLocationIds[0])
    }
  }, [isStudioDirector, scopedLocationIds, locationId])

  // Filter teachers by selected location
  const locationTeachers = (teachers ?? []).filter((t: any) => {
    if (!locationId) return true
    const locs = t.location_ids ?? t.locations?.map((l: any) => l.id) ?? []
    return locs.includes(locationId)
  })

  const updateStudent = (idx: number, field: keyof StudentEntry, value: any) => {
    setStudents(prev => prev.map((s, i) => i === idx ? { ...s, [field]: value } : s))
  }

  const removeStudent = (idx: number) => {
    setStudents(prev => prev.filter((_, i) => i !== idx))
  }

  const validateFamily = (): boolean => {
    if (!parentFirst.trim()) { setError('Parent first name is required.'); return false }
    if (!parentLast.trim()) { setError('Parent last name is required.'); return false }
    if (!email.trim()) { setError('Email is required.'); return false }
    if (!phone.trim()) { setError('Phone is required.'); return false }
    if (!locationId) { setError('Location is required.'); return false }
    setError(null)
    return true
  }

  const validateStudents = (): boolean => {
    for (let i = 0; i < students.length; i++) {
      const s = students[i]
      if (!s.firstName.trim()) { setError(`Student ${i + 1}: First name is required.`); return false }
      if (!s.lastName.trim()) { setError(`Student ${i + 1}: Last name is required.`); return false }
      if (!s.instrument) { setError(`Student ${i + 1}: Instrument is required.`); return false }
      if (!s.ratePerSession || s.ratePerSession <= 0) { setError(`Student ${i + 1}: Rate per session is required.`); return false }
      if (!s.startDate) { setError(`Student ${i + 1}: Start date is required.`); return false }
    }
    setError(null)
    return true
  }

  const handleProceedToStudents = () => {
    if (!validateFamily()) return
    setWantsStudents(true)
    setStudents([emptyStudent(parentLast.trim())])
    setStep('students')
  }

  const handleSkipStudents = async () => {
    if (!validateFamily()) return
    await saveAll([])
  }

  const handleSaveWithStudents = async () => {
    if (!validateStudents()) return
    await saveAll(students)
  }

  const saveAll = async (studentList: StudentEntry[]) => {
    setSaving(true)
    setStep('saving')
    setError(null)

    try {
      // 1. Insert family
      const parentName = `${parentFirst.trim()} ${parentLast.trim()}`
      const { data: newFamily, error: famErr } = await supabase
        .from('families')
        .insert({
          tenant_id: tenantId!,
          name: `${parentLast.trim()} Family`,
          parent_first_name: parentFirst.trim(),
          parent_last_name: parentLast.trim(),
          parent_name: parentName,
          primary_contact_name: parentName,
          primary_email: email.trim().toLowerCase(),
          primary_phone: phone.trim(),
          primary_location_id: locationId,
          is_military: isMilitary,
          billing_notes: billingNotes.trim() || null,
          emergency_contact_name: emergencyName.trim() || null,
          emergency_contact_phone: emergencyPhone.trim() || null,
          emergency_contact_relationship: emergencyRelationship.trim() || null,
          scheduling_notes: schedulingNotes.trim() || null,
          billing_status: 'active',
          notify_via_sms: true,
          notify_via_email: true,
          reminder_4hr: true,
          reminder_1hr: true,
        })
        .select()
        .single()

      if (famErr) throw famErr
      const familyId = newFamily.id

      // 2. Insert students
      let successCount = 0
      const failures: string[] = []

      for (const s of studentList) {
        try {
          const { data: newStudent, error: stuErr } = await supabase
            .from('students')
            .insert({
              tenant_id: tenantId!,
              family_id: familyId,
              location_id: locationId,
              teacher_id: s.teacherId || null,
              first_name: s.firstName.trim(),
              last_name: s.lastName.trim(),
              instrument: s.instrument,
              sessions_per_month: s.sessionsPerMonth,
              blocks_per_week: 1,
              rate_per_session: s.ratePerSession,
              start_date: s.startDate || null,
              notes: s.notes.trim() || null,
              status: 'active',
            })
            .select()
            .single()

          if (stuErr) throw stuErr

          // Auto-create onboarding sequence (non-critical)
          const enrollDate = s.startDate || new Date().toISOString().split('T')[0]
          const base = new Date(enrollDate + 'T12:00:00')
          const addDays = (d: Date, n: number) => { const r = new Date(d); r.setDate(r.getDate() + n); return r.toISOString().split('T')[0] }
          await supabase.from('onboarding_sequences').insert({
            tenant_id: tenantId!,
            student_id: newStudent.id,
            family_id: familyId,
            location_id: locationId,
            enrollment_date: enrollDate,
            day_7_due: addDays(base, 7),
            day_14_due: addDays(base, 14),
            day_30_due: addDays(base, 30),
            day_60_due: addDays(base, 60),
            day_90_due: addDays(base, 90),
            status: 'active',
          }).then(() => {})

          successCount++
        } catch (err: any) {
          failures.push(`${s.firstName} ${s.lastName}`)
        }
      }

      // 3. Auto-create tasks for missing docs
      const familyDisplayName = `${parentLast.trim()} Family`
      await supabase.from('tasks').upsert({
        tenant_id: tenantId!, task_type: 'missing_contract',
        title: `Upload contract — ${familyDisplayName}`, priority: 'high',
        assigned_role: 'studio_director', entity_type: 'family',
        entity_id: familyId, entity_name: familyDisplayName,
        status: 'pending', dedup_key: `missing_contract:${familyId}`,
      }, { onConflict: 'dedup_key', ignoreDuplicates: true })
      await supabase.from('tasks').upsert({
        tenant_id: tenantId!, task_type: 'missing_enrollment_form',
        title: `Upload enrollment form — ${familyDisplayName}`, priority: 'high',
        assigned_role: 'studio_director', entity_type: 'family',
        entity_id: familyId, entity_name: familyDisplayName,
        status: 'pending', dedup_key: `missing_enrollment:${familyId}`,
      }, { onConflict: 'dedup_key', ignoreDuplicates: true })

      // 4. Invalidate caches
      await Promise.all([
        qc.invalidateQueries({ queryKey: qk.students.all }),
        qc.invalidateQueries({ queryKey: qk.students.roster }),
        qc.invalidateQueries({ queryKey: qk.students.instruments }),
        qc.invalidateQueries({ queryKey: qk.students.tabCounts }),
        qc.invalidateQueries({ queryKey: qk.families.all }),
        qc.invalidateQueries({ queryKey: qk.families.page }),
        qc.invalidateQueries({ queryKey: qk.families.roster }),
        qc.invalidateQueries({ queryKey: qk.families.tabCounts }),
        qc.invalidateQueries({ queryKey: qk.families.fileDetail }),
        qc.invalidateQueries({ queryKey: qk.tasks.all }),
        qc.invalidateQueries({ queryKey: qk.onboarding.pipeline }),
      ])

      // 5. Toast + navigate
      if (failures.length > 0) {
        toast(`Family created, but ${failures.join(', ')} failed to save — add them from the family profile.`, 'warning')
      } else if (successCount > 0) {
        toast(`Family created with ${successCount} student${successCount !== 1 ? 's' : ''}`, 'success')
      } else {
        toast('Family created', 'success')
      }

      onCreated?.(familyId)
      onClose()
    } catch (err: any) {
      setError(err.message || 'Failed to create family.')
      setStep(wantsStudents ? 'students' : 'family')
    } finally {
      setSaving(false)
    }
  }

  const isMobile = typeof window !== 'undefined' && window.innerWidth < 640

  return createPortal(
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 99999,
        display: 'flex', alignItems: isMobile ? 'flex-end' : 'center', justifyContent: 'center',
        background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)',
      }}
      onClick={onClose}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: isMobile ? '100%' : 580, maxWidth: '100vw',
          maxHeight: isMobile ? '95vh' : '90vh',
          borderRadius: isMobile ? '20px 20px 0 0' : 16,
          background: '#1A1830', border: '1px solid rgba(255,255,255,0.08)',
          boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div style={{
          padding: '18px 24px 14px', borderBottom: '1px solid rgba(255,255,255,0.06)',
          display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0,
        }}>
          <div style={{
            width: 36, height: 36, borderRadius: 10,
            background: 'linear-gradient(135deg, rgba(212,34,106,0.15), rgba(212,34,106,0.05))',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Users size={18} style={{ color: '#D4226A' }} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 17, fontWeight: 800, color: '#E0E0F4' }}>Add New Family</div>
            <div style={{ fontSize: 11, color: '#8080A8' }}>
              {step === 'family' ? 'Step 1 — Family Info' : step === 'students' ? 'Step 2 — Add Students' : 'Saving...'}
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#8080A8', cursor: 'pointer', fontSize: 22, lineHeight: 1, padding: '4px 8px' }}><X size={18} /></button>
        </div>

        {/* Scrollable body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px 24px', WebkitOverflowScrolling: 'touch' }}>
          {step === 'saving' && (
            <div style={{ textAlign: 'center', padding: '40px 0' }}>
              <div style={{ fontSize: 14, color: '#8080A8' }}>Creating family...</div>
            </div>
          )}

          {step === 'family' && (
            <>
              {/* Parent Name */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
                <div>
                  <Label required>Parent First Name</Label>
                  <input value={parentFirst} onChange={e => setParentFirst(e.target.value)} placeholder="First name" style={inputStyle} />
                </div>
                <div>
                  <Label required>Parent Last Name</Label>
                  <input value={parentLast} onChange={e => setParentLast(e.target.value)} placeholder="Last name" style={inputStyle} />
                </div>
              </div>

              {/* Email + Phone */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
                <div>
                  <Label required>Primary Email</Label>
                  <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="parent@email.com" style={inputStyle} />
                </div>
                <div>
                  <Label required>Primary Phone</Label>
                  <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="(555) 123-4567" style={inputStyle} />
                </div>
              </div>

              {/* Location */}
              <div style={{ marginBottom: 14 }}>
                <Label required>Location</Label>
                {isStudioDirector ? (
                  <div style={{ ...inputStyle, background: 'rgba(255,255,255,0.02)', color: '#A0A0C8', cursor: 'not-allowed' }}>
                    {activeLocations.find((l: any) => l.id === locationId)?.name?.replace(' Music Lessons', '') ?? 'Your Location'}
                  </div>
                ) : (
                  <select value={locationId} onChange={e => setLocationId(e.target.value)} style={selectStyle}>
                    <option value="">Select location...</option>
                    {activeLocations.map((l: any) => (
                      <option key={l.id} value={l.id}>{l.name.replace(' Music Lessons', '')}</option>
                    ))}
                  </select>
                )}
              </div>

              {/* Military toggle */}
              <div style={{ marginBottom: 14 }}>
                <Label>Is Military?</Label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button type="button" onClick={() => setIsMilitary(true)} style={{
                    padding: '8px 20px', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer',
                    background: isMilitary ? 'rgba(34,197,94,0.12)' : 'rgba(255,255,255,0.04)',
                    border: `1px solid ${isMilitary ? 'rgba(34,197,94,0.3)' : 'rgba(255,255,255,0.08)'}`,
                    color: isMilitary ? '#22C55E' : '#8080A8',
                  }}>Yes</button>
                  <button type="button" onClick={() => setIsMilitary(false)} style={{
                    padding: '8px 20px', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer',
                    background: !isMilitary ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.04)',
                    border: `1px solid ${!isMilitary ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.08)'}`,
                    color: !isMilitary ? '#E0E0F4' : '#8080A8',
                  }}>No</button>
                </div>
              </div>

              {/* Optional fields */}
              <div style={{ marginBottom: 14 }}>
                <Label>Billing Notes</Label>
                <textarea value={billingNotes} onChange={e => setBillingNotes(e.target.value)} rows={2} placeholder="Optional billing notes..." style={{ ...inputStyle, resize: 'vertical' }} />
              </div>

              {/* Emergency Contact */}
              <div style={{ fontSize: 12, fontWeight: 700, color: '#6060A0', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10, paddingBottom: 6, borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                Emergency Contact
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
                <div>
                  <Label>Name</Label>
                  <input value={emergencyName} onChange={e => setEmergencyName(e.target.value)} placeholder="Contact name" style={inputStyle} />
                </div>
                <div>
                  <Label>Phone</Label>
                  <input value={emergencyPhone} onChange={e => setEmergencyPhone(e.target.value)} placeholder="(555) 123-4567" style={inputStyle} />
                </div>
              </div>
              <div style={{ marginBottom: 14 }}>
                <Label>Relationship</Label>
                <input value={emergencyRelationship} onChange={e => setEmergencyRelationship(e.target.value)} placeholder="e.g. Grandmother, Uncle" style={inputStyle} />
              </div>

              {/* Scheduling Notes */}
              <div style={{ marginBottom: 14 }}>
                <Label>Scheduling Notes</Label>
                <textarea value={schedulingNotes} onChange={e => setSchedulingNotes(e.target.value)} rows={2} placeholder="e.g. Can only do Tuesdays after 4pm..." style={{ ...inputStyle, resize: 'vertical' }} />
              </div>

              {/* Error */}
              {error && (
                <div style={{ padding: '10px 14px', borderRadius: 10, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', marginBottom: 14, fontSize: 12, color: '#EF4444' }}>
                  {error}
                </div>
              )}

              {/* Prompt to add students */}
              <div style={{ padding: '16px', borderRadius: 12, background: 'rgba(212,34,106,0.06)', border: '1px solid rgba(212,34,106,0.15)', marginBottom: 14 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#E0E0F4', marginBottom: 10 }}>Would you like to add a student to this family now?</div>
                <div style={{ display: 'flex', gap: 10 }}>
                  <button type="button" onClick={handleProceedToStudents} style={{
                    flex: 1, padding: '11px 16px', borderRadius: 10, border: 'none',
                    background: 'linear-gradient(135deg, #D4226A, #E8488A)', color: '#fff',
                    fontSize: 13, fontWeight: 700, cursor: 'pointer',
                  }}>
                    Yes, Add Student
                  </button>
                  <button type="button" onClick={handleSkipStudents} disabled={saving} style={{
                    flex: 1, padding: '11px 16px', borderRadius: 10,
                    background: saving ? '#44403C' : 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
                    color: saving ? '#606088' : '#A0A0C8', fontSize: 13, fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer',
                  }}>
                    {saving ? 'Saving...' : 'Skip — Save Family Only'}
                  </button>
                </div>
              </div>
            </>
          )}

          {step === 'students' && (
            <>
              {students.map((s, idx) => (
                <div key={idx} style={{
                  padding: 16, borderRadius: 12,
                  background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)',
                  marginBottom: 14,
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#D4226A' }}>Student {idx + 1}</div>
                    {students.length > 1 && (
                      <button type="button" onClick={() => removeStudent(idx)} style={{
                        background: 'none', border: 'none', color: '#EF4444', cursor: 'pointer', padding: '2px 6px',
                      }}>
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>

                  {/* Name */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                    <div>
                      <Label required>First Name</Label>
                      <input value={s.firstName} onChange={e => updateStudent(idx, 'firstName', e.target.value)} placeholder="First name" style={inputStyle} />
                    </div>
                    <div>
                      <Label required>Last Name</Label>
                      <input value={s.lastName} onChange={e => updateStudent(idx, 'lastName', e.target.value)} placeholder="Last name" style={inputStyle} />
                    </div>
                  </div>

                  {/* Instrument */}
                  <div style={{ marginBottom: 12 }}>
                    <Label required>Instrument</Label>
                    <select value={s.instrument} onChange={e => updateStudent(idx, 'instrument', e.target.value)} style={selectStyle}>
                      <option value="">Select instrument...</option>
                      {ALL_INSTRUMENTS.map(i => (
                        <option key={i} value={i}>{i.charAt(0).toUpperCase() + i.slice(1)}</option>
                      ))}
                    </select>
                  </div>

                  {/* Teacher */}
                  <div style={{ marginBottom: 12 }}>
                    <Label>Teacher</Label>
                    <select value={s.teacherId} onChange={e => updateStudent(idx, 'teacherId', e.target.value)} style={selectStyle}>
                      <option value="">Select teacher (optional)...</option>
                      {locationTeachers.map((t: any) => (
                        <option key={t.id} value={t.id}>{t.first_name} {t.last_name}</option>
                      ))}
                    </select>
                  </div>

                  {/* Sessions + Rate */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                    <div>
                      <Label required>Sessions / Month</Label>
                      <input type="number" min={1} max={16} value={s.sessionsPerMonth} onChange={e => updateStudent(idx, 'sessionsPerMonth', parseInt(e.target.value) || 0)} style={inputStyle} />
                    </div>
                    <div>
                      <Label required>Rate / Session ($)</Label>
                      <input type="number" min={0} step={0.01} value={s.ratePerSession} onChange={e => updateStudent(idx, 'ratePerSession', parseFloat(e.target.value) || 0)} style={inputStyle} />
                    </div>
                  </div>

                  {/* Start Date */}
                  <div style={{ marginBottom: 12 }}>
                    <Label required>Start Date</Label>
                    <input type="date" value={s.startDate} onChange={e => updateStudent(idx, 'startDate', e.target.value)} style={inputStyle} />
                  </div>

                  {/* Notes */}
                  <div>
                    <Label>Notes</Label>
                    <input value={s.notes} onChange={e => updateStudent(idx, 'notes', e.target.value)} placeholder="Optional notes..." style={inputStyle} />
                  </div>
                </div>
              ))}

              {/* Add another student */}
              {students.length < 6 && (
                <button type="button" onClick={() => setStudents(prev => [...prev, emptyStudent(parentLast.trim())])} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  width: '100%', padding: '12px', borderRadius: 10,
                  background: 'rgba(255,255,255,0.03)', border: '1px dashed rgba(255,255,255,0.12)',
                  color: '#8080A8', fontSize: 12, fontWeight: 600, cursor: 'pointer', marginBottom: 14,
                }}>
                  <Plus size={14} /> Add Another Student
                </button>
              )}

              {/* Error */}
              {error && (
                <div style={{ padding: '10px 14px', borderRadius: 10, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', marginBottom: 14, fontSize: 12, color: '#EF4444' }}>
                  {error}
                </div>
              )}

              {/* Actions */}
              <div style={{ display: 'flex', gap: 10 }}>
                <button type="button" onClick={() => { setStep('family'); setError(null) }} style={{
                  flex: 1, padding: '12px 16px', borderRadius: 10,
                  background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
                  color: '#A0A0C8', fontSize: 13, fontWeight: 600, cursor: 'pointer',
                }}>
                  Back
                </button>
                <button type="button" onClick={handleSaveWithStudents} disabled={saving} style={{
                  flex: 2, padding: '12px 16px', borderRadius: 10, border: 'none',
                  background: saving ? '#44403C' : 'linear-gradient(135deg, #D4226A, #E8488A)',
                  color: '#fff', fontSize: 13, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer',
                }}>
                  {saving ? 'Saving...' : `Save Family + ${students.length} Student${students.length !== 1 ? 's' : ''}`}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}
