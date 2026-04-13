/**
 * Finance (Plaid-powered) hooks — accounts, transactions, balances, categories.
 *
 * All queries are tenant-scoped and lazy-load current month by default.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuthContext } from '../app/AuthContext'
import { qk } from '../lib/queryKeys'

// ─── Helpers ─────────────────────────────────────

export function getCurrentMonthBucket(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
}

export function monthKeyToBucket(monthKey: string): string {
  return `${monthKey}-01`
}

export function shiftMonth(monthKey: string, delta: number): string {
  const [y, m] = monthKey.split('-').map(Number)
  const d = new Date(y, m - 1 + delta, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export function formatMonth(monthKey: string): string {
  const [y, m] = monthKey.split('-').map(Number)
  return new Date(y, m - 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
}

export function currentMonthKey(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

// ─── Types ───────────────────────────────────────

export interface FinancePlaidItem {
  id: string
  plaid_item_id: string
  institution_id: string | null
  institution_name: string | null
  status: string
  last_transactions_sync_at: string | null
  last_balances_sync_at: string | null
  error_code: string | null
  error_message: string | null
  created_at: string
}

export interface FinanceAccount {
  id: string
  plaid_item_id: string
  plaid_account_id: string
  location_id: string | null
  account_name: string
  official_name: string | null
  mask: string | null
  account_type: string | null
  account_subtype: string | null
  institution_name: string | null
  is_active: boolean
  is_liquidity_account: boolean
  include_in_financials: boolean
  display_order: number
  // joined
  location_name?: string | null
  latest_balance?: number | null
}

export interface FinanceLocation {
  id: string
  code: string
  name: string
  location_type: string
  core_location_id: string | null
  is_active: boolean
}

export interface FinanceTransaction {
  id: string
  account_id: string
  location_id: string | null
  plaid_transaction_id: string | null
  posted_date: string | null
  transaction_name: string
  merchant_name: string | null
  amount: number
  iso_currency_code: string | null
  plaid_primary_category: string | null
  plaid_detailed_category: string | null
  payment_channel: string | null
  is_pending: boolean
  is_recurring: boolean
  is_transfer: boolean
  is_excluded: boolean
  notes: string | null
  month_bucket: string | null
  // joined
  account_name?: string
  account_mask?: string | null
  location_name?: string | null
  category_name?: string | null
  category_id?: string | null
  assignment_source?: string | null
}

export interface FinanceBalanceSnapshot {
  id: string
  account_id: string
  snapshot_at: string
  available_balance: number | null
  current_balance: number | null
  iso_currency_code: string | null
}

export interface FinanceCategoryGroup {
  id: string
  key: string
  name: string
  direction: string | null
  display_order: number
  is_active: boolean
}

export interface FinanceCategory {
  id: string
  group_id: string | null
  key: string
  name: string
  is_system: boolean
  is_active: boolean
  // joined
  group_name?: string
  group_direction?: string | null
}

export interface FinanceRecurringRule {
  id: string
  location_id: string | null
  account_id: string | null
  category_id: string | null
  name: string
  merchant_match: string | null
  transaction_name_match: string | null
  amount_hint: number | null
  cadence: string | null
  is_active: boolean
  notes: string | null
  // joined
  category_name?: string | null
  location_name?: string | null
}

export interface FinanceSyncRun {
  id: string
  plaid_item_id: string | null
  sync_type: string
  status: string
  started_at: string
  completed_at: string | null
  added_count: number
  modified_count: number
  removed_count: number
  error_message: string | null
}

export interface FinanceExport {
  id: string
  requested_by: string | null
  location_id: string | null
  from_month: string | null
  to_month: string | null
  export_type: string
  status: string
  file_url: string | null
  created_at: string
  completed_at: string | null
}

export interface MonthlySummary {
  monthKey: string
  totalIncome: number
  totalExpenses: number
  netCashFlow: number
  byCategory: { categoryName: string; groupDirection: string | null; total: number }[]
  byAccount: { accountName: string; mask: string | null; total: number }[]
}

// ─── Plaid Items ─────────────────────────────────

export function usePlaidItems() {
  const { tenantId } = useAuthContext()
  return useQuery<FinancePlaidItem[]>({
    queryKey: qk.finance.plaidItems(tenantId),
    enabled: !!tenantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('finance_plaid_items')
        .select('id, plaid_item_id, institution_id, institution_name, status, last_transactions_sync_at, last_balances_sync_at, error_code, error_message, created_at')
        .eq('tenant_id', tenantId!)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data ?? []
    },
  })
}

// ─── Finance Locations ───────────────────────────

export function useFinanceLocations() {
  const { tenantId } = useAuthContext()
  return useQuery<FinanceLocation[]>({
    queryKey: qk.finance.locations(tenantId),
    enabled: !!tenantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('finance_locations')
        .select('id, code, name, location_type, core_location_id, is_active')
        .eq('tenant_id', tenantId!)
        .eq('is_active', true)
        .order('name')
      if (error) throw error
      return data ?? []
    },
  })
}

// ─── Accounts ────────────────────────────────────

export function useFinanceAccounts() {
  const { tenantId } = useAuthContext()
  return useQuery<FinanceAccount[]>({
    queryKey: qk.finance.accounts(tenantId),
    enabled: !!tenantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('finance_accounts')
        .select('*, finance_locations(name)')
        .eq('tenant_id', tenantId!)
        .order('display_order')
        .order('account_name')
      if (error) throw error

      // Get latest balance for each account
      const accountIds = (data ?? []).map(a => a.id)
      const balances = new Map<string, number | null>()

      if (accountIds.length > 0) {
        // Get the most recent balance snapshot per account
        const { data: snapshots } = await supabase
          .from('finance_balance_snapshots')
          .select('account_id, current_balance')
          .in('account_id', accountIds)
          .order('snapshot_at', { ascending: false })
          .limit(accountIds.length * 1) // 1 per account max, but we filter below

        const seen = new Set<string>()
        for (const s of snapshots ?? []) {
          if (!seen.has(s.account_id)) {
            balances.set(s.account_id, s.current_balance)
            seen.add(s.account_id)
          }
        }
      }

      return (data ?? []).map((a: Record<string, unknown>): FinanceAccount => ({
        ...a as unknown as FinanceAccount,
        location_name: (a.finance_locations as { name: string } | null)?.name ?? null,
        latest_balance: balances.get(a.id as string) ?? null,
      }))
    },
  })
}

// ─── Balances ────────────────────────────────────

export function useLatestBalances() {
  const { tenantId } = useAuthContext()
  return useQuery<(FinanceBalanceSnapshot & { account_name: string; mask: string | null })[]>({
    queryKey: qk.finance.balances(tenantId),
    enabled: !!tenantId,
    staleTime: 60_000,
    queryFn: async () => {
      const { data: accounts } = await supabase
        .from('finance_accounts')
        .select('id, account_name, mask')
        .eq('tenant_id', tenantId!)
        .eq('is_active', true)

      if (!accounts?.length) return []

      const result: (FinanceBalanceSnapshot & { account_name: string; mask: string | null })[] = []
      for (const acc of accounts) {
        const { data } = await supabase
          .from('finance_balance_snapshots')
          .select('*')
          .eq('account_id', acc.id)
          .order('snapshot_at', { ascending: false })
          .limit(1)
          .single()
        if (data) {
          result.push({ ...data, account_name: acc.account_name, mask: acc.mask })
        }
      }
      return result
    },
  })
}

// ─── Transactions ────────────────────────────────

export function useFinanceTransactions(monthKey: string) {
  const { tenantId } = useAuthContext()
  const bucket = monthKeyToBucket(monthKey)

  return useQuery<FinanceTransaction[]>({
    queryKey: qk.finance.transactions(tenantId, monthKey),
    enabled: !!tenantId,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('finance_transactions')
        .select(`
          *,
          finance_accounts(account_name, mask),
          finance_locations(name),
          finance_transaction_category_assignments(
            category_id,
            assignment_source,
            finance_categories(name)
          )
        `)
        .eq('tenant_id', tenantId!)
        .eq('month_bucket', bucket)
        .eq('is_excluded', false)
        .order('posted_date', { ascending: false })
        .order('transaction_name')
        .limit(500)

      if (error) throw error

      return (data ?? []).map((t: Record<string, unknown>): FinanceTransaction => {
        const acct = t.finance_accounts as { account_name: string; mask: string | null } | null
        const loc = t.finance_locations as { name: string } | null
        const assignments = t.finance_transaction_category_assignments as
          { category_id: string | null; assignment_source: string | null; finance_categories: { name: string } | null }[] | null
        const firstAssignment = assignments?.[0]

        return {
          ...(t as unknown as FinanceTransaction),
          account_name: acct?.account_name ?? '',
          account_mask: acct?.mask ?? null,
          location_name: loc?.name ?? null,
          category_name: firstAssignment?.finance_categories?.name ?? null,
          category_id: firstAssignment?.category_id ?? null,
          assignment_source: firstAssignment?.assignment_source ?? null,
        }
      })
    },
  })
}

// ─── Uncategorized Transactions ──────────────────

export function useUncategorizedTransactions(monthKey: string) {
  const { tenantId } = useAuthContext()
  const bucket = monthKeyToBucket(monthKey)

  return useQuery<FinanceTransaction[]>({
    queryKey: qk.finance.uncategorized(tenantId, monthKey),
    enabled: !!tenantId,
    queryFn: async () => {
      // Get all transactions for the month that have no category assignment
      const { data: allTx, error } = await supabase
        .from('finance_transactions')
        .select(`
          *,
          finance_accounts(account_name, mask),
          finance_locations(name),
          finance_transaction_category_assignments(category_id)
        `)
        .eq('tenant_id', tenantId!)
        .eq('month_bucket', bucket)
        .eq('is_excluded', false)
        .order('posted_date', { ascending: false })
        .limit(500)

      if (error) throw error

      return (allTx ?? [])
        .filter((t: Record<string, unknown>) => {
          const assignments = t.finance_transaction_category_assignments as { category_id: string | null }[] | null
          return !assignments || assignments.length === 0 || !assignments[0]?.category_id
        })
        .map((t: Record<string, unknown>): FinanceTransaction => {
          const acct = t.finance_accounts as { account_name: string; mask: string | null } | null
          const loc = t.finance_locations as { name: string } | null
          return {
            ...(t as unknown as FinanceTransaction),
            account_name: acct?.account_name ?? '',
            account_mask: acct?.mask ?? null,
            location_name: loc?.name ?? null,
            category_name: null,
            category_id: null,
            assignment_source: null,
          }
        })
    },
  })
}

// ─── Categories ──────────────────────────────────

export function useFinanceCategoryGroups() {
  const { tenantId } = useAuthContext()
  return useQuery<FinanceCategoryGroup[]>({
    queryKey: qk.finance.categoryGroups(tenantId),
    enabled: !!tenantId,
    staleTime: 300_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('finance_category_groups')
        .select('*')
        .eq('tenant_id', tenantId!)
        .eq('is_active', true)
        .order('display_order')
      if (error) throw error
      return data ?? []
    },
  })
}

export function useFinanceCategories() {
  const { tenantId } = useAuthContext()
  return useQuery<FinanceCategory[]>({
    queryKey: qk.finance.categories(tenantId),
    enabled: !!tenantId,
    staleTime: 300_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('finance_categories')
        .select('*, finance_category_groups(name, direction)')
        .eq('tenant_id', tenantId!)
        .eq('is_active', true)
        .order('name')
      if (error) throw error
      return (data ?? []).map((c: Record<string, unknown>): FinanceCategory => {
        const grp = c.finance_category_groups as { name: string; direction: string | null } | null
        return {
          ...(c as unknown as FinanceCategory),
          group_name: grp?.name ?? '',
          group_direction: grp?.direction ?? null,
        }
      })
    },
  })
}

// ─── Recurring Rules ─────────────────────────────

export function useRecurringRules() {
  const { tenantId } = useAuthContext()
  return useQuery<FinanceRecurringRule[]>({
    queryKey: qk.finance.recurringRules(tenantId),
    enabled: !!tenantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('finance_recurring_rules')
        .select('*, finance_categories(name), finance_locations(name)')
        .eq('tenant_id', tenantId!)
        .eq('is_active', true)
        .order('name')
      if (error) throw error
      return (data ?? []).map((r: Record<string, unknown>): FinanceRecurringRule => ({
        ...(r as unknown as FinanceRecurringRule),
        category_name: (r.finance_categories as { name: string } | null)?.name ?? null,
        location_name: (r.finance_locations as { name: string } | null)?.name ?? null,
      }))
    },
  })
}

// ─── Monthly Summary ─────────────────────────────

export function useMonthlySummary(monthKey: string) {
  const { tenantId } = useAuthContext()
  const bucket = monthKeyToBucket(monthKey)

  return useQuery<MonthlySummary>({
    queryKey: qk.finance.monthlySummary(tenantId, monthKey),
    enabled: !!tenantId,
    staleTime: 60_000,
    queryFn: async () => {
      // Get all non-excluded transactions for the month
      const { data: txs, error } = await supabase
        .from('finance_transactions')
        .select(`
          amount, account_id,
          finance_accounts(account_name, mask),
          finance_transaction_category_assignments(
            finance_categories(name, finance_category_groups(direction))
          )
        `)
        .eq('tenant_id', tenantId!)
        .eq('month_bucket', bucket)
        .eq('is_excluded', false)
        .eq('is_transfer', false)
        .limit(2000)

      if (error) throw error

      let totalIncome = 0
      let totalExpenses = 0
      const byCat = new Map<string, { direction: string | null; total: number }>()
      const byAcct = new Map<string, { name: string; mask: string | null; total: number }>()

      for (const t of txs ?? []) {
        const amount = (t as Record<string, unknown>).amount as number
        const acct = (t as Record<string, unknown>).finance_accounts as { account_name: string; mask: string | null } | null
        const assignments = (t as Record<string, unknown>).finance_transaction_category_assignments as
          { finance_categories: { name: string; finance_category_groups: { direction: string } | null } | null }[] | null
        const cat = assignments?.[0]?.finance_categories
        const direction = cat?.finance_category_groups?.direction ?? null
        const catName = cat?.name ?? 'Uncategorized'

        // Plaid: positive = outflow (expense), negative = inflow (income)
        if (amount < 0) {
          totalIncome += Math.abs(amount)
        } else {
          totalExpenses += amount
        }

        // By category
        const existing = byCat.get(catName)
        if (existing) {
          existing.total += amount
        } else {
          byCat.set(catName, { direction, total: amount })
        }

        // By account
        if (acct) {
          const acctKey = acct.account_name
          const ex = byAcct.get(acctKey)
          if (ex) {
            ex.total += amount
          } else {
            byAcct.set(acctKey, { name: acct.account_name, mask: acct.mask, total: amount })
          }
        }
      }

      return {
        monthKey,
        totalIncome,
        totalExpenses,
        netCashFlow: totalIncome - totalExpenses,
        byCategory: Array.from(byCat.entries())
          .map(([categoryName, v]) => ({ categoryName, groupDirection: v.direction, total: v.total }))
          .sort((a, b) => Math.abs(b.total) - Math.abs(a.total)),
        byAccount: Array.from(byAcct.values()).sort((a, b) => Math.abs(b.total) - Math.abs(a.total)),
      }
    },
  })
}

// ─── Sync Runs ───────────────────────────────────

export function useSyncRuns() {
  const { tenantId } = useAuthContext()
  return useQuery<FinanceSyncRun[]>({
    queryKey: qk.finance.syncRuns(tenantId),
    enabled: !!tenantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('finance_sync_runs')
        .select('*')
        .eq('tenant_id', tenantId!)
        .order('started_at', { ascending: false })
        .limit(20)
      if (error) throw error
      return data ?? []
    },
  })
}

// ─── Exports ─────────────────────────────────────

export function useFinanceExports() {
  const { tenantId } = useAuthContext()
  return useQuery<FinanceExport[]>({
    queryKey: qk.finance.exports(tenantId),
    enabled: !!tenantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('finance_exports')
        .select('*')
        .eq('tenant_id', tenantId!)
        .order('created_at', { ascending: false })
        .limit(50)
      if (error) throw error
      return data ?? []
    },
  })
}

// ─── Mutations ───────────────────────────────────

/** Create Plaid Link token via edge function */
export function useCreateLinkToken() {
  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke<{ link_token: string; expiration: string }>(
        'plaid-create-link-token',
        { method: 'POST', body: {} },
      )
      if (error) throw new Error('Failed to create link token')
      return data!
    },
  })
}

