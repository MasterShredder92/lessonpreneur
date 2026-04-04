import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase as anon } from '../lib/supabase'
import InstrumentTabBar from '../components/shared/InstrumentTabBar'
import EnrollmentForm from '../components/enrollment/EnrollmentForm'
import { usePublicTenantId } from '../hooks/usePublicTenantId'
import { useRouteLocationKey } from '../config/LocationContext'
import { LOCATIONS, ALL_LOC_KEYS, LOC_TO_OPT, type LocKey } from '../config/locations'
import { useLocationTracking } from '../hooks/useLocationTracking'
import ReviewsSection from '../components/site/ReviewsSection'
import SiteHeader from '../components/site/SiteHeader'
import './adkins.css'

// ═══════════════════════════════════════
// DATA — sourced from central config
// ═══════════════════════════════════════

/** Adapter: map central LocationConfig to the shape the template uses */
function L(key: LocKey) {
  const loc = LOCATIONS[key]
  return {
    c: loc.accentColor, cg: loc.accentGlow, cl: loc.accentLight,
    name: loc.name, full: loc.fullName, badge: loc.badge, dbId: loc.locationId,
    address: loc.address, phone: loc.phone,
    reviews: loc.reviews.map(r => ({ t: r.text, n: r.name, r: r.role })),
  }
}

interface ChatStep {
  id: string; type: 'single' | 'multi' | 'text' | 'contact'
  q: (loc: LocKey, a: string[]) => string
  opts?: string[]; placeholder?: string
}

const FLOWS: ChatStep[] = [
  { id: 'who', type: 'single', q: (loc) => `Hey! I'm Cornelius \u{1F33D} Welcome to ${LOCATIONS[loc].fullName}! First things first — who are we signing up today?`, opts: ['My kid', 'Myself'] },
  { id: 'age', type: 'single', q: (_, a) => a[0] === 'My kid' ? 'How old is your child?' : 'How old are you?', opts: ['Under 5', '5 – 10', '11 – 17', '18 – 25', '26 or older'] },
  { id: 'instrument', type: 'multi', q: () => 'Which instruments are you interested in? Tap all that apply! \u{1F3B5}', opts: ['\u{1F3B9} Piano', '\u{1F3B8} Guitar', '\u{1F3A4} Vocals', '\u{1F941} Drums', '\u{1F3BB} Violin', 'Something else'] },
  { id: 'experience', type: 'single', q: (_, a) => a[0] === 'My kid' ? 'What is their current experience level?' : 'What is your current experience level?', opts: ['None — total beginner', '1 – 2 years', '2 – 4 years', '4+ years'] },
  { id: 'has_instrument', type: 'single', q: () => 'Does the student have their own instrument?', opts: ['Yes, they have one', 'No, not yet', 'Need help getting one', 'Not applicable'] },
  { id: 'location', type: 'multi', q: () => 'Which location works best? Tap all that apply! \u{1F4CD}', opts: ['Bellevue (13th & Harlan)', 'Omaha (96th & L)', 'Gretna (203rd Hwy 370)', 'Elkhorn (204th & Hwy 6)'] },
  { id: 'days', type: 'multi', q: () => 'What days work best for your schedule? Tap all that apply! \u{1F4C5}', opts: ['Mon 3:30–9pm', 'Tue 3:30–9pm', 'Wed 3:30–9pm', 'Thu 3:30–9pm', 'Sat 10am–3pm', 'Any of these work', 'None of these work'] },
  { id: 'military', type: 'single', q: () => 'Is this student part of a military family?', opts: ['Yes', 'No'] },
  { id: 'personality', type: 'text', q: (_, a) => { const who = a[0] === 'My kid' ? 'your child' : 'yourself'; return `Almost there! \u{1F3AF} This is where the magic happens — it is what locks in your compatibility score. Tell us a little about ${who}: personality, learning style, goals, anything that helps us find the perfect teacher.`; }, placeholder: 'e.g. My daughter is shy at first but loves performing. She wants to play Taylor Swift songs and eventually join a band...' },
  { id: 'contact', type: 'contact', q: () => 'Perfect — we have everything we need to find your match. Last step: how do we reach you? We will get you set up to book your first lesson within 24 hours! \u{1F4F1}' },
  { id: 'source', type: 'single', q: () => 'One last quick question — how did you hear about us?', opts: ['Facebook', 'Instagram', 'Google', 'Signage', 'Driving by', 'Referral', 'Other'] },
]

