import type { AgentAction, AgentId } from '../agents'
import { ziroActions } from './ziro'

/** Registry keyed by `AgentId` (panel + routing). */
export const agentActionsRegistry: Record<AgentId, AgentAction[]> = {
  ziro: ziroActions,
}

export function getAgentPanelActions(agentId: AgentId): AgentAction[] {
  return agentActionsRegistry[agentId]
}

export { ziroActions }
