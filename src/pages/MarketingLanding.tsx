import { useState, useEffect, useRef, useCallback, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthContext } from '../app/AuthContext'
import { PRICING_TIERS, TRIAL_DAYS } from '../lib/pricing'
import { Star, ChevronDown, ChevronRight } from 'lucide-react'

/* ═══════════════════════════════════════════════════════
   LESSONPRENEUR — THE FINAL LANDING PAGE
   Mobile-first. Third-grade language. Zero filler.
   ═══════════════════════════════════════════════════════ */

export default function MarketingLanding() {
  const { profile } = useAuthContext()
  const nav = useNavigate()

  useEffect(() => {
    if (profile) {
      const r: Record<string, string> = { owner: '/admin/dashboard', admin: '/admin/dashboard', teacher: '/teacher/schedule', parent: '/parent/dashboard', student: '/student/practice' }
      nav(r[profile.role] ?? '/admin/dashboard', { replace: true })
    }
  }, [profile, nav])

  useEffect(() => {
    if (!document.getElementById('lp-font')) {
      const l = document.createElement('link')
      l.id = 'lp-font'
      l.href = 'https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800;900&display=swap'
      l.rel = 'stylesheet'
      document.head.appendChild(l)
    }
  }, [])

  if (profile) return null
  const go = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' })

  return (
    <div style={{ background: '#06060a', color: '#f0f0f4', fontFamily: "'Outfit', sans-serif", overflowX: 'hidden', fontSize: 15 }}>
      <Styles />

      {/* ── NAV ─────────────────────────────── */}
      <Nav onCta={() => nav('/signup')} />

      {/* ── HERO ────────────────────────────── */}
      <section className="lp-hero">
        <div className="lp-gradient-bg" />
        <Particles />
        <div className="lp-hero-inner">
          <p className="lp-eyebrow">The AI Operating System for Music Schools</p>
          <h1 className="lp-h1">Your Music School.<br /><span className="lp-gold">On Autopilot.</span></h1>
          <p className="lp-sub">Keep more students. Save hours every week.<br className="lp-br-desktop" /> See what actually matters.</p>
          <button className="lp-cta" onClick={() => nav('/signup')}>Start Free — {TRIAL_DAYS} Days, No Card</button>
          <button className="lp-ghost" onClick={() => go('pain')}>See what you're missing <ChevronDown size={14} /></button>
          <div className="lp-hero-mockup"><MiniInsightCard /></div>
        </div>
      </section>

      {/* ── PAIN POINTS ─────────────────────── */}
      <Reveal id="pain"><div className="lp-section lp-narrow">
        <h2 className="lp-h2">Sound Familiar?</h2>
        <div className="lp-stack">
          <FlipCard pain="A parent texts asking how their kid is doing. Nobody answers for 3 days." fix="What if they already had an update before they asked?" />
          <FlipCard pain="Summer hits. Students disappear. You find out when the rooms are empty." fix="What if you could see who's about to leave — weeks before they do?" />
          <FlipCard pain="A lead fills out your form. You're teaching. They book somewhere else." fix="What if your system responded in seconds?" />
          <FlipCard pain="You know your revenue. You have no idea what you actually keep." fix="What if you could see your real take-home right now?" />
        </div>
        <p className="lp-nudge">These aren't hypotheticals. This is what Lessonpreneur does. <ChevronDown size={12} /></p>
      </div></Reveal>

      {/* ── CALCULATOR ──────────────────────── */}
      <Reveal id="calculator"><div className="lp-section lp-narrow">
        <p className="lp-eyebrow">THE MATH DOESN'T LIE</p>
        <h2 className="lp-h2">You're losing more than you think.</h2>
        <p className="lp-sub-sm">Slide to your student count. See what's really happening.</p>
        <Calculator onCta={() => nav('/signup')} />
      </div></Reveal>

      {/* ── SHOWCASE ────────────────────────── */}
      <Reveal id="showcase"><div className="lp-section">
        <p className="lp-eyebrow">SEE IT IN ACTION</p>
        <h2 className="lp-h2">Not another dashboard. An operating system.</h2>
        <Showcase />
      </div></Reveal>

      {/* ── FEATURES ────────────────────────── */}
      <Reveal id="features"><div className="lp-section lp-narrow">
        <h2 className="lp-h2">What It Actually Does</h2>
        <div className="lp-features">
          <FeatureCard icon="⚡" title="Never miss a lead" desc="Auto-response the moment a new family fills out your form." />
          <FeatureCard icon="💬" title="Parents stay in the loop" desc="AI writes a warm update after every session. You don't lift a finger." />
          <FeatureCard icon="🛡️" title="See who's about to leave" desc="Churn scoring flags at-risk students before they quit." />
          <FeatureCard icon="☀️" title="Summer-proof your school" desc="Retention campaigns fire automatically. No more August surprises." />
          <FeatureCard icon="💰" title="Know your real take-home" desc="Revenue minus payroll minus expenses. The number that matters." />
          <FeatureCard icon="🎨" title="Your school, your brand" desc="Your logo. Your colors. Parents see YOUR studio, not ours." />
        </div>
        <p className="lp-nudge">And that's just the start. There's a lot more under the hood.</p>
      </div></Reveal>

      {/* ── SOCIAL PROOF ────────────────────── */}
      <Reveal><div className="lp-section lp-narrow" style={{ textAlign: 'center' }}>
        <CountUpStrip />
        <blockquote className="lp-quote">
          "I didn't build Lessonpreneur because I'm a tech guy. I built it because I was drowning. Four locations. 600 students. Parents asking questions nobody was answering. Students leaving and I didn't know until the room was empty. I was doing over a million a year and still felt like I was losing. So I built the system I wished existed."
        </blockquote>
        <p style={{ color: '#D4226A', fontWeight: 700, fontSize: 14 }}>— Zach Adkins, Founder</p>
      </div></Reveal>

      {/* ── INTEGRATIONS ────────────────────── */}
      <Reveal><div className="lp-section lp-narrow" style={{ textAlign: 'center' }}>
        <h2 className="lp-h2">Already using something? Cool.</h2>
        <p className="lp-sub-sm">Import from anywhere in about 10 minutes. Our AI walks you through it.</p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, justifyContent: 'center', marginTop: 20 }}>
          {['Jackrabbit', 'MyMusicStaff', 'Square', 'Google Sheets', 'Stripe', 'Email'].map(n => (
            <span key={n} className="lp-int-pill">{n}</span>
          ))}
        </div>
      </div></Reveal>

      {/* ── PRICING ─────────────────────────── */}
      <Reveal id="pricing"><div className="lp-section">
        <h2 className="lp-h2" style={{ textAlign: 'center' }}>Pick Your Plan</h2>
        <p className="lp-sub-sm" style={{ textAlign: 'center' }}>{TRIAL_DAYS} days free. No card. No risk.</p>
        <div className="lp-pricing-grid">
          {[PRICING_TIERS[1], PRICING_TIERS[0], PRICING_TIERS[2]].map((tier, i) => (
            <div key={tier.key} className={`lp-price-card ${i === 0 ? 'lp-popular' : ''}`}>
              {i === 0 && <span className="lp-pop-badge">Most Popular</span>}
              <div className="lp-price-name">{tier.name}</div>
              <div className="lp-price-tag">{tier.tagline}</div>
              <div className="lp-price-amt">{tier.priceDisplay}<span className="lp-price-mo">/mo</span></div>
              <div className="lp-price-feat">
                {tier.features.filter(f => !f.endsWith(':')).slice(0, 7).map(f => (
                  <div key={f} className="lp-feat-row"><span className="lp-check">✓</span>{f}</div>
                ))}
              </div>
              <button className={i === 0 ? 'lp-cta lp-cta-full' : 'lp-cta-outline lp-cta-full'} onClick={() => nav('/signup')}>Start Free</button>
            </div>
          ))}
        </div>
        <p className="lp-fine" style={{ textAlign: 'center', marginTop: 16 }}>If it doesn't work for you, you leave. Simple.</p>
      </div></Reveal>

      {/* ── FAQ ──────────────────────────────── */}
      <Reveal id="faq"><div className="lp-section lp-narrow">
        <h2 className="lp-h2" style={{ textAlign: 'center' }}>Questions? Answers.</h2>
        <div className="lp-stack">
          <Accordion q="What if I only have a few students?" a="Even better. Every student matters more when you're small. The Individual Teacher plan handles up to 50." />
          <Accordion q="I already use [other tool]. Do I have to switch?" a="Nope. Import your data in 10 minutes. Keep what works, add what's missing." />
          <Accordion q="What happens after 60 days?" a="You pick a plan or you walk. No tricks. No hidden charges. Your data stays safe either way." />
          <Accordion q="Is this hard to set up?" a="Our AI assistant walks you through it step by step. Most schools are running in under an hour." />
        </div>
      </div></Reveal>

      {/* ── FINAL CTA ───────────────────────── */}
      <section className="lp-section" style={{ textAlign: 'center', paddingBottom: 80 }}>
        <h2 className="lp-h2">Still here? That means something.</h2>
        <p className="lp-sub-sm">You already know your school could run better.<br />{TRIAL_DAYS} days to prove it. We'll even help you set it up.</p>
        <button className="lp-cta" onClick={() => nav('/signup')} style={{ marginTop: 24 }}>Let's Go →</button>
        <p className="lp-fine" style={{ marginTop: 12 }}>No card. No commitment. Just a better way to run your school.</p>
      </section>

      {/* ── FOOTER ──────────────────────────── */}
      <footer className="lp-footer">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'center', marginBottom: 14 }}>
          <Star size={14} style={{ color: '#D4226A' }} /><span style={{ fontWeight: 700, color: '#6b6b80' }}>Lessonpreneur</span>
        </div>
        <div style={{ display: 'flex', gap: 16, justifyContent: 'center', flexWrap: 'wrap', marginBottom: 14 }}>
          {[['Features','features'],['Pricing','pricing'],['FAQ','faq']].map(([l,id]) => <button key={id} onClick={() => go(id)} className="lp-foot-link">{l}</button>)}
          <button onClick={() => nav('/login')} className="lp-foot-link">Log In</button>
          <button onClick={() => nav('/signup')} className="lp-foot-link" style={{ color: '#D4226A' }}>Sign Up</button>
        </div>
        <p className="lp-fine">Built by Adkins Enterprises LLC · © 2026</p>
      </footer>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════
   BUILDING BLOCKS
   ═══════════════════════════════════════════════════════ */

