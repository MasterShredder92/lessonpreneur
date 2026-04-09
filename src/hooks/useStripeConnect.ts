import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuthContext } from '../app/AuthContext'
import { EDGE_FUNCTIONS } from '../lib/config'
import { safeFetch } from '../lib/safeFetch'
import { qk } from '../lib/queryKeys'

export interface StripeConnectStatus {
  accountId: string | null
  status: 'not_connected' | 'pending' | 'active' | 'restricted'
}

export function useStripeConnectStatus() {
  const { tenantId } = useAuthContext()
  return useQuery<StripeConnectStatus>({
    queryKey: qk.stripe.connect(tenantId),
    enabled: !!tenantId,
    queryFn: async () => {
      const { data } = await supabase
        .from('tenants')
        .select('stripe_connect_account_id, stripe_connect_status')
        .eq('id', tenantId!)
        .single()
      return {
        accountId: data?.stripe_connect_account_id ?? null,
        status: (data?.stripe_connect_status ?? 'not_connected') as StripeConnectStatus['status'],
      }
    },
  })
}

export function useStripeConnectOnboard() {
  const { tenantId } = useAuthContext()
  return useMutation({
    mutationFn: async () => {
      const data = await safeFetch<{ url?: string; error?: string }>(EDGE_FUNCTIONS.stripeConnectOnboard, {
        body: { tenant_id: tenantId },
      })
      if (data.url) window.location.href = data.url
      else throw new Error(data.error ?? 'Failed to start Stripe onboarding')
    },
  })
}

export function useCreateStudentInvoice() {
  const { tenantId } = useAuthContext()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (params: { familyId: string; amountCents: number; description: string }) => {
      const data = await safeFetch<{ error?: string }>(EDGE_FUNCTIONS.createStudentInvoice, {
        body: { tenant_id: tenantId, ...params },
      })
      if (data.error) throw new Error(data.error)
      return data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.billing.families })
      qc.invalidateQueries({ queryKey: qk.billing.heroStats })
      qc.invalidateQueries({ queryKey: qk.billing.snapshot })
    },
  })
}

export function useSetupAutoPay() {
  const { tenantId } = useAuthContext()
  return useMutation({
    mutationFn: async (params: { familyId: string }) => {
      const data = await safeFetch<{ url?: string; error?: string }>(EDGE_FUNCTIONS.setupAutopay, {
        body: { tenant_id: tenantId, family_id: params.familyId },
      })
      if (data.url) window.location.href = data.url
      else if (data.error) throw new Error(data.error)
      return data
    },
  })
}
