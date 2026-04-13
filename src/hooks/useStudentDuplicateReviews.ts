import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuthContext } from '../app/AuthContext'
import { qk } from '../lib/queryKeys'

export interface DuplicateReviewRow {
  id: string
  tenant_id: string
  family_id: string
  lead_id: string | null
  new_student_id: string
  candidate_existing_student_id: string
  reason: string
  status: string
  created_at: string
}

/** Post-merge / keep-separate: ensure DB tier matches roster. Supabase RPC returns { error }, it does not throw. */
async function applyFamilyRateTierAfterDuplicateResolve(familyId: string) {
  const { error } = await supabase.rpc('apply_family_rate_tier', { p_family_id: familyId })
  if (error) {
    console.error('[billing] apply_family_rate_tier failed after duplicate resolve', error.message, familyId)
  }
}

export function useStudentDuplicateReviews() {
  const { tenantId } = useAuthContext()
  return useQuery({
    queryKey: qk.leads.duplicateReviews(tenantId),
    enabled: !!tenantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('student_duplicate_reviews')
        .select('id, tenant_id, family_id, lead_id, new_student_id, candidate_existing_student_id, reason, status, created_at')
        .eq('tenant_id', tenantId!)
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as DuplicateReviewRow[]
    },
  })
}

export function useResolveStudentDuplicateReview() {
  const qc = useQueryClient()
  const { tenantId } = useAuthContext()
  return useMutation({
    mutationFn: async (params: {
      reviewId: string
      resolution: 'keep_separate' | 'merge_into_existing'
      canonicalStudentId?: string
    }) => {
      const { data, error } = await supabase.rpc('resolve_student_duplicate_review', {
        p_review_id: params.reviewId,
        p_resolution: params.resolution,
        p_canonical_student_id: params.canonicalStudentId ?? null,
      })
      if (error) throw error
      return data as { ok?: boolean; family_id?: string; kept_student_id?: string }
    },
    onSuccess: async (data) => {
      await qc.invalidateQueries({ queryKey: qk.leads.duplicateReviews(tenantId) })
      await qc.invalidateQueries({ queryKey: qk.students.all })
      await qc.invalidateQueries({ queryKey: qk.families.all })
      await qc.invalidateQueries({ queryKey: qk.families.page })
      await qc.invalidateQueries({ queryKey: qk.leads.all })
      const fid = (data as { family_id?: string } | null)?.family_id
      if (fid) {
        await applyFamilyRateTierAfterDuplicateResolve(fid)
        await qc.invalidateQueries({ queryKey: qk.families.rate(fid) })
        await qc.invalidateQueries({ queryKey: qk.families.invStudents(fid) })
        await qc.invalidateQueries({ queryKey: qk.families.detail(fid) })
      }
    },
  })
}
