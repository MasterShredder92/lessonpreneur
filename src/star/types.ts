/**
 * Star OS layer — page identifiers for composed business prompts.
 * Scheduling/tools mode (Schedule page) stays on `useScheduleStarChat` + `ScheduleContext`; see `useAI.ts`.
 */
export type StarPageId =
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
export interface StarPageAttach {
  pageId: StarPageId
  displayName: string
  body: string
}
