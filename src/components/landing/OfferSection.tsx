import { useNavigate } from 'react-router-dom'
import { COLORS, FONT, PrimaryButton, TrustChips } from './shared'

const ROWS = [
  { title: '60 Days Free — No Card. No Risk.', body: null, large: true },
  {
    title: 'Guided Setup Included',
    body: 'We walk you through setup step by step. No technical knowledge needed. Most owners are fully operational in their first week.',
  },
  {
    title: 'Pre-Built Automations Ready to Activate',
    body: 'Your lead follow-up, appointment reminders, and parent notifications are pre-configured. You activate them. They run.',
  },
  {
    title: 'Works With Square — No Billing Migration',
    body: 'Keep your payment processor. LP adds visibility and control on top of what you already use. Nothing gets ripped out.',
  },
  {
    title: 'Founder Access During Beta',
    body: "Right now, you get direct access during onboarding. If something isn't working for your specific school, we fix it. This is only available while we're in early access.",
  },
]

export default function OfferSection() {
  const navigate = useNavigate()
  return (
    <section
      style={{
        background: 'rgba(212,34,106,0.04)',
        borderTop: '1px solid rgba(212,34,106,0.12)',
        borderBottom: '1px solid rgba(212,34,106,0.12)',
      }}
    >
      <div
        className="lp-section"
        style={{
          position: 'relative',
          zIndex: 1,
          maxWidth: '1100px',
          margin: '0 auto',
          padding: '100px 24px',
          boxSizing: 'border-box',
        }}
      >
        <h2
          className="lp-h3"
          style={{
            fontFamily: FONT,
            fontWeight: 900,
            fontSize: '42px',
            lineHeight: 1.15,
            color: COLORS.textPrimary,
            textAlign: 'center',
            margin: 0,
          }}
        >
          What you get when you start <span style={{ color: COLORS.pink }}>today</span>.
        </h2>

        <div
          style={{
            marginTop: '48px',
            maxWidth: '720px',
            marginLeft: 'auto',
            marginRight: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: '20px',
          }}
        >
          {ROWS.map((row) => (
            <div
              key={row.title}
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: '16px',
              }}
            >
              <div
                style={{
                  width: '28px',
                  height: '28px',
                  background: COLORS.pink,
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  marginTop: '2px',
                  color: '#fff',
                  fontFamily: FONT,
                  fontSize: '16px',
                  fontWeight: 900,
                }}
              >
                ✓
              </div>
              <div>
                <div
                  style={{
                    fontFamily: FONT,
                    fontWeight: 800,
                    fontSize: row.large ? '22px' : '18px',
                    color: COLORS.textPrimary,
                  }}
                >
                  {row.title}
                </div>
                {row.body && (
                  <div
                    style={{
                      fontFamily: FONT,
                      fontSize: '16px',
                      color: 'rgba(255,255,255,0.70)',
                      marginTop: '4px',
                      lineHeight: 1.6,
                    }}
                  >
                    {row.body}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        <div
          style={{
            marginTop: '40px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '16px',
          }}
        >
          <PrimaryButton onClick={() => navigate('/start')}>
            Start My Free 60-Day Trial
          </PrimaryButton>
          <TrustChips />
        </div>
      </div>
    </section>
  )
}
