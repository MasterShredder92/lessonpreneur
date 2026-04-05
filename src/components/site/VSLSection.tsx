import { useState } from 'react'

interface VSLSectionProps {
  videoId: string
  headline: string
  subheadline: string
}

export default function VSLSection({ videoId, headline, subheadline }: VSLSectionProps) {
  const [playing, setPlaying] = useState(false)

  return (
    <section
      style={{
        background: '#0a0a0a',
        width: '100%',
        padding: 'clamp(40px, 8vw, 60px) 16px',
        borderTop: '1px solid #1C1C2A',
        borderBottom: '1px solid #1C1C2A',
      }}
    >
      <style>{`
        @keyframes vslPulse {
          0%, 100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(255,255,255,0.5); }
          50% { transform: scale(1.08); box-shadow: 0 0 0 14px rgba(255,255,255,0); }
        }
      `}</style>
      <div style={{ maxWidth: 800, margin: '0 auto', textAlign: 'center' }}>
        <h2
          style={{
            fontSize: 'clamp(22px, 4vw, 36px)',
            fontWeight: 800,
            color: '#FFFFFF',
            margin: 0,
            lineHeight: 1.2,
          }}
        >
          {headline}
        </h2>
        <p
          style={{
            fontSize: 'clamp(14px, 2vw, 17px)',
            color: '#A0A0C8',
            marginTop: 12,
            marginBottom: 28,
            lineHeight: 1.5,
          }}
        >
          {subheadline}
        </p>

        <div
          style={{
            position: 'relative',
            width: '100%',
            maxWidth: 800,
            margin: '0 auto',
            aspectRatio: '16 / 9',
            background: '#000',
            borderRadius: 12,
            overflow: 'hidden',
            boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
          }}
        >
          {playing ? (
            <iframe
              src={`https://www.youtube.com/embed/${videoId}?autoplay=1&rel=0`}
              title={headline}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              style={{
                position: 'absolute',
                inset: 0,
                width: '100%',
                height: '100%',
                border: 0,
              }}
            />
          ) : (
            <div
              onClick={() => setPlaying(true)}
              style={{
                position: 'absolute',
                inset: 0,
                cursor: 'pointer',
                backgroundImage: `url(https://img.youtube.com/vi/${videoId}/maxresdefault.jpg)`,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
              }}
            >
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  background: 'rgba(0,0,0,0.55)',
                }}
              />
              <div
                style={{
                  position: 'absolute',
                  top: '50%',
                  left: '50%',
                  transform: 'translate(-50%, calc(-50% - 52px))',
                  fontSize: 'clamp(14px, 2vw, 18px)',
                  fontWeight: 800,
                  color: '#FFFFFF',
                  textShadow: '0 2px 12px rgba(0,0,0,0.8)',
                  letterSpacing: '0.02em',
                  whiteSpace: 'nowrap',
                }}
              >
                Watch This First
              </div>
              <div
                style={{
                  position: 'absolute',
                  top: '50%',
                  left: '50%',
                  transform: 'translate(-50%, -50%)',
                  width: 64,
                  height: 64,
                  borderRadius: '50%',
                  background: '#FFFFFF',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  animation: 'vslPulse 2s ease-in-out infinite',
                }}
              >
                <div
                  style={{
                    width: 0,
                    height: 0,
                    borderTop: '12px solid transparent',
                    borderBottom: '12px solid transparent',
                    borderLeft: '20px solid #E50914',
                    marginLeft: 5,
                  }}
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
