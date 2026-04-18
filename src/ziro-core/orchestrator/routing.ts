import { supabase } from '../../lib/supabase'
import type { AgentRecord, OrchestrationIntent, RoutingDecision, SkillMatch, TaskRunResult } from './types'
import { createTaskRun, recordSkillUsage } from './taskRuns'
import { spawnAgent } from './agentLifecycle'

/**
 * Client-side intent classifier. Examines the assistant's response text
 * and any proposed action to determine if this needs orchestration.
 */
export function classifyIntent(
  userQuestion: string,
  assistantAnswer: string,
  proposedAction?: { action: string; params: Record<string, unknown> } | null,
): OrchestrationIntent {
  if (proposedAction?.action) {
    const actionToSkill: Record<string, string> = {
      'crm.reassign_students': 'schedule_optimizer',
      'crm.move_schedule_sessions': 'schedule_optimizer',
      'crm.navigate': '',
      'crm.audit_ping': '',
    }
    const skillKey = actionToSkill[proposedAction.action]
    if (skillKey) {
      return {
        classification: 'actionable_task',
        intent_summary: `Execute ${proposedAction.action}`,
        suggested_skill_key: skillKey,
        input_payload: proposedAction.params,
      }
    }
  }

  const proposalPatterns = [
    /I['']d like to propose a new skill/i,
    /propose a new skill.*for approval/i,
    /submit.*for approval.*new skill/i,
  ]
  if (proposalPatterns.some(p => p.test(assistantAnswer))) {
    return {
      classification: 'skill_proposal',
      intent_summary: 'Assistant proposed a new skill',
    }
  }

  const taskPatterns: Array<{ pattern: RegExp; skill: string; summary: string }> = [
    { pattern: /follow.?up.*(lead|inquiry)/i, skill: 'lead_followup', summary: 'Lead follow-up task' },
    { pattern: /(draft|write|compose|send|remind).*(parent|family|families).*(message|email|sms|update|notice)/i, skill: 'parent_comms', summary: 'Parent communication' },
    { pattern: /(parent|family|families).*(message|email|sms|reminder|update|notice)/i, skill: 'parent_comms', summary: 'Parent communication' },
    { pattern: /(message|email|update|notice|reminder).*(parent|family|families)/i, skill: 'parent_comms', summary: 'Parent communication' },
    { pattern: /morning briefing|daily.*summary/i, skill: 'morning_briefing', summary: 'Generate morning briefing' },
    { pattern: /churn|at.?risk|retention.*(analys|trend|rate)/i, skill: 'churn_analysis', summary: 'Churn risk analysis' },
    { pattern: /billing.*(summary|report|insight|anomal)/i, skill: 'billing_insight', summary: 'Billing insight generation' },
    { pattern: /teacher.*(eval|review|performance|effectiveness)/i, skill: 'teacher_eval', summary: 'Teacher performance evaluation' },
    { pattern: /(eval|review|assess).*teach/i, skill: 'teacher_eval', summary: 'Teacher performance evaluation' },
    { pattern: /session.*(recap|note|polish|enhance)/i, skill: 'session_recap', summary: 'Session note enhancement' },
    { pattern: /sop|standard operating/i, skill: 'sop_generator', summary: 'SOP generation' },
    { pattern: /offer.*(creat|build|strateg|ladder)|upsell.*offer/i, skill: 'offer_strategy', summary: 'Offer strategy' },
    { pattern: /marketing.*(brief|plan|campaign)/i, skill: 'marketing_brief', summary: 'Marketing brief' },
    { pattern: /sales.*(script|pitch|objection)|(pitch|objection).*(sales|lesson|price)/i, skill: 'sales_script', summary: 'Sales script refinement' },
    { pattern: /operations?.*(audit|review|check)|review.*operations?/i, skill: 'ops_audit', summary: 'Operations audit' },
  ]

  for (const { pattern, skill, summary } of taskPatterns) {
    if (pattern.test(userQuestion)) {
      return {
        classification: 'actionable_task',
        intent_summary: summary,
        suggested_skill_key: skill,
      }
    }
  }

  return {
    classification: 'quick_answer',
    intent_summary: 'Quick answer — no orchestration needed',
  }
}

export async function routeTask(tenantId: string, intent: OrchestrationIntent): Promise<RoutingDecision> {
  // Tier 1: Direct
  try {
    if (intent.classification === 'quick_answer' || intent.classification === 'skill_proposal') {
      return {
        route: 'direct',
        skill: null,
        agent: null,
        explanation:
          intent.classification === 'skill_proposal'
            ? 'Handled by Ziro — skill proposal submitted for review.'
            : 'Handled by Ziro — direct response, no delegation needed.',
        createdTempAgent: false,
      }
    }
  } catch (err) {
    console.error('[Orchestrator] Direct classification failed:', err)
  }

  // Tier 2: Skill
  try {
    const skill = intent.suggested_skill_key ? await matchSkill(tenantId, intent.suggested_skill_key) : null
    if (skill) {
      const attachedAgent = await findZiroAgentForSkill(tenantId, skill.id)
      if (attachedAgent) {
        await supabase
          .from('ziro_agents')
          .update({ last_used_at: new Date().toISOString() })
          .eq('id', attachedAgent.id)

        return {
          route: 'agent',
          skill,
          agent: attachedAgent,
          explanation: `Used ${attachedAgent.name} — owns the ${skill.name} skill.`,
          createdTempAgent: false,
        }
      }

      return {
        route: 'skill',
        skill,
        agent: null,
        explanation: `Used ${skill.name} skill — matched to task.`,
        createdTempAgent: false,
      }
    }
  } catch (err) {
    console.error('[Orchestrator] Skill matching failed:', err)
  }

  // Tier 3: Agent
  try {
    const agentByRule = await findZiroAgentByInvocationRule(tenantId, intent.intent_summary)
    if (agentByRule) {
      await supabase
        .from('ziro_agents')
        .update({ last_used_at: new Date().toISOString() })
        .eq('id', agentByRule.id)

      return {
        route: 'agent',
        skill: null,
        agent: agentByRule,
        explanation: `Used ${agentByRule.name} — matched by invocation keywords.`,
        createdTempAgent: false,
      }
    }
  } catch (err) {
    console.error('[Orchestrator] Agent matching failed:', err)
  }

  // Tier 4: Fallback is DIRECT per P8
  return {
    route: 'direct',
    skill: null,
    agent: null,
    explanation: 'Handled by Ziro — no matching skill or agent.',
    createdTempAgent: false,
  }
}

