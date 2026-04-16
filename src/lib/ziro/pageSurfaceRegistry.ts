/**
 * Operating surfaces for Ziro Work — maps CRM/admin routes to stable keys used for
 * page ↔ agent resolution (DB bindings + keyword heuristics on ziro_agents).
 */
export type ZiroOperatingSurfaceKey =
  | 'dashboard'
  | 'leads'
  | 'schedule'
  | 'students'
  | 'families'
  | 'retention'
  | 'teachers'
  | 'payroll'
  | 'recruitment'
  | 'billing'
  | 'financials'
  | 'integrations'
  | 'settings'
  | 'zirowork'
  | 'ziro_insights'
  | 'workflows'
  | 'analytics'
  | 'import'
  | 'platform'
  | 'performance'
  | 'skills_standalone'
  | 'unknown'

/**
 * Admin surfaces that participate in `ziro_page_intelligence_bindings` (must match
 * `resolveOperatingSurface().key`). Used by Ziro Control, bulk assign, and repair scripts.
 */
export const PAGE_INTEL_BINDING_KEYS = [
  'dashboard',
  'leads',
  'schedule',
  'students',
  'families',
  'retention',
  'teachers',
  'payroll',
  'recruitment',
  'billing',
  'financials',
  'integrations',
  'settings',
  'zirowork',
  'ziro_insights',
  'workflows',
  'analytics',
  'import',
  'platform',
  'performance',
  'skills_standalone',
] as const satisfies readonly ZiroOperatingSurfaceKey[]

export type PageIntelBindingKey = (typeof PAGE_INTEL_BINDING_KEYS)[number]

/** @deprecated Use PAGE_INTEL_BINDING_KEYS */
export const CRM_PAGE_INTEL_BINDING_KEYS = PAGE_INTEL_BINDING_KEYS

/** @deprecated Use PageIntelBindingKey */
export type CrmPageIntelBindingKey = PageIntelBindingKey

export function getSurfaceByKey(key: ZiroOperatingSurfaceKey): ZiroOperatingSurface | undefined {
  return SURFACES.find(s => s.key === key)
}

export type ZiroOperatingSurface = {
  key: ZiroOperatingSurfaceKey
  /** Short label for chrome */
  title: string
  /** One line: what Ziro focuses on here */
  intelligenceSummary: string
  /** Lowercase tokens matched against agent name, purpose, usage_triggers, invocation keyword lists */
  agentMatchHints: string[]
  /** Default first message when opening the panel from this surface */
  seedPromptTemplate: string
}

