/**
 * Vite plugin: generate per-location HTML files at build time.
 *
 * After Vite produces dist/index.html, this plugin creates copies
 * with location-specific <title>, <meta>, OG tags, canonical URLs,
 * and JSON-LD structured data for each Adkins Music location +
 * instrument sub-page.
 *
 * Vercel serves static files before applying rewrites, so
 * dist/omaha/index.html is served automatically for /omaha/.
 */

import { type Plugin } from 'vite'
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'fs'
import { join } from 'path'

const TODAY = new Date().toISOString().slice(0, 10)

const BASE_URL = 'https://www.lessonpreneur.io'

interface LocSEO {
  slug: string
  city: string
  state: string
  zip: string
  brandName: string
  streetAddress: string
  phone: string
  email: string
  legacyDomain: string | null
  lat: number
  lng: number
  instruments: string[]
  title: string
  desc: string
}

const LOCATIONS: LocSEO[] = [
  {
    slug: 'omaha',
    city: 'Omaha', state: 'NE', zip: '68127',
    brandName: 'Adkins Music Lessons — Omaha',
    streetAddress: '4862 S 96th St Ste 1',
    phone: '(531) 270-0848',
    email: 'musiclessonsomaha@gmail.com',
    legacyDomain: 'omahaguitarandmusiclessons.com',
    lat: 41.2112, lng: -96.0819,
    instruments: ['Guitar', 'Piano', 'Vocals', 'Drums', 'Bass Guitar', 'Flute', 'Violin', 'Percussion'],
    title: 'Music Lessons in Omaha, NE | Guitar, Piano, Drums, Vocals & More | Adkins Music',
    desc: 'Looking for music lessons in Omaha? Guitar, piano, drums, vocal, flute & violin lessons for all ages. Professional background-checked instructors, flexible scheduling, no commitment. Book a trial lesson today!',
  },
  {
    slug: 'bellevue',
    city: 'Bellevue', state: 'NE', zip: '68005-3647',
    brandName: 'Adkins Music Lessons — Bellevue',
    streetAddress: '1311 Harlan Dr',
    phone: '(402) 960-2808',
    email: 'bellevuemusiclessons@gmail.com',
    legacyDomain: 'musiclessonsbellevue.com',
    lat: 41.1544, lng: -95.9146,
    instruments: ['Guitar', 'Piano', 'Vocals', 'Drums', 'Bass Guitar', 'Violin', 'Percussion'],
    title: 'Music Lessons in Bellevue, NE | Piano, Guitar, Vocals, Drums & More | Adkins Music',
    desc: 'Expert piano, guitar, vocal & drum lessons for all ages in Bellevue, NE. Background-checked instructors, flexible scheduling, no long-term commitment. Sign up today!',
  },
  {
    slug: 'elkhorn',
    city: 'Elkhorn', state: 'NE', zip: '68022-2885',
    brandName: 'Adkins Music Lessons — Elkhorn',
    streetAddress: '1820 N 203rd St',
    phone: '(402) 249-9671',
    email: 'elkhornmusiclessons@gmail.com',
    legacyDomain: 'elkhornlessons.com',
    lat: 41.2869, lng: -96.2353,
    instruments: ['Guitar', 'Piano', 'Vocals', 'Drums', 'Bass Guitar', 'Flute', 'Violin', 'Percussion'],
    title: 'Music Lessons in Elkhorn, NE | Guitar, Piano, Drums, Vocals & More | Adkins Music',
    desc: 'Looking for music lessons in Elkhorn? Guitar, piano, drums, vocals, flute & violin for all ages and skill levels. Professional instructors, flexible scheduling. Enroll today!',
  },
  {
    slug: 'gretna',
    city: 'Gretna', state: 'NE', zip: '68028-4433',
    brandName: 'Adkins Music Lessons — Gretna',
    streetAddress: '20615 Highway 370',
    phone: '(402) 580-9702',
    email: 'gretnamusiclessons@gmail.com',
    legacyDomain: 'gretnamusiclessons.com',
    lat: 41.1408, lng: -96.2392,
    instruments: ['Guitar', 'Piano', 'Vocals', 'Drums', 'Bass Guitar', 'Violin', 'Band Instruments'],
    title: 'Music Lessons in Gretna, NE | Guitar, Piano, Drums, Vocals & More | Adkins Music',
    desc: 'Gretna music lessons for all ages — guitar, piano, drums, vocals, violin & more. Background-checked instructors, cameras in every room, no commitment required. Book your first lesson!',
  },
]

const INSTRUMENT_PAGES = ['guitar', 'piano', 'vocals', 'drums'] as const

