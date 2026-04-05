import { useState, useEffect, useRef, useCallback, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthContext } from '../app/AuthContext'
import StickyRevenueCounter from '../components/public/StickyRevenueCounter'

/* ═══════════════════════════════════════════════════════
   LESSONPRENEUR — LANDING PAGE V2.1
   Mobile-first. Conversion-first. Premium dark-mode.
   Visual overhaul: more breathing room, color hierarchy,
   less text-wall, more visual breaks.
   ═══════════════════════════════════════════════════════ */

const SCHOOL_STRIPE = 'https://buy.stripe.com/7sYdR97CW4Ds46c5tC2ZO01'
const SOLO_STRIPE = 'https://buy.stripe.com/aFabJ16ySgmabyE9JS2ZO02'
const PRO_STRIPE = 'https://buy.stripe.com/dRm3cv3mGfi646c2hq2ZO00'

export default function MarketingLanding() {
  const { profile } = useAuthContext()
  const nav = useNavigate()

  useEffect(() => {
    if (profile) {
      const r: Record<string, string> = { owner: '/admin/dashboard', admin: '/admin/dashboard', teacher: '/teacher/schedule', parent: '/parent/dashboard', student: '/student/practice' }
      nav(r[profile.role] ?? '/admin/dashboard', { replace: true })
    }
  }, [profile, nav])

  if (profile) return null

  return (
    <div className="lp2">
      <Styles />
      <BackgroundOrbs />
      <FloatingParticles />
      <CtaParticleBurst />
      <Nav />
      <Hero />
      <CredibilityStrip />
      <SectionBreak question="When was the last time you followed up on every single lead?" />
      <PainSpiral />
      <SectionBreak question="How much is your current system actually costing you?" />
      <StatusQuoKill />
      <SectionBreak question="What if one system handled all of it?" />
      <IntegrationsSection />
      <CategoryReposition />
      <SectionBreak question="What would your business look like with real infrastructure?" />
      <TransformationCards />
      <SectionBreak question="What if your system was built by someone who already solved these problems?" />
      <BrainSection />
      <SectionBreak question="How many students have you lost without ever knowing why?" />
      <RetentionRoles />
      <AndreaTestimonial />
      <SectionBreak question="What would it be worth to stop the bleeding?" />
      <PricingSection />
      <FinalClose />
      <Footer />
      <StickyRevenueCounter />
    </div>
  )
}

/* ═══════════════════════════════════════════════════════
   GLOBAL ELEMENTS
   ═══════════════════════════════════════════════════════ */

function BackgroundOrbs() {
  return (
    <div className="lp2-orbs" aria-hidden="true">
      <div className="lp2-orb lp2-orb-1" />
      <div className="lp2-orb lp2-orb-2" />
      <div className="lp2-orb lp2-orb-3" />
    </div>
  )
}

function FloatingParticles() {
  const particles = Array.from({ length: 15 }, (_, i) => ({
    id: i,
    left: `${5 + (i * 6.3) % 90}%`,
    top: `${3 + (i * 7.7) % 94}%`,
    delay: `${(i * 2.3) % 20}s`,
    duration: `${35 + (i * 3.1) % 25}s`,
    opacity: 0.08 + (i % 5) * 0.03,
    size: 2 + (i % 3),
  }))
  return (
    <div className="lp2-particles" aria-hidden="true">
      {particles.map(p => (
        <div key={p.id} className="lp2-particle" style={{
          left: p.left, top: p.top,
          animationDelay: p.delay, animationDuration: p.duration,
          opacity: p.opacity, width: p.size, height: p.size,
        }} />
      ))}
    </div>
  )
}

function CtaParticleBurst() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const COLORS = ['#D4226A', '#FF5500', '#FFB800']
    const MAX_PARTICLES = 150
    const GRAVITY = 120
    const particles: { x: number; y: number; vx: number; vy: number; r: number; color: string; life: number; maxLife: number }[] = []
    let animId = 0
    let lastTime = 0

    const resize = () => { canvas.width = window.innerWidth; canvas.height = window.innerHeight }
    resize()
    window.addEventListener('resize', resize)

    const spawn = (x: number, y: number, count: number, speed: number) => {
      for (let i = 0; i < count; i++) {
        const angle = Math.random() * Math.PI * 2
        const v = speed * (0.4 + Math.random() * 0.6)
        if (particles.length >= MAX_PARTICLES) particles.shift()
        particles.push({
          x, y,
          vx: Math.cos(angle) * v,
          vy: Math.sin(angle) * v,
          r: 3 + Math.random() * 3,
          color: COLORS[Math.floor(Math.random() * 3)],
          life: 0.6,
          maxLife: 0.6,
        })
      }
    }

    const handleClick = (e: MouseEvent) => {
      const t = (e.target as Element).closest('.lp2-cta')
      if (t) spawn(e.clientX, e.clientY, 25, 220)
    }
    const hoverSet = new WeakSet<Element>()
    const handleMouseOver = (e: MouseEvent) => {
      const t = (e.target as Element).closest('.lp2-cta')
      if (t && !hoverSet.has(t)) {
        hoverSet.add(t)
        const r = (t as HTMLElement).getBoundingClientRect()
        spawn(r.left + r.width / 2, r.top + r.height / 2, 8, 80)
      }
    }
    const handleMouseOut = (e: MouseEvent) => {
      const t = (e.target as Element).closest('.lp2-cta')
      if (t) hoverSet.delete(t)
    }
    const handleTouch = (e: TouchEvent) => {
      const t = (e.target as Element).closest('.lp2-cta')
      if (t && e.touches[0]) {
        spawn(e.touches[0].clientX, e.touches[0].clientY, 25, 220)
        if (navigator.vibrate) navigator.vibrate(50)
      }
    }

    document.addEventListener('click', handleClick, true)
    document.addEventListener('mouseover', handleMouseOver, true)
    document.addEventListener('mouseout', handleMouseOut, true)
    document.addEventListener('touchstart', handleTouch, { passive: true })

    const loop = (time: number) => {
      const dt = lastTime ? Math.min((time - lastTime) / 1000, 0.05) : 0.016
      lastTime = time
      ctx.clearRect(0, 0, canvas.width, canvas.height)

      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i]
        p.life -= dt
        if (p.life <= 0) { particles.splice(i, 1); continue }
        p.vy += GRAVITY * dt
        p.x += p.vx * dt
        p.y += p.vy * dt
        const alpha = p.life / p.maxLife
        ctx.globalAlpha = alpha
        ctx.fillStyle = p.color
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.r * (0.5 + alpha * 0.5), 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.globalAlpha = 1
      animId = requestAnimationFrame(loop)
    }
    animId = requestAnimationFrame(loop)

    return () => {
      cancelAnimationFrame(animId)
      window.removeEventListener('resize', resize)
      document.removeEventListener('click', handleClick, true)
      document.removeEventListener('mouseover', handleMouseOver, true)
      document.removeEventListener('mouseout', handleMouseOut, true)
      document.removeEventListener('touchstart', handleTouch)
    }
  }, [])

  return <canvas ref={canvasRef} aria-hidden="true" style={{ position: 'fixed', inset: 0, zIndex: 9999, pointerEvents: 'none' }} />
}

function Nav() {
  const [solid, setSolid] = useState(false)
  useEffect(() => {
    const h = () => setSolid(window.scrollY > 40)
    window.addEventListener('scroll', h, { passive: true })
    return () => window.removeEventListener('scroll', h)
  }, [])
  return (
    <nav className={`lp2-nav ${solid ? 'lp2-nav-solid' : ''}`}>
      <div className="lp2-nav-brand"><img src="/lp-logo.png?v=2" alt="" style={{ width: 28, height: 28, borderRadius: 7, verticalAlign: 'middle', marginRight: 8 }} />Lessonpreneur</div>
      <div className="lp2-nav-links">
        <button onClick={() => document.getElementById('features')?.scrollIntoView({ behavior: 'smooth' })}>Features</button>
        <button onClick={() => document.getElementById('pricing')?.scrollIntoView({ behavior: 'smooth' })}>Pricing</button>
      </div>
      <a href={SCHOOL_STRIPE} target="_blank" rel="noopener noreferrer" className="lp2-nav-cta">Start Free Trial</a>
    </nav>
  )
}

function Reveal({ id, children, className = '' }: { id?: string; children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const [v, setV] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const o = new IntersectionObserver(([e]) => { if (e.isIntersecting) setV(true) }, { threshold: 0.1 })
    o.observe(el)
    return () => o.disconnect()
  }, [])
  return <div id={id} ref={ref} className={`lp2-reveal ${v ? 'lp2-visible' : ''} ${className}`}>{children}</div>
}

function SectionBreak({ question }: { question: string }) {
  return (
    <div className="lp2-section-break">
      <div className="lp2-section-divider" />
      <p className="lp2-section-question">{question}</p>
    </div>
  )
}

function CtaButton({ href = SCHOOL_STRIPE, className = '' }: { href?: string; className?: string }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={`lp2-cta ${className}`}>
      Start Your 60-Day Free Trial
    </a>
  )
}

/* ═══════════════════════════════════════════════════════
   SECTION 1: HERO — Large dashboard mockup
   ═══════════════════════════════════════════════════════ */

function HeroDeviceMockups() {
  const LW = 340, LH = 220, BEZ = 8
  const BW = 390, BH = 32
  const PW = 120, PH = 240
  const laptopX = 0, laptopY = 0
  const baseX = laptopX - (BW - LW) / 2, baseY = laptopY + LH
  const phoneX = LW - PW * 0.35, phoneY = 10
  const vbW = phoneX + PW + 10, vbH = baseY + BH + 8

  const lessonRows = [
    { label: 'Sarah M. \u2014 Guitar', color: '#D4226A' },
    { label: 'Jake T. \u2014 Piano', color: '#00A651' },
    { label: 'Emma R. \u2014 Vocals', color: '#A333FF' },
    { label: 'Chris L. \u2014 Drums', color: '#00A5E8' },
  ]
  const students = [
    { i: 'ER', n: 'Emma Rodriguez', m: 'Piano \u00B7 Tue 4PM', c: '#D4226A', s: 'Active', sc: '#00A651' },
    { i: 'NP', n: 'Noah Park', m: 'Guitar \u00B7 Wed 3:30', c: '#FF5500', s: 'Active', sc: '#00A651' },
    { i: 'LT', n: 'Lily Thompson', m: 'Vocals \u00B7 Thu 5PM', c: '#FFB800', s: 'At Risk', sc: '#FF5500' },
    { i: 'JM', n: 'Jake Martinez', m: 'Drums \u00B7 Fri 4:30', c: '#D4226A', s: 'Active', sc: '#00A651' },
  ]

  const sP = 10, sX = laptopX + BEZ, sY = laptopY + BEZ, sW = LW - BEZ * 2, sH = LH - BEZ * 2
  const rH = 22, rG = 4, rSY = sY + sP + 18
  const pSX = phoneX + 4, pSY = phoneY + 28, pSW = PW - 8
  const pRH = 28, pRG = 3, pLSY = pSY + 22

  return (
    <div className="lp2-devmock">
      <style>{`
        .lp2-devmock { width:100%; max-width:420px; margin:0 auto; padding:0 12px; position:relative; z-index:1; }
        @media(min-width:768px){ .lp2-devmock { max-width:520px; flex:1; } }
        .lp2-devmock svg { width:100%; height:auto; display:block; filter:drop-shadow(0 20px 40px rgba(0,0,0,0.5)); }
        .lp2-devmock-tag { text-align:center; margin-top:16px; font-family:'Plus Jakarta Sans',system-ui,sans-serif; font-size:13px; color:rgba(255,255,255,0.6); font-weight:500; }
        @media(min-width:768px){ .lp2-devmock-tag { font-size:15px; } }
        .lp2-devmock-badge { display:flex; align-items:center; justify-content:center; gap:6px; margin:12px auto 0; width:fit-content; padding:6px 16px; border-radius:20px; background:rgba(0,0,0,0.6); border:1px solid rgba(212,34,106,0.4); backdrop-filter:blur(8px); -webkit-backdrop-filter:blur(8px); }
        .lp2-devmock-dot { width:7px; height:7px; border-radius:50%; background:#00A651; box-shadow:0 0 6px #00A651; animation:lp2dp 2s ease-in-out infinite; }
        @keyframes lp2dp { 0%,100%{ opacity:1; box-shadow:0 0 6px #00A651; } 50%{ opacity:.5; box-shadow:0 0 12px #00A651; } }
      `}</style>

      <svg viewBox={`0 0 ${vbW} ${vbH}`} fill="none" xmlns="http://www.w3.org/2000/svg">
        {/* LAPTOP SHELL */}
        <rect x={laptopX} y={laptopY} width={LW} height={LH} rx={6} fill="#1c1c1e" />
        <rect x={sX} y={sY} width={sW} height={sH} rx={3} fill="#020209" />
        <text x={sX + sP} y={sY + sP + 10} fill="#fff" fontSize="9" fontWeight="800" fontFamily="'Plus Jakarta Sans',system-ui,sans-serif">Adkins Music Lessons</text>
        <text x={sX + sW - sP} y={sY + sP + 10} fill="#555" fontSize="7" fontWeight="600" fontFamily="'Plus Jakarta Sans',system-ui,sans-serif" textAnchor="end">Tue, Apr 8</text>
        {lessonRows.map((r, i) => {
          const ry = rSY + i * (rH + rG)
          return (<g key={r.label}>
            <rect x={sX + sP} y={ry} width={sW - sP * 2} height={rH} rx={4} fill={`${r.color}22`} stroke={`${r.color}55`} strokeWidth={1} />
            <text x={sX + sP + 8} y={ry + 14} fill="#fff" fontSize="8" fontWeight="700" fontFamily="'Plus Jakarta Sans',system-ui,sans-serif">{r.label}</text>
          </g>)
        })}
        {(() => { const ry = rSY + lessonRows.length * (rH + rG); return (<g>
          <rect x={sX + sP} y={ry} width={sW - sP * 2} height={rH} rx={4} fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth={1} strokeDasharray="4 3" />
          <text x={sX + sW / 2} y={ry + 14} fill="rgba(255,255,255,0.3)" fontSize="8" fontWeight="600" fontFamily="'Plus Jakarta Sans',system-ui,sans-serif" textAnchor="middle">Open Slot</text>
        </g>) })()}
        {/* KEYBOARD BASE */}
        <rect x={baseX} y={baseY} width={BW} height={BH} rx={4} fill="#1c1c1e" />
        <line x1={baseX + 20} y1={baseY + 1} x2={baseX + BW - 20} y2={baseY + 1} stroke="rgba(255,255,255,0.06)" strokeWidth={1} />
        <rect x={baseX + BW / 2 - 30} y={baseY + 10} width={60} height={14} rx={3} fill="#252528" />

        {/* PHONE */}
        <rect x={phoneX} y={phoneY} width={PW} height={PH} rx={14} fill="#1c1c1e" />
        <rect x={pSX} y={pSY} width={pSW} height={PH - 44} rx={3} fill="#020209" />
        <rect x={phoneX + PW / 2 - 18} y={phoneY + 6} width={36} height={6} rx={3} fill="#020209" />
        <rect x={phoneX + PW / 2 - 16} y={phoneY + PH - 10} width={32} height={4} rx={2} fill="rgba(255,255,255,0.15)" />
        <text x={pSX + 8} y={pSY + 14} fill="#fff" fontSize="9" fontWeight="800" fontFamily="'Plus Jakarta Sans',system-ui,sans-serif">Students</text>
        <text x={pSX + pSW - 6} y={pSY + 14} fill="#555" fontSize="7" fontWeight="500" fontFamily="'Plus Jakarta Sans',system-ui,sans-serif" textAnchor="end">5 active</text>
        {students.map((st, i) => {
          const ry = pLSY + i * (pRH + pRG)
          return (<g key={st.i}>
            <rect x={pSX + 4} y={ry} width={pSW - 8} height={pRH} rx={6} fill="rgba(255,255,255,0.03)" stroke="rgba(255,255,255,0.06)" strokeWidth={0.5} />
            <circle cx={pSX + 16} cy={ry + pRH / 2} r={9} fill={st.c} />
            <text x={pSX + 16} y={ry + pRH / 2 + 3} fill="#fff" fontSize="6" fontWeight="700" fontFamily="'Plus Jakarta Sans',system-ui,sans-serif" textAnchor="middle">{st.i}</text>
            <text x={pSX + 30} y={ry + 11} fill="#fff" fontSize="7" fontWeight="700" fontFamily="'Plus Jakarta Sans',system-ui,sans-serif">{st.n}</text>
            <text x={pSX + 30} y={ry + 21} fill="#555" fontSize="6" fontFamily="'Plus Jakarta Sans',system-ui,sans-serif">{st.m}</text>
            <rect x={pSX + pSW - 34} y={ry + 6} width={26} height={12} rx={3} fill={`${st.sc}18`} />
            <text x={pSX + pSW - 21} y={ry + 15} fill={st.sc} fontSize="5" fontWeight="700" fontFamily="'Plus Jakarta Sans',system-ui,sans-serif" textAnchor="middle">{st.s}</text>
          </g>)
        })}
      </svg>

      <p className="lp2-devmock-tag">Run your studio from anywhere, on any device.</p>
      <div className="lp2-devmock-badge">
        <span className="lp2-devmock-dot" />
        <span style={{ fontSize: 11, color: '#fff', fontWeight: 600, fontFamily: "'Plus Jakarta Sans',system-ui,sans-serif" }}>{'\uD83C\uDFA5'} Virtual Ready</span>
      </div>
    </div>
  )
}

function Hero() {
  return (
    <section className="lp2-hero">
      <div className="lp2-hero-gradient" />
      <div className="lp2-hero-content">
        <div className="lp2-hero-copy">
          <p className="lp2-eyebrow">BUILT FOR SERIOUS MUSIC SCHOOL OWNERS</p>
          <h1 className="lp2-hero-h1">
            Stop Running Your School on Spreadsheets and&nbsp;Hope.
          </h1>
          <p className="lp2-hero-sub">
            The operating system built specifically for music school owners {"\u2014"} manage students, leads, scheduling, and billing without the&nbsp;chaos.
          </p>
          <ul className="lp2-hero-bullets">
            <li>Follow up on every lead automatically</li>
            <li>See retention risks before families disappear</li>
            <li>Run scheduling, billing, and oversight from your phone</li>
          </ul>
          <CtaButton />
          <p className="lp2-hero-risk">No credit card required. 60-day free trial.</p>
          <div className="lp2-hero-quote">
            <div className="lp2-hero-quote-stars">{"\u2605\u2605\u2605\u2605\u2605"}</div>
            <p className="lp2-hero-quote-text">"I built Lessonpreneur from the pressure of holding a real music school together and refusing to believe chaos was the only way."</p>
            <p className="lp2-hero-quote-attr">{"\u2014"} Zach Adkins, Founder</p>
          </div>
        </div>
        <HeroDeviceMockups />
      </div>
    </section>
  )
}

