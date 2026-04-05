import { COLORS, FONT, GlassCard, sectionStyle } from './shared'
import Reveal from './Reveal'

const CARDS = [
  {
    label: 'The Dropped Lead',
    body: "A parent fills out your contact form on a Tuesday night. By Thursday, nobody has followed up. They went with the school that texted them Wednesday morning. That family was worth $185 a month. Every month. You'll never know they were there.",
  },
  {
    label: 'The Billing Guesswork',
    body: "Your billing is technically handled. But you're not totally sure what everyone is paying, who's behind, or why last month's number doesn't match what you expected. You'll figure it out later. You've been saying that for three months.",
  },
  {
    label: 'The Teacher Callout Tax',
    body: 'A teacher calls out. You text seven people. Two respond. You manually update the schedule somewhere. A parent shows up anyway. You apologize. Again.',
  },
  {
    label: 'The Spreadsheet Graveyard',
    body: 'Somewhere there is a spreadsheet that was accurate six months ago. You know it. It lives in Google Drive next to the other three spreadsheets that were also accurate — at some point.',
  },
  {
    label: 'The Phone That Never Stops',
    body: "It's 9:30pm. A parent is texting you from your personal number about their kid's makeup lesson. You answer because if you don't, who will? You are the system.",
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
