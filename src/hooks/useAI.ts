import { useState, useCallback, useRef } from 'react'
import { EDGE_FUNCTIONS } from '../lib/config'
import { safeFetch } from '../lib/safeFetch'
import {
  type ScheduleContext,
  type ProposedAction,
  type AiAssistantJson,
  type AiAssistantTelemetry,
  postAiAssistantInteractive,
  pickAiAssistantAnswerText,
  postAiAssistantBusinessOverride,
  postAiAssistantBusinessSnapshot,
} from '../services/aiAssistantClient'
import { cleanZiroResponseText } from '../ziro/cleanZiroResponseText'
import { classifyQuery, enforceZiroResponsePolicy } from '../ziro/enforceZiroResponsePolicy'

export type { ScheduleContext, ProposedAction, AiAssistantJson } from '../services/aiAssistantClient'
/** @deprecated Use `postAiAssistantBusinessOverride` from `services/aiAssistantClient`. */
export { postAiAssistantBusinessOverride, postAiAssistantBusinessSnapshot }

export interface ZiroChatMessage {
  role: 'user' | 'assistant'
  content: string
  /** Populated for assistant rows when edge persisted the turn. */
  assistantMessageId?: string | null
}

export interface UseAiOptions {
  /** Business path only: transform assistant text before it is stored (e.g. strip `ZIRO_ACTION` lines). Second arg = persisted session id when known. */
  transformBusinessAssistantText?: (text: string, aiSessionId: string | null) => string
  /** Merged into ai-assistant `client_page_context` for observability (Ziro shell pageContext). */
  getClientPageContext?: () => Record<string, unknown>
}

/**
 * Star / `ai-assistant` edge contract (see `app/supabase/functions/ai-assistant/index.ts`):
 *
 * - **Business path:** `businessContext` → `system_override`. Edge: Claude only (no scheduling tools).
 * - **Scheduling path:** no `businessContext` → tool-use mode; pass **`scheduleContext`** from Schedule page.
 * - **Wrong mode:** neither context → scheduling assistant with empty grid (avoid).
 *
 * Prefer named hooks: **`useStarBusinessChat`** vs **`useScheduleStarChat`** instead of positional `useAI`.
 *
 * @deprecated Four-arg `useAI` — prefer `useStarBusinessChat` / `useScheduleStarChat`.
 */
