export const TRIAL_DAYS = 60

export interface PricingTier {
  key: 'teacher' | 'school' | 'multi'
  name: string
  tagline: string
  price: number
  priceDisplay: string
  popular?: boolean
  features: string[]
  limits: string
  stripeEnvVar: string
}

export const PRICING_TIERS: PricingTier[] = [
  {
    key: 'teacher',
    name: 'Individual Teacher',
    tagline: 'For solo teachers managing their own students',
    price: 197,
    priceDisplay: '$197',
    limits: 'Up to 50 students, 1 teacher account',
    stripeEnvVar: 'STRIPE_PRICE_TEACHER',
    features: [
      'AI progress updates',
      'Parent dashboard',
      'Session reminders',
      'Practice Lab',
      'Up to 50 students',
      '1 teacher account',
    ],
  },
  {
    key: 'school',
    name: 'Music School',
    tagline: 'For single-location music schools',
    price: 497,
    priceDisplay: '$497',
    popular: true,
    limits: 'Unlimited students & teachers',
    stripeEnvVar: 'STRIPE_PRICE_SCHOOL',
    features: [
      'Everything in Teacher, plus:',
      'Unlimited students & teachers',
      'Admin dashboard with AI insights',
      'Churn risk scoring',
      'Financial dashboard',
      'Retention campaigns',
      'Teacher recruitment pipeline',
      'Star AI assistant',
    ],
  },
  {
    key: 'multi',
    name: 'Multi-Location',
    tagline: 'For schools with 2-3 locations',
    price: 997,
    priceDisplay: '$997',
    limits: 'Up to 3 locations',
    stripeEnvVar: 'STRIPE_PRICE_MULTI',
    features: [
      'Everything in School, plus:',
      'Multi-location management',
      'Location comparison analytics',
      'Cross-location scheduling',
      'White-label branding per location',
    ],
  },
]

export function getTierByKey(key: string): PricingTier {
  return PRICING_TIERS.find(t => t.key === key) ?? PRICING_TIERS[1]
}

export function getTierPrice(key: string): number {
  return getTierByKey(key).price
}
