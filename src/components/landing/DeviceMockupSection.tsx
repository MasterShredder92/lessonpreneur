import type { CSSProperties, ReactNode } from 'react'
import { ZW, ZW_COLOR } from '../../config/zwBrand'

const FONT = 'Plus Jakarta Sans, system-ui, -apple-system, sans-serif'

function MockBrandMark({ size = 9 }: { size?: number }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.15 }}>
      <span style={{ fontFamily: FONT, fontSize: size, fontWeight: 800, color: ZW_COLOR.teal }}>ZiroWork</span>
      <span style={{ fontFamily: FONT, fontSize: size - 1, fontWeight: 700, color: '#D4226A' }}>{ZW.product}</span>
    </div>
  )
}

const cssVars = `
  .lp-dm-section { padding: 80px 20px; }
  .lp-dm-heading { font-size: 36px; }
  .lp-dm-sub { font-size: 17px; margin-bottom: 48px; }
  .lp-dm-stage {
    position: relative;
    width: 100%;
    max-width: 860px;
    height: 360px;
    margin: 0 auto;
    transform: none;
    transform-origin: top center;
  }
  .lp-dm-labels { gap: 32px; margin-top: 32px; }
  @media (max-width: 767px) {
    .lp-dm-section { padding: 48px 16px; }
    .lp-dm-heading { font-size: 26px; }
    .lp-dm-sub { font-size: 14px; margin-bottom: 32px; }
    .lp-dm-stage {
      height: 220px;
      transform: scale(0.52);
      margin-bottom: -160px;
    }
    .lp-dm-labels { gap: 16px; margin-top: 16px; }
  }
`

// ─── Small presentational helpers ───────────────────────────────────────
function Bars({
  heights,
  height,
  gap,
}: {
  heights: number[]
  height: number
  gap: number
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-end',
        height: `${height}px`,
        gap: `${gap}px`,
      }}
    >
      {heights.map((h, i) => (
        <div
          key={i}
          style={{
            flex: 1,
            height: `${h}px`,
            borderRadius: '2px 2px 0 0',
            background: i % 2 === 0 ? '#D4226A' : 'rgba(212,34,106,0.30)',
          }}
        />
      ))}
    </div>
  )
}

