import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate, useLocation as useRouterLocation } from 'react-router-dom'
import { LOCATIONS, type LocKey } from '../config/locations'
import { useSiteLocation } from '../hooks/useSiteLocation'
import { setLocColors } from '../lib/setLocColors'
import ReviewsSection from '../components/site/ReviewsSection'
import HeroTestimonial from '../components/site/HeroTestimonial'
import SiteHeader from '../components/site/SiteHeader'
import VSLSection from '../components/site/VSLSection'
import { useLocationTracking } from '../hooks/useLocationTracking'
import { useLocationStats } from '../hooks/useLocationStats'
import { trackInstrumentView } from '../lib/tracking'
import './adkins.css'
import './vocals.css'

// ═══════════════════════════════════════
// DATA
// ═══════════════════════════════════════

const ENROLLMENT_URL = '/intake/adkins-music-lessons'

const FAQS = [
  { q: 'Do I need any experience to start vocal lessons?', a: "None at all. We work with complete beginners every day — kids and adults who have never taken a lesson in their life. We start exactly where you are and build from there. No audition, no prerequisites, no judgment." },
  { q: 'What if my child is shy or has stage anxiety?', a: "This is actually one of the most common reasons parents sign their kids up. Our teachers are trained to build confidence in a private, low-pressure environment. Most shy kids open up faster than their parents expect — because it's just them and one supportive teacher. We've seen it happen hundreds of times. It's our favorite part of the job." },
  { q: 'How quickly will I see improvement?', a: "Most students notice a real difference within the first 3 to 4 lessons — better pitch, more control, more confidence. Vocal training shows results faster than most instruments because your voice is already there. We're just training it." },
  { q: 'Where are your locations?', a: "Four locations across the Omaha metro: Omaha (96th St), Gretna, Bellevue, and Elkhorn. We'll match you to the closest one." },
]

// ═══════════════════════════════════════
// AUDIO — Intro vocal tone synthesis
// ═══════════════════════════════════════

function playIntroVocalTone() {
  try {
    const ctx = new AudioContext()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    const lfo = ctx.createOscillator()
    const lfoGain = ctx.createGain()
    const filter = ctx.createBiquadFilter()

    // Sine wave at 440hz
    osc.type = 'sine'
    osc.frequency.setValueAtTime(440, ctx.currentTime)

    // LFO vibrato: 5.5hz rate, 4hz depth
    lfo.type = 'sine'
    lfo.frequency.setValueAtTime(5.5, ctx.currentTime)
    lfoGain.gain.setValueAtTime(4, ctx.currentTime)
    lfo.connect(lfoGain)
    lfoGain.connect(osc.frequency)

    // Bandpass filter at 800hz (formant simulation)
    filter.type = 'bandpass'
    filter.frequency.setValueAtTime(800, ctx.currentTime)
    filter.Q.setValueAtTime(1, ctx.currentTime)

    osc.connect(filter)
    filter.connect(gain)
    gain.connect(ctx.destination)

    // Slow attack 0.15s, hold 0.8s, slow decay 0.6s, fade out at 1.75s
    gain.gain.setValueAtTime(0, ctx.currentTime)
    gain.gain.linearRampToValueAtTime(0.45, ctx.currentTime + 0.15)
    gain.gain.setValueAtTime(0.45, ctx.currentTime + 0.95)
    gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 1.75)

    lfo.start()
    osc.start()
    osc.stop(ctx.currentTime + 1.75)
    lfo.stop(ctx.currentTime + 1.75)
  } catch { /* ignore */ }
}

// ═══════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════

// LOC_RANKINGS removed — now pulled live from Supabase via useLocationStats

