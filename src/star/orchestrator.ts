/**
 * Ziro Task Orchestrator
 *
 * Sits between chat response and action execution. When STAR classifies a
 * message as actionable work (not just a quick answer), this module:
 *
 * 1. Creates a persistent task run record (ziro_task_runs)
 * 2. Matches the intent to an active skill (ziro_skills)
 * 3. Spawns exactly one worker agent (ziro_task_agents) with a UNIQUE constraint guard
 * 4. Links the agent to the conversation, message, and skill
 * 5. Retires the agent cleanly on completion or failure
 *
 * Guards:
 * - UNIQUE(task_run_id) on ziro_task_agents prevents duplicate agents
 * - UNIQUE(idempotency_key) on ziro_task_runs prevents duplicate task runs
 * - Agent spawn only happens AFTER the task run row exists and is in 'skill_matched' status
 * - High/critical risk skills require is_active=true (enforced at query time)
 */

import { supabase } from '../lib/supabase'

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
  error?: string
  /** True when task run already existed (idempotency hit) */
  deduplicated?: boolean
}

// ── Classification ──────────────────────────────────────

/**
 * Client-side intent classifier. Examines the assistant's response text
 * and any proposed action to determine if this needs orchestration.
 *
 * Returns 'quick_answer' for normal chat, 'actionable_task' when the
 * response indicates work that should be tracked, 'skill_proposal'
 * when STAR wants to propose a new skill.
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
      'crm.navigate': '', // navigation is instant, not a task
      'crm.audit_ping': '', // audit is instant
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

  // Check for skill proposal language in the assistant's response
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

  // Check for task-like language in the question that maps to known skills
  const taskPatterns: Array<{ pattern: RegExp; skill: string; summary: string }> = [
    { pattern: /follow.?up.*(lead|inquiry)/i, skill: 'lead_followup', summary: 'Lead follow-up task' },
    { pattern: /draft.*(parent|family).*(message|email|sms)/i, skill: 'parent_comms', summary: 'Draft parent communication' },
    { pattern: /morning briefing|daily.*summary/i, skill: 'morning_briefing', summary: 'Generate morning briefing' },
    { pattern: /churn|at.?risk|retention.*analys/i, skill: 'churn_analysis', summary: 'Churn risk analysis' },
    { pattern: /billing.*(summary|report|insight|anomal)/i, skill: 'billing_insight', summary: 'Billing insight generation' },
    { pattern: /teacher.*(eval|review|performance)/i, skill: 'teacher_eval', summary: 'Teacher performance evaluation' },
    { pattern: /session.*(recap|note|polish|enhance)/i, skill: 'session_recap', summary: 'Session note enhancement' },
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

// ── Skill Matching ──────────────────────────────────────

/**
 * Finds the best active skill for the given intent.
 * Only returns skills that are active (is_active=true).
 */
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

// ── Task Run Creation ───────────────────────────────────

/**
 * Creates a task run record. Idempotency-safe: if the key already exists,
 * returns the existing record instead of creating a duplicate.
 *
 * Status flow: pending → skill_matched → agent_spawned → running → completed|failed
 */
