import { COLORS, FONT, GlassCard, sectionStyle } from './shared'
import { ZW } from '../../config/zwBrand'

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
        Already running in <span style={{ color: COLORS.pink }}>real schools</span>.
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
            {ZW.productByline} is currently in active beta inside Adkins Music Lessons — four locations, 600+
            active students, 40+ teachers. Every feature you see was built, tested, and refined in
            a real music school before it was ever offered to anyone else.
          </p>

          <div
            style={{
              fontFamily: FONT,
              fontSize: '15px',
              color: 'rgba(255,255,255,0.35)',
              fontStyle: 'italic',
              textAlign: 'center',
              padding: '32px 0 0 0',
            }}
          >
            Real feedback from real operators. More coming as beta grows.
          </div>
        </GlassCard>
      </div>
    </section>
  )
}
