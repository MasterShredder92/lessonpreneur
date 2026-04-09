import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useAuthContext } from '../../app/AuthContext'
import { usePermissions } from '../../hooks/usePermissions'
import { useLocations } from '../../hooks/useLocations'
import { useTeachers } from '../../hooks/useTeachers'
import { useQueryClient } from '@tanstack/react-query'
import { supabase, getCurrentBillingCycleId } from '../../lib/supabase'
import { toast } from '../shared/Toast'
import { ALL_INSTRUMENTS, CORE_INSTRUMENTS, OTHER_INSTRUMENTS, DEFAULT_SESSIONS_PER_MONTH, DEFAULT_RATE_PER_SESSION } from '../../lib/constants'
import { Search, Plus, Check, X, Users } from 'lucide-react'
import { qk } from '../../lib/queryKeys'

interface AddStudentModalProps {
  onClose: () => void
}

interface FamilyResult {
  id: string
  name: string
  primary_contact_name: string | null
  parent_name: string | null
  primary_email: string | null
  primary_phone: string | null
  is_military: boolean
}

const DIRECTOR_ROLES = ['owner', 'admin', 'company_director', 'studio_director']

const AGE_RANGES = ['Under 5', '5-10', '11-17', '18-25', '26 or older']
const EXPERIENCE_OPTIONS = [
  { label: 'No Experience', value: 'none' },
  { label: '1-2 Years', value: '1-2 years' },
  { label: '2-4 Years', value: '2-4 years' },
  { label: '4+ Years', value: '4+ years' },
]
const HAS_INSTRUMENT_OPTIONS = [
  { label: 'Yes', value: 'yes' },
  { label: 'No', value: 'no' },
  { label: 'Need Help', value: 'need_help' },
  { label: 'N/A', value: 'na' },
]
const PREFERRED_DAYS = [
  'Monday 3:30-9p', 'Tuesday 3:30-9p', 'Wednesday 3:30-9p',
  'Thursday 3:30-9p', 'Saturday 10am-3p', 'Any of These Work', 'None of These Work',
]
const SOURCE_OPTIONS = [
  { label: 'Facebook/Instagram', value: 'facebook_instagram' },
  { label: 'Google', value: 'google' },
  { label: 'Signage', value: 'signage' },
  { label: 'Referral', value: 'referral' },
  { label: 'Other', value: 'other' },
]

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '10px 14px', borderRadius: 10,
  background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)',
  color: '#E0E0F4', fontSize: 13, outline: 'none', boxSizing: 'border-box',
}

function FieldLabel({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <label style={{ fontSize: 11.5, fontWeight: 600, color: '#9090B0', marginBottom: 5, display: 'block' }}>
      {children}{required && <span style={{ color: '#E8488A' }}> *</span>}
    </label>
  )
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null
  return <div style={{ fontSize: 11, color: '#EF4444', marginTop: 4 }}>{message}</div>
}

function Pill({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} style={{
      padding: '6px 16px', borderRadius: 999, fontSize: 12, fontWeight: 600, cursor: 'pointer',
      transition: 'all 140ms ease', minWidth: 90, textAlign: 'center' as const,
      background: active ? 'rgba(212,34,106,0.12)' : 'rgba(255,255,255,0.04)',
      border: `1px solid ${active ? 'rgba(212,34,106,0.35)' : 'rgba(255,255,255,0.08)'}`,
      color: active ? '#E8488A' : '#585878',
    }}>{label}</button>
  )
}

function TabPill({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} style={{
      padding: '8px 22px', borderRadius: 999, fontSize: 13, fontWeight: 700, cursor: 'pointer',
      transition: 'all 180ms ease', letterSpacing: '-0.01em',
      background: active ? 'linear-gradient(135deg, #D4226A, #E8488A)' : 'transparent',
      border: active ? 'none' : '1px solid rgba(255,255,255,0.08)',
      color: active ? '#fff' : '#585878',
    }}>{label}</button>
  )
}

