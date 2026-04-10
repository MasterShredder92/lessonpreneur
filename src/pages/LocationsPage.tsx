import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import SiteHeader from '../components/site/SiteHeader'
import '../components/seo/seo-sections.css'

const LOCATIONS = [
  {
    slug: 'omaha',
    name: 'Omaha',
    address: '4862 S 96th St Ste 1, Omaha, NE 68127',
    phone: '(531) 270-0848',
    email: 'musiclessonsomaha@gmail.com',
    hours: 'Mon–Thu 3–9 PM | Sat–Sun 10 AM–3 PM',
    instruments: ['Guitar', 'Piano', 'Vocals', 'Drums', 'Bass Guitar', 'Flute', 'Violin', 'Percussion'],
    color: '#D41113',
  },
  {
    slug: 'bellevue',
    name: 'Bellevue',
    address: '1311 Harlan Dr, Bellevue, NE 68005',
    phone: '(402) 960-2808',
    email: 'bellevuemusiclessons@gmail.com',
    hours: 'Mon–Thu 3–9 PM | Sat–Sun 10 AM–3 PM',
    instruments: ['Guitar', 'Piano', 'Vocals', 'Drums', 'Bass Guitar', 'Violin', 'Percussion'],
    color: '#A333FF',
  },
  {
    slug: 'elkhorn',
    name: 'Elkhorn',
    address: '1820 N 203rd St, Elkhorn, NE 68022',
    phone: '(402) 249-9671',
    email: 'elkhornmusiclessons@gmail.com',
    hours: 'Mon–Thu 3–9 PM | Sat–Sun 10 AM–3 PM',
    instruments: ['Guitar', 'Piano', 'Vocals', 'Drums', 'Bass Guitar', 'Flute', 'Violin', 'Percussion'],
    color: '#00A5E8',
  },
  {
    slug: 'gretna',
    name: 'Gretna',
    address: '20615 Highway 370, Gretna, NE 68028',
    phone: '(402) 580-9702',
    email: 'gretnamusiclessons@gmail.com',
    hours: 'Mon–Thu 3–9 PM | Sat–Sun 10 AM–3 PM',
    instruments: ['Guitar', 'Piano', 'Vocals', 'Drums', 'Bass Guitar', 'Violin', 'Band Instruments'],
    color: '#00A651',
  },
]