const HERO_REVIEWS: Record<LocKey, { text: string; name: string }> = {
  omaha: { text: 'We started with one child in guitar and loved the quality of teaching so much we have 3 kids in 4 different instruments!', name: 'Charles Burkett' },
  gretna: { text: 'I have been taking guitar lessons here since they opened. I started at 49. What started as a short goal turned into a lifelong passion.', name: 'Josh W' },
  bellevue: { text: 'Our 10 year old wanted to try the drums and now we have a music-obsessed kid who practices daily and is already talking about joining a band.', name: 'Chris Corley' },
  elkhorn: { text: 'My son has been taking guitar lessons here a couple of months and is progressing from beginner to intermediate quickly.', name: 'Speed Junkie 707' },
}

const INSTRUMENTS: { emoji: string; name: string; sub: string; core?: boolean; dashed?: boolean; desc?: string; why?: string }[] = [
  { emoji: '\u{1F3B9}', name: 'Piano', sub: 'Most Popular', core: true, desc: 'Piano is the foundation of music theory. Students learn to read music, develop both hands independently, and build a skill set that transfers to every other instrument. Great for all ages and all goals.', why: 'Our piano teachers are matched to your learning style — whether you want classical technique, pop songs, or just to finally understand how music works.' },
  { emoji: '\u{1F3B8}', name: 'Guitar', sub: 'Electric & Acoustic', core: true, desc: 'From acoustic to electric, beginner strumming to advanced lead playing — our guitar lessons meet you exactly where you are. Students learn chords, scales, songs they actually want to play, and real technique that sticks.', why: 'Adkins was built on guitar. Our founder is a national guitar competition winner. This is what we do.' },
  { emoji: '\u{1F3A4}', name: 'Vocals', sub: 'All Styles', core: true, desc: 'Singing lessons are about more than hitting notes. Students develop breath control, tone, range, confidence, and stage presence. We work with complete beginners and experienced performers alike.', why: 'Our vocal teachers specialize in finding your natural voice — not teaching you to sound like someone else.' },
  { emoji: '\u{1F941}', name: 'Drums', sub: 'Rock to Jazz', core: true, desc: 'Drumming builds coordination, timing, and musicality from the very first lesson. Students work on rhythm, technique, and playing along to real music — not just exercises.', why: 'Our drum rooms are fully equipped and soundproofed. Real kits, real lessons, real progress.' },
  { emoji: '\u{1F3BB}', name: 'Violin', sub: 'Select Locations', desc: 'Violin takes patience and the right teacher. Our violin students develop proper posture, tone production, and musicality in a structured but encouraging environment.', why: 'We match violin students with teachers who specialize in their age group and goals — classical training or contemporary styles.' },
  { emoji: '\u{1FA88}', name: 'Flute', sub: 'Select Locations', desc: 'Flute is one of the most expressive instruments in any genre. Students develop breath support, finger technique, and tone from day one in a fun, structured environment.', why: 'Our flute teachers make the first lesson the best one — no frustration, just progress.' },
  { emoji: '\u{1F3B8}', name: 'Bass', sub: 'Electric Bass', dashed: true },
  { emoji: '\u{2795}', name: 'More', sub: 'Just Ask', dashed: true },
]


function playNote() {
  try {
    const ctx = new AudioContext()
    const o1 = ctx.createOscillator(); const g1 = ctx.createGain()
    o1.connect(g1); g1.connect(ctx.destination)
    o1.type = 'sawtooth'
    o1.frequency.setValueAtTime(330, ctx.currentTime)
    o1.frequency.exponentialRampToValueAtTime(220, ctx.currentTime + 0.35)
    g1.gain.setValueAtTime(0.28, ctx.currentTime)
    g1.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6)
    o1.start(); o1.stop(ctx.currentTime + 0.6)
    const o2 = ctx.createOscillator(); const g2 = ctx.createGain()
    o2.connect(g2); g2.connect(ctx.destination)
    o2.type = 'sawtooth'
    o2.frequency.setValueAtTime(440, ctx.currentTime + 0.1)
    o2.frequency.exponentialRampToValueAtTime(330, ctx.currentTime + 0.45)
    g2.gain.setValueAtTime(0.14, ctx.currentTime + 0.1)
    g2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.65)
    o2.start(ctx.currentTime + 0.1); o2.stop(ctx.currentTime + 0.65)
  } catch (_) { /* ignore */ }
}

// ═══════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════

