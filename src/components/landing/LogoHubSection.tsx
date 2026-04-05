import { COLORS, FONT, sectionStyle } from './shared'

const CENTER_X = 350
const CENTER_Y = 230
const NODE_RADIUS = 185
const ARROW_END_RADIUS = 118 // where line ends (just outside outer ring)
const NODE_SIZE = 24

const NODES = [
  { label: 'Leads', color: '#D4226A', angle: -90 },
  { label: 'Students', color: '#FF5500', angle: -30 },
  { label: 'Teachers', color: '#FFB800', angle: 30 },
  { label: 'Billing', color: '#D4226A', angle: 90 },
  { label: 'SMS', color: '#FF5500', angle: 150 },
  { label: 'Automations', color: '#FFB800', angle: 210 },
]

const UNIQUE_COLORS = ['#D4226A', '#FF5500', '#FFB800']

const KEYFRAMES = `
@keyframes lp-heartbeat {
  0%   { transform: translate(-50%, -50%) scale(1); }
  14%  { transform: translate(-50%, -50%) scale(1.09); }
  28%  { transform: translate(-50%, -50%) scale(1); }
  42%  { transform: translate(-50%, -50%) scale(1.05); }
  70%  { transform: translate(-50%, -50%) scale(1); }
  100% { transform: translate(-50%, -50%) scale(1); }
}
@keyframes lp-heartbeat-glow {
  0%, 28%, 70%, 100% { opacity: 0.4; }
  14%                 { opacity: 0.9; }
  42%                 { opacity: 0.65; }
}
@keyframes lp-ring-pulse {
  0%, 100% { transform: scale(1); opacity: 0.6; }
  50%      { transform: scale(1.05); opacity: 0.9; }
}
@keyframes lp-ring-pulse-outer {
  0%, 100% { transform: scale(1); opacity: 0.2; }
  50%      { transform: scale(1.08); opacity: 0.35; }
}
@keyframes lp-hub-flow {
  from { stroke-dashoffset: 0; }
  to   { stroke-dashoffset: -18; }
}
.lp-hub-svg-wrap { display: block; }
.lp-hub-mobile { display: none; }
@media (max-width: 768px) {
  .lp-hub-svg-wrap { display: none !important; }
  .lp-hub-mobile { display: block !important; }
}
`

function nodePos(angleDeg: number, r: number = NODE_RADIUS) {
  const rad = (angleDeg * Math.PI) / 180
  return {
    x: CENTER_X + r * Math.cos(rad),
    y: CENTER_Y + r * Math.sin(rad),
  }
}

