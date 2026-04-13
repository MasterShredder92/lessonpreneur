// Vercel Edge Middleware — injects location-specific SEO meta tags into HTML
// before the response reaches crawlers. This solves the SPA rendering problem
// where Facebook, Twitter, LinkedIn, Bing, and AI crawlers cannot execute JS.

export const config = {
  // Match all non-asset paths so legacy domain redirects fire in middleware
  // before filesystem or rewrites can intercept the request.
  matcher: ['/((?!_next/static|_next/image|assets/|favicon\\.png|icon-|manifest\\.json|sw\\.js|data/).*)'],
}

// ── Legacy domain → adkinsmusiclessons.com permanent redirects ──
const LEGACY_HOST_MAP: Record<string, string> = {
  'omahaguitarandmusiclessons.com': '/omaha',
  'www.omahaguitarandmusiclessons.com': '/omaha',
  'musiclessonsbellevue.com': '/bellevue',
  'www.musiclessonsbellevue.com': '/bellevue',
  'elkhornlessons.com': '/elkhorn',
  'www.elkhornlessons.com': '/elkhorn',
  'gretnamusiclessons.com': '/gretna',
  'www.gretnamusiclessons.com': '/gretna',
}

const NOINDEX_PATHS = new Set(['/start', '/trial', '/thank-you', '/get-started'])

// Paths where this middleware does SEO work for lessonpreneur.io / adkinsmusiclessons.com
const SEO_PATHS = new Set([
  '/omaha', '/omaha/piano', '/omaha/guitar', '/omaha/vocals', '/omaha/drums', '/omaha/more', '/omaha/violin-lessons', '/omaha/flute-lessons',
  '/bellevue', '/bellevue/piano', '/bellevue/guitar', '/bellevue/vocals', '/bellevue/drums', '/bellevue/more', '/bellevue/violin-lessons', '/bellevue/flute-lessons',
  '/elkhorn', '/elkhorn/piano', '/elkhorn/guitar', '/elkhorn/vocals', '/elkhorn/drums', '/elkhorn/more', '/elkhorn/violin-lessons', '/elkhorn/flute-lessons',
  '/gretna', '/gretna/piano', '/gretna/guitar', '/gretna/vocals', '/gretna/drums', '/gretna/more', '/gretna/violin-lessons', '/gretna/flute-lessons',
  '/kids-music-lessons', '/adult-music-lessons', '/beginner-music-lessons', '/private-music-lessons',
  '/about', '/locations',
  '/start', '/trial', '/thank-you', '/get-started',
])

const LOCATIONS: Record<string, { name: string; fullName: string; phone: string; email: string; address: string; domain: string; lat: number; lng: number }> = {
  omaha: { name: 'Omaha', fullName: 'Omaha Music Lessons', phone: '(531) 270-0848', email: 'musiclessonsomaha@gmail.com', address: '4862 S 96th St Ste 1, Omaha, NE 68127', domain: 'omahaguitarandmusiclessons.com', lat: 41.2168, lng: -96.0262 },
  bellevue: { name: 'Bellevue', fullName: 'Bellevue Music Lessons', phone: '(402) 960-2808', email: 'bellevuemusiclessons@gmail.com', address: '1311 Harlan Dr, Bellevue, NE 68005', domain: 'musiclessonsbellevue.com', lat: 41.1367, lng: -95.9205 },
  elkhorn: { name: 'Elkhorn', fullName: 'Elkhorn Music Lessons', phone: '(402) 249-9671', email: 'elkhornmusiclessons@gmail.com', address: '1820 N 203rd St, Elkhorn, NE 68022', domain: 'elkhornlessons.com', lat: 41.2862, lng: -96.2532 },
  gretna: { name: 'Gretna', fullName: 'Gretna Music Lessons', phone: '(402) 580-9702', email: 'gretnamusiclessons@gmail.com', address: '20615 Highway 370, Gretna, NE 68028', domain: 'gretnamusiclessons.com', lat: 41.1408, lng: -96.2394 },
}

