import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuthContext } from '../app/AuthContext'

// ═══════════════════════════════════════
// TYPES
// ═══════════════════════════════════════

export interface PauseData {
  studentId: string
  familyId: string
  tenantId: string
  newStatus: 'paused' | 'inactive'
  pauseReason: string
  pauseReasonDetail?: string
  comingBack: boolean | null
  expectedReturnDate?: string | null
  followupDate?: string | null
}

export interface StudentFollowup {
  id: string
  tenant_id: string
  student_id: string
  family_id: string
  followup_date: string
  reason: string | null
  notes: string | null
  status: 'pending' | 'sent' | 'responded' | 'dismissed'
  ai_draft: string | null
  sent_at: string | null
  sent_by: string | null
  created_by: string | null
  created_at: string
  // Joined
  student_name?: string
  student_instrument?: string
  family_name?: string
  parent_name?: string
  parent_email?: string
  parent_phone?: string
  location_name?: string
  paused_at?: string
  pause_reason?: string
}

// ═══════════════════════════════════════
// PAUSE / DEACTIVATE STUDENT
// ═══════════════════════════════════════

export function usePauseStudent() {
  const qc = useQueryClient()
  const { user, profile } = useAuthContext()
  return useMutation({
    mutationFn: async (data: PauseData) => {
      // 1. Update student status + pause fields
      const studentUpdate: Record<string, any> = {
        status: data.newStatus,
        pause_reason: data.pauseReason || null,
        pause_reason_detail: data.pauseReasonDetail || null,
        coming_back: data.comingBack,
        expected_return_date: data.expectedReturnDate || null,
        followup_date: data.followupDate || null,
        followup_sent: false,
        deactivated_at: new Date().toISOString(),
        deactivated_by: user?.id ?? null,
      }

      const { error: stuErr } = await supabase
        .from('students')
        .update(studentUpdate)
        .eq('id', data.studentId)
      if (stuErr) throw stuErr

      // 2. Create followup record if followup date set
      if (data.followupDate) {
        const { error: fuErr } = await supabase
          .from('student_followups')
          .insert({
            tenant_id: data.tenantId,
            student_id: data.studentId,
            family_id: data.familyId,
            followup_date: data.followupDate,
            reason: data.pauseReason || null,
            notes: data.pauseReasonDetail || null,
            status: 'pending',
            created_by: user?.id ?? null,
          })
        if (fuErr) throw fuErr
      }

      // 3. Audit log
      await supabase.from('audit_log').insert({
        tenant_id: data.tenantId,
        action: data.newStatus === 'paused' ? 'STUDENT_PAUSED' : 'STUDENT_DEACTIVATED',
        table_name: 'students',
        record_id: data.studentId,
        new_value: JSON.stringify({
          reason: data.pauseReason,
          coming_back: data.comingBack,
          expected_return: data.expectedReturnDate,
          followup_date: data.followupDate,
        }),
        performed_by: user?.id ?? null,
      })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['students'] })
      qc.invalidateQueries({ queryKey: ['families'] })
      qc.invalidateQueries({ queryKey: ['families_page'] })
      qc.invalidateQueries({ queryKey: ['family_detail'] })
      qc.invalidateQueries({ queryKey: ['student_followups'] })
    },
  })
}

// ═══════════════════════════════════════
// REACTIVATE STUDENT
// ═══════════════════════════════════════

export function useReactivateStudent() {
  const qc = useQueryClient()
  const { user } = useAuthContext()
  return useMutation({
    mutationFn: async (params: { studentId: string; familyId: string; tenantId: string }) => {
      // Set student active, clear pause fields
      const { error: stuErr } = await supabase
        .from('students')
        .update({
          status: 'active',
          pause_reason: null,
          pause_reason_detail: null,
          coming_back: null,
          expected_return_date: null,
          followup_date: null,
          followup_sent: false,
          followup_sent_at: null,
          deactivated_at: null,
          deactivated_by: null,
        })
        .eq('id', params.studentId)
      if (stuErr) throw stuErr

      // Set family billing active
      await supabase
        .from('families')
        .update({ billing_status: 'active' })
        .eq('id', params.familyId)

      // Audit log
      await supabase.from('audit_log').insert({
        tenant_id: params.tenantId,
        action: 'STUDENT_REACTIVATED',
        table_name: 'students',
        record_id: params.studentId,
        performed_by: user?.id ?? null,
      })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['students'] })
      qc.invalidateQueries({ queryKey: ['families'] })
      qc.invalidateQueries({ queryKey: ['families_page'] })
      qc.invalidateQueries({ queryKey: ['family_detail'] })
      qc.invalidateQueries({ queryKey: ['student_followups'] })
    },
  })
}

