import { useEffect, useRef, useState } from 'react'

type InstrumentTheme = 'piano' | 'guitar' | 'vocals' | 'drums'

interface InstrumentAtmosphereProps {
  theme: InstrumentTheme
}

// ═══════════════════════════════════════
// THEME CONFIGS
// ═══════════════════════════════════════

interface BlobConfig {
  color1: string
  color2: string
  opacity1: number
  opacity2: number
}

interface SymbolConfig {
  type: 'char' | 'svg'
  content: string
  top: string
  left: string
  size: number
  mobileSize: number
  opacity: number
  rotation: number
  duration: number
  delay: number
  driftY: number
  driftX: number
  rotDrift: number
}

const BLOBS: Record<InstrumentTheme, BlobConfig> = {
  piano:  { color1: '#A333FF', color2: '#6600CC', opacity1: 0.09, opacity2: 0.06 },
  guitar: { color1: '#D4226A', color2: '#FF5500', opacity1: 0.08, opacity2: 0.05 },
  vocals: { color1: '#FFB800', color2: '#FF5500', opacity1: 0.07, opacity2: 0.05 },
  drums:  { color1: '#FF5500', color2: '#FFB800', opacity1: 0.08, opacity2: 0.06 },
}

// ── SVG builders ──

const pianoKeySvg = `<svg viewBox="0 0 30 40" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="0.5" y="0.5" width="9" height="39" rx="1" stroke="rgba(255,255,255,0.10)"/><rect x="10.5" y="0.5" width="9" height="39" rx="1" stroke="rgba(255,255,255,0.10)"/><rect x="20.5" y="0.5" width="9" height="39" rx="1" stroke="rgba(255,255,255,0.10)"/><rect x="6.5" y="0.5" width="6" height="24" rx="1" fill="rgba(255,255,255,0.06)" stroke="rgba(255,255,255,0.10)"/><rect x="17.5" y="0.5" width="6" height="24" rx="1" fill="rgba(255,255,255,0.06)" stroke="rgba(255,255,255,0.10)"/></svg>`

const stratSvg = `<svg viewBox="0 0 40 80" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M20 2c8 0 14 6 16 14s-2 12-6 16c4 4 8 10 8 18s-4 16-10 22c-4 4-8 6-8 6s-4-2-8-6c-6-6-10-14-10-22s4-14 8-18c-4-4-8-8-6-16S12 2 20 2z" stroke="rgba(255,255,255,0.12)" stroke-width="1.2"/></svg>`

const flyingVSvg = `<svg viewBox="0 0 44 70" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M22 68L2 2h10l10 40L32 2h10L22 68z" stroke="rgba(255,255,255,0.12)" stroke-width="1.2"/></svg>`

const lesPaulSvg = `<svg viewBox="0 0 36 72" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M18 2c7 0 13 5 14 12s-3 12-6 15c3 3 8 10 8 19s-5 14-10 18c-3 3-6 4-6 4s-3-1-6-4C7 62 2 55 2 48s5-16 8-19c-3-3-7-8-6-15S11 2 18 2z" stroke="rgba(255,255,255,0.12)" stroke-width="1.2"/></svg>`

const pickSvg = `<svg viewBox="0 0 16 20" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M8 18L1.5 5A6.5 6.5 0 0 1 8 1a6.5 6.5 0 0 1 6.5 4L8 18z" stroke="rgba(255,255,255,0.12)" stroke-width="1.2" stroke-linejoin="round"/></svg>`

const micSvg = `<svg viewBox="0 0 20 50" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="5" y="1" width="10" height="20" rx="5" stroke="rgba(255,255,255,0.10)" stroke-width="1.2"/><path d="M2 18a8 8 0 0 0 16 0" stroke="rgba(255,255,255,0.10)" stroke-width="1.2" fill="none"/><line x1="10" y1="26" x2="10" y2="44" stroke="rgba(255,255,255,0.10)" stroke-width="1.2"/><line x1="5" y1="44" x2="15" y2="44" stroke="rgba(255,255,255,0.10)" stroke-width="1.2"/></svg>`

const soundWaveSvg = `<svg viewBox="0 0 36 28" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M4 14a10 10 0 0 1 10-10" stroke="rgba(255,255,255,0.10)" stroke-width="1.2"/><path d="M4 14a16 16 0 0 1 16-13" stroke="rgba(255,255,255,0.10)" stroke-width="1.2"/><path d="M4 14a22 22 0 0 1 22-13" stroke="rgba(255,255,255,0.10)" stroke-width="1.2"/></svg>`

