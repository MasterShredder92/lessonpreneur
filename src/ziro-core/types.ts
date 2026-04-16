/**
 * Ziro Work — page identifiers for composed business prompts.
 * Scheduling/tools mode (Schedule page) stays on `useScheduleZiroChat` + `ScheduleContext`; see `useAI.ts`.
 */
export type ZiroPageId =
  | 'global_modal'
  | 'dashboard'
  | 'students'
  | 'families'
  | 'family_detail'
  | 'schedule_business'
  | 'billing'
  | 'leads'
  | 'lessons'

/** Page-specific block appended after the global live snapshot prompt. */
export interface ZiroPageAttach {
  pageId: ZiroPageId
  displayName: string
  body: string
}
