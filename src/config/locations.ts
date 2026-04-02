// ═══════════════════════════════════════════════════════════
// Central location config — single source of truth for all
// Adkins Music Lessons locations.
// ═══════════════════════════════════════════════════════════

export type LocKey = 'omaha' | 'bellevue' | 'elkhorn' | 'gretna'

export interface LocationConfig {
  key: LocKey
  route: string
  domain: string
  name: string
  fullName: string
  badge: string
  address: string
  phone: string
  email: string
  ga4: string
  metaPixel: string
  tiktokPixel: string
  locationId: string
  accentColor: string
  accentGlow: string
  accentLight: string
  reviews: { text: string; name: string; role: string }[]
}

export const LOCATIONS: Record<LocKey, LocationConfig> = {
  omaha: {
    key: 'omaha',
    route: '/omaha',
    domain: 'omahaguitarandmusiclessons.com',
    name: 'Omaha',
    fullName: 'Omaha Music Lessons',
    badge: 'Now Enrolling in Omaha',
    address: '4862 S 96th St Ste 1, Omaha, NE 68127',
    phone: '(531) 270-0848',
    email: 'musiclessonsomaha@gmail.com',
    ga4: 'G-0KT89GHX52',
    metaPixel: '426901091077909',
    tiktokPixel: 'D768H23C77UD6SV8PU40',
    locationId: 'd48229c1-b70a-4d29-893e-5079887dab76',
    accentColor: '#D41113',
    accentGlow: 'rgba(212,17,19,0.22)',
    accentLight: 'rgba(212,17,19,0.11)',
    reviews: [
      { text: "Adkins is great to work with as a business and Sarah is a wonderful piano teacher. She lets our son take things at his pace and he adores her. We always see smiles as people come in and out.", name: "Charles", role: "Parent" },
      { text: "I have been relearning piano through Sarah Cornell for the past couple of months. I have definitely picked up a lot. She is a truly gifted, humble teacher. I cannot speak highly enough.", name: "Caryl Chapman", role: "Student" },
      { text: "My daughter has been taking piano lessons for the past year and has really enjoyed it. The staff is very kind and the instructors are wonderful with kids.", name: "Josh", role: "Parent" },
    ],
  },
  bellevue: {
    key: 'bellevue',
    route: '/bellevue',
    domain: 'musiclessonsbellevue.com',
    name: 'Bellevue',
    fullName: 'Bellevue Music Lessons',
    badge: 'Now Enrolling in Bellevue',
    address: '1311 Harlan Dr, Bellevue, NE 68005',
    phone: '(402) 960-2808',
    email: 'bellevuemusiclessons@gmail.com',
    ga4: 'G-Q5C7W68SC9',
    metaPixel: '216419921006041',
    tiktokPixel: 'D768ITRC77UD6SV8PU80',
    locationId: 'f7b52dd5-12ee-437f-9c60-f8adf454ac31',
    accentColor: '#A333FF',
    accentGlow: 'rgba(163,51,255,0.22)',
    accentLight: 'rgba(163,51,255,0.11)',
    reviews: [
      { text: "We have had an amazing experience with Bellevue Music Lessons! The entire staff is incredibly kind and welcoming. Our 8-year-old daughter absolutely loves her guitar lessons.", name: "Matt & Cindy", role: "Parents" },
      { text: "They are amazing! So family friendly and so accommodating. They truly care about the students — not just the bottom line.", name: "Jennifer", role: "Student" },
      { text: "My son loves it there! He is going to have a piano recital soon and he is very confident he will do well. The whole atmosphere is wonderful.", name: "Kalene", role: "Parent" },
    ],
  },
  elkhorn: {
    key: 'elkhorn',
    route: '/elkhorn',
    domain: 'elkhornlessons.com',
    name: 'Elkhorn',
    fullName: 'Elkhorn Music Lessons',
    badge: 'Now Enrolling in Elkhorn',
    address: '1820 N 203rd St, Elkhorn, NE 68022',
    phone: '(402) 249-9671',
    email: 'elkhornmusiclessons@gmail.com',
    ga4: 'G-KNEM7VHEC1',
    metaPixel: '873626412816671',
    tiktokPixel: 'D768JBRC77U03P65153G',
    locationId: 'cebd97d4-c241-4de2-8ade-49e5cc0070d5',
    accentColor: '#00A5E8',
    accentGlow: 'rgba(0,165,232,0.22)',
    accentLight: 'rgba(0,165,232,0.11)',
    reviews: [
      { text: "Organized. Communicative. Encouraging. The perfect fit for our granddaughter! We could not be more pleased.", name: "Jon", role: "Parent" },
      { text: "Love the attitude and vibe here — relaxed and truly student-centered. The teachers genuinely care about helping you grow.", name: "Taylor", role: "Student" },
      { text: "My daughter has been taking lessons for a year and loves every session. The instructors are knowledgeable and so great with kids.", name: "Josh", role: "Parent" },
    ],
  },
  gretna: {
    key: 'gretna',
    route: '/gretna',
    domain: 'gretnamusiclessons.com',
    name: 'Gretna',
    fullName: 'Gretna Music Lessons',
    badge: 'Now Enrolling in Gretna',
    address: '20615 Highway 370, Gretna, NE 68028',
    phone: '(402) 580-9702',
    email: 'gretnamusiclessons@gmail.com',
    ga4: 'G-FBMP7Y8M2X',
    metaPixel: '696662488386167',
    tiktokPixel: 'D768IC3C77UD6SV8PU60',
    locationId: '40c67ffc-91b5-46a9-94bd-6ddffdfb7638',
    accentColor: '#00A651',
    accentGlow: 'rgba(0,166,81,0.22)',
    accentLight: 'rgba(0,166,81,0.11)',
    reviews: [
      { text: "Gretna Music Lessons has been absolutely fantastic! My son is learning electric guitar and the progress he has made is incredible. The instructors are knowledgeable, patient, and passionate.", name: "Andrew", role: "Parent" },
      { text: "Love the attitude and vibe: relaxed and student-centered. Exactly what we were looking for in a music school.", name: "Taylor", role: "Student" },
      { text: "We could not be more happy with Gretna Music Lessons. The teachers are fantastic and truly care about every student. We highly recommend them!", name: "Josh", role: "Parent" },
    ],
  },
}

export const ALL_LOC_KEYS: LocKey[] = ['omaha', 'bellevue', 'elkhorn', 'gretna']

export const LOC_TO_OPT: Record<LocKey, string> = {
  omaha: 'Omaha (96th & L)',
  bellevue: 'Bellevue (13th & Harlan)',
  elkhorn: 'Elkhorn (204th & Hwy 6)',
  gretna: 'Gretna (203rd Hwy 370)',
}

/** Look up a location by its domain hostname */
export function getLocationByDomain(hostname: string): LocationConfig | undefined {
  return Object.values(LOCATIONS).find(loc => loc.domain === hostname)
}

/** Look up a location by its route path segment (e.g. "omaha" from "/omaha") */
export function getLocationByRoute(path: string): LocationConfig | undefined {
  const segment = path.split('/').filter(Boolean)[0]?.toLowerCase()
  return segment ? LOCATIONS[segment as LocKey] : undefined
}
