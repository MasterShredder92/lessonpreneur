import { Users, GraduationCap, Music, CreditCard, MessageSquare, Zap } from 'lucide-react'
import type { ComponentType, SVGProps } from 'react'
import { COLORS, FONT, sectionStyle } from './shared'

const PINK = '#D4226A'

type NodeDef = {
  key: string
  label: string
  x: number
  y: number
  angle: number // degrees from center, 0 = east, cw in screen coords
  dur: number // dash pulse duration in seconds
  Icon: ComponentType<SVGProps<SVGSVGElement>>
}

// Nodes positioned at r=230 from center (300,300) at exact clock positions
const NODES: NodeDef[] = [
  { key: 'leads',       label: 'Leads',       x: 300, y: 70,  angle: -90,  dur: 1.5, Icon: Users },
  { key: 'students',    label: 'Students',    x: 494, y: 185, angle: -30,  dur: 1.8, Icon: GraduationCap },
  { key: 'teachers',    label: 'Teachers',    x: 494, y: 415, angle: 30,   dur: 2.1, Icon: Music },
  { key: 'billing',     label: 'Billing',     x: 300, y: 530, angle: 90,   dur: 1.6, Icon: CreditCard },
  { key: 'sms',         label: 'SMS',         x: 106, y: 415, angle: 150,  dur: 1.9, Icon: MessageSquare },
  { key: 'automations', label: 'Automations', x: 106, y: 185, angle: 210,  dur: 2.3, Icon: Zap },
]

// Arrowhead position on outer ring (r=80 from center) + rotation to point inward
function arrowTransform(angleDeg: number): { x: number; y: number; rot: number } {
  const rad = (angleDeg * Math.PI) / 180
  return {
    x: 300 + 80 * Math.cos(rad),
    y: 300 + 80 * Math.sin(rad),
    rot: angleDeg + 180, // point toward center
  }
}

const KEYFRAMES = `
@keyframes lp-hub-heartbeat {
  0%   { transform: scale(1); }
  14%  { transform: scale(1.09); }
  28%  { transform: scale(1); }
  42%  { transform: scale(1.05); }
  56%  { transform: scale(1); }
  100% { transform: scale(1); }
}
.lp-hub-ring { transform-origin: 300px 300px; animation: lp-hub-heartbeat 1.8s infinite ease-in-out; }
.lp-hub-ring-1 { animation-delay: 0s; }
.lp-hub-ring-2 { animation-delay: 0.12s; }
.lp-hub-ring-3 { animation-delay: 0.24s; }
.lp-hub-logo-pulse { transform-origin: 300px 300px; animation: lp-hub-heartbeat 1.8s infinite ease-in-out; }
@media (max-width: 480px) {
  .lp-hub-node-label { display: none !important; }
}
`