// SEO-optimized "-lessons" landing pages (keyword-targeted URLs)
const LESSONS_PAGES: { slug: string; label: string; titlePrefix: string; descTemplate: (city: string) => string }[] = [
  {
    slug: 'guitar-lessons',
    label: 'Guitar',
    titlePrefix: 'Guitar Lessons',
    descTemplate: (city) => `Private guitar lessons in ${city}, NE for all ages. Acoustic, electric, and classical guitar. Background-checked instructors, flexible scheduling, no contracts. Sign up today!`,
  },
  {
    slug: 'piano-lessons',
    label: 'Piano',
    titlePrefix: 'Piano Lessons',
    descTemplate: (city) => `Private piano lessons in ${city}, NE for kids and adults. Classical, pop, jazz, and more. Experienced background-checked instructors, flexible scheduling, no commitment required.`,
  },
  {
    slug: 'drum-lessons',
    label: 'Drum',
    titlePrefix: 'Drum Lessons',
    descTemplate: (city) => `Private drum lessons in ${city}, NE for all ages and skill levels. Rock, jazz, marching, and more. Background-checked instructors, flexible scheduling, no contracts.`,
  },
  {
    slug: 'vocal-lessons',
    label: 'Vocal',
    titlePrefix: 'Vocal Lessons',
    descTemplate: (city) => `Private vocal lessons in ${city}, NE for kids and adults. Build pitch, tone, range, and confidence. Background-checked instructors, flexible scheduling, no long-term commitment.`,
  },
  {
    slug: 'violin-lessons',
    label: 'Violin',
    titlePrefix: 'Violin Lessons',
    descTemplate: (city) => `Private violin lessons in ${city}, NE for kids and adults. Classical, fiddle, and contemporary styles. Expert background-checked instructors, flexible scheduling, no contracts.`,
  },
  {
    slug: 'flute-lessons',
    label: 'Flute',
    titlePrefix: 'Flute Lessons',
    descTemplate: (city) => `Private flute lessons in ${city}, NE for kids and adults. Band support, solo repertoire, audition prep. Background-checked instructors, flexible scheduling, no contracts.`,
  },
  {
    slug: 'bass-guitar-lessons',
    label: 'Bass Guitar',
    titlePrefix: 'Bass Guitar Lessons',
    descTemplate: (city) => `Private bass guitar lessons in ${city}, NE for all ages. Rock, jazz, funk, and more. Experienced background-checked instructors, flexible scheduling, no contracts. Book today!`,
  },
]

function buildJsonLd(loc: LocSEO): string {
  return JSON.stringify({
    '@context': 'https://schema.org',
    '@type': ['LocalBusiness', 'EducationalOrganization'],
    '@id': `${BASE_URL}/${loc.slug}#business`,
    name: loc.brandName,
    alternateName: 'Adkins Music Lessons',
    url: `${BASE_URL}/${loc.slug}`,
    telephone: loc.phone,
    email: loc.email,
    address: {
      '@type': 'PostalAddress',
      streetAddress: loc.streetAddress,
      addressLocality: loc.city,
      addressRegion: loc.state,
      postalCode: loc.zip,
      addressCountry: 'US',
    },
    geo: { '@type': 'GeoCoordinates', latitude: loc.lat, longitude: loc.lng },
    openingHoursSpecification: [
      ...['Monday', 'Tuesday', 'Wednesday', 'Thursday'].map(day => ({
        '@type': 'OpeningHoursSpecification',
        dayOfWeek: `https://schema.org/${day}`,
        opens: '15:00', closes: '21:00',
      })),
      ...['Saturday', 'Sunday'].map(day => ({
        '@type': 'OpeningHoursSpecification',
        dayOfWeek: `https://schema.org/${day}`,
        opens: '10:00', closes: '15:00',
      })),
    ],
    founder: { '@type': 'Person', name: 'Zachary Adkins', description: '2017 National Guitar Competition winner' },
    numberOfEmployees: { '@type': 'QuantitativeValue', value: 30 },
    areaServed: { '@type': 'City', name: loc.city },
    hasOfferCatalog: {
      '@type': 'OfferCatalog',
      name: `Music Lessons in ${loc.city}`,
      itemListElement: loc.instruments.map((inst, i) => ({
        '@type': 'Offer',
        itemOffered: { '@type': 'Service', name: `${inst} Lessons`, description: `Professional ${inst.toLowerCase()} lessons for all ages in ${loc.city}, ${loc.state}.` },
        position: i + 1,
      })),
    },
    priceRange: '$$',
    sameAs: loc.legacyDomain ? [`https://www.${loc.legacyDomain}`] : [],
  })
}

function buildInstrumentJsonLd(loc: LocSEO, instrument: string): string {
  return JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'Service',
    name: `${instrument} Lessons in ${loc.city}, ${loc.state}`,
    provider: {
      '@type': ['LocalBusiness', 'EducationalOrganization'],
      name: loc.brandName,
      url: `${BASE_URL}/${loc.slug}`,
      telephone: loc.phone,
      address: {
        '@type': 'PostalAddress',
        streetAddress: loc.streetAddress,
        addressLocality: loc.city,
        addressRegion: loc.state,
        postalCode: loc.zip,
        addressCountry: 'US',
      },
    },
    areaServed: { '@type': 'City', name: loc.city },
    description: `Professional ${instrument.toLowerCase()} lessons for all ages and skill levels in ${loc.city}, ${loc.state}. Experienced, background-checked instructors with flexible scheduling.`,
    url: `${BASE_URL}/${loc.slug}/${instrument.toLowerCase()}`,
  })
}

function buildFaqJsonLd(loc: LocSEO): string {
  const faqs = [
    {
      q: `Do you teach adults in ${loc.city}?`,
      a: `Absolutely! Many of our ${loc.city} students are adults picking up an instrument for the first time — or getting back into music after years away. According to the National Association of Music Merchants, adult music learners are the fastest-growing segment, up 15% since 2020. Adults often progress faster than kids.`,
    },
    {
      q: 'Do I need my own instrument?',
      a: 'Not necessarily. We can help you find the right instrument for your budget. Some teachers have loaners available for the first few lessons.',
    },
    {
      q: `How much do music lessons cost in ${loc.city}?`,
      a: `Lesson pricing at Adkins Music in ${loc.city} is competitive and transparent. We offer month-to-month billing with no enrollment fees and no long-term contracts. Contact us at ${loc.phone} for current rates.`,
    },
    {
      q: 'What if I need to cancel a lesson?',
      a: 'We offer flexible rescheduling. Just give us advance notice and we will work with you to find another time.',
    },
    {
      q: 'How long are lessons?',
      a: 'Lessons are 30 minutes each. Students who want longer sessions can book back-to-back 30-minute slots for a full hour.',
    },
    {
      q: `Are your ${loc.city} teachers background-checked?`,
      a: `Yes — every single instructor at our ${loc.city} location passes a comprehensive background check before teaching. We also have cameras in every lesson room for added safety. Parent safety is our top priority.`,
    },
  ]
  return JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map(f => ({
      '@type': 'Question',
      name: f.q,
      acceptedAnswer: { '@type': 'Answer', text: f.a },
    })),
  })
}

