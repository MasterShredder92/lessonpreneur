import { Users, GraduationCap, Music, CreditCard, MessageSquare, Zap } from 'lucide-react'
import type { ComponentType, SVGProps } from 'react'
import { COLORS, FONT, sectionStyle } from './shared'
import { useInView } from './useInView'

// ─────────────────────────────────────────────────────────────────────────────
// Desktop SVG geometry (viewBox 0 0 680 680, container scales responsively)
// ─────────────────────────────────────────────────────────────────────────────
const VB = 680
const CX = 340
const CY = 340
const RING_R = [70, 90, 110]
const ORBIT_R = 240
const NODE_DIAM = 52
const NODE_R = NODE_DIAM / 2
const LINE_START_R = ORBIT_R - NODE_R - 2 // start at node edge
const LINE_END_R = 72 // just past innermost ring

const PINK = '#D4226A'

type NodeDef = {
  key: string
  label: string
  desc: string
  angle: number // degrees; -90 = 12 o'clock
  Icon: ComponentType<SVGProps<SVGSVGElement>>
  flowDur: number // seconds, for continuous flow anim
}

const NODES: NodeDef[] = [
  { key: 'leads', label: 'Leads', desc: 'Auto follow-up the moment they come in', angle: -90, Icon: Users, flowDur: 1.6 },
  { key: 'students', label: 'Students', desc: 'Every profile, session, and note in one place', angle: -30, Icon: GraduationCap, flowDur: 1.9 },
  { key: 'teachers', label: 'Teachers', desc: 'Schedules, availability, coordination', angle: 30, Icon: Music, flowDur: 2.2 },
  { key: 'billing', label: 'Billing', desc: 'Clear, connected, no reconciling', angle: 90, Icon: CreditCard, flowDur: 1.7 },
  { key: 'sms', label: 'SMS', desc: 'Two-way communication without your personal number', angle: 150, Icon: MessageSquare, flowDur: 2.0 },
  { key: 'automations', label: 'Automations', desc: 'Running in the background while you teach', angle: 210, Icon: Zap, flowDur: 1.8 },
]

function polar(angleDeg: number, r: number) {
  const rad = (angleDeg * Math.PI) / 180
  return { x: CX + r * Math.cos(rad), y: CY + r * Math.sin(rad) }
}

const KEYFRAMES = `
@keyframes lp-heartbeat {
  0%   { transform: translate(-50%, -50%) scale(1); }
  14%  { transform: translate(-50%, -50%) scale(1.08); }
  28%  { transform: translate(-50%, -50%) scale(1); }
  42%  { transform: translate(-50%, -50%) scale(1.05); }
  56%  { transform: translate(-50%, -50%) scale(1); }
  100% { transform: translate(-50%, -50%) scale(1); }
}
@keyframes lp-ring-heartbeat-1 {
  0%   { transform: scale(1); opacity: 0.8; }
  14%  { transform: scale(1.08); opacity: 1; }
  28%  { transform: scale(1); opacity: 0.8; }
  42%  { transform: scale(1.05); opacity: 0.9; }
  56%  { transform: scale(1); opacity: 0.8; }
  100% { transform: scale(1); opacity: 0.8; }
}
@keyframes lp-ring-heartbeat-2 {
  0%   { transform: scale(1); opacity: 0.4; }
  14%  { transform: scale(1.08); opacity: 0.6; }
  28%  { transform: scale(1); opacity: 0.4; }
  42%  { transform: scale(1.05); opacity: 0.5; }
  56%  { transform: scale(1); opacity: 0.4; }
  100% { transform: scale(1); opacity: 0.4; }
}
@keyframes lp-ring-heartbeat-3 {
  0%   { transform: scale(1); opacity: 0.2; }
  14%  { transform: scale(1.08); opacity: 0.4; }
  28%  { transform: scale(1); opacity: 0.2; }
  42%  { transform: scale(1.05); opacity: 0.3; }
  56%  { transform: scale(1); opacity: 0.2; }
  100% { transform: scale(1); opacity: 0.2; }
}
@keyframes lp-flow-dash {
  from { stroke-dashoffset: 72; }
  to   { stroke-dashoffset: 0; }
}
@keyframes lp-logo-enter {
  from { opacity: 0; }
  to   { opacity: 1; }
}
@keyframes lp-ring-enter {
  from { transform: scale(0); opacity: 0; }
  to   { transform: scale(1); opacity: 1; }
}
@keyframes lp-node-pop {
  0%   { transform: translate(-50%, -50%) scale(0); opacity: 0; }
  60%  { transform: translate(-50%, -50%) scale(1.15); opacity: 1; }
  100% { transform: translate(-50%, -50%) scale(1); opacity: 1; }
}
@keyframes lp-line-fade {
  from { opacity: 0; }
  to   { opacity: 1; }
}
@keyframes lp-mobile-flow {
  0%   { transform: translateY(-100%); }
  100% { transform: translateY(100%); }
}
@keyframes lp-mobile-heartbeat {
  0%   { transform: scale(1); }
  14%  { transform: scale(1.08); }
  28%  { transform: scale(1); }
  42%  { transform: scale(1.05); }
  56%  { transform: scale(1); }
  100% { transform: scale(1); }
}
@keyframes lp-mobile-ring-beat {
  0%   { transform: scale(1); opacity: 0.6; }
  14%  { transform: scale(1.08); opacity: 0.9; }
  28%  { transform: scale(1); opacity: 0.6; }
  42%  { transform: scale(1.05); opacity: 0.75; }
  56%  { transform: scale(1); opacity: 0.6; }
  100% { transform: scale(1); opacity: 0.6; }
}
.lp-hub-desktop { display: block; }
.lp-hub-mobile  { display: none; }
@media (max-width: 768px) {
  .lp-hub-desktop { display: none !important; }
  .lp-hub-mobile  { display: block !important; }
}
`

