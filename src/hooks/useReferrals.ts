import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuthContext } from '../app/AuthContext'
import { qk } from '../lib/queryKeys'

export interface ReferralStats {
  totalReferrals: number
  thisMonthReferrals: number
  topReferrers: { familyName: string; count: number }[]
  conversionRate: number
}

export function useFamilyReferralCode(familyId: string | undefined) {
  return useQuery({
    queryKey: [...qk.referrals.code, familyId],
    enabled: !!familyId,
    queryFn: async () => {
      const { data } = await supabase.from('families').select('referral_code, referral_count').eq('id', familyId!).single()
      return { code: data?.referral_code ?? null, count: data?.referral_count ?? 0 }
    },
  })
}

export function useReferralStats() {
  const { tenantId } = useAuthContext()
  return useQuery<ReferralStats>({
    queryKey: [...qk.referrals.stats, tenantId],
    enabled: !!tenantId,
    staleTime: 60_000,
    queryFn: async () => {
      const { data: referredLeads } = await supabase.from('leads').select('id, referred_by_family_id, created_at').eq('tenant_id', tenantId!).not('referred_by_family_id', 'is', null)
      const { data: enrolledFromReferral } = await supabase.from('leads').select('id').eq('tenant_id', tenantId!).not('referred_by_family_id', 'is', null).eq('stage', 'enrolled')

      const now = new Date()
      const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
      const thisMonth = (referredLeads ?? []).filter(l => l.created_at >= monthStart).length

      // Top referrers
      const countByFamily = new Map<string, number>()
      referredLeads?.forEach(l => { if (l.referred_by_family_id) countByFamily.set(l.referred_by_family_id, (countByFamily.get(l.referred_by_family_id) ?? 0) + 1) })
      const topFamilyIds = [...countByFamily.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5)

      let topReferrers: { familyName: string; count: number }[] = []
      if (topFamilyIds.length > 0) {
        const { data: fams } = await supabase.from('families').select('id, name').in('id', topFamilyIds.map(([id]) => id))
        const nameMap = new Map((fams ?? []).map(f => [f.id, f.name]))
        topReferrers = topFamilyIds.map(([id, count]) => ({ familyName: nameMap.get(id) ?? 'Unknown', count }))
      }

      const total = (referredLeads ?? []).length
      const enrolled = (enrolledFromReferral ?? []).length
      return {
        totalReferrals: total,
        thisMonthReferrals: thisMonth,
        topReferrers,
        conversionRate: total > 0 ? Math.round((enrolled / total) * 100) : 0,
      }
    },
  })
}

export async function validateReferralCode(code: string): Promise<{ valid: boolean; familyName?: string; tenantId?: string }> {
  const { data } = await supabase.from('families').select('id, name, tenant_id').eq('referral_code', code.toLowerCase()).single()
  if (!data) return { valid: false }
  return { valid: true, familyName: data.name, tenantId: data.tenant_id }
}
