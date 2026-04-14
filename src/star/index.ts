/**
 * Ziro / Star — unified business AI context layer (Lessonpreneur OS). User-facing name: Ziro.
 *
 * - **Global context:** `loadStarGlobalContext` + `formatStarPrompt` (live RPC + billing snapshot for role/location scope).
 * - **Page context:** `appendPageContextToStarPrompt` — thin adapters; no duplicate metric definitions here.
 * - **Scope:** `buildStarUserScope` — same rules as Dashboard billing location + `usePermissions` effective role.
 * - **Routing:** `routeTask` — 4-tier waterfall: direct > skill > agent > temp_agent.
 *
 * **Scheduling Star** (grid + tools) is intentionally separate: `useScheduleStarChat` / `postAiAssistantInteractive`.
 */
export type { StarPageAttach, StarPageId } from './types'
export type { StarUserScope, StarUserScopeInput } from './resolveScope'
export type { StarGlobalContext } from './loadGlobalContext'
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
