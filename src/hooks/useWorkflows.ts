import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuthContext } from '../app/AuthContext'
import { qk } from '../lib/queryKeys'

export interface Workflow {
  id: string
  name: string
  description: string | null
  enabled: boolean
  trigger_type: string
  trigger_config: any
  action_type: string
  action_config: any
  last_run_at: string | null
  run_count: number
  last_result: any
}

// Pre-built workflow definitions
export const PRE_BUILT_WORKFLOWS = [
  {
    name: 'Morning Briefing',
    description: 'AI-generated daily briefing at 8am with top priorities',
    trigger_type: 'schedule',
    trigger_config: { cron: '0 8 * * *', label: 'Daily at 8:00 AM' },
    action_type: 'send_notification',
    action_config: { template: 'morning_briefing', channel: 'in_app', target: 'owner' },
  },
  {
    name: 'At-Risk Follow-Up',
    description: 'Auto-create task when a student hits Critical risk score',
    trigger_type: 'threshold',
    trigger_config: { metric: 'churn_risk_score', operator: '>=', value: 61, label: 'Student risk score >= 61 (Critical)' },
    action_type: 'create_task',
    action_config: { title: 'Urgent: {student_name} is critical risk — reach out today', priority: 'urgent', assign_to: 'location_director' },
  },
  {
    name: 'Win-Back Trigger',
    description: 'Schedule win-back campaigns when a student pauses',
    trigger_type: 'event',
    trigger_config: { event: 'student.status_changed', to: 'paused', label: 'Student status → paused' },
    action_type: 'send_communication',
    action_config: { template: 'win_back', schedule: [30, 60, 90], channel: 'all' },
  },
  {
    name: 'New Lead Response',
    description: 'Auto-create follow-up task for new leads within 2 hours',
    trigger_type: 'event',
    trigger_config: { event: 'lead.created', label: 'New lead inquiry received' },
    action_type: 'create_task',
    action_config: { title: 'Follow up with {lead_name} within 2 hours', priority: 'high', assign_to: 'studio_director', escalate_after_hours: 2 },
  },
  {
    name: 'Payment Overdue',
    description: 'Auto-send reminder when payment is 7+ days overdue',
    trigger_type: 'threshold',
    trigger_config: { metric: 'payment_overdue_days', operator: '>=', value: 7, label: 'Payment overdue 7+ days' },
    action_type: 'send_communication',
    action_config: { template: 'payment_reminder', channel: 'email', escalate_at_14_days: true },
  },
  {
    name: 'Weekly Summary',
    description: 'AI-generated weekly performance report every Monday',
    trigger_type: 'schedule',
    trigger_config: { cron: '0 7 * * 1', label: 'Every Monday at 7:00 AM' },
    action_type: 'generate_report',
    action_config: { template: 'weekly_summary', send_to: ['owner', 'directors'], channel: 'email' },
  },
]

// ─── Query workflows ─────────────────────────────────

export function useWorkflows() {
  const { tenantId } = useAuthContext()
  return useQuery<Workflow[]>({
    queryKey: ['ai-workflows', tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data } = await supabase.from('ai_workflows').select('*').eq('tenant_id', tenantId!).order('name')
      return data ?? []
    },
  })
}

// ─── Toggle workflow ─────────────────────────────────

export function useToggleWorkflow() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, enabled }: { id: string; enabled: boolean }) => {
      const { error } = await supabase.from('ai_workflows').update({ enabled }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: qk.ai.workflows }) },
  })
}

// ─── Seed pre-built workflows for a tenant ───────────

export function useSeedWorkflows() {
  const { tenantId } = useAuthContext()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      if (!tenantId) return
      // Check if already seeded
      const { count } = await supabase.from('ai_workflows').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId)
      if ((count ?? 0) > 0) return // already seeded

      const inserts = PRE_BUILT_WORKFLOWS.map(w => ({
        tenant_id: tenantId,
        ...w,
      }))
      await supabase.from('ai_workflows').insert(inserts)
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: qk.ai.workflows }) },
  })
}