export async function createTaskRun(params: CreateTaskRunParams): Promise<TaskRunResult> {
  const { tenantId, profileId, conversationId, originMessageId, intent, idempotencyKey } = params

  // Step 1: Check for existing run with this idempotency key
  const { data: existing } = await supabase
    .from('ziro_task_runs')
    .select('*')
    .eq('idempotency_key', idempotencyKey)
    .maybeSingle()

  if (existing) {
    return { ok: true, taskRun: existing as TaskRunRecord, deduplicated: true }
  }

  // Step 2: Match skill
  const skill = await matchSkill(tenantId, intent.suggested_skill_key)

  // Step 3: Create the task run
  const insertData: Record<string, unknown> = {
    tenant_id: tenantId,
    profile_id: profileId,
    conversation_id: conversationId,
    origin_message_id: originMessageId,
    status: skill ? 'skill_matched' : 'pending',
    classification: intent.classification,
    intent_summary: intent.intent_summary,
    skill_id: skill?.id ?? null,
    skill_key: skill?.key ?? null,
    selected_runtime: skill?.runtime ?? null,
    selected_tools: skill?.allowed_tools ?? [],
    prompt_fragment: skill?.system_prompt_fragment ?? null,
    input_payload: intent.input_payload ?? {},
    idempotency_key: idempotencyKey,
  }

  const { data: taskRun, error: insertError } = await supabase
    .from('ziro_task_runs')
    .insert(insertData)
    .select()
    .single()

  if (insertError) {
    // Handle unique constraint violation (concurrent duplicate)
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

  return { ok: true, taskRun: taskRun as TaskRunRecord, skill }
}

// ── Agent Spawning ──────────────────────────────────────

/**
 * Spawns an agent for a task run. UNIQUE(task_run_id) on ziro_task_agents
 * prevents duplicate agents — if one already exists, returns it instead.
 *
 * GUARDS:
 * 1. Task run must exist
 * 2. Task run status must be 'skill_matched' (not pending, not already running)
 * 3. UNIQUE constraint prevents duplicate agents per task run
 * 4. Transitions task run to 'agent_spawned' atomically
 */
export async function spawnAgent(
  tenantId: string,
  taskRunId: string,
  skillKey: string | null,
  config: Record<string, unknown> = {},
): Promise<{ ok: boolean; agent?: TaskAgentRecord; error?: string; deduplicated?: boolean }> {
  // Guard 1: Verify task run exists and is in the right state
  const { data: taskRun, error: fetchErr } = await supabase
    .from('ziro_task_runs')
    .select('id, status, skill_key')
    .eq('id', taskRunId)
    .single()

  if (fetchErr || !taskRun) {
    return { ok: false, error: 'Task run not found — cannot spawn agent without persisted workflow' }
  }

  // Guard 2: Only spawn from skill_matched state
  if (taskRun.status !== 'skill_matched') {
    // Check if agent already exists (idempotent return)
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

  // Guard 3: Insert agent with UNIQUE constraint (prevents duplicates)
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
    // UNIQUE violation = agent already exists
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

  // Guard 4: Transition task run to agent_spawned
  await supabase
    .from('ziro_task_runs')
    .update({ status: 'agent_spawned' })
    .eq('id', taskRunId)
    .eq('status', 'skill_matched') // optimistic lock — only transition if still skill_matched

  return { ok: true, agent: agent as TaskAgentRecord }
}

// ── Agent Lifecycle ─────────────────────────────────────

/** Mark agent as running and transition task run to 'running'. */
export async function markAgentRunning(agentId: string, taskRunId: string): Promise<void> {
  await Promise.all([
    supabase.from('ziro_task_agents').update({ status: 'running', heartbeat_at: new Date().toISOString() }).eq('id', agentId),
    supabase.from('ziro_task_runs').update({ status: 'running' }).eq('id', taskRunId),
  ])
}

/** Complete agent work, write result, retire agent, complete task run. */
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

/** Fail agent and task run with error. */
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

/** Send heartbeat to keep agent alive (prevents stale detection). */
export async function heartbeatAgent(agentId: string): Promise<void> {
  await supabase
    .from('ziro_task_agents')
    .update({ heartbeat_at: new Date().toISOString() })
    .eq('id', agentId)
}

// ── Full Pipeline ───────────────────────────────────────

/**
 * The complete orchestration handoff. Called after STAR responds to a chat message.
 *
 * Pipeline order:
 * 1. Classify intent (quick_answer → return early, no orchestration)
 * 2. Create task run (idempotency-safe)
 * 3. Match skill (if available)
 * 4. Spawn agent (UNIQUE guard prevents duplicates)
 * 5. Mark agent running
 * 6. Return handle for caller to drive completion
 *
 * The caller (useAI / ZiroPanel) drives the agent to completion by calling
 * completeAgent() or failAgent() after the work is done.
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

  // Quick answers don't need orchestration
  if (intent.classification === 'quick_answer') {
    return { ok: true, intent }
  }

  // Skill proposals don't spawn agents — they go to the proposals table
  if (intent.classification === 'skill_proposal') {
    return { ok: true, intent }
  }

  // Build idempotency key from conversation + intent
  const idempotencyKey = `${params.conversationId ?? 'no-conv'}:${intent.intent_summary}:${Date.now()}`

  // Step 1: Create task run
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

  // If deduplicated, return existing run without spawning another agent
  if (runResult.deduplicated) {
    return { ...runResult, intent }
  }

  // Step 2: Only spawn agent if skill was matched (has a real workflow to attach to)
  if (runResult.taskRun.status === 'skill_matched') {
    const spawnResult = await spawnAgent(
      params.tenantId,
      runResult.taskRun.id,
      runResult.taskRun.skill_key,
      { intent_summary: intent.intent_summary },
    )

    if (spawnResult.ok && spawnResult.agent && !spawnResult.deduplicated) {
      // Mark running immediately for synchronous execution
      await markAgentRunning(spawnResult.agent.id, runResult.taskRun.id)
      // Record skill usage (fire-and-forget)
      if (runResult.skill?.id) recordSkillUsage(runResult.skill.id)
      return { ...runResult, agent: spawnResult.agent, intent }
    }

    // Agent already existed (deduplicated) or spawn failed — return what we have
    if (spawnResult.agent) {
      return { ...runResult, agent: spawnResult.agent, intent }
    }
  }

  return { ...runResult, intent }
}

// ── Increment skill use count ───────────────────────────

/** Fire-and-forget: bump use_count and last_used_at on the matched skill. */
export function recordSkillUsage(skillId: string): void {
  supabase.rpc('increment_skill_use_count', { p_skill_id: skillId }).catch(() => {})
}