function Nav({ onCta }: { onCta: () => void }) {
  const [solid, setSolid] = useState(false)
  useEffect(() => { const h = () => setSolid(window.scrollY > 40); window.addEventListener('scroll', h, { passive: true }); return () => window.removeEventListener('scroll', h) }, [])
  return (
    <nav className={`lp-nav ${solid ? 'lp-nav-solid' : ''}`}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Star size={18} style={{ color: '#D4226A' }} />
        <span style={{ fontSize: 17, fontWeight: 800, letterSpacing: '-0.02em' }}>Lessonpreneur</span>
      </div>
      <button className="lp-cta-sm" onClick={onCta}>Start Free</button>
    </nav>
  )
}

function Reveal({ id, children }: { id?: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const [v, setV] = useState(false)
  useEffect(() => { const el = ref.current; if (!el) return; const o = new IntersectionObserver(([e]) => { if (e.isIntersecting) setV(true) }, { threshold: 0.08 }); o.observe(el); return () => o.disconnect() }, [])
  return <div id={id} ref={ref} className={`lp-reveal ${v ? 'lp-visible' : ''}`}>{children}</div>
}

function Particles() {
  return <div className="lp-particles">{Array.from({ length: 12 }).map((_, i) => <div key={i} className="lp-particle" style={{ left: `${Math.random() * 100}%`, top: `${Math.random() * 100}%`, animationDelay: `${Math.random() * 30}s`, animationDuration: `${40 + Math.random() * 30}s`, opacity: 0.03 + Math.random() * 0.03 }} />)}</div>
}

function FlipCard({ pain, fix }: { pain: string; fix: string }) {
  const [flipped, setFlipped] = useState(false)
  return (
    <div className={`lp-flip ${flipped ? 'lp-flipped' : ''}`} onClick={() => setFlipped(!flipped)}>
      {!flipped
        ? <p style={{ fontSize: 15, color: '#c0c0d0', lineHeight: 1.65 }}>{pain} <span className="lp-fine">(tap)</span></p>
        : <p style={{ fontSize: 16, fontWeight: 700, color: '#D4226A', lineHeight: 1.5 }}>{fix}</p>
      }
    </div>
  )
}

function MiniInsightCard() {
  const cards = [
    { label: 'CRITICAL', title: '12 at-risk students', metric: '12', color: '#ef4444' },
    { label: 'GOOD NEWS', title: 'Revenue up 8%', metric: '+8%', color: '#22c55e' },
    { label: 'ATTENTION', title: '3 open prime-time slots', metric: '3', color: '#fb923c' },
  ]
  const [i, setI] = useState(0)
  useEffect(() => { const t = setInterval(() => setI(n => (n + 1) % cards.length), 2500); return () => clearInterval(t) }, [])
  const c = cards[i]
  return (
    <div className="lp-mini-card" style={{ borderTopColor: c.color }}>
      <span className="lp-mini-badge" style={{ color: c.color, background: `${c.color}15` }}>{c.label}</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 10 }}>
        <span style={{ fontSize: 30, fontWeight: 800, color: c.color, fontFamily: 'monospace' }}>{c.metric}</span>
        <span style={{ fontSize: 14, fontWeight: 600 }}>{c.title}</span>
      </div>
    </div>
  )
}

