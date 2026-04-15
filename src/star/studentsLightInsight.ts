/**
 * First-click Students (Ziro): minimal PAGE CONTEXT so the edge `system_override` path stays small.
 * Full roster export belongs in follow-up flows, not blocking the initial insight call.
 *
 * Tab counts from `useStudentTabCounts` are tenant-wide; roster sample reflects current filters / director scope.
 */

const ROSTER_SAMPLE_CAP = 200

export interface StudentsLightInsightInput {
  activeTab: 'active' | 'former' | 'all'
  tabCounts: { active: number; former: number; all: number }
  /** Human-readable filter lines (already scoped, e.g. studio director location). */
  filterLines: string[]
  /** Already-loaded roster rows (filtered list or infinite pages) — instrument mix only, capped. */
  rosterRowsForSample: Array<{ instrument?: string | null }>
  leadsPipelineCount: number
}

export function buildStudentsLightInsightPageBody(input: StudentsLightInsightInput): string {
  const mix: Record<string, number> = {}
  for (const r of input.rosterRowsForSample.slice(0, ROSTER_SAMPLE_CAP)) {
    const k = (r.instrument && String(r.instrument).trim()) || 'unspecified'
    mix[k] = (mix[k] ?? 0) + 1
  }
  const top = Object.entries(mix).sort((a, b) => b[1] - a[1]).slice(0, 10)
  const mixLine = top.length ? top.map(([k, v]) => `${k}: ${v}`).join(', ') : 'no instruments in loaded rows'

  return [
    'LIGHTWEIGHT STUDENTS VIEW (first insight — not a full export)',
    `Current tab: ${input.activeTab}`,
    'Headline tab counts (whole tenant from students table): ' +
      `active ${input.tabCounts.active}, former/inactive ${input.tabCounts.former}, all rows ${input.tabCounts.all}`,
    input.filterLines.length ? `Active filters:\n${input.filterLines.map((l) => `- ${l}`).join('\n')}` : 'Active filters: none',
    `Leads in pipeline (excluding enrolled/lost): ${input.leadsPipelineCount}`,
    `Instrument mix from first ${ROSTER_SAMPLE_CAP} loaded roster rows under current filters (approximate, not full school): ${mixLine}`,
    'For school-wide totals and billing, use the LIVE BUSINESS SNAPSHOT in the system prompt.',
  ].join('\n')
}

/** Canned question: short so the model spends tokens on the answer, not parsing. */
export const STUDENTS_FIRST_INSIGHT_QUESTION =
  'Give 3-4 short, student-roster focused action items: growth, capacity, who to contact, instrument/teacher gaps. Use only the system context. No preamble.'
