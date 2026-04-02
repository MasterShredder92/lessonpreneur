import { useQuery, useMutation } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuthContext } from '../app/AuthContext'

export interface TenantBilling {
  plan: string
  trialEndsAt: string | null
  stripeCustomerId: string | null
  stripeSubscriptionId: string | null
  billingEmail: string | null
  locationCountBilled: number
  pricingTier: string
  daysRemaining: number | null
  isTrialExpired: boolean
}

export function useTenantBilling() {
  const { tenantId } = useAuthContext()
  return useQuery<TenantBilling>({
    queryKey: ['tenant-billing', tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data } = await supabase
        .from('tenants')
        .select('plan, trial_ends_at, stripe_customer_id, stripe_subscription_id, billing_email, location_count_billed, pricing_tier')
        .eq('id', tenantId!)
        .single()
      if (!data) throw new Error('Tenant not found')

      const trialEnd = data.trial_ends_at ? new Date(data.trial_ends_at) : null
      const daysRemaining = trialEnd ? Math.max(0, Math.ceil((trialEnd.getTime() - Date.now()) / 86400000)) : null
      const isTrialExpired = data.plan === 'trial' && trialEnd ? trialEnd.getTime() < Date.now() : false

      return {
        plan: data.plan ?? 'trial',
        pricingTier: data.pricing_tier ?? 'school',
        trialEndsAt: data.trial_ends_at,
        stripeCustomerId: data.stripe_customer_id,
        stripeSubscriptionId: data.stripe_subscription_id,
        billingEmail: data.billing_email,
        locationCountBilled: data.location_count_billed ?? 1,
        daysRemaining,
        isTrialExpired,
      }
    },
  })
}

export function useCreateCheckout() {
  const { tenantId } = useAuthContext()
  return useMutation({
    mutationFn: async () => {
      // Get the tenant's pricing tier
      const { data: tenant } = await supabase.from('tenants').select('pricing_tier').eq('id', tenantId!).single()
      const pricingTier = tenant?.pricing_tier ?? 'school'

      const session = await supabase.auth.getSession()
      const token = session.data.session?.access_token
      const res = await fetch('https://dhsyxyhtoadrqfrlmsqe.supabase.co/functions/v1/create-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ tenant_id: tenantId, pricing_tier: pricingTier }),
      })
      const data = await res.json()
      if (data.url) window.location.href = data.url
      else throw new Error(data.error ?? 'Failed to create checkout')
    },
  })
}

export function useCustomerPortal() {
  const { tenantId } = useAuthContext()
  return useMutation({
    mutationFn: async () => {
      const session = await supabase.auth.getSession()
      const token = session.data.session?.access_token
      const res = await fetch('https://dhsyxyhtoadrqfrlmsqe.supabase.co/functions/v1/customer-portal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ tenant_id: tenantId }),
      })
      const data = await res.json()
      if (data.url) window.location.href = data.url
      else throw new Error(data.error ?? 'Failed to open billing portal')
    },
  })
}
