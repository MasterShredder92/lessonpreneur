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
    name: 'Omaha', full: 'Omaha Music Lessons', badge: 'Piano \u2014 Now Enrolling in Omaha',
    dbId: 'd48229c1-b70a-4d29-893e-5079887dab76',
    reviews: [
      { t: "My son had zero interest in music until his piano teacher here started teaching him video game soundtracks. Now he practices on his own every single day. I have never seen him this focused.", n: "Laura", r: "Parent" },
      { t: "I am 34 and always dreamed of playing piano. My teacher had me playing Clair de Lune simplified in a month. I sit down at the piano after work every night now and it is the best part of my day.", n: "Derek", r: "Student" },
      { t: "Our daughter is gifted but gets bored easily. Her piano teacher here challenges her with new pieces constantly and mixes in music theory like a game. She is thriving and just passed her first exam.", n: "Susan", r: "Parent" },
    ],
  },
  bellevue: {
    c: '#A333FF', cg: 'rgba(163,51,255,0.22)', cl: 'rgba(163,51,255,0.11)',
    name: 'Bellevue', full: 'Bellevue Music Lessons', badge: 'Piano \u2014 Now Enrolling in Bellevue',
    dbId: 'f7b52dd5-12ee-437f-9c60-f8adf454ac31',
    reviews: [
      { t: "My daughter begged for piano lessons after hearing her friend play at a recital. Within six weeks she performed her first piece for the family. The smile on her face was worth everything.", n: "Angela", r: "Parent" },
      { t: "I quit piano as a teenager because my teacher was so strict it killed my love for it. Came back at 29 and this place is the complete opposite. My teacher actually makes me excited to practice.", n: "Jason", r: "Student" },
      { t: "Both our kids take piano here. Our older one wants to play classical and our younger one just wants to learn pop songs. They matched each kid with the perfect teacher. That kind of care is rare.", n: "Christine", r: "Parent" },
    ],
  },
  elkhorn: {
    c: '#00A5E8', cg: 'rgba(0,165,232,0.22)', cl: 'rgba(0,165,232,0.11)',
    name: 'Elkhorn', full: 'Elkhorn Music Lessons', badge: 'Piano \u2014 Now Enrolling in Elkhorn',
    dbId: 'cebd97d4-c241-4de2-8ade-49e5cc0070d5',
    reviews: [
      { t: "My teenager was convinced piano was boring. His teacher started him on movie themes and jazz chords and completely changed his mind. Now he is composing his own pieces.", n: "Patrick", r: "Parent" },
      { t: "I started piano at 45 thinking I was way too old. My teacher had me playing real songs within weeks, not just exercises. A year in and I can sit down at any piano and actually play something beautiful.", n: "Maria", r: "Student" },
      { t: "Our son has ADHD and his piano teacher here is incredibly patient. She breaks everything into small wins and celebrates every one. He has more confidence now than we have ever seen.", n: "Steve", r: "Parent" },
    ],
  },
  gretna: {
    c: '#00A651', cg: 'rgba(0,166,81,0.22)', cl: 'rgba(0,166,81,0.11)',
    name: 'Gretna', full: 'Gretna Music Lessons', badge: 'Piano \u2014 Now Enrolling in Gretna',
    dbId: '40c67ffc-91b5-46a9-94bd-6ddffdfb7638',
    reviews: [
      { t: "We tried a group piano class at another studio and our daughter felt lost. The one-on-one lessons here are night and day. Her teacher adjusts the pace to exactly where she is and she loves going every week.", n: "Amy", r: "Parent" },
      { t: "I am a total beginner at 50 and was embarrassed to start. My teacher made me feel comfortable from the first lesson. Three months in and I can already play a handful of songs I love.", n: "Robert", r: "Student" },
      { t: "My daughter wanted to audition for the school musical and needed piano skills. Her teacher prepped her with sight reading and accompaniment and she got the part. We could not believe how fast she progressed.", n: "Heather", r: "Parent" },
    ],
  },
}

interface ChatStep {
  id: string; type: 'single' | 'multi' | 'text' | 'contact'
  q: (loc: LocKey, a: string[]) => string
  opts?: string[]; placeholder?: string
}