export default function VocalsLanding() {
  const siteLoc = useSiteLocation()
  const navigate = useNavigate()
  const { pathname } = useRouterLocation()
  const loc = siteLoc.key as LocKey
  const LD = LOCATIONS[loc]
  const currentInstrument = pathname.split('/')[2] || 'vocals'

  useLocationTracking(LD)
  const locStats = useLocationStats(loc)
  useEffect(() => { trackInstrumentView('Vocals') }, [])

  useEffect(() => {
    document.title = `Vocal Lessons in ${LD.name}, NE | All Ages & Styles — Adkins Music Lessons`
    document.querySelector('meta[name="description"]')?.setAttribute('content',
      `Private vocal lessons in ${LD.name}, NE. All ages and styles. Expert teachers, flexible scheduling, no contracts. Book in 60 seconds. ${LD.phone}`)
  }, [loc])

  // Set CSS vars on location change
  useEffect(() => {
    setLocColors({ '--c': LD.accentColor, '--cg': LD.accentGlow, '--cl': LD.accentLight, '--loc-color': LD.accentColor })
  }, [loc])

  // Intro overlay — only on first visit in session
  const showIntro = !sessionStorage.getItem('vocals-intro-seen')
  const [overlayDone, setOverlayDone] = useState(!showIntro)

  // Video
  const [vid1, setVid1] = useState(false)
  const [vid2, setVid2] = useState(false)

  // FAQ
  const [openFaq, setOpenFaq] = useState<number | null>(null)

  // ─── VOCAL RECORDER STATE ───
  const [recState, setRecState] = useState<'idle' | 'recording' | 'playing' | 'denied'>('idle')
  const [recProgress, setRecProgress] = useState(0) // 0-3 seconds
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const recBufferRef = useRef<AudioBuffer | null>(null)
  const recTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const recIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const recStartTimeRef = useRef(0)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const playbackSourceRef = useRef<AudioBufferSourceNode | null>(null)
  const animFrameRef = useRef<number>(0)
  const [waveHeights, setWaveHeights] = useState<number[]>(Array(20).fill(4))
  const recAudioCtxRef = useRef<AudioContext | null>(null)

  // Overlay timing
  useEffect(() => {
    if (!showIntro) return
    const t1 = setTimeout(() => { try { playIntroVocalTone() } catch {} }, 300)
    const t2 = setTimeout(() => {
      setOverlayDone(true)
      sessionStorage.setItem('vocals-intro-seen', '1')
    }, 1750)
    return () => { clearTimeout(t1); clearTimeout(t2) }
  }, [])

  // EQ bars data
  const eqBars = useRef(
    Array.from({ length: 70 }, () => ({
      h1: Math.random() * 10 + 3,
      h2: Math.random() * 28 + 8,
      spd: (Math.random() * 0.5 + 0.28).toFixed(2),
      op: (Math.random() * 0.39 + 0.11).toFixed(2),
    }))
  ).current

  // Other locations for map section pills
  const otherLocs = (Object.keys(LOCATIONS) as LocKey[]).filter(k => k !== loc)

  // ─── RECORDER LOGIC ───

  const getAudioCtx = useCallback(() => {
    if (!recAudioCtxRef.current) recAudioCtxRef.current = new AudioContext()
    if (recAudioCtxRef.current.state === 'suspended') recAudioCtxRef.current.resume()
    return recAudioCtxRef.current
  }, [])

  const updateWaveform = useCallback((analyser: AnalyserNode) => {
    const data = new Uint8Array(analyser.frequencyBinCount)
    const update = () => {
      analyser.getByteFrequencyData(data)
      const step = Math.floor(data.length / 20)
      const heights = Array.from({ length: 20 }, (_, i) => {
        const val = data[i * step] || 0
        return Math.max(4, (val / 255) * 60)
      })
      setWaveHeights(heights)
      animFrameRef.current = requestAnimationFrame(update)
    }
    update()
  }, [])

  const stopWaveform = useCallback(() => {
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current)
    setWaveHeights(Array(20).fill(4))
  }, [])

  const playbackRecording = useCallback(() => {
    const buf = recBufferRef.current
    if (!buf) return
    const ctx = getAudioCtx()
    const src = ctx.createBufferSource()
    src.buffer = buf
    const analyser = ctx.createAnalyser()
    analyser.fftSize = 256
    src.connect(analyser)
    analyser.connect(ctx.destination)
    playbackSourceRef.current = src
    setRecState('playing')
    updateWaveform(analyser)
    src.onended = () => {
      setRecState('idle')
      stopWaveform()
    }
    src.start()
  }, [getAudioCtx, updateWaveform, stopWaveform])

  const stopRecording = useCallback(() => {
    if (recTimeoutRef.current) clearTimeout(recTimeoutRef.current)
    if (recIntervalRef.current) clearInterval(recIntervalRef.current)
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop()
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop())
      streamRef.current = null
    }
    stopWaveform()
  }, [stopWaveform])

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
      streamRef.current = stream
      const ctx = getAudioCtx()

      // Set up live analyser
      const source = ctx.createMediaStreamSource(stream)
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 256
      source.connect(analyser)
      analyserRef.current = analyser
      updateWaveform(analyser)

      // Detect supported mimeType
      let mimeType = ''
      if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
        mimeType = 'audio/webm;codecs=opus'
      } else if (MediaRecorder.isTypeSupported('audio/mp4')) {
        mimeType = 'audio/mp4'
      }

      const options: MediaRecorderOptions = mimeType ? { mimeType } : {}
      const recorder = new MediaRecorder(stream, options)
      mediaRecorderRef.current = recorder
      audioChunksRef.current = []

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data)
      }

      recorder.onstop = async () => {
        stopWaveform()
        const blob = new Blob(audioChunksRef.current, { type: mimeType || 'audio/webm' })
        try {
          const arrBuf = await blob.arrayBuffer()
          const audioBuf = await ctx.decodeAudioData(arrBuf)
          recBufferRef.current = audioBuf
          playbackRecording()
        } catch {
          setRecState('idle')
        }
      }

      recorder.start()
      setRecState('recording')
      setRecProgress(0)
      recStartTimeRef.current = Date.now()

      // Update progress every 100ms
      recIntervalRef.current = setInterval(() => {
        const elapsed = (Date.now() - recStartTimeRef.current) / 1000
        setRecProgress(Math.min(elapsed, 3))
      }, 100)

      // Auto-stop at 3 seconds
      recTimeoutRef.current = setTimeout(() => {
        stopRecording()
      }, 3000)

    } catch {
      setRecState('denied')
    }
  }, [getAudioCtx, updateWaveform, stopWaveform, stopRecording, playbackRecording])

  const handleMicDown = useCallback(() => {
    if (recState === 'playing') {
      if (playbackSourceRef.current) {
        try { playbackSourceRef.current.stop() } catch {}
      }
      setRecState('idle')
      stopWaveform()
      return
    }
    if (recState === 'idle' || recState === 'denied') {
      startRecording()
    }
  }, [recState, startRecording, stopWaveform])

  const handleMicUp = useCallback(() => {
    if (recState === 'recording') {
      stopRecording()
    }
  }, [recState, stopRecording])

  // Circular progress ring
  const ringCircumference = 2 * Math.PI * 60
  const ringOffset = ringCircumference - (recProgress / 3) * ringCircumference

  return (
    <div className="ak-page">
      {/* ─── INTRO OVERLAY ─── */}
      {showIntro && (
        <div className={`vc-overlay${overlayDone ? ' done' : ''}`}>
          <div className="vc-overlay-title">FIND YOUR <span>VOICE.</span></div>
          <div className="vc-overlay-sub">Adkins Music Lessons</div>
          <div className="vc-eq-intro">
            {Array.from({ length: 12 }).map((_, i) => (
              <div key={i} className="vc-eq-intro-bar" style={{ animationDelay: `${i * 0.06}s`, animationDuration: `${0.3 + Math.random() * 0.4}s` }} />
            ))}
          </div>
        </div>
      )}

      <SiteHeader activeInstrument="vocals" />

      {/* ─── HERO ─── */}
      <section className="ak-hero">
        <div className="ak-hbg-glow" />
        <div className="ak-hgrid" />
        <div className="ak-hcontent">
          <h1 className="ak-htitle">
            <span className="ak-htitle-line1">This Is Where</span>
            <span className="ak-htitle-born">SINGERS</span>
            <span className="ak-htitle-line3">Are Made.</span>
          </h1>
          <p className="ak-hsub">Private one-on-one sessions for ages 5 to adult. 4 metro locations. Your teacher is already waiting.</p>
          <div className="ak-hctas" style={{ marginTop: 24 }}>
            <div style={{ position: 'relative', display: 'inline-block' }}>
              <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: 200, height: 60, borderRadius: '50%', background: 'var(--c)', filter: 'blur(40px)', animation: 'glowPulse 3.5s ease-in-out infinite', opacity: 0.35, pointerEvents: 'none', zIndex: 0 }} />
              <a className="ak-btnp" href={ENROLLMENT_URL} style={{ color: '#ffffff', position: 'relative', zIndex: 1 }}>Sign Up For Lessons Now {'\u{2192}'}</a>
            </div>
          </div>
          <HeroTestimonial
            instrumentTag="vocals"
            seed={{ text: "The vocal instruction here completely changed how I perform. I didn't think I could sound like this after just a few months.", name: "Adkins Vocal Student" }}
          />
          {locStats && (
            <div className="ak-stat-row">
              <div className="ak-stat-card"><div className="ak-stat-num">#{locStats.stateRank}</div><div className="ak-stat-lbl">Ranked in Nebraska</div></div>
              <div className="ak-stat-card"><div className="ak-stat-num">{locStats.studentsEnrolled.toLocaleString()}+</div><div className="ak-stat-lbl">Enrolled</div></div>
              <div className="ak-stat-card"><div className="ak-stat-num">{locStats.studentsTaughtTotal.toLocaleString()}+</div><div className="ak-stat-lbl">Taught Overall</div></div>
            </div>
          )}
        </div>
        <div className="vc-eq-strip">
          {eqBars.map((b, i) => (
            <div key={i} className="vc-eq-bar" style={{ '--h1': `${b.h1}px`, '--h2': `${b.h2}px`, '--spd': `${b.spd}s`, '--op': b.op } as React.CSSProperties} />
          ))}
        </div>
      </section>

      {/* ─── VSL ─── */}
      <VSLSection
        videoId="ohaozmCLJYk"
        headline="What Nobody Tells You About Vocal Lessons"
        subheadline="The real reasons singers plateau — and how our teachers break through them."
      />

      {/* ─── VOCAL RECORDER ─── */}
      <section className="ak-sec" id="vc-recorder" style={{ background: '#0A0A10', borderTop: '1px solid #1C1C2A', borderBottom: '1px solid #1C1C2A' }}>
        <div style={{ textAlign: 'center' }}>
          <div className="ak-slbl">Don't Just Take Our Word For It</div>
          <h2 className="ak-stitle">HEAR YOUR <em>VOICE.</em></h2>
          <p className="ak-secdesc" style={{ margin: '0 auto 36px' }}>Hold the button. Sing something. We'll play it back.</p>
        </div>
        <div className="vc-recorder">
          <p style={{ fontSize: 15, color: '#888', textAlign: 'center', marginBottom: 24 }}>
            Hold the button below and sing anything — a note, a word, your coffee order. We promise we won't share it. (There's no share button. We checked.)
          </p>

          {/* Mic button */}
          <div
            className={`vc-mic-btn${recState === 'recording' ? ' recording' : ''}`}
            onMouseDown={handleMicDown}
            onMouseUp={handleMicUp}
            onTouchStart={handleMicDown}
            onTouchEnd={handleMicUp}
          >
            {recState === 'recording' && (
              <svg className="vc-progress-ring" viewBox="0 0 132 132">
                <circle className="vc-ring-bg" cx="66" cy="66" r="60" />
                <circle
                  className="vc-ring-fg"
                  cx="66" cy="66" r="60"
                  strokeDasharray={ringCircumference}
                  strokeDashoffset={ringOffset}
                />
              </svg>
            )}
            {'\u{1F3A4}'}
          </div>

          {/* Status text */}
          <div style={{ marginTop: 12, textAlign: 'center' }}>
            {recState === 'idle' && (
              <p style={{ color: '#555', fontSize: 13 }}>Hold to record</p>
            )}
            {recState === 'recording' && (
              <p style={{ color: LD.accentColor, fontSize: 13 }}>Recording... release to play back</p>
            )}
            {recState === 'playing' && (
              <p style={{ color: '#888', fontSize: 13 }}>Playing back...</p>
            )}
            {recState === 'denied' && (
              <p
                style={{ color: 'var(--c, #D41113)', fontSize: 13, cursor: 'pointer' }}
                onClick={() => { setRecState('idle'); startRecording() }}
              >
                Microphone access needed — tap here to try again
              </p>
            )}
          </div>

          {/* Waveform visualizer */}
          <div className="vc-waveform">
            {waveHeights.map((h, i) => (
              <div
                key={i}
                className="vc-waveform-bar"
                style={{ height: h }}
              />
            ))}
          </div>
        </div>
      </section>

      {/* ─── PAIN POINTS (desktop 2-col grid) ─── */}
      <section className="ak-sec vc-pain-desktop">
        <div className="ak-slbl">Why People Search For Vocal Lessons</div>
        <h2 className="ak-stitle">WE'VE HEARD EVERY <em>ONE OF THESE.</em></h2>
        <div className="ak-pgrid" style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}>
          {[
            { icon: '\u{1F630}', title: 'Fear of Singing in Front of Others', desc: "Stage anxiety is real. Most singers hold back everything because they're terrified of being judged.", solution: 'We build confidence in a private, supportive environment. No judgment. Ever.' },
            { icon: '\u{1F3AF}', title: 'Difficulty Hitting Notes & Limited Range', desc: "Pitch issues and a limited range are frustrating — especially when you can hear the note but can't reach it.", solution: 'We train pitch accuracy and expand range systematically, at your pace.' },
            { icon: '\u{1F525}', title: 'Vocal Strain & Poor Technique', desc: "Vocal fatigue, soreness, and discomfort after singing are signs of incorrect technique — and they get worse without help.", solution: 'We fix technique early so your voice stays healthy and strong.' },
            { icon: '\u{1F6AB}', title: 'Feeling Stuck Despite Practicing', desc: "You practice but nothing seems to change. Progress feels invisible and motivation drops.", solution: 'We identify exactly what\'s holding you back and build a clear path forward.' },
            { icon: '\u{1F4CB}', title: 'Lessons That Feel Generic', desc: "One-size-fits-all teaching that doesn't match your voice, your style, or your goals.", solution: 'Every lesson is customized to your voice, your goals, and your musical taste.' },
            { icon: '\u{1F504}', title: 'No Goals, No Direction, No Feedback', desc: "Lessons without structure feel like going in circles. You don't know if you're improving.", solution: 'Every lesson has a goal. Every session has feedback. You always know where you\'re going.' },
          ].map((p, i) => (
            <div className="ak-pcard" key={i}>
              <span className="ak-picon">{p.icon}</span>
              <h3>{p.title}</h3>
              <p>{p.desc}</p>
              <p style={{ fontSize: 13, color: LD.accentColor, fontWeight: 600, marginTop: 10 }}>{p.solution}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ─── PAIN POINTS (mobile swipe carousel) ─── */}
      <section className="ak-sec vc-pain-mobile" style={{ display: 'none' }}>
        <div className="ak-slbl">Why People Search For Vocal Lessons</div>
        <h2 className="ak-stitle">WE'VE HEARD EVERY <em>ONE OF THESE.</em></h2>
        <div className="vc-pain-carousel">
          {[
            { icon: '\u{1F630}', title: 'Fear of Singing in Front of Others', desc: "Stage anxiety is real. Most singers hold back everything because they're terrified of being judged.", solution: 'We build confidence in a private, supportive environment. No judgment. Ever.' },
            { icon: '\u{1F3AF}', title: 'Difficulty Hitting Notes & Limited Range', desc: "Pitch issues and a limited range are frustrating — especially when you can hear the note but can't reach it.", solution: 'We train pitch accuracy and expand range systematically, at your pace.' },
            { icon: '\u{1F525}', title: 'Vocal Strain & Poor Technique', desc: "Vocal fatigue, soreness, and discomfort after singing are signs of incorrect technique — and they get worse without help.", solution: 'We fix technique early so your voice stays healthy and strong.' },
            { icon: '\u{1F6AB}', title: 'Feeling Stuck Despite Practicing', desc: "You practice but nothing seems to change. Progress feels invisible and motivation drops.", solution: 'We identify exactly what\'s holding you back and build a clear path forward.' },
            { icon: '\u{1F4CB}', title: 'Lessons That Feel Generic', desc: "One-size-fits-all teaching that doesn't match your voice, your style, or your goals.", solution: 'Every lesson is customized to your voice, your goals, and your musical taste.' },
            { icon: '\u{1F504}', title: 'No Goals, No Direction, No Feedback', desc: "Lessons without structure feel like going in circles. You don't know if you're improving.", solution: 'Every lesson has a goal. Every session has feedback. You always know where you\'re going.' },
          ].map((p, i) => (
            <div className="ak-pcard vc-pain-card" key={i}>
              <span className="ak-picon">{p.icon}</span>
              <h3>{p.title}</h3>
              <p>{p.desc}</p>
              <p style={{ fontSize: 13, color: LD.accentColor, fontWeight: 600, marginTop: 10 }}>{p.solution}</p>
            </div>
          ))}
        </div>
        <div style={{ fontSize: 11, color: '#444', textAlign: 'center', marginTop: 8 }}>{'\u{2190}'} Swipe to explore {'\u{2192}'}</div>
      </section>

      {/* ─── WHY VOCALS — KIDS (desktop) ─── */}
      <section className="ak-sec vc-why-desktop">
        <div className="ak-slbl">For Kids</div>
        <h2 className="ak-stitle">Why Vocals Change <em>Kids.</em></h2>
        <div className="ak-pgrid">
          {[
            { icon: '\u{1F4AA}', title: 'Confidence', desc: "Singing in front of someone builds courage. Kids who train their voice carry that confidence into every room they walk into. Even the ones with scary teachers." },
            { icon: '\u{1F3A8}', title: 'Emotional Expression', desc: "Music gives kids a way to express what they can't put into words. Vocal training unlocks that outlet safely and beautifully." },
            { icon: '\u{1F3AD}', title: 'Performance Skills', desc: "Stage presence, breath control, and the ability to communicate through performance — skills that go way beyond music." },
          ].map((p, i) => (
            <div className="ak-pcard" key={i}>
              <span className="ak-picon">{p.icon}</span>
              <h3>{p.title}</h3>
              <p>{p.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ─── WHY VOCALS — ADULTS (desktop) ─── */}
      <section className="ak-sec vc-why-desktop" style={{ borderTop: '1px solid #1C1C2A' }}>
        <div className="ak-slbl">It's Never Too Late</div>
        <h2 className="ak-stitle">Why Adults <em>Sing.</em></h2>
        <div className="ak-pgrid">
          {[
            { icon: '\u{1F9D8}', title: "It's Never Too Late", desc: "You don't need a perfect voice to start. You just need to start. Adults improve faster than they think with the right guidance." },
            { icon: '\u{1F3B5}', title: 'Stress Relief', desc: "Singing is one of the most effective stress relievers there is. Thirty minutes of vocal training and the weight of the day lifts." },
            { icon: '\u{1F3A4}', title: 'Find Your Voice', desc: "Most adult singers have been holding back their whole life. Lessons give you permission — and the tools — to finally let it out." },
          ].map((p, i) => (
            <div className="ak-pcard" key={i}>
              <span className="ak-picon">{p.icon}</span>
              <h3>{p.title}</h3>
              <p>{p.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ─── WHY VOCALS — MOBILE CAROUSEL ─── */}
      <section className="ak-sec vc-why-mobile" style={{ display: 'none' }}>
        <div style={{ color: LD.accentColor, fontSize: 11, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase' as const, textAlign: 'center', marginBottom: 16 }}>For Kids & Adults</div>
        <div className="vc-why-carousel">
          {[
            { icon: '\u{1F4AA}', title: 'Confidence', desc: "Singing in front of someone builds courage. Kids who train their voice carry that confidence into every room they walk into. Even the ones with scary teachers." },
            { icon: '\u{1F3A8}', title: 'Emotional Expression', desc: "Music gives kids a way to express what they can't put into words. Vocal training unlocks that outlet safely and beautifully." },
            { icon: '\u{1F3AD}', title: 'Performance Skills', desc: "Stage presence, breath control, and the ability to communicate through performance — skills that go way beyond music." },
            { icon: '\u{1F9D8}', title: "It's Never Too Late", desc: "You don't need a perfect voice to start. You just need to start. Adults improve faster than they think with the right guidance." },
            { icon: '\u{1F3B5}', title: 'Stress Relief', desc: "Singing is one of the most effective stress relievers there is. Thirty minutes of vocal training and the weight of the day lifts." },
            { icon: '\u{1F3A4}', title: 'Find Your Voice', desc: "Most adult singers have been holding back their whole life. Lessons give you permission — and the tools — to finally let it out." },
          ].map((p, i) => (
            <div className="ak-pcard vc-why-card" key={i}>
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
          <div className="ak-slbl">Your Coach Is Already Here</div>
          <h2 className="ak-stitle">YOUR COACH IS ALREADY <em>HERE.</em></h2>
          <p className="ak-csub">Every singer is different. We match you based on your goals, experience, and musical style.</p>
          <div className="vc-teacher-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 20 }}>
            {[
              { name: 'The Confidence Builder', desc: "For beginners and anyone with stage anxiety. We build your voice and your confidence at the same time — gently, safely, and without pressure." },
              { name: 'The Technique Coach', desc: "For singers who want to stop straining and start singing correctly. Pitch, range, breath control, and real vocal health." },
              { name: 'The Performance Mentor', desc: "For singers ready to perform, audition, or record. Style, stage presence, artistry, and real-world preparation." },
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
      <ReviewsSection instrumentTag="vocals" />

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
            { n: 3, title: 'Book Your First Session', desc: "Pick your time and you're in. No waitlists. No weird onboarding. Just singing." },
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
      <section className="ak-sec vc-crosssell-sec">
        <div style={{ textAlign: 'center' }}>
          <div className="ak-slbl">What We Teach</div>
          <h2 className="ak-stitle">YOUR VOICE IS JUST THE <em>START.</em></h2>
          <p style={{ fontSize: 15, color: '#888', textAlign: 'center', maxWidth: 500, margin: '0 auto 32px auto', lineHeight: 1.7 }}>Have more than one kid? Want to add an instrument? We teach everything. One school, one family.</p>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, maxWidth: 400, margin: '0 auto' }}>
          {[
            { emoji: '\u{1F3B9}', name: 'Piano' },
            { emoji: '\u{1F3B8}', name: 'Guitar' },
            { emoji: '\u{1F941}', name: 'Drums' },
            { emoji: '\u{1F3B8}', name: 'Bass' },
            { emoji: '\u{1F3BB}', name: 'Violin' },
            { emoji: '\u{2795}', name: 'More' },
          ].map(inst => (
            <div
              key={inst.name}
              className="vc-crosssell-card"
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
              <div className="vc-crosssell-emoji" style={{ fontSize: 22, textAlign: 'center' }}>{inst.emoji}</div>
              <div className="vc-crosssell-name" style={{ fontSize: 10, color: '#777', textAlign: 'center', textTransform: 'uppercase' as const, letterSpacing: '0.08em' }}>{inst.name}</div>
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
            <div key={i} className="vc-faq-item">
              <button className={`vc-faq-q${openFaq === i ? ' open' : ''}`} onClick={() => setOpenFaq(openFaq === i ? null : i)}>
                {f.q}
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
              </button>
              <div className={`vc-faq-a${openFaq === i ? ' open' : ''}`}>
                <p>{f.a}</p>
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
        <h2>YOUR <span style={{ color: LD.accentColor }}>VOICE</span> IS WAITING TO BE HEARD.</h2>
        <p>Your future singer is one form away. Car rides are about to get a lot more interesting.</p>
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