/** Exchange Plaid public_token via edge function */
export function useExchangePlaidToken() {
  const qc = useQueryClient()
  const { tenantId } = useAuthContext()

  return useMutation({
    mutationFn: async (params: {
      public_token: string
      institution?: { institution_id: string; name: string }
      location_id?: string
    }) => {
      const { data, error } = await supabase.functions.invoke('plaid-exchange-token', {
        method: 'POST',
        body: params,
      })
      if (error) throw new Error('Failed to exchange token')
      return data as { success: boolean; item_id: string; accounts_linked: number }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.finance.all })
    },
  })
}

/** Trigger transaction sync via edge function */
export function useSyncTransactions() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('plaid-sync-transactions', {
        method: 'POST',
        body: {},
      })
      if (error) throw new Error('Transaction sync failed')
      return data as { success: boolean; added: number; modified: number; removed: number }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.finance.all })
    },
  })
}

/** Trigger balance sync via edge function */
export function useSyncBalances() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('plaid-sync-balances', {
        method: 'POST',
        body: {},
      })
      if (error) throw new Error('Balance sync failed')
      return data as { success: boolean; snapshots: number }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.finance.all })
    },
  })
}

/** Assign a category to a transaction (manual override) */
export function useAssignCategory() {
  const qc = useQueryClient()
  const { tenantId } = useAuthContext()

  return useMutation({
    mutationFn: async (params: { transaction_id: string; category_id: string }) => {
      if (!tenantId) throw new Error('Not authenticated')

      const { error } = await supabase
        .from('finance_transaction_category_assignments')
        .upsert({
          tenant_id: tenantId,
          transaction_id: params.transaction_id,
          category_id: params.category_id,
          assignment_source: 'manual',
          assigned_by: 'user',
        }, { onConflict: 'transaction_id' })

      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.finance.all })
    },
  })
}

