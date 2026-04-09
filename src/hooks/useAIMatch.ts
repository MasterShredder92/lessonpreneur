import { useState, useCallback } from 'react'
import { safeFetch } from '../lib/safeFetch'
import { EDGE_FUNCTIONS } from '../lib/config'

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
      const data = await safeFetch<{
        recommendations?: TeacherMatch[]
        teachers_evaluated: number
        recovery_analysis?: string | null
        error?: string
      }>(EDGE_FUNCTIONS.aiTeacherMatch, {
        body: { lead_id: leadId, tenant_id: tenantId },
      })

      if (data.error) {
        setError(data.error)
      } else {
        setResult({
          recommendations: data.recommendations ?? [],
          teachers_evaluated: data.teachers_evaluated,
          recovery_analysis: data.recovery_analysis ?? null,
        })
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
