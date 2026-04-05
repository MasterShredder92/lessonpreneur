import { COLORS, FONT, sectionStyle } from './shared'

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

      <div style={{ marginTop: '32px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
        {[
          "My name is Zach Adkins. I own four music schools in Omaha. We have over 600 active students, 40+ teachers, and four locations. We've grown from zero to over a million dollars a year in revenue.",
          'I built Lessonpreneur because I was the target customer — and nothing on the market actually understood how a music school runs. Every feature in this system was built to solve a real problem I had in my real schools. The lead pipeline. The SMS automation. The billing visibility. The teacher coordination tools. The AI briefing. All of it exists because I needed it — and none of it existed.',
          'I am still running these schools while building this. LP is live in production right now. This is not a demo. It is the system I use every single day.',
        ].map((para, i) => (
          <p
            key={i}
            style={{
              fontFamily: FONT,
              fontSize: '18px',
              lineHeight: 1.7,
              color: 'rgba(255,255,255,0.75)',
              margin: 0,
            }}
          >
            {para}
          </p>
        ))}
      </div>

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
