/**
 * Standalone piano keyboard widget — extracted from PianoLanding.tsx.
 * Uses the same audio engine, same key layout, same WAV samples.
 */
import { useState, useEffect, useRef, useCallback } from 'react'

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

const NOTE_FREQS: Record<string, number> = {
  C: 523, Cs: 554, D: 587, Ds: 622, E: 659, F: 698,
  Fs: 740, G: 784, Gs: 831, A: 880, As: 932, B: 988, C2: 1047,
}

// ── Audio engine (matches PianoLanding exactly) ──
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
  src.start(0)
}

function synthPianoNote(freq: number) {
  const c = initAudioCtx()
  const now = c.currentTime
  const o1 = c.createOscillator(); const g1 = c.createGain()
  o1.type = 'sine'; o1.frequency.value = freq
  g1.gain.setValueAtTime(0.5, now); g1.gain.exponentialRampToValueAtTime(0.001, now + 0.8)
  o1.connect(g1); g1.connect(c.destination)
  o1.start(now); o1.stop(now + 0.8)
  const o2 = c.createOscillator(); const g2 = c.createGain()
  o2.type = 'sine'; o2.frequency.value = freq * 2
  g2.gain.setValueAtTime(0.15, now); g2.gain.exponentialRampToValueAtTime(0.001, now + 0.6)
  o2.connect(g2); g2.connect(c.destination)
  o2.start(now); o2.stop(now + 0.6)
  const o3 = c.createOscillator(); const g3 = c.createGain()
  o3.type = 'sine'; o3.frequency.value = freq * 3
  g3.gain.setValueAtTime(0.07, now); g3.gain.exponentialRampToValueAtTime(0.001, now + 0.4)
  o3.connect(g3); g3.connect(c.destination)
  o3.start(now); o3.stop(now + 0.4)
}

export default function PianoWidget() {
  const [hitKeys, setHitKeys] = useState<Set<string>>(new Set())
  const preloaded = useRef(false)
  const keyPlaying = useRef<Record<string, number>>({})
  const touchActive = useRef(false) // blocks synthetic mouse events after touch

  const ensurePreloaded = useCallback(() => {
    if (preloaded.current) return
    preloaded.current = true
    initAudioCtx()
    ALL_KEYS.forEach(k => loadBuffer(`/audio/piano/${k.id}.wav?v=${CACHE_V}`))
  }, [])

  const playNote = useCallback((noteId: string) => {
    const now = performance.now()
    if (now - (keyPlaying.current[noteId] || 0) < 150) return // 150ms debounce prevents double-hit
    keyPlaying.current[noteId] = now
    ensurePreloaded()
    const url = `/audio/piano/${noteId}.wav?v=${CACHE_V}`
    const cached = bufferCache[url]
    if (cached) { playBuffer(cached) }
    else { loadBuffer(url).then(buf => { if (buf) playBuffer(buf); else synthPianoNote(NOTE_FREQS[noteId] || 523) }) }
  }, [ensurePreloaded])

  const playKey = useCallback((noteId: string) => {
    playNote(noteId)
    setHitKeys(prev => new Set(prev).add(noteId))
    setTimeout(() => setHitKeys(prev => { const next = new Set(prev); next.delete(noteId); return next }), 160)
  }, [playNote])

  // Keyboard shortcuts
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

  return (
    <div>
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
      <div className="pn-keyboard-hint">Use keys A–K to play</div>
    </div>
  )
}