const FLOWS: ChatStep[] = [
  { id: 'who', type: 'single', q: (loc) => `Hey! I'm Cornelius \u{1F33D} Welcome to ${LOCS[loc].full}! First things first \u2014 who are we signing up for piano lessons today?`, opts: ['My kid', 'Myself'] },
  { id: 'age', type: 'single', q: (_, a) => a[0] === 'My kid' ? 'How old is your child?' : 'How old are you?', opts: ['Under 5', '5 \u2013 10', '11 \u2013 17', '18 \u2013 25', '26 or older'] },
  { id: 'instrument', type: 'multi', q: () => 'Piano is already locked in! Any other instruments you are interested in? Tap all that apply! \u{1F3B5}', opts: ['\u{1F3B9} Piano', '\u{1F3B8} Guitar', '\u{1F941} Drums', '\u{1F3A4} Vocals', '\u{1F3BB} Violin', 'Something else'] },
  { id: 'experience', type: 'single', q: (_, a) => a[0] === 'My kid' ? 'What is their current piano experience level?' : 'What is your current piano experience level?', opts: ['None \u2014 total beginner', '1 \u2013 2 years', '2 \u2013 4 years', '4+ years'] },
  { id: 'has_instrument', type: 'single', q: () => 'Does the student have access to a piano or keyboard?', opts: ['Yes, acoustic piano', 'Yes, keyboard/digital', 'No, not yet', 'Need help getting one'] },
  { id: 'location', type: 'multi', q: () => 'Which location works best? Tap all that apply! \u{1F4CD}', opts: ['Bellevue (13th & Harlan)', 'Omaha (96th & L)', 'Gretna (203rd Hwy 370)', 'Elkhorn (204th & Hwy 6)'] },
  { id: 'days', type: 'multi', q: () => 'What days work best for your schedule? Tap all that apply! \u{1F4C5}', opts: ['Mon 3:30\u20139pm', 'Tue 3:30\u20139pm', 'Wed 3:30\u20139pm', 'Thu 3:30\u20139pm', 'Sat 10am\u20133pm', 'Any of these work', 'None of these work'] },
  { id: 'military', type: 'single', q: () => 'Is this student part of a military family?', opts: ['Yes', 'No'] },
  { id: 'personality', type: 'text', q: (_, a) => { const who = a[0] === 'My kid' ? 'your child' : 'yourself'; return `Almost there! \u{1F3AF} This is where the magic happens \u2014 it is what locks in your compatibility score. Tell us a little about ${who}: personality, learning style, goals, anything that helps us find the perfect piano teacher.`; }, placeholder: 'e.g. My daughter loves classical music but also wants to learn pop songs. She is detail-oriented and loves a challenge...' },
  { id: 'contact', type: 'contact', q: () => 'Perfect \u2014 we have everything we need to find your piano teacher match. Last step: how do we reach you? We will get you set up to book your first lesson within 24 hours! \u{1F4F1}' },
  { id: 'source', type: 'single', q: () => 'One last quick question \u2014 how did you hear about us?', opts: ['Facebook', 'Instagram', 'Google', 'Signage', 'Driving by', 'Referral', 'Other'] },
]

const LOC_TO_OPT: Record<LocKey, string> = {
  omaha: 'Omaha (96th & L)',
  bellevue: 'Bellevue (13th & Harlan)',
  elkhorn: 'Elkhorn (204th & Hwy 6)',
  gretna: 'Gretna (203rd Hwy 370)',
}

