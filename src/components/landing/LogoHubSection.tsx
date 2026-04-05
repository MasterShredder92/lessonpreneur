import { useNavigate } from 'react-router-dom'
import { PrimaryButton, sectionStyle } from './shared'
import { useInView } from './useInView'

const FONT = 'Plus Jakarta Sans, system-ui, -apple-system, sans-serif'

const CHAOS_ITEMS = [
  '😤 Dropped leads',
  '📊 Billing confusion',
  '📱 Parent texts at 9pm',
  '📅 Scheduling chaos',
  '👩‍🏫 Teacher coordination',
  '📋 Spreadsheet graveyard',
]

const OUTPUT_ITEMS = [
  '💰 Revenue recovered',
  '⏰ Hours back per week',
  '📈 Leads that convert',
  '😌 No more 9pm texts',
  '✅ Billing that makes sense',
  '🧘 Control of your school',
]

const KEYFRAMES = `
@keyframes lp-chaos-shake {
  0%, 100% { transform: translateX(0); }
  20%      { transform: translateX(-2px); }
  40%      { transform: translateX(2px); }
  60%      { transform: translateX(-1px); }
  80%      { transform: translateX(1px); }
}
@keyframes lp-stress-pulse {
  0%, 100% { opacity: 1; }
  50%      { opacity: 0.4; }
}
@keyframes lp-ring-cycle {
  0%       { stroke: #FF3B3B; transform: scale(1); }
  14%      { stroke: #FF3B3B; transform: scale(1.08); }
  28%      { stroke: #FF3B3B; transform: scale(1); }
  50%      { stroke: #a07040; transform: scale(1.04); }
  64%      { stroke: #00C853; transform: scale(1.08); }
  78%      { stroke: #00C853; transform: scale(1); }
  100%     { stroke: #FF3B3B; transform: scale(1); }
}
@keyframes lp-flow-dash {
  from { stroke-dashoffset: 60; }
  to   { stroke-dashoffset: 0; }
}
@keyframes lp-label-cycle {
  0%, 42%   { opacity: 1; content: 'processing...'; }
  50%       { opacity: 0.3; }
  58%, 92%  { opacity: 1; }
  100%      { opacity: 1; }
}
@keyframes lp-output-fly {
  0%   { transform: translateX(20px) scale(0.8); opacity: 0; }
  100% { transform: translateX(0) scale(1); opacity: 1; }
}
.lp-hub-grid { display: flex; flex-direction: row; align-items: center; gap: 0; max-width: 900px; margin: 0 auto; }
.lp-hub-col-chaos  { flex: 0 0 35%; }
.lp-hub-col-center { flex: 0 0 30%; }
.lp-hub-col-output { flex: 0 0 35%; }
.lp-hub-arrow-down { display: none; }
.lp-hub-arrow-right { display: inline; }
@media (max-width: 767px) {
  .lp-hub-grid { flex-direction: column; gap: 24px; }
  .lp-hub-col-chaos, .lp-hub-col-center, .lp-hub-col-output { flex: 0 0 auto; width: 100%; }
  .lp-hub-arrow-down { display: inline; }
  .lp-hub-arrow-right { display: none; }
  .lp-hub-chip { font-size: 12px !important; padding: 6px 12px !important; }
}
`

function ChaosChip({ text, shakeDelay }: { text: string; shakeDelay: number }) {
  return (
    <div
      className="lp-hub-chip"
      style={{
        background: 'rgba(255,59,59,0.10)',
        border: '1px solid rgba(255,59,59,0.25)',
        borderRadius: '999px',
        padding: '8px 14px',
        fontSize: '13px',
        color: 'rgba(255,255,255,0.70)',
        fontWeight: 600,
        fontFamily: FONT,
        textAlign: 'center',
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        justifyContent: 'center',
        animation: `lp-chaos-shake 0.3s ease-in-out ${shakeDelay}s infinite`,
      }}
    >
      <span
        style={{
          width: '6px',
          height: '6px',
          borderRadius: '50%',
          background: '#FF3B3B',
          flexShrink: 0,
        }}
      />
      <span>{text}</span>
    </div>
  )
}

