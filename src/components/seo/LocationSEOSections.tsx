import { useState } from 'react'
import { Link } from 'react-router-dom'
import type { LocationSEOContent, InstrumentLocalContent } from '../../content/types'
import type { LocKey } from '../../config/locations'
import { LOCATIONS } from '../../config/locations'

/* ─── Location Intro ─── */
export function LocationIntro({ content }: { content: LocationSEOContent }) {
  const l = LOCATIONS[content.key]
  return (
    <section className="seo-section seo-intro" aria-label="About our studio">
      <div className="seo-container">
        <h2 className="seo-h2">{content.intro.headline}</h2>
        {content.intro.body.map((p, i) => (
          <p key={i} className="seo-p">{p}</p>
        ))}
      </div>
    </section>
  )
}

/* ─── Who We Help ─── */
const WHO_TABS = [
  { key: 'kids', label: 'Kids' },
  { key: 'teens', label: 'Teens' },
  { key: 'adults', label: 'Adults' },
  { key: 'beginners', label: 'Beginners' },
  { key: 'returning', label: 'Returning Musicians' },
] as const

export function WhoWeHelp({ content }: { content: LocationSEOContent }) {
  const [active, setActive] = useState<keyof typeof content.whoWeHelp>('kids')
  return (
    <section className="seo-section seo-who" aria-label="Who we teach">
      <div className="seo-container">
        <h2 className="seo-h2">Who We Teach in {LOCATIONS[content.key].name}</h2>
        <div className="seo-tabs" role="tablist">
          {WHO_TABS.map(t => (
            <button
              key={t.key}
              role="tab"
              aria-selected={active === t.key}
              className={`seo-tab ${active === t.key ? 'active' : ''}`}
              onClick={() => setActive(t.key)}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div role="tabpanel" className="seo-tab-panel">
          <p className="seo-p">{content.whoWeHelp[active]}</p>
        </div>
        {/* Hidden but crawlable panels for all audiences */}
        <div className="seo-sr-only" aria-hidden="true">
          {WHO_TABS.filter(t => t.key !== active).map(t => (
            <div key={t.key}>
              <h3>{t.label}</h3>
              <p>{content.whoWeHelp[t.key]}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

/* ─── Why Families Choose Us ─── */
export function WhyChoose({ content }: { content: LocationSEOContent }) {
  return (
    <section className="seo-section seo-why" aria-label="Why families choose us">
      <div className="seo-container">
        <h2 className="seo-h2">{content.whyChoose.heading}</h2>
        <div className="seo-grid">
          {content.whyChoose.points.map((p, i) => (
            <div key={i} className="seo-card">
              <h3 className="seo-h3">{p.title}</h3>
              <p className="seo-p">{p.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

/* ─── Location FAQ ─── */
export function LocationFAQ({ content }: { content: LocationSEOContent }) {
  const [open, setOpen] = useState<number | null>(null)
  return (
    <section className="seo-section seo-faq" aria-label="Frequently asked questions">
      <div className="seo-container">
        <h2 className="seo-h2">Frequently Asked Questions — {LOCATIONS[content.key].name}</h2>
        <div className="seo-faq-list">
          {content.faqs.map((f, i) => (
            <div key={i} className="seo-faq-item">
              <button
                className="seo-faq-q"
                aria-expanded={open === i}
                onClick={() => setOpen(open === i ? null : i)}
              >
                <span>{f.q}</span>
                <span className="seo-faq-icon">{open === i ? '−' : '+'}</span>
              </button>
              <div
                className={`seo-faq-a ${open === i ? 'open' : ''}`}
                role="region"
                aria-hidden={open !== i}
              >
                <p className="seo-p">{f.a}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

/* ─── Service Area ─── */
export function ServiceArea({ content }: { content: LocationSEOContent }) {
  return (
    <section className="seo-section seo-service-area" aria-label="Service area">
      <div className="seo-container">
        <h2 className="seo-h2">Serving the {LOCATIONS[content.key].name} Area</h2>
        <p className="seo-p">{content.serviceArea}</p>
      </div>
    </section>
  )
}

/* ─── Local Instrument Sections ─── */
const INSTRUMENT_KEYS = ['piano', 'guitar', 'vocals', 'drums', 'more'] as const
const INSTRUMENT_ROUTES: Record<string, string> = {
  piano: 'piano',
  guitar: 'guitar',
  vocals: 'vocals',
  drums: 'drums',
  more: 'more',
}

export function LocalInstruments({ content }: { content: LocationSEOContent }) {
  const loc = content.key
  return (
    <section className="seo-section seo-instruments" aria-label="Instruments we teach">
      <div className="seo-container">
        <h2 className="seo-h2">Instruments We Teach in {LOCATIONS[loc].name}</h2>
        <div className="seo-instruments-grid">
          {INSTRUMENT_KEYS.map(k => {
            const inst = content.instruments[k]
            return (
              <div key={k} className="seo-instrument-card">
                <h3 className="seo-h3">{inst.heading}</h3>
                <p className="seo-p">{inst.body}</p>
                <p className="seo-p seo-audiences"><strong>Who it&apos;s for:</strong> {inst.audiences}</p>
                <Link to={`/${loc}/${INSTRUMENT_ROUTES[k]}`} className="seo-link">
                  {inst.cta} →
                </Link>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}

/* ─── Internal Cross-Links ─── */
export function LocationCrossLinks({ currentLoc }: { currentLoc: LocKey }) {
  const otherLocs = (['omaha', 'bellevue', 'elkhorn', 'gretna'] as const).filter(l => l !== currentLoc)
  const l = LOCATIONS[currentLoc]
  return (
    <section className="seo-section seo-cross-links" aria-label="Other locations">
      <div className="seo-container">
        <h2 className="seo-h2">More Locations</h2>
        <p className="seo-p">
          In addition to {l.name}, Adkins Music Lessons serves families at studios across the Omaha metro:
        </p>
        <div className="seo-link-grid">
          {otherLocs.map(ol => (
            <Link key={ol} to={`/${ol}`} className="seo-location-link">
              Music lessons in {LOCATIONS[ol].name} →
            </Link>
          ))}
        </div>
        <div className="seo-link-grid" style={{ marginTop: '1rem' }}>
          <Link to="/kids-music-lessons" className="seo-location-link">Kids music lessons →</Link>
          <Link to="/adult-music-lessons" className="seo-location-link">Adult music lessons →</Link>
          <Link to="/beginner-music-lessons" className="seo-location-link">Beginner music lessons →</Link>
          <Link to="/private-music-lessons" className="seo-location-link">Private music lessons →</Link>
        </div>
      </div>
    </section>
  )
}
