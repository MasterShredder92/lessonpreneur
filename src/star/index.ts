/**
 * Ziro / Star — unified business AI context layer (Lessonpreneur OS). User-facing name: Ziro.
 *
 * - **Global context:** `loadStarGlobalContext` + `formatStarPrompt` (live RPC + billing snapshot for role/location scope).
 * - **Page context:** `appendPageContextToStarPrompt` — thin adapters; no duplicate metric definitions here.
 * - **Scope:** `buildStarUserScope` — same rules as Dashboard billing location + `usePermissions` effective role.
 *
 * **Scheduling Star** (grid + tools) is intentionally separate: `useScheduleStarChat` / `postAiAssistantInteractive`.
 */
export type { StarPageAttach, StarPageId } from './types'
export type { StarUserScope, StarUserScopeInput } from './resolveScope'
export {
  buildStarUserScope,
  resolveStarBillingLocationId,
} from './resolveScope'
export { loadStarGlobalContext } from './loadGlobalContext'
export { appendPageContextToStarPrompt, starPageDisplayName } from './composePrompt'
export { buildStudentsPageStarSystemPrompt, buildStarSystemPromptWithPageBody } from './pagePrompts'
export {
  buildStudentsLightInsightPageBody,
  STUDENTS_FIRST_INSIGHT_QUESTION,
  type StudentsLightInsightInput,
} from './studentsLightInsight'
