import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { COLORS, FONT, GlassCard, PrimaryButton, sectionStyle } from './shared'

const GREEN = '#22C55E'
const CHURN_RATE = 0.05 // 5% monthly churn assumption
const PER_STUDENT = 160
const HOURLY_VALUE = 50

function useAnimatedNumber(target: number, duration = 150) {
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
  step?: number
  value: number
  display: string
  onChange: (v: number) => void
}

function Slider({ label, min, max, step = 1, value, display, onChange }: SliderProps) {
  return (
    <div>
      <label
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          gap: '12px',
          fontFamily: FONT,
          fontWeight: 700,
          fontSize: '15px',
          color: 'rgba(255,255,255,0.85)',
          marginBottom: '10px',
          lineHeight: 1.4,
        }}
      >
        <span>{label}</span>
        <span
          style={{
            color: COLORS.pink,
            fontWeight: 900,
            fontSize: '20px',
            fontVariantNumeric: 'tabular-nums',
            flexShrink: 0,
          }}
        >
          {display}
        </span>
      </label>
      <div className="lp-slider-wrap">
        <input
          type="range"
          className="lp-slider"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
        />
      </div>
    </div>
  )
}

export default function RevenueLeakSection() {
  const navigate = useNavigate()
  const [students, setStudents] = useState(100)
  const [hours, setHours] = useState(6)

  const droppedStudents = Math.round(students * CHURN_RATE)
  const churnLoss = droppedStudents * PER_STUDENT
  const adminCost = hours * 4 * HOURLY_VALUE
  const total = churnLoss + adminCost

  const animatedTotal = useAnimatedNumber(total)

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
            <Slider
              label="How many students do you have?"
              min={10}
              max={500}
              step={5}
              value={students}
              display={fmt(students)}
              onChange={setStudents}
            />

            <Slider
              label="Hours per week you spend on manual admin"
              min={0}
              max={20}
              value={hours}
              display={`${hours} hrs`}
              onChange={setHours}
            />

            <div
              style={{
                fontFamily: FONT,
                fontSize: '14px',
                color: 'rgba(255,255,255,0.60)',
                lineHeight: 1.6,
                textAlign: 'center',
                padding: '0 4px',
              }}
            >
              At an average 5% monthly churn, you're likely losing{' '}
              <span style={{ color: '#fff', fontWeight: 800 }}>~{droppedStudents} students</span>{' '}
              every month. At <span style={{ color: '#fff', fontWeight: 800 }}>${PER_STUDENT}</span>{' '}
              per student, that's{' '}
              <span style={{ color: GREEN, fontWeight: 900 }}>${fmt(churnLoss)}</span> walking out
              the door. Plus{' '}
              <span style={{ color: GREEN, fontWeight: 900 }}>${fmt(adminCost)}</span> in admin
              hours LP automates.
            </div>

            <div
              style={{
                background: 'rgba(34,197,94,0.10)',
                border: '1px solid rgba(34,197,94,0.35)',
                borderRadius: '12px',
                padding: '24px',
                textAlign: 'center',
              }}
            >
              <div
                className="lp-leak-total"
                style={{
                  fontFamily: FONT,
                  fontSize: '56px',
                  fontWeight: 900,
                  color: GREEN,
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
                  color: GREEN,
                  textTransform: 'uppercase',
                  letterSpacing: '0.1em',
                  marginTop: '10px',
                  fontWeight: 700,
                  opacity: 0.85,
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