/** Create a recurring rule */
export function useCreateRecurringRule() {
  const qc = useQueryClient()
  const { tenantId } = useAuthContext()

  return useMutation({
    mutationFn: async (params: Omit<FinanceRecurringRule, 'id' | 'category_name' | 'location_name'>) => {
      if (!tenantId) throw new Error('Not authenticated')
      const { error } = await supabase
        .from('finance_recurring_rules')
        .insert({ ...params, tenant_id: tenantId })
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.finance.recurringRules(tenantId) })
    },
  })
}

/** Delete a recurring rule */
export function useDeleteRecurringRule() {
  const qc = useQueryClient()
  const { tenantId } = useAuthContext()

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('finance_recurring_rules').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.finance.recurringRules(tenantId) })
    },
  })
}

/** Update account location mapping */
export function useUpdateAccountLocation() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (params: { account_id: string; location_id: string | null }) => {
      const { error } = await supabase
        .from('finance_accounts')
        .update({ location_id: params.location_id })
        .eq('id', params.account_id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.finance.all })
    },
  })
}

/** Toggle transaction recurring flag */
export function useToggleTransactionRecurring() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (params: { id: string; is_recurring: boolean }) => {
      const { error } = await supabase
        .from('finance_transactions')
        .update({ is_recurring: params.is_recurring })
        .eq('id', params.id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.finance.all })
    },
  })
}

