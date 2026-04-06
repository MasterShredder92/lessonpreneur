import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

const TENANT_ID = '00000000-0000-0000-0000-000000000001'

// ── Fetch last review request for a family ──
export function useLastReviewRequest(familyId: string | undefined) {
  return useQuery({
    queryKey: ['review_request', familyId],
    enabled: !!familyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('review_requests')
        .select('id, sent_at, message_text')
        .eq('family_id', familyId!)
        .order('sent_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (error) throw error
      return data
    },
    staleTime: 1000 * 60 * 2,
  })
}

// ── Send (insert) a review request ──
export function useSendReviewRequest() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (params: {
      familyId: string
      locationId: string
      messageText: string
      googleReviewUrl: string
      requestedBy?: string
    }) => {
      const { error } = await supabase.from('review_requests').insert({
        tenant_id: TENANT_ID,
        family_id: params.familyId,
        location_id: params.locationId,
        message_text: params.messageText,
        google_review_url: params.googleReviewUrl,
        requested_by: params.requestedBy ?? null,
        sent_at: new Date().toISOString(),
        trigger_reason: 'manual_compose',
      })
      if (error) throw error
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['review_request', vars.familyId] })
      qc.invalidateQueries({ queryKey: ['review_requests_list'] })
      qc.invalidateQueries({ queryKey: ['review-queue'] })
      qc.invalidateQueries({ queryKey: ['retention-metrics'] })
    },
  })
}

// ── Generate AI message via edge function ──
export async function generateReviewMessage(params: {
  parentFirstName: string
  students: { name: string; instrument: string; createdAt: string }[]
  locationName: string
  googleReviewUrl: string
}): Promise<{ message: string; fallback: boolean }> {
  try {
    const { data: sessionData } = await supabase.auth.getSession()
    const token = sessionData.session?.access_token
    if (!token) throw new Error('No auth token')

    const res = await fetch(
      'https://dhsyxyhtoadrqfrlmsqe.supabase.co/functions/v1/generate-review-message',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          parent_first_name: params.parentFirstName,
          students: params.students.map((s) => ({
            name: s.name,
            instrument: s.instrument,
            created_at: s.createdAt,
          })),
          location_name: params.locationName,
          google_review_url: params.googleReviewUrl,
        }),
      }
    )

    const data = await res.json()
    if (data.fallback || data.error) {
      return { message: buildFallbackMessage(params), fallback: true }
    }
    return { message: data.message, fallback: false }
  } catch {
    return { message: buildFallbackMessage(params), fallback: true }
  }
}

function buildFallbackMessage(params: {
  parentFirstName: string
  students: { name: string; instrument: string; createdAt: string }[]
  locationName: string
  googleReviewUrl: string
}): string {
  const studentNames = params.students.map((s) => s.name).join(' and ')
  const instruments = [...new Set(params.students.map((s) => s.instrument))].join(' and ')
  const avgMonths = Math.round(
    params.students.reduce((sum, s) => {
      return sum + (Date.now() - new Date(s.createdAt).getTime()) / (30 * 24 * 60 * 60 * 1000)
    }, 0) / params.students.length
  )

  let growthLine = "They're already making great progress!"
  if (avgMonths >= 12) growthLine = "Being part of your family's journey for over a year has been such a joy."
  else if (avgMonths >= 3) growthLine = "The growth we've seen has been incredible."

  return `Hey ${params.parentFirstName}! We just wanted to say how much we love having ${studentNames} at ${params.locationName}. They've been working so hard on ${instruments} and it really shows! ${growthLine} If you have a moment, we'd love it if you could leave us a Google review — it helps other families find us and means the world to our team.\n\n${params.googleReviewUrl}`
}
