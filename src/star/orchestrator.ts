/**
 * Ziro Task Orchestrator — Routing Engine
 *
 * ═══════════════════════════════════════════════════════════
 * FROZEN ROUTING POLICY — DO NOT MODIFY WITHOUT OWNER SIGN-OFF
 * ═══════════════════════════════════════════════════════════
 *
 * Priority waterfall (strict order, never skip):
 *   1. DIRECT    — simple answer, no task run needed
 *   2. SKILL     — repeatable workflow handled by an active skill
 *   3. AGENT     — existing persistent agent attached to Ziro (orchestrator)
 *   4. TEMP_AGENT — one-off specialist, created only when explicitly necessary
 *
 * Product rules (locked):
 *   P1  Skill-first: use an existing skill before delegating to an agent.
 *   P2  No vague agents: names like "builder", "helper", "bot" are blocked.
 *   P3  No overlapping active agents: 50%+ purpose word overlap = rejected.
 *   P4  Prefer reuse: never create a temp agent if a skill or agent covers it.
 *   P5  Temp agents retire by default after task completion.
 *   P6  Only create a temp agent when specialization is truly necessary
 *       AND no existing skill or agent can handle the task.
 *   P7  User can convert temp → persistent or retire persistent agents.
 *   P8  Fallback is DIRECT, not temp_agent creation.
 * ═══════════════════════════════════════════════════════════
 */

import { supabase } from '../lib/supabase'

// ── Frozen Policy Constants ────────────────────────────

/** Agent names containing any of these words are blocked. */
export const VAGUE_AGENT_NAMES = ['builder', 'helper', 'assistant', 'worker', 'bot'] as const

/** Minimum word-overlap ratio to consider two purposes overlapping. */
export const PURPOSE_OVERLAP_THRESHOLD = 0.5

/** Minimum word length to consider in overlap detection. */
export const OVERLAP_MIN_WORD_LENGTH = 3

// ── Types ───────────────────────────────────────────────

export type TaskRunStatus =
  | 'pending'
  | 'skill_matched'
  | 'agent_spawned'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled'

export type TaskAgentStatus =
  | 'initializing'
  | 'running'
  | 'completed'
  | 'failed'
  | 'retired'

export type RouteType = 'direct' | 'skill' | 'agent' | 'temp_agent'

export interface TaskRunRecord {
  id: string
  tenant_id: string
  profile_id: string
  conversation_id: string | null
  origin_message_id: string | null
  skill_id: string | null
  status: TaskRunStatus
  classification: string
  intent_summary: string | null
  skill_key: string | null
  selected_runtime: string | null
  selected_tools: string[]
  prompt_fragment: string | null
  input_payload: Record<string, unknown>
  output_payload: Record<string, unknown> | null
  error_text: string | null
  idempotency_key: string
  route_chosen: RouteType | null
  agent_used_id: string | null
  created_temp_agent: boolean
  retained_after_task: boolean
  result_summary: string | null
  routing_explanation: string | null
  created_at: string
  updated_at: string
  completed_at: string | null
}

export interface TaskAgentRecord {
  id: string
  tenant_id: string
  task_run_id: string
  agent_type: string
  status: TaskAgentStatus
  skill_key: string | null
  config: Record<string, unknown>
  result: Record<string, unknown> | null
  error_text: string | null
  spawned_at: string
  heartbeat_at: string | null
  retired_at: string | null
}

export interface AgentRecord {
  id: string
  tenant_id: string
  name: string
  purpose: string | null
  status: 'active' | 'idle' | 'retired'
  owner_type: 'system' | 'user'
  lifecycle_type: 'temporary' | 'persistent'
  invocation_rules: Record<string, unknown>
  created_by: string | null
  created_at: string
  last_used_at: string | null
  retired_at: string | null
}

export interface SkillMatch {
  id: string
  key: string
  name: string
  runtime: string
  allowed_tools: string[]
  system_prompt_fragment: string | null
  risk_tier: string
  cost_tier: string
}

export interface OrchestrationIntent {
  classification: 'quick_answer' | 'actionable_task' | 'skill_proposal'
  intent_summary: string
  suggested_skill_key?: string
  input_payload?: Record<string, unknown>
}

export interface RoutingDecision {
  route: RouteType
  skill: SkillMatch | null
  agent: AgentRecord | null
  explanation: string
  createdTempAgent: boolean
}

export interface CreateTaskRunParams {
  tenantId: string
  profileId: string
  conversationId: string | null
  originMessageId: string | null
  intent: OrchestrationIntent
  idempotencyKey: string
}

