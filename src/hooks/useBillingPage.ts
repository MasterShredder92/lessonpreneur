import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuthContext } from '../app/AuthContext'
import { DEFAULT_RATE_TIER_CENTS } from '../lib/constants'

// ═══════════════════════════════════════
// TYPES
// ═══════════════════════════════════════

export interface BillingFamily {
  id: string; name: string; parent_name: string | null; primary_email: string | null
  primary_phone: string | null; billing_status: string; billing_day: number | null
  rate_tier: number; rate_tier_override: boolean; rate_tier_reason: string | null
  card_brand: string | null; card_last_four: string | null
  card_exp_month: number | null; card_exp_year: number | null
  balance: number; overdue_balance_cents: number | null; lifetime_paid_cents: number | null
  billing_notes: string | null; square_customer_id: string | null
  activeStudentCount: number; instruments: string[]
  students: { id: string; first_name: string; last_name: string; instrument: string; sessions_per_month: number; rate_per_session: number; location_id: string | null; monthly_cents: number }[]
}

export interface BillingAlert {
  id: string; type: 'no_card' | 'overdue' | 'expiring_card' | 'paused_with_students'
  familyId: string; familyName: string; parentName: string | null; detail: string
}

export interface BillingSummary {
  recurringRevenueCents: number; activeFamilies: number; activeStudents: number
  pendingAdjustmentsCents: number; pendingAdjustmentsCount: number
  actualInvoiceCents: number; overdueCents: number; overdueCount: number
}

export interface PendingAdjustment {
  id: string; family_id: string; student_id: string; adjustment_type: string
  amount_cents: number; reason: string; notes: string | null
  applies_to_cycle: string; created_at: string
  student_name?: string; family_name?: string
}

// ═══════════════════════════════════════
// UTILITY — NEXT CYCLE DATE
// ═══════════════════════════════════════

export function getNextCycleDate(billingDay: number): string {
  const now = new Date()
  const y = now.getFullYear(); const m = now.getMonth()
  if (billingDay === 1) {
    return `${y}-${String(m + 2).padStart(2, '0')}-01`
  }
  if (now.getDate() < 15) return `${y}-${String(m + 1).padStart(2, '0')}-15`
  return `${y}-${String(m + 2).padStart(2, '0')}-15`
}

export function getNextCycleDateEarliest(): string {
  const d1 = getNextCycleDate(1)
  const d15 = getNextCycleDate(15)
  return d1 < d15 ? d1 : d15
}

// ═══════════════════════════════════════
// BILLING SUMMARY (hero boxes)
// ═══════════════════════════════════════

export function useBillingSummary() {
  return useQuery({
    queryKey: ['billing_summary'],
    queryFn: async () => {
      // Read from the live view
      const { data: rates } = await supabase.from('student_effective_rate').select('student_id, family_id, monthly_cents, billing_day')
      const recurring = (rates ?? []).reduce((s, r: any) => s + (r.monthly_cents ?? 0), 0)
      const familyIds = new Set((rates ?? []).map((r: any) => r.family_id))

      // Pending adjustments
      const nextCycle = getNextCycleDateEarliest()
      const { data: adj } = await supabase.from('billing_adjustments').select('amount_cents').eq('applied', false).lte('applies_to_cycle', nextCycle)
      const pendingCents = (adj ?? []).reduce((s, a: any) => s + (a.amount_cents ?? 0), 0)

      // Overdue from billing events
      const { data: overdue } = await supabase.from('billing_events').select('amount_cents, family_id').in('status', ['failed', 'pending']).not('attempted_at', 'is', null)
      const overdueCents = (overdue ?? []).reduce((s, e: any) => s + (e.amount_cents ?? 0), 0)
      const overdueIds = new Set((overdue ?? []).map((e: any) => e.family_id))

      return {
        recurringRevenueCents: recurring,
        activeFamilies: familyIds.size,
        activeStudents: (rates ?? []).length,
        pendingAdjustmentsCents: pendingCents,
        pendingAdjustmentsCount: (adj ?? []).length,
        actualInvoiceCents: recurring - pendingCents,
        overdueCents,
        overdueCount: overdueIds.size,
      } as BillingSummary
    },
  })
}

// ═══════════════════════════════════════
// PENDING ADJUSTMENTS
// ═══════════════════════════════════════

