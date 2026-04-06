/**
 * DrumKit.tsx
 * Realistic aerial-view drum kit for Adkins Music Lessons drum pages.
 *
 * Layout mirrors a real kit viewed from directly above:
 *   • Kick drum = large barrel center-back (decorative, NOT interactive)
 *   • Kick PEDAL = footboard below the kick (this triggers kick sound)
 *   • Snare = front-left, between hi-hat and kick
 *   • Hi-hat = far left, stacked pair, in front of snare
 *   • High Tom / Mid Tom = mounted on kick, upper-center via tom arms
 *   • Low Tom (floor) = right side, standing on its own legs
 *   • Crash = upper-left
 *   • Ride = upper-right (largest cymbal)
 *   • China = far upper-left
 *   • Splash = far upper-right (small)
 *
 * Polyphony: every hit spawns a NEW AudioBufferSourceNode from the cached
 *   buffer — unlimited simultaneous sounds, same model as the piano page.
 *
 * Input: click, multi-touch (any number of fingers), keyboard
 *   (keydown fires once per press; held keys do NOT auto-repeat).
 *
 * Color: reads CSS var(--c) from document root — set by location system.
 *   Drums use var(--c). Cymbals use gold palette. Pedal uses neutral steel.
 *
 * Usage: <DrumKit />
 *   Parent sets --c on document.documentElement before render.
 */

import { useEffect, useRef, useCallback } from 'react'

// ─── Types ─────────────────────────────────────────────────────────────────────

interface Piece {
  id: string
  label: string
  kind: 'drum' | 'cymbal' | 'pedal'
  wav: string
  key: string
  keyLabel: string
}

interface Ripple {
  el: SVGCircleElement
  t0: number
  maxR: number
  isCymbal: boolean
  isPedal: boolean
}

// ─── Kit definition ────────────────────────────────────────────────────────────

const PIECES: Piece[] = [
  { id: 'kick',    label: 'KICK',     kind: 'pedal',  wav: '/audio/drums/kick.wav',     key: 'a', keyLabel: 'A' },
  { id: 'snare',   label: 'SNARE',    kind: 'drum',   wav: '/audio/drums/snare.wav',    key: 's', keyLabel: 'S' },
  { id: 'hihat',   label: 'HI-HAT',   kind: 'cymbal', wav: '/audio/drums/hihat.wav',    key: 'd', keyLabel: 'D' },
  { id: 'tom-hi',  label: 'HIGH TOM', kind: 'drum',   wav: '/audio/drums/hitom.wav',   key: 'f', keyLabel: 'F' },
  { id: 'tom-mid', label: 'MID TOM',  kind: 'drum',   wav: '/audio/drums/midtom.wav',  key: 'g', keyLabel: 'G' },
  { id: 'tom-lo',  label: 'LOW TOM',  kind: 'drum',   wav: '/audio/drums/lotom.wav',   key: 'h', keyLabel: 'H' },
  { id: 'crash',   label: 'CRASH',    kind: 'cymbal', wav: '/audio/drums/crash.wav',    key: 'j', keyLabel: 'J' },
  { id: 'ride',    label: 'RIDE',     kind: 'cymbal', wav: '/audio/drums/ride.wav',     key: 'k', keyLabel: 'K' },
  { id: 'china',   label: 'CHINA',    kind: 'cymbal', wav: '/audio/drums/china.wav',    key: 'l', keyLabel: 'L' },
  { id: 'splash',  label: 'SPLASH',   kind: 'cymbal', wav: '/audio/drums/splash.wav',   key: ';', keyLabel: ';' },
]

const KEY_MAP: Record<string, string> = {}
PIECES.forEach(p => { KEY_MAP[p.key] = p.id })

// ─── Beat pattern (16 steps @ 95bpm, loops 4 bars then auto-stops) ────────────

