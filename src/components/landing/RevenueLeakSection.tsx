import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { COLORS, FONT, GlassCard, PrimaryButton, sectionStyle } from './shared'
import { ZW } from '../../config/zwBrand'

const GREEN = '#22C55E'
const RED = '#EF4444'
const CHURN_RATE = 0.05 // 5% monthly churn assumption
const PER_STUDENT = 160
const HOURLY_VALUE = 50
const LP_PRICE_MONTHLY = 297 // placeholder — update with real price
const MAX_STUDENTS = 500

function useAnimatedNumber(target: number, duration = 200) {
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
.lp-compare-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
@media (max-width: 768px) {
  .lp-slider { height: 10px; }
  .lp-slider::-webkit-slider-thumb { width: 32px; height: 32px; }
  .lp-slider::-moz-range-thumb { width: 32px; height: 32px; }
  .lp-slider-wrap { padding: 12px 0; }
  .lp-leak-card { padding: 24px !important; }
  .lp-compare-grid { grid-template-columns: 1fr !important; }
  .lp-compare-big { font-size: 30px !important; }
  .lp-compare-small { font-size: 15px !important; }
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
  const [students, setStudents] = useState(40)
  const [hours, setHours] = useState(20)

  const atMax = students >= MAX_STUDENTS
  const droppedStudents = Math.round(students * CHURN_RATE)
  const churnLoss = droppedStudents * PER_STUDENT
  const adminCost = hours * 4 * HOURLY_VALUE
  const monthlyLoss = churnLoss + adminCost
  const yearlyLoss = monthlyLoss * 12
  const monthlySaved = Math.max(0, monthlyLoss - LP_PRICE_MONTHLY)
  const yearlySaved = monthlySaved * 12

  const animMonthlySaved = useAnimatedNumber(monthlySaved)
  const animYearlySaved = useAnimatedNumber(yearlySaved)
  const animMonthlyLoss = useAnimatedNumber(monthlyLoss)
  const animYearlyLoss = useAnimatedNumber(yearlyLoss)

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
        Here's what operational chaos is actually costing you — and what Lessonpreneur by ZiroWork would plug.
      </p>

      <div style={{ marginTop: '40px', maxWidth: '720px', marginLeft: 'auto', marginRight: 'auto' }}>
        <GlassCard style={{ padding: '40px' }} className="lp-leak-card">
          <div style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>
            <Slider
              label="How many students do you have?"
              min={20}
              max={MAX_STUDENTS}
              step={10}
              value={students}
              display={atMax ? '500+' : fmt(students)}
              onChange={setStudents}
            />

            <Slider
              label="Hours per week you spend on manual admin"
              min={20}
              max={80}
              value={hours}
              display={`${hours} hrs`}
              onChange={setHours}
            />

            {atMax ? (
              <div
                style={{
                  background: 'rgba(212,34,106,0.08)',
                  border: '1px solid rgba(212,34,106,0.35)',
                  borderRadius: '12px',
                  padding: '28px 24px',
                  textAlign: 'center',
                }}
              >
                <div
                  style={{
                    fontFamily: FONT,
                    fontSize: '22px',
                    fontWeight: 900,
                    color: COLORS.pink,
                    lineHeight: 1.3,
                  }}
                >
                  At 500+ students, you need the full playbook.
                </div>
                <div
                  style={{
                    fontFamily: FONT,
                    fontSize: '15px',
                    color: 'rgba(255,255,255,0.70)',
                    lineHeight: 1.6,
                    marginTop: '10px',
                  }}
                >
                  A school your size is losing six figures a year to operational drag. Let's get on
                  a call and figure out what {ZW.productByline} looks like for you specifically.
                </div>
              </div>
            ) : (
              <>
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
                  At 5% monthly churn, you're likely losing{' '}
                  <span style={{ color: '#fff', fontWeight: 800 }}>
                    ~{droppedStudents} students
                  </span>
                  /month. At ${PER_STUDENT}/student + admin hours, here's the picture:
                </div>

                <div className="lp-compare-grid">
                  {/* WITH LP — green */}
                  <div
                    style={{
                      background: 'rgba(34,197,94,0.10)',
                      border: '1px solid rgba(34,197,94,0.35)',
                      borderRadius: '12px',
                      padding: '20px 18px',
                      textAlign: 'center',
                    }}
                  >
                    <div
                      style={{
                        fontFamily: FONT,
                        fontSize: '11px',
                        fontWeight: 800,
                        color: GREEN,
                        textTransform: 'uppercase',
                        letterSpacing: '0.1em',
                        opacity: 0.9,
                      }}
                    >
                      With Lessonpreneur by ZiroWork
                    </div>
                    <div
                      className="lp-compare-big"
                      style={{
                        fontFamily: FONT,
                        fontSize: '34px',
                        fontWeight: 900,
                        color: GREEN,
                        lineHeight: 1,
                        marginTop: '10px',
                        fontVariantNumeric: 'tabular-nums',
                      }}
                    >
                      +${fmt(animMonthlySaved)}
                      <span style={{ fontSize: '14px', fontWeight: 700, opacity: 0.75 }}> /mo</span>
                    </div>
                    <div
                      className="lp-compare-small"
                      style={{
                        fontFamily: FONT,
                        fontSize: '17px',
                        fontWeight: 800,
                        color: GREEN,
                        marginTop: '6px',
                        opacity: 0.9,
                        fontVariantNumeric: 'tabular-nums',
                      }}
                    >
                      +${fmt(animYearlySaved)} <span style={{ opacity: 0.75 }}>/yr</span>
                    </div>
                    <div
                      style={{
                        fontFamily: FONT,
                        fontSize: '12px',
                        color: 'rgba(255,255,255,0.55)',
                        marginTop: '10px',
                        lineHeight: 1.5,
                      }}
                    >
                      {`net after $${LP_PRICE_MONTHLY}/mo ${ZW.product}`}
                    </div>
                  </div>

                  {/* WITHOUT LP — red */}
                  <div
                    style={{
                      background: 'rgba(239,68,68,0.10)',
                      border: '1px solid rgba(239,68,68,0.35)',
                      borderRadius: '12px',
                      padding: '20px 18px',
                      textAlign: 'center',
                    }}
                  >
                    <div
                      style={{
                        fontFamily: FONT,
                        fontSize: '11px',
                        fontWeight: 800,
                        color: RED,
                        textTransform: 'uppercase',
                        letterSpacing: '0.1em',
                        opacity: 0.9,
                      }}
                    >
                      Without it
                    </div>
                    <div
                      className="lp-compare-big"
                      style={{
                        fontFamily: FONT,
                        fontSize: '34px',
                        fontWeight: 900,
                        color: RED,
                        lineHeight: 1,
                        marginTop: '10px',
                        fontVariantNumeric: 'tabular-nums',
                      }}
                    >
                      −${fmt(animMonthlyLoss)}
                      <span style={{ fontSize: '14px', fontWeight: 700, opacity: 0.75 }}> /mo</span>
                    </div>
                    <div
                      className="lp-compare-small"
                      style={{
                        fontFamily: FONT,
                        fontSize: '17px',
                        fontWeight: 800,
                        color: RED,
                        marginTop: '6px',
                        opacity: 0.9,
                        fontVariantNumeric: 'tabular-nums',
                      }}
                    >
                      −${fmt(animYearlyLoss)} <span style={{ opacity: 0.75 }}>/yr</span>
                    </div>
                    <div
                      style={{
                        fontFamily: FONT,
                        fontSize: '12px',
                        color: 'rgba(255,255,255,0.55)',
                        marginTop: '10px',
                        lineHeight: 1.5,
                      }}
                    >
                      churn + admin drag
                    </div>
                  </div>
                </div>
              </>
            )}

            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <PrimaryButton onClick={() => navigate('/start')} pulse>
                {atMax
                  ? 'Book a Call — Let\'s Talk'
                  : 'Start My Free 60-Day Trial — Let\'s Fix This'}
              </PrimaryButton>
            </div>
          </div>
        </GlassCard>
      </div>
    </section>
  )
}
