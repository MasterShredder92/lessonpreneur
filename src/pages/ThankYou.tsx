import { useEffect, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { LOCATIONS, type LocKey } from '../config/locations'
import { setLocColors } from '../lib/setLocColors'
import PianoWidget from '../components/instruments/PianoWidget'
import GuitarWidget from '../components/instruments/GuitarWidget'
import DrumsWidget from '../components/instruments/DrumsWidget'
import VocalsWidget from '../components/instruments/VocalsWidget'

// ── After-hours check (Central Time) ──
function isAfterHoursCST(): boolean {
  const now = new Date()
  const cst = new Date(now.toLocaleString('en-US', { timeZone: 'America/Chicago' }))
  const h = cst.getHours()
  const m = cst.getMinutes()
  return h >= 22 || (h === 21 && m >= 30)
}

export default function ThankYou() {
  const [params] = useSearchParams()
  const locKey = (params.get('location') as LocKey) || 'omaha'
  const loc = LOCATIONS[locKey] || LOCATIONS.omaha
  const accent = loc.accentColor
  const afterHours = useMemo(() => isAfterHoursCST(), [])

  useEffect(() => {
    setLocColors({ '--c': accent })
  }, [accent])

  return (
    <div style={{
      minHeight: '100vh',
      background: '#0a0a0a',
      color: '#fff',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      padding: '48px 20px 64px',
    }}>
      {/* Headline */}
      <h1 style={{
        fontSize: 'clamp(28px, 6vw, 44px)',
        fontWeight: 800,
        textAlign: 'center',
        marginBottom: 8,
        lineHeight: 1.2,
      }}>
        You're in! We can't wait to meet you.
      </h1>

      {/* Subheadline */}
      <p style={{
        fontSize: 'clamp(15px, 3.5vw, 18px)',
        color: '#aaa',
        textAlign: 'center',
        maxWidth: 520,
        lineHeight: 1.5,
        marginBottom: 8,
      }}>
        While you wait — you and your future rockstar can warm up on these. No experience required. 😄
      </p>

      {/* After hours disclaimer */}
      {afterHours && (
        <p style={{
          fontSize: 13,
          color: '#777',
          textAlign: 'center',
          fontStyle: 'italic',
          maxWidth: 440,
          marginBottom: 8,
        }}>
          (P.S. — It's late. We're not calling you tonight. We'll catch you tomorrow morning! 😄)
        </p>
      )}

      {/* 2x2 Instrument Grid — uses the SAME widgets as the instrument landing pages */}
      <div className="thankyou-widgets">
        {/* Piano — same keyboard as /omaha/piano */}
        <div style={{ background: '#111', borderRadius: 16, padding: 20, border: '1px solid #222', overflow: 'hidden' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#aaa', marginBottom: 12, textAlign: 'center', letterSpacing: 1 }}>
            🎹 PIANO
          </div>
          <PianoWidget />
        </div>

        {/* Guitar — same chord builder as /omaha/guitar */}
        <div style={{ background: '#111', borderRadius: 16, padding: 20, border: '1px solid #222', overflow: 'hidden' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#aaa', marginBottom: 12, textAlign: 'center', letterSpacing: 1 }}>
            🎸 GUITAR
          </div>
          <GuitarWidget accentColor={accent} />
        </div>

        {/* Drums — same drum kit as /omaha/drums, uses /audio/drums/*.wav */}
        <div style={{ background: '#111', borderRadius: 16, padding: 20, border: '1px solid #222', overflow: 'hidden' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#aaa', marginBottom: 12, textAlign: 'center', letterSpacing: 1 }}>
            🪘 DRUMS
          </div>
          <DrumsWidget />
        </div>

        {/* Vocals — same mic recorder as /omaha/vocals */}
        <div style={{ background: '#111', borderRadius: 16, padding: 20, border: '1px solid #222', overflow: 'hidden' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#aaa', marginBottom: 12, textAlign: 'center', letterSpacing: 1 }}>
            🎤 VOCALS
          </div>
          <VocalsWidget accentColor={accent} />
        </div>
      </div>

      {/* Footer */}
      <p style={{
        fontSize: 14,
        color: '#555',
        textAlign: 'center',
        marginTop: 48,
        fontStyle: 'italic',
      }}>
        Your first lesson is closer than you think.
      </p>
    </div>
  )
}
