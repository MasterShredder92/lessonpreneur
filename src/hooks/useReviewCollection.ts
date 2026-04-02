import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuthContext } from '../app/AuthContext'

export interface ReviewRow {
  id: string
  rating: number | null
  body: string | null
  parent_name: string | null
  student_name: string | null
  location_name: string | null
  approved: boolean
  featured: boolean
  created_at: string
}

export function useAdminReviews() {
  const { tenantId } = useAuthContext()
  return useQuery<ReviewRow[]>({
    queryKey: ['admin-reviews', tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data } = await supabase.from('reviews').select('*').eq('tenant_id', tenantId!).order('created_at', { ascending: false })
      return data ?? []
    },
  })
}

export function useToggleReviewApproval() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, approved }: { id: string; approved: boolean }) => {
      await supabase.from('reviews').update({ approved }).eq('id', id)
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-reviews'] }) },
  })
}

export function useToggleReviewFeatured() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, featured }: { id: string; featured: boolean }) => {
      await supabase.from('reviews').update({ featured }).eq('id', id)
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-reviews'] }) },
  })
}

export function useSubmitReview() {
  return useMutation({
    mutationFn: async (params: {
      token: string; rating: number; body: string; parentName?: string; shareable: boolean
    }) => {
      // Look up review by token
      const { data: existing } = await supabase.from('reviews').select('id, tenant_id').eq('review_token', params.token).single()
      if (!existing) throw new Error('Invalid review link')

      await supabase.from('reviews').update({
        rating: params.rating,
        body: params.body,
        parent_name: params.parentName || null,
        shareable: params.shareable,
      }).eq('id', existing.id)

      return { success: true }
    },
  })
}

export function useCreateReviewPrompt() {
  const { tenantId } = useAuthContext()
  return useMutation({
    mutationFn: async (params: { familyId: string; studentId?: string; locationId?: string; promptedBy: string }) => {
      if (!tenantId) throw new Error('No tenant')
      const token = crypto.randomUUID().replace(/-/g, '').substring(0, 16)
      const { error } = await supabase.from('reviews').insert({
        tenant_id: tenantId,
        family_id: params.familyId,
        student_id: params.studentId ?? null,
        location_id: params.locationId ?? null,
        review_token: token,
        prompted_by: params.promptedBy,
        approved: false,
        featured: false,
        shareable: true,
      })
      if (error) throw error
      return { token }
    },
  })
}

export function useFeaturedReviews(tenantId: string | undefined) {
  return useQuery<ReviewRow[]>({
    queryKey: ['featured-reviews', tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data } = await supabase.from('reviews').select('*').eq('tenant_id', tenantId!).eq('approved', true).eq('featured', true).eq('shareable', true).order('created_at', { ascending: false }).limit(6)
      return data ?? []
    },
  })
}