const speechBubbleSvg = `<svg viewBox="0 0 28 24" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="1" y="1" width="26" height="18" rx="6" stroke="rgba(255,255,255,0.10)" stroke-width="1.2"/><path d="M8 19l-3 4 6-4" stroke="rgba(255,255,255,0.10)" stroke-width="1.2"/></svg>`

const drumCircleSvg = `<svg viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="18" cy="18" r="16" stroke="rgba(255,255,255,0.10)" stroke-width="1.2"/><ellipse cx="18" cy="18" rx="12" ry="6" stroke="rgba(255,255,255,0.10)" stroke-width="1"/></svg>`

const drumstickSvg = `<svg viewBox="0 0 8 40" fill="none" xmlns="http://www.w3.org/2000/svg"><line x1="4" y1="6" x2="4" y2="38" stroke="rgba(255,255,255,0.10)" stroke-width="1.8" stroke-linecap="round"/><ellipse cx="4" cy="4" rx="2.5" ry="3.5" stroke="rgba(255,255,255,0.10)" stroke-width="1"/></svg>`

const hihatSvg = `<svg viewBox="0 0 32 16" fill="none" xmlns="http://www.w3.org/2000/svg"><ellipse cx="16" cy="6" rx="15" ry="5" stroke="rgba(255,255,255,0.10)" stroke-width="1.2"/><ellipse cx="16" cy="10" rx="15" ry="5" stroke="rgba(255,255,255,0.10)" stroke-width="1.2"/></svg>`

// ── Symbol definitions per theme ──

