import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuthContext } from '../app/AuthContext'
import { qk } from '../lib/queryKeys'

// ─── Types ───────────────────────────────────────────

export interface Issue {
  id: string
  tenant_id: string
  reported_by: string
  reported_by_role: string
  page: string
  section: string
  subsection: string | null
  element_description: string
  title: string
  description: string
  steps_to_reproduce: string | null
  user_friendly_category: string | null
  screenshot_path: string | null
  category: 'bug' | 'display' | 'data' | 'feature_request'
  severity: 'critical' | 'high' | 'normal' | 'low'
  status: string
  resolution_notes: string | null
  resolved_at: string | null
  resolved_by: string | null
  related_issue_id: string | null
  pipeline_prompt: string | null
  pipeline_started_at: string | null
  pipeline_completed_at: string | null
  deploy_status: string
  created_at: string
  updated_at: string
  // joined
  reporter_name?: string
}

export type StatusGroup = 'all' | 'open' | 'resolved' | 'failed' | 'wont_fix'

const STATUS_GROUPS: Record<StatusGroup, string[]> = {
  all: [],
  open: ['reported', 'queued', 'diagnosing', 'fixing', 'deploying'],
  resolved: ['resolved'],
  failed: ['failed_build'],
  wont_fix: ['wont_fix', 'duplicate'],
}

// ─── Page → Section → Subsection Cascade Map ────────
// SINGLE SOURCE OF TRUTH for all issue location dropdowns.
// Structure: { [page]: { [section]: string[] | null } }
// null subsections = no subsection dropdown for that section.

export interface CascadeSection {
  [section: string]: string[] | null
}

