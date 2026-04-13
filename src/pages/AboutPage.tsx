import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import SiteHeader from '../components/site/SiteHeader'
import { ZW } from '../config/zwBrand'
import '../components/seo/seo-sections.css'

const LOCATIONS = [
  { slug: 'omaha', name: 'Omaha', address: '4862 S 96th St Ste 1, Omaha, NE 68127', phone: '(531) 270-0848' },
  { slug: 'bellevue', name: 'Bellevue', address: '1311 Harlan Dr, Bellevue, NE 68005', phone: '(402) 960-2808' },
  { slug: 'elkhorn', name: 'Elkhorn', address: '1820 N 203rd St, Elkhorn, NE 68022', phone: '(402) 249-9671' },
  { slug: 'gretna', name: 'Gretna', address: '20615 Highway 370, Gretna, NE 68028', phone: '(402) 580-9702' },
]

export default function AboutPage() {
  useEffect(() => {
    document.title = 'About Adkins Music Lessons | Founded by Zachary Adkins — Omaha Metro'
    const setMeta = (attr: string, key: string, val: string) => {
      let el = document.querySelector(`meta[${attr}="${key}"]`) as HTMLMetaElement | null
      if (!el) { el = document.createElement('meta'); el.setAttribute(attr, key); document.head.appendChild(el) }
      el.setAttribute('content', val)
    }
    setMeta('name', 'description', 'Adkins Music Lessons was founded by Zachary Adkins, 2017 National Guitar Competition winner. Four locations across the Omaha metro — Omaha, Bellevue, Elkhorn, and Gretna. 30+ professional instructors, 400+ students, $1M+ annual revenue.')
    setMeta('property', 'og:title', 'About Adkins Music Lessons')
    setMeta('property', 'og:description', 'Founded by 2017 National Guitar Competition winner Zachary Adkins. Four locations, 30+ instructors, 400+ students across the Omaha metro.')
    setMeta('property', 'og:url', 'https://www.adkinsmusiclessons.com/about')

    let canonical = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null
    if (!canonical) { canonical = document.createElement('link'); canonical.setAttribute('rel', 'canonical'); document.head.appendChild(canonical) }
    canonical.setAttribute('href', 'https://www.adkinsmusiclessons.com/about')

    // Organization JSON-LD
    const id = 'ld-json-about'
    let script = document.getElementById(id) as HTMLScriptElement | null
    if (!script) { script = document.createElement('script'); script.id = id; script.type = 'application/ld+json'; document.head.appendChild(script) }
    script.textContent = JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'Organization',
      name: 'Adkins Music Lessons',
      alternateName: 'Adkins Enterprises LLC',
      url: 'https://www.adkinsmusiclessons.com',
      founder: {
        '@type': 'Person',
        name: 'Zachary Adkins',
        description: '2017 National Guitar Competition winner, music school owner operating four locations across the Omaha metro area.',
        jobTitle: 'Founder & Owner',
      },
      numberOfEmployees: { '@type': 'QuantitativeValue', minValue: 30 },
      areaServed: [
        { '@type': 'City', name: 'Omaha', containedInPlace: { '@type': 'State', name: 'Nebraska' } },
        { '@type': 'City', name: 'Bellevue', containedInPlace: { '@type': 'State', name: 'Nebraska' } },
        { '@type': 'City', name: 'Elkhorn', containedInPlace: { '@type': 'State', name: 'Nebraska' } },
        { '@type': 'City', name: 'Gretna', containedInPlace: { '@type': 'State', name: 'Nebraska' } },
      ],
      knowsAbout: ['Music Education', 'Private Music Lessons', 'Guitar Instruction', 'Piano Instruction', 'Vocal Training', 'Drum Lessons'],
    })

    return () => {
      document.title = ZW.parent
      script?.remove()
    }
  }, [])

  return (
    <div className="seo-page" id="main-content">
      <SiteHeader />

      <nav aria-label="Breadcrumb" className="seo-breadcrumb">
        <ol>
          <li><Link to="/">Home</Link></li>
          <li aria-current="page">About</li>
        </ol>
      </nav>

      <div className="seo-page-hero">
        <h1 className="seo-h1">About Adkins Music Lessons</h1>
      </div>

      <div className="seo-page-intro">
        <div className="seo-container">
          <p className="seo-p">Adkins Music Lessons was founded by Zachary Adkins, the 2017 National Guitar Competition winner, with one goal: build the kind of music school he wished existed when he was learning. Not a franchise model. Not a one-size-fits-all curriculum. A school where every student gets a real teacher, a personalized plan, and an experience that makes them want to come back every week.</p>
          <p className="seo-p">What started as a single teaching room in Omaha has grown into four studios across the Omaha metropolitan area — Omaha, Bellevue, Elkhorn, and Gretna — with over 30 professional, background-checked instructors serving more than 400 active students.</p>
        </div>
      </div>

      <div className="seo-page-section">
        <div className="seo-container">
          <h2 className="seo-h2">Why Zach Built This</h2>
          <p className="seo-p">Most music schools make students fit their system. Zach saw the opposite approach work better — build the system around the student. That means matching students to the right teacher based on personality, learning style, and goals. It means no long-term contracts, no enrollment fees, and no pressure. It means cameras in every room so parents feel safe, and a tech platform that keeps everyone connected.</p>
          <p className="seo-p">Zach still teaches. He still manages operations. He built the technology that runs the school from scratch — because no existing tool did what a real music school owner needed it to do.</p>
        </div>
      </div>

      <div className="seo-page-section">
        <div className="seo-container">
          <h2 className="seo-h2">What Makes Us Different</h2>
          <div className="seo-grid">
            <div className="seo-card">
              <h3 className="seo-h3">AI-Powered Teacher Matching</h3>
              <p className="seo-p">We don't just assign the next available teacher. Our matching system considers personality, learning style, schedule, musical goals, and teaching specialization. The result: a 95% compatibility rate and students who stick around.</p>
            </div>
            <div className="seo-card">
              <h3 className="seo-h3">Background-Checked Instructors</h3>
              <p className="seo-p">Every instructor passes a comprehensive background check before teaching a single lesson. Cameras in every lesson room provide additional safety and transparency for parents.</p>
            </div>
            <div className="seo-card">
              <h3 className="seo-h3">No Contracts, No Fees</h3>
              <p className="seo-p">Month-to-month enrollment at every location. No registration fees, no semester commitments, no cancellation penalties. If it's not working, you can stop anytime.</p>
            </div>
            <div className="seo-card">
              <h3 className="seo-h3">Four Convenient Locations</h3>
              <p className="seo-p">Studios in Omaha, Bellevue, Elkhorn, and Gretna — covering the entire metro area. Flexible scheduling including evenings and weekends at every location.</p>
            </div>
          </div>
        </div>
      </div>

      <div className="seo-page-section">
        <div className="seo-container">
          <h2 className="seo-h2">By the Numbers</h2>
          <div className="seo-grid">
            <div className="seo-card" style={{ textAlign: 'center' }}>
              <p className="seo-h2" style={{ marginBottom: '0.25rem', color: '#D4226A' }}>4</p>
              <p className="seo-p">Studio Locations</p>
            </div>
            <div className="seo-card" style={{ textAlign: 'center' }}>
              <p className="seo-h2" style={{ marginBottom: '0.25rem', color: '#FF5500' }}>30+</p>
              <p className="seo-p">Professional Instructors</p>
            </div>
            <div className="seo-card" style={{ textAlign: 'center' }}>
              <p className="seo-h2" style={{ marginBottom: '0.25rem', color: '#FFB800' }}>400+</p>
              <p className="seo-p">Active Students</p>
            </div>
            <div className="seo-card" style={{ textAlign: 'center' }}>
              <p className="seo-h2" style={{ marginBottom: '0.25rem', color: '#D4226A' }}>8+</p>
              <p className="seo-p">Instruments Offered</p>
            </div>
          </div>
        </div>
      </div>

      <div className="seo-page-locations">
        <div className="seo-container">
          <h2 className="seo-h2">Our Locations</h2>
          <div className="seo-grid">
            {LOCATIONS.map(loc => (
              <Link key={loc.slug} to={`/${loc.slug}`} className="seo-card" style={{ textDecoration: 'none' }}>
                <h3 className="seo-h3">{loc.name}</h3>
                <p className="seo-p" style={{ fontSize: '0.9rem' }}>{loc.address}</p>
                <p className="seo-p" style={{ fontSize: '0.9rem' }}>{loc.phone}</p>
              </Link>
            ))}
          </div>
        </div>
      </div>

      <footer className="seo-footer">
        <div className="seo-container">
          <p>&copy; {new Date().getFullYear()} Adkins Music Lessons. Music schools powered by <Link to="/">{ZW.parent}</Link>.</p>
        </div>
      </footer>
    </div>
  )
}
