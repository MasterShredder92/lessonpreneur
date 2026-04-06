import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
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
import { detectChord } from '../lib/chordDetector'
import './adkins.css'
import './guitar.css'

// ═══════════════════════════════════════
// DATA
// ═══════════════════════════════════════


const STRINGS = ['E2', 'A2', 'D3', 'G3', 'B3', 'E4'] as const
type StringName = typeof STRINGS[number]

interface ChordData {
  name: string
  key: string
  frets: Record<StringName, number | 'x'>
}

const CHORDS: ChordData[] = [
  { name: 'C Major', key: 'c', frets: { E2: 'x', A2: 3, D3: 2, G3: 0, B3: 1, E4: 0 } },
  { name: 'G Major', key: 'g', frets: { E2: 3, A2: 2, D3: 0, G3: 0, B3: 0, E4: 3 } },
  { name: 'D Major', key: 'd', frets: { E2: 'x', A2: 'x', D3: 0, G3: 2, B3: 3, E4: 2 } },
  { name: 'Am', key: 'a', frets: { E2: 'x', A2: 0, D3: 2, G3: 2, B3: 1, E4: 0 } },
]

const FAQS = [
  { q: 'Do I need my own guitar to start?', a: "It helps but it's not required for your first lesson. After your first session we'll help you find the right guitar for your budget and goals — acoustic, electric, or classical. No pressure, no upsell." },
  { q: 'What if my child loses interest?', a: "It happens, and here's the truth: it usually means the lessons aren't connecting with what they love yet. We'll adjust the approach, try different songs, or match them with a different teacher. We'd rather fix it than lose them. (We've fixed a lot of them.)" },
  { q: 'How much do lessons cost?', a: "Sessions are billed in 30-minute increments and sold in prepaid monthly packages. The total varies depending on how many students you're enrolling and how many instruments. Fill out the form and we'll walk you through all the options — no pressure, no surprises.", link: true },
  { q: 'Where are your locations?', a: "Four locations across the Omaha metro: Omaha (96th St), Gretna, Bellevue, and Elkhorn. We'll match you to the closest one." },
]

