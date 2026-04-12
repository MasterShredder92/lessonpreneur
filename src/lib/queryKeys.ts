/**
 * Centralized query key factories.
 *
 * Every TanStack Query key used across the app should be defined here
 * so invalidation targets stay in sync with query definitions.
 *
 * Pattern: each domain exports a factory object whose methods return
 * readonly tuples. Use the factory in both `queryKey` and `invalidateQueries`.
 *
 * Example:
 *   useQuery({ queryKey: qk.students.list(tenantId), ... })
 *   qc.invalidateQueries({ queryKey: qk.students.all })
 */

export const qk = {
  // ── Dashboard ──────────────────────────────────
  dashboard: {
    all: ['dashboard'] as const,
    data: (tenantId: string | null, locationScope?: string[] | string) => ['dashboard', tenantId, locationScope] as const,
    happeningToday: ['happening-today-feed'] as const,
  },

  // ── Students ───────────────────────────────────
  students: {
    all: ['students'] as const,
    list: (tenantId: string | null) => ['students', tenantId] as const,
    detail: (id: string) => ['students', 'detail', id] as const,
    roster: ['students_roster'] as const,
    former: ['former-students'] as const,
    forAssignment: ['students-for-assignment'] as const,
    forTips: ['students-for-tips'] as const,
    achievements: (studentId: string) => ['student-achievements', studentId] as const,
    blocks: (studentId: string) => ['student-blocks', studentId] as const,
    files: (studentId: string) => ['student-files', studentId] as const,
    instruments: (studentId: string) => ['student-instruments', studentId] as const,
    sessionLogs: (studentId: string) => ['student-session-logs', studentId] as const,
    sessionTracker: (studentId: string) => ['student-session-tracker', studentId] as const,
    tabCounts: (studentId: string) => ['student-tab-counts', studentId] as const,
    followups: ['student_followups'] as const,
  },

  // ── Families ───────────────────────────────────
  families: {
    all: ['families'] as const,
    list: (tenantId: string | null) => ['families', tenantId] as const,
    page: ['families_page'] as const,
    roster: ['families_roster'] as const,
    detail: (id: string) => ['family', id] as const,
    byEmail: (email: string) => ['family-by-email', email] as const,
    contactInfo: (familyId: string) => ['family-contact-info', familyId] as const,
    tabCounts: (tenantId: string | null) => ['family-tab-counts', tenantId] as const,
    activity: (familyId: string) => ['family_activity', familyId] as const,
    billing: (familyId: string) => ['family_billing', familyId] as const,
    fileDetail: (familyId: string) => ['family_detail', familyId] as const,
    files: (familyId: string) => ['family_files', familyId] as const,
    filesStats: (familyId: string) => ['family_files_stats', familyId] as const,
    invStudents: (familyId: string) => ['family_inv_students', familyId] as const,
    rate: (familyId: string) => ['family_rate', familyId] as const,
  },

  // ── Leads ──────────────────────────────────────
  leads: {
    all: ['leads'] as const,
    list: (tenantId: string | null, filters?: { locationId?: string; instrument?: string }) =>
      ['leads', tenantId, filters?.locationId ?? '', filters?.instrument ?? ''] as const,
    lost: ['lost-leads'] as const,
    duplicateReviews: (tenantId: string | null) => ['student_duplicate_reviews', tenantId] as const,
  },

  intakeSubmission: {
    detail: (id: string) => ['intake_submission', id] as const,
  },

  // ── Teachers ───────────────────────────────────
  teachers: {
    all: ['teachers'] as const,
    list: (tenantId: string | null, compensation?: boolean) => ['teachers', tenantId, compensation] as const,
    detail: (id: string) => ['teachers', 'detail', id] as const,
    record: (id: string) => ['teacher_record', id] as const,
    atLocation: (locationId: string) => ['teachers-at-location', locationId] as const,
    teacherAtLocation: (teacherId: string, locationId: string) => ['teacher-at-location', teacherId, locationId] as const,
    availability: (teacherId: string) => ['teacher-availability', teacherId] as const,
    availSchedule: (teacherId: string) => ['teacher-avail-schedule', teacherId] as const,
    blocks: (teacherId: string) => ['teacher-blocks', teacherId] as const,
    calloutHistory: (teacherId: string) => ['teacher-callout-history', teacherId] as const,
    calloutTally: ['teacher-callout-tally'] as const,
    closeoutStatus: ['teacher-closeout-status'] as const,
    documents: (teacherId: string) => ['teacher-documents', teacherId] as const,
    documentsAlt: (teacherId: string) => ['teacher_documents', teacherId] as const,
    locations: (teacherId: string) => ['teacher-locations', teacherId] as const,
    notes: (teacherId: string) => ['teacher-notes', teacherId] as const,
    paySummary: (teacherId: string) => ['teacher-pay-summary', teacherId] as const,
    performance: (tenantId: string | null) => ['teacher-performance', tenantId] as const,
    recapReminders: ['teacher-recap-reminders-24h'] as const,
    roomAssignment: (teacherId: string) => ['teacher-room-assignment', teacherId] as const,
    roomAssignmentsDay: ['teacher-room-assignments-day'] as const,
    spreadsheet: (tenantId: string | null) => ['teacher-spreadsheet', tenantId] as const,
    spreadsheetAvailability: (teacherId: string) => ['teacher-spreadsheet-availability', teacherId] as const,
    studentDetail: (studentId: string) => ['teacher-student-detail', studentId] as const,
    studentNotes: (teacherId: string, studentId: string) => ['teacher-student-notes', teacherId, studentId] as const,
    students: (teacherId: string) => ['teacher-students', teacherId] as const,
    studentsAlt: (teacherId: string) => ['teacher_students', teacherId] as const,
    uploads: (teacherId: string) => ['teacher-uploads', teacherId] as const,
    scheduleUpdates: ['teacher_schedule_updates'] as const,
    student: (studentId: string) => ['teacher_student', studentId] as const,
    studentFiles: ['teacher_student_files'] as const,
    tasks: (teacherId: string) => ['teacher_tasks', teacherId] as const,
    today: (teacherId: string) => ['teacher_today', teacherId] as const,
    w9: (teacherId: string) => ['teacher_w9', teacherId] as const,
    w9Status: (teacherId: string) => ['teacher_w9_status', teacherId] as const,
    monthlyTally: ['teachers-monthly-tally'] as const,
    sub: ['sub-teachers'] as const,
  },

  // ── Schedule ───────────────────────────────────
  schedule: {
    all: ['schedule-grid'] as const,
    grid: (tenantId: string | null, locationId?: string, date?: string) =>
      ['schedule-grid', tenantId, locationId, date] as const,
    intelligence: ['schedule-intelligence'] as const,
    sessionsOnDate: (date: string) => ['sessions-on-date', date] as const,
    rescheduleSlots: ['reschedule-slots'] as const,
    availableBlocks: (studentId: string) => ['available-blocks-for-student', studentId] as const,
  },

  // ── Billing ────────────────────────────────────
  billing: {
    all: ['billing'] as const,
    snapshot: ['billing_snapshot'] as const,
    overview: ['billing_overview'] as const,
    families: ['billing_families'] as const,
    heroStats: ['billing_hero_stats'] as const,
    dashboard: ['billing_dashboard'] as const,
    adjustments: ['billing_adjustments'] as const,
    credits: ['billing_credits'] as const,
    events: ['billing_events'] as const,
    lineItems: ['billing_line_items'] as const,
    nextCycle: ['billing_next_cycle'] as const,
    overdue: ['billing_overdue'] as const,
    paid: ['billing_paid'] as const,
    periods: ['billing_periods'] as const,
    remaining: ['billing_remaining'] as const,
    manualPay: ['manual-pay-families'] as const,
    autopayStats: ['autopay-stats'] as const,
  },

  // ── Retention ──────────────────────────────────
  retention: {
    all: ['retention'] as const,
    churnRisk: ['churn-risk'] as const,
    churnRiskStudent: (studentId: string) => ['churn-risk-student', studentId] as const,
    campaigns: (tenantId: string | null) => ['retention-campaigns', tenantId] as const,
    metrics: ['retention-metrics'] as const,
    pendingWinbacks: ['pending-winbacks'] as const,
    winBackMetrics: ['win-back-metrics'] as const,
  },

  // ── Session notes / logs ───────────────────────
  sessions: {
    all: ['session-log'] as const,
    notes: (studentId: string) => ['session-notes', studentId] as const,
    teacherDay: ['teacher-day-blocks'] as const,
    missingNotes: ['missing_notes'] as const,
    handoffNotes: ['handoff_notes'] as const,
  },

  // ── Communications ─────────────────────────────
  communications: {
    student: (studentId: string) => ['student-communications', studentId] as const,
    family: (familyId: string) => ['family-communications', familyId] as const,
    adminFamily: (familyId: string) => ['admin-family-messages', familyId] as const,
    adminFamilyLocation: (locationId: string) => ['admin-family-msg-location', locationId] as const,
  },

  // ── Ziro (AI operating layer) / legacy Star cache key ──────────────────
  ziro: {
    context: (tenantId: string | null, role?: string, locationKey?: string, billingKey?: string) =>
      ['ziro-context', tenantId, role ?? 'unknown', locationKey ?? 'none', billingKey ?? 'all'] as const,
  },
  /** @deprecated Use qk.ziro.context — kept for one-off cache reads during migration */
  star: {
    context: (tenantId: string | null, role?: string, locationKey?: string, billingKey?: string) =>
      ['ziro-context', tenantId, role ?? 'unknown', locationKey ?? 'none', billingKey ?? 'all'] as const,
  },

  // ── SMS Stats ──────────────────────────────────
  sms: {
    stats: (tenantId: string | null) => ['sms-stats', tenantId] as const,
  },

  // ── Tasks ──────────────────────────────────────
  tasks: {
    all: ['tasks'] as const,
    list: (tenantId: string | null) => ['tasks', tenantId] as const,
  },

  // ── Stripe / tenant billing ────────────────────
  stripe: {
    connect: (tenantId: string | null) => ['stripe-connect', tenantId] as const,
    tenantBilling: (tenantId: string | null) => ['tenant-billing', tenantId] as const,
  },

  // ── Email ──────────────────────────────────────
  email: {
    brand: (locationId: string | null) => ['email-brand', locationId] as const,
  },

  // ── Financials ─────────────────────────────────
  financials: {
    all: ['financials'] as const,
    expenses: ['expenses'] as const,
    plSummary: ['pl-summary'] as const,
    refunds: ['refunds'] as const,
  },

  // ── Analytics ──────────────────────────────────
  analytics: {
    all: ['analytics'] as const,
  },

  // ── Import ─────────────────────────────────────
  import: {
    all: ['import'] as const,
  },

  // ── Onboarding ─────────────────────────────────
  onboarding: {
    checklist: ['onboarding-checklist'] as const,
    mode: ['onboarding-mode'] as const,
    pipeline: ['onboarding-pipeline'] as const,
  },

  // ── Locations ──────────────────────────────────
  locations: {
    all: ['locations'] as const,
    hours: (locationId: string) => ['location-hours', locationId] as const,
    reviewInfo: (locationId: string) => ['location-review-info', locationId] as const,
    profile: ['profile-locations'] as const,
    user: ['user-locations'] as const,
    closures: ['studio-closures'] as const,
  },

  // ── Rooms ──────────────────────────────────────
  rooms: {
    all: ['rooms'] as const,
    simple: ['rooms-simple'] as const,
  },

  // ── Payroll ────────────────────────────────────
  payroll: {
    entries: ['payroll-entries'] as const,
    period: ['payroll-period'] as const,
    periods: ['payroll-periods'] as const,
    tips: ['tips'] as const,
  },

  // ── Invoices ───────────────────────────────────
  invoices: {
    pendingCount: ['invoice_pending_count'] as const,
    tokensList: ['invoice_tokens_list'] as const,
    paymentHistory: ['payment_history'] as const,
  },

  // ── Parent portal ──────────────────────────────
  parent: {
    accountFamily: ['parent-account-family'] as const,
    accountPendingRequest: ['parent-account-pending-request'] as const,
    familyBilling: ['parent-family-billing'] as const,
    familyId: ['parent-family-id'] as const,
    familyName: ['parent-family-name'] as const,
    familyStudentRates: ['parent-family-student-rates'] as const,
    invoices: ['parent-invoices'] as const,
    milestones: ['parent-milestones'] as const,
    sessions: ['parent-sessions'] as const,
    students: ['parent-students'] as const,
    studioPhone: ['parent-studio-phone'] as const,
    upcoming: ['parent-upcoming'] as const,
  },

  // ── Portal (teacher/parent) ────────────────────
  portal: {
    family: ['portal-family'] as const,
    files: ['portal-files'] as const,
    milestones: ['portal-milestones'] as const,
    notes: ['portal-notes'] as const,
    reports: ['portal-reports'] as const,
    schedule: ['portal-schedule'] as const,
    sessionCount: ['portal-session-count'] as const,
  },

  // ── Practice ───────────────────────────────────
  practice: {
    history: (studentId: string) => ['practice-history', studentId] as const,
    stats: (studentId: string) => ['practice-stats', studentId] as const,
  },

  // ── Reviews ────────────────────────────────────
  reviews: {
    admin: ['admin-reviews'] as const,
    featured: ['featured-reviews'] as const,
    queue: ['review-queue'] as const,
    request: (familyId: string) => ['review_request', familyId] as const,
    requestsList: ['review_requests_list'] as const,
  },

  // ── Referrals ──────────────────────────────────
  referrals: {
    code: ['referral-code'] as const,
    stats: ['referral-stats'] as const,
  },

  // ── Permissions ────────────────────────────────
  permissions: {
    all: ['permissions'] as const,
  },

  // ── Issues ─────────────────────────────────────
  issues: {
    all: ['issues'] as const,
    screenshot: (id: string) => ['issue-screenshot', id] as const,
  },

  // ── Integrations ───────────────────────────────
  integrations: {
    configs: ['integration_configs'] as const,
  },

  // ── Tenant / settings ──────────────────────────
  tenant: {
    settings: ['tenant-settings'] as const,
    info: ['tenant'] as const,
    brand: ['brand-settings'] as const,
    theme: ['theme'] as const,
    platform: ['platform-tenants'] as const,
  },

  // ── Square sync ────────────────────────────────
  square: {
    sync: (tenantId: string | null) => ['square-sync', tenantId] as const,
  },

  // ── Campaigns ──────────────────────────────────
  campaigns: {
    list: ['campaign-list'] as const,
    stats: ['campaign-stats'] as const,
  },

  // ── Director ───────────────────────────────────
  director: {
    closeoutStatus: ['director-closeout-status'] as const,
    weeklySummaries: ['weekly-location-summaries'] as const,
    virtualSummary: ['virtual-summary-last-month'] as const,
  },

  // ── Activity log ───────────────────────────────
  activity: {
    log: ['activity-log'] as const,
    masterEditor: ['master-editor-log'] as const,
  },

  // ── AI / Workflows ─────────────────────────────
  ai: {
    workflows: ['ai-workflows'] as const,
  },

  // ── Moderation ─────────────────────────────────
  moderation: {
    queue: ['moderation-queue'] as const,
  },

  // ── Recruitment ────────────────────────────────
  recruitment: {
    prospects: ['recruitment-prospects'] as const,
  },

  // ── Block notifications ────────────────────────
  blocks: {
    notifications: ['block-notifications'] as const,
  },

  // ── DataGrid ───────────────────────────────────
  datagrid: {
    all: ['datagrid'] as const,
  },

  // ── Reminders ──────────────────────────────────
  reminders: {
    pending: ['pending-reminders'] as const,
  },

  // ── Team ───────────────────────────────────────
  team: {
    members: ['team_members'] as const,
  },

  // ── Value cards ────────────────────────────────
  valueCards: {
    queue: ['value-card-queue'] as const,
  },

  // ── W9 Export ──────────────────────────────────
  w9: {
    exportList: ['w9_export_list'] as const,
  },

  // ── Flagged inventory ──────────────────────────
  flagged: {
    inventory: ['flagged-inventory'] as const,
  },

  // ── At-risk students ───────────────────────────
  atRisk: {
    students: ['at-risk-students'] as const,
  },

  // ── Ziro / AI observability (internal report) ──
  aiObservability: {
    report: (
      tenantId: string,
      f: {
        dateFrom: string
        dateTo: string
        profileId: string
        routeContains: string
        source: string
        actionId: string
      },
    ) =>
      [
        'ai-observability',
        'report',
        tenantId,
        f.dateFrom,
        f.dateTo,
        f.profileId,
        f.routeContains,
        f.source,
        f.actionId,
      ] as const,
    teamProfiles: (tenantId: string | null) => ['ai-observability', 'team-profiles', tenantId] as const,
  },
} as const
