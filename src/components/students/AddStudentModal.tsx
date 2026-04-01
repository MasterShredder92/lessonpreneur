import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useAuthContext } from '../../app/AuthContext'
import { useLocations } from '../../hooks/useLocations'
import { useCreateStudentWithFamily, useFamilyByEmail } from '../../hooks/useStudentFamily'
import { supabase, getCurrentBillingCycleId } from '../../lib/supabase'
import { toast } from '../shared/Toast'
import { CORE_INSTRUMENTS, OTHER_INSTRUMENTS } from '../../lib/constants'

interface AddStudentModalProps {
  onClose: () => void
}

const AGE_RANGES = ['Under 5', '5-10', '11-17', '18-25', '26 or older']
const EXPERIENCE_OPTIONS = ['None', '1-2 years', '2-4 years', '4+ years']
const HAS_INSTRUMENT_OPTIONS = ['Yes', 'No', 'Need Help Purchasing', 'N/A']
const PREFERRED_DAYS = [
  'Monday 3:30-9p',
  'Tuesday 3:30-9p',
  'Wednesday 3:30-9p',
  'Thursday 3:30-9p',
  'Saturday 10am-3p',
  'Any of These Work',
  'None of These Work',
]
const SOURCE_OPTIONS = ['Facebook/Instagram', 'Google', 'Signage/Driving By', 'Referral', 'Other']

const DIRECTOR_ROLES = ['owner', 'admin', 'company_director', 'studio_director']

type TabKey = 'details' | 'preferences'

function Pill({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: '6px 16px',
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 600,
        cursor: 'pointer',
        transition: 'all 140ms ease',
        background: active ? 'rgba(212,34,106,0.12)' : 'rgba(255,255,255,0.04)',
        border: `1px solid ${active ? 'rgba(212,34,106,0.35)' : 'rgba(255,255,255,0.08)'}`,
        color: active ? '#E8488A' : '#585878',
        minWidth: 90,
        textAlign: 'center' as const,
      }}
    >
      {label}
    </button>
  )
}

function TabPill({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: '8px 22px',
        borderRadius: 999,
        fontSize: 13,
        fontWeight: 700,
        cursor: 'pointer',
        transition: 'all 180ms ease',
        background: active
          ? 'linear-gradient(135deg, #D4226A, #E8488A)'
          : 'transparent',
        border: active ? 'none' : '1px solid rgba(255,255,255,0.08)',
        color: active ? '#fff' : '#585878',
        letterSpacing: '-0.01em',
      }}
    >
      {label}
    </button>
  )
}

function FieldLabel({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <label style={{ fontSize: 11.5, fontWeight: 600, color: '#9090B0', marginBottom: 5, display: 'block' }}>
      {children}{required && <span style={{ color: '#E8488A' }}> *</span>}
    </label>
  )
}

