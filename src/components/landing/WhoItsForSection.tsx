import { COLORS, FONT, sectionStyle } from './shared'

const ITEMS = [
  'Are losing leads because nobody followed up fast enough',
  'Have student info scattered across texts, forms, and spreadsheets',
  'Spend more time on admin than on actually growing the school',
  "Are running Square for billing, Google Drive for docs, and a separate texting app for follow-up — and it's all a mess",
  'Want professional operations without hiring an operations person',
  'Have one location trying to grow, or three locations trying to stay sane',
]

export default function WhoItsForSection() {
  return (
    <section className="lp-section" style={{ ...sectionStyle, maxWidth: '720px' }}>
      <h2
        className="lp-h2"
        style={{
          fontFamily: FONT,
          fontWeight: 800,
          fontSize: '36px',
          lineHeight: 1.2,
          color: COLORS.textPrimary,
          margin: 0,
        }}
      >
        Lessonpreneur is built for music school owners who...
      </h2>

      <div style={{ marginTop: '32px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {ITEMS.map((item) => (
          <div
            key={item}
            className="lp-row-item"
            style={{
              fontFamily: FONT,
              fontSize: '18px',
              lineHeight: 1.6,
              color: 'rgba(255,255,255,0.80)',
              display: 'flex',
              gap: '12px',
              alignItems: 'flex-start',
            }}
          >
            <span style={{ color: COLORS.pink, fontWeight: 800, flexShrink: 0 }}>→</span>
            <span>{item}</span>
          </div>
        ))}
      </div>

      <p
        style={{
          marginTop: '32px',
          fontFamily: FONT,
          fontWeight: 600,
          fontSize: '18px',
          color: 'rgba(255,255,255,0.55)',
          fontStyle: 'italic',
        }}
      >
        If any of that sounds like your week, keep reading.
      </p>
    </section>
  )
}
