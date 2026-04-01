import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase as anon } from '../lib/supabase'
import InstrumentTabBar from '../components/shared/InstrumentTabBar'
import EnrollmentForm from '../components/enrollment/EnrollmentForm'
import { trackChatStarted, trackChatCompleted, trackLocationSwitched } from '../lib/analytics'
import { usePublicTenantId } from '../hooks/usePublicTenantId'
import ReviewsSection from '../components/site/ReviewsSection'
import SiteHeader from '../components/site/SiteHeader'
import './adkins.css'

// ═══════════════════════════════════════
// DATA
// ═══════════════════════════════════════

type LocKey = 'omaha' | 'bellevue' | 'elkhorn' | 'gretna'

interface LocData {
  c: string; cg: string; cl: string
  name: string; full: string; badge: string; dbId: string
  reviews: { t: string; n: string; r: string }[]
}

const LOCS: Record<LocKey, LocData> = {
  omaha: {
    c: '#D41113', cg: 'rgba(212,17,19,0.22)', cl: 'rgba(212,17,19,0.11)',
    name: 'Omaha', full: 'Omaha Music Lessons', badge: 'Vocals \u2014 Now Enrolling in Omaha',
    dbId: 'd48229c1-b70a-4d29-893e-5079887dab76',
    reviews: [
      { t: "My daughter was terrified to sing in front of anyone. After three months of private lessons, she performed a solo at her school talent show. I cried. Her teacher gave her the confidence she never had.", n: "Rebecca", r: "Parent" },
      { t: "I always sang in the car but figured I was terrible. Turns out I just needed someone to teach me how to breathe and support my voice. Now I actually enjoy karaoke nights without cringing.", n: "Mike", r: "Student" },
      { t: "Our son wanted to audition for his school musical but was too embarrassed. His vocal coach worked with him for six weeks and he landed a lead role. The transformation was unreal.", n: "Shannon", r: "Parent" },
    ],
  },
  bellevue: {
    c: '#A333FF', cg: 'rgba(163,51,255,0.22)', cl: 'rgba(163,51,255,0.11)',
    name: 'Bellevue', full: 'Bellevue Music Lessons', badge: 'Vocals \u2014 Now Enrolling in Bellevue',
    dbId: 'f7b52dd5-12ee-437f-9c60-f8adf454ac31',
    reviews: [
      { t: "I took vocal lessons as a gift to myself for my 40th birthday. Best thing I have ever done. My teacher is patient and I can actually hear the difference in my voice after just a month.", n: "Karen", r: "Student" },
      { t: "My daughter has been singing since she could talk but had some bad habits. Her teacher corrected her technique without crushing her spirit. She sounds better than ever and her voice does not hurt anymore.", n: "Travis", r: "Parent" },
      { t: "I am a worship leader and needed to improve my stamina and range. The training here is legit — proper technique, warm-ups, and practical exercises I use every Sunday.", n: "Daniel", r: "Student" },
    ],
  },
  elkhorn: {
    c: '#00A5E8', cg: 'rgba(0,165,232,0.22)', cl: 'rgba(0,165,232,0.11)',
    name: 'Elkhorn', full: 'Elkhorn Music Lessons', badge: 'Vocals \u2014 Now Enrolling in Elkhorn',
    dbId: 'cebd97d4-c241-4de2-8ade-49e5cc0070d5',
    reviews: [
      { t: "My teenager wanted to learn to sing pop and R&B. Her teacher meets her where she is and they work on songs she actually loves. She practices without me even asking — that says everything.", n: "Angela", r: "Parent" },
      { t: "I signed up because I have a wedding toast coming up and wanted to sing a verse. My teacher helped me sound decent in four lessons. I actually pulled it off and people thought I had been taking lessons for years.", n: "Chris", r: "Student" },
      { t: "Both my kids take vocal lessons here. One is shy, one is a performer. Their teachers tailor every lesson to their personality. It is not one-size-fits-all and that makes all the difference.", n: "Melanie", r: "Parent" },
    ],
  },
  gretna: {
    c: '#00A651', cg: 'rgba(0,166,81,0.22)', cl: 'rgba(0,166,81,0.11)',
    name: 'Gretna', full: 'Gretna Music Lessons', badge: 'Vocals \u2014 Now Enrolling in Gretna',
    dbId: '40c67ffc-91b5-46a9-94bd-6ddffdfb7638',
    reviews: [
      { t: "My son's voice was changing and he was frustrated because he could not hit the notes he used to. His teacher helped him navigate that transition and now his range is bigger than ever.", n: "Brian", r: "Parent" },
      { t: "I am 52 and always wanted to sing. I was embarrassed to start but my teacher made me feel comfortable from the very first lesson. I can actually match pitch now and I am working on my first full song.", n: "Donna", r: "Student" },
      { t: "Our daughter was in choir but wanted individual attention to improve. After two months of private lessons she moved from the back row to a section lead. Her choir director even noticed the difference.", n: "Ryan", r: "Parent" },
    ],
  },
}

