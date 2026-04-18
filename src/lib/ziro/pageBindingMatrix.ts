/**
 * Deterministic page ↔ catalog agent ↔ skill alignment for Ziro Work.
 * Used by bulk "Assign catalog agents" and as documentation for manual edits.
 *
 * `recommendedPrimarySlug` / `recommendedSupportingSlugs` reference `musicSchoolAgentCatalog`.
 * When null, bulk assignment falls back to registry `agentMatchHints` heuristics only.
 */
import type { MusicSchoolAgentCatalogSlug } from './musicSchoolAgentCatalog'
import type { PageIntelBindingKey } from './pageSurfaceRegistry'

export type PageBindingMatrixRow = {
  page_key: PageIntelBindingKey
  subpageNotes?: string
  purpose: string
  recommendedPrimarySlug: MusicSchoolAgentCatalogSlug | null
  recommendedSupportingSlugs: readonly MusicSchoolAgentCatalogSlug[]
  primarySkillKey: string | null
  secondarySkillKey: string | null
  reason: string
}

export const PAGE_AGENT_SKILL_MATRIX: readonly PageBindingMatrixRow[] = [
  {
    page_key: 'dashboard',
    subpageNotes: '/admin',
    purpose: 'Cross-studio priorities and health signals.',
    recommendedPrimarySlug: 'enrollment_coordinator',
    recommendedSupportingSlugs: ['retention'],
    primarySkillKey: 'lead_followup',
    secondarySkillKey: 'churn_analysis',
    reason: 'Overview should bias to pipeline motion while surfacing at-risk signals via retention as secondary.',
  },
  {
    page_key: 'leads',
    purpose: 'Trial and new-member pipeline.',
    recommendedPrimarySlug: 'enrollment_coordinator',
    recommendedSupportingSlugs: [],
    primarySkillKey: 'lead_followup',
    secondarySkillKey: null,
    reason: 'Canonical enrollment owner.',
  },
  {
    page_key: 'schedule',
    purpose: 'Placement, utilization, calendar hygiene.',
    recommendedPrimarySlug: 'scheduling_placement',
    recommendedSupportingSlugs: ['enrollment_coordinator'],
    primarySkillKey: 'schedule_optimizer',
    secondarySkillKey: 'lead_followup',
    reason: 'Scheduling owns the grid; enrollment helps when trials need slots.',
  },
  {
    page_key: 'students',
    subpageNotes: '/admin/students including ?id= detail',
    purpose: 'Active roster, progress, and operational student actions.',
    recommendedPrimarySlug: 'retention',
    recommendedSupportingSlugs: ['scheduling_placement'],
    primarySkillKey: 'churn_analysis',
    secondarySkillKey: 'schedule_optimizer',
    reason: 'Roster work is mostly continuity and at-risk patterns, not generic parent blasts.',
  },
  {
    page_key: 'families',
    purpose: 'Households, agreements, and family-level coordination.',
    recommendedPrimarySlug: 'parent_communication',
    recommendedSupportingSlugs: ['billing_recovery'],
    primarySkillKey: 'parent_comms',
    secondarySkillKey: 'billing_insight',
    reason: 'Parent Communication belongs on family surfaces; billing supports tuition friction.',
  },
  {
    page_key: 'retention',
    purpose: 'Churn, win-back, engagement plays.',
    recommendedPrimarySlug: 'retention',
    recommendedSupportingSlugs: ['reactivation'],
    primarySkillKey: 'churn_analysis',
    secondarySkillKey: 'morning_briefing',
    reason: 'Retention specialist owns risk; reactivation for lapsed segments.',
  },
  {
    page_key: 'teachers',
    purpose: 'Faculty capacity and staffing.',
    recommendedPrimarySlug: 'scheduling_placement',
    recommendedSupportingSlugs: ['enrollment_coordinator'],
    primarySkillKey: 'schedule_optimizer',
    secondarySkillKey: 'lead_followup',
    reason: 'Teacher grid load ties to placement; enrollment when discussing trials on faculty.',
  },
  {
    page_key: 'payroll',
    purpose: 'Payouts and compensation runs.',
    recommendedPrimarySlug: 'billing_recovery',
    recommendedSupportingSlugs: [],
    primarySkillKey: 'billing_insight',
    secondarySkillKey: null,
    reason: 'Closest catalog for money movement and AR-style rigor.',
  },
  {
    page_key: 'recruitment',
    purpose: 'Hiring pipeline and candidates.',
    recommendedPrimarySlug: null,
    recommendedSupportingSlugs: [],
    primarySkillKey: null,
    secondarySkillKey: null,
    reason: 'No dedicated hiring catalog agent yet — use hints or manual assignment.',
  },
  {
    page_key: 'billing',
    purpose: 'Invoices, tuition, collections.',
    recommendedPrimarySlug: 'billing_recovery',
    recommendedSupportingSlugs: ['parent_communication'],
    primarySkillKey: 'billing_insight',
    secondarySkillKey: 'parent_comms',
    reason: 'Billing owns numbers; parent comms only for customer-facing message drafts.',
  },
  {
    page_key: 'financials',
    purpose: 'Owner financial summary.',
    recommendedPrimarySlug: 'billing_recovery',
    recommendedSupportingSlugs: [],
    primarySkillKey: 'billing_insight',
    secondarySkillKey: null,
    reason: 'Financial headline view aligns with tuition and AR discipline.',
  },
  {
    page_key: 'integrations',
    purpose: 'Connected systems and data flow.',
    recommendedPrimarySlug: null,
    recommendedSupportingSlugs: [],
    primarySkillKey: null,
    secondarySkillKey: null,
    reason: 'No integration-specific catalog agent — assign manually if you add one.',
  },
  {
    page_key: 'settings',
    purpose: 'Studio configuration and policy.',
    recommendedPrimarySlug: null,
    recommendedSupportingSlugs: [],
    primarySkillKey: null,
    secondarySkillKey: null,
    reason: 'Policy surface varies by tenant; no forced catalog mapping.',
  },
  {
    page_key: 'zirowork',
    purpose: 'Skills, agents, orchestration.',
    recommendedPrimarySlug: null,
    recommendedSupportingSlugs: [],
    primarySkillKey: null,
    secondarySkillKey: null,
    reason: 'Meta-configuration; operators choose explicitly.',
  },
  {
    page_key: 'ziro_insights',
    purpose: 'Operating analytics and signals.',
    recommendedPrimarySlug: 'retention',
    recommendedSupportingSlugs: ['billing_recovery'],
    primarySkillKey: 'churn_analysis',
    secondarySkillKey: 'billing_insight',
    reason: 'Insights skew to outcomes (retention, revenue risk) rather than parent comms.',
  },
  {
    page_key: 'workflows',
    purpose: 'Automation and repeatable plays.',
    recommendedPrimarySlug: 'enrollment_coordinator',
    recommendedSupportingSlugs: ['retention'],
    primarySkillKey: 'lead_followup',
    secondarySkillKey: 'churn_analysis',
    reason: 'Workflows often automate follow-ups and save plays across funnel and retention.',
  },
  {
    page_key: 'analytics',
    purpose: 'Reporting and trends.',
    recommendedPrimarySlug: 'retention',
    recommendedSupportingSlugs: ['billing_recovery'],
    primarySkillKey: 'churn_analysis',
    secondarySkillKey: 'billing_insight',
    reason: 'Default analytics bias to engagement/revenue outcomes.',
  },
  {
    page_key: 'import',
    purpose: 'CSV and migration hygiene.',
    recommendedPrimarySlug: 'enrollment_coordinator',
    recommendedSupportingSlugs: [],
    primarySkillKey: 'lead_followup',
    secondarySkillKey: null,
    reason: 'Imports usually feed roster and pipeline data — enrollment coordinator framing.',
  },
  {
    page_key: 'platform',
    purpose: 'Multi-tenant / company controls.',
    recommendedPrimarySlug: null,
    recommendedSupportingSlugs: [],
    primarySkillKey: null,
    secondarySkillKey: null,
    reason: 'Platform admin varies; no catalog default.',
  },
  {
    page_key: 'performance',
    purpose: 'Speed and reliability monitoring.',
    recommendedPrimarySlug: null,
    recommendedSupportingSlugs: [],
    primarySkillKey: null,
    secondarySkillKey: null,
    reason: 'Engineering-style surface — manual assignment.',
  },
  {
    page_key: 'skills_standalone',
    purpose: 'Skill library management.',
    recommendedPrimarySlug: null,
    recommendedSupportingSlugs: [],
    primarySkillKey: null,
    secondarySkillKey: null,
    reason: 'Meta surface; no forced specialist.',
  },
] as const

export function matrixRowForPageKey(key: string): PageBindingMatrixRow | undefined {
  return PAGE_AGENT_SKILL_MATRIX.find(r => r.page_key === key)
}