export const CASCADE_MAP: Record<string, CascadeSection> = {
  'Studio Overview (Dashboard)': {
    'Stats Cards': ['Revenue card', 'Students card', 'Sessions card', 'Retention card'],
    'Schedule Preview': ["Today's sessions", 'Upcoming sessions'],
    'Alerts': ['Billing alerts', 'Retention alerts', 'Lead alerts'],
    'AI Insights': ['Ziro recommendations'],
  },
  'New Members (Leads)': {
    'Lead List': ['Search/filter bar', 'Lead cards', 'Sort controls'],
    'Lead Detail Modal': ['Overview tab', 'Intake Form tab', 'Activity Log tab'],
    'Lead Actions': ['Send Text', 'Log Call', 'Send Email', 'Find Teacher', 'AI Overview'],
    'Lead Pipeline': ['Stage dropdown', 'Mark Lost modal', 'Advance button'],
    'Data Grid': ['Inline edits', 'Column sorting'],
  },
  'Schedule': {
    'Grid View': ['Time slots', 'Booked blocks', 'Open blocks'],
    'Teacher Pills': ['Filter bar', 'Focus mode'],
    'Block Actions': ['Assign modal', 'Detail modal', 'Drag-drop'],
    'Header': ['Location dropdown', 'Date navigation', 'Legend'],
    'Mobile Schedule': ['Horizontal scroll', 'Teacher rows'],
  },
  'Roster — Students': {
    'Student List': ['Search', 'Filters', 'Sort', 'Student cards'],
    'Student Detail': ['Name/header section', 'Edit pencil', 'Status badge'],
    'Student Info': ['Instrument', 'Age', 'Location', 'Teacher', 'Rate'],
    'Family Section': ['Family name', 'Contact info', 'Edit family pencil'],
    'Billing on Student': ['Bill Student button', 'Sessions', 'Rate'],
    'Retention': ['Status change', 'Exit interview modal', 'Cancel flow'],
  },
  'Roster — Families': {
    'Family List': ['Search', 'Filters', 'Sort', 'Family cards'],
    'Family Detail Modal': ['Account tab', 'Contact tab', 'Billing tab', 'Notifications tab'],
    'Family Contact': ['Primary contact fields', 'Emergency contact fields'],
    'Family Billing': ['Rate tier', 'Card on file', 'Balance', 'Create Invoice'],
    'Notification Preferences': ['SMS toggle', 'Email toggle', 'Reminder toggles'],
    'Student List': ['Student rows', 'Instrument display', 'Teacher display'],
  },
  'Backstage — Retention': {
    'At-Risk List': ['Student cards', 'Risk indicators'],
    'Retention Actions': ['Outreach', 'Status changes'],
    'Filters': ['Risk level', 'Location', 'Date range'],
  },
  'Backstage — Recruitment': {
    'Pipeline View': ['Stage columns', 'Lead counts'],
    'Conversion Metrics': ['Stats', 'Charts'],
  },
  'The Band — Teachers': {
    'Teacher List': ['Search', 'Filters', 'Teacher cards'],
    'Teacher Detail': ['Profile info', 'Edit pencil'],
    'Teacher Schedule': ['Availability', 'Assigned blocks'],
    'Documents': ['Contract status', 'W-9 status', 'View PDF buttons'],
    'Payroll': ['Pay rate', 'Session counts'],
  },
  'The Band — Payroll': {
    'Payroll Summary': ['Pay period', 'Totals'],
    'Teacher Breakdown': ['Individual pay', 'Session counts'],
    'Export/Download': ['Reports'],
  },
  'Your Books — Billing': {
    'Billing Dashboard': ['Health stats', 'Revenue', 'Outstanding'],
    'Invoice List': ['Filters', 'Invoice rows', 'Status badges'],
    'Invoice Detail': ['Line items', 'Payment status'],
    'Square Sync': ['Sync tab', 'Match/mismatch display'],
  },
  'Your Books — Financials': {
    'Revenue Reports': ['Charts', 'Breakdowns'],
    'Location Comparison': ['Per-location stats'],
  },
  'Settings': {
    'General': ['School name', 'Branding', 'Logo'],
    'Locations': ['Location cards', 'Hours', 'Rooms'],
    'Team': ['User list', 'Role assignments'],
    'Integrations': ['Connected services', 'API keys'],
    'Issues': ['Issue report form', 'Issue log'],
  },
  'Login / Auth': {
    'Login Page': ['Email field', 'Password field', 'Login button'],
    'Password Reset': ['Reset form'],
  },
  'Bottom Navigation (Mobile)': {
    'Tab Bar': ['Studio', 'Schedule', 'Roster', 'New Members', 'More'],
    'More Sheet': ['Sheet open/close', 'Navigation items'],
  },
  'Other': {
    'Other': null,
  },
}

export const PAGES = Object.keys(CASCADE_MAP)

export function getSectionsForPage(page: string): string[] {
  return page ? Object.keys(CASCADE_MAP[page] ?? {}) : []
}

export function getSubsectionsForSection(page: string, section: string): string[] | null {
  if (!page || !section) return null
  return CASCADE_MAP[page]?.[section] ?? null
}

// Keep legacy export for backward compat with IssueRow breadcrumb
export const PAGE_SECTION_MAP = Object.fromEntries(
  Object.entries(CASCADE_MAP).map(([page, sections]) => [page, Object.keys(sections)])
)

export const CATEGORIES = [
  { value: 'bug', label: "Something's not working", helper: "A button, page, or feature isn't doing what it should", pillLabel: 'Not working', color: '#D4226A' },
  { value: 'display', label: "Doesn't look right", helper: 'Something looks off, overlapping, or hard to read', pillLabel: 'Looks wrong', color: '#fb923c' },
  { value: 'data', label: 'Wrong or missing info', helper: 'Information is incorrect, missing, or not saving', pillLabel: 'Wrong info', color: '#FFB800' },
  { value: 'feature_request', label: 'Feature idea', helper: 'A new feature or change you\'d like to see', pillLabel: 'Feature idea', color: '#8B5CF6' },
] as const

