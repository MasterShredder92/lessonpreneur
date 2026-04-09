import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { LOCATIONS, type LocKey } from '../config/locations'

const BASE_URL = 'https://www.lessonpreneur.io'

const INSTRUMENT_LABELS: Record<string, string> = {
  guitar: 'Guitar',
  piano: 'Piano',
  vocals: 'Vocals',
  drums: 'Drums',
  more: 'Flute, Violin & More',
}

function setMeta(name: string, content: string, property = false) {
  const attr = property ? 'property' : 'name'
  let el = document.querySelector(`meta[${attr}="${name}"]`) as HTMLMetaElement | null
  if (!el) {
    el = document.createElement('meta')
    el.setAttribute(attr, name)
    document.head.appendChild(el)
  }
  el.content = content
}

function setCanonical(href: string) {
  let el = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null
  if (!el) {
    el = document.createElement('link')
    el.rel = 'canonical'
    document.head.appendChild(el)
  }
  el.href = href
}

function setJsonLd(data: object) {
  const id = 'location-seo-jsonld'
  let el = document.getElementById(id) as HTMLScriptElement | null
  if (!el) {
    el = document.createElement('script')
    el.id = id
    el.type = 'application/ld+json'
    document.head.appendChild(el)
  }
  el.textContent = JSON.stringify(data)
}

function buildLocalBusinessJsonLd(loc: (typeof LOCATIONS)[LocKey]) {
  return {
    '@context': 'https://schema.org',
    '@type': ['LocalBusiness', 'MusicSchool'],
    '@id': `${BASE_URL}${loc.route}#business`,
    name: loc.fullName,
    alternateName: 'Adkins Music Lessons',
    url: `${BASE_URL}${loc.route}`,
    telephone: loc.phone,
    email: loc.email,
    address: {
      '@type': 'PostalAddress',
      streetAddress: loc.address.split(',')[0],
      addressLocality: loc.name,
      addressRegion: 'NE',
      addressCountry: 'US',
    },
    areaServed: { '@type': 'City', name: loc.name },
    priceRange: '$$',
    sameAs: [`https://www.${loc.domain}`],
  }
}

/**
 * Updates document <head> with location-specific SEO tags.
 * Called on every route change. Works alongside the build-time
 * Vite plugin (which handles the initial HTML for crawlers).
 */
export function useLocationSEO() {
  const { pathname } = useLocation()

  useEffect(() => {
    const segments = pathname.split('/').filter(Boolean)
    const locKey = segments[0]?.toLowerCase() as LocKey | undefined
    const loc = locKey ? LOCATIONS[locKey] : undefined
    if (!loc) return // not a location page

    const instrument = segments[1]?.toLowerCase()
    const instLabel = instrument ? INSTRUMENT_LABELS[instrument] : undefined

    let title: string
    let desc: string
    let canonical: string

    if (instLabel) {
      title = `${instLabel} Lessons in ${loc.name}, NE | Adkins Music`
      desc = `Professional ${instLabel.toLowerCase()} lessons in ${loc.name}, NE for all ages and skill levels. Experienced, background-checked instructors. Flexible scheduling, no commitment.`
      canonical = `${BASE_URL}/${locKey}/${instrument}`
    } else {
      title = `Music Lessons in ${loc.name}, NE | Guitar, Piano, Drums, Vocals & More | Adkins Music`
      desc = `Looking for music lessons in ${loc.name}? Guitar, piano, drums, vocal, flute & violin lessons for all ages. Professional background-checked instructors, flexible scheduling. Book a trial lesson today!`
      canonical = `${BASE_URL}/${locKey}`
    }

    document.title = title
    setMeta('description', desc)
    setCanonical(canonical)

    // OG tags
    setMeta('og:title', title, true)
    setMeta('og:description', desc, true)
    setMeta('og:url', canonical, true)
    setMeta('og:type', 'website', true)
    setMeta('og:site_name', 'Adkins Music Lessons', true)

    // Twitter
    setMeta('twitter:title', title)
    setMeta('twitter:description', desc)

    // JSON-LD
    setJsonLd(buildLocalBusinessJsonLd(loc))
  }, [pathname])
}
