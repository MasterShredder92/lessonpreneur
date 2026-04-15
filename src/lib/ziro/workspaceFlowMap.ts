/**
 * UI-only visualization for Agent Workspace (Batch 2) — not authoritative backend.
 * Describes typical data touchpoints and actions per operating surface.
 */
import type { ZiroOperatingSurfaceKey } from './pageSurfaceRegistry'

export type WorkspaceFlowSlice = {
  /** CRM tables / entities this surface usually reads or writes */
  dataEntities: string[]
  /** Representative actions (RPCs, mutations, UI) — labels only */
  actionLabels: string[]
}

const DEFAULT_SLICE: WorkspaceFlowSlice = {
  dataEntities: ['Tenant-scoped tables'],
  actionLabels: ['React Query + Supabase client'],
}

const MAP: Partial<Record<ZiroOperatingSurfaceKey, WorkspaceFlowSlice>> = {
  dashboard: {
    dataEntities: ['leads', 'schedule_blocks', 'students', 'families'],
    actionLabels: ['Dashboard RPCs', 'Activity feeds', 'Navigation'],
  },
  leads: {
    dataEntities: ['leads', 'families', 'students', 'locations'],
    actionLabels: ['Lead status updates', 'Convert to student', 'Appointment RPCs'],
  },
  schedule: {
    dataEntities: ['schedule_blocks', 'teachers', 'students', 'rooms'],
    actionLabels: ['Grid mutations', 'Assign / move', 'check_in_block RPC'],
  },
  students: {
    dataEntities: ['students', 'families', 'schedule_blocks', 'files'],
    actionLabels: ['Roster edits', 'Intake links', 'File metadata'],
  },
  families: {
    dataEntities: ['families', 'students', 'billing', 'messages'],
    actionLabels: ['Family updates', 'Portal prefs', 'Invoices'],
  },
  retention: {
    dataEntities: ['families', 'students', 'retention_campaigns', 'session notes'],
    actionLabels: ['Campaign sends', 'Churn scoring', 'AI copy'],
  },
  teachers: {
    dataEntities: ['teachers', 'teacher_locations', 'schedule_blocks'],
    actionLabels: ['Pay rates', 'Availability', 'Documents'],
  },
  billing: {
    dataEntities: ['invoices', 'families', 'payments', 'billing_snapshots'],
    actionLabels: ['Stripe / Square sync', 'Invoice PDF', 'Mark paid'],
  },
  settings: {
    dataEntities: ['locations', 'profiles', 'integration_configs'],
    actionLabels: ['RLS-scoped updates', 'Feature flags'],
  },
  zirowork: {
    dataEntities: ['ziro_agents', 'ziro_skills', 'ziro_agent_skills', 'ziro_page_intelligence_bindings'],
    actionLabels: ['Agent CRUD', 'Skill attach', 'Page ↔ agent binding'],
  },
}

export function workspaceFlowForSurface(key: ZiroOperatingSurfaceKey): WorkspaceFlowSlice {
  return MAP[key] ?? DEFAULT_SLICE
}
