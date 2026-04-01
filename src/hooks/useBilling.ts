import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

// ═══════════════════════════════════════
// FAMILY BILLING
// ═══════════════════════════════════════

export function useFamilyBilling(familyId: string | undefined) {
  return useQuery({
    queryKey: ['family_billing', familyId],
    enabled: !!familyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('families')
        .select('id, name, square_customer_id, square_card_id, card_brand, card_last_four, card_exp_month, card_exp_year, billing_day, billing_status, balance')
        .eq('id', familyId!)
        .single()
      if (error) throw error
      return data
    },
  })
}

export function useUpdateFamilyBilling() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (params: { id: string } & Partial<{
      square_customer_id: string | null
      square_card_id: string | null
      card_brand: string | null
      card_last_four: string | null
      card_exp_month: number | null
      card_exp_year: number | null
      billing_day: number
      billing_status: string
      balance: number
    }>) => {
      const { id, ...updates } = params
      const { error } = await supabase.from('families').update(updates).eq('id', id)
      if (error) throw error
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['family_billing', vars.id] })
      qc.invalidateQueries({ queryKey: ['families'] })
    },
  })
}

// ═══════════════════════════════════════
// BILLING PERIODS
// ═══════════════════════════════════════

export function useBillingPeriods() {
  return useQuery({
    queryKey: ['billing_periods'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('billing_periods')
        .select('*')
        .order('billing_date', { ascending: false })
      if (error) throw error
      return data ?? []
    },
  })
}

export function useCreateBillingPeriod() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (params: { tenant_id: string; period_label: string; billing_date: string }) => {
      const { data, error } = await supabase
        .from('billing_periods')
        .insert(params)
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['billing_periods'] })
    },
  })
}

export function useUpdateBillingPeriod() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (params: { id: string; status?: string; total_attempted?: number; total_succeeded?: number; total_failed?: number; total_revenue_cents?: number }) => {
      const { id, ...updates } = params
      const { error } = await supabase.from('billing_periods').update(updates).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['billing_periods'] })
    },
  })
}

// ═══════════════════════════════════════
// BILLING EVENTS
// ═══════════════════════════════════════

export function useBillingEvents(periodId: string | undefined) {
  return useQuery({
    queryKey: ['billing_events', periodId],
    enabled: !!periodId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('billing_events')
        .select('*, family:families(name)')
        .eq('billing_period_id', periodId!)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data ?? []
    },
  })
}

export function useCreateBillingEvent() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (params: {
      tenant_id: string
      family_id: string
      billing_period_id: string
      amount_cents: number
      idempotency_key: string
      status?: string
    }) => {
      const { data, error } = await supabase
        .from('billing_events')
        .insert(params)
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['billing_events', vars.billing_period_id] })
    },
  })
}

export function useUpdateBillingEvent() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (params: { id: string; billing_period_id: string; status?: string; square_payment_id?: string; failure_reason?: string; attempted_at?: string; completed_at?: string }) => {
      const { id, billing_period_id, ...updates } = params
      const { error } = await supabase.from('billing_events').update(updates).eq('id', id)
      if (error) throw error
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['billing_events', vars.billing_period_id] })
    },
  })
}

// ═══════════════════════════════════════
// BILLING LINE ITEMS
// ═══════════════════════════════════════

export function useBillingLineItems(eventId: string | undefined) {
  return useQuery({
    queryKey: ['billing_line_items', eventId],
    enabled: !!eventId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('billing_line_items')
        .select('*, student:students(first_name, last_name, instrument)')
        .eq('billing_event_id', eventId!)
      if (error) throw error
      return data ?? []
    },
  })
}

export function useCreateBillingLineItem() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (params: {
      billing_event_id: string
      student_id: string
      sessions_count: number
      rate_per_session_cents: number
      subtotal_cents: number
    }) => {
      const { error } = await supabase.from('billing_line_items').insert(params)
      if (error) throw error
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['billing_line_items', vars.billing_event_id] })
    },
  })
}

// ═══════════════════════════════════════
// BILLING ADJUSTMENTS
// ═══════════════════════════════════════

export function useBillingAdjustments(familyId: string | undefined) {
  return useQuery({
    queryKey: ['billing_adjustments', familyId],
    enabled: !!familyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('billing_adjustments')
        .select('*, student:students(first_name, last_name)')
        .eq('family_id', familyId!)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data ?? []
    },
  })
}

export function useCreateBillingAdjustment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (params: {
      tenant_id: string
      family_id: string
      student_id: string
      adjustment_type: 'credit' | 'discount_percent' | 'discount_fixed' | 'bonus_session'
      amount_cents?: number
      percent?: number
      reason: string
      notes?: string
      applies_to_cycle: string
      created_by?: string
    }) => {
      const { error } = await supabase.from('billing_adjustments').insert(params)
      if (error) throw error
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['billing_adjustments', vars.family_id] })
    },
  })
}

// ═══════════════════════════════════════
// PAYMENT HISTORY
// ═══════════════════════════════════════

export function usePaymentHistory(familyId: string | undefined) {
  return useQuery({
    queryKey: ['payment_history', familyId],
    enabled: !!familyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('payment_history')
        .select('*')
        .eq('family_id', familyId!)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data ?? []
    },
  })
}

export function useCreatePaymentRecord() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (params: {
      tenant_id: string
      family_id: string
      square_payment_id?: string
      amount_cents: number
      status: string
      card_last_four?: string
      card_brand?: string
      billing_period_id?: string
      session_breakdown?: object
    }) => {
      const { error } = await supabase.from('payment_history').insert(params)
      if (error) throw error
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['payment_history', vars.family_id] })
    },
  })
}

// ═══════════════════════════════════════
// REFUNDS
// ═══════════════════════════════════════

export function useRefunds(familyId: string | undefined) {
  return useQuery({
    queryKey: ['refunds', familyId],
    enabled: !!familyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('refunds')
        .select('*, payment:payment_history(amount_cents, card_last_four, card_brand)')
        .eq('family_id', familyId!)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data ?? []
    },
  })
}

export function useCreateRefund() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (params: {
      tenant_id: string
      family_id: string
      payment_history_id: string
      amount_cents: number
      reason: string
      initiated_by?: string
    }) => {
      const { error } = await supabase.from('refunds').insert(params)
      if (error) throw error
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['refunds', vars.family_id] })
      qc.invalidateQueries({ queryKey: ['payment_history', vars.family_id] })
    },
  })
}
