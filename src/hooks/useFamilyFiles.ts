import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useFamilyFiles as useFamilyFilesBase, type FamilyFile } from './useFamilies'

// ═══════════════════════════════════════
// ENHANCED FAMILY FILES HOOK
// ═══════════════════════════════════════

export type { FamilyFile }

export function useFamilyFiles(familyId: string | undefined) {
  const query = useFamilyFilesBase(familyId)
  const files = query.data ?? []
  const hasEnrollmentAgreement = files.some(f => f.file_type === 'enrollment_agreement')

  return {
    ...query,
    files,
    hasEnrollmentAgreement,
  }
}

// ═══════════════════════════════════════
// FAMILY FILES STATS (dashboard use)
// ═══════════════════════════════════════

export function useFamilyFilesStats() {
  return useQuery({
    queryKey: ['family_files_stats'],
    queryFn: async () => {
      // Count active families
      const { count: totalFamilies, error: famErr } = await supabase
        .from('families')
        .select('*', { count: 'exact', head: true })
        .eq('billing_status', 'active')
      if (famErr) throw famErr

      // Count active families that have at least one enrollment_agreement
      const { data: withAgreement, error: agErr } = await supabase
        .from('family_files')
        .select('family_id')
        .eq('file_type', 'enrollment_agreement')
      if (agErr) throw agErr

      // Get active family IDs to intersect
      const { data: activeFamilies, error: afErr } = await supabase
        .from('families')
        .select('id')
        .eq('billing_status', 'active')
      if (afErr) throw afErr

      const activeIds = new Set((activeFamilies ?? []).map(f => f.id))
      const uniqueFamiliesWithAgreement = new Set(
        (withAgreement ?? []).filter(f => activeIds.has(f.family_id)).map(f => f.family_id)
      )

      const total = totalFamilies ?? 0
      const withCount = uniqueFamiliesWithAgreement.size
      const missingCount = total - withCount

      return {
        totalFamilies: total,
        familiesWithAgreement: withCount,
        familiesMissingAgreement: missingCount,
      }
    },
    staleTime: 1000 * 60 * 5,
  })
}