export const DESCRIPTION_MAX_LENGTH = 1500

export function getFriendlyCategory(categoryValue: string): string {
  return CATEGORIES.find(c => c.value === categoryValue)?.friendlyLabel ?? categoryValue
}

export const SEVERITIES = [
  { value: 'critical', label: "Can't do my job", color: '#EF4444', hint: 'Something is completely broken and blocking work' },
  { value: 'high', label: 'Slowing me down', color: '#fb923c', hint: 'A big feature is broken but the app still works' },
  { value: 'normal', label: 'Annoying', color: '#8080A8', hint: "Something's off but I can work around it" },
  { value: 'low', label: 'Minor', color: '#55516E', hint: 'Small visual or cosmetic issue' },
] as const

export const STATUS_COLORS: Record<string, string> = {
  reported: '#FFB800',
  queued: '#3b82f6',
  diagnosing: '#3b82f6',
  fixing: '#fb923c',
  deploying: '#fb923c',
  resolved: '#22C55E',
  failed_build: '#EF4444',
  wont_fix: '#55516E',
  duplicate: '#55516E',
}

export const STATUS_LABELS: Record<string, string> = {
  reported: 'New',
  queued: 'Working on it',
  diagnosing: 'Looking into it',
  fixing: 'Working on it',
  deploying: 'Almost done',
  resolved: 'Fixed',
  failed_build: 'Needs attention',
  wont_fix: "Won't Fix",
  duplicate: 'Already reported',
}

// ─── Query: list issues ─────────────────────────────

export function useIssues(statusGroup: StatusGroup = 'all') {
  const { tenantId } = useAuthContext()

  return useQuery<Issue[]>({
    queryKey: [...qk.issues.all, tenantId, statusGroup],
    enabled: !!tenantId,
    staleTime: 1000 * 30,
    refetchOnMount: true,
    queryFn: async () => {
      let q = supabase
        .from('issues')
        .select('*, profiles!reported_by(first_name, last_name)')
        .eq('tenant_id', tenantId!)
        .order('created_at', { ascending: false })

      const statuses = STATUS_GROUPS[statusGroup]
      if (statuses.length > 0) {
        q = q.in('status', statuses)
      }

      const { data, error } = await q
      if (error) throw error

      return (data ?? []).map((row: any) => ({
        ...row,
        reporter_name: row.profiles
          ? `${row.profiles.first_name ?? ''} ${row.profiles.last_name ?? ''}`.trim()
          : 'Unknown',
        profiles: undefined,
      }))
    },
  })
}

// ─── Mutation: create issue ─────────────────────────

export function useCreateIssue() {
  const { tenantId, profile } = useAuthContext()
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (params: {
      title: string
      page: string
      section: string
      subsection: string | null
      platform: string
      element_description: string
      category: string
      severity: string
      description: string
      steps_to_reproduce?: string | null
      user_friendly_category?: string | null
      screenshotFile?: File | null
    }) => {
      if (!tenantId || !profile) throw new Error('Not authenticated')

      try {
        const payload = {
          tenant_id: tenantId,
          reported_by: profile.id,
          reported_by_role: profile.role,
          title: params.title,
          page: params.page,
          section: params.section,
          subsection: params.subsection,
          platform: params.platform,
          element_description: params.element_description,
          category: params.category,
          severity: params.severity,
          description: params.description,
          steps_to_reproduce: params.steps_to_reproduce ?? null,
          user_friendly_category: params.user_friendly_category ?? getFriendlyCategory(params.category) ?? null,
          reported_from_url: window.location.pathname,
          reported_screen_width: window.innerWidth,
          reported_screen_height: window.innerHeight,
          status: 'reported',
          deploy_status: 'pending',
        }
        console.log('[useCreateIssue] inserting:', payload)

        // 1. Insert issue row
        const { data: issue, error } = await supabase
          .from('issues')
          .insert(payload)
          .select()
          .single()

        if (error) {
          console.error('[useCreateIssue] insert failed:', error)
          throw error
        }

        // 2. Upload screenshot if provided
        if (params.screenshotFile && issue) {
          const path = `${tenantId}/${issue.id}/${params.screenshotFile.name}`
          const { error: uploadErr } = await supabase.storage
            .from('issue-screenshots')
            .upload(path, params.screenshotFile)

          if (!uploadErr) {
            await supabase.from('issues').update({ screenshot_path: path }).eq('id', issue.id)
          }
        }

        // 3. Audit log (fire and forget — don't block on failure)
        supabase.from('audit_log').insert({
          tenant_id: tenantId,
          action: 'ISSUE_REPORTED',
          table_name: 'issues',
          record_id: issue.id,
          new_value: { title: params.title, page: params.page, section: params.section, category: params.category, severity: params.severity },
          performed_by: profile.id,
        }).then(() => {}).catch((err: any) => console.error('[audit_log] insert failed:', err))

        return issue
      } catch (err) {
        console.error('[useCreateIssue] failed:', err)
        throw err
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.issues.all })
    },
  })
}

