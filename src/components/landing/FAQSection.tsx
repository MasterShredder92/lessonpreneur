import { useState } from 'react'
import { COLORS, FONT, sectionStyle } from './shared'

const FAQS = [
  {
    q: "I'm already on Square. Do I have to leave it?",
    a: 'No. LP connects with Square. You keep your payment processor. LP adds visibility, automation, and control on top of what you already have. Nothing gets ripped out.',
  },
  {
    q: 'What happens to my current student data?',
    a: "We help you bring it in. Setup is guided. You don't start from zero.",
  },
  {
    q: "I'm not technical. Will this be hard to learn?",
    a: 'LP was built for operators, not developers. If you can run a group text and update a spreadsheet, you can run LP.',
  },
  {
    q: 'Is this ready, or is it still being built?',
    a: "LP is running in production in Zach's own schools right now — four locations, 600+ students, 40+ teachers. You're getting access to the exact system he uses every day.",
  },
  {
    q: 'What happens after 60 days?',
    a: "If it's not the right fit, you cancel. No charge. No friction. If it is — and we think it will be — we'll talk about what plan fits your school.",
  },
  {
    q: 'I only have one location and 30 students. Is this overkill?',
    a: "LP scales down just as well as it scales up. Solo owners and single-location schools are exactly who it was designed for first. It grows with you when you're ready.",
  },
]

export default function FAQSection() {
  const [open, setOpen] = useState<number>(0)
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
          textAlign: 'center',
          margin: 0,
        }}
      >
        Questions we hear <span style={{ color: COLORS.pink }}>a lot</span>.
      </h2>

      <div
        style={{
          marginTop: '40px',
          maxWidth: '720px',
          marginLeft: 'auto',
          marginRight: 'auto',
        }}
      >
        {FAQS.map((item, i) => {
          const isOpen = open === i
          return (
            <div
              key={i}
              style={{
                borderBottom: '1px solid rgba(255,255,255,0.08)',
                padding: '24px 0',
              }}
            >
              <button
                type="button"
                onClick={() => setOpen(isOpen ? -1 : i)}
                aria-expanded={isOpen}
                className="lp-faq-btn"
                style={{
                  width: '100%',
                  minHeight: '44px',
                  background: 'transparent',
                  border: 'none',
                  padding: 0,
                  cursor: 'pointer',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: '16px',
                  textAlign: 'left',
                }}
              >
                <span
                  style={{
                    fontFamily: FONT,
                    fontWeight: 700,
                    fontSize: '17px',
                    color: COLORS.textPrimary,
                    lineHeight: 1.4,
                  }}
                >
                  {item.q}
                </span>
                <span
                  style={{
                    color: COLORS.pink,
                    fontFamily: FONT,
                    fontWeight: 800,
                    fontSize: '22px',
                    flexShrink: 0,
                  }}
                >
                  {isOpen ? '−' : '+'}
                </span>
              </button>
              {isOpen && (
                <div
                  style={{
                    fontFamily: FONT,
                    fontSize: '16px',
                    color: 'rgba(255,255,255,0.70)',
                    lineHeight: 1.7,
                    paddingTop: '12px',
                  }}
                >
                  {item.a}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </section>
  )
}