// ─── Static HTML body content for SSG crawlability ───
// Injected into <div id="root"> so crawlers see real content.
// React replaces this on hydrate — no visual flash.

function buildLocationBody(loc: LocSEO): string {
  // Instrument links with SEO-targeted landing pages
  const instrumentLinks = loc.instruments.map(i => {
    const slug = i.toLowerCase().replace(/ /g, '-')
    const lessonsSlug = `${slug}-lessons`
    // Link to -lessons page if one exists, otherwise instrument page
    const hasLessonsPage = LESSONS_PAGES.some(lp => lp.slug === lessonsSlug)
    const href = hasLessonsPage ? `/${loc.slug}/${lessonsSlug}` : `/${loc.slug}/${slug}`
    return `<li><a href="${href}">${i} Lessons in ${loc.city}</a></li>`
  }).join('\n          ')

  // Cross-links to other locations
  const otherLocations = LOCATIONS.filter(l => l.slug !== loc.slug)
  const locationLinks = otherLocations.map(l =>
    `<li><a href="/${l.slug}">Music Lessons in ${l.city}, ${l.state}</a></li>`
  ).join('\n          ')

  return `
    <div data-ssg="true">
      <header>
        <h1>Music Lessons in ${loc.city}, ${loc.state}</h1>
        <p>Private Guitar, Piano, Drum, Vocal, Flute & Violin Lessons for All Ages — ${loc.brandName}</p>
      </header>
      <main>
        <section>
          <h2>Private Music Lessons in ${loc.city}, ${loc.state}</h2>
          <p>${loc.desc}</p>
          <p>Founded by Zachary Adkins, 2017 National Guitar Competition winner, Adkins Music has grown to serve hundreds of students across the Omaha metro area. Research from the National Association of Music Merchants shows that students who take private lessons are 20% more likely to achieve academic excellence. Our ${loc.city} studio delivers that advantage with one-on-one instruction from professional, background-checked teachers.</p>
          <p>Private one-on-one lessons for kids, teens, and adults. No contracts. Month to month. Expert background-checked teachers who show up — every single time.</p>
        </section>
        <section>
          <h2>Instruments We Teach in ${loc.city}</h2>
          <ul>
          ${instrumentLinks}
          </ul>
        </section>
        <section>
          <h2>Why Families Choose Adkins Music in ${loc.city}</h2>
          <ul>
            <li>Background-checked, professional instructors — 100% of our teachers pass comprehensive screening</li>
            <li>AI-powered teacher-student matching — 95% compatibility rate across personality, schedule, and teaching style</li>
            <li>No long-term contracts — cancel anytime, no penalties</li>
            <li>No enrollment fees — month-to-month billing keeps it simple</li>
            <li>Flexible scheduling — morning, afternoon, evening, and weekend slots available</li>
            <li>Cameras in every room for student safety — peace of mind for parents</li>
            <li>30+ professional instructors across all instruments</li>
          </ul>
        </section>
        <section>
          <h2>How It Works</h2>
          <ol>
            <li><strong>Tell us about your student</strong> — takes 30 seconds. Share goals, schedule preferences, and experience level.</li>
            <li><strong>We find your perfect teacher match</strong> — our AI matching system considers personality, schedule, teaching style, and musical goals.</li>
            <li><strong>Book your first lesson</strong> — most students start within 24 hours of signing up.</li>
          </ol>
        </section>
        <section>
          <h2>Frequently Asked Questions About Music Lessons in ${loc.city}</h2>
          <dl>
            <dt>Do you teach adults in ${loc.city}?</dt>
            <dd>Absolutely! Many of our ${loc.city} students are adults picking up an instrument for the first time — or getting back into music after years away. According to the National Association of Music Merchants, adult music learners are the fastest-growing segment, up 15% since 2020. Adults often progress faster than kids.</dd>
            <dt>Do I need my own instrument?</dt>
            <dd>Not necessarily. We can help you find the right instrument for your budget. Some teachers have loaners available for the first few lessons.</dd>
            <dt>How much do music lessons cost in ${loc.city}?</dt>
            <dd>Lesson pricing at Adkins Music in ${loc.city} is competitive and transparent. We offer month-to-month billing with no enrollment fees and no long-term contracts. Contact us at ${loc.phone} for current rates.</dd>
            <dt>What if I need to cancel a lesson?</dt>
            <dd>We offer flexible rescheduling. Just give us advance notice and we will work with you to find another time.</dd>
            <dt>How long are lessons?</dt>
            <dd>Lessons are 30 minutes each. Students who want longer sessions can book back-to-back 30-minute slots for a full hour.</dd>
            <dt>Are your ${loc.city} teachers background-checked?</dt>
            <dd>Yes — every single instructor at our ${loc.city} location passes a comprehensive background check before teaching. We also have cameras in every lesson room for added safety.</dd>
          </dl>
        </section>
        <section>
          <h2>Visit ${loc.brandName}</h2>
          <address>
            <p>${loc.streetAddress}, ${loc.city}, ${loc.state} ${loc.zip}</p>
            <p>Phone: <a href="tel:${loc.phone.replace(/[^\d+]/g, '')}">${loc.phone}</a></p>
            <p>Email: <a href="mailto:${loc.email}">${loc.email}</a></p>
          </address>
          <p>Hours: Monday–Thursday 3:00 PM – 9:00 PM | Saturday–Sunday 10:00 AM – 3:00 PM</p>
        </section>
        <nav>
          <h2>Other Adkins Music Locations</h2>
          <ul>
          ${locationLinks}
          </ul>
        </nav>
        <section>
          <h2>Sign Up for Music Lessons in ${loc.city}</h2>
          <p>Your first lesson is waiting. Join hundreds of students already learning at Adkins Music in ${loc.city}.</p>
          <a href="/${loc.slug}/signup">Enroll Now</a>
        </section>
      </main>
      <footer>
        <p>&copy; ${new Date().getFullYear()} ${loc.brandName} — By Adkins Music Lessons. Powered by Lessonpreneur.</p>
      </footer>
    </div>`
}

