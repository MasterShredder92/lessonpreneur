import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

// ─── Payroll Periods ───────────────────────────────────────────

export function usePayrollPeriods() {
  return useQuery({
    queryKey: ['payroll-periods'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('payroll_periods')
        .select('*')
        .order('billing_date', { ascending: false })
      if (error) throw error
      return data as PayrollPeriod[]
    },
  })
}

export function usePayrollPeriod(id: string | undefined) {
  return useQuery({
    queryKey: ['payroll-period', id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('payroll_periods')
        .select('*')
        .eq('id', id!)
        .single()
      if (error) throw error
      return data as PayrollPeriod
    },
  })
}

export function useCreatePayrollPeriod() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (params: {
      tenant_id: string
      period_label: string
      billing_date: string
      status?: string
    }) => {
      const { data, error } = await supabase
        .from('payroll_periods')
        .insert({
          tenant_id: params.tenant_id,
          period_label: params.period_label,
          billing_date: params.billing_date,
          status: params.status ?? 'open',
        })
        .select()
        .single()
      if (error) throw error
      return data as PayrollPeriod
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['payroll-periods'] })
    },
  })
}

export function useUpdatePayrollPeriod() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (params: {
      id: string
      status?: string
      period_label?: string
      billing_date?: string
      total_attempted?: number
      total_succeeded?: number
      total_failed?: number
      total_revenue_cents?: number
    }) => {
      const { id, ...updates } = params
      const { data, error } = await supabase
        .from('payroll_periods')
        .update(updates)
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      return data as PayrollPeriod
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['payroll-periods'] })
      qc.invalidateQueries({ queryKey: ['payroll-period'] })
    },
  })
}

// ─── Payroll Entries ───────────────────────────────────────────

export function usePayrollEntries(periodId: string | undefined) {
  return useQuery({
    queryKey: ['payroll-entries', periodId],
    enabled: !!periodId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('payroll_entries')
        .select('*, teacher:teachers(id, first_name, last_name, rate_per_block, pay_rate_per_half_hour, teacher_role)')
        .eq('period_id', periodId!)
        .order('created_at')
      if (error) throw error
      return data as PayrollEntry[]
    },
  })
}

export function useCreatePayrollEntry() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (params: {
      tenant_id: string
      period_id: string
      teacher_id: string
      sessions_taught: number
      pay_rate: number
      bonus_amount: number
      bonus_overridden?: boolean
      tips?: number
      director_pay?: number
      notes?: string
    }) => {
      // Never insert session_total or total_pay — they are GENERATED columns
      const { data, error } = await supabase
        .from('payroll_entries')
        .insert({
          tenant_id: params.tenant_id,
          period_id: params.period_id,
          teacher_id: params.teacher_id,
          sessions_taught: params.sessions_taught,
          pay_rate: params.pay_rate,
          bonus_amount: params.bonus_amount,
          bonus_overridden: params.bonus_overridden ?? false,
          tips: params.tips ?? 0,
          director_pay: params.director_pay ?? 0,
          notes: params.notes ?? null,
        })
        .select()
        .single()
      if (error) throw error
      return data as PayrollEntry
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['payroll-entries', vars.period_id] })
    },
  })
}

export function useUpdatePayrollEntry() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (params: {
      id: string
      period_id: string
      sessions_taught?: number
      pay_rate?: number
      bonus_amount?: number
      bonus_overridden?: boolean
      bonus_overridden_by?: string
      bonus_overridden_at?: string
      tips?: number
      director_pay?: number
      notes?: string
    }) => {
      const { id, period_id, ...updates } = params
      // Never update session_total or total_pay — they are GENERATED columns
      const { data, error } = await supabase
        .from('payroll_entries')
        .update(updates)
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      return data as PayrollEntry
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['payroll-entries', vars.period_id] })
    },
  })
}

// ─── Tips ──────────────────────────────────────────────────────

