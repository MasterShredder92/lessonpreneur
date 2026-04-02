import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate, useLocation as useRouterLocation } from 'react-router-dom'
import { LOCATIONS, type LocKey } from '../config/locations'
import { useSiteLocation } from '../hooks/useSiteLocation'
import ReviewsSection from '../components/site/ReviewsSection'
import SiteHeader from '../components/site/SiteHeader'
import { useLocationTracking } from '../hooks/useLocationTracking'
import { trackInstrumentView } from '../lib/tracking'
import './adkins.css'
import './drums.css'

// ═══════════════════════════════════════
// DATA
// ═══════════════════════════════════════

const ENROLLMENT_URL = '/intake/adkins-music-lessons'

// Drum pad config
const CACHE_V = '20260331b'
const PADS = [
  { id: 'crash', name: 'CRASH', icon: '\u{1F4A5}', key: 'H', file: `/audio/drums/crash.wav?v=${CACHE_V}` },
  { id: 'hihat', name: 'HI-HAT', icon: '\u{1F514}', key: 'D', file: `/audio/drums/hihat.wav?v=${CACHE_V}` },
  { id: 'ride', name: 'RIDE', icon: '\u{1F6CE}', key: 'J', file: `/audio/drums/ride.wav?v=${CACHE_V}` },
  { id: 'hitom', name: 'HI TOM', icon: '\u{1F941}', key: 'F', file: `/audio/drums/hitom.wav?v=${CACHE_V}` },
  { id: 'snare', name: 'SNARE', icon: '\u{1F4AF}', key: 'S', file: `/audio/drums/snare.wav?v=${CACHE_V}` },
  { id: 'lotom', name: 'LO TOM', icon: '\u{1F3B6}', key: 'G', file: `/audio/drums/lotom.wav?v=${CACHE_V}` },
  { id: 'kick', name: 'KICK DRUM', icon: '\u{1F4A3}', key: 'A', file: `/audio/drums/kick.wav?v=${CACHE_V}`, wide: true },
]

const FAQS = [
  { q: 'Do we need a drum kit at home?', a: "If you have a drum pad, an e-kit, or an acoustic kit at home — that's all you need to get started. If you haven't bought anything yet, no worries. After your first few sessions we'll help you find the right setup for your budget and goals. We're always here to help. (We get asked this a lot. Like, a lot a lot.)" },
  { q: 'What if we need to miss a session?', a: "Sessions are prepaid in monthly packages. We build a 5th-week buffer into every month so life can happen without you falling behind." },
  { q: 'How much does it cost?', a: "Sessions are billed in 30-minute increments and sold in prepaid monthly packages. The total varies depending on how many students you're enrolling and how many instruments you want to add. Fill out the form and we'll walk you through all the options — no pressure, no surprises.", link: true },
  { q: 'Where are your locations?', a: "Four locations across the Omaha metro: Omaha (96th St), Gretna, Bellevue, and Elkhorn. We'll match you to the closest one." },
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

function playBuffer(buf: AudioBuffer) {
  const ctx = initAudioCtx()
  const src = ctx.createBufferSource()
  src.buffer = buf
  src.connect(ctx.destination)
  src.start()
}

// Synthesized fallbacks
function synthKick() {
  const c = initAudioCtx(); const o = c.createOscillator(); const g = c.createGain()
  o.connect(g); g.connect(c.destination); o.type = 'sine'
  o.frequency.setValueAtTime(150, c.currentTime); o.frequency.exponentialRampToValueAtTime(40, c.currentTime + 0.15)
  g.gain.setValueAtTime(0.8, c.currentTime); g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.3)
  o.start(); o.stop(c.currentTime + 0.3)
}
function synthSnare() {
  const c = initAudioCtx(); const n = c.createBufferSource(); const g = c.createGain()
  const buf = c.createBuffer(1, c.sampleRate * 0.15, c.sampleRate); const d = buf.getChannelData(0)
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1
  n.buffer = buf; n.connect(g); g.connect(c.destination)
  g.gain.setValueAtTime(0.5, c.currentTime); g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.15)
  n.start(); n.stop(c.currentTime + 0.15)
}
function synthHihat() {
  const c = initAudioCtx(); const n = c.createBufferSource(); const g = c.createGain()
  const f = c.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 8000
  const buf = c.createBuffer(1, c.sampleRate * 0.06, c.sampleRate); const d = buf.getChannelData(0)
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1
  n.buffer = buf; n.connect(f); f.connect(g); g.connect(c.destination)
  g.gain.setValueAtTime(0.3, c.currentTime); g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.06)
  n.start(); n.stop(c.currentTime + 0.06)
}
function synthTom(freq: number) {
  const c = initAudioCtx(); const o = c.createOscillator(); const g = c.createGain()
  o.connect(g); g.connect(c.destination); o.type = 'sine'
  o.frequency.setValueAtTime(freq, c.currentTime); o.frequency.exponentialRampToValueAtTime(freq * 0.5, c.currentTime + 0.2)
  g.gain.setValueAtTime(0.6, c.currentTime); g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.25)
  o.start(); o.stop(c.currentTime + 0.25)
}
function synthCrash() {
  const c = initAudioCtx(); const n = c.createBufferSource(); const g = c.createGain()
  const buf = c.createBuffer(1, c.sampleRate * 0.6, c.sampleRate); const d = buf.getChannelData(0)
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1
  n.buffer = buf; n.connect(g); g.connect(c.destination)
  g.gain.setValueAtTime(0.4, c.currentTime); g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.6)
  n.start(); n.stop(c.currentTime + 0.6)
}