/* ── CALCULATOR ─────────────────────────────────── */

function Calculator({ onCta }: { onCta: () => void }) {
  const [students, setStudents] = useState(50)
  const sessionRate = 40
  const annualPerStudent = sessionRate * 4 * 12 // $1,920
  const churnRate = 0.30
  const churned = Math.round(students * churnRate)
  const lostAnnual = churned * annualPerStudent

  const savedStudents = Math.round(churned * 0.30)
  const savedRev = savedStudents * annualPerStudent
  const timeSaved = Math.round(students * 6 * sessionRate) // admin hours valued
  const referralRev = Math.round(students * 0.05) * annualPerStudent
  const shareCardRev = Math.round(students * 0.04) * annualPerStudent * 0.25
  const totalValue = savedRev + timeSaved + referralRev + shareCardRev

  const tier = students <= 50 ? 'teacher' : students <= 200 ? 'school' : 'multi'
  const tierCost = tier === 'teacher' ? 197 * 12 : tier === 'school' ? 497 * 12 : 997 * 12
  const net = totalValue - tierCost
  const tierLabel = tier === 'teacher' ? 'Solo teacher' : tier === 'school' ? 'Music school' : 'Multi-location'
  const tierColor = tier === 'teacher' ? '#D4226A' : tier === 'school' ? '#22c55e' : '#a333ff'

  return (
    <div className="lp-calc">
      {/* Slider */}
      <div className="lp-slider-wrap">
        <div className="lp-slider-top">
          <span style={{ color: '#8b8ba0' }}>My students</span>
          <span style={{ fontWeight: 800, fontSize: 20 }}>{students} <span className="lp-tier-badge" style={{ background: `${tierColor}20`, color: tierColor }}>{tierLabel}</span></span>
        </div>
        <input type="range" min={10} max={600} step={5} value={students} onChange={e => setStudents(+e.target.value)} className="lp-range" />
      </div>

      {/* RED — Loss */}
      <div className="lp-calc-card lp-calc-red">
        <p className="lp-calc-label" style={{ color: '#ef4444' }}>RIGHT NOW, YOU'RE LOSING ABOUT</p>
        <p className="lp-calc-big" style={{ color: '#ef4444' }}>${lostAnnual.toLocaleString()}</p>
        <p className="lp-fine">every year from students who leave (~{churned} students × ${annualPerStudent.toLocaleString()}/yr each)</p>
      </div>

      {/* AMBER — Value */}
      <div className="lp-calc-card lp-calc-amber">
        <p className="lp-calc-label" style={{ color: '#D4226A' }}>LESSONPRENEUR PUTS MONEY BACK IN YOUR POCKET</p>
        <div className="lp-calc-grid">
          <div className="lp-calc-box"><span className="lp-calc-box-num">${savedRev.toLocaleString()}</span><span className="lp-calc-box-desc">from students who stay instead of leave</span></div>
          <div className="lp-calc-box"><span className="lp-calc-box-num">${timeSaved.toLocaleString()}</span><span className="lp-calc-box-desc">worth of your time back on admin</span></div>
          <div className="lp-calc-box"><span className="lp-calc-box-num">${referralRev.toLocaleString()}</span><span className="lp-calc-box-desc">in new students from referrals</span></div>
          <div className="lp-calc-box"><span className="lp-calc-box-num">${shareCardRev.toLocaleString()}</span><span className="lp-calc-box-desc">in free marketing from share cards</span></div>
        </div>
      </div>

      {/* GREEN — Net */}
      <div className="lp-calc-card lp-calc-green">
        <p className="lp-fine">Lessonpreneur: ${(tierCost / 12).toLocaleString()}/mo (${tierCost.toLocaleString()}/yr)</p>
        <p className="lp-calc-big" style={{ color: '#22c55e' }}>+${net.toLocaleString()}/yr</p>
        <p style={{ color: '#8b8ba0', fontSize: 14 }}>
          {tier === 'teacher' ? 'More money, more time to teach.' : tier === 'school' ? `That's an extra $${Math.round(net / 12).toLocaleString()} every single month.` : "Not having this costs more than a full-time hire."}
        </p>
      </div>

      <p className="lp-fine" style={{ marginTop: 16, lineHeight: 1.6 }}>Based on $40/session, 4 sessions/month, 30% annual churn — consistent with retention research from Harvard Business Review and Bain & Company.</p>
      <blockquote className="lp-quote" style={{ fontSize: 14, marginTop: 16 }}>"I didn't come up with these numbers. Smarter people than me did. I just built the system." — Zach Adkins</blockquote>
      <div style={{ textAlign: 'center', marginTop: 20 }}><button className="lp-cta" onClick={onCta}>Start Free — {TRIAL_DAYS} Days</button></div>
    </div>
  )
}