function buildInstrumentBody(loc: LocSEO, instrument: string): string {
  const instrumentLower = instrument.toLowerCase()

  // Other instruments at this location for cross-linking
  const otherInstruments = INSTRUMENT_PAGES
    .filter(i => i !== instrumentLower)
    .map(i => {
      const cap = i.charAt(0).toUpperCase() + i.slice(1)
      return `<li><a href="/${loc.slug}/${i}">${cap} Lessons in ${loc.city}</a></li>`
    }).join('\n            ')

  return `
    <div data-ssg="true">
      <header>
        <h1>${instrument} Lessons in ${loc.city}, ${loc.state}</h1>
        <p>${loc.brandName}</p>
      </header>
      <main>
        <section>
          <h2>Private ${instrument} Lessons for All Ages in ${loc.city}</h2>
          <p>Professional ${instrumentLower} lessons for all ages and skill levels in ${loc.city}, ${loc.state}. Experienced, background-checked instructors with flexible scheduling and no long-term commitments.</p>
          <p>Whether you are a complete beginner or looking to advance your skills, our ${instrumentLower} teachers create personalized lesson plans tailored to your goals and learning style.</p>
        </section>
        <section>
          <h2>What You Will Learn</h2>
          <ul>
            <li>Proper technique and fundamentals</li>
            <li>Music theory and reading</li>
            <li>Songs you actually want to play</li>
            <li>Performance confidence and stage presence</li>
            <li>Practice strategies that accelerate progress</li>
          </ul>
        </section>
        <section>
          <h2>Why Adkins Music for ${instrument} Lessons</h2>
          <ul>
            <li>Background-checked, professional ${instrumentLower} instructors</li>
            <li>AI-powered teacher matching for personality and learning style</li>
            <li>No contracts — month-to-month, cancel anytime</li>
            <li>Flexible scheduling that fits your life</li>
            <li>Cameras in every room for student safety</li>
          </ul>
        </section>
        <section>
          <h2>Visit Us in ${loc.city}</h2>
          <address>
            <p>${loc.streetAddress}, ${loc.city}, ${loc.state} ${loc.zip}</p>
            <p>Phone: <a href="tel:${loc.phone.replace(/[^\d+]/g, '')}">${loc.phone}</a></p>
            <p>Email: <a href="mailto:${loc.email}">${loc.email}</a></p>
          </address>
        </section>
        <nav>
          <h2>More Lessons at ${loc.brandName}</h2>
          <ul>
            <li><a href="/${loc.slug}">All Music Lessons in ${loc.city}</a></li>
            ${otherInstruments}
            <li><a href="/${loc.slug}/more">Flute, Violin & More</a></li>
          </ul>
        </nav>
        <section>
          <h2>Start ${instrument} Lessons Today</h2>
          <p>Your first ${instrumentLower} lesson is waiting. Sign up in 30 seconds — no commitment required.</p>
          <a href="/${loc.slug}/signup">Enroll Now</a>
        </section>
      </main>
      <footer>
        <p>&copy; ${new Date().getFullYear()} ${loc.brandName} — By Adkins Music Lessons. Powered by Lessonpreneur.</p>
      </footer>
    </div>`
}

