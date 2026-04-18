import { getAgentPanelActions } from './actions'
import type { AgentPersonality } from './personalityTypes'
import { AGENT_PERSONALITIES } from './personalities'

export type AgentAction = {
  label: string
  description?: string
  href?: string
  /** Return `'needs-user'` when the UI should stay in a “waiting for you” state (form/modal). */
  onClick?: () => void | Promise<void | 'needs-user'>
}

export type AgentId = 'ziro'

export type AgentColorTheme = {
  charcoal: string
  neonGreen: string
}

export type AgentDefinition = {
  id: AgentId
  name: string
  description: string
  defaultMessage: string
  colorTheme: AgentColorTheme
  avatar: string
  /** Persona metadata (panel reactions, future LLM routing). */
  personality: AgentPersonality
  actions: AgentAction[]
}

const THEME: AgentColorTheme = {
  charcoal: '#0a0b10',
  neonGreen: '#39FF14',
}

/** Maps catalog agent ids to lowercase ASCII filenames under `/public/static/agents/`. */
export function getAgentAvatarFilename(agentId: string): string {
  const id = String(agentId ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
  if (id === 'ziro') return 'ziro.png'
  return 'default.png'
}

export function getAgentAvatarUrl(agentId: string): string {
  return `/static/agents/${getAgentAvatarFilename(agentId)}`
}

const ziroBase = {
  id: 'ziro' as const,
  name: 'Ziro',
  description: 'Your operating layer — priorities, signals, and next steps.',
  defaultMessage: "Here's your school at a glance.",
  colorTheme: THEME,
  avatar: getAgentAvatarUrl('ziro'),
  personality: AGENT_PERSONALITIES.ziro,
}

export const AGENTS: Record<AgentId, AgentDefinition> = {
  ziro: { ...ziroBase, actions: getAgentPanelActions('ziro') },
}

export const AGENT_IDS: AgentId[] = ['ziro']

export function getAgent(id: AgentId): AgentDefinition {
  return AGENTS[id]
}
