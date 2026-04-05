const BAR_HEIGHTS = [60, 80, 45, 90, 70, 110, 85, 95]
const BAR_BASE_Y = 270
const BAR_W = 12
const BAR_GAP = 18
const BAR_X0 = 315

export default function DeviceMockupSection() {
  return (
    <>
      <style>{`
        .lp-device-svg { width: 100%; max-width: 860px; height: auto; display: block; margin: 0 auto; }
        .lp-device-tablet { display: inline; }
        @media (max-width: 479px) {
          .lp-device-tablet { display: none !important; }
        }
      `}</style>
      <div style={{ width: '100%', marginTop: '28px' }}>
        <svg
          className="lp-device-svg"
          viewBox="0 0 900 520"
          preserveAspectRatio="xMidYMid meet"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <linearGradient id="lp-laptop-body" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#2a2a2a" />
              <stop offset="100%" stopColor="#1a1a1a" />
            </linearGradient>
            <linearGradient id="lp-laptop-lid" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#1c1c1c" />
              <stop offset="100%" stopColor="#111111" />
            </linearGradient>
            <linearGradient id="lp-screen-bg" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#0a0a14" />
              <stop offset="100%" stopColor="#0d0d1f" />
            </linearGradient>
            <linearGradient id="lp-tablet-frame" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#1a1a1a" />
              <stop offset="100%" stopColor="#111111" />
            </linearGradient>
            <linearGradient id="lp-phone-frame" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#1c1c1c" />
              <stop offset="100%" stopColor="#111111" />
            </linearGradient>
            <filter id="deviceGlow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="8" />
            </filter>
            <clipPath id="lp-laptop-clip">
              <rect x="302" y="45" width="476" height="290" rx="6" />
            </clipPath>
            <clipPath id="lp-tablet-clip">
              <rect x="92" y="95" width="186" height="255" rx="6" />
            </clipPath>
            <clipPath id="lp-phone-clip">
              <rect x="118" y="220" width="84" height="165" rx="12" />
            </clipPath>
          </defs>

          {/* Ambient glow behind devices */}
          <ellipse
            cx="450"
            cy="300"
            rx="380"
            ry="200"
            fill="#D4226A"
            opacity="0.06"
            filter="url(#deviceGlow)"
          />

          {/* ─────────── TABLET (behind laptop, left) ─────────── */}
          <g className="lp-device-tablet">
            <rect
              x="80"
              y="80"
              width="210"
              height="290"
              rx="14"
              fill="url(#lp-tablet-frame)"
              stroke="#2a2a2a"
              strokeWidth="1.5"
            />
            {/* Home button area */}
            <rect x="145" y="355" width="30" height="6" rx="3" fill="#222" />
            {/* Camera */}
            <circle cx="185" cy="88" r="3" fill="#222" />
            {/* Screen */}
            <rect
              x="92"
              y="95"
              width="186"
              height="255"
              rx="6"
              fill="url(#lp-screen-bg)"
            />
            <g clipPath="url(#lp-tablet-clip)">
              {/* Top bar */}
              <rect x="92" y="95" width="186" height="22" fill="rgba(212,34,106,0.12)" />
              <text
                x="155"
                y="110"
                fontSize="8"
                fill="#D4226A"
                textAnchor="middle"
                fontWeight="bold"
                fontFamily="Plus Jakarta Sans, sans-serif"
              >
                Star AI
              </text>
              {/* Summary card */}
              <rect
                x="100"
                y="122"
                width="170"
                height="70"
                rx="4"
                fill="rgba(255,255,255,0.04)"
                stroke="rgba(212,34,106,0.2)"
              />
              <text
                x="110"
                y="138"
                fontSize="7"
                fill="#ffffff"
                fontFamily="Plus Jakarta Sans, sans-serif"
              >
                Good morning, Zach.
              </text>
              <text
                x="110"
                y="150"
                fontSize="6"
                fill="rgba(255,255,255,0.55)"
                fontFamily="Plus Jakarta Sans, sans-serif"
              >
                3 leads need follow-up
              </text>
              <text
                x="110"
                y="162"
                fontSize="6"
                fill="#FFB800"
                fontFamily="Plus Jakarta Sans, sans-serif"
              >
                Revenue up 12% this week
              </text>
              {/* List rows */}
              <rect
                x="100"
                y="202"
                width="170"
                height="12"
                rx="3"
                fill="rgba(255,255,255,0.04)"
              />
              <rect
                x="100"
                y="220"
                width="150"
                height="12"
                rx="3"
                fill="rgba(255,255,255,0.03)"
              />
              <rect
                x="100"
                y="238"
                width="160"
                height="12"
                rx="3"
                fill="rgba(255,255,255,0.04)"
              />
            </g>
          </g>

          {/* ─────────── LAPTOP (center-right, dominant) ─────────── */}
          {/* Lid/screen bezel */}
          <rect
            x="290"
            y="30"
            width="500"
            height="310"
            rx="10"
            fill="url(#lp-laptop-lid)"
            stroke="#333333"
            strokeWidth="1.5"
          />
          {/* Camera dot */}
          <circle cx="540" cy="42" r="4" fill="#2a2a2a" stroke="#3a3a3a" />
          {/* Screen glass */}
          <rect
            x="302"
            y="45"
            width="476"
            height="290"
            rx="6"
            fill="url(#lp-screen-bg)"
          />
          {/* Screen UI */}
          <g clipPath="url(#lp-laptop-clip)">
            {/* Top bar */}
            <rect x="302" y="45" width="476" height="28" fill="rgba(212,34,106,0.15)" />
            <circle cx="318" cy="59" r="4" fill="#D4226A" />
            <text
              x="330"
              y="63"
              fontSize="9"
              fill="#D4226A"
              fontWeight="bold"
              fontFamily="Plus Jakarta Sans, sans-serif"
            >
              lessonpreneur
            </text>

            {/* Stat cards */}
            <g>
              <rect
                x="310"
                y="80"
                width="140"
                height="55"
                rx="4"
                fill="rgba(255,255,255,0.05)"
                stroke="rgba(255,255,255,0.1)"
              />
              <text
                x="318"
                y="95"
                fontSize="6"
                fill="rgba(255,255,255,0.5)"
                fontFamily="Plus Jakarta Sans, sans-serif"
              >
                Active Students
              </text>
              <text
                x="318"
                y="120"
                fontSize="14"
                fontWeight="900"
                fill="#ffffff"
                fontFamily="Plus Jakarta Sans, sans-serif"
              >
                612
              </text>
            </g>
            <g>
              <rect
                x="460"
                y="80"
                width="140"
                height="55"
                rx="4"
                fill="rgba(255,255,255,0.05)"
                stroke="rgba(255,255,255,0.1)"
              />
              <text
                x="468"
                y="95"
                fontSize="6"
                fill="rgba(255,255,255,0.5)"
                fontFamily="Plus Jakarta Sans, sans-serif"
              >
                Open Leads
              </text>
              <text
                x="468"
                y="120"
                fontSize="14"
                fontWeight="900"
                fill="#D4226A"
                fontFamily="Plus Jakarta Sans, sans-serif"
              >
                23
              </text>
            </g>
            <g>
              <rect
                x="610"
                y="80"
                width="140"
                height="55"
                rx="4"
                fill="rgba(255,255,255,0.05)"
                stroke="rgba(255,255,255,0.1)"
              />
              <text
                x="618"
                y="95"
                fontSize="6"
                fill="rgba(255,255,255,0.5)"
                fontFamily="Plus Jakarta Sans, sans-serif"
              >
                Monthly Revenue
              </text>
              <text
                x="618"
                y="120"
                fontSize="14"
                fontWeight="900"
                fill="#FFB800"
                fontFamily="Plus Jakarta Sans, sans-serif"
              >
                $18.4k
              </text>
            </g>

            {/* Chart bars */}
            {BAR_HEIGHTS.map((h, i) => (
              <rect
                key={`bar-${i}`}
                x={BAR_X0 + i * (BAR_W + BAR_GAP)}
                y={BAR_BASE_Y - h}
                width={BAR_W}
                height={h}
                fill={i % 2 === 0 ? '#D4226A' : 'rgba(212,34,106,0.3)'}
                rx="1.5"
              />
            ))}

            {/* Student list rows */}
            <rect
              x="310"
              y="285"
              width="460"
              height="14"
              rx="3"
              fill="rgba(255,255,255,0.04)"
            />
            <rect
              x="310"
              y="303"
              width="420"
              height="14"
              rx="3"
              fill="rgba(255,255,255,0.03)"
            />
          </g>
          {/* Pink screen edge glow */}
          <rect
            x="302"
            y="45"
            width="476"
            height="290"
            rx="6"
            fill="none"
            stroke="#D4226A"
            strokeWidth="1"
            opacity="0.4"
          />

          {/* Base/body */}
          <rect
            x="280"
            y="120"
            width="520"
            height="320"
            rx="12"
            fill="url(#lp-laptop-body)"
          />
          {/* Hinge line */}
          <rect x="280" y="434" width="520" height="3" fill="#111111" />
          {/* Bottom edge highlight */}
          <rect x="280" y="438" width="520" height="4" rx="2" fill="#3a3a3a" />

          {/* Keyboard grid: 6 rows × 13 keys, 22×16 with 3px gap */}
          {Array.from({ length: 6 }).map((_, row) =>
            Array.from({ length: 13 }).map((_, col) => (
              <rect
                key={`key-${row}-${col}`}
                x={310 + col * (22 + 3)}
                y={370 + row * (16 + 3)}
                width="22"
                height="16"
                rx="2"
                fill="#1a1a1a"
                stroke="#333333"
                strokeWidth="0.5"
              />
            ))
          )}

          {/* Trackpad — centered below keyboard area */}
          <rect
            x="390"
            y="478"
            width="120"
            height="30"
            rx="6"
            fill="#222222"
            stroke="#333333"
            strokeWidth="1"
          />

          {/* ─────────── PHONE (front, overlaps tablet) ─────────── */}
          <rect
            x="110"
            y="200"
            width="100"
            height="195"
            rx="18"
            fill="url(#lp-phone-frame)"
            stroke="#2a2a2a"
            strokeWidth="1.5"
          />
          {/* Dynamic island */}
          <rect x="145" y="212" width="30" height="8" rx="4" fill="#111111" />
          {/* Screen */}
          <rect
            x="118"
            y="220"
            width="84"
            height="165"
            rx="12"
            fill="url(#lp-screen-bg)"
          />
          <g clipPath="url(#lp-phone-clip)">
            {/* Status bar */}
            <rect x="118" y="220" width="84" height="16" fill="rgba(212,34,106,0.1)" />
            <text
              x="160"
              y="231"
              fontSize="6"
              fill="#D4226A"
              textAnchor="middle"
              fontWeight="900"
              fontFamily="Plus Jakarta Sans, sans-serif"
            >
              15 min
            </text>
            <text
              x="160"
              y="239"
              fontSize="5"
              fill="rgba(255,255,255,0.4)"
              textAnchor="middle"
              fontFamily="Plus Jakarta Sans, sans-serif"
            >
              to run your school
            </text>
            {/* Stat card */}
            <rect
              x="124"
              y="242"
              width="72"
              height="48"
              rx="6"
              fill="rgba(255,255,255,0.05)"
              stroke="rgba(212,34,106,0.25)"
            />
            <text
              x="160"
              y="264"
              fontSize="10"
              fontWeight="900"
              fill="#D4226A"
              textAnchor="middle"
              fontFamily="Plus Jakarta Sans, sans-serif"
            >
              $18,360
            </text>
            <text
              x="160"
              y="276"
              fontSize="5"
              fill="rgba(255,255,255,0.45)"
              textAnchor="middle"
              fontFamily="Plus Jakarta Sans, sans-serif"
            >
              this month
            </text>
            {/* Notification rows */}
            <rect
              x="124"
              y="300"
              width="72"
              height="14"
              rx="3"
              fill="rgba(255,255,255,0.04)"
            />
            <rect
              x="124"
              y="318"
              width="72"
              height="14"
              rx="3"
              fill="rgba(255,255,255,0.04)"
            />
            <rect
              x="124"
              y="336"
              width="72"
              height="14"
              rx="3"
              fill="rgba(255,255,255,0.04)"
            />
          </g>
        </svg>

        <div
          style={{
            fontFamily: 'Plus Jakarta Sans, sans-serif',
            fontSize: '13px',
            fontStyle: 'italic',
            color: 'rgba(255,255,255,0.35)',
            textAlign: 'center',
            marginTop: '16px',
          }}
        >
          Works on every device you already use.
        </div>
      </div>
    </>
  )
}
