import { useCallback, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useSiteLocation } from '../../hooks/useSiteLocation'
import { setLocColors } from '../../lib/setLocColors'

const LOCATIONS = [
  { id: 'omaha', name: 'Omaha' },
  { id: 'gretna', name: 'Gretna' },
  { id: 'bellevue', name: 'Bellevue' },
  { id: 'elkhorn', name: 'Elkhorn' },
]

const INSTRUMENTS = [
  { label: 'Piano', slug: 'piano' },
  { label: 'Guitar', slug: 'guitar' },
  { label: 'Vocals', slug: 'vocals' },
  { label: 'Drums', slug: 'drums' },
  { label: 'More', slug: 'more' },
]

interface SiteHeaderProps {
  activeInstrument?: string
}

export default function SiteHeader({ activeInstrument }: SiteHeaderProps) {
  const siteLoc = useSiteLocation()
  const navigate = useNavigate()
  const { pathname } = useLocation()

  const locId = siteLoc.key
  const locName = siteLoc.name.toUpperCase()
  const locColor = siteLoc.accentColor
  const segments = pathname.split('/').filter(Boolean)
  const currentInstrument = activeInstrument ?? segments[1] ?? ''

  useEffect(() => {
    setLocColors({ '--loc-color': locColor })
  }, [locColor])

  const switchLocation = useCallback((newLocId: string) => {
    if (currentInstrument) {
      navigate(`/${newLocId}/${currentInstrument}`)
    } else {
      navigate(`/${newLocId}`)
    }
  }, [navigate, currentInstrument])

  const switchInstrument = useCallback((slug: string) => {
    navigate(`/${locId}/${slug}`)
  }, [navigate, locId])

  const otherLocs = LOCATIONS.filter(l => l.id !== locId)

  return (
    <div>
      {/* ═══ DESKTOP ROW 1 — Location Name + Other Locations ═══ */}
      <div className="sh-dt-row1" style={{
        position: 'fixed', top: 0, left: 0, right: 0, height: 56,
        background: '#080808', zIndex: 1000,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 24px',
        borderBottom: '1px solid rgba(255,255,255,0.08)',
      }}>
        {/* Left — Active location */}
        <a href={`/${locId}`} style={{ textDecoration: 'none', display: 'flex', flexDirection: 'column', justifyContent: 'center', lineHeight: 1.1, flexShrink: 0 }}>
          <span style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 28, color: locColor, letterSpacing: '0.05em', lineHeight: 1 }}>
            {locName}
          </span>
          <span style={{ fontSize: 9, fontWeight: 300, color: 'rgba(255,255,255,0.35)', letterSpacing: '0.12em', display: 'block', marginTop: 1 }}>
            by Adkins
          </span>
        </a>

        {/* Center — Other locations as minimal text */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
          {otherLocs.map((l, i) => (
            <div key={l.id} style={{ display: 'flex', alignItems: 'center' }}>
              {i > 0 && (
                <div style={{ width: 1, height: 14, background: 'rgba(255,255,255,0.1)', margin: '0 14px', flexShrink: 0 }} />
              )}
              <button
                onClick={() => switchLocation(l.id)}
                style={{
                  background: 'none', border: 'none', padding: 0,
                  color: '#444', fontSize: 12, fontWeight: 600,
                  fontFamily: "'Barlow', sans-serif",
                  cursor: 'pointer', whiteSpace: 'nowrap',
                }}
                onMouseEnter={e => (e.currentTarget.style.color = '#888')}
                onMouseLeave={e => (e.currentTarget.style.color = '#444')}
              >
                {l.name}
              </button>
            </div>
          ))}
        </div>

        {/* Right — empty for flex balance */}
        <div style={{ width: 80, flexShrink: 0 }} />
      </div>

      {/* ═══ DESKTOP ROW 2 — Instrument Tabs ═══ */}
      <div className="sh-dt-row2" style={{
        position: 'fixed', top: 56, left: 0, right: 0, height: 40,
        background: '#050505', zIndex: 999,
        borderTop: '1px solid rgba(255,255,255,0.06)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        gap: 0, padding: '0 16px',
      }}>
        {INSTRUMENTS.map(inst => {
          const isActive = currentInstrument === inst.slug
          return (
            <button
              key={inst.label}
              onClick={() => switchInstrument(inst.slug)}
              style={{
                background: 'none', border: 'none',
                borderBottom: isActive ? `2px solid ${locColor}` : '2px solid transparent',
                padding: '4px 14px',
                fontSize: 12,
                fontWeight: isActive ? 700 : 600,
                fontFamily: "'Barlow', sans-serif",
                color: isActive ? locColor : '#555',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                marginBottom: -1,
              }}
            >
              {inst.label}
            </button>
          )
        })}
        <button
          onClick={() => navigate(`/${locId}/signup`)}
          style={{
            background: locColor, border: 'none',
            padding: '5px 14px',
            fontSize: 12,
            fontWeight: 700,
            fontFamily: "'Barlow', sans-serif",
            color: '#fff',
            cursor: 'pointer',
            whiteSpace: 'nowrap',
            borderRadius: 20,
            marginLeft: 10,
          }}
        >
          Sign Up
        </button>
      </div>

      {/* ═══ MOBILE ROW 1 — All Locations (40px) ═══ */}
      <div className="sh-mb-row1" style={{
        position: 'fixed', top: 0, left: 0, right: 0, height: 40,
        background: '#080808', zIndex: 1000,
        display: 'none', alignItems: 'center', justifyContent: 'center',
        gap: 16, padding: '0 12px',
        borderBottom: '1px solid rgba(255,255,255,0.08)',
      }}>
        {LOCATIONS.map(l => (
          <button
            key={l.id}
            onClick={() => switchLocation(l.id)}
            style={{
              background: 'none', border: 'none', padding: 0,
              fontFamily: "'Barlow', sans-serif",
              fontSize: 12, fontWeight: locId === l.id ? 700 : 600,
              color: locId === l.id ? locColor : '#444',
              cursor: 'pointer', whiteSpace: 'nowrap',
            }}
          >
            {l.name}
          </button>
        ))}
      </div>

      {/* ═══ MOBILE ROW 2 — Instrument Tabs (36px) ═══ */}
      <div className="sh-mb-row2" style={{
        position: 'fixed', top: 40, left: 0, right: 0, height: 36,
        background: '#050505', zIndex: 999,
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        display: 'none', alignItems: 'center', justifyContent: 'center',
        gap: 0, padding: '0 8px',
      }}>
        {INSTRUMENTS.map(inst => {
          const isActive = currentInstrument === inst.slug
          return (
            <button
              key={inst.label}
              onClick={() => switchInstrument(inst.slug)}
              style={{
                background: 'none', border: 'none',
                borderBottom: isActive ? `2px solid ${locColor}` : '2px solid transparent',
                padding: '4px 10px',
                fontSize: 11,
                fontWeight: isActive ? 700 : 600,
                fontFamily: "'Barlow', sans-serif",
                color: isActive ? locColor : '#555',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                marginBottom: -1,
              }}
            >
              {inst.label}
            </button>
          )
        })}
        <button
          onClick={() => navigate(`/${locId}/signup`)}
          style={{
            background: locColor, border: 'none',
            padding: '5px 14px',
            fontSize: 11,
            fontWeight: 700,
            fontFamily: "'Barlow', sans-serif",
            color: '#fff',
            cursor: 'pointer',
            whiteSpace: 'nowrap',
            borderRadius: 20,
            marginLeft: 6,
          }}
        >
          Sign Up
        </button>
      </div>

      <style>{`
        .sh-dt-row1, .sh-dt-row2 { display: flex !important; }
        .sh-mb-row1, .sh-mb-row2 { display: none !important; }
        @media (max-width: 640px) {
          .sh-dt-row1, .sh-dt-row2 { display: none !important; }
          .sh-mb-row1, .sh-mb-row2 { display: flex !important; }
          .ak-hero { padding-top: 92px !important; }
        }
      `}</style>
    </div>
  )
}
