export type NavItem = {
  label: string
  path: string
  icon: string
  children?: { label: string; path: string }[]
}

export const ADMIN_NAV_ITEMS: NavItem[] = [
  { label: 'Studio Overview', path: '/admin/dashboard', icon: 'dashboard' },
  { label: 'New Members', path: '/admin/leads', icon: 'user-plus' },
  { label: 'Schedule', path: '/admin/schedule', icon: 'calendar' },
  // divider
  { label: 'Roster', path: '', icon: 'users', children: [
    { label: 'Students', path: '/admin/students' },
    { label: 'Families', path: '/admin/families' },
  ]},
  { label: 'Backstage', path: '', icon: 'shield', children: [
    { label: 'Retention', path: '/admin/retention' },
    { label: 'Recruitment', path: '/admin/recruitment' },
  ]},
  // divider
  { label: 'The Band', path: '', icon: 'guitar', children: [
    { label: 'Teachers', path: '/admin/teachers' },
    { label: 'Payroll', path: '/admin/payroll' },
  ]},
  { label: 'Your Books', path: '', icon: 'book', children: [
    { label: 'Billing', path: '/admin/billing' },
    { label: 'Financials', path: '/admin/financials' },
  ]},
]

export const LESSON_LOOKBACK_DAYS = 28

// Core Four — always first, always in this order
export const CORE_INSTRUMENTS = ['piano', 'guitar', 'vocals', 'drums'] as const
export const OTHER_INSTRUMENTS = [
  'banjo', 'bass', 'brass', 'cello', 'clarinet', 'flute', 'mandolin',
  'oboe', 'percussion', 'saxophone', 'strings', 'trombone', 'trumpet',
  'ukulele', 'viola', 'violin', 'voice', 'woodwinds',
] as const
export const ALL_INSTRUMENTS = [...CORE_INSTRUMENTS, ...OTHER_INSTRUMENTS]

// Uniform pill style for instrument selectors
export const INSTRUMENT_PILL_STYLE = {
  minWidth: 90, textAlign: 'center' as const, padding: '6px 14px',
  borderRadius: 999, fontSize: 11, fontWeight: 600, cursor: 'pointer',
  textTransform: 'capitalize' as const,
}

// Billing defaults
export const DEFAULT_SESSIONS_PER_MONTH = 4
export const DEFAULT_RATE_PER_SESSION = 45 // dollars — student table stores in dollars
export const DEFAULT_RATE_TIER_CENTS = 4500 // cents — family table stores in cents

// Rate tier options (cents)
export const RATE_TIERS = {
  STANDARD: 4500,
  MULTI_STUDENT: 4000,
  VOLUME: 3750,
} as const

export const ROLE_DEFAULT_ROUTES: Record<string, string> = {
  owner: '/admin/dashboard',
  admin: '/admin/dashboard',
  company_director: '/admin/dashboard',
  studio_director: '/admin/dashboard',
  teacher: '/teacher/schedule',
  parent: '/parent/dashboard',
  student: '/parent/dashboard',
}
