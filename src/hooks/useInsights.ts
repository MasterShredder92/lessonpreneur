import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuthContext } from '../app/AuthContext'

function monthStartISO(): string {
  const d = new Date()
  d.setDate(1)
  d.setHours(0, 0, 0, 0)
  return d.toISOString()
}

// ─── Student insights ──────────────────────────────────────────

export interface StudentInsights {
  newThisMonth: number
  totalMonthlyRevenueCents: number
}

export function useStudentInsights() {
  const { tenantId } = useAuthContext()

  return useQuery<StudentInsights>({
    queryKey: ['student-insights', tenantId],
    enabled: !!tenantId,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const monthStart = monthStartISO()

      const [newCountRes, revenueRes] = await Promise.all([
        // COUNT-only: new active students enrolled this calendar month
        supabase
          .from('students')
          .select('id', { count: 'exact', head: true })
          .eq('tenant_id', tenantId!)
          .eq('status', 'active')
          .gte('created_at', monthStart),
        // Lightweight aggregate: pull monthly_cents for all active students (RLS scoped)
        supabase
          .from('student_effective_rate')
          .select('monthly_cents')
          .eq('billing_status', 'active'),
      ])

      const newThisMonth = newCountRes.count ?? 0
      const totalMonthlyRevenueCents = (revenueRes.data ?? []).reduce(
        (sum, r) => sum + (r.monthly_cents ?? 0),
        0,
      )

      return { newThisMonth, totalMonthlyRevenueCents }
    },
  })
}

// ─── Family insights ───────────────────────────────────────────

export interface FamilyInsights {
  billingIssues: number
  newThisMonth: number
}

export function useFamilyInsights() {
  const { tenantId } = useAuthContext()

  return useQuery<FamilyInsights>({
    queryKey: ['family-insights', tenantId],
    enabled: !!tenantId,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const monthStart = monthStartISO()

      const [billingRes, newFamiliesRes] = await Promise.all([
        // COUNT-only: active families with no card on file or an overdue balance
        supabase
          .from('families')
          .select('id', { count: 'exact', head: true })
          .eq('tenant_id', tenantId!)
          .neq('billing_status', 'cancelled')
          .or('card_last_four.is.null,overdue_balance_cents.gt.0'),
        // COUNT-only: new active families this calendar month
        supabase
          .from('families')
          .select('id', { count: 'exact', head: true })
          .eq('tenant_id', tenantId!)
          .neq('billing_status', 'cancelled')
          .gte('created_at', monthStart),
      ])

      return {
        billingIssues: billingRes.count ?? 0,
        newThisMonth: newFamiliesRes.count ?? 0,
      }
    },
  })
}
