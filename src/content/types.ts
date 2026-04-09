import type { LocKey } from '../config/locations'

export interface LocationSEOContent {
  key: LocKey
  intro: {
    headline: string
    body: string[]
  }
  whoWeHelp: {
    kids: string
    teens: string
    adults: string
    beginners: string
    returning: string
  }
  whyChoose: {
    heading: string
    points: Array<{ title: string; body: string }>
  }
  faqs: Array<{ q: string; a: string }>
  serviceArea: string
  instruments: {
    piano: InstrumentLocalContent
    guitar: InstrumentLocalContent
    vocals: InstrumentLocalContent
    drums: InstrumentLocalContent
    more: InstrumentLocalContent
  }
}

export interface InstrumentLocalContent {
  heading: string
  body: string
  audiences: string
  cta: string
}

export interface SupportingPageContent {
  slug: string
  title: string
  metaDescription: string
  h1: string
  intro: string[]
  sections: Array<{
    heading: string
    body: string[]
    faqs?: Array<{ q: string; a: string }>
  }>
  locationLinks: Array<{ text: string; href: string }>
}