export default function AdkinsLanding() {
  const tenantId = usePublicTenantId()
  const routeLocKey = useRouteLocationKey()
  const navigate = useNavigate()
  const [loc, setLoc] = useState<LocKey>(routeLocKey ?? 'omaha')
  const [logos, setLogos] = useState<Record<string, string>>({})
  const [tipOpen, setTipOpen] = useState(false)
  const [enrollOpen, setEnrollOpen] = useState(false)
  const [expandedInst, setExpandedInst] = useState<number | null>(null)
  const cardRef = useRef<HTMLDivElement>(null)
  const enrollRef = useRef<HTMLElement>(null)

  // Chat state
  const [chatStep, setChatStep] = useState(0)
  const [chatAnswers, setChatAnswers] = useState<string[]>([])
  const [chatMsgs, setChatMsgs] = useState<{ from: 'bot' | 'usr'; text: string }[]>([{ from: 'bot', text: FLOWS[0].q('omaha', []) }])
  const [multiSel, setMultiSel] = useState<string[]>([])
  const [chatDone, setChatDone] = useState(false)
  const [contactForm, setContactForm] = useState({ name: '', parent: '', phone: '', email: '' })
  const [textInput, setTextInput] = useState('')
  const msgsEndRef = useRef<HTMLDivElement>(null)
  const locMountedRef = useRef(false)

  const LD = L(loc)

  // Fire correct GA4 + Meta Pixel for this location
  useLocationTracking(LOCATIONS[loc])

  // Dynamic SEO: page title + meta description per location
  useEffect(() => {
    const l = LOCATIONS[loc]
    document.title = `${l.fullName} | Piano, Guitar, Vocals & Drums — Adkins Music Lessons`
    document.querySelector('meta[name="description"]')?.setAttribute('content',
      `Private music lessons in ${l.name}, NE. Piano, guitar, vocals, drums & more. Expert teachers, flexible scheduling, no contracts. 90-day free trial. ${l.phone}`)
    document.querySelector('meta[property="og:title"]')?.setAttribute('content', `${l.fullName} — Private Music Lessons`)
    document.querySelector('meta[property="og:url"]')?.setAttribute('content', `https://www.lessonpreneur.io${l.route}`)
  }, [loc])

  // Fetch logos from Supabase
  useEffect(() => {
    anon.from('locations').select('id, name, logo_url').then(({ data }) => {
      const map: Record<string, string> = {}
      data?.forEach((l: any) => {
        const key = (l.name as string).split(' ')[0].toLowerCase()
        if (l.logo_url) map[key] = l.logo_url
      })
      setLogos(map)
    })
  }, [])

  // Set CSS vars on location change
  useEffect(() => {
    const r = document.documentElement.style
    r.setProperty('--c', LD.c); r.setProperty('--cg', LD.cg); r.setProperty('--cl', LD.cl)
  }, [loc])

  // Reset chat on location change (skip initial mount — chatMsgs already initialized)
  useEffect(() => {
    if (!locMountedRef.current) { locMountedRef.current = true; return }
    setChatStep(0); setChatAnswers([]); setMultiSel([]); setChatDone(false)
    setTextInput(''); setContactForm({ name: '', parent: '', phone: '', email: '' })
    setChatMsgs([{ from: 'bot', text: FLOWS[0].q(loc, []) }])
  }, [loc])

  // Auto-scroll chat only after user interaction (more than the initial bot message)
  useEffect(() => {
    if (chatMsgs.length <= 1) return
    const el = msgsEndRef.current?.parentElement
    if (el) el.scrollTop = el.scrollHeight
  }, [chatMsgs])

  const goEnroll = useCallback(() => setEnrollOpen(true), [])

  // 3D tilt
  const handleTilt = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!cardRef.current) return
    const r = e.currentTarget.getBoundingClientRect()
    const x = ((e.clientX - r.left) / r.width - 0.5) * 28
    const y = -((e.clientY - r.top) / r.height - 0.5) * 28
    cardRef.current.style.transform = `perspective(800px) rotateY(${x}deg) rotateX(${y}deg)`
  }, [])
  const resetTilt = useCallback(() => { if (cardRef.current) cardRef.current.style.transform = 'perspective(800px) rotateY(0deg) rotateX(0deg)' }, [])

  // Chat answer handler
  async function advance(val: string, step: number) {
    const newAnswers = [...chatAnswers]
    newAnswers[step] = val
    setChatAnswers(newAnswers)

    const disp = val.length > 72 ? val.substring(0, 72) + '...' : val
    const newMsgs = [...chatMsgs, { from: 'usr' as const, text: disp }]

    const nextStep = step + 1
    if (nextStep < FLOWS.length) {
      const botMsg = FLOWS[nextStep].q(loc, newAnswers)
      setChatMsgs([...newMsgs, { from: 'bot' as const, text: botMsg }])
      setChatStep(nextStep)
      // Pre-select current location on the location step
      setMultiSel(FLOWS[nextStep].id === 'location' ? [LOC_TO_OPT[loc]] : [])
      setTextInput('')
      setContactForm({ name: '', parent: '', phone: '', email: '' })
    } else {
      // Done — show temporary message while matching
      setChatMsgs([...newMsgs, { from: 'bot' as const, text: 'Finding your best teacher match...' }])
      setChatDone(true)
      setChatStep(nextStep)

      // Extract instrument (first selected, strip emoji, lowercase)
      const rawInstruments = (newAnswers[2] ?? '').split(',').map(s => s.trim())
      const firstInstr = rawInstruments[0]?.replace(/[\u{1F000}-\u{1FFFF}]/gu, '').trim().toLowerCase() || 'piano'

      // Extract location names from step 5 — map option text to full location names
      const locOptToName: Record<string, string> = Object.fromEntries(
        ALL_LOC_KEYS.map(k => [LOC_TO_OPT[k], LOCATIONS[k].fullName])
      )
      const selectedLocs = (newAnswers[5] ?? '').split(',').map(s => s.trim())
      const locationNames = selectedLocs.map(s => locOptToName[s] ?? s).filter(Boolean)
      if (locationNames.length === 0) locationNames.push(LOCATIONS[loc].fullName)

      // Call real teacher matching RPC
      let matchScore = 0
      let matchName = ''
      try {
        const { data: matchData } = await anon.rpc('match_teacher', {
          p_tenant_id: tenantId!,
          p_instrument: firstInstr,
          p_location_names: locationNames,
          p_age_range: newAnswers[1] ?? '',
          p_personality_notes: newAnswers[8] ?? '',
        })
        if (matchData && matchData.length > 0) {
          matchScore = matchData[0].score ?? 0
          matchName = matchData[0].first_name ?? ''
        }
      } catch (err) {
        console.error('Teacher match RPC failed:', err)
      }

      // Display result based on score
      let finalMsg: string
      if (matchScore >= 90) {
        finalMsg = `\u{1F3AF} Your compatibility score is ${matchScore}%! We found an excellent teacher match${matchName ? ` — ${matchName} is going to be perfect` : ''}. You can book your first lesson within 24 hours! \u{1F3B5}`
      } else if (matchScore >= 75) {
        finalMsg = '\u{1F3B5} We found a great match for you! You can book your first lesson within 24 hours!'
      } else {
        finalMsg = '\u{1F3B5} We will find the right teacher for you \u2014 book your first lesson within 24 hours!'
      }
      setChatMsgs(prev => [...prev.slice(0, -1), { from: 'bot' as const, text: finalMsg }])

      // Save lead to Supabase
      const contact = newAnswers[9]?.split('|') ?? []
      anon.from('leads').insert({
        tenant_id: tenantId!,
        location_id: LD.dbId,
        who: newAnswers[0] ?? null,
        age: newAnswers[1] ?? null,
        instrument: newAnswers[2] ?? null,
        experience: newAnswers[3] ?? null,
        notes: [
          `Has instrument: ${newAnswers[4] ?? 'N/A'}`,
          `Preferred locations: ${newAnswers[5] ?? 'N/A'}`,
          `Preferred days: ${newAnswers[6] ?? 'N/A'}`,
          `Military: ${newAnswers[7] ?? 'N/A'}`,
          `Personality: ${newAnswers[8] ?? 'N/A'}`,
          `Source: ${newAnswers[10] ?? 'N/A'}`,
          `Compatibility score: ${matchScore}%`,
        ].join('\n'),
        student_first_name: contact[0] ?? null,
        parent_name: contact[1] ?? null,
        phone: contact[2] ?? null,
        email: contact[3] ?? null,
        source: 'website',
        status: 'new',
      }).then(({ error }) => { if (error) console.error('Lead save failed:', error) })
    }
  }

  const logoUrl = logos[loc] || ''

  return (
    <div className="ak-page">
      <SiteHeader />

      {/* HERO — single column, everything above the fold */}
      <section className="ak-hero">
        <div className="ak-hbg-glow" />
        <div className="ak-hgrid" />
        <div className="ak-hcontent">
          <h1 className="ak-htitle">
            <span className="ak-htitle-line1">You Were Born</span>
            <span className="ak-htitle-line2">to Play Music.</span>
          </h1>
          <div className="ak-hlogo" onMouseMove={handleTilt} onMouseLeave={resetTilt}>
            <div className="ak-lcard" ref={cardRef}>
              <div className="ak-lring">
                {logoUrl && <img src={logoUrl} alt={LD.name} />}
              </div>
            </div>
          </div>
          <div className="ak-henroll-badge">Now Enrolling in {LD.name}</div>
          <p className="ak-hsub">Private one-on-one lessons for kids, teens, and adults. No contracts. Month to month. Expert teachers who show up — every single time.</p>
          <div className="ak-hreview">
            <p className="ak-hreview-text">"{HERO_REVIEWS[loc].text}"</p>
            <span className="ak-hreview-name">— {HERO_REVIEWS[loc].name}</span>
          </div>
          <button className="ak-btnp ak-hero-cta" onClick={goEnroll}>Enroll Now {'\u{2192}'}</button>
        </div>
      </section>

      {/* COMPATIBILITY */}
      <section className="ak-compat-sec">
        <div className="ak-compat-inner">
          <div className="ak-slbl">Our Matching System</div>
          <h2 className="ak-stitle">We Find You <em>The Right Teacher.</em></h2>
          <p className="ak-csub">Over a decade of music education experience and a deep profile of every teacher we have — combined into a compatibility system that matches you or your child to the teacher most likely to make them fall in love with music.</p>
          <div className="ak-ccard">
            <div className="ak-cscore-row">
              <div className="ak-sring"><div className="ak-snum">95</div><div className="ak-spct">% MATCH</div></div>
              <div className="ak-sdetails">
                <h3>We Found Your Match {'\u{1F3B5}'}</h3>
                <p>Based on answers to our enrollment questions, we identify a teacher with a high compatibility score. We only show the number when we are confident.</p>
              </div>
            </div>
            <div className="ak-cbars">
              {[{ l: 'Personality', v: 96 }, { l: 'Schedule', v: 100 }, { l: 'Age Experience', v: 92 }, { l: 'Teaching Style', v: 94 }].map(b => (
                <div className="ak-cbrow" key={b.l}>
                  <span className="ak-cblbl">{b.l}</span>
                  <div className="ak-cbtrack"><div className="ak-cbfill" style={{ width: `${b.v}%` }} /></div>
                  <span className="ak-cbval">{b.v}%</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* PAIN POINTS */}
      <section className="ak-sec">
        <div className="ak-slbl">We Know What You Are Thinking</div>
        <h2 className="ak-stitle">We Have Heard Every<br />Concern Before.</h2>
        <p className="ak-secdesc">Most parents have been through music lessons that did not stick. Teachers who cancelled, studios that locked you into contracts, kids who gave up after a month. We built everything around making sure that does not happen here.</p>
        <div className="ak-pgrid">
          {[
            { icon: '\u{1F61F}', title: '"What if they want to quit?"', desc: 'Month to month. Cancel anytime, no questions asked. We are so confident you or your child will love it that we do not need a contract to keep you here.' },
            { icon: '\u{1F4F5}', title: '"Teachers always cancel on us"', desc: 'Every teacher is background-checked and held to strict attendance standards. When a teacher is out, we find a substitute. You never lose a session.' },
            { icon: '\u{1F382}', title: '"I am too old to start"', desc: 'Adults actually progress faster than kids when they have the right teacher — because you have discipline, focus, and real motivation. You just never had the right guide.' },
            { icon: '\u{1F4C5}', title: '"Our schedule is packed"', desc: 'After school, evenings, weekends — we build around your life, not ours. Flexible scheduling that works for real families.' },
          ].map((p, i) => (
            <div className="ak-pcard" key={i}>
              <span className="ak-picon">{p.icon}</span>
              <h3>{p.title}</h3>
              <p>{p.desc}</p>
            </div>
          ))}
        </div>
        <div className="ak-pcta-box">
          <h3>Stop Wondering. Start Playing.</h3>
          <p>We will match your family with the perfect teacher and have your first lesson on the calendar within 24 hours.</p>
          <button className="ak-btnp" onClick={goEnroll}>Check Availability Now {'\u{2192}'}</button>
        </div>
      </section>

      {/* 3 STEPS */}
      <section className="ak-steps-sec">
        <div style={{ textAlign: 'center' }}>
          <div className="ak-slbl">Ridiculously Simple</div>
          <h2 className="ak-stitle">3 Steps to Your First Lesson</h2>
        </div>
        <div className="ak-sgrid">
          {[
            { n: 1, title: 'Tell us about your family', desc: '30 seconds. Instrument, age, and availability. That is it for now.' },
            { n: 2, title: 'We find your match', desc: 'Our system picks the teacher most likely to connect with you or your child — not just whoever is available.' },
            { n: 3, title: 'Book your first lesson within 24 hours', desc: 'Most families have their first lesson locked in same day.' },
          ].map(s => (
            <div className="ak-scard" key={s.n}>
              <div className="ak-snum2">{s.n}</div>
              <h3>{s.title}</h3>
              <p>{s.desc}</p>
            </div>
          ))}
        </div>
        <div style={{ textAlign: 'center', marginTop: 36 }}>
          <button className="ak-btnp" onClick={goEnroll}>Get Started — Free to Try {'\u{2192}'}</button>
        </div>
      </section>

      {/* INSTRUMENTS */}
      <section className="ak-sec">
        <div style={{ textAlign: 'center' }}>
          <div className="ak-slbl">What We Teach</div>
          <h2 className="ak-stitle">Pick Your Instrument</h2>
        </div>
        <div className="ak-igrid">
          {INSTRUMENTS.map((inst, i) => {
            const isOpen = expandedInst === i
            const hasPanel = !!inst.desc
            return (
              <div key={i} className="ak-icard-wrap" style={{ gridColumn: isOpen ? '1 / -1' : undefined }}>
                <div
                  className={`ak-icard${inst.dashed ? ' dashed' : ''}${isOpen ? ' open' : ''}`}
                  onClick={() => hasPanel && setExpandedInst(isOpen ? null : i)}
                  style={{ cursor: hasPanel ? 'pointer' : 'default' }}
                >
                  {inst.core && <span className="ak-cbadge">Core</span>}
                  <span className="ak-iem">{inst.emoji}</span>
                  <h3>{inst.name}</h3>
                  <p>{inst.sub}</p>
                  {hasPanel && (
                    <span className={`ak-ichev${isOpen ? ' rot' : ''}`}>
                      <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                    </span>
                  )}
                </div>
                {isOpen && inst.desc && (
                  <div className="ak-ipanel" style={{ borderLeftColor: LD.c }}>
                    <div className="ak-ipanel-desc">
                      <p>{inst.desc}</p>
                    </div>
                    <div className="ak-ipanel-why">
                      <div className="ak-ipanel-wlbl" style={{ color: LD.c }}>Why We Are Great at This</div>
                      <p>{inst.why}</p>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </section>

      {/* REVIEWS */}
      <section className="ak-rev-sec">
        <div style={{ textAlign: 'center' }}>
          <div className="ak-slbl">Real Families. Real Results.</div>
          <h2 className="ak-stitle">Do Not Take Our Word For It.</h2>
        </div>
        <div className="ak-rgrid">
          {LD.reviews.map((rv, i) => (
            <div className="ak-rcard" key={`${loc}-${i}`}>
              <div className="ak-stars">{'\u{2B50}\u{2B50}\u{2B50}\u{2B50}\u{2B50}'}</div>
              <p className="ak-rtext">"{rv.t}"</p>
              <div className="ak-reviewer">
                <div className="ak-ravatar">{rv.n[0]}</div>
                <div><div className="ak-rname">{rv.n}</div><div className="ak-rrole">{rv.r}</div></div>
              </div>
            </div>
          ))}
        </div>
        <div style={{ textAlign: 'center', marginTop: 36 }}>
          <button className="ak-btnp" onClick={goEnroll}>Join These Students {'\u{2192}'}</button>
        </div>
      </section>

      {/* ENROLLMENT CHAT */}
      <section className="ak-enroll-sec" ref={enrollRef}>
        <div className="ak-einner">
          <div style={{ textAlign: 'center' }}>
            <div className="ak-slbl">Let Cornelius Help</div>
            <h2 className="ak-stitle">Ready? Takes About 2 Minutes.</h2>
            <p style={{ fontSize: 15, color: '#9A96B4', marginTop: 10 }}>Answer a few quick questions and book your first lesson within 24 hours.</p>
          </div>
          <div className="ak-chat-ui">
            <div className="ak-ctopbar">
              <img className="ak-cava" src="/cornelius.png" alt="Cornelius" />
              <div className="ak-cinfo"><h4>Cornelius Cobb</h4><p>{LD.full}</p></div>
              <div className="ak-odot" />
            </div>
            <div className="ak-cmsgs">
              {chatMsgs.map((m, i) => (
                <div key={i} className={`ak-cmsg ${m.from}`}>
                  <div className="ak-cbub">{m.text}</div>
                </div>
              ))}
              <div ref={msgsEndRef} />
            </div>
            {!chatDone && chatStep < FLOWS.length && (
              <div className="ak-copts">
                {FLOWS[chatStep].type === 'single' && FLOWS[chatStep].opts?.map(op => (
                  <button key={op} className="ak-copt" onClick={() => advance(op, chatStep)}>{op}</button>
                ))}
                {FLOWS[chatStep].type === 'multi' && (
                  <>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, width: '100%' }}>
                      {FLOWS[chatStep].opts?.map(op => (
                        <button key={op} className={`ak-copt${multiSel.includes(op) ? ' sel' : ''}`} onClick={() => setMultiSel(s => s.includes(op) ? s.filter(v => v !== op) : [...s, op])}>{op}</button>
                      ))}
                    </div>
                    <button className="ak-copt sel" style={{ width: '100%', marginTop: 5 }} onClick={() => advance(multiSel.length > 0 ? multiSel.join(', ') : 'No preference', chatStep)}>Next {'\u{2192}'}</button>
                  </>
                )}
                {FLOWS[chatStep].type === 'text' && (
                  <div style={{ width: '100%', padding: '3px 0' }}>
                    <textarea className="ak-tinp" placeholder={FLOWS[chatStep].placeholder} value={textInput} onChange={e => setTextInput(e.target.value)} />
                    <button className="ak-copt sel" style={{ width: '100%', marginTop: 7 }} onClick={() => { advance(textInput.trim() || 'No details provided', chatStep); setTextInput('') }}>Lock In My Score {'\u{2192}'}</button>
                  </div>
                )}
                {FLOWS[chatStep].type === 'contact' && (
                  <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 7 }}>
                    <input className="ak-cinp" placeholder="Your first name" value={contactForm.name} onChange={e => setContactForm(f => ({ ...f, name: e.target.value }))} />
                    <input className="ak-cinp" placeholder="Parent / guardian name (if for a child)" value={contactForm.parent} onChange={e => setContactForm(f => ({ ...f, parent: e.target.value }))} />
                    <input className="ak-cinp" placeholder="Phone number" type="tel" value={contactForm.phone} onChange={e => setContactForm(f => ({ ...f, phone: e.target.value }))} />
                    <input className="ak-cinp" placeholder="Email address" type="email" value={contactForm.email} onChange={e => setContactForm(f => ({ ...f, email: e.target.value }))} />
                    <button className="ak-copt sel" style={{ marginTop: 3 }} onClick={() => {
                      if (!contactForm.name || !contactForm.phone) return
                      advance(`${contactForm.name}|${contactForm.parent}|${contactForm.phone}|${contactForm.email}`, chatStep)
                    }}>Get My Compatibility Score {'\u{2192}'}</button>
                  </div>
                )}
              </div>
            )}
            {chatDone && (
              <div className="ak-copts" style={{ justifyContent: 'center', fontSize: 13, color: '#9A96B4' }}>
                {'\u{1F389}'} Sit tight — we will reach out very soon!
              </div>
            )}
            <div className="ak-cdots">
              {Array.from({ length: 12 }).map((_, i) => (
                <div key={i} className={`ak-cdot2${i === Math.min(chatStep, 11) ? ' on' : ''}`} />
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* NO RISK */}
      <section className="ak-norisk-sec">
        <div className="ak-nrinner">
          <div className="ak-nri">{'\u{1F6E1}{FE0F}'}</div>
          <h2>We Do Not Believe in<br />Trapping Families.</h2>
          <p>Month to month. Always. If it is not working after the first month, we will make it right — no awkward conversations, no fees, no drama. That is a promise.</p>
          <div className="ak-rpoints">
            {['No long-term contracts', 'Cancel anytime', 'No enrollment fees', 'Month to month billing'].map(r => (
              <div className="ak-rpt" key={r}><div className="ak-rck">{'\u{2713}'}</div>{r}</div>
            ))}
          </div>
          <button className="ak-btnp" onClick={goEnroll}>Start Month-to-Month {'\u{2192}'}</button>
        </div>
      </section>

      {/* ADULTS WELCOME */}
      <section className="ak-sec">
        <div className="ak-adult-card" style={{ borderColor: `${LD.c}30` }}>
          <h2 className="ak-adult-title" style={{ color: LD.c }}>Adults Welcome. Always.</h2>
          <p className="ak-adult-body">Most of our students are kids — but some of our best students are adults. Whether you picked up an instrument as a kid and walked away, or you have always wanted to start and never did, there is no wrong time. Our teachers work with students from age 5 to 95. No judgment. No pressure. Just real progress at your pace.</p>
        </div>
      </section>

      {/* FAQ */}
      <section className="ak-sec">
        <div style={{ textAlign: 'center' }}>
          <div className="ak-slbl">Questions</div>
          <h2 className="ak-stitle">Frequently Asked</h2>
        </div>
        <div className="ak-faq-grid">
          {[
            { q: 'Do you teach adults?', a: 'Absolutely. We have students of all ages and our teachers are experienced working with adult learners. Adults often progress faster than kids because of their focus and life experience. You are not too old. Book a first session and see for yourself.' },
            { q: 'Do I need my own instrument?', a: 'Not necessarily. Some students start without one. During enrollment we will ask and can help you figure out the best path — renting, buying, or borrowing.' },
            { q: 'What if I need to cancel?', a: 'Month to month. Cancel anytime, no questions asked. No contracts, no fees, no drama.' },
            { q: 'How long are lessons?', a: 'Standard lessons are 30 minutes. Some students do 45 or 60 minute sessions depending on age and level.' },
          ].map((f, i) => (
            <div className="ak-faq-card" key={i}>
              <h3 className="ak-faq-q">{f.q}</h3>
              <p className="ak-faq-a">{f.a}</p>
            </div>
          ))}
        </div>
      </section>

      {/* DYNAMIC REVIEWS */}
      <ReviewsSection />

      {/* LOCATION / MAP */}
      <section className="ak-loc-sec">
        <div style={{ textAlign: 'center' }}>
          <div className="ak-slbl">Visit Us</div>
          <h2 className="ak-stitle">{LOCATIONS[loc].fullName}</h2>
        </div>
        <div className="ak-loc-grid">
          <div className="ak-loc-info">
            <div className="ak-loc-row">
              <span className="ak-loc-icon">{'\u{1F4CD}'}</span>
              <div>
                <div className="ak-loc-label">Address</div>
                <div className="ak-loc-value">{LOCATIONS[loc].address}</div>
              </div>
            </div>
            <div className="ak-loc-row">
              <span className="ak-loc-icon">{'\u{1F4DE}'}</span>
              <div>
                <div className="ak-loc-label">Phone</div>
                <a className="ak-loc-value ak-loc-link" href={`tel:${LOCATIONS[loc].phone.replace(/\D/g, '')}`}>{LOCATIONS[loc].phone}</a>
              </div>
            </div>
            <div className="ak-loc-row">
              <span className="ak-loc-icon">{'\u{2709}\u{FE0F}'}</span>
              <div>
                <div className="ak-loc-label">Email</div>
                <a className="ak-loc-value ak-loc-link" href={`mailto:${LOCATIONS[loc].email}`}>{LOCATIONS[loc].email}</a>
              </div>
            </div>
            <div className="ak-loc-row">
              <span className="ak-loc-icon">{'\u{1F552}'}</span>
              <div>
                <div className="ak-loc-label">Hours</div>
                <div className="ak-loc-value">Mon – Thu: 3:00 – 9:00 PM</div>
                <div className="ak-loc-value">Sat – Sun: 10:00 AM – 3:00 PM</div>
              </div>
            </div>
            <a
              className="ak-btnp ak-loc-dir"
              href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(LOCATIONS[loc].address)}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              Get Directions {'\u{2192}'}
            </a>
          </div>
          <div className="ak-loc-map">
            <iframe
              key={loc}
              title={`Map — ${LOCATIONS[loc].fullName}`}
              src={`https://maps.google.com/maps?q=${encodeURIComponent(LOCATIONS[loc].address)}&output=embed`}
              width="100%"
              height="100%"
              style={{ border: 0, borderRadius: 14 }}
              allowFullScreen
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
            />
          </div>
        </div>
      </section>

      {/* FINAL CTA */}
      <section className="ak-final-sec">
        <h2>Your <span>First Lesson</span><br />Is Waiting.</h2>
        <p>Join 3,800+ students across the Omaha metro — kids, teens, and adults. Book in the next 60 seconds.</p>
        <div className="ak-fbtns">
          <button className="ak-btnp" style={{ fontSize: 16, padding: '16px 34px' }} onClick={goEnroll}>Sign Up For Lessons Now {'\u{2192}'}</button>
          <button className="ak-btng" onClick={goEnroll}>Or Text Us First</button>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="ak-footer">
        <div className="ak-fname">{LD.full.toUpperCase()}</div>
        <div style={{ fontSize: 11, color: '#55516E', marginBottom: 8 }}>By Adkins Music Lessons</div>
        <div className="ak-fpow">Powered by <span>Lessonpreneur</span></div>
      </footer>

      {/* CORNELIUS MASCOT */}
      <img
        id="ak-corn"
        src="/cornelius.png"
        alt="Cornelius Cobb"
        onClick={() => { setTipOpen(t => !t); playNote() }}
      />
      <div id="ak-ctip" className={tipOpen ? 'show' : ''}>
        <h4>Hey! I am Cornelius {'\u{1F33D}'}</h4>
        <p>Click me if you have questions, or I can walk you through finding your perfect teacher right now!</p>
        <br />
        <button className="ak-copt" style={{ fontSize: 11, padding: '6px 12px' }} onClick={() => { goEnroll(); setTipOpen(false) }}>Find My Teacher {'\u{2192}'}</button>
      </div>

      {/* Full-screen enrollment form */}
      <EnrollmentForm isOpen={enrollOpen} onClose={() => setEnrollOpen(false)} defaultLocation={loc} />
    </div>
  )
}
