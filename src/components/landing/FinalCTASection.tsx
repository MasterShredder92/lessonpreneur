import { useNavigate } from 'react-router-dom'
import { COLORS, FONT, PrimaryButton, TrustChips, sectionStyle } from './shared'
import { ZW } from '../../config/zwBrand'

export default function FinalCTASection() {
  const navigate = useNavigate()
  return (
    <section
      className="lp-section"
      style={{
        ...sectionStyle,
        maxWidth: '720px',
        textAlign: 'center',
        position: 'relative',
      }}
    >
      {/* Spotlight radial gradient behind heading */}
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          top: 0,
          left: '50%',
          transform: 'translate(-50%, -20%)',
          width: '400px',
          height: '400px',
          borderRadius: '50%',
          background:
            'radial-gradient(circle, rgba(13,148,136,0.18) 0%, rgba(212,34,106,0.1) 45%, rgba(212,34,106,0) 70%)',
          filter: 'blur(40px)',
          pointerEvents: 'none',
          zIndex: 0,
        }}
      />
      <h2
        className="lp-h-final"
        style={{
          fontFamily: FONT,
          fontWeight: 900,
          fontSize: '48px',
          lineHeight: 1.1,
          color: COLORS.textPrimary,
          margin: 0,
          position: 'relative',
          zIndex: 1,
        }}
      >
        Stop being the system. <span style={{ color: COLORS.teal }}>Build one</span>{' '}
        <span style={{ color: COLORS.pink }}>on {ZW.parent}.</span>
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
        Every week you run your school on manual texts, scattered spreadsheets, and memory is a week of dropped leads,
        lost revenue, and admin hours you are never getting back. <strong style={{ color: 'rgba(255,255,255,0.92)' }}>{ZW.productByline}</strong> is the music-school product on {ZW.parent}. The trial is free for 60 days. The setup is guided. The system is already running in real schools. The only question is whether you want in.
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
        © {new Date().getFullYear()} {ZW.parent}. {ZW.productByline} — built by a music school owner, for music school owners.
      </div>
    </section>
  )
}
