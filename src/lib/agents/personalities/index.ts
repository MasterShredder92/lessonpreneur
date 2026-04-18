import type { AgentId } from '../agents'
import type { AgentPersonality } from '../personalityTypes'
import { ziroPersonality } from './ziro'

export const AGENT_PERSONALITIES: Record<AgentId, AgentPersonality> = {
  ziro: ziroPersonality,
}

export function getAgentPersonality(id: AgentId): AgentPersonality {
  return AGENT_PERSONALITIES[id]
}
