import { supabase } from '../../lib/supabase'
import type { CreateTaskRunParams, TaskRunRecord, TaskRunResult } from './types'
import { routeTask } from './routing'

export async function createTaskRun(params: CreateTaskRunParams): Promise<TaskRunResult> {
  const { tenantId, profileId, conversationId, originMessageId, intent, idempotencyKey } = params

  const { data: existing } = await supabase
    .from('ziro_task_runs')
    .select('*')
    .eq('idempotency_key', idempotencyKey)
    .maybeSingle()

  if (existing) {
    return { ok: true, taskRun: existing as TaskRunRecord, deduplicated: true }
  }

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

export function recordSkillUsage(skillId: string): void {
  supabase.rpc('increment_skill_use_count', { p_skill_id: skillId }).catch((err) => {
    console.error('[recordSkillUsage] increment_skill_use_count failed:', err)
  })
}

