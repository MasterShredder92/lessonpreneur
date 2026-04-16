import type { ZiroPageAttach, ZiroPageId } from './types'

const PAGE_TITLES: Record<ZiroPageId, string> = {
  global_modal: 'Global (Ziro panel)',
  dashboard: 'Dashboard',
  students: 'Students',
  families: 'Families',
  family_detail: 'Family detail',
  schedule_business: 'Schedule',
  billing: 'Billing',
  leads: 'Leads',
  lessons: 'Lessons / sessions',
}

export function ziroPageDisplayName(pageId: ZiroPageId): string {
  return PAGE_TITLES[pageId] ?? pageId
}

/**
 * Layer 2: page context after layer 1 global snapshot (`formatZiroPrompt` output).
 */
export function appendPageContextToZiroPrompt(globalPrompt: string, page: ZiroPageAttach): string {
  const body = page.body.trim()
  if (!body) return globalPrompt

  return `${globalPrompt}

== PAGE CONTEXT (${page.displayName}) [page=${page.pageId}] ==
${body}

How to use both layers:
- Use PAGE CONTEXT for this screen’s tab, filters, search, export slice, or selected record(s).
- Use the LIVE BUSINESS SNAPSHOT above for school-wide aggregates and billing snapshot figures.
- If the user compares “this list” to “the whole school”, explain that the page slice may be filtered.
- If a detail on the page conflicts with a tenant rollup, trust PAGE CONTEXT for the current record and the SNAPSHOT for totals unless the snapshot is explicitly scoped (e.g. one location).`
}