interface ChatStep {
  id: string; type: 'single' | 'multi' | 'text' | 'contact'
  q: (loc: LocKey, a: string[]) => string
  opts?: string[]; placeholder?: string
}

const FLOWS: ChatStep[] = [
  { id: 'who', type: 'single', q: (loc) => `Hey! I'm Cornelius \u{1F33D} Welcome to ${LOCS[loc].full}! First things first \u2014 who are we signing up for vocal lessons today?`, opts: ['My kid', 'Myself'] },
  { id: 'age', type: 'single', q: (_, a) => a[0] === 'My kid' ? 'How old is your child?' : 'How old are you?', opts: ['Under 5', '5 \u2013 10', '11 \u2013 17', '18 \u2013 25', '26 or older'] },
  { id: 'instrument', type: 'multi', q: () => 'Vocals is already locked in! Any other instruments you are interested in? Tap all that apply! \u{1F3B5}', opts: ['\u{1F3A4} Vocals', '\u{1F3B9} Piano', '\u{1F3B8} Guitar', '\u{1F941} Drums', '\u{1F3BB} Violin', 'Something else'] },
  { id: 'experience', type: 'single', q: (_, a) => a[0] === 'My kid' ? 'What is their current vocal/singing experience level?' : 'What is your current vocal/singing experience level?', opts: ['None \u2014 total beginner', '1 \u2013 2 years', '2 \u2013 4 years', '4+ years'] },
  { id: 'has_instrument', type: 'single', q: () => 'Does the student have any singing experience or training?', opts: ['Yes, trained', 'Self-taught', 'Choir/school only', 'No experience', 'Returning after years'] },
  { id: 'location', type: 'multi', q: () => 'Which location works best? Tap all that apply! \u{1F4CD}', opts: ['Bellevue (13th & Harlan)', 'Omaha (96th & L)', 'Gretna (203rd Hwy 370)', 'Elkhorn (204th & Hwy 6)'] },
  { id: 'days', type: 'multi', q: () => 'What days work best for your schedule? Tap all that apply! \u{1F4C5}', opts: ['Mon 3:30\u20139pm', 'Tue 3:30\u20139pm', 'Wed 3:30\u20139pm', 'Thu 3:30\u20139pm', 'Sat 10am\u20133pm', 'Any of these work', 'None of these work'] },
  { id: 'military', type: 'single', q: () => 'Is this student part of a military family?', opts: ['Yes', 'No'] },
  { id: 'personality', type: 'text', q: (_, a) => { const who = a[0] === 'My kid' ? 'your child' : 'yourself'; return `Almost there! \u{1F3AF} This is where the magic happens \u2014 it is what locks in your compatibility score. Tell us a little about ${who}: personality, learning style, goals, anything that helps us find the perfect vocal coach.`; }, placeholder: 'e.g. My daughter is shy but loves singing Disney songs in her room. She wants to build confidence and eventually perform at her school talent show...' },
  { id: 'contact', type: 'contact', q: () => 'Perfect \u2014 we have everything we need to find your vocal coach match. Last step: how do we reach you? We will get you set up to book your first lesson within 24 hours! \u{1F4F1}' },
  { id: 'source', type: 'single', q: () => 'One last quick question \u2014 how did you hear about us?', opts: ['Facebook', 'Instagram', 'Google', 'Signage', 'Driving by', 'Referral', 'Other'] },
]