/* ── SHOWCASE ───────────────────────────────────── */

function Showcase() {
  const tabs = [
    { icon: '📊', label: 'Dashboard', el: <MockDashboard /> },
    { icon: '✏️', label: 'Quick-Input', el: <MockQuickInput /> },
    { icon: '👨‍👩‍👧', label: 'Parents', el: <MockParent /> },
    { icon: '💰', label: 'Financials', el: <MockPL /> },
    { icon: '⭐', label: 'Star AI', el: <MockStar /> },
  ]
  const [t, setT] = useState(0)
  useEffect(() => { const i = setInterval(() => setT(n => (n + 1) % tabs.length), 6000); return () => clearInterval(i) }, [])

  return (
    <div>
      <div className="lp-tabs">{tabs.map((tab, i) => (
        <button key={i} className={`lp-tab ${t === i ? 'lp-tab-on' : ''}`} onClick={() => setT(i)}>{tab.icon}<span className="lp-tab-label">{tab.label}</span></button>
      ))}</div>
      <div className="lp-showcase-frame" key={t}>{tabs[t].el}</div>
    </div>
  )
}

function MockDashboard() {
  const c = [{ l: 'CRITICAL', t: '12 at-risk students', m: '12', cl: '#ef4444' }, { l: 'GOOD NEWS', t: 'Revenue up 8%', m: '+8%', cl: '#22c55e' }]
  const [i, setI] = useState(0)
  useEffect(() => { const t = setInterval(() => setI(n => (n + 1) % c.length), 2000); return () => clearInterval(t) }, [])
  return <div className="lp-mock" style={{ borderTopColor: c[i].cl }}><span className="lp-mini-badge" style={{ color: c[i].cl, background: `${c[i].cl}15` }}>{c[i].l}</span><div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 10 }}><span style={{ fontSize: 28, fontWeight: 800, color: c[i].cl, fontFamily: 'monospace' }}>{c[i].m}</span><span style={{ fontSize: 14, fontWeight: 600 }}>{c[i].t}</span></div></div>
}
function MockQuickInput() {
  const [s, setS] = useState(0)
  useEffect(() => { const t = setInterval(() => setS(n => Math.min(n + 1, 3)), 1200); return () => clearInterval(t) }, [])
  const steps = ['Select student...', '✅ Emma — Piano', '✅ Chords · On Track · 😄', '✅ Done! (0:38)']
  return <div className="lp-mock">{steps.slice(0, s + 1).map((st, i) => <div key={i} style={{ padding: '6px 0', fontSize: 14, color: i < s ? '#22c55e' : '#f0f0f4', borderBottom: '1px solid #1a1a2840' }}>{st}</div>)}</div>
}
function MockParent() {
  return <div className="lp-mock"><div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>Emma's Piano Session</div><span className="lp-mini-badge" style={{ color: '#22c55e', background: '#22c55e15' }}>Crushing It</span><p style={{ fontSize: 13, color: '#c0c0d0', lineHeight: 1.6, marginTop: 8 }}>"Emma worked on chord progressions today. Her energy was amazing — she's clearly been practicing."</p><div style={{ marginTop: 10 }}><span style={{ padding: '5px 12px', borderRadius: 6, background: '#D4226A18', color: '#D4226A', fontSize: 11, fontWeight: 700 }}>Share ↗</span></div></div>
}
function MockPL() {
  return <div className="lp-mock"><div className="lp-pl-grid">{[{ l: 'Revenue', v: '$96,310', c: '#22c55e' }, { l: 'Payroll', v: '-$48,155', c: '#fb923c' }, { l: 'Expenses', v: '-$20,700', c: '#ef4444' }, { l: 'Take-Home', v: '$27,455', c: '#D4226A' }].map(m => <div key={m.l} className="lp-pl-item" style={{ borderTopColor: m.c }}><span style={{ fontSize: 18, fontWeight: 800, color: m.c, fontFamily: 'monospace' }}>{m.v}</span><span className="lp-fine">{m.l}</span></div>)}</div></div>
}
function MockStar() {
  return <div className="lp-mock"><div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}><Star size={12} style={{ color: '#D4226A' }} /><span style={{ fontSize: 12, fontWeight: 700, color: '#D4226A' }}>Star</span></div><div style={{ padding: '6px 10px', borderRadius: 8, background: '#1a1a28', fontSize: 13, color: '#c0c0d0', marginBottom: 6 }}>How are we doing?</div><div style={{ padding: '6px 10px', borderRadius: 8, background: '#D4226A08', border: '1px solid #D4226A15', fontSize: 13, color: '#c0c0d0', lineHeight: 1.5 }}>487 active students. Gretna at 87% capacity. 3 leads need follow-up. Revenue tracking $96K.</div></div>
}

