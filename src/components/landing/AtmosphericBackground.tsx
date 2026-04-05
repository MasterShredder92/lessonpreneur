import { useEffect, useRef } from 'react'

// Deterministic floating note configs — 10 notes, hardcoded positions
const FLOATING_NOTES = [
  { char: '♪', top: '8%',  left: '12%', size: 22, opacity: 0.06, drift: 38, rot: 12,  delay: 0,  duration: 28 },
  { char: '♫', top: '18%', left: '78%', size: 34, opacity: 0.05, drift: 46, rot: -10, delay: 2,  duration: 36 },
  { char: '♩', top: '32%', left: '6%',  size: 18, opacity: 0.07, drift: 32, rot: 8,   delay: 4,  duration: 24 },
  { char: '♬', top: '42%', left: '88%', size: 36, opacity: 0.04, drift: 50, rot: -15, delay: 6,  duration: 40 },
  { char: '♪', top: '55%', left: '22%', size: 26, opacity: 0.06, drift: 34, rot: 15,  delay: 8,  duration: 30 },
  { char: '♫', top: '65%', left: '68%', size: 20, opacity: 0.07, drift: 30, rot: -6,  delay: 10, duration: 22 },
  { char: '♩', top: '74%', left: '44%', size: 28, opacity: 0.05, drift: 42, rot: 10,  delay: 12, duration: 34 },
  { char: '♬', top: '85%', left: '14%', size: 14, opacity: 0.07, drift: 30, rot: -12, delay: 14, duration: 26 },
  { char: '♪', top: '12%', left: '48%', size: 24, opacity: 0.05, drift: 40, rot: 6,   delay: 16, duration: 32 },
  { char: '♫', top: '90%', left: '82%', size: 30, opacity: 0.04, drift: 44, rot: -8,  delay: 18, duration: 38 },
]

const KEYFRAMES = `
@keyframes lp-blob-drift-a {
  0%   { transform: translate(0, 0); opacity: 0.10; }
  50%  { transform: translate(40px, -30px); opacity: 0.18; }
  100% { transform: translate(0, 0); opacity: 0.10; }
}
@keyframes lp-blob-drift-b {
  0%   { transform: translate(0, 0); opacity: 0.06; }
  50%  { transform: translate(-30px, 25px); opacity: 0.14; }
  100% { transform: translate(0, 0); opacity: 0.06; }
}
@keyframes lp-note-drift-0  { 0%,100% { transform: translateY(0) rotate(0deg); } 50% { transform: translateY(-38px) rotate(12deg); } }
@keyframes lp-note-drift-1  { 0%,100% { transform: translateY(0) rotate(0deg); } 50% { transform: translateY(-46px) rotate(-10deg); } }
@keyframes lp-note-drift-2  { 0%,100% { transform: translateY(0) rotate(0deg); } 50% { transform: translateY(-32px) rotate(8deg); } }
@keyframes lp-note-drift-3  { 0%,100% { transform: translateY(0) rotate(0deg); } 50% { transform: translateY(-50px) rotate(-15deg); } }
@keyframes lp-note-drift-4  { 0%,100% { transform: translateY(0) rotate(0deg); } 50% { transform: translateY(-34px) rotate(15deg); } }
@keyframes lp-note-drift-5  { 0%,100% { transform: translateY(0) rotate(0deg); } 50% { transform: translateY(-30px) rotate(-6deg); } }
@keyframes lp-note-drift-6  { 0%,100% { transform: translateY(0) rotate(0deg); } 50% { transform: translateY(-42px) rotate(10deg); } }
@keyframes lp-note-drift-7  { 0%,100% { transform: translateY(0) rotate(0deg); } 50% { transform: translateY(-30px) rotate(-12deg); } }
@keyframes lp-note-drift-8  { 0%,100% { transform: translateY(0) rotate(0deg); } 50% { transform: translateY(-40px) rotate(6deg); } }
@keyframes lp-note-drift-9  { 0%,100% { transform: translateY(0) rotate(0deg); } 50% { transform: translateY(-44px) rotate(-8deg); } }
`

type Particle = {
  x: number
  y: number
  r: number
  vy: number
  opacity: number
}

export default function AtmosphericBackground() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const rafRef = useRef<number | null>(null)

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

    const PARTICLE_COUNT = 50
    const particles: Particle[] = Array.from({ length: PARTICLE_COUNT }, () => ({
      x: Math.random() * width,
      y: Math.random() * height,
      r: 1 + Math.random() * 1.5, // 1 – 2.5 px
      vy: 0.2 + Math.random() * 0.4, // 0.2 – 0.6 px/frame
      opacity: 0.1 + Math.random() * 0.2, // 0.1 – 0.3
    }))

    const tick = () => {
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
  }, [])

  return (
    <>
      <style>{KEYFRAMES}</style>

      {/* Background layer: blobs + notes */}
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
        {/* Drifting glow blob A (pink, left) */}
        <svg
          width="600"
          height="600"
          viewBox="0 0 600 600"
          style={{
            position: 'absolute',
            top: '20%',
            left: '-10%',
            filter: 'blur(120px)',
            animation: 'lp-blob-drift-a 25s ease-in-out infinite',
            willChange: 'transform, opacity',
          }}
        >
          <circle cx="300" cy="300" r="300" fill="#D4226A" />
        </svg>

        {/* Drifting glow blob B (orange, right) */}
        <svg
          width="500"
          height="500"
          viewBox="0 0 500 500"
          style={{
            position: 'absolute',
            top: '40%',
            right: '-8%',
            filter: 'blur(100px)',
            animation: 'lp-blob-drift-b 35s ease-in-out infinite',
            willChange: 'transform, opacity',
          }}
        >
          <circle cx="250" cy="250" r="250" fill="#FF5500" />
        </svg>

        {/* Floating musical notes */}
        {FLOATING_NOTES.map((n, i) => (
          <span
            key={i}
            style={{
              position: 'absolute',
              top: n.top,
              left: n.left,
              fontSize: `${n.size}px`,
              color: `rgba(255,255,255,${n.opacity})`,
              fontFamily: 'serif',
              userSelect: 'none',
              animation: `lp-note-drift-${i} ${n.duration}s ease-in-out infinite`,
              animationDelay: `${n.delay}s`,
              willChange: 'transform',
            }}
          >
            {n.char}
          </span>
        ))}
      </div>

      {/* Particle canvas — fixed full viewport */}
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