// Compute line start/end so line originates from node edge and ends just outside the center ring
function lineEndpoints(angleDeg: number) {
  const nodeEdgeR = NODE_RADIUS - NODE_SIZE - 2 // start at node inner edge
  const endR = ARROW_END_RADIUS
  const rad = (angleDeg * Math.PI) / 180
  // Going FROM node TOWARD center: start at nodeEdge, end at endR
  return {
    x1: CENTER_X + nodeEdgeR * Math.cos(rad),
    y1: CENTER_Y + nodeEdgeR * Math.sin(rad),
    x2: CENTER_X + endR * Math.cos(rad),
    y2: CENTER_Y + endR * Math.sin(rad),
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
        className="lp-hub-svg-wrap"
        style={{
          marginTop: '48px',
          maxWidth: '720px',
          marginLeft: 'auto',
          marginRight: 'auto',
          position: 'relative',
        }}
      >
        <svg
          viewBox="0 0 700 460"
          width="100%"
          style={{ overflow: 'visible', display: 'block' }}
        >
          <defs>
            {UNIQUE_COLORS.map((c) => (
              <marker
                key={c}
                id={`arrow-${c.replace('#', '')}`}
                viewBox="0 0 10 10"
                refX="9"
                refY="5"
                markerWidth="7"
                markerHeight="7"
                orient="auto"
              >
                <path d="M 0 0 L 10 5 L 0 10 z" fill={c} />
              </marker>
            ))}
            <radialGradient id="lp-center-glow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#D4226A" stopOpacity="0.45" />
              <stop offset="60%" stopColor="#D4226A" stopOpacity="0.10" />
              <stop offset="100%" stopColor="#D4226A" stopOpacity="0" />
            </radialGradient>
          </defs>

          {/* Heartbeat glow behind logo */}
          <circle
            cx={CENTER_X}
            cy={CENTER_Y}
            r="140"
            fill="url(#lp-center-glow)"
            style={{
              transformOrigin: `${CENTER_X}px ${CENTER_Y}px`,
              animation: 'lp-heartbeat-glow 1.5s ease-in-out infinite',
            }}
          />

          {/* Flowing dashed energy lines (behind arrows) */}
          {NODES.map((n, i) => {
            const p = lineEndpoints(n.angle)
            return (
              <line
                key={`flow-${i}`}
                x1={p.x1}
                y1={p.y1}
                x2={p.x2}
                y2={p.y2}
                stroke={n.color}
                strokeWidth="1"
                strokeDasharray="4 6"
                opacity="0.35"
                style={{
                  animation: 'lp-hub-flow 1.8s linear infinite',
                }}
              />
            )
          })}

          {/* Solid colored arrows pointing IN to center */}
          {NODES.map((n, i) => {
            const p = lineEndpoints(n.angle)
            return (
              <line
                key={`arrow-${i}`}
                x1={p.x1}
                y1={p.y1}
                x2={p.x2}
                y2={p.y2}
                stroke={n.color}
                strokeWidth="2.5"
                strokeLinecap="round"
                opacity="0.75"
                markerEnd={`url(#arrow-${n.color.replace('#', '')})`}
              />
            )
          })}

          {/* Pulsing outer ring */}
          <circle
            cx={CENTER_X}
            cy={CENTER_Y}
            r="108"
            fill="none"
            stroke="#D4226A"
            strokeWidth="1"
            style={{
              transformOrigin: `${CENTER_X}px ${CENTER_Y}px`,
              animation: 'lp-ring-pulse-outer 2.4s ease-in-out infinite',
            }}
          />
          {/* Pulsing inner ring */}
          <circle
            cx={CENTER_X}
            cy={CENTER_Y}
            r="92"
            fill="none"
            stroke="#D4226A"
            strokeWidth="2"
            style={{
              transformOrigin: `${CENTER_X}px ${CENTER_Y}px`,
              animation: 'lp-ring-pulse 2.4s ease-in-out infinite',
            }}
          />

          {/* Center disc for logo background */}
          <circle
            cx={CENTER_X}
            cy={CENTER_Y}
            r="78"
            fill="#020209"
            stroke="rgba(212,34,106,0.5)"
            strokeWidth="1.5"
          />

          {/* Node circles + labels */}
          {NODES.map((n, i) => {
            const p = nodePos(n.angle)
            return (
              <g key={`node-${i}`}>
                <circle cx={p.x} cy={p.y} r={NODE_SIZE + 8} fill={n.color} opacity="0.12" />
                <circle
                  cx={p.x}
                  cy={p.y}
                  r={NODE_SIZE}
                  fill="rgba(2,2,9,0.9)"
                  stroke={n.color}
                  strokeWidth="1.5"
                  opacity="0.95"
                />
                <circle cx={p.x} cy={p.y} r="8" fill={n.color} />
                <text
                  x={p.x}
                  y={p.y + NODE_SIZE + 22}
                  textAnchor="middle"
                  fontFamily={FONT}
                  fontSize="13"
                  fontWeight="800"
                  fill="#fff"
                >
                  {n.label}
                </text>
              </g>
            )
          })}
        </svg>

        {/* Center LP logo — heartbeat */}
        <img
          src="/lp-logo.png"
          alt="Lessonpreneur"
          style={{
            position: 'absolute',
            top: `${(CENTER_Y / 460) * 100}%`,
            left: `${(CENTER_X / 700) * 100}%`,
            transform: 'translate(-50%, -50%)',
            width: '120px',
            height: '120px',
            objectFit: 'contain',
            pointerEvents: 'none',
            animation: 'lp-heartbeat 1.5s ease-in-out infinite',
            filter: 'drop-shadow(0 0 16px rgba(212,34,106,0.4))',
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
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            marginBottom: '28px',
            position: 'relative',
          }}
        >
          <div
            style={{
              width: '120px',
              height: '120px',
              borderRadius: '50%',
              background: '#020209',
              border: '2px solid rgba(212,34,106,0.5)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 0 32px rgba(212,34,106,0.35)',
              animation: 'lp-heartbeat 1.5s ease-in-out infinite',
            }}
          >
            <img
              src="/lp-logo.png"
              alt="Lessonpreneur"
              style={{ width: '80px', height: '80px', objectFit: 'contain' }}
            />
          </div>
          <div
            style={{
              marginTop: '12px',
              fontFamily: FONT,
              fontSize: '11px',
              fontWeight: 800,
              color: 'rgba(255,255,255,0.55)',
              textTransform: 'uppercase',
              letterSpacing: '0.12em',
            }}
          >
            all roads lead here
          </div>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: '12px',
          }}
        >
          {NODES.map((n) => (
            <div
              key={n.label}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                padding: '14px 6px',
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.10)',
                borderRadius: '12px',
                position: 'relative',
              }}
            >
              <div
                style={{
                  width: '44px',
                  height: '44px',
                  borderRadius: '50%',
                  background: 'rgba(2,2,9,0.9)',
                  border: `1.5px solid ${n.color}`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: `0 0 12px ${n.color}33`,
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
                  marginTop: '4px',
                  fontSize: '14px',
                  color: n.color,
                  fontWeight: 900,
                  lineHeight: 1,
                }}
              >
                ↑
              </div>
              <div
                style={{
                  marginTop: '4px',
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
