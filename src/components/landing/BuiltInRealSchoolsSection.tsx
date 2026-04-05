import { COLORS, FONT, sectionStyle } from './shared'
import DeviceMockupSection from './DeviceMockupSection'

export default function BuiltInRealSchoolsSection() {
  return (
    <section className="lp-section" style={{ ...sectionStyle, maxWidth: '720px' }}>
      <h2
        className="lp-h3"
        style={{
          fontFamily: FONT,
          fontWeight: 900,
          fontSize: '42px',
          lineHeight: 1.15,
          color: COLORS.textPrimary,
          margin: 0,
        }}
      >
        This wasn't built in a <span style={{ color: COLORS.pink }}>conference room</span>.
      </h2>

      <div style={{ marginTop: '32px' }}>
        <p
          style={{
            fontFamily: FONT,
            fontSize: '18px',
            lineHeight: 1.7,
            color: 'rgba(255,255,255,0.75)',
            margin: 0,
          }}
        >
          I'm Zach Adkins — I own four music schools in Omaha with 600+ students and 40+ teachers.
          I built Lessonpreneur because nothing on the market actually understood how a music school
          runs. Every feature exists because I needed it in my real schools, and LP is live in
          production right now — not a demo, but the system I use every single day.
        </p>
      </div>

      <DeviceMockupSection />

      <div
        className="lp-founder-row"
        style={{
          marginTop: '32px',
          display: 'flex',
          alignItems: 'center',
          gap: '20px',
        }}
      >
        {/* REPLACE WITH ZACH HEADSHOT */}
        <div
          style={{
            width: '72px',
            height: '72px',
            borderRadius: '50%',
            background: 'rgba(212,34,106,0.2)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontFamily: FONT,
            fontWeight: 900,
            fontSize: '28px',
            color: COLORS.pink,
            flexShrink: 0,
          }}
        >
          Z
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
          <div style={{ fontFamily: FONT, fontWeight: 800, fontSize: '18px', color: '#fff' }}>
            Zach Adkins
          </div>
          <div style={{ fontFamily: FONT, fontSize: '14px', color: COLORS.pink }}>
            Founder, Lessonpreneur
          </div>
          <div style={{ fontFamily: FONT, fontSize: '14px', color: 'rgba(255,255,255,0.55)' }}>
            Owner, Adkins Music Lessons — 4 locations · 600+ students
          </div>
        </div>
      </div>
    </section>
  )
}
