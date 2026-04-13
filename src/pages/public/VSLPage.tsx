import { useNavigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import StickyRevenueCounter from '../../components/public/StickyRevenueCounter'
import { ZW } from '../../config/zwBrand'

/* ═══════════════════════════════════════════════════════
   /start — VSL PAGE
   Single-purpose: convert curiosity into a form fill.
   No nav. No footer. No distractions.
   ═══════════════════════════════════════════════════════ */

const VSL_VIDEO_URL = '' // Swap with Bunny.net or Loom embed URL
const LAUNCH_PRICING_ENDS = '2026-07-03'

const PLANS = [
  {
    key: 'teacher',
    name: 'Teacher',
    desc: 'For solo instructors ready to go pro',
    originalPrice: 297,
    launchPrice: 197,
    features: [
      'Up to 80 active students',
      'AI-powered scheduling',
      'Automated payment collection',
      'Student & family portal',
      'Star AI studio advisor',
    ],
  },
  {
    key: 'school',
    name: 'School',
    desc: 'For studios with a teaching roster',
    originalPrice: 697,
    launchPrice: 497,
    popular: true,
    features: [
      'Unlimited students',
      'Multi-teacher management',
      'Payroll & financial dashboards',
      'Lead pipeline & follow-up',
      'Star AI studio advisor',
    ],
  },
  {
    key: 'multi',
    name: 'Multi-Location',
    desc: 'For schools running 2+ locations',
    originalPrice: 1297,
    launchPrice: 997,
    features: [
      'Everything in School',
      'Multi-location dashboards',
      'Cross-location scheduling',
      'Recruitment pipeline',
      'Priority support & onboarding',
    ],
  },
]

function getDaysRemaining(): number {
  const end = new Date(LAUNCH_PRICING_ENDS + 'T23:59:59')
  const now = new Date()
  return Math.max(0, Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)))
}

