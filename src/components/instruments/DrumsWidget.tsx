/**
 * DrumsWidget.tsx
 * Interactive SVG drum kit — tap/click any piece to play.
 *
 * Audio: real .wav files from /audio/drums/ directory.
 * Input: onPointerDown per SVG piece (instant on touch + mouse).
 *        Keyboard as secondary layer (collapsible shortcut strip).
 * Animation: React state drives hit flash per piece.
 * Color: reads CSS var(--c) for accent. Cymbals use gold palette.
 */

import { useState, useEffect, useRef, useCallback } from 'react'

// ─── Audio file playback ─────────────────────────────────────────────────────

type PieceId = 'kick' | 'snare' | 'hihat' | 'hihat-open' | 'crash' | 'ride' | 'tom-hi' | 'tom-mid' | 'tom-lo'

const SAMPLE_CONFIG: Record<PieceId, { file: string; rate: number }> = {
  'kick':      { file: '/audio/drums/kick.wav',  rate: 1 },
  'snare':     { file: '/audio/drums/snare.wav',  rate: 1 },
  'hihat':     { file: '/audio/drums/hihat.wav',  rate: 1 },
  'hihat-open': { file: '/audio/drums/hihat.wav', rate: 0.8 },
  'crash':     { file: '/audio/drums/crash.wav',  rate: 1 },
  'ride':      { file: '/audio/drums/ride.wav',   rate: 1 },
  'tom-hi':    { file: '/audio/drums/hitom.wav',  rate: 1 },
  'tom-mid':   { file: '/audio/drums/lotom.wav',  rate: 1.25 },
  'tom-lo':    { file: '/audio/drums/lotom.wav',  rate: 1 },
}

function getCtx(ref: React.MutableRefObject<AudioContext | null>): AudioContext {
  if (!ref.current) ref.current = new AudioContext()
  if (ref.current.state === 'suspended') ref.current.resume()
  return ref.current
}

// Pre-decoded audio buffers cache
const audioBuffers = new Map<string, AudioBuffer>()

async function loadBuffer(ctx: AudioContext, url: string): Promise<AudioBuffer> {
  const cached = audioBuffers.get(url)
  if (cached) return cached
  const response = await fetch(url)
  const arrayBuf = await response.arrayBuffer()
  const decoded = await ctx.decodeAudioData(arrayBuf)
  audioBuffers.set(url, decoded)
  return decoded
}

function playSound(ctx: AudioContext, id: PieceId) {
  const cfg = SAMPLE_CONFIG[id]
  const cached = audioBuffers.get(cfg.file)
  if (cached) {
    const src = ctx.createBufferSource()
    src.buffer = cached
    src.playbackRate.value = cfg.rate
    src.connect(ctx.destination)
    src.start()
  } else {
    loadBuffer(ctx, cfg.file).then(buf => {
      const src = ctx.createBufferSource()
      src.buffer = buf
      src.playbackRate.value = cfg.rate
      src.connect(ctx.destination)
      src.start()
    })
  }
}

// ─── Key mapping ──────────────────────────────────────────────────────────────

const KEY_MAP: { key: string; shift?: boolean; id: PieceId; label: string }[] = [
  { key: ' ',  id: 'kick',      label: 'Space' },
  { key: 's',  id: 'snare',     label: 'S' },
  { key: 'h',  id: 'hihat',     label: 'H' },
  { key: 'h',  shift: true, id: 'hihat-open', label: 'Shift+H' },
  { key: 'c',  id: 'crash',     label: 'C' },
  { key: 'r',  id: 'ride',      label: 'R' },
  { key: 'j',  id: 'tom-hi',    label: 'J' },
  { key: 'k',  id: 'tom-mid',   label: 'K' },
  { key: 'l',  id: 'tom-lo',    label: 'L' },
]

// ─── SVG palette ──────────────────────────────────────────────────────────────

const GOLD       = '#b08820'
const GOLD_BELL  = '#d4a83a'
const GOLD_HI    = '#ffe090'
const GOLD_RIM   = '#785c10'
const LUG        = '#8a8a9a'
const SHELL      = '#1a1a2e'
const HEAD       = '#2a2a3e'
const HEAD_LIT   = '#3a3a50'
const CYMBAL_LIT = '#d4a83a'
const ACCENT     = '#D4226A'

