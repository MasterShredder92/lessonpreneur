import { useEffect, useRef } from 'react'

// Stable (deterministic) floating note configs — 10 notes
const FLOATING_NOTES = [
  { char: '♪', top: '8%',  left: '12%', size: 22, delay: 0,   duration: 28 },
  { char: '♫', top: '18%', left: '78%', size: 34, delay: 4,   duration: 36 },
  { char: '♩', top: '32%', left: '6%',  size: 18, delay: 8,   duration: 32 },
  { char: '♬', top: '42%', left: '88%', size: 40, delay: 2,   duration: 40 },
  { char: '♪', top: '55%', left: '22%', size: 26, delay: 12,  duration: 30 },
  { char: '♫', top: '65%', left: '68%', size: 20, delay: 6,   duration: 34 },
  { char: '♩', top: '74%', left: '44%', size: 30, delay: 10,  duration: 38 },
  { char: '♬', top: '85%', left: '14%', size: 16, delay: 14,  duration: 26 },
  { char: '♪', top: '12%', left: '48%', size: 24, delay: 16,  duration: 42 },
  { char: '♫', top: '90%', left: '82%', size: 28, delay: 18,  duration: 36 },
]

const KEYFRAMES = `
@keyframes lp-blob-drift-a {
  0%   { transform: translate(0, 0) scale(1); opacity: 0.12; }
  25%  { transform: translate(60px, -40px) scale(1.05); opacity: 0.16; }
  50%  { transform: translate(90px, 30px) scale(0.98); opacity: 0.10; }
  75%  { transform: translate(20px, 60px) scale(1.03); opacity: 0.14; }
  100% { transform: translate(0, 0) scale(1); opacity: 0.12; }
}
@keyframes lp-blob-drift-b {
  0%   { transform: translate(0, 0) scale(1); opacity: 0.08; }
  25%  { transform: translate(-70px, 50px) scale(1.04); opacity: 0.12; }
  50%  { transform: translate(-30px, -60px) scale(0.96); opacity: 0.14; }
  75%  { transform: translate(40px, -20px) scale(1.02); opacity: 0.09; }
  100% { transform: translate(0, 0) scale(1); opacity: 0.08; }
}
@keyframes lp-note-float {
  0%   { transform: translate(0, 0) rotate(0deg); }
  25%  { transform: translate(14px, -20px) rotate(8deg); }
  50%  { transform: translate(-8px, -40px) rotate(-6deg); }
  75%  { transform: translate(10px, -24px) rotate(4deg); }
  100% { transform: translate(0, 0) rotate(0deg); }
}
`

type Particle = {
  x: number
  y: number
  r: number
  vy: number
  vx: number
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
      r: 1 + Math.random() * 2,
      vy: 0.15 + Math.random() * 0.35,
      vx: (Math.random() - 0.5) * 0.1,
      opacity: 0.15 + Math.random() * 0.20,
    }))

    const tick = () => {
      ctx.clearRect(0, 0, width, height)
      for (const p of particles) {
        p.y -= p.vy
        p.x += p.vx
        if (p.y < -5) {
          p.y = height + 5
          p.x = Math.random() * width
        }
        if (p.x < -5) p.x = width + 5
        if (p.x > width + 5) p.x = -5
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
      <style>{KEYFRAMES}</style>

      {/* Drifting glow blob A */}
      <svg
        width="600"
        height="600"
        viewBox="0 0 600 600"
        style={{
          position: 'absolute',
          top: '20%',
          left: '-10%',
          filter: 'blur(120px)',
          opacity: 0.12,
          animation: 'lp-blob-drift-a 25s ease-in-out infinite',
          willChange: 'transform, opacity',
        }}
      >
        <circle cx="300" cy="300" r="300" fill="#D4226A" />
      </svg>

      {/* Drifting glow blob B */}
      <svg
        width="500"
        height="500"
        viewBox="0 0 500 500"
        style={{
          position: 'absolute',
          top: '40%',
          right: '-8%',
          filter: 'blur(100px)',
          opacity: 0.08,
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
            color: 'rgba(255,255,255,0.06)',
            fontFamily: 'serif',
            userSelect: 'none',
            animation: `lp-note-float ${n.duration}s ease-in-out infinite`,
            animationDelay: `${n.delay}s`,
            willChange: 'transform',
          }}
        >
          {n.char}
        </span>
      ))}

      {/* Particle canvas */}
      <canvas
        ref={canvasRef}
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
        }}
      />
    </div>
  )
}
