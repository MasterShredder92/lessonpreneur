import { useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'

interface MatchSlot {
  block_id: string
  date: string
  start: string
  end: string
}

export interface TeacherMatch {
  teacher_id: string
  teacher_name: string
  instruments: string[]
  match_reason: string
  match_score: number
  suggested_slots: MatchSlot[]
}

interface MatchResult {
  recommendations: TeacherMatch[]
  teachers_evaluated: number
  recovery_analysis?: string | null
}

export function useAIMatch() {
  const [result, setResult] = useState<MatchResult | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const runMatch = useCallback(async (leadId: string, tenantId: string) => {
    setIsLoading(true)
    setError(null)
    setResult(null)

    try {
      const { data: sessionData } = await supabase.auth.getSession()
      const token = sessionData.session?.access_token

      const res = await fetch(
        'https://dhsyxyhtoadrqfrlmsqe.supabase.co/functions/v1/ai-teacher-match',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify({ lead_id: leadId, tenant_id: tenantId }),
        }
      )

      const data = await res.json()
      if (data.error) {
        setError(data.error)
      } else {
        setResult({ recommendations: data.recommendations ?? [], teachers_evaluated: data.teachers_evaluated, recovery_analysis: data.recovery_analysis ?? null })
      }
    } catch (err: any) {
      setError(err.message ?? 'Failed to get AI match')
    } finally {
      setIsLoading(false)
    }
  }, [])

  const clearMatch = useCallback(() => {
    setResult(null)
    setError(null)
  }, [])

  return { result, isLoading, error, runMatch, clearMatch }
}