// ─── Beat pattern (16 steps @ 95bpm, loops 4 bars then auto-stops) ────────────

const STEP_MS = (60000 / 95) / 4
const PATTERN: { step: number; ids: PieceId[] }[] = [
  { step: 0,  ids: ['kick', 'hihat'] },
  { step: 1,  ids: ['hihat'] },
  { step: 2,  ids: ['hihat'] },
  { step: 3,  ids: ['hihat'] },
  { step: 4,  ids: ['snare', 'hihat'] },
  { step: 5,  ids: ['hihat'] },
  { step: 6,  ids: ['kick', 'hihat'] },
  { step: 7,  ids: ['kick', 'hihat'] },
  { step: 8,  ids: ['kick', 'hihat'] },
  { step: 9,  ids: ['hihat'] },
  { step: 10, ids: ['hihat', 'tom-hi'] },
  { step: 11, ids: ['hihat'] },
  { step: 12, ids: ['snare', 'hihat'] },
  { step: 13, ids: ['hihat', 'tom-mid'] },
  { step: 14, ids: ['kick', 'hihat', 'tom-lo'] },
  { step: 15, ids: ['crash'] },
]

// ─── Component ────────────────────────────────────────────────────────────────

export default function DrumsWidget() {
  const audioCtxRef = useRef<AudioContext | null>(null)
  const [activeHits, setActiveHits] = useState<Set<PieceId>>(new Set())
  const [showKeys, setShowKeys] = useState(false)
  const [isMobile, setIsMobile] = useState(false)
  const [playing, setPlaying] = useState(false)
  const beatRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const playingRef = useRef(false)

  useEffect(() => {
    setIsMobile(window.innerWidth < 768)
  }, [])

  // Preload all drum audio files on first user interaction
  useEffect(() => {
    const preload = () => {
      const ctx = getCtx(audioCtxRef)
      const urls = new Set(Object.values(SAMPLE_CONFIG).map(c => c.file))
      urls.forEach(url => loadBuffer(ctx, url))
      window.removeEventListener('pointerdown', preload)
      window.removeEventListener('keydown', preload)
    }
    window.addEventListener('pointerdown', preload, { once: true })
    window.addEventListener('keydown', preload, { once: true })
    return () => {
      window.removeEventListener('pointerdown', preload)
      window.removeEventListener('keydown', preload)
    }
  }, [])

  const handleHit = useCallback((id: PieceId) => {
    const ctx = getCtx(audioCtxRef)
    playSound(ctx, id)
    setActiveHits(prev => new Set(prev).add(id))
    setTimeout(() => {
      setActiveHits(prev => { const n = new Set(prev); n.delete(id); return n })
    }, 120)
  }, [])

  // Keyboard handler
  useEffect(() => {
    const onDown = (e: KeyboardEvent) => {
      if (e.repeat) return
      const k = e.key.toLowerCase()
      for (const m of KEY_MAP) {
        if (m.key === k && !!m.shift === e.shiftKey) {
          e.preventDefault()
          handleHit(m.id)
          return
        }
      }
    }
    window.addEventListener('keydown', onDown)
    return () => window.removeEventListener('keydown', onDown)
  }, [handleHit])

  // Beat demo
  function stopBeat() {
    playingRef.current = false
    setPlaying(false)
    if (beatRef.current) clearTimeout(beatRef.current)
  }

  function runStep(idx: number, loop: number) {
    if (!playingRef.current) return
    PATTERN[idx].ids.forEach(id => handleHit(id))
    const next = (idx + 1) % PATTERN.length
    const nextLoop = next === 0 ? loop + 1 : loop
    if (nextLoop >= 4) { beatRef.current = setTimeout(stopBeat, STEP_MS); return }
    beatRef.current = setTimeout(() => runStep(next, nextLoop), STEP_MS)
  }

  function toggleBeat() {
    if (playingRef.current) { stopBeat(); return }
    playingRef.current = true
    setPlaying(true)
    runStep(0, 0)
  }

  // Cleanup beat on unmount
  useEffect(() => () => { if (beatRef.current) clearTimeout(beatRef.current) }, [])

  const isHit = (id: PieceId) => activeHits.has(id)

  // Helper for pointer handler
  const onHit = (id: PieceId) => (e: React.PointerEvent) => {
    e.preventDefault()
    handleHit(id)
  }

  // ─── Piece renderers ─────────────────────────────────────────────────────

  function CymbalShape({ id, cx, cy, rx, ry, bellR = 10, label, labelDy = 0 }: {
    id: PieceId; cx: number; cy: number; rx: number; ry?: number
    bellR?: number; label: string; labelDy?: number
  }) {
    const rY = ry ?? rx * 0.92
    const lit = isHit(id)
    return (
      <g style={{ cursor: 'pointer' }} onPointerDown={onHit(id)}>
        <ellipse cx={cx} cy={cy} rx={rx} ry={rY}
          fill={lit ? CYMBAL_LIT : GOLD} opacity={lit ? 1 : 0.87}
          style={{ transition: 'fill 0.06s, opacity 0.06s' }} />
        {/* Grooves */}
        {Array.from({ length: 5 }, (_, i) => {
          const r = (rx - 4) - ((rx - 4) / 7) * (i + 1)
          return <ellipse key={i} cx={cx} cy={cy} rx={r} ry={r * 0.93}
            fill="none" stroke={GOLD_RIM} strokeWidth={0.7} opacity={0.45 - i * 0.05}
            style={{ pointerEvents: 'none' }} />
        })}
        <ellipse cx={cx} cy={cy} rx={bellR * 1.1} ry={bellR} fill={GOLD_BELL}
          style={{ pointerEvents: 'none' }} />
        <ellipse cx={cx} cy={cy} rx={bellR * 0.45} ry={bellR * 0.42} fill={GOLD_HI} opacity={0.7}
          style={{ pointerEvents: 'none' }} />
        {lit && <ellipse cx={cx} cy={cy} rx={rx} ry={rY} fill="white" opacity={0.25}
          style={{ pointerEvents: 'none' }} />}
        {!isMobile && <text x={cx} y={cy + rY + 13 + labelDy} textAnchor="middle" fontSize={8}
          fill="rgba(255,255,255,0.35)" fontFamily="system-ui,sans-serif" letterSpacing={1.5}
          style={{ pointerEvents: 'none', userSelect: 'none' }}>{label}</text>}
      </g>
    )
  }

  function DrumShape({ id, cx, cy, r, label, lugs = 8 }: {
    id: PieceId; cx: number; cy: number; r: number; label: string; lugs?: number
  }) {
    const lit = isHit(id)
    return (
      <g style={{ cursor: 'pointer' }} onPointerDown={onHit(id)}>
        {/* Shell */}
        <circle cx={cx} cy={cy} r={r} fill={ACCENT} opacity={lit ? 1 : 0.82}
          style={{ transition: 'opacity 0.06s' }} />
        {/* Lugs */}
        {Array.from({ length: lugs }, (_, i) => {
          const rad = ((360 / lugs) * i - 90) * Math.PI / 180
          return <circle key={i}
            cx={cx + Math.cos(rad) * (r + 3)} cy={cy + Math.sin(rad) * (r + 3)}
            r={3.8} fill={LUG} style={{ pointerEvents: 'none' }} />
        })}
        {/* Head */}
        <circle cx={cx} cy={cy} r={r - 7} fill={lit ? HEAD_LIT : HEAD}
          style={{ transition: 'fill 0.06s', pointerEvents: 'none' }} />
        <circle cx={cx} cy={cy} r={3} fill="rgba(255,255,255,0.08)"
          style={{ pointerEvents: 'none' }} />
        {lit && <circle cx={cx} cy={cy} r={r} fill="white" opacity={0.2}
          style={{ pointerEvents: 'none' }} />}
        {!isMobile && <text x={cx} y={cy + r + 14} textAnchor="middle" fontSize={8}
          fill="rgba(255,255,255,0.35)" fontFamily="system-ui,sans-serif" letterSpacing={1.5}
          style={{ pointerEvents: 'none', userSelect: 'none' }}>{label}</text>}
      </g>
    )
  }

  // ─── Kick positions ──────────────────────────────────────────────────────
  const KX = 300, KY = 225, KR = 80

  const kickLit = isHit('kick')

  return (
    <section style={{
      width: '100%', background: '#0A0A10',
      borderTop: '1px solid #1C1C2A', borderBottom: '1px solid #1C1C2A',
      padding: '48px 16px',
    }}>
      <div style={{ textAlign: 'center', marginBottom: 28 }}>
        <div style={{
          fontSize: 11, fontWeight: 800, letterSpacing: '0.12em',
          textTransform: 'uppercase' as const, color: 'var(--c, #D4226A)', marginBottom: 8,
        }}>Interactive</div>
        <h2 style={{
          fontFamily: "'Bebas Neue', sans-serif", fontSize: 'clamp(28px, 6vw, 48px)',
          color: '#fff', lineHeight: 0.95, letterSpacing: '0.5px', margin: 0,
        }}>
          Play The <em style={{ fontStyle: 'normal', color: 'var(--c, #D4226A)' }}>Kit.</em>
        </h2>
        <p style={{
          fontSize: 14, color: '#888', maxWidth: 400, margin: '12px auto 0', lineHeight: 1.6,
        }}>Tap any piece. Real sounds, no downloads.</p>
      </div>

      <div style={{ width: '100%', maxWidth: 640, margin: '0 auto', position: 'relative' }}>
        <svg
          viewBox="0 0 600 420"
          width="100%"
          style={{ display: 'block', touchAction: 'none', userSelect: 'none' }}
        >
          {/* ── Kick drum barrel (decorative shell, not the hit zone) ── */}
          <ellipse cx={KX} cy={KY + 8} rx={KR + 6} ry={12} fill="rgba(0,0,0,0.2)" />
          <circle cx={KX} cy={KY} r={KR} fill={SHELL} opacity={0.97} />
          <circle cx={KX} cy={KY} r={KR} fill={ACCENT} opacity={0.35} />
          <circle cx={KX} cy={KY} r={KR - 6} fill={SHELL} opacity={0.88} />
          {/* Kick barrel lugs */}
          {Array.from({ length: 10 }, (_, i) => {
            const rad = ((360 / 10) * i - 90) * Math.PI / 180
            return <circle key={i}
              cx={KX + Math.cos(rad) * (KR + 2)} cy={KY + Math.sin(rad) * (KR + 2)}
              r={4.5} fill={LUG} style={{ pointerEvents: 'none' }} />
          })}
          {/* Kick head */}
          <circle cx={KX} cy={KY} r={KR - 10} fill="#0d0d1a" style={{ pointerEvents: 'none' }} />
          <circle cx={KX} cy={KY} r={KR - 14} fill="#101018" style={{ pointerEvents: 'none' }} />
          <circle cx={KX} cy={KY} r={24} fill="#1a1a28" style={{ pointerEvents: 'none' }} />
          <circle cx={KX} cy={KY} r={18} fill={ACCENT} opacity={0.1} style={{ pointerEvents: 'none' }} />

          {/* Tom mount hardware */}
          <rect x={KX - 18} y={KY - KR - 2} width={12} height={8} rx={2} fill={LUG} opacity={0.6}
            style={{ pointerEvents: 'none' }} />
          <rect x={KX + 6} y={KY - KR - 2} width={12} height={8} rx={2} fill={LUG} opacity={0.6}
            style={{ pointerEvents: 'none' }} />

          {/* Tom mount arms */}
          <line x1={KX - 12} y1={KY - KR} x2={230} y2={155}
            stroke={LUG} strokeWidth={4} strokeLinecap="round" opacity={0.5}
            style={{ pointerEvents: 'none' }} />
          <line x1={KX + 12} y1={KY - KR} x2={340} y2={140}
            stroke={LUG} strokeWidth={4} strokeLinecap="round" opacity={0.5}
            style={{ pointerEvents: 'none' }} />

          {/* ── Kick pedal — the tappable hit zone ── */}
          <g style={{ cursor: 'pointer' }} onPointerDown={onHit('kick')}>
            {/* Beater arm */}
            <line x1={290} y1={KY + KR - 4} x2={290} y2={355}
              stroke="#4a4a5a" strokeWidth={3} strokeLinecap="round"
              style={{ pointerEvents: 'none' }} />
            {/* Cam wheel */}
            <circle cx={290} cy={KY + KR + 4} r={7} fill="#3e3e50"
              style={{ pointerEvents: 'none' }} />
            {/* Footboard */}
            <rect x={265} y={348} width={50} height={46} rx={5}
              fill={kickLit ? '#4e4e68' : '#38384c'}
              style={{ transition: 'fill 0.06s' }} />
            {/* Grip lines */}
            {[-10, -3, 4, 11].map((off, i) => (
              <line key={i} x1={275} y1={371 + off} x2={305} y2={371 + off}
                stroke="#50506a" strokeWidth={1.5} style={{ pointerEvents: 'none' }} />
            ))}
            {/* Hinge bar */}
            <rect x={267} y={346} width={46} height={5} rx={2.5} fill="#50506a"
              style={{ pointerEvents: 'none' }} />
            {kickLit && <rect x={265} y={348} width={50} height={46} rx={5}
              fill="white" opacity={0.2} style={{ pointerEvents: 'none' }} />}
            {!isMobile && <text x={290} y={408} textAnchor="middle" fontSize={8}
              fill="rgba(255,255,255,0.35)" fontFamily="system-ui,sans-serif" letterSpacing={1.5}
              style={{ pointerEvents: 'none', userSelect: 'none' }}>KICK</text>}
          </g>

          {/* ── Hi-hat — far left ── */}
          {/* Stand */}
          <line x1={98} y1={275} x2={98} y2={298}
            stroke="#555" strokeWidth={2.5} opacity={0.45} style={{ pointerEvents: 'none' }} />
          <ellipse cx={98} cy={302} rx={12} ry={5} fill="#444" opacity={0.4}
            style={{ pointerEvents: 'none' }} />
          {/* Bottom plate peek */}
          <ellipse cx={98} cy={256} rx={44} ry={40} fill={GOLD} opacity={0.55}
            style={{ pointerEvents: 'none' }} />

          <CymbalShape id="hihat" cx={98} cy={251} rx={44} ry={40} bellR={11} label="HI-HAT" />

          {/* ── Snare — front-left ── */}
          <g style={{ cursor: 'pointer' }} onPointerDown={onHit('snare')}>
            <circle cx={185} cy={300} r={40} fill={SHELL} opacity={0.95} />
            {/* Lugs */}
            {Array.from({ length: 8 }, (_, i) => {
              const rad = ((360 / 8) * i - 90) * Math.PI / 180
              return <circle key={i}
                cx={185 + Math.cos(rad) * 43} cy={300 + Math.sin(rad) * 43}
                r={3.8} fill={LUG} style={{ pointerEvents: 'none' }} />
            })}
            {/* Head */}
            <circle cx={185} cy={300} r={33} fill={isHit('snare') ? HEAD_LIT : HEAD}
              style={{ transition: 'fill 0.06s', pointerEvents: 'none' }} />
            {/* Snare wires */}
            {[-14, -7, 0, 7, 14].map((off, i) => (
              <line key={i} x1={155} y1={300 + off} x2={215} y2={300 + off}
                stroke="rgba(90,70,40,0.2)" strokeWidth={0.9} style={{ pointerEvents: 'none' }} />
            ))}
            {isHit('snare') && <circle cx={185} cy={300} r={40} fill="white" opacity={0.2}
              style={{ pointerEvents: 'none' }} />}
            {!isMobile && <text x={185} y={352} textAnchor="middle" fontSize={8}
              fill="rgba(255,255,255,0.35)" fontFamily="system-ui,sans-serif" letterSpacing={1.5}
              style={{ pointerEvents: 'none', userSelect: 'none' }}>SNARE</text>}
          </g>

          {/* ── Rack toms ── */}
          <DrumShape id="tom-hi" cx={230} cy={152} r={32} label="HIGH TOM" />
          <DrumShape id="tom-mid" cx={340} cy={138} r={32} label="MID TOM" />

          {/* ── Floor tom — right side ── */}
          {/* Legs */}
          {[[-24, 18], [24, 18], [0, -24]].map(([dx, dy], i) => (
            <line key={i}
              x1={490 + dx * 0.4} y1={270 + dy * 0.4}
              x2={490 + dx} y2={270 + dy + 28}
              stroke="#555" strokeWidth={3} strokeLinecap="round" opacity={0.45}
              style={{ pointerEvents: 'none' }} />
          ))}
          <DrumShape id="tom-lo" cx={490} cy={260} r={48} label="FLOOR TOM" />

          {/* ── Cymbals ── */}
          {/* Stand rods */}
          <line x1={170} y1={72} x2={170} y2={96}
            stroke="#555" strokeWidth={2} opacity={0.35} style={{ pointerEvents: 'none' }} />
          <line x1={458} y1={80} x2={458} y2={106}
            stroke="#555" strokeWidth={2} opacity={0.35} style={{ pointerEvents: 'none' }} />

          <CymbalShape id="crash" cx={170} cy={70} rx={58} ry={53} bellR={12} label="CRASH" />
          <CymbalShape id="ride" cx={458} cy={82} rx={66} ry={61} bellR={14} label="RIDE" />

          {/* ── Hi-hat open indicator — small overlay text ── */}
          {isHit('hihat-open') && (
            <text x={98} y={251} textAnchor="middle" fontSize={9} fill="white" opacity={0.7}
              fontFamily="system-ui,sans-serif" fontWeight={700}
              style={{ pointerEvents: 'none', userSelect: 'none' }}>OPEN</text>
          )}
        </svg>

        {/* Beat demo button */}
        <button
          onClick={toggleBeat}
          title={playing ? 'Stop beat' : 'Play a beat'}
          style={{
            position: 'absolute', right: 4, bottom: 48,
            width: 44, height: 44, borderRadius: '50%',
            border: '1.5px solid rgba(255,255,255,0.18)',
            background: playing ? 'rgba(212,34,106,0.15)' : 'rgba(255,255,255,0.05)',
            color: playing ? ACCENT : 'inherit',
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
            backdropFilter: 'blur(4px)', transition: 'border-color 0.15s, background 0.15s',
          }}
        >
          {playing ? (
            <svg width={14} height={14} viewBox="0 0 16 16" fill="currentColor">
              <rect x={3} y={3} width={4} height={10} rx={1} />
              <rect x={9} y={3} width={4} height={10} rx={1} />
            </svg>
          ) : (
            <svg width={14} height={14} viewBox="0 0 16 16" fill="currentColor">
              <path d="M4 3l10 5-10 5V3z" />
            </svg>
          )}
        </button>
      </div>

      {/* Keyboard shortcuts — collapsible */}
      {!isMobile && (
        <div style={{ textAlign: 'center', marginTop: 16 }}>
          <button
            onClick={() => setShowKeys(v => !v)}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              fontSize: 11, color: '#555', fontFamily: 'inherit',
              padding: '4px 8px',
            }}
          >
            {showKeys ? '▾' : '▸'} Keyboard shortcuts
          </button>
          {showKeys && (
            <div style={{
              display: 'flex', flexWrap: 'wrap', gap: '8px 16px',
              justifyContent: 'center', marginTop: 8, padding: '0 8px',
            }}>
              {KEY_MAP.map(m => (
                <span key={m.id + (m.shift ? '-shift' : '')} style={{
                  display: 'flex', alignItems: 'center', gap: 5,
                  fontSize: 10, letterSpacing: '1.2px', textTransform: 'uppercase', opacity: 0.45,
                }}>
                  <span style={{
                    background: 'rgba(255,255,255,0.08)',
                    border: '0.5px solid rgba(255,255,255,0.18)',
                    borderRadius: 3, padding: '1px 5px', fontFamily: 'monospace', fontSize: 10,
                  }}>{m.label}</span>
                  {m.id.replace('-', ' ').replace('hihat open', 'hi-hat open').replace('hihat', 'hi-hat')}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  )
}