export function usePendingAdjustments() {
  return useQuery({
    queryKey: ['billing_adjustments', 'pending'],
    queryFn: async () => {
      const { data } = await supabase.from('billing_adjustments').select('*').eq('applied', false).order('created_at', { ascending: false })
      // Resolve names
      const studentIds = [...new Set((data ?? []).map((a: any) => a.student_id))]
      const familyIds = [...new Set((data ?? []).map((a: any) => a.family_id))]
      const sMap = new Map<string, string>()
      const fMap = new Map<string, string>()
      if (studentIds.length > 0) {
        const { data: students } = await supabase.from('students').select('id, first_name, last_name').in('id', studentIds)
        students?.forEach((s: any) => sMap.set(s.id, `${s.first_name} ${s.last_name}`))
      }
      if (familyIds.length > 0) {
        const { data: families } = await supabase.from('families').select('id, name').in('id', familyIds)
        families?.forEach((f: any) => fMap.set(f.id, f.name?.replace(/\s+family$/i, '') ?? f.name))
      }
      return (data ?? []).map((a: any) => ({
        ...a,
        student_name: sMap.get(a.student_id) ?? 'Unknown',
        family_name: fMap.get(a.family_id) ?? 'Unknown',
      })) as PendingAdjustment[]
    },
  })
}

// ═══════════════════════════════════════
// BILLING ALERTS
// ═══════════════════════════════════════

export function useBillingAlerts() {
  return useQuery({
    queryKey: ['billing_alerts'],
    queryFn: async () => {
      const { data: families } = await supabase.from('families').select('id, name, parent_name, billing_status, card_last_four, card_brand, card_exp_month, card_exp_year, overdue_balance_cents, balance')
      const { data: students } = await supabase.from('students').select('family_id, status').eq('status', 'active')
      const countByFam = new Map<string, number>()
      students?.forEach((s: any) => countByFam.set(s.family_id, (countByFam.get(s.family_id) ?? 0) + 1))
      const future = new Date(Date.now() + 45 * 24 * 60 * 60 * 1000)
      const alerts: BillingAlert[] = []
      for (const f of (families ?? [])) {
        const dn = f.name?.replace(/\s+family$/i, '') ?? f.name
        if (f.billing_status === 'active' && !f.card_last_four) alerts.push({ id: `nc-${f.id}`, type: 'no_card', familyId: f.id, familyName: dn, parentName: f.parent_name, detail: 'Active but no card on file' })
        if ((f.overdue_balance_cents ?? 0) > 0 || (f.balance ?? 0) < 0) alerts.push({ id: `od-${f.id}`, type: 'overdue', familyId: f.id, familyName: dn, parentName: f.parent_name, detail: `$${(Math.abs(f.overdue_balance_cents ?? f.balance ?? 0) / 100).toFixed(2)} overdue` })
        if (f.card_exp_month && f.card_exp_year && new Date(f.card_exp_year, f.card_exp_month - 1, 28) <= future) alerts.push({ id: `ex-${f.id}`, type: 'expiring_card', familyId: f.id, familyName: dn, parentName: f.parent_name, detail: `${f.card_brand ?? 'Card'} ••••${f.card_last_four} expires ${f.card_exp_month}/${f.card_exp_year}` })
        if (f.billing_status === 'paused' && (countByFam.get(f.id) ?? 0) > 0) alerts.push({ id: `pa-${f.id}`, type: 'paused_with_students', familyId: f.id, familyName: dn, parentName: f.parent_name, detail: `Billing paused but ${countByFam.get(f.id)} active student(s)` })
      }
      const order: Record<string, number> = { no_card: 0, overdue: 1, expiring_card: 2, paused_with_students: 3 }
      alerts.sort((a, b) => (order[a.type] ?? 9) - (order[b.type] ?? 9))
      return alerts
    },
  })
}

// ═══════════════════════════════════════
// BILLING FAMILIES LIST (uses view)
// ═══════════════════════════════════════