const SURFACES: ZiroOperatingSurface[] = [
  {
    key: 'dashboard',
    title: 'Studio Overview',
    intelligenceSummary: 'Cross-functional studio health, priorities, and next actions.',
    agentMatchHints: ['ops', 'operations', 'overview', 'director', 'studio'],
    seedPromptTemplate:
      'I am on Studio Overview. Summarize what matters most this week and which operating areas need attention.',
  },
  {
    key: 'leads',
    title: 'New Members',
    intelligenceSummary: 'Pipeline, follow-ups, and trial-to-enrollment conversion.',
    agentMatchHints: ['lead', 'trial', 'enrollment', 'pipeline', 'prospect', 'sales'],
    seedPromptTemplate:
      'I am on New Members (leads). Which leads need follow-up today and what should I do next?',
  },
  {
    key: 'schedule',
    title: 'Schedule',
    intelligenceSummary: 'Placement, utilization, and session-level changes.',
    agentMatchHints: ['schedule', 'scheduling', 'calendar', 'placement', 'capacity'],
    seedPromptTemplate:
      'I am on Schedule. Help me understand utilization and the best next moves to fill gaps.',
  },
  {
    key: 'students',
    title: 'Students',
    intelligenceSummary: 'Roster health, progress signals, and student-level actions.',
    agentMatchHints: ['student', 'roster', 'progress', 'lesson'],
    seedPromptTemplate: 'I am on Students. What should I review on the roster this week?',
  },
  {
    key: 'families',
    title: 'Families',
    intelligenceSummary: 'Household relationships, agreements, and communication.',
    agentMatchHints: ['family', 'parent', 'household', 'communication', 'portal'],
    seedPromptTemplate: 'I am on Families. What communication or agreement gaps should I close?',
  },
  {
    key: 'retention',
    title: 'Retention',
    intelligenceSummary: 'Churn risk, win-back, and engagement campaigns.',
    agentMatchHints: ['retention', 'churn', 'win-back', 'engagement', 'at-risk'],
    seedPromptTemplate: 'I am on Retention. Who is at risk and what is the highest-impact play?',
  },
  {
    key: 'teachers',
    title: 'Teachers',
    intelligenceSummary: 'Faculty capacity, performance, and staffing.',
    agentMatchHints: ['teacher', 'faculty', 'band', 'payroll'],
    seedPromptTemplate: 'I am on Teachers. Summarize capacity and any staffing risks.',
  },
  {
    key: 'payroll',
    title: 'Payroll',
    intelligenceSummary: 'Compensation runs and teacher payouts.',
    agentMatchHints: ['payroll', 'payout', 'compensation', 'w2'],
    seedPromptTemplate: 'I am on Payroll. What should I verify before the next pay run?',
  },
  {
    key: 'recruitment',
    title: 'Recruitment',
    intelligenceSummary: 'Hiring pipeline and candidate flow.',
    agentMatchHints: ['recruit', 'hiring', 'candidate', 'job'],
    seedPromptTemplate: 'I am on Recruitment. What are the next steps for open roles?',
  },
  {
    key: 'billing',
    title: 'Billing',
    intelligenceSummary: 'Invoices, collections, and revenue recovery.',
    agentMatchHints: ['bill', 'invoice', 'payment', 'collection', 'tuition', 'ar'],
    seedPromptTemplate: 'I am on Billing. Where are we exposed on collections this cycle?',
  },
  {
    key: 'financials',
    title: 'Financials',
    intelligenceSummary: 'Owner financial view and take-home.',
    agentMatchHints: ['financial', 'p-l', 'margin', 'mrr', 'revenue'],
    seedPromptTemplate: 'I am on Financials. Summarize the headline numbers I should watch.',
  },
  {
    key: 'integrations',
    title: 'Integrations',
    intelligenceSummary: 'Connected systems, webhooks, and data flow.',
    agentMatchHints: ['integration', 'stripe', 'api', 'webhook'],
    seedPromptTemplate: 'I am on Integrations. What should I validate or reconnect?',
  },
  {
    key: 'settings',
    title: 'Settings',
    intelligenceSummary: 'Studio configuration and policy.',
    agentMatchHints: ['settings', 'config', 'policy', 'admin'],
    seedPromptTemplate: 'I am in Settings. What configuration risks should I double-check?',
  },
  {
    key: 'zirowork',
    title: 'Ziro Work',
    intelligenceSummary: 'Skills, agents, routing, and Ziro orchestration.',
    agentMatchHints: ['orchestrat', 'router', 'skill'],
    seedPromptTemplate: 'I am in Ziro Work. Help me reason about skills vs agents for my studio.',
  },
  {
    key: 'ziro_insights',
    title: 'Ziro Insights',
    intelligenceSummary: 'Analytics and operating signals.',
    agentMatchHints: ['insight', 'analytics', 'metric'],
    seedPromptTemplate: 'I am on Ziro Insights. What changed meaningfully this period?',
  },
  {
    key: 'workflows',
    title: 'Workflows',
    intelligenceSummary: 'Automation and repeatable operating plays.',
    agentMatchHints: ['workflow', 'automation'],
    seedPromptTemplate: 'I am on Workflows. What should we automate next?',
  },
  {
    key: 'analytics',
    title: 'Analytics',
    intelligenceSummary: 'Reporting and trends.',
    agentMatchHints: ['analytics', 'report'],
    seedPromptTemplate: 'I am on Analytics. What trend should I act on first?',
  },
  {
    key: 'import',
    title: 'Import',
    intelligenceSummary: 'Data onboarding and migration hygiene.',
    agentMatchHints: ['import', 'migration', 'csv'],
    seedPromptTemplate: 'I am on Import. What validation steps should I not skip?',
  },
  {
    key: 'platform',
    title: 'Platform',
    intelligenceSummary: 'Multi-tenant / company-level controls.',
    agentMatchHints: ['platform', 'company'],
    seedPromptTemplate: 'I am on Platform. What cross-studio issues need attention?',
  },
  {
    key: 'performance',
    title: 'Performance',
    intelligenceSummary: 'Speed and reliability monitoring.',
    agentMatchHints: ['performance', 'speed', 'latency'],
    seedPromptTemplate: 'I am on Performance. What regressions should I investigate?',
  },
  {
    key: 'skills_standalone',
    title: 'Skills',
    intelligenceSummary: 'Reusable skill library for Ziro.',
    agentMatchHints: ['skill'],
    seedPromptTemplate: 'I am managing Skills. Suggest how to organize the skill library.',
  },
]

