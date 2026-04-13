import { useState, useRef, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import PublicBrandBar from '../../components/landing/PublicBrandBar'

/* ═══════════════════════════════════════════════════════
   /get-started — LEAD CAPTURE FORM
   5 questions. Tight. Fast. Saves per-field on blur.
   Smart plan recommendation after all questions answered.
   ═══════════════════════════════════════════════════════ */

const STUDENT_OPTIONS = ['Under 20', '20-50', '51-100', '101-200', '200+']
const TEACHER_OPTIONS = ['Just me', '2-3', '4-6', '7-10', '10+']
const LOCATION_OPTIONS = ['1', '2-3', '4+']
const SOFTWARE_OPTIONS = ['My Music Staff', 'Jackrabbit', 'Opus One', 'Square', 'Spreadsheets', 'Pen & Paper', 'Combination of several', 'Nothing yet']
const PAIN_OPTIONS = [
  'Scheduling chaos',
  'Missing payments',
  'Lead follow-up',
  'Teacher coordination',
  'No visibility into numbers',
  'All of it',
]

const PLANS: Record<string, { name: string; price: string; tagline: string }> = {
  teacher: { name: 'Teacher', price: '$197/mo', tagline: 'Perfect for solo instructors building a professional studio.' },
  school: { name: 'School', price: '$497/mo', tagline: 'Built for studios with a teaching roster and real operations.' },
  multi: { name: 'Multi-Location', price: '$997/mo', tagline: 'For schools running multiple locations under one roof.' },
}

function recommendPlan(tc: string, lc: string): string {
  // Multi-Location: 10+ teachers OR 4+ locations
  if (tc === '10+' || lc === '4+') return 'multi'
  // School: 4-6 or 7-10 teachers OR 2-3 locations
  if (tc === '4-6' || tc === '7-10' || lc === '2-3') return 'school'
  // Teacher: Just me, OR 1 location with 2-3 teachers
  return 'teacher'
}

function recommendReason(tc: string, lc: string, plan: string): string {
  if (plan === 'multi') {
    if (tc === '10+') return `With 10+ teachers, you need cross-location scheduling and recruitment tools — Multi-Location is built for exactly this.`
    return `Multiple locations means you need unified dashboards and cross-location visibility — Multi-Location handles all of it.`
  }
  if (plan === 'school') {
    if (lc === '2-3') return `You've got ${tc} teachers across multiple locations — School plan gives you the multi-teacher management and financial dashboards you need.`
    return `With ${tc} teachers on your roster, you need payroll, lead pipeline, and retention tools — School plan is built for exactly this.`
  }
  return `As a solo instructor, the Teacher plan gives you everything you need to run a professional studio without the complexity.`
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
  const [showAllPlans, setShowAllPlans] = useState(false)

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
  const [planOverride, setPlanOverride] = useState('')

  // All 5 questions answered?
  const allAnswered = !!(studentCount && teacherCount && locationCount && currentSoftware && painPoints.length)

  // Smart recommendation
  const recommended = useMemo(() => {
    if (!teacherCount || !locationCount) return null
    return recommendPlan(teacherCount, locationCount)
  }, [teacherCount, locationCount])

  const planSelected = planOverride || recommended || ''

  // Silent upsert to lp_prospects on blur / pill select
  const silentSave = useCallback(async (fields: Record<string, any>) => {
    const currentEmail = fields.email ?? email
    if (!currentEmail) return

    try {
      const payload: Record<string, any> = {
        email: currentEmail.trim().toLowerCase(),
        ...fields,
        updated_at: new Date().toISOString(),
      }
      Object.keys(payload).forEach(k => payload[k] === undefined && delete payload[k])

      if (prospectId.current) {
        await supabase.from('lp_prospects').update(payload).eq('id', prospectId.current)
      } else {
        const { data } = await supabase.from('lp_prospects').insert(payload).select('id').single()
        if (data?.id) prospectId.current = data.id
      }
    } catch {
      // Silent
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

      <PublicBrandBar variant="funnel" />

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
          onSelect={v => { setTeacherCount(v); silentSave({ teacher_count: teacherCountToNumber(v) }) }}
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

        {/* Smart plan recommendation — appears after all 5 questions answered */}
        {allAnswered && recommended && (
          <>
            <div className="lcf-divider" />
            <div className="lcf-rec">
              <p className="lcf-rec-label">Based on your answers, here's the right plan for your studio:</p>
              <div className={`lcf-rec-card${planSelected === recommended && !planOverride ? ' lcf-rec-card-active' : ''}`} onClick={() => { setPlanOverride(''); silentSave({ plan_selected: recommended }) }}>
                <div className="lcf-rec-header">
                  <span className="lcf-rec-name">{PLANS[recommended].name}</span>
                  <span className="lcf-rec-price">{PLANS[recommended].price}</span>
                </div>
                <p className="lcf-rec-reason">{recommendReason(teacherCount, locationCount, recommended)}</p>
                <span className="lcf-rec-badge">Recommended for you</span>
              </div>

              {!showAllPlans ? (
                <button className="lcf-see-all" type="button" onClick={() => setShowAllPlans(true)}>
                  See all plans
                </button>
              ) : (
                <div className="lcf-all-plans">
                  {Object.entries(PLANS).filter(([k]) => k !== recommended).map(([key, plan]) => (
                    <div
                      key={key}
                      className={`lcf-alt-card${planOverride === key ? ' lcf-alt-card-active' : ''}`}
                      onClick={() => { setPlanOverride(key); silentSave({ plan_selected: key }) }}
                    >
                      <span className="lcf-alt-name">{plan.name}</span>
                      <span className="lcf-alt-price">{plan.price}</span>
                      <span className="lcf-alt-tag">{plan.tagline}</span>
                    </div>
                  ))}
                  <button className="lcf-see-all" type="button" onClick={() => { setShowAllPlans(false); setPlanOverride('') }}>
                    Use recommended plan
                  </button>
                </div>
              )}
            </div>
          </>
        )}

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

/* Recommendation */
.lcf-rec {
  animation: lcfFadeIn 350ms ease;
}
@keyframes lcfFadeIn {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}
.lcf-rec-label {
  font-size: 14px;
  font-weight: 600;
  color: #A0A0C8;
  margin: 0 0 12px;
}
.lcf-rec-card {
  background: rgba(212,34,106,0.06);
  border: 1px solid rgba(212,34,106,0.3);
  border-radius: 16px;
  padding: 20px;
  cursor: pointer;
  transition: all 180ms ease;
  position: relative;
}
.lcf-rec-card:hover {
  border-color: rgba(212,34,106,0.5);
}
.lcf-rec-card-active {
  border-color: rgba(212,34,106,0.5);
  box-shadow: 0 0 24px rgba(212,34,106,0.12);
}
.lcf-rec-header {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  margin-bottom: 8px;
}
.lcf-rec-name {
  font-size: 20px;
  font-weight: 800;
}
.lcf-rec-price {
  font-size: 20px;
  font-weight: 900;
  background: linear-gradient(135deg, #D4226A 0%, #FF5500 55%, #FFB800 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}
.lcf-rec-reason {
  font-size: 13px;
  color: #A0A0C8;
  line-height: 1.5;
  margin: 0 0 10px;
}
.lcf-rec-badge {
  display: inline-block;
  padding: 3px 10px;
  border-radius: 6px;
  background: rgba(34,197,94,0.1);
  border: 1px solid rgba(34,197,94,0.25);
  color: #22C55E;
  font-size: 11px;
  font-weight: 700;
}
.lcf-see-all {
  display: block;
  margin: 12px auto 0;
  background: none;
  border: none;
  color: #6868A0;
  font-family: 'Plus Jakarta Sans', system-ui, sans-serif;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: color 140ms ease;
}
.lcf-see-all:hover { color: #E8488A; }

/* Alternate plan cards */
.lcf-all-plans {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 12px;
  animation: lcfFadeIn 250ms ease;
}
.lcf-alt-card {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 8px;
  padding: 14px 16px;
  border-radius: 12px;
  border: 1px solid rgba(255,255,255,0.08);
  background: rgba(255,255,255,0.03);
  cursor: pointer;
  transition: all 140ms ease;
}
.lcf-alt-card:hover {
  border-color: rgba(212,34,106,0.25);
}
.lcf-alt-card-active {
  border-color: rgba(212,34,106,0.4) !important;
  background: rgba(212,34,106,0.06) !important;
}
.lcf-alt-name {
  font-size: 14px;
  font-weight: 700;
  color: #E8E8FC;
}
.lcf-alt-price {
  font-size: 14px;
  font-weight: 800;
  color: #D4226A;
}
.lcf-alt-tag {
  width: 100%;
  font-size: 11px;
  color: #6868A0;
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
