import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate, useLocation as useRouterLocation } from 'react-router-dom'
import { LOCATIONS, type LocKey } from '../config/locations'
import { useSiteLocation } from '../hooks/useSiteLocation'
import { setLocColors } from '../lib/setLocColors'
import ReviewsSection from '../components/site/ReviewsSection'
import HeroTestimonial from '../components/site/HeroTestimonial'
import SiteHeader from '../components/site/SiteHeader'
import VSLSection from '../components/site/VSLSection'
import InstrumentAtmosphere from '../components/site/InstrumentAtmosphere'
import { useLocationTracking } from '../hooks/useLocationTracking'
import { useLocationStats } from '../hooks/useLocationStats'
import { trackInstrumentView } from '../lib/tracking'
import './adkins.css'
import './piano.css'

// ═══════════════════════════════════════
// DATA
// ═══════════════════════════════════════


// Piano key config
const CACHE_V = '20260331p'
const WHITE_KEYS = [
  { id: 'C', name: 'C', key: 'A' },
  { id: 'D', name: 'D', key: 'S' },
  { id: 'E', name: 'E', key: 'D' },
  { id: 'F', name: 'F', key: 'F' },
  { id: 'G', name: 'G', key: 'G' },
  { id: 'A', name: 'A', key: 'H' },
  { id: 'B', name: 'B', key: 'J' },
  { id: 'C2', name: 'C', key: 'K' },
]

const BLACK_KEYS = [
  { id: 'Cs', name: 'C#', key: 'W', left: '8.75%' },
  { id: 'Ds', name: 'D#', key: 'E', left: '21.25%' },
  { id: 'Fs', name: 'F#', key: 'T', left: '46.25%' },
  { id: 'Gs', name: 'G#', key: 'Y', left: '58.75%' },
  { id: 'As', name: 'A#', key: 'U', left: '71.25%' },
]

const ALL_KEYS = [...WHITE_KEYS, ...BLACK_KEYS]

const FAQS = [
  { q: 'What age can kids start piano?', a: "We work with students as young as 3 years old. For very young beginners we focus on listening, rhythm, and basic finger coordination before formal note reading. Most kids are ready for structured lessons around age 5 or 6 — but we'll tell you honestly after a trial lesson. We're always honest. It's kind of our thing." },
  { q: 'Do we need a piano or keyboard at home?', a: "A keyboard works perfectly to start — you don't need an acoustic piano. After a few lessons we can help you find the right option for your budget and space. We'll never push you toward an expensive purchase before you're ready." },
  { q: 'How much do lessons cost?', a: "Sessions are billed in 30-minute increments and sold in prepaid monthly packages. The total varies depending on how many students and instruments. Fill out the form and we'll walk you through all the options — no pressure, no surprises.", link: true },
  { q: 'Where are your locations?', a: "Four locations across the Omaha metro: Omaha (96th St), Gretna, Bellevue, and Elkhorn. We'll match you to the closest one." },
]

const PAIN_POINTS = [
  { title: 'Feeling Overwhelmed as a Beginner', body: "Notes, posture, rhythm, both hands — it's a lot without a guide. Most beginners don't know where to start.", solution: 'We break it down into clear steps from day one. Progress feels immediate.' },
  { title: 'Lessons That Feel Boring or Too Rigid', body: 'Repetitive exercises and dry method books with no connection to music you actually enjoy.', solution: 'We connect technique to songs students love from the very start.' },
  { title: 'Struggling With Hand Coordination', body: "Your brain knows what to do but your hands won't cooperate. Rhythm doesn't click. It's frustrating.", solution: 'We teach coordination progressively — one hand at a time until it becomes natural.' },
  { title: 'Music Theory Feels Impossible', body: "Reading music and understanding theory can feel like learning a new language — confusing and discouraging.", solution: 'We teach theory in context, through real music, so it actually sticks.' },
  { title: 'No Clear Goals or Visible Progress', body: "Without structure and milestones it's easy to feel like you're not getting anywhere — even when you are.", solution: 'Every lesson has a goal. Every month shows measurable progress.' },
]


// ═══════════════════════════════════════
// AUDIO ENGINE
// ═══════════════════════════════════════

let audioCtx: AudioContext | null = null
const bufferCache: Record<string, AudioBuffer> = {}

function initAudioCtx() {
  if (!audioCtx) audioCtx = new AudioContext()
  if (audioCtx.state === 'suspended') audioCtx.resume()
  return audioCtx
}

async function loadBuffer(url: string): Promise<AudioBuffer | null> {
  if (bufferCache[url]) return bufferCache[url]
  try {
    const ctx = initAudioCtx()
    const res = await fetch(url)
    const arr = await res.arrayBuffer()
    const buf = await ctx.decodeAudioData(arr)
    bufferCache[url] = buf
    return buf
  } catch { return null }
}

