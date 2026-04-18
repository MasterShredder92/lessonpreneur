import type { AgentId } from './agents'
import { getAgentPanelActions } from './actions'
import * as ziroTools from './tools/ziro'

/** Page / global command rows (e.g. command palette) resolved outside the agent registry. */
export type OrchestratorNavItem = { label: string; adminSurface: string }

/** Terminal outcomes for a single orchestrated run (subset of panel agent states). */
export type AgentOrchestratorWorkflowOutcome = 'idle' | 'error' | 'waitingForUser'

/** Registered from {@link AgentPanelProvider} via {@link registerAgentOrchestratorHooks}. */
export type AgentOrchestratorHooks = {
  agentSay: (message: string) => void
  agentReact: (actionLabel: string, options?: { agentId?: AgentId }) => void
  agentRemember: (key: string, value: unknown) => void
  agentSet: (agentId: AgentId) => void
  agentWorkflowEnter: () => void
  agentWorkflowExit: (outcome: AgentOrchestratorWorkflowOutcome) => void
}

const ON_IT = 'On it…'

type ToolRunner = (args: unknown) => Promise<unknown>

const TOOL_REGISTRY: Record<AgentId, Record<string, ToolRunner>> = {
  ziro: {
    fetchDashboardPulse: () => ziroTools.fetchDashboardPulse(),
    previewCommandCenter: () => ziroTools.previewCommandCenter(),
  },
}

let hooks: AgentOrchestratorHooks | null = null

/** Command palette (and similar) push the current nav rows so {@link runAgentAction} can fall back. */
let paletteNavItems: OrchestratorNavItem[] = []

export function setOrchestratorPaletteNav(items: OrchestratorNavItem[]): void {
  paletteNavItems = items
}

/** Panel wiring — {@link AgentPanelProvider} registers on mount. */
export function registerAgentOrchestratorHooks(next: AgentOrchestratorHooks | null): void {
  hooks = next
}

function getHooks(): AgentOrchestratorHooks {
  if (!hooks) {
    throw new Error('Agent orchestrator: hooks not registered (AgentPanelProvider missing?)')
  }
  return hooks
}

function getToolRunner(agentId: AgentId, toolName: string): ToolRunner {
  const runner = TOOL_REGISTRY[agentId]?.[toolName]
  if (!runner) {
    throw new Error(`Unknown tool "${toolName}" for agent "${agentId}"`)
  }
  return runner
}

function failureLine(reactLabel: string, err: unknown): string {
  const detail = err instanceof Error ? err.message : String(err)
  return `Couldn’t finish “${reactLabel}” — ${detail}`
}

/**
 * `agentSet` → `agentSay("On it…")` → panel `onClick` / `href` (or palette nav) → `agentReact` →
 * `agentRemember("lastAction", actionLabel)` → return value from `onClick` when present.
 */
export async function runAgentAction<T = unknown>(agentId: AgentId, actionLabel: string): Promise<T | void> {
  const h = getHooks()
  const action = getAgentPanelActions(agentId).find((a) => a.label === actionLabel)
  const nav = !action ? paletteNavItems.find((n) => n.label === actionLabel) : undefined

  if (!action && !nav) {
    console.warn('[runAgentAction] No action or palette nav with label:', actionLabel)
    return undefined
  }

  h.agentWorkflowEnter()
  try {
    h.agentSet(agentId)
    h.agentSay(ON_IT)
    let result: unknown
    if (action) {
      if (action.onClick) result = await action.onClick()
      if (result === 'needs-user') {
        h.agentWorkflowExit('waitingForUser')
        return result as T
      }
    } else if (nav) {
      window.dispatchEvent(new CustomEvent('admin-surface', { detail: { surface: nav.adminSurface } }))
    }
    h.agentReact(actionLabel, { agentId })
    h.agentRemember('lastAction', actionLabel)
    h.agentWorkflowExit('idle')
    return result as T
  } catch (err) {
    h.agentSay(failureLine(actionLabel, err))
    h.agentWorkflowExit('error')
    throw err
  }
}

/**
 * Same async shell as {@link runAgentAction}, but invokes a registered tool by name and passes `args`.
 * `agentReact` / `agentRemember` use **toolName** as the label.
 */
export async function runTool<T = unknown>(agentId: AgentId, toolName: string, args: unknown): Promise<T> {
  const h = getHooks()
  const run = getToolRunner(agentId, toolName)
  h.agentWorkflowEnter()
  try {
    h.agentSet(agentId)
    h.agentSay(ON_IT)
    const result = (await run(args)) as T
    h.agentReact(toolName, { agentId })
    h.agentRemember('lastAction', toolName)
    h.agentWorkflowExit('idle')
    return result
  } catch (err) {
    h.agentSay(failureLine(toolName, err))
    h.agentWorkflowExit('error')
    throw err
  }
}