export function useBillingFamilies(filters?: { status?: string; cardStatus?: string; rateTier?: number; balance?: string; search?: string }) {
  return useQuery({
    queryKey: ['billing_families', filters],
    queryFn: async () => {
      const { data: families } = await supabase.from('families').select('id, name, parent_name, primary_email, primary_phone, billing_status, billing_day, rate_tier, rate_tier_override, rate_tier_reason, card_brand, card_last_four, card_exp_month, card_exp_year, balance, overdue_balance_cents, lifetime_paid_cents, billing_notes, square_customer_id').order('name')
      // Use the view for live rates
      const { data: rates } = await supabase.from('student_effective_rate').select('student_id, family_id, first_name, last_name, instrument, sessions_per_month, rate_per_session, monthly_cents, location_id')
      const studentsByFamily = new Map<string, any[]>()
      rates?.forEach((s: any) => {
        const list = studentsByFamily.get(s.family_id) ?? []
        list.push(s)
        studentsByFamily.set(s.family_id, list)
      })
      let result = (families ?? []).map((f: any) => {
        const studs = (studentsByFamily.get(f.id) ?? []).sort((a: any, b: any) => (a.first_name ?? '').localeCompare(b.first_name ?? ''))
        return { ...f, billing_status: f.billing_status ?? 'active', rate_tier: f.rate_tier ?? DEFAULT_RATE_TIER_CENTS, balance: f.balance ?? 0, activeStudentCount: studs.length, instruments: [...new Set(studs.map((s: any) => s.instrument).filter(Boolean))], students: studs } as BillingFamily
      })
      if (filters?.status) result = result.filter(f => f.billing_status === filters.status)
      if (filters?.cardStatus === 'no_card') result = result.filter(f => !f.card_last_four)
      if (filters?.cardStatus === 'has_card') result = result.filter(f => !!f.card_last_four)
      if (filters?.rateTier) result = result.filter(f => f.rate_tier === filters.rateTier)
      if (filters?.balance === 'overdue') result = result.filter(f => f.balance < 0 || (f.overdue_balance_cents ?? 0) > 0)
      if (filters?.balance === 'credit') result = result.filter(f => f.balance > 0)
      if (filters?.search) { const q = filters.search.toLowerCase(); result = result.filter(f => `${f.name} ${f.parent_name ?? ''} ${f.primary_email ?? ''}`.toLowerCase().includes(q)) }
      result.sort((a, b) => {
        const au = (a.balance < 0 || !a.card_last_four) ? 0 : 1
        const bu = (b.balance < 0 || !b.card_last_four) ? 0 : 1
        if (au !== bu) return au - bu
        return (a.name ?? '').localeCompare(b.name ?? '')
      })
      return result
    },
  })
}

// ═══════════════════════════════════════
// FAMILY BILLING DETAIL
// ═══════════════════════════════════════

export function useFamilyBillingDetail(familyId: string | undefined) {
  return useQuery({
    queryKey: ['family_billing_detail', familyId],
    enabled: !!familyId,
    queryFn: async () => {
      const { data: family } = await supabase.from('families').select('*').eq('id', familyId!).single()
      const { data: students } = await supabase.from('student_effective_rate').select('*').eq('family_id', familyId!)
      const { data: adjustments } = await supabase.from('billing_adjustments').select('*').eq('family_id', familyId!).order('created_at', { ascending: false })
      return { family, students: (students ?? []).sort((a: any, b: any) => (a.first_name ?? '').localeCompare(b.first_name ?? '')), adjustments: adjustments ?? [] }
    },
  })
}

export function useFamilyPaymentHistory(familyId: string | undefined) {
  return useQuery({
    queryKey: ['payment_history', familyId],
    enabled: !!familyId,
    queryFn: async () => {
      const { data } = await supabase.from('payment_history').select('*').eq('family_id', familyId!).order('created_at', { ascending: false })
      return data ?? []
    },
  })
}

// ═══════════════════════════════════════
// MUTATIONS
// ═══════════════════════════════════════

export function useUpdateBillingStatus() {
  const qc = useQueryClient(); const { user } = useAuthContext()
  return useMutation({
    mutationFn: async (p: { familyId: string; oldStatus: string; newStatus: string }) => {
      const { error } = await supabase.from('families').update({ billing_status: p.newStatus }).eq('id', p.familyId)
      if (error) throw error
      await supabase.from('audit_log').insert({ action: 'BILLING_STATUS_CHANGED', table_name: 'families', record_id: p.familyId, old_value: p.oldStatus, new_value: p.newStatus, performed_by: user?.id ?? null })
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['billing'] }); qc.invalidateQueries({ queryKey: ['billing_summary'] }); qc.invalidateQueries({ queryKey: ['families'] }) },
  })
}

export function useUpdateBillingDay() {
  const qc = useQueryClient(); const { user } = useAuthContext()
  return useMutation({
    mutationFn: async (p: { familyId: string; billingDay: number }) => {
      const { error } = await supabase.from('families').update({ billing_day: p.billingDay }).eq('id', p.familyId)
      if (error) throw error
      await supabase.from('audit_log').insert({ action: 'BILLING_DAY_CHANGED', table_name: 'families', record_id: p.familyId, new_value: String(p.billingDay), performed_by: user?.id ?? null })
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['billing'] }) },
  })
}

export function useAdjustBalance() {
  const qc = useQueryClient(); const { user } = useAuthContext()
  return useMutation({
    mutationFn: async (p: { familyId: string; amountCents: number; reason: string }) => {
      const { error } = await supabase.rpc('adjust_family_balance', {
        p_family_id: p.familyId,
        p_amount_cents: p.amountCents,
        p_reason: p.reason,
        p_performed_by: user?.id ?? null,
      })
      if (error) throw error
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['billing'] }); qc.invalidateQueries({ queryKey: ['families'] }) },
  })
}

