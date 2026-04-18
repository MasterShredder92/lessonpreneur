import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import SiteHeader from '../components/site/SiteHeader'
import { useSiteLocation } from '../hooks/useSiteLocation'
import { setLocColors } from '../lib/setLocColors'
import { useLocationTracking } from '../hooks/useLocationTracking'
import { trackLead, trackEnrollmentStarted, trackStudentNameEntered, trackInstrumentSelected, trackAdditionalStudentAdded } from '../lib/tracking'
import { MapPin } from 'lucide-react'
import { LOCATIONS, type LocKey } from '../config/locations'
import { SCHOOL_CONFIG } from '../config/school'
import { ZW } from '../config/zwBrand'
import { EDGE_FUNCTIONS } from '../lib/config'
import { safeFetch } from '../lib/safeFetch'
import { bufferLeadSubmission, markLeadSubmissionFailed, markLeadSubmissionSent } from '../lib/leadFailsafe'
import { useLocationHours } from '../hooks/useLocationHours'
import './signup.css'

const INSTRUMENTS = [
  { id: 'piano', emoji: '🎹', label: 'Piano' },
  { id: 'guitar', emoji: '🎸', label: 'Guitar' },
  { id: 'vocals', emoji: '🎤', label: 'Vocals' },
  { id: 'drums', emoji: '🪘', label: 'Drums' },
  { id: 'violin', emoji: '🎻', label: 'Violin' },
  { id: 'other', emoji: '🎵', label: 'Other' },
]

// ── Instrument selection sounds (preloaded on mount) ──
const SOUND_CACHE_V = '20260404s'
const INST_SOUND: Record<string, string> = {
  piano: `/audio/piano/C.wav?v=${SOUND_CACHE_V}`,
  guitar: `/audio/guitar/E2/0.wav?v=${SOUND_CACHE_V}`,
  vocals: `/audio/piano/E.wav?v=${SOUND_CACHE_V}`,
  drums: `/audio/drums/snare.wav?v=${SOUND_CACHE_V}`,
  violin: `/audio/piano/G.wav?v=${SOUND_CACHE_V}`,
  other: `/audio/piano/C2.wav?v=${SOUND_CACHE_V}`,
}

let _audioCtx: AudioContext | null = null
const _bufferCache: Record<string, AudioBuffer> = {}
function getAudioCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null
  if (!_audioCtx) {
    try { _audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)() }
    catch { return null }
  }
  if (_audioCtx && _audioCtx.state === 'suspended') _audioCtx.resume()
  return _audioCtx
}
async function preloadSound(url: string): Promise<AudioBuffer | null> {
  if (_bufferCache[url]) return _bufferCache[url]
  const ctx = getAudioCtx()
  if (!ctx) return null
  try {
    const res = await fetch(url)
    const arr = await res.arrayBuffer()
    const buf = await ctx.decodeAudioData(arr)
    _bufferCache[url] = buf
    return buf
  } catch { return null }
}
function playSoundNow(url: string) {
  const ctx = getAudioCtx()
  const buf = _bufferCache[url]
  if (!ctx || !buf) { preloadSound(url).then(b => { if (b) playSoundNow(url) }); return }
  const src = ctx.createBufferSource()
  const gain = ctx.createGain()
  gain.gain.value = 0.55
  src.buffer = buf
  src.connect(gain)
  gain.connect(ctx.destination)
  src.start(0)
}
function haptic(ms = 10) {
  try { navigator.vibrate?.(ms) } catch {}
}

const DAYS = [
  'Monday 3:30-9p',
  'Tuesday 3:30-9p',
  'Wednesday 3:30-9p',
  'Thursday 3:30-9p',
  'Saturday 10am-3p',
  'Any of These Work',
  'None of These Work',
]

// AGE_RANGES removed — replaced by numeric age input
const EXPERIENCE_OPTIONS = ['None', '1-2 years', '2-4 years', '4 years or more']
const INSTRUMENT_OWN = ['Yes', 'No', 'Need Help Purchasing', 'N/A']
const HEAR_OPTIONS = ['Facebook/Instagram', 'Google', 'Signage/Driving By', 'Referral', 'Other']

const LOC_OPTIONS: { key: LocKey; label: string }[] = [
  { key: 'gretna', label: 'Gretna (Highway 370)' },
  { key: 'elkhorn', label: 'Elkhorn (203rd St)' },
  { key: 'omaha', label: 'Omaha (96th St)' },
  { key: 'bellevue', label: 'Bellevue (Harlan Dr)' },
]

interface AdditionalStudent {
  name: string
  instruments: string[]
  bio: string
  goals: string
}

