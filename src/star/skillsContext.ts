import { supabase } from '../lib/supabase'

export interface ActiveSkillSummary {
  key: string
  name: string
  description: string | null
  allowed_tools: string[]
  risk_tier: string
  system_prompt_fragment: string | null
}

/**
 * Loads active skills for the tenant and formats them into a context block
 * that gets appended to Ziro's system prompt.
 *
 * STAR uses this to know what skills it can invoke and what tools each skill
 * grants access to. When STAR encounters a task it can't handle, it references
 * this list and — if no skill fits — proposes a new one via `ziro_skill_proposals`.
 */
export async function loadActiveSkillsContext(tenantId: string): Promise<string> {
  const { data, error } = await supabase
    .from('ziro_skills')
    .select('key, name, description, allowed_tools, risk_tier, system_prompt_fragment')
    .eq('tenant_id', tenantId)
    .eq('is_active', true)
    .order('name')
    .limit(50)

  if (error || !data || data.length === 0) return ''

  const skillLines = (data as ActiveSkillSummary[]).map(s => {
    const tools = s.allowed_tools.length > 0 ? ` | tools: ${s.allowed_tools.join(', ')}` : ''
    const risk = s.risk_tier !== 'low' ? ` | risk: ${s.risk_tier}` : ''
    return `- ${s.key}: ${s.name} — ${s.description ?? 'No description'}${tools}${risk}`
  })

  return `
== ACTIVE SKILLS ==
You have ${data.length} active skill(s) available. When a task matches a skill, use it.
If no existing skill fits a task the user needs, you may propose a new skill by telling the user:
"I'd like to propose a new skill for this — [skill name]. Want me to submit it for approval?"
Do NOT invent skills on the fly. Only use skills listed here.

${skillLines.join('\n')}

SKILL GOVERNANCE:
- You can reference any active skill by key when performing tasks.
- High/critical risk skills require explicit user confirmation before execution.
- If you propose a new skill, it must be approved by the owner before it becomes active.
- Never bypass approval. Never execute a skill that is not in this list.
== END SKILLS ==`
}