export function useAddBillingAdjustment() {
  const qc = useQueryClient(); const { user, tenantId } = useAuthContext()
  return useMutation({
    mutationFn: async (p: { familyId: string; studentId: string; adjustmentType: string; amountCents: number; reason: string; notes?: string; appliesToCycle?: string }) => {
      const cycle = p.appliesToCycle ?? getNextCycleDate(1)
      const { error } = await supabase.from('billing_adjustments').insert({
        tenant_id: tenantId, family_id: p.familyId, student_id: p.studentId,
        adjustment_type: p.adjustmentType, amount_cents: p.amountCents,
        reason: p.reason, notes: p.notes || null,
        applies_to_cycle: cycle, applied: false, created_by: user?.id ?? null,
      })
      if (error) throw error
      await supabase.from('audit_log').insert({ action: 'BILLING_ADJUSTMENT_CREATED', table_name: 'billing_adjustments', new_value: JSON.stringify({ student_id: p.studentId, amount_cents: p.amountCents, reason: p.reason, cycle }), performed_by: user?.id ?? null })
    },
    onSuccess: (_d, v) => { qc.invalidateQueries({ queryKey: ['billing_adjustments'] }); qc.invalidateQueries({ queryKey: ['billing_summary'] }); qc.invalidateQueries({ queryKey: ['family_billing_detail', v.familyId] }) },
  })
}

export function useDeleteBillingAdjustment() {
  const qc = useQueryClient(); const { user } = useAuthContext()
  return useMutation({
    mutationFn: async (p: { id: string; familyId: string }) => {
      const { error } = await supabase.from('billing_adjustments').delete().eq('id', p.id).eq('applied', false)
      if (error) throw error
      await supabase.from('audit_log').insert({ action: 'BILLING_ADJUSTMENT_REMOVED', table_name: 'billing_adjustments', record_id: p.id, performed_by: user?.id ?? null })
    },
    onSuccess: (_d, v) => { qc.invalidateQueries({ queryKey: ['billing_adjustments'] }); qc.invalidateQueries({ queryKey: ['billing_summary'] }); qc.invalidateQueries({ queryKey: ['family_billing_detail', v.familyId] }) },
  })
}

// ═══════════════════════════════════════
// SQUARE INVOICE QUERIES
// ═══════════════════════════════════════

export interface SquareInvoiceSummary {
  recurringSeriesCents: number
  actualRevenueCents: number
  adjustmentDeltaCents: number
  overdueCents: number
  overdueFamilyCount: number
}

export function useSquareInvoiceSummary() {
  const { tenantId } = useAuthContext()
  const TENANT_ID = tenantId!
  return useQuery({
    queryKey: ['square_invoices_summary', TENANT_ID],
    enabled: !!TENANT_ID,
    queryFn: async () => {
      // Recurring series revenue = sum of (rate_tier * sessions_per_month) for active students
      const { data: rates } = await supabase
        .from('student_effective_rate')
        .select('monthly_cents')
      const recurringSeriesCents = (rates ?? []).reduce((s, r: any) => s + (r.monthly_cents ?? 0), 0)

      // Scheduled invoice revenue = sum of SCHEDULED invoices (what Square will actually charge)
      const { data: scheduledInvoices } = await supabase
        .from('square_invoices')
        .select('amount_cents')
        .eq('tenant_id', TENANT_ID)
        .eq('status', 'SCHEDULED')
      const actualRevenueCents = (scheduledInvoices ?? []).reduce((s, r: any) => s + (r.amount_cents ?? 0), 0)

      // Delta = recurring base minus what's actually scheduled (credits/discounts applied)
      const adjustmentDeltaCents = recurringSeriesCents - actualRevenueCents

      // Overdue = sum of UNPAID invoices + distinct family count
      const { data: unpaid } = await supabase
        .from('square_invoices')
        .select('amount_cents, family_id')
        .eq('tenant_id', TENANT_ID)
        .eq('status', 'UNPAID')
      const overdueCents = (unpaid ?? []).reduce((s, r: any) => s + (r.amount_cents ?? 0), 0)
      const overdueFamilyCount = new Set((unpaid ?? []).map((r: any) => r.family_id).filter(Boolean)).size

      return { recurringSeriesCents, actualRevenueCents, adjustmentDeltaCents, overdueCents, overdueFamilyCount } as SquareInvoiceSummary
    },
  })
}

