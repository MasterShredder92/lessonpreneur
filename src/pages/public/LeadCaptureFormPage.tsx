import { useState, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'

/* ═══════════════════════════════════════════════════════
   /get-started — LEAD CAPTURE FORM
   5 questions. Tight. Fast. Saves per-field on blur.
   ═══════════════════════════════════════════════════════ */

const STUDENT_OPTIONS = ['Under 20', '20-50', '51-100', '101-200', '200+']
const TEACHER_OPTIONS = ['Just me', '2-3', '4-6', '7-10', '10+']
const LOCATION_OPTIONS = ['1', '2-3', '4+']
const SOFTWARE_OPTIONS = ['Square', 'Spreadsheets', 'Nothing', 'Other software']
const PAIN_OPTIONS = [
  'Scheduling chaos',
  'Missing payments',
  'Lead follow-up',
  'Teacher coordination',
  'No visibility into numbers',
  'All of it',
]
const PLAN_OPTIONS = [
  { key: 'teacher', label: 'Teacher $197' },
  { key: 'school', label: 'School $497' },
  { key: 'multi', label: 'Multi $997' },
]

function teacherCountToPlan(tc: string): string {
  if (tc === 'Just me') return 'teacher'
  if (tc === '2-3' || tc === '4-6') return 'school'
  return 'multi'
}

function studentCountToNumber(s: string): number | undefined {
  const map: Record<string, number> = { 'Under 20': 15, '20-50': 35, '51-100': 75, '101-200': 150, '200+': 250 }
  return map[s]
}

function teacherCountToNumber(s: string): number | undefined {
  const map: Record<string, number> = { 'Just me': 1, '2-3': 3, '4-6': 5, '7-10': 8, '10+': 12 }
  return map[s]
}

function locationCountToNumber(s: string): number | undefined {
  const map: Record<string, number> = { '1': 1, '2-3': 3, '4+': 5 }
  return map[s]
}

export default function LeadCaptureFormPage() {
  const navigate = useNavigate()
  const prospectId = useRef<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Form state
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [studioName, setStudioName] = useState('')
  const [studentCount, setStudentCount] = useState('')
  const [teacherCount, setTeacherCount] = useState('')
  const [locationCount, setLocationCount] = useState('')
  const [currentSoftware, setCurrentSoftware] = useState('')
  const [painPoints, setPainPoints] = useState<string[]>([])
  const [planSelected, setPlanSelected] = useState('')

  // Auto-select plan when teacher count changes
  const handleTeacherCount = (val: string) => {
    setTeacherCount(val)
    if (!planSelected) setPlanSelected(teacherCountToPlan(val))
    silentSave({ teacher_count: teacherCountToNumber(val), plan_selected: planSelected || teacherCountToPlan(val) })
  }

  // Silent upsert to lp_prospects on blur / pill select
  const silentSave = useCallback(async (fields: Record<string, any>) => {
    const currentEmail = fields.email ?? email
    if (!currentEmail) return // need email as key

    try {
      const payload: Record<string, any> = {
        email: currentEmail.trim().toLowerCase(),
        ...fields,
        updated_at: new Date().toISOString(),
      }
      // Remove undefined values
      Object.keys(payload).forEach(k => payload[k] === undefined && delete payload[k])

      if (prospectId.current) {
        await supabase.from('lp_prospects').update(payload).eq('id', prospectId.current)
      } else {
        const { data } = await supabase.from('lp_prospects').insert(payload).select('id').single()
        if (data?.id) prospectId.current = data.id
      }
    } catch {
      // Silent — don't interrupt user flow for per-field saves
    }
  }, [email])

  const handleSubmit = async () => {
    if (!firstName.trim() || !email.trim()) {
      setError('First name and email are required.')
      return
    }
    setError(null)
    setSubmitting(true)

    try {
      const payload = {
        first_name: firstName.trim(),
        last_name: lastName.trim() || null,
        email: email.trim().toLowerCase(),
        phone: phone.trim() || null,
        studio_name: studioName.trim() || null,
        student_count: studentCountToNumber(studentCount) ?? null,
        teacher_count: teacherCountToNumber(teacherCount) ?? null,
        location_count: locationCountToNumber(locationCount) ?? null,
        current_software: currentSoftware || null,
        biggest_pain_point: painPoints.length ? painPoints.join(', ') : null,
        plan_selected: planSelected || null,
        updated_at: new Date().toISOString(),
      }

      if (prospectId.current) {
        await supabase.from('lp_prospects').update(payload).eq('id', prospectId.current)
      } else {
        const { data, error: insertErr } = await supabase.from('lp_prospects').insert(payload).select('id').single()
        if (insertErr) throw insertErr
        if (data?.id) prospectId.current = data.id
      }

      // Store in session for /trial page
      sessionStorage.setItem('lp_prospect', JSON.stringify({
        id: prospectId.current,
        first_name: firstName.trim(),
        studio_name: studioName.trim(),
        student_count: studentCount,
        teacher_count: teacherCount,
        location_count: locationCount,
        plan_selected: planSelected,
      }))

      navigate('/trial')
    } catch (err: any) {
      setError(err?.message || 'Something went wrong. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  const togglePain = (p: string) => {
    const next = painPoints.includes(p) ? painPoints.filter(x => x !== p) : [...painPoints, p]
    setPainPoints(next)
    silentSave({ biggest_pain_point: next.join(', ') })
  }

  return (
    <div className="lcf">
      <style>{styles}</style>

      {/* Progress bar */}
      <div className="lcf-progress">
        <div className="lcf-progress-bar">
          <div className="lcf-progress-fill" style={{ width: '50%' }} />
        </div>
        <span className="lcf-progress-label">Step 1 of 2</span>
      </div>

      <div className="lcf-container">
        <h1 className="lcf-title">Tell us about your studio</h1>
        <p className="lcf-subtitle">Takes 90 seconds. We use this to personalize your 60-day trial.</p>

        {/* Contact fields */}
        <div className="lcf-row">
          <div className="lcf-field">
            <label className="form-label">First Name *</label>
            <input
              className="form-input"
              value={firstName}
              onChange={e => setFirstName(e.target.value)}
              onBlur={() => firstName && silentSave({ first_name: firstName.trim() })}
              placeholder="First name"
            />
          </div>
          <div className="lcf-field">
            <label className="form-label">Last Name</label>
            <input
              className="form-input"
              value={lastName}
              onChange={e => setLastName(e.target.value)}
              onBlur={() => silentSave({ last_name: lastName.trim() || null })}
              placeholder="Last name"
            />
          </div>
        </div>

        <div className="lcf-field">
          <label className="form-label">Email *</label>
          <input
            className="form-input"
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            onBlur={() => email && silentSave({ email: email.trim().toLowerCase(), first_name: firstName.trim() || 'Unknown' })}
            placeholder="you@yourstudio.com"
          />
        </div>

        <div className="lcf-field">
          <label className="form-label">Phone</label>
          <input
            className="form-input"
            type="tel"
            value={phone}
            onChange={e => setPhone(e.target.value)}
            onBlur={() => silentSave({ phone: phone.trim() || null })}
            placeholder="(555) 123-4567"
          />
        </div>

        <div className="lcf-field">
          <label className="form-label">Studio or Business Name</label>
          <input
            className="form-input"
            value={studioName}
            onChange={e => setStudioName(e.target.value)}
            onBlur={() => silentSave({ studio_name: studioName.trim() || null })}
            placeholder="Your studio name"
          />
        </div>

        {/* Questionnaire */}
        <div className="lcf-divider" />
        <h2 className="lcf-q-heading">A few quick questions:</h2>

        <PillQuestion
          label="How many active students do you currently have?"
          options={STUDENT_OPTIONS}
          value={studentCount}
          onSelect={v => { setStudentCount(v); silentSave({ student_count: studentCountToNumber(v) }) }}
        />

        <PillQuestion
          label="How many teachers are on your roster?"
          options={TEACHER_OPTIONS}
          value={teacherCount}
          onSelect={handleTeacherCount}
        />

        <PillQuestion
          label="How many locations?"
          options={LOCATION_OPTIONS}
          value={locationCount}
          onSelect={v => { setLocationCount(v); silentSave({ location_count: locationCountToNumber(v) }) }}
        />

        <PillQuestion
          label="What software do you currently use?"
          options={SOFTWARE_OPTIONS}
          value={currentSoftware}
          onSelect={v => { setCurrentSoftware(v); silentSave({ current_software: v }) }}
        />

        <div className="lcf-field">
          <label className="form-label">What's your biggest operational headache?</label>
          <p className="lcf-hint">Select all that apply</p>
          <div className="lcf-pills">
            {PAIN_OPTIONS.map(p => (
              <button
                key={p}
                type="button"
                className={`lcf-pill${painPoints.includes(p) ? ' lcf-pill-active' : ''}`}
                onClick={() => togglePain(p)}
              >
                {p}
              </button>
            ))}
          </div>
        </div>

        {/* Plan selection */}
        <div className="lcf-divider" />
        <div className="lcf-field">
          <label className="form-label">Which plan fits your studio?</label>
          <div className="lcf-pills">
            {PLAN_OPTIONS.map(p => (
              <button
                key={p.key}
                type="button"
                className={`lcf-pill lcf-pill-plan${planSelected === p.key ? ' lcf-pill-active' : ''}`}
                onClick={() => { setPlanSelected(p.key); silentSave({ plan_selected: p.key }) }}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {error && <div className="lcf-error">{error}</div>}

        <button
          className="lcf-submit"
          onClick={handleSubmit}
          disabled={submitting}
        >
          {submitting ? 'Saving...' : 'Continue to Start Your 60-Day Trial →'}
        </button>
      </div>
    </div>
  )
}

function PillQuestion({ label, options, value, onSelect }: {
  label: string
  options: string[]
  value: string
  onSelect: (v: string) => void
}) {
  return (
    <div className="lcf-field">
      <label className="form-label">{label}</label>
      <div className="lcf-pills">
        {options.map(o => (
          <button
            key={o}
            type="button"
            className={`lcf-pill${value === o ? ' lcf-pill-active' : ''}`}
            onClick={() => onSelect(o)}
          >
            {o}
          </button>
        ))}
      </div>
    </div>
  )
}

const styles = `
.lcf {
  min-height: 100vh;
  background: #020209;
  color: #fff;
  font-family: 'Plus Jakarta Sans', system-ui, sans-serif;
}

/* Progress */
.lcf-progress {
  padding: 20px 24px 0;
  max-width: 600px;
  margin: 0 auto;
}
.lcf-progress-bar {
  height: 4px;
  background: rgba(255,255,255,0.08);
  border-radius: 4px;
  overflow: hidden;
}
.lcf-progress-fill {
  height: 100%;
  background: linear-gradient(135deg, #D4226A, #FF5500);
  border-radius: 4px;
  transition: width 300ms ease;
}
.lcf-progress-label {
  display: block;
  text-align: center;
  font-size: 11px;
  color: #6868A0;
  font-weight: 600;
  margin-top: 8px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

/* Container */
.lcf-container {
  max-width: 560px;
  margin: 0 auto;
  padding: 36px 24px 80px;
}
.lcf-title {
  font-size: clamp(24px, 4.5vw, 32px);
  font-weight: 900;
  letter-spacing: -0.02em;
  margin: 0 0 8px;
}
.lcf-subtitle {
  font-size: 14px;
  color: #A0A0C8;
  margin: 0 0 32px;
}

/* Fields */
.lcf-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}
@media (max-width: 480px) {
  .lcf-row { grid-template-columns: 1fr; }
}
.lcf-field {
  margin-bottom: 20px;
}
.lcf-divider {
  height: 1px;
  background: rgba(255,255,255,0.06);
  margin: 28px 0;
}
.lcf-q-heading {
  font-size: 18px;
  font-weight: 800;
  margin: 0 0 24px;
}
.lcf-hint {
  font-size: 11px;
  color: #6868A0;
  margin: -2px 0 8px;
}

/* Pills */
.lcf-pills {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.lcf-pill {
  padding: 8px 16px;
  border-radius: 999px;
  border: 1px solid rgba(255,255,255,0.12);
  background: rgba(255,255,255,0.04);
  color: #A0A0C8;
  font-family: 'Plus Jakarta Sans', system-ui, sans-serif;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 140ms ease;
  white-space: nowrap;
}
.lcf-pill:hover {
  border-color: rgba(212,34,106,0.3);
  color: #E8E8FC;
  background: rgba(212,34,106,0.06);
}
.lcf-pill-active {
  border-color: rgba(212,34,106,0.5) !important;
  background: rgba(212,34,106,0.12) !important;
  color: #E8488A !important;
  box-shadow: 0 0 12px rgba(212,34,106,0.15);
}
.lcf-pill-plan {
  padding: 10px 20px;
  font-size: 14px;
}

/* Error */
.lcf-error {
  background: rgba(239,68,68,0.08);
  border: 1px solid rgba(239,68,68,0.2);
  border-radius: 11px;
  padding: 10px 14px;
  font-size: 13px;
  color: #EF4444;
  margin-bottom: 16px;
}

/* Submit */
.lcf-submit {
  width: 100%;
  padding: 16px;
  border: none;
  border-radius: 14px;
  background: #D4226A;
  color: white;
  font-family: 'Plus Jakarta Sans', system-ui, sans-serif;
  font-size: 16px;
  font-weight: 800;
  cursor: pointer;
  transition: all 140ms ease;
  margin-top: 8px;
}
.lcf-submit:hover {
  opacity: 0.88;
  transform: translateY(-1px);
  box-shadow: 0 6px 22px rgba(212,34,106,0.4);
}
.lcf-submit:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  transform: none;
  box-shadow: none;
}
`
