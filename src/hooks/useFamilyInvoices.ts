/**
 * Hook for loading a family's invoice history (invoice_tokens).
 *
 * Used in the collapsed "Invoices" section on the family detail card.
 * Loads most recent invoices for the family, sorted by created_at DESC.
 * Supports pagination via limit parameter.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuthContext } from '../app/AuthContext'
import { supabase } from '../lib/supabase'
import { qk } from '../lib/queryKeys'
import { generateFamilyInvoice, type GenerateInvoiceParams, type GeneratedInvoice } from '../lib/invoiceGenerator'
import { invalidateEnrollmentCaches } from '../lib/enrollmentEngine'

export interface FamilyInvoice {
  id: string
  token: string
  status: string
  amount_cents: number
  billing_period_label: string
  due_date: string | null
  created_at: string
  paid_at: string | null
  viewed_at: string | null
  invoice_snapshot: any
}

export function useFamilyInvoices(familyId: string | undefined, limit = 10) {
  const { tenantId } = useAuthContext()
  return useQuery({
    queryKey: qk.invoices.familyInvoices(familyId ?? ''),
    enabled: !!familyId && !!tenantId,
    queryFn: async (): Promise<FamilyInvoice[]> => {
      const { data, error } = await supabase
        .from('invoice_tokens')
        .select('id, token, status, amount_cents, billing_period_label, due_date, created_at, paid_at, viewed_at, invoice_snapshot')
        .eq('tenant_id', tenantId!)
        .eq('family_id', familyId!)
        .order('created_at', { ascending: false })
        .limit(limit)
      if (error) throw error
      return (data ?? []) as FamilyInvoice[]
    },
  })
}

export function useGenerateInvoice() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (params: GenerateInvoiceParams): Promise<GeneratedInvoice> => {
      return generateFamilyInvoice(params)
    },
    onSuccess: async (_result, vars) => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: qk.invoices.familyInvoices(vars.familyId) }),
        qc.invalidateQueries({ queryKey: qk.invoices.tokensList }),
        qc.invalidateQueries({ queryKey: qk.invoices.pendingCount }),
        qc.invalidateQueries({ queryKey: qk.billing.events }),
        invalidateEnrollmentCaches(qc, vars.familyId),
      ])
    },
  })
}