export interface SquareInvoiceFamily {
  family_id: string
  family_name: string
  latest_status: string
  scheduled_cents: number
  paid_this_month_cents: number
  has_card: boolean
  has_unpaid: boolean
}

export function useSquareInvoicesByFamily() {
  const { tenantId } = useAuthContext()
  const TENANT_ID = tenantId!
  return useQuery({
    queryKey: ['square_invoices_by_family', TENANT_ID],
    enabled: !!TENANT_ID,
    queryFn: async () => {
      const now = new Date()
      const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
      const nextMonth = now.getMonth() === 11
        ? `${now.getFullYear() + 1}-01-01`
        : `${now.getFullYear()}-${String(now.getMonth() + 2).padStart(2, '0')}-01`

      // Get all invoices linked to families
      const { data: invoices } = await supabase
        .from('square_invoices')
        .select('family_id, status, amount_cents, paid_at, square_created_at')
        .eq('tenant_id', TENANT_ID)
        .not('family_id', 'is', null)
        .order('square_created_at', { ascending: false })

      // Get families with card info
      const familyIds = [...new Set((invoices ?? []).map((i: any) => i.family_id))]
      const familyMap = new Map<string, { name: string; has_card: boolean }>()
      // Batch in groups of 100 for the IN filter
      for (let i = 0; i < familyIds.length; i += 100) {
        const batch = familyIds.slice(i, i + 100)
        const { data: fams } = await supabase
          .from('families')
          .select('id, name, card_last_four')
          .in('id', batch)
        fams?.forEach((f: any) => familyMap.set(f.id, { name: f.name ?? 'Unknown', has_card: !!f.card_last_four }))
      }

      // Group invoices by family
      const grouped = new Map<string, { statuses: { status: string; created: string }[]; scheduledCents: number; paidThisMonthCents: number; hasUnpaid: boolean }>()
      for (const inv of (invoices ?? [])) {
        const fid = inv.family_id as string
        const entry = grouped.get(fid) ?? { statuses: [], scheduledCents: 0, paidThisMonthCents: 0, hasUnpaid: false }
        entry.statuses.push({ status: inv.status, created: inv.square_created_at ?? '' })
        if (inv.status === 'SCHEDULED') entry.scheduledCents += inv.amount_cents ?? 0
        if (inv.status === 'PAID' && inv.paid_at && inv.paid_at >= monthStart && inv.paid_at < nextMonth) {
          entry.paidThisMonthCents += inv.amount_cents ?? 0
        }
        if (inv.status === 'UNPAID') entry.hasUnpaid = true
        grouped.set(fid, entry)
      }

      const result: SquareInvoiceFamily[] = []
      for (const [fid, data] of grouped) {
        const fam = familyMap.get(fid)
        if (!fam) continue
        // Latest status = status of the most recent invoice (already sorted desc)
        const latestStatus = data.statuses[0]?.status ?? 'UNKNOWN'
        result.push({
          family_id: fid,
          family_name: fam.name,
          latest_status: latestStatus,
          scheduled_cents: data.scheduledCents,
          paid_this_month_cents: data.paidThisMonthCents,
          has_card: fam.has_card,
          has_unpaid: data.hasUnpaid,
        })
      }

      // Sort: families with scheduled invoices first, then alphabetical
      result.sort((a, b) => {
        if (a.scheduled_cents > 0 && b.scheduled_cents <= 0) return -1
        if (b.scheduled_cents > 0 && a.scheduled_cents <= 0) return 1
        return a.family_name.localeCompare(b.family_name)
      })

      return result
    },
  })
}

// Keep old exports for compatibility
export function useBillingDashboard() {
  return useQuery({ queryKey: ['billing_dashboard'], queryFn: async () => {
    const { data: families } = await supabase.from('families').select('id, billing_status, card_last_four, card_exp_month, card_exp_year, overdue_balance_cents, balance')
    const all = families ?? []; const now = new Date(); const future = new Date(now.getTime() + 45*24*60*60*1000)
    return {
      activeFamilies: all.filter(f => f.billing_status === 'active').length,
      noCardOnFile: all.filter(f => f.billing_status === 'active' && !f.card_last_four).length,
      paused: all.filter(f => f.billing_status === 'paused').length,
      overdue: all.filter(f => (f.overdue_balance_cents ?? 0) > 0 || (f.balance ?? 0) < 0).length,
      suspendedCancelled: all.filter(f => f.billing_status === 'suspended' || f.billing_status === 'cancelled').length,
      expiringCards: all.filter(f => f.card_exp_month && f.card_exp_year && new Date(f.card_exp_year, f.card_exp_month-1, 28) <= future).length,
    }
  }})
}