function OutputChip({
  text,
  index,
  visible,
}: {
  text: string
  index: number
  visible: boolean
}) {
  return (
    <div
      className="lp-hub-chip"
      style={{
        background: 'rgba(0,200,83,0.10)',
        border: '1px solid rgba(0,200,83,0.25)',
        borderRadius: '999px',
        padding: '8px 14px',
        fontSize: '13px',
        color: 'rgba(255,255,255,0.80)',
        fontWeight: 600,
        fontFamily: FONT,
        textAlign: 'center',
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        justifyContent: 'center',
        opacity: 0,
        animation: visible
          ? `lp-output-fly 300ms ${index * 100}ms ease-out both`
          : 'none',
      }}
    >
      <span
        style={{
          width: '6px',
          height: '6px',
          borderRadius: '50%',
          background: '#00C853',
          flexShrink: 0,
        }}
      />
      <span>{text}</span>
    </div>
  )
}

function FlowArrow({
  color,
  arrowColor,
  delay,
  rotateForMobile,
}: {
  color: string
  arrowColor: string
  delay: number
  rotateForMobile?: boolean
}) {
  const className = rotateForMobile ? 'lp-hub-arrow-wrap' : 'lp-hub-arrow-wrap'
  return (
    <div className={className} style={{ display: 'flex', justifyContent: 'center' }}>
      {/* Horizontal (desktop) */}
      <svg
        className="lp-hub-arrow-right"
        width="60"
        height="20"
        viewBox="0 0 60 20"
        style={{ display: 'block' }}
      >
        <line
          x1="0"
          y1="10"
          x2="52"
          y2="10"
          stroke={color}
          strokeWidth="2"
          strokeDasharray="6 4"
          strokeLinecap="round"
          style={{ animation: `lp-flow-dash 1.2s linear infinite ${delay}s` }}
        />
        <polygon points="52,4 60,10 52,16" fill={arrowColor} />
      </svg>
      {/* Vertical (mobile) */}
      <svg
        className="lp-hub-arrow-down"
        width="20"
        height="60"
        viewBox="0 0 20 60"
        style={{ display: 'block' }}
      >
        <line
          x1="10"
          y1="0"
          x2="10"
          y2="52"
          stroke={color}
          strokeWidth="2"
          strokeDasharray="6 4"
          strokeLinecap="round"
          style={{ animation: `lp-flow-dash 1.2s linear infinite ${delay}s` }}
        />
        <polygon points="4,52 10,60 16,52" fill={arrowColor} />
      </svg>
    </div>
  )
}