export default function LogoHubSection() {
  const [ref, inView] = useInView<HTMLDivElement>(0.2)

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
        Your leads, students, teachers, billing, and communications — feeding into Lessonpreneur in real time.
      </p>

      {/* Anchor ref for visibility — shared between desktop & mobile */}
      <div ref={ref} style={{ marginTop: '48px' }}>
        {/* ═══ DESKTOP DIAGRAM ═══ */}
        <div
          className="lp-hub-desktop"
          style={{
            position: 'relative',
            width: '100%',
            maxWidth: '680px',
            aspectRatio: '1 / 1',
            margin: '0 auto',
          }}
        >
          <svg
            viewBox={`0 0 ${VB} ${VB}`}
            width="100%"
            height="100%"
            style={{ overflow: 'visible', display: 'block', position: 'absolute', inset: 0 }}
          >
            <defs>
              <marker
                id="lp-hub-arrow"
                viewBox="0 0 10 10"
                refX="9"
                refY="5"
                markerWidth="6"
                markerHeight="6"
                orient="auto"
              >
                <path d="M 0 0 L 10 5 L 0 10 z" fill={PINK} />
              </marker>
            </defs>

            {/* Concentric rings — centered on logo */}
            {RING_R.map((r, i) => {
              const strokes = [2, 1, 0.5]
              return (
                <circle
                  key={`ring-${i}`}
                  cx={CX}
                  cy={CY}
                  r={r}
                  fill="none"
                  stroke={PINK}
                  strokeWidth={strokes[i]}
                  style={{
                    transformOrigin: `${CX}px ${CY}px`,
                    opacity: 0,
                    animation: inView
                      ? `lp-ring-enter 600ms ${200 + i * 80}ms ease-out both, lp-ring-heartbeat-${i + 1} 1.8s ${800 + i * 100}ms ease-in-out infinite`
                      : 'none',
                  }}
                />
              )
            })}

            {/* Flow lines (base + animated dash) */}
            {NODES.map((n, i) => {
              const start = polar(n.angle, LINE_START_R)
              const end = polar(n.angle, LINE_END_R)
              const enterDelay = 600 + i * 150 + 200
              return (
                <g key={`flow-${n.key}`}>
                  {/* Static base line */}
                  <line
                    x1={start.x}
                    y1={start.y}
                    x2={end.x}
                    y2={end.y}
                    stroke="rgba(255,255,255,0.08)"
                    strokeWidth="1.5"
                    style={{
                      opacity: 0,
                      animation: inView ? `lp-line-fade 400ms ${enterDelay}ms ease-out both` : 'none',
                    }}
                  />
                  {/* Animated dash */}
                  <line
                    x1={start.x}
                    y1={start.y}
                    x2={end.x}
                    y2={end.y}
                    stroke={PINK}
                    strokeWidth="2"
                    strokeDasharray="8 16"
                    strokeLinecap="round"
                    markerEnd="url(#lp-hub-arrow)"
                    style={{
                      opacity: 0,
                      animation: inView
                        ? `lp-line-fade 400ms ${enterDelay}ms ease-out both, lp-flow-dash ${n.flowDur}s ${enterDelay}ms linear infinite`
                        : 'none',
                    }}
                  />
                </g>
              )
            })}
          </svg>

          {/* Center LP logo */}
          <div
            style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              width: `${(100 / VB) * 100}%`,
              aspectRatio: '1 / 1',
              transform: 'translate(-50%, -50%)',
              opacity: 0,
              animation: inView
                ? 'lp-logo-enter 400ms 0ms ease-out both, lp-heartbeat 1.8s 800ms ease-in-out infinite'
                : 'none',
              pointerEvents: 'none',
            }}
          >
            <img
              src="/lp-logo.png"
              alt="Lessonpreneur"
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'contain',
                filter: 'drop-shadow(0 0 18px rgba(212,34,106,0.45))',
              }}
            />
          </div>

          {/* Six HTML nodes (for backdrop-filter glassmorphism + Lucide icons) */}
          {NODES.map((n, i) => {
            const p = polar(n.angle, ORBIT_R)
            const leftPct = (p.x / VB) * 100
            const topPct = (p.y / VB) * 100
            const popDelay = 600 + i * 150
            return (
              <div
                key={`node-${n.key}`}
                style={{
                  position: 'absolute',
                  top: `${topPct}%`,
                  left: `${leftPct}%`,
                  width: `${(NODE_DIAM / VB) * 100}%`,
                  aspectRatio: '1 / 1',
                  opacity: 0,
                  animation: inView
                    ? `lp-node-pop 500ms ${popDelay}ms cubic-bezier(0.34,1.56,0.64,1) both`
                    : 'none',
                  pointerEvents: 'none',
                  transformOrigin: 'center',
                }}
              >
                {/* Glass circle */}
                <div
                  style={{
                    width: '100%',
                    height: '100%',
                    borderRadius: '50%',
                    background: 'rgba(255,255,255,0.06)',
                    border: '1px solid rgba(255,255,255,0.15)',
                    backdropFilter: 'blur(8px)',
                    WebkitBackdropFilter: 'blur(8px)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <n.Icon size={20} color={PINK} strokeWidth={2.25} />
                </div>
                {/* Label */}
                <div
                  style={{
                    position: 'absolute',
                    top: '110%',
                    left: '50%',
                    transform: 'translateX(-50%)',
                    fontFamily: FONT,
                    fontSize: '12px',
                    fontWeight: 700,
                    color: 'rgba(255,255,255,0.80)',
                    textAlign: 'center',
                    whiteSpace: 'nowrap',
                    marginTop: '8px',
                  }}
                >
                  {n.label}
                </div>
              </div>
            )
          })}
        </div>

        {/* ═══ MOBILE STACKED LIST ═══ */}
        <div
          className="lp-hub-mobile"
          style={{
            maxWidth: '380px',
            margin: '0 auto',
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            {NODES.map((n, i) => (
              <div
                key={`m-${n.key}`}
                style={{
                  position: 'relative',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  padding: '14px 12px',
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: '12px',
                  marginBottom: '10px',
                  overflow: 'hidden',
                }}
              >
                {/* Icon */}
                <div
                  style={{
                    flexShrink: 0,
                    width: '40px',
                    height: '40px',
                    borderRadius: '50%',
                    background: 'rgba(212,34,106,0.15)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <n.Icon size={18} color={PINK} strokeWidth={2.25} />
                </div>
                {/* Text */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontFamily: FONT,
                      fontSize: '16px',
                      fontWeight: 800,
                      color: '#fff',
                      lineHeight: 1.2,
                    }}
                  >
                    {n.label}
                  </div>
                  <div
                    style={{
                      fontFamily: FONT,
                      fontSize: '13px',
                      color: 'rgba(255,255,255,0.65)',
                      marginTop: '2px',
                      lineHeight: 1.3,
                    }}
                  >
                    {n.desc}
                  </div>
                </div>
                {/* Flow line on right edge */}
                <div
                  style={{
                    position: 'absolute',
                    top: 0,
                    right: 0,
                    width: '2px',
                    height: '100%',
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      width: '100%',
                      height: '100%',
                      background: PINK,
                      animation: `lp-mobile-flow ${1.6 + i * 0.15}s linear infinite`,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>

          {/* Mobile center LP logo */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              marginTop: '24px',
              position: 'relative',
            }}
          >
            <div style={{ position: 'relative', width: '80px', height: '80px' }}>
              {/* Mobile rings */}
              {[42, 54, 66].map((r, i) => {
                const strokes = [2, 1, 0.5]
                const opacities = [0.8, 0.4, 0.2]
                return (
                  <svg
                    key={`m-ring-${i}`}
                    width={r * 2 + 8}
                    height={r * 2 + 8}
                    style={{
                      position: 'absolute',
                      top: '50%',
                      left: '50%',
                      transform: 'translate(-50%, -50%)',
                      overflow: 'visible',
                      pointerEvents: 'none',
                    }}
                  >
                    <circle
                      cx={r + 4}
                      cy={r + 4}
                      r={r}
                      fill="none"
                      stroke={PINK}
                      strokeWidth={strokes[i]}
                      opacity={opacities[i]}
                      style={{
                        transformOrigin: 'center',
                        animation: `lp-mobile-ring-beat 1.8s ${i * 100}ms ease-in-out infinite`,
                      }}
                    />
                  </svg>
                )
              })}
              <img
                src="/lp-logo.png"
                alt="Lessonpreneur"
                style={{
                  position: 'relative',
                  width: '80px',
                  height: '80px',
                  objectFit: 'contain',
                  transformOrigin: 'center',
                  animation: 'lp-mobile-heartbeat 1.8s ease-in-out infinite',
                  filter: 'drop-shadow(0 0 16px rgba(212,34,106,0.45))',
                }}
              />
            </div>
            <div
              style={{
                marginTop: '16px',
                fontFamily: FONT,
                fontSize: '14px',
                fontWeight: 800,
                color: '#fff',
                textAlign: 'center',
              }}
            >
              All of it. One place.
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
