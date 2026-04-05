import { useState, type CSSProperties } from 'react'
import AtmosphericBackground from '../components/landing/AtmosphericBackground'
import {
  COLORS,
  FONT,
  PrimaryButton,
  mobileSectionCss,
} from '../components/landing/shared'

type StudentCount = 'Under 30' | '30–75' | '76–150' | '150+'
const COUNTS: StudentCount[] = ['Under 30', '30–75', '76–150', '150+']

const inputStyle: CSSProperties = {
  background: 'rgba(255,255,255,0.06)',
  border: '1px solid rgba(255,255,255,0.15)',
  borderRadius: '8px',
  padding: '14px 16px',
  fontSize: '16px',
  color: '#fff',
  width: '100%',
  fontFamily: FONT,
  outline: 'none',
  boxSizing: 'border-box',
}

const labelStyle: CSSProperties = {
  fontFamily: FONT,
  fontSize: '14px',
  fontWeight: 700,
  color: 'rgba(255,255,255,0.75)',
  marginBottom: '8px',
  display: 'block',
}

const errorStyle: CSSProperties = {
  color: COLORS.orange,
  fontFamily: FONT,
  fontSize: '13px',
  marginTop: '6px',
}

function isValidEmail(e: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)
}

export default function TrialStartPage() {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [count, setCount] = useState<StudentCount | null>(null)
  const [errors, setErrors] = useState<{ name?: string; email?: string; count?: string }>({})
  const [submitted, setSubmitted] = useState(false)
  const [focused, setFocused] = useState<string | null>(null)

  const handleSubmit = () => {
    const e: typeof errors = {}
    if (!name.trim()) e.name = 'Please enter your name.'
    if (!email.trim()) e.email = 'Please enter your email.'
    else if (!isValidEmail(email.trim())) e.email = 'Please enter a valid email.'
    if (!count) e.count = 'Please select a student count.'
    setErrors(e)
    if (Object.keys(e).length === 0) {
      setSubmitted(true)
    }
  }

  const fieldBorder = (field: string, hasError: boolean) =>
    hasError
      ? `1px solid ${COLORS.orange}`
      : focused === field
      ? `1px solid ${COLORS.pink}`
      : '1px solid rgba(255,255,255,0.15)'

  return (
    <div
      style={{
        background: COLORS.bg,
        minHeight: '100vh',
        position: 'relative',
        overflow: 'hidden',
        fontFamily: FONT,
      }}
    >
      <style>{mobileSectionCss}</style>
      <AtmosphericBackground />

      {/* Wordmark (non-clickable) */}
      <div style={{ position: 'relative', zIndex: 2, padding: '20px' }}>
        <span
          style={{
            fontFamily: FONT,
            fontWeight: 800,
            fontSize: '20px',
            color: COLORS.pink,
          }}
        >
          lessonpreneur
        </span>
      </div>

      <main
        className="lp-mobile-pad"
        style={{
          position: 'relative',
          zIndex: 1,
          maxWidth: '520px',
          margin: '0 auto',
          padding: '80px 24px 48px',
          boxSizing: 'border-box',
        }}
      >
        <h1
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
          You're almost in. Let's get your school set up.
        </h1>

        {submitted ? (
          <div style={{ marginTop: '48px', textAlign: 'center' }}>
            <div
              style={{
                fontFamily: FONT,
                fontWeight: 800,
                fontSize: '24px',
                color: '#fff',
              }}
            >
              You're in. Check your email.
            </div>
            <div
              style={{
                marginTop: '12px',
                fontFamily: FONT,
                fontSize: '16px',
                color: 'rgba(255,255,255,0.70)',
                lineHeight: 1.6,
              }}
            >
              We'll send your login details shortly. Watch the video below while we get everything
              set up.
            </div>
          </div>
        ) : (
          <div style={{ marginTop: '32px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div>
              <label style={labelStyle}>Your name</label>
              <input
                type="text"
                value={name}
                placeholder="Jane Smith"
                onChange={(e) => setName(e.target.value)}
                onFocus={() => setFocused('name')}
                onBlur={() => setFocused(null)}
                style={{ ...inputStyle, border: fieldBorder('name', !!errors.name) }}
              />
              {errors.name && <div style={errorStyle}>{errors.name}</div>}
            </div>

            <div>
              <label style={labelStyle}>Email address</label>
              <input
                type="email"
                value={email}
                placeholder="jane@yourschool.com"
                onChange={(e) => setEmail(e.target.value)}
                onFocus={() => setFocused('email')}
                onBlur={() => setFocused(null)}
                style={{ ...inputStyle, border: fieldBorder('email', !!errors.email) }}
              />
              {errors.email && <div style={errorStyle}>{errors.email}</div>}
            </div>

            <div>
              <label style={labelStyle}>How many active students?</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                {COUNTS.map((c) => {
                  const selected = count === c
                  return (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setCount(c)}
                      className="lp-count-pill"
                      style={{
                        flex: '1 1 calc(50% - 4px)',
                        minWidth: '120px',
                        minHeight: '44px',
                        padding: '12px 16px',
                        borderRadius: '999px',
                        border: selected
                          ? `1px solid ${COLORS.pink}`
                          : '1px solid rgba(255,255,255,0.2)',
                        background: selected ? COLORS.pink : 'transparent',
                        color: '#fff',
                        fontFamily: FONT,
                        fontSize: '15px',
                        fontWeight: 700,
                        cursor: 'pointer',
                        transition: 'background 200ms, border-color 200ms',
                      }}
                    >
                      {c}
                    </button>
                  )
                })}
              </div>
              {errors.count && <div style={errorStyle}>{errors.count}</div>}
            </div>

            <div style={{ marginTop: '4px' }}>
              <PrimaryButton onClick={handleSubmit} fullWidth>
                Create My Account and Start the Trial
              </PrimaryButton>
            </div>

            <div
              className="lp-trust-row"
              style={{
                marginTop: '4px',
                display: 'flex',
                flexWrap: 'wrap',
                gap: '8px',
                justifyContent: 'center',
              }}
            >
              {['No credit card required', 'Your data is private', 'Cancel anytime'].map((c) => (
                <span
                  key={c}
                  style={{
                    border: '1px solid rgba(255,255,255,0.15)',
                    background: 'rgba(255,255,255,0.05)',
                    color: 'rgba(255,255,255,0.7)',
                    fontSize: '13px',
                    padding: '6px 12px',
                    borderRadius: '999px',
                    fontFamily: FONT,
                    fontWeight: 500,
                  }}
                >
                  {c}
                </span>
              ))}
            </div>
          </div>
        )}
      </main>

      {/* Video section */}
      <section
        className="lp-mobile-pad"
        style={{
          position: 'relative',
          zIndex: 1,
          maxWidth: '900px',
          margin: '0 auto',
          padding: '32px 24px 64px',
          boxSizing: 'border-box',
        }}
      >
        <h2
          style={{
            fontFamily: FONT,
            fontWeight: 700,
            fontSize: '22px',
            color: 'rgba(255,255,255,0.70)',
            textAlign: 'center',
            margin: 0,
            lineHeight: 1.4,
          }}
        >
          While your account is being created — watch how LP runs a real school.
        </h2>

        {/* REPLACE WITH ACTUAL DEEP DIVE VIDEO EMBED */}
        <div
          style={{
            marginTop: '20px',
            width: '100%',
            maxWidth: '720px',
            marginLeft: 'auto',
            marginRight: 'auto',
            aspectRatio: '16 / 9',
            background: '#000',
            borderRadius: '12px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            position: 'relative',
            border: '1px solid rgba(255,255,255,0.08)',
          }}
        >
          <div
            style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -60%)',
              width: '80px',
              height: '80px',
              borderRadius: '50%',
              background: COLORS.pink,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <div
              style={{
                width: 0,
                height: 0,
                borderLeft: '22px solid #fff',
                borderTop: '14px solid transparent',
                borderBottom: '14px solid transparent',
                marginLeft: '6px',
              }}
            />
          </div>
          <div
            style={{
              position: 'absolute',
              bottom: '16px',
              left: '50%',
              transform: 'translateX(-50%)',
              color: 'rgba(255,255,255,0.5)',
              fontFamily: FONT,
              fontSize: '13px',
              fontWeight: 500,
              textAlign: 'center',
              width: '90%',
            }}
          >
            Deep Dive Walkthrough — 5 to 10 minutes — Upload here
          </div>
        </div>

        <div
          className="lp-steps-row"
          style={{
            marginTop: '40px',
            display: 'flex',
            justifyContent: 'center',
            gap: '48px',
            flexWrap: 'wrap',
          }}
        >
          {[
            { n: 1, title: 'Set Up', body: 'We walk you through your school config in about an hour.' },
            { n: 2, title: 'Explore', body: 'Poke around. The system was built to be obvious.' },
            { n: 3, title: 'Run It', body: 'Activate your automations and let LP start working.' },
          ].map((step) => (
            <div
              key={step.n}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                textAlign: 'center',
                maxWidth: '220px',
              }}
            >
              <div
                style={{
                  width: '40px',
                  height: '40px',
                  borderRadius: '50%',
                  background: COLORS.pink,
                  color: '#fff',
                  fontFamily: FONT,
                  fontWeight: 900,
                  fontSize: '18px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {step.n}
              </div>
              <div
                style={{
                  marginTop: '12px',
                  fontFamily: FONT,
                  fontWeight: 800,
                  fontSize: '16px',
                  color: '#fff',
                }}
              >
                {step.title}
              </div>
              <div
                style={{
                  marginTop: '6px',
                  fontFamily: FONT,
                  fontSize: '14px',
                  color: 'rgba(255,255,255,0.55)',
                  lineHeight: 1.5,
                }}
              >
                {step.body}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