const PAIN_POINTS = [
  { title: 'Feeling Lost Without a Clear Path', body: "Too many videos, apps, and tabs. No idea what to focus on or how to build skills in the right order.", solution: "We give you a structured path from day one. No guessing." },
  { title: 'Finger Pain & Slow Chord Changes', body: "Sore fingers, hand fatigue, messy transitions. Playing feels uncomfortable without proper technique.", solution: "We fix technique early so it never becomes a bad habit." },
  { title: 'Lessons That Kill Motivation', body: "Repetitive exercises with no connection to music you love. Progress feels invisible.", solution: "We teach songs you actually want to play from lesson one." },
  { title: 'Following Tabs But Not Understanding Music', body: "You can copy songs but can't improvise, write, or understand why anything works.", solution: "We build real musical understanding alongside technique." },
  { title: 'Advanced Techniques Feel Impossible', body: "Alternate picking, sweep picking, modes — overwhelming without someone who breaks it down right.", solution: "We make complex techniques approachable at every level." },
  { title: 'Stuck With the Wrong Teacher', body: "One-size-fits-all teaching that doesn't match your goals, style, or personality.", solution: "We match you to the right instructor — not just whoever's available." },
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

function playBufferAt(buf: AudioBuffer, when: number) {
  const ctx = initAudioCtx()
  const src = ctx.createBufferSource()
  src.buffer = buf
  src.connect(ctx.destination)
  src.start(when)
}

// Synthesized intro chord (E major open)
function synthIntroChord() {
  const ctx = initAudioCtx()
  const freqs = [82, 123, 165, 207, 247, 330]
  freqs.forEach((freq, i) => {
    const o = ctx.createOscillator()
    const g = ctx.createGain()
    o.connect(g)
    g.connect(ctx.destination)
    o.type = 'triangle'
    o.frequency.value = freq
    const startTime = ctx.currentTime + i * 0.035
    g.gain.setValueAtTime(0, startTime)
    g.gain.linearRampToValueAtTime(0.15, startTime + 0.01)
    g.gain.exponentialRampToValueAtTime(0.001, startTime + 0.5)
    o.start(startTime)
    o.stop(startTime + 0.5)
  })
}


// ═══════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════

// LOC_RANKINGS removed — now pulled live from Supabase via useLocationStats

export default function GuitarLanding() {
  const siteLoc = useSiteLocation()
  const navigate = useNavigate()
  const { pathname } = useRouterLocation()
  const loc = siteLoc.key as LocKey
  const LD = LOCATIONS[loc]
  const enrollmentUrl = `/${loc}/signup`
  const currentInstrument = pathname.split('/')[2] || 'guitar'

  useLocationTracking(LD)
  const locStats = useLocationStats(loc)
  useEffect(() => { trackInstrumentView('Guitar') }, [])

  useEffect(() => {
    document.title = `Guitar Lessons in ${LD.name}, NE | Acoustic to Electric — Adkins Music Lessons`
    document.querySelector('meta[name="description"]')?.setAttribute('content',
      `Private guitar lessons in ${LD.name}, NE. Acoustic, electric and more. Expert teachers, flexible scheduling, no contracts. Book in 60 seconds. ${LD.phone}`)
  }, [loc])

  // Set CSS vars on location change
  useEffect(() => {
    setLocColors({ '--c': LD.accentColor, '--cg': LD.accentGlow, '--cl': LD.accentLight, '--loc-color': LD.accentColor })
  }, [loc])

  // Intro overlay
  const showIntro = !sessionStorage.getItem('guitar-intro-seen')
  const [overlayDone, setOverlayDone] = useState(!showIntro)

  // Chord builder
  const [selectedChord, setSelectedChord] = useState(0)
  const [strumming, setStrumming] = useState(false)
  const preloaded = useRef(false)

  // Free play mode
  const [freePlay, setFreePlay] = useState(false)
  const [customFrets, setCustomFrets] = useState<Record<StringName, number | 'x'>>({ E2: 0, A2: 0, D3: 0, G3: 0, B3: 0, E4: 0 })
  const [freePlayMsg, setFreePlayMsg] = useState<string | null>(null)

  // Video
  const [vid1, setVid1] = useState(false)
  const [vid2, setVid2] = useState(false)

  // FAQ
  const [openFaq, setOpenFaq] = useState<number | null>(null)

  // Overlay timing
  useEffect(() => {
    if (!showIntro) return
    const t1 = setTimeout(() => { try { synthIntroChord() } catch {} }, 300)
    const t2 = setTimeout(() => {
      setOverlayDone(true)
      sessionStorage.setItem('guitar-intro-seen', '1')
    }, 1750)
    return () => { clearTimeout(t1); clearTimeout(t2) }
  }, [])

  // Preload chord sounds on first interaction
  const ensurePreloaded = useCallback(() => {
    if (preloaded.current) return
    preloaded.current = true
    initAudioCtx()
  }, [])

  // Strum the selected chord
  const strumChord = useCallback(async () => {
    if (strumming) return
    setStrumming(true)
    setTimeout(() => setStrumming(false), 600)

    ensurePreloaded()
    const chord = CHORDS[selectedChord]
    const ctx = initAudioCtx()
    let delay = 0

    for (const str of STRINGS) {
      const fret = chord.frets[str]
      if (fret === 'x') continue
      const url = `/audio/guitar/${str}/${fret}.wav?v=${Math.random()}`
      const buf = await loadBuffer(url)
      if (buf) {
        playBufferAt(buf, ctx.currentTime + delay)
      }
      delay += 0.04
    }
  }, [selectedChord, strumming, ensurePreloaded])

  // Known chords for detection in free play
  const KNOWN_CHORDS: { name: string; frets: Record<StringName, number | 'x'> }[] = [
    { name: 'C Major', frets: { E2: 'x', A2: 3, D3: 2, G3: 0, B3: 1, E4: 0 } },
    { name: 'G Major', frets: { E2: 3, A2: 2, D3: 0, G3: 0, B3: 0, E4: 3 } },
    { name: 'D Major', frets: { E2: 'x', A2: 'x', D3: 0, G3: 2, B3: 3, E4: 2 } },
    { name: 'Am', frets: { E2: 'x', A2: 0, D3: 2, G3: 2, B3: 1, E4: 0 } },
    { name: 'Em', frets: { E2: 0, A2: 2, D3: 2, G3: 0, B3: 0, E4: 0 } },
    { name: 'E Major', frets: { E2: 0, A2: 2, D3: 2, G3: 1, B3: 0, E4: 0 } },
    { name: 'A Major', frets: { E2: 'x', A2: 0, D3: 2, G3: 2, B3: 2, E4: 0 } },
    { name: 'F Major', frets: { E2: 1, A2: 3, D3: 3, G3: 2, B3: 1, E4: 1 } },
    { name: 'Dm', frets: { E2: 'x', A2: 'x', D3: 0, G3: 2, B3: 3, E4: 1 } },
  ]

  const FREE_PLAY_MESSAGES = [
    "Bold choice. We respect it.",
    "That's... definitely a chord. Somewhere.",
    "You just invented something. Own it.",
    "Jimi Hendrix started somewhere too.",
    "We'll call that one 'The Innovator.'",
    "Music theory just felt a disturbance.",
    "Your guitar teacher is going to love this story.",
    "That's avant-garde. You're ahead of your time.",
    "Technically, every chord is real if you believe.",
    "Somewhere, a jazz musician just nodded approvingly.",
  ]

  // Click a specific fret on a specific string — toggle on/off (back to open)
  const setStringFret = useCallback((str: StringName, fret: number) => {
    setCustomFrets(prev => ({
      ...prev,
      [str]: prev[str] === fret ? 0 : fret,
    }))
    setFreePlayMsg(null)
  }, [])

  // Strum free play chord
  const strumFreePlay = useCallback(async () => {
    if (strumming) return
    setStrumming(true)
    setTimeout(() => setStrumming(false), 600)

    ensurePreloaded()
    const ctx = initAudioCtx()
    let delay = 0
    let playedStrings = 0

    for (const str of STRINGS) {
      const fret = customFrets[str]
      if (fret === 'x') continue
      playedStrings++
      const url = `/audio/guitar/${str}/${fret}.wav?v=${Math.random()}`
      const buf = await loadBuffer(url)
      if (buf) {
        playBufferAt(buf, ctx.currentTime + delay)
      }
      delay += 0.04
    }

    // Check if it matches a known chord
    const match = KNOWN_CHORDS.find(kc =>
      STRINGS.every(s => kc.frets[s] === customFrets[s])
    )

    if (playedStrings === 0) {
      setFreePlayMsg("You muted every string. That's called 'silence.' Also valid.")
    } else if (match) {
      setFreePlayMsg(`Wait — that's actually ${match.name}! You've got an ear for this.`)
    } else {
      setFreePlayMsg(FREE_PLAY_MESSAGES[Math.floor(Math.random() * FREE_PLAY_MESSAGES.length)])
    }
  }, [customFrets, strumming, ensurePreloaded])

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      const k = e.key.toLowerCase()
      if (k === 'c') setSelectedChord(0)
      else if (k === 'g') setSelectedChord(1)
      else if (k === 'd') setSelectedChord(2)
      else if (k === 'a') setSelectedChord(3)
      else if (k === ' ') { e.preventDefault(); strumChord() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [strumChord])

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

  // Current frets for the neck — either preset chord or custom free play
  const activeFrets: Record<StringName, number | 'x'> = freePlay ? customFrets : CHORDS[selectedChord].frets

  // Display order: high E at top, low E at bottom (standard guitar neck view from front)
  const STRINGS_DISPLAY = [...STRINGS].reverse() as unknown as typeof STRINGS

  // Real-time chord detection
  const detectedChord = useMemo(() => {
    const fretArray = STRINGS.map(s => {
      const f = activeFrets[s]
      return f === 'x' ? null : f
    })
    return detectChord(fretArray)
  }, [activeFrets])

  // Final CTA rotating subtext
  const FINAL_CTA_LINES = [
    "Your future guitarist is one form away. Fair warning — they will name their guitar.",
    "Your future guitarist is one form away. The picks disappear. Nobody knows where they go. This is normal.",
    "Your future guitarist is one form away. First comes the lessons. Then comes the band.",
  ]
  const finalCtaLine = useRef(FINAL_CTA_LINES[Math.floor(Math.random() * FINAL_CTA_LINES.length)]).current

  return (
    <div className="ak-page" onClick={ensurePreloaded}>
      <InstrumentAtmosphere theme="guitar" />
      {/* ─── INTRO OVERLAY ─── */}
      {showIntro && (
        <div className={`gt-overlay${overlayDone ? ' done' : ''}`}>
          <div className="gt-overlay-title">PICK IT UP.<br /><span>PLAY IT.</span></div>
          <div className="gt-overlay-sub">Adkins Music Lessons</div>
          <div className="gt-eq-intro">
            {Array.from({ length: 12 }).map((_, i) => (
              <div key={i} className="gt-eq-intro-bar" style={{ animationDelay: `${i * 0.06}s`, animationDuration: `${0.3 + Math.random() * 0.4}s` }} />
            ))}
          </div>
        </div>
      )}

      <SiteHeader activeInstrument="guitar" />

      {/* ─── HERO ─── */}
      <section className="ak-hero">
        <div className="ak-hbg-glow" />
        <div className="ak-hgrid" />
        <div className="ak-hcontent">
          <h1 className="ak-htitle">
            <span className="ak-htitle-line1">This Is Where</span>
            <span className="ak-htitle-born">GUITAR PLAYERS</span>
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
            instrumentTag="guitar"
            seed={{ text: "My son has been taking guitar lessons here a couple of months and is progressing from beginner to intermediate quickly. Our instructor is an absolute shredder.", name: "Speed Junkie 707" }}
          />
          {locStats && (
            <div className="ak-stat-row">
              <div className="ak-stat-card"><div className="ak-stat-num">#{locStats.stateRank}</div><div className="ak-stat-lbl">Ranked in Nebraska</div></div>
              <div className="ak-stat-card"><div className="ak-stat-num">{locStats.studentsEnrolled.toLocaleString()}+</div><div className="ak-stat-lbl">Enrolled</div></div>
              <div className="ak-stat-card"><div className="ak-stat-num">{locStats.studentsTaughtTotal.toLocaleString()}+</div><div className="ak-stat-lbl">Taught Overall</div></div>
            </div>
          )}
        </div>
        <div className="gt-eq-strip">
          {eqBars.map((b, i) => (
            <div key={i} className="gt-eq-bar" style={{ '--h1': `${b.h1}px`, '--h2': `${b.h2}px`, '--spd': `${b.spd}s`, '--op': b.op } as React.CSSProperties} />
          ))}
        </div>
      </section>

      {/* ─── VSL ─── */}
      <VSLSection
        videoId="oRkXviX8Pas"
        headline="Why Most Guitar Students Quit"
        subheadline="We've been teaching guitar for over a decade. Here's what actually works."
      />

      {/* ─── CHORD BUILDER ─── */}
      <section className="ak-sec" id="gt-chord" style={{ background: '#0A0A10', borderTop: '1px solid #1C1C2A', borderBottom: '1px solid #1C1C2A' }}>
        <div style={{ textAlign: 'center' }}>
          <div className="ak-slbl">Don't Just Take Our Word For It</div>
          <h2 className="ak-stitle">PLAY A <em>CHORD.</em></h2>
          <p className="ak-secdesc" style={{ margin: '0 auto 36px' }}>{freePlay ? 'Tap any fret on any string. Strum whatever you build.' : 'Real strings. Real notes. Go ahead.'}</p>
        </div>

        {/* Chord name display — real-time detection */}
        <div style={{ textAlign: 'center', marginBottom: 12, minHeight: 44 }}>
          {detectedChord.name ? (
            <>
              <div style={{
                fontSize: detectedChord.isChord ? 28 : 14,
                fontWeight: 800,
                color: detectedChord.isChord ? LD.accentColor : '#666',
                fontFamily: detectedChord.isChord ? "'Bebas Neue', sans-serif" : 'inherit',
                letterSpacing: detectedChord.isChord ? '0.04em' : 0,
                transition: 'all 150ms ease',
              }}>
                {detectedChord.name}
              </div>
              {detectedChord.isChord && (
                <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>
                  {STRINGS.filter(s => activeFrets[s] !== 'x').length >= 3 ? 'Nice.' : 'Keep going...'}
                </div>
              )}
            </>
          ) : (
            <div style={{ fontSize: 13, color: '#444' }}>Press some strings...</div>
          )}
        </div>

        {/* Chord preset buttons — hidden in free play */}
        {!freePlay && (
          <>
            <div className="gt-chord-btns">
              {CHORDS.map((ch, i) => (
                <button
                  key={ch.name}
                  className={`gt-chord-btn${selectedChord === i ? ' active' : ''}`}
                  onClick={() => setSelectedChord(i)}
                  style={selectedChord === i ? { background: LD.accentColor, color: '#fff', borderColor: LD.accentColor } : undefined}
                >
                  {ch.name}
                </button>
              ))}
            </div>
            <p style={{ fontSize: 13, color: '#666', textAlign: 'center', marginTop: 8 }}>Four chords. That's genuinely all you need to start. Don't overthink it.</p>
          </>
        )}

        {/* Guitar Neck SVG — nut on left (open), frets 1-4 to the right */}
        <div className="gt-neck-wrap">
          <svg viewBox="0 0 380 220" className="gt-neck-svg">
            {/* Fret zone labels — centered in each zone between fret lines */}
            {[1, 2, 3, 4].map(f => (
              <text key={`fn-${f}`} x={40 + (f - 1) * 85 + 42.5} y={18} textAnchor="middle" fill="#555" fontSize="12" fontFamily="'Barlow', sans-serif">{f}</text>
            ))}

            {/* String labels to the left of the nut (open position) */}
            {STRINGS_DISPLAY.map((s, i) => (
              <text key={`sl-${s}`} x={14} y={50 + i * 30} textAnchor="middle" fill="#666" fontSize="11" fontFamily="'Barlow', sans-serif" dominantBaseline="middle">{s}</text>
            ))}

            {/* Nut line — thick bar separating open from fretted */}
            <line x1="40" y1="28" x2="40" y2={50 + 5 * 30} stroke="#888" strokeWidth="5" />

            {/* Fret lines */}
            {[1, 2, 3, 4].map(f => (
              <line key={`fret-${f}`} x1={40 + f * 85} y1="28" x2={40 + f * 85} y2={50 + 5 * 30} stroke="#333" strokeWidth="2" />
            ))}

            {/* Strings — thinnest (E4) at top, thickest (E2) at bottom */}
            {STRINGS_DISPLAY.map((_, i) => (
              <line key={`str-${i}`} x1="40" y1={50 + i * 30} x2={40 + 4 * 85} y2={50 + i * 30} stroke={`rgba(255,255,255,${0.15 + (5 - i) * 0.03})`} strokeWidth={1.0 + i * 0.25} />
            ))}

            {/* Clickable fret zones — one rect per string per fret, only in free play */}
            {freePlay && STRINGS_DISPLAY.map((s, si) => (
              [1, 2, 3, 4].map(f => (
                <rect
                  key={`hit-${s}-${f}`}
                  x={40 + (f - 1) * 85}
                  y={50 + si * 30 - 14}
                  width={85}
                  height={28}
                  fill="transparent"
                  cursor="pointer"
                  onClick={() => setStringFret(s, f)}
                />
              ))
            ))}

            {/* Open string indicators — O to the left of nut for strings with no fret pressed */}
            {STRINGS_DISPLAY.map((s, i) => {
              const fret = activeFrets[s]
              const y = 50 + i * 30
              if (fret === 'x') {
                return <text key={`ind-${s}`} x={30} y={y} textAnchor="middle" fill="#f55" fontSize="13" fontWeight="bold" dominantBaseline="middle" style={{ pointerEvents: 'none' }}>{'\u2715'}</text>
              }
              if (fret === 0) {
                return <circle key={`ind-${s}`} cx={30} cy={y} r="6" fill="none" stroke="#aaa" strokeWidth="1.5" style={{ pointerEvents: 'none' }} />
              }
              return null
            })}

            {/* Chord dots — placed in the center of the fret zone */}
            {STRINGS_DISPLAY.map((s, i) => {
              const fret = activeFrets[s]
              if (fret === 'x' || fret === 0) return null
              const cx = 40 + (fret - 1) * 85 + 42.5
              const cy = 50 + i * 30
              return (
                <g key={`dot-${s}`} style={{ pointerEvents: 'none' }}>
                  <circle cx={cx} cy={cy} r="11" fill={LD.accentColor} />
                  <text x={cx} y={cy} textAnchor="middle" dominantBaseline="central" fill="#fff" fontSize="10" fontWeight="bold">{fret}</text>
                </g>
              )
            })}
          </svg>
        </div>

        {/* Strum button — bigger in free play */}
        <div style={{ textAlign: 'center', marginTop: 24 }}>
          <button
            className={`gt-strum-btn${freePlay ? ' gt-strum-btn-big' : ''}${strumming ? ' strumming' : ''}`}
            onClick={freePlay ? strumFreePlay : strumChord}
            style={{ background: LD.accentColor }}
          >
            {freePlay ? '\uD83C\uDFB8 STRUM YOUR CREATION' : '\uD83C\uDFB8 STRUM'}
          </button>
          {!freePlay && <div className="gt-key-hint">C = C Major &nbsp; G = G Major &nbsp; D = D Major &nbsp; A = Am &nbsp; Space = Strum</div>}
        </div>

        {/* Funny message — free play only */}
        {freePlay && freePlayMsg && (
          <div className="gt-freeplay-msg" style={{ borderColor: LD.accentColor }}>
            {freePlayMsg}
          </div>
        )}

        {/* Free play toggle */}
        <div className="gt-freeplay-divider">
          <div className="gt-freeplay-line" />
          <button
            className="gt-freeplay-toggle"
            onClick={() => {
              if (freePlay) {
                setSelectedChord(0)
                setCustomFrets({ E2: 0, A2: 0, D3: 0, G3: 0, B3: 0, E4: 0 })
              }
              setFreePlay(!freePlay)
              setFreePlayMsg(null)
            }}
            style={freePlay ? { background: LD.accentColor, color: '#fff', borderColor: LD.accentColor } : undefined}
          >
            {freePlay ? 'Back to Presets' : 'Free Play Mode'}
          </button>
          <div className="gt-freeplay-line" />
        </div>
      </section>

      {/* ─── WHY GUITAR — KIDS (desktop) ─── */}
      <section className="ak-sec gt-why-desktop">
        <div className="ak-slbl">For Kids</div>
        <h2 className="ak-stitle">Why Guitar Changes <em>Kids.</em></h2>
        <div className="ak-pgrid">
          {[
            { icon: '\uD83D\uDCAA', title: 'Confidence', desc: "Every chord they learn is a win they can show someone. Guitar builds confidence fast." },
            { icon: '\uD83C\uDFAF', title: 'Focus', desc: 'Learning songs demands focus and patience. Those skills carry into school and life.' },
            { icon: '\uD83C\uDFA8', title: 'Creativity', desc: "Once they know a few chords, they start making things up. That creative spark never goes away." },
          ].map((p, i) => (
            <div className="ak-pcard" key={i}>
              <span className="ak-picon">{p.icon}</span>
              <h3>{p.title}</h3>
              <p>{p.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ─── WHY GUITAR — ADULTS (desktop) ─── */}
      <section className="ak-sec gt-why-desktop" style={{ borderTop: '1px solid #1C1C2A' }}>
        <div className="ak-slbl">It's Never Too Late</div>
        <h2 className="ak-stitle">Why Adults Play <em>Guitar.</em></h2>
        <div className="ak-pgrid">
          {[
            { icon: '\u23F0', title: "It's Never Too Late", desc: "You don't need to start young. Adults learn faster than they think with the right teacher." },
            { icon: '\uD83C\uDFB5', title: 'Creative Outlet', desc: "You've always wanted to play. Now you have somewhere to put that energy." },
            { icon: '\u{1F3AF}', title: 'Real Skills Fast', desc: "With focused one-on-one lessons you'll play real songs faster than you ever thought possible." },
          ].map((p, i) => (
            <div className="ak-pcard" key={i}>
              <span className="ak-picon">{p.icon}</span>
              <h3>{p.title}</h3>
              <p>{p.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ─── WHY GUITAR — MOBILE CAROUSEL ─── */}
      <section className="ak-sec gt-why-mobile" style={{ display: 'none' }}>
        <div style={{ color: LD.accentColor, fontSize: 11, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase' as const, textAlign: 'center', marginBottom: 16 }}>For Kids & Adults</div>
        <div className="gt-why-carousel">
          {[
            { icon: '\uD83D\uDCAA', title: 'Confidence', desc: "Every chord they learn is a win they can show someone. Guitar builds confidence fast." },
            { icon: '\uD83C\uDFAF', title: 'Focus', desc: 'Learning songs demands focus and patience. Those skills carry into school and life.' },
            { icon: '\uD83C\uDFA8', title: 'Creativity', desc: "Once they know a few chords, they start making things up. That creative spark never goes away." },
            { icon: '\u23F0', title: "It's Never Too Late", desc: "You don't need to start young. Adults learn faster than they think with the right teacher." },
            { icon: '\uD83C\uDFB5', title: 'Creative Outlet', desc: "You've always wanted to play. Now you have somewhere to put that energy." },
            { icon: '\u{1F3AF}', title: 'Real Skills Fast', desc: "With focused one-on-one lessons you'll play real songs faster than you ever thought possible." },
          ].map((p, i) => (
            <div className="ak-pcard gt-why-card" key={i}>
              <span className="ak-picon">{p.icon}</span>
              <h3>{p.title}</h3>
              <p>{p.desc}</p>
            </div>
          ))}
        </div>
        <div style={{ fontSize: 11, color: '#444', textAlign: 'center', marginTop: 8 }}>{'\u2190'} Swipe to explore {'\u2192'}</div>
      </section>

      {/* ─── PAIN POINTS ─── */}
      <section className="ak-sec" style={{ background: '#0A0A10', borderTop: '1px solid #1C1C2A', borderBottom: '1px solid #1C1C2A' }}>
        <div style={{ textAlign: 'center' }}>
          <div className="ak-slbl">Why People Search For Guitar Lessons</div>
          <h2 className="ak-stitle">WE'VE HEARD EVERY <em>ONE OF THESE.</em></h2>
        </div>
        <div className="gt-pain-scroll">
          {PAIN_POINTS.map((pp, i) => (
            <div className="ak-pcard gt-pain-card" key={i}>
              <h3>{pp.title}</h3>
              <p style={{ color: '#9A96B4', lineHeight: 1.65, marginBottom: 12 }}>{pp.body}</p>
              <p style={{ color: LD.accentColor, fontWeight: 700, fontSize: 13, lineHeight: 1.5 }}>{pp.solution}</p>
            </div>
          ))}
        </div>
        <div style={{ fontSize: 11, color: '#444', textAlign: 'center', marginTop: 10 }}>{'\u2190'} Swipe to explore {'\u2192'}</div>
      </section>

      {/* ─── TEACHER COMPATIBILITY ─── */}
      <section className="ak-compat-sec">
        <div className="ak-compat-inner">
          <div className="ak-slbl">Your Teacher Is Already Here</div>
          <h2 className="ak-stitle">YOUR TEACHER IS ALREADY <em>HERE.</em></h2>
          <p className="ak-csub">Every guitarist is different. We match you based on your goals, style, and personality.</p>
          <div className="gt-teacher-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 20 }}>
            {[
              { name: 'The Strummer', desc: "For beginners who want to play songs they love from day one. No theory overwhelm. Just music." },
              { name: 'The Song Player', desc: "For intermediate players ready to go deeper — real songs, real structure, real progress." },
              { name: 'The Shredder', desc: "For serious players chasing technique, speed, theory, and full musical understanding." },
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
      <ReviewsSection instrumentTag="guitar" />

      {/* ─── 3 STEPS ─── */}
      <section className="ak-steps-sec">
        <div style={{ textAlign: 'center' }}>
          <div className="ak-slbl">Ridiculously Simple</div>
          <h2 className="ak-stitle">3 Steps. <em>That's It.</em></h2>
        </div>
        <div className="ak-sgrid">
          {[
            { n: 1, title: 'Fill Out the Form', desc: 'Tell us your schedule, goals, and preferred location.' },
            { n: 2, title: 'We Find Your Teacher', desc: "We match you on fit — not just who's available. We'll text you so fast it'll feel like we were waiting by the phone. Because we were. We take this part seriously. Seriously." },
            { n: 3, title: 'Book Your First Session', desc: "Pick your time and you're in. No waitlists. No weird onboarding. Just guitar." },
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
      <section className="ak-sec gt-crosssell-sec">
        <div style={{ textAlign: 'center' }}>
          <div className="ak-slbl">What We Teach</div>
          <h2 className="ak-stitle">Guitar Is Just The <em>Start.</em></h2>
          <p style={{ fontSize: 15, color: '#888', textAlign: 'center', maxWidth: 500, margin: '0 auto 32px auto', lineHeight: 1.7 }}>Have more than one kid? Want to add an instrument? We teach everything. One school, one family.</p>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, maxWidth: 400, margin: '0 auto' }}>
          {[
            { emoji: '\uD83C\uDFB9', name: 'Piano' },
            { emoji: '\uD83E\uDD41', name: 'Drums' },
            { emoji: '\uD83C\uDFA4', name: 'Vocals' },
            { emoji: '\uD83C\uDFB8', name: 'Bass' },
            { emoji: '\uD83C\uDFBB', name: 'Violin' },
            { emoji: '\u2795', name: 'More' },
          ].map(inst => (
            <div
              key={inst.name}
              className="gt-crosssell-card"
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
              <div className="gt-crosssell-emoji" style={{ fontSize: 22, textAlign: 'center' }}>{inst.emoji}</div>
              <div className="gt-crosssell-name" style={{ fontSize: 10, color: '#777', textAlign: 'center', textTransform: 'uppercase' as const, letterSpacing: '0.08em' }}>{inst.name}</div>
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
            <div key={i} className="gt-faq-item">
              <button className={`gt-faq-q${openFaq === i ? ' open' : ''}`} onClick={() => setOpenFaq(openFaq === i ? null : i)}>
                {f.q}
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
              </button>
              <div className={`gt-faq-a${openFaq === i ? ' open' : ''}`}>
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
              <span className="ak-loc-icon">{'\uD83D\uDCCD'}</span>
              <div>
                <div className="ak-loc-label">Address</div>
                <div className="ak-loc-value">{LD.address}</div>
              </div>
            </div>
            <div className="ak-loc-row">
              <span className="ak-loc-icon">{'\uD83D\uDCDE'}</span>
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
              <span className="ak-loc-icon">{'\uD83D\uDD52'}</span>
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
        <h2>YOUR <span style={{ color: LD.accentColor }}>GUITARIST</span> IS WAITING FOR YOU.</h2>
        <p>{finalCtaLine}</p>
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
