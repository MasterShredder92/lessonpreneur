/**
 * Route analytics for ZiroWork — aggregate routing behavior data.
 *
 * Provides: route distribution, most-used skills, most-used agents,
 * temp agent creation vs retention, and routing failures.
 */
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

export interface RouteDistribution {
  direct: number
  skill: number
  agent: number
  temp_agent: number
  total: number
}

export interface SkillUsageRow {
  skill_key: string
  skill_name: string | null
  count: number
}

export interface AgentUsageRow {
  agent_id: string
  agent_name: string | null
  count: number
}

export interface TempAgentStats {
  created: number
  retained: number
  retired: number
}

export interface RouteAnalyticsData {
  distribution: RouteDistribution
  topSkills: SkillUsageRow[]
  topAgents: AgentUsageRow[]
  tempAgentStats: TempAgentStats
  failedCount: number
  totalRuns: number
}

export function useRouteAnalytics(tenantId: string | null) {
  return useQuery({
    queryKey: ['route-analytics', tenantId],
    enabled: !!tenantId,
    staleTime: 2 * 60 * 1000,
    queryFn: async (): Promise<RouteAnalyticsData> => {
      // Fetch all task runs for analytics (bounded to last 90 days)
      const ninetyDaysAgo = new Date()
      ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90)

      const { data: runs, error } = await supabase
        .from('ziro_task_runs')
        .select('route_chosen, skill_key, agent_used_id, created_temp_agent, retained_after_task, status')
        .eq('tenant_id', tenantId!)
        .gte('created_at', ninetyDaysAgo.toISOString())
        .order('created_at', { ascending: false })
        .limit(500)

      if (error) throw error
      const rows = runs ?? []

      // Route distribution
      const distribution: RouteDistribution = { direct: 0, skill: 0, agent: 0, temp_agent: 0, total: rows.length }
      for (const r of rows) {
        const route = (r.route_chosen as keyof RouteDistribution) ?? 'direct'
        if (route in distribution) distribution[route]++
      }

      // Top skills by usage
      const skillCounts = new Map<string, number>()
      for (const r of rows) {
        if (r.skill_key) skillCounts.set(r.skill_key, (skillCounts.get(r.skill_key) ?? 0) + 1)
      }
      const skillKeys = [...skillCounts.keys()]
      let skillNameMap: Record<string, string> = {}
      if (skillKeys.length > 0) {
        const { data: skills } = await supabase
          .from('ziro_skills')
          .select('key, name')
          .in('key', skillKeys)
          .eq('tenant_id', tenantId!)
          .limit(50)
        if (skills) skillNameMap = Object.fromEntries(skills.map(s => [s.key, s.name]))
      }
      const topSkills: SkillUsageRow[] = [...skillCounts.entries()]
        .map(([key, count]) => ({ skill_key: key, skill_name: skillNameMap[key] ?? null, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10)

      // Top agents by usage
      const agentCounts = new Map<string, number>()
      for (const r of rows) {
        if (r.agent_used_id) agentCounts.set(r.agent_used_id, (agentCounts.get(r.agent_used_id) ?? 0) + 1)
      }
      const agentIds = [...agentCounts.keys()]
      let agentNameMap: Record<string, string> = {}
      if (agentIds.length > 0) {
        const { data: agents } = await supabase
          .from('ziro_agents')
          .select('id, name')
          .in('id', agentIds)
          .eq('tenant_id', tenantId!)
          .limit(50)
        if (agents) agentNameMap = Object.fromEntries(agents.map(a => [a.id, a.name]))
      }
      const topAgents: AgentUsageRow[] = [...agentCounts.entries()]
        .map(([id, count]) => ({ agent_id: id, agent_name: agentNameMap[id] ?? null, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10)

      // Temp agent stats
      const tempRows = rows.filter(r => r.created_temp_agent)
      const tempAgentStats: TempAgentStats = {
        created: tempRows.length,
        retained: tempRows.filter(r => r.retained_after_task).length,
        retired: tempRows.filter(r => !r.retained_after_task).length,
      }

      // Failed count
      const failedCount = rows.filter(r => r.status === 'failed').length

      return {
        distribution,
        topSkills,
        topAgents,
        tempAgentStats,
        failedCount,
        totalRuns: rows.length,
      }
    },
  })
}
