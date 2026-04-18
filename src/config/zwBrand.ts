/**
 * Public marketing + in-app product strings for ZiroWork OS (music schools).
 */
export const ZW = {
  parent: 'ZiroWork',
  product: 'ZiroWork',
  productByline: 'ZiroWork for music schools',
  musicSchoolsPowered: 'Music schools powered by ZiroWork',
  poweredBy: 'Powered by ZiroWork',
  operatingSystem: 'The operating system for music schools',
  runWithoutWork: 'Run your business without the work',
  umbrellaLine:
    'ZiroWork is the operating layer for owner-led music schools — scheduling, families, billing, and AI in one place.',
} as const

/** Teal-forward accent (parent brand direction). */
export const ZW_COLOR = {
  teal: '#2DD4BF',
  tealDeep: '#0D9488',
  tealDim: 'rgba(45, 212, 191, 0.45)',
  tealGlow: 'rgba(13, 148, 136, 0.25)',
} as const

/** Absolute origin for email CTAs when `window` is unavailable (e.g. cron). Set `VITE_PUBLIC_APP_ORIGIN` in deploy env. */
export function getPublicAppOrigin(): string {
  if (typeof window !== 'undefined' && window.location?.origin) return window.location.origin
  const env = import.meta.env.VITE_PUBLIC_APP_ORIGIN as string | undefined
  if (env && typeof env === 'string') return env.replace(/\/$/, '')
  return ''
}
