/**
 * Canonical music-school specialist agents for Ziro Work (system-owned, persistent).
 * `catalog_slug` is stored in ziro_agents.invocation_rules for idempotent seed/repair.
 */
export const MUSIC_SCHOOL_ZIRO_AGENT_CATALOG = [
  {
    catalog_slug: 'enrollment_coordinator',
    name: 'Enrollment Coordinator',
    purpose: 'Trial conversion, pipeline follow-ups, and new member enrollment for the music school.',
    usage_triggers: ['lead', 'trial', 'enrollment', 'pipeline', 'prospect'],
  },
  {
    catalog_slug: 'scheduling_placement',
    name: 'Scheduling / Placement',
    purpose: 'Lesson placement, calendar utilization, capacity, and schedule changes.',
    usage_triggers: ['schedule', 'placement', 'calendar', 'capacity'],
  },
  {
    catalog_slug: 'retention',
    name: 'Retention',
    purpose: 'At-risk students, engagement, and churn prevention.',
    usage_triggers: ['retention', 'churn', 'engagement', 'at-risk'],
  },
  {
    catalog_slug: 'reactivation',
    name: 'Reactivation',
    purpose: 'Win-back lapsed students and dormant households.',
    usage_triggers: ['win-back', 'reactivation', 'lapsed'],
  },
  {
    catalog_slug: 'billing_recovery',
    name: 'Billing / Recovery',
    purpose: 'Tuition, invoices, AR, collections, and payment recovery.',
    usage_triggers: ['bill', 'invoice', 'payment', 'collection', 'tuition', 'ar'],
  },
  {
    catalog_slug: 'parent_communication',
    name: 'Parent Communication',
    purpose: 'Household messaging, portal comms, and parent-facing coordination.',
    usage_triggers: ['parent', 'family', 'communication', 'portal'],
  },
] as const

export type MusicSchoolAgentCatalogSlug = (typeof MUSIC_SCHOOL_ZIRO_AGENT_CATALOG)[number]['catalog_slug']
