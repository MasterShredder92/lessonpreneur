/** Rich persona metadata for admin agents (panel copy, prompts, future LLM routing). */
export type AgentPersonality = {
  personality: string
  tone: string
  strengths: string[]
  weaknesses: string[]
  /**
   * Route prefix → behavioral guidance, optionally followed by `||` and pipe-separated
   * short lines used for panel reactions (see `agentReact`).
   */
  pageBehaviors: Record<string, string>
  exampleMessages: string[]
}
