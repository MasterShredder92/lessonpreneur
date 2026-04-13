import { COLORS, FONT, sectionStyle } from './shared'
import { useInView } from './useInView'

const ITEMS = [
  'Are losing leads because nobody followed up fast enough',
  'Have student info scattered across texts, forms, and spreadsheets',
  'Spend more time on admin than on actually growing the school',
  "Are running Square for billing, Google Drive for docs, and a separate texting app for follow-up — and it's all a mess",
  'Want professional operations without hiring an operations person',
  'Have one location trying to grow, or three locations trying to stay sane',
]

export default function WhoItsForSection() {
  const [headingRef, inView] = useInView<HTMLHeadingElement>(0.3)
  return (
    <section className="lp-section lp-who-section" style={{ ...sectionStyle, maxWidth: '720px' }}>
      <style>{`
        .lp-who-row { transition: background 200ms ease-out, border-radius 200ms ease-out; padding: 6px 10px; border-radius: 8px; }
        .lp-who-row:hover { background: rgba(212,34,106,0.06); }
        @media (max-width: 768px) {
          .lp-who-section { padding-top: 24px !important; }
        }
        @keyframes lp-who-type-reveal {
          from { clip-path: inset(0 100% 0 0); }
          to   { clip-path: inset(0 0 0 0); }
        }
        .lp-who-heading--reveal {
          animation: lp-who-type-reveal 1.2s steps(40, end) forwards;
        }
        .lp-who-subline { font-size: 16px; }
        @media (max-width: 768px) {
          .lp-who-subline { font-size: 14px !important; }
        }
      `}</style>
      <div
        style={{
          fontFamily: FONT,
          fontSize: '11px',
          textTransform: 'uppercase',
          letterSpacing: '0.14em',
          fontWeight: 800,
          color: '#D4226A',
          textAlign: 'center',
          marginBottom: '12px',
        }}
      >
        Who This Is For
      </div>
      <h2
        ref={headingRef}
        className={`lp-h2 ${inView ? 'lp-who-heading--reveal' : ''}`}
        style={{
          fontFamily: FONT,
          fontWeight: 900,
          fontSize: '36px',
          lineHeight: 1.2,
          color: COLORS.textPrimary,
          margin: 0,
          marginBottom: '8px',
          textAlign: 'center',
          clipPath: inView ? undefined : 'inset(0 100% 0 0)',
        }}
      >
        Sound Like Your Week?
      </h2>
      <p
        className="lp-who-subline"
        style={{
          fontFamily: FONT,
          color: 'rgba(255,255,255,0.55)',
          textAlign: 'center',
          margin: 0,
          marginBottom: '32px',
        }}
      >
        Lessonpreneur by ZiroWork was built for exactly this kind of owner.
      </p>

      <div style={{ marginTop: '32px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {ITEMS.map((item) => (
          <div
            key={item}
            className="lp-row-item lp-who-row"
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