/** Request a CSV export */
export function useRequestExport() {
  const qc = useQueryClient()
  const { tenantId } = useAuthContext()

  return useMutation({
    mutationFn: async (params: { from_month: string; to_month: string; location_id?: string; export_type: string }) => {
      if (!tenantId) throw new Error('Not authenticated')

      // Build CSV directly on the client for v1
      const bucket = monthKeyToBucket(params.from_month)
      const endBucket = monthKeyToBucket(params.to_month)

      const { data: txs, error } = await supabase
        .from('finance_transactions')
        .select(`
          posted_date, transaction_name, merchant_name, amount,
          is_recurring, is_transfer, plaid_primary_category,
          finance_accounts(account_name, mask),
          finance_locations(name),
          finance_transaction_category_assignments(finance_categories(name))
        `)
        .eq('tenant_id', tenantId)
        .eq('is_excluded', false)
        .gte('month_bucket', bucket)
        .lte('month_bucket', endBucket)
        .order('posted_date', { ascending: false })
        .limit(5000)

      if (error) throw error

      const rows = (txs ?? []).map((t: Record<string, unknown>) => {
        const acct = t.finance_accounts as { account_name: string; mask: string | null } | null
        const loc = t.finance_locations as { name: string } | null
        const assignments = t.finance_transaction_category_assignments as
          { finance_categories: { name: string } | null }[] | null
        return {
          Date: t.posted_date,
          Name: t.transaction_name,
          Merchant: t.merchant_name ?? '',
          Amount: t.amount,
          Account: acct ? `${acct.account_name} (${acct.mask ?? ''})` : '',
          Location: loc?.name ?? '',
          Category: assignments?.[0]?.finance_categories?.name ?? 'Uncategorized',
          Recurring: t.is_recurring ? 'Yes' : 'No',
          Transfer: t.is_transfer ? 'Yes' : 'No',
        }
      })

      if (rows.length === 0) throw new Error('No transactions found for the selected period')

      const headers = Object.keys(rows[0])
      const csv = [
        headers.join(','),
        ...rows.map(r => headers.map(h => {
          const v = String((r as Record<string, unknown>)[h] ?? '')
          return v.includes(',') || v.includes('"') ? `"${v.replace(/"/g, '""')}"` : v
        }).join(',')),
      ].join('\n')

      const blob = new Blob([csv], { type: 'text/csv' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `finance-export-${params.from_month}-to-${params.to_month}.csv`
      a.click()
      URL.revokeObjectURL(url)

      // Log the export
      await supabase.from('finance_exports').insert({
        tenant_id: tenantId,
        from_month: bucket,
        to_month: endBucket,
        export_type: params.export_type,
        status: 'completed',
        completed_at: new Date().toISOString(),
      })

      return { rows: rows.length }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.finance.exports(tenantId) })
    },
  })
}