function FeatureCard({ icon, title, desc }: { icon: string; title: string; desc: string }) {
  return <div className="lp-feat-card"><span style={{ fontSize: 22 }}>{icon}</span><div style={{ fontWeight: 700, fontSize: 15, marginBottom: 2 }}>{title}</div><div style={{ fontSize: 13, color: '#8b8ba0', lineHeight: 1.5 }}>{desc}</div></div>
}

function CountUpStrip() {
  return <div className="lp-stat-strip">{[{ v: '600+', l: 'students managed' }, { v: '4', l: 'locations' }, { v: '$1M+', l: 'tracked' }].map(s => <div key={s.l} className="lp-stat"><span className="lp-stat-num">{s.v}</span><span className="lp-fine">{s.l}</span></div>)}</div>
}

function Accordion({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false)
  return <div className="lp-acc" onClick={() => setOpen(!open)}><div className="lp-acc-q"><span>{q}</span><ChevronRight size={14} style={{ color: '#6b6b80', transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 0.2s' }} /></div>{open && <div className="lp-acc-a">{a}</div>}</div>
}

/* ═══════════════════════════════════════════════════════
   STYLES (CSS-in-JS for this page)
   ═══════════════════════════════════════════════════════ */

function Styles() {
  return <style>{`
    /* ── Reset ── */
    .lp-hero,.lp-section,.lp-footer { box-sizing: border-box; }
    *, *::before, *::after { box-sizing: border-box; }

    /* ── Nav ── */
    .lp-nav { position: fixed; top: 0; left: 0; right: 0; z-index: 100; padding: 12px 20px; display: flex; align-items: center; justify-content: space-between; transition: all 0.3s; }
    .lp-nav-solid { background: #06060af0; backdrop-filter: blur(16px); border-bottom: 1px solid #1a1a2840; }

    /* ── Buttons ── */
    .lp-cta { display: inline-flex; align-items: center; gap: 8px; padding: 16px 32px; border-radius: 12px; background: #D4226A; color: #fff; font-size: 16px; font-weight: 700; border: none; cursor: pointer; font-family: inherit; transition: transform 0.15s, box-shadow 0.15s; box-shadow: 0 0 0 0 #D4226A40; animation: lp-pulse 2.5s infinite; }
    .lp-cta:hover { transform: translateY(-2px); box-shadow: 0 8px 30px #D4226A40; }
    .lp-cta-full { width: 100%; justify-content: center; }
    .lp-cta-sm { padding: 8px 18px; border-radius: 8px; background: #D4226A; color: #fff; font-size: 13px; font-weight: 700; border: none; cursor: pointer; font-family: inherit; }
    .lp-cta-outline { display: inline-flex; align-items: center; justify-content: center; padding: 14px 24px; border-radius: 12px; background: transparent; color: #8b8ba0; font-size: 15px; font-weight: 700; border: 1px solid #1a1a28; cursor: pointer; font-family: inherit; width: 100%; transition: border-color 0.2s; }
    .lp-cta-outline:hover { border-color: #D4226A40; }
    .lp-ghost { display: inline-flex; align-items: center; gap: 6px; background: none; border: none; color: #6b6b80; font-size: 14px; cursor: pointer; margin-top: 12px; font-family: inherit; }
    @keyframes lp-pulse { 0%,100% { box-shadow: 0 0 0 0 #D4226A40; } 50% { box-shadow: 0 0 0 10px #D4226A00; } }

    /* ── Hero ── */
    .lp-hero { min-height: 100vh; min-height: 100dvh; display: flex; align-items: center; justify-content: center; text-align: center; padding: 100px 20px 60px; position: relative; overflow: hidden; }
    .lp-hero-inner { position: relative; z-index: 1; max-width: 640px; }
    .lp-gradient-bg { position: absolute; inset: 0; background: linear-gradient(135deg, #D4111306, #00A65106, #A333FF06, #00A5E806); background-size: 400% 400%; animation: lp-grad 60s ease infinite; }
    @keyframes lp-grad { 0%,100% { background-position: 0% 50%; } 25% { background-position: 100% 0%; } 50% { background-position: 100% 100%; } 75% { background-position: 0% 100%; } }
    .lp-eyebrow { font-size: 11px; font-weight: 700; color: #D4226A; text-transform: uppercase; letter-spacing: 0.14em; margin-bottom: 16px; }
    .lp-h1 { font-size: clamp(36px, 8vw, 64px); font-weight: 900; line-height: 1.05; margin: 0 0 16px; letter-spacing: -0.04em; }
    .lp-gold { color: #D4226A; }
    .lp-sub { font-size: clamp(15px, 2.5vw, 18px); color: #8b8ba0; line-height: 1.55; margin-bottom: 28px; }
    .lp-br-desktop { display: none; }
    @media (min-width: 640px) { .lp-br-desktop { display: inline; } }
    .lp-hero-mockup { margin-top: 32px; perspective: 800px; }

    /* ── Sections ── */
    .lp-section { padding: 60px 20px; max-width: 960px; margin: 0 auto; }
    .lp-narrow { max-width: 640px; }
    .lp-h2 { font-size: clamp(24px, 5vw, 36px); font-weight: 800; letter-spacing: -0.03em; margin-bottom: 12px; line-height: 1.15; }
    .lp-sub-sm { color: #8b8ba0; font-size: 14px; margin-bottom: 20px; }
    .lp-stack { display: flex; flex-direction: column; gap: 10px; }
    .lp-nudge { text-align: center; color: #6b6b80; font-size: 13px; margin-top: 20px; display: flex; align-items: center; justify-content: center; gap: 6px; }
    .lp-fine { color: #6b6b80; font-size: 12px; }
    .lp-quote { font-size: 15px; color: #c0c0d0; line-height: 1.7; font-style: italic; border-left: 3px solid #D4226A40; padding-left: 16px; margin: 20px 0; text-align: left; }

    /* ── Reveal ── */
    .lp-reveal { opacity: 0; transform: translateY(16px); transition: opacity 0.5s ease, transform 0.5s ease; }
    .lp-visible { opacity: 1; transform: translateY(0); }

    /* ── Particles ── */
    .lp-particles { position: absolute; inset: 0; pointer-events: none; overflow: hidden; }
    .lp-particle { position: absolute; width: 4px; height: 4px; border-radius: 50%; background: #D4226A; animation: lp-drift linear infinite; }
    @keyframes lp-drift { 0% { transform: translateY(0) translateX(0); } 50% { transform: translateY(-40vh) translateX(20px); } 100% { transform: translateY(-80vh) translateX(-10px); } }

    /* ── FlipCard ── */
    .lp-flip { padding: 20px; border-radius: 14px; background: #101018; border: 1px solid #1a1a28; cursor: pointer; transition: border-color 0.3s; -webkit-tap-highlight-color: transparent; }
    .lp-flipped { border-color: #D4226A30; }

    /* ── Mini Card (hero mockup) ── */
    .lp-mini-card { padding: 16px 20px; border-radius: 12px; background: #101018; border: 1px solid #1a1a28; border-top: 3px solid #ef4444; max-width: 340px; margin: 0 auto; text-align: left; transform: perspective(600px) rotateY(-3deg) rotateX(2deg); box-shadow: 0 20px 60px rgba(0,0,0,0.4), 0 0 40px #D4226A08; }
    .lp-mini-badge { font-size: 9px; font-weight: 800; padding: 3px 8px; border-radius: 5px; letter-spacing: 0.06em; }

    /* ── Calculator ── */
    .lp-calc { text-align: left; }
    .lp-slider-wrap { margin-bottom: 20px; }
    .lp-slider-top { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
    .lp-tier-badge { font-size: 11px; font-weight: 700; padding: 2px 10px; border-radius: 6px; margin-left: 6px; }
    .lp-range { width: 100%; accent-color: #D4226A; height: 8px; border-radius: 4px; appearance: none; background: #1a1a28; outline: none; }
    .lp-range::-webkit-slider-thumb { appearance: none; width: 28px; height: 28px; border-radius: 50%; background: #D4226A; cursor: grab; box-shadow: 0 2px 8px #D4226A40; }
    .lp-calc-card { padding: 20px; border-radius: 14px; margin-bottom: 12px; }
    .lp-calc-red { background: #ef444408; border: 1px solid #ef444418; }
    .lp-calc-amber { background: #D4226A06; border: 1px solid #D4226A15; }
    .lp-calc-green { background: #22c55e06; border: 1px solid #22c55e18; text-align: center; }
    .lp-calc-label { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 6px; }
    .lp-calc-big { font-size: clamp(28px, 6vw, 40px); font-weight: 900; font-family: monospace; margin: 4px 0; }
    .lp-calc-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 10px; }
    @media (max-width: 480px) { .lp-calc-grid { grid-template-columns: 1fr; } }
    .lp-calc-box { padding: 12px; border-radius: 10px; background: #D4226A08; border: 1px solid #D4226A10; }
    .lp-calc-box-num { display: block; font-size: 18px; font-weight: 800; color: #D4226A; font-family: monospace; margin-bottom: 2px; }
    .lp-calc-box-desc { font-size: 12px; color: #8b8ba0; line-height: 1.4; }

    /* ── Showcase ── */
    .lp-tabs { display: flex; gap: 6px; justify-content: center; margin-bottom: 20px; flex-wrap: wrap; }
    .lp-tab { padding: 8px 14px; border-radius: 8px; font-size: 12px; font-weight: 600; cursor: pointer; background: transparent; color: #6b6b80; border: 1px solid transparent; font-family: inherit; display: flex; align-items: center; gap: 6px; transition: all 0.2s; }
    .lp-tab-on { background: #D4226A15; color: #D4226A; border-color: #D4226A25; }
    .lp-tab-label { display: none; }
    @media (min-width: 520px) { .lp-tab-label { display: inline; } }
    .lp-showcase-frame { animation: fadeInUp 0.3s ease; }
    @keyframes fadeInUp { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
    .lp-mock { padding: 18px; border-radius: 14px; background: #101018; border: 1px solid #1a1a28; border-top: 3px solid #1a1a28; text-align: left; max-width: 440px; margin: 0 auto; }
    .lp-pl-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
    .lp-pl-item { padding: 10px; border-radius: 8px; background: #08080c; border-top: 2px solid #1a1a28; }

    /* ── Features ── */
    .lp-features { display: grid; grid-template-columns: 1fr; gap: 10px; }
    @media (min-width: 520px) { .lp-features { grid-template-columns: 1fr 1fr; } }
    @media (min-width: 768px) { .lp-features { grid-template-columns: 1fr 1fr 1fr; } }
    .lp-feat-card { padding: 18px; border-radius: 14px; background: #101018; border: 1px solid #1a1a28; transition: border-color 0.2s, transform 0.2s; }
    .lp-feat-card:hover { border-color: #D4226A20; transform: translateY(-2px); }

    /* ── Stats ── */
    .lp-stat-strip { display: flex; gap: 12px; justify-content: center; flex-wrap: wrap; margin-bottom: 20px; }
    .lp-stat { padding: 10px 20px; border-radius: 10px; background: #D4226A06; border: 1px solid #D4226A12; text-align: center; }
    .lp-stat-num { display: block; font-size: 22px; font-weight: 800; color: #D4226A; }

    /* ── Integration pills ── */
    .lp-int-pill { padding: 8px 16px; border-radius: 8px; background: #101018; border: 1px solid #1a1a28; font-size: 13px; color: #8b8ba0; font-weight: 600; }

    /* ── Pricing ── */
    .lp-pricing-grid { display: grid; grid-template-columns: 1fr; gap: 14px; max-width: 900px; margin: 24px auto 0; }
    @media (min-width: 640px) { .lp-pricing-grid { grid-template-columns: repeat(3, 1fr); } }
    .lp-price-card { padding: 24px; border-radius: 18px; background: #101018; border: 1px solid #1a1a28; display: flex; flex-direction: column; position: relative; }
    .lp-popular { border-color: #D4226A30; background: #D4226A04; border-top: 3px solid #D4226A; }
    .lp-pop-badge { position: absolute; top: -11px; left: 50%; transform: translateX(-50%); font-size: 10px; font-weight: 700; padding: 3px 12px; border-radius: 6px; background: #D4226A; color: #fff; white-space: nowrap; }
    .lp-price-name { font-size: 17px; font-weight: 800; margin-bottom: 2px; }
    .lp-price-tag { font-size: 12px; color: #8b8ba0; margin-bottom: 14px; }
    .lp-price-amt { font-size: 36px; font-weight: 900; margin-bottom: 4px; }
    .lp-price-mo { font-size: 15px; font-weight: 600; color: #6b6b80; }
    .lp-price-feat { flex: 1; margin-bottom: 16px; }
    .lp-feat-row { display: flex; align-items: flex-start; gap: 8px; font-size: 13px; color: #c0c0d0; margin-bottom: 5px; }
    .lp-check { color: #22c55e; font-weight: 700; flex-shrink: 0; }

    /* ── FAQ ── */
    .lp-acc { padding: 14px 18px; border-radius: 12px; background: #101018; border: 1px solid #1a1a28; cursor: pointer; -webkit-tap-highlight-color: transparent; }
    .lp-acc-q { display: flex; justify-content: space-between; align-items: center; font-size: 14px; font-weight: 600; }
    .lp-acc-a { font-size: 13px; color: #8b8ba0; line-height: 1.6; margin-top: 10px; }

    /* ── Footer ── */
    .lp-footer { padding: 40px 20px; border-top: 1px solid #1a1a28; text-align: center; }
    .lp-foot-link { background: none; border: none; color: #6b6b80; font-size: 13px; cursor: pointer; font-family: inherit; }

    /* ── Reduced motion ── */
    @media (prefers-reduced-motion: reduce) {
      .lp-cta { animation: none !important; }
      .lp-reveal { opacity: 1 !important; transform: none !important; transition: none !important; }
      .lp-gradient-bg { animation: none !important; }
      .lp-particle { animation: none !important; display: none; }
      .lp-showcase-frame { animation: none !important; }
    }
  `}</style>
}