export default function LogoHubSection() {
  return (
    <section className="lp-section" style={sectionStyle}>
      <style>{KEYFRAMES}</style>

      <h2
        className="lp-h2"
        style={{
          fontFamily: FONT,
          fontWeight: 900,
          fontSize: '36px',
          lineHeight: 1.15,
          color: COLORS.textPrimary,
          margin: 0,
          textAlign: 'center',
        }}
      >
        Everything flows into <span style={{ color: PINK }}>one place</span>.
      </h2>
      <p
        className="lp-sub"
        style={{
          fontFamily: FONT,
          fontSize: '17px',
          lineHeight: 1.5,
          color: 'rgba(255,255,255,0.65)',
          margin: '16px auto 40px auto',
          maxWidth: '560px',
          textAlign: 'center',
        }}
      >
        Every part of your school feeding into one living system.
      </p>

      <div
        style={{
          width: '100%',
          maxWidth: '680px',
          margin: '0 auto',
        }}
      >
        <svg
          viewBox="0 0 600 600"
          width="100%"
          height="auto"
          preserveAspectRatio="xMidYMid meet"
          style={{ display: 'block', overflow: 'visible' }}
        >
          <defs>
            <filter id="lp-hub-glow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>
          </defs>

          {/* Three concentric rings — heartbeat pulse */}
          <circle
            className="lp-hub-ring lp-hub-ring-1"
            cx="300"
            cy="300"
            r="80"
            fill="none"
            stroke={PINK}
            strokeWidth="3"
            opacity="0.9"
          />
          <circle
            className="lp-hub-ring lp-hub-ring-2"
            cx="300"
            cy="300"
            r="100"
            fill="none"
            stroke={PINK}
            strokeWidth="1.5"
            opacity="0.45"
          />
          <circle
            className="lp-hub-ring lp-hub-ring-3"
            cx="300"
            cy="300"
            r="120"
            fill="none"
            stroke={PINK}
            strokeWidth="1"
            opacity="0.2"
          />

          {/* Connection lines — base track + animated dash pulse per node */}
          {NODES.map((n) => (
            <g key={`line-${n.key}`}>
              {/* Layer 1: base track */}
              <line
                x1={n.x}
                y1={n.y}
                x2={300}
                y2={300}
                stroke="rgba(255,255,255,0.12)"
                strokeWidth="1.5"
              />
              {/* Layer 2: animated data pulse with glow */}
              <line
                x1={n.x}
                y1={n.y}
                x2={300}
                y2={300}
                stroke={PINK}
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeDasharray="10 20"
                filter="url(#lp-hub-glow)"
              >
                <animate
                  attributeName="stroke-dashoffset"
                  from="90"
                  to="0"
                  dur={`${n.dur}s`}
                  repeatCount="indefinite"
                  calcMode="linear"
                />
              </line>
            </g>
          ))}

          {/* Layer 3: arrowheads at outer ring, pointing inward */}
          {NODES.map((n) => {
            const a = arrowTransform(n.angle)
            return (
              <polygon
                key={`arrow-${n.key}`}
                points="8,0 -4,-4 -4,4"
                fill={PINK}
                transform={`translate(${a.x},${a.y}) rotate(${a.rot})`}
              />
            )
          })}

          {/* Center LP logo + pulse group (logo inherits heartbeat via container) */}
          <g className="lp-hub-logo-pulse">
            <foreignObject x="240" y="240" width="120" height="120">
              <div
                style={{
                  width: '120px',
                  height: '120px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <img
                  src="/lp-logo.png"
                  alt="Lessonpreneur"
                  style={{
                    width: '120px',
                    height: '120px',
                    objectFit: 'contain',
                    filter: 'drop-shadow(0 0 20px rgba(212,34,106,0.55))',
                  }}
                />
              </div>
            </foreignObject>
          </g>

          {/* Six nodes */}
          {NODES.map((n) => (
            <g key={`node-${n.key}`}>
              {/* Outer glow ring */}
              <circle
                cx={n.x}
                cy={n.y}
                r="34"
                fill="none"
                stroke={PINK}
                strokeWidth="1"
                opacity="0.3"
              />
              {/* Inner glass circle */}
              <circle
                cx={n.x}
                cy={n.y}
                r="26"
                fill="rgba(255,255,255,0.07)"
                stroke="rgba(255,255,255,0.2)"
                strokeWidth="1"
              />
              {/* Icon via foreignObject, 22px, pink */}
              <foreignObject x={n.x - 11} y={n.y - 11} width="22" height="22">
                <div
                  style={{
                    width: '22px',
                    height: '22px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <n.Icon size={22} color={PINK} strokeWidth={2.25} />
                </div>
              </foreignObject>
              {/* Label */}
              <text
                className="lp-hub-node-label"
                x={n.x}
                y={n.y + 48}
                textAnchor="middle"
                fill="#ffffff"
                fontFamily={FONT}
                fontSize="13"
                fontWeight="700"
              >
                {n.label}
              </text>
            </g>
          ))}
        </svg>
      </div>

      <div
        style={{
          fontFamily: FONT,
          fontSize: '13px',
          fontStyle: 'italic',
          color: 'rgba(255,255,255,0.35)',
          textAlign: 'center',
          marginTop: '24px',
        }}
      >
        Lessonpreneur — always learning, always running.
      </div>
    </section>
  )
}