function playPianoChord() {
  try {
    const ctx = new AudioContext()

    const masterGain = ctx.createGain()
    masterGain.gain.setValueAtTime(0.35, ctx.currentTime)
    masterGain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 2.0)
    masterGain.connect(ctx.destination)

    // C major chord: C4 (261.63), E4 (329.63), G4 (392.00)
    const frequencies = [261.63, 329.63, 392.00]

    frequencies.forEach((freq, i) => {
      // Fundamental with sine wave for piano-like tone
      const osc = ctx.createOscillator()
      const oscGain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.setValueAtTime(freq, ctx.currentTime)
      oscGain.gain.setValueAtTime(0.4, ctx.currentTime)
      oscGain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.8)
      osc.connect(oscGain)
      oscGain.connect(masterGain)
      osc.start(ctx.currentTime + i * 0.02)
      osc.stop(ctx.currentTime + 2.0)

      // Second harmonic for brightness
      const osc2 = ctx.createOscillator()
      const osc2Gain = ctx.createGain()
      osc2.type = 'sine'
      osc2.frequency.setValueAtTime(freq * 2, ctx.currentTime)
      osc2Gain.gain.setValueAtTime(0.12, ctx.currentTime)
      osc2Gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.2)
      osc2.connect(osc2Gain)
      osc2Gain.connect(masterGain)
      osc2.start(ctx.currentTime + i * 0.02)
      osc2.stop(ctx.currentTime + 2.0)

      // Third harmonic for shimmer
      const osc3 = ctx.createOscillator()
      const osc3Gain = ctx.createGain()
      osc3.type = 'sine'
      osc3.frequency.setValueAtTime(freq * 3, ctx.currentTime)
      osc3Gain.gain.setValueAtTime(0.04, ctx.currentTime)
      osc3Gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.8)
      osc3.connect(osc3Gain)
      osc3Gain.connect(masterGain)
      osc3.start(ctx.currentTime + i * 0.02)
      osc3.stop(ctx.currentTime + 2.0)
    })
  } catch (_) { /* ignore */ }
}

// ═══════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════