export default function VSLPage() {
  const navigate = useNavigate()
  const [daysLeft, setDaysLeft] = useState(getDaysRemaining)

  useEffect(() => {
    const t = setInterval(() => setDaysLeft(getDaysRemaining()), 60_000)
    return () => clearInterval(t)
  }, [])

  return (
    <div className="vsl">
      <style>{styles}</style>
      <BackgroundOrbs />

      {/* Brand hierarchy */}
      <header className="vsl-logo">
        <div className="vsl-logo-parent">{ZW.parent}</div>
        <div className="vsl-logo-product">{ZW.productByline}</div>
        <div className="vsl-logo-tag">{ZW.musicSchoolsPowered}</div>
      </header>

      {/* Video — top of page, immediately below logo */}
      <section className="vsl-video-section">
        {VSL_VIDEO_URL ? (
          <div className="vsl-video-wrap">
            <iframe
              src={VSL_VIDEO_URL}
              title="Watch How It Works"
              allowFullScreen
              style={{ border: 0, width: '100%', height: '100%', borderRadius: 16 }}
            />
          </div>
        ) : (
          <div className="vsl-video-placeholder card">
            <div className="vsl-play-btn">
              <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
                <circle cx="24" cy="24" r="23" stroke="rgba(212,34,106,0.5)" strokeWidth="2" />
                <path d="M19 15l14 9-14 9V15z" fill="#D4226A" />
              </svg>
            </div>
            <p className="vsl-play-label">Watch How It Works — 4 min</p>
          </div>
        )}
      </section>

      {/* Headline + Subheadline — below video */}
      <section className="vsl-hero">
        <h1 className="vsl-headline">
          Fill Your Schedule. Automate The Admin.{' '}
          <span className="text-gradient">Keep More Of What You Earn.</span>
        </h1>
        <p className="vsl-sub">
          {ZW.productByline} is the AI-powered music-school operating system on {ZW.parent} — built for owners and
          teachers who run real schools. Built by a real school owner.
        </p>
      </section>

      {/* Social Proof */}
      <section className="vsl-proof">
        {[
          '10+ Years. Real Schools. Built By An Operator.',
          '600+ Students. Zero Spreadsheets.',
          '$1.2M+ Annual Revenue. One Platform.',
          '42 Teachers. 4 Locations. One Login.',
        ].map(s => (
          <div key={s} className="vsl-proof-item">
            <span className="vsl-proof-stat">{s}</span>
          </div>
        ))}
      </section>

      {/* Pricing — informational reference, single CTA */}
      <section className="vsl-pricing">
        <h2 className="vsl-section-title">Launch Pricing</h2>
        <div className="vsl-pricing-grid">
          {PLANS.map(p => (
            <div key={p.key} className={`card vsl-plan-card${p.popular ? ' vsl-plan-popular' : ''}`}>
              {p.popular && <div className="vsl-popular-badge">Most Popular</div>}
              <h3 className="vsl-plan-name">{p.name}</h3>
              <p className="vsl-plan-desc">{p.desc}</p>
              <div className="vsl-plan-price">
                <span className="vsl-plan-original">${p.originalPrice}/mo</span>
                <span className="vsl-plan-launch">${p.launchPrice}<span className="vsl-plan-mo">/mo</span></span>
              </div>
              <div className="vsl-legacy-badge">Legacy Price — Locked For Life</div>
              <ul className="vsl-plan-features">
                {p.features.map(f => (
                  <li key={f}>
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }}>
                      <path d="M3 8.5l3 3 7-7" stroke="#22C55E" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    {f}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <button className="vsl-pricing-cta" onClick={() => navigate('/get-started')}>
          Get 60 Days Free — Find My Plan →
        </button>
      </section>

      {/* Urgency Banner */}
      <section className="vsl-urgency">
        <div className="vsl-urgency-inner">
          <p className="vsl-urgency-text">
            Launch pricing ends {new Date(LAUNCH_PRICING_ENDS).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}.
            Price increases permanently after.
          </p>
          <div className="vsl-countdown">
            <span className="vsl-countdown-num">{daysLeft}</span>
            <span className="vsl-countdown-label">days remaining</span>
          </div>
        </div>
      </section>

      {/* Primary CTA */}
      <section className="vsl-final-cta">
        <button className="vsl-cta-btn" onClick={() => navigate('/get-started')}>
          Get 60 Days Free →
        </button>
        <p className="vsl-cta-sub">No credit card required to start. Cancel anytime.</p>
      </section>
      <StickyRevenueCounter />
    </div>
  )
}

function BackgroundOrbs() {
  return (
    <div className="vsl-orbs" aria-hidden="true">
      <div className="vsl-orb vsl-orb-1" />
      <div className="vsl-orb vsl-orb-2" />
      <div className="vsl-orb vsl-orb-3" />
    </div>
  )
}

const styles = `
/* ── VSL Page ── */
.vsl {
  min-height: 100vh;
  background: #020209;
  color: #fff;
  font-family: 'Plus Jakarta Sans', system-ui, sans-serif;
  position: relative;
  overflow-x: hidden;
}

/* Orbs */
.vsl-orbs {
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 0;
}
.vsl-orb {
  position: absolute;
  border-radius: 50%;
  filter: blur(120px);
  opacity: 0.15;
}
.vsl-orb-1 {
  width: 600px; height: 600px;
  background: radial-gradient(circle, #D4226A, transparent 70%);
  top: -200px; right: -200px;
}
.vsl-orb-2 {
  width: 500px; height: 500px;
  background: radial-gradient(circle, #FF5500, transparent 70%);
  bottom: 20%; left: -200px;
}
.vsl-orb-3 {
  width: 420px; height: 420px;
  background: radial-gradient(circle, #0D9488, transparent 72%);
  top: 35%; right: -120px;
  opacity: 0.12;
}

/* Logo / brand hierarchy */
.vsl-logo {
  text-align: center;
  padding: 40px 24px 0;
  position: relative;
  z-index: 1;
}
.vsl-logo-parent {
  font-size: 26px;
  font-weight: 900;
  letter-spacing: -0.03em;
  color: #F8FAFC;
}
.vsl-logo-product {
  margin-top: 8px;
  font-size: 14px;
  font-weight: 700;
  color: #2DD4BF;
  letter-spacing: 0.02em;
}
.vsl-logo-tag {
  margin-top: 10px;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: rgba(255,255,255,0.38);
}

/* Hero */
.vsl-hero {
  text-align: center;
  padding: 48px 24px 32px;
  max-width: 800px;
  margin: 0 auto;
  position: relative;
  z-index: 1;
}
.vsl-headline {
  font-size: clamp(28px, 5.5vw, 52px);
  font-weight: 900;
  line-height: 1.1;
  letter-spacing: -0.03em;
  margin: 0 0 20px;
}
.vsl-sub {
  font-size: clamp(15px, 2.2vw, 18px);
  color: #A0A0C8;
  line-height: 1.6;
  max-width: 600px;
  margin: 0 auto;
}

/* Video */
.vsl-video-section {
  max-width: 800px;
  margin: 0 auto;
  padding: 24px 24px 32px;
  position: relative;
  z-index: 1;
}
.vsl-video-wrap {
  aspect-ratio: 16/9;
  border-radius: 16px;
  overflow: hidden;
  background: rgba(22,20,40,0.97);
  border: 1px solid rgba(255,255,255,0.12);
}
.vsl-video-placeholder {
  aspect-ratio: 16/9;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  cursor: pointer;
  transition: all 220ms ease;
}
.vsl-video-placeholder:hover {
  border-color: rgba(212,34,106,0.3);
}
.vsl-play-btn {
  opacity: 0.9;
  transition: transform 220ms ease;
}
.vsl-video-placeholder:hover .vsl-play-btn {
  transform: scale(1.1);
}
.vsl-play-label {
  font-size: 14px;
  color: #A0A0C8;
  font-weight: 600;
}

/* Social Proof */
.vsl-proof {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  max-width: 720px;
  margin: 0 auto;
  padding: 0 24px 64px;
  position: relative;
  z-index: 1;
}
@media (max-width: 520px) {
  .vsl-proof { grid-template-columns: 1fr; }
}
.vsl-proof-item {
  background: rgba(22,20,40,0.7);
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 14px;
  padding: 16px 20px;
  text-align: center;
}
.vsl-proof-stat {
  font-size: 14px;
  font-weight: 700;
  color: #E8E8FC;
  letter-spacing: -0.01em;
  line-height: 1.4;
}

/* Pricing */
.vsl-pricing {
  max-width: 1080px;
  margin: 0 auto;
  padding: 0 24px 64px;
  position: relative;
  z-index: 1;
}
.vsl-section-title {
  text-align: center;
  font-size: clamp(22px, 3.5vw, 32px);
  font-weight: 900;
  margin: 0 0 36px;
  letter-spacing: -0.02em;
}
.vsl-pricing-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 20px;
}
@media (max-width: 768px) {
  .vsl-pricing-grid {
    grid-template-columns: 1fr;
    max-width: 400px;
    margin: 0 auto;
  }
}

.vsl-plan-card {
  display: flex;
  flex-direction: column;
  padding: 28px 24px;
  transition: all 220ms ease;
}
.vsl-plan-card:hover {
  border-color: rgba(212,34,106,0.3);
  transform: translateY(-4px);
}
.vsl-plan-popular {
  border-color: rgba(212,34,106,0.35) !important;
  box-shadow:
    0 4px 24px rgba(0,0,0,0.5),
    inset 0 1px 0 rgba(255,255,255,0.08),
    0 0 40px rgba(212,34,106,0.08);
}
.vsl-popular-badge {
  display: inline-block;
  background: linear-gradient(135deg, #D4226A, #FF5500);
  color: white;
  font-size: 10.5px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  padding: 4px 12px;
  border-radius: 999px;
  margin-bottom: 12px;
  width: fit-content;
}
.vsl-plan-name {
  font-size: 20px;
  font-weight: 800;
  margin: 0 0 4px;
}
.vsl-plan-desc {
  font-size: 13px;
  color: #A0A0C8;
  margin: 0 0 20px;
}
.vsl-plan-price {
  margin-bottom: 20px;
}
.vsl-plan-original {
  display: block;
  font-size: 14px;
  color: #6868A0;
  text-decoration: line-through;
  margin-bottom: 2px;
}
.vsl-plan-launch {
  font-size: 36px;
  font-weight: 900;
  letter-spacing: -0.03em;
  background: linear-gradient(135deg, #D4226A 0%, #FF5500 55%, #FFB800 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}
.vsl-plan-mo {
  font-size: 16px;
  font-weight: 600;
}
.vsl-plan-features {
  list-style: none;
  padding: 0;
  margin: 0 0 24px;
  flex: 1;
}
.vsl-plan-features li {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 13px;
  color: #E8E8FC;
  padding: 6px 0;
}
.vsl-legacy-badge {
  display: inline-block;
  padding: 4px 12px;
  border-radius: 6px;
  background: rgba(255,184,0,0.08);
  border: 1px solid rgba(255,184,0,0.2);
  color: #FFB800;
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  margin-bottom: 12px;
}
.vsl-pricing-cta {
  display: block;
  width: 100%;
  max-width: 420px;
  margin: 32px auto 0;
  padding: 18px;
  border: none;
  border-radius: 14px;
  background: #D4226A;
  color: white;
  font-family: 'Plus Jakarta Sans', system-ui, sans-serif;
  font-size: 17px;
  font-weight: 800;
  cursor: pointer;
  transition: all 140ms ease;
  animation: pulseGlow 2.5s ease-in-out infinite;
}
.vsl-pricing-cta:hover {
  transform: translateY(-2px);
  box-shadow: 0 0 50px rgba(212,34,106,0.5), 0 8px 30px rgba(212,34,106,0.35);
}

/* Urgency Banner */
.vsl-urgency {
  padding: 0 24px 48px;
  position: relative;
  z-index: 1;
}
.vsl-urgency-inner {
  max-width: 700px;
  margin: 0 auto;
  background: linear-gradient(135deg, rgba(212,34,106,0.15), rgba(255,85,0,0.12));
  border: 1px solid rgba(212,34,106,0.3);
  border-radius: 20px;
  padding: 28px 32px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
  flex-wrap: wrap;
}
.vsl-urgency-text {
  font-size: 15px;
  font-weight: 600;
  color: #E8E8FC;
  margin: 0;
  flex: 1;
  min-width: 200px;
}
.vsl-countdown {
  display: flex;
  flex-direction: column;
  align-items: center;
  flex-shrink: 0;
}
.vsl-countdown-num {
  font-size: 40px;
  font-weight: 900;
  letter-spacing: -0.03em;
  background: linear-gradient(135deg, #D4226A, #FF5500);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  line-height: 1;
}
.vsl-countdown-label {
  font-size: 11px;
  color: #A0A0C8;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

/* Final CTA */
.vsl-final-cta {
  text-align: center;
  padding: 0 24px 100px;
  position: relative;
  z-index: 1;
}

@keyframes pulseGlow {
  0%, 100% { box-shadow: 0 0 20px rgba(212,34,106,0.3), 0 4px 16px rgba(212,34,106,0.2); }
  50% { box-shadow: 0 0 40px rgba(212,34,106,0.45), 0 4px 24px rgba(212,34,106,0.3); }
}

.vsl-cta-btn {
  display: inline-block;
  padding: 18px 48px;
  background: #D4226A;
  color: white;
  border: none;
  border-radius: 14px;
  font-family: 'Plus Jakarta Sans', system-ui, sans-serif;
  font-size: 18px;
  font-weight: 800;
  cursor: pointer;
  transition: all 140ms ease;
  animation: pulseGlow 2.5s ease-in-out infinite;
}
.vsl-cta-btn:hover {
  transform: translateY(-2px) scale(1.02);
  box-shadow: 0 0 50px rgba(212,34,106,0.5), 0 8px 30px rgba(212,34,106,0.35);
}
@media (max-width: 480px) {
  .vsl-cta-btn {
    width: 100%;
    padding: 18px 24px;
  }
}
.vsl-cta-sub {
  font-size: 13px;
  color: #6868A0;
  margin-top: 12px;
}
`
