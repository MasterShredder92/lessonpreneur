import { useEffect } from 'react'
import { LOCATIONS, type LocKey } from '../config/locations'

interface LandingSEOOptions {
  loc: LocKey
  title: string
  description: string
  path: string // e.g. '/omaha/guitar'
  jsonLd?: Record<string, unknown>
}

/** Sets all SEO meta tags + canonical + JSON-LD for a public landing page. */
export function useLandingSEO({ loc, title, description, path, jsonLd }: LandingSEOOptions) {
  const l = LOCATIONS[loc]
  const url = `https://www.lessonpreneur.io${path}`

  useEffect(() => {
    document.title = title

    const setMeta = (attr: string, key: string, content: string) => {
      let el = document.querySelector(`meta[${attr}="${key}"]`) as HTMLMetaElement | null
      if (!el) { el = document.createElement('meta'); el.setAttribute(attr, key); document.head.appendChild(el) }
      el.setAttribute('content', content)
    }

    setMeta('name', 'description', description)
    setMeta('name', 'geo.placename', `${l.name}, Nebraska`)

    setMeta('property', 'og:title', title)
    setMeta('property', 'og:description', description)
    setMeta('property', 'og:url', url)
    setMeta('property', 'og:type', 'website')
    setMeta('property', 'og:locale', 'en_US')
    setMeta('property', 'og:site_name', 'Adkins Music Lessons')

    setMeta('name', 'twitter:card', 'summary_large_image')
    setMeta('name', 'twitter:title', title)
    setMeta('name', 'twitter:description', description)

    let canonical = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null
    if (!canonical) { canonical = document.createElement('link'); canonical.setAttribute('rel', 'canonical'); document.head.appendChild(canonical) }
    canonical.setAttribute('href', url)
  }, [loc, title, description, url, l.name])

  // JSON-LD injection
  useEffect(() => {
    if (!jsonLd) return
    const id = 'ld-json-page'
    let script = document.getElementById(id) as HTMLScriptElement | null
    if (!script) { script = document.createElement('script'); script.id = id; script.type = 'application/ld+json'; document.head.appendChild(script) }
    script.textContent = JSON.stringify(jsonLd)
    return () => { script?.remove() }
  }, [jsonLd])
}

/** Builds a Course + LocalBusiness JSON-LD for an instrument landing page. */
export function buildInstrumentJsonLd(loc: LocKey, instrument: string, slug: string, instrumentDesc: string) {
  const l = LOCATIONS[loc]
  const url = `https://www.lessonpreneur.io/${loc}/${slug}`
  return {
    '@context': 'https://schema.org',
    '@type': 'Course',
    name: `${instrument} Lessons in ${l.name}, NE`,
    description: instrumentDesc,
    url,
    provider: {
      '@type': ['LocalBusiness', 'EducationalOrganization'],
      name: l.fullName,
      telephone: l.phone,
      email: l.email,
      address: {
        '@type': 'PostalAddress',
        streetAddress: l.address.split(', ')[0],
        addressLocality: l.name,
        addressRegion: 'NE',
        addressCountry: 'US',
      },
      geo: {
        '@type': 'GeoCoordinates',
        latitude: l.geo.lat,
        longitude: l.geo.lng,
      },
    },
    hasCourseInstance: {
      '@type': 'CourseInstance',
      courseMode: 'onsite',
      courseWorkload: 'PT30M',
      instructor: {
        '@type': 'Organization',
        name: l.fullName,
      },
    },
  }
}
