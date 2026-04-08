import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuthContext } from '../app/AuthContext'
import { EDGE_FUNCTIONS } from '../lib/config'

export interface StripeConnectStatus {
  accountId: string | null
  status: 'not_connected' | 'pending' | 'active' | 'restricted'
}

export function useStripeConnectStatus() {
  const { tenantId } = useAuthContext()
  return useQuery<StripeConnectStatus>({
    queryKey: ['stripe-connect', tenantId],
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
      const session = await supabase.auth.getSession()
      const token = session.data.session?.access_token
      const res = await fetch(EDGE_FUNCTIONS.stripeConnectOnboard, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ tenant_id: tenantId }),
      })
      const data = await res.json()
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
      const session = await supabase.auth.getSession()
      const token = session.data.session?.access_token
      const res = await fetch(EDGE_FUNCTIONS.createStudentInvoice, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ tenant_id: tenantId, ...params }),
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      return data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['billing_families'] })
      qc.invalidateQueries({ queryKey: ['billing_hero_stats'] })
    },
  })
}

export function useSetupAutoPay() {
  const { tenantId } = useAuthContext()
  return useMutation({
    mutationFn: async (params: { familyId: string }) => {
      const session = await supabase.auth.getSession()
      const token = session.data.session?.access_token
      const res = await fetch(EDGE_FUNCTIONS.setupAutopay, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ tenant_id: tenantId, family_id: params.familyId }),
      })
      const data = await res.json()
      if (data.url) window.location.href = data.url
      else if (data.error) throw new Error(data.error)
      return data
    },
  })
}
