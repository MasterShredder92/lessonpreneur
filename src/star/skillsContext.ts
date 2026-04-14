import { supabase } from '../lib/supabase'

export interface ActiveSkillSummary {
  key: string
  name: string
  description: string | null
  allowed_tools: string[]
  risk_tier: string
  system_prompt_fragment: string | null
}

interface AttachedAgentSummary {
  name: string
  purpose: string | null
  skill_names: string[]
}

/**
 * Loads active skills AND Star-attached agents for the tenant, formats them
 * into a context block appended to Ziro's system prompt.
 *
 * Star uses this to know:
 * - What skills it can invoke directly
 * - What agents are attached and what skills they own
 * - Governance rules for execution routing
 */
export async function loadActiveSkillsContext(tenantId: string): Promise<string> {
  // Load skills and agents in parallel
  const [skillsResult, agentsResult] = await Promise.all([
    supabase
      .from('ziro_skills')
      .select('key, name, description, allowed_tools, risk_tier, system_prompt_fragment')
      .eq('tenant_id', tenantId)
      .eq('is_active', true)
      .order('name')
      .limit(50),
    loadAttachedAgents(tenantId),
  ])

  const skills = (skillsResult.data ?? []) as ActiveSkillSummary[]
  const agents = agentsResult

  if (skills.length === 0 && agents.length === 0) return ''

  const parts: string[] = []

  // Skills block
  if (skills.length > 0) {
    const skillLines = skills.map(s => {
      const tools = s.allowed_tools.length > 0 ? ` | tools: ${s.allowed_tools.join(', ')}` : ''
      const risk = s.risk_tier !== 'low' ? ` | risk: ${s.risk_tier}` : ''
      return `- ${s.key}: ${s.name} — ${s.description ?? 'No description'}${tools}${risk}`
    })

    parts.push(`== ACTIVE SKILLS ==
You have ${skills.length} active skill(s) available. When a task matches a skill, use it.
If no existing skill fits a task the user needs, you may propose a new skill by telling the user:
"I'd like to propose a new skill for this — [skill name]. Want me to submit it for approval?"
Do NOT invent skills on the fly. Only use skills listed here.

${skillLines.join('\n')}

SKILL GOVERNANCE:
- You can reference any active skill by key when performing tasks.
- High/critical risk skills require explicit user confirmation before execution.
- If you propose a new skill, it must be approved by the owner before it becomes active.
- Never bypass approval. Never execute a skill that is not in this list.
== END SKILLS ==`)
  }

  // Agents block
  if (agents.length > 0) {
    const agentLines = agents.map(a => {
      const skills = a.skill_names.length > 0 ? ` — skills: ${a.skill_names.join(', ')}` : ''
      return `- ${a.name}: ${a.purpose ?? 'No purpose defined'}${skills}`
    })

    parts.push(`== ATTACHED AGENTS ==
${agents.length} agent(s) are attached to Star. When a task matches an agent's specialty, delegate to it.
Do NOT create new agents unless the user explicitly requests a temporary specialist.

${agentLines.join('\n')}

AGENT ROUTING:
- Prefer skills first. Only delegate to an agent when it already owns the matching skill.
- Never create overlapping agents for the same category.
- Temporary agents retire after task completion unless the user saves them.
== END AGENTS ==`)
  }

  return '\n' + parts.join('\n\n')
}

/** Load Star-attached agents with their skill names. */
async function loadAttachedAgents(tenantId: string): Promise<AttachedAgentSummary[]> {
  const { data: starAgents, error } = await supabase
    .from('ziro_star_agents')
    .select('agent_id')
    .eq('tenant_id', tenantId)

  if (error || !starAgents || starAgents.length === 0) return []

  const agentIds = starAgents.map(sa => sa.agent_id)

  const { data: agents } = await supabase
    .from('ziro_agents')
    .select('id, name, purpose')
    .in('id', agentIds)
    .eq('status', 'active')
    .limit(30)

  if (!agents || agents.length === 0) return []

  // Load skills for each agent
  const results: AttachedAgentSummary[] = []
  for (const agent of agents) {
    const { data: agentSkills } = await supabase
      .from('ziro_agent_skills')
      .select('skill_id, ziro_skills!inner(name)')
      .eq('agent_id', agent.id)
      .limit(10)

    const skillNames = (agentSkills ?? []).map((as: any) => as.ziro_skills?.name ?? 'Unknown')
    results.push({ name: agent.name, purpose: agent.purpose, skill_names: skillNames })
  }

  return results
}
