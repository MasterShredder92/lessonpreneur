import { EDGE_FUNCTIONS } from '../lib/config'
import { safeFetch } from '../lib/safeFetch'
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
 * Single HTTP path for `ai-assistant` (Star modal, Students insight, Schedule chat, etc.).
 * Supabase Edge gateway expects:
 * - `Authorization: Bearer <user access_token>` — end-user JWT
 * - `apikey: <anon key>` — project anon key (omit → HTTP 401 from gateway)
 *
 * Do not call `fetch(EDGE_FUNCTIONS.aiAssistant, …)` elsewhere; extend this helper if needed.
 */
async function invokeAiAssistantEdge(
  body: Record<string, unknown>,
  timeoutMs: number,
): Promise<AiAssistantJson> {
  try {
    return await safeFetch<AiAssistantJson>(EDGE_FUNCTIONS.aiAssistant, {
      body,
      timeoutMs,
    })
  } catch (err) {
    return { error: getErrorMessage(err) }
  }
}

/**
 * Business path: sends `system_override` → edge uses Claude without scheduling tools.
 * TODO(deploy): Repo has two `ai-assistant` sources; production must match `app/supabase/functions/ai-assistant`.
 * TODO(sql): Snapshot-heavy prompts still assume tenant-wide `get_star_context` until RPC is scoped.
 */
export async function postAiAssistantBusinessOverride(params: {
  tenantId: string
  question: string
  systemOverride: string
  conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>
  timeoutMs?: number
}): Promise<AiAssistantJson> {
  const so = params.systemOverride?.trim()
  if (!so) {
    return {
      error:
        'Business path refused: empty systemOverride. Not calling ai-assistant (would risk scheduling-mode fallback).',
    }
  }

  return invokeAiAssistantEdge(
    {
      question: params.question.trim(),
      tenant_id: params.tenantId,
      conversation_history: params.conversationHistory ?? [],
      system_override: so,
    },
    params.timeoutMs ?? 60_000,
  )
}

/** @deprecated Alias — use `postAiAssistantBusinessOverride`. */
export const postAiAssistantBusinessSnapshot = postAiAssistantBusinessOverride

/**
 * Interactive Star chat: either **scheduling** (grid + tools) or **business** (`system_override`),
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
}): Promise<AiAssistantJson> {
  const bizTrim = params.businessContext?.trim()
  const hasSchedule = params.scheduleContext != null
  if (!bizTrim && !hasSchedule) {
    return {
      error:
        'Star: missing both business snapshot and schedule context — refusing request (would hit wrong edge mode).',
    }
  }

  const ctx = params.scheduleContext ?? undefined
  return invokeAiAssistantEdge(
    {
      question: params.question.trim(),
      tenant_id: params.tenantId,
      conversation_history: params.conversationHistory ?? [],
      schedule_context: ctx,
      business_context: bizTrim || undefined,
      timezone: ctx?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
      system_override: bizTrim || undefined,
    },
    params.timeoutMs ?? 15_000,
  )
}