export default function SignupLanding() {
  const siteLoc = useSiteLocation()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const locColor = siteLoc.accentColor

  useLocationTracking(siteLoc)
  const { formatted: locationHours } = useLocationHours(siteLoc.locationId)

  // Detect instrument from URL: /omaha/guitar → "guitar"
  const urlSegments = pathname.split('/').filter(Boolean)
  const detectedInstrument = useMemo(() => {
    const seg = urlSegments[1]?.toLowerCase()
    if (['piano', 'guitar', 'vocals', 'drums'].includes(seg ?? '')) return seg!
    return null
  }, [urlSegments])

  // SEO meta tags for signup page
  useEffect(() => {
    const locName = siteLoc.name
    document.title = `Sign Up for Music Lessons in ${locName}, NE — Adkins Music Lessons`
    const setMeta = (attr: string, key: string, val: string) => {
      let el = document.querySelector(`meta[${attr}="${key}"]`) as HTMLMetaElement | null
      if (!el) { el = document.createElement('meta'); el.setAttribute(attr, key); document.head.appendChild(el) }
      el.setAttribute('content', val)
    }
    const desc = `Enroll in private music lessons in ${locName}, NE. Piano, guitar, vocals, drums and more. No contracts, flexible scheduling. Sign up in 60 seconds.`
    setMeta('name', 'description', desc)
    setMeta('property', 'og:title', `Sign Up — Adkins Music Lessons ${locName}`)
    setMeta('property', 'og:description', desc)
    const url = `https://www.adkinsmusiclessons.com/${siteLoc.key}/signup`
    setMeta('property', 'og:url', url)
    let canonical = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null
    if (!canonical) { canonical = document.createElement('link'); canonical.setAttribute('rel', 'canonical'); document.head.appendChild(canonical) }
    canonical.setAttribute('href', url)
  }, [siteLoc])

  // Set CSS variable
  useEffect(() => {
    setLocColors({ '--c': locColor })
  }, [locColor])

  // Preload instrument selection sounds on mount (no tap lag)
  useEffect(() => {
    getAudioCtx()
    Object.values(INST_SOUND).forEach(url => { preloadSound(url) })
  }, [])

  // ── State ──
  const [step, setStep] = useState(0)
  const [slideClass, setSlideClass] = useState('slide-enter')
  const [forSelf, setForSelf] = useState<boolean | null>(null)
  const [enrollmentType, setEnrollmentType] = useState<'kid' | 'kids' | 'self' | 'gift' | null>(null)
  const [giftRecipient, setGiftRecipient] = useState('')

  // Step 1 fields
  const [studentName, setStudentName] = useState('')
  const [fullName, setFullName] = useState('') // Path B
  const [age, setAge] = useState('')
  const [experience, setExperience] = useState('')
  const [freeText, setFreeText] = useState('')

  // Step 2 fields
  const [selectedInstruments, setSelectedInstruments] = useState<string[]>(
    detectedInstrument ? [detectedInstrument] : []
  )
  const [selectedDays, setSelectedDays] = useState<string[]>([])
  const [hasInstrument, setHasInstrument] = useState('')
  const [preferredLoc, setPreferredLoc] = useState<LocKey>(siteLoc.key)
  const [secondaryLocs, setSecondaryLocs] = useState<LocKey[]>([])

  // Step 3 fields
  const [parentName, setParentName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [isMilitary, setIsMilitary] = useState(false)

  // Step 4 — additional students
  const [additionalStudents, setAdditionalStudents] = useState<AdditionalStudent[]>([])
  const [addingStudent, setAddingStudent] = useState(false)
  const [addStudentName, setAddStudentName] = useState('')
  const [addStudentInstruments, setAddStudentInstruments] = useState<string[]>([])
  const [addStudentBio, setAddStudentBio] = useState('')
  const [addStudentGoals, setAddStudentGoals] = useState('')

  // Step 5 — referral source
  const [referralSource, setReferralSource] = useState('')

  // Step 6 — matching
  const [matchLoading, setMatchLoading] = useState(true)
  const [matchScore, setMatchScore] = useState<number | null>(null)
  const [matchedTeacher, setMatchedTeacher] = useState<any>(null)
  const [matchError, setMatchError] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [emailError, setEmailError] = useState('')

  // Sub-step tracking for Steps 1 and 2
  const [step1Sub, setStep1Sub] = useState(0) // 0=name+age, 1=experience+bio
  const [step2Sub, setStep2Sub] = useState(0)
  // 0=instrument, 1=days, 2=hasInstrument, 3=preferredLoc, 4=secondaryLocs

  const totalSteps = 7 // 0 through 6

  // Build dynamic student list copy for confirmation screen
  const buildStudentListText = useCallback(() => {
    const primaryName = forSelf
      ? (fullName.trim().split(' ')[0] || 'you')
      : (studentName.trim().split(' ')[0] || 'your child')
    const allNames = [primaryName, ...additionalStudents.map(s => s.name.split(' ')[0])]
    if (allNames.length === 1) return allNames[0]
    if (allNames.length === 2) return `${allNames[0]} and ${allNames[1]}`
    return `${allNames.slice(0, -1).join(', ')}, and ${allNames[allNames.length - 1]}`
  }, [forSelf, fullName, studentName, additionalStudents])
  // Always extract first name only for display
  const displayName = forSelf
    ? (fullName.trim().split(' ')[0] || 'you')
    : (studentName.trim().split(' ')[0] || 'them')

  // ── Transition helper ──
  const goToStep = useCallback((next: number) => {
    setSlideClass('slide-exit')
    setTimeout(() => {
      setStep(next)
      setSlideClass('slide-enter')
      window.scrollTo({ top: 0, behavior: 'smooth' })
    }, 200)
  }, [])

  // ── Check if vocals-only (skip has_instrument question) ──
  const isVocalsOnly = selectedInstruments.length === 1 && selectedInstruments[0] === 'vocals'

  // ── Back navigation ──
  const goBack = useCallback(() => {
    if (step === 1 && step1Sub > 0) {
      setStep1Sub(step1Sub - 1)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } else if (step === 2 && step2Sub > 0) {
      if (step2Sub === 3 && isVocalsOnly) {
        setStep2Sub(1)
      } else {
        setStep2Sub(step2Sub - 1)
      }
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } else if (step === 2 && step2Sub === 0) {
      setStep1Sub(1) // go back to step 1 sub 1 (experience/bio)
      goToStep(1)
    } else if (step > 0) {
      goToStep(step - 1)
    }
  }, [step, step1Sub, step2Sub, isVocalsOnly, goToStep])

  const BackButton = () => (
    <button className="signup-back" onClick={goBack}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M15 18l-6-6 6-6" />
      </svg>
      Back
    </button>
  )

  // ── Phone formatting ──
  const handlePhoneChange = (val: string) => {
    const digits = val.replace(/\D/g, '').slice(0, 10)
    if (digits.length <= 3) setPhone(digits)
    else if (digits.length <= 6) setPhone(`(${digits.slice(0, 3)}) ${digits.slice(3)}`)
    else setPhone(`(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`)
  }

  // ── Instrument toggle ──
  const toggleInstrument = (id: string) => {
    setSelectedInstruments(prev => {
      const isAdding = !prev.includes(id)
      if (isAdding) {
        // Play a cool instrument-specific sound on select
        const url = INST_SOUND[id]
        if (url) playSoundNow(url)
        haptic(12)
      }
      return isAdding ? [...prev, id] : prev.filter(i => i !== id)
    })
  }

  // ── Day toggle ──
  const toggleDay = (day: string) => {
    haptic(8)
    if (day === 'Any of These Work') {
      setSelectedDays(['Any of These Work'])
      return
    }
    if (day === 'None of These Work') {
      setSelectedDays(['None of These Work'])
      return
    }
    setSelectedDays(prev => {
      const filtered = prev.filter(d => d !== 'Any of These Work' && d !== 'None of These Work')
      return filtered.includes(day) ? filtered.filter(d => d !== day) : [...filtered, day]
    })
  }

  // ── Secondary location toggle ──
  const toggleSecondaryLoc = (key: LocKey) => {
    haptic(8)
    setSecondaryLocs(prev =>
      prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
    )
  }

  // ── Step 2 sub-step advance ──
  const advanceStep2 = useCallback(() => {
    if (step2Sub === 0) {
      // After instruments → days — fire tracking for each selected instrument
      selectedInstruments.forEach(inst => trackInstrumentSelected(inst, 1))
      setStep2Sub(1)
    } else if (step2Sub === 1) {
      // After days → has instrument (skip if vocals only)
      if (isVocalsOnly) {
        setStep2Sub(3) // skip to location
      } else {
        setStep2Sub(2)
      }
    } else if (step2Sub === 2) {
      // After has instrument → preferred location
      setStep2Sub(3)
    } else if (step2Sub === 3) {
      // After preferred location → secondary locations
      setStep2Sub(4)
    } else {
      // Done with step 2
      goToStep(3)
    }
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [step2Sub, isVocalsOnly, goToStep])

  // ── Teacher matching (via edge function — no direct DB queries from public page) ──
  const runMatching = useCallback(async () => {
    setMatchLoading(true)
    const startTime = Date.now()
    try {
      const locId = LOCATIONS[preferredLoc].locationId
      const result = await safeFetch<{
        success: boolean
        match_score: number
        candidates_found: number
        matched_teacher: { id: string; display_name: string; customer_facing_match_summary: string | null } | null
      }>(EDGE_FUNCTIONS.publicTeacherMatch, {
        body: {
          school_slug: SCHOOL_CONFIG.slug,
          location_id: locId,
          instruments: selectedInstruments,
          selected_days: selectedDays,
          age: age ? parseInt(age) : null,
        },
      })

      if (result.success && result.matched_teacher) {
        setMatchScore(result.match_score)
        setMatchedTeacher(result.matched_teacher)
      } else {
        setMatchScore(null)
        setMatchedTeacher(null)
      }
    } catch {
      setMatchScore(null)
      setMatchedTeacher(null)
    }

    // Show loading for at least 2.5s total
    const elapsed = Date.now() - startTime
    const remaining = Math.max(0, 2500 - elapsed)
    setTimeout(() => setMatchLoading(false), remaining)
  }, [preferredLoc, selectedInstruments, selectedDays, age])

  // Trigger matching when entering step 6
  const matchTriggered = useRef(false)
  useEffect(() => {
    if (step === 6 && !matchTriggered.current) {
      matchTriggered.current = true
      runMatching()
    }
  }, [step, runMatching])

  // ── Submit enrollment ──
  const handleSubmit = async () => {
    if (submitting) return

    // Validate email format before submission
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email.trim())) {
      setSubmitError('Please enter a valid email address.')
      return
    }

    setSubmitting(true)
    setSubmitError('')
    let bufferedLeadId: string | null = null

    try {
      const locId = LOCATIONS[preferredLoc].locationId
      const contactName = forSelf ? fullName : parentName

      // Build students array for the API
      const primaryStudent = {
        name: forSelf ? fullName.trim() : studentName.trim(),
        instrument: selectedInstruments.join(', '),
        personality_notes: freeText || '',
        goals: freeText || '',
      }
      const students = [
        primaryStudent,
        ...additionalStudents.map(s => ({
          name: s.name,
          instrument: s.instruments.join(', '),
          personality_notes: s.bio || '',
          goals: s.goals || '',
        })),
      ]

      const payload = {
        school_slug: SCHOOL_CONFIG.slug,
        location_id: locId,
        first_name: forSelf ? fullName.split(' ')[0].trim() : studentName.trim(),
        last_name: forSelf ? (fullName.split(' ').slice(1).join(' ').trim() || null) : null,
        student_name: primaryStudent.name,
        parent_name: forSelf ? null : contactName.trim(),
        email: email.trim().toLowerCase(),
        phone: phone.trim(),
        instrument: selectedInstruments.join(', '),
        age_range: age || null,
        experience: experience || null,
        preferred_days: selectedDays,
        preferred_locations: secondaryLocs.map(k => LOCATIONS[k].name),
        secondary_location_ids: secondaryLocs.length > 0 ? secondaryLocs.map(k => LOCATIONS[k].locationId) : null,
        has_instrument: hasInstrument || null,
        personality_notes: freeText || null,
        goals: freeText || null,
        is_military: isMilitary,
        compatibility_score: matchScore && matchScore >= 91 ? matchScore : null,
        matched_teacher_id: matchedTeacher?.id || null,
        source: 'website_form',
        referral_source: referralSource || null,
        students,
      }

      bufferedLeadId = bufferLeadSubmission(payload)

      const result = await safeFetch<{
        success?: boolean
        error?: string
        lead_id?: string
        intake_submission_id?: string
      }>(EDGE_FUNCTIONS.publicLeadSubmit, { body: payload, timeoutMs: 15_000 })

      if (!result.success) {
        throw new Error(
          result.error ||
            'We could not save your enrollment. Please try again in a moment or call the studio directly.',
        )
      }

      markLeadSubmissionSent(bufferedLeadId, {
        lead_id: result.lead_id,
        intake_submission_id: result.intake_submission_id,
      })

      const allInstruments = [...selectedInstruments, ...additionalStudents.flatMap(s => s.instruments)]
      trackLead(LOCATIONS[preferredLoc].name, additionalStudents.length + 1, [...new Set(allInstruments)])

      navigate(`/thank-you?location=${preferredLoc}`)
    } catch (err: any) {
      if (bufferedLeadId) {
        await markLeadSubmissionFailed(
          bufferedLeadId,
          err?.message || 'Lead submission failed',
        )
      }
      console.error('Enrollment error:', err)
      setSubmitError(err?.message || 'Something went wrong. Please call us directly to complete your enrollment.')
    } finally {
      setSubmitting(false)
    }
  }

  // ── Add student to list ──
  const confirmAddStudent = () => {
    if (!addStudentName.trim()) return
    const newTotal = additionalStudents.length + 2 // primary + existing + this one
    trackStudentNameEntered(newTotal - 1)
    addStudentInstruments.forEach(inst => trackInstrumentSelected(inst, newTotal - 1))
    trackAdditionalStudentAdded(newTotal)
    setAdditionalStudents(prev => [...prev, {
      name: addStudentName.trim(),
      instruments: addStudentInstruments,
      bio: addStudentBio.trim(),
      goals: addStudentGoals.trim(),
    }])
    setAddStudentName('')
    setAddStudentInstruments([])
    setAddStudentBio('')
    setAddStudentGoals('')
    setAddingStudent(false)
  }

  // ── Confetti particles ──
  const confettiParticles = useMemo(() => {
    return Array.from({ length: 35 }, (_, i) => ({
      left: `${Math.random() * 100}%`,
      delay: `${Math.random() * 1.5}s`,
      size: 4 + Math.random() * 4,
      opacity: 0.5 + Math.random() * 0.5,
    }))
  }, [])

  // ──────────────────────
  //  RENDER
  // ──────────────────────

  const renderStep0 = () => {
    // Gift sub-screen: collect recipient name before continuing
    if (enrollmentType === 'gift') {
      return (
        <div className="signup-step-wrap">
          <div className={`signup-step ${slideClass}`}>
            <button className="signup-back" onClick={() => setEnrollmentType(null)}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M15 18l-6-6 6-6" />
              </svg>
              Back
            </button>
            <h1 className="signup-title">Who's the lucky recipient?</h1>
            <div className="signup-field">
              <input
                className="signup-input"
                placeholder="Recipient's name"
                value={giftRecipient}
                onChange={e => setGiftRecipient(e.target.value)}
                autoFocus
              />
            </div>
            <button
              className="signup-next"
              disabled={!giftRecipient.trim()}
              onClick={() => { setForSelf(false); goToStep(1) }}
            >
              Next
            </button>
          </div>
        </div>
      )
    }

    return (
      <div className="signup-step-wrap">
        <div className={`signup-step ${slideClass}`}>
          <h1 className="signup-title">Who is this for?</h1>
          <div className="signup-who-cards">
            <div className="signup-who-card" onClick={() => { setEnrollmentType('kid'); setForSelf(false); trackEnrollmentStarted(siteLoc.name, 'kid'); goToStep(1) }}>
              <div className="signup-who-card-title">For a kid</div>
              <div className="signup-who-card-sub">Sign up one child for lessons</div>
            </div>
            <div className="signup-who-card" onClick={() => { setEnrollmentType('kids'); setForSelf(false); trackEnrollmentStarted(siteLoc.name, 'kids'); goToStep(1) }}>
              <div className="signup-who-card-title">For kids (2+)</div>
              <div className="signup-who-card-sub">Sign up multiple children</div>
            </div>
            <div className="signup-who-card" onClick={() => { setEnrollmentType('self'); setForSelf(true); trackEnrollmentStarted(siteLoc.name, 'adult'); goToStep(1) }}>
              <div className="signup-who-card-title">For myself</div>
              <div className="signup-who-card-sub">I want to learn an instrument</div>
            </div>
            <div className="signup-who-card" onClick={() => { setEnrollmentType('gift'); trackEnrollmentStarted(siteLoc.name, 'gift') }}>
              <div className="signup-who-card-title">As a gift</div>
              <div className="signup-who-card-sub">Give the gift of music</div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  const renderStep1 = () => {
    // Sub 0: Name + Age (fits viewport)
    if (step1Sub === 0) {
      return (
        <div className="signup-step-wrap">
          <div className={`signup-step ${slideClass}`}>
            <BackButton />
            <h1 className="signup-title">
              {forSelf ? 'Tell us about yourself.' : 'Tell us about them.'}
            </h1>
            <div className="signup-field">
              <div className="signup-label">{forSelf ? 'Your name' : 'Student name'}</div>
              <input
                className="signup-input"
                placeholder={forSelf ? 'Full name' : 'First name'}
                value={forSelf ? fullName : studentName}
                onChange={e => forSelf ? setFullName(e.target.value) : setStudentName(e.target.value)}
                autoFocus
              />
            </div>
            <div className="signup-field">
              <div className="signup-label">Age</div>
              <input
                className="signup-input"
                type="number"
                inputMode="numeric"
                min={3}
                max={99}
                placeholder="Enter age"
                value={age}
                onChange={e => {
                  const v = e.target.value.replace(/\D/g, '').slice(0, 2)
                  setAge(v)
                }}
              />
            </div>
            <div className="signup-sticky-cta">
              <button
                className="signup-next"
                disabled={forSelf ? !fullName.trim() : !studentName.trim()}
                onClick={() => { trackStudentNameEntered(1); setStep1Sub(1) }}
              >
                Next
              </button>
            </div>
          </div>
        </div>
      )
    }

    // Sub 1: Experience + personality/goals (required)
    return (
      <div className="signup-step-wrap">
        <div className={`signup-step ${slideClass}`}>
          <BackButton />
          <h1 className="signup-title">
            {forSelf ? 'A bit more about you.' : `A bit more about ${displayName}.`}
          </h1>
          <div className="signup-field">
            <div className="signup-label">Experience</div>
            <div className="signup-pills signup-pills-row">
              {EXPERIENCE_OPTIONS.map(e => (
                <button
                  key={e}
                  className={`signup-pill${experience === e ? ' selected' : ''}`}
                  onClick={() => setExperience(e)}
                >
                  {e}
                </button>
              ))}
            </div>
          </div>
          <div className="signup-field">
            <div className="signup-label">
              {forSelf ? 'Goals & learning style' : 'Personality, learning style & goals'}
            </div>
            <textarea
              className="signup-input signup-textarea"
              placeholder={forSelf
                ? 'Tell us about your goals and learning style'
                : `Tell us about ${displayName}'s personality, learning style, and goals`
              }
              value={freeText}
              onChange={e => setFreeText(e.target.value)}
              rows={3}
            />
          </div>
          <div className="signup-sticky-cta">
            <button
              className="signup-next"
              disabled={!experience || !freeText.trim()}
              onClick={() => { setStep2Sub(0); goToStep(2) }}
            >
              Next
            </button>
          </div>
        </div>
      </div>
    )
  }

  const renderStep2 = () => {
    const showInstruments = step2Sub === 0
    const showDays = step2Sub === 1
    const showHasInstrument = step2Sub === 2
    const showPrefLoc = step2Sub === 3
    const showSecLocs = step2Sub === 4

    return (
      <div className="signup-step-wrap">
        <div className={`signup-step ${slideClass}`}>
          <BackButton />

          {showInstruments && (
            <h1 className="signup-title">
              {forSelf ? 'What do you want to learn?' : `What does ${displayName} want to learn?`}
            </h1>
          )}
          {showDays && (
            <h1 className="signup-title">What days work best?</h1>
          )}
          {showHasInstrument && (
            <h1 className="signup-title">
              {forSelf ? 'Do you have an instrument?' : `Does ${displayName} have an instrument?`}
            </h1>
          )}
          {showPrefLoc && (
            <h1 className="signup-title">Your location</h1>
          )}
          {showSecLocs && (
            <h1 className="signup-title">Any other locations work?</h1>
          )}

          {showInstruments && (
            <>
              <div className="signup-instruments">
                {INSTRUMENTS.map(inst => (
                  <div
                    key={inst.id}
                    className={`signup-inst-card${selectedInstruments.includes(inst.id) ? ' selected' : ''}`}
                    onClick={() => toggleInstrument(inst.id)}
                  >
                    <span className="signup-inst-emoji">{inst.emoji}</span>
                    <span className="signup-inst-label">{inst.label}</span>
                  </div>
                ))}
              </div>
              <button
                className="signup-next"
                disabled={selectedInstruments.length === 0}
                onClick={advanceStep2}
              >
                Next
              </button>
            </>
          )}

          {showDays && (
            <>
              <div className="signup-pills">
                {DAYS.map(d => (
                  <button
                    key={d}
                    className={`signup-pill${selectedDays.includes(d) ? ' selected' : ''}`}
                    onClick={() => toggleDay(d)}
                  >
                    {d}
                  </button>
                ))}
              </div>
              <button
                className="signup-next"
                disabled={selectedDays.length === 0}
                onClick={advanceStep2}
              >
                Next
              </button>
            </>
          )}

          {showHasInstrument && (
            <>
              <div className="signup-pills">
                {INSTRUMENT_OWN.map(opt => (
                  <button
                    key={opt}
                    className={`signup-pill${hasInstrument === opt ? ' selected' : ''}`}
                    onClick={() => { setHasInstrument(opt); advanceStep2() }}
                  >
                    {opt}
                  </button>
                ))}
              </div>
              {hasInstrument === 'No' && (
                <div className="signup-soft-msg">No problem — we can help you find something.</div>
              )}
            </>
          )}

          {showPrefLoc && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 18px', background: 'rgba(255,255,255,0.04)', border: `1.5px solid ${LOCATIONS[preferredLoc].accentColor}40`, borderRadius: 14 }}>
                <MapPin size={18} style={{ color: LOCATIONS[preferredLoc].accentColor, flexShrink: 0 }} />
                <span style={{ fontSize: 17, fontWeight: 700, color: LOCATIONS[preferredLoc].accentColor }}>{LOCATIONS[preferredLoc].name}</span>
              </div>
              <p style={{ fontSize: 12, color: '#777', margin: '6px 0 0', textAlign: 'center' }}>Based on the page you came from</p>
              <button className="signup-next" onClick={advanceStep2} style={{ marginTop: 12 }}>Next</button>
            </>
          )}

          {showSecLocs && (
            <>
              <div className="signup-pills">
                {LOC_OPTIONS.filter(l => l.key !== preferredLoc).map(loc => (
                  <button
                    key={loc.key}
                    className={`signup-pill${secondaryLocs.includes(loc.key) ? ' selected' : ''}`}
                    onClick={() => toggleSecondaryLoc(loc.key)}
                  >
                    {loc.label}
                  </button>
                ))}
              </div>
              <button className="signup-next" onClick={() => goToStep(3)}>
                Next
              </button>
              <button className="signup-skip" onClick={() => goToStep(3)}>
                Skip
              </button>
            </>
          )}
        </div>
      </div>
    )
  }

  const renderStep3 = () => (
    <div className="signup-step-wrap">
      <div className={`signup-step ${slideClass}`}>
        <BackButton />
        <h1 className="signup-title">{enrollmentType === 'gift' ? 'Who should we contact about this gift?' : 'How do we reach you?'}</h1>

        {!forSelf && (
          <div className="signup-field">
            <div className="signup-label">{enrollmentType === 'gift' ? 'Your full name (gift giver)' : 'Parent / Guardian full name'}</div>
            <input
              className="signup-input"
              placeholder="Full name"
              value={parentName}
              onChange={e => setParentName(e.target.value)}
              autoFocus
            />
          </div>
        )}

        <div className="signup-field">
          <div className="signup-label">Email</div>
          <input
            className="signup-input"
            type="email"
            placeholder="your@email.com"
            value={email}
            onChange={e => setEmail(e.target.value)}
            autoFocus={forSelf === true}
          />
        </div>

        <div className="signup-field">
          <div className="signup-label">Phone</div>
          <input
            className="signup-input"
            type="tel"
            placeholder="(555) 123-4567"
            value={phone}
            onChange={e => handlePhoneChange(e.target.value)}
          />
        </div>

        <div className="signup-toggle-wrap">
          <span className="signup-toggle-label">Are you a military family?</span>
          <label className="signup-toggle">
            <input type="checkbox" checked={isMilitary} onChange={e => setIsMilitary(e.target.checked)} />
            <span className="signup-toggle-track" />
            <span className="signup-toggle-thumb" />
          </label>
        </div>

        {locationHours.length > 0 && (
          <div style={{ margin: '12px 0', padding: '10px 14px', background: 'rgba(255,255,255,0.04)', borderRadius: 10, border: '1px solid rgba(255,255,255,0.08)', width: '100%', boxSizing: 'border-box', textAlign: 'left' }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#aaa', marginBottom: 4 }}>{siteLoc.name} Hours</div>
            {locationHours.map((line, i) => (
              <div key={i} style={{ fontSize: 12, color: '#888', lineHeight: 1.5 }}>{line}</div>
            ))}
          </div>
        )}

        {emailError && (
          <div style={{ color: '#ff4444', fontSize: 13, marginTop: -4, marginBottom: 8, textAlign: 'left', width: '100%' }}>{emailError}</div>
        )}

        <div className="signup-sticky-cta">
          <button
            className="signup-next"
            disabled={
              (!forSelf && !parentName.trim()) ||
              !email.trim() ||
              !phone.trim()
            }
            onClick={() => {
              const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
              if (!emailRegex.test(email.trim())) {
                setEmailError('Please enter a valid email address.')
                return
              }
              setEmailError('')
              goToStep(4)
            }}
          >
            Next
          </button>
        </div>
      </div>
    </div>
  )

  const renderStep4 = () => (
    <div className="signup-step-wrap">
      <div className={`signup-step ${slideClass}`}>
        <BackButton />
        <h1 className="signup-title">
          {additionalStudents.length === 0
            ? (forSelf
              ? 'Is there anyone else in your family interested in lessons?'
              : `Is ${displayName} the only one joining, or does someone else want lessons too?`)
            : `Are ${buildStudentListText()} the only ones joining, or does someone else want lessons too?`}
        </h1>

        {additionalStudents.length > 0 && (
          <div className="signup-added-students">
            {additionalStudents.map((s, i) => (
              <div key={i} className="signup-added-student">
                <div>
                  <div className="signup-added-student-name">{s.name}</div>
                  <div className="signup-added-student-inst">
                    {s.instruments.map(id => INSTRUMENTS.find(inst => inst.id === id)?.label || id).join(', ') || 'No instrument selected'}
                  </div>
                </div>
                <button
                  className="signup-added-remove"
                  onClick={() => setAdditionalStudents(prev => prev.filter((_, idx) => idx !== i))}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}

        {addingStudent ? (
          <div className="signup-add-student">
            <div className="signup-add-student-title">
              Additional student #{additionalStudents.length + 1}
            </div>
            <div className="signup-field">
              <div className="signup-label">Name</div>
              <input
                className="signup-input"
                placeholder="First name"
                value={addStudentName}
                onChange={e => setAddStudentName(e.target.value)}
                autoFocus
              />
            </div>
            <div className="signup-field">
              <div className="signup-label">What instrument?</div>
              <div className="signup-instruments">
                {INSTRUMENTS.map(inst => (
                  <div
                    key={inst.id}
                    className={`signup-inst-card${addStudentInstruments.includes(inst.id) ? ' selected' : ''}`}
                    onClick={() =>
                      setAddStudentInstruments(prev =>
                        prev.includes(inst.id) ? prev.filter(i => i !== inst.id) : [...prev, inst.id]
                      )
                    }
                  >
                    <span className="signup-inst-emoji">{inst.emoji}</span>
                    <span className="signup-inst-label">{inst.label}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="signup-field">
              <div className="signup-label">Personality / learning style</div>
              <textarea
                className="signup-input signup-textarea"
                placeholder="What should we know about their personality or learning style?"
                value={addStudentBio}
                onChange={e => setAddStudentBio(e.target.value)}
              />
            </div>
            <div className="signup-field">
              <div className="signup-label">Goals</div>
              <textarea
                className="signup-input signup-textarea"
                placeholder="What are they hoping to get out of lessons?"
                value={addStudentGoals}
                onChange={e => setAddStudentGoals(e.target.value)}
              />
            </div>
            <button
              className="signup-next"
              disabled={!addStudentName.trim() || !addStudentBio.trim() || !addStudentGoals.trim()}
              onClick={confirmAddStudent}
            >
              Add Student
            </button>
          </div>
        ) : (
          <div className="signup-action-btns">
            <button
              className="signup-action-btn primary"
              onClick={() => goToStep(5)}
            >
              {additionalStudents.length === 0
                ? (forSelf ? 'Just me' : `Just ${displayName}`)
                : `Just ${buildStudentListText()}`}
            </button>
            {additionalStudents.length < 3 && (
              <button
                className="signup-action-btn secondary"
                onClick={() => setAddingStudent(true)}
              >
                Add Another Student
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )

  const renderStep5 = () => (
    <div className="signup-step-wrap">
      <div className={`signup-step ${slideClass}`}>
        <BackButton />
        <h1 className="signup-title">One last thing — how did you hear about us?</h1>
        <div className="signup-pills">
          {HEAR_OPTIONS.map(opt => (
            <button
              key={opt}
              className={`signup-pill${referralSource === opt ? ' selected' : ''}`}
              onClick={() => { setReferralSource(opt); goToStep(6) }}
            >
              {opt}
            </button>
          ))}
        </div>
      </div>
    </div>
  )

  const renderStep6 = () => {
    if (matchLoading) {
      return (
        <div className="signup-step-wrap">
          <div className="signup-loading">
            <div className="signup-spinner" />
            <div className="signup-loading-text">
              Finding your perfect match... we take this very seriously.
            </div>
          </div>
        </div>
      )
    }

    const showScore = matchScore !== null && matchScore >= 91
    const locName = LOCATIONS[preferredLoc].name

    return (
      <div className="signup-step-wrap">
        <div className={`signup-step ${slideClass}`}>
          <div className="signup-score">
            {/* Confetti */}
            <div className="signup-confetti">
              {confettiParticles.map((p, i) => (
                <div
                  key={i}
                  className="signup-confetti-particle"
                  style={{
                    left: p.left,
                    animationDelay: p.delay,
                    width: p.size,
                    height: p.size,
                    opacity: p.opacity,
                  }}
                />
              ))}
            </div>

            {(() => {
              const totalStudents = 1 + additionalStudents.length
              const matchMsg = totalStudents === 1
                ? `We found an amazing match for ${forSelf ? 'you' : displayName}!`
                : totalStudents === 2
                ? `We found amazing matches for ${buildStudentListText()}!`
                : 'We found amazing matches for everyone!'
              return showScore ? (
                <>
                  <div className="signup-score-number">{matchScore}%</div>
                  <div className="signup-score-label">Compatibility Match</div>
                  <div className="signup-score-msg">{matchMsg}</div>
                  {matchedTeacher?.customer_facing_match_summary && (
                    <div className="signup-score-teacher">
                      {matchedTeacher.customer_facing_match_summary}
                    </div>
                  )}
                </>
              ) : (
                <>
                  <div className="signup-score-number" style={{ fontSize: 72 }}>✨</div>
                  <div className="signup-score-label" style={{ marginTop: 12 }}>Amazing Match Found!</div>
                  <div className="signup-score-msg">{matchMsg}</div>
                </>
              )
            })()}

            <div style={{ fontSize: 13, color: '#888', textAlign: 'center', marginTop: 8, marginBottom: 16 }}>
              We ran the numbers. The numbers are excited.
            </div>
            <div className="signup-score-sub">
              We're reaching out ASAP — expect to hear from us within the hour during business hours.
            </div>

            {submitError && (
              <div style={{
                color: '#fff', fontSize: 14, textAlign: 'center', marginBottom: 16,
                padding: '14px 20px', background: 'rgba(231,76,60,0.2)',
                border: '1px solid rgba(231,76,60,0.4)', borderRadius: 10,
                lineHeight: 1.6,
              }}>
                <div style={{ fontWeight: 700, marginBottom: 4 }}>{submitError}</div>
                <div style={{ fontSize: 12, color: '#ccc' }}>
                  If this keeps happening, call us directly at{' '}
                  <a href={`tel:${LOCATIONS[preferredLoc].phone.replace(/\D/g, '')}`} style={{ color: 'var(--c)', fontWeight: 700, textDecoration: 'underline' }}>
                    {LOCATIONS[preferredLoc].phone}
                  </a>
                  {' '}— we'll get you signed up on the spot.
                </div>
              </div>
            )}
            <button
              className="signup-cta"
              onClick={handleSubmit}
              disabled={submitting}
            >
              {submitting ? 'Submitting...' : 'Complete Enrollment →'}
            </button>
          </div>
        </div>
      </div>
    )
  }

  const bgNotes = useMemo(() => {
    const glyphs = ['♪', '♫', '♩', '♬', '𝅘𝅥𝅮']
    return Array.from({ length: 9 }, (_, i) => ({
      glyph: glyphs[i % glyphs.length],
      left: `${(i * 11 + Math.random() * 8) % 100}%`,
      delay: `${Math.random() * 14}s`,
      dur: `${18 + Math.random() * 10}s`,
      size: 16 + Math.random() * 14,
      drift: `${(Math.random() * 80 - 40).toFixed(0)}px`,
    }))
  }, [])

  return (
    <div className="signup-page">
      {/* Floating music notes background */}
      <div className="signup-bgnotes" aria-hidden="true">
        {bgNotes.map((n, i) => (
          <span
            key={i}
            className="signup-bgnote"
            style={{
              left: n.left,
              animationDelay: n.delay,
              animationDuration: n.dur,
              fontSize: n.size,
              ['--drift' as any]: n.drift,
            }}
          >{n.glyph}</span>
        ))}
      </div>

      <SiteHeader activeInstrument={detectedInstrument ?? undefined} />

      {/* Progress bar */}
      <div className="signup-progress">
        <div
          className="signup-progress-fill"
          style={{ width: `${(step / (totalSteps - 1)) * 100}%` }}
        />
      </div>

      <div className="signup-body">
        {step === 0 && renderStep0()}
        {step === 1 && renderStep1()}
        {step === 2 && renderStep2()}
        {step === 3 && renderStep3()}
        {step === 4 && renderStep4()}
        {step === 5 && renderStep5()}
        {step === 6 && renderStep6()}
      </div>

      <footer
        className="signup-zw-footer"
        style={{
          textAlign: 'center',
          padding: '20px 16px 28px',
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          color: 'rgba(255,255,255,0.28)',
        }}
      >
        {ZW.musicSchoolsPowered}
        <span style={{ margin: '0 0.6em', opacity: 0.5 }}>·</span>
        {ZW.poweredBy}
      </footer>
    </div>
  )
}
