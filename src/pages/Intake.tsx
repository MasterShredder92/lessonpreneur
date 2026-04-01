import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import MusicLoader from '../components/shared/MusicLoader'
import { supabase } from '../lib/supabase'

const INSTRUMENTS = ['Piano','Guitar','Vocals','Drums','Banjo','Bass','Brass','Cello','Clarinet','Flute','Mandolin','Oboe','Percussion','Saxophone','Strings','Trombone','Trumpet','Ukulele','Viola','Violin','Voice','Woodwinds']
const DAYS = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday']
const TIME_PREFS = ['Morning (before 12pm)','Afternoon (12pm–5pm)','Evening (5pm–9pm)']
const SOURCES = ['Google Search','Facebook','Referral','Drive-by / Signage','Nextdoor','Other']

interface TenantInfo {
  id: string
  name: string
  primary_color: string
  accent_color: string
  logo_url: string | null
}

interface LocationOption {
  id: string
  name: string
}

export default function Intake() {
  const { slug } = useParams<{ slug: string }>()
  const [tenant, setTenant] = useState<TenantInfo | null>(null)
  const [locations, setLocations] = useState<LocationOption[]>([])
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [form, setForm] = useState({
    parent_first: '',
    parent_last: '',
    email: '',
    phone: '',
    student_first: '',
    age: '',
    instrument: '',
    location_id: '',
    preferred_days: [] as string[],
    preferred_times: '',
    goals: '',
    is_military: false,
    how_heard: '',
  })

  useEffect(() => {
    if (!slug) return
    (async () => {
      // Fetch tenant by slug — use service-level access (no auth needed for public form)
      const { data: t, error: tErr } = await supabase
        .from('tenants')
        .select('id, name, primary_color, accent_color, logo_url')
        .eq('slug', slug)
        .single()

      if (tErr || !t) {
        setNotFound(true)
        setLoading(false)
        return
      }

      setTenant(t as TenantInfo)

      // Fetch active locations for this tenant
      const { data: locs } = await supabase
        .from('locations')
        .select('id, name')
        .eq('tenant_id', t.id)
        .eq('is_active', true)
        .order('name')

      setLocations((locs ?? []) as LocationOption[])
      setLoading(false)
    })()
  }, [slug])

  const toggleDay = (day: string) => {
    setForm((f) => ({
      ...f,
      preferred_days: f.preferred_days.includes(day)
        ? f.preferred_days.filter((d) => d !== day)
        : [...f.preferred_days, day],
    }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!form.parent_first.trim() || !form.parent_last.trim()) { setError('Parent name is required.'); return }
    if (!form.email.trim()) { setError('Email is required.'); return }
    if (!form.phone.trim()) { setError('Phone number is required.'); return }
    if (!form.instrument) { setError('Please select an instrument.'); return }
    if (!form.location_id) { setError('Please select a location.'); return }

    setSubmitting(true)

    try {
      const { error: insertErr } = await supabase.from('leads').insert({
        tenant_id: tenant!.id,
        location_id: form.location_id,
        first_name: form.student_first.trim() || form.parent_first.trim(),
        last_name: form.parent_last.trim(),
        parent_name: `${form.parent_first.trim()} ${form.parent_last.trim()}`,
        email: form.email.trim(),
        phone: form.phone.trim(),
        instrument: form.instrument.toLowerCase(),
        age: form.age.trim() || null,
        goals: form.goals.trim() || null,
        preferred_days: form.preferred_days.length > 0 ? form.preferred_days.map((d) => d.toLowerCase()) : null,
        preferred_times: form.preferred_times || null,
        stage: 'inquiry' as const,
        source: form.how_heard || null,
        how_heard: form.how_heard || null,
        is_military: form.is_military,
      })

      if (insertErr) throw insertErr

      // TODO: Wire up n8n webhook for new lead notifications

      setSubmitted(true)
    } catch (err: any) {
      setError(err.message ?? 'Something went wrong. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="intake-page">
        <div className="intake-loading"><MusicLoader /></div>
      </div>
    )
  }

  if (notFound) {
    return (
      <div className="intake-page">
        <div className="intake-card" style={{ textAlign: 'center', padding: '48px 24px' }}>
          <h1 style={{ fontSize: '24px', marginBottom: '8px' }}>School Not Found</h1>
          <p style={{ color: '#8A8AA0' }}>The link you followed doesn't match any registered school.</p>
        </div>
      </div>
    )
  }

  const brandColor = tenant?.primary_color ?? '#D4226A'

  if (submitted) {
    return (
      <div className="intake-page">
        <div className="intake-card" style={{ textAlign: 'center', padding: '48px 24px' }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>&#10003;</div>
          <h1 style={{ fontSize: '24px', marginBottom: '12px', color: brandColor }}>
            Thanks {form.parent_first}!
          </h1>
          <p style={{ color: '#8A8AA0', fontSize: '15px', lineHeight: 1.6 }}>
            We'll be in touch within 24 hours to get {form.student_first || 'your student'} started
            with {form.instrument.toLowerCase()} lessons.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="intake-page">
      <div className="intake-card">
        <div className="intake-header">
          {tenant?.logo_url && <img src={tenant.logo_url} alt="" className="intake-logo" />}
          <h1 className="intake-title" style={{ color: brandColor }}>{tenant?.name}</h1>
          <p className="intake-subtitle">Start your music journey — fill out the form below and we'll get you scheduled.</p>
        </div>

        <form onSubmit={handleSubmit} className="intake-form">
          <fieldset className="intake-fieldset">
            <legend>Parent / Guardian</legend>
            <div className="intake-row">
              <div className="intake-field">
                <label>First Name *</label>
                <input value={form.parent_first} onChange={(e) => setForm({ ...form, parent_first: e.target.value })} placeholder="First name" />
              </div>
              <div className="intake-field">
                <label>Last Name *</label>
                <input value={form.parent_last} onChange={(e) => setForm({ ...form, parent_last: e.target.value })} placeholder="Last name" />
              </div>
            </div>
            <div className="intake-row">
              <div className="intake-field">
                <label>Email *</label>
                <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="you@email.com" />
              </div>
              <div className="intake-field">
                <label>Phone *</label>
                <input type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="(402) 555-0000" />
              </div>
            </div>
          </fieldset>

          <fieldset className="intake-fieldset">
            <legend>Student Info</legend>
            <div className="intake-row">
              <div className="intake-field">
                <label>Student First Name</label>
                <input value={form.student_first} onChange={(e) => setForm({ ...form, student_first: e.target.value })} placeholder="If different from parent" />
              </div>
              <div className="intake-field">
                <label>Student Age</label>
                <input value={form.age} onChange={(e) => setForm({ ...form, age: e.target.value })} placeholder="e.g. 8, teen, adult" />
              </div>
            </div>
            <div className="intake-row">
              <div className="intake-field">
                <label>Instrument *</label>
                <select value={form.instrument} onChange={(e) => setForm({ ...form, instrument: e.target.value })}>
                  <option value="">Select an instrument...</option>
                  {INSTRUMENTS.map((i) => <option key={i} value={i}>{i}</option>)}
                </select>
              </div>
              <div className="intake-field">
                <label>Preferred Location *</label>
                <select value={form.location_id} onChange={(e) => setForm({ ...form, location_id: e.target.value })}>
                  <option value="">Select a location...</option>
                  {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
              </div>
            </div>
          </fieldset>

          <fieldset className="intake-fieldset">
            <legend>Schedule Preference</legend>
            <div className="intake-field">
              <label>What days work best?</label>
              <div className="intake-day-grid">
                {DAYS.map((d) => (
                  <button
                    key={d}
                    type="button"
                    className={`intake-day-btn ${form.preferred_days.includes(d) ? 'selected' : ''}`}
                    onClick={() => toggleDay(d)}
                    style={form.preferred_days.includes(d) ? { background: brandColor + '22', borderColor: brandColor, color: brandColor } : {}}
                  >
                    {d.substring(0, 3)}
                  </button>
                ))}
              </div>
            </div>
            <div className="intake-field">
              <label>What time of day works best?</label>
              <select value={form.preferred_times} onChange={(e) => setForm({ ...form, preferred_times: e.target.value })}>
                <option value="">No preference</option>
                {TIME_PREFS.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          </fieldset>

          <div className="intake-field">
            <label>What are your goals for lessons?</label>
            <textarea value={form.goals} onChange={(e) => setForm({ ...form, goals: e.target.value })} rows={3} placeholder="Just for fun, preparing for school band, learning a new skill..." />
          </div>

          <div className="intake-row">
            <label className="intake-checkbox">
              <input type="checkbox" checked={form.is_military} onChange={(e) => setForm({ ...form, is_military: e.target.checked })} />
              <span>Military family</span>
            </label>
          </div>

          <div className="intake-field">
            <label>How did you hear about us?</label>
            <select value={form.how_heard} onChange={(e) => setForm({ ...form, how_heard: e.target.value })}>
              <option value="">Select...</option>
              {SOURCES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>

          {error && <div className="intake-error">{error}</div>}

          <button
            type="submit"
            className="intake-submit"
            disabled={submitting}
            style={{ background: brandColor }}
          >
            {submitting ? 'Submitting...' : 'Get Started'}
          </button>
        </form>
      </div>
    </div>
  )
}