// ═══════════════════════════════════════
// FOLLOWUPS QUERIES
// ═══════════════════════════════════════

export function useStudentFollowups(filters?: { status?: string; dueSoon?: boolean }) {
  return useQuery({
    queryKey: ['student_followups', filters],
    queryFn: async () => {
      let query = supabase
        .from('student_followups')
        .select('*')
        .order('followup_date', { ascending: true })

      if (filters?.status) {
        query = query.eq('status', filters.status)
      }
      if (filters?.dueSoon) {
        const today = new Date().toISOString().split('T')[0]
        const in30 = new Date()
        in30.setDate(in30.getDate() + 30)
        const in30Str = in30.toISOString().split('T')[0]
        query = query.gte('followup_date', today).lte('followup_date', in30Str)
      }

      const { data, error } = await query
      if (error) throw error

      // Resolve student + family info
      const studentIds = [...new Set((data ?? []).map((f: any) => f.student_id))]
      const familyIds = [...new Set((data ?? []).map((f: any) => f.family_id))]

      const studentMap = new Map<string, any>()
      if (studentIds.length > 0) {
        const { data: students } = await supabase
          .from('students')
          .select('id, first_name, last_name, instrument, location_id, pause_reason, deactivated_at')
          .in('id', studentIds)
        students?.forEach((s: any) => studentMap.set(s.id, s))
      }

      const familyMap = new Map<string, any>()
      if (familyIds.length > 0) {
        const { data: families } = await supabase
          .from('families')
          .select('id, name, parent_name, parent_first_name, parent_last_name, primary_email, primary_phone')
          .in('id', familyIds)
        families?.forEach((f: any) => familyMap.set(f.id, f))
      }

      // Location names
      const { data: locations } = await supabase.from('locations').select('id, name')
      const locMap = new Map((locations ?? []).map((l: any) => [l.id, l.name?.replace(' Music Lessons', '') ?? '']))

      return (data ?? []).map((fu: any) => {
        const stu = studentMap.get(fu.student_id)
        const fam = familyMap.get(fu.family_id)
        return {
          ...fu,
          student_name: stu ? `${stu.first_name} ${stu.last_name}` : 'Unknown',
          student_instrument: stu?.instrument ?? '',
          family_name: fam?.name ?? '',
          parent_name: fam?.parent_first_name ? `${fam.parent_first_name} ${fam.parent_last_name ?? ''}`.trim() : fam?.parent_name ?? '',
          parent_email: fam?.primary_email ?? '',
          parent_phone: fam?.primary_phone ?? '',
          location_name: stu?.location_id ? locMap.get(stu.location_id) ?? '' : '',
          paused_at: stu?.deactivated_at ?? null,
          pause_reason: stu?.pause_reason ?? fu.reason,
        } as StudentFollowup
      })
    },
  })
}

// ═══════════════════════════════════════
// FOLLOWUP ACTIONS
// ═══════════════════════════════════════

export function useDismissFollowup() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('student_followups')
        .update({ status: 'dismissed', updated_at: new Date().toISOString() })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['student_followups'] })
    },
  })
}

export function useMarkFollowupSent() {
  const qc = useQueryClient()
  const { user } = useAuthContext()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('student_followups')
        .update({
          status: 'sent',
          sent_at: new Date().toISOString(),
          sent_by: user?.id ?? null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['student_followups'] })
    },
  })
}