function buildLessonsBody(loc: LocSEO, label: string, descText: string): string {
  const labelLower = label.toLowerCase()

  // Cross-link to other lesson types at this location
  const otherLessons = LESSONS_PAGES
    .filter(lp => lp.label !== label)
    .slice(0, 4)
    .map(lp => `<li><a href="/${loc.slug}/${lp.slug}">${lp.label} Lessons in ${loc.city}</a></li>`)
    .join('\n            ')

  return `
    <div data-ssg="true">
      <header>
        <h1>${label} Lessons in ${loc.city}, ${loc.state}</h1>
        <p>Private Instruction for All Ages — ${loc.brandName}</p>
      </header>
      <main>
        <section>
          <h2>Private ${label} Lessons in ${loc.city}, ${loc.state}</h2>
          <p>${descText}</p>
        </section>
        <section>
          <h2>Why Students Choose Adkins for ${label} Lessons</h2>
          <ul>
            <li>Expert, background-checked ${labelLower} instructors</li>
            <li>Personalized lesson plans for every skill level</li>
            <li>AI-powered teacher-student matching — 95% compatibility rate</li>
            <li>No contracts — flexible month-to-month billing</li>
            <li>Convenient ${loc.city} location with flexible scheduling</li>
          </ul>
        </section>
        <section>
          <h2>${loc.brandName}</h2>
          <address>
            <p>${loc.streetAddress}, ${loc.city}, ${loc.state} ${loc.zip}</p>
            <p>Phone: <a href="tel:${loc.phone.replace(/[^\d+]/g, '')}">${loc.phone}</a></p>
            <p>Email: <a href="mailto:${loc.email}">${loc.email}</a></p>
          </address>
          <p>Hours: Monday–Thursday 3:00 PM – 9:00 PM | Saturday–Sunday 10:00 AM – 3:00 PM</p>
        </section>
        <nav>
          <h2>More Lessons at ${loc.brandName}</h2>
          <ul>
            <li><a href="/${loc.slug}">All Music Lessons in ${loc.city}</a></li>
            ${otherLessons}
          </ul>
        </nav>
        <section>
          <h2>Start ${label} Lessons in ${loc.city} Today</h2>
          <p>Join hundreds of students learning ${labelLower} at Adkins Music. Sign up in 30 seconds — no commitment required.</p>
          <a href="/${loc.slug}/signup">Enroll Now</a>
        </section>
      </main>
      <footer>
        <p>&copy; ${new Date().getFullYear()} ${loc.brandName} — By Adkins Music Lessons. Powered by Lessonpreneur.</p>
      </footer>
    </div>`
}

function buildSupportingPageBody(sp: {
  slug: string; h1: string; desc: string; audience: string;
  sections: Array<{ heading: string; body: string }>;
  faqs: Array<{ q: string; a: string }>;
}): string {
  const sectionHtml = sp.sections.map(s => `
        <section>
          <h2>${s.heading}</h2>
          <p>${s.body}</p>
        </section>`).join('')

  const faqHtml = sp.faqs.length > 0 ? `
        <section>
          <h2>Frequently Asked Questions</h2>
          <dl>
            ${sp.faqs.map(f => `<dt>${f.q}</dt>\n            <dd>${f.a}</dd>`).join('\n            ')}
          </dl>
        </section>` : ''

  // Cross-links: location-specific instrument pages for this audience
  const locationLinks = LOCATIONS.map(l =>
    `<li><a href="/${l.slug}">Music lessons for ${sp.audience} in ${l.city}</a></li>`
  ).join('\n            ')

  // Cross-links to other supporting pages
  const otherPages = [
    { slug: 'kids-music-lessons', label: 'Kids Music Lessons' },
    { slug: 'adult-music-lessons', label: 'Adult Music Lessons' },
    { slug: 'beginner-music-lessons', label: 'Beginner Music Lessons' },
    { slug: 'private-music-lessons', label: 'Private Music Lessons' },
  ].filter(p => p.slug !== sp.slug)
  const otherPageLinks = otherPages.map(p =>
    `<li><a href="/${p.slug}">${p.label}</a></li>`
  ).join('\n            ')

  // Cross-links to instrument-specific lessons pages
  const instrumentLinks = LESSONS_PAGES.slice(0, 4).map(lp => {
    // Link to Omaha as default, but list all locations
    return `<li><a href="/omaha/${lp.slug}">${lp.label} Lessons</a></li>`
  }).join('\n            ')

  return `
    <div data-ssg="true">
      <header>
        <h1>${sp.h1}</h1>
        <p>${sp.desc}</p>
      </header>
      <main>${sectionHtml}${faqHtml}
        <section>
          <h2>Find a Studio Near You</h2>
          <ul>
            ${locationLinks}
          </ul>
        </section>
        <nav>
          <h2>Explore by Instrument</h2>
          <ul>
            ${instrumentLinks}
          </ul>
          <h2>More Lesson Types</h2>
          <ul>
            ${otherPageLinks}
          </ul>
        </nav>
        <section>
          <h2>Start Your Music Journey Today</h2>
          <p>Join hundreds of students learning at Adkins Music. Sign up in 30 seconds — no commitment required.</p>
          <a href="/omaha/signup">Enroll Now</a>
        </section>
      </main>
      <footer>
        <p>&copy; ${new Date().getFullYear()} Adkins Music Lessons. Powered by Lessonpreneur.</p>
      </footer>
    </div>`
}

function injectBody(html: string, body: string): string {
  return html.replace('<div id="root"></div>', `<div id="root">${body}</div>`)
}