export function resolveOperatingSurface(pathname: string): ZiroOperatingSurface {
  const p = pathname.replace(/\/+$/, '') || '/'
  if (p === '/admin' || p.startsWith('/admin/dashboard')) return SURFACES.find(s => s.key === 'dashboard')!
  if (p.startsWith('/admin/leads')) return SURFACES.find(s => s.key === 'leads')!
  if (p.startsWith('/admin/schedule')) return SURFACES.find(s => s.key === 'schedule')!
  if (p.startsWith('/admin/students')) return SURFACES.find(s => s.key === 'students')!
  if (p.startsWith('/admin/families')) return SURFACES.find(s => s.key === 'families')!
  if (p.startsWith('/admin/retention')) return SURFACES.find(s => s.key === 'retention')!
  if (p.startsWith('/admin/teachers')) return SURFACES.find(s => s.key === 'teachers')!
  if (p.startsWith('/admin/payroll')) return SURFACES.find(s => s.key === 'payroll')!
  if (p.startsWith('/admin/recruitment')) return SURFACES.find(s => s.key === 'recruitment')!
  if (p.startsWith('/admin/billing')) return SURFACES.find(s => s.key === 'billing')!
  if (p.startsWith('/admin/financials')) return SURFACES.find(s => s.key === 'financials')!
  if (p.startsWith('/admin/integrations')) return SURFACES.find(s => s.key === 'integrations')!
  if (p.startsWith('/admin/settings')) return SURFACES.find(s => s.key === 'settings')!
  if (p.startsWith('/admin/zirowork')) return SURFACES.find(s => s.key === 'zirowork')!
  if (p.startsWith('/admin/ziro-insights')) return SURFACES.find(s => s.key === 'ziro_insights')!
  if (p.startsWith('/admin/workflows')) return SURFACES.find(s => s.key === 'workflows')!
  if (p.startsWith('/admin/analytics')) return SURFACES.find(s => s.key === 'analytics')!
  if (p.startsWith('/admin/import')) return SURFACES.find(s => s.key === 'import')!
  if (p.startsWith('/admin/platform')) return SURFACES.find(s => s.key === 'platform')!
  if (p.startsWith('/admin/performance')) return SURFACES.find(s => s.key === 'performance')!
  if (p.startsWith('/admin/skills')) return SURFACES.find(s => s.key === 'skills_standalone')!
  return {
    key: 'unknown',
    title: 'This page',
    intelligenceSummary: 'General Ziro assistance for the current screen.',
    agentMatchHints: [],
    seedPromptTemplate: 'Help me with what I am looking at in the admin app right now.',
  }
}