let _dest: AudioNode | null = null
function playBuffer(buf: AudioBuffer) {
  const ctx = initAudioCtx()
  if (!_dest) _dest = ctx.destination
  const src = ctx.createBufferSource()
  src.buffer = buf
  src.connect(_dest)
  src.start(0)
}

// Synthesized piano note fallback
function synthPianoNote(freq: number) {
  const c = initAudioCtx()
  const now = c.currentTime

  // Fundamental
  const o1 = c.createOscillator(); const g1 = c.createGain()
  o1.type = 'sine'; o1.frequency.value = freq
  g1.gain.setValueAtTime(0.5, now); g1.gain.exponentialRampToValueAtTime(0.001, now + 0.8)
  o1.connect(g1); g1.connect(c.destination)
  o1.start(now); o1.stop(now + 0.8)

  // 2x harmonic
  const o2 = c.createOscillator(); const g2 = c.createGain()
  o2.type = 'sine'; o2.frequency.value = freq * 2
  g2.gain.setValueAtTime(0.15, now); g2.gain.exponentialRampToValueAtTime(0.001, now + 0.6)
  o2.connect(g2); g2.connect(c.destination)
  o2.start(now); o2.stop(now + 0.6)

  // 3x harmonic
  const o3 = c.createOscillator(); const g3 = c.createGain()
  o3.type = 'sine'; o3.frequency.value = freq * 3
  g3.gain.setValueAtTime(0.07, now); g3.gain.exponentialRampToValueAtTime(0.001, now + 0.4)
  o3.connect(g3); g3.connect(c.destination)
  o3.start(now); o3.stop(now + 0.4)
}

const NOTE_FREQS: Record<string, number> = {
  C: 523, Cs: 554, D: 587, Ds: 622, E: 659, F: 698,
  Fs: 740, G: 784, Gs: 831, A: 880, As: 932, B: 988, C2: 1047,
}

// ═══════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════

// LOC_RANKINGS removed — now pulled live from Supabase via useLocationStats

