/**
 * ZiroWork — unified business AI context layer for the music-school OS.
 *
 * - **Global context:** `loadZiroGlobalContext` + `formatZiroPrompt` (live RPC + billing snapshot for role/location scope).
 * - **Page context:** `appendPageContextToZiroPrompt` — thin adapters; no duplicate metric definitions here.
 * - **Scope:** `buildZiroUserScope` — same rules as Dashboard billing location + `usePermissions` effective role.
 * - **Routing:** `routeTask` — 4-tier waterfall: direct > skill > agent > temp_agent.
 *
 * **Scheduling tools** (grid + tools) are intentionally separate: `useScheduleZiroChat` / `postAiAssistantInteractive`.
 */
export type { ZiroPageAttach, ZiroPageId } from './types'
export type { ZiroUserScope, ZiroUserScopeInput } from './resolveScope'
export type { ZiroGlobalContext } from './loadGlobalContext'
export {
  buildZiroUserScope,
  resolveZiroBillingLocationId,
} from './resolveScope'
export { loadZiroGlobalContext } from './loadGlobalContext'
export { appendPageContextToZiroPrompt, ziroPageDisplayName } from './composePrompt'
export { buildStudentsPageZiroSystemPrompt, buildZiroSystemPromptWithPageBody } from './pagePrompts'
export {
  buildStudentsLightInsightPageBody,
  STUDENTS_FIRST_INSIGHT_QUESTION,
  type StudentsLightInsightInput,
} from './studentsLightInsight'
export {
  // Routing engine
  routeTask,
  orchestrateFromChat,
  classifyIntent,
  matchSkill,
  // Task run management
  createTaskRun,
  spawnAgent,
  markAgentRunning,
  completeAgent,
  failAgent,
  heartbeatAgent,
  // Agent lifecycle
  createTempAgent,
  retireTempAgent,
  retainTempAgent,
  recordSkillUsage,
  // Policy constants
  VAGUE_AGENT_NAMES,
  PURPOSE_OVERLAP_THRESHOLD,
  findOverlappingAgent,
  // Types
  type RouteType,
  type RoutingDecision,
  type AgentRecord,
  type TaskRunRecord,
  type TaskAgentRecord,
  type SkillMatch,
  type OrchestrationIntent,
  type TaskRunResult,
} from './orchestrator'
