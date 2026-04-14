/**
 * Hook for paginated task run history with routing metadata.
 * Shows what Star did: direct, skill, agent, or temp_agent routing.
 */
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { qk } from '../lib/queryKeys'

export interface TaskHistoryRow {
  id: string
  status: string
  classification: string
  intent_summary: string | null
  skill_key: string | null
  route_chosen: string | null
  agent_used_id: string | null
  created_temp_agent: boolean
  retained_after_task: boolean
  result_summary: string | null
  routing_explanation: string | null
  error_text: string | null
  created_at: string
  completed_at: string | null
  // Joined
  skill_name?: string | null
  agent_name?: string | null
}

export function useTaskHistory(
  tenantId: string | null,
  filters?: { route?: string; status?: string; page?: number },
) {
  const page = filters?.page ?? 0
  const pageSize = 30

  return useQuery({
    queryKey: [...qk.taskRuns.list(tenantId), filters?.route, filters?.status, page],
    enabled: !!tenantId,
    queryFn: async () => {
      let query = supabase
        .from('ziro_task_runs')
        .select(`
          id, status, classification, intent_summary, skill_key,
          route_chosen, agent_used_id, created_temp_agent, retained_after_task,
          result_summary, routing_explanation, error_text, created_at, completed_at
        `, { count: 'exact' })
        .eq('tenant_id', tenantId!)
        .order('created_at', { ascending: false })
        .range(page * pageSize, (page + 1) * pageSize - 1)

      if (filters?.route) {
        query = query.eq('route_chosen', filters.route)
      }
      if (filters?.status) {
        query = query.eq('status', filters.status)
      }

      const { data, error, count } = await query

      if (error) throw error

      // Enrich with skill/agent names
      const rows = (data ?? []) as TaskHistoryRow[]
      const skillKeys = [...new Set(rows.filter(r => r.skill_key).map(r => r.skill_key!))]
      const agentIds = [...new Set(rows.filter(r => r.agent_used_id).map(r => r.agent_used_id!))]

      let skillMap: Record<string, string> = {}
      let agentMap: Record<string, string> = {}

      if (skillKeys.length > 0) {
        const { data: skills } = await supabase
          .from('ziro_skills')
          .select('key, name')
          .in('key', skillKeys)
          .eq('tenant_id', tenantId!)
          .limit(50)
        if (skills) {
          skillMap = Object.fromEntries(skills.map(s => [s.key, s.name]))
        }
      }

      if (agentIds.length > 0) {
        const { data: agents } = await supabase
          .from('ziro_agents')
          .select('id, name')
          .in('id', agentIds)
          .eq('tenant_id', tenantId!)
          .limit(50)
        if (agents) {
          agentMap = Object.fromEntries(agents.map(a => [a.id, a.name]))
        }
      }

      return {
        rows: rows.map(r => ({
          ...r,
          skill_name: r.skill_key ? skillMap[r.skill_key] ?? null : null,
          agent_name: r.agent_used_id ? agentMap[r.agent_used_id] ?? null : null,
        })),
        total: count ?? 0,
        page,
        pageSize,
      }
    },
  })
}
