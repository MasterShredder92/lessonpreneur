import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'

/* ═══════════════════════════════════════════════════════
   /trial — CARD CAPTURE PAGE
   Shows summary, redirects to Stripe payment link.
   ═══════════════════════════════════════════════════════ */

const LAUNCH_PRICING_ENDS = '2026-07-03'

const PREVIEW_MOCK: ProspectData = {
  id: 'preview',
  first_name: 'Zach',
  studio_name: 'Adkins Music',
  student_count: '51-100',
  teacher_count: '4-6',
  location_count: '2-3',
  plan_selected: 'school',
}

const STRIPE_LINKS: Record<string, string> = {
  teacher: 'https://buy.stripe.com/aFabJ16ySgmabyE9JS2ZO02',
  school: 'https://buy.stripe.com/7sYdR97CW4Ds46c5tC2ZO01',
  multi: 'https://buy.stripe.com/dRm3cv3mGfi646c2hq2ZO00',
}

const PLAN_DISPLAY: Record<string, { name: string; price: string }> = {
  teacher: { name: 'Teacher', price: '$197/mo' },
  school: { name: 'School', price: '$497/mo' },
  multi: { name: 'Multi-Location', price: '$997/mo' },
}

function getTrialEndDate(): string {
  const d = new Date()
  d.setDate(d.getDate() + 60)
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
}

interface ProspectData {
  id: string
  first_name: string
  studio_name: string
  student_count: string
  teacher_count: string
  location_count: string
  plan_selected: string
}