const SYNTH_FALLBACKS: Record<string, () => void> = {
  kick: synthKick, snare: synthSnare, hihat: synthHihat,
  hitom: () => synthTom(300), lotom: () => synthTom(180),
  crash: synthCrash, ride: synthCrash,
}

// ═══════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════

const LOC_RANKINGS: Record<LocKey, string> = {
  omaha: '#2',
  gretna: '#1',
  bellevue: '#3',
  elkhorn: '#6',
}

export default function DrumsLanding() {
  const siteLoc = useSiteLocation()
  const navigate = useNavigate()
  const { pathname } = useRouterLocation()
  const loc = siteLoc.key as LocKey
  const LD = LOCATIONS[loc]
  const currentInstrument = pathname.split('/')[2] || 'drums'

  useLocationTracking(LD)
  useEffect(() => { trackInstrumentView('Drums') }, [])

  useEffect(() => {
    document.title = `Drum Lessons in ${LD.name}, NE | Rock to Jazz — Adkins Music Lessons`
    document.querySelector('meta[name="description"]')?.setAttribute('content',
      `Private drum lessons in ${LD.name}, NE. Rock, jazz and more. Expert teachers, flexible scheduling, no contracts. Book in 60 seconds. ${LD.phone}`)
  }, [loc])

  // Set CSS vars on location change (same as AdkinsLanding)
  useEffect(() => {
    const r = document.documentElement.style
    r.setProperty('--c', LD.accentColor)
    r.setProperty('--cg', LD.accentGlow)
    r.setProperty('--cl', LD.accentLight)
    r.setProperty('--loc-color', LD.accentColor)
  }, [loc])

  // Intro overlay — only on first visit in session
  const showIntro = !sessionStorage.getItem('drums-intro-seen')
  const [overlayDone, setOverlayDone] = useState(!showIntro)

  // Drum pad hits
  const [hitPad, setHitPad] = useState<string | null>(null)
  const [ripples, setRipples] = useState<{ id: number; padId: string; x: number; y: number }[]>([])
  const rippleId = useRef(0)
  const preloaded = useRef(false)

  // Video
  const [vid1, setVid1] = useState(false)
  const [vid2, setVid2] = useState(false)

  // FAQ
  const [openFaq, setOpenFaq] = useState<number | null>(null)

  // Overlay timing — only if showing intro
  useEffect(() => {
    if (!showIntro) return
    const t1 = setTimeout(() => { try { synthKick() } catch {} }, 300)
    const t2 = setTimeout(() => { try { synthSnare() } catch {} }, 600)
    const t3 = setTimeout(() => { try { synthHihat() } catch {} }, 900)
    const t4 = setTimeout(() => {
      setOverlayDone(true)
      sessionStorage.setItem('drums-intro-seen', '1')
    }, 1750)
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); clearTimeout(t4) }
  }, [])

  // Preload drum sounds on first interaction
  const ensurePreloaded = useCallback(() => {
    if (preloaded.current) return
    preloaded.current = true
    initAudioCtx()
    PADS.forEach(p => loadBuffer(p.file))
  }, [])

  // Hit a drum pad (debounced to prevent double-fire)
  const padPlaying = useRef<Record<string, boolean>>({})
  const hitDrum = useCallback(async (padId: string, e?: React.MouseEvent) => {
    if (padPlaying.current[padId]) return
    padPlaying.current[padId] = true
    setTimeout(() => { padPlaying.current[padId] = false }, 200)

    ensurePreloaded()
    const pad = PADS.find(p => p.id === padId)
    if (!pad) return

    const buf = await loadBuffer(pad.file)
    if (buf) { playBuffer(buf) } else { SYNTH_FALLBACKS[padId]?.() }

    setHitPad(padId)
    setTimeout(() => setHitPad(null), 160)

    if (e) {
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
      const id = ++rippleId.current
      setRipples(prev => [...prev, { id, padId, x: e.clientX - rect.left, y: e.clientY - rect.top }])
      setTimeout(() => setRipples(prev => prev.filter(r => r.id !== id)), 480)
    }
  }, [ensurePreloaded])

  // Keyboard shortcuts
  useEffect(() => {
    const keyMap: Record<string, string> = { a: 'kick', s: 'snare', d: 'hihat', f: 'hitom', g: 'lotom', h: 'crash', j: 'ride' }
    const onKey = (e: KeyboardEvent) => {
      const pad = keyMap[e.key.toLowerCase()]
      if (pad) hitDrum(pad)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [hitDrum])


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
      {/* ─── INTRO OVERLAY ─── */}
      {showIntro && (
        <div className={`dr-overlay${overlayDone ? ' done' : ''}`}>
          <div className="dr-overlay-title">FEEL THE <span>BEAT.</span></div>
          <div className="dr-eq-intro">
            {Array.from({ length: 12 }).map((_, i) => (
              <div key={i} className="dr-eq-intro-bar" style={{ animationDelay: `${i * 0.06}s`, animationDuration: `${0.3 + Math.random() * 0.4}s` }} />
            ))}
          </div>
        </div>
      )}

      <SiteHeader activeInstrument="drums" />

      {/* ─── HERO ─── */}
      <section className="ak-hero">
        <div className="ak-hbg-glow" />
        <div className="ak-hgrid" />
        <div className="ak-hcontent">
          <h1 className="ak-htitle">
            <span className="ak-htitle-line1">This Is Where</span>
            <span className="ak-htitle-born">DRUMMERS</span>
            <span className="ak-htitle-line3">Are Made.</span>
          </h1>
          <p style={{ fontSize: 18, fontWeight: 400, color: 'rgba(255,255,255,0.75)', fontStyle: 'italic', textAlign: 'center', maxWidth: 560, margin: '16px auto' }}>The moment they sit behind a kit, everything changes.</p>
          <p className="ak-hsub">Private one-on-one sessions for ages 5 to adult. 4 metro locations. Your teacher is already waiting.</p>
          <div className="ak-hctas" style={{ marginTop: 32 }}>
            <div style={{ position: 'relative', display: 'inline-block' }}>
              <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: 200, height: 60, borderRadius: '50%', background: 'var(--c)', filter: 'blur(40px)', animation: 'glowPulse 3.5s ease-in-out infinite', opacity: 0.35, pointerEvents: 'none', zIndex: 0 }} />
              <a className="ak-btnp" href={ENROLLMENT_URL} style={{ color: '#ffffff', position: 'relative', zIndex: 1 }}>Sign Up For Lessons Now {'\u{2192}'}</a>
            </div>
          </div>
          <div className="ak-htrust">
            <div className="ak-tstat"><div className="ak-tnum" style={{ color: LD.accentColor }}>{LOC_RANKINGS[loc]}</div><div className="ak-tlbl">Ranked in Nebraska</div></div>
            <div className="ak-tdiv" />
            <div className="ak-tstat"><div className="ak-tnum">650+</div><div className="ak-tlbl">Enrolled</div></div>
            <div className="ak-tdiv" />
            <div className="ak-tstat"><div className="ak-tnum">2,200+</div><div className="ak-tlbl">Taught Overall</div></div>
          </div>
        </div>
        <div className="dr-eq-strip">
          {eqBars.map((b, i) => (
            <div key={i} className="dr-eq-bar" style={{ '--h1': `${b.h1}px`, '--h2': `${b.h2}px`, '--spd': `${b.spd}s`, '--op': b.op } as React.CSSProperties} />
          ))}
        </div>
      </section>

      {/* ─── DRUM KIT ─── */}
      <section className="ak-sec" id="dr-kit" style={{ background: '#0A0A10', borderTop: '1px solid #1C1C2A', borderBottom: '1px solid #1C1C2A' }}>
        <div style={{ textAlign: 'center' }}>
          <div className="ak-slbl">Don't Just Take Our Word For It</div>
          <h2 className="ak-stitle">Tap The <em>Kit.</em></h2>
          <p className="ak-secdesc" style={{ margin: '0 auto 36px' }}>Real sounds. Real instruments. Go ahead.</p>
        </div>
        <div className="dr-kit-grid">
          {PADS.map(pad => (
            <div
              key={pad.id}
              className={`dr-pad${pad.wide ? ' dr-pad-wide' : ''}${hitPad === pad.id ? ' hit' : ''}`}
              onMouseDown={e => hitDrum(pad.id, e)}
            >
              <div className="dr-pad-flash" />
              {ripples.filter(r => r.padId === pad.id).map(r => (
                <div key={r.id} className="dr-pad-ripple" style={{ left: r.x - 20, top: r.y - 20 }} />
              ))}
              {pad.wide ? (
                <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                  <span style={{ fontSize: 20 }}>{pad.icon}</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#fff', letterSpacing: '0.05em' }}>{pad.name}</span>
                </div>
              ) : (
                <>
                  <span className="dr-pad-icon">{pad.icon}</span>
                  <span className="dr-pad-name">{pad.name}</span>
                  <span className="dr-pad-key">{pad.key}</span>
                </>
              )}
            </div>
          ))}
        </div>
        <p style={{ fontSize: 13, color: '#666', textAlign: 'center', marginTop: 8 }}>Warning: tapping this kit may cause an uncontrollable urge to sign up.</p>
      </section>

      {/* ─── WHY DRUMS — KIDS (desktop) ─── */}
      <section className="ak-sec dr-why-desktop">
        <div className="ak-slbl">For Kids</div>
        <h2 className="ak-stitle">Why Drums Change <em>Kids.</em></h2>
        <div className="ak-pgrid">
          {[
            { icon: '\u{1F4AA}', title: 'Confidence', desc: "Every beat is a win. Drummers build real self-confidence — whether you're 7 or 47." },
            { icon: '\u{1F3AF}', title: 'Focus', desc: 'Drumming demands your full attention. That focus carries into everything else you do.' },
            { icon: '\u{1F9E0}', title: 'Coordination', desc: 'Hands and feet working together rewires your brain. The benefits are real and they compound.' },
          ].map((p, i) => (
            <div className="ak-pcard" key={i}>
              <span className="ak-picon">{p.icon}</span>
              <h3>{p.title}</h3>
              <p>{p.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ─── WHY DRUMS — ADULTS (desktop) ─── */}
      <section className="ak-sec dr-why-desktop" style={{ borderTop: '1px solid #1C1C2A' }}>
        <div className="ak-slbl">It's Never Too Late</div>
        <h2 className="ak-stitle">Why Adults Play <em>Drums.</em></h2>
        <div className="ak-pgrid">
          {[
            { icon: '\u{1F9D8}', title: 'Stress Relief', desc: "Thirty minutes behind a kit and the day disappears. There's nothing quite like it." },
            { icon: '\u{1F3B5}', title: 'Creative Outlet', desc: "You've always had rhythm. Now you have somewhere to put it." },
            { icon: '\u{1F9E0}', title: 'Brain Health', desc: 'Drumming engages both sides of the brain simultaneously. At any age, the cognitive benefits are measurable.' },
          ].map((p, i) => (
            <div className="ak-pcard" key={i}>
              <span className="ak-picon">{p.icon}</span>
              <h3>{p.title}</h3>
              <p>{p.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ─── WHY DRUMS — MOBILE CAROUSEL ─── */}
      <section className="ak-sec dr-why-mobile" style={{ display: 'none' }}>
        <div style={{ color: LD.accentColor, fontSize: 11, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase' as const, textAlign: 'center', marginBottom: 16 }}>For Kids & Adults</div>
        <div className="dr-why-carousel">
          {[
            { icon: '\u{1F4AA}', title: 'Confidence', desc: "Every beat is a win. Drummers build real self-confidence — whether you're 7 or 47." },
            { icon: '\u{1F3AF}', title: 'Focus', desc: 'Drumming demands your full attention. That focus carries into everything else you do.' },
            { icon: '\u{1F9E0}', title: 'Coordination', desc: 'Hands and feet working together rewires your brain. The benefits are real and they compound.' },
            { icon: '\u{1F9D8}', title: 'Stress Relief', desc: "Thirty minutes behind a kit and the day disappears. There's nothing quite like it." },
            { icon: '\u{1F3B5}', title: 'Creative Outlet', desc: "You've always had rhythm. Now you have somewhere to put it." },
            { icon: '\u{1F9E0}', title: 'Brain Health', desc: 'Drumming engages both sides of the brain simultaneously. At any age, the cognitive benefits are measurable.' },
          ].map((p, i) => (
            <div className="ak-pcard dr-why-card" key={i}>
              <span className="ak-picon">{p.icon}</span>
              <h3>{p.title}</h3>
              <p>{p.desc}</p>
            </div>
          ))}
        </div>
        <div style={{ fontSize: 11, color: '#444', textAlign: 'center', marginTop: 8 }}>{'\u{2190}'} Swipe to explore {'\u{2192}'}</div>
      </section>

      {/* ─── TEACHER COMPATIBILITY ─── */}
      <section className="ak-compat-sec">
        <div className="ak-compat-inner">
          <div className="ak-slbl">Your Teacher Is Already Here</div>
          <h2 className="ak-stitle">Find Your <em>Match.</em></h2>
          <p className="ak-csub">Every drummer is different. We match you with a teacher based on your goals, age, and personality — not just whoever's available.</p>
          <div className="dr-teacher-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 20 }}>
            {[
              { name: 'The Encourager', desc: 'Great for beginners and kids who need confidence building. Patient, positive, celebrates every win.' },
              { name: 'The Technician', desc: 'Great for intermediate players who want real skills. Rudiments, reading, and discipline that sticks.' },
              { name: 'The Jammer', desc: 'Great for teens and adults who want to play real music fast. Learn songs, play along, and feel like a drummer from day one.' },
            ].map((t, i) => (
              <div className="ak-pcard" key={i} style={{ cursor: 'pointer', textAlign: 'center' }}>
                <h3>{t.name}</h3>
                <p>{t.desc}</p>
                <a href={`/${loc}/signup`} style={{ display: 'inline-block', marginTop: 14, fontSize: 13, fontWeight: 700, color: '#ffffff', textDecoration: 'none' }}>{'\u{2192}'} This sounds like me</a>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── REVIEWS ─── */}
      <ReviewsSection instrumentTag="drums" />

      {/* ─── 3 STEPS ─── */}
      <section className="ak-steps-sec">
        <div style={{ textAlign: 'center' }}>
          <div className="ak-slbl">Ridiculously Simple</div>
          <h2 className="ak-stitle">3 Steps. <em>That's It.</em></h2>
        </div>
        <div className="ak-sgrid">
          {[
            { n: 1, title: 'Fill Out the Form', desc: 'Tell us your schedule, goals, and preferred location. One form.' },
            { n: 2, title: 'We Find Your Teacher', desc: "We match you on fit — not just who's available. We'll text you so fast it'll feel like we were waiting by the phone. Because we were. We take this part seriously. Seriously." },
            { n: 3, title: 'Book Your First Session', desc: "Pick your time and you're in. No waitlists. No weird onboarding. Just drumming." },
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
            <a className="ak-btnp" href={ENROLLMENT_URL} style={{ color: '#ffffff', background: LD.accentColor, position: 'relative', zIndex: 1 }}>Sign Up Now {'\u{2192}'}</a>
          </div>
        </div>
      </section>

      {/* ─── CROSS-SELL INSTRUMENTS ─── */}
      <section className="ak-sec dr-crosssell-sec">
        <div style={{ textAlign: 'center' }}>
          <div className="ak-slbl">What We Teach</div>
          <h2 className="ak-stitle">Drums Are Just The <em>Start.</em></h2>
          <p style={{ fontSize: 15, color: '#888', textAlign: 'center', maxWidth: 500, margin: '0 auto 32px auto', lineHeight: 1.7 }}>We teach more than drums. Whether your kid wants to add an instrument or you want to try something new — we have a teacher for that. One school, one family.</p>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, maxWidth: 400, margin: '0 auto' }}>
          {[
            { emoji: '\u{1F3B9}', name: 'Piano' },
            { emoji: '\u{1F3B8}', name: 'Guitar' },
            { emoji: '\u{1F3A4}', name: 'Vocals' },
            { emoji: '\u{1F3B8}', name: 'Bass' },
            { emoji: '\u{1F3BB}', name: 'Violin' },
            { emoji: '\u{2795}', name: 'More' },
          ].map(inst => (
            <div
              key={inst.name}
              className="dr-crosssell-card"
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
              <div className="dr-crosssell-emoji" style={{ fontSize: 22, textAlign: 'center' }}>{inst.emoji}</div>
              <div className="dr-crosssell-name" style={{ fontSize: 10, color: '#777', textAlign: 'center', textTransform: 'uppercase' as const, letterSpacing: '0.08em' }}>{inst.name}</div>
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
            <div key={i} className="dr-faq-item">
              <button className={`dr-faq-q${openFaq === i ? ' open' : ''}`} onClick={() => setOpenFaq(openFaq === i ? null : i)}>
                {f.q}
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
              </button>
              <div className={`dr-faq-a${openFaq === i ? ' open' : ''}`}>
                <p>{f.a}</p>
                {f.link && <a href={`/${loc}/signup`} style={{ display: 'inline-block', marginTop: 8, fontSize: 13, fontWeight: 600, color: LD.accentColor, textDecoration: 'none' }}>Fill out the form {'\u{2192}'}</a>}
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
              I've been playing music my whole life. My entire family plays. I started teaching out of my house with one student and spent the next decade building something I'm genuinely proud of. Four locations. 650 students. A team of teachers who actually give a damn. Every decision we make is for the student. That's it. That's why we're here.
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
              <span className="ak-loc-icon">{'\u{2709}\u{FE0F}'}</span>
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
              Get Directions {'\u{2192}'}
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
              {LOCATIONS[k].name} {'\u{2192}'}
            </button>
          ))}
        </div>
      </section>

      {/* ─── FINAL CTA ─── */}
      <section className="ak-final-sec">
        <h2>YOUR TEACHER IS <span style={{ color: LD.accentColor }}>WAITING</span> FOR YOU.</h2>
        <p>Your future drummer is one form away. The neighbors will adjust.</p>
        <div className="ak-fbtns">
          <div style={{ position: 'relative', display: 'inline-block' }}>
            <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: 380, height: 100, borderRadius: '50%', background: 'var(--c)', filter: 'blur(40px)', animation: 'glowPulse 3s ease-in-out infinite', opacity: 0.55, pointerEvents: 'none', zIndex: 0 }} />
            <a className="ak-btnp" style={{ fontSize: 16, padding: '16px 34px', color: '#ffffff', background: LD.accentColor, position: 'relative', zIndex: 1 }} href={ENROLLMENT_URL}>Get Signed Up Now {'\u{2192}'}</a>
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
