/**
 * Public marketing brand architecture: ZiroWork (parent) → Lessonpreneur (music-school product).
 * Use on SaaS landing, funnel pages, and shared chrome — not a full rename of in-app product strings.
 */
export const ZW = {
  parent: 'ZiroWork',
  product: 'Lessonpreneur',
  productByline: 'Lessonpreneur by ZiroWork',
  musicSchoolsPowered: 'Music schools powered by ZiroWork',
  poweredBy: 'Powered by ZiroWork',
  operatingSystem: 'The operating system for music schools',
  runWithoutWork: 'Run your business without the work',
  /** Umbrella + vertical — one sentence for hero/subheads */
  umbrellaLine:
    'ZiroWork is the operating layer for owner-led schools; Lessonpreneur is how music schools run on it today.',
} as const

/** Teal-forward accent (parent brand direction). LP pink/orange remain product/CTA accents in UI. */
export const ZW_COLOR = {
  teal: '#2DD4BF',
  tealDeep: '#0D9488',
  tealDim: 'rgba(45, 212, 191, 0.45)',
  tealGlow: 'rgba(13, 148, 136, 0.25)',
} as const
