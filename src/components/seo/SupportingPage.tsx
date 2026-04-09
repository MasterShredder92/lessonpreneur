import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import type { SupportingPageContent } from '../../content/types'
import SiteHeader from '../site/SiteHeader'
import './seo-sections.css'

export function SupportingPage({ content }: { content: SupportingPageContent }) {
  const [openFaq, setOpenFaq] = useState<number | null>(null)

  // SEO meta tags
  useEffect(() => {
    document.title = content.title
    const setMeta = (attr: string, key: string, val: string) => {
      let el = document.querySelector(`meta[${attr}="${key}"]`) as HTMLMetaElement | null
      if (!el) { el = document.createElement('meta'); el.setAttribute(attr, key); document.head.appendChild(el) }
      el.setAttribute('content', val)
    }
    setMeta('name', 'description', content.metaDescription)
    setMeta('property', 'og:title', content.title)
    setMeta('property', 'og:description', content.metaDescription)
    setMeta('property', 'og:url', `https://www.lessonpreneur.io/${content.slug}`)
    setMeta('property', 'og:type', 'website')
    setMeta('name', 'twitter:title', content.title)
    setMeta('name', 'twitter:description', content.metaDescription)

    let canonical = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null
    if (!canonical) { canonical = document.createElement('link'); canonical.setAttribute('rel', 'canonical'); document.head.appendChild(canonical) }
    canonical.setAttribute('href', `https://www.lessonpreneur.io/${content.slug}`)

    return () => { document.title = 'Lessonpreneur' }
  }, [content])

  // FAQPage JSON-LD
  useEffect(() => {
    const allFaqs = content.sections.flatMap(s => s.faqs ?? [])
    if (allFaqs.length === 0) return
    const id = 'ld-json-faq'
    let script = document.getElementById(id) as HTMLScriptElement | null
    if (!script) { script = document.createElement('script'); script.id = id; script.type = 'application/ld+json'; document.head.appendChild(script) }
    script.textContent = JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: allFaqs.map(f => ({
        '@type': 'Question',
        name: f.q,
        acceptedAnswer: { '@type': 'Answer', text: f.a },
      })),
    })
    return () => { script?.remove() }
  }, [content])

  return (
    <div className="seo-page" id="main-content">
      <SiteHeader />

      <div className="seo-page-hero">
        <h1 className="seo-h1">{content.h1}</h1>
      </div>

      <div className="seo-page-intro">
        <div className="seo-container">
          {content.intro.map((p, i) => (
            <p key={i} className="seo-p">{p}</p>
          ))}
        </div>
      </div>

      {content.sections.map((section, si) => (
        <div key={si} className="seo-page-section">
          <div className="seo-container">
            <h2 className="seo-h2">{section.heading}</h2>
            {section.body.map((p, pi) => (
              <p key={pi} className="seo-p">{p}</p>
            ))}
            {section.faqs && (
              <div className="seo-faq-list" style={{ marginTop: '1.5rem' }}>
                {section.faqs.map((f, fi) => {
                  const idx = si * 100 + fi
                  return (
                    <div key={fi} className="seo-faq-item">
                      <button
                        className="seo-faq-q"
                        aria-expanded={openFaq === idx}
                        onClick={() => setOpenFaq(openFaq === idx ? null : idx)}
                      >
                        <span>{f.q}</span>
                        <span className="seo-faq-icon">{openFaq === idx ? '−' : '+'}</span>
                      </button>
                      <div className={`seo-faq-a ${openFaq === idx ? 'open' : ''}`} role="region" aria-hidden={openFaq !== idx}>
                        <p className="seo-p">{f.a}</p>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      ))}

      <div className="seo-page-locations">
        <div className="seo-container">
          <h2 className="seo-h2">More Lesson Types</h2>
          <div className="seo-link-grid" style={{ justifyContent: 'center' }}>
            {[
              { label: 'Kids Music Lessons', slug: 'kids-music-lessons' },
              { label: 'Adult Music Lessons', slug: 'adult-music-lessons' },
              { label: 'Beginner Music Lessons', slug: 'beginner-music-lessons' },
              { label: 'Private Music Lessons', slug: 'private-music-lessons' },
            ].filter(p => p.slug !== content.slug).map((link, i) => (
              <Link key={i} to={`/${link.slug}`} className="seo-location-link">
                {link.label} →
              </Link>
            ))}
          </div>

          <h2 className="seo-h2" style={{ marginTop: '3rem' }}>Explore by Instrument</h2>
          <div className="seo-link-grid" style={{ justifyContent: 'center' }}>
            {[
              { label: 'Guitar Lessons', loc: 'omaha', slug: 'guitar-lessons' },
              { label: 'Piano Lessons', loc: 'omaha', slug: 'piano-lessons' },
              { label: 'Vocal Lessons', loc: 'omaha', slug: 'vocal-lessons' },
              { label: 'Drum Lessons', loc: 'omaha', slug: 'drum-lessons' },
              { label: 'Violin Lessons', loc: 'omaha', slug: 'violin-lessons' },
              { label: 'Flute Lessons', loc: 'omaha', slug: 'flute-lessons' },
            ].map((link, i) => (
              <Link key={i} to={`/${link.loc}/${link.slug}`} className="seo-location-link">
                {link.label} →
              </Link>
            ))}
          </div>

          <h2 className="seo-h2" style={{ marginTop: '3rem' }}>Find a Studio Near You</h2>
          <div className="seo-link-grid" style={{ justifyContent: 'center' }}>
            {content.locationLinks.map((link, i) => (
              <Link key={i} to={link.href} className="seo-location-link">
                {link.text} →
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