export default function CardCapturePage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const isPreview = searchParams.get('preview') === 'true'
  const [prospect, setProspect] = useState<ProspectData | null>(isPreview ? PREVIEW_MOCK : null)
  const [clicked, setClicked] = useState(false)

  useEffect(() => {
    if (isPreview) return
    try {
      const raw = sessionStorage.getItem('lp_prospect')
      if (raw) {
        setProspect(JSON.parse(raw))
      } else {
        navigate('/get-started', { replace: true })
      }
    } catch {
      navigate('/get-started', { replace: true })
    }
  }, [navigate, isPreview])

  if (!prospect) return null

  const plan = prospect.plan_selected || 'school'
  const planInfo = PLAN_DISPLAY[plan] || PLAN_DISPLAY.school
  const stripeLink = STRIPE_LINKS[plan] || STRIPE_LINKS.school

  const handleStart = () => {
    setClicked(true)
    window.open(stripeLink, '_blank')
  }

  return (
    <div className="ccp">
      <style>{styles}</style>

      {/* Progress bar */}
      <div className="ccp-progress">
        <div className="ccp-progress-bar">
          <div className="ccp-progress-fill" />
        </div>
        <span className="ccp-progress-label">Step 2 of 2</span>
      </div>

      <div className="ccp-container">
        <h1 className="ccp-title">You're almost in.</h1>

        {/* Summary card */}
        <div className="card ccp-summary">
          <div className="ccp-summary-grid">
            {prospect.studio_name && (
              <SummaryRow label="Studio" value={prospect.studio_name} />
            )}
            {prospect.teacher_count && (
              <SummaryRow label="Teachers" value={prospect.teacher_count} />
            )}
            {prospect.student_count && (
              <SummaryRow label="Students" value={prospect.student_count} />
            )}
            {prospect.location_count && (
              <SummaryRow label="Locations" value={prospect.location_count} />
            )}
          </div>

          <div className="ccp-trial-info">
            <p className="ccp-trial-line">Your 60-day free trial starts today</p>
            <p className="ccp-trial-date">You will not be charged until {getTrialEndDate()}</p>
          </div>
        </div>

        {/* Plan confirmation */}
        <div className="ccp-plan-confirm">
          <div className="ccp-plan-row">
            <span className="ccp-plan-name">{planInfo.name} Plan</span>
            <span className="ccp-plan-price">{planInfo.price}</span>
          </div>
          <p className="ccp-plan-lock">
            Lock in launch pricing — goes up {new Date(LAUNCH_PRICING_ENDS).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
          </p>
        </div>

        {/* Reassurance block */}
        <div className="ccp-reassure">
          <svg className="ccp-reassure-icon" width="20" height="20" viewBox="0 0 16 16" fill="none">
            <path d="M8 1L2 4v4c0 3.5 2.5 6.5 6 7.5 3.5-1 6-4 6-7.5V4L8 1z" stroke="#22C55E" strokeWidth="1.5" fill="none" />
            <path d="M5.5 8.5l2 2 3.5-3.5" stroke="#22C55E" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <p className="ccp-reassure-text">
            No catch. No credit card charge for 60 full days. See exactly how much time and money
            Lessonpreneur saves your studio — completely free. If it's not for you, cancel before
            day 60 and you'll never pay a cent.
          </p>
        </div>

        {/* CTA */}
        {!clicked ? (
          <button className="ccp-cta" onClick={handleStart}>
            Start My 60-Day Free Trial →
          </button>
        ) : (
          <div className="ccp-waiting">
            <div className="ccp-spinner" />
            <p className="ccp-waiting-text">Completing your setup...</p>
            <p className="ccp-waiting-sub">Check your email for next steps.</p>
          </div>
        )}

        {/* Fine print */}
        <p className="ccp-fine">
          Secure checkout via Stripe. Cancel anytime. No charge for 60 days.
        </p>

        {/* Trust badges */}
        <div className="ccp-trust">
          {['256-bit SSL', 'Cancel anytime', 'No contracts'].map(badge => (
            <div key={badge} className="ccp-trust-badge">
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                <path d="M8 1L2 4v4c0 3.5 2.5 6.5 6 7.5 3.5-1 6-4 6-7.5V4L8 1z" stroke="#22C55E" strokeWidth="1.5" fill="none" />
                <path d="M5.5 8.5l2 2 3.5-3.5" stroke="#22C55E" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              {badge}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="ccp-summary-row">
      <span className="ccp-summary-label">{label}</span>
      <span className="ccp-summary-value">{value}</span>
    </div>
  )
}

const styles = `
.ccp {
  min-height: 100vh;
  background: #020209;
  color: #fff;
  font-family: 'Plus Jakarta Sans', system-ui, sans-serif;
}

/* Progress */
.ccp-progress {
  padding: 20px 24px 0;
  max-width: 600px;
  margin: 0 auto;
}
.ccp-progress-bar {
  height: 4px;
  background: rgba(255,255,255,0.08);
  border-radius: 4px;
  overflow: hidden;
}
.ccp-progress-fill {
  height: 100%;
  width: 100%;
  background: linear-gradient(135deg, #D4226A, #FF5500);
  border-radius: 4px;
}
.ccp-progress-label {
  display: block;
  text-align: center;
  font-size: 11px;
  color: #6868A0;
  font-weight: 600;
  margin-top: 8px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

/* Container */
.ccp-container {
  max-width: 520px;
  margin: 0 auto;
  padding: 48px 24px 80px;
}
.ccp-title {
  font-size: clamp(26px, 5vw, 36px);
  font-weight: 900;
  letter-spacing: -0.03em;
  margin: 0 0 28px;
  text-align: center;
}

/* Summary card */
.ccp-summary {
  margin-bottom: 24px;
}
.ccp-summary-grid {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-bottom: 20px;
}
.ccp-summary-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.ccp-summary-label {
  font-size: 12px;
  color: #6868A0;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}
.ccp-summary-value {
  font-size: 14px;
  font-weight: 700;
  color: #E8E8FC;
}
.ccp-trial-info {
  border-top: 1px solid rgba(255,255,255,0.06);
  padding-top: 16px;
}
.ccp-trial-line {
  font-size: 15px;
  font-weight: 700;
  color: #22C55E;
  margin: 0 0 4px;
}
.ccp-trial-date {
  font-size: 13px;
  color: #A0A0C8;
  margin: 0;
}

/* Plan confirm */
.ccp-plan-confirm {
  background: rgba(212,34,106,0.06);
  border: 1px solid rgba(212,34,106,0.2);
  border-radius: 16px;
  padding: 18px 20px;
  margin-bottom: 28px;
}
.ccp-plan-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 6px;
}
.ccp-plan-name {
  font-size: 16px;
  font-weight: 800;
}
.ccp-plan-price {
  font-size: 18px;
  font-weight: 900;
  background: linear-gradient(135deg, #D4226A 0%, #FF5500 55%, #FFB800 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}
.ccp-plan-lock {
  font-size: 12px;
  color: #A0A0C8;
  margin: 0;
}

/* Reassurance */
.ccp-reassure {
  display: flex;
  gap: 14px;
  align-items: flex-start;
  background: rgba(22,20,40,0.7);
  border: 1px solid rgba(34,197,94,0.15);
  border-radius: 16px;
  padding: 18px 20px;
  margin-bottom: 20px;
}
.ccp-reassure-icon {
  flex-shrink: 0;
  margin-top: 2px;
}
.ccp-reassure-text {
  font-size: 13px;
  line-height: 1.65;
  color: #A0A0C8;
  margin: 0;
}

/* CTA */
.ccp-cta {
  width: 100%;
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
.ccp-cta:hover {
  transform: translateY(-2px);
  box-shadow: 0 0 50px rgba(212,34,106,0.5), 0 8px 30px rgba(212,34,106,0.35);
}
@keyframes pulseGlow {
  0%, 100% { box-shadow: 0 0 20px rgba(212,34,106,0.3), 0 4px 16px rgba(212,34,106,0.2); }
  50% { box-shadow: 0 0 40px rgba(212,34,106,0.45), 0 4px 24px rgba(212,34,106,0.3); }
}

/* Waiting state */
.ccp-waiting {
  text-align: center;
  padding: 28px 0;
}
.ccp-spinner {
  width: 32px;
  height: 32px;
  border: 3px solid rgba(255,255,255,0.1);
  border-top-color: #D4226A;
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
  margin: 0 auto 16px;
}
@keyframes spin { to { transform: rotate(360deg); } }
.ccp-waiting-text {
  font-size: 16px;
  font-weight: 700;
  margin: 0 0 4px;
}
.ccp-waiting-sub {
  font-size: 13px;
  color: #A0A0C8;
  margin: 0;
}

/* Fine print */
.ccp-fine {
  text-align: center;
  font-size: 12px;
  color: #6868A0;
  margin: 16px 0 28px;
}

/* Trust badges */
.ccp-trust {
  display: flex;
  justify-content: center;
  gap: 20px;
  flex-wrap: wrap;
}
.ccp-trust-badge {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: #A0A0C8;
  font-weight: 600;
}
`