export function useAI(
  tenantId: string | null,
  scheduleContext?: ScheduleContext | null,
  businessContext?: string | null,
  options?: UseAiOptions,
) {
  const [messages, setMessages] = useState<ZiroChatMessage[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pendingAction, setPendingAction] = useState<ProposedAction | null>(null)

  const messagesRef = useRef<ZiroChatMessage[]>([])
  messagesRef.current = messages
  const contextRef = useRef(scheduleContext)
  contextRef.current = scheduleContext
  const bizContextRef = useRef(businessContext)
  bizContextRef.current = businessContext
  const aiSessionIdRef = useRef<string | null>(null)
  const [aiSessionId, setAiSessionId] = useState<string | null>(null)

  const syncAiSessionId = useCallback((id: string | null) => {
    aiSessionIdRef.current = id
    setAiSessionId(id)
  }, [])

  const sendMessage = useCallback(async (question: string) => {
    if (!tenantId || !question.trim()) return

    const userMsg: ZiroChatMessage = { role: 'user', content: question.trim() }
    setMessages((prev) => [...prev, userMsg])
    setIsLoading(true)
    setError(null)

    try {
      const ctx = contextRef.current
      const biz = bizContextRef.current
      if (import.meta.env.DEV && ctx && biz) {
        console.warn(
          '[useAI] Both scheduleContext and businessContext are set; edge uses system_override (business path). Schedule grid is not used for the model.',
        )
      }

      if (!aiSessionIdRef.current) syncAiSessionId(crypto.randomUUID())

      const modeSource: AiAssistantTelemetry['source'] = ctx
        ? 'ziro_schedule'
        : biz?.trim()
          ? 'ziro_business'
          : 'ziro_interactive'

      const telemetry: AiAssistantTelemetry = {
        aiSessionId: aiSessionIdRef.current,
        source: modeSource,
        clientRoute: typeof window !== 'undefined' ? `${window.location.pathname}${window.location.search}` : undefined,
        clientPageContext: options?.getClientPageContext?.() ?? null,
      }

      const data: AiAssistantJson = await postAiAssistantInteractive({
        tenantId,
        question: question.trim(),
        conversationHistory: messagesRef.current.slice(-10),
        scheduleContext: ctx,
        businessContext: biz,
        timeoutMs: 30_000,
        telemetry,
      })

      if (data.ai_session_id) syncAiSessionId(data.ai_session_id)

      if (data.error) {
        const isTimeoutError = /timed?\s*out/i.test(data.error)
        const errorDisplay = isTimeoutError
          ? 'Ziro took too long to respond — try a simpler question or try again.'
          : data.error
        setError(data.error)
        setMessages((prev) => [...prev, { role: 'assistant', content: errorDisplay }])
      } else {
        const intent = classifyQuery(question.trim())
        let text = enforceZiroResponsePolicy(
          cleanZiroResponseText(pickAiAssistantAnswerText(data)),
          intent,
        )
        if (biz?.trim() && options?.transformBusinessAssistantText) {
          text = options.transformBusinessAssistantText(text, aiSessionIdRef.current)
        }
        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            content: text || 'Ziro had no response — please try rephrasing your question.',
            assistantMessageId: data.assistant_message_id ?? null,
          },
        ])
        if (data.proposed_action) {
          setPendingAction(data.proposed_action as ProposedAction)
        }
      }
    } catch (err: unknown) {
      const e = err as { name?: string; message?: string }
      const isTimeout = e?.name === 'AbortError'
      const msg = isTimeout ? 'Ziro took too long to respond — try a simpler question or try again.' : 'Failed to reach Ziro. Check your connection and try again.'
      setError(isTimeout ? 'timeout' : e?.message ?? null)
      setMessages((prev) => [...prev, { role: 'assistant', content: msg }])
    } finally {
      setIsLoading(false)
    }
  }, [tenantId, options?.transformBusinessAssistantText, options?.getClientPageContext, syncAiSessionId])

  const confirmAction = useCallback(async () => {
    if (!pendingAction || !tenantId) return
    setIsLoading(true)
    try {
      const data = await safeFetch<{ error?: string; message?: string }>(
        EDGE_FUNCTIONS.aiScheduleAction,
        {
          body: {
            action: pendingAction.action,
            tenant_id: tenantId,
            params: pendingAction.params,
          },
          timeoutMs: 30_000,
        },
      )
      if (data.error) {
        setMessages((prev) => [...prev, { role: 'assistant', content: `Action failed: ${data.error}` }])
      } else {
        setMessages((prev) => [...prev, { role: 'assistant', content: `Done! ${data.message}` }])
      }
      setPendingAction(null)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      setMessages((prev) => [...prev, { role: 'assistant', content: `Action failed: ${msg}` }])
    } finally {
      setIsLoading(false)
    }
  }, [pendingAction, tenantId])

  const rejectAction = useCallback(() => {
    setPendingAction(null)
    setMessages((prev) => [...prev, { role: 'assistant', content: 'Action cancelled. Let me know if you need anything else.' }])
  }, [])

  const clearConversation = useCallback(() => {
    setMessages([])
    setError(null)
    setPendingAction(null)
    syncAiSessionId(null)
  }, [syncAiSessionId])

  return {
    messages,
    isLoading,
    error,
    sendMessage,
    clearConversation,
    pendingAction,
    confirmAction,
    rejectAction,
    /** Persisted chat session id (ai_conversations) when edge returns `ai_session_id`. */
    aiSessionId,
  }
}

/** Internal business-only prompt if caller passes empty string (must never reach edge as empty `system_override`). */
const STAR_BUSINESS_GUARD_EMPTY =
  '[ZIRO INTERNAL] Configuration error: empty business context. Reply only: "Ziro is misconfigured — please refresh." Do not use scheduling tools.'

/** Business snapshot / Ziro panel path — `system_override` only. Pass a non-empty string; loading states should use an explicit loading prompt, not null. */
export function useStarBusinessChat(
  tenantId: string | null,
  businessContext: string,
  options?: UseAiOptions,
) {
  const safe = businessContext.trim() ? businessContext : STAR_BUSINESS_GUARD_EMPTY
  if (import.meta.env.DEV && !businessContext.trim()) {
    console.error('[useStarBusinessChat] Empty businessContext — using guard string to avoid scheduling-mode fallback')
  }
  return useAI(tenantId, null, safe, options)
}

/** Ziro slideout / business Q&A — same as `useStarBusinessChat` (legacy name retained for imports). */
export const useZiroBusinessChat = useStarBusinessChat

/**
 * Schedule page adapter: Star in **scheduling/tools** mode (grid + proposed actions).
 * For school-wide business Q&A, use `useStarGlobalContext` + `useStarComposedBusinessPrompt` or `useStarBusinessChat` with composed prompt.
 */
export function useScheduleStarChat(
  tenantId: string | null,
  scheduleContext: ScheduleContext | null | undefined,
  options?: UseAiOptions,
) {
  return useAI(tenantId, scheduleContext ?? null, null, options)
}
