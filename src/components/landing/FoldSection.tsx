import { useNavigate } from 'react-router-dom'
import { COLORS, FONT, PrimaryButton, TrustChips, sectionStyle } from './shared'

export default function FoldSection() {
  const navigate = useNavigate()
  return (
    <section
      className="lp-section lp-fold-section"
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
      <style>{`
        @keyframes lp-gauge-fill {
          from { stroke-dashoffset: 376.991; }
          to { stroke-dashoffset: 82.94; }
        }
        @keyframes lp-gauge-rotate {
          from { transform: rotate(-90deg); }
          to { transform: rotate(270deg); }
        }
        .lp-gauge-wrap { display: block; }
        @media (max-width: 768px) {
          .lp-gauge-wrap { display: none !important; }
          .lp-fold-section { padding-top: 24px !important; padding-bottom: 0px !important; min-height: auto !important; justify-content: flex-start !important; }
          .lp-fold-sub { margin-top: 8px !important; }
          .lp-fold-video { margin-top: 16px !important; }
          .lp-fold-cta-wrap { margin-top: 16px !important; }
          .lp-fold-chips-wrap { margin-top: 10px !important; }
        }
      `}</style>

      <div
        className="lp-gauge-wrap"
        aria-hidden="true"
        style={{
          position: 'absolute',
          top: '120px',
          right: '40px',
          width: '140px',
          height: '140px',
          pointerEvents: 'none',
        }}
      >
        <svg
          width="140"
          height="140"
          viewBox="0 0 140 140"
          style={{
            position: 'absolute',
            inset: 0,
            transformOrigin: '70px 70px',
            animation: 'lp-gauge-rotate 60s linear infinite',
          }}
        >
          <circle
            cx="70"
            cy="70"
            r="60"
            fill="none"
            stroke="rgba(255,255,255,0.08)"
            strokeWidth="3"
          />
          <circle
            cx="70"
            cy="70"
            r="60"
            fill="none"
            stroke="#D4226A"
            strokeWidth="3"
            strokeLinecap="round"
            strokeDasharray="376.991"
            strokeDashoffset="376.991"
            style={{
              animation: 'lp-gauge-fill 2s ease-out 0.5s forwards',
            }}
          />
        </svg>
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            textAlign: 'center',
          }}
        >
          <div
            style={{
              fontFamily: FONT,
              fontWeight: 800,
              fontSize: '11px',
              color: '#fff',
              letterSpacing: '0.02em',
            }}
          >
            15 min/day
          </div>
          <div
            style={{
              fontFamily: FONT,
              fontSize: '9px',
              color: 'rgba(255,255,255,0.45)',
              marginTop: '2px',
            }}
          >
            to run your school
          </div>
        </div>
      </div>

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
        Run Your Music School<br />
        <span style={{ color: '#D4226A' }}>WITHOUT</span><br />
        Running Yourself<br />
        Into the Ground.
      </h1>

      <p
        className="lp-sub lp-fold-sub"
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
      <style>{`
        @keyframes lp-video-border-shift {
          0%   { background-position: 0% 0%, 0% 0%; }
          100% { background-position: 0% 0%, 200% 0%; }
        }
      `}</style>
      <div
        className="lp-video-frame lp-fold-video"
        style={{
          marginTop: '32px',
          width: '100%',
          maxWidth: '720px',
          aspectRatio: '16 / 9',
          borderRadius: '12px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          position: 'relative',
          border: '1px solid transparent',
          backgroundImage:
            'linear-gradient(#000,#000), linear-gradient(90deg, #D4226A, #FF5500, #D4226A, #FF5500)',
          backgroundOrigin: 'border-box',
          backgroundClip: 'padding-box, border-box',
          backgroundSize: '100% 100%, 200% 100%',
          animation: 'lp-video-border-shift 3s linear infinite',
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
          VSL Video 1 — 30 to 90 seconds — Upload here
        </div>
      </div>

      <div className="lp-fold-cta-wrap" style={{ marginTop: '32px' }}>
        <PrimaryButton onClick={() => navigate('/start')} pulse>
          Start My Free 60-Day Trial
        </PrimaryButton>
      </div>

      <div className="lp-fold-chips-wrap" style={{ marginTop: '16px', width: '100%' }}>
        <TrustChips />
      </div>
    </section>
  )
}
