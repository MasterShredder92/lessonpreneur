import { COLORS, FONT, sectionStyle } from './shared'

const CENTER_X = 350
const CENTER_Y = 210
const NODE_RADIUS = 170
const NODE_SIZE = 22 // circle r (44px diameter)

const NODES = [
  { label: 'Leads', color: '#D4226A', angle: -90 },
  { label: 'Students', color: '#FF5500', angle: -30 },
  { label: 'Teachers', color: '#FFB800', angle: 30 },
  { label: 'Billing', color: '#D4226A', angle: 90 },
  { label: 'SMS', color: '#FF5500', angle: 150 },
  { label: 'Automations', color: '#FFB800', angle: 210 },
]

const KEYFRAMES = `
@keyframes lp-hub-pulse {
  0%, 100% { transform: scale(1); opacity: 0.6; }
  50%      { transform: scale(1.05); opacity: 0.9; }
}
@keyframes lp-hub-pulse-outer {
  0%, 100% { transform: scale(1); opacity: 0.2; }
  50%      { transform: scale(1.05); opacity: 0.35; }
}
@keyframes lp-hub-flow {
  from { stroke-dashoffset: 0; }
  to   { stroke-dashoffset: -10; }
}
.lp-hub-svg { display: block; }
.lp-hub-mobile { display: none; }
@media (max-width: 768px) {
  .lp-hub-svg { display: none !important; }
  .lp-hub-mobile { display: block !important; }
}
`

function nodePos(angleDeg: number) {
  const rad = (angleDeg * Math.PI) / 180
  return {
    x: CENTER_X + NODE_RADIUS * Math.cos(rad),
    y: CENTER_Y + NODE_RADIUS * Math.sin(rad),
  }
}

export default function LogoHubSection() {
  return (
    <section className="lp-section" style={sectionStyle}>
      <style>{KEYFRAMES}</style>
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
        Everything flows into <span style={{ color: COLORS.pink }}>one place</span>.
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
        Your leads, students, teachers, billing, and communications — all feeding into Lessonpreneur.
      </p>

      {/* Desktop SVG diagram */}
      <div
        className="lp-hub-svg"
        style={{
          marginTop: '40px',
          maxWidth: '700px',
          marginLeft: 'auto',
          marginRight: 'auto',
          position: 'relative',
        }}
      >
        <svg
          viewBox="0 0 700 420"
          width="100%"
          height="420"
          style={{ overflow: 'visible' }}
        >
          {/* Connector lines — node → center, animated flow toward center */}
          {NODES.map((n, i) => {
            const p = nodePos(n.angle)
            return (
              <line
                key={`line-${i}`}
                x1={p.x}
                y1={p.y}
                x2={CENTER_X}
                y2={CENTER_Y}
                stroke="rgba(212,34,106,0.4)"
                strokeWidth="1.5"
                strokeDasharray="6 4"
                style={{
                  animation: 'lp-hub-flow 2s linear infinite',
                }}
              />
            )
          })}

          {/* Outer pulsing ring */}
          <circle
            cx={CENTER_X}
            cy={CENTER_Y}
            r="80"
            fill="none"
            stroke="#D4226A"
            strokeWidth="1"
            style={{
              transformOrigin: `${CENTER_X}px ${CENTER_Y}px`,
              animation: 'lp-hub-pulse-outer 3s ease-in-out infinite',
            }}
          />
          {/* Inner pulsing ring */}
          <circle
            cx={CENTER_X}
            cy={CENTER_Y}
            r="60"
            fill="none"
            stroke="#D4226A"
            strokeWidth="2"
            style={{
              transformOrigin: `${CENTER_X}px ${CENTER_Y}px`,
              animation: 'lp-hub-pulse 3s ease-in-out infinite',
            }}
          />

          {/* Center logo background disc */}
          <circle cx={CENTER_X} cy={CENTER_Y} r="48" fill="#020209" stroke="rgba(212,34,106,0.3)" strokeWidth="1" />

          {/* Node circles + labels */}
          {NODES.map((n, i) => {
            const p = nodePos(n.angle)
            return (
              <g key={`node-${i}`}>
                {/* Glow */}
                <circle
                  cx={p.x}
                  cy={p.y}
                  r={NODE_SIZE + 6}
                  fill={n.color}
                  opacity="0.15"
                />
                {/* Main node */}
                <circle
                  cx={p.x}
                  cy={p.y}
                  r={NODE_SIZE}
                  fill="rgba(255,255,255,0.04)"
                  stroke="rgba(255,255,255,0.15)"
                  strokeWidth="1"
                />
                {/* Colored dot inside */}
                <circle cx={p.x} cy={p.y} r="7" fill={n.color} />
                {/* Label */}
                <text
                  x={p.x}
                  y={p.y + NODE_SIZE + 20}
                  textAnchor="middle"
                  fontFamily={FONT}
                  fontSize="12"
                  fontWeight="700"
                  fill="#fff"
                >
                  {n.label}
                </text>
              </g>
            )
          })}
        </svg>

        {/* Center LP logo img (positioned absolute over SVG) */}
        <img
          src="/lp-logo.png"
          alt="Lessonpreneur"
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            width: '64px',
            height: '64px',
            objectFit: 'contain',
            pointerEvents: 'none',
          }}
        />
      </div>

      {/* Mobile stacked grid */}
      <div
        className="lp-hub-mobile"
        style={{
          marginTop: '32px',
          maxWidth: '380px',
          marginLeft: 'auto',
          marginRight: 'auto',
        }}
      >
        {/* Center logo */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            marginBottom: '24px',
          }}
        >
          <div
            style={{
              width: '88px',
              height: '88px',
              borderRadius: '50%',
              background: '#020209',
              border: '2px solid rgba(212,34,106,0.5)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 0 24px rgba(212,34,106,0.25)',
            }}
          >
            <img
              src="/lp-logo.png"
              alt="Lessonpreneur"
              style={{ width: '56px', height: '56px', objectFit: 'contain' }}
            />
          </div>
          <div
            style={{
              marginTop: '10px',
              fontFamily: FONT,
              fontSize: '12px',
              fontWeight: 700,
              color: 'rgba(255,255,255,0.55)',
              textTransform: 'uppercase',
              letterSpacing: '0.1em',
            }}
          >
            all roads lead here
          </div>
        </div>

        {/* 3-column icon grid */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: '16px',
          }}
        >
          {NODES.map((n) => (
            <div
              key={n.label}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                padding: '16px 8px',
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.10)',
                borderRadius: '12px',
              }}
            >
              <div
                style={{
                  width: '44px',
                  height: '44px',
                  borderRadius: '50%',
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.15)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <div
                  style={{
                    width: '14px',
                    height: '14px',
                    borderRadius: '50%',
                    background: n.color,
                  }}
                />
              </div>
              <div
                style={{
                  marginTop: '10px',
                  fontFamily: FONT,
                  fontSize: '12px',
                  fontWeight: 700,
                  color: '#fff',
                  textAlign: 'center',
                }}
              >
                {n.label}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
