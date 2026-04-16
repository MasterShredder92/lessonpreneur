import { supabase } from '../../lib/supabase'
import { findOverlappingAgent, VAGUE_AGENT_NAMES } from './validation'
import type { AgentRecord, TaskAgentRecord } from './types'

export async function createTempAgent(
  tenantId: string,
  name: string,
  purpose: string,
  skillId: string | null,
  createdBy: string | null,
): Promise<{ ok: boolean; agent?: AgentRecord; error?: string }> {
  if (VAGUE_AGENT_NAMES.some(v => name.toLowerCase().includes(v))) {
    return { ok: false, error: `Agent name "${name}" is too vague. Use a specific specialist name.` }
  }

  const { data: existing } = await supabase
    .from('ziro_agents')
    .select('id, name, purpose')
    .eq('tenant_id', tenantId)
    .eq('status', 'active')
    .limit(50)

  if (existing) {
    const overlap = findOverlappingAgent(existing, name, purpose)
    if (overlap) {
      return {
        ok: false,
        error: `Active agent "${overlap.name}" already covers a similar purpose. Retire or update it instead.`,
      }
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
      is_visible_in_ui: false,
      is_archived: false,
      business_context: 'ephemeral',
    })
    .select()
    .single()

  if (error) return { ok: false, error: error.message }

  if (skillId) {
    await supabase.from('ziro_agent_skills').insert({
      tenant_id: tenantId,
      agent_id: agent.id,
      skill_id: skillId,
      is_primary: true,
    })
  }

  await supabase.from('ziro_agents').insert({
    tenant_id: tenantId,
    agent_id: agent.id,
  })

  return { ok: true, agent: agent as AgentRecord }
}

export async function retireTempAgent(tenantId: string, agentId: string): Promise<void> {
  const now = new Date().toISOString()
  await Promise.all([
    supabase
      .from('ziro_agents')
      .update({ status: 'retired', retired_at: now })
      .eq('id', agentId)
      .eq('tenant_id', tenantId)
      .eq('lifecycle_type', 'temporary'),
    supabase.from('ziro_agents').delete().eq('agent_id', agentId).eq('tenant_id', tenantId),
  ])
}

export async function retainTempAgent(tenantId: string, agentId: string): Promise<void> {
  await supabase
    .from('ziro_agents')
    .update({ lifecycle_type: 'persistent' })
    .eq('id', agentId)
    .eq('tenant_id', tenantId)
}

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
    return {
      ok: false,
      error: `Task run is in '${taskRun.status}' state — expected 'skill_matched'`,
    }
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

export async function markAgentRunning(agentId: string, taskRunId: string): Promise<void> {
  await Promise.all([
    supabase
      .from('ziro_task_agents')
      .update({ status: 'running', heartbeat_at: new Date().toISOString() })
      .eq('id', agentId),
    supabase.from('ziro_task_runs').update({ status: 'running' }).eq('id', taskRunId),
  ])
}

export async function completeAgent(
  agentId: string,
  taskRunId: string,
  result: Record<string, unknown>,
): Promise<void> {
  const now = new Date().toISOString()
  await supabase
    .from('ziro_task_agents')
    .update({
      status: 'retired',
      result,
      retired_at: now,
    })
    .eq('id', agentId)
  await supabase
    .from('ziro_task_runs')
    .update({
      status: 'completed',
      output_payload: result,
      completed_at: now,
    })
    .eq('id', taskRunId)
}

export async function failAgent(
  agentId: string,
  taskRunId: string,
  errorText: string,
): Promise<void> {
  const now = new Date().toISOString()
  await Promise.all([
    supabase
      .from('ziro_task_agents')
      .update({
        status: 'failed',
        error_text: errorText,
        retired_at: now,
      })
      .eq('id', agentId),
    supabase
      .from('ziro_task_runs')
      .update({
        status: 'failed',
        error_text: errorText,
        completed_at: now,
      })
      .eq('id', taskRunId),
  ])
}

export async function heartbeatAgent(agentId: string): Promise<void> {
  await supabase
    .from('ziro_task_agents')
    .update({ heartbeat_at: new Date().toISOString() })
    .eq('id', agentId)
}