const INSTRUMENTS: Record<string, { label: string; desc: string }> = {
  piano: { label: 'Piano', desc: 'Private piano lessons covering classical, pop, jazz, and music theory. All ages and skill levels.' },
  guitar: { label: 'Guitar', desc: 'Private guitar lessons covering acoustic, electric, fingerstyle, and more. All ages and skill levels.' },
  vocals: { label: 'Vocals', desc: 'Private vocal and singing lessons for all ages and styles. Build range, confidence, and technique.' },
  drums: { label: 'Drums', desc: 'Private drum lessons covering rock, jazz, funk, and percussion. All ages and skill levels.' },
  more: { label: 'More Instruments', desc: 'Private lessons for violin, bass guitar, flute, brass, woodwinds, and more.' },
  'violin-lessons': { label: 'Violin', desc: 'Private violin lessons for kids and adults. Classical, fiddle, and contemporary styles. All skill levels.' },
  'flute-lessons': { label: 'Flute', desc: 'Private flute lessons for kids and adults. Classical, jazz, and concert band preparation. All skill levels.' },
}

// Supporting pages — meta for non-location SEO pages
const SUPPORTING_PAGES: Record<string, { title: string; desc: string; faqs: Array<{ q: string; a: string }> }> = {
  'kids-music-lessons': {
    title: 'Kids Music Lessons | Piano, Guitar, Vocals & Drums for Children — Adkins Music Lessons',
    desc: 'Private music lessons for kids in Omaha, Bellevue, Elkhorn, and Gretna. Piano, guitar, vocals, drums, and more. Patient teachers, structured progress, beginner-friendly. All ages.',
    faqs: [
      { q: 'What age can kids start music lessons?', a: 'We accept students starting at age five for most instruments. For some instruments like piano, kids may start a bit earlier depending on their readiness.' },
      { q: 'How often should kids take music lessons?', a: 'Most children take one lesson per week. Some advancing students move to twice weekly.' },
      { q: 'Do kids need to practice at home?', a: 'Practice makes a significant difference. Teachers assign manageable goals — usually 15 to 30 minutes per day depending on age.' },
    ],
  },
  'adult-music-lessons': {
    title: 'Adult Music Lessons | Piano, Guitar, Vocals & Drums for Adults — Adkins Music Lessons',
    desc: 'Private music lessons for adults in Omaha, Bellevue, Elkhorn, and Gretna. Learn piano, guitar, vocals, drums at any age. No experience needed. Flexible scheduling, no contracts.',
    faqs: [
      { q: 'Is it too late to learn an instrument as an adult?', a: 'No. We teach adults at every age, including beginners in their 50s, 60s, and beyond.' },
      { q: 'How much time do I need to practice?', a: 'Even 20 minutes a day makes a meaningful difference. Consistency matters more than duration.' },
      { q: 'Will I feel out of place as an adult student?', a: 'Not at all. Adults make up a significant portion of our student body across all four locations.' },
    ],
  },
  'beginner-music-lessons': {
    title: 'Beginner Music Lessons | Start From Zero — Adkins Music Lessons',
    desc: 'Beginner-friendly private music lessons in Omaha, Bellevue, Elkhorn, and Gretna. Piano, guitar, vocals, drums. No experience needed. Start playing real music from day one.',
    faqs: [
      { q: 'Do I need any musical experience to start?', a: 'None at all. Most of our students begin with zero experience.' },
      { q: 'How long does it take to learn an instrument?', a: "You'll play your first songs within weeks. Solid intermediate skills typically take six months to a year." },
      { q: "What if I'm not naturally talented?", a: 'Talent is overrated. The students who progress fastest show up consistently and practice regularly.' },
    ],
  },
  'private-music-lessons': {
    title: 'Private Music Lessons | One-on-One Instruction — Adkins Music Lessons',
    desc: 'Private, one-on-one music lessons in Omaha, Bellevue, Elkhorn, and Gretna. Piano, guitar, vocals, drums. Personalized instruction for all ages. No group classes. No contracts.',
    faqs: [
      { q: 'What instruments do you offer private lessons in?', a: 'Piano, guitar, vocals, drums, violin, bass guitar, flute, and other band instruments.' },
      { q: 'Do you require contracts?', a: 'No. Enrollment is month-to-month at all four locations. No semester commitments, no registration fees.' },
      { q: 'How are students matched with teachers?', a: 'We match based on goals, learning style, personality, and scheduling.' },
    ],
  },
}