function rewriteHtml(html: string, opts: {
  title: string
  desc: string
  canonical: string
  jsonLd: string
  faqJsonLd?: string
  city: string
  state: string
  lat: number
  lng: number
}): string {
  let result = html

  // Replace title
  result = result.replace(
    /<title>[^<]*<\/title>/,
    `<title>${opts.title}</title>`
  )

  // Replace meta description
  result = result.replace(
    /<meta name="description" content="[^"]*">/,
    `<meta name="description" content="${opts.desc}">`
  )

  // Replace OG tags
  result = result.replace(
    /<meta property="og:title" content="[^"]*">/,
    `<meta property="og:title" content="${opts.title}">`
  )
  result = result.replace(
    /<meta property="og:description" content="[^"]*">/,
    `<meta property="og:description" content="${opts.desc}">`
  )
  result = result.replace(
    /<meta property="og:url" content="[^"]*">/,
    `<meta property="og:url" content="${opts.canonical}">`
  )

  // Replace Twitter tags
  result = result.replace(
    /<meta name="twitter:title" content="[^"]*">/,
    `<meta name="twitter:title" content="${opts.title}">`
  )
  result = result.replace(
    /<meta name="twitter:description" content="[^"]*">/,
    `<meta name="twitter:description" content="${opts.desc}">`
  )

  // Add og:image and twitter:image if not present
  if (!result.includes('og:image')) {
    result = result.replace(
      /<meta property="og:type"/,
      `<meta property="og:image" content="${BASE_URL}/og-image.png">\n    <meta property="og:image:width" content="1200">\n    <meta property="og:image:height" content="630">\n    <meta property="og:type"`
    )
  }
  if (!result.includes('twitter:image')) {
    result = result.replace(
      '</head>',
      `    <meta name="twitter:image" content="${BASE_URL}/og-image.png">\n  </head>`
    )
  }

  // Add og:site_name after og:url
  if (!result.includes('og:site_name')) {
    result = result.replace(
      /<meta property="og:type"/,
      `<meta property="og:site_name" content="Adkins Music Lessons">\n    <meta property="og:type"`
    )
  }

  // Replace existing canonical
  result = result.replace(
    /<link rel="canonical" href="[^"]*" \/>/,
    `<link rel="canonical" href="${opts.canonical}" />`
  )

  // Inject geo meta and JSON-LD before </head>
  const faqScript = opts.faqJsonLd ? `\n    <script type="application/ld+json">${opts.faqJsonLd}</script>` : ''
  const injection = `
    <meta name="geo.region" content="US-${opts.state}">
    <meta name="geo.placename" content="${opts.city}">
    <meta name="geo.position" content="${opts.lat};${opts.lng}">
    <meta name="ICBM" content="${opts.lat}, ${opts.lng}">
    <script type="application/ld+json">${opts.jsonLd}</script>${faqScript}`

  result = result.replace('</head>', `${injection}\n  </head>`)

  return result
}