export default function PianoLanding() {
  const siteLoc = useSiteLocation()
  const navigate = useNavigate()
  const { pathname } = useRouterLocation()
  const loc = siteLoc.key as LocKey
  const LD = LOCATIONS[loc]
  const enrollmentUrl = `/${loc}/signup`
  const currentInstrument = pathname.split('/')[2] || 'piano'

  useLocationTracking(LD)
  const locStats = useLocationStats(loc)
  useEffect(() => { trackInstrumentView('Piano') }, [])

  useEffect(() => {
    document.title = `Piano Lessons in ${LD.name}, NE | Classical to Pop — Adkins Music Lessons`
    document.querySelector('meta[name="description"]')?.setAttribute('content',
      `Private piano lessons in ${LD.name}, NE. Classical, pop and more. Expert teachers, flexible scheduling, no contracts. Book in 60 seconds. ${LD.phone}`)
  }, [loc])

  // Set CSS vars on location change
  useEffect(() => {
    setLocColors({ '--c': LD.accentColor, '--cg': LD.accentGlow, '--cl': LD.accentLight, '--loc-color': LD.accentColor })
  }, [loc])

  // Intro overlay — only on first visit in session
  const showIntro = !sessionStorage.getItem('piano-intro-seen')
  const [overlayDone, setOverlayDone] = useState(!showIntro)

  // Piano key hits
  const [hitKeys, setHitKeys] = useState<Set<string>>(new Set())
  const preloaded = useRef(false)
  const touchActive = useRef(false)

  // Video
  const [vid1, setVid1] = useState(false)
  const [vid2, setVid2] = useState(false)

  // FAQ
  const [openFaq, setOpenFaq] = useState<number | null>(null)

  // Overlay timing — ascending piano run
  useEffect(() => {
    if (!showIntro) return
    const notes = [523, 659, 784, 1047] // C5, E5, G5, C6
    const timers: ReturnType<typeof setTimeout>[] = []
    notes.forEach((freq, i) => {
      timers.push(setTimeout(() => { try { synthPianoNote(freq) } catch {} }, 300 + i * 120))
    })
    timers.push(setTimeout(() => {
      setOverlayDone(true)
      sessionStorage.setItem('piano-intro-seen', '1')
    }, 1750))
    return () => timers.forEach(clearTimeout)
  }, [])

  // Preload piano sounds on first interaction
  const ensurePreloaded = useCallback(() => {
    if (preloaded.current) return
    preloaded.current = true
    initAudioCtx()
    ALL_KEYS.forEach(k => loadBuffer(`/audio/piano/${k.id}.wav?v=${CACHE_V}`))
  }, [])

  // Pre-initialize AudioContext + fetch/decode all note buffers on mount
  // so the first tap plays instantly with no fetch/decode lag.
  useEffect(() => { ensurePreloaded() }, [ensurePreloaded])

  // Play a piano key (audio only — visual highlight handled by caller)
  const keyPlaying = useRef<Record<string, number>>({})
  const playNote = useCallback((noteId: string) => {
    const now = performance.now()
    if (now - (keyPlaying.current[noteId] || 0) < 150) return
    keyPlaying.current[noteId] = now

    ensurePreloaded()
    const url = `/audio/piano/${noteId}.wav?v=${CACHE_V}`
    const cached = bufferCache[url]
    if (cached) { playBuffer(cached) }
    else { loadBuffer(url).then(buf => { if (buf) playBuffer(buf); else synthPianoNote(NOTE_FREQS[noteId] || 523) }) }
  }, [ensurePreloaded])

  // Mouse/touch: play + brief flash highlight
  const playKey = useCallback((noteId: string) => {
    playNote(noteId)
    setHitKeys(prev => new Set(prev).add(noteId))
    setTimeout(() => setHitKeys(prev => { const next = new Set(prev); next.delete(noteId); return next }), 160)
  }, [playNote])

  // Keyboard shortcuts — hold to sustain visual highlight
  useEffect(() => {
    const keyMap: Record<string, string> = {
      a: 'C', w: 'Cs', s: 'D', e: 'Ds', d: 'E', f: 'F',
      t: 'Fs', g: 'G', y: 'Gs', h: 'A', u: 'As', j: 'B', k: 'C2',
    }
    const onDown = (e: KeyboardEvent) => {
      if (e.repeat) return
      const note = keyMap[e.key.toLowerCase()]
      if (!note) return
      playNote(note)
      setHitKeys(prev => new Set(prev).add(note))
    }
    const onUp = (e: KeyboardEvent) => {
      const note = keyMap[e.key.toLowerCase()]
      if (!note) return
      setHitKeys(prev => { const next = new Set(prev); next.delete(note); return next })
    }
    window.addEventListener('keydown', onDown)
    window.addEventListener('keyup', onUp)
    return () => { window.removeEventListener('keydown', onDown); window.removeEventListener('keyup', onUp) }
  }, [playNote])

  // EQ bars data
  const eqBars = useRef(
    Array.from({ length: 70 }, () => ({
      h1: Math.random() * 10 + 3,
      h2: Math.random() * 28 + 8,
      spd: (Math.random() * 0.5 + 0.28).toFixed(2),
      op: (Math.random() * 0.39 + 0.11).toFixed(2),
    }))
  ).current

  // Other locations for the map section pills
  const otherLocs = (Object.keys(LOCATIONS) as LocKey[]).filter(k => k !== loc)

  return (
    <div className="ak-page" onClick={ensurePreloaded}>
      <InstrumentAtmosphere theme="piano" />
      {/* ─── INTRO OVERLAY ─── */}
      {showIntro && (
        <div className={`pn-overlay${overlayDone ? ' done' : ''}`}>
          <div className="pn-overlay-title">THIS IS WHERE<br /><span>MUSIC BEGINS.</span></div>
          <div className="pn-overlay-sub">Adkins Music Lessons</div>
          <div className="pn-note-anim">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="pn-note-dot" style={{ animationDelay: `${i * 0.12}s` }} />
            ))}
          </div>
        </div>
      )}

      <SiteHeader activeInstrument="piano" />

      {/* ─── HERO ─── */}
      <section className="ak-hero">
        <div className="ak-hbg-glow" />
        <div className="ak-hgrid" />
        <div className="ak-hcontent">
          <h1 className="ak-htitle">
            <span className="ak-htitle-line1">This Is Where</span>
            <span className="ak-htitle-born">PIANO PLAYERS</span>
            <span className="ak-htitle-line3">Are Made.</span>
          </h1>
          <p className="ak-hsub">Private one-on-one sessions for ages 5 to adult. 4 metro locations. Your teacher is already waiting.</p>
          <div className="ak-hctas" style={{ marginTop: 24 }}>
            <div style={{ position: 'relative', display: 'inline-block' }}>
              <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: 200, height: 60, borderRadius: '50%', background: 'var(--c)', filter: 'blur(40px)', animation: 'glowPulse 3.5s ease-in-out infinite', opacity: 0.35, pointerEvents: 'none', zIndex: 0 }} />
              <a className="ak-btnp" href={enrollmentUrl} style={{ color: '#ffffff', position: 'relative', zIndex: 1 }}>Sign Up For Lessons Now {'\u2192'}</a>
            </div>
          </div>
          <HeroTestimonial
            instrumentTag="piano"
            seed={{ text: "I'm a novice at piano and signed up for 4 lessons. It's pretty shocking how much I improved in such a short time.", name: "Peter Lee" }}
          />
          {locStats && (
            <div className="ak-stat-row">
              <div className="ak-stat-card"><div className="ak-stat-num">#{locStats.stateRank}</div><div className="ak-stat-lbl">Ranked in Nebraska</div></div>
              <div className="ak-stat-card"><div className="ak-stat-num">{locStats.studentsEnrolled.toLocaleString()}+</div><div className="ak-stat-lbl">Enrolled</div></div>
              <div className="ak-stat-card"><div className="ak-stat-num">{locStats.studentsTaughtTotal.toLocaleString()}+</div><div className="ak-stat-lbl">Taught Overall</div></div>
            </div>
          )}
        </div>
        <div className="pn-eq-strip">
          {eqBars.map((b, i) => (
            <div key={i} className="pn-eq-bar" style={{ '--h1': `${b.h1}px`, '--h2': `${b.h2}px`, '--spd': `${b.spd}s`, '--op': b.op } as React.CSSProperties} />
          ))}
        </div>
      </section>

      {/* ─── VSL ─── */}
      <VSLSection
        videoId="-WLbkzZzvA0"
        headline="The Truth About Piano Lessons"
        subheadline="Here's why most students struggle — and exactly how we fix it."
      />

      {/* ─── PIANO KEYBOARD ─── */}
      <section className="ak-sec" id="pn-keyboard" style={{ background: '#0A0A10', borderTop: '1px solid #1C1C2A', borderBottom: '1px solid #1C1C2A' }}>
        <div style={{ textAlign: 'center' }}>
          <div className="ak-slbl">Don't Just Take Our Word For It</div>
          <h2 className="ak-stitle">Play A <em>Note.</em></h2>
          <p className="ak-secdesc" style={{ margin: '0 auto 36px' }}>Real keys. Real notes. Go ahead.<br/>Tap multiple keys to play chords.</p>
        </div>
        <div className="pn-keyboard-scroll">
          <div className="pn-keyboard">
            {WHITE_KEYS.map(wk => (
              <div
                key={wk.id}
                className={`pn-white-key${hitKeys.has(wk.id) ? ' hit' : ''}`}
                onMouseDown={() => { if (!touchActive.current) playKey(wk.id) }}
                onTouchStart={(e) => { e.preventDefault(); touchActive.current = true; playKey(wk.id); setTimeout(() => { touchActive.current = false }, 300) }}
              >
                <span className="pn-key-label">{wk.name}</span>
              </div>
            ))}
            {BLACK_KEYS.map(bk => (
              <div
                key={bk.id}
                className={`pn-black-key${hitKeys.has(bk.id) ? ' hit' : ''}`}
                style={{ left: bk.left }}
                onMouseDown={() => { if (!touchActive.current) playKey(bk.id) }}
                onTouchStart={(e) => { e.preventDefault(); touchActive.current = true; playKey(bk.id); setTimeout(() => { touchActive.current = false }, 300) }}
              >
                <span className="pn-black-label">{bk.name}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="pn-keyboard-hint">Use keys A-K to play</div>
        <p style={{ fontSize: 13, color: '#666', textAlign: 'center', marginTop: 12 }}>Go ahead. Play something. Nobody's judging. (We're definitely tracking how fast you come back.)</p>
      </section>

      {/* ─── WHY PIANO — KIDS (desktop) ─── */}
      <section className="ak-sec pn-why-desktop">
        <div className="ak-slbl">For Kids</div>
        <h2 className="ak-stitle">Why Piano Changes <em>Kids.</em></h2>
        <div className="ak-pgrid">
          {[
            { icon: '\u{1F9E0}', title: 'Brain Development', desc: 'Piano engages both hands independently and both brain hemispheres simultaneously. The cognitive benefits start from the very first lesson.' },
            { icon: '\u{1F3B5}', title: 'Reading Music', desc: 'Piano is the best instrument for learning to read music. That skill transfers to every other instrument they ever pick up.' },
            { icon: '\u{1F3AF}', title: 'Discipline', desc: 'Consistent practice builds habits. Kids who play piano develop patience and follow-through that carries into school and life. And also into making them practice without being asked. Mostly.' },
          ].map((p, i) => (
            <div className="ak-pcard" key={i}>
              <span className="ak-picon">{p.icon}</span>
              <h3>{p.title}</h3>
              <p>{p.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ─── WHY PIANO — ADULTS (desktop) ─── */}
      <section className="ak-sec pn-why-desktop" style={{ borderTop: '1px solid #1C1C2A' }}>
        <div className="ak-slbl">It's Never Too Late</div>
        <h2 className="ak-stitle">Why Adults Play <em>Piano.</em></h2>
        <div className="ak-pgrid">
          {[
            { icon: '\u{1F3B9}', title: "It's Never Too Late", desc: "Piano is one of the most accessible instruments for adult beginners. You don't need any prior experience — just the desire to start." },
            { icon: '\u{1F9E0}', title: 'Mental Sharpness', desc: 'Learning piano as an adult is one of the most effective ways to keep your mind sharp. The focus it demands is a workout for your brain.' },
            { icon: '\u{2B50}', title: 'Lifelong Skill', desc: "Unlike most hobbies, piano gives back forever. Every level of skill is rewarding. There's always more to learn and always something beautiful to play." },
          ].map((p, i) => (
            <div className="ak-pcard" key={i}>
              <span className="ak-picon">{p.icon}</span>
              <h3>{p.title}</h3>
              <p>{p.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ─── WHY PIANO — MOBILE CAROUSEL ─── */}
      <section className="ak-sec pn-why-mobile" style={{ display: 'none' }}>
        <div style={{ color: LD.accentColor, fontSize: 11, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase' as const, textAlign: 'center', marginBottom: 16 }}>For Kids & Adults</div>
        <div className="pn-why-carousel">
          {[
            { icon: '\u{1F9E0}', title: 'Brain Development', desc: 'Piano engages both hands independently and both brain hemispheres simultaneously. The cognitive benefits start from the very first lesson.' },
            { icon: '\u{1F3B5}', title: 'Reading Music', desc: 'Piano is the best instrument for learning to read music. That skill transfers to every other instrument they ever pick up.' },
            { icon: '\u{1F3AF}', title: 'Discipline', desc: 'Consistent practice builds habits. Kids who play piano develop patience and follow-through that carries into school and life. And also into making them practice without being asked. Mostly.' },
            { icon: '\u{1F3B9}', title: "It's Never Too Late", desc: "Piano is one of the most accessible instruments for adult beginners. You don't need any prior experience — just the desire to start." },
            { icon: '\u{1F9E0}', title: 'Mental Sharpness', desc: 'Learning piano as an adult is one of the most effective ways to keep your mind sharp. The focus it demands is a workout for your brain.' },
            { icon: '\u{2B50}', title: 'Lifelong Skill', desc: "Unlike most hobbies, piano gives back forever. Every level of skill is rewarding. There's always more to learn and always something beautiful to play." },
          ].map((p, i) => (
            <div className="ak-pcard pn-why-card" key={i}>
              <span className="ak-picon">{p.icon}</span>
              <h3>{p.title}</h3>
              <p>{p.desc}</p>
            </div>
          ))}
        </div>
        <div style={{ fontSize: 11, color: '#444', textAlign: 'center', marginTop: 8 }}>{'\u2190'} Swipe to explore {'\u2192'}</div>
      </section>

      {/* ─── PAIN POINTS (desktop grid) ─── */}
      <section className="ak-sec pn-pain-desktop" style={{ background: '#0A0A10', borderTop: '1px solid #1C1C2A', borderBottom: '1px solid #1C1C2A' }}>
        <div style={{ textAlign: 'center' }}>
          <div className="ak-slbl">Why People Search For Piano Lessons</div>
          <h2 className="ak-stitle">We've Heard Every <em>One Of These.</em></h2>
        </div>
        <div className="pn-pain-grid">
          {PAIN_POINTS.map((pp, i) => (
            <div className="ak-pcard pn-pain-card" key={i}>
              <h3>{pp.title}</h3>
              <p style={{ color: '#9A96B4', fontSize: 13, lineHeight: 1.65, marginBottom: 12 }}>{pp.body}</p>
              <p style={{ color: LD.accentColor, fontSize: 13, fontWeight: 700, lineHeight: 1.55 }}>{pp.solution}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ─── PAIN POINTS (mobile carousel) ─── */}
      <section className="ak-sec pn-pain-mobile" style={{ display: 'none', background: '#0A0A10', borderTop: '1px solid #1C1C2A', borderBottom: '1px solid #1C1C2A' }}>
        <div style={{ textAlign: 'center' }}>
          <div className="ak-slbl">Why People Search For Piano Lessons</div>
          <h2 className="ak-stitle">We've Heard Every <em>One Of These.</em></h2>
        </div>
        <div className="pn-pain-carousel">
          {PAIN_POINTS.map((pp, i) => (
            <div className="ak-pcard pn-pain-swipe-card" key={i}>
              <h3>{pp.title}</h3>
              <p style={{ color: '#9A96B4', fontSize: 13, lineHeight: 1.65, marginBottom: 12 }}>{pp.body}</p>
              <p style={{ color: LD.accentColor, fontSize: 13, fontWeight: 700, lineHeight: 1.55 }}>{pp.solution}</p>
            </div>
          ))}
        </div>
        <div style={{ fontSize: 11, color: '#444', textAlign: 'center', marginTop: 8 }}>Swipe {'\u2192'}</div>
      </section>

      {/* ─── TEACHER COMPATIBILITY ─── */}
      <section className="ak-compat-sec">
        <div className="ak-compat-inner">
          <div className="ak-slbl">Your Teacher Is Already Here</div>
          <h2 className="ak-stitle">YOUR TEACHER IS ALREADY <em>HERE.</em></h2>
          <p className="ak-csub">Every pianist is different. We match you based on your goals, age, and learning style.</p>
          <div className="pn-teacher-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 20 }}>
            {[
              { name: 'The Foundation Builder', desc: 'For beginners who need a strong start — proper technique, note reading, and confidence built from the ground up.' },
              { name: 'The Motivator', desc: 'For students who need lessons connected to music they love. Fun, engaging, and always moving forward.' },
              { name: 'The Mentor', desc: 'For intermediate and advanced students chasing technique, theory, performance, and real musical depth.' },
            ].map((t, i) => (
              <div className="ak-pcard" key={i} style={{ cursor: 'pointer', textAlign: 'center' }}>
                <h3>{t.name}</h3>
                <p>{t.desc}</p>
                <a href={enrollmentUrl} style={{ display: 'inline-block', marginTop: 14, fontSize: 13, fontWeight: 700, color: '#ffffff', textDecoration: 'none' }}>{'\u2192'} This sounds like me</a>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── REVIEWS ─── */}
      <ReviewsSection instrumentTag="piano" />

      {/* ─── 3 STEPS ─── */}
      <section className="ak-steps-sec">
        <div style={{ textAlign: 'center' }}>
          <div className="ak-slbl">Ridiculously Simple</div>
          <h2 className="ak-stitle">3 Steps. <em>That's It.</em></h2>
        </div>
        <div className="ak-sgrid">
          {[
            { n: 1, title: 'Fill Out the Form', desc: 'Tell us your schedule, goals, and preferred location. One form.' },
            { n: 2, title: 'We Find Your Teacher', desc: "We match you on fit — not just who's available. We'll text you so fast it'll feel like we were waiting by the phone. Because we were." },
            { n: 3, title: 'Book Your First Session', desc: "Pick your time and you're in. No waitlists. No weird onboarding. Just piano." },
          ].map(s => (
            <div className="ak-scard" key={s.n}>
              <div className="ak-snum2">{s.n}</div>
              <h3>{s.title}</h3>
              <p>{s.desc}</p>
            </div>
          ))}
        </div>
        <div style={{ textAlign: 'center', marginTop: 36 }}>
          <div style={{ position: 'relative', display: 'inline-block' }}>
            <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: 280, height: 80, borderRadius: '50%', background: 'var(--c)', filter: 'blur(40px)', animation: 'glowPulse 3.2s ease-in-out infinite', opacity: 0.45, pointerEvents: 'none', zIndex: 0 }} />
            <a className="ak-btnp" href={enrollmentUrl} style={{ color: '#ffffff', background: LD.accentColor, position: 'relative', zIndex: 1 }}>Sign Up Now {'\u2192'}</a>
          </div>
        </div>
      </section>

      {/* ─── CROSS-SELL INSTRUMENTS ─── */}
      <section className="ak-sec pn-crosssell-sec">
        <div style={{ textAlign: 'center' }}>
          <div className="ak-slbl">What We Teach</div>
          <h2 className="ak-stitle">Piano Is Just The <em>Start.</em></h2>
          <p style={{ fontSize: 15, color: '#888', textAlign: 'center', maxWidth: 500, margin: '0 auto 32px auto', lineHeight: 1.7 }}>Have more than one kid? Want to add an instrument? We teach everything. One school, one family.</p>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, maxWidth: 400, margin: '0 auto' }}>
          {[
            { emoji: '\u{1F3B8}', name: 'Guitar' },
            { emoji: '\u{1F941}', name: 'Drums' },
            { emoji: '\u{1F3A4}', name: 'Vocals' },
            { emoji: '\u{1F3B8}', name: 'Bass' },
            { emoji: '\u{1F3BB}', name: 'Violin' },
            { emoji: '\u{2795}', name: 'More' },
          ].map(inst => (
            <div
              key={inst.name}
              className="pn-crosssell-card"
              style={{
                width: '100%',
                padding: '12px 8px',
                background: '#111118',
                border: '1px solid rgba(255,255,255,0.07)',
                borderRadius: 10,
                display: 'flex',
                flexDirection: 'column' as const,
                alignItems: 'center',
                gap: 6,
                pointerEvents: 'none' as const,
                cursor: 'default',
              }}
            >
              <div className="pn-crosssell-emoji" style={{ fontSize: 22, textAlign: 'center' }}>{inst.emoji}</div>
              <div className="pn-crosssell-name" style={{ fontSize: 10, color: '#777', textAlign: 'center', textTransform: 'uppercase' as const, letterSpacing: '0.08em' }}>{inst.name}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ─── FAQ ─── */}
      <section className="ak-sec" style={{ background: '#0A0A10', borderTop: '1px solid #1C1C2A', borderBottom: '1px solid #1C1C2A' }}>
        <div style={{ textAlign: 'center' }}>
          <div className="ak-slbl">Questions</div>
          <h2 className="ak-stitle">Frequently <em>Asked.</em></h2>
        </div>
        <div style={{ maxWidth: 680, margin: '36px auto 0' }}>
          {FAQS.map((f, i) => (
            <div key={i} className="pn-faq-item">
              <button className={`pn-faq-q${openFaq === i ? ' open' : ''}`} onClick={() => setOpenFaq(openFaq === i ? null : i)}>
                {f.q}
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
              </button>
              <div className={`pn-faq-a${openFaq === i ? ' open' : ''}`}>
                <p>{f.a}</p>
                {f.link && <a href={enrollmentUrl} style={{ display: 'inline-block', marginTop: 8, fontSize: 13, fontWeight: 600, color: LD.accentColor, textDecoration: 'none' }}>Fill out the form {'\u2192'}</a>}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ─── OUR STORY ─── */}
      <section className="ak-sec" style={{ background: '#0A0A10', borderTop: '1px solid #1C1C2A', borderBottom: '1px solid #1C1C2A' }}>
        <div style={{ maxWidth: 720, margin: '0 auto', textAlign: 'center' }}>
          <div style={{ color: LD.accentColor, fontSize: 11, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase' as const, marginBottom: 13 }}>Our Story</div>
          <h2 style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 48, color: '#fff', lineHeight: 0.95, letterSpacing: '0.5px', marginBottom: 36 }}>THE STORY BEHIND THE SCHOOL.</h2>

          {/* KETV Video */}
          <div style={{ position: 'relative', borderRadius: 10, overflow: 'hidden', cursor: 'pointer', marginBottom: 8 }} onClick={() => setVid1(true)}>
            {vid1 ? (
              <iframe src="https://www.youtube.com/embed/XZqrihpE-Fw?autoplay=1" allow="autoplay; encrypted-media" allowFullScreen title="Adkins Music Lessons on KETV News" style={{ width: '100%', aspectRatio: '16/9', border: 0 }} />
            ) : (
              <>
                <img src="https://img.youtube.com/vi/XZqrihpE-Fw/maxresdefault.jpg" alt="Adkins Music Lessons on KETV News" loading="lazy" style={{ width: '100%', display: 'block', borderRadius: 10 }} />
                <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: 56, height: 56, borderRadius: '50%', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 18px rgba(0,0,0,0.4)' }}>
                  <svg viewBox="0 0 24 24" style={{ width: 22, height: 22, fill: '#111', marginLeft: 3 }}><path d="M8 5v14l11-7z"/></svg>
                </div>
              </>
            )}
          </div>
          <p style={{ fontSize: 13, color: '#666', marginBottom: 32 }}>Adkins Music Lessons on KETV News — Nebraska's top music school, featured on local news</p>

          {/* Founder story card */}
          <div style={{
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 14,
            padding: 24,
            maxWidth: 720,
            margin: '24px auto',
            textAlign: 'center',
          }}>
            <span style={{ fontSize: 36, lineHeight: 1, display: 'block', marginBottom: 8, color: LD.accentColor }}>"</span>
            <p style={{ fontSize: 14, lineHeight: 1.65, color: '#bbb', fontFamily: "'Barlow', sans-serif", margin: 0, textAlign: 'center' }}>
              I've been playing music my whole life. My entire family plays. I started teaching out of my house with one student and spent the next decade building something I'm genuinely proud of. Four locations. 650 students. A team of teachers who genuinely care. Every decision we make is for the student. That's it. That's why we're here.
            </p>
            <span style={{ fontSize: 12, color: LD.accentColor, fontWeight: 700, marginTop: 16, display: 'block', fontStyle: 'italic' }}>— Zach Adkins, Owner & Founder</span>
          </div>

          {/* Championship Video */}
          <div style={{ position: 'relative', borderRadius: 10, overflow: 'hidden', cursor: 'pointer', marginBottom: 8, marginTop: 32 }} onClick={() => setVid2(true)}>
            {vid2 ? (
              <iframe src="https://www.youtube.com/embed/rSXKNzfl3Lo?autoplay=1" allow="autoplay; encrypted-media" allowFullScreen title="Zach Adkins — National Guitar Champion" style={{ width: '100%', aspectRatio: '16/9', border: 0 }} />
            ) : (
              <>
                <img src="https://img.youtube.com/vi/rSXKNzfl3Lo/maxresdefault.jpg" alt="Zach Adkins — National Guitar Champion" loading="lazy" style={{ width: '100%', display: 'block', borderRadius: 10 }} />
                <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: 56, height: 56, borderRadius: '50%', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 18px rgba(0,0,0,0.4)' }}>
                  <svg viewBox="0 0 24 24" style={{ width: 22, height: 22, fill: '#111', marginLeft: 3 }}><path d="M8 5v14l11-7z"/></svg>
                </div>
              </>
            )}
          </div>
          <p style={{ fontSize: 13, color: '#666' }}>Zach Adkins — First Place, National Guitar Competition. This is where it all started.</p>
        </div>
      </section>

      {/* ─── LOCATION MAP ─── */}
      <section className="ak-loc-sec" id="location-section">
        <div style={{ textAlign: 'center' }}>
          <div className="ak-slbl">Visit Us</div>
          <h2 className="ak-stitle">{LD.fullName}</h2>
        </div>
        <div className="ak-loc-grid">
          <div className="ak-loc-info">
            <div className="ak-loc-row">
              <span className="ak-loc-icon">{'\u{1F4CD}'}</span>
              <div>
                <div className="ak-loc-label">Address</div>
                <div className="ak-loc-value">{LD.address}</div>
              </div>
            </div>
            <div className="ak-loc-row">
              <span className="ak-loc-icon">{'\u{1F4DE}'}</span>
              <div>
                <div className="ak-loc-label">Phone</div>
                <a className="ak-loc-value ak-loc-link" href={`tel:${LD.phone.replace(/\D/g, '')}`}>{LD.phone}</a>
              </div>
            </div>
            <div className="ak-loc-row">
              <span className="ak-loc-icon">{'\u2709\uFE0F'}</span>
              <div>
                <div className="ak-loc-label">Email</div>
                <a className="ak-loc-value ak-loc-link" href={`mailto:${LD.email}`}>{LD.email}</a>
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
              href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(LD.address)}`}
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: '#ffffff' }}
            >
              Get Directions {'\u2192'}
            </a>
          </div>
          <div className="ak-loc-map">
            <iframe
              key={loc}
              title={`Map — ${LD.fullName}`}
              src={`https://maps.google.com/maps?q=${encodeURIComponent(LD.address)}&output=embed`}
              width="100%"
              height="100%"
              style={{ border: 0, borderRadius: 14 }}
              allowFullScreen
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
            />
          </div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'center', gap: 12, marginTop: 24, flexWrap: 'wrap' }}>
          {otherLocs.map(k => (
            <button
              key={k}
              onClick={() => navigate(`/${k}/${currentInstrument}`)}
              style={{
                display: 'inline-block',
                padding: '8px 20px',
                borderRadius: 20,
                border: `2px solid ${LOCATIONS[k].accentColor}`,
                color: LOCATIONS[k].accentColor,
                background: 'transparent',
                fontFamily: "'Barlow', sans-serif",
                fontSize: 13,
                fontWeight: 700,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              {LOCATIONS[k].name} {'\u2192'}
            </button>
          ))}
        </div>
      </section>

      {/* ─── FINAL CTA ─── */}
      <section className="ak-final-sec">
        <h2>YOUR <span style={{ color: LD.accentColor }}>TEACHER</span> IS WAITING FOR YOU.</h2>
        <p>Your future pianist is one form away. Fair warning — they will want a real piano eventually. Fair further warning: pianos are extremely heavy.</p>
        <div className="ak-fbtns">
          <div style={{ position: 'relative', display: 'inline-block' }}>
            <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: 380, height: 100, borderRadius: '50%', background: 'var(--c)', filter: 'blur(40px)', animation: 'glowPulse 3s ease-in-out infinite', opacity: 0.55, pointerEvents: 'none', zIndex: 0 }} />
            <a className="ak-btnp" style={{ fontSize: 16, padding: '16px 34px', color: '#ffffff', background: LD.accentColor, position: 'relative', zIndex: 1 }} href={enrollmentUrl}>Get Signed Up Now {'\u2192'}</a>
          </div>
        </div>
      </section>

      {/* ─── FOOTER ─── */}
      <footer className="ak-footer">
        <div className="ak-fname">{LD.fullName.toUpperCase()}</div>
        <div style={{ fontSize: 11, color: '#55516E', marginBottom: 8 }}>By Adkins Music Lessons</div>
        <div className="ak-fpow">Powered by <span>Lessonpreneur</span></div>
      </footer>
    </div>
  )
}
