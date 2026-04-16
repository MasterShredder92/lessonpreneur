import { supabase } from '../lib/supabase'
import { getErrorMessage } from '../lib/errors'

// ─── Types (edge `ai-assistant` JSON body / response) ───────────────────────

/** Parsed JSON from `ai-assistant`. Prefer `answer`; `response` is legacy. */
export type AiAssistantJson = {
  answer?: string
  /** Legacy field — do not add new writes; read via `pickAiAssistantAnswerText`. */
  response?: string
  error?: string
  proposed_action?: ProposedAction
  usage?: unknown
  /** Server-normalized chat session id (persisted to ai_conversations). */
  ai_session_id?: string | null
  /** Last assistant turn in ai_messages (for thumbs feedback). */
  assistant_message_id?: string | null
}

/** Shared telemetry for ai-assistant edge (persisted server-side). */
export type AiAssistantTelemetry = {
  aiSessionId?: string | null
  /** e.g. ziro_business | ziro_schedule | whats_important */
  source?: string
  clientRoute?: string | null
  clientPageContext?: Record<string, unknown> | null
}

export interface ProposedAction {
  action: string
  params: Record<string, unknown>
  description: string
}

export interface ScheduleContext {
  location_id: string
  location_name: string
  date: string
  timezone: string
  teachers: Array<{ id: string; name: string }>
  blocks: Array<{
    block_id: string
    teacher_id: string
    teacher_name: string
    student_id: string | null
    student_name: string | null
    instrument: string | null
    start_time: string
    end_time: string
    status: string
    block_type: string
    room: string | null
  }>
  time_slots: string[]
}

/** Centralized assistant text extraction (backward compatible). */
export function pickAiAssistantAnswerText(data: AiAssistantJson | null | undefined): string {
  if (!data) return ''
  return (data.answer ?? data.response ?? '').trim()
}

/**
 * Single HTTP path for `ai-assistant` (Ziro panel, Students insight, Schedule chat, etc.).
 * Supabase Edge gateway expects:
 * - `Authorization: Bearer <user access_token>` — end-user JWT
 * - `apikey: <anon key>` — project anon key (omit → HTTP 401 from gateway)
 *
 * Do not call `fetch(EDGE_FUNCTIONS.aiAssistant, …)` elsewhere; extend this helper if needed.
 */
function mergeTelemetry(
  base: Record<string, unknown>,
  telemetry?: AiAssistantTelemetry,
): Record<string, unknown> {
  if (!telemetry) return base
  if (telemetry.aiSessionId) base.ai_session_id = telemetry.aiSessionId
  if (telemetry.source) base.source = telemetry.source
  if (telemetry.clientRoute != null) base.client_route = telemetry.clientRoute
  if (telemetry.clientPageContext != null) base.client_page_context = telemetry.clientPageContext
  return base
}

async function invokeAiAssistantEdge(
  body: Record<string, unknown>,
  timeoutMs: number,
): Promise<AiAssistantJson> {
  try {
    const { data, error } = await supabase.functions.invoke('ai-assistant', {
      body,
      timeout: timeoutMs,
    })
    if (error) {
      // FunctionsHttpError / FunctionsRelayError / FunctionsFetchError
      const msg = error?.message || 'Edge function error'
      return { error: msg }
    }
    return (data ?? {}) as AiAssistantJson
  } catch (err) {
    return { error: getErrorMessage(err) }
  }
}

/**
 * Business path: sends `system_override` → edge uses Claude without scheduling tools.
 * TODO(deploy): Repo has two `ai-assistant` sources; production must match `app/supabase/functions/ai-assistant`.
 * TODO(sql): Snapshot-heavy prompts still assume tenant-wide `get_ziro_context` until RPC is scoped.
 */
export async function postAiAssistantBusinessOverride(params: {
  tenantId: string
  question: string
  systemOverride: string
  conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>
  timeoutMs?: number
  telemetry?: AiAssistantTelemetry
}): Promise<AiAssistantJson> {
  const so = params.systemOverride?.trim()
  if (!so) {
    return {
      error:
        'Business path refused: empty systemOverride. Not calling ai-assistant (would risk scheduling-mode fallback).',
    }
  }

  return invokeAiAssistantEdge(
    mergeTelemetry(
      {
        question: params.question.trim(),
        tenant_id: params.tenantId,
        conversation_history: params.conversationHistory ?? [],
        system_override: so,
      },
      params.telemetry,
    ),
    params.timeoutMs ?? 60_000,
  )
}

/** @deprecated Alias — use `postAiAssistantBusinessOverride`. */
export const postAiAssistantBusinessSnapshot = postAiAssistantBusinessOverride

/**
 * Interactive assistant: either **scheduling** (grid + tools) or **business** (`system_override`),
 * matching `useAI` / edge contract. Prefer `postAiAssistantBusinessOverride` when you only need business path.
 * Refuses the request (returns `{ error }`) if both `businessContext` and `scheduleContext` are absent.
 */
export async function postAiAssistantInteractive(params: {
  tenantId: string
  question: string
  conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>
  scheduleContext?: ScheduleContext | null
  /** If set, becomes `system_override` (business path). Empty string is treated as absent. */
  businessContext?: string | null
  timeoutMs?: number
  telemetry?: AiAssistantTelemetry
}): Promise<AiAssistantJson> {
  const bizTrim = params.businessContext?.trim()
  const hasSchedule = params.scheduleContext != null
  if (!bizTrim && !hasSchedule) {
    return {
      error:
        'Ziro: missing both business snapshot and schedule context — refusing request (would hit wrong edge mode).',
    }
  }

  const ctx = params.scheduleContext ?? undefined
  return invokeAiAssistantEdge(
    mergeTelemetry(
      {
        question: params.question.trim(),
        tenant_id: params.tenantId,
        conversation_history: params.conversationHistory ?? [],
        schedule_context: ctx,
        business_context: bizTrim || undefined,
        timezone: ctx?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
        system_override: bizTrim || undefined,
      },
      params.telemetry,
    ),
    params.timeoutMs ?? 15_000,
  )
}