function AndreaTestimonial() {
  return (
    <Reveal>
      <div className="lp2-andrea-testimonial">
        <div className="lp2-andrea-stars">{"\u2605\u2605\u2605\u2605\u2605"}</div>
        <blockquote className="lp2-andrea-quote">
          "It literally moved me to tears. Before switching to Lessonpreneur, we were using a standard POS system that just wasn't built for the unique rhythm of a music school. Transitioning to this system has been a complete game changer. I have more time to spend with the parents and students and not behind a computer screen."
        </blockquote>
        <p className="lp2-andrea-attr">{"\u2014"} Andrea, Studio Director</p>
      </div>
    </Reveal>
  )
}

function DashboardMockup() {
  return (
    <div className="lp2-dash-frame">
      <div className="lp2-dash-chrome">
        <div className="lp2-dash-dots">
          <span style={{ background: 'rgba(239,68,68,0.6)' }} />
          <span style={{ background: 'rgba(255,184,0,0.6)' }} />
          <span style={{ background: 'rgba(34,197,94,0.6)' }} />
        </div>
        <div className="lp2-dash-url">lessonpreneur.app/admin/dashboard</div>
      </div>
      <div className="lp2-dash-body">
        {/* Stats row */}
        <div className="lp2-dash-stats">
          <div className="lp2-dash-stat">
            <span className="lp2-dash-stat-num" style={{ color: '#D4226A' }}>247</span>
            <span className="lp2-dash-stat-label">Active Students</span>
          </div>
          <div className="lp2-dash-stat">
            <span className="lp2-dash-stat-num" style={{ color: '#22C55E' }}>$38,420</span>
            <span className="lp2-dash-stat-label">Revenue</span>
          </div>
          <div className="lp2-dash-stat">
            <span className="lp2-dash-stat-num" style={{ color: '#FF5500' }}>12</span>
            <span className="lp2-dash-stat-label">Open Slots</span>
          </div>
          <div className="lp2-dash-stat">
            <span className="lp2-dash-stat-num" style={{ color: '#FFB800' }}>8</span>
            <span className="lp2-dash-stat-label">Leads</span>
          </div>
        </div>
        {/* Chart */}
        <div className="lp2-dash-chart-wrap">
          <div className="lp2-dash-chart-title">Revenue — Last 6 Months</div>
          <div className="lp2-dash-chart">
            {[
              { h: 42, label: 'Nov' },
              { h: 48, label: 'Dec' },
              { h: 44, label: 'Jan' },
              { h: 58, label: 'Feb' },
              { h: 62, label: 'Mar' },
              { h: 78, label: 'Apr' },
            ].map((bar, i) => (
              <div key={i} className="lp2-dash-chart-col">
                <div className="lp2-dash-chart-bar" style={{ height: `${bar.h}%`, background: i >= 4 ? '#FF5500' : '#D4226A' }} />
                <span className="lp2-dash-chart-label">{bar.label}</span>
              </div>
            ))}
          </div>
        </div>
        {/* Action cards */}
        <div className="lp2-dash-actions">
          <div className="lp2-dash-action">
            <span className="lp2-dash-action-dot" style={{ background: '#FF5500' }} />
            <span className="lp2-dash-action-text">Follow up with 3 leads</span>
            <span className="lp2-dash-action-arrow">→</span>
          </div>
          <div className="lp2-dash-action">
            <span className="lp2-dash-action-dot" style={{ background: '#D4226A' }} />
            <span className="lp2-dash-action-text">2 students missed sessions</span>
            <span className="lp2-dash-action-badge lp2-dash-badge-alert">Alert</span>
          </div>
          <div className="lp2-dash-action">
            <span className="lp2-dash-action-dot" style={{ background: '#22C55E' }} />
            <span className="lp2-dash-action-text">Revenue up 12% vs last month</span>
            <span className="lp2-dash-action-badge lp2-dash-badge-good">+12%</span>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════
   CREDIBILITY STRIP — Trust deposit after hero
   ═══════════════════════════════════════════════════════ */

function CredibilityStrip() {
  const items = [
    '10+ years of real music school operations',
    'Thousands of students managed',
    'Multi-location tested',
    'Built by an operator, not a software company',
  ]
  return (
    <div className="lp2-cred-strip">
      <div className="lp2-cred-inner">
        {items.map((item, i) => (
          <span key={i} className="lp2-cred-item">{item}</span>
        ))}
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════
   SECTION 2: PAIN SPIRAL — Pink headers + cards
   ═══════════════════════════════════════════════════════ */

function PainSpiral() {
  const pains = [
    { header: 'Leads Slipping Away', body: 'Leads come in. You mean to follow up. Three days pass. They enrolled somewhere else.' },
    { header: 'Silent Churn', body: "A family quietly stops showing up. By the time you notice, they're already gone." },
    { header: 'Scattered & Held Together By Memory', body: "Your schedule is in one app, billing in another, notes on your phone, and follow-ups in your head. It's held together by effort and memory." },
    { header: 'Invisible Losses', body: "Every day you don't fix it, you're losing students you'll never know about." },
  ]
  return (
    <Reveal>
      <section className="lp2-section lp2-pain">
        <h2 className="lp2-section-h2 lp2-pain-headline">You Already Know Something Isn't Working.</h2>
        <div className="lp2-pain-cards">
          {pains.map((p, i) => (
            <PainCard key={i} header={p.header} body={p.body} delay={i * 150} />
          ))}
        </div>
        <div className="lp2-gfx-block">
          <h3 className="lp2-gfx-header">Where Your Week Actually Goes</h3>
          <div className="lp2-time-bars">
            {[
              { pct: 35, label: 'Admin, billing, spreadsheets', color: '#D4226A', note: 'This should be automated' },
              { pct: 25, label: 'Chasing follow-ups & communication', color: '#FF5500', note: 'This should be automated' },
              { pct: 15, label: 'Scheduling coordination', color: '#FF5500', note: 'This should be automated' },
              { pct: 25, label: 'Teaching & connecting with families', color: '#FFB800', note: 'This is what you should be doing' },
            ].map((bar, i) => (
              <div key={i} className="lp2-time-bar-row">
                <div className="lp2-time-bar-info">
                  <span className="lp2-time-bar-label">{bar.label}</span>
                  <span className="lp2-time-bar-pct" style={{ color: bar.color }}>{bar.pct}%</span>
                </div>
                <div className="lp2-time-bar-track">
                  <div className="lp2-time-bar-fill" style={{ width: `${bar.pct}%`, background: bar.color }} />
                </div>
                <span className="lp2-time-bar-note" style={{ color: bar.color }}>{bar.note}</span>
              </div>
            ))}
          </div>
          <p className="lp2-pain-stat">75% of your week is spent on things a system should handle.</p>
        </div>
      </section>
    </Reveal>
  )
}

function PainCard({ header, body, delay }: { header: string; body: string; delay: number }) {
  const ref = useRef<HTMLDivElement>(null)
  const [v, setV] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const o = new IntersectionObserver(([e]) => { if (e.isIntersecting) setV(true) }, { threshold: 0.2 })
    o.observe(el)
    return () => o.disconnect()
  }, [])
  return (
    <div ref={ref} className={`lp2-pain-card ${v ? 'lp2-pain-card-visible' : ''}`} style={{ transitionDelay: `${delay}ms` }}>
      <div className="lp2-pain-card-header">{header}</div>
      <p className="lp2-pain-card-body">{body}</p>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════
   SECTION 3: STATUS QUO KILL + COST OF INACTION
   ═══════════════════════════════════════════════════════ */

function StatusQuoKill() {
  return (
    <Reveal>
      <section className="lp2-section lp2-statusquo">
        <h2 className="lp2-section-h2">Your Current Tools Were Built for Isolated Tasks. Not for Running the&nbsp;School.</h2>

        <div className="lp2-gfx-block">
          <h3 className="lp2-gfx-header">This Is What You're Running Right Now</h3>
          <div className="lp2-chaos-stack">
            <div className="lp2-chaos-mess">
              <div className="lp2-chaos-card" style={{ transform: 'rotate(-4deg) translate(0px, 0px)' }}>
                {/* My Music Staff — music note icon */}
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" style={{ marginBottom: '5px' }}>
                  <path d="M9 18V5l12-2v13" stroke="#D4226A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  <circle cx="6" cy="18" r="3" stroke="#D4226A" strokeWidth="2"/>
                  <circle cx="18" cy="16" r="3" stroke="#D4226A" strokeWidth="2"/>
                </svg>
                My Music Staff
              </div>
              <div className="lp2-chaos-card" style={{ transform: 'rotate(3deg) translate(6px, -3px)' }}>
                {/* Jackrabbit — rabbit/jump icon */}
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" style={{ marginBottom: '5px' }}>
                  <path d="M12 2C8 2 5 5 5 9c0 2.5 1.5 4.5 3 6l-2 5h8l-2-5c1.5-1.5 3-3.5 3-6 0-4-3-7-3-7z" stroke="#FF5500" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M9 9h6" stroke="#FF5500" strokeWidth="2" strokeLinecap="round"/>
                </svg>
                Jackrabbit
              </div>
              <div className="lp2-chaos-card" style={{ transform: 'rotate(-2deg) translate(-4px, 4px)' }}>
                {/* Opus One — musical staff lines */}
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" style={{ marginBottom: '5px' }}>
                  <line x1="3" y1="6" x2="21" y2="6" stroke="#FFB800" strokeWidth="2" strokeLinecap="round"/>
                  <line x1="3" y1="10" x2="21" y2="10" stroke="#FFB800" strokeWidth="2" strokeLinecap="round"/>
                  <line x1="3" y1="14" x2="21" y2="14" stroke="#FFB800" strokeWidth="2" strokeLinecap="round"/>
                  <line x1="3" y1="18" x2="21" y2="18" stroke="#FFB800" strokeWidth="2" strokeLinecap="round"/>
                  <circle cx="8" cy="18" r="2" fill="#FFB800"/>
                </svg>
                Opus One
              </div>
              <div className="lp2-chaos-card" style={{ transform: 'rotate(5deg) translate(8px, -2px)' }}>
                {/* Google Sheets — grid icon */}
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" style={{ marginBottom: '5px' }}>
                  <rect x="3" y="3" width="18" height="18" rx="2" stroke="#00A651" strokeWidth="2"/>
                  <line x1="3" y1="9" x2="21" y2="9" stroke="#00A651" strokeWidth="2"/>
                  <line x1="3" y1="15" x2="21" y2="15" stroke="#00A651" strokeWidth="2"/>
                  <line x1="9" y1="3" x2="9" y2="21" stroke="#00A651" strokeWidth="2"/>
                  <line x1="15" y1="3" x2="15" y2="21" stroke="#00A651" strokeWidth="2"/>
                </svg>
                Google Sheets
              </div>
              <div className="lp2-chaos-card" style={{ transform: 'rotate(-3deg) translate(-6px, 5px)' }}>
                {/* Text messages — SMS bubble */}
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" style={{ marginBottom: '5px' }}>
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" stroke="#888" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  <line x1="8" y1="10" x2="16" y2="10" stroke="#888" strokeWidth="2" strokeLinecap="round"/>
                  <line x1="8" y1="13" x2="13" y2="13" stroke="#888" strokeWidth="2" strokeLinecap="round"/>
                </svg>
                Text messages
              </div>
              <div className="lp2-chaos-card" style={{ transform: 'rotate(2deg) translate(3px, -4px)' }}>
                {/* Email threads — envelope */}
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" style={{ marginBottom: '5px' }}>
                  <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" stroke="#888" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  <polyline points="22,6 12,13 2,6" stroke="#888" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                Email threads
              </div>
              <div className="lp2-chaos-card" style={{ transform: 'rotate(-5deg) translate(-8px, 2px)' }}>
                {/* Staff memory — head with brain */}
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" style={{ marginBottom: '5px' }}>
                  <circle cx="12" cy="7" r="4" stroke="#888" strokeWidth="2"/>
                  <path d="M6 21v-2a6 6 0 0 1 12 0v2" stroke="#888" strokeWidth="2" strokeLinecap="round"/>
                  <path d="M15 7c0-1.5-1-2.5-2-2.5" stroke="#888" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
                Staff memory
              </div>
              <div className="lp2-chaos-card" style={{ transform: 'rotate(4deg) translate(5px, -5px)' }}>
                {/* Paper notes — notepad */}
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" style={{ marginBottom: '5px' }}>
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" stroke="#888" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  <polyline points="14,2 14,8 20,8" stroke="#888" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  <line x1="8" y1="13" x2="16" y2="13" stroke="#888" strokeWidth="2" strokeLinecap="round"/>
                  <line x1="8" y1="17" x2="13" y2="17" stroke="#888" strokeWidth="2" strokeLinecap="round"/>
                </svg>
                Paper notes
              </div>
            </div>
            <p className="lp2-chaos-label-bad">Scattered tools. Scattered results.</p>
            <div className="lp2-chaos-divider">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M12 5v14m0 0l-5-5m5 5l5-5" stroke="#D4226A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </div>
            <div className="lp2-chaos-clean">
              <div className="lp2-chaos-lp-bar">Lessonpreneur</div>
            </div>
            <p className="lp2-chaos-label-good">One system. Everything connected.</p>
          </div>
          <p className="lp2-trademark-note">All product names are trademarks of their respective owners. Lessonpreneur is not affiliated with the products listed above.</p>
        </div>

        <div className="lp2-cost-card">
          <div className="lp2-cost-icon">⚠</div>
          <h3 className="lp2-cost-headline">What Staying the Same Is Actually Costing You</h3>
          <p className="lp2-cost-closer">See what it's costing YOUR school right now.</p>
        </div>

        <ROICalculator />

        <div className="lp2-section-cta">
          <CtaButton />
          <p className="lp2-section-cta-micro">Stop the leak. Start the system.</p>
        </div>

        <div className="lp2-inline-mock">
          <h4 className="lp2-inline-mock-title">Your Lead Pipeline — Never Lose a Lead</h4>
          <MockLeadsPipeline />
          <p className="lp2-inline-mock-desc">Track every inquiry from first contact to enrollment.</p>
        </div>
      </section>
    </Reveal>
  )
}

function ROICalculator() {
  const [students, setStudents] = useState(50)
  const [rate, setRate] = useState(180)
  const scrollRef = useRef<HTMLDivElement>(null)
  const [activeCard, setActiveCard] = useState(0)
  const handleScroll = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    setActiveCard(Math.round(el.scrollLeft / el.clientWidth))
  }, [])

  const fmt = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 })

  // Churn: 30% annual attrition, avg 6 months remaining value per churned student
  const churnedStudents = Math.round(students * 0.30)
  const churnRevenue = churnedStudents * rate * 6

  // Missed leads: ~4% of student base in monthly inquiries, 30% lost to slow response
  const leadsPerMonth = Math.max(1, Math.round(students * 0.04))
  const lostLeadsPerMonth = Math.max(1, Math.round(leadsPerMonth * 0.30))
  const missedLeadRevenue = lostLeadsPerMonth * rate * 12

  const totalAnnual = churnRevenue + missedLeadRevenue
  const severity = totalAnnual < 5000 ? 'low' : totalAnnual < 15000 ? 'mid' : 'high'

  const breakdownCards = [
    { label: "Students You're Likely Losing Each Year", num: `~${churnedStudents} students/year`, color: '#FFB800', cite: 'The average service business loses 20\u201330% of customers annually \u2014 Bain & Company' },
    { label: 'Annual Revenue Lost to Silent Churn', num: `${fmt(churnRevenue)}/year`, color: '#FF5500', cite: 'Reducing churn by just 5% increases profits 25\u201395% \u2014 Harvard Business Review' },
    { label: "Leads You're Losing to Slow Follow-Up", num: `~${lostLeadsPerMonth} leads/month lost \u2192 ${fmt(missedLeadRevenue)}/year`, color: '#D4226A', cite: '78% of customers buy from the first business to respond \u2014 Lead Connect' },
  ]

  return (
    <div className="lp2-roi">
      <div className="lp2-roi-sliders">
        <div className="lp2-roi-slider-group">
          <div className="lp2-roi-slider-header">
            <label htmlFor="roi-students">How many students do you currently have?</label>
            <span className="lp2-roi-val">{students}</span>
          </div>
          <input id="roi-students" type="range" min={10} max={500} step={25} value={students}
            onChange={e => { const v = +e.target.value; setStudents(v); window.dispatchEvent(new CustomEvent('lp:studentcount', { detail: v })) }}
            aria-label="Current number of students" className="lp2-roi-range"
            style={{ '--pct': `${((students - 10) / 490) * 100}%` } as React.CSSProperties} />
          <div className="lp2-roi-range-labels"><span>10</span><span>500</span></div>
        </div>

        <div className="lp2-roi-slider-group">
          <div className="lp2-roi-slider-header">
            <label htmlFor="roi-rate">What does each student pay per month?</label>
            <span className="lp2-roi-val">{fmt(rate)}</span>
          </div>
          <input id="roi-rate" type="range" min={80} max={250} step={10} value={rate}
            onChange={e => setRate(+e.target.value)}
            aria-label="Monthly rate per student" className="lp2-roi-range"
            style={{ '--pct': `${((rate - 80) / 170) * 100}%` } as React.CSSProperties} />
          <div className="lp2-roi-range-labels"><span>$80</span><span>$250</span></div>
        </div>
      </div>

      <div className="lp2-roi-total">
        <span className="lp2-roi-total-label">What Disorganization Is Costing Your School Every Year</span>
        <div className="lp2-roi-total-glow" />
        <span className={`lp2-roi-total-num lp2-roi-${severity}`}>{fmt(totalAnnual)}<span className="lp2-roi-total-per">/year</span></span>
      </div>

      <p className="lp2-roi-closer">And this doesn't include the cost of your time, your stress, or the families who left because they stopped feeling the value.</p>

      {/* Mobile: swipeable breakdown cards */}
      <div className="lp2-roi-cards-mobile">
        <div className="lp2-roi-cards-scroll" ref={scrollRef} onScroll={handleScroll}>
          {breakdownCards.map((card, i) => (
            <div key={i} className="lp2-roi-card-slide">
              <div className="lp2-roi-card" style={{ borderTopColor: card.color }}>
                <span className="lp2-roi-row-label">{card.label}</span>
                <span className="lp2-roi-row-num" style={{ color: card.color }}>{card.num}</span>
                <span className="lp2-roi-cite">{card.cite}</span>
              </div>
            </div>
          ))}
        </div>
        <div className="lp2-roi-card-dots">
          {breakdownCards.map((_, i) => (
            <button key={i} className={`lp2-roi-card-dot ${i === activeCard ? 'lp2-roi-card-dot-on' : ''}`}
              onClick={() => scrollRef.current?.scrollTo({ left: i * (scrollRef.current?.clientWidth ?? 0), behavior: 'smooth' })} />
          ))}
        </div>
      </div>

      {/* Desktop: 3-col grid */}
      <div className="lp2-roi-cards-desktop">
        {breakdownCards.map((card, i) => (
          <div key={i} className="lp2-roi-card" style={{ borderTopColor: card.color }}>
            <span className="lp2-roi-row-label">{card.label}</span>
            <span className="lp2-roi-row-num" style={{ color: card.color }}>{card.num}</span>
            <span className="lp2-roi-cite">{card.cite}</span>
          </div>
        ))}
      </div>

      <p className="lp2-roi-citations">Based on industry data from Bain &amp; Company and Harvard Business Review studies on customer retention and lead response timing.</p>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════
   SECTION 4: CATEGORY REPOSITIONING
   ═══════════════════════════════════════════════════════ */

function CategoryReposition() {
  return (
    <Reveal>
      <section className="lp2-section lp2-reposition">
        <h2 className="lp2-reposition-h2">This Is Not Another CRM.</h2>
        <p className="lp2-reposition-sub">This Is the System That Runs Your School.</p>

        <div className="lp2-gfx-block">
          <h3 className="lp2-gfx-header">Replace Six Tools With One System</h3>
          <div className="lp2-replace-rows">
            {[
              ['Separate scheduling tool', 'Built-in scheduling'],
              ['Separate billing tool', 'Built-in billing'],
              ['Spreadsheet tracking', 'Automated tracking'],
              ['Manual text follow-up', 'AI-powered follow-up'],
              ['Staff memory systems', 'System-driven workflows'],
              ['Disconnected reports', 'One unified dashboard'],
            ].map(([old, neu], i) => (
              <div key={i} className="lp2-replace-row">
                <div className="lp2-replace-item-old"><span className="lp2-replace-x">✕</span>{old}</div>
                <span className="lp2-replace-arrow-inline">→</span>
                <div className="lp2-replace-item-new"><span className="lp2-replace-check">✓</span>{neu}</div>
              </div>
            ))}
          </div>
          <p className="lp2-gfx-sub">Everything your school needs. Nothing it doesn't.</p>
        </div>

        <div className="lp2-tagline-moment">
          <div className="lp2-tagline-glow" />
          <p className="lp2-tagline">Lessonpreneur runs the school.<br />You run the teaching.</p>
        </div>

      </section>
    </Reveal>
  )
}

/* ═══════════════════════════════════════════════════════
   SECTION 5: TRANSFORMATION CARDS
   ═══════════════════════════════════════════════════════ */

function TransformationCards() {
  const cards = [
    { bold: 'Every Lead Gets Followed Up. Automatically.', support: 'That inquiry that came in while you were teaching? Already handled.', color: '#D4226A', icon: <svg width="40" height="40" viewBox="0 0 40 40" fill="none"><path d="M20 4l8 8H24v12H16V12H12l8-8z" fill="#D4226A" opacity="0.2"/><path d="M12 28h16M8 34h24M20 4v24" stroke="#D4226A" strokeWidth="2" strokeLinecap="round"/><circle cx="20" cy="32" r="3" fill="#D4226A"/></svg> },
    { bold: "You See Who's Slipping Before They're Gone.", support: 'Retention alerts, engagement tracking, and AI-powered check-ins keep families connected — not just enrolled.', color: '#FF5500', icon: <svg width="40" height="40" viewBox="0 0 40 40" fill="none"><path d="M20 8a8 8 0 100 16 8 8 0 000-16z" fill="#FF5500" opacity="0.15"/><circle cx="20" cy="16" r="6" stroke="#FF5500" strokeWidth="2"/><path d="M14 28c0-3.3 2.7-6 6-6s6 2.7 6 6" stroke="#FF5500" strokeWidth="2" strokeLinecap="round"/><path d="M28 10l4-4M30 14l3-1" stroke="#FF5500" strokeWidth="2" strokeLinecap="round"/><path d="M27 8l2 2" stroke="#22C55E" strokeWidth="2.5" strokeLinecap="round"/></svg> },
    { bold: 'Billing Runs Itself. Payments Show Up.', support: 'Automated invoicing. Family billing views. No more chasing. No more spreadsheet reconciliation.', color: '#FFB800', icon: <svg width="40" height="40" viewBox="0 0 40 40" fill="none"><circle cx="20" cy="20" r="14" fill="#FFB800" opacity="0.1"/><path d="M20 10v20M16 14h8a4 4 0 010 8h-8m0 0h9a4 4 0 010 8H15" stroke="#FFB800" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><path d="M30 12a14 14 0 010 16" stroke="#FFB800" strokeWidth="1.5" strokeLinecap="round" strokeDasharray="2 3"/></svg> },
    { bold: 'Your Entire Schedule. One Screen. Every Location.', support: "Every teacher. Every student. Every open slot that's costing you money.", color: '#D4226A', icon: <svg width="40" height="40" viewBox="0 0 40 40" fill="none"><rect x="6" y="8" width="28" height="24" rx="4" fill="#D4226A" opacity="0.1"/><rect x="6" y="8" width="28" height="24" rx="4" stroke="#D4226A" strokeWidth="2"/><line x1="6" y1="16" x2="34" y2="16" stroke="#D4226A" strokeWidth="2"/><rect x="11" y="20" width="5" height="4" rx="1" fill="#D4226A"/><rect x="18" y="20" width="5" height="4" rx="1" fill="#D4226A" opacity="0.5"/><rect x="25" y="20" width="5" height="4" rx="1" fill="#D4226A"/><rect x="11" y="26" width="5" height="4" rx="1" fill="#D4226A" opacity="0.5"/><rect x="18" y="26" width="5" height="4" rx="1" fill="#D4226A"/></svg> },
    { bold: 'Centralized Communication. Nothing Falls Through.', support: 'Every interaction tracked. Every follow-up logged. Your whole team on the same page.', color: '#FF5500', icon: <svg width="40" height="40" viewBox="0 0 40 40" fill="none"><rect x="6" y="6" width="18" height="14" rx="4" fill="#FF5500" opacity="0.15"/><rect x="6" y="6" width="18" height="14" rx="4" stroke="#FF5500" strokeWidth="2"/><rect x="16" y="20" width="18" height="14" rx="4" fill="#FF5500" opacity="0.08"/><rect x="16" y="20" width="18" height="14" rx="4" stroke="#FF5500" strokeWidth="2"/><path d="M28 26l-3 3 3 3" stroke="#FFB800" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg> },
    { bold: 'Run Your School From Your Phone. Less Time Behind a Screen.', support: 'Check in, approve, respond, and oversee — from anywhere. Stop being chained to a desk.', color: '#D4226A', icon: <svg width="40" height="40" viewBox="0 0 40 40" fill="none"><rect x="12" y="4" width="16" height="32" rx="4" fill="#D4226A" opacity="0.1"/><rect x="12" y="4" width="16" height="32" rx="4" stroke="#D4226A" strokeWidth="2"/><line x1="12" y1="10" x2="28" y2="10" stroke="#D4226A" strokeWidth="1.5"/><line x1="12" y1="30" x2="28" y2="30" stroke="#D4226A" strokeWidth="1.5"/><path d="M17 20l3 3 5-6" stroke="#22C55E" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg> },
  ]
  return (
    <Reveal id="features">
      <section className="lp2-section lp2-transforms">
        <div className="lp2-transform-grid">
          {cards.map((card, i) => (
            <TransformCard key={i} {...card} delay={i * 100} />
          ))}
        </div>

        <div className="lp2-inline-mock">
          <h4 className="lp2-inline-mock-title">Your Schedule — Every Teacher, Every Slot</h4>
          <MockSchedule />
          <div className="lp2-sched-revenue-badge">
            <span className="lp2-sched-revenue-calc">7 open slots × $160/mo = </span>
            <span className="lp2-sched-revenue-total">$1,120/mo</span>
            <span className="lp2-sched-revenue-sub">in unfilled capacity</span>
          </div>
          <p className="lp2-inline-mock-desc">Every open slot is revenue you're leaving on the table.</p>
        </div>

        <div className="lp2-section-cta" style={{ marginTop: 32 }}>
          <CtaButton />
        </div>
      </section>
    </Reveal>
  )
}

function TransformCard({ bold, support, color, delay, icon }: { bold: string; support: string; color: string; delay: number; icon?: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const [v, setV] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const o = new IntersectionObserver(([e]) => { if (e.isIntersecting) setV(true) }, { threshold: 0.15 })
    o.observe(el)
    return () => o.disconnect()
  }, [])
  return (
    <div ref={ref} className={`lp2-tcard ${v ? 'lp2-tcard-visible' : ''}`} style={{ transitionDelay: `${delay}ms`, borderTopColor: color }}>
      {icon && <div className="lp2-tcard-icon">{icon}</div>}
      <h3 className="lp2-tcard-bold">{bold}</h3>
      <p className="lp2-tcard-support">{support}</p>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════
   SECTION 6: THE BRAIN — Static, readable, no rotation
   ═══════════════════════════════════════════════════════ */

function BrainSection() {
  return (
    <Reveal>
      <section className="lp2-section lp2-brain-section">
        <div className="lp2-brain-layout">
          <div className="lp2-brain-copy">
            <h2 className="lp2-section-h2">I Took a Decade of Running Music Schools and Turned It Into a&nbsp;Brain.</h2>
            <p>This system wasn't designed in a conference room. It was built from 10+ years of operating real music schools — thousands of students, millions in revenue, hundreds of thousands of follow-ups and retention battles.</p>
            <p>I compressed all of it into an AI system that thinks the way a seasoned music school owner thinks — except it never gets tired, never forgets, and never drops the ball.</p>
            <p className="lp2-brain-closing">And now I'm giving it to you.</p>
            <p className="lp2-brain-ai-frame">Humans talk to humans. Computers should talk to computers. Lessonpreneur removes the computer burden so you can focus on people.</p>
          </div>
          <div className="lp2-brain-viz-wrap">
            <BrainVisualization />
          </div>
        </div>

        <div className="lp2-gfx-block" style={{ marginTop: 56 }}>
          <h3 className="lp2-gfx-header">A Decade of Music School Data. Compressed Into One System.</h3>
          <div className="lp2-data-streams">
            <div className="lp2-stream-pills">
              {['10+ years of operations', 'Thousands of students', 'Millions in revenue data', 'Hundreds of thousands of follow-ups', 'Retention patterns', 'Lead conversion data', 'Scheduling optimization', 'Billing patterns'].map((item, i) => (
                <div key={i} className="lp2-stream-pill" style={{
                  borderColor: ['#D4226A', '#FF5500', '#FFB800', '#D4226A', '#FF5500', '#FFB800', '#D4226A', '#FF5500'][i],
                  animationDelay: `${i * 0.15}s`,
                }}>{item}</div>
              ))}
            </div>
            <div className="lp2-stream-converge">
              <svg width="40" height="40" viewBox="0 0 40 40" fill="none"><path d="M8 8l12 12M32 8L20 20M8 32l12-12M32 32L20 20" stroke="#D4226A" strokeWidth="1.5" strokeLinecap="round" opacity="0.4"/><circle cx="20" cy="20" r="6" fill="#D4226A" opacity="0.3"/><circle cx="20" cy="20" r="3" fill="#D4226A"/></svg>
            </div>
            <div className="lp2-stream-output">Lessonpreneur AI</div>
          </div>
        </div>

        <div className="lp2-inline-mock">
          <h4 className="lp2-inline-mock-title">AI Assistant — Star Handles the Rest</h4>
          <MockAIAssistant />
          <p className="lp2-inline-mock-desc">Ask a question, get an answer, take action.</p>
        </div>

      </section>
    </Reveal>
  )
}

function BrainVisualization() {
  const nodes = [
    { label: 'Leads', color: '#D4226A', x: 50, y: 2 },
    { label: 'Retention', color: '#FF5500', x: 88, y: 18 },
    { label: 'Billing', color: '#FFB800', x: 96, y: 52 },
    { label: 'Schedule', color: '#D4226A', x: 82, y: 85 },
    { label: 'Families', color: '#FFB800', x: 50, y: 98 },
    { label: 'Teachers', color: '#D4226A', x: 18, y: 85 },
    { label: 'Analytics', color: '#FFB800', x: 4, y: 52 },
    { label: 'Progress', color: '#FF5500', x: 12, y: 18 },
  ]
  const ref = useRef<HTMLDivElement>(null)
  const [v, setV] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const o = new IntersectionObserver(([e]) => { if (e.isIntersecting) setV(true) }, { threshold: 0.2 })
    o.observe(el)
    return () => o.disconnect()
  }, [])

  return (
    <div ref={ref} className={`lp2-brain ${v ? 'lp2-brain-active' : ''}`}>
      <div className="lp2-brain-glow" />
      {/* Brain icon — clean, recognizable silhouette */}
      <svg className="lp2-brain-svg" viewBox="0 0 200 200" fill="none">
        {/* Left hemisphere */}
        <path d="M100 170 L100 100 C100 100, 100 40, 60 40 C40 40, 30 55, 30 70 C30 75, 32 80, 35 84 C28 88, 24 96, 24 105 C24 115, 30 124, 40 128 C38 134, 40 142, 48 148 C54 152, 64 154, 72 150 C78 158, 88 164, 100 170Z"
          stroke="#D4226A" strokeWidth="2" fill="rgba(212,34,106,0.08)" strokeLinecap="round" strokeLinejoin="round" />
        {/* Right hemisphere */}
        <path d="M100 170 L100 100 C100 100, 100 40, 140 40 C160 40, 170 55, 170 70 C170 75, 168 80, 165 84 C172 88, 176 96, 176 105 C176 115, 170 124, 160 128 C162 134, 160 142, 152 148 C146 152, 136 154, 128 150 C122 158, 112 164, 100 170Z"
          stroke="#FF5500" strokeWidth="2" fill="rgba(255,85,0,0.06)" strokeLinecap="round" strokeLinejoin="round" />
        {/* Core glow */}
        <circle cx="100" cy="100" r="12" fill="#D4226A" opacity="0.12" className="lp2-brain-core-svg" />
        <circle cx="100" cy="100" r="5" fill="#D4226A" opacity="0.5" className="lp2-brain-core-svg" />
      </svg>
      {/* Connection lines to nodes */}
      <svg className="lp2-brain-lines" viewBox="0 0 100 100" preserveAspectRatio="none">
        {nodes.map((node, i) => (
          <line key={i} x1="50" y1="45" x2={node.x} y2={node.y}
            stroke={node.color} strokeWidth="0.3" strokeOpacity="0.4"
            strokeDasharray="2 2" className="lp2-brain-line"
            style={{ animationDelay: `${i * 0.3}s` }}
          />
        ))}
      </svg>
      {/* Nodes */}
      {nodes.map((node, i) => (
        <div key={i} className="lp2-brain-node"
          style={{
            left: `${node.x}%`, top: `${node.y}%`,
            animationDelay: `${i * 0.15}s`,
            borderColor: node.color,
            '--node-color': node.color,
          } as React.CSSProperties}
        >
          <span className="lp2-brain-node-dot" style={{ background: node.color }} />
          <span className="lp2-brain-node-label">{node.label}</span>
        </div>
      ))}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════
   SECTION 7: PRODUCT PROOF GALLERY
   ═══════════════════════════════════════════════════════ */

function ProductProofGallery() {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [activeIdx, setActiveIdx] = useState(0)
  const handleScroll = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    const idx = Math.round(el.scrollLeft / el.clientWidth)
    setActiveIdx(idx)
  }, [])

  const scenes = [
    { el: <MockDashboard key="dash" />, title: 'Your Dashboard — Everything at a Glance', desc: 'Revenue, alerts, and action items in one screen.' },
    { el: <MockSchedule key="sched" />, title: 'Your Schedule — Every Teacher, Every Slot', desc: 'See open slots, booked sessions, and teacher capacity.' },
    { el: <MockLeadsPipeline key="leads" />, title: 'Your Lead Pipeline — Never Lose a Lead', desc: 'Track every inquiry from first contact to enrollment.' },
    { el: <MockStudentProfile key="student" />, title: 'Student Profiles — Know Every Student', desc: 'Session history, notes, and retention signals.' },
    { el: <MockFamilyView key="family" />, title: 'Family Portal — Parents See Progress', desc: 'Progress updates that keep families engaged.' },
    { el: <MockAIAssistant key="ai" />, title: 'AI Assistant — Star Handles the Rest', desc: 'Ask a question, get an answer, take action.' },
  ]

  return (
    <Reveal>
      <section className="lp2-section lp2-gallery-section">
        <h2 className="lp2-section-h2" style={{ textAlign: 'center' }}>See What You're Getting.</h2>
        <p className="lp2-gallery-sub">Real screens. Real data patterns. Built for music schools.</p>
        {/* Mobile carousel */}
        <div className="lp2-gallery-mobile">
          <div className="lp2-gallery-scroll" ref={scrollRef} onScroll={handleScroll}>
            {scenes.map((scene, i) => (
              <div key={i} className="lp2-gallery-slide">
                <h4 className="lp2-gallery-title">{scene.title}</h4>
                {scene.el}
                <p className="lp2-gallery-desc">{scene.desc}</p>
              </div>
            ))}
          </div>
          <div className="lp2-gallery-dots">
            {scenes.map((_, i) => (
              <button key={i} className={`lp2-gallery-dot ${i === activeIdx ? 'lp2-gallery-dot-on' : ''}`}
                onClick={() => scrollRef.current?.scrollTo({ left: i * (scrollRef.current?.clientWidth ?? 0), behavior: 'smooth' })} />
            ))}
          </div>
        </div>
        {/* Desktop grid */}
        <div className="lp2-gallery-desktop">
          {scenes.map((scene, i) => (
            <div key={i} className="lp2-gallery-card">
              <h4 className="lp2-gallery-title">{scene.title}</h4>
              {scene.el}
              <p className="lp2-gallery-desc">{scene.desc}</p>
            </div>
          ))}
        </div>
      </section>
    </Reveal>
  )
}

function DeviceFrame({ type = 'laptop', title, children }: { type?: 'laptop' | 'phone'; title: string; children: ReactNode }) {
  if (type === 'phone') {
    return (
      <div className="lp2-device lp2-device-phone">
        <div className="lp2-device-notch" />
        <div className="lp2-device-title">{title}</div>
        <div className="lp2-device-body">{children}</div>
      </div>
    )
  }
  return (
    <div className="lp2-device lp2-device-laptop">
      <div className="lp2-device-chrome">
        <div className="lp2-device-dots">
          <span style={{ background: 'rgba(239,68,68,0.5)' }} />
          <span style={{ background: 'rgba(255,184,0,0.5)' }} />
          <span style={{ background: 'rgba(34,197,94,0.5)' }} />
        </div>
        <div className="lp2-device-url">lessonpreneur.app</div>
      </div>
      <div className="lp2-device-title">{title}</div>
      <div className="lp2-device-body">{children}</div>
    </div>
  )
}

function MockDashboard() {
  return (
    <DeviceFrame title="Dashboard">
      <div className="lp2-mock-stats">
        <div className="lp2-mock-stat"><span className="lp2-mock-stat-n" style={{ color: '#D4226A' }}>247</span><span className="lp2-mock-stat-l">Active Students</span></div>
        <div className="lp2-mock-stat"><span className="lp2-mock-stat-n" style={{ color: '#22C55E' }}>$38,420</span><span className="lp2-mock-stat-l">This Month</span></div>
        <div className="lp2-mock-stat"><span className="lp2-mock-stat-n" style={{ color: '#FF5500' }}>12</span><span className="lp2-mock-stat-l">Open Slots</span></div>
        <div className="lp2-mock-stat"><span className="lp2-mock-stat-n" style={{ color: '#FFB800' }}>8</span><span className="lp2-mock-stat-l">Leads This Week</span></div>
      </div>
      <div className="lp2-mock-chart">
        {[35, 42, 38, 55, 50, 68].map((h, i) => (
          <div key={i} className="lp2-mock-chart-bar" style={{ height: `${h}%`, background: i % 2 === 0 ? '#D4226A' : '#FF5500' }} />
        ))}
      </div>
      <div className="lp2-mock-actions">
        <div className="lp2-mock-action-item"><span className="lp2-mock-action-dot" style={{ background: '#FF5500' }} />Follow up with 3 leads</div>
        <div className="lp2-mock-action-item"><span className="lp2-mock-action-dot" style={{ background: '#D4226A' }} />2 students missed sessions</div>
        <div className="lp2-mock-action-item"><span className="lp2-mock-action-dot" style={{ background: '#22C55E' }} />Revenue up 12% vs last month</div>
      </div>
    </DeviceFrame>
  )
}

function MockSchedule() {
  const teachers = [
    { name: 'Sarah M.', slots: [
      { time: '3:00', student: 'Jamie K.', filled: true },
      { time: '3:30', student: 'Open', filled: false },
      { time: '4:00', student: 'Tyler R.', filled: true },
      { time: '4:30', student: 'Ava C.', filled: true },
      { time: '5:00', student: 'Open', filled: false },
    ]},
    { name: 'James K.', slots: [
      { time: '3:00', student: 'Noah P.', filled: true },
      { time: '3:30', student: 'Lily T.', filled: true },
      { time: '4:00', student: 'Open', filled: false },
      { time: '4:30', student: 'Mia S.', filled: true },
      { time: '5:00', student: 'Jesse W.', filled: true },
    ]},
    { name: 'Lisa R.', slots: [
      { time: '3:00', student: 'Open', filled: false },
      { time: '3:30', student: 'Emma R.', filled: true },
      { time: '4:00', student: 'Carlos M.', filled: true },
      { time: '4:30', student: 'Open', filled: false },
      { time: '5:00', student: 'Zoe B.', filled: true },
    ]},
    { name: 'Mike T.', slots: [
      { time: '3:00', student: 'Dan F.', filled: true },
      { time: '3:30', student: 'Open', filled: false },
      { time: '4:00', student: 'Sam W.', filled: true },
      { time: '4:30', student: 'Ava L.', filled: true },
      { time: '5:00', student: 'Open', filled: false },
    ]},
  ]
  return (
    <DeviceFrame title="Schedule — Tuesday">
      <div className="lp2-mock-schedule">
        <div className="lp2-mock-sched-header">
          <div className="lp2-mock-sched-teacher-col" />
          {['3:00', '3:30', '4:00', '4:30', '5:00'].map(t => (
            <div key={t} className="lp2-mock-sched-time">{t}</div>
          ))}
        </div>
        {teachers.map(t => (
          <div key={t.name} className="lp2-mock-sched-row">
            <div className="lp2-mock-sched-teacher">{t.name}</div>
            {t.slots.map((s, i) => (
              <div key={i} className={s.filled ? 'lp2-mock-sched-filled' : 'lp2-mock-sched-open'}>
                {s.student}
              </div>
            ))}
          </div>
        ))}
      </div>
    </DeviceFrame>
  )
}

function MockLeadsPipeline() {
  const cols = [
    { name: 'New', glow: true, leads: [
      { name: 'Maria Chen', inst: 'Piano', time: '2 hrs ago' },
      { name: 'David Park', inst: 'Guitar', time: '5 hrs ago' },
      { name: 'Sarah Jones', inst: 'Vocals', time: 'Yesterday' },
    ]},
    { name: 'Contacted', glow: false, leads: [
      { name: 'Tom Wilson', inst: 'Drums', time: '1 day ago' },
      { name: 'Amy Liu', inst: 'Piano', time: '2 days ago' },
    ]},
    { name: 'Trial Booked', glow: false, leads: [
      { name: 'Jake Brown', inst: 'Guitar', time: 'Thu 4pm' },
      { name: 'Lily Nguyen', inst: 'Vocals', time: 'Fri 3pm' },
    ]},
    { name: 'Enrolled', glow: false, leads: [
      { name: 'Emma Davis', inst: 'Piano', time: 'This week' },
    ]},
  ]
  return (
    <DeviceFrame title="Lead Pipeline">
      <div className="lp2-mock-pipeline">
        {cols.map(col => (
          <div key={col.name} className={`lp2-mock-pipe-col ${col.glow ? 'lp2-mock-pipe-glow' : ''}`}>
            <div className="lp2-mock-pipe-header">{col.name} <span className="lp2-mock-pipe-count">{col.leads.length}</span></div>
            {col.leads.map(lead => (
              <div key={lead.name} className="lp2-mock-pipe-card">
                <div className="lp2-mock-pipe-name">{lead.name}</div>
                <div className="lp2-mock-pipe-meta">{lead.inst} · {lead.time}</div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </DeviceFrame>
  )
}

function MockStudentProfile() {
  return (
    <DeviceFrame type="phone" title="Student Profile">
      <div className="lp2-mock-profile">
        <div className="lp2-mock-profile-avatar">ER</div>
        <div className="lp2-mock-profile-name">Emma Rodriguez</div>
        <div className="lp2-mock-profile-meta">Piano · Started Sep 2024</div>
        <div className="lp2-mock-profile-details">
          <div className="lp2-mock-profile-row"><span className="lp2-mock-profile-label">Teacher</span><span>Sarah M.</span></div>
          <div className="lp2-mock-profile-row"><span className="lp2-mock-profile-label">Status</span><span className="lp2-mock-badge-active">Active</span></div>
          <div className="lp2-mock-profile-row"><span className="lp2-mock-profile-label">Next Session</span><span>Tue 4:00 PM</span></div>
          <div className="lp2-mock-profile-row"><span className="lp2-mock-profile-label">This Month</span><span>3 of 4 sessions</span></div>
        </div>
        <div className="lp2-mock-profile-notes">
          <div className="lp2-mock-profile-notes-title">Teacher Notes</div>
          <p>Working on Fur Elise, great progress on dynamics. Ready to start the third section next week.</p>
        </div>
      </div>
    </DeviceFrame>
  )
}

function MockFamilyView() {
  return (
    <DeviceFrame type="phone" title="Family Portal">
      <div className="lp2-mock-family">
        <div className="lp2-mock-family-welcome">Welcome, Martinez Family</div>
        <div className="lp2-mock-family-students">
          <div className="lp2-mock-family-student">
            <span className="lp2-mock-family-avatar" style={{ background: '#D4226A' }}>E</span>
            <div><div className="lp2-mock-family-sname">Emma — Piano</div><div className="lp2-mock-family-next">Next: Tue 4:00 PM</div></div>
          </div>
          <div className="lp2-mock-family-student">
            <span className="lp2-mock-family-avatar" style={{ background: '#FF5500' }}>C</span>
            <div><div className="lp2-mock-family-sname">Carlos — Guitar</div><div className="lp2-mock-family-next">Next: Wed 5:30 PM</div></div>
          </div>
        </div>
        <div className="lp2-mock-family-update">
          <div className="lp2-mock-family-update-title">Progress Update</div>
          <p>Emma's teacher says she nailed the bridge section this week. Keep up the great practice!</p>
        </div>
        <div className="lp2-mock-family-milestone">
          <span className="lp2-mock-family-milestone-badge">3 Months!</span>
        </div>
      </div>
    </DeviceFrame>
  )
}

function MockAIAssistant() {
  return (
    <DeviceFrame type="phone" title="Star — Your AI Assistant">
      <div className="lp2-mock-chat">
        <div className="lp2-mock-chat-bubble lp2-mock-chat-star">
          3 leads came in this weekend. I've sent intro texts to all of them. Maria Chen replied — she wants to book a trial for her son on Thursday.
        </div>
        <div className="lp2-mock-chat-bubble lp2-mock-chat-user">
          Book it with Sarah at 4pm
        </div>
        <div className="lp2-mock-chat-bubble lp2-mock-chat-star">
          Done. Trial booked. Sarah notified. Confirmation sent to Maria.
        </div>
      </div>
    </DeviceFrame>
  )
}

/* ═══════════════════════════════════════════════════════
   SECTION 8: RETENTION + ROLES
   ═══════════════════════════════════════════════════════ */

function RetentionRoles() {
  return (
    <Reveal>
      <section className="lp2-section lp2-retention">
        <div className="lp2-gfx-block">
          <h3 className="lp2-gfx-header">This Is How Students Stay for Years Instead of Months</h3>
          <div className="lp2-timeline-compare">
            <div className="lp2-timeline-col lp2-timeline-without">
              <div className="lp2-timeline-col-label" style={{ color: '#6868A0' }}>Without Lessonpreneur</div>
              {[
                { month: 'Month 1', event: 'Student enrolls', color: '#6868A0' },
                { month: 'Month 3', event: 'Parent stops seeing progress', color: '#6868A0' },
                { month: 'Month 4', event: 'Lessons feel routine', color: '#6868A0' },
                { month: 'Month 5', event: 'Family quietly leaves', color: '#EF4444' },
              ].map((step, i) => (
                <div key={i} className="lp2-timeline-step">
                  <span className="lp2-timeline-dot" style={{ background: step.color }} />
                  <div><span className="lp2-timeline-month">{step.month}</span><span className="lp2-timeline-event">{step.event}</span></div>
                </div>
              ))}
              <div className="lp2-timeline-result lp2-timeline-result-bad">Lost student. Lost revenue.</div>
            </div>
            <div className="lp2-timeline-col lp2-timeline-with">
              <div className="lp2-timeline-col-label" style={{ color: '#22C55E' }}>With Lessonpreneur</div>
              {[
                { month: 'Month 1', event: 'Student enrolls', color: '#22C55E' },
                { month: 'Month 3', event: 'AI sends progress update', color: '#D4226A' },
                { month: 'Month 4', event: 'Milestone celebration sent', color: '#FFB800' },
                { month: 'Month 5', event: 'Teacher report → Parent re-commits', color: '#22C55E' },
              ].map((step, i) => (
                <div key={i} className="lp2-timeline-step">
                  <span className="lp2-timeline-dot" style={{ background: step.color }} />
                  <div><span className="lp2-timeline-month">{step.month}</span><span className="lp2-timeline-event">{step.event}</span></div>
                </div>
              ))}
              <div className="lp2-timeline-result lp2-timeline-result-good">Student stays 3+ years.</div>
            </div>
          </div>
          <p className="lp2-gfx-sub">Automated engagement that makes families feel the value.</p>
        </div>


        <div className="lp2-inline-mock-row">
          <div className="lp2-inline-mock">
            <h4 className="lp2-inline-mock-title">Student Profiles</h4>
            <MockStudentProfile />
            <p className="lp2-inline-mock-desc">Session history, notes, and retention signals.</p>
          </div>
          <div className="lp2-inline-mock">
            <h4 className="lp2-inline-mock-title">Family Portal</h4>
            <MockFamilyView />
            <p className="lp2-inline-mock-desc">Progress updates that keep families engaged.</p>
          </div>
        </div>

        <div className="lp2-roles">
          <h3 className="lp2-roles-sub">One System. Three Experiences.</h3>
          <div className="lp2-roles-grid">
            <div className="lp2-role-card lp2-role-pink">
              <div className="lp2-role-title">Owners</div>
              <p>Every location. Every teacher. Every number. One screen. Total control.</p>
            </div>
            <div className="lp2-role-card lp2-role-orange">
              <div className="lp2-role-title">Teachers</div>
              <p>Clean schedule. Easy notes. Less admin. More teaching.</p>
            </div>
            <div className="lp2-role-card lp2-role-gold">
              <div className="lp2-role-title">Families</div>
              <p>Progress updates. Milestone alerts. A school that feels like it has its act together.</p>
            </div>
          </div>
        </div>
      </section>
    </Reveal>
  )
}

/* ═══════════════════════════════════════════════════════
   SECTION 8.5: INTEGRATIONS
   ═══════════════════════════════════════════════════════ */

function IntegrationsSection() {
  const rowCore = [
    { name: 'Square', dot: '#000000', note: 'payments + scheduling sync' },
    { name: 'Google Calendar', dot: '#4285F4', note: 'Meet + schedule mirror' },
    { name: 'QUO SMS', dot: '#D4226A', note: 'two-way texting' },
    { name: 'n8n', dot: '#EA4B71', note: 'automation engine' },
    { name: 'Stripe', dot: '#635BFF', note: 'white-label billing' },
    { name: 'SignWell', dot: '#22C55E', note: 'enrollment agreements' },
  ]
  const rowMarketing = [
    { name: 'Google Analytics', dot: '#F9AB00' },
    { name: 'Meta Ads', dot: '#1877F2' },
    { name: 'TikTok', dot: '#FF0050' },
    { name: 'Mailchimp', dot: '#FFE01B' },
    { name: 'Google Drive', dot: '#34A853' },
    { name: 'Slack', dot: '#4A154B' },
  ]
  const rowSoon = [
    { name: 'Zoom', dot: '#2D8CFF' },
    { name: 'Outlook / M365', dot: '#0078D4' },
    { name: 'Apple iCal', dot: '#A0A0B0' },
    { name: 'Twilio', dot: '#F22F46' },
    { name: 'Klaviyo', dot: '#FF6C4B' },
  ]

  return (
    <Reveal>
      <section className="lp2-section lp2-integrations">
        <div className="lp2-int-header">
          <div className="lp2-int-label">PLAYS WELL WITH OTHERS</div>
          <h2 className="lp2-section-h2" style={{ textAlign: 'center' }}>Everything Connected. Nothing Scattered.</h2>
          <p className="lp2-int-sub">Lessonpreneur plugs into the tools you already use — and automates the ones you don't.</p>
        </div>

        <div className="lp2-int-grid">
          {rowCore.map((p) => (
            <div key={p.name} className="lp2-int-pill">
              <span className="lp2-int-dot" style={{ background: p.dot }} />
              <span className="lp2-int-name">{p.name}</span>
            </div>
          ))}
        </div>

        <div className="lp2-int-grid">
          {rowMarketing.map((p) => (
            <div key={p.name} className="lp2-int-pill">
              <span className="lp2-int-dot" style={{ background: p.dot }} />
              <span className="lp2-int-name">{p.name}</span>
            </div>
          ))}
        </div>

        <div className="lp2-int-grid">
          {rowSoon.map((p) => (
            <div key={p.name} className="lp2-int-pill lp2-int-pill-soon">
              <span className="lp2-int-dot" style={{ background: p.dot }} />
              <span className="lp2-int-name">{p.name}</span>
              <span className="lp2-int-badge">Coming Soon</span>
            </div>
          ))}
        </div>

        <div className="lp2-int-callouts">
          <div className="lp2-int-callout">
            <div className="lp2-int-callout-icon">🔄</div>
            <div className="lp2-int-callout-title">LP is always source of truth</div>
            <div className="lp2-int-callout-body">Calendar apps mirror your schedule. Square runs your charges. Lessonpreneur runs everything.</div>
          </div>
          <div className="lp2-int-callout">
            <div className="lp2-int-callout-icon">⚡</div>
            <div className="lp2-int-callout-title">Automation that actually works</div>
            <div className="lp2-int-callout-body">n8n handles the repetitive stuff — billing runs, reminder sequences, lead follow-up, enrollment agreements. Set it once. It runs forever.</div>
          </div>
          <div className="lp2-int-callout">
            <div className="lp2-int-callout-icon">🔒</div>
            <div className="lp2-int-callout-title">Your data. Your platform.</div>
            <div className="lp2-int-callout-body">Every white-label customer gets their own isolated environment. No shared databases. No data mixing. Ever.</div>
          </div>
        </div>
      </section>
    </Reveal>
  )
}

/* ═══════════════════════════════════════════════════════
   SECTION 9: PRICING + OBJECTIONS
   ═══════════════════════════════════════════════════════ */

function PricingSection() {
  const LAUNCH_PRICING_ENDS = '2026-07-03'
  const daysLeft = Math.max(0, Math.ceil((new Date(LAUNCH_PRICING_ENDS + 'T23:59:59').getTime() - Date.now()) / (1000 * 60 * 60 * 24)))

  const [openFaq, setOpenFaq] = useState<number | null>(null)
  const faqs = [
    { q: 'I already have a system that works.', a: "Does it? Or does it just exist? If you're still chasing leads manually, losing students you didn't see leaving, and spending hours on admin — that's not a system. That's survival mode." },
    { q: "I don't have time to learn new software.", a: 'If you can send a text message, you can use Lessonpreneur. It was built to save you time on day one, not add another learning curve to your life.' },
    { q: "I'm afraid switching will break what I already do.", a: "You're not blowing anything up. You're upgrading. Keep what works. Replace what doesn't. Lessonpreneur plugs into your world — it doesn't demolish it." },
    { q: "I don't trust AI with my business.", a: "Good. You shouldn't trust bad AI. This isn't a chatbot guessing at your business. This is AI built from real operational data, real patterns, and real music school experience. It doesn't replace your judgment. It removes the busywork that's drowning it." },
  ]

  return (
    <Reveal id="pricing">
      <section className="lp2-section lp2-pricing">
        <h2 className="lp2-section-h2" style={{ textAlign: 'center' }}>Pick Your Plan. Start in 60&nbsp;Seconds.</h2>
        <p className="lp2-pricing-sub">Every plan includes a 60-day free trial. No credit card required.</p>

        <div className="lp2-pricing-grid">
          {/* Teacher */}
          <div className="lp2-price-card">
            <span className="lp2-discount-badge">34% off</span>
            <div className="lp2-price-name">Teacher</div>
            <div className="lp2-price-tagline">For solo instructors ready to go pro.</div>
            <div className="lp2-price-slashed">$297/mo</div>
            <div className="lp2-price-amount">$197<span className="lp2-price-mo">/mo</span></div>
            <div className="lp2-legacy-badge-card">Legacy Price — Locked For Life</div>
            <ul className="lp2-price-features">
              <li>Up to 80 active students</li>
              <li>AI-powered scheduling</li>
              <li>Automated payment collection</li>
              <li>Student &amp; family portal</li>
              <li>Star AI studio advisor</li>
            </ul>
            <a href={SOLO_STRIPE} target="_blank" rel="noopener noreferrer" className="lp2-price-btn">Start Your 60-Day Free Trial</a>
          </div>

          {/* School — highlighted */}
          <div className="lp2-price-card lp2-price-popular">
            <span className="lp2-popular-badge">Most Popular</span>
            <span className="lp2-discount-badge">29% off</span>
            <div className="lp2-price-name">School</div>
            <div className="lp2-price-tagline">For studios with a teaching roster.</div>
            <div className="lp2-price-slashed">$697/mo</div>
            <div className="lp2-price-amount">$497<span className="lp2-price-mo">/mo</span></div>
            <div className="lp2-legacy-badge-card">Legacy Price — Locked For Life</div>
            <ul className="lp2-price-features">
              <li>Unlimited students</li>
              <li>Multi-teacher management</li>
              <li>Payroll &amp; financial dashboards</li>
              <li>Lead pipeline &amp; follow-up</li>
              <li>Retention system</li>
              <li>Star AI studio advisor</li>
            </ul>
            <a href={SCHOOL_STRIPE} target="_blank" rel="noopener noreferrer" className="lp2-cta lp2-price-btn-pop">Start Your 60-Day Free Trial</a>
          </div>

          {/* Multi-Location */}
          <div className="lp2-price-card">
            <span className="lp2-discount-badge">23% off</span>
            <div className="lp2-price-name">Multi-Location</div>
            <div className="lp2-price-tagline">For schools running 2+ locations.</div>
            <div className="lp2-price-slashed">$1,297/mo</div>
            <div className="lp2-price-amount">$997<span className="lp2-price-mo">/mo</span></div>
            <div className="lp2-legacy-badge-card">Legacy Price — Locked For Life</div>
            <ul className="lp2-price-features">
              <li>Everything in School</li>
              <li>Multi-location dashboards</li>
              <li>Cross-location scheduling</li>
              <li>Recruitment pipeline</li>
              <li>Priority support &amp; onboarding</li>
            </ul>
            <a href={PRO_STRIPE} target="_blank" rel="noopener noreferrer" className="lp2-price-btn">Start Your 60-Day Free Trial</a>
          </div>
        </div>

        {/* Legacy pricing urgency block */}
        <div className="lp2-legacy-block">
          <p className="lp2-legacy-text">Lock in your legacy price forever. These are launch prices — once you're in at this rate, you keep it for life no matter what. In 90 days this price goes up for everyone new. Get in now, pay this forever.</p>
          <div className="lp2-legacy-countdown">
            <span className="lp2-legacy-countdown-num">{daysLeft}</span>
            <span className="lp2-legacy-countdown-label">days until price increases</span>
          </div>
        </div>

        <p className="lp2-risk-reversal">Use it for 60 days. Free. If it doesn't change how you run your school, leave. No charge. No guilt. No catch.</p>

        {/* FAQ / Objections */}
        <div className="lp2-faq">
          <h3 className="lp2-faq-header">Yeah, But What About...</h3>
          {faqs.map((faq, i) => (
            <div key={i} className="lp2-faq-item" onClick={() => setOpenFaq(openFaq === i ? null : i)}>
              <div className="lp2-faq-q">
                <span>{faq.q}</span>
                <span className={`lp2-faq-chevron ${openFaq === i ? 'lp2-faq-chevron-open' : ''}`}>▸</span>
              </div>
              <div className={`lp2-faq-a ${openFaq === i ? 'lp2-faq-a-open' : ''}`}>
                <p>{faq.a}</p>
              </div>
            </div>
          ))}
        </div>

      </section>
    </Reveal>
  )
}

/* ═══════════════════════════════════════════════════════
   SECTION 10: FINAL CLOSE
   ═══════════════════════════════════════════════════════ */

function FinalClose() {
  return (
    <Reveal>
      <section className="lp2-section lp2-final">
        <div className="lp2-final-glow" />

        <h2 className="lp2-final-h2">You Found It. Now Start.</h2>
        <p className="lp2-final-body">You already know what's broken. You just saw the system that fixes it. 60 days free. No credit card. No risk. No reason to wait.</p>
        <CtaButton className="lp2-final-cta" />
        <p className="lp2-final-micro">Built by a music school owner. For music school owners. This is the system your school has been missing.</p>
      </section>
    </Reveal>
  )
}

function Footer() {
  const nav = useNavigate()
  return (
    <footer className="lp2-footer">
      <div className="lp2-footer-brand"><img src="/lp-logo.png?v=2" alt="" style={{ width: 24, height: 24, borderRadius: 6, verticalAlign: 'middle', marginRight: 8 }} />Lessonpreneur</div>
      <div className="lp2-footer-links">
        <button onClick={() => document.getElementById('features')?.scrollIntoView({ behavior: 'smooth' })}>Features</button>
        <button onClick={() => document.getElementById('pricing')?.scrollIntoView({ behavior: 'smooth' })}>Pricing</button>
        <button onClick={() => nav('/login')}>Log In</button>
      </div>
      <p className="lp2-footer-copy">Built by Adkins Enterprises LLC · © 2026</p>
    </footer>
  )
}

/* ═══════════════════════════════════════════════════════
   STYLES
   ═══════════════════════════════════════════════════════ */

function Styles() {
  return <style>{`
    /* ── BASE ── */
    .lp2 {
      background: #020209; color: #fff;
      font-family: 'Plus Jakarta Sans', sans-serif;
      overflow-x: hidden; font-size: 16px; line-height: 1.6;
      -webkit-font-smoothing: antialiased; position: relative;
    }
    .lp2 *, .lp2 *::before, .lp2 *::after { box-sizing: border-box; }
    .lp2 p { color: #A0A0B0; margin: 0 0 16px; }
    .lp2 a { text-decoration: none; }

    /* ── BACKGROUND ORBS ── */
    .lp2-orbs { position: fixed; inset: 0; pointer-events: none; z-index: 0; }
    .lp2-orb { position: absolute; border-radius: 50%; filter: blur(120px); }
    .lp2-orb-1 { width: 600px; height: 600px; top: -10%; left: 20%; background: radial-gradient(circle, rgba(212,34,106,0.12) 0%, transparent 70%); }
    .lp2-orb-2 { width: 500px; height: 500px; top: 45%; right: -10%; background: radial-gradient(circle, rgba(255,85,0,0.08) 0%, transparent 70%); }
    .lp2-orb-3 { width: 600px; height: 600px; bottom: 5%; left: 10%; background: radial-gradient(circle, rgba(212,34,106,0.10) 0%, transparent 70%); }

    /* ── FLOATING PARTICLES ── */
    .lp2-particles { position: fixed; inset: 0; pointer-events: none; z-index: 0; overflow: hidden; }
    .lp2-particle { position: absolute; border-radius: 50%; background: #D4226A; animation: lp2-drift linear infinite; }
    @keyframes lp2-drift {
      0% { transform: translateY(0) translateX(0); }
      33% { transform: translateY(-30vh) translateX(15px); }
      66% { transform: translateY(-60vh) translateX(-10px); }
      100% { transform: translateY(-90vh) translateX(5px); }
    }

    /* ── NAV ── */
    .lp2-nav {
      position: fixed; top: 0; left: 0; right: 0; z-index: 100;
      padding: 14px 20px; display: flex; align-items: center; justify-content: space-between;
      transition: background 0.3s, backdrop-filter 0.3s, border-color 0.3s;
      border-bottom: 1px solid transparent;
    }
    .lp2-nav-solid { background: rgba(2,2,9,0.92); backdrop-filter: blur(16px); border-bottom-color: rgba(255,255,255,0.06); }
    .lp2-nav-brand { font-size: 18px; font-weight: 800; letter-spacing: -0.02em; background: linear-gradient(90deg, #D4226A, #FF5500, #FFB800); -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent; color: transparent; }
    .lp2-nav-links { display: none; gap: 24px; }
    .lp2-nav-links button { background: none; border: none; color: #A0A0B0; font-size: 14px; font-weight: 500; cursor: pointer; font-family: inherit; transition: color 0.2s; }
    .lp2-nav-links button:hover { color: #fff; }
    .lp2-nav-cta { padding: 8px 20px; border-radius: 8px; background: #D4226A; color: #000000 !important; font-size: 13px; font-weight: 700; font-family: inherit; transition: background 0.2s; }
    .lp2-nav-cta:hover { background: #E8488A; }
    @media (min-width: 768px) { .lp2-nav-links { display: flex; } .lp2-nav { padding: 14px 40px; } }

    /* ── REVEAL ── */
    .lp2-reveal { opacity: 0; transform: translateY(30px); transition: opacity 0.6s ease-out, transform 0.6s ease-out; }
    .lp2-visible { opacity: 1; transform: translateY(0); }

    /* ── CTA BUTTON ── */
    .lp2-cta {
      display: inline-flex; align-items: center; justify-content: center;
      padding: 18px 36px; border-radius: 10px; background: #D4226A; color: #000000 !important;
      font-size: 17px; font-weight: 700; font-family: inherit; border: none; cursor: pointer;
      transition: transform 0.15s, box-shadow 0.15s, background 0.2s;
      animation: lp2-glow 2s ease-in-out infinite;
    }
    .lp2-cta:hover { transform: translateY(-2px); box-shadow: 0 12px 40px rgba(212,34,106,0.4); background: #E8488A; }
    @keyframes lp2-glow {
      0%, 100% { box-shadow: 0 0 0 0 rgba(212,34,106,0.3); }
      50% { box-shadow: 0 0 20px 4px rgba(212,34,106,0.15); }
    }

    /* ── SECTIONS — more breathing room ── */
    .lp2-section { padding: 65px 24px; max-width: 960px; margin: 0 auto; position: relative; z-index: 1; }
    .lp2-section-h2 { font-size: clamp(1.75rem, 5vw, 3rem); font-weight: 900; color: #fff; line-height: 1.15; letter-spacing: -0.03em; margin: 0 0 28px; }

    /* ── Inline highlights ── */
    .lp2-highlight { color: #D4226A; font-weight: 600; }
    .lp2-highlight-white { color: #fff; font-weight: 700; }

    /* ═══ SECTION 1: HERO ═══ */
    .lp2-hero {
      min-height: 100vh; min-height: 100dvh; display: flex; align-items: center; justify-content: center;
      padding: 70px 20px 24px; position: relative; overflow: hidden; z-index: 1;
    }
    .lp2-hero-gradient {
      position: absolute; inset: 0;
      background: linear-gradient(135deg, rgba(212,34,106,0.08) 0%, rgba(255,85,0,0.04) 50%, rgba(2,2,9,1) 100%);
      background-size: 300% 300%; animation: lp2-herograd 10s ease infinite;
    }
    @keyframes lp2-herograd { 0%, 100% { background-position: 0% 50%; } 50% { background-position: 100% 50%; } }
    .lp2-hero-content { position: relative; z-index: 1; max-width: 1200px; width: 100%; }
    .lp2-hero-copy { text-align: center; margin-bottom: 16px; }
    .lp2-hero-h1 {
      font-size: clamp(1.9rem, 6.5vw, 3.8rem); font-weight: 900; line-height: 1.08;
      letter-spacing: -0.04em; margin: 0 0 10px; color: #fff;
    }
    .lp2-hero-sub { font-size: clamp(0.88rem, 2.2vw, 1.1rem); color: #A0A0B0; line-height: 1.5; margin-bottom: 8px; max-width: 560px; margin-left: auto; margin-right: auto; }
    .lp2-hero-proof { font-size: 13px; color: #6868A0; margin-bottom: 28px; font-style: italic; }
    .lp2-hero-risk { font-size: 12px; color: #6868A0; margin-top: 6px; margin-bottom: 10px; }
    .lp2-hero-quote {
      margin: 0 auto; padding: 10px 16px; border-left: 3px solid rgba(212,34,106,0.5);
      background: rgba(212,34,106,0.04); border-radius: 0 8px 8px 0;
      max-width: 520px; text-align: left;
    }
    .lp2-hero-quote-text {
      font-size: 0.85rem; font-style: italic; color: #c8c8e0; font-weight: 500; margin: 0 0 4px; line-height: 1.45;
    }
    .lp2-hero-quote-attr { font-size: 0.78rem; color: #8888B0; margin: 0; font-weight: 600; }

    /* ── Desktop hero layout ── */
    @media (min-width: 768px) {
      .lp2-hero { padding: 90px 32px 40px; }
      .lp2-hero-content { display: flex; align-items: center; gap: 40px; }
      .lp2-hero-copy { text-align: left; flex: 0 0 48%; margin-bottom: 0; }
      .lp2-hero-copy .lp2-hero-sub { margin-left: 0; margin-right: 0; }
    }
    @media (min-width: 1025px) {
      .lp2-hero-content { gap: 56px; }
    }

    /* ── Andrea testimonial (above pricing) ── */
    .lp2-andrea-testimonial {
      max-width: 720px; margin: 0 auto; padding: 32px 28px; text-align: center;
      background: rgba(212,34,106,0.04); border: 1px solid rgba(212,34,106,0.12);
      border-radius: 16px; position: relative;
    }
    .lp2-andrea-stars { font-size: 1.3rem; letter-spacing: 0.15em; color: #FACC15; margin-bottom: 12px; text-shadow: 0 0 12px rgba(250,204,21,0.3); }
    .lp2-andrea-quote {
      font-size: 1.05rem; font-style: italic; color: #e0e0f0; font-weight: 600;
      line-height: 1.6; margin: 0 0 12px; padding: 0;
    }
    .lp2-andrea-attr { font-size: 0.88rem; color: #8888B0; margin: 0; font-weight: 600; }

    /* ── Dashboard Mockup (used in gallery) ── */
    .lp2-dash-frame {
      border-radius: 16px; overflow: hidden; background: #0A0A14;
      border: 1px solid rgba(255,255,255,0.1);
      box-shadow: 0 40px 100px rgba(212,34,106,0.18), 0 12px 40px rgba(0,0,0,0.6);
    }
    .lp2-dash-chrome { display: flex; align-items: center; gap: 10px; padding: 10px 14px; background: rgba(255,255,255,0.02); border-bottom: 1px solid rgba(255,255,255,0.06); }
    .lp2-dash-dots { display: flex; gap: 6px; }
    .lp2-dash-dots span { width: 9px; height: 9px; border-radius: 50%; }
    .lp2-dash-url { font-size: 10px; color: #6868A0; padding: 3px 12px; background: rgba(255,255,255,0.04); border-radius: 5px; flex: 1; text-align: center; }
    .lp2-dash-body { padding: 16px 18px 20px; }
    .lp2-dash-stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-bottom: 16px; }
    .lp2-dash-stat { text-align: center; padding: 10px 6px; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06); border-radius: 8px; }
    .lp2-dash-stat-num { display: block; font-size: 18px; font-weight: 800; line-height: 1.2; }
    .lp2-dash-stat-label { font-size: 9px; color: #6868A0; text-transform: uppercase; letter-spacing: 0.05em; margin-top: 2px; display: block; }
    .lp2-dash-chart-wrap { margin-bottom: 14px; padding: 12px; border-radius: 10px; background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.05); }
    .lp2-dash-chart-title { font-size: 10px; font-weight: 700; color: #6868A0; margin-bottom: 8px; text-transform: uppercase; letter-spacing: 0.05em; }
    .lp2-dash-chart { display: flex; align-items: flex-end; gap: 8px; height: 60px; }
    .lp2-dash-chart-col { flex: 1; display: flex; flex-direction: column; align-items: center; height: 100%; justify-content: flex-end; }
    .lp2-dash-chart-bar { width: 100%; border-radius: 3px 3px 0 0; opacity: 0.85; transition: opacity 0.2s; }
    .lp2-dash-chart-label { font-size: 8px; color: #6868A0; margin-top: 4px; }
    .lp2-dash-actions { display: flex; flex-direction: column; gap: 6px; }
    .lp2-dash-action { display: flex; align-items: center; gap: 8px; padding: 8px 10px; border-radius: 8px; background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.05); }
    .lp2-dash-action-dot { width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0; }
    .lp2-dash-action-text { flex: 1; font-size: 11px; color: #c0c0d0; font-weight: 500; }
    .lp2-dash-action-arrow { color: #FF5500; font-size: 12px; font-weight: 700; }
    .lp2-dash-action-badge { font-size: 9px; font-weight: 700; padding: 2px 8px; border-radius: 4px; }
    .lp2-dash-badge-alert { background: rgba(212,34,106,0.12); color: #D4226A; }
    .lp2-dash-badge-good { background: rgba(34,197,94,0.12); color: #22C55E; }

    @media (max-width: 480px) {
      .lp2-dash-stats { grid-template-columns: repeat(2, 1fr); }
    }

    /* ═══ SECTION 2: PAIN SPIRAL — Cards with pink headers ═══ */
    .lp2-pain { max-width: 700px; }
    .lp2-pain-headline { position: relative; }
    .lp2-pain-headline::after { content: ''; display: block; width: 80px; height: 3px; background: linear-gradient(90deg, #D4226A, transparent); margin-top: 16px; border-radius: 2px; }
    .lp2-pain-cards { display: flex; flex-direction: column; gap: 16px; margin: 40px 0 48px; }
    .lp2-pain-card {
      padding: 24px 24px 20px; border-radius: 14px;
      background: rgba(255,255,255,0.025); border: 1px solid rgba(255,255,255,0.06);
      border-left: 3px solid #D4226A;
      opacity: 0; transform: translateY(16px);
      transition: opacity 0.5s ease, transform 0.5s ease;
    }
    .lp2-pain-card-visible { opacity: 1; transform: translateY(0); }
    .lp2-pain-card-header {
      font-size: 0.8rem; font-weight: 800; color: #D4226A;
      text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 8px;
    }
    .lp2-pain-card-body { font-size: 1.05rem; color: #c8c8d8; line-height: 1.7; margin: 0; }
    .lp2-pain-transition {
      font-size: 1.15rem; color: #D4226A; font-weight: 700; line-height: 1.5;
      text-align: center; max-width: 540px; margin: 0 auto;
    }

    /* ═══ SECTION 3: STATUS QUO KILL ═══ */
    .lp2-statusquo { max-width: 700px; }
    .lp2-statusquo-body { margin-bottom: 48px; }
    .lp2-statusquo-body p { font-size: 1.05rem; line-height: 1.75; margin-bottom: 20px; }
    .lp2-cost-card {
      padding: 36px 32px; border-radius: 18px;
      background: rgba(255,85,0,0.03); border: 2px solid rgba(255,85,0,0.25);
      box-shadow: 0 0 60px rgba(255,85,0,0.08), inset 0 0 40px rgba(255,85,0,0.02);
      position: relative;
    }
    .lp2-cost-icon { position: absolute; top: -18px; left: 28px; font-size: 28px; background: #020209; padding: 0 8px; }
    .lp2-cost-headline { font-size: clamp(1.3rem, 4vw, 1.85rem); font-weight: 800; color: #fff; margin: 0 0 20px; line-height: 1.25; }
    .lp2-cost-card p { font-size: 1rem; line-height: 1.7; }
    .lp2-cost-numbers { text-align: center; margin: 16px 0 20px; }
    .lp2-cost-num-big { display: block; font-size: clamp(1.8rem, 5vw, 2.5rem); font-weight: 900; color: #FF5500; line-height: 1.1; }
    .lp2-cost-num-huge { display: block; font-size: clamp(2.2rem, 6vw, 3.2rem); font-weight: 900; color: #D4226A; line-height: 1.1; }
    .lp2-cost-num-label { display: block; font-size: 0.9rem; color: #A0A0B0; margin-top: 4px; }
    .lp2-cost-closer { color: #fff !important; font-weight: 700; font-size: 1.1rem; margin-top: 8px; }

    /* ═══ SECTION 4: CATEGORY REPOSITIONING ═══ */
    .lp2-reposition { text-align: center; max-width: 700px; padding-top: 80px; padding-bottom: 40px; }
    .lp2-reposition-h2 { font-size: clamp(2rem, 6vw, 3.5rem); font-weight: 900; color: #fff; margin: 0; line-height: 1.1; }
    .lp2-reposition-sub { font-size: clamp(1.25rem, 3.5vw, 2rem); font-weight: 700; color: #A0A0B0; margin: 4px 0 32px; }
    .lp2-reposition-rhythm {
      font-size: clamp(1.1rem, 2.5vw, 1.3rem); color: #FFB800; font-weight: 700;
      line-height: 1.7; margin-bottom: 20px;
    }
    .lp2-reposition-founder { font-size: 1rem; color: #A0A0B0; margin-bottom: 0; }
    .lp2-tagline-moment {
      padding: 72px 24px; margin-top: 32px; position: relative; overflow: hidden;
    }
    .lp2-tagline-glow {
      position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);
      width: 500px; height: 300px; border-radius: 50%;
      background: radial-gradient(ellipse at center, rgba(212,34,106,0.14) 0%, transparent 65%);
      filter: blur(40px); pointer-events: none;
    }
    .lp2-tagline {
      font-size: clamp(2rem, 6vw, 3.5rem); font-weight: 900; color: #fff; line-height: 1.15;
      position: relative; letter-spacing: -0.03em;
    }

    /* ═══ SECTION 5: TRANSFORMATION CARDS ═══ */
    .lp2-transforms { max-width: 960px; }
    .lp2-transform-grid { display: grid; grid-template-columns: 1fr; gap: 18px; }
    @media (min-width: 640px) { .lp2-transform-grid { grid-template-columns: 1fr 1fr; } }
    @media (min-width: 960px) { .lp2-transform-grid { grid-template-columns: 1fr 1fr 1fr; } }
    .lp2-tcard {
      padding: 28px 24px; border-radius: 14px;
      background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08);
      border-top: 3px solid #D4226A;
      backdrop-filter: blur(12px);
      transition: transform 0.2s, border-color 0.2s, box-shadow 0.2s, opacity 0.5s ease;
      opacity: 0; transform: translateY(20px);
    }
    .lp2-tcard-visible { opacity: 1; transform: translateY(0); }
    .lp2-tcard:hover { transform: translateY(-3px); border-color: rgba(255,255,255,0.14); box-shadow: 0 12px 40px rgba(0,0,0,0.3); }
    .lp2-tcard-bold { font-size: 1.1rem; font-weight: 800; color: #fff; margin: 0 0 10px; line-height: 1.35; }
    .lp2-tcard-support { font-size: 0.92rem; color: #A0A0B0; margin: 0; line-height: 1.6; }
    .lp2-transform-cta { text-align: center; margin-top: 48px; }

    /* ═══ SECTION 6: THE BRAIN — Static, no rotation ═══ */
    .lp2-brain-section { max-width: 1060px; }
    .lp2-brain-layout { display: flex; flex-direction: column; gap: 48px; }
    @media (min-width: 960px) {
      .lp2-brain-layout { flex-direction: row; align-items: center; }
      .lp2-brain-copy { flex: 1; }
      .lp2-brain-viz-wrap { flex: 0 0 440px; }
    }
    .lp2-brain-copy p { font-size: 1.05rem; line-height: 1.75; margin-bottom: 18px; }
    .lp2-brain-closing { color: #D4226A !important; font-weight: 700; font-size: 1.2rem !important; }
    .lp2-brain-ai-frame { font-size: 0.92rem !important; color: #6868A0 !important; font-style: italic; border-left: 2px solid rgba(212,34,106,0.3); padding-left: 16px; margin-top: 24px; }

    /* Brain — CSS-based, no rotation */
    .lp2-brain {
      position: relative; width: 100%; max-width: 400px; margin: 0 auto;
      aspect-ratio: 1; min-height: 320px;
    }
    .lp2-brain-glow {
      position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);
      width: 60%; height: 60%; border-radius: 50%;
      background: radial-gradient(circle, rgba(212,34,106,0.2) 0%, transparent 70%);
      filter: blur(30px); pointer-events: none;
    }
    .lp2-brain-svg {
      position: absolute; top: 5%; left: 10%; width: 80%; height: 80%; z-index: 1;
    }
    .lp2-brain-core-svg { animation: lp2-core-pulse 3s ease-in-out infinite; }
    @keyframes lp2-core-pulse { 0%, 100% { opacity: 0.3; } 50% { opacity: 0.7; } }
    .lp2-brain-lines {
      position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none;
    }
    .lp2-brain-line { stroke-dashoffset: 100; animation: lp2-line-flow 4s linear infinite; }
    @keyframes lp2-line-flow { 0% { stroke-dashoffset: 100; } 100% { stroke-dashoffset: 0; } }
    .lp2-brain-node {
      position: absolute; transform: translate(-50%, -50%);
      display: flex; align-items: center; gap: 6px;
      padding: 5px 12px 5px 8px; border-radius: 20px;
      background: rgba(10,10,20,0.85); border: 1px solid;
      backdrop-filter: blur(8px);
      opacity: 0; animation: lp2-node-in 0.4s ease-out forwards;
    }
    .lp2-brain:not(.lp2-brain-active) .lp2-brain-node { animation: none; opacity: 0; }
    .lp2-brain-node-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
    .lp2-brain-node-label { font-size: 12px; font-weight: 700; color: #fff; white-space: nowrap; }
    @keyframes lp2-node-in { from { opacity: 0; transform: translate(-50%, -50%) scale(0.8); } to { opacity: 1; transform: translate(-50%, -50%) scale(1); } }

    /* ═══ SECTION 7: PRODUCT PROOF GALLERY ═══ */
    .lp2-gallery-section { max-width: 1100px; }
    .lp2-gallery-sub { text-align: center; color: #6868A0; margin-bottom: 36px; }

    .lp2-gallery-mobile { display: block; }
    .lp2-gallery-scroll {
      display: flex; overflow-x: auto; scroll-snap-type: x mandatory;
      scrollbar-width: none; -webkit-overflow-scrolling: touch; gap: 0;
    }
    .lp2-gallery-scroll::-webkit-scrollbar { display: none; }
    .lp2-gallery-slide { min-width: 100%; scroll-snap-align: start; padding: 0 10px; }
    .lp2-gallery-dots { display: flex; justify-content: center; gap: 8px; margin-top: 16px; }
    .lp2-gallery-dot { width: 8px; height: 8px; border-radius: 50%; background: rgba(255,255,255,0.15); border: none; cursor: pointer; padding: 0; transition: all 0.2s; }
    .lp2-gallery-dot-on { background: #D4226A; box-shadow: 0 0 8px rgba(212,34,106,0.4); }

    .lp2-gallery-desktop { display: none; }
    @media (min-width: 768px) {
      .lp2-gallery-mobile { display: none; }
      .lp2-gallery-desktop { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
    }
    @media (min-width: 1025px) { .lp2-gallery-desktop { grid-template-columns: 1fr 1fr 1fr; } }
    .lp2-gallery-card { transition: transform 0.2s, box-shadow 0.2s; border-radius: 14px; overflow: hidden; }
    .lp2-gallery-card:hover { transform: scale(1.02); box-shadow: 0 12px 40px rgba(0,0,0,0.4); }

    /* ── Device Frames ── */
    .lp2-device { border-radius: 14px; overflow: hidden; background: #0A0A14; border: 1px solid rgba(255,255,255,0.08); box-shadow: 0 8px 32px rgba(0,0,0,0.4); }
    .lp2-device-phone { border-radius: 20px; max-width: 300px; margin: 0 auto; }
    .lp2-device-notch { width: 60px; height: 4px; background: rgba(255,255,255,0.08); border-radius: 0 0 6px 6px; margin: 0 auto; }
    .lp2-device-chrome { display: flex; align-items: center; gap: 10px; padding: 8px 12px; background: rgba(255,255,255,0.02); border-bottom: 1px solid rgba(255,255,255,0.06); }
    .lp2-device-dots { display: flex; gap: 5px; }
    .lp2-device-dots span { width: 8px; height: 8px; border-radius: 50%; }
    .lp2-device-url { font-size: 10px; color: #6868A0; padding: 3px 10px; background: rgba(255,255,255,0.03); border-radius: 4px; flex: 1; text-align: center; }
    .lp2-device-title { font-size: 12px; font-weight: 800; color: #fff; padding: 10px 14px 0; }
    .lp2-device-body { padding: 10px 14px 14px; }

    /* ── Mock Dashboard (gallery) ── */
    .lp2-mock-stats { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; margin-bottom: 10px; }
    .lp2-mock-stat { text-align: center; padding: 6px 4px; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06); border-radius: 6px; }
    .lp2-mock-stat-n { display: block; font-size: 14px; font-weight: 800; }
    .lp2-mock-stat-l { font-size: 8px; color: #6868A0; text-transform: uppercase; letter-spacing: 0.05em; }
    .lp2-mock-chart { display: flex; align-items: flex-end; gap: 5px; height: 40px; margin-bottom: 10px; }
    .lp2-mock-chart-bar { flex: 1; border-radius: 2px 2px 0 0; opacity: 0.8; }
    .lp2-mock-actions { display: flex; flex-direction: column; gap: 4px; }
    .lp2-mock-action-item { display: flex; align-items: center; gap: 6px; font-size: 10px; color: #A0A0B0; padding: 4px 6px; background: rgba(255,255,255,0.02); border-radius: 4px; }
    .lp2-mock-action-dot { width: 5px; height: 5px; border-radius: 50%; flex-shrink: 0; }

    /* ── Mock Schedule ── */
    .lp2-mock-schedule { overflow-x: auto; }
    .lp2-mock-sched-header { display: flex; gap: 3px; margin-bottom: 4px; }
    .lp2-mock-sched-teacher-col { width: 50px; flex-shrink: 0; }
    .lp2-mock-sched-time { flex: 1; font-size: 8px; color: #6868A0; text-align: center; font-weight: 700; }
    .lp2-mock-sched-row { display: flex; gap: 3px; margin-bottom: 3px; }
    .lp2-mock-sched-teacher { width: 50px; flex-shrink: 0; font-size: 8px; font-weight: 700; color: #A0A0B0; display: flex; align-items: center; }
    .lp2-mock-sched-filled { flex: 1; padding: 3px 4px; border-radius: 4px; background: rgba(212,34,106,0.12); border: 1px solid rgba(212,34,106,0.2); font-size: 7px; color: #fff; text-align: center; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .lp2-mock-sched-open { flex: 1; padding: 3px 4px; border-radius: 4px; border: 1px dashed rgba(34,197,94,0.3); font-size: 7px; color: #6868A0; text-align: center; font-weight: 600; }

    /* ── Schedule Revenue Badge ── */
    .lp2-sched-revenue-badge {
      margin: 12px auto 0; padding: 10px 16px; border-radius: 10px; text-align: center;
      background: rgba(255,85,0,0.04); border: 1px solid rgba(255,85,0,0.2);
    }
    .lp2-sched-revenue-calc { font-size: 0.82rem; color: #A0A0B0; }
    .lp2-sched-revenue-total { font-size: 1.1rem; font-weight: 900; color: #FF5500; }
    .lp2-sched-revenue-sub { display: block; font-size: 0.72rem; color: #6868A0; margin-top: 2px; }

    /* ── Mock Leads Pipeline ── */
    .lp2-mock-pipeline { display: flex; gap: 6px; overflow-x: auto; }
    .lp2-mock-pipe-col { flex: 1; min-width: 70px; }
    .lp2-mock-pipe-glow { position: relative; }
    .lp2-mock-pipe-glow::before { content: ''; position: absolute; inset: -2px; border-radius: 8px; background: rgba(212,34,106,0.06); z-index: -1; }
    .lp2-mock-pipe-header { font-size: 9px; font-weight: 700; color: #A0A0B0; margin-bottom: 4px; display: flex; align-items: center; gap: 4px; }
    .lp2-mock-pipe-count { font-size: 8px; color: #6868A0; background: rgba(255,255,255,0.06); border-radius: 3px; padding: 0 4px; }
    .lp2-mock-pipe-card { padding: 5px 6px; border-radius: 5px; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06); margin-bottom: 3px; }
    .lp2-mock-pipe-name { font-size: 8px; font-weight: 700; color: #fff; }
    .lp2-mock-pipe-meta { font-size: 7px; color: #6868A0; }

    /* ── Mock Student Profile ── */
    .lp2-mock-profile { text-align: center; }
    .lp2-mock-profile-avatar { width: 48px; height: 48px; border-radius: 14px; background: #D4226A; display: flex; align-items: center; justify-content: center; font-size: 16px; font-weight: 800; color: #fff; margin: 0 auto 8px; }
    .lp2-mock-profile-name { font-size: 14px; font-weight: 800; color: #fff; }
    .lp2-mock-profile-meta { font-size: 10px; color: #6868A0; margin-bottom: 12px; }
    .lp2-mock-profile-details { text-align: left; }
    .lp2-mock-profile-row { display: flex; justify-content: space-between; padding: 5px 0; border-bottom: 1px solid rgba(255,255,255,0.04); font-size: 10px; color: #A0A0B0; }
    .lp2-mock-profile-label { color: #6868A0; }
    .lp2-mock-badge-active { color: #22C55E; font-weight: 700; }
    .lp2-mock-profile-notes { margin-top: 10px; padding: 8px; border-radius: 8px; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06); text-align: left; }
    .lp2-mock-profile-notes-title { font-size: 9px; font-weight: 700; color: #D4226A; margin-bottom: 4px; text-transform: uppercase; letter-spacing: 0.05em; }
    .lp2-mock-profile-notes p { font-size: 10px; color: #A0A0B0; line-height: 1.5; margin: 0; }

    /* ── Mock Family View ── */
    .lp2-mock-family-welcome { font-size: 13px; font-weight: 800; color: #fff; margin-bottom: 10px; }
    .lp2-mock-family-students { display: flex; flex-direction: column; gap: 6px; margin-bottom: 10px; }
    .lp2-mock-family-student { display: flex; align-items: center; gap: 8px; padding: 6px 8px; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06); border-radius: 8px; }
    .lp2-mock-family-avatar { width: 28px; height: 28px; border-radius: 8px; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 800; color: #fff; flex-shrink: 0; }
    .lp2-mock-family-sname { font-size: 11px; font-weight: 700; color: #fff; }
    .lp2-mock-family-next { font-size: 9px; color: #6868A0; }
    .lp2-mock-family-update { padding: 8px; border-radius: 8px; background: rgba(34,197,94,0.04); border: 1px solid rgba(34,197,94,0.12); margin-bottom: 8px; }
    .lp2-mock-family-update-title { font-size: 9px; font-weight: 700; color: #22C55E; margin-bottom: 3px; text-transform: uppercase; letter-spacing: 0.05em; }
    .lp2-mock-family-update p { font-size: 10px; color: #A0A0B0; line-height: 1.5; margin: 0; }
    .lp2-mock-family-milestone { text-align: center; margin-top: 4px; }
    .lp2-mock-family-milestone-badge { display: inline-block; padding: 4px 12px; border-radius: 6px; background: rgba(255,184,0,0.1); border: 1px solid rgba(255,184,0,0.2); color: #FFB800; font-size: 11px; font-weight: 700; }

    /* ── Mock AI Chat ── */
    .lp2-mock-chat { display: flex; flex-direction: column; gap: 6px; }
    .lp2-mock-chat-bubble { padding: 8px 10px; border-radius: 10px; font-size: 10px; line-height: 1.5; max-width: 90%; }
    .lp2-mock-chat-star { background: rgba(212,34,106,0.08); border: 1px solid rgba(212,34,106,0.15); color: #c8c8d8; align-self: flex-start; }
    .lp2-mock-chat-user { background: rgba(255,255,255,0.06); color: #fff; font-weight: 600; align-self: flex-end; }

    /* ═══ SECTION 8: RETENTION + ROLES ═══ */
    .lp2-retention { max-width: 800px; }
    .lp2-retention-content { margin-bottom: 48px; }
    .lp2-retention-content p { font-size: 1.05rem; line-height: 1.75; }
    .lp2-retention-closer { color: #D4226A !important; font-weight: 700; font-size: 1.1rem; }
    .lp2-roles-sub { font-size: 1.4rem; font-weight: 800; color: #fff; margin: 0 0 20px; text-align: center; }
    .lp2-roles-grid { display: grid; grid-template-columns: 1fr; gap: 14px; margin-bottom: 24px; }
    @media (min-width: 640px) { .lp2-roles-grid { grid-template-columns: 1fr 1fr 1fr; } }
    .lp2-role-card { padding: 22px; border-radius: 12px; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08); border-top: 3px solid; }
    .lp2-role-pink { border-top-color: #D4226A; }
    .lp2-role-orange { border-top-color: #FF5500; }
    .lp2-role-gold { border-top-color: #FFB800; }
    .lp2-role-title { font-size: 1.05rem; font-weight: 800; color: #fff; margin-bottom: 8px; }
    .lp2-role-card p { font-size: 0.92rem; margin: 0; line-height: 1.55; }
    .lp2-adoption { font-size: 0.95rem; color: #A0A0B0; text-align: center; font-style: italic; margin-top: 12px; padding: 16px; background: rgba(255,255,255,0.02); border-radius: 10px; border: 1px solid rgba(255,255,255,0.05); }

    /* ═══ SECTION 9: PRICING ═══ */
    .lp2-pricing { max-width: 1060px; }
    .lp2-pricing-sub { text-align: center; color: #A0A0B0; margin-bottom: 36px; }
    .lp2-pricing-grid { display: grid; grid-template-columns: 1fr; gap: 16px; max-width: 960px; margin: 0 auto; }
    @media (min-width: 768px) { .lp2-pricing-grid { grid-template-columns: repeat(3, 1fr); } }
    .lp2-price-card {
      padding: 28px 24px; border-radius: 16px;
      background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08);
      display: flex; flex-direction: column; position: relative;
      transition: transform 0.2s, box-shadow 0.2s;
    }
    .lp2-price-card:hover { transform: translateY(-2px); box-shadow: 0 12px 40px rgba(0,0,0,0.3); }
    .lp2-price-popular { border-color: rgba(212,34,106,0.3); background: rgba(212,34,106,0.04); box-shadow: 0 0 40px rgba(212,34,106,0.08); }
    @media (min-width: 768px) { .lp2-price-popular { transform: scale(1.04); z-index: 1; } .lp2-price-popular:hover { transform: scale(1.06); } }
    .lp2-popular-badge { position: absolute; top: -12px; left: 50%; transform: translateX(-50%); padding: 4px 14px; border-radius: 6px; background: #D4226A; color: #fff; font-size: 11px; font-weight: 700; white-space: nowrap; }
    .lp2-price-name { font-size: 1.3rem; font-weight: 800; color: #fff; margin-bottom: 4px; }
    .lp2-price-tagline { font-size: 0.85rem; color: #A0A0B0; margin-bottom: 16px; }
    .lp2-price-amount { font-size: 2.5rem; font-weight: 900; color: #fff; margin-bottom: 4px; }
    .lp2-price-mo { font-size: 1rem; font-weight: 500; color: #6868A0; }
    .lp2-price-features { list-style: none; padding: 0; margin: 16px 0; flex: 1; }
    .lp2-price-features li { font-size: 0.9rem; color: #A0A0B0; padding: 5px 0; display: flex; align-items: center; gap: 8px; }
    .lp2-price-features li::before { content: '✓'; color: #D4226A; font-weight: 700; font-size: 0.8rem; flex-shrink: 0; }
    .lp2-price-btn {
      display: block; text-align: center; padding: 14px 24px; border-radius: 10px;
      background: transparent; border: 1px solid rgba(255,255,255,0.12); color: #A0A0B0;
      font-size: 0.9rem; font-weight: 700; font-family: inherit; cursor: pointer;
      transition: border-color 0.2s, color 0.2s;
    }
    .lp2-price-btn:hover { border-color: rgba(212,34,106,0.4); color: #fff; }
    .lp2-price-btn-pop { display: block; width: 100%; text-align: center; padding: 14px 24px; border-radius: 10px; font-size: 0.95rem; }

    .lp2-price-slashed { font-size: 0.95rem; color: #6868A0; text-decoration: line-through; margin-bottom: 2px; }
    .lp2-discount-badge { position: absolute; top: 12px; right: 12px; padding: 3px 10px; border-radius: 6px; background: rgba(34,197,94,0.12); border: 1px solid rgba(34,197,94,0.25); color: #22C55E; font-size: 11px; font-weight: 700; }
    .lp2-legacy-badge-card { display: inline-block; padding: 4px 12px; border-radius: 6px; background: rgba(255,184,0,0.08); border: 1px solid rgba(255,184,0,0.2); color: #FFB800; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; margin-bottom: 12px; }
    .lp2-legacy-block { max-width: 700px; margin: 32px auto 0; padding: 24px 28px; border-radius: 16px; background: rgba(212,34,106,0.05); border: 1px solid rgba(212,34,106,0.2); display: flex; align-items: center; gap: 24px; flex-wrap: wrap; }
    .lp2-legacy-text { flex: 1; min-width: 200px; font-size: 0.95rem; color: #E8E8FC; line-height: 1.65; margin: 0; font-weight: 500; }
    .lp2-legacy-countdown { display: flex; flex-direction: column; align-items: center; flex-shrink: 0; }
    .lp2-legacy-countdown-num { font-size: 2.5rem; font-weight: 900; letter-spacing: -0.03em; background: linear-gradient(135deg, #D4226A, #FF5500); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; line-height: 1; }
    .lp2-legacy-countdown-label { font-size: 10px; color: #A0A0B0; font-weight: 600; text-transform: uppercase; letter-spacing: 0.06em; margin-top: 2px; }
    .lp2-risk-reversal { text-align: center; color: #A0A0B0; font-size: 1rem; margin: 36px auto 52px; max-width: 600px; line-height: 1.6; }

    /* FAQ */
    .lp2-faq { max-width: 640px; margin: 0 auto; }
    .lp2-faq-header { font-size: 1.4rem; font-weight: 800; color: #fff; margin: 0 0 16px; text-align: center; }
    .lp2-faq-item {
      padding: 16px 20px; border-radius: 12px; margin-bottom: 8px;
      background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08);
      cursor: pointer; -webkit-tap-highlight-color: transparent; transition: border-color 0.2s;
    }
    .lp2-faq-item:hover { border-color: rgba(255,255,255,0.14); }
    .lp2-faq-q { display: flex; justify-content: space-between; align-items: center; font-size: 0.95rem; font-weight: 600; color: #fff; }
    .lp2-faq-chevron { color: #6868A0; font-size: 0.9rem; transition: transform 0.2s; }
    .lp2-faq-chevron-open { transform: rotate(90deg); }
    .lp2-faq-a { max-height: 0; overflow: hidden; transition: max-height 0.3s ease, padding 0.3s ease; }
    .lp2-faq-a-open { max-height: 200px; padding-top: 12px; }
    .lp2-faq-a p { font-size: 0.9rem; color: #A0A0B0; line-height: 1.6; margin: 0; }
    .lp2-pricing-final-cta { text-align: center; margin-top: 44px; }

    /* ═══ SECTION 10: FINAL CLOSE ═══ */
    .lp2-final { text-align: center; padding: 120px 24px 80px; max-width: 700px; position: relative; overflow: hidden; }
    .lp2-final-glow {
      position: absolute; top: 40%; left: 50%; transform: translate(-50%, -50%);
      width: 600px; height: 400px; border-radius: 50%;
      background: radial-gradient(ellipse at center, rgba(212,34,106,0.12) 0%, rgba(255,85,0,0.06) 40%, transparent 70%);
      filter: blur(60px); pointer-events: none;
    }
    .lp2-final-h2 { font-size: clamp(2.2rem, 7vw, 4rem); font-weight: 900; color: #fff; margin: 0 0 20px; line-height: 1.08; position: relative; }
    .lp2-final-body { font-size: 1.15rem; color: #A0A0B0; margin-bottom: 36px; line-height: 1.6; position: relative; }
    .lp2-final-cta { font-size: 1.25rem; padding: 22px 52px; position: relative; color: #000000 !important; }
    .lp2-final-micro { font-size: 0.9rem; color: #6868A0; margin-top: 16px; position: relative; }

    /* ── FOOTER ── */
    .lp2-footer { padding: 40px 20px; border-top: 1px solid rgba(255,255,255,0.06); text-align: center; position: relative; z-index: 1; }
    .lp2-footer-brand { font-size: 16px; font-weight: 800; color: #6868A0; margin-bottom: 12px; }
    .lp2-footer-links { display: flex; gap: 16px; justify-content: center; flex-wrap: wrap; margin-bottom: 12px; }
    .lp2-footer-links button { background: none; border: none; color: #6868A0; font-size: 13px; cursor: pointer; font-family: inherit; transition: color 0.2s; }
    .lp2-footer-links button:hover { color: #A0A0B0; }
    .lp2-footer-copy { font-size: 12px; color: #4a4a60; margin: 0; }

    /* ═══ ROI CALCULATOR ═══ */
    .lp2-roi {
      margin-top: 32px; padding: 24px 22px; border-radius: 18px;
      background: rgba(255,255,255,0.025);
      border: 1px solid rgba(212,34,106,0.15);
      backdrop-filter: blur(16px);
      box-shadow: 0 8px 40px rgba(0,0,0,0.3), 0 0 60px rgba(212,34,106,0.04), inset 0 1px 0 rgba(255,255,255,0.05);
    }
    .lp2-roi-sliders { display: flex; flex-direction: column; gap: 20px; margin-bottom: 28px; }
    .lp2-roi-slider-group { display: flex; flex-direction: column; gap: 8px; }
    .lp2-roi-slider-header {
      display: flex; justify-content: space-between; align-items: baseline; gap: 12px;
    }
    .lp2-roi-slider-header label {
      font-size: 0.92rem; font-weight: 600; color: #c8c8d8; line-height: 1.4;
    }
    .lp2-roi-val {
      font-size: 1.1rem; font-weight: 800; color: #fff; white-space: nowrap; min-width: 44px; text-align: right;
    }
    .lp2-roi-range-labels {
      display: flex; justify-content: space-between; font-size: 0.72rem; color: #6868A0; margin-top: -2px;
    }

    /* Range slider styling */
    .lp2-roi-range {
      -webkit-appearance: none; appearance: none; width: 100%; height: 6px; border-radius: 3px;
      background: linear-gradient(to right, #D4226A 0%, #D4226A var(--pct, 50%), rgba(255,255,255,0.08) var(--pct, 50%), rgba(255,255,255,0.08) 100%);
      outline: none; cursor: pointer;
    }
    .lp2-roi-range::-webkit-slider-thumb {
      -webkit-appearance: none; appearance: none; width: 22px; height: 22px; border-radius: 50%;
      background: #D4226A; border: 3px solid #1a1a2e; cursor: pointer;
      box-shadow: 0 0 12px rgba(212,34,106,0.5), 0 2px 8px rgba(0,0,0,0.4);
      transition: box-shadow 0.15s, transform 0.15s;
    }
    .lp2-roi-range::-webkit-slider-thumb:hover {
      box-shadow: 0 0 20px rgba(212,34,106,0.7), 0 2px 8px rgba(0,0,0,0.4);
      transform: scale(1.1);
    }
    .lp2-roi-range::-moz-range-thumb {
      width: 22px; height: 22px; border-radius: 50%;
      background: #D4226A; border: 3px solid #1a1a2e; cursor: pointer;
      box-shadow: 0 0 12px rgba(212,34,106,0.5), 0 2px 8px rgba(0,0,0,0.4);
    }
    .lp2-roi-range::-moz-range-track {
      height: 6px; border-radius: 3px; background: rgba(255,255,255,0.08);
    }
    .lp2-roi-range::-moz-range-progress {
      height: 6px; border-radius: 3px; background: #D4226A;
    }

    /* Breakdown cards — shared */
    .lp2-roi-card {
      padding: 16px; border-radius: 12px;
      background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.06);
      border-top: 3px solid #D4226A;
    }
    .lp2-roi-row-label {
      display: block; font-size: 0.85rem; font-weight: 700; color: #fff; margin-bottom: 6px;
    }
    .lp2-roi-row-num {
      display: block; font-size: clamp(1.1rem, 3vw, 1.4rem); font-weight: 900; line-height: 1.2;
      transition: color 0.3s ease; margin-bottom: 8px;
    }
    .lp2-roi-cite {
      display: block; font-size: 0.72rem; color: #6868A0; font-style: italic; line-height: 1.5;
      padding-left: 12px; border-left: 2px solid rgba(255,255,255,0.06);
    }

    /* Mobile: swipeable cards */
    .lp2-roi-cards-mobile { display: block; margin: 20px 0 0; }
    .lp2-roi-cards-scroll {
      display: flex; overflow-x: auto; scroll-snap-type: x mandatory;
      scrollbar-width: none; -webkit-overflow-scrolling: touch; gap: 0;
    }
    .lp2-roi-cards-scroll::-webkit-scrollbar { display: none; }
    .lp2-roi-card-slide { min-width: 100%; scroll-snap-align: start; padding: 0 4px; }
    .lp2-roi-card-dots { display: flex; justify-content: center; gap: 8px; margin-top: 12px; }
    .lp2-roi-card-dot { width: 8px; height: 8px; border-radius: 50%; background: rgba(255,255,255,0.15); border: none; cursor: pointer; padding: 0; transition: all 0.2s; }
    .lp2-roi-card-dot-on { background: #D4226A; box-shadow: 0 0 8px rgba(212,34,106,0.4); }

    /* Desktop: 3-col grid */
    .lp2-roi-cards-desktop { display: none; }
    @media (min-width: 768px) {
      .lp2-roi-cards-mobile { display: none; }
      .lp2-roi-cards-desktop { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px; margin: 20px 0 0; }
    }

    /* Hero total */
    .lp2-roi-total {
      text-align: center; padding: 20px 0 8px; position: relative;
    }
    .lp2-roi-total-label {
      display: block; font-size: 0.82rem; font-weight: 700; color: #A0A0B0;
      text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 12px;
    }
    .lp2-roi-total-glow {
      position: absolute; top: 50%; left: 50%; transform: translate(-50%, -40%);
      width: 300px; height: 120px; border-radius: 50%;
      background: radial-gradient(ellipse, rgba(212,34,106,0.12) 0%, transparent 70%);
      filter: blur(30px); pointer-events: none;
      animation: lp2-roi-pulse 3s ease-in-out infinite;
    }
    @keyframes lp2-roi-pulse {
      0%, 100% { opacity: 0.5; transform: translate(-50%, -40%) scale(1); }
      50% { opacity: 1; transform: translate(-50%, -40%) scale(1.08); }
    }
    .lp2-roi-total-num {
      display: block; font-size: clamp(2.8rem, 9vw, 4.5rem); font-weight: 900;
      line-height: 1.05; position: relative; transition: color 0.3s ease;
    }
    .lp2-roi-total-per { font-size: 0.32em; font-weight: 500; color: #6868A0; margin-left: 4px; }

    /* Color severity */
    .lp2-roi-low { color: #FFB800; }
    .lp2-roi-mid { color: #FF5500; }
    .lp2-roi-high { color: #D4226A; }
    .lp2-roi-total-num.lp2-roi-high { text-shadow: 0 0 40px rgba(212,34,106,0.25); }
    .lp2-roi-total-num.lp2-roi-mid { text-shadow: 0 0 40px rgba(255,85,0,0.25); }
    .lp2-roi-total-num.lp2-roi-low { text-shadow: 0 0 40px rgba(255,184,0,0.2); }

    .lp2-roi-closer {
      font-size: 0.92rem; color: #A0A0B0; text-align: center; line-height: 1.6; margin: 0;
    }
    .lp2-roi-citations {
      font-size: 0.7rem; color: #4a4a60; text-align: center; font-style: italic; margin: 16px 0 0;
    }

    @media (min-width: 768px) {
      .lp2-roi { padding: 28px 30px; }
    }

    /* ═══ ROUND 2: EYEBROW + HERO BULLETS ═══ */
    .lp2-eyebrow {
      font-size: 0.75rem; font-weight: 900; text-transform: uppercase; letter-spacing: 0.16em;
      color: #E8488A; margin-bottom: 10px; background: rgba(212,34,106,0.14); display: inline-block;
      padding: 7px 18px; border-radius: 8px; border: 1px solid rgba(212,34,106,0.4);
      box-shadow: 0 0 30px rgba(212,34,106,0.15), 0 0 60px rgba(212,34,106,0.06);
      text-shadow: 0 0 20px rgba(232,72,138,0.4);
    }
    @media (min-width: 768px) {
      .lp2-eyebrow { font-size: 1.05rem; padding: 10px 24px; margin-bottom: 16px; }
    }
    .lp2-hero-quote-stars {
      font-size: 1rem; letter-spacing: 0.15em; color: #FACC15; margin-bottom: 4px;
      text-shadow: 0 0 12px rgba(250,204,21,0.3);
    }
    .lp2-hero-bullets {
      list-style: none; padding: 0; margin: 0 0 12px; display: flex; flex-direction: column; gap: 5px;
      max-width: 580px; margin-left: auto; margin-right: auto;
    }
    @media (min-width: 768px) {
      .lp2-hero-bullets { margin: 0 0 20px; gap: 8px; margin-left: 0; margin-right: 0; }
    }
    .lp2-hero-bullets li {
      display: flex; align-items: flex-start; gap: 8px; font-size: 0.82rem; color: #c8c8d8; line-height: 1.4;
    }
    @media (min-width: 768px) {
      .lp2-hero-bullets li { font-size: 0.88rem; line-height: 1.5; gap: 10px; }
    }
    .lp2-hero-bullets li::before {
      content: '✓'; color: #D4226A; font-weight: 700; flex-shrink: 0; margin-top: 1px;
    }

    /* ═══ CREDIBILITY STRIP ═══ */
    .lp2-cred-strip {
      position: relative; z-index: 1; padding: 20px 24px;
      border-top: 1px solid rgba(255,255,255,0.04); border-bottom: 1px solid rgba(255,255,255,0.04);
      background: rgba(255,255,255,0.015);
    }
    .lp2-cred-inner {
      max-width: 960px; margin: 0 auto;
      display: flex; flex-wrap: wrap; justify-content: center; gap: 12px 32px;
    }
    .lp2-cred-item {
      font-size: 0.82rem; font-weight: 600; color: #6868A0; white-space: nowrap;
      display: flex; align-items: center; gap: 8px;
    }
    .lp2-cred-item::before {
      content: ''; width: 6px; height: 6px; border-radius: 50%; background: #D4226A; flex-shrink: 0; opacity: 0.6;
    }

    /* ═══ SECTION BREAKS + RHETORICAL QUESTIONS ═══ */
    .lp2-section-break {
      position: relative; z-index: 1; padding: 40px 24px 12px; max-width: 700px; margin: 0 auto;
    }
    .lp2-section-divider {
      height: 1px; margin: 0 auto 20px;
      background: linear-gradient(90deg, transparent, rgba(212,34,106,0.2), rgba(255,85,0,0.15), transparent);
    }
    .lp2-section-question {
      font-size: clamp(1.2rem, 3vw, 1.4rem); color: #D4226A; font-style: italic; text-align: center;
      margin: 0; line-height: 1.4; font-weight: 600;
    }

    /* ═══ SECTION CTA + MICROCOPY (reusable) ═══ */
    .lp2-section-cta { text-align: center; margin-top: 48px; }
    .lp2-section-cta-micro { font-size: 0.85rem; color: #6868A0; margin-top: 12px; }

    /* ═══ COMPARISON LAYOUT (Section 3) ═══ */
    .lp2-compare {
      display: grid; grid-template-columns: 1fr; gap: 16px; margin-bottom: 48px;
    }
    @media (min-width: 640px) { .lp2-compare { grid-template-columns: 1fr 1fr; } }
    .lp2-compare-col {
      padding: 24px; border-radius: 14px; border: 1px solid rgba(255,255,255,0.08);
    }
    .lp2-compare-before { background: rgba(239,68,68,0.04); border-color: rgba(239,68,68,0.15); }
    .lp2-compare-after { background: rgba(34,197,94,0.04); border-color: rgba(34,197,94,0.15); }
    .lp2-compare-heading {
      font-size: 0.95rem; font-weight: 800; color: #fff; margin: 0 0 14px;
    }
    .lp2-compare-before .lp2-compare-heading { color: #EF4444; }
    .lp2-compare-after .lp2-compare-heading { color: #22C55E; }
    .lp2-compare-list {
      list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 10px;
    }
    .lp2-compare-list li {
      font-size: 0.9rem; color: #A0A0B0; line-height: 1.5; padding-left: 20px; position: relative;
    }
    .lp2-compare-before .lp2-compare-list li::before { content: '✗'; position: absolute; left: 0; color: #EF4444; font-weight: 700; }
    .lp2-compare-after .lp2-compare-list li::before { content: '✓'; position: absolute; left: 0; color: #22C55E; font-weight: 700; }

    /* ═══ MECHANISM LIST (Section 4) ═══ */
    .lp2-mechanism {
      margin-top: 48px; padding: 32px; border-radius: 16px;
      background: rgba(255,255,255,0.025); border: 1px solid rgba(255,255,255,0.08);
    }
    .lp2-mechanism-heading {
      font-size: 1.15rem; font-weight: 800; color: #fff; margin: 0 0 20px; text-align: center;
    }
    .lp2-mechanism-list {
      list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 12px;
      max-width: 560px; margin: 0 auto;
    }
    .lp2-mechanism-list li {
      display: flex; align-items: flex-start; gap: 10px; font-size: 0.95rem; color: #c8c8d8; line-height: 1.5;
    }
    .lp2-mechanism-check { color: #D4226A; font-weight: 700; flex-shrink: 0; }

    /* ═══ BEFORE/AFTER BLOCK (Section 8) ═══ */
    .lp2-before-after {
      display: grid; grid-template-columns: 1fr; gap: 16px; margin-bottom: 56px;
    }
    @media (min-width: 640px) { .lp2-before-after { grid-template-columns: 1fr 1fr; } }
    .lp2-ba-col {
      padding: 24px; border-radius: 14px; border: 1px solid rgba(255,255,255,0.08);
    }
    .lp2-ba-before { background: rgba(239,68,68,0.04); border-color: rgba(239,68,68,0.15); }
    .lp2-ba-after { background: rgba(34,197,94,0.04); border-color: rgba(34,197,94,0.15); }
    .lp2-ba-label {
      font-size: 0.8rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 14px;
    }
    .lp2-ba-before .lp2-ba-label { color: #EF4444; }
    .lp2-ba-after .lp2-ba-label { color: #22C55E; }
    .lp2-ba-list {
      list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 10px;
    }
    .lp2-ba-list li {
      font-size: 0.9rem; color: #A0A0B0; line-height: 1.5; padding-left: 20px; position: relative;
    }
    .lp2-ba-before .lp2-ba-list li::before { content: '✗'; position: absolute; left: 0; color: #EF4444; font-weight: 700; }
    .lp2-ba-after .lp2-ba-list li::before { content: '✓'; position: absolute; left: 0; color: #22C55E; font-weight: 700; }

    /* ═══ GRAPHICS — SHARED ═══ */
    .lp2-gfx-block { margin: 48px 0; }
    .lp2-gfx-header {
      font-size: clamp(1.1rem, 3vw, 1.4rem); font-weight: 800; color: #fff;
      text-align: center; margin: 0 0 20px;
    }
    .lp2-gfx-sub {
      font-size: 0.9rem; color: #6868A0; text-align: center; margin: 20px 0 0;
    }

    /* ═══ TIME BARS (Section 2) ═══ */
    .lp2-time-bars { display: flex; flex-direction: column; gap: 16px; }
    .lp2-time-bar-row { display: flex; flex-direction: column; gap: 4px; }
    .lp2-time-bar-info { display: flex; justify-content: space-between; align-items: baseline; }
    .lp2-time-bar-label { font-size: 0.85rem; font-weight: 600; color: #c8c8d8; }
    .lp2-time-bar-pct { font-size: 0.95rem; font-weight: 800; }
    .lp2-time-bar-track { height: 8px; border-radius: 4px; background: rgba(255,255,255,0.06); overflow: hidden; }
    .lp2-time-bar-fill { height: 100%; border-radius: 4px; transition: width 0.6s ease; }
    .lp2-time-bar-note { font-size: 0.72rem; font-style: italic; }
    .lp2-pain-stat {
      font-size: clamp(1.5rem, 4.5vw, 2.2rem) !important; font-weight: 900; color: #D4226A !important;
      text-align: center; margin: 24px 0 0; line-height: 1.2; letter-spacing: -0.02em;
    }

    /* ═══ CHAOS STACK (Section 3) ═══ */
    .lp2-chaos-stack { text-align: center; }
    .lp2-chaos-mess {
      display: flex; flex-wrap: wrap; justify-content: center; gap: 8px;
      padding: 20px; max-width: 480px; margin: 0 auto;
    }
    .lp2-chaos-card {
      padding: 8px 14px; border-radius: 8px; font-size: 0.78rem; font-weight: 600;
      background: rgba(239,68,68,0.04); border: 1px solid rgba(239,68,68,0.25);
      color: #EF4444; white-space: nowrap;
      display: flex; flex-direction: column; align-items: center;
    }
    .lp2-chaos-label-bad { font-size: 0.82rem; color: #6868A0; margin: 12px 0 0; font-style: italic; }
    .lp2-chaos-divider { margin: 16px 0; color: #D4226A; }
    .lp2-chaos-clean { display: flex; justify-content: center; }
    .lp2-chaos-lp-bar {
      padding: 14px 48px; border-radius: 10px; font-size: 1rem; font-weight: 800; color: #fff;
      background: rgba(34,197,94,0.06); border: 1px solid rgba(34,197,94,0.35);
      box-shadow: 0 0 30px rgba(34,197,94,0.12);
      animation: lp2-lp-pulse 2.5s ease-in-out infinite;
    }
    @keyframes lp2-lp-pulse {
      0%, 100% { box-shadow: 0 0 20px rgba(34,197,94,0.1); }
      50% { box-shadow: 0 0 40px rgba(34,197,94,0.25); }
    }
    .lp2-chaos-label-good { font-size: 0.88rem; color: #22C55E; font-weight: 700; margin: 12px 0 0; }
    .lp2-trademark-note { font-size: 0.65rem; color: #4a4a60; text-align: center; margin-top: 16px; font-style: italic; }

    /* ═══ REPLACE VISUAL (Section 4) — row-based ═══ */
    .lp2-replace-rows { display: flex; flex-direction: column; gap: 8px; }
    .lp2-replace-row {
      display: flex; align-items: center; gap: 8px;
    }
    .lp2-replace-item-old {
      flex: 1; display: flex; align-items: center; gap: 8px; padding: 8px 12px; border-radius: 8px;
      background: rgba(239,68,68,0.04); border: 1px solid rgba(239,68,68,0.2);
      font-size: 0.82rem; color: #EF4444; text-decoration: line-through; opacity: 0.7;
    }
    .lp2-replace-x { color: #EF4444; font-weight: 700; font-size: 0.85rem; flex-shrink: 0; }
    .lp2-replace-arrow-inline { color: #6868A0; font-size: 1rem; flex-shrink: 0; }
    .lp2-replace-item-new {
      flex: 1; display: flex; align-items: center; gap: 8px; padding: 8px 12px; border-radius: 8px;
      background: rgba(34,197,94,0.04); border: 1px solid rgba(34,197,94,0.2);
      font-size: 0.82rem; color: #22C55E; font-weight: 600;
    }
    .lp2-replace-check { color: #22C55E; font-weight: 700; font-size: 0.85rem; flex-shrink: 0; }
    @media (max-width: 480px) {
      .lp2-replace-row { flex-wrap: wrap; }
      .lp2-replace-arrow-inline { display: none; }
      .lp2-replace-item-old, .lp2-replace-item-new { flex: 1 1 100%; }
    }

    /* ═══ CARD ICONS (Section 5) ═══ */
    .lp2-tcard-icon { margin-bottom: 12px; }

    /* ═══ DATA STREAMS (Section 6) ═══ */
    .lp2-data-streams { text-align: center; }
    .lp2-stream-pills {
      display: flex; flex-wrap: wrap; justify-content: center; gap: 8px;
      max-width: 600px; margin: 0 auto 20px;
    }
    .lp2-stream-pill {
      padding: 6px 14px; border-radius: 20px; font-size: 0.78rem; font-weight: 600;
      background: rgba(255,255,255,0.03); border: 1px solid;
      color: #c8c8d8; white-space: nowrap;
      animation: lp2-pill-pulse 3s ease-in-out infinite;
    }
    @keyframes lp2-pill-pulse {
      0%, 100% { opacity: 0.7; } 50% { opacity: 1; }
    }
    .lp2-stream-converge { margin: 8px 0; }
    .lp2-stream-output {
      display: inline-block; padding: 10px 28px; border-radius: 10px;
      background: rgba(212,34,106,0.12); border: 1px solid rgba(212,34,106,0.3);
      color: #D4226A; font-weight: 800; font-size: 0.95rem;
      box-shadow: 0 0 20px rgba(212,34,106,0.1);
    }

    /* ═══ INLINE MOCKUPS (distributed) ═══ */
    .lp2-inline-mock { margin: 40px auto; max-width: 560px; }
    .lp2-inline-mock-title { font-size: 0.88rem; font-weight: 800; color: #fff; text-align: center; margin: 0 0 12px; }
    .lp2-inline-mock-desc { font-size: 0.78rem; color: #6868A0; text-align: center; margin: 10px 0 0; }
    .lp2-inline-mock-row {
      display: grid; grid-template-columns: 1fr; gap: 24px; margin: 40px 0;
    }
    @media (min-width: 640px) { .lp2-inline-mock-row { grid-template-columns: 1fr 1fr; } }
    .lp2-inline-mock-row .lp2-inline-mock { margin: 0; }

    /* ═══ GALLERY LABELS (Section 7) ═══ */
    .lp2-gallery-title {
      font-size: 0.88rem; font-weight: 800; color: #fff; margin: 0 0 8px;
      text-align: center;
    }
    .lp2-gallery-desc {
      font-size: 0.78rem; color: #6868A0; text-align: center; margin: 8px 0 0;
    }

    /* ═══ RETENTION TIMELINE (Section 8) ═══ */
    .lp2-timeline-compare {
      display: grid; grid-template-columns: 1fr; gap: 24px;
    }
    @media (min-width: 640px) { .lp2-timeline-compare { grid-template-columns: 1fr 1fr; gap: 32px; } }
    .lp2-timeline-col {
      padding: 24px; border-radius: 14px; border: 1px solid rgba(255,255,255,0.08);
    }
    .lp2-timeline-without { background: rgba(255,255,255,0.02); }
    .lp2-timeline-with { background: rgba(34,197,94,0.03); border-color: rgba(34,197,94,0.12); }
    .lp2-timeline-col-label {
      font-size: 0.78rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 16px;
    }
    .lp2-timeline-step {
      display: flex; align-items: flex-start; gap: 10px; margin-bottom: 14px;
    }
    .lp2-timeline-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; margin-top: 5px; }
    .lp2-timeline-month { display: block; font-size: 0.72rem; font-weight: 700; color: #6868A0; text-transform: uppercase; }
    .lp2-timeline-event { display: block; font-size: 0.85rem; color: #c8c8d8; }
    .lp2-timeline-result {
      margin-top: 12px; padding: 8px 14px; border-radius: 8px; text-align: center;
      font-size: 0.85rem; font-weight: 700;
    }
    .lp2-timeline-result-bad { background: rgba(239,68,68,0.08); color: #EF4444; border: 1px solid rgba(239,68,68,0.15); }
    .lp2-timeline-result-good { background: rgba(34,197,94,0.08); color: #22C55E; border: 1px solid rgba(34,197,94,0.15); }

    /* ═══ TIER OVERVIEW (Section 9) ═══ */
    .lp2-tier-overview {
      display: grid; grid-template-columns: 1fr; gap: 16px;
      max-width: 800px; margin: 0 auto 40px;
    }
    @media (min-width: 640px) { .lp2-tier-overview { grid-template-columns: 1fr 1fr 1fr; } }
    .lp2-tier-col {
      padding: 20px; border-radius: 12px; background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.06);
      text-align: center;
    }
    .lp2-tier-col-name { font-size: 1rem; font-weight: 800; margin-bottom: 12px; }
    .lp2-tier-icons { display: flex; flex-wrap: wrap; justify-content: center; gap: 6px; }
    .lp2-tier-icon {
      padding: 3px 10px; border-radius: 6px; font-size: 0.7rem; font-weight: 700;
      border: 1px solid; background: rgba(255,255,255,0.02);
    }

    /* ═══ FINAL SNAPSHOT (Section 10) ═══ */
    .lp2-final-snapshot { position: relative; margin-bottom: 40px; }
    .lp2-final-snap-grid {
      display: flex; flex-direction: column; align-items: center; gap: 16px;
    }
    @media (min-width: 640px) {
      .lp2-final-snap-grid { flex-direction: row; justify-content: center; gap: 24px; }
      .lp2-final-snap-col { flex: 0 1 220px; }
    }
    .lp2-final-snap-col { display: flex; flex-direction: column; gap: 8px; width: 100%; max-width: 220px; }
    .lp2-final-snap-label {
      font-size: 0.78rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.08em;
      text-align: center; margin-bottom: 4px;
    }
    .lp2-final-snap-today .lp2-final-snap-label { color: #6868A0; }
    .lp2-final-snap-future .lp2-final-snap-label { color: #D4226A; }
    .lp2-final-snap-item {
      padding: 8px 14px; border-radius: 8px; font-size: 0.82rem; font-weight: 600; text-align: center;
    }
    .lp2-final-snap-old {
      background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.06);
      color: #6868A0;
    }
    .lp2-final-snap-new {
      background: rgba(212,34,106,0.06); border: 1px solid rgba(212,34,106,0.2);
      color: #fff;
    }
    .lp2-final-snap-arrow { color: #D4226A; flex-shrink: 0; }
    @media (max-width: 639px) { .lp2-final-snap-arrow svg { transform: rotate(90deg); } }

    /* ═══ SECTION 8.5: INTEGRATIONS ═══ */
    .lp2-integrations {
      border-top: 1px solid rgba(255,255,255,0.06);
      border-bottom: 1px solid rgba(255,255,255,0.06);
    }
    .lp2-int-header { text-align: center; margin-bottom: 36px; }
    .lp2-int-label {
      font-size: 0.72rem; font-weight: 800; letter-spacing: 0.18em;
      color: #6868A0; text-transform: uppercase; margin-bottom: 14px;
    }
    .lp2-int-sub {
      font-size: 0.95rem; color: #A0A0B0; margin: 0 auto; max-width: 620px; line-height: 1.5;
    }
    .lp2-int-grid {
      display: flex; flex-wrap: wrap; justify-content: center; gap: 10px;
      margin-bottom: 14px; max-width: 880px; margin-left: auto; margin-right: auto;
    }
    .lp2-int-pill {
      display: inline-flex; align-items: center; gap: 10px;
      padding: 10px 16px; border-radius: 12px;
      background: rgba(255,255,255,0.025);
      border: 1px solid rgba(255,255,255,0.08);
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
      transition: transform 0.2s ease, border-color 0.2s ease, background 0.2s ease;
    }
    .lp2-int-pill:hover {
      transform: translateY(-2px);
      border-color: rgba(255,255,255,0.2);
      background: rgba(255,255,255,0.04);
    }
    .lp2-int-dot {
      width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0;
      box-shadow: 0 0 8px rgba(255,255,255,0.08);
    }
    .lp2-int-name {
      font-size: 0.88rem; font-weight: 600; color: #E0E0F0; white-space: nowrap;
    }
    .lp2-int-pill-soon .lp2-int-name { color: #8080A0; }
    .lp2-int-pill-soon { opacity: 0.65; }
    .lp2-int-badge {
      font-size: 0.62rem; font-weight: 700; letter-spacing: 0.06em;
      padding: 2px 7px; border-radius: 6px;
      background: rgba(255,184,0,0.1); color: #FFB800;
      border: 1px solid rgba(255,184,0,0.2); text-transform: uppercase;
    }
    .lp2-int-callouts {
      display: grid; grid-template-columns: 1fr; gap: 14px;
      margin-top: 44px; max-width: 880px; margin-left: auto; margin-right: auto;
    }
    @media (min-width: 768px) { .lp2-int-callouts { grid-template-columns: repeat(3, 1fr); } }
    .lp2-int-callout {
      padding: 20px; border-radius: 14px;
      background: rgba(255,255,255,0.025);
      border: 1px solid rgba(255,255,255,0.08);
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
    }
    .lp2-int-callout-icon { font-size: 1.4rem; margin-bottom: 10px; }
    .lp2-int-callout-title {
      font-size: 0.95rem; font-weight: 800; color: #fff; margin-bottom: 8px;
    }
    .lp2-int-callout-body {
      font-size: 0.8125rem; color: #A0A0B0; line-height: 1.55;
    }

    /* ── REDUCED MOTION ── */
    @media (prefers-reduced-motion: reduce) {
      .lp2-cta { animation: none !important; }
      .lp2-reveal { opacity: 1 !important; transform: none !important; transition: none !important; }
      .lp2-hero-gradient { animation: none !important; }
      .lp2-particle { animation: none !important; display: none; }
      .lp2-brain-core-svg { animation: none !important; }
      .lp2-brain-line { animation: none !important; }
      .lp2-tcard { opacity: 1 !important; transform: none !important; }
      .lp2-pain-card { opacity: 1 !important; transform: none !important; }
    }
  `}</style>
}