export default function LogoHubSection() {
  const navigate = useNavigate()
  const [outputRef, outputInView] = useInView<HTMLDivElement>(0.2)

  return (
    <section className="lp-section" style={{ ...sectionStyle, position: 'relative', overflow: 'hidden' }}>
      <style>{KEYFRAMES}</style>

      {/* Ambient red→green gradient */}
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          top: '50%',
          left: 0,
          transform: 'translateY(-50%)',
          width: '300px',
          height: '300px',
          maxWidth: '100%',
          background: 'radial-gradient(circle, #FF3B3B 0%, transparent 70%)',
          opacity: 0.06,
          filter: 'blur(80px)',
          pointerEvents: 'none',
          zIndex: 0,
        }}
      />
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          top: '50%',
          right: 0,
          transform: 'translateY(-50%)',
          width: '300px',
          height: '300px',
          maxWidth: '100%',
          background: 'radial-gradient(circle, #00C853 0%, transparent 70%)',
          opacity: 0.06,
          filter: 'blur(80px)',
          pointerEvents: 'none',
          zIndex: 0,
        }}
      />

      <div style={{ position: 'relative', zIndex: 1 }}>
        {/* Heading */}
        <h2
          className="lp-h2"
          style={{
            fontFamily: FONT,
            fontWeight: 900,
            fontSize: '36px',
            lineHeight: 1.15,
            color: '#ffffff',
            textAlign: 'center',
            margin: 0,
          }}
        >
          Put the chaos in. <span style={{ color: '#D4226A' }}>Get your life back.</span>
        </h2>
        <p
          className="lp-sub"
          style={{
            fontFamily: FONT,
            fontSize: '16px',
            lineHeight: 1.5,
            color: 'rgba(255,255,255,0.60)',
            textAlign: 'center',
            margin: '16px auto 48px auto',
            maxWidth: '600px',
          }}
        >
          Lessonpreneur takes everything running your school manually costs you — and turns it
          into revenue, time, and control.
        </p>

        {/* Three columns */}
        <div className="lp-hub-grid">
          {/* LEFT — CHAOS */}
          <div className="lp-hub-col-chaos">
            <div
              style={{
                fontFamily: FONT,
                fontSize: '11px',
                textTransform: 'uppercase',
                letterSpacing: '0.12em',
                color: 'rgba(255,255,255,0.35)',
                textAlign: 'center',
                marginBottom: '16px',
              }}
            >
              What you're dealing with
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {CHAOS_ITEMS.map((item, i) => (
                <ChaosChip key={item} text={item} shakeDelay={i * 0.9} />
              ))}
            </div>
            <div
              style={{
                fontSize: '18px',
                color: '#FF3B3B',
                textAlign: 'center',
                marginTop: '16px',
                animation: 'lp-stress-pulse 1.2s ease-in-out infinite',
              }}
            >
              ⚡⚡⚡
            </div>
          </div>

          {/* CENTER — PROCESSOR */}
          <div
            className="lp-hub-col-center"
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <FlowArrow
              color="rgba(255,59,59,0.40)"
              arrowColor="rgba(255,59,59,0.60)"
              delay={0}
            />

            {/* LP logo + rings */}
            <div
              style={{
                position: 'relative',
                width: '150px',
                height: '150px',
                margin: '12px 0',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <svg
                width="150"
                height="150"
                viewBox="0 0 150 150"
                style={{ position: 'absolute', inset: 0, overflow: 'visible' }}
              >
                {[48, 60, 72].map((r, i) => (
                  <circle
                    key={i}
                    cx="75"
                    cy="75"
                    r={r}
                    fill="none"
                    strokeWidth={3 - i}
                    opacity={0.9 - i * 0.3}
                    style={{
                      transformOrigin: '75px 75px',
                      animation: `lp-ring-cycle 3.6s ease-in-out infinite ${i * 0.12}s`,
                    }}
                  />
                ))}
              </svg>
              <img
                src="/lp-logo.png"
                alt="Lessonpreneur"
                className="lp-hub-center-logo"
                style={{
                  position: 'relative',
                  width: '90px',
                  height: '90px',
                  objectFit: 'contain',
                  filter: 'drop-shadow(0 0 18px rgba(212,34,106,0.45))',
                }}
              />
              <style>{`
                @media (max-width: 767px) {
                  .lp-hub-center-logo { width: 70px !important; height: 70px !important; }
                }
              `}</style>
            </div>
            <div
              style={{
                fontFamily: FONT,
                fontSize: '10px',
                color: 'rgba(255,255,255,0.30)',
                fontStyle: 'italic',
                textAlign: 'center',
                marginTop: '8px',
                animation: 'lp-stress-pulse 3.6s ease-in-out infinite',
              }}
            >
              processing...
            </div>

            <div style={{ marginTop: '16px' }}>
              <FlowArrow
                color="rgba(0,200,83,0.50)"
                arrowColor="rgba(0,200,83,0.80)"
                delay={0.6}
              />
            </div>
          </div>

          {/* RIGHT — OUTPUT */}
          <div className="lp-hub-col-output" ref={outputRef}>
            <div
              style={{
                fontFamily: FONT,
                fontSize: '11px',
                textTransform: 'uppercase',
                letterSpacing: '0.12em',
                color: 'rgba(255,255,255,0.35)',
                textAlign: 'center',
                marginBottom: '16px',
              }}
            >
              What you get back
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {OUTPUT_ITEMS.map((item, i) => (
                <OutputChip key={item} text={item} index={i} visible={outputInView} />
              ))}
            </div>
            <div
              style={{
                fontSize: '22px',
                textAlign: 'center',
                marginTop: '16px',
                letterSpacing: '4px',
              }}
            >
              💸 → 🕐 → 😮‍💨
            </div>
            <div
              style={{
                fontFamily: FONT,
                fontSize: '10px',
                color: 'rgba(255,255,255,0.30)',
                letterSpacing: '0.15em',
                textTransform: 'uppercase',
                textAlign: 'center',
                marginTop: '6px',
              }}
            >
              revenue · time · relief
            </div>
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            fontFamily: FONT,
            fontSize: '13px',
            color: 'rgba(255,255,255,0.30)',
            fontStyle: 'italic',
            textAlign: 'center',
            marginTop: '48px',
          }}
        >
          The average music school owner reclaims 6–10 hours per week after switching.
        </div>
        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            marginTop: '20px',
          }}
        >
          <PrimaryButton onClick={() => navigate('/start')}>
            See How It Works — Start Free for 60 Days
          </PrimaryButton>
        </div>
      </div>

      {/* Responsive h2 sizing */}
      <style>{`
        @media (max-width: 767px) {
          .lp-section .lp-h2 { font-size: 26px !important; }
          .lp-section .lp-sub { font-size: 14px !important; margin-bottom: 32px !important; }
        }
      `}</style>
    </section>
  )
}