// ─── Mutation: update issue (admin actions) ─────────

export function useUpdateIssue() {
  const { tenantId, profile } = useAuthContext()
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (params: {
      id: string
      status?: string
      resolution_notes?: string
      resolved_by?: string
      resolved_at?: string
      related_issue_id?: string | null
      deploy_status?: string
      pipeline_prompt?: string | null
      pipeline_started_at?: string | null
      pipeline_completed_at?: string | null
    }) => {
      if (!tenantId || !profile) throw new Error('Not authenticated')

      const { id, ...updates } = params
      const { error } = await supabase
        .from('issues')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', id)

      if (error) throw error

      // Audit log (fire and forget)
      supabase.from('audit_log').insert({
        tenant_id: tenantId,
        action: `ISSUE_${(params.status ?? 'UPDATED').toUpperCase()}`,
        table_name: 'issues',
        record_id: id,
        new_value: updates,
        performed_by: profile.id,
      }).then(() => {}).catch((err: any) => console.error('[audit_log] insert failed:', err))
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.issues.all })
    },
  })
}

// ─── Helper: check for potential duplicates ──────────

export async function checkForDuplicateIssue(tenantId: string, page: string, description: string): Promise<{ id: string; title: string } | null> {
  // Look for recent issues on the same page with similar content (last 7 days)
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - 7)

  const { data } = await supabase
    .from('issues')
    .select('id, title, description')
    .eq('tenant_id', tenantId)
    .eq('page', page)
    .in('status', ['reported', 'queued', 'diagnosing', 'fixing', 'deploying'])
    .gte('created_at', cutoff.toISOString())
    .order('created_at', { ascending: false })
    .limit(20)

  if (!data || data.length === 0) return null

  // Simple similarity check — see if any words overlap substantially
  const descWords = new Set(description.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(w => w.length > 3))
  if (descWords.size === 0) return null

  for (const issue of data) {
    const issueWords = new Set(
      `${issue.title} ${issue.description}`.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter((w: string) => w.length > 3)
    )
    let matches = 0
    for (const w of descWords) {
      if (issueWords.has(w)) matches++
    }
    const overlap = matches / descWords.size
    if (overlap >= 0.5 && matches >= 3) {
      return { id: issue.id, title: issue.title }
    }
  }

  return null
}

// ─── Helper: get screenshot URL ─────────────────────

export function useScreenshotUrl(path: string | null) {
  return useQuery({
    queryKey: qk.issues.screenshot(path),
    enabled: !!path,
    staleTime: 55 * 60 * 1000,
    queryFn: async () => {
      const { data } = await supabase.storage
        .from('issue-screenshots')
        .createSignedUrl(path!, 3600)
      return data?.signedUrl ?? null
    },
  })
}
