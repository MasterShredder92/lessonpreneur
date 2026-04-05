import { sectionStyle } from './shared'

const FONT = 'Plus Jakarta Sans, system-ui, -apple-system, sans-serif'

// Desktop SVG bar chart heights
const BAR_HEIGHTS = [60, 80, 45, 90, 70, 110, 85, 95]
const BAR_BASE_Y = 270
const BAR_W = 12
const BAR_GAP = 18
const BAR_X0 = 315

// Mobile phone mini-chart bar heights
const MOBILE_BARS = [24, 32, 20, 40, 30, 44, 36]

export default function DeviceMockupSection() {
  return (
    <section className="lp-section" style={{ ...sectionStyle, position: 'relative' }}>
      <style>{`
        .lp-dev-desktop { display: block; }
        .lp-dev-mobile { display: none; }
        @media (max-width: 767px) {
          .lp-dev-desktop { display: none !important; }
          .lp-dev-mobile { display: block !important; }
        }
      `}</style>

      {/* Ambient glow */}
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: '500px',
          height: '300px',
          background: 'radial-gradient(circle, #D4226A 0%, transparent 70%)',
          opacity: 0.07,
          filter: 'blur(80px)',
          pointerEvents: 'none',
          zIndex: 0,
          maxWidth: '100%',
        }}
      />

      <div style={{ position: 'relative', zIndex: 1 }}>
        {/* Heading */}
        <h2
          className="lp-h-device"
          style={{
            fontFamily: FONT,
            fontWeight: 800,
            fontSize: '28px',
            lineHeight: 1.2,
            color: '#ffffff',
            textAlign: 'center',
            margin: 0,
          }}
        >
          Built for every screen you already use.
        </h2>
        <p
          className="lp-sub-device"
          style={{
            fontFamily: FONT,
            fontSize: '15px',
            lineHeight: 1.5,
            color: 'rgba(255,255,255,0.60)',
            textAlign: 'center',
            margin: '12px auto 40px auto',
            maxWidth: '560px',
          }}
        >
          Manage your school from your phone, tablet, or laptop — everything syncs.
        </p>
        <style>{`
          @media (min-width: 768px) {
            .lp-h-device { font-size: 38px !important; }
            .lp-sub-device { font-size: 17px !important; }
          }
        `}</style>

        {/* ══════════ MOBILE — HTML phone mockup ══════════ */}
        <div className="lp-dev-mobile">
          <div
            style={{
              width: '220px',
              height: '420px',
              borderRadius: '36px',
              background: 'linear-gradient(160deg, #1c1c1c, #111)',
              border: '2px solid #2a2a2a',
              boxShadow: '0 0 60px rgba(212,34,106,0.15), 0 20px 60px rgba(0,0,0,0.5)',
              margin: '0 auto',
              position: 'relative',
              overflow: 'hidden',
            }}
          >
            {/* Dynamic island */}
            <div
              style={{
                width: '80px',
                height: '24px',
                borderRadius: '12px',
                background: '#0a0a0a',
                margin: '12px auto 0',
              }}
            />
            {/* Screen */}
            <div
              style={{
                margin: '8px 10px',
                borderRadius: '24px',
                background: '#0a0a14',
                height: '340px',
                overflow: 'hidden',
                padding: '12px',
                position: 'relative',
                boxSizing: 'border-box',
                display: 'flex',
                flexDirection: 'column',
              }}
            >
              {/* Top bar */}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '0 4px',
                }}
              >
                <span style={{ fontSize: '11px', fontWeight: 800, color: '#D4226A', fontFamily: FONT }}>
                  lessonpreneur
                </span>
                <span style={{ fontSize: '9px', color: '#4ade80', fontFamily: FONT }}>● Live</span>
              </div>

              {/* Greeting card */}
              <div
                style={{
                  marginTop: '10px',
                  padding: '12px',
                  borderRadius: '10px',
                  background: 'rgba(212,34,106,0.1)',
                  border: '1px solid rgba(212,34,106,0.25)',
                }}
              >
                <div style={{ fontFamily: FONT, fontSize: '12px', fontWeight: 800, color: '#fff' }}>
                  Good morning, Zach.
                </div>
                <div
                  style={{
                    fontFamily: FONT,
                    fontSize: '11px',
                    color: 'rgba(255,255,255,0.60)',
                    marginTop: '4px',
                  }}
                >
                  3 leads need follow-up
                </div>
                <div
                  style={{
                    fontFamily: FONT,
                    fontSize: '11px',
                    color: '#FFB800',
                    marginTop: '2px',
                  }}
                >
                  ↑ Revenue up 12% this week
                </div>
              </div>

              {/* Stat chips */}
              <div style={{ display: 'flex', gap: '6px', marginTop: '10px' }}>
                {[
                  { v: '612', c: '#fff', fs: '16px', l: 'Students' },
                  { v: '23', c: '#D4226A', fs: '16px', l: 'Leads' },
                  { v: '$18.4k', c: '#FFB800', fs: '14px', l: 'Revenue' },
                ].map((chip) => (
                  <div
                    key={chip.l}
                    style={{
                      flex: 1,
                      textAlign: 'center',
                      padding: '8px 4px',
                      borderRadius: '8px',
                      background: 'rgba(255,255,255,0.05)',
                      border: '1px solid rgba(255,255,255,0.08)',
                    }}
                  >
                    <div
                      style={{
                        fontFamily: FONT,
                        fontSize: chip.fs,
                        fontWeight: 900,
                        color: chip.c,
                        lineHeight: 1.1,
                      }}
                    >
                      {chip.v}
                    </div>
                    <div
                      style={{
                        fontFamily: FONT,
                        fontSize: '9px',
                        color: 'rgba(255,255,255,0.45)',
                        marginTop: '2px',
                      }}
                    >
                      {chip.l}
                    </div>
                  </div>
                ))}
              </div>

              {/* Mini bar chart */}
              <div style={{ marginTop: '12px' }}>
                <div
                  style={{
                    fontFamily: FONT,
                    fontSize: '9px',
                    color: 'rgba(255,255,255,0.35)',
                    marginBottom: '6px',
                  }}
                >
                  This Month
                </div>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'flex-end',
                    height: '48px',
                    gap: '4px',
                  }}
                >
                  {MOBILE_BARS.map((h, i) => (
                    <div
                      key={i}
                      style={{
                        flex: 1,
                        height: `${h}px`,
                        borderRadius: '3px 3px 0 0',
                        background: i % 2 === 0 ? '#D4226A' : 'rgba(212,34,106,0.35)',
                      }}
                    />
                  ))}
                </div>
              </div>

              {/* Student list rows */}
              <div style={{ marginTop: '10px' }}>
                {[
                  { c: '#D4226A', t: 'Johnson Family — Active' },
                  { c: '#FFB800', t: 'Martinez Family — Due today' },
                ].map((row, i) => (
                  <div
                    key={i}
                    style={{
                      height: '22px',
                      borderRadius: '4px',
                      background: 'rgba(255,255,255,0.04)',
                      marginBottom: '4px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      padding: '0 8px',
                    }}
                  >
                    <div
                      style={{
                        width: '8px',
                        height: '8px',
                        borderRadius: '50%',
                        background: row.c,
                        flexShrink: 0,
                      }}
                    />
                    <span
                      style={{
                        fontFamily: FONT,
                        fontSize: '10px',
                        color: 'rgba(255,255,255,0.55)',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {row.t}
                    </span>
                  </div>
                ))}
              </div>

              {/* Bottom nav */}
              <div
                style={{
                  marginTop: 'auto',
                  display: 'flex',
                  padding: '8px 0',
                  borderTop: '1px solid rgba(255,255,255,0.06)',
                }}
              >
                {[
                  { l: 'Home', active: true },
                  { l: 'Students', active: false },
                  { l: 'Schedule', active: false },
                  { l: 'Billing', active: false },
                ].map((item) => (
                  <div
                    key={item.l}
                    style={{
                      flex: 1,
                      textAlign: 'center',
                      fontFamily: FONT,
                      fontSize: '9px',
                      color: item.active ? '#D4226A' : 'rgba(255,255,255,0.40)',
                      fontWeight: item.active ? 800 : 500,
                    }}
                  >
                    {item.l}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Feature chips */}
          <div
            style={{
              fontFamily: FONT,
              fontSize: '12px',
              color: 'rgba(255,255,255,0.50)',
              textAlign: 'center',
              marginTop: '24px',
            }}
          >
            📱 Mobile-first · 💻 Works on laptop · 🖥️ Tablet ready
          </div>
        </div>

        {/* ══════════ DESKTOP — SVG three-device composition ══════════ */}
        <div className="lp-dev-desktop" style={{ width: '100%', maxWidth: '860px', margin: '0 auto' }}>
          <svg
            viewBox="0 0 900 520"
            preserveAspectRatio="xMidYMid meet"
            width="100%"
            height="auto"
            style={{ display: 'block' }}
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
              <linearGradient id="lp-tablet-frame" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#1a1a1a" />
                <stop offset="100%" stopColor="#111111" />
              </linearGradient>
              <linearGradient id="lp-phone-frame" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#1c1c1c" />
                <stop offset="100%" stopColor="#111111" />
              </linearGradient>
              <filter id="deviceDropShadow" x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur in="SourceAlpha" stdDeviation="6" />
                <feOffset dx="0" dy="6" result="offsetblur" />
                <feComponentTransfer>
                  <feFuncA type="linear" slope="0.5" />
                </feComponentTransfer>
                <feMerge>
                  <feMergeNode />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
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

            {/* Background ellipse glow */}
            <ellipse
              cx="450"
              cy="300"
              rx="380"
              ry="200"
              fill="#D4226A"
              opacity="0.06"
              filter="url(#deviceGlow)"
            />

            {/* ─── TABLET ─── */}
            <g filter="url(#deviceDropShadow)">
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
              <rect x="145" y="355" width="30" height="6" rx="3" fill="#222" />
              <circle cx="185" cy="88" r="3" fill="#222" />
              <rect x="92" y="95" width="186" height="255" rx="6" fill="#060610" />
            </g>
            <g clipPath="url(#lp-tablet-clip)">
              <rect x="92" y="95" width="186" height="22" fill="rgba(212,34,106,0.12)" />
              <text
                x="185"
                y="111"
                fontSize="11"
                fill="#D4226A"
                textAnchor="middle"
                fontWeight="900"
                fontFamily={FONT}
              >
                Star AI
              </text>
              <rect
                x="100"
                y="124"
                width="170"
                height="78"
                rx="4"
                fill="rgba(255,255,255,0.04)"
                stroke="rgba(212,34,106,0.25)"
              />
              <text x="110" y="142" fontSize="11" fontWeight="800" fill="#ffffff" fontFamily={FONT}>
                Good morning, Zach.
              </text>
              <text
                x="110"
                y="158"
                fontSize="11"
                fill="rgba(255,255,255,0.60)"
                fontFamily={FONT}
              >
                3 leads need follow-up
              </text>
              <text x="110" y="174" fontSize="11" fill="#FFB800" fontFamily={FONT}>
                ↑ Rev up 12% this week
              </text>
              <rect
                x="100"
                y="212"
                width="170"
                height="14"
                rx="3"
                fill="rgba(255,255,255,0.04)"
              />
              <rect
                x="100"
                y="230"
                width="150"
                height="14"
                rx="3"
                fill="rgba(255,255,255,0.03)"
              />
              <rect
                x="100"
                y="248"
                width="160"
                height="14"
                rx="3"
                fill="rgba(255,255,255,0.04)"
              />
            </g>

            {/* ─── LAPTOP ─── */}
            <g filter="url(#deviceDropShadow)">
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
              <circle cx="540" cy="42" r="4" fill="#2a2a2a" stroke="#3a3a3a" />
              <rect x="302" y="45" width="476" height="290" rx="6" fill="#060610" />
            </g>
            <g clipPath="url(#lp-laptop-clip)">
              <rect x="302" y="45" width="476" height="32" fill="rgba(212,34,106,0.15)" />
              <circle cx="320" cy="61" r="5" fill="#D4226A" />
              <text
                x="332"
                y="66"
                fontSize="13"
                fill="#D4226A"
                fontWeight="900"
                fontFamily={FONT}
              >
                lessonpreneur
              </text>

              {/* Stat cards */}
              <rect
                x="310"
                y="88"
                width="140"
                height="62"
                rx="4"
                fill="rgba(255,255,255,0.05)"
                stroke="rgba(255,255,255,0.1)"
              />
              <text
                x="318"
                y="106"
                fontSize="11"
                fill="rgba(255,255,255,0.55)"
                fontFamily={FONT}
              >
                Active Students
              </text>
              <text
                x="318"
                y="136"
                fontSize="20"
                fontWeight="900"
                fill="#ffffff"
                fontFamily={FONT}
              >
                612
              </text>

              <rect
                x="460"
                y="88"
                width="140"
                height="62"
                rx="4"
                fill="rgba(255,255,255,0.05)"
                stroke="rgba(255,255,255,0.1)"
              />
              <text
                x="468"
                y="106"
                fontSize="11"
                fill="rgba(255,255,255,0.55)"
                fontFamily={FONT}
              >
                Open Leads
              </text>
              <text
                x="468"
                y="136"
                fontSize="20"
                fontWeight="900"
                fill="#D4226A"
                fontFamily={FONT}
              >
                23
              </text>

              <rect
                x="610"
                y="88"
                width="140"
                height="62"
                rx="4"
                fill="rgba(255,255,255,0.05)"
                stroke="rgba(255,255,255,0.1)"
              />
              <text
                x="618"
                y="106"
                fontSize="11"
                fill="rgba(255,255,255,0.55)"
                fontFamily={FONT}
              >
                Monthly Revenue
              </text>
              <text
                x="618"
                y="136"
                fontSize="20"
                fontWeight="900"
                fill="#FFB800"
                fontFamily={FONT}
              >
                $18.4k
              </text>

              {/* Chart */}
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

              {/* List rows */}
              <rect
                x="310"
                y="285"
                width="460"
                height="16"
                rx="3"
                fill="rgba(255,255,255,0.04)"
              />
              <rect
                x="310"
                y="305"
                width="420"
                height="16"
                rx="3"
                fill="rgba(255,255,255,0.03)"
              />
            </g>
            {/* Pink edge glow on laptop screen */}
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

            {/* Laptop base */}
            <g filter="url(#deviceDropShadow)">
              <rect x="280" y="120" width="520" height="320" rx="12" fill="url(#lp-laptop-body)" />
            </g>
            <rect x="280" y="434" width="520" height="3" fill="#111111" />
            <rect x="280" y="438" width="520" height="4" rx="2" fill="#3a3a3a" />

            {/* Keyboard */}
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

            {/* Trackpad */}
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

            {/* ─── PHONE ─── */}
            <g filter="url(#deviceDropShadow)">
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
              <rect x="145" y="212" width="30" height="8" rx="4" fill="#111" />
              <rect x="118" y="220" width="84" height="165" rx="12" fill="#060610" />
            </g>
            <g clipPath="url(#lp-phone-clip)">
              <rect x="118" y="220" width="84" height="18" fill="rgba(212,34,106,0.1)" />
              <text
                x="160"
                y="233"
                fontSize="11"
                fill="#D4226A"
                textAnchor="middle"
                fontWeight="900"
                fontFamily={FONT}
              >
                15 min
              </text>
              <rect
                x="124"
                y="244"
                width="72"
                height="56"
                rx="6"
                fill="rgba(255,255,255,0.05)"
                stroke="rgba(212,34,106,0.25)"
              />
              <text
                x="160"
                y="268"
                fontSize="14"
                fontWeight="900"
                fill="#D4226A"
                textAnchor="middle"
                fontFamily={FONT}
              >
                $18,360
              </text>
              <text
                x="160"
                y="286"
                fontSize="11"
                fill="rgba(255,255,255,0.55)"
                textAnchor="middle"
                fontFamily={FONT}
              >
                this month
              </text>
              <rect
                x="124"
                y="308"
                width="72"
                height="15"
                rx="3"
                fill="rgba(255,255,255,0.04)"
              />
              <rect
                x="124"
                y="327"
                width="72"
                height="15"
                rx="3"
                fill="rgba(255,255,255,0.04)"
              />
              <rect
                x="124"
                y="346"
                width="72"
                height="15"
                rx="3"
                fill="rgba(255,255,255,0.04)"
              />
            </g>
          </svg>
        </div>
      </div>
    </section>
  )
}