export default function LocationsPage() {
  useEffect(() => {
    document.title = 'Locations | Music Lessons in Omaha, Bellevue, Elkhorn & Gretna — Adkins Music'
    const setMeta = (attr: string, key: string, val: string) => {
      let el = document.querySelector(`meta[${attr}="${key}"]`) as HTMLMetaElement | null
      if (!el) { el = document.createElement('meta'); el.setAttribute(attr, key); document.head.appendChild(el) }
      el.setAttribute('content', val)
    }
    setMeta('name', 'description', 'Adkins Music Lessons has four studio locations across the Omaha metro area: Omaha, Bellevue, Elkhorn, and Gretna. Private music lessons for all ages — guitar, piano, vocals, drums, and more.')
    setMeta('property', 'og:title', 'Locations | Adkins Music Lessons')
    setMeta('property', 'og:description', 'Four studio locations across the Omaha metro area. Private music lessons for all ages.')
    setMeta('property', 'og:url', 'https://www.adkinsmusiclessons.com/locations')

    let canonical = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null
    if (!canonical) { canonical = document.createElement('link'); canonical.setAttribute('rel', 'canonical'); document.head.appendChild(canonical) }
    canonical.setAttribute('href', 'https://www.adkinsmusiclessons.com/locations')

    // EducationalOrganization JSON-LD with all locations
    const id = 'ld-json-locations'
    let script = document.getElementById(id) as HTMLScriptElement | null
    if (!script) { script = document.createElement('script'); script.id = id; script.type = 'application/ld+json'; document.head.appendChild(script) }
    script.textContent = JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'EducationalOrganization',
      name: 'Adkins Music Lessons',
      url: 'https://www.adkinsmusiclessons.com',
      numberOfLocations: 4,
      location: LOCATIONS.map(loc => ({
        '@type': 'Place',
        name: `Adkins Music Lessons — ${loc.name}`,
        address: {
          '@type': 'PostalAddress',
          streetAddress: loc.address.split(',')[0],
          addressLocality: loc.name,
          addressRegion: 'NE',
          addressCountry: 'US',
        },
        telephone: loc.phone,
        url: `https://www.adkinsmusiclessons.com/${loc.slug}`,
      })),
      areaServed: LOCATIONS.map(loc => ({ '@type': 'City', name: loc.name })),
    })

    return () => {
      document.title = 'Lessonpreneur'
      script?.remove()
    }
  }, [])

  return (
    <div className="seo-page" id="main-content">
      <SiteHeader />

      <nav aria-label="Breadcrumb" className="seo-breadcrumb">
        <ol>
          <li><Link to="/">Home</Link></li>
          <li aria-current="page">Locations</li>
        </ol>
      </nav>

      <div className="seo-page-hero">
        <h1 className="seo-h1">Our Locations</h1>
      </div>

      <div className="seo-page-intro">
        <div className="seo-container">
          <p className="seo-p">Adkins Music Lessons operates four studios across the Omaha metropolitan area. Every location offers the same quality of instruction — private, one-on-one lessons with professional, background-checked teachers. No contracts, no enrollment fees, flexible scheduling.</p>
          <p className="seo-p">Choose the studio closest to you, or try lessons at multiple locations. All four studios teach guitar, piano, vocals, drums, and additional instruments.</p>
        </div>
      </div>

      {LOCATIONS.map(loc => (
        <div key={loc.slug} className="seo-page-section">
          <div className="seo-container">
            <h2 className="seo-h2" style={{ borderLeft: `4px solid ${loc.color}`, paddingLeft: '1rem' }}>
              <Link to={`/${loc.slug}`} style={{ color: '#fff', textDecoration: 'none' }}>
                Music Lessons in {loc.name}
              </Link>
            </h2>
            <div style={{ display: 'grid', gap: '1rem', gridTemplateColumns: '1fr 1fr', marginBottom: '1.5rem' }}>
              <div>
                <p className="seo-p" style={{ marginBottom: '0.25rem' }}><strong style={{ color: '#fff' }}>Address:</strong> {loc.address}</p>
                <p className="seo-p" style={{ marginBottom: '0.25rem' }}><strong style={{ color: '#fff' }}>Phone:</strong> <a href={`tel:${loc.phone.replace(/[^\d+]/g, '')}`} style={{ color: loc.color }}>{loc.phone}</a></p>
                <p className="seo-p" style={{ marginBottom: '0.25rem' }}><strong style={{ color: '#fff' }}>Email:</strong> <a href={`mailto:${loc.email}`} style={{ color: loc.color }}>{loc.email}</a></p>
                <p className="seo-p"><strong style={{ color: '#fff' }}>Hours:</strong> {loc.hours}</p>
              </div>
              <div>
                <p className="seo-p" style={{ marginBottom: '0.5rem' }}><strong style={{ color: '#fff' }}>Instruments:</strong></p>
                <div className="seo-link-grid">
                  {loc.instruments.map(inst => (
                    <Link
                      key={inst}
                      to={`/${loc.slug}/${inst.toLowerCase().replace(/ /g, '-')}-lessons`}
                      className="seo-location-link"
                      style={{ fontSize: '0.85rem', padding: '0.4rem 0.9rem' }}
                    >
                      {inst}
                    </Link>
                  ))}
                </div>
              </div>
            </div>
            <Link to={`/${loc.slug}`} className="seo-link" style={{ color: loc.color }}>
              View {loc.name} studio details →
            </Link>
          </div>
        </div>
      ))}

      <div className="seo-page-locations">
        <div className="seo-container">
          <h2 className="seo-h2">Explore by Lesson Type</h2>
          <div className="seo-link-grid" style={{ justifyContent: 'center' }}>
            <Link to="/kids-music-lessons" className="seo-location-link">Kids Music Lessons →</Link>
            <Link to="/adult-music-lessons" className="seo-location-link">Adult Music Lessons →</Link>
            <Link to="/beginner-music-lessons" className="seo-location-link">Beginner Music Lessons →</Link>
            <Link to="/private-music-lessons" className="seo-location-link">Private Music Lessons →</Link>
          </div>
        </div>
      </div>

      <footer className="seo-footer">
        <div className="seo-container">
          <p>&copy; {new Date().getFullYear()} Adkins Music Lessons. Powered by <Link to="/">Lessonpreneur</Link>.</p>
        </div>
      </footer>
    </div>
  )
}
