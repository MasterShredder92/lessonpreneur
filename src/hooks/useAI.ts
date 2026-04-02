import { useState, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'

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
      const ctx = contextRef.current

      const res = await fetch(
        `https://dhsyxyhtoadrqfrlmsqe.supabase.co/functions/v1/ai-assistant`,
        {
          method: 'POST',
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
            system_override: bizContextRef.current ? `You are Star, the AI business assistant for Lessonpreneur — an operating system for music schools. You help owners and administrators understand and manage their business using real-time data. Be direct, specific, and actionable. Always reference real numbers and names from the data provided. If you don't have enough data, say so clearly. Never make up numbers. Keep responses concise — 2-4 sentences for simple questions, more for complex analysis. Sessions are always 30-minute increments. Here is the current business data:\n\n${bizContextRef.current}` : undefined,
          }),
        }
      )

      const data = await res.json()

      if (data.error) {
        setError(data.error)
        setMessages((prev) => [...prev, { role: 'assistant', content: 'Error: ' + data.error }])
      } else {
        setMessages((prev) => [...prev, { role: 'assistant', content: data.answer }])
        if (data.proposed_action) {
          setPendingAction(data.proposed_action)
        }
      }
    } catch (err: any) {
      setError(err.message)
      setMessages((prev) => [...prev, { role: 'assistant', content: 'Failed to reach AI assistant.' }])
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

      const res = await fetch(
        `https://dhsyxyhtoadrqfrlmsqe.supabase.co/functions/v1/ai-schedule-action`,
        {
          method: 'POST',
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
