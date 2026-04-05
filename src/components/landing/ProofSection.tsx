import { COLORS, FONT, GlassCard, sectionStyle } from './shared'

export default function ProofSection() {
  return (
    <section className="lp-section" style={sectionStyle}>
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
        Already running in real schools.
      </h2>

      <div style={{ marginTop: '40px', maxWidth: '720px', marginLeft: 'auto', marginRight: 'auto' }}>
        <GlassCard style={{ padding: '40px' }}>
          <p
            style={{
              textAlign: 'center',
              fontFamily: FONT,
              fontSize: '18px',
              lineHeight: 1.7,
              color: 'rgba(255,255,255,0.75)',
              margin: 0,
            }}
          >
            LP is currently in active beta inside Adkins Music Lessons — four locations, 600+
            active students, 40+ teachers. Every feature you see was built, tested, and refined in
            a real music school before it was ever offered to anyone else.
          </p>

          {/* REPLACE WITH REAL TESTIMONIALS */}
          <div
            className="lp-grid-3"
            style={{
              marginTop: '32px',
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: '16px',
            }}
          >
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                style={{
                  border: '1px dashed rgba(255,255,255,0.15)',
                  borderRadius: '12px',
                  padding: '24px',
                  textAlign: 'center',
                  color: 'rgba(255,255,255,0.25)',
                  fontFamily: FONT,
                  fontSize: '14px',
                }}
              >
                [ Testimonial quote — coming soon ]
              </div>
            ))}
          </div>
        </GlassCard>
      </div>
    </section>
  )
}
