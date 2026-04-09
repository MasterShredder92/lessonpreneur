import { useState, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { EDGE_FUNCTIONS } from '../lib/config'
import {
  type ScheduleContext,
  type ProposedAction,
  type AiAssistantJson,
  postAiAssistantInteractive,
  pickAiAssistantAnswerText,
  postAiAssistantBusinessOverride,
  postAiAssistantBusinessSnapshot,
} from '../services/aiAssistantClient'

export type { ScheduleContext, ProposedAction, AiAssistantJson } from '../services/aiAssistantClient'
/** @deprecated Use `postAiAssistantBusinessOverride` from `services/aiAssistantClient`. */
export { postAiAssistantBusinessOverride, postAiAssistantBusinessSnapshot }

interface Message {
  role: 'user' | 'assistant'
  content: string
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
 * @deprecated Three-arg `useAI(tenantId, schedule?, business?)` is easy to confuse — use `useStarBusinessChat` / `useScheduleStarChat`.
 */
export function useAI(tenantId: string | null, scheduleContext?: ScheduleContext | null, businessContext?: string | null) {
  const [messages, setMessages] = useState<Message[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pendingAction, setPendingAction] = useState<ProposedAction | null>(null)

  const messagesRef = useRef<Message[]>([])
  messagesRef.current = messages
  const contextRef = useRef(scheduleContext)
  contextRef.current = scheduleContext
  const bizContextRef = useRef(businessContext)
  bizContextRef.current = businessContext

  const sendMessage = useCallback(async (question: string) => {
    if (!tenantId || !question.trim()) return

    const userMsg: Message = { role: 'user', content: question.trim() }
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

      const data: AiAssistantJson = await postAiAssistantInteractive({
        tenantId,
        question: question.trim(),
        conversationHistory: messagesRef.current.slice(-10),
        scheduleContext: ctx,
        businessContext: biz,
        timeoutMs: 15_000,
      })

      if (data.error) {
        setError(data.error)
        setMessages((prev) => [...prev, { role: 'assistant', content: 'Error: ' + data.error }])
      } else {
        const text = pickAiAssistantAnswerText(data)
        setMessages((prev) => [...prev, { role: 'assistant', content: text || 'Star had no response — please try rephrasing your question.' }])
        if (data.proposed_action) {
          setPendingAction(data.proposed_action as ProposedAction)
        }
      }
    } catch (err: unknown) {
      const e = err as { name?: string; message?: string }
      const isTimeout = e?.name === 'AbortError'
      const msg = isTimeout ? 'Star took too long to respond — try a simpler question or try again.' : 'Failed to reach Star. Check your connection and try again.'
      setError(isTimeout ? 'timeout' : e?.message ?? null)
      setMessages((prev) => [...prev, { role: 'assistant', content: msg }])
    } finally {
      setIsLoading(false)
    }
  }, [tenantId])

  const confirmAction = useCallback(async () => {
    if (!pendingAction || !tenantId) return
    setIsLoading(true)
    try {
      const { data: sessionData } = await supabase.auth.getSession()
      const token = sessionData.session?.access_token

      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 30000)

      let res: Response
      try {
        res = await fetch(
          EDGE_FUNCTIONS.aiScheduleAction,
          {
            method: 'POST',
            signal: controller.signal,
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`,
            },
            body: JSON.stringify({
              action: pendingAction.action,
              tenant_id: tenantId,
              params: pendingAction.params,
            }),
          }
        )
      } finally {
        clearTimeout(timeout)
      }

      const data = await res.json()
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
  }, [])

  return { messages, isLoading, error, sendMessage, clearConversation, pendingAction, confirmAction, rejectAction }
}

/** Internal business-only prompt if caller passes empty string (must never reach edge as empty `system_override`). */
const STAR_BUSINESS_GUARD_EMPTY =
  '[STAR INTERNAL] Configuration error: empty business context. Reply only: "Star is misconfigured — please refresh." Do not use scheduling tools.'

/** Business snapshot / STAR modal path — `system_override` only. Pass a non-empty string; loading states should use an explicit loading prompt, not null. */
export function useStarBusinessChat(tenantId: string | null, businessContext: string) {
  const safe = businessContext.trim() ? businessContext : STAR_BUSINESS_GUARD_EMPTY
  if (import.meta.env.DEV && !businessContext.trim()) {
    console.error('[useStarBusinessChat] Empty businessContext — using guard string to avoid scheduling-mode fallback')
  }
  return useAI(tenantId, null, safe)
}

/**
 * Schedule page adapter: Star in **scheduling/tools** mode (grid + proposed actions).
 * For school-wide business Q&A, use `useStarGlobalContext` + `useStarComposedBusinessPrompt` or `useStarBusinessChat` with composed prompt.
 */
export function useScheduleStarChat(tenantId: string | null, scheduleContext: ScheduleContext | null | undefined) {
  return useAI(tenantId, scheduleContext ?? null, null)
}