export interface TaskRunResult {
  ok: boolean
  taskRun?: TaskRunRecord
  agent?: TaskAgentRecord
  skill?: SkillMatch | null
  routing?: RoutingDecision
  error?: string
  deduplicated?: boolean
}

// ── Classification ──────────────────────────────────────

/**
 * Client-side intent classifier. Examines the assistant's response text
 * and any proposed action to determine if this needs orchestration.
 */
export function classifyIntent(
  userQuestion: string,
  assistantAnswer: string,
  proposedAction?: { action: string; params: Record<string, unknown> } | null,
): OrchestrationIntent {
  // If there's a proposed CRM action, it's actionable
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

  // Check for skill proposal language
  const proposalPatterns = [
    /I['']d like to propose a new skill/i,
    /propose a new skill.*for approval/i,
    /submit.*for approval.*new skill/i,
  ]
  if (proposalPatterns.some(p => p.test(assistantAnswer))) {
    return {
      classification: 'skill_proposal',
      intent_summary: 'STAR proposed a new skill',
    }
  }

  // Check for task-like language.
  // Patterns are ordered by specificity — first match wins.
  // If a user message matches multiple patterns, the most specific (listed first) takes priority.
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

// ── Routing Engine ──────────────────────────────────────

/**
 * The 4-tier routing waterfall.
 *
 * 1. Direct — simple answer, no task run
 * 2. Skill — existing active skill matches
 * 3. Agent — existing Ziro-attached agent with matching skill
 * 4. Temp Agent — create one-off specialist, retire after
 */
export async function routeTask(
  tenantId: string,
  intent: OrchestrationIntent,
): Promise<RoutingDecision> {
  // Tier 1: Direct — quick answers don't need routing
  if (intent.classification === 'quick_answer' || intent.classification === 'skill_proposal') {
    return {
      route: 'direct',
      skill: null,
      agent: null,
      explanation: intent.classification === 'skill_proposal'
        ? 'Handled by Ziro — skill proposal submitted for review.'
        : 'Handled by Ziro — direct response, no delegation needed.',
      createdTempAgent: false,
    }
  }

  // Tier 2: Skill match — check if an active skill covers this
  const skill = intent.suggested_skill_key
    ? await matchSkill(tenantId, intent.suggested_skill_key)
    : null

  if (skill) {
    // Tier 3: Check if a Ziro-attached agent already owns this skill
    const attachedAgent = await findStarAgentForSkill(tenantId, skill.id)

    if (attachedAgent) {
      // Touch last_used_at on the agent
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

    // No attached agent — use skill directly via Ziro (Policy P1: skill-first)
    return {
      route: 'skill',
      skill,
      agent: null,
      explanation: `Used ${skill.name} skill — matched to task.`,
      createdTempAgent: false,
    }
  }

  // Tier 4: No skill match — check if any attached agent's invocation_rules match
  const agentByRule = await findStarAgentByInvocationRule(tenantId, intent.intent_summary)
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

  // Fallback: Direct handling (Policy P8: fallback is DIRECT, not temp_agent)
  return {
    route: 'direct',
    skill: null,
    agent: null,
    explanation: 'Handled by Ziro — no matching skill or agent.',
    createdTempAgent: false,
  }
}

// ── Skill Matching ──────────────────────────────────────

export async function matchSkill(
  tenantId: string,
  suggestedKey?: string,
): Promise<SkillMatch | null> {
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

// ── Agent Lookup ────────────────────────────────────────

/**
 * Find a Ziro-attached agent that has the given skill attached.
 *
 * Edge case handling:
 * - Filters out non-active agents (retired/idle won't match)
 * - When multiple agents own the same skill, picks the most recently used
 * - Agent with detached skill → skill query returns empty, agent is skipped
 */
async function findStarAgentForSkill(
  tenantId: string,
  skillId: string,
): Promise<AgentRecord | null> {
  const { data, error } = await supabase
    .from('ziro_star_agents')
    .select(`
      agent_id,
      ziro_agents!inner (
        id, tenant_id, name, purpose, status, owner_type,
        lifecycle_type, invocation_rules, created_by,
        created_at, last_used_at, retired_at
      )
    `)
    .eq('tenant_id', tenantId)

  if (error || !data || data.length === 0) return null

  // Collect all matching active agents, then pick the best one
  const candidates: AgentRecord[] = []

  for (const row of data) {
    const agent = (row as any).ziro_agents as AgentRecord
    // Edge case: skip non-active agents (retired agent accidentally still in star_agents)
    if (agent.status !== 'active') continue

    const { data: skills } = await supabase
      .from('ziro_agent_skills')
      .select('skill_id')
      .eq('agent_id', agent.id)
      .eq('skill_id', skillId)
      .limit(1)

    // Edge case: agent with detached skill → skills array is empty, skip
    if (skills && skills.length > 0) candidates.push(agent)
  }

  if (candidates.length === 0) return null
  // Edge case: multiple agents own the same skill — pick most recently used
  if (candidates.length > 1) {
    candidates.sort((a, b) => {
      const aTime = a.last_used_at ? new Date(a.last_used_at).getTime() : 0
      const bTime = b.last_used_at ? new Date(b.last_used_at).getTime() : 0
      return bTime - aTime
    })
  }
  return candidates[0]
}

/**
 * Find a Ziro-attached agent whose invocation_rules keywords match the intent.
 *
 * Edge case handling:
 * - Multiple agents with similar keywords: picks the one with the most keyword matches
 * - Retired/idle agents: filtered out
 * - Empty keywords array: skipped
 */
async function findStarAgentByInvocationRule(
  tenantId: string,
  intentSummary: string,
): Promise<AgentRecord | null> {
  const { data, error } = await supabase
    .from('ziro_star_agents')
    .select(`
      agent_id,
      ziro_agents!inner (
        id, tenant_id, name, purpose, status, owner_type,
        lifecycle_type, invocation_rules, created_by,
        created_at, last_used_at, retired_at
      )
    `)
    .eq('tenant_id', tenantId)

  if (error || !data || data.length === 0) return null

  const lower = intentSummary.toLowerCase()

  // Score each agent by number of keyword matches, pick best
  let bestAgent: AgentRecord | null = null
  let bestScore = 0

  for (const row of data) {
    const agent = (row as any).ziro_agents as AgentRecord
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

// ── Overlap Detection (shared by orchestrator + hooks) ──

/** Check if any existing agent overlaps with the given name/purpose. */
export function findOverlappingAgent(
  existingAgents: Array<{ id: string; name: string; purpose: string | null }>,
  newName: string,
  newPurpose: string,
): { id: string; name: string } | undefined {
  const nameLower = newName.toLowerCase()
  const purposeWords = new Set(
    newPurpose.toLowerCase().split(/\s+/).filter(w => w.length > OVERLAP_MIN_WORD_LENGTH),
  )
  return existingAgents.find(a => {
    if (a.name.toLowerCase() === nameLower) return true
    if (a.purpose && purposeWords.size > 0) {
      const existingWords = new Set(
        a.purpose.toLowerCase().split(/\s+/).filter(w => w.length > OVERLAP_MIN_WORD_LENGTH),
      )
      let matches = 0
      for (const w of purposeWords) { if (existingWords.has(w)) matches++ }
      if (matches / purposeWords.size >= PURPOSE_OVERLAP_THRESHOLD) return true
    }
    return false
  })
}

// ── Temporary Agent Creation ────────────────────────────

/**
 * Create a temporary agent for a one-off specialized task.
 * Only call this when the routing engine determines no skill or
 * existing agent can handle the task AND the user explicitly requests
 * specialist delegation.
 */
export async function createTempAgent(
  tenantId: string,
  name: string,
  purpose: string,
  skillId: string | null,
  createdBy: string | null,
): Promise<{ ok: boolean; agent?: AgentRecord; error?: string }> {
  // Guard: no vague names (Policy P2)
  if (VAGUE_AGENT_NAMES.some(v => name.toLowerCase().includes(v))) {
    return { ok: false, error: `Agent name "${name}" is too vague. Use a specific specialist name.` }
  }

  // Guard: check for overlapping active agents (Policy P3)
  const { data: existing } = await supabase
    .from('ziro_agents')
    .select('id, name, purpose')
    .eq('tenant_id', tenantId)
    .eq('status', 'active')
    .limit(50)

  if (existing) {
    const overlap = findOverlappingAgent(existing, name, purpose)
    if (overlap) {
      return { ok: false, error: `Active agent "${overlap.name}" already covers a similar purpose. Retire or update it instead.` }
    }
  }

  const { data: agent, error } = await supabase
    .from('ziro_agents')
    .insert({
      tenant_id: tenantId,
      name,
      purpose,
      status: 'active',
      owner_type: 'system',
      lifecycle_type: 'temporary',
      invocation_rules: {},
      created_by: createdBy,
    })
    .select()
    .single()

  if (error) return { ok: false, error: error.message }

  // Attach skill if provided
  if (skillId) {
    await supabase.from('ziro_agent_skills').insert({
      tenant_id: tenantId,
      agent_id: agent.id,
      skill_id: skillId,
      is_primary: true,
    })
  }

  // Attach to Ziro orchestrator roster (ziro_star_agents)
  await supabase.from('ziro_star_agents').insert({
    tenant_id: tenantId,
    agent_id: agent.id,
  })

  return { ok: true, agent: agent as AgentRecord }
}

/** Retire a temporary agent after task completion. */
export async function retireTempAgent(tenantId: string, agentId: string): Promise<void> {
  const now = new Date().toISOString()
  await Promise.all([
    supabase.from('ziro_agents')
      .update({ status: 'retired', retired_at: now })
      .eq('id', agentId)
      .eq('tenant_id', tenantId)
      .eq('lifecycle_type', 'temporary'),
    // Clean up orchestrator attachment to prevent ghost references
    supabase.from('ziro_star_agents')
      .delete()
      .eq('agent_id', agentId)
      .eq('tenant_id', tenantId),
  ])
}

/** Convert a temporary agent to persistent (user chose to keep it). */
export async function retainTempAgent(tenantId: string, agentId: string): Promise<void> {
  await supabase
    .from('ziro_agents')
    .update({ lifecycle_type: 'persistent' })
    .eq('id', agentId)
    .eq('tenant_id', tenantId)
}

// ── Task Run Creation ───────────────────────────────────

export async function createTaskRun(params: CreateTaskRunParams): Promise<TaskRunResult> {
  const { tenantId, profileId, conversationId, originMessageId, intent, idempotencyKey } = params

  // Check for existing run
  const { data: existing } = await supabase
    .from('ziro_task_runs')
    .select('*')
    .eq('idempotency_key', idempotencyKey)
    .maybeSingle()

  if (existing) {
    return { ok: true, taskRun: existing as TaskRunRecord, deduplicated: true }
  }

  // Route the task
  const routing = await routeTask(tenantId, intent)

  const insertData: Record<string, unknown> = {
    tenant_id: tenantId,
    profile_id: profileId,
    conversation_id: conversationId,
    origin_message_id: originMessageId,
    status: routing.skill ? 'skill_matched' : 'pending',
    classification: intent.classification,
    intent_summary: intent.intent_summary,
    skill_id: routing.skill?.id ?? null,
    skill_key: routing.skill?.key ?? null,
    selected_runtime: routing.skill?.runtime ?? null,
    selected_tools: routing.skill?.allowed_tools ?? [],
    prompt_fragment: routing.skill?.system_prompt_fragment ?? null,
    input_payload: intent.input_payload ?? {},
    idempotency_key: idempotencyKey,
    route_chosen: routing.route,
    agent_used_id: routing.agent?.id ?? null,
    created_temp_agent: routing.createdTempAgent,
    routing_explanation: routing.explanation,
  }

  const { data: taskRun, error: insertError } = await supabase
    .from('ziro_task_runs')
    .insert(insertData)
    .select()
    .single()

  if (insertError) {
    if (insertError.code === '23505') {
      const { data: retry } = await supabase
        .from('ziro_task_runs')
        .select('*')
        .eq('idempotency_key', idempotencyKey)
        .single()
      if (retry) return { ok: true, taskRun: retry as TaskRunRecord, deduplicated: true }
    }
    return { ok: false, error: insertError.message }
  }

  return { ok: true, taskRun: taskRun as TaskRunRecord, skill: routing.skill, routing }
}

// ── Agent Spawning ──────────────────────────────────────

export async function spawnAgent(
  tenantId: string,
  taskRunId: string,
  skillKey: string | null,
  config: Record<string, unknown> = {},
): Promise<{ ok: boolean; agent?: TaskAgentRecord; error?: string; deduplicated?: boolean }> {
  const { data: taskRun, error: fetchErr } = await supabase
    .from('ziro_task_runs')
    .select('id, status, skill_key')
    .eq('id', taskRunId)
    .single()

  if (fetchErr || !taskRun) {
    return { ok: false, error: 'Task run not found' }
  }

  if (taskRun.status !== 'skill_matched') {
    const { data: existingAgent } = await supabase
      .from('ziro_task_agents')
      .select('*')
      .eq('task_run_id', taskRunId)
      .maybeSingle()

    if (existingAgent) {
      return { ok: true, agent: existingAgent as TaskAgentRecord, deduplicated: true }
    }
    return { ok: false, error: `Task run is in '${taskRun.status}' state — expected 'skill_matched'` }
  }

  const { data: agent, error: agentErr } = await supabase
    .from('ziro_task_agents')
    .insert({
      tenant_id: tenantId,
      task_run_id: taskRunId,
      agent_type: 'ephemeral',
      status: 'initializing',
      skill_key: skillKey ?? taskRun.skill_key,
      config,
    })
    .select()
    .single()

  if (agentErr) {
    if (agentErr.code === '23505') {
      const { data: existing } = await supabase
        .from('ziro_task_agents')
        .select('*')
        .eq('task_run_id', taskRunId)
        .single()
      if (existing) return { ok: true, agent: existing as TaskAgentRecord, deduplicated: true }
    }
    return { ok: false, error: agentErr.message }
  }

  await supabase
    .from('ziro_task_runs')
    .update({ status: 'agent_spawned' })
    .eq('id', taskRunId)
    .eq('status', 'skill_matched')

  return { ok: true, agent: agent as TaskAgentRecord }
}

// ── Agent Lifecycle ─────────────────────────────────────

export async function markAgentRunning(agentId: string, taskRunId: string): Promise<void> {
  await Promise.all([
    supabase.from('ziro_task_agents').update({ status: 'running', heartbeat_at: new Date().toISOString() }).eq('id', agentId),
    supabase.from('ziro_task_runs').update({ status: 'running' }).eq('id', taskRunId),
  ])
}

export async function completeAgent(
  agentId: string,
  taskRunId: string,
  result: Record<string, unknown>,
): Promise<void> {
  const now = new Date().toISOString()
  await Promise.all([
    supabase.from('ziro_task_agents').update({
      status: 'retired',
      result,
      retired_at: now,
    }).eq('id', agentId),
    supabase.from('ziro_task_runs').update({
      status: 'completed',
      output_payload: result,
      completed_at: now,
    }).eq('id', taskRunId),
  ])
}

export async function failAgent(
  agentId: string,
  taskRunId: string,
  errorText: string,
): Promise<void> {
  const now = new Date().toISOString()
  await Promise.all([
    supabase.from('ziro_task_agents').update({
      status: 'failed',
      error_text: errorText,
      retired_at: now,
    }).eq('id', agentId),
    supabase.from('ziro_task_runs').update({
      status: 'failed',
      error_text: errorText,
      completed_at: now,
    }).eq('id', taskRunId),
  ])
}

export async function heartbeatAgent(agentId: string): Promise<void> {
  await supabase
    .from('ziro_task_agents')
    .update({ heartbeat_at: new Date().toISOString() })
    .eq('id', agentId)
}

// ── Full Pipeline ───────────────────────────────────────

/**
 * The complete orchestration handoff from chat.
 *
 * Routing waterfall:
 * 1. Classify intent
 * 2. Route via 4-tier engine (direct > skill > agent > temp_agent)
 * 3. Create task run with routing metadata
 * 4. Spawn agent only if skill was matched
 * 5. Return routing decision for UI labeling
 */
export async function orchestrateFromChat(params: {
  tenantId: string
  profileId: string
  conversationId: string | null
  originMessageId: string | null
  userQuestion: string
  assistantAnswer: string
  proposedAction?: { action: string; params: Record<string, unknown> } | null
}): Promise<TaskRunResult & { intent: OrchestrationIntent }> {
  const intent = classifyIntent(
    params.userQuestion,
    params.assistantAnswer,
    params.proposedAction,
  )

  // Quick answers and skill proposals — no task run needed
  if (intent.classification === 'quick_answer' || intent.classification === 'skill_proposal') {
    return {
      ok: true,
      intent,
      routing: {
        route: 'direct',
        skill: null,
        agent: null,
        explanation: intent.classification === 'skill_proposal'
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

  if (!runResult.ok || !runResult.taskRun) {
    return { ...runResult, intent }
  }

  if (runResult.deduplicated) {
    return { ...runResult, intent }
  }

  // Only spawn ephemeral task agent if skill was matched
  if (runResult.taskRun.status === 'skill_matched') {
    const spawnResult = await spawnAgent(
      params.tenantId,
      runResult.taskRun.id,
      runResult.taskRun.skill_key,
      { intent_summary: intent.intent_summary },
    )

    if (spawnResult.ok && spawnResult.agent && !spawnResult.deduplicated) {
      await markAgentRunning(spawnResult.agent.id, runResult.taskRun.id)
      if (runResult.skill?.id) recordSkillUsage(runResult.skill.id)
      return { ...runResult, agent: spawnResult.agent, intent }
    }

    if (spawnResult.agent) {
      return { ...runResult, agent: spawnResult.agent, intent }
    }
  }

  return { ...runResult, intent }
}

// ── Increment skill use count ───────────────────────────

export function recordSkillUsage(skillId: string): void {
  supabase.rpc('increment_skill_use_count', { p_skill_id: skillId }).catch(() => {})
}