function StudentRow({
  dotColor,
  text,
  rowHeight,
  fontSize,
}: {
  dotColor: string
  text: string
  rowHeight: number
  fontSize: number
}) {
  return (
    <div
      style={{
        height: `${rowHeight}px`,
        borderRadius: '3px',
        background: 'rgba(255,255,255,0.04)',
        display: 'flex',
        alignItems: 'center',
        padding: '0 6px',
      }}
    >
      <div
        style={{
          width: '6px',
          height: '6px',
          borderRadius: '50%',
          background: dotColor,
          flexShrink: 0,
        }}
      />
      <span
        style={{
          fontFamily: FONT,
          fontSize: `${fontSize}px`,
          color: 'rgba(255,255,255,0.50)',
          marginLeft: '5px',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {text}
      </span>
    </div>
  )
}

function StatCell({
  value,
  label,
  valueColor,
  valueSize,
  labelSize,
  padding,
  style,
}: {
  value: string
  label: string
  valueColor: string
  valueSize: number
  labelSize: number
  padding: string
  style?: CSSProperties
}) {
  return (
    <div
      style={{
        padding,
        borderRadius: '6px',
        background: 'rgba(255,255,255,0.05)',
        border: '1px solid rgba(255,255,255,0.08)',
        textAlign: 'center',
        ...style,
      }}
    >
      <div
        style={{
          fontFamily: FONT,
          fontSize: `${valueSize}px`,
          fontWeight: 900,
          color: valueColor,
          lineHeight: 1.1,
        }}
      >
        {value}
      </div>
      <div
        style={{
          fontFamily: FONT,
          fontSize: `${labelSize}px`,
          color: 'rgba(255,255,255,0.40)',
          marginTop: '2px',
        }}
      >
        {label}
      </div>
    </div>
  )
}

// ─── Phone ──────────────────────────────────────────────────────────────
function Phone() {
  return (
    <div
      style={{
        width: '150px',
        height: '300px',
        borderRadius: '32px',
        background: 'linear-gradient(160deg, #222, #111)',
        border: '2px solid #333',
        boxShadow: '0 0 40px rgba(212,34,106,0.12), 0 20px 40px rgba(0,0,0,0.6)',
        position: 'relative',
        flexShrink: 0,
      }}
    >
      {/* Dynamic island */}
      <div
        style={{
          width: '50px',
          height: '14px',
          borderRadius: '7px',
          background: '#0a0a0a',
          margin: '10px auto 0',
        }}
      />
      {/* Screen */}
      <div
        style={{
          margin: '6px 8px',
          borderRadius: '20px',
          background: '#06060f',
          height: '248px',
          overflow: 'hidden',
          padding: '10px 8px',
          boxSizing: 'border-box',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Top bar */}
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <MockBrandMark size={9} />
          <span
            style={{
              fontFamily: FONT,
              fontSize: '8px',
              color: '#4ade80',
              marginLeft: 'auto',
            }}
          >
            ● Live
          </span>
        </div>

        {/* Greeting card */}
        <div
          style={{
            marginTop: '8px',
            padding: '8px',
            borderRadius: '8px',
            background: 'rgba(212,34,106,0.10)',
            border: '1px solid rgba(212,34,106,0.25)',
          }}
        >
          <div style={{ fontFamily: FONT, fontSize: '9px', fontWeight: 800, color: '#fff' }}>
            Good morning, Zach.
          </div>
          <div
            style={{
              fontFamily: FONT,
              fontSize: '8px',
              color: 'rgba(255,255,255,0.55)',
              marginTop: '3px',
            }}
          >
            3 leads need follow-up
          </div>
          <div style={{ fontFamily: FONT, fontSize: '8px', color: '#FFB800', marginTop: '2px' }}>
            ↑ Revenue up 12%
          </div>
        </div>

        {/* Stat chips */}
        <div style={{ display: 'flex', gap: '4px', marginTop: '8px' }}>
          <StatCell
            value="612"
            label="Students"
            valueColor="#fff"
            valueSize={12}
            labelSize={7}
            padding="6px 2px"
            style={{ flex: 1 }}
          />
          <StatCell
            value="23"
            label="Leads"
            valueColor="#D4226A"
            valueSize={12}
            labelSize={7}
            padding="6px 2px"
            style={{ flex: 1 }}
          />
          <StatCell
            value="$18k"
            label="Revenue"
            valueColor="#FFB800"
            valueSize={11}
            labelSize={7}
            padding="6px 2px"
            style={{ flex: 1 }}
          />
        </div>

        {/* Bar chart */}
        <div style={{ marginTop: '8px' }}>
          <Bars heights={[14, 20, 12, 28, 18, 32, 24]} height={36} gap={3} />
        </div>

        {/* Student rows */}
        <div
          style={{
            marginTop: '8px',
            display: 'flex',
            flexDirection: 'column',
            gap: '3px',
          }}
        >
          <StudentRow dotColor="#D4226A" text="Johnson Family" rowHeight={18} fontSize={8} />
          <StudentRow dotColor="#FFB800" text="Martinez — Due" rowHeight={18} fontSize={8} />
        </div>

        {/* Bottom nav */}
        <div
          style={{
            marginTop: 'auto',
            borderTop: '1px solid rgba(255,255,255,0.06)',
            paddingTop: '6px',
            display: 'flex',
          }}
        >
          {['Home', 'Students', 'Schedule', 'Billing'].map((l) => (
            <div
              key={l}
              style={{
                flex: 1,
                textAlign: 'center',
                fontFamily: FONT,
                fontSize: '7px',
                color: l === 'Home' ? '#D4226A' : 'rgba(255,255,255,0.35)',
                fontWeight: l === 'Home' ? 800 : 500,
              }}
            >
              {l}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── Tablet ─────────────────────────────────────────────────────────────
function Tablet() {
  return (
    <div
      style={{
        width: '240px',
        height: '320px',
        borderRadius: '20px',
        background: 'linear-gradient(160deg, #1e1e1e, #111)',
        border: '2px solid #2a2a2a',
        boxShadow: '0 0 50px rgba(212,34,106,0.10), 0 24px 50px rgba(0,0,0,0.55)',
        flexShrink: 0,
      }}
    >
      {/* Camera */}
      <div
        style={{
          width: '6px',
          height: '6px',
          borderRadius: '50%',
          background: '#222',
          margin: '8px auto',
        }}
      />
      {/* Screen */}
      <div
        style={{
          margin: '8px 10px',
          borderRadius: '12px',
          background: '#06060f',
          height: '280px',
          overflow: 'hidden',
          padding: '12px',
          boxSizing: 'border-box',
        }}
      >
        {/* Top bar */}
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <MockBrandMark size={10} />
          <span
            style={{
              fontFamily: FONT,
              fontSize: '9px',
              color: '#D4226A',
              marginLeft: 'auto',
            }}
          >
            Star AI ✦
          </span>
        </div>

        {/* Star AI card */}
        <div
          style={{
            marginTop: '10px',
            padding: '10px',
            borderRadius: '8px',
            background: 'rgba(212,34,106,0.08)',
            border: '1px solid rgba(212,34,106,0.20)',
          }}
        >
          <div style={{ fontFamily: FONT, fontSize: '11px', fontWeight: 800, color: '#fff' }}>
            Good morning, Zach.
          </div>
          <div
            style={{
              fontFamily: FONT,
              fontSize: '9px',
              color: 'rgba(255,255,255,0.45)',
              marginTop: '3px',
            }}
          >
            Here's your school snapshot:
          </div>
          <div style={{ fontFamily: FONT, fontSize: '9px', color: '#4ade80', marginTop: '4px' }}>
            ↑ 3 new leads today
          </div>
          <div style={{ fontFamily: FONT, fontSize: '9px', color: '#FFB800', marginTop: '2px' }}>
            ⚠ 2 students at churn risk
          </div>
          <div
            style={{
              fontFamily: FONT,
              fontSize: '9px',
              color: 'rgba(255,255,255,0.55)',
              marginTop: '2px',
            }}
          >
            ● Revenue tracking +8% MoM
          </div>
        </div>

        {/* 2×2 stat grid */}
        <div
          style={{
            marginTop: '10px',
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '6px',
          }}
        >
          <StatCell
            value="612"
            label="Students"
            valueColor="#fff"
            valueSize={14}
            labelSize={8}
            padding="8px"
          />
          <StatCell
            value="$18.4k"
            label="Revenue"
            valueColor="#FFB800"
            valueSize={13}
            labelSize={8}
            padding="8px"
          />
          <StatCell
            value="23"
            label="Leads"
            valueColor="#D4226A"
            valueSize={14}
            labelSize={8}
            padding="8px"
          />
          <StatCell
            value="94%"
            label="Retention"
            valueColor="#fff"
            valueSize={14}
            labelSize={8}
            padding="8px"
          />
        </div>

        {/* Bar chart */}
        <div style={{ marginTop: '10px' }}>
          <Bars heights={[20, 28, 18, 36, 24, 42, 32, 38]} height={48} gap={4} />
        </div>

        {/* Student rows */}
        <div
          style={{
            marginTop: '8px',
            display: 'flex',
            flexDirection: 'column',
            gap: '3px',
          }}
        >
          <StudentRow
            dotColor="#D4226A"
            text="Johnson Family — Active"
            rowHeight={22}
            fontSize={9}
          />
          <StudentRow
            dotColor="#FFB800"
            text="Martinez — Due today"
            rowHeight={22}
            fontSize={9}
          />
        </div>
      </div>
    </div>
  )
}

// ─── Laptop ─────────────────────────────────────────────────────────────
function Laptop() {
  return (
    <div style={{ flexShrink: 0 }}>
      {/* Lid + screen */}
      <div
        style={{
          width: '380px',
          height: '240px',
          borderRadius: '12px 12px 0 0',
          background: 'linear-gradient(160deg, #1c1c1c, #111)',
          border: '2px solid #2a2a2a',
          borderBottom: 'none',
          boxShadow: '0 0 60px rgba(212,34,106,0.10)',
        }}
      >
        {/* Camera */}
        <div
          style={{
            width: '6px',
            height: '6px',
            borderRadius: '50%',
            background: '#222',
            margin: '6px auto',
          }}
        />
        {/* Screen */}
        <div
          style={{
            margin: '8px 10px',
            borderRadius: '8px',
            background: '#06060f',
            height: '210px',
            overflow: 'hidden',
            padding: '12px',
            boxSizing: 'border-box',
          }}
        >
          {/* Top bar */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            {['Dashboard', 'Students', 'Schedule', 'Billing'].map((l) => (
              <span
                key={l}
                style={{
                  fontFamily: FONT,
                  fontSize: '9px',
                  color: l === 'Dashboard' ? '#D4226A' : 'rgba(255,255,255,0.40)',
                  fontWeight: l === 'Dashboard' ? 700 : 500,
                }}
              >
                {l}
              </span>
            ))}
            <span style={{ marginLeft: 'auto' }}>
              <MockBrandMark size={10} />
            </span>
          </div>

          {/* Three stat cards */}
          <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
            {[
              { label: 'Active Students', value: '612', color: '#fff', size: 18 },
              { label: 'Monthly Revenue', value: '$18,360', color: '#FFB800', size: 16 },
              { label: 'Open Leads', value: '23', color: '#D4226A', size: 18 },
            ].map((c) => (
              <div
                key={c.label}
                style={{
                  flex: 1,
                  padding: '10px',
                  borderRadius: '8px',
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.08)',
                }}
              >
                <div
                  style={{
                    fontFamily: FONT,
                    fontSize: '8px',
                    color: 'rgba(255,255,255,0.45)',
                  }}
                >
                  {c.label}
                </div>
                <div
                  style={{
                    fontFamily: FONT,
                    fontSize: `${c.size}px`,
                    fontWeight: 900,
                    color: c.color,
                    marginTop: '2px',
                  }}
                >
                  {c.value}
                </div>
              </div>
            ))}
          </div>

          {/* Bar chart */}
          <div style={{ marginTop: '10px' }}>
            <Bars
              heights={[24, 32, 20, 40, 28, 48, 36, 44, 38, 52]}
              height={56}
              gap={5}
            />
          </div>

          {/* Two-column layout */}
          <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
            {/* Left: 3 student rows */}
            <div
              style={{
                flex: 2,
                display: 'flex',
                flexDirection: 'column',
                gap: '4px',
              }}
            >
              {['Johnson Family — Active', 'Martinez — Due today', 'Chen — Paid'].map(
                (t) => (
                  <div
                    key={t}
                    style={{
                      height: '20px',
                      borderRadius: '3px',
                      background: 'rgba(255,255,255,0.03)',
                      fontFamily: FONT,
                      fontSize: '9px',
                      color: 'rgba(255,255,255,0.45)',
                      padding: '0 8px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {t}
                  </div>
                )
              )}
            </div>
            {/* Right: Star AI card */}
            <div
              style={{
                flex: 1,
                padding: '8px',
                borderRadius: '6px',
                background: 'rgba(212,34,106,0.08)',
                border: '1px solid rgba(212,34,106,0.20)',
              }}
            >
              <div
                style={{
                  fontFamily: FONT,
                  fontSize: '8px',
                  color: '#D4226A',
                  fontWeight: 800,
                }}
              >
                Star AI
              </div>
              <div
                style={{
                  fontFamily: FONT,
                  fontSize: '8px',
                  color: 'rgba(255,255,255,0.55)',
                  marginTop: '4px',
                }}
              >
                All systems running.
              </div>
              <div
                style={{
                  fontFamily: FONT,
                  fontSize: '8px',
                  color: 'rgba(255,255,255,0.40)',
                  marginTop: '2px',
                }}
              >
                Next: Send 4 reminders
              </div>
            </div>
          </div>
        </div>
      </div>
      {/* Laptop base */}
      <div
        style={{
          width: '380px',
          height: '16px',
          background: 'linear-gradient(#222, #1a1a1a)',
          borderRadius: '0 0 4px 4px',
          border: '2px solid #2a2a2a',
          borderTop: '1px solid #333',
          boxSizing: 'border-box',
        }}
      >
        {/* Trackpad */}
        <div
          style={{
            width: '80px',
            height: '10px',
            borderRadius: '3px',
            background: '#1a1a1a',
            border: '1px solid #333',
            margin: '0 auto',
            position: 'relative',
            top: '1px',
          }}
        />
      </div>
    </div>
  )
}

// ─── Section wrapper ────────────────────────────────────────────────────
export default function DeviceMockupSection(): ReactNode {
  return (
    <section
      className="lp-dm-section"
      style={{
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <style>{cssVars}</style>

      {/* Background glow */}
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: '600px',
          height: '300px',
          maxWidth: '100%',
          background:
            'radial-gradient(ellipse, rgba(212,34,106,0.08) 0%, transparent 70%)',
          pointerEvents: 'none',
          zIndex: 0,
        }}
      />

      <div style={{ position: 'relative', zIndex: 1 }}>
        {/* Heading */}
        <h2
          className="lp-dm-heading"
          style={{
            fontFamily: FONT,
            fontWeight: 800,
            lineHeight: 1.2,
            color: '#fff',
            textAlign: 'center',
            margin: 0,
          }}
        >
          Built for every screen you already use.
        </h2>
        <p
          className="lp-dm-sub"
          style={{
            fontFamily: FONT,
            lineHeight: 1.5,
            color: 'rgba(255,255,255,0.60)',
            textAlign: 'center',
            margin: '12px auto 0 auto',
            maxWidth: '560px',
          }}
        >
          Manage your school from your phone, tablet, or laptop — everything syncs in real time.
        </p>

        {/* Overlap composition — all devices absolutely positioned */}
        <div className="lp-dm-stage" style={{ marginTop: '48px' }}>
          {/* Laptop — background layer, right-center */}
          <div
            style={{
              position: 'absolute',
              bottom: 0,
              left: '50%',
              transform: 'translateX(-20%)',
              zIndex: 1,
            }}
          >
            <Laptop />
          </div>
          {/* Tablet — middle layer, center-left */}
          <div
            style={{
              position: 'absolute',
              bottom: 0,
              left: '50%',
              transform: 'translateX(-85%)',
              zIndex: 2,
            }}
          >
            <Tablet />
          </div>
          {/* Phone — front layer, left of center */}
          <div
            style={{
              position: 'absolute',
              bottom: 0,
              left: '50%',
              transform: 'translateX(-155%)',
              zIndex: 3,
            }}
          >
            <Phone />
          </div>
        </div>

        {/* Labels */}
        <div
          className="lp-dm-labels"
          style={{
            display: 'flex',
            justifyContent: 'center',
            flexWrap: 'wrap',
          }}
        >
          {['📱 iPhone / Android', '🖥️ Tablet', '💻 Laptop / Desktop'].map((l) => (
            <span
              key={l}
              style={{
                fontFamily: FONT,
                fontSize: '13px',
                color: 'rgba(255,255,255,0.40)',
                fontWeight: 600,
                textAlign: 'center',
              }}
            >
              {l}
            </span>
          ))}
        </div>
      </div>
    </section>
  )
}