function makeSymbols(theme: InstrumentTheme): SymbolConfig[] {
  if (theme === 'piano') return [
    { type:'svg', content:pianoKeySvg, top:'6%',  left:'10%', size:32, mobileSize:20, opacity:0.07, rotation:5,   duration:32, delay:0,  driftY:28, driftX:8,  rotDrift:6 },
    { type:'svg', content:pianoKeySvg, top:'22%', left:'82%', size:32, mobileSize:20, opacity:0.05, rotation:-10, duration:38, delay:4,  driftY:24, driftX:-6, rotDrift:-5 },
    { type:'svg', content:pianoKeySvg, top:'48%', left:'5%',  size:32, mobileSize:20, opacity:0.06, rotation:12,  duration:28, delay:8,  driftY:32, driftX:10, rotDrift:8 },
    { type:'svg', content:pianoKeySvg, top:'68%', left:'90%', size:32, mobileSize:20, opacity:0.04, rotation:-8,  duration:42, delay:12, driftY:20, driftX:-8, rotDrift:-4 },
    { type:'svg', content:pianoKeySvg, top:'82%', left:'35%', size:32, mobileSize:20, opacity:0.06, rotation:3,   duration:36, delay:16, driftY:26, driftX:6,  rotDrift:5 },
    { type:'svg', content:pianoKeySvg, top:'38%', left:'60%', size:32, mobileSize:20, opacity:0.05, rotation:-14, duration:30, delay:20, driftY:30, driftX:-10,rotDrift:-7 },
    { type:'char', content:'♩', top:'14%', left:'42%', size:32, mobileSize:24, opacity:0.06, rotation:0,  duration:34, delay:2,  driftY:30, driftX:8,  rotDrift:6 },
    { type:'char', content:'♪', top:'35%', left:'74%', size:44, mobileSize:28, opacity:0.05, rotation:0,  duration:40, delay:6,  driftY:26, driftX:-6, rotDrift:-5 },
    { type:'char', content:'♫', top:'58%', left:'28%', size:36, mobileSize:24, opacity:0.07, rotation:0,  duration:26, delay:10, driftY:34, driftX:10, rotDrift:7 },
    { type:'char', content:'♬', top:'76%', left:'66%', size:28, mobileSize:24, opacity:0.04, rotation:0,  duration:44, delay:14, driftY:22, driftX:-8, rotDrift:-4 },
    { type:'char', content:'𝄞', top:'10%', left:'62%', size:48, mobileSize:32, opacity:0.05, rotation:0,  duration:38, delay:18, driftY:28, driftX:6,  rotDrift:5 },
    { type:'char', content:'𝄞', top:'88%', left:'16%', size:36, mobileSize:32, opacity:0.06, rotation:0,  duration:30, delay:22, driftY:32, driftX:-10,rotDrift:-8 },
  ]
  if (theme === 'guitar') return [
    { type:'svg', content:stratSvg,    top:'5%',  left:'8%',  size:40, mobileSize:24, opacity:0.07, rotation:10,  duration:34, delay:0,  driftY:30, driftX:8,  rotDrift:6 },
    { type:'svg', content:stratSvg,    top:'40%', left:'85%', size:40, mobileSize:24, opacity:0.05, rotation:-15, duration:40, delay:6,  driftY:26, driftX:-10,rotDrift:-5 },
    { type:'svg', content:stratSvg,    top:'72%', left:'20%', size:40, mobileSize:24, opacity:0.06, rotation:5,   duration:28, delay:12, driftY:34, driftX:6,  rotDrift:7 },
    { type:'svg', content:flyingVSvg,  top:'18%', left:'70%', size:44, mobileSize:26, opacity:0.05, rotation:-8,  duration:44, delay:4,  driftY:24, driftX:-8, rotDrift:-4 },
    { type:'svg', content:flyingVSvg,  top:'60%', left:'50%', size:44, mobileSize:26, opacity:0.04, rotation:12,  duration:36, delay:16, driftY:28, driftX:10, rotDrift:8 },
    { type:'svg', content:lesPaulSvg,  top:'30%', left:'14%', size:36, mobileSize:22, opacity:0.06, rotation:-6,  duration:32, delay:8,  driftY:32, driftX:-6, rotDrift:-6 },
    { type:'svg', content:lesPaulSvg,  top:'85%', left:'76%', size:36, mobileSize:22, opacity:0.05, rotation:8,   duration:48, delay:20, driftY:20, driftX:8,  rotDrift:5 },
    { type:'char', content:'♪', top:'12%', left:'48%', size:34, mobileSize:20, opacity:0.06, rotation:0, duration:30, delay:2,  driftY:28, driftX:6,  rotDrift:5 },
    { type:'char', content:'♫', top:'52%', left:'36%', size:28, mobileSize:20, opacity:0.05, rotation:0, duration:38, delay:10, driftY:26, driftX:-8, rotDrift:-7 },
    { type:'char', content:'♬', top:'78%', left:'62%', size:24, mobileSize:20, opacity:0.07, rotation:0, duration:26, delay:18, driftY:30, driftX:10, rotDrift:6 },
    { type:'svg', content:pickSvg,     top:'24%', left:'92%', size:16, mobileSize:12, opacity:0.08, rotation:15,  duration:22, delay:14, driftY:24, driftX:-6, rotDrift:-8 },
    { type:'svg', content:pickSvg,     top:'66%', left:'6%',  size:16, mobileSize:12, opacity:0.06, rotation:-20, duration:42, delay:22, driftY:32, driftX:8,  rotDrift:5 },
  ]
  if (theme === 'vocals') return [
    { type:'svg', content:micSvg,          top:'8%',  left:'12%', size:24, mobileSize:16, opacity:0.07, rotation:5,   duration:32, delay:0,  driftY:28, driftX:8,  rotDrift:6 },
    { type:'svg', content:micSvg,          top:'34%', left:'80%', size:24, mobileSize:16, opacity:0.05, rotation:-10, duration:38, delay:6,  driftY:24, driftX:-6, rotDrift:-5 },
    { type:'svg', content:micSvg,          top:'58%', left:'22%', size:24, mobileSize:16, opacity:0.06, rotation:8,   duration:26, delay:12, driftY:34, driftX:10, rotDrift:7 },
    { type:'svg', content:micSvg,          top:'82%', left:'68%', size:24, mobileSize:16, opacity:0.04, rotation:-12, duration:42, delay:18, driftY:20, driftX:-8, rotDrift:-4 },
    { type:'svg', content:soundWaveSvg,    top:'20%', left:'56%', size:36, mobileSize:24, opacity:0.06, rotation:0,   duration:34, delay:4,  driftY:26, driftX:6,  rotDrift:5 },
    { type:'svg', content:soundWaveSvg,    top:'70%', left:'40%', size:36, mobileSize:24, opacity:0.05, rotation:15,  duration:40, delay:16, driftY:30, driftX:-10,rotDrift:-6 },
    { type:'char', content:'♩', top:'14%', left:'44%', size:30, mobileSize:22, opacity:0.06, rotation:0, duration:28, delay:2,  driftY:28, driftX:8,  rotDrift:6 },
    { type:'char', content:'♪', top:'42%', left:'8%',  size:40, mobileSize:26, opacity:0.05, rotation:0, duration:36, delay:8,  driftY:32, driftX:-6, rotDrift:-5 },
    { type:'char', content:'♫', top:'62%', left:'88%', size:34, mobileSize:22, opacity:0.07, rotation:0, duration:22, delay:10, driftY:26, driftX:10, rotDrift:7 },
    { type:'char', content:'♬', top:'86%', left:'30%', size:26, mobileSize:22, opacity:0.04, rotation:0, duration:40, delay:14, driftY:24, driftX:-8, rotDrift:-4 },
    { type:'svg', content:speechBubbleSvg, top:'26%', left:'34%', size:28, mobileSize:18, opacity:0.05, rotation:-5,  duration:30, delay:20, driftY:30, driftX:6,  rotDrift:5 },
    { type:'svg', content:speechBubbleSvg, top:'76%', left:'74%', size:28, mobileSize:18, opacity:0.06, rotation:8,   duration:36, delay:22, driftY:22, driftX:-10,rotDrift:-8 },
  ]
  // drums
  return [
    { type:'svg', content:drumCircleSvg, top:'6%',  left:'14%', size:36, mobileSize:22, opacity:0.07, rotation:0,   duration:22, delay:0,  driftY:32, driftX:12, rotDrift:6 },
    { type:'svg', content:drumCircleSvg, top:'44%', left:'82%', size:36, mobileSize:22, opacity:0.05, rotation:0,   duration:28, delay:6,  driftY:28, driftX:-14,rotDrift:-5 },
    { type:'svg', content:drumCircleSvg, top:'78%', left:'38%', size:36, mobileSize:22, opacity:0.06, rotation:0,   duration:18, delay:12, driftY:36, driftX:10, rotDrift:7 },
    { type:'svg', content:drumstickSvg,  top:'16%', left:'56%', size:40, mobileSize:24, opacity:0.06, rotation:30,  duration:24, delay:2,  driftY:30, driftX:14, rotDrift:8 },
    { type:'svg', content:drumstickSvg,  top:'34%', left:'6%',  size:40, mobileSize:24, opacity:0.05, rotation:-25, duration:32, delay:8,  driftY:26, driftX:-12,rotDrift:-6 },
    { type:'svg', content:drumstickSvg,  top:'62%', left:'70%', size:40, mobileSize:24, opacity:0.07, rotation:45,  duration:20, delay:14, driftY:34, driftX:10, rotDrift:5 },
    { type:'svg', content:drumstickSvg,  top:'88%', left:'24%', size:40, mobileSize:24, opacity:0.04, rotation:-40, duration:30, delay:20, driftY:24, driftX:-8, rotDrift:-7 },
    { type:'svg', content:hihatSvg,      top:'22%', left:'36%', size:32, mobileSize:20, opacity:0.05, rotation:10,  duration:26, delay:4,  driftY:28, driftX:12, rotDrift:6 },
    { type:'svg', content:hihatSvg,      top:'70%', left:'88%', size:32, mobileSize:20, opacity:0.06, rotation:-8,  duration:34, delay:16, driftY:30, driftX:-14,rotDrift:-8 },
    { type:'char', content:'♪', top:'10%', left:'78%', size:30, mobileSize:20, opacity:0.06, rotation:0, duration:18, delay:3,  driftY:32, driftX:14, rotDrift:7 },
    { type:'char', content:'♫', top:'52%', left:'48%', size:36, mobileSize:24, opacity:0.05, rotation:0, duration:24, delay:10, driftY:28, driftX:-12,rotDrift:-5 },
    { type:'char', content:'♬', top:'84%', left:'62%', size:24, mobileSize:20, opacity:0.07, rotation:0, duration:16, delay:18, driftY:36, driftX:10, rotDrift:8 },
  ]
}