function buildJsonLd(loc: typeof LOCATIONS[string], canonical: string, instrument?: typeof INSTRUMENTS[string]) {
  if (instrument) {
    return JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'Course',
      name: `${instrument.label} Lessons in ${loc.name}, NE`,
      description: instrument.desc,
      url: canonical,
      provider: { '@type': ['LocalBusiness', 'EducationalOrganization'], name: loc.fullName, telephone: loc.phone },
    })
  }
  const parts = loc.address.split(', ')
  const zip = (parts[parts.length - 1] || '').replace(/[^0-9]/g, '')
  return JSON.stringify({
    '@context': 'https://schema.org',
    '@type': ['LocalBusiness', 'EducationalOrganization'],
    '@id': canonical,
    name: loc.fullName,
    alternateName: 'Adkins Music Lessons',
    description: `Private music lessons in ${loc.name}, Nebraska. Piano, guitar, vocals, drums and more.`,
    url: canonical,
    telephone: loc.phone,
    email: loc.email,
    priceRange: '$$',
    address: { '@type': 'PostalAddress', streetAddress: parts[0], addressLocality: loc.name, addressRegion: 'NE', postalCode: zip, addressCountry: 'US' },
    geo: { '@type': 'GeoCoordinates', latitude: loc.lat, longitude: loc.lng },
    openingHoursSpecification: [
      { '@type': 'OpeningHoursSpecification', dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday'], opens: '15:00', closes: '21:00' },
      { '@type': 'OpeningHoursSpecification', dayOfWeek: ['Saturday', 'Sunday'], opens: '10:00', closes: '15:00' },
    ],
    founder: { '@type': 'Person', name: 'Zachary Adkins' },
    sameAs: [`https://${loc.domain}`],
  })
}

function buildBreadcrumbJsonLd(items: Array<{ name: string; url: string }>) {
  return JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: item.name,
      item: item.url,
    })),
  })
}

function buildSupportingJsonLd(slug: string, title: string, desc: string) {
  const canonical = `https://www.adkinsmusiclessons.com/${slug}`
  return JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'EducationalOrganization',
    name: 'Adkins Music Lessons',
    description: desc,
    url: canonical,
    areaServed: [
      { '@type': 'City', name: 'Omaha', containedInPlace: { '@type': 'State', name: 'Nebraska' } },
      { '@type': 'City', name: 'Bellevue', containedInPlace: { '@type': 'State', name: 'Nebraska' } },
      { '@type': 'City', name: 'Elkhorn', containedInPlace: { '@type': 'State', name: 'Nebraska' } },
      { '@type': 'City', name: 'Gretna', containedInPlace: { '@type': 'State', name: 'Nebraska' } },
    ],
  })
}

