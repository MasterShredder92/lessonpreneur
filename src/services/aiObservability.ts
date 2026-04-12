/**
 * Durable logging for Ziro / ai-assistant (Supabase). Never throws — assistant UX must survive logging failures.
 */
import { supabase } from '../lib/supabase'

export async function logZiroStructuredAction(params: {
  ctx: { tenantId: string; profileId: string }
  actionId: string
  payload: unknown
  result: { ok: boolean; code?: string; message?: string; scheduleMove?: unknown }
  conversationId?: string | null
  idempotencyKey?: string | null
}): Promise<void> {
  try {
    const payloadJson =
      params.payload === undefined || params.payload === null
        ? null
        : (JSON.parse(JSON.stringify(params.payload)) as object)
    const resultJson = JSON.parse(JSON.stringify(params.result)) as object
    const { error } = await supabase.from('ai_action_logs').insert({
      tenant_id: params.ctx.tenantId,
      profile_id: params.ctx.profileId,
      conversation_id: params.conversationId ?? null,
      action_id: params.actionId,
      payload: payloadJson,
      result: resultJson,
      ok: params.result.ok,
      error_code: params.result.ok ? null : params.result.code,
      error_message: params.result.ok ? null : params.result.message,
      idempotency_key: params.idempotencyKey ?? null,
    })
    if (error) console.warn('[aiObservability] ai_action_logs:', error.message)
  } catch (e) {
    console.warn('[aiObservability] ai_action_logs insert failed', e)
  }
}

export async function submitAiMessageFeedback(params: {
  tenantId: string
  profileId: string
  messageId: string
  conversationId?: string | null
  rating: -1 | 0 | 1
  comment?: string | null
}): Promise<{ ok: boolean; error?: string }> {
  try {
    const { data: existing, error: selErr } = await supabase
      .from('ai_feedback')
      .select('id')
      .eq('profile_id', params.profileId)
      .eq('message_id', params.messageId)
      .maybeSingle()
    if (selErr) return { ok: false, error: selErr.message }

    if (existing?.id) {
      const { error: upErr } = await supabase
        .from('ai_feedback')
        .update({
          rating: params.rating,
          comment: params.comment ?? null,
        })
        .eq('id', existing.id)
      if (upErr) return { ok: false, error: upErr.message }
      return { ok: true }
    }

    const { error } = await supabase.from('ai_feedback').insert({
      tenant_id: params.tenantId,
      profile_id: params.profileId,
      message_id: params.messageId,
      conversation_id: params.conversationId ?? null,
      rating: params.rating,
      comment: params.comment ?? null,
    })
    if (error) return { ok: false, error: error.message }
    return { ok: true }
  } catch (e: unknown) {
    return { ok: false, error: e instanceof Error ? e.message : 'Unknown error' }
  }
}
