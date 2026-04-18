import type { AgentId } from './agents'
import { AGENT_PERSONALITIES } from './personalities'
import { longestPageBehaviorPrefix, panelReactionsFromBehavior, pickReactionIndex } from './reactionUtils'

/**
 * Chooses a short reaction line from the active agent’s `pageBehaviors` pool (`||` pipe-suffix),
 * then falls back to `exampleMessages`.
 */
export function pickAgentReaction(agentId: AgentId, actionLabel: string, pathname: string): string {
  const personality = AGENT_PERSONALITIES[agentId]
  const prefix = longestPageBehaviorPrefix(pathname, Object.keys(personality.pageBehaviors))
  if (prefix) {
    const raw = personality.pageBehaviors[prefix]
    const pool = panelReactionsFromBehavior(raw)
    if (pool?.length) {
      return pool[pickReactionIndex(`${actionLabel}:${pathname}`, pool.length)]!
    }
  }
  const ex = personality.exampleMessages
  if (ex.length) return ex[pickReactionIndex(actionLabel + pathname, ex.length)]!
  return `On it — ${actionLabel}.`
}
