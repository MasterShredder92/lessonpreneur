import { useState } from 'react'

interface VSLSectionProps {
  videoId: string
  headline: string
  subheadline: string
  duration?: string
}

export default function VSLSection({ videoId, headline, subheadline, duration }: VSLSectionProps) {
  const [playing, setPlaying] = useState(false)

  return (
    <section style={{ width: '100%' }}>
      <style>{`
        @keyframes lpPulse {
          0% { box-shadow: 0 0 0 0px rgba(212,34,106,0.40), 0 0 20px rgba(212,34,106,0.25); }
          70% { box-shadow: 0 0 0 12px rgba(212,34,106,0), 0 0 30px rgba(212,34,106,0.15); }
          100% { box-shadow: 0 0 0 0px rgba(212,34,106,0), 0 0 20px rgba(212,34,106,0.25); }
        }
        .vsl-wrapper {
          width: 100%;
          max-width: 780px;
          margin: 0 auto;
          padding: 48px 20px;
        }
        .vsl-headline {
          font-family: 'Plus Jakarta Sans', sans-serif;
          font-weight: 800;
          font-size: 28px;
          color: #FFFFFF;
          text-align: center;
          margin: 0 0 8px;
          line-height: 1.2;
        }
        .vsl-accent {
          width: 48px;
          height: 3px;
          background: linear-gradient(90deg, #D4226A, #FF5500);
          border-radius: 2px;
          margin: 0 auto 16px;
        }
        .vsl-subheadline {
          font-size: 16px;
          color: rgba(255,255,255,0.60);
          text-align: center;
          margin: 0 0 20px;
          line-height: 1.5;
        }
        .vsl-watch-label {
          font-size: 11px;
          font-weight: 800;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: white;
          text-shadow: 0 1px 8px rgba(0,0,0,0.80);
          margin-bottom: 10px;
        }
        .vsl-reassurance {
          font-size: 12px;
          color: rgba(255,255,255,0.30);
          text-align: center;
          margin-top: 12px;
        }
        @media (max-width: 640px) {
          .vsl-wrapper {
            padding: 32px 16px;
          }
          .vsl-headline {
            font-size: 22px;
          }
          .vsl-subheadline {
            font-size: 14px;
          }
          .vsl-watch-label {
            font-size: 10px;
          }
        }
      `}</style>

      <div className="vsl-wrapper">
        <h2 className="vsl-headline">{headline}</h2>
        <div className="vsl-accent" />
        <p className="vsl-subheadline">{subheadline}</p>

        <div
          style={{
            position: 'relative',
            width: '100%',
            aspectRatio: '16 / 9',
            borderRadius: 12,
            overflow: 'hidden',
            border: '1px solid rgba(255,255,255,0.10)',
            boxShadow: '0 20px 60px rgba(0,0,0,0.40)',
          }}
        >
          {playing ? (
            <iframe
              src={`https://www.youtube.com/embed/${videoId}?autoplay=1&rel=0&modestbranding=1`}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              style={{
                position: 'absolute',
                inset: 0,
                width: '100%',
                height: '100%',
                border: 'none',
                borderRadius: 12,
              }}
            />
          ) : (
            <>
              <img
                src={`https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`}
                alt=""
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                  display: 'block',
                }}
              />
              <div
                onClick={() => setPlaying(true)}
                style={{
                  position: 'absolute',
                  inset: 0,
                  background: 'rgba(0,0,0,0.18)',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                }}
              >
                <div className="vsl-watch-label">Watch This First</div>
                <div
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: '50%',
                    background: 'rgba(212,34,106,0.90)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxShadow: '0 0 0 8px rgba(212,34,106,0.20), 0 0 30px rgba(212,34,106,0.35)',
                    animation: 'lpPulse 2s ease-out infinite',
                  }}
                >
                  <div
                    style={{
                      width: 0,
                      height: 0,
                      borderTop: '8px solid transparent',
                      borderBottom: '8px solid transparent',
                      borderLeft: '14px solid white',
                      marginLeft: 3,
                    }}
                  />
                </div>
              </div>
              {duration && (
                <div
                  style={{
                    position: 'absolute',
                    bottom: 12,
                    right: 12,
                    background: 'rgba(0,0,0,0.65)',
                    borderRadius: 4,
                    padding: '3px 8px',
                    fontSize: 11,
                    color: 'white',
                    fontWeight: 600,
                  }}
                >
                  {duration}
                </div>
              )}
            </>
          )}
        </div>

        <div className="vsl-reassurance">🔒 No signup required to watch</div>
      </div>
    </section>
  )
}
