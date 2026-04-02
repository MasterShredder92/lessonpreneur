/**
 * Standalone guitar chord builder widget — extracted from GuitarLanding.tsx.
 * Uses the same audio files at /audio/guitar/{string}/{fret}.wav.
 */
import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { detectChord } from '../../lib/chordDetector'

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

const KNOWN_CHORDS: { name: string; frets: Record<StringName, number | 'x'> }[] = [
  ...CHORDS.map(c => ({ name: c.name, frets: c.frets })),
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

// ── Audio engine (matches GuitarLanding exactly) ──
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

function playBufferAt(buf: AudioBuffer, when: number) {
  const ctx = initAudioCtx()
  const src = ctx.createBufferSource()
  src.buffer = buf
  src.connect(ctx.destination)
  src.start(when)
}

export default function GuitarWidget({ accentColor = '#D41113' }: { accentColor?: string }) {
  const [selectedChord, setSelectedChord] = useState(0)
  const [strumming, setStrumming] = useState(false)
  const preloaded = useRef(false)
  const [freePlay, setFreePlay] = useState(false)
  const [customFrets, setCustomFrets] = useState<Record<StringName, number | 'x'>>({ E2: 0, A2: 0, D3: 0, G3: 0, B3: 0, E4: 0 })
  const [freePlayMsg, setFreePlayMsg] = useState<string | null>(null)

  const ensurePreloaded = useCallback(() => {
    if (preloaded.current) return
    preloaded.current = true
    initAudioCtx()
  }, [])

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
      if (buf) playBufferAt(buf, ctx.currentTime + delay)
      delay += 0.04
    }
  }, [selectedChord, strumming, ensurePreloaded])

  const setStringFret = useCallback((str: StringName, fret: number) => {
    setCustomFrets(prev => ({ ...prev, [str]: prev[str] === fret ? 0 : fret }))
    setFreePlayMsg(null)
  }, [])

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
      if (buf) playBufferAt(buf, ctx.currentTime + delay)
      delay += 0.04
    }
    const match = KNOWN_CHORDS.find(kc => STRINGS.every(s => kc.frets[s] === customFrets[s]))
    if (playedStrings === 0) setFreePlayMsg("You muted every string. That's called 'silence.' Also valid.")
    else if (match) setFreePlayMsg(`Wait — that's actually ${match.name}! You've got an ear for this.`)
    else setFreePlayMsg(FREE_PLAY_MESSAGES[Math.floor(Math.random() * FREE_PLAY_MESSAGES.length)])
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

  const activeFrets: Record<StringName, number | 'x'> = freePlay ? customFrets : CHORDS[selectedChord].frets
  const STRINGS_DISPLAY = [...STRINGS].reverse() as unknown as typeof STRINGS

  // Real-time chord detection from current fret positions
  const detectedChord = useMemo(() => {
    const fretArray = STRINGS.map(s => {
      const f = activeFrets[s]
      return f === 'x' ? null : f
    })
    return detectChord(fretArray)
  }, [activeFrets])

  return (
    <div>
      {/* Chord name display — real-time detection */}
      <div style={{ textAlign: 'center', marginBottom: 12, minHeight: 44 }}>
        {detectedChord.name ? (
          <>
            <div style={{
              fontSize: detectedChord.isChord ? 28 : 14,
              fontWeight: 800,
              color: detectedChord.isChord ? accentColor : '#666',
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
        <div className="gt-chord-btns">
          {CHORDS.map((ch, i) => (
            <button
              key={ch.name}
              className={`gt-chord-btn${selectedChord === i ? ' active' : ''}`}
              onClick={() => setSelectedChord(i)}
              style={selectedChord === i ? { background: accentColor, color: '#fff', borderColor: accentColor } : undefined}
            >
              {ch.name}
            </button>
          ))}
        </div>
      )}

      {/* Guitar Neck SVG */}
      <div className="gt-neck-wrap">
        <svg viewBox="0 0 380 220" className="gt-neck-svg">
          {[1, 2, 3, 4].map(f => (
            <text key={`fn-${f}`} x={40 + (f - 1) * 85 + 42.5} y={18} textAnchor="middle" fill="#555" fontSize="12" fontFamily="'Barlow', sans-serif">{f}</text>
          ))}
          {STRINGS_DISPLAY.map((s, i) => (
            <text key={`sl-${s}`} x={14} y={50 + i * 30} textAnchor="middle" fill="#666" fontSize="11" fontFamily="'Barlow', sans-serif" dominantBaseline="middle">{s}</text>
          ))}
          <line x1="40" y1="28" x2="40" y2={50 + 5 * 30} stroke="#888" strokeWidth="5" />
          {[1, 2, 3, 4].map(f => (
            <line key={`fret-${f}`} x1={40 + f * 85} y1="28" x2={40 + f * 85} y2={50 + 5 * 30} stroke="#333" strokeWidth="2" />
          ))}
          {STRINGS_DISPLAY.map((_, i) => (
            <line key={`str-${i}`} x1="40" y1={50 + i * 30} x2={40 + 4 * 85} y2={50 + i * 30} stroke={`rgba(255,255,255,${0.15 + (5 - i) * 0.03})`} strokeWidth={1.0 + i * 0.25} />
          ))}
          {freePlay && STRINGS_DISPLAY.map((s, si) => (
            [1, 2, 3, 4].map(f => (
              <rect key={`hit-${s}-${f}`} x={40 + (f - 1) * 85} y={50 + si * 30 - 14} width={85} height={28} fill="transparent" cursor="pointer" onClick={() => setStringFret(s, f)} />
            ))
          ))}
          {STRINGS_DISPLAY.map((s, i) => {
            const fret = activeFrets[s]; const y = 50 + i * 30
            if (fret === 'x') return <text key={`ind-${s}`} x={30} y={y} textAnchor="middle" fill="#f55" fontSize="13" fontWeight="bold" dominantBaseline="middle">{'\u2715'}</text>
            if (fret === 0) return <circle key={`ind-${s}`} cx={30} cy={y} r="6" fill="none" stroke="#aaa" strokeWidth="1.5" style={{ pointerEvents: 'none' }} />
            return null
          })}
          {STRINGS_DISPLAY.map((s, i) => {
            const fret = activeFrets[s]
            if (fret === 'x' || fret === 0) return null
            const cx = 40 + (fret - 1) * 85 + 42.5; const cy = 50 + i * 30
            return (
              <g key={`dot-${s}`} style={{ pointerEvents: 'none' }}>
                <circle cx={cx} cy={cy} r="11" fill={accentColor} />
                <text x={cx} y={cy} textAnchor="middle" dominantBaseline="central" fill="#fff" fontSize="10" fontWeight="bold">{fret}</text>
              </g>
            )
          })}
        </svg>
      </div>

      {/* Strum button */}
      <div style={{ textAlign: 'center', marginTop: 16 }}>
        <button
          className={`gt-strum-btn${freePlay ? ' gt-strum-btn-big' : ''}${strumming ? ' strumming' : ''}`}
          onClick={freePlay ? strumFreePlay : strumChord}
          style={{ background: accentColor }}
        >
          {freePlay ? '\uD83C\uDFB8 STRUM YOUR CREATION' : '\uD83C\uDFB8 STRUM'}
        </button>
      </div>

      {/* Free play message */}
      {freePlay && freePlayMsg && (
        <div className="gt-freeplay-msg" style={{ borderColor: accentColor }}>{freePlayMsg}</div>
      )}

      {/* Free play toggle */}
      <div className="gt-freeplay-divider">
        <div className="gt-freeplay-line" />
        <button
          className="gt-freeplay-toggle"
          onClick={() => {
            if (freePlay) { setSelectedChord(0); setCustomFrets({ E2: 0, A2: 0, D3: 0, G3: 0, B3: 0, E4: 0 }) }
            setFreePlay(!freePlay); setFreePlayMsg(null)
          }}
          style={freePlay ? { background: accentColor, color: '#fff', borderColor: accentColor } : undefined}
        >
          {freePlay ? 'Back to Presets' : 'Free Play Mode'}
        </button>
        <div className="gt-freeplay-line" />
      </div>
    </div>
  )
}
