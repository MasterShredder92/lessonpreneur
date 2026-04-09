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

        const locHtml = rewriteHtml(baseHtml, {
          title: loc.title,
          desc: loc.desc,
          canonical: `${BASE_URL}/${loc.slug}`,
          jsonLd: buildJsonLd(loc),
          city: loc.city,
          state: loc.state,
          lat: loc.lat,
          lng: loc.lng,
        })
        writeFileSync(join(locDir, 'index.html'), locHtml)

        // Instrument sub-pages: dist/{slug}/{instrument}/index.html
        for (const instrument of INSTRUMENT_PAGES) {
          const instCap = instrument.charAt(0).toUpperCase() + instrument.slice(1)
          const instDir = join(locDir, instrument)
          mkdirSync(instDir, { recursive: true })

          const instHtml = rewriteHtml(baseHtml, {
            title: `${instCap} Lessons in ${loc.city}, ${loc.state} | Adkins Music`,
            desc: `Professional ${instrument} lessons in ${loc.city}, NE for all ages and skill levels. Experienced, background-checked instructors. Flexible scheduling, no commitment. Start learning ${instrument} today!`,
            canonical: `${BASE_URL}/${loc.slug}/${instrument}`,
            jsonLd: buildInstrumentJsonLd(loc, instCap),
            city: loc.city,
            state: loc.state,
            lat: loc.lat,
            lng: loc.lng,
          })
          writeFileSync(join(instDir, 'index.html'), instHtml)
        }

        // "more" sub-page (flute, violin, etc.)
        const moreDir = join(locDir, 'more')
        mkdirSync(moreDir, { recursive: true })
        const moreHtml = rewriteHtml(baseHtml, {
          title: `Flute, Violin & More Music Lessons in ${loc.city}, ${loc.state} | Adkins Music`,
          desc: `Flute, violin, bass guitar, and more music lessons in ${loc.city}, NE. All ages and skill levels welcome. Background-checked instructors, flexible scheduling. Enroll today!`,
          canonical: `${BASE_URL}/${loc.slug}/more`,
          jsonLd: buildInstrumentJsonLd(loc, 'Flute, Violin & More'),
          city: loc.city,
          state: loc.state,
          lat: loc.lat,
          lng: loc.lng,
        })
        writeFileSync(join(moreDir, 'index.html'), moreHtml)
      }

      console.log(`[location-seo] Generated ${LOCATIONS.length} location pages + ${LOCATIONS.length * (INSTRUMENT_PAGES.length + 1)} instrument pages`)
    },
  }
}