const LOC_TO_OPT: Record<LocKey, string> = {
  omaha: 'Omaha (96th & L)',
  bellevue: 'Bellevue (13th & Harlan)',
  elkhorn: 'Elkhorn (204th & Hwy 6)',
  gretna: 'Gretna (203rd Hwy 370)',
}

function playVocalTone() {
  try {
    const ctx = new AudioContext()
    // Vocal-like tone: sine wave at middle C with gentle vibrato
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    const vibrato = ctx.createOscillator()
    const vibratoGain = ctx.createGain()

    // Main oscillator — middle C (262 Hz) sine wave
    osc.type = 'sine'
    osc.frequency.setValueAtTime(262, ctx.currentTime)

    // Vibrato — low-frequency oscillator modulating pitch
    vibrato.type = 'sine'
    vibrato.frequency.setValueAtTime(5, ctx.currentTime) // 5 Hz vibrato rate
    vibratoGain.gain.setValueAtTime(4, ctx.currentTime)  // 4 Hz depth

    vibrato.connect(vibratoGain)
    vibratoGain.connect(osc.frequency)

    osc.connect(gain)
    gain.connect(ctx.destination)

    // Fade in over 0.15s, sustain, fade out over 0.35s (total ~0.5s)
    gain.gain.setValueAtTime(0, ctx.currentTime)
    gain.gain.linearRampToValueAtTime(0.5, ctx.currentTime + 0.15)
    gain.gain.setValueAtTime(0.5, ctx.currentTime + 0.15)
    gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.5)

    vibrato.start()
    osc.start()
    osc.stop(ctx.currentTime + 0.5)
    vibrato.stop(ctx.currentTime + 0.5)
  } catch (_) { /* ignore */ }
}

// ═══════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════

