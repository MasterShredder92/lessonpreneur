import { COLORS, FONT, GlassCard, sectionStyle } from './shared'
import Reveal from './Reveal'

const CARDS = [
  {
    label: 'The Dropped Lead',
    body: "A parent fills out your form Tuesday night. By Thursday nobody followed up. They enrolled somewhere else. You'll never know they were there.",
  },
  {
    label: 'The Billing Guesswork',
    body: "You think billing is handled. But you're not sure what everyone's paying or why last month's number looks off. You'll figure it out later. You always say that.",
  },
  {
    label: 'The Teacher Callout Tax',
    body: 'Teacher calls out. You text seven people. Two respond. Parent shows up anyway. You apologize. Again.',
  },
  {
    label: 'The Spreadsheet Graveyard',
    body: "Somewhere there's a spreadsheet that was accurate once. It's in Google Drive next to the other three that were also accurate. Once.",
  },
  {
    label: 'The Phone That Never Stops',
    body: '9:30pm. Parent texting your personal number about a makeup lesson. You answer it. Because you are the system.',
  },
]

export default function ChaosStackSection() {
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
        }}
      >
        Here's the week you're <span style={{ color: COLORS.pink }}>probably</span> having.
      </h2>

      <div
        className="lp-grid-2"
        style={{
          marginTop: '40px',
          display: 'grid',
          gridTemplateColumns: 'repeat(2, 1fr)',
          gap: '20px',
        }}
      >
        {CARDS.map((card, idx) => (
          <Reveal key={card.label} delay={idx * 100}>
          <GlassCard accent>
            <div
              style={{
                fontFamily: FONT,
                fontSize: '11px',
                textTransform: 'uppercase',
                letterSpacing: '0.1em',
                color: COLORS.pink,
                fontWeight: 800,
                marginBottom: '12px',
              }}
            >
              {card.label}
            </div>
            <p
              style={{
                fontFamily: FONT,
                fontSize: '16px',
                lineHeight: 1.6,
                color: 'rgba(255,255,255,0.75)',
                margin: 0,
              }}
            >
              {card.body}
            </p>
          </GlassCard>
          </Reveal>
        ))}
      </div>

      <p
        style={{
          textAlign: 'center',
          marginTop: '40px',
          fontFamily: FONT,
          fontWeight: 600,
          fontSize: '18px',
          color: 'rgba(255,255,255,0.55)',
          fontStyle: 'italic',
          maxWidth: '680px',
          marginLeft: 'auto',
          marginRight: 'auto',
        }}
      >
        Lessonpreneur was built to fix every single one of those. By someone who lived all of them.
      </p>
    </section>
  )
}
