/**
 * Standalone drum kit widget — extracted from DrumsLanding.tsx.
 * Uses the same audio files at /audio/drums/*.wav with synth fallbacks.
 */
import { useState, useRef, useEffect, useCallback } from 'react'

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

// ── Audio engine (matches DrumsLanding exactly) ──
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

// Synth fallbacks (identical to DrumsLanding)
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

export default function DrumsWidget() {
  const [hitPad, setHitPad] = useState<string | null>(null)
  const [ripples, setRipples] = useState<{ id: number; padId: string; x: number; y: number }[]>([])
  const rippleId = useRef(0)
  const preloaded = useRef(false)
  const padPlaying = useRef<Record<string, boolean>>({})

  const ensurePreloaded = useCallback(() => {
    if (preloaded.current) return
    preloaded.current = true
    initAudioCtx()
    PADS.forEach(p => loadBuffer(p.file))
  }, [])

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

  return (
    <div>
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
    </div>
  )
}
