import { useNavigate } from 'react-router-dom'
import { COLORS, FONT, PrimaryButton, TrustChips, sectionStyle } from './shared'

export default function FinalCTASection() {
  const navigate = useNavigate()
  return (
    <section
      className="lp-section"
      style={{
        ...sectionStyle,
        maxWidth: '720px',
        textAlign: 'center',
      }}
    >
      <h2
        className="lp-h-final"
        style={{
          fontFamily: FONT,
          fontWeight: 900,
          fontSize: '48px',
          lineHeight: 1.1,
          color: COLORS.textPrimary,
          margin: 0,
        }}
      >
        Stop being the system. <span style={{ color: COLORS.pink }}>Build one.</span>
      </h2>

      <p
        style={{
          marginTop: '24px',
          fontFamily: FONT,
          fontSize: '18px',
          lineHeight: 1.7,
          color: 'rgba(255,255,255,0.70)',
          margin: '24px 0 0 0',
        }}
      >
        Every week you run your school on manual texts, scattered spreadsheets, and memory is a
        week of dropped leads, lost revenue, and admin hours you are never getting back. The trial
        is free for 60 days. The setup is guided. The system is already running in real schools.
        The only question is whether you want in.
      </p>

      <div
        style={{
          marginTop: '32px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '16px',
        }}
      >
        <PrimaryButton onClick={() => navigate('/start')} pulse>
          Start My Free 60-Day Trial
        </PrimaryButton>
        <TrustChips />
      </div>

      <div
        style={{
          marginTop: '64px',
          textAlign: 'center',
          color: 'rgba(255,255,255,0.30)',
          fontFamily: FONT,
          fontSize: '14px',
        }}
      >
        © 2025 Lessonpreneur. Built by a music school owner, for music school owners.
      </div>
    </section>
  )
}