export default function AddStudentModal({ onClose }: AddStudentModalProps) {
  const { tenantId, role, profile } = useAuthContext()
  const { isStudioDirector, locationIds: scopedLocationIds } = usePermissions()
  const { data: locations } = useLocations()
  const { data: teachers } = useTeachers()
  const qc = useQueryClient()

  const [activeTab, setActiveTab] = useState<'details' | 'preferences'>('details')

  // Student fields
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [instrument, setInstrument] = useState('')
  const [locationId, setLocationId] = useState('')
  const [teacherId, setTeacherId] = useState('')
  const [sessionsPerMonth, setSessionsPerMonth] = useState(DEFAULT_SESSIONS_PER_MONTH)
  const [ratePerSession, setRatePerSession] = useState(DEFAULT_RATE_PER_SESSION)
  const [startDate, setStartDate] = useState('')
  const [notes, setNotes] = useState('')

  // Legacy student detail fields (preferences tab)
  const [ageRange, setAgeRange] = useState('')
  const [selectedInstruments, setSelectedInstruments] = useState<string[]>([])
  const [experience, setExperience] = useState('none')
  const [hasInstrument, setHasInstrument] = useState('na')
  const [preferredDays, setPreferredDays] = useState<string[]>([])
  const [bio, setBio] = useState('')
  const [source, setSource] = useState('other')

  // Prorate
  const [showProrate, setShowProrate] = useState(false)
  const [prorateChoice, setProrateChoice] = useState<'prorate' | 'full' | null>(null)

  // Family linking
  const [familyMode, setFamilyMode] = useState<'search' | 'create'>('search')
  const [familySearchQuery, setFamilySearchQuery] = useState('')
  const [familySearchResults, setFamilySearchResults] = useState<FamilyResult[]>([])
  const [familySearching, setFamilySearching] = useState(false)
  const [selectedFamily, setSelectedFamily] = useState<FamilyResult | null>(null)

  // Create family fields
  const [parentFirst, setParentFirst] = useState('')
  const [parentLast, setParentLast] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [isMilitary, setIsMilitary] = useState(false)

  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)

  const debounceRef = useRef<ReturnType<typeof setTimeout>>()
  const isDirectorPlus = DIRECTOR_ROLES.includes(role ?? '')
  const activeLocations = (locations ?? []).filter((l: any) => l.is_active !== false)

  // Lock location for studio directors
  useEffect(() => {
    if (isStudioDirector && scopedLocationIds.length > 0 && !locationId) {
      setLocationId(scopedLocationIds[0])
    }
  }, [isStudioDirector, scopedLocationIds, locationId])

  // Filter teachers by selected location
  const locationTeachers = (teachers ?? []).filter((t: any) => {
    const st = t.status ?? (t.is_active ? 'active' : 'inactive')
    if (st === 'inactive') return false
    if (!locationId) return true
    const locs = t.location_ids ?? t.locations?.map((l: any) => l.id) ?? []
    return locs.includes(locationId)
  })

  // Search families
  useEffect(() => {
    if (familyMode !== 'search' || !familySearchQuery.trim() || familySearchQuery.trim().length < 2) {
      setFamilySearchResults([])
      return
    }
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      setFamilySearching(true)
      const q = familySearchQuery.trim().toLowerCase()
      const { data } = await supabase
        .from('families')
        .select('id, name, primary_contact_name, parent_name, primary_email, primary_phone, is_military')
        .or(`name.ilike.%${q}%,primary_contact_name.ilike.%${q}%,primary_email.ilike.%${q}%,parent_name.ilike.%${q}%`)
        .limit(10)
      setFamilySearchResults(data ?? [])
      setFamilySearching(false)
    }, 300)
    return () => clearTimeout(debounceRef.current)
  }, [familySearchQuery, familyMode])

  const toggleInstrument = (inst: string) => {
    setSelectedInstruments(prev => prev.includes(inst) ? prev.filter(i => i !== inst) : [...prev, inst])
  }
  const toggleDay = (day: string) => {
    setPreferredDays(prev => prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day])
  }

  // Determine if family is linked
  const hasFamilyLink = familyMode === 'search' ? !!selectedFamily : !!(parentFirst.trim() && parentLast.trim() && email.trim() && phone.trim())

  const handleSave = async () => {
    setError(null)
    const errs: Record<string, string> = {}

    if (!firstName.trim()) errs.firstName = 'First name is required.'
    if (!lastName.trim()) errs.lastName = 'Last name is required.'
    if (!instrument && selectedInstruments.length === 0) errs.instrument = 'Instrument is required.'
    if (!locationId) errs.locationId = 'Location is required.'
    if (!ratePerSession || ratePerSession <= 0) errs.ratePerSession = 'Rate per session must be greater than 0.'
    if (!sessionsPerMonth || sessionsPerMonth <= 0) errs.sessionsPerMonth = 'Sessions per month must be greater than 0.'
    if (!startDate) errs.startDate = 'Start date is required.'

    // Validate family
    if (familyMode === 'search' && !selectedFamily) errs.family = 'Please search and select a family, or create a new one.'
    if (familyMode === 'create') {
      if (!parentFirst.trim()) errs.parentFirst = 'Parent first name is required.'
      if (!parentLast.trim()) errs.parentLast = 'Parent last name is required.'
      if (!email.trim()) errs.email = 'Email is required.'
      if (!phone.trim()) errs.phone = 'Phone is required.'
    }

    setFieldErrors(errs)
    if (Object.keys(errs).length > 0) {
      setError('Please fix the highlighted fields.')
      return
    }

    setSaving(true)
    try {
      let familyId: string

      if (familyMode === 'search' && selectedFamily) {
        familyId = selectedFamily.id
      } else {
        // Create family first
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
            billing_status: 'active',
            notify_via_sms: true,
            notify_via_email: true,
            reminder_4hr: true,
            reminder_1hr: true,
          })
          .select()
          .single()
        if (famErr) throw famErr
        familyId = newFamily.id

        // Auto-create doc tasks
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
      }

      // Stamp notes
      let stampedNotes: string | null = null
      if (notes.trim() && isDirectorPlus && profile) {
        const now = new Date()
        const mm = String(now.getMonth() + 1).padStart(2, '0')
        const dd = String(now.getDate()).padStart(2, '0')
        stampedNotes = `[${profile.first_name} on ${mm}/${dd}]: ${notes.trim()}`
      }

      const instrumentValue = instrument || selectedInstruments.map(i => i.toLowerCase()).join(', ') || 'piano'

      // Create student
      const { data: student, error: stuErr } = await supabase
        .from('students')
        .insert({
          tenant_id: tenantId!,
          family_id: familyId,
          location_id: locationId,
          teacher_id: teacherId || null,
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          instrument: instrumentValue,
          sessions_per_month: sessionsPerMonth,
          blocks_per_week: 1,
          rate_per_session: ratePerSession,
          start_date: startDate || null,
          notes: stampedNotes,
          status: 'active',
          age: ageRange || null,
          experience: experience || 'none',
          has_instrument: hasInstrument || 'na',
          preferred_days: preferredDays.length > 0 ? preferredDays : null,
          bio: bio.trim() || null,
          source: source || 'other',
        })
        .select()
        .single()

      if (stuErr) throw stuErr

      // Onboarding sequence
      const enrollDate = startDate || new Date().toISOString().split('T')[0]
      const base = new Date(enrollDate + 'T12:00:00')
      const addDays = (d: Date, n: number) => { const r = new Date(d); r.setDate(r.getDate() + n); return r.toISOString().split('T')[0] }
      await supabase.from('onboarding_sequences').insert({
        tenant_id: tenantId!, student_id: student.id, family_id: familyId,
        location_id: locationId, enrollment_date: enrollDate,
        day_7_due: addDays(base, 7), day_14_due: addDays(base, 14),
        day_30_due: addDays(base, 30), day_60_due: addDays(base, 60),
        day_90_due: addDays(base, 90), status: 'active',
      }).then(() => {})

      // Prorate
      if (prorateChoice === 'prorate' && startDate) {
        const startDay = new Date(startDate).getDate()
        if (startDay > 1) {
          const daysInMonth = new Date(new Date(startDate).getFullYear(), new Date(startDate).getMonth() + 1, 0).getDate()
          const sessionsMissed = Math.round(((startDay - 1) / daysInMonth) * sessionsPerMonth)
          if (sessionsMissed > 0) {
            const creditCents = sessionsMissed * 4500
            const cycleId = await getCurrentBillingCycleId(tenantId!)
            await supabase.from('billing_adjustments').insert({
              tenant_id: tenantId!, family_id: familyId, student_id: student.id,
              adjustment_type: 'prorate_new', amount_cents: creditCents,
              reason: `Prorated first month — started ${new Date(startDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} (${sessionsMissed} sessions credited)`,
              status: 'applied', applied: true, billing_cycle_id: cycleId,
            })
          }
        }
      }

      // Invalidate
      await Promise.all([
        qc.invalidateQueries({ queryKey: qk.students.all }),
        qc.invalidateQueries({ queryKey: qk.students.roster }),
        qc.invalidateQueries({ queryKey: qk.students.instruments }),
        qc.invalidateQueries({ queryKey: qk.students.tabCounts }),
        qc.invalidateQueries({ queryKey: qk.families.all }),
        qc.invalidateQueries({ queryKey: qk.families.page }),
        qc.invalidateQueries({ queryKey: qk.families.roster }),
        qc.invalidateQueries({ queryKey: qk.families.fileDetail }),
        qc.invalidateQueries({ queryKey: qk.tasks.all }),
        qc.invalidateQueries({ queryKey: qk.onboarding.pipeline }),
      ])

      toast('Student added successfully', 'success')
      onClose()
    } catch (err: any) {
      setError(err.message ?? 'Failed to add student.')
    } finally {
      setSaving(false)
    }
  }

  const isMobile = typeof window !== 'undefined' && window.innerWidth < 640

  const modal = (
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
        <div style={{ padding: '18px 24px 14px', borderBottom: '1px solid rgba(255,255,255,0.06)', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ flex: 1 }}>
            <h2 style={{ fontSize: 20, fontWeight: 800, letterSpacing: '-0.02em', margin: 0, color: '#E0E0F4' }}>Add Student</h2>
          </div>
          <button type="button" onClick={onClose} style={{ background: 'none', border: 'none', color: '#8080A8', cursor: 'pointer', fontSize: 22, padding: '4px 8px' }}><X size={18} /></button>
        </div>

        {/* Tabs */}
        <div style={{ padding: '12px 24px 0', display: 'flex', gap: 8, flexShrink: 0 }}>
          <TabPill label="Student Details" active={activeTab === 'details'} onClick={() => setActiveTab('details')} />
          <TabPill label="Preferences" active={activeTab === 'preferences'} onClick={() => setActiveTab('preferences')} />
        </div>

        {/* Scrollable body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 24px 24px', WebkitOverflowScrolling: 'touch' }}>
          {activeTab === 'details' && (
            <>
              {/* Student Name */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                <div>
                  <FieldLabel required>Student First Name</FieldLabel>
                  <input value={firstName} onChange={e => { setFirstName(e.target.value); setFieldErrors(p => ({ ...p, firstName: '' })) }} placeholder="First name" style={{ ...inputStyle, borderColor: fieldErrors.firstName ? '#EF4444' : undefined }} />
                  <FieldError message={fieldErrors.firstName} />
                </div>
                <div>
                  <FieldLabel required>Student Last Name</FieldLabel>
                  <input value={lastName} onChange={e => { setLastName(e.target.value); setFieldErrors(p => ({ ...p, lastName: '' })) }} placeholder="Last name" style={{ ...inputStyle, borderColor: fieldErrors.lastName ? '#EF4444' : undefined }} />
                  <FieldError message={fieldErrors.lastName} />
                </div>
              </div>

              {/* Instrument */}
              <div style={{ marginBottom: 12 }}>
                <FieldLabel required>Instrument</FieldLabel>
                <select value={instrument} onChange={e => { setInstrument(e.target.value); setFieldErrors(p => ({ ...p, instrument: '' })) }} style={{ ...inputStyle, cursor: 'pointer', borderColor: fieldErrors.instrument ? '#EF4444' : undefined }}>
                  <option value="">Select instrument...</option>
                  {ALL_INSTRUMENTS.map(i => (
                    <option key={i} value={i}>{i.charAt(0).toUpperCase() + i.slice(1)}</option>
                  ))}
                </select>
                <FieldError message={fieldErrors.instrument} />
              </div>

              {/* Location */}
              <div style={{ marginBottom: 12 }}>
                <FieldLabel required>Location</FieldLabel>
                {isStudioDirector ? (
                  <div style={{ ...inputStyle, background: 'rgba(255,255,255,0.02)', color: '#A0A0C8', cursor: 'not-allowed' }}>
                    {activeLocations.find((l: any) => l.id === locationId)?.name?.replace(' Music Lessons', '') ?? 'Your Location'}
                  </div>
                ) : (
                  <select value={locationId} onChange={e => { setLocationId(e.target.value); setTeacherId(''); setFieldErrors(p => ({ ...p, locationId: '' })) }} style={{ ...inputStyle, cursor: 'pointer', borderColor: fieldErrors.locationId ? '#EF4444' : undefined }}>
                    <option value="">Select location...</option>
                    {activeLocations.map((l: any) => (
                      <option key={l.id} value={l.id}>{l.name.replace(' Music Lessons', '')}</option>
                    ))}
                  </select>
                )}
                <FieldError message={fieldErrors.locationId} />
              </div>

              {/* Teacher */}
              <div style={{ marginBottom: 12 }}>
                <FieldLabel>Teacher</FieldLabel>
                <select value={teacherId} onChange={e => setTeacherId(e.target.value)} style={{ ...inputStyle, cursor: 'pointer' }}>
                  <option value="">Select teacher (optional)...</option>
                  {locationTeachers.map((t: any) => (
                    <option key={t.id} value={t.id}>{t.first_name} {t.last_name}</option>
                  ))}
                </select>
              </div>

              {/* Sessions + Rate */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                <div>
                  <FieldLabel required>Sessions / Month</FieldLabel>
                  <input type="number" min={1} max={16} value={sessionsPerMonth} onChange={e => { setSessionsPerMonth(parseInt(e.target.value) || 0); setFieldErrors(p => ({ ...p, sessionsPerMonth: '' })) }} style={{ ...inputStyle, borderColor: fieldErrors.sessionsPerMonth ? '#EF4444' : undefined }} />
                  <FieldError message={fieldErrors.sessionsPerMonth} />
                </div>
                <div>
                  <FieldLabel required>Rate / Session ($)</FieldLabel>
                  <input type="number" min={0} step={0.01} value={ratePerSession} onChange={e => { setRatePerSession(parseFloat(e.target.value) || 0); setFieldErrors(p => ({ ...p, ratePerSession: '' })) }} style={{ ...inputStyle, borderColor: fieldErrors.ratePerSession ? '#EF4444' : undefined }} />
                  <FieldError message={fieldErrors.ratePerSession} />
                </div>
              </div>

              {/* Start Date */}
              <div style={{ marginBottom: 12 }}>
                <FieldLabel required>Start Date</FieldLabel>
                <input type="date" value={startDate} onChange={e => {
                  setStartDate(e.target.value)
                  setFieldErrors(p => ({ ...p, startDate: '' }))
                  if (e.target.value) {
                    const day = new Date(e.target.value).getDate()
                    setShowProrate(day > 1)
                    setProrateChoice(day > 1 ? null : null)
                  } else { setShowProrate(false) }
                }} style={inputStyle} />
                {showProrate && isDirectorPlus && (
                  <div style={{ marginTop: 10, padding: '12px 14px', borderRadius: 10, background: 'rgba(255,184,0,0.06)', border: '1px solid rgba(255,184,0,0.2)' }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#FFB800', marginBottom: 6 }}>Mid-month start</div>
                    <div style={{ fontSize: 11, color: '#9A96B4', marginBottom: 10, lineHeight: 1.5 }}>Prorate their first invoice?</div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button type="button" onClick={() => setProrateChoice('prorate')} style={{
                        flex: 1, padding: '8px 0', borderRadius: 8, fontSize: 11, fontWeight: 700, cursor: 'pointer',
                        background: prorateChoice === 'prorate' ? 'rgba(255,184,0,0.15)' : 'rgba(255,255,255,0.04)',
                        color: prorateChoice === 'prorate' ? '#FFB800' : '#8080A8',
                        border: `1px solid ${prorateChoice === 'prorate' ? 'rgba(255,184,0,0.35)' : 'rgba(255,255,255,0.08)'}`,
                      }}>Prorate</button>
                      <button type="button" onClick={() => setProrateChoice('full')} style={{
                        flex: 1, padding: '8px 0', borderRadius: 8, fontSize: 11, fontWeight: 700, cursor: 'pointer',
                        background: prorateChoice === 'full' ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.04)',
                        color: prorateChoice === 'full' ? '#E0E0F4' : '#8080A8',
                        border: `1px solid ${prorateChoice === 'full' ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.08)'}`,
                      }}>Full Rate</button>
                    </div>
                  </div>
                )}
              </div>

              {/* Notes */}
              {isDirectorPlus && (
                <div style={{ marginBottom: 16 }}>
                  <FieldLabel>Notes</FieldLabel>
                  <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="Internal notes..." style={{ ...inputStyle, resize: 'vertical' }} />
                </div>
              )}

              {/* ══════ FAMILY LINKING ══════ */}
              <div style={{ fontSize: 12, fontWeight: 700, color: '#6060A0', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10, paddingBottom: 6, borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                Link to a Family
              </div>

              {/* Mode toggle */}
              <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
                <button type="button" onClick={() => { setFamilyMode('search'); setError(null) }} style={{
                  flex: 1, padding: '9px', borderRadius: 10, fontSize: 12, fontWeight: 700, cursor: 'pointer',
                  background: familyMode === 'search' ? 'rgba(212,34,106,0.12)' : 'rgba(255,255,255,0.04)',
                  border: `1px solid ${familyMode === 'search' ? 'rgba(212,34,106,0.3)' : 'rgba(255,255,255,0.08)'}`,
                  color: familyMode === 'search' ? '#E8488A' : '#8080A8',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                }}>
                  <Search size={13} /> Search Existing
                </button>
                <button type="button" onClick={() => { setFamilyMode('create'); setError(null) }} style={{
                  flex: 1, padding: '9px', borderRadius: 10, fontSize: 12, fontWeight: 700, cursor: 'pointer',
                  background: familyMode === 'create' ? 'rgba(212,34,106,0.12)' : 'rgba(255,255,255,0.04)',
                  border: `1px solid ${familyMode === 'create' ? 'rgba(212,34,106,0.3)' : 'rgba(255,255,255,0.08)'}`,
                  color: familyMode === 'create' ? '#E8488A' : '#8080A8',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                }}>
                  <Plus size={13} /> Create New Family
                </button>
              </div>

              {familyMode === 'search' && (
                <>
                  <div style={{ position: 'relative', marginBottom: 10 }}>
                    <Search size={14} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: '#606088' }} />
                    <input
                      value={familySearchQuery}
                      onChange={e => { setFamilySearchQuery(e.target.value); setSelectedFamily(null) }}
                      placeholder="Search by parent name or email..."
                      style={{ ...inputStyle, paddingLeft: 36 }}
                    />
                  </div>
                  {familySearching && <div style={{ fontSize: 12, color: '#8080A8', marginBottom: 8 }}>Searching...</div>}
                  {familySearchResults.length > 0 && (
                    <div style={{ marginBottom: 8 }}>
                      {familySearchResults.map(f => (
                        <button key={f.id} type="button" onClick={() => setSelectedFamily(f)} style={{
                          display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '10px 12px',
                          borderRadius: 8, marginBottom: 3, cursor: 'pointer', textAlign: 'left',
                          background: selectedFamily?.id === f.id ? 'rgba(212,34,106,0.1)' : 'rgba(255,255,255,0.02)',
                          border: `1px solid ${selectedFamily?.id === f.id ? 'rgba(212,34,106,0.3)' : 'rgba(255,255,255,0.06)'}`,
                        }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 13, fontWeight: 700, color: '#E0E0F4' }}>{f.name}</div>
                            <div style={{ fontSize: 11, color: '#8080A8' }}>
                              {f.primary_contact_name || f.parent_name || '—'} &middot; {f.primary_email || '—'}
                            </div>
                          </div>
                          {selectedFamily?.id === f.id && <Check size={16} style={{ color: '#22C55E', flexShrink: 0 }} />}
                        </button>
                      ))}
                    </div>
                  )}
                  {selectedFamily && (
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px',
                      borderRadius: 8, background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)', marginBottom: 8,
                    }}>
                      <Check size={14} style={{ color: '#22C55E' }} />
                      <span style={{ fontSize: 12, color: '#22C55E', fontWeight: 600 }}>Linked to {selectedFamily.name}</span>
                    </div>
                  )}
                  {familySearchQuery.trim().length >= 2 && !familySearching && familySearchResults.length === 0 && (
                    <div style={{ fontSize: 12, color: '#8080A8', textAlign: 'center', padding: '8px 0', marginBottom: 8 }}>
                      No families found. Try different search terms or create a new family.
                    </div>
                  )}
                </>
              )}

              {familyMode === 'create' && (
                <div style={{ padding: 14, borderRadius: 10, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', marginBottom: 8 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
                    <div>
                      <FieldLabel required>Parent First Name</FieldLabel>
                      <input value={parentFirst} onChange={e => setParentFirst(e.target.value)} placeholder="First name" style={inputStyle} />
                    </div>
                    <div>
                      <FieldLabel required>Parent Last Name</FieldLabel>
                      <input value={parentLast} onChange={e => setParentLast(e.target.value)} placeholder="Last name" style={inputStyle} />
                    </div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
                    <div>
                      <FieldLabel required>Email</FieldLabel>
                      <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="parent@email.com" style={inputStyle} />
                    </div>
                    <div>
                      <FieldLabel required>Phone</FieldLabel>
                      <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="(555) 123-4567" style={inputStyle} />
                    </div>
                  </div>
                  <div>
                    <FieldLabel>Military?</FieldLabel>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button type="button" onClick={() => setIsMilitary(true)} style={{
                        padding: '6px 16px', borderRadius: 8, fontSize: 11, fontWeight: 700, cursor: 'pointer',
                        background: isMilitary ? 'rgba(34,197,94,0.12)' : 'rgba(255,255,255,0.04)',
                        border: `1px solid ${isMilitary ? 'rgba(34,197,94,0.3)' : 'rgba(255,255,255,0.08)'}`,
                        color: isMilitary ? '#22C55E' : '#8080A8',
                      }}>Yes</button>
                      <button type="button" onClick={() => setIsMilitary(false)} style={{
                        padding: '6px 16px', borderRadius: 8, fontSize: 11, fontWeight: 700, cursor: 'pointer',
                        background: !isMilitary ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.04)',
                        border: `1px solid ${!isMilitary ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.08)'}`,
                        color: !isMilitary ? '#E0E0F4' : '#8080A8',
                      }}>No</button>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}

          {activeTab === 'preferences' && (
            <>
              {/* Age Range */}
              <div style={{ marginBottom: 14 }}>
                <FieldLabel>Age Range</FieldLabel>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {AGE_RANGES.map(a => <Pill key={a} label={a} active={ageRange === a} onClick={() => setAgeRange(ageRange === a ? '' : a)} />)}
                </div>
              </div>

              {/* Additional Instruments */}
              <div style={{ marginBottom: 14 }}>
                <FieldLabel>Additional Instruments</FieldLabel>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {CORE_INSTRUMENTS.map(i => {
                    const label = i.charAt(0).toUpperCase() + i.slice(1)
                    return <Pill key={i} label={label} active={selectedInstruments.includes(label)} onClick={() => toggleInstrument(label)} />
                  })}
                </div>
                <div style={{ height: 1, background: 'rgba(255,255,255,0.06)', margin: '8px 0' }} />
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {OTHER_INSTRUMENTS.map(i => {
                    const label = i.charAt(0).toUpperCase() + i.slice(1)
                    return <Pill key={i} label={label} active={selectedInstruments.includes(label)} onClick={() => toggleInstrument(label)} />
                  })}
                </div>
              </div>

              {/* Experience */}
              <div style={{ marginBottom: 14 }}>
                <FieldLabel>Experience</FieldLabel>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {EXPERIENCE_OPTIONS.map(e => <Pill key={e.value} label={e.label} active={experience === e.value} onClick={() => setExperience(e.value)} />)}
                </div>
              </div>

              {/* Has Instrument */}
              <div style={{ marginBottom: 14 }}>
                <FieldLabel>Has Instrument?</FieldLabel>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {HAS_INSTRUMENT_OPTIONS.map(h => <Pill key={h.value} label={h.label} active={hasInstrument === h.value} onClick={() => setHasInstrument(h.value)} />)}
                </div>
              </div>

              {/* Preferred Days */}
              <div style={{ marginBottom: 14 }}>
                <FieldLabel>Preferred Days</FieldLabel>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {PREFERRED_DAYS.map(d => (
                    <label key={d} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#9090B0', cursor: 'pointer' }}>
                      <input type="checkbox" checked={preferredDays.includes(d)} onChange={() => toggleDay(d)} style={{ accentColor: '#D4226A' }} />
                      {d}
                    </label>
                  ))}
                </div>
              </div>

              {/* Bio / Goals */}
              <div style={{ marginBottom: 14 }}>
                <FieldLabel>Goals / Personality / Learning Style</FieldLabel>
                <textarea value={bio} onChange={e => setBio(e.target.value)} rows={3} placeholder="e.g. Wants to learn pop songs, shy but enthusiastic..." style={{ ...inputStyle, resize: 'vertical' }} />
              </div>

              {/* Source */}
              <div>
                <FieldLabel>How Did You Hear?</FieldLabel>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {SOURCE_OPTIONS.map(s => <Pill key={s.value} label={s.label} active={source === s.value} onClick={() => setSource(s.value)} />)}
                </div>
              </div>
            </>
          )}

          {/* Error + Save — always visible */}
          <div style={{ marginTop: 16 }}>
            {error && (
              <div style={{ padding: '10px 14px', borderRadius: 10, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', marginBottom: 12, fontSize: 12, color: '#EF4444' }}>
                {error}
              </div>
            )}

            {!hasFamilyLink && (
              <div style={{ padding: '8px 12px', borderRadius: 8, background: 'rgba(217,119,6,0.08)', border: '1px solid rgba(217,119,6,0.2)', marginBottom: 12, fontSize: 11, color: '#D97706' }}>
                A family must be linked before saving. {activeTab !== 'details' ? 'Switch to Student Details tab to ' : 'S'}earch for an existing family or create a new one{activeTab === 'details' ? ' above' : ''}.
              </div>
            )}

            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              style={{
                width: '100%', padding: '13px 24px', borderRadius: 12, border: 'none',
                background: !saving ? 'linear-gradient(135deg, #FFB800, #FF8C00)' : '#2A2844',
                color: !saving ? '#1A1A2E' : '#606088',
                fontSize: 14, fontWeight: 800,
                cursor: !saving ? 'pointer' : 'not-allowed',
                opacity: saving ? 0.7 : 1,
                boxShadow: !saving ? '0 4px 16px rgba(255,184,0,0.3)' : 'none',
                letterSpacing: '-0.01em',
              }}
            >
              {saving ? 'Adding Student...' : 'Add Student'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )

  return createPortal(modal, document.body)
}
