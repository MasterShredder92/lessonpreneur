import { useState, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { EDGE_FUNCTIONS } from '../lib/config'

interface Message {
  role: 'user' | 'assistant'
  content: string
}

export interface ProposedAction {
  action: string
  params: Record<string, any>
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

export function useAI(tenantId: string | null, scheduleContext?: ScheduleContext | null, businessContext?: string | null) {
  const [messages, setMessages] = useState<Message[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pendingAction, setPendingAction] = useState<ProposedAction | null>(null)

  // Use refs for values accessed inside callbacks to avoid dependency churn
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
      const { data: sessionData } = await supabase.auth.getSession()
      const token = sessionData.session?.access_token
      if (!token) {
        setError('Not authenticated')
        setMessages((prev) => [...prev, { role: 'assistant', content: 'You need to be signed in to use Star. Please refresh the page.' }])
        return
      }
      const ctx = contextRef.current

      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 15000)

      let res: Response
      try {
        res = await fetch(
          EDGE_FUNCTIONS.aiAssistant,
          {
            method: 'POST',
            signal: controller.signal,
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`,
            },
            body: JSON.stringify({
              question: question.trim(),
              tenant_id: tenantId,
              conversation_history: messagesRef.current.slice(-10),
              schedule_context: ctx ?? undefined,
              business_context: bizContextRef.current ?? undefined,
              timezone: ctx?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
              system_override: bizContextRef.current || undefined,
            }),
          }
        )
      } finally {
        clearTimeout(timeout)
      }

      let data: any
      try {
        data = await res.json()
      } catch {
        setError('Invalid response from Star')
        setMessages((prev) => [...prev, { role: 'assistant', content: 'Star received an invalid response from the server. Please try again.' }])
        return
      }

      if (data.error) {
        setError(data.error)
        setMessages((prev) => [...prev, { role: 'assistant', content: 'Error: ' + data.error }])
      } else {
        setMessages((prev) => [...prev, { role: 'assistant', content: data.answer || 'Star had no response — please try rephrasing your question.' }])
        if (data.proposed_action) {
          setPendingAction(data.proposed_action)
        }
      }
    } catch (err: any) {
      const isTimeout = err.name === 'AbortError'
      const msg = isTimeout ? 'Star took too long to respond — try a simpler question or try again.' : 'Failed to reach Star. Check your connection and try again.'
      setError(isTimeout ? 'timeout' : err.message)
      setMessages((prev) => [...prev, { role: 'assistant', content: msg }])
    } finally {
      setIsLoading(false)
    }
  }, [tenantId])  // Only tenantId — messages and context read from refs

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
    } catch (err: any) {
      setMessages((prev) => [...prev, { role: 'assistant', content: `Action failed: ${err.message}` }])
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