async function rewriteHtml(
  request: Request,
  title: string,
  desc: string,
  canonical: string,
  jsonLd: string,
  locationSlug?: string
): Promise<Response> {
  const url = new URL(request.url)
  const originUrl = new URL('/', url.origin)
  const response = await fetch(originUrl.toString(), { headers: request.headers })
  let html = await response.text()

  html = html.replace(/<title>[^<]*<\/title>/, `<title>${title}</title>`)
  html = html.replace(/<meta name="description" content="[^"]*">/, `<meta name="description" content="${desc}">`)
  html = html.replace(/<link rel="canonical" href="[^"]*" \/>/, `<link rel="canonical" href="${canonical}" />`)
  html = html.replace(/<meta property="og:title" content="[^"]*">/, `<meta property="og:title" content="${title}">`)
  html = html.replace(/<meta property="og:description" content="[^"]*">/, `<meta property="og:description" content="${desc}">`)
  html = html.replace(/<meta property="og:url" content="[^"]*">/, `<meta property="og:url" content="${canonical}">`)
  html = html.replace(/<meta name="twitter:title" content="[^"]*">/, `<meta name="twitter:title" content="${title}">`)
  html = html.replace(/<meta name="twitter:description" content="[^"]*">/, `<meta name="twitter:description" content="${desc}">`)
  html = html.replace('</head>', `<script type="application/ld+json">${jsonLd}</script>\n  </head>`)

  if (locationSlug) {
    const fav = `/favicon-${locationSlug}.png`
    html = html.replace(/<link rel="icon"[^>]*href="\/favicon\.png[^"]*"[^>]*>/, `<link rel="icon" type="image/png" sizes="192x192" href="${fav}">`)
    html = html.replace(/<link rel="icon"[^>]*href="\/icon-192\.png[^"]*"[^>]*>/, `<link rel="icon" type="image/png" sizes="192x192" href="${fav}">`)
    html = html.replace(/<link rel="apple-touch-icon"[^>]*href="[^"]*"[^>]*>/, `<link rel="apple-touch-icon" sizes="192x192" href="${fav}">`)
  }

  return new Response(html, {
    status: 200,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'public, s-maxage=3600, stale-while-revalidate=86400',
      'x-robots-tag': 'index, follow',
    },
  })
}

// Adkins customer-facing domains — root should show /omaha, not the SaaS page
const ADKINS_HOSTS = new Set([
  'adkinsmusiclessons.com',
  'www.adkinsmusiclessons.com',
])