export default function AddStudentModal({ onClose }: AddStudentModalProps) {
  const { tenantId, role, profile } = useAuthContext()
  const { data: locations } = useLocations()
  const createMutation = useCreateStudentWithFamily()

  const [activeTab, setActiveTab] = useState<TabKey>('details')

  // Student fields
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')

  // Family fields
  const [parentFirst, setParentFirst] = useState('')
  const [parentLast, setParentLast] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [isMilitary, setIsMilitary] = useState(false)
  const [familyLinked, setFamilyLinked] = useState(false)
  const [accountName, setAccountName] = useState('')

  // Student detail fields
  const [ageRange, setAgeRange] = useState('')
  const [selectedInstruments, setSelectedInstruments] = useState<string[]>([])
  const [experience, setExperience] = useState('')
  const [hasInstrument, setHasInstrument] = useState('')

  // Preference fields
  const [preferredLocation, setPreferredLocation] = useState('')
  const [additionalLocations, setAdditionalLocations] = useState<string[]>([])
  const [preferredDays, setPreferredDays] = useState<string[]>([])
  const [bio, setBio] = useState('')
  const [source, setSource] = useState('')

  // Admin fields
  const [notes, setNotes] = useState('')
  const [startDate, setStartDate] = useState('')
  const [showProrate, setShowProrate] = useState(false)
  const [prorateChoice, setProrateChoice] = useState<'prorate' | 'full' | null>(null)

  const [error, setError] = useState<string | null>(null)

  // Family lookup
  const { data: existingFamily } = useFamilyByEmail(email)

  const isDirectorPlus = DIRECTOR_ROLES.includes(role ?? '')

  useEffect(() => {
    if (existingFamily) {
      setFamilyLinked(true)
      if (existingFamily.primary_phone) setPhone(existingFamily.primary_phone)
      if (existingFamily.parent_name) {
        const parts = existingFamily.parent_name.trim().split(/\s+/)
        if (parts.length >= 2) {
          setParentFirst(parts[0])
          setParentLast(parts.slice(1).join(' '))
        } else {
          setParentFirst(parts[0])
        }
      }
      if (existingFamily.is_military) setIsMilitary(existingFamily.is_military)
    } else {
      setFamilyLinked(false)
    }
  }, [existingFamily])

  // Auto-suggest account name from student last name (only when creating new family)
  const [accountNameTouched, setAccountNameTouched] = useState(false)
  useEffect(() => {
    if (!familyLinked && !accountNameTouched && lastName.trim()) {
      setAccountName(`${lastName.trim()} Family`)
    }
  }, [lastName, familyLinked, accountNameTouched])

  const toggleInstrument = (inst: string) => {
    setSelectedInstruments((prev) =>
      prev.includes(inst) ? prev.filter((i) => i !== inst) : [...prev, inst]
    )
  }

  const toggleDay = (day: string) => {
    setPreferredDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]
    )
  }

  const toggleAdditionalLocation = (locId: string) => {
    setAdditionalLocations((prev) =>
      prev.includes(locId) ? prev.filter((id) => id !== locId) : [...prev, locId]
    )
  }

  const handleSave = async () => {
    setError(null)

    if (!firstName.trim()) { setError('Student first name is required.'); return }
    if (!lastName.trim()) { setError('Student last name is required.'); return }
    if (!parentFirst.trim()) { setError('Parent/guardian first name is required.'); return }
    if (!email.trim()) { setError('Email is required.'); return }

    const parentName = `${parentFirst.trim()} ${parentLast.trim()}`.trim()

    // Stamp notes with author if present
    let stampedNotes: string | null = null
    if (notes.trim() && isDirectorPlus && profile) {
      const now = new Date()
      const mm = String(now.getMonth() + 1).padStart(2, '0')
      const dd = String(now.getDate()).padStart(2, '0')
      stampedNotes = `[${profile.first_name} on ${mm}/${dd}]: ${notes.trim()}`
    }

    try {
      const result = await createMutation.mutateAsync({
        tenant_id: tenantId!,
        family_name: accountName.trim() || undefined,
        parent_name: parentName,
        email: email.trim().toLowerCase(),
        phone: phone.trim(),
        is_military: isMilitary,
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        age: ageRange || null,
        instrument: selectedInstruments.map((i) => i.toLowerCase()).join(', ') || 'piano',
        experience: experience || null,
        has_instrument: hasInstrument || null,
        preferred_days: preferredDays.length > 0 ? preferredDays : null,
        bio: bio.trim() || null,
        source: source || null,
        location_id: preferredLocation || (locations?.[0]?.id ?? ''),
        additional_location_ids: additionalLocations,
        notes: stampedNotes,
        start_date: startDate || null,
      })

      // Handle prorate if mid-month start
      if (prorateChoice === 'prorate' && startDate && result) {
        const startDay = new Date(startDate).getDate()
        if (startDay > 1) {
          const sessionsPerMonth = 4
          const ratePerSession = 4500
          const daysInMonth = new Date(new Date(startDate).getFullYear(), new Date(startDate).getMonth() + 1, 0).getDate()
          const sessionsMissed = Math.round(((startDay - 1) / daysInMonth) * sessionsPerMonth)
          if (sessionsMissed > 0) {
            const creditCents = sessionsMissed * ratePerSession
            const cycleId = await getCurrentBillingCycleId(tenantId!)
            await supabase.from('billing_adjustments').insert({
              tenant_id: tenantId!,
              family_id: result.family_id ?? result.familyId,
              student_id: result.student_id ?? result.studentId ?? result.id,
              adjustment_type: 'prorate_new',
              amount_cents: creditCents,
              reason: `Prorated first month — started ${new Date(startDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} (${sessionsMissed} sessions credited)`,
              status: 'applied',
              applied: true,
              billing_cycle_id: cycleId,
            })
          }
        }
      }

      toast('Student added successfully', 'success')
      onClose()
    } catch (err: any) {
      setError(err.message ?? 'Failed to add student.')
    }
  }

  const activeLocations = (locations ?? []).filter((l: any) => l.is_active !== false)

  const modal = (
    <div
      className="modal-overlay"
      onClick={onClose}
      style={{ zIndex: 99999 }}
    >
      <div
        className="location-card"
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: 560,
          width: '95vw',
          margin: 'auto',
          padding: 0,
          cursor: 'default',
          position: 'relative',
        }}
      >
        <div className="loc-card-edge" style={{
          background: 'linear-gradient(180deg, #D4226A, #E8488A)',
          boxShadow: '0 0 14px rgba(212,34,106,0.5)',
        }} />
        <div className="loc-card-glow" style={{
          background: 'radial-gradient(circle, rgba(212,34,106,0.08) 0%, transparent 70%)',
        }} />

        <div style={{ position: 'relative', zIndex: 1, padding: '24px 28px 28px' }}>
          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
            <h2 style={{ fontSize: 20, fontWeight: 800, letterSpacing: '-0.02em', margin: 0, color: '#E0E0F4' }}>Add Student</h2>
            <button
              type="button"
              className="btn-ghost"
              onClick={onClose}
              style={{ padding: '4px 10px', fontSize: 14 }}
            >
              &times;
            </button>
          </div>

          {/* Tab Pills */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
            <TabPill label="Student Details" active={activeTab === 'details'} onClick={() => setActiveTab('details')} />
            <TabPill label="Preferences" active={activeTab === 'preferences'} onClick={() => setActiveTab('preferences')} />
          </div>

          {/* TAB 1: Student Details */}
          {activeTab === 'details' && (
            <div>
              {/* Student Name */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                <div>
                  <FieldLabel required>Student First Name</FieldLabel>
                  <input
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    placeholder="First name"
                    className="filter-select"
                    style={{ width: '100%' }}
                  />
                </div>
                <div>
                  <FieldLabel required>Student Last Name</FieldLabel>
                  <input
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    placeholder="Last name"
                    className="filter-select"
                    style={{ width: '100%' }}
                  />
                </div>
              </div>

              {/* Parent Name */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                <div>
                  <FieldLabel required>Parent/Guardian First Name</FieldLabel>
                  <input
                    value={parentFirst}
                    onChange={(e) => setParentFirst(e.target.value)}
                    placeholder="First name"
                    className="filter-select"
                    style={{ width: '100%' }}
                  />
                </div>
                <div>
                  <FieldLabel>Parent/Guardian Last Name</FieldLabel>
                  <input
                    value={parentLast}
                    onChange={(e) => setParentLast(e.target.value)}
                    placeholder="Last name"
                    className="filter-select"
                    style={{ width: '100%' }}
                  />
                </div>
              </div>

              {/* Email + Phone */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                <div>
                  <FieldLabel required>Email</FieldLabel>
                  <input
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="parent@email.com"
                    type="email"
                    className="filter-select"
                    style={{ width: '100%' }}
                  />
                  {familyLinked && existingFamily && (
                    <div style={{
                      marginTop: 5, fontSize: 11, color: '#22C55E', fontWeight: 600,
                      display: 'flex', alignItems: 'center', gap: 4,
                    }}>
                      <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#22C55E', display: 'inline-block' }} />
                      Existing account found: {existingFamily.name}
                    </div>
                  )}
                </div>
                <div>
                  <FieldLabel>Phone Number</FieldLabel>
                  <input
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="(555) 123-4567"
                    className="filter-select"
                    style={{ width: '100%' }}
                  />
                </div>
              </div>

              {/* Account Name — only when creating new family */}
              {email.includes('@') && !familyLinked && (
                <div style={{ marginBottom: 12 }}>
                  <FieldLabel>Account Name</FieldLabel>
                  <input
                    value={accountName}
                    onChange={(e) => { setAccountName(e.target.value); setAccountNameTouched(true) }}
                    placeholder="e.g. Henderson / Rodriguez Family"
                    className="filter-select"
                    style={{ width: '100%' }}
                  />
                  <div style={{ fontSize: 10, color: '#8080A8', marginTop: 4 }}>
                    Internal billing account name. Use something your team will recognize.
                  </div>
                </div>
              )}

              {/* Military */}
              <div style={{ marginBottom: 14 }}>
                <FieldLabel>Military?</FieldLabel>
                <div style={{ display: 'flex', gap: 6 }}>
                  <Pill label="Yes" active={isMilitary} onClick={() => setIsMilitary(true)} />
                  <Pill label="No" active={!isMilitary} onClick={() => setIsMilitary(false)} />
                </div>
              </div>

              {/* Age Range */}
              <div style={{ marginBottom: 14 }}>
                <FieldLabel>Age Range</FieldLabel>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {AGE_RANGES.map((a) => (
                    <Pill key={a} label={a} active={ageRange === a} onClick={() => setAgeRange(ageRange === a ? '' : a)} />
                  ))}
                </div>
              </div>

              {/* Instrument — Core Four first, then others */}
              <div style={{ marginBottom: 14 }}>
                <FieldLabel>Instrument</FieldLabel>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {CORE_INSTRUMENTS.map((i) => {
                    const label = i.charAt(0).toUpperCase() + i.slice(1)
                    return <Pill key={i} label={label} active={selectedInstruments.includes(label)} onClick={() => toggleInstrument(label)} />
                  })}
                </div>
                <div style={{ height: 1, background: 'rgba(255,255,255,0.06)', margin: '8px 0' }} />
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {OTHER_INSTRUMENTS.map((i) => {
                    const label = i.charAt(0).toUpperCase() + i.slice(1)
                    return <Pill key={i} label={label} active={selectedInstruments.includes(label)} onClick={() => toggleInstrument(label)} />
                  })}
                </div>
              </div>

              {/* Experience */}
              <div style={{ marginBottom: 14 }}>
                <FieldLabel>Experience</FieldLabel>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {EXPERIENCE_OPTIONS.map((e) => (
                    <Pill key={e} label={e} active={experience === e} onClick={() => setExperience(experience === e ? '' : e)} />
                  ))}
                </div>
              </div>

              {/* Has Instrument */}
              <div>
                <FieldLabel>Has Instrument?</FieldLabel>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {HAS_INSTRUMENT_OPTIONS.map((h) => (
                    <Pill key={h} label={h} active={hasInstrument === h} onClick={() => setHasInstrument(hasInstrument === h ? '' : h)} />
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: Preferences */}
          {activeTab === 'preferences' && (
            <div>
              {/* Preferred Location */}
              <div style={{ marginBottom: 14 }}>
                <FieldLabel>Preferred Location</FieldLabel>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {activeLocations.map((l: any) => (
                    <Pill
                      key={l.id}
                      label={l.name.replace(' Music Lessons', '')}
                      active={preferredLocation === l.id}
                      onClick={() => setPreferredLocation(preferredLocation === l.id ? '' : l.id)}
                    />
                  ))}
                </div>
              </div>

              {/* Additional Locations */}
              <div style={{ marginBottom: 14 }}>
                <FieldLabel>Additional Locations</FieldLabel>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                  {activeLocations.filter((l: any) => l.id !== preferredLocation).map((l: any) => (
                    <label key={l.id} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#9090B0', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={additionalLocations.includes(l.id)}
                        onChange={() => toggleAdditionalLocation(l.id)}
                        style={{ accentColor: '#D4226A' }}
                      />
                      {l.name.replace(' Music Lessons', '')}
                    </label>
                  ))}
                </div>
              </div>

              {/* Preferred Days */}
              <div style={{ marginBottom: 14 }}>
                <FieldLabel>Preferred Days</FieldLabel>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {PREFERRED_DAYS.map((d) => (
                    <label key={d} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#9090B0', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={preferredDays.includes(d)}
                        onChange={() => toggleDay(d)}
                        style={{ accentColor: '#D4226A' }}
                      />
                      {d}
                    </label>
                  ))}
                </div>
              </div>

              {/* Goals / Personality / Learning Style */}
              <div style={{ marginBottom: 14 }}>
                <FieldLabel>Goals / Personality / Learning Style</FieldLabel>
                <textarea
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  rows={3}
                  placeholder="e.g. Wants to learn pop songs, shy but enthusiastic..."
                  style={{
                    width: '100%', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
                    borderRadius: 10, padding: '10px 14px', color: '#E0E0F4', fontSize: 13, resize: 'vertical',
                  }}
                />
              </div>

              {/* How Did You Hear */}
              <div>
                <FieldLabel>How Did You Hear?</FieldLabel>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {SOURCE_OPTIONS.map((s) => (
                    <Pill key={s} label={s} active={source === s} onClick={() => setSource(source === s ? '' : s)} />
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* BOTTOM — Always visible */}
          <div style={{ marginTop: 20 }}>
            {/* Start Date + Prorate */}
            {isDirectorPlus && (
              <div style={{ marginBottom: 16 }}>
                <FieldLabel>First Lesson Date</FieldLabel>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => {
                    setStartDate(e.target.value)
                    if (e.target.value) {
                      const day = new Date(e.target.value).getDate()
                      setShowProrate(day > 1)
                      setProrateChoice(day > 1 ? null : null)
                    } else {
                      setShowProrate(false)
                    }
                  }}
                  style={{
                    width: '100%', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
                    borderRadius: 10, padding: '10px 14px', color: '#E0E0F4', fontSize: 13,
                  }}
                />
                {showProrate && (
                  <div style={{ marginTop: 10, padding: '12px 14px', borderRadius: 10, background: 'rgba(255,184,0,0.06)', border: '1px solid rgba(255,184,0,0.2)' }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#FFB800', marginBottom: 6 }}>This student starts mid-month</div>
                    <div style={{ fontSize: 11, color: '#9A96B4', marginBottom: 10, lineHeight: 1.5 }}>Would you like to prorate their first invoice?</div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button type="button" onClick={() => setProrateChoice('prorate')} style={{
                        flex: 1, padding: '8px 0', borderRadius: 8, fontSize: 11, fontWeight: 700, cursor: 'pointer',
                        background: prorateChoice === 'prorate' ? 'rgba(255,184,0,0.15)' : 'rgba(255,255,255,0.04)',
                        color: prorateChoice === 'prorate' ? '#FFB800' : '#8080A8',
                        border: `1px solid ${prorateChoice === 'prorate' ? 'rgba(255,184,0,0.35)' : 'rgba(255,255,255,0.08)'}`,
                      }}>Prorate First Invoice</button>
                      <button type="button" onClick={() => setProrateChoice('full')} style={{
                        flex: 1, padding: '8px 0', borderRadius: 8, fontSize: 11, fontWeight: 700, cursor: 'pointer',
                        background: prorateChoice === 'full' ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.04)',
                        color: prorateChoice === 'full' ? '#E0E0F4' : '#8080A8',
                        border: `1px solid ${prorateChoice === 'full' ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.08)'}`,
                      }}>Charge Full Rate</button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Internal Notes — Director+ only */}
            {isDirectorPlus && (
              <div style={{ marginBottom: 16 }}>
                <FieldLabel>Internal Notes</FieldLabel>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                  placeholder="Director notes — visible to admin staff only"
                  style={{
                    width: '100%', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
                    borderRadius: 10, padding: '10px 14px', color: '#E0E0F4', fontSize: 13, resize: 'vertical',
                  }}
                />
              </div>
            )}

            {error && (
              <div className="form-error" style={{ marginBottom: 14 }}>{error}</div>
            )}

            {/* Save button — gold gradient */}
            <button
              type="button"
              onClick={handleSave}
              disabled={createMutation.isPending}
              style={{
                width: '100%',
                padding: '13px 24px',
                borderRadius: 12,
                border: 'none',
                background: 'linear-gradient(135deg, #FFB800, #FF8C00)',
                color: '#1A1A2E',
                fontSize: 14,
                fontWeight: 800,
                cursor: createMutation.isPending ? 'not-allowed' : 'pointer',
                opacity: createMutation.isPending ? 0.7 : 1,
                transition: 'all 140ms ease',
                boxShadow: '0 4px 16px rgba(255,184,0,0.3)',
                letterSpacing: '-0.01em',
              }}
            >
              {createMutation.isPending ? 'Adding Student...' : 'Add Student'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )

  return createPortal(modal, document.body)
}