export default function PianoLanding() {
  const tenantId = usePublicTenantId()
  const [loc, setLoc] = useState<LocKey>('omaha')
  const [logos, setLogos] = useState<Record<string, string>>({})
  const [tipOpen, setTipOpen] = useState(false)
  const [enrollOpen, setEnrollOpen] = useState(false)
  const enrollRef = useRef<HTMLElement>(null)
  const [activeKeys, setActiveKeys] = useState<number[]>([])

  useEffect(() => {
    document.title = 'Piano Lessons in Omaha, NE | All Ages & Levels — Adkins Music Lessons'
    document.querySelector('meta[name="description"]')?.setAttribute('content',
      'Private piano lessons in Omaha, Bellevue, Elkhorn & Gretna. Expert teachers, flexible scheduling, no contracts. Book your first lesson in 60 seconds.')
  }, [])

  // Chat state
  const [chatStep, setChatStep] = useState(0)
  const [chatAnswers, setChatAnswers] = useState<string[]>([])
  const [chatMsgs, setChatMsgs] = useState<{ from: 'bot' | 'usr'; text: string }[]>([{ from: 'bot', text: FLOWS[0].q('omaha', []) }])
  const [multiSel, setMultiSel] = useState<string[]>(['\u{1F3B9} Piano'])
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
    setChatStep(0); setChatAnswers([]); setMultiSel(['\u{1F3B9} Piano']); setChatDone(false)
    setTextInput(''); setContactForm({ name: '', parent: '', phone: '', email: '' })
    setChatMsgs([{ from: 'bot', text: FLOWS[0].q(loc, []) }])
    trackChatStarted('piano', loc)
  }, [loc])

  // Auto-scroll chat only after user interaction (more than the initial bot message)
  useEffect(() => {
    if (chatMsgs.length <= 1) return
    const el = msgsEndRef.current?.parentElement
    if (el) el.scrollTop = el.scrollHeight
  }, [chatMsgs])

  const goEnroll = useCallback(() => setEnrollOpen(true), [])

  // Piano key press animation
  const handleKeyPress = useCallback((keyIndex: number) => {
    setActiveKeys(prev => [...prev, keyIndex])
    playPianoChord()
    setTimeout(() => setActiveKeys(prev => prev.filter(k => k !== keyIndex)), 600)
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
      setMultiSel(FLOWS[nextStep].id === 'location' ? [LOC_TO_OPT[loc]] : FLOWS[nextStep].id === 'instrument' ? ['\u{1F3B9} Piano'] : [])
      setTextInput('')
      setContactForm({ name: '', parent: '', phone: '', email: '' })
    } else {
      setChatMsgs([...newMsgs, { from: 'bot' as const, text: 'Finding your best piano teacher match...' }])
      setChatDone(true)
      trackChatCompleted('piano', loc)
      setChatStep(nextStep)

      const rawInstruments = (newAnswers[2] ?? '').split(',').map(s => s.trim())
      const firstInstr = rawInstruments[0]?.replace(/[\u{1F000}-\u{1FFFF}]/gu, '').trim().toLowerCase() || 'piano'

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
        finalMsg = `\u{1F3AF} Your compatibility score is ${matchScore}%! We found an excellent piano teacher match${matchName ? ` \u2014 ${matchName} is going to be perfect` : ''}. You can book your first lesson within 24 hours! \u{1F3B9}`
      } else if (matchScore >= 75) {
        finalMsg = '\u{1F3B9} We found a great piano teacher match for you! You can book your first lesson within 24 hours!'
      } else {
        finalMsg = '\u{1F3B9} We will find the right piano teacher for you \u2014 book your first lesson within 24 hours!'
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
        source: 'website_piano',
        status: 'new',
      }).then(({ error }) => { if (error) console.error('Lead save failed:', error) })
    }
  }

  const logoUrl = logos[loc] || ''

  // Piano key layout: W = white, B = black
  const pianoKeys = [
    { type: 'white', note: 'C' },
    { type: 'black', note: 'C#' },
    { type: 'white', note: 'D' },
    { type: 'black', note: 'D#' },
    { type: 'white', note: 'E' },
    { type: 'white', note: 'F' },
    { type: 'black', note: 'F#' },
    { type: 'white', note: 'G' },
    { type: 'black', note: 'G#' },
    { type: 'white', note: 'A' },
    { type: 'black', note: 'A#' },
    { type: 'white', note: 'B' },
  ]

  return (
    <div className="ak-page">
      <SiteHeader activeInstrument="piano" />

      {/* HERO */}
      <section className="ak-hero">
        <div className="ak-hbg-glow" />
        <div className="ak-hgrid" />
        <div className="ak-hcontent">
          <div className="ak-hbadge"><div className="ak-bdot" /><span>{L.badge}</span></div>
          <h1 className="ak-htitle">
            <span className="ak-htitle-line1">Sit Down at the</span>
            <span className="ak-htitle-born">PIANO.</span>
            <span className="ak-htitle-line3">Play Beautiful Music.</span>
          </h1>
          <p className="ak-hsub">Private one-on-one piano lessons in <strong>{L.name}</strong>. No long-term commitments. Month to month. Expert teachers who actually make it fun. <strong>Most families book their first lesson within 24 hours.</strong></p>
          <div className="ak-hctas">
            <button className="ak-btnp" onClick={goEnroll}>Find My Piano Teacher in 60 Seconds {'\u{2192}'}</button>
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
            style={{ cursor: 'pointer', position: 'relative', overflow: 'visible' }}
          >
            <div className="ak-lcard" style={{ position: 'relative' }}>
              <div className="ak-lring">
                {logoUrl && <img src={logoUrl} alt={L.name} />}
              </div>
              {/* Piano keys */}
              <div style={{
                position: 'absolute',
                bottom: '-30px',
                left: '50%',
                transform: 'translateX(-50%)',
                display: 'flex',
                height: 80,
                pointerEvents: 'auto',
                borderRadius: '0 0 6px 6px',
                overflow: 'hidden',
                boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
              }}>
                {pianoKeys.map((key, i) => (
                  key.type === 'white' ? (
                    <div
                      key={i}
                      onClick={(e) => { e.stopPropagation(); handleKeyPress(i) }}
                      style={{
                        width: 28,
                        height: 80,
                        background: activeKeys.includes(i)
                          ? `linear-gradient(180deg, #fff 0%, ${L.c}44 100%)`
                          : 'linear-gradient(180deg, #fff 0%, #e8e8e8 100%)',
                        border: '1px solid #bbb',
                        borderTop: 'none',
                        cursor: 'pointer',
                        position: 'relative',
                        zIndex: 1,
                        transition: 'background 0.15s',
                        boxShadow: activeKeys.includes(i) ? `0 0 15px ${L.c}66` : 'none',
                        animation: activeKeys.includes(i) ? 'pianoKeyPress 0.3s ease-out' : 'none',
                      }}
                    />
                  ) : (
                    <div
                      key={i}
                      onClick={(e) => { e.stopPropagation(); handleKeyPress(i) }}
                      style={{
                        width: 18,
                        height: 50,
                        background: activeKeys.includes(i)
                          ? `linear-gradient(180deg, ${L.c} 0%, #222 100%)`
                          : 'linear-gradient(180deg, #333 0%, #111 100%)',
                        border: '1px solid #000',
                        borderTop: 'none',
                        cursor: 'pointer',
                        position: 'relative',
                        zIndex: 2,
                        marginLeft: -9,
                        marginRight: -9,
                        borderRadius: '0 0 3px 3px',
                        transition: 'background 0.15s',
                        boxShadow: activeKeys.includes(i) ? `0 0 15px ${L.c}88` : '0 2px 4px rgba(0,0,0,0.4)',
                        animation: activeKeys.includes(i) ? 'pianoKeyPress 0.3s ease-out' : 'none',
                      }}
                    />
                  )
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* PIANO FAQ — concerns */}
      <section className="ak-sec">
        <div className="ak-slbl">We Know What You Are Thinking</div>
        <h2 className="ak-stitle">Every Piano Student Has<br />These Concerns.</h2>
        <p className="ak-secdesc">Tried it before and quit? Never played a real song? Worried about needing an expensive piano? We hear this every single day, and we fix it.</p>
        <div className="ak-pgrid">
          {[
            { icon: '\u{1F3B9}', title: '"I tried lessons before and quit"', desc: '90% of students who quit did not have the right teacher. Our matching system pairs personality, style, and goals. When the connection clicks, quitting is not an option.' },
            { icon: '\u{1F4DA}', title: '"I never played a real song"', desc: 'No Hanon exercises for 6 months. No endless scales. You play songs you actually like from lesson one. That is our promise.' },
            { icon: '\u{1F3B9}', title: '"I am worried about needing an expensive piano"', desc: 'You do not need a grand piano to start. A simple keyboard or digital piano works perfectly for beginners. We will help you figure out the right setup for your budget.' },
            { icon: '\u{23F0}', title: '"I do not have time to practice"', desc: '15 minutes a day is enough. Our teachers give focused practice plans that fit real life, not conservatory life.' },
          ].map((p, i) => (
            <div className="ak-pcard" key={i}>
              <span className="ak-picon">{p.icon}</span>
              <h3>{p.title}</h3>
              <p>{p.desc}</p>
            </div>
          ))}
        </div>
        <div className="ak-pcta-box">
          <h3>Stop Overthinking It. Start Playing.</h3>
          <p>We will match your family with the perfect piano teacher and have your first lesson on the calendar within 24 hours.</p>
          <button className="ak-btnp" onClick={goEnroll}>Check Availability Now {'\u{2192}'}</button>
        </div>
      </section>

      {/* COMPATIBILITY */}
      <section className="ak-compat-sec">
        <div className="ak-compat-inner">
          <div className="ak-slbl">Our Matching System</div>
          <h2 className="ak-stitle">We Find You <em>The Right Piano Teacher.</em></h2>
          <p className="ak-csub">Not every piano teacher clicks with every student. Some kids need high-energy, play-along-to-pop teachers. Some adults want classical technique and patience. Our compatibility system matches playing style, personality, and goals.</p>
          <div className="ak-ccard">
            <div className="ak-cscore-row">
              <div className="ak-sring"><div className="ak-snum">95</div><div className="ak-spct">% MATCH</div></div>
              <div className="ak-sdetails">
                <h3>We Found Your Match {'\u{1F3B9}'}</h3>
                <p>Based on answers to our enrollment questions, we identify a piano teacher with a high compatibility score. We only show the number when we are confident.</p>
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
          <div className="ak-slbl">Piano for Every Age</div>
          <h2 className="ak-stitle">From First Notes to<br />Full Performances</h2>
        </div>
        <div className="ak-pgrid">
          {[
            { icon: '\u{1F476}', title: 'Kids (5 \u2013 10)', desc: 'Fun songs, rhythm games, and colorful exercises. Real melodies from day one \u2014 nursery rhymes to movie themes. We build confidence and a love for the instrument before anything else.' },
            { icon: '\u{1F9D2}', title: 'Teens (11 \u2013 17)', desc: 'Learn the songs they listen to. Pop, classical, film scores, jazz \u2014 whatever fires them up. Recital prep, audition coaching, and composition skills for students who want to take it further.' },
            { icon: '\u{1F9D1}', title: 'Adults (18+)', desc: 'Never too late. Whether returning after years away or sitting down at the piano for the first time. Simple melodies to Chopin \u2014 adults progress fast because they are motivated.' },
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
          <h2 className="ak-stitle">3 Steps to Your First Piano Lesson</h2>
        </div>
        <div className="ak-sgrid">
          {[
            { n: 1, title: 'Tell us about your family', desc: '30 seconds. Age, experience, and availability. That is it for now.' },
            { n: 2, title: 'We find your piano teacher match', desc: 'Our system picks the teacher most likely to connect with the student \u2014 not just whoever is available.' },
            { n: 3, title: 'Book your first lesson within 24 hours', desc: 'Most families have their first piano lesson locked in same day.' },
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

      {/* PIANO FAQ */}
      <section className="ak-sec">
        <div style={{ textAlign: 'center' }}>
          <div className="ak-slbl">Common Questions</div>
          <h2 className="ak-stitle">Piano Lesson FAQ</h2>
        </div>
        <div className="ak-pgrid" style={{ maxWidth: 800, margin: '20px auto 0' }}>
          {[
            { icon: '\u{2753}', title: 'Do I need my own piano to start?', desc: 'Not necessarily. A basic keyboard or digital piano works great for beginners. We can help you find the right instrument for your budget. Some students start with a borrowed keyboard for the first few lessons.' },
            { icon: '\u{2753}', title: 'What age can kids start piano?', desc: 'Most kids start between ages 5 and 7. Piano is one of the best first instruments because the keys are visual and intuitive. By 8 or 9, most students are reading music and playing with both hands confidently.' },
            { icon: '\u{2753}', title: 'Acoustic piano or digital \u2014 which should I get?', desc: 'Either works great. A weighted-key digital piano is perfect for beginners and takes up less space. Acoustic pianos offer richer tone and touch response. Your teacher will help you choose based on your goals and budget.' },
            { icon: '\u{2753}', title: 'How long until I can play a real song?', desc: 'Most beginners are playing a simple melody within the first 2 weeks. Full songs with both hands usually come around the 2 to 3 month mark. Our teachers get you playing music you recognize right away.' },
            { icon: '\u{2753}', title: 'I tried before and quit. Will this be different?', desc: 'Almost certainly. Most people quit because of a bad teacher match, not because piano is too hard. Our compatibility system ensures you get a teacher who fits your personality, goals, and style.' },
            { icon: '\u{2753}', title: 'Can adults really learn piano?', desc: 'Absolutely. Adults are some of our fastest-progressing piano students because they come in motivated, focused, and disciplined. There is no age limit on learning an instrument.' },
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
            <h2 className="ak-stitle">Ready to Start Playing Piano? Takes 2 Minutes.</h2>
            <p style={{ fontSize: 15, color: '#9A96B4', marginTop: 10 }}>Answer a few quick questions and book your first lesson within 24 hours.</p>
          </div>
          <div className="ak-chat-ui">
            <div className="ak-ctopbar">
              <img className="ak-cava" src="/cornelius.png" alt="Cornelius" />
              <div className="ak-cinfo"><h4>Cornelius Cobb</h4><p>{L.full} — Piano</p></div>
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
      <ReviewsSection instrumentTag="piano" />

      {/* FINAL CTA */}
      <section className="ak-final-sec">
        <h2>Your First <span>Piano Lesson</span><br />Is Waiting.</h2>
        <p>Join 2,000+ students across the Omaha metro. Book in the next 60 seconds.</p>
        <div className="ak-fbtns">
          <button className="ak-btnp" style={{ fontSize: 16, padding: '16px 34px' }} onClick={goEnroll}>Sign Up For Piano Lessons Now {'\u{2192}'}</button>
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
        onClick={() => { setTipOpen(t => !t); playPianoChord() }}
      />
      <div id="ak-ctip" className={tipOpen ? 'show' : ''}>
        <h4>Hey! I am Cornelius {'\u{1F33D}'}</h4>
        <p>Ready to start playing piano? I can walk you through finding the perfect piano teacher right now!</p>
        <br />
        <button className="ak-copt" style={{ fontSize: 11, padding: '6px 12px' }} onClick={() => { goEnroll(); setTipOpen(false) }}>Find My Piano Teacher {'\u{2192}'}</button>
      </div>

      {/* Piano key press keyframes */}
      <style>{`
        @keyframes pianoKeyPress {
          0% { transform: translateY(0); }
          30% { transform: translateY(3px); }
          100% { transform: translateY(0); }
        }
      `}</style>

      <EnrollmentForm isOpen={enrollOpen} onClose={() => setEnrollOpen(false)} defaultLocation={loc} />
    </div>
  )
}
