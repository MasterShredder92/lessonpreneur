import type { LocKey } from '../config/locations'
import type { LocationSEOContent } from './types'
import { omahaContent } from './omaha'
import { gretnaContent } from './gretna'
import { bellevueContent } from './bellevue'
import { elkhornContent } from './elkhorn'

export type { LocationSEOContent } from './types'

export const LOCATION_SEO: Record<LocKey, LocationSEOContent> = {
  omaha: omahaContent,
  gretna: gretnaContent,
  bellevue: bellevueContent,
  elkhorn: elkhornContent,
}
