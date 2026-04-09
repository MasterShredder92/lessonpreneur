import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuthContext } from '../app/AuthContext'
import { qk } from '../lib/queryKeys'

// ═══════════════════════════════════════
// FAMILY RATE TIER
// ═══════════════════════════════════════

export function useFamilyRate(familyId: string | undefined) {
  return useQuery({
    queryKey: qk.families.rate(familyId),
    enabled: !!familyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('families')
        .select('id, rate_tier, rate_tier_override, rate_tier_override_by, rate_tier_reason, is_military')
        .eq('id', familyId!)
        .single()
      if (error) throw error
      return data
    },
  })
}

export function useOverrideFamilyRate() {
  const qc = useQueryClient()
  const { user } = useAuthContext()
  return useMutation({
    mutationFn: async (params: { familyId: string; rateTier: number; reason: string }) => {
      const VALID_RATE_TIERS = [4500, 4000, 3750]
      if (!VALID_RATE_TIERS.includes(params.rateTier)) {
        throw new Error(`Invalid rate tier: ${params.rateTier}. Must be one of: ${VALID_RATE_TIERS.join(', ')}`)
      }
      const { error } = await supabase
        .from('families')
        .update({
          rate_tier: params.rateTier,
          rate_tier_override: true,
          rate_tier_override_by: user?.id ?? null,
          rate_tier_override_at: new Date().toISOString(),
          rate_tier_reason: params.reason,
        })
        .eq('id', params.familyId)
      if (error) throw error
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: qk.families.rate(vars.familyId) })
      qc.invalidateQueries({ queryKey: qk.families.all })
      qc.invalidateQueries({ queryKey: qk.families.billing(vars.familyId) })
      qc.invalidateQueries({ queryKey: qk.billing.snapshot })
      qc.invalidateQueries({ queryKey: qk.billing.overview })
      qc.invalidateQueries({ queryKey: qk.billing.families })
    },
  })
}

export function useRemoveFamilyRateOverride() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (params: { familyId: string }) => {
      const { error: updateError } = await supabase
        .from('families')
        .update({
          rate_tier_override: false,
          rate_tier_override_by: null,
          rate_tier_override_at: null,
          rate_tier_reason: null,
        })
        .eq('id', params.familyId)
      if (updateError) throw updateError

      const { error: rpcError } = await supabase.rpc('apply_family_rate_tier', {
        p_family_id: params.familyId,
      })
      if (rpcError) throw rpcError
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: qk.families.rate(vars.familyId) })
      qc.invalidateQueries({ queryKey: qk.families.all })
      qc.invalidateQueries({ queryKey: qk.families.billing(vars.familyId) })
      qc.invalidateQueries({ queryKey: qk.billing.snapshot })
      qc.invalidateQueries({ queryKey: qk.billing.overview })
      qc.invalidateQueries({ queryKey: qk.billing.families })
    },
  })
}

export function useAddSessionCredit() {
  const qc = useQueryClient()
  const { user, tenantId } = useAuthContext()
  return useMutation({
    mutationFn: async (params: {
      familyId: string
      studentId: string
      reason: string
      amountCents: number
      appliesToCycle: string
      notes?: string
    }) => {
      const { error } = await supabase
        .from('billing_adjustments')
        .insert({
          tenant_id: tenantId!,
          family_id: params.familyId,
          student_id: params.studentId,
          adjustment_type: 'credit' as const,
          amount_cents: params.amountCents,
          reason: params.reason,
          notes: params.notes || null,
          applies_to_cycle: params.appliesToCycle,
          created_by: user?.id ?? null,
        })
      if (error) throw error
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: [...qk.billing.adjustments, vars.familyId] })
      qc.invalidateQueries({ queryKey: qk.billing.snapshot })
      qc.invalidateQueries({ queryKey: qk.billing.overview })
      qc.invalidateQueries({ queryKey: qk.billing.families })
      qc.invalidateQueries({ queryKey: qk.families.billing(vars.familyId) })
    },
  })
}

// ═══════════════════════════════════════
// RATE TIER HELPERS
// ═══════════════════════════════════════

export function getRateTierLabel(rateTier: number, isMilitary: boolean, activeStudents: number): string {
  if (rateTier === 4500) return 'Standard'
  if (rateTier === 4000) {
    if (isMilitary) return 'Military Discount'
    if (activeStudents >= 2) return 'Multi-Student'
    return '8+ Sessions'
  }
  if (rateTier === 3750) return 'Volume Rate'
  return 'Custom'
}

export function getRateTierColor(rateTier: number): { bg: string; border: string; text: string } {
  if (rateTier === 4000) return { bg: 'rgba(255,184,0,0.1)', border: 'rgba(255,184,0,0.3)', text: '#FFB800' }
  if (rateTier === 3750) return { bg: 'rgba(34,197,94,0.1)', border: 'rgba(34,197,94,0.3)', text: '#22C55E' }
  return { bg: 'rgba(255,255,255,0.04)', border: 'rgba(255,255,255,0.08)', text: '#A0A0C8' }
}

export function formatRate(cents: number): string {
  return (cents / 100).toFixed(2)
}

export function calculatePreviewRate(activeStudents: number, totalSessions: number, isMilitary: boolean): number {
  if (totalSessions >= 16) return 3750
  if (activeStudents >= 2 || totalSessions >= 8 || isMilitary) return 4000
  return 4500
}