export default function VocalsLanding() {
  const tenantId = usePublicTenantId()
  const [loc, setLoc] = useState<LocKey>('omaha')
  const [logos, setLogos] = useState<Record<string, string>>({})
  const [tipOpen, setTipOpen] = useState(false)
  const [enrollOpen, setEnrollOpen] = useState(false)
  const enrollRef = useRef<HTMLElement>(null)
  const [waveActive, setWaveActive] = useState(false)

  useEffect(() => {
    document.title = 'Voice Lessons in Omaha, NE | All Styles & Ages — Adkins Music Lessons'
    document.querySelector('meta[name="description"]')?.setAttribute('content',
      'Private voice and singing lessons in Omaha, Bellevue, Elkhorn & Gretna. All styles and ages. Expert teachers, flexible scheduling, no contracts. Book in 60 seconds.')
  }, [])

  // Chat state
  const [chatStep, setChatStep] = useState(0)
  const [chatAnswers, setChatAnswers] = useState<string[]>([])
  const [chatMsgs, setChatMsgs] = useState<{ from: 'bot' | 'usr'; text: string }[]>([{ from: 'bot', text: FLOWS[0].q('omaha', []) }])
  const [multiSel, setMultiSel] = useState<string[]>(['\u{1F3A4} Vocals'])
  const [chatDone, setChatDone] = useState(false)
  const [contactForm, setContactForm] = useState({ name: '', parent: '', phone: '', email: '' })
  const [textInput, setTextInput] = useState('')
  const msgsEndRef = useRef<HTMLDivElement>(null)
  const locMountedRef = useRef(false)

  const L = LOCS[loc]

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
    r.setProperty('--c', L.c); r.setProperty('--cg', L.cg); r.setProperty('--cl', L.cl)
  }, [L])

  // Reset chat on location change (skip initial mount — chatMsgs already initialized)
  useEffect(() => {
    if (!locMountedRef.current) { locMountedRef.current = true; return }
    setChatStep(0); setChatAnswers([]); setMultiSel(['\u{1F3A4} Vocals']); setChatDone(false)
    setTextInput(''); setContactForm({ name: '', parent: '', phone: '', email: '' })
    setChatMsgs([{ from: 'bot', text: FLOWS[0].q(loc, []) }])
    trackChatStarted('vocals', loc)
  }, [loc])

  // Auto-scroll chat only after user interaction (more than the initial bot message)
  useEffect(() => {
    if (chatMsgs.length <= 1) return
    const el = msgsEndRef.current?.parentElement
    if (el) el.scrollTop = el.scrollHeight
  }, [chatMsgs])

  const goEnroll = useCallback(() => setEnrollOpen(true), [])

  // Sound waveform click handler
  const handleWaveClick = useCallback(() => {
    setWaveActive(true)
    playVocalTone()
    setTimeout(() => setWaveActive(false), 1500)
  }, [])

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
      setMultiSel(FLOWS[nextStep].id === 'location' ? [LOC_TO_OPT[loc]] : FLOWS[nextStep].id === 'instrument' ? ['\u{1F3A4} Vocals'] : [])
      setTextInput('')
      setContactForm({ name: '', parent: '', phone: '', email: '' })
    } else {
      setChatMsgs([...newMsgs, { from: 'bot' as const, text: 'Finding your best vocal coach match...' }])
      setChatDone(true)
      trackChatCompleted('vocals', loc)
      setChatStep(nextStep)

      const rawInstruments = (newAnswers[2] ?? '').split(',').map(s => s.trim())
      const firstInstr = rawInstruments[0]?.replace(/[\u{1F000}-\u{1FFFF}]/gu, '').trim().toLowerCase() || 'vocals'

      const locOptToName: Record<string, string> = {
        'Bellevue (13th & Harlan)': 'Bellevue Music Lessons',
        'Omaha (96th & L)': 'Omaha Music Lessons',
        'Gretna (203rd Hwy 370)': 'Gretna Music Lessons',
        'Elkhorn (204th & Hwy 6)': 'Elkhorn Music Lessons',
      }
      const selectedLocs = (newAnswers[5] ?? '').split(',').map(s => s.trim())
      const locationNames = selectedLocs.map(s => locOptToName[s] ?? s).filter(Boolean)
      if (locationNames.length === 0) locationNames.push(LOCS[loc].full)

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

      let finalMsg: string
      if (matchScore >= 90) {
        finalMsg = `\u{1F3AF} Your compatibility score is ${matchScore}%! We found an excellent vocal coach match${matchName ? ` \u2014 ${matchName} is going to be perfect` : ''}. You can book your first lesson within 24 hours! \u{1F3A4}`
      } else if (matchScore >= 75) {
        finalMsg = '\u{1F3A4} We found a great vocal coach match for you! You can book your first lesson within 24 hours!'
      } else {
        finalMsg = '\u{1F3A4} We will find the right vocal coach for you \u2014 book your first lesson within 24 hours!'
      }
      setChatMsgs(prev => [...prev.slice(0, -1), { from: 'bot' as const, text: finalMsg }])

      const contact = newAnswers[9]?.split('|') ?? []
      anon.from('leads').insert({
        tenant_id: tenantId!,
        location_id: L.dbId,
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
        source: 'website_vocals',
        status: 'new',
      }).then(({ error }) => { if (error) console.error('Lead save failed:', error) })
    }
  }

  const logoUrl = logos[loc] || ''

  return (
    <div className="ak-page">
      <SiteHeader activeInstrument="vocals" />

      {/* HERO */}
      <section className="ak-hero">
        <div className="ak-hbg-glow" />
        <div className="ak-hgrid" />
        <div className="ak-hcontent">
          <div className="ak-hbadge"><div className="ak-bdot" /><span>{L.badge}</span></div>
          <h1 className="ak-htitle">
            <span className="ak-htitle-line1">Find Your</span>
            <span className="ak-htitle-born">VOICE.</span>
            <span className="ak-htitle-line3">Sing With Confidence.</span>
          </h1>
          <p className="ak-hsub">Private one-on-one vocal lessons in <strong>{L.name}</strong>. No long-term commitments. Month to month. Expert vocal coaches who build technique AND confidence. <strong>Most families book their first lesson within 24 hours.</strong></p>
          <div className="ak-hctas">
            <button className="ak-btnp" onClick={goEnroll}>Find My Vocal Coach in 60 Seconds {'\u{2192}'}</button>
            <button className="ak-btng">Watch Our Story {'\u{25B6}'}</button>
          </div>
          <div className="ak-htrust">
            <div className="ak-tstat"><div className="ak-tnum">2,000+</div><div className="ak-tlbl">Students Taught</div></div>
            <div className="ak-tdiv" />
            <div className="ak-tstat"><div className="ak-tnum">4</div><div className="ak-tlbl">Locations</div></div>
            <div className="ak-tdiv" />
            <div className="ak-tstat"><div className="ak-tnum">#1</div><div className="ak-tlbl">in Nebraska 2025</div></div>
            <div className="ak-tdiv" />
            <div className="ak-tstat"><div className="ak-tnum">0</div><div className="ak-tlbl">Contracts. Ever.</div></div>
          </div>
        </div>
        <div className="ak-hvis">
          <div
            className="ak-scene"
            onClick={handleWaveClick}
            style={{ cursor: 'pointer', position: 'relative', overflow: 'visible' }}
          >
            <div className="ak-lcard" style={{ position: 'relative' }}>
              <div className="ak-lring">
                {logoUrl && <img src={logoUrl} alt={L.name} />}
              </div>
              {/* Animated sound waveform */}
              <svg
                viewBox="0 0 200 80"
                style={{
                  position: 'absolute',
                  bottom: -30,
                  left: '50%',
                  transform: 'translateX(-50%)',
                  width: 180,
                  height: 60,
                  pointerEvents: 'none',
                  opacity: waveActive ? 1 : 0.4,
                  transition: 'opacity 0.3s ease',
                }}
              >
                <path
                  d="M0,40 Q25,10 50,40 T100,40 T150,40 T200,40"
                  fill="none"
                  stroke={L.c}
                  strokeWidth="2.5"
                  style={{
                    animation: waveActive ? 'vocalWave1 0.6s ease-in-out infinite' : 'none',
                  }}
                />
                <path
                  d="M0,40 Q25,55 50,40 T100,40 T150,40 T200,40"
                  fill="none"
                  stroke={L.c}
                  strokeWidth="2"
                  strokeOpacity="0.6"
                  style={{
                    animation: waveActive ? 'vocalWave2 0.8s ease-in-out infinite' : 'none',
                  }}
                />
                <path
                  d="M0,40 Q25,25 50,40 T100,40 T150,40 T200,40"
                  fill="none"
                  stroke={L.c}
                  strokeWidth="1.5"
                  strokeOpacity="0.35"
                  style={{
                    animation: waveActive ? 'vocalWave3 1s ease-in-out infinite' : 'none',
                  }}
                />
              </svg>
            </div>
          </div>
        </div>
      </section>

      {/* VOCALS FAQ — singing concerns */}
      <section className="ak-sec">
        <div className="ak-slbl">We Know What You Are Thinking</div>
        <h2 className="ak-stitle">Every Singer Has<br />These Concerns.</h2>
        <p className="ak-secdesc">Stage fright, bad technique, scared to sing in front of people — we hear this every day and we fix it.</p>
        <div className="ak-pgrid">
          {[
            { icon: '\u{1F630}', title: '"I am scared to sing in front of people"', desc: 'Every student starts in a private room with just their teacher. No audience, no pressure. Confidence comes from technique, and technique comes from a safe space to practice.' },
            { icon: '\u{1F3B5}', title: '"I do not know if I can actually sing"', desc: 'Everyone can sing. Seriously. Most people who think they cannot just never had proper instruction. Pitch, tone, and range are all trainable skills.' },
            { icon: '\u{1F623}', title: '"I had a bad vocal teacher before"', desc: 'Bad vocal instruction can actually hurt your voice. Our teachers are trained in healthy technique — no strain, no damage, just progress.' },
            { icon: '\u{1F3A4}', title: '"I just want to sing for fun, not go pro"', desc: 'Most of our vocal students are hobbyists. Shower singers, karaoke lovers, parents who want to sing with their kids. You do not need ambitions — just a willingness to try.' },
          ].map((p, i) => (
            <div className="ak-pcard" key={i}>
              <span className="ak-picon">{p.icon}</span>
              <h3>{p.title}</h3>
              <p>{p.desc}</p>
            </div>
          ))}
        </div>
        <div className="ak-pcta-box">
          <h3>Stop Overthinking It. Start Singing.</h3>
          <p>We will match your family with the perfect vocal coach and have your first lesson on the calendar within 24 hours.</p>
          <button className="ak-btnp" onClick={goEnroll}>Check Availability Now {'\u{2192}'}</button>
        </div>
      </section>

      {/* COMPATIBILITY */}
      <section className="ak-compat-sec">
        <div className="ak-compat-inner">
          <div className="ak-slbl">Our Matching System</div>
          <h2 className="ak-stitle">We Find You <em>The Right Vocal Coach.</em></h2>
          <p className="ak-csub">Not every vocal coach clicks with every student. Some students need gentle encouragement and patience. Some want to belt pop anthems from day one. Our compatibility system matches vocal style, personality, and goals.</p>
          <div className="ak-ccard">
            <div className="ak-cscore-row">
              <div className="ak-sring"><div className="ak-snum">95</div><div className="ak-spct">% MATCH</div></div>
              <div className="ak-sdetails">
                <h3>We Found Your Match {'\u{1F3A4}'}</h3>
                <p>Based on answers to our enrollment questions, we identify a vocal coach with a high compatibility score. We only show the number when we are confident.</p>
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

      {/* AGE TABS */}
      <section className="ak-sec">
        <div style={{ textAlign: 'center' }}>
          <div className="ak-slbl">Vocals for Every Age</div>
          <h2 className="ak-stitle">From First Notes to<br />Full Performances</h2>
        </div>
        <div className="ak-pgrid">
          {[
            { icon: '\u{1F476}', title: 'Kids (5 \u2013 10)', desc: 'Fun vocal games, pitch matching, simple songs. Building confidence and healthy habits before bad ones form. Kids love hearing their own voice improve.' },
            { icon: '\u{1F9D2}', title: 'Teens (11 \u2013 17)', desc: 'Pop, musical theater, indie, R&B \u2014 whatever they love. Audition prep, performance confidence, and healthy technique for changing voices.' },
            { icon: '\u{1F9D1}', title: 'Adults (18+)', desc: 'Karaoke confidence, wedding toasts, or just singing along in the car without cringing. Adults progress fast because they know what they want and they are ready to work.' },
          ].map((p, i) => (
            <div className="ak-pcard" key={i}>
              <span className="ak-picon">{p.icon}</span>
              <h3>{p.title}</h3>
              <p>{p.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* 3 STEPS */}
      <section className="ak-steps-sec">
        <div style={{ textAlign: 'center' }}>
          <div className="ak-slbl">Ridiculously Simple</div>
          <h2 className="ak-stitle">3 Steps to Your First Vocal Lesson</h2>
        </div>
        <div className="ak-sgrid">
          {[
            { n: 1, title: 'Tell us about your family', desc: '30 seconds. Age, experience, and availability. That is it for now.' },
            { n: 2, title: 'We find your vocal coach match', desc: 'Our system picks the teacher most likely to connect with the student \u2014 not just whoever is available.' },
            { n: 3, title: 'Book your first lesson within 24 hours', desc: 'Most families have their first vocal lesson locked in same day.' },
          ].map(s => (
            <div className="ak-scard" key={s.n}>
              <div className="ak-snum2">{s.n}</div>
              <h3>{s.title}</h3>
              <p>{s.desc}</p>
            </div>
          ))}
        </div>
        <div style={{ textAlign: 'center', marginTop: 36 }}>
          <button className="ak-btnp" onClick={goEnroll}>Get Started \u2014 Free to Try {'\u{2192}'}</button>
        </div>
      </section>

      {/* REVIEWS */}
      <section className="ak-rev-sec">
        <div style={{ textAlign: 'center' }}>
          <div className="ak-slbl">Real Families. Real Results.</div>
          <h2 className="ak-stitle">Do Not Take Our Word For It.</h2>
        </div>
        <div className="ak-rgrid">
          {L.reviews.map((rv, i) => (
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
          <button className="ak-btnp" onClick={goEnroll}>Join These Families {'\u{2192}'}</button>
        </div>
      </section>

      {/* VOCALS FAQ */}
      <section className="ak-sec">
        <div style={{ textAlign: 'center' }}>
          <div className="ak-slbl">Common Questions</div>
          <h2 className="ak-stitle">Vocal Lesson FAQ</h2>
        </div>
        <div className="ak-pgrid" style={{ maxWidth: 800, margin: '20px auto 0' }}>
          {[
            { icon: '\u{2753}', title: 'Can anyone learn to sing?', desc: 'Yes. Singing is a skill, not a gift. Pitch, tone, breath control, and range are all trainable. If you can speak, you can learn to sing. Our teachers work with complete beginners every single day.' },
            { icon: '\u{2753}', title: 'What age can kids start voice lessons?', desc: 'Most kids are ready for structured vocal lessons around age 5 or 6. Younger children can start with pitch-matching games and simple songs to build a foundation before formal technique training.' },
            { icon: '\u{2753}', title: 'Will lessons help with stage fright?', desc: 'Absolutely. Confidence is one of the biggest things our students gain. Lessons are private and pressure-free. As technique improves, so does confidence \u2014 and many students go on to perform publicly.' },
            { icon: '\u{2753}', title: 'How long until I notice improvement?', desc: 'Most students hear a noticeable difference within 3 to 4 weeks. Breath support, pitch accuracy, and tone quality improve quickly with consistent practice and proper instruction.' },
            { icon: '\u{2753}', title: 'Do I need to be able to read music?', desc: 'Not at all. Many of our vocal students do not read music when they start. We teach ear training, pitch matching, and musicality alongside any theory that is helpful for your goals.' },
            { icon: '\u{2753}', title: 'Can vocal lessons damage my voice?', desc: 'Bad technique can, but proper instruction protects your voice. Our teachers are trained in healthy vocal production \u2014 no pushing, no strain. You will actually learn how to sing without hurting yourself.' },
          ].map((p, i) => (
            <div className="ak-pcard" key={i}>
              <span className="ak-picon">{p.icon}</span>
              <h3>{p.title}</h3>
              <p>{p.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ENROLLMENT CHAT */}
      <section className="ak-enroll-sec" ref={enrollRef}>
        <div className="ak-einner">
          <div style={{ textAlign: 'center' }}>
            <div className="ak-slbl">Let Cornelius Help</div>
            <h2 className="ak-stitle">Ready to Start Singing? Takes 2 Minutes.</h2>
            <p style={{ fontSize: 15, color: '#9A96B4', marginTop: 10 }}>Answer a few quick questions and book your first lesson within 24 hours.</p>
          </div>
          <div className="ak-chat-ui">
            <div className="ak-ctopbar">
              <img className="ak-cava" src="/cornelius.png" alt="Cornelius" />
              <div className="ak-cinfo"><h4>Cornelius Cobb</h4><p>{L.full} — Vocals</p></div>
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

      {/* DYNAMIC REVIEWS */}
      <ReviewsSection instrumentTag="vocals" />

      {/* FINAL CTA */}
      <section className="ak-final-sec">
        <h2>Your First <span>Vocal Lesson</span><br />Is Waiting.</h2>
        <p>Join 2,000+ students across the Omaha metro. Book in the next 60 seconds.</p>
        <div className="ak-fbtns">
          <button className="ak-btnp" style={{ fontSize: 16, padding: '16px 34px' }} onClick={goEnroll}>Sign Up For Vocal Lessons Now {'\u{2192}'}</button>
          <button className="ak-btng" onClick={goEnroll}>Or Text Us First</button>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="ak-footer">
        <div className="ak-fname">{L.full.toUpperCase()}</div>
        <div style={{ fontSize: 11, color: '#55516E', marginBottom: 8 }}>By Adkins Music Lessons</div>
        <div className="ak-fpow">Powered by <span>Lessonpreneur</span></div>
      </footer>

      {/* CORNELIUS MASCOT */}
      <img
        id="ak-corn"
        src="/cornelius.png"
        alt="Cornelius Cobb"
        onClick={() => { setTipOpen(t => !t); playVocalTone() }}
      />
      <div id="ak-ctip" className={tipOpen ? 'show' : ''}>
        <h4>Hey! I am Cornelius {'\u{1F33D}'}</h4>
        <p>Ready to start singing? I can walk you through finding the perfect vocal coach right now!</p>
        <br />
        <button className="ak-copt" style={{ fontSize: 11, padding: '6px 12px' }} onClick={() => { goEnroll(); setTipOpen(false) }}>Find My Vocal Coach {'\u{2192}'}</button>
      </div>

      {/* Waveform animation keyframes */}
      <style>{`
        @keyframes vocalWave1 {
          0% { d: path('M0,40 Q25,10 50,40 T100,40 T150,40 T200,40'); }
          25% { d: path('M0,40 Q25,55 50,40 T100,40 T150,40 T200,40'); }
          50% { d: path('M0,40 Q25,5 50,40 T100,40 T150,40 T200,40'); }
          75% { d: path('M0,40 Q25,60 50,40 T100,40 T150,40 T200,40'); }
          100% { d: path('M0,40 Q25,10 50,40 T100,40 T150,40 T200,40'); }
        }
        @keyframes vocalWave2 {
          0% { d: path('M0,40 Q25,55 50,40 T100,40 T150,40 T200,40'); }
          25% { d: path('M0,40 Q25,20 50,40 T100,40 T150,40 T200,40'); }
          50% { d: path('M0,40 Q25,60 50,40 T100,40 T150,40 T200,40'); }
          75% { d: path('M0,40 Q25,15 50,40 T100,40 T150,40 T200,40'); }
          100% { d: path('M0,40 Q25,55 50,40 T100,40 T150,40 T200,40'); }
        }
        @keyframes vocalWave3 {
          0% { d: path('M0,40 Q25,25 50,40 T100,40 T150,40 T200,40'); }
          25% { d: path('M0,40 Q25,50 50,40 T100,40 T150,40 T200,40'); }
          50% { d: path('M0,40 Q25,20 50,40 T100,40 T150,40 T200,40'); }
          75% { d: path('M0,40 Q25,55 50,40 T100,40 T150,40 T200,40'); }
          100% { d: path('M0,40 Q25,25 50,40 T100,40 T150,40 T200,40'); }
        }
      `}</style>

      <EnrollmentForm isOpen={enrollOpen} onClose={() => setEnrollOpen(false)} defaultLocation={loc} />
    </div>
  )
}
