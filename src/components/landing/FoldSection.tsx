import { useNavigate } from 'react-router-dom'
import { COLORS, FONT, PrimaryButton, TrustChips, sectionStyle } from './shared'

export default function FoldSection() {
  const navigate = useNavigate()
  return (
    <section
      className="lp-section"
      style={{
        ...sectionStyle,
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        textAlign: 'center',
        paddingTop: '80px',
        paddingBottom: '80px',
      }}
    >
      <h1
        className="lp-h1"
        style={{
          fontFamily: FONT,
          fontWeight: 900,
          fontSize: '64px',
          lineHeight: 1.05,
          color: COLORS.textPrimary,
          maxWidth: '800px',
          margin: 0,
        }}
      >
        Run Your Music School Without Running Yourself Into the Ground.
      </h1>

      <p
        className="lp-sub"
        style={{
          fontFamily: FONT,
          fontWeight: 400,
          fontSize: '20px',
          lineHeight: 1.6,
          color: 'rgba(255,255,255,0.70)',
          maxWidth: '680px',
          marginTop: '20px',
          marginBottom: 0,
        }}
      >
        Lessonpreneur replaces the scattered texting, spreadsheets, billing
        headaches, and dropped leads that eat your days — with one system
        built from the ground up for private music schools.
      </p>

      {/* REPLACE WITH ACTUAL VSL EMBED */}
      <div
        style={{
          marginTop: '32px',
          width: '100%',
          maxWidth: '720px',
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
            whiteSpace: 'nowrap',
          }}
        >
          VSL Video 1 — 30 to 90 seconds — Upload here
        </div>
      </div>

      <div style={{ marginTop: '32px' }}>
        <PrimaryButton onClick={() => navigate('/start')}>
          Start My Free 60-Day Trial
        </PrimaryButton>
      </div>

      <div style={{ marginTop: '16px', width: '100%' }}>
        <TrustChips />
      </div>
    </section>
  )
}