export async function orchestrateFromChat(params: {
  tenantId: string
  profileId: string
  conversationId: string | null
  originMessageId: string | null
  userQuestion: string
  assistantAnswer: string
  proposedAction?: { action: string; params: Record<string, unknown> } | null
}): Promise<TaskRunResult & { intent: OrchestrationIntent }> {
  const intent = classifyIntent(params.userQuestion, params.assistantAnswer, params.proposedAction)

  if (intent.classification === 'quick_answer' || intent.classification === 'skill_proposal') {
    return {
      ok: true,
      intent,
      routing: {
        route: 'direct',
        skill: null,
        agent: null,
        explanation:
          intent.classification === 'skill_proposal'
            ? 'Handled by Ziro — skill proposal submitted for review.'
            : 'Handled by Ziro — direct response, no delegation needed.',
        createdTempAgent: false,
      },
    }
  }

  const idempotencyKey = `${params.conversationId ?? 'no-conv'}:${intent.intent_summary}:${Date.now()}`

  const runResult = await createTaskRun({
    tenantId: params.tenantId,
    profileId: params.profileId,
    conversationId: params.conversationId,
    originMessageId: params.originMessageId,
    intent,
    idempotencyKey,
  })

  if (!runResult.ok || !runResult.taskRun) return { ...runResult, intent }
  if (runResult.deduplicated) return { ...runResult, intent }

  if (runResult.skill?.id) recordSkillUsage(runResult.skill.id)

  if (runResult.taskRun.status === 'skill_matched') {
    const spawnResult = await spawnAgent(
      params.tenantId,
      runResult.taskRun.id,
      runResult.taskRun.skill_key,
      { input: intent.input_payload ?? {} },
    )

    if (!spawnResult.ok) {
      return { ok: false, error: spawnResult.error ?? 'Failed to spawn agent', intent }
    }
    return { ...runResult, agent: spawnResult.agent, intent }
  }

  return { ...runResult, intent }
}

export async function matchSkill(tenantId: string, suggestedKey?: string): Promise<SkillMatch | null> {
  if (!suggestedKey) return null

  const { data, error } = await supabase
    .from('ziro_skills')
    .select('id, key, name, runtime, allowed_tools, system_prompt_fragment, risk_tier, cost_tier')
    .eq('tenant_id', tenantId)
    .eq('key', suggestedKey)
    .eq('is_active', true)
    .single()

  if (error || !data) return null
  return data as SkillMatch
}

async function findZiroAgentForSkill(tenantId: string, skillId: string): Promise<AgentRecord | null> {
  const { data, error } = await supabase
    .from('ziro_agents')
    .select(
      `
      agent_id,
      ziro_agents!inner (
        id, tenant_id, name, purpose, status, owner_type,
        lifecycle_type, invocation_rules, created_by,
        created_at, last_used_at, retired_at
      )
    `,
    )
    .eq('tenant_id', tenantId)

  if (error || !data || data.length === 0) return null

  const candidates: AgentRecord[] = []

  for (const row of data) {
    const agent = (row as unknown as { ziro_agents: AgentRecord }).ziro_agents
    if (agent.status !== 'active') continue

    const { data: skills } = await supabase
      .from('ziro_agent_skills')
      .select('skill_id')
      .eq('agent_id', agent.id)
      .eq('skill_id', skillId)
      .limit(1)

    if (skills && skills.length > 0) candidates.push(agent)
  }

  if (candidates.length === 0) return null
  if (candidates.length > 1) {
    candidates.sort((a, b) => {
      const aTime = a.last_used_at ? new Date(a.last_used_at).getTime() : 0
      const bTime = b.last_used_at ? new Date(b.last_used_at).getTime() : 0
      return bTime - aTime
    })
  }
  return candidates[0]
}

async function findZiroAgentByInvocationRule(
  tenantId: string,
  intentSummary: string,
): Promise<AgentRecord | null> {
  const { data, error } = await supabase
    .from('ziro_agents')
    .select(
      `
      agent_id,
      ziro_agents!inner (
        id, tenant_id, name, purpose, status, owner_type,
        lifecycle_type, invocation_rules, created_by,
        created_at, last_used_at, retired_at
      )
    `,
    )
    .eq('tenant_id', tenantId)

  if (error || !data || data.length === 0) return null

  const lower = intentSummary.toLowerCase()
  let bestAgent: AgentRecord | null = null
  let bestScore = 0

  for (const row of data) {
    const agent = (row as unknown as { ziro_agents: AgentRecord }).ziro_agents
    if (agent.status !== 'active') continue

    const rules = agent.invocation_rules as { keywords?: string[] }
    if (!rules.keywords || !Array.isArray(rules.keywords) || rules.keywords.length === 0) continue

    let score = 0
    for (const kw of rules.keywords) {
      if (lower.includes(kw.toLowerCase())) score++
    }

    if (score > bestScore) {
      bestScore = score
      bestAgent = agent
    }
  }

  return bestAgent
}