// ═══════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════

export default function InstrumentAtmosphere({ theme }: InstrumentAtmosphereProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const rafRef = useRef<number | null>(null)
  const [isMobile, setIsMobile] = useState(false)

  const blob = BLOBS[theme]
  const allSymbols = makeSymbols(theme)

  // Detect mobile once on mount + resize
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  const symbols = isMobile ? allSymbols.slice(0, 6) : allSymbols
  const particleCount = isMobile ? 18 : 35
  const durationMult = isMobile ? 1.3 : 1

  // ── Canvas particles ──
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    let width = window.innerWidth
    let height = window.innerHeight

    const resize = () => {
      width = window.innerWidth
      height = window.innerHeight
      canvas.width = width * dpr
      canvas.height = height * dpr
      canvas.style.width = `${width}px`
      canvas.style.height = `${height}px`
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()

    type Particle = { x: number; y: number; r: number; vy: number; opacity: number }
    const count = window.innerWidth < 768 ? 18 : 35
    const particles: Particle[] = Array.from({ length: count }, () => ({
      x: Math.random() * width,
      y: Math.random() * height,
      r: 1 + Math.random() * 1.5,
      vy: 0.2 + Math.random() * 0.4,
      opacity: 0.1 + Math.random() * 0.2,
    }))

    const tick = () => {
      if (document.hidden) {
        rafRef.current = requestAnimationFrame(tick)
        return
      }
      ctx.clearRect(0, 0, width, height)
      for (const p of particles) {
        p.y -= p.vy
        if (p.y < -5) {
          p.y = height + 5
          p.x = Math.random() * width
        }
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(255,255,255,${p.opacity})`
        ctx.fill()
      }
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)

    window.addEventListener('resize', resize)
    return () => {
      window.removeEventListener('resize', resize)
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current)
    }
  }, [particleCount])

  // ── Build keyframes for symbol drift ──
  const keyframesCSS = symbols.map((s, i) => {
    const dur = Math.round(s.duration * durationMult)
    return `@keyframes ia-drift-${theme}-${i} {
  0%, 100% { transform: translate(0, 0) rotate(${s.rotation}deg); }
  50% { transform: translate(${s.driftX}px, ${-s.driftY}px) rotate(${s.rotation + s.rotDrift}deg); }
}`
  }).join('\n')

  const blobKeyframes = `
@keyframes ia-blob-a-${theme} {
  0%   { transform: translate(0, 0); opacity: ${blob.opacity1}; }
  50%  { transform: translate(40px, -30px); opacity: ${Math.min(blob.opacity1 + 0.08, 0.20)}; }
  100% { transform: translate(0, 0); opacity: ${blob.opacity1}; }
}
@keyframes ia-blob-b-${theme} {
  0%   { transform: translate(0, 0); opacity: ${blob.opacity2}; }
  50%  { transform: translate(-30px, 25px); opacity: ${Math.min(blob.opacity2 + 0.08, 0.18)}; }
  100% { transform: translate(0, 0); opacity: ${blob.opacity2}; }
}`

  return (
    <>
      <style>{blobKeyframes + '\n' + keyframesCSS}</style>

      <div
        aria-hidden="true"
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 0,
          pointerEvents: 'none',
          overflow: 'hidden',
        }}
      >
        {/* Blob A */}
        <svg
          width="600"
          height="600"
          viewBox="0 0 600 600"
          style={{
            position: 'absolute',
            top: '20%',
            left: '-10%',
            filter: 'blur(120px)',
            animation: `ia-blob-a-${theme} 25s ease-in-out infinite`,
            willChange: 'transform, opacity',
          }}
        >
          <circle cx="300" cy="300" r="300" fill={blob.color1} />
        </svg>

        {/* Blob B */}
        <svg
          width="500"
          height="500"
          viewBox="0 0 500 500"
          style={{
            position: 'absolute',
            top: '40%',
            right: '-8%',
            filter: 'blur(100px)',
            animation: `ia-blob-b-${theme} 35s ease-in-out infinite`,
            willChange: 'transform, opacity',
          }}
        >
          <circle cx="250" cy="250" r="250" fill={blob.color2} />
        </svg>

        {/* Floating symbols */}
        {symbols.map((s, i) => {
          const dur = Math.round(s.duration * durationMult)
          const sz = isMobile ? s.mobileSize : s.size
          const shared: React.CSSProperties = {
            position: 'absolute',
            top: s.top,
            left: s.left,
            pointerEvents: 'none',
            userSelect: 'none',
            willChange: 'transform',
            animation: `ia-drift-${theme}-${i} ${dur}s ease-in-out infinite`,
            animationDelay: `${s.delay}s`,
            transform: `rotate(${s.rotation}deg)`,
          }

          if (s.type === 'char') {
            return (
              <span
                key={i}
                style={{
                  ...shared,
                  fontSize: sz,
                  color: `rgba(255,255,255,${s.opacity})`,
                  fontFamily: 'serif',
                  lineHeight: 1,
                }}
              >
                {s.content}
              </span>
            )
          }

          return (
            <span
              key={i}
              style={{
                ...shared,
                width: sz,
                height: 'auto',
                display: 'inline-block',
                opacity: s.opacity,
              }}
              dangerouslySetInnerHTML={{ __html: s.content }}
            />
          )
        })}
      </div>

      {/* Canvas particles */}
      <canvas
        ref={canvasRef}
        aria-hidden="true"
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 0,
          pointerEvents: 'none',
        }}
      />
    </>
  )
}
