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
import { mkdirSync, writeFileSync, readFileSync } from 'fs'
import { join } from 'path'

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
]

function buildJsonLd(loc: LocSEO): string {
  return JSON.stringify({
    '@context': 'https://schema.org',
    '@type': ['LocalBusiness', 'MusicSchool'],
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
      '@type': ['LocalBusiness', 'MusicSchool'],
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

// ─── Static HTML body content for SSG crawlability ───
// Injected into <div id="root"> so crawlers see real content.
// React replaces this on hydrate — no visual flash.

function buildLocationBody(loc: LocSEO): string {
  const instrumentList = loc.instruments.map(i => `<li>${i} Lessons</li>`).join('\n          ')
  return `
    <div data-ssg="true">
      <header>
        <h1>${loc.brandName}</h1>
        <p>${loc.title}</p>
      </header>
      <main>
        <section>
          <h2>Private Music Lessons in ${loc.city}, ${loc.state}</h2>
          <p>${loc.desc}</p>
          <p>Private one-on-one lessons for kids, teens, and adults. No contracts. Month to month. Expert background-checked teachers who show up — every single time.</p>
        </section>
        <section>
          <h2>Instruments We Teach in ${loc.city}</h2>
          <ul>
          ${instrumentList}
          </ul>
        </section>
        <section>
          <h2>Why Families Choose Adkins Music in ${loc.city}</h2>
          <ul>
            <li>Background-checked, professional instructors</li>
            <li>AI-powered teacher-student matching — 95% compatibility</li>
            <li>No long-term contracts — cancel anytime</li>
            <li>No enrollment fees — month-to-month billing</li>
            <li>Flexible scheduling — fits your busy life</li>
            <li>Cameras in every room for student safety</li>
          </ul>
        </section>
        <section>
          <h2>How It Works</h2>
          <ol>
            <li><strong>Tell us about your student</strong> — takes 30 seconds</li>
            <li><strong>We find your perfect teacher match</strong> — personality, schedule, teaching style</li>
            <li><strong>Book your first lesson</strong> — within 24 hours</li>
          </ol>
        </section>
        <section>
          <h2>Frequently Asked Questions</h2>
          <dl>
            <dt>Do you teach adults?</dt>
            <dd>Absolutely! Many of our students are adults picking up an instrument for the first time — or getting back into music after years away. Adults often progress faster than kids.</dd>
            <dt>Do I need my own instrument?</dt>
            <dd>Not necessarily. We can help you find the right instrument for your budget. Some teachers have loaners available for the first few lessons.</dd>
            <dt>What if I need to cancel a lesson?</dt>
            <dd>We offer flexible rescheduling. Just give us advance notice and we will work with you to find another time.</dd>
            <dt>How long are lessons?</dt>
            <dd>Lessons are 30 minutes each. Students who want longer sessions can book back-to-back 30-minute slots for a full hour.</dd>
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
        <section>
          <h2>Sign Up for Music Lessons in ${loc.city}</h2>
          <p>Your first lesson is waiting. Join hundreds of students already learning at Adkins Music in ${loc.city}.</p>
          <a href="/${loc.slug}/signup">Enroll Now</a>
        </section>
      </main>
      <footer>
        <p>© ${new Date().getFullYear()} ${loc.brandName} — By Adkins Music Lessons. Powered by Lessonpreneur.</p>
      </footer>
    </div>`
}

function buildInstrumentBody(loc: LocSEO, instrument: string): string {
  const instrumentLower = instrument.toLowerCase()
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
        <section>
          <h2>Start ${instrument} Lessons Today</h2>
          <p>Your first ${instrumentLower} lesson is waiting. Sign up in 30 seconds — no commitment required.</p>
          <a href="/${loc.slug}/signup">Enroll Now</a>
        </section>
      </main>
      <footer>
        <p>© ${new Date().getFullYear()} ${loc.brandName} — By Adkins Music Lessons. Powered by Lessonpreneur.</p>
      </footer>
    </div>`
}

function buildLessonsBody(loc: LocSEO, label: string, descText: string): string {
  const labelLower = label.toLowerCase()
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
            <li>AI-powered teacher-student matching</li>
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
        <section>
          <h2>Start ${label} Lessons in ${loc.city} Today</h2>
          <p>Join hundreds of students learning ${labelLower} at Adkins Music. Sign up in 30 seconds — no commitment required.</p>
          <a href="/${loc.slug}/signup">Enroll Now</a>
        </section>
      </main>
      <footer>
        <p>© ${new Date().getFullYear()} ${loc.brandName} — By Adkins Music Lessons. Powered by Lessonpreneur.</p>
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

  // Inject canonical, geo meta, and JSON-LD before </head>
  const injection = `
    <link rel="canonical" href="${opts.canonical}">
    <meta name="geo.region" content="US-${opts.state}">
    <meta name="geo.placename" content="${opts.city}">
    <meta name="geo.position" content="${opts.lat};${opts.lng}">
    <meta name="ICBM" content="${opts.lat}, ${opts.lng}">
    <script type="application/ld+json">${opts.jsonLd}</script>`

  result = result.replace('</head>', `${injection}\n  </head>`)

  return result
}

export default function locationSeoPlugin(): Plugin {
  return {
    name: 'location-seo',
    apply: 'build',
    closeBundle() {
      const distDir = join(process.cwd(), 'dist')
      const baseHtml = readFileSync(join(distDir, 'index.html'), 'utf-8')

      for (const loc of LOCATIONS) {
        // Location hub page: dist/{slug}/index.html
        const locDir = join(distDir, loc.slug)
        mkdirSync(locDir, { recursive: true })

        const locHtml = injectBody(rewriteHtml(baseHtml, {
          title: loc.title,
          desc: loc.desc,
          canonical: `${BASE_URL}/${loc.slug}`,
          jsonLd: buildJsonLd(loc),
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

      const totalInstrument = LOCATIONS.length * (INSTRUMENT_PAGES.length + 1)
      const totalLessons = LOCATIONS.length * LESSONS_PAGES.length
      console.log(`[location-seo] Generated ${LOCATIONS.length} location pages + ${totalInstrument} instrument pages + ${totalLessons} lessons pages`)
    },
  }
}