export default function locationSeoPlugin(): Plugin {
  return {
    name: 'location-seo',
    apply: 'build',
    closeBundle() {
      const distDir = join(process.cwd(), 'dist')
      const indexPath = join(distDir, 'index.html')
      if (!existsSync(indexPath)) {
        console.warn('[location-seo] dist/index.html not found — skipping SSG. Run build again if needed.')
        return
      }
      const baseHtml = readFileSync(indexPath, 'utf-8')

      for (const loc of LOCATIONS) {
        // Location hub page: dist/{slug}/index.html
        const locDir = join(distDir, loc.slug)
        mkdirSync(locDir, { recursive: true })

        const locHtml = injectBody(rewriteHtml(baseHtml, {
          title: loc.title,
          desc: loc.desc,
          canonical: `${BASE_URL}/${loc.slug}`,
          jsonLd: buildJsonLd(loc),
          faqJsonLd: buildFaqJsonLd(loc),
          city: loc.city,
          state: loc.state,
          lat: loc.lat,
          lng: loc.lng,
        }), buildLocationBody(loc))
        writeFileSync(join(locDir, 'index.html'), locHtml)

        // Instrument sub-pages: dist/{slug}/{instrument}/index.html
        for (const instrument of INSTRUMENT_PAGES) {
          const instCap = instrument.charAt(0).toUpperCase() + instrument.slice(1)
          const instDir = join(locDir, instrument)
          mkdirSync(instDir, { recursive: true })

          const instHtml = injectBody(rewriteHtml(baseHtml, {
            title: `${instCap} Lessons in ${loc.city}, ${loc.state} | Adkins Music`,
            desc: `Professional ${instrument} lessons in ${loc.city}, NE for all ages and skill levels. Experienced, background-checked instructors. Flexible scheduling, no commitment. Start learning ${instrument} today!`,
            canonical: `${BASE_URL}/${loc.slug}/${instrument}`,
            jsonLd: buildInstrumentJsonLd(loc, instCap),
            city: loc.city,
            state: loc.state,
            lat: loc.lat,
            lng: loc.lng,
          }), buildInstrumentBody(loc, instCap))
          writeFileSync(join(instDir, 'index.html'), instHtml)
        }

        // "more" sub-page (flute, violin, etc.)
        const moreDir = join(locDir, 'more')
        mkdirSync(moreDir, { recursive: true })
        const moreHtml = injectBody(rewriteHtml(baseHtml, {
          title: `Flute, Violin & More Music Lessons in ${loc.city}, ${loc.state} | Adkins Music`,
          desc: `Flute, violin, bass guitar, and more music lessons in ${loc.city}, NE. All ages and skill levels welcome. Background-checked instructors, flexible scheduling. Enroll today!`,
          canonical: `${BASE_URL}/${loc.slug}/more`,
          jsonLd: buildInstrumentJsonLd(loc, 'Flute, Violin & More'),
          city: loc.city,
          state: loc.state,
          lat: loc.lat,
          lng: loc.lng,
        }), buildInstrumentBody(loc, 'Flute, Violin & More'))
        writeFileSync(join(moreDir, 'index.html'), moreHtml)

        // "-lessons" SEO landing pages: dist/{slug}/{instrument}-lessons/index.html
        for (const lp of LESSONS_PAGES) {
          const lpDir = join(locDir, lp.slug)
          mkdirSync(lpDir, { recursive: true })

          const lpHtml = injectBody(rewriteHtml(baseHtml, {
            title: `${lp.titlePrefix} in ${loc.city}, ${loc.state} | Private Instruction for All Ages — Adkins Music`,
            desc: lp.descTemplate(loc.city),
            canonical: `${BASE_URL}/${loc.slug}/${lp.slug}`,
            jsonLd: buildInstrumentJsonLd(loc, lp.label),
            city: loc.city,
            state: loc.state,
            lat: loc.lat,
            lng: loc.lng,
          }), buildLessonsBody(loc, lp.label, lp.descTemplate(loc.city)))
          writeFileSync(join(lpDir, 'index.html'), lpHtml)
        }
      }

      // ─── Generate static HTML for supporting SEO pages ───
      const supportingPages = [
        {
          slug: 'kids-music-lessons',
          title: 'Kids Music Lessons | Piano, Guitar, Vocals & Drums for Children — Adkins Music Lessons',
          desc: 'Private music lessons for kids in Omaha, Bellevue, Elkhorn, and Gretna. Piano, guitar, vocals, drums, and more. Patient teachers, structured progress, beginner-friendly. All ages.',
          h1: 'Kids Music Lessons',
          audience: 'kids',
          sections: [
            { heading: 'What Kids Learn', body: 'Students start with fundamentals appropriate to their instrument and age — note reading, rhythm, hand positioning or posture, and basic music theory. From there, they progress to playing full songs, building repertoire, and understanding the language of music.' },
            { heading: 'Which Instrument Is Right for Your Child?', body: 'Piano is the most common starting instrument for kids. Guitar is popular with kids drawn to songs they hear on the radio. Drums appeal to active, high-energy kids who respond to rhythm. Vocals work well for expressive children who love to sing.' },
            { heading: 'Why Private Lessons Work for Kids', body: 'In a private lesson, every exercise, every song, and every conversation is about your child. The teacher adjusts tempo, difficulty, and material in real time — something impossible in a group class.' },
          ],
          faqs: [
            { q: 'What age can kids start music lessons?', a: 'We accept students starting at age five for most instruments. For some instruments like piano, kids may start a bit earlier depending on their readiness.' },
            { q: 'How often should kids take music lessons?', a: 'Most children take one lesson per week. Some advancing students move to twice weekly. Your child\'s teacher will recommend the right frequency.' },
            { q: 'Do kids need to practice at home?', a: 'Practice makes a significant difference. Teachers assign manageable goals — usually 15 to 30 minutes per day depending on age.' },
          ],
        },
        {
          slug: 'adult-music-lessons',
          title: 'Adult Music Lessons | Piano, Guitar, Vocals & Drums for Adults — Adkins Music Lessons',
          desc: 'Private music lessons for adults in Omaha, Bellevue, Elkhorn, and Gretna. Learn piano, guitar, vocals, drums at any age. No experience needed. Flexible scheduling, no contracts.',
          h1: 'Adult Music Lessons',
          audience: 'adults',
          sections: [
            { heading: 'Why Adults Make Great Music Students', body: 'Adults have advantages kids don\'t — better focus, stronger motivation, more life experience for musical expression, and a clearer sense of goals. Our instructors design practice routines that fit your life.' },
            { heading: 'Popular Instruments for Adult Learners', body: 'Piano provides immediate satisfaction — play chords and simple songs quickly while building deep music theory. Guitar lets you play popular songs and explore songwriting. Vocals and drums appeal to adults seeking creative expression.' },
            { heading: 'What to Expect as an Adult Beginner', body: 'Your first lesson establishes where you are and where you want to go. Within the first month, adult students are typically playing simple songs. Within three months, most are working on pieces they\'re genuinely proud of.' },
          ],
          faqs: [
            { q: 'Is it too late to learn an instrument as an adult?', a: 'No. We teach adults at every age, including beginners in their 50s, 60s, and beyond. Adults often progress efficiently because of their focus and motivation.' },
            { q: 'How much time do I need to practice?', a: 'Even 20 minutes a day makes a meaningful difference. Consistency matters more than duration. Your teacher will give realistic practice goals based on your schedule.' },
            { q: 'Will I feel out of place as an adult student?', a: 'Not at all. Adults make up a significant portion of our student body across all four locations.' },
          ],
        },
        {
          slug: 'beginner-music-lessons',
          title: 'Beginner Music Lessons | Start From Zero — Adkins Music Lessons',
          desc: 'Beginner-friendly private music lessons in Omaha, Bellevue, Elkhorn, and Gretna. Piano, guitar, vocals, drums. No experience needed. Start playing real music from day one.',
          h1: 'Beginner Music Lessons',
          audience: 'beginners',
          sections: [
            { heading: 'Your First Lesson', body: 'Your teacher introduces the instrument, shows you how to hold it properly, and walks you through your first sounds. By the end of 30 minutes, every beginner has played something recognizable.' },
            { heading: 'How Beginners Progress', body: 'In the first month, students learn fundamentals — note reading, basic rhythm, proper technique, and their first several songs. By month six, most beginners are playing full pieces with confidence.' },
            { heading: 'Best Instruments for Beginners', body: 'Piano gives the clearest visual representation of music. Guitar lets beginners play recognizable songs early. Vocals require no equipment purchase. Drums develop rhythm and provide a high-energy outlet.' },
          ],
          faqs: [
            { q: 'Do I need any musical experience to start?', a: 'None at all. Most of our students begin with zero experience. Our teachers build every lesson plan from the ground up.' },
            { q: 'How long does it take to learn an instrument?', a: 'You\'ll play your first songs within weeks. Solid intermediate skills typically take six months to a year of consistent lessons and practice.' },
            { q: 'What if I\'m not naturally talented?', a: 'Talent is overrated. The students who progress fastest are the ones who show up consistently and practice regularly.' },
          ],
        },
        {
          slug: 'private-music-lessons',
          title: 'Private Music Lessons | One-on-One Instruction — Adkins Music Lessons',
          desc: 'Private, one-on-one music lessons in Omaha, Bellevue, Elkhorn, and Gretna. Piano, guitar, vocals, drums. Personalized instruction for all ages.',
          h1: 'Private Music Lessons',
          audience: 'all students',
          sections: [
            { heading: 'How Private Lessons Work', body: 'Each session is 30 or 60 minutes at one of our four studio locations. Your teacher prepares specifically for your lesson — reviewing progress, selecting new material, and planning exercises for exactly where you are.' },
            { heading: 'Private Lessons vs. Group Classes', body: 'In a private lesson, everything adapts to you. Your teacher can change the plan mid-lesson, spend an entire session on one concept, or move quickly through material you\'ve grasped. That flexibility is why private students progress faster.' },
            { heading: 'Who Benefits from Private Instruction', body: 'Complete beginners who need patient guidance. Advanced students with specific challenges. Kids who are distracted in groups. Adults with limited time. Teens preparing for auditions. Students with learning differences.' },
          ],
          faqs: [
            { q: 'What instruments do you offer private lessons in?', a: 'Piano, guitar, vocals, drums, violin, bass guitar, flute, and other band instruments. All lessons are private and one-on-one.' },
            { q: 'Do you require contracts?', a: 'No. Enrollment is month-to-month at all four locations. No semester commitments, no registration fees, no cancellation penalties.' },
            { q: 'How are students matched with teachers?', a: 'We match based on goals, learning style, personality, and scheduling. The right pairing is one of the most important factors in long-term success.' },
          ],
        },
      ]
      for (const sp of supportingPages) {
        const spDir = join(distDir, sp.slug)
        mkdirSync(spDir, { recursive: true })

        // Build FAQPage JSON-LD for supporting pages
        const faqJsonLd = sp.faqs.length > 0 ? JSON.stringify({
          '@context': 'https://schema.org',
          '@type': 'FAQPage',
          mainEntity: sp.faqs.map(f => ({
            '@type': 'Question',
            name: f.q,
            acceptedAnswer: { '@type': 'Answer', text: f.a },
          })),
        }) : undefined

        const spHtml = injectBody(rewriteHtml(baseHtml, {
          title: sp.title,
          desc: sp.desc,
          canonical: `${BASE_URL}/${sp.slug}`,
          jsonLd: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'EducationalOrganization',
            name: 'Adkins Music Lessons',
            description: sp.desc,
            url: `${BASE_URL}/${sp.slug}`,
            numberOfLocations: 4,
            areaServed: LOCATIONS.map(l => ({ '@type': 'City', name: l.city })),
          }),
          faqJsonLd,
          city: 'Omaha', state: 'NE', lat: 41.2168, lng: -96.0262,
        }), buildSupportingPageBody(sp))
        writeFileSync(join(spDir, 'index.html'), spHtml)
      }

      // ─── Auto-generate sitemap.xml with all pages ───
      const sitemapUrls: { loc: string; priority: string; changefreq: string }[] = [
        { loc: `${BASE_URL}/`, priority: '1.0', changefreq: 'weekly' },
      ]

      for (const loc of LOCATIONS) {
        // Location hub
        sitemapUrls.push({ loc: `${BASE_URL}/${loc.slug}`, priority: '0.9', changefreq: 'weekly' })
        // Instrument pages
        for (const instrument of INSTRUMENT_PAGES) {
          sitemapUrls.push({ loc: `${BASE_URL}/${loc.slug}/${instrument}`, priority: '0.8', changefreq: 'monthly' })
        }
        // More page
        sitemapUrls.push({ loc: `${BASE_URL}/${loc.slug}/more`, priority: '0.7', changefreq: 'monthly' })
        // -lessons landing pages
        for (const lp of LESSONS_PAGES) {
          sitemapUrls.push({ loc: `${BASE_URL}/${loc.slug}/${lp.slug}`, priority: '0.8', changefreq: 'monthly' })
        }
        // Signup page
        sitemapUrls.push({ loc: `${BASE_URL}/${loc.slug}/signup`, priority: '0.6', changefreq: 'monthly' })
      }

      // Supporting SEO pages
      for (const sp of supportingPages) {
        sitemapUrls.push({ loc: `${BASE_URL}/${sp.slug}`, priority: '0.7', changefreq: 'monthly' })
      }

      const sitemapXml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${sitemapUrls.map(u => `  <url>
    <loc>${u.loc}</loc>
    <lastmod>${TODAY}</lastmod>
    <changefreq>${u.changefreq}</changefreq>
    <priority>${u.priority}</priority>
  </url>`).join('\n')}
</urlset>`
      writeFileSync(join(distDir, 'sitemap.xml'), sitemapXml)

      // ─── Auto-generate robots.txt ───
      const robotsTxt = `User-agent: *
Allow: /

# AI Search Engine Bots
User-agent: GPTBot
Allow: /

User-agent: ChatGPT-User
Allow: /

User-agent: PerplexityBot
Allow: /

User-agent: ClaudeBot
Allow: /

User-agent: anthropic-ai
Allow: /

Sitemap: ${BASE_URL}/sitemap.xml
`
      writeFileSync(join(distDir, 'robots.txt'), robotsTxt)

      const totalInstrument = LOCATIONS.length * (INSTRUMENT_PAGES.length + 1)
      const totalLessons = LOCATIONS.length * LESSONS_PAGES.length
      const totalSitemap = sitemapUrls.length
      console.log(`[location-seo] Generated ${LOCATIONS.length} location pages + ${totalInstrument} instrument pages + ${totalLessons} lessons pages`)
      console.log(`[location-seo] Sitemap: ${totalSitemap} URLs | robots.txt updated`)
    },
  }
}