export function useTips(periodId: string | undefined) {
  return useQuery({
    queryKey: ['tips', periodId],
    enabled: !!periodId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tips')
        .select('*, tip_attributions(*), student:students(first_name, last_name)')
        .eq('period_id', periodId!)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data as Tip[]
    },
  })
}

export function useCreateTip() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (params: {
      tenant_id: string
      period_id: string
      student_id: string
      amount: number
      attributions: { teacher_id: string; amount: number }[]
    }) => {
      const { data: tip, error: tipErr } = await supabase
        .from('tips')
        .insert({
          tenant_id: params.tenant_id,
          period_id: params.period_id,
          student_id: params.student_id,
          amount: params.amount,
        })
        .select()
        .single()
      if (tipErr) throw tipErr

      if (params.attributions.length > 0) {
        const { error: attrErr } = await supabase
          .from('tip_attributions')
          .insert(
            params.attributions.map((a) => ({
              tip_id: tip.id,
              teacher_id: a.teacher_id,
              amount: a.amount,
            }))
          )
        if (attrErr) throw attrErr
      }

      return tip as Tip
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['tips', vars.period_id] })
      qc.invalidateQueries({ queryKey: ['payroll-entries', vars.period_id] })
    },
  })
}

// ─── Teacher Documents ─────────────────────────────────────────

export function useTeacherDocuments(teacherId: string | undefined) {
  return useQuery({
    queryKey: ['teacher-documents', teacherId],
    enabled: !!teacherId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('teacher_documents')
        .select('*')
        .eq('teacher_id', teacherId!)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data as TeacherDocument[]
    },
  })
}

export function useUploadTeacherDocument() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (params: {
      tenant_id: string
      teacher_id: string
      file_name: string
      file_url: string
      file_type: string
      category?: string
    }) => {
      const { data, error } = await supabase
        .from('teacher_documents')
        .insert({
          tenant_id: params.tenant_id,
          teacher_id: params.teacher_id,
          file_name: params.file_name,
          file_url: params.file_url,
          file_type: params.file_type,
          category: params.category ?? 'other',
        })
        .select()
        .single()
      if (error) throw error
      return data as TeacherDocument
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['teacher-documents', vars.teacher_id] })
    },
  })
}

export function useDeleteTeacherDocument() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (params: { id: string; teacher_id: string }) => {
      const { error } = await supabase
        .from('teacher_documents')
        .delete()
        .eq('id', params.id)
      if (error) throw error
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['teacher-documents', vars.teacher_id] })
    },
  })
}

// ─── Types ─────────────────────────────────────────────────────

export interface PayrollPeriod {
  id: string
  tenant_id: string
  period_label: string
  billing_date: string
  status: string
  total_attempted: number | null
  total_succeeded: number | null
  total_failed: number | null
  total_revenue_cents: number | null
  created_at: string
}

export interface PayrollEntry {
  id: string
  tenant_id: string
  period_id: string
  teacher_id: string
  sessions_taught: number
  pay_rate: number
  session_total: number    // GENERATED — read only
  bonus_amount: number
  bonus_overridden: boolean
  bonus_overridden_by: string | null
  bonus_overridden_at: string | null
  tips: number
  director_pay: number
  total_pay: number       // GENERATED — read only
  notes: string | null
  created_at: string
  updated_at: string
  teacher?: {
    id: string
    first_name: string
    last_name: string
    rate_per_block: number
    pay_rate_per_half_hour: number
    teacher_role: string | null
  }
}

export interface Tip {
  id: string
  tenant_id: string
  period_id: string
  student_id: string
  amount: number
  created_at: string
  tip_attributions: TipAttribution[]
  student?: {
    first_name: string
    last_name: string
  }
}

export interface TipAttribution {
  id: string
  tip_id: string
  teacher_id: string
  amount: number
}

export interface TeacherDocument {
  id: string
  tenant_id: string
  teacher_id: string
  file_name: string
  file_url: string
  file_type: string
  category: string
  created_at: string
}