const STEP_MS = (60000 / 95) / 4
const PATTERN: { step: number; ids: string[] }[] = [
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

// ─── SVG palette ───────────────────────────────────────────────────────────────

const GOLD      = '#b08820'
const GOLD_BELL = '#d4a83a'
const GOLD_HI   = '#ffe090'
const GOLD_RIM  = '#785c10'
const LUG       = '#8a8a9a'
const SHELL     = '#1e1e2c'
const HEAD      = '#e0d8c2'
const WIRE      = 'rgba(90,70,40,0.22)'

// ─── SVG helpers ───────────────────────────────────────────────────────────────

function Lugs({ cx, cy, r, count = 8 }: { cx: number; cy: number; r: number; count?: number }) {
  return <>
    {Array.from({ length: count }, (_, i) => {
      const rad = ((360 / count) * i - 90) * Math.PI / 180
      return <circle key={i} cx={cx + Math.cos(rad) * (r + 3)} cy={cy + Math.sin(rad) * (r + 3)} r={3.8} fill={LUG} />
    })}
  </>
}

function Grooves({ cx, cy, rOuter, n = 5 }: { cx: number; cy: number; rOuter: number; n?: number }) {
  return <>
    {Array.from({ length: n }, (_, i) => {
      const r = rOuter - (rOuter / (n + 2)) * (i + 1)
      return <ellipse key={i} cx={cx} cy={cy} rx={r} ry={r * 0.93} fill="none" stroke={GOLD_RIM} strokeWidth={0.7} opacity={0.45 - i * 0.05} />
    })}
  </>
}

function Cymbal({ id, cx, cy, rx, ry, bellR = 10, label, labelDy = 0 }: {
  id: string; cx: number; cy: number; rx: number; ry?: number
  bellR?: number; label: string; labelDy?: number
}) {
  const rY = ry ?? rx * 0.92
  return (
    <g id={id} data-kind="cymbal" style={{ cursor: 'pointer' }}>
      <ellipse cx={cx} cy={cy} rx={rx} ry={rY} fill={GOLD} opacity={0.87} />
      <Grooves cx={cx} cy={cy} rOuter={rx - 4} n={5} />
      <ellipse cx={cx} cy={cy} rx={bellR * 1.1} ry={bellR} fill={GOLD_BELL} />
      <ellipse cx={cx} cy={cy} rx={bellR * 0.45} ry={bellR * 0.42} fill={GOLD_HI} opacity={0.7} />
      <ellipse id={`${id}-flash`} cx={cx} cy={cy} rx={rx} ry={rY} fill="white" opacity={0} style={{ pointerEvents: 'none' }} />
      <text x={cx} y={cy + rY + 13 + labelDy} textAnchor="middle" fontSize={8} fill="rgba(0,0,0,0.28)"
        fontFamily="system-ui,sans-serif" letterSpacing={1.5} style={{ pointerEvents: 'none', userSelect: 'none' }}>
        {label}
      </text>
    </g>
  )
}

function China({ id, cx, cy, rx, label }: { id: string; cx: number; cy: number; rx: number; label: string }) {
  const ry = rx * 0.88
  return (
    <g id={id} data-kind="cymbal" style={{ cursor: 'pointer' }}>
      <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill={GOLD} opacity={0.84} />
      <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill="none" stroke="#c8a030" strokeWidth={3.5} opacity={0.45} />
      <Grooves cx={cx} cy={cy} rOuter={rx - 6} n={4} />
      <ellipse cx={cx} cy={cy} rx={9} ry={8} fill={GOLD_BELL} />
      <ellipse cx={cx} cy={cy} rx={4} ry={3.5} fill={GOLD_HI} opacity={0.7} />
      <ellipse id={`${id}-flash`} cx={cx} cy={cy} rx={rx} ry={ry} fill="white" opacity={0} style={{ pointerEvents: 'none' }} />
      <text x={cx} y={cy + ry + 13} textAnchor="middle" fontSize={8} fill="rgba(0,0,0,0.28)"
        fontFamily="system-ui,sans-serif" letterSpacing={1.5} style={{ pointerEvents: 'none', userSelect: 'none' }}>
        {label}
      </text>
    </g>
  )
}

function Tom({ id, cx, cy, r, label, lugs = 8 }: {
  id: string; cx: number; cy: number; r: number; label: string; lugs?: number
}) {
  return (
    <g id={id} data-kind="drum" style={{ cursor: 'pointer' }}>
      <circle cx={cx} cy={cy} r={r} fill="var(--c)" opacity={0.82} />
      <Lugs cx={cx} cy={cy} r={r} count={lugs} />
      <circle cx={cx} cy={cy} r={r - 7} fill={HEAD} />
      <circle cx={cx} cy={cy} r={3} fill="rgba(0,0,0,0.1)" />
      <circle id={`${id}-flash`} cx={cx} cy={cy} r={r} fill="white" opacity={0} style={{ pointerEvents: 'none' }} />
      <text x={cx} y={cy + r + 14} textAnchor="middle" fontSize={8} fill="rgba(0,0,0,0.28)"
        fontFamily="system-ui,sans-serif" letterSpacing={1.5} style={{ pointerEvents: 'none', userSelect: 'none' }}>
        {label}
      </text>
    </g>
  )
}

// ─── Main component ────────────────────────────────────────────────────────────

export default function DrumKit() {
  const audioCtxRef  = useRef<AudioContext | null>(null)
  const buffersRef   = useRef<Record<string, AudioBuffer>>({})
  const ripples      = useRef<Ripple[]>([])
  const rafId        = useRef<number>(0)
  const rippleLayer  = useRef<SVGGElement | null>(null)
  const heldKeys     = useRef<Set<string>>(new Set())
  const beatTimer    = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isPlaying    = useRef(false)

  // ── Kick barrel & pedal positions ──────────────────────────────────────────
  const KX = 350, KY = 225, KR = 88   // kick barrel center + radius
  const PX = 338, PY = 372             // pedal footboard center

  // ── Audio ─────────────────────────────────────────────────────────────────

  function ctx() {
    if (!audioCtxRef.current)
      audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)()
    return audioCtxRef.current
  }

  async function loadBuffer(id: string, wav: string) {
    if (buffersRef.current[id]) return
    try {
      const c   = ctx()
      const res = await fetch(`${wav}?v=${Math.random()}`)
      const arr = await res.arrayBuffer()
      buffersRef.current[id] = await c.decodeAudioData(arr)
    } catch (e) {
      console.warn(`DrumKit: failed to load ${wav}`, e)
    }
  }

  function playSound(id: string) {
    const c   = ctx()
    const buf = buffersRef.current[id]
    if (!buf) return
    const src = c.createBufferSource()
    src.buffer = buf
    src.connect(c.destination)
    src.start()
  }

  // ── Visual ─────────────────────────────────────────────────────────────────

  function flash(id: string) {
    const el = document.getElementById(`${id}-flash`)
    if (!el) return
    el.setAttribute('opacity', '0.3')
    setTimeout(() => el.setAttribute('opacity', '0'), 140)
  }

  function spawnRipple(id: string) {
    const wrapper = document.getElementById(id)
    if (!wrapper || !rippleLayer.current) return

    const kind     = wrapper.dataset.kind as string
    const isCymbal = kind === 'cymbal'
    const isPedal  = kind === 'pedal'

    let cx: number, cy: number, maxR: number

    if (isPedal) {
      cx = PX; cy = PY; maxR = 50
    } else {
      const shape = wrapper.querySelector<SVGCircleElement | SVGEllipseElement>('circle,ellipse')
      if (!shape) return
      cx   = parseFloat(shape.getAttribute('cx') || '0')
      cy   = parseFloat(shape.getAttribute('cy') || '0')
      maxR = parseFloat(shape.getAttribute('rx') || shape.getAttribute('r') || '30') * 2.4
    }

    const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle')
    c.setAttribute('cx', String(cx))
    c.setAttribute('cy', String(cy))
    c.setAttribute('r', '4')
    c.setAttribute('fill', 'none')
    c.setAttribute('stroke-width', '2')
    rippleLayer.current.appendChild(c)
    ripples.current.push({ el: c, t0: performance.now(), maxR, isCymbal, isPedal })
  }

  // ── Hit ────────────────────────────────────────────────────────────────────

  const hit = useCallback((id: string) => {
    const piece = PIECES.find(p => p.id === id)
    if (!piece) return
    if (!buffersRef.current[id]) {
      loadBuffer(id, piece.wav).then(() => playSound(id))
    } else {
      playSound(id)
    }
    flash(id)
    spawnRipple(id)
  }, [])

  // ── Ripple RAF ─────────────────────────────────────────────────────────────

  useEffect(() => {
    const accent = () =>
      getComputedStyle(document.documentElement).getPropertyValue('--c').trim() || '#D41113'

    function frame(now: number) {
      const alive: Ripple[] = []
      for (const rp of ripples.current) {
        const dur = rp.isCymbal ? 900 : rp.isPedal ? 320 : 480
        const p   = Math.min((now - rp.t0) / dur, 1)
        rp.el.setAttribute('r',       String(4 + (rp.maxR - 4) * p))
        rp.el.setAttribute('opacity', String(1 - p))
        rp.el.setAttribute('stroke',  rp.isCymbal ? GOLD_BELL : accent())
        if (p < 1) alive.push(rp)
        else rippleLayer.current?.removeChild(rp.el)
      }
      ripples.current = alive
      rafId.current   = requestAnimationFrame(frame)
    }

    rafId.current = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(rafId.current)
  }, [])

  // ── Preload on first interaction ───────────────────────────────────────────

  useEffect(() => {
    const preload = async () => { for (const p of PIECES) await loadBuffer(p.id, p.wav) }
    window.addEventListener('pointerdown', () => preload(), { once: true })
  }, [])

  // ── Multi-touch ────────────────────────────────────────────────────────────

  useEffect(() => {
    const svg = document.getElementById('drum-kit-svg')
    if (!svg) return
    const onTouch = (e: TouchEvent) => {
      e.preventDefault()
      for (let i = 0; i < e.changedTouches.length; i++) {
        const t = e.changedTouches[i]
        const el = document.elementFromPoint(t.clientX, t.clientY)
        const g  = el?.closest('[data-kind]') as HTMLElement | null
        if (g?.id) hit(g.id)
      }
    }
    svg.addEventListener('touchstart', onTouch, { passive: false })
    return () => svg.removeEventListener('touchstart', onTouch)
  }, [hit])

  // ── Keyboard — polyphonic, no auto-repeat ──────────────────────────────────

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.repeat) return
      const id = KEY_MAP[e.key.toLowerCase()] ?? KEY_MAP[e.key]
      if (!id) return
      heldKeys.current.add(e.key.toLowerCase())
      hit(id)
    }
    const up = (e: KeyboardEvent) => heldKeys.current.delete(e.key.toLowerCase())
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up) }
  }, [hit])

  // ── Beat demo ──────────────────────────────────────────────────────────────

  function stopBeat() {
    isPlaying.current = false
    if (beatTimer.current) clearTimeout(beatTimer.current)
    const pi = document.getElementById('beat-play')
    const si = document.getElementById('beat-stop')
    if (pi) pi.style.display = ''
    if (si) si.style.display = 'none'
  }

  function runStep(idx: number, loop: number) {
    if (!isPlaying.current) return
    PATTERN[idx].ids.forEach(id => hit(id))
    const next = (idx + 1) % PATTERN.length
    const nextLoop = next === 0 ? loop + 1 : loop
    if (nextLoop >= 4) { beatTimer.current = setTimeout(stopBeat, STEP_MS); return }
    beatTimer.current = setTimeout(() => runStep(next, nextLoop), STEP_MS)
  }

  function toggleBeat() {
    if (isPlaying.current) { stopBeat(); return }
    isPlaying.current = true
    const pi = document.getElementById('beat-play')
    const si = document.getElementById('beat-stop')
    if (pi) pi.style.display = 'none'
    if (si) si.style.display = ''
    runStep(0, 0)
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div style={{ width: '100%', maxWidth: 680, margin: '0 auto', padding: '1.5rem 0' }}>

      <div style={{ position: 'relative', width: '100%' }}>
        <svg
          id="drum-kit-svg"
          viewBox="0 0 680 460"
          xmlns="http://www.w3.org/2000/svg"
          style={{ width: '100%', height: 'auto', display: 'block' }}
        >
          {/* Stage shadow tray */}
          <rect x={22} y={22} width={636} height={422} rx={14} fill="rgba(0,0,0,0.07)" />

          {/* ══════════════════════════════════════════════════════
              KICK DRUM BARREL — aerial top-view, decorative only.
              The large cylinder you see behind everything else.
              Shell → colored wrap band → batter head (dark).
          ══════════════════════════════════════════════════════ */}

          {/* Floor shadow under barrel */}
          <ellipse cx={KX} cy={KY + 10} rx={KR + 8} ry={14} fill="rgba(0,0,0,0.22)" />

          {/* Outer shell (darkest ring) */}
          <circle cx={KX} cy={KY} r={KR} fill={SHELL} opacity={0.97} />

          {/* Colored wrap visible as a band */}
          <circle cx={KX} cy={KY} r={KR}     fill="var(--c)" opacity={0.40} />
          <circle cx={KX} cy={KY} r={KR - 7} fill={SHELL}   opacity={0.88} />

          {/* Lug bolts (10-count on a large drum) */}
          {Array.from({ length: 10 }, (_, i) => {
            const rad = ((360 / 10) * i - 90) * Math.PI / 180
            return <circle key={i}
              cx={KX + Math.cos(rad) * (KR + 2)} cy={KY + Math.sin(rad) * (KR + 2)}
              r={5.5} fill={LUG} />
          })}

          {/* Batter head — dark, you're looking at the front head from above */}
          <circle cx={KX} cy={KY} r={KR - 10} fill="#0d0d1a" />
          <circle cx={KX} cy={KY} r={KR - 15} fill="#101018" />

          {/* Reso port ring */}
          <circle cx={KX} cy={KY} r={28} fill="#1a1a28" />
          <circle cx={KX} cy={KY} r={22} fill="var(--c)" opacity={0.12} />

          {/* Subtle "KICK" label on the head */}
          <text x={KX} y={KY + 5} textAnchor="middle" fontSize={10}
            fill="rgba(255,255,255,0.16)" fontFamily="system-ui,sans-serif"
            letterSpacing={3} fontWeight={500}
            style={{ userSelect: 'none', pointerEvents: 'none' }}>
            KICK
          </text>

          {/* Tom mount hardware on top of shell */}
          <rect x={KX - 20} y={KY - KR - 2} width={14} height={9} rx={2} fill={LUG} opacity={0.65} />
          <rect x={KX + 6}  y={KY - KR - 2} width={14} height={9} rx={2} fill={LUG} opacity={0.65} />

          {/* ══════════════════════════════════════════════════════
              KICK PEDAL — the interactive element that fires kick.
              Aerial view: footboard rectangle below the barrel.
              Beater arm connects footboard cam to kick head.
          ══════════════════════════════════════════════════════ */}

          {/* Beater arm */}
          <line x1={PX} y1={KY + KR - 2} x2={PX} y2={PY - 30}
            stroke="#4a4a5a" strokeWidth={3.5} strokeLinecap="round" />

          {/* Cam wheel (top of pedal arm) */}
          <circle cx={PX} cy={KY + KR + 6} r={8} fill="#3e3e50" />
          <circle cx={PX} cy={KY + KR + 6} r={3.5} fill="#606070" />

          {/* Chain links */}
          {Array.from({ length: 5 }, (_, i) => (
            <rect key={i} x={PX - 3.5} y={KY + KR + 16 + i * 9}
              width={7} height={5} rx={1} fill="#424254" opacity={0.85} />
          ))}

          {/* Footboard — the tappable element */}
          <g
            id="kick"
            data-kind="pedal"
            style={{ cursor: 'pointer' }}
          >
            {/* Board drop shadow */}
            <rect x={PX - 28} y={PY - 26} width={56} height={54} rx={6} fill="rgba(0,0,0,0.28)" />
            {/* Board body */}
            <rect x={PX - 27} y={PY - 27} width={54} height={52} rx={5} fill="#38384c" />
            {/* Non-slip grip texture */}
            {[-12, -5, 2, 9, 16].map((offset, i) => (
              <line key={i}
                x1={PX - 18} y1={PY - 8 + offset}
                x2={PX + 18} y2={PY - 8 + offset}
                stroke="#50506a" strokeWidth={1.5} />
            ))}
            {/* Hinge bar at board top */}
            <rect x={PX - 25} y={PY - 29} width={50} height={6} rx={3} fill="#50506a" />
            {/* Toe clamp bar at bottom */}
            <rect x={PX - 15} y={PY + 21} width={30} height={5} rx={2} fill="#50506a" />
            {/* Flash overlay */}
            <rect id="kick-flash" x={PX - 27} y={PY - 27} width={54} height={52} rx={5}
              fill="white" opacity={0} style={{ pointerEvents: 'none' }} />
            {/* Label below pedal */}
            <text x={PX} y={PY + 42} textAnchor="middle" fontSize={8}
              fill="rgba(0,0,0,0.28)" fontFamily="system-ui,sans-serif" letterSpacing={1.5}
              style={{ pointerEvents: 'none', userSelect: 'none' }}>
              PEDAL
            </text>
          </g>

          {/* ══════════════════════════════════════════════════════
              HI-HAT — far left, stacked pair
              Bottom plate slightly offset below top plate.
          ══════════════════════════════════════════════════════ */}

          {/* Stand rod and base */}
          <line x1={112} y1={295} x2={112} y2={318} stroke="#555" strokeWidth={2.5} opacity={0.5} />
          <ellipse cx={112} cy={322} rx={13} ry={5.5} fill="#444" opacity={0.5} />

          <g id="hihat" data-kind="cymbal" style={{ cursor: 'pointer' }}>
            {/* Bottom plate */}
            <ellipse cx={112} cy={274} rx={50} ry={47} fill={GOLD} opacity={0.66} />
            {/* Top plate */}
            <ellipse cx={112} cy={269} rx={50} ry={47} fill={GOLD} opacity={0.93} />
            <Grooves cx={112} cy={269} rOuter={44} n={5} />
            <ellipse cx={112} cy={269} rx={13} ry={12} fill={GOLD_BELL} />
            <ellipse cx={112} cy={269} rx={5.5} ry={5} fill={GOLD_HI} opacity={0.7} />
            {/* Bottom plate edge peek */}
            <ellipse cx={112} cy={274} rx={50} ry={47} fill="none" stroke="#906c14" strokeWidth={1.8} opacity={0.42} />
            <ellipse id="hihat-flash" cx={112} cy={269} rx={50} ry={47} fill="white" opacity={0} style={{ pointerEvents: 'none' }} />
            <text x={112} y={222} textAnchor="middle" fontSize={8} fill="rgba(0,0,0,0.28)"
              fontFamily="system-ui,sans-serif" letterSpacing={1.5}
              style={{ pointerEvents: 'none', userSelect: 'none' }}>HI-HAT</text>
          </g>

          {/* ══════════════════════════════════════════════════════
              SNARE — front-left, between hi-hat and kick
          ══════════════════════════════════════════════════════ */}

          <g id="snare" data-kind="drum" style={{ cursor: 'pointer' }}>
            <circle cx={215} cy={315} r={43} fill={SHELL} opacity={0.95} />
            <Lugs cx={215} cy={315} r={43} count={8} />
            <circle cx={215} cy={315} r={35} fill={HEAD} />
            {/* Snare wire strands */}
            {[-12, -6, 0, 6, 12, -18, 18].map((off, i) => (
              <line key={i} x1={180} y1={315 + off} x2={250} y2={315 + off}
                stroke={WIRE} strokeWidth={off % 6 === 0 ? 1.1 : 0.75} />
            ))}
            <circle id="snare-flash" cx={215} cy={315} r={43} fill="white" opacity={0} style={{ pointerEvents: 'none' }} />
            <text x={215} y={370} textAnchor="middle" fontSize={8} fill="rgba(0,0,0,0.28)"
              fontFamily="system-ui,sans-serif" letterSpacing={1.5}
              style={{ pointerEvents: 'none', userSelect: 'none' }}>SNARE</text>
          </g>

          {/* ══════════════════════════════════════════════════════
              RACK TOMS — mounted above kick via tom-mount arms
          ══════════════════════════════════════════════════════ */}

          {/* Tom mount arms from kick hardware */}
          <line x1={KX - 13} y1={KY - KR} x2={273} y2={158} stroke={LUG} strokeWidth={4.5} strokeLinecap="round" opacity={0.55} />
          <line x1={KX + 13} y1={KY - KR} x2={375} y2={144} stroke={LUG} strokeWidth={4.5} strokeLinecap="round" opacity={0.55} />

          <Tom id="tom-hi"  cx={272} cy={154} r={34} label="HIGH TOM" />
          <Tom id="tom-mid" cx={377} cy={140} r={34} label="MID TOM" />

          {/* ══════════════════════════════════════════════════════
              LOW TOM — floor tom, right side, on its own legs
          ══════════════════════════════════════════════════════ */}

          {/* Floor tom legs (3 legs visible from above) */}
          {[[-28, 20], [28, 20], [0, -28]].map(([dx, dy], i) => (
            <line key={i}
              x1={545 + dx * 0.4} y1={292 + dy * 0.4}
              x2={545 + dx} y2={292 + dy + 32}
              stroke="#555" strokeWidth={3} strokeLinecap="round" opacity={0.5} />
          ))}

          <Tom id="tom-lo" cx={545} cy={278} r={52} label="LOW TOM" />

          {/* ══════════════════════════════════════════════════════
              CYMBALS — China, Crash, Ride, Splash
              Each on a stand; stands shown as short rods.
          ══════════════════════════════════════════════════════ */}

          {/* Stand rods (decorative) */}
          <line x1={82}  y1={98}  x2={82}  y2={122} stroke="#555" strokeWidth={2} opacity={0.38} />
          <line x1={200} y1={78}  x2={200} y2={102} stroke="#555" strokeWidth={2} opacity={0.38} />
          <line x1={502} y1={94}  x2={502} y2={120} stroke="#555" strokeWidth={2} opacity={0.38} />
          <line x1={614} y1={150} x2={614} y2={172} stroke="#555" strokeWidth={2} opacity={0.38} />

          {/* China — far upper-left */}
          <China id="china" cx={82} cy={78} rx={50} label="CHINA" />

          {/* Crash — upper-left center */}
          <Cymbal id="crash" cx={214} cy={76} rx={64} ry={59} bellR={13} label="CRASH" />

          {/* Ride — upper-right, largest */}
          <Cymbal id="ride" cx={500} cy={96} rx={74} ry={69} bellR={16} label="RIDE" />

          {/* Splash — far upper-right, smallest */}
          <Cymbal id="splash" cx={615} cy={155} rx={36} ry={33} bellR={7} label="SPLASH" />

          {/* Ripple layer — always rendered on top */}
          <g ref={rippleLayer} style={{ pointerEvents: 'none' }} />
        </svg>

        {/* Beat demo button */}
        <button
          onClick={toggleBeat}
          title="Play a beat"
          style={{
            position: 'absolute',
            right: 0,
            bottom: 56,
            width: 48,
            height: 48,
            borderRadius: '50%',
            border: '1.5px solid rgba(255,255,255,0.18)',
            background: 'rgba(255,255,255,0.05)',
            color: 'inherit',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backdropFilter: 'blur(4px)',
            transition: 'border-color 0.15s, background 0.15s',
          }}
          onMouseEnter={e => {
            e.currentTarget.style.background = 'rgba(255,255,255,0.1)'
            e.currentTarget.style.borderColor = 'rgba(255,255,255,0.35)'
          }}
          onMouseLeave={e => {
            e.currentTarget.style.background = 'rgba(255,255,255,0.05)'
            e.currentTarget.style.borderColor = 'rgba(255,255,255,0.18)'
          }}
        >
          <svg id="beat-play" width={14} height={14} viewBox="0 0 16 16" fill="currentColor">
            <path d="M4 3l10 5-10 5V3z" />
          </svg>
          <svg id="beat-stop" width={14} height={14} viewBox="0 0 16 16" fill="currentColor" style={{ display: 'none' }}>
            <rect x={3} y={3} width={4} height={10} rx={1} />
            <rect x={9} y={3} width={4} height={10} rx={1} />
          </svg>
        </button>
      </div>

      {/* Keyboard shortcut strip */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px 18px', justifyContent: 'center', marginTop: 12, padding: '0 8px' }}>
        {PIECES.map(p => (
          <span key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10, letterSpacing: '1.2px', textTransform: 'uppercase', opacity: 0.5 }}>
            <span style={{ background: 'rgba(255,255,255,0.08)', border: '0.5px solid rgba(255,255,255,0.18)', borderRadius: 3, padding: '1px 5px', fontFamily: 'monospace', fontSize: 10 }}>
              {p.keyLabel}
            </span>
            {p.label}
          </span>
        ))}
      </div>
    </div>
  )
}
