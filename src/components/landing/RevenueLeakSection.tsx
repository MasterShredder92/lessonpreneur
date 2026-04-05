import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { COLORS, FONT, GlassCard, PrimaryButton, sectionStyle } from './shared'

function useAnimatedNumber(target: number, duration = 100) {
  const [display, setDisplay] = useState(target)
  const fromRef = useRef(target)
  const rafRef = useRef<number | null>(null)
  useEffect(() => {
    const from = fromRef.current
    const to = target
    if (from === to) return
    const start = performance.now()
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration)
      const val = Math.round(from + (to - from) * t)
      setDisplay(val)
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick)
      } else {
        fromRef.current = to
      }
    }
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current)
    rafRef.current = requestAnimationFrame(tick)
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current)
    }
  }, [target, duration])
  return display
}

function fmt(n: number) {
  return n.toLocaleString('en-US')
}

const sliderCss = `
.lp-slider {
  -webkit-appearance: none;
  appearance: none;
  width: 100%;
  height: 8px;
  border-radius: 999px;
  background: rgba(255,255,255,0.12);
  outline: none;
  accent-color: #D4226A;
  cursor: pointer;
  margin: 0;
  padding: 0;
}
.lp-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: #D4226A;
  border: 3px solid #fff;
  box-shadow: 0 0 12px rgba(212,34,106,0.5);
  cursor: pointer;
  transition: transform 150ms ease-out;
}
.lp-slider::-webkit-slider-thumb:hover,
.lp-slider::-webkit-slider-thumb:active {
  transform: scale(1.15);
}
.lp-slider::-moz-range-thumb {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: #D4226A;
  border: 3px solid #fff;
  box-shadow: 0 0 12px rgba(212,34,106,0.5);
  cursor: pointer;
}
.lp-slider-wrap { padding: 10px 0; }
@media (max-width: 768px) {
  .lp-slider { height: 10px; }
  .lp-slider::-webkit-slider-thumb { width: 32px; height: 32px; }
  .lp-slider::-moz-range-thumb { width: 32px; height: 32px; }
  .lp-slider-wrap { padding: 12px 0; }
  .lp-leak-card { padding: 24px !important; }
  .lp-leak-total { font-size: 44px !important; }
}
`

type SliderProps = {
  label: string
  min: number
  max: number
  value: number
  onChange: (v: number) => void
}

function Slider({ label, min, max, value, onChange }: SliderProps) {
  return (
    <div>
      <label
        style={{
          display: 'block',
          fontFamily: FONT,
          fontWeight: 700,
          fontSize: '15px',
          color: 'rgba(255,255,255,0.85)',
          marginBottom: '10px',
          lineHeight: 1.4,
        }}
      >
        {label}
        <span
          style={{
            float: 'right',
            color: COLORS.pink,
            fontWeight: 800,
            fontSize: '17px',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {value}
        </span>
      </label>
      <div className="lp-slider-wrap">
        <input
          type="range"
          className="lp-slider"
          min={min}
          max={max}
          step={1}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
        />
      </div>
    </div>
  )
}

export default function RevenueLeakSection() {
  const navigate = useNavigate()
  const [leads, setLeads] = useState(8)
  const [hours, setHours] = useState(6)
  const [drops, setDrops] = useState(5)

  const leadsLoss = leads * 160
  const hoursLoss = hours * 4 * 50
  const dropsLoss = drops * 160
  const total = leadsLoss + hoursLoss + dropsLoss

  const animatedTotal = useAnimatedNumber(total, 100)

  return (
    <section className="lp-section" style={sectionStyle}>
      <style>{sliderCss}</style>
      <h2
        className="lp-h2"
        style={{
          fontFamily: FONT,
          fontWeight: 800,
          fontSize: '36px',
          lineHeight: 1.2,
          color: COLORS.textPrimary,
          margin: 0,
          textAlign: 'center',
        }}
      >
        Stop the <span style={{ color: COLORS.pink }}>Bleeding</span>.
      </h2>
      <p
        className="lp-sub"
        style={{
          fontFamily: FONT,
          fontSize: '18px',
          lineHeight: 1.6,
          color: 'rgba(255,255,255,0.70)',
          margin: '16px auto 0 auto',
          maxWidth: '600px',
          textAlign: 'center',
        }}
      >
        Here's what operational chaos is actually costing you every month.
      </p>

      <div style={{ marginTop: '40px', maxWidth: '720px', marginLeft: 'auto', marginRight: 'auto' }}>
        <GlassCard style={{ padding: '40px' }} className="lp-leak-card">
          <div style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>
            <div>
              <Slider
                label="Leads that don't get followed up each month"
                min={0}
                max={30}
                value={leads}
                onChange={setLeads}
              />
              <div
                style={{
                  fontFamily: FONT,
                  fontSize: '14px',
                  color: 'rgba(255,255,255,0.65)',
                  marginTop: '10px',
                  lineHeight: 1.5,
                }}
              >
                At $160/month average, that's{' '}
                <span style={{ color: COLORS.pink, fontWeight: 900 }}>${fmt(leadsLoss)}</span> lost
                in potential monthly revenue
              </div>
            </div>

            <div>
              <Slider
                label="Hours per week spent on manual admin"
                min={0}
                max={20}
                value={hours}
                onChange={setHours}
              />
              <div
                style={{
                  fontFamily: FONT,
                  fontSize: '14px',
                  color: 'rgba(255,255,255,0.65)',
                  marginTop: '10px',
                  lineHeight: 1.5,
                }}
              >
                At $50/hour owner value, that's{' '}
                <span style={{ color: COLORS.pink, fontWeight: 900 }}>${fmt(hoursLoss)}</span> per
                month you're spending on things LP automates
              </div>
            </div>

            <div>
              <Slider
                label="Students who dropped in the last 3 months with no win-back attempt"
                min={0}
                max={20}
                value={drops}
                onChange={setDrops}
              />
              <div
                style={{
                  fontFamily: FONT,
                  fontSize: '14px',
                  color: 'rgba(255,255,255,0.65)',
                  marginTop: '10px',
                  lineHeight: 1.5,
                }}
              >
                At $160/month, that's{' '}
                <span style={{ color: COLORS.pink, fontWeight: 900 }}>${fmt(dropsLoss)}</span>{' '}
                walking out the door quietly
              </div>
            </div>

            <div
              style={{
                background: 'rgba(212,34,106,0.1)',
                border: '1px solid rgba(212,34,106,0.3)',
                borderRadius: '12px',
                padding: '24px',
                textAlign: 'center',
                marginTop: '8px',
              }}
            >
              <div
                className="lp-leak-total"
                style={{
                  fontFamily: FONT,
                  fontSize: '56px',
                  fontWeight: 900,
                  color: COLORS.pink,
                  lineHeight: 1,
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                ${fmt(animatedTotal)}
              </div>
              <div
                style={{
                  fontFamily: FONT,
                  fontSize: '14px',
                  color: 'rgba(255,255,255,0.55)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.1em',
                  marginTop: '10px',
                  fontWeight: 700,
                }}
              >
                estimated monthly revenue leak
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <PrimaryButton onClick={() => navigate('/start')} pulse>
                Start My Free 60-Day Trial — Let's Fix This
              </PrimaryButton>
            </div>
          </div>
        </GlassCard>
      </div>
    </section>
  )
}