export default async function middleware(request: Request): Promise<Response> {
  const url = new URL(request.url)
  const hostname = url.hostname

  // ── Legacy domain redirects — must fire before anything else ──
  const legacyBase = LEGACY_HOST_MAP[hostname]
  if (legacyBase) {
    const subpath = url.pathname === '/' ? '' : url.pathname
    const target = `https://www.adkinsmusiclessons.com${legacyBase}${subpath}`
    return Response.redirect(target, 308)
  }

  // ── Adkins domain root → /omaha (primary location) ──
  if (ADKINS_HOSTS.has(hostname) && url.pathname === '/') {
    return Response.redirect('https://www.adkinsmusiclessons.com/omaha', 302)
  }

  // For non-SEO paths on the primary domain, pass through immediately
  if (!SEO_PATHS.has(url.pathname)) {
    return fetch(request)
  }

  const segments = url.pathname.split('/').filter(Boolean)

  // Funnel pages — noindex to prevent thin/duplicate indexing
  if (NOINDEX_PATHS.has(url.pathname)) {
    const originUrl = new URL('/', url.origin)
    const response = await fetch(originUrl.toString(), { headers: request.headers })
    let html = await response.text()
    html = html.replace(
      /<meta name="robots" content="[^"]*">/,
      '<meta name="robots" content="noindex, nofollow">'
    )
    return new Response(html, {
      status: 200,
      headers: {
        'content-type': 'text/html; charset=utf-8',
        'x-robots-tag': 'noindex, nofollow',
      },
    })
  }

  // About page
  if (segments.length === 1 && segments[0] === 'about') {
    const canonical = 'https://www.adkinsmusiclessons.com/about'
    const aboutJsonLd = JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'Organization',
      name: 'Adkins Music Lessons',
      url: 'https://www.adkinsmusiclessons.com',
      founder: { '@type': 'Person', name: 'Zachary Adkins', description: '2017 National Guitar Competition winner' },
    })
    const breadcrumb = buildBreadcrumbJsonLd([
      { name: 'Home', url: 'https://www.adkinsmusiclessons.com' },
      { name: 'About', url: canonical },
    ])
    const combined = aboutJsonLd + `</script>\n  <script type="application/ld+json">${breadcrumb}`
    return rewriteHtml(
      request,
      'About Adkins Music Lessons | Founded by Zachary Adkins — Omaha Metro',
      'Adkins Music Lessons was founded by Zachary Adkins, 2017 National Guitar Competition winner. Four locations, 30+ instructors, 400+ students across the Omaha metro.',
      canonical,
      combined
    )
  }

  // Locations page
  if (segments.length === 1 && segments[0] === 'locations') {
    const canonical = 'https://www.adkinsmusiclessons.com/locations'
    const locsJsonLd = JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'EducationalOrganization',
      name: 'Adkins Music Lessons',
      url: 'https://www.adkinsmusiclessons.com',
      numberOfLocations: 4,
      areaServed: Object.values(LOCATIONS).map(l => ({ '@type': 'City', name: l.name })),
    })
    const breadcrumb = buildBreadcrumbJsonLd([
      { name: 'Home', url: 'https://www.adkinsmusiclessons.com' },
      { name: 'Locations', url: canonical },
    ])
    const combined = locsJsonLd + `</script>\n  <script type="application/ld+json">${breadcrumb}`
    return rewriteHtml(
      request,
      'Locations | Music Lessons in Omaha, Bellevue, Elkhorn & Gretna — Adkins Music',
      'Adkins Music Lessons has four studio locations across the Omaha metro. Private music lessons for all ages.',
      canonical,
      combined
    )
  }

  // Supporting pages (e.g. /kids-music-lessons)
  if (segments.length === 1 && SUPPORTING_PAGES[segments[0]]) {
    const slug = segments[0]
    const page = SUPPORTING_PAGES[slug]
    const canonical = `https://www.adkinsmusiclessons.com/${slug}`

    let combinedJsonLd = buildSupportingJsonLd(slug, page.title, page.desc)
    if (page.faqs.length > 0) {
      const faqSchema = JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        mainEntity: page.faqs.map(f => ({
          '@type': 'Question',
          name: f.q,
          acceptedAnswer: { '@type': 'Answer', text: f.a },
        })),
      })
      combinedJsonLd += `</script>\n  <script type="application/ld+json">${faqSchema}`
    }

    const breadcrumb = buildBreadcrumbJsonLd([
      { name: 'Home', url: 'https://www.adkinsmusiclessons.com' },
      { name: page.title.split('|')[0].trim(), url: canonical },
    ])
    combinedJsonLd += `</script>\n  <script type="application/ld+json">${breadcrumb}`

    return rewriteHtml(request, page.title, page.desc, canonical, combinedJsonLd)
  }

  // Location pages
  const locKey = segments[0]
  const loc = LOCATIONS[locKey]
  if (!loc) return fetch(request)

  const instrumentKey = segments[1]
  const instrument = instrumentKey ? INSTRUMENTS[instrumentKey] : undefined

  let title: string
  let desc: string
  let canonical: string

  if (instrument) {
    title = `${instrument.label} Lessons in ${loc.name}, NE | Adkins Music Lessons`
    desc = `${instrument.desc} Expert teachers, flexible scheduling, no contracts. ${loc.phone}`
    canonical = `https://www.adkinsmusiclessons.com/${locKey}/${instrumentKey}`
  } else {
    title = `${loc.fullName} | Piano, Guitar, Vocals & Drums — Adkins Music Lessons`
    desc = `Private music lessons in ${loc.name}, NE. Piano, guitar, vocals, drums & more. Expert teachers, flexible scheduling, no contracts. ${loc.phone}`
    canonical = `https://www.adkinsmusiclessons.com/${locKey}`
  }

  const jsonLd = buildJsonLd(loc, canonical, instrument)
  const breadcrumbItems = [{ name: 'Home', url: 'https://www.adkinsmusiclessons.com' }]
  breadcrumbItems.push({ name: `Music Lessons in ${loc.name}`, url: `https://www.adkinsmusiclessons.com/${locKey}` })
  if (instrument) {
    breadcrumbItems.push({ name: `${instrument.label} Lessons`, url: canonical })
  }

  const fullJsonLd = jsonLd + `</script>\n  <script type="application/ld+json">${buildBreadcrumbJsonLd(breadcrumbItems)}`
  return rewriteHtml(request, title, desc, canonical, fullJsonLd, locKey)
}
