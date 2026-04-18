export type PageSegment =
  | 'leads'
  | 'scheduling'
  | 'retention'
  | 'teachers'
  | 'students'
  | 'financials'
  | 'dashboard'

export function useLeadsInsights(): string[] {
  return ['You have 12 hot leads.', 'Follow up within 24h for best conversion.']
}

export function useSchedulingInsights(): string[] {
  return ['3 teachers have open availability.', 'Peak demand window: Tue–Thu afternoons.']
}

export function useRetentionInsights(): string[] {
  return ['Retention risk increased 4% this week.', '4 students have not booked in 21 days.']
}

export function useBillingInsights(): string[] {
  return ['2 invoices are overdue.', 'Cash collected is on track for the month.']
}

/** Picks insight strings for the route; always runs all domain hooks (Rules of Hooks). */
export function usePageInsights(segment: PageSegment): string[] {
  const leads = useLeadsInsights()
  const scheduling = useSchedulingInsights()
  const retention = useRetentionInsights()
  const billing = useBillingInsights()

  switch (segment) {
    case 'leads':
      return leads
    case 'scheduling':
      return scheduling
    case 'retention':
      return retention
    case 'financials':
      return billing
    case 'teachers':
      return [scheduling[0] ?? '', '1 observation is due this month.'].filter(Boolean)
    case 'students':
      return ['Enrollment is up 6% vs last month.', '5 students are due for level assessments.']
    case 'dashboard':
      return [leads[0] ?? '', scheduling[0] ?? '', retention[0] ?? '', billing[0] ?? ''].filter(Boolean)
  }
}

/** First path segment under `/admin`, mapped to intelligence segments (e.g. `schedule` → `scheduling`). */
export function adminPathToPageSegment(pathname: string): PageSegment {
  if (!pathname.startsWith('/admin')) return 'dashboard'
  const raw = pathname.replace(/^\/admin\/?/, '').split('/')[0]?.toLowerCase() || 'dashboard'
  if (raw === '' || raw === 'dashboard') return 'dashboard'
  if (raw === 'leads') return 'leads'
  if (raw === 'schedule' || raw === 'scheduling') return 'scheduling'
  if (raw === 'retention') return 'retention'
  if (raw === 'teachers') return 'teachers'
  if (raw === 'students') return 'students'
  if (raw === 'financials' || raw === 'billing') return 'financials'
  return 'dashboard'
}

/** Same as {@link usePageInsights}; call only from component bodies (hook). */
export const getPageInsights = usePageInsights
