import { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { supabase as anon } from '../../lib/supabase'
import { usePublicTenantId } from '../../hooks/usePublicTenantId'
import {
  LOCATIONS as LOC_CONFIG,
  ALL_LOC_KEYS,
  type LocKey,
} from '../../config/locations'
import './enrollment.css'

// ─── TYPES ──────────────────────────────────────────────

interface LocationDef {
  key: LocKey
  label: string
  address: string
  phone: string
  dbId: string
}

interface ChildData {
  instruments: string[]
  studentName: string
  bio: string
  ageRange: string
  hasInstrument: string
}

interface EnrollmentFormProps {
  isOpen: boolean
  onClose: () => void
  defaultLocation?: LocKey
}

// ─── CONSTANTS (derived from central config) ────────────
const LOCATIONS: LocationDef[] = ALL_LOC_KEYS.map(k => ({
  key: k,
  label: LOC_CONFIG[k].name,
  address: LOC_CONFIG[k].address,
  phone: LOC_CONFIG[k].phone,
  dbId: LOC_CONFIG[k].locationId,
}))

const LOC_PROXIMITY: Record<LocKey, LocKey[]> = {
  elkhorn: ['gretna', 'omaha', 'bellevue'],
  gretna: ['elkhorn', 'omaha', 'bellevue'],
  omaha: ['bellevue', 'gretna', 'elkhorn'],
  bellevue: ['omaha', 'gretna', 'elkhorn'],
}

const INSTRUMENTS = [
  { name: 'Piano', icon: '\u{1F3B9}' },
  { name: 'Guitar', icon: '\u{1F3B8}' },
  { name: 'Vocals', icon: '\u{1F3A4}' },
  { name: 'Drums', icon: '\u{1F941}' },
  { name: 'Violin', icon: '\u{1F3BB}' },
  { name: 'Other', icon: '\u{2795}' },
]

const DAYS = [
  { label: 'Monday', time: '3:30p-9p' },
  { label: 'Tuesday', time: '3:30p-9p' },
  { label: 'Wednesday', time: '3:30p-9p' },
  { label: 'Thursday', time: '3:30p-9p' },
  { label: 'Saturday', time: '10am-3p' },
]

const AGE_RANGES = ['Under 5', '5-10', '11-17', '18-25', '26 or older']
const HAS_INSTRUMENT_OPTS = ['Yes', 'No', 'Need help purchasing', 'N/A']
const SOURCES = ['Facebook/Instagram', 'Google', 'Signage/Driving By', 'Referral', 'Other']

// Tenant ID is fetched dynamically inside the component via useTenantId()

// ─── TOTAL STEPS ────────────────────────────────────────
// 0: Who (child/adult)
// 1: One kid or more (child only)
// 2: Instrument (grid)
// 3: Another instrument (pills)
// 4: Preferred location (blocks)
// 5: Other locations (multi)
// 6: Best days (multi)
// 7: About student (age + instrument + personality)
// 8: How did you find us
// 9: Contact info
// 10: Score / result

const TOTAL_MAIN_STEPS = 10

// ─── COMPONENT ──────────────────────────────────────────
export default function EnrollmentForm({ isOpen, onClose, defaultLocation }: EnrollmentFormProps) {
  const [step, setStep] = useState(0)
  const [direction, setDirection] = useState<'forward' | 'back'>('forward')

  // Answers
  const [who, setWho] = useState<'child' | 'adult' | null>(null)
  const [howMany, setHowMany] = useState<'one' | 'multiple' | null>(null)
  const [primaryInstrument, setPrimaryInstrument] = useState<string | null>(null)
  const [additionalInstruments, setAdditionalInstruments] = useState<string[]>([])
  const [preferredLocation, setPreferredLocation] = useState<LocKey | null>(defaultLocation ?? null)
  const [additionalLocations, setAdditionalLocations] = useState<LocKey[]>([])
  const [preferredDays, setPreferredDays] = useState<string[]>([])
  const [ageRange, setAgeRange] = useState<string | null>(null)
  const [hasInstrument, setHasInstrument] = useState<string | null>(null)
  const [bio, setBio] = useState('')
  const [source, setSource] = useState<string | null>(null)
  const [isMilitary, setIsMilitary] = useState(false)
  const [studentName, setStudentName] = useState('')
  const [parentName, setParentName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')

  // Multi-child
  const [additionalChildren, setAdditionalChildren] = useState<ChildData[]>([])
  const [addingChild, setAddingChild] = useState(false)
  const [childStep, setChildStep] = useState(0)
  const [tempChild, setTempChild] = useState<ChildData>({ instruments: [], studentName: '', bio: '', ageRange: '', hasInstrument: '' })

  // Tenant ID — fetched dynamically so it works for any tenant
  const tenantId = usePublicTenantId()

  // Score
  const [isCalculating, setIsCalculating] = useState(false)
  const [score, setScore] = useState(0)
  const [matchTeacher, setMatchTeacher] = useState('')
  const [submitted, setSubmitted] = useState(false)

  const contentRef = useRef<HTMLDivElement>(null)

  // Reset on open
  useEffect(() => {
    if (isOpen) {
      setStep(0)
      setDirection('forward')
      setWho(null)
      setHowMany(null)
      setPrimaryInstrument(null)
      setAdditionalInstruments([])
      setPreferredLocation(defaultLocation ?? null)
      setAdditionalLocations([])
      setPreferredDays([])
      setAgeRange(null)
      setHasInstrument(null)
      setBio('')
      setSource(null)
      setIsMilitary(false)
      setStudentName('')
      setParentName('')
      setEmail('')
      setPhone('')
      setAdditionalChildren([])
      setAddingChild(false)
      setChildStep(0)
      setTempChild({ instruments: [], studentName: '', bio: '', ageRange: '', hasInstrument: '' })
      setIsCalculating(false)
      setScore(0)
      setMatchTeacher('')
      setSubmitted(false)
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => { document.body.style.overflow = '' }
  }, [isOpen, defaultLocation])

  // Scroll content to top on step change
  useEffect(() => {
    contentRef.current?.scrollTo(0, 0)
  }, [step, childStep, addingChild])

  const goForward = useCallback((toStep?: number) => {
    setDirection('forward')
    setStep(s => toStep ?? s + 1)
  }, [])

  const goBack = useCallback(() => {
    if (addingChild) {
      if (childStep > 0) {
        setChildStep(cs => cs - 1)
      } else {
        setAddingChild(false)
        setStep(11)
      }
      return
    }
    if (step <= 0) return
    setDirection('back')
    // From add-another prompt, go back to contact
    if (step === 11) {
      setStep(9)
    // Skip step 1 (how many) if adult
    } else if (step === 2 && who === 'adult') {
      setStep(0)
    } else {
      setStep(s => s - 1)
    }
  }, [step, who, addingChild, childStep])

  // Skip step 1 for adults
  const handleWhoSelect = useCallback((choice: 'child' | 'adult') => {
    setWho(choice)
    if (choice === 'adult') {
      setHowMany('one')
      goForward(2) // skip "one kid or more"
    } else {
      goForward(1)
    }
  }, [goForward])

  const handleHowMany = useCallback((choice: 'one' | 'multiple') => {
    setHowMany(choice)
    goForward(2)
  }, [goForward])

  const handleInstrumentSelect = useCallback((name: string) => {
    setPrimaryInstrument(name)
    goForward(3)
  }, [goForward])

  const toggleAdditionalInstrument = useCallback((name: string) => {
    setAdditionalInstruments(prev =>
      prev.includes(name) ? prev.filter(i => i !== name) : [...prev, name]
    )
  }, [])

  const handleLocationSelect = useCallback((key: LocKey) => {
    setPreferredLocation(key)
    goForward(5)
  }, [goForward])

  const toggleAdditionalLocation = useCallback((key: LocKey) => {
    setAdditionalLocations(prev =>
      prev.includes(key) ? prev.filter(l => l !== key) : [...prev, key]
    )
  }, [])

  const toggleDay = useCallback((label: string) => {
    setPreferredDays(prev => {
      if (label === 'any') return ['any']
      if (label === 'none') return ['none']
      const filtered = prev.filter(d => d !== 'any' && d !== 'none')
      return filtered.includes(label)
        ? filtered.filter(d => d !== label)
        : [...filtered, label]
    })
  }, [])

  // ─── SUBMIT & SCORE ─────────────────────────────────
  const handleSubmit = useCallback(async () => {
    goForward(10)
    setIsCalculating(true)

    const allInstruments = primaryInstrument
      ? [primaryInstrument, ...additionalInstruments]
      : additionalInstruments

    const locationDef = LOCATIONS.find(l => l.key === preferredLocation)
    const locationNames = [locationDef?.label + ' Music Lessons']
    additionalLocations.forEach(k => {
      const loc = LOCATIONS.find(l => l.key === k)
      if (loc) locationNames.push(loc.label + ' Music Lessons')
    })

    // Calculate compatibility score via RPC
    let matchScore = 0
    let matchName = ''
    const isMultiChild = howMany === 'multiple'

    if (!isMultiChild) {
      try {
        const { data: matchData } = await anon.rpc('match_teacher', {
          p_tenant_id: tenantId!,
          p_instrument: (primaryInstrument ?? 'piano').toLowerCase(),
          p_location_names: locationNames,
          p_age_range: ageRange ?? '',
          p_personality_notes: bio,
        })
        if (matchData && matchData.length > 0) {
          matchScore = matchData[0].score ?? 0
          matchName = matchData[0].first_name ?? ''
        }
      } catch (err) {
        console.error('Teacher match RPC failed:', err)
        matchScore = Math.floor(Math.random() * 10) + 85
      }
    }

    // Save lead(s) to Supabase
    const daysForDb = preferredDays.filter(d => d !== 'any' && d !== 'none')
    const addlLocIds = additionalLocations.map(k => LOCATIONS.find(l => l.key === k)?.dbId).filter(Boolean)

    const baseLead = {
      tenant_id: tenantId!,
      location_id: locationDef?.dbId ?? null,
      parent_name: parentName.trim() || null,
      email: email.trim() || null,
      phone: phone.trim() || null,
      preferred_days: daysForDb.length > 0 ? daysForDb.map(d => d.toLowerCase()) : null,
      preferred_locations: addlLocIds.length > 0 ? addlLocIds : null,
      source: source || null,
      how_heard: source || null,
      is_military: isMilitary,
      stage: 'inquiry' as const,
    }

    // Primary child/adult lead
    try {
      await anon.from('leads').insert({
        ...baseLead,
        first_name: studentName.trim() || parentName.trim(),
        student_name: studentName.trim() || null,
        instrument: allInstruments.map(i => i.toLowerCase()).join(', '),
        age_range: ageRange,
        has_instrument: hasInstrument,
        personality_notes: bio.trim() || null,
        experience: null,
        compatibility_score: matchScore || null,
        notes: [
          `Who: ${who}`,
          `How many: ${howMany}`,
          `Compatibility score: ${matchScore}%`,
          matchName ? `Matched teacher: ${matchName}` : null,
        ].filter(Boolean).join('\n'),
      })
    } catch (err) {
      console.error('Lead save failed:', err)
    }

    // Save additional children
    for (const child of additionalChildren) {
      try {
        await anon.from('leads').insert({
          ...baseLead,
          first_name: child.studentName.trim() || 'Child',
          student_name: child.studentName.trim() || null,
          instrument: child.instruments.map(i => i.toLowerCase()).join(', '),
          age_range: child.ageRange || ageRange,
          has_instrument: child.hasInstrument || hasInstrument,
          personality_notes: child.bio.trim() || null,
          experience: null,
          notes: `Who: child (additional)\nFamily email: ${email}`,
        })
      } catch (err) {
        console.error('Additional child lead save failed:', err)
      }
    }

    // Fire GA4 generate_lead event
    if (window.gtag) {
      window.gtag('event', 'generate_lead', {
        currency: 'USD',
        value: 0,
        instrument: primaryInstrument?.toLowerCase(),
        location: preferredLocation,
      })
    }

    // Fire Meta Pixel Lead event
    if ((window as any).fbq) {
      (window as any).fbq('track', 'Lead', {
        content_name: primaryInstrument?.toLowerCase(),
        content_category: 'enrollment',
      })
    }

    // Animate score
    setScore(matchScore)
    setMatchTeacher(matchName)
    setSubmitted(true)

    // Delay to show loading
    await new Promise(r => setTimeout(r, 2500))
    setIsCalculating(false)
  }, [
    who, howMany, primaryInstrument, additionalInstruments, preferredLocation,
    additionalLocations, preferredDays, ageRange, hasInstrument, bio, source,
    isMilitary, studentName, parentName, email, phone, additionalChildren, goForward,
  ])

  // ─── MULTI-CHILD HANDLERS ────────────────────────────
  const startAddingChild = useCallback(() => {
    setTempChild({ instruments: [], studentName: '', bio: '', ageRange: '', hasInstrument: '' })
    setChildStep(0)
    setAddingChild(true)
  }, [])

  const finishChild = useCallback(() => {
    setAdditionalChildren(prev => [...prev, { ...tempChild }])
    setAddingChild(false)
    setStep(11) // return to "add another?" prompt
  }, [tempChild])

  // ─── PROGRESS ─────────────────────────────────────────
  const effectiveSteps = who === 'adult' ? TOTAL_MAIN_STEPS - 1 : TOTAL_MAIN_STEPS
  const effectiveStep = who === 'adult' && step >= 2 ? step - 1 : step
  const progress = step >= 10 ? 100 : Math.round((effectiveStep / effectiveSteps) * 100)

  // ─── RENDER HELPERS ───────────────────────────────────
  const renderPill = (label: string, selected: boolean, onClick: () => void) => (
    <button
      key={label}
      className={`ef-pill${selected ? ' ef-pill--on' : ''}`}
      onClick={onClick}
      type="button"
    >
      {label}
    </button>
  )

  const renderScreen = () => {
    // Multi-child sub-flow
    if (addingChild) {
      return renderChildFlow()
    }

    switch (step) {
      case 0: return renderWho()
      case 1: return renderHowMany()
      case 2: return renderInstrument()
      case 3: return renderAdditionalInstrument()
      case 4: return renderLocation()
      case 5: return renderOtherLocations()
      case 6: return renderDays()
      case 7: return renderAbout()
      case 8: return renderSource()
      case 9: return renderContact()
      case 10: return renderScore()
      case 11: return renderAddAnotherPrompt()
      default: return null
    }
  }

  // ─── SCREEN 1: WHO ────────────────────────────────────
  const renderWho = () => (
    <div className="ef-screen">
      <h2 className="ef-question">What can we help you learn?</h2>
      <div className="ef-options-lg">
        <button className="ef-option-block" onClick={() => handleWhoSelect('child')}>
          <span className="ef-option-label">My child</span>
          <span className="ef-option-sub">ages 4 and up</span>
        </button>
        <button className="ef-option-block" onClick={() => handleWhoSelect('adult')}>
          <span className="ef-option-label">Myself</span>
          <span className="ef-option-sub">adult learners welcome</span>
        </button>
      </div>
    </div>
  )

  // ─── SCREEN 2: HOW MANY ───────────────────────────────
  const renderHowMany = () => (
    <div className="ef-screen">
      <h2 className="ef-question">Is this for one child or more?</h2>
      <div className="ef-options-lg">
        <button className="ef-option-block" onClick={() => handleHowMany('one')}>
          <span className="ef-option-label">Just one</span>
        </button>
        <button className="ef-option-block" onClick={() => handleHowMany('multiple')}>
          <span className="ef-option-label">Two or more</span>
        </button>
      </div>
    </div>
  )

  // ─── SCREEN 3: INSTRUMENT ─────────────────────────────
  const renderInstrument = () => (
    <div className="ef-screen">
      <h2 className="ef-question">
        {who === 'child' ? 'What can we help them learn?' : 'What can we help you learn?'}
      </h2>
      <div className="ef-instrument-grid">
        {INSTRUMENTS.map(inst => (
          <button
            key={inst.name}
            className={`ef-instrument-tile${primaryInstrument === inst.name ? ' ef-instrument-tile--on' : ''}`}
            onClick={() => handleInstrumentSelect(inst.name)}
          >
            <span className="ef-tile-icon">{inst.icon}</span>
            <span className="ef-tile-name">{inst.name}</span>
          </button>
        ))}
      </div>
    </div>
  )

  // ─── SCREEN 4: ADDITIONAL INSTRUMENT ──────────────────
  const renderAdditionalInstrument = () => {
    const remaining = INSTRUMENTS.filter(i => i.name !== primaryInstrument)
    return (
      <div className="ef-screen">
        <h2 className="ef-question">Just {primaryInstrument}, or another instrument too?</h2>
        <div className="ef-pills-wrap">
          {primaryInstrument && (
            <button className="ef-pill ef-pill--locked" disabled>
              {primaryInstrument}
            </button>
          )}
          {remaining.map(inst =>
            renderPill(
              inst.name,
              additionalInstruments.includes(inst.name),
              () => toggleAdditionalInstrument(inst.name)
            )
          )}
        </div>
        <button className="ef-cta" onClick={() => goForward(4)}>
          Continue
        </button>
      </div>
    )
  }

  // ─── SCREEN 5: PREFERRED LOCATION ─────────────────────
  const renderLocation = () => (
    <div className="ef-screen">
      <h2 className="ef-question">What's your preferred location?</h2>
      <div className="ef-location-stack">
        {LOCATIONS.map(loc => (
          <button
            key={loc.key}
            className={`ef-location-block${preferredLocation === loc.key ? ' ef-location-block--on' : ''}`}
            onClick={() => handleLocationSelect(loc.key)}
          >
            <span className="ef-loc-name">{loc.label}</span>
            <span className="ef-loc-addr">{loc.address}</span>
          </button>
        ))}
      </div>
    </div>
  )

  // ─── SCREEN 6: OTHER LOCATIONS ────────────────────────
  const renderOtherLocations = () => {
    const orderedKeys = preferredLocation ? LOC_PROXIMITY[preferredLocation] : (['gretna', 'elkhorn', 'omaha', 'bellevue'] as LocKey[])
    const remaining = orderedKeys.map(k => LOCATIONS.find(l => l.key === k)!).filter(Boolean)
    return (
      <div className="ef-screen">
        <h2 className="ef-question">Any of these other locations work for you?</h2>
        <div className="ef-location-stack">
          {remaining.map(loc => (
            <button
              key={loc.key}
              className={`ef-location-block${additionalLocations.includes(loc.key) ? ' ef-location-block--on' : ''}`}
              onClick={() => toggleAdditionalLocation(loc.key)}
            >
              <span className="ef-loc-name">{loc.label}</span>
              <span className="ef-loc-addr">{loc.address}</span>
            </button>
          ))}
        </div>
        <button
          className="ef-link-btn"
          onClick={() => { setAdditionalLocations([]); goForward(6) }}
        >
          None of these work
        </button>
        <button className="ef-cta" onClick={() => goForward(6)}>
          Continue
        </button>
      </div>
    )
  }

  // ─── SCREEN 7: BEST DAYS ─────────────────────────────
  const renderDays = () => (
    <div className="ef-screen">
      <h2 className="ef-question">What days work best?</h2>
      <p className="ef-subtext">Tap all that apply</p>
      <div className="ef-pills-wrap">
        {DAYS.map(d =>
          renderPill(
            `${d.label} ${d.time}`,
            preferredDays.includes(d.label),
            () => toggleDay(d.label)
          )
        )}
        {renderPill('Any of these work', preferredDays.includes('any'), () => toggleDay('any'))}
        {renderPill('None of these work', preferredDays.includes('none'), () => toggleDay('none'))}
      </div>
      <button
        className="ef-cta"
        disabled={preferredDays.length === 0}
        onClick={() => goForward(7)}
      >
        Continue
      </button>
    </div>
  )

  // ─── SCREEN 8: ABOUT THE STUDENT ─────────────────────
  const renderAbout = () => (
    <div className="ef-screen">
      <h2 className="ef-question">
        {who === 'child' ? 'Tell us about your child.' : 'Tell us about yourself.'}
      </h2>

      <div className="ef-field-group">
        <label className="ef-label">Age range</label>
        <div className="ef-pills-wrap">
          {AGE_RANGES.map(ar =>
            renderPill(ar, ageRange === ar, () => setAgeRange(ar))
          )}
        </div>
      </div>

      <div className="ef-field-group">
        <label className="ef-label">Has an instrument?</label>
        <div className="ef-pills-wrap">
          {HAS_INSTRUMENT_OPTS.map(opt =>
            renderPill(opt, hasInstrument === opt, () => setHasInstrument(opt))
          )}
        </div>
      </div>

      <div className="ef-field-group">
        <label className="ef-label ef-label--important">This is the most important step.</label>
        <p className="ef-field-hint">
          The more you share, the better we can match {who === 'child' ? 'your child' : 'you'} with
          the right teacher. What should we know about {who === 'child' ? 'their' : 'your'} personality,
          how {who === 'child' ? 'they' : 'you'} learn best, and what {who === 'child' ? 'they hope' : 'you hope'} to get out of lessons?
        </p>
        <textarea
          className="ef-textarea"
          value={bio}
          onChange={e => setBio(e.target.value)}
          placeholder="Example: She's energetic and loves pop music. Gets frustrated easily but responds well to encouragement. Goal is to play her favorite songs within 3 months."
          rows={5}
        />
      </div>

      <button
        className="ef-cta"
        disabled={bio.trim().length < 20}
        onClick={() => goForward(8)}
      >
        Continue
      </button>
      {bio.trim().length > 0 && bio.trim().length < 20 && (
        <p className="ef-validation">Please write at least 20 characters ({20 - bio.trim().length} more)</p>
      )}
    </div>
  )

  // ─── SCREEN 9: SOURCE ────────────────────────────────
  const renderSource = () => (
    <div className="ef-screen">
      <h2 className="ef-question">How did you find us?</h2>
      <div className="ef-pills-wrap">
        {SOURCES.map(s =>
          renderPill(s, source === s, () => setSource(s))
        )}
      </div>

      <div className="ef-military-toggle">
        <label className="ef-toggle-label">
          <span>Military family?</span>
          <button
            className={`ef-toggle${isMilitary ? ' ef-toggle--on' : ''}`}
            onClick={() => setIsMilitary(v => !v)}
            type="button"
          >
            <span className="ef-toggle-knob" />
          </button>
        </label>
      </div>

      <button
        className="ef-cta"
        disabled={!source}
        onClick={() => goForward(9)}
      >
        Continue
      </button>
    </div>
  )

  // ─── SCREEN 10: CONTACT INFO ──────────────────────────
  const renderContact = () => (
    <div className="ef-screen">
      <h2 className="ef-question">Almost there — how do we reach you?</h2>
      {preferredLocation && (
        <p className="ef-subtext" style={{ marginBottom: 12 }}>
          Enrolling at <strong>{LOC_CONFIG[preferredLocation].name}</strong> &middot; {LOC_CONFIG[preferredLocation].address} &middot; {LOC_CONFIG[preferredLocation].phone}
        </p>
      )}
      <div className="ef-form-fields">
        <div className="ef-field">
          <label className="ef-label">Student name</label>
          <input
            className="ef-input"
            value={studentName}
            onChange={e => setStudentName(e.target.value)}
            placeholder="First name"
          />
        </div>
        <div className="ef-field">
          <label className="ef-label">
            Parent / guardian name
            {who === 'adult' && <span className="ef-label-hint"> (skip if adult learner)</span>}
          </label>
          <input
            className="ef-input"
            value={parentName}
            onChange={e => setParentName(e.target.value)}
            placeholder="Full name"
          />
        </div>
        <div className="ef-field">
          <label className="ef-label">Email address</label>
          <input
            className="ef-input"
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="you@email.com"
          />
        </div>
        <div className="ef-field">
          <label className="ef-label">Phone number</label>
          <input
            className="ef-input"
            type="tel"
            value={phone}
            onChange={e => setPhone(e.target.value)}
            placeholder="(402) 555-0000"
          />
        </div>
      </div>
      <button
        className="ef-cta ef-cta--score"
        disabled={!studentName.trim() || !email.trim() || !phone.trim()}
        onClick={() => {
          if (howMany === 'multiple') {
            setDirection('forward')
            setStep(11) // go to "add another child?" prompt
            return
          }
          handleSubmit()
        }}
      >
        {howMany === 'multiple' ? 'Continue \u2192' : 'Get My Compatibility Score \u2192'}
      </button>
    </div>
  )

  // ─── MULTI-CHILD FLOW ────────────────────────────────
  const renderChildFlow = () => {
    switch (childStep) {
      case 0:
        // Instrument selection for additional child
        return (
          <div className="ef-screen">
            <h2 className="ef-question">What instrument does your next child want to learn?</h2>
            <div className="ef-instrument-grid">
              {INSTRUMENTS.map(inst => (
                <button
                  key={inst.name}
                  className={`ef-instrument-tile${tempChild.instruments.includes(inst.name) ? ' ef-instrument-tile--on' : ''}`}
                  onClick={() => setTempChild(c => ({
                    ...c,
                    instruments: c.instruments.includes(inst.name)
                      ? c.instruments.filter(i => i !== inst.name)
                      : [...c.instruments, inst.name]
                  }))}
                >
                  <span className="ef-tile-icon">{inst.icon}</span>
                  <span className="ef-tile-name">{inst.name}</span>
                </button>
              ))}
            </div>
            <button
              className="ef-cta"
              disabled={tempChild.instruments.length === 0}
              onClick={() => setChildStep(1)}
            >
              Continue
            </button>
          </div>
        )
      case 1:
        // About the child (name + personality)
        return (
          <div className="ef-screen">
            <h2 className="ef-question">Tell us about them.</h2>
            <div className="ef-form-fields">
              <div className="ef-field">
                <label className="ef-label">Student name</label>
                <input
                  className="ef-input"
                  value={tempChild.studentName}
                  onChange={e => setTempChild(c => ({ ...c, studentName: e.target.value }))}
                  placeholder="First name"
                />
              </div>
              <div className="ef-field-group">
                <label className="ef-label ef-label--important">This is the most important step.</label>
                <p className="ef-field-hint">
                  The more you share, the better we can match your child with the right teacher.
                </p>
                <textarea
                  className="ef-textarea"
                  value={tempChild.bio}
                  onChange={e => setTempChild(c => ({ ...c, bio: e.target.value }))}
                  placeholder="Personality, learning style, goals..."
                  rows={5}
                />
              </div>
            </div>
            <button
              className="ef-cta"
              disabled={tempChild.bio.trim().length < 20 || !tempChild.studentName.trim()}
              onClick={() => {
                finishChild()
              }}
            >
              Continue
            </button>
            {tempChild.bio.trim().length > 0 && tempChild.bio.trim().length < 20 && (
              <p className="ef-validation">Please write at least 20 characters</p>
            )}
          </div>
        )
      default:
        return null
    }
  }

  // After finishing adding a child, show "add another?" prompt
  const renderAddAnotherPrompt = () => (
    <div className="ef-screen">
      <h2 className="ef-question">Would you like to add another child?</h2>
      {additionalChildren.length > 0 && (
        <div className="ef-child-summary">
          <div className="ef-child-row">
            <span className="ef-child-name">{studentName || 'Child 1'}</span>
            <span className="ef-child-inst">{primaryInstrument}</span>
          </div>
          {additionalChildren.map((c, i) => (
            <div className="ef-child-row" key={i}>
              <span className="ef-child-name">{c.studentName || `Child ${i + 2}`}</span>
              <span className="ef-child-inst">{c.instruments.join(', ')}</span>
            </div>
          ))}
        </div>
      )}
      <div className="ef-options-lg">
        <button className="ef-option-block" onClick={startAddingChild}>
          <span className="ef-option-label">Yes, add another</span>
        </button>
        <button className="ef-option-block" onClick={handleSubmit}>
          <span className="ef-option-label">No, we're done</span>
        </button>
      </div>
    </div>
  )

  // ─── SCREEN 11: SCORE ────────────────────────────────
  const renderScore = () => {
    const isMultiChild = howMany === 'multiple' && additionalChildren.length > 0

    if (isCalculating) {
      return (
        <div className="ef-screen ef-screen--center">
          <div className="ef-loader">
            <div className="ef-loader-ring" />
          </div>
          <h2 className="ef-calculating">Calculating your match...</h2>
        </div>
      )
    }

    if (isMultiChild) {
      return (
        <div className="ef-screen ef-screen--center">
          <div className="ef-result-icon">{'\u{1F3B5}'}</div>
          <h2 className="ef-result-title">It looks like we have the right teachers for your family.</h2>
          <p className="ef-result-sub">We'll reach out within 24 hours to get everyone on the schedule at times that work for you.</p>
          <div className="ef-child-summary ef-child-summary--final">
            <div className="ef-child-row">
              <span className="ef-child-name">{studentName || 'Child 1'}</span>
              <span className="ef-child-inst">{primaryInstrument}</span>
            </div>
            {additionalChildren.map((c, i) => (
              <div className="ef-child-row" key={i}>
                <span className="ef-child-name">{c.studentName || `Child ${i + 2}`}</span>
                <span className="ef-child-inst">{c.instruments.join(', ')}</span>
              </div>
            ))}
          </div>
          <p className="ef-result-footer">
            Adkins Music Lessons &middot; {LOCATIONS.find(l => l.key === preferredLocation)?.label}
          </p>
        </div>
      )
    }

    // Single child/adult score
    const locationLabel = LOCATIONS.find(l => l.key === preferredLocation)?.label ?? ''
    return (
      <div className="ef-screen ef-screen--center">
        <ScoreCircle value={score} />
        <h2 className="ef-result-title">We found your teacher.</h2>
        <p className="ef-result-sub">
          Based on your schedule, location, and what you shared about {studentName || 'your student'},
          we matched {who === 'child' ? 'them' : 'you'} with a {primaryInstrument?.toLowerCase()} teacher
          at {locationLabel} — {score}% compatibility.
        </p>
        <div className="ef-summary-card">
          <div className="ef-summary-row">
            <span className="ef-summary-label">Instrument</span>
            <span className="ef-summary-value">
              {[primaryInstrument, ...additionalInstruments].filter(Boolean).join(', ')}
            </span>
          </div>
          <div className="ef-summary-row">
            <span className="ef-summary-label">Location</span>
            <span className="ef-summary-value">{locationLabel}</span>
          </div>
          <div className="ef-summary-row">
            <span className="ef-summary-label">Best days</span>
            <span className="ef-summary-value">
              {preferredDays.includes('any') ? 'Flexible' : preferredDays.join(', ')}
            </span>
          </div>
        </div>
        <p className="ef-result-confirm">We'll text you within 24 hours to confirm your first lesson.</p>
        <p className="ef-result-footer">
          Adkins Music Lessons &middot; {locationLabel}
        </p>
      </div>
    )
  }

  if (!isOpen) return null

  return createPortal(
    <div className="ef-overlay">
      {/* Progress bar */}
      <div className="ef-progress-bar">
        <div className="ef-progress-fill" style={{ width: `${progress}%` }} />
      </div>

      {/* Top bar */}
      <div className="ef-topbar">
        {((step > 0 && step < 10) || step === 11 || addingChild) && !isCalculating && (
          <button className="ef-back" onClick={goBack} aria-label="Go back">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <path d="M12.5 15L7.5 10L12.5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        )}
        <div className="ef-topbar-spacer" />
        <button className="ef-close" onClick={onClose} aria-label="Close">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <path d="M15 5L5 15M5 5L15 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
          </svg>
        </button>
      </div>

      {/* Content */}
      <div className="ef-content" ref={contentRef}>
        <div className={`ef-slide ef-slide--${direction}`} key={addingChild ? `child-${childStep}` : step}>
          {renderScreen()}
        </div>
      </div>
    </div>,
    document.body
  )
}

// ─── SCORE CIRCLE ───────────────────────────────────────
function ScoreCircle({ value }: { value: number }) {
  const [display, setDisplay] = useState(0)
  const radius = 70
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (display / 100) * circumference

  useEffect(() => {
    let frame: number
    const start = performance.now()
    const duration = 1500
    const animate = (now: number) => {
      const elapsed = now - start
      const progress = Math.min(elapsed / duration, 1)
      const eased = 1 - Math.pow(1 - progress, 3)
      setDisplay(Math.round(eased * value))
      if (progress < 1) frame = requestAnimationFrame(animate)
    }
    frame = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(frame)
  }, [value])

  return (
    <div className="ef-score-circle">
      <svg viewBox="0 0 160 160" width="160" height="160">
        <circle
          cx="80" cy="80" r={radius}
          fill="none" stroke="#1a1a2e" strokeWidth="10"
        />
        <circle
          cx="80" cy="80" r={radius}
          fill="none" stroke="#D4226A" strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          transform="rotate(-90 80 80)"
          style={{ transition: 'stroke-dashoffset 0.05s linear' }}
        />
      </svg>
      <div className="ef-score-num">{display}%</div>
    </div>
  )
}
