import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { qk } from '../lib/queryKeys'

export interface AiObservabilityFilters {
  dateFrom: string
  dateTo: string
  profileId: string
  routeContains: string
  source: string
  actionId: string
}

function dayStartIso(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00`)
  return d.toISOString()
}

function dayEndIso(dateStr: string): string {
  const d = new Date(`${dateStr}T23:59:59.999`)
  return d.toISOString()
}

function normalizeQuestion(text: string | null): string | null {
  if (!text?.trim()) return null
  return text.trim().replace(/\s+/g, ' ').slice(0, 2000)
}

export interface AiObservabilityReport {
  conversationCount: number
  userMessageCount: number
  topQuestions: { question: string; count: number }[]
  routeCounts: { route: string; count: number }[]
  actionSummary: {
    total: number
    success: number
    failed: number
    byAction: { actionId: string; success: number; failed: number }[]
  }
  recentConversations: Array<{
    id: string
    profile_id: string
    source: string
    client_route: string | null
    created_at: string
    displayName: string
  }>
  recentUserMessages: Array<{
    id: string
    content: string | null
    created_at: string
    conversation_id: string
    profile_id: string
    displayName: string
  }>
  recentActions: Array<{
    id: string
    action_id: string
    ok: boolean
    error_code: string | null
    created_at: string
    profile_id: string
    displayName: string
  }>
  feedbackSummary: {
    total: number
    thumbsUp: number
    thumbsDown: number
    /** +1 / -1 net (excludes neutral if any). */
    netSentiment: number
  }
  recentFeedback: Array<{
    id: string
    rating: number | null
    comment: string | null
    created_at: string
    profile_id: string
    displayName: string
    client_route: string | null
    source: string | null
  }>
}

const ROW_CAP = 4000

async function loadProfileNames(
  tenantId: string,
  ids: string[],
): Promise<Map<string, string>> {
  const uniq = [...new Set(ids)].filter(Boolean)
  const map = new Map<string, string>()
  if (uniq.length === 0) return map
  const chunk = 200
  for (let i = 0; i < uniq.length; i += chunk) {
    const part = uniq.slice(i, i + chunk)
    const { data, error } = await supabase
      .from('profiles')
      .select('id, first_name, last_name')
      .eq('tenant_id', tenantId)
      .in('id', part)
    if (error) continue
    for (const p of data ?? []) {
      const name = `${(p as { first_name?: string }).first_name ?? ''} ${(p as { last_name?: string }).last_name ?? ''}`.trim()
      map.set((p as { id: string }).id, name || '—')
    }
  }
  return map
}

export function useAiObservabilityReport(tenantId: string | null, filters: AiObservabilityFilters) {
  return useQuery({
    queryKey: qk.aiObservability.report(tenantId ?? '', filters),
    enabled: !!tenantId,
    staleTime: 60_000,
    queryFn: async (): Promise<AiObservabilityReport> => {
      if (!tenantId) throw new Error('tenant')

      const t0 = dayStartIso(filters.dateFrom)
      const t1 = dayEndIso(filters.dateTo)

      let conversationIdsFromMeta: string[] | null = null

      /** Source/route need a conversation-id set; profile alone uses column filters per table. */
      const needsConvIdFilter = Boolean(filters.source.trim()) || Boolean(filters.routeContains.trim())

      if (needsConvIdFilter) {
        let convBase = supabase
          .from('ai_conversations')
          .select('id')
          .eq('tenant_id', tenantId)
          .gte('created_at', t0)
          .lte('created_at', t1)
        if (filters.profileId) convBase = convBase.eq('profile_id', filters.profileId)
        if (filters.source.trim()) convBase = convBase.eq('source', filters.source.trim())
        if (filters.routeContains.trim()) {
          convBase = convBase.ilike('client_route', `%${filters.routeContains.trim()}%`)
        }
        const { data: convRows, error: cErr } = await convBase.limit(ROW_CAP)
        if (cErr) throw cErr
        conversationIdsFromMeta = (convRows ?? []).map((r: { id: string }) => r.id)
        if (conversationIdsFromMeta.length === 0) {
          return emptyReport()
        }
      }

      let msgQuery = supabase
        .from('ai_messages')
        .select('id, content, created_at, conversation_id, profile_id')
        .eq('tenant_id', tenantId)
        .eq('role', 'user')
        .gte('created_at', t0)
        .lte('created_at', t1)
      if (filters.profileId) msgQuery = msgQuery.eq('profile_id', filters.profileId)
      if (conversationIdsFromMeta) {
        msgQuery = msgQuery.in('conversation_id', conversationIdsFromMeta)
      }
      const { data: userMsgs, error: mErr } = await msgQuery
        .order('created_at', { ascending: false })
        .limit(ROW_CAP)
      if (mErr) throw mErr

      let convQuery = supabase
        .from('ai_conversations')
        .select('id, profile_id, source, client_route, created_at')
        .eq('tenant_id', tenantId)
        .gte('created_at', t0)
        .lte('created_at', t1)
      if (filters.profileId) convQuery = convQuery.eq('profile_id', filters.profileId)
      if (filters.source.trim()) convQuery = convQuery.eq('source', filters.source.trim())
      if (filters.routeContains.trim()) {
        convQuery = convQuery.ilike('client_route', `%${filters.routeContains.trim()}%`)
      }
      const { data: convs, error: convErr } = await convQuery
        .order('created_at', { ascending: false })
        .limit(ROW_CAP)
      if (convErr) throw convErr

      let actQuery = supabase
        .from('ai_action_logs')
        .select('id, action_id, ok, error_code, created_at, profile_id')
        .eq('tenant_id', tenantId)
        .gte('created_at', t0)
        .lte('created_at', t1)
      if (filters.profileId) actQuery = actQuery.eq('profile_id', filters.profileId)
      if (filters.actionId.trim()) actQuery = actQuery.eq('action_id', filters.actionId.trim())
      const { data: actions, error: aErr } = await actQuery
        .order('created_at', { ascending: false })
        .limit(ROW_CAP)
      if (aErr) throw aErr

      let fbQuery = supabase
        .from('ai_feedback')
        .select('id, rating, comment, created_at, profile_id, message_id, conversation_id')
        .eq('tenant_id', tenantId)
        .gte('created_at', t0)
        .lte('created_at', t1)
      if (filters.profileId) fbQuery = fbQuery.eq('profile_id', filters.profileId)
      if (conversationIdsFromMeta) {
        fbQuery = fbQuery.in('conversation_id', conversationIdsFromMeta)
      }
      const { data: feedbackRows, error: fErr } = await fbQuery
        .order('created_at', { ascending: false })
        .limit(ROW_CAP)
      if (fErr) throw fErr

      const fbConvIds = [
        ...new Set((feedbackRows ?? []).map((r: { conversation_id?: string | null }) => r.conversation_id).filter(Boolean)),
      ] as string[]
      let convMetaById = new Map<string, { client_route: string | null; source: string | null }>()
      if (fbConvIds.length > 0) {
        const { data: metaRows } = await supabase
          .from('ai_conversations')
          .select('id, client_route, source')
          .eq('tenant_id', tenantId)
          .in('id', fbConvIds)
        for (const row of metaRows ?? []) {
          const r = row as { id: string; client_route: string | null; source: string | null }
          convMetaById.set(r.id, { client_route: r.client_route, source: r.source })
        }
      }

      let thumbsUp = 0
      let thumbsDown = 0
      for (const f of feedbackRows ?? []) {
        const rt = (f as { rating: number | null }).rating
        if (rt === 1) thumbsUp++
        else if (rt === -1) thumbsDown++
      }
      const netSentiment = thumbsUp - thumbsDown

      const counts = new Map<string, number>()
      for (const row of userMsgs ?? []) {
        const q = normalizeQuestion((row as { content?: string | null }).content ?? null)
        if (!q) continue
        counts.set(q, (counts.get(q) ?? 0) + 1)
      }
      const topQuestions = [...counts.entries()]
        .map(([question, count]) => ({ question, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 25)

      const routeMap = new Map<string, number>()
      for (const c of convs ?? []) {
        const r = (c as { client_route?: string | null }).client_route?.trim() || '(no route)'
        routeMap.set(r, (routeMap.get(r) ?? 0) + 1)
      }
      const routeCounts = [...routeMap.entries()]
        .map(([route, count]) => ({ route, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 20)

      const byActionMap = new Map<string, { success: number; failed: number }>()
      let success = 0
      let failed = 0
      for (const a of actions ?? []) {
        const row = a as { ok: boolean; action_id: string }
        if (row.ok) success++
        else failed++
        const cur = byActionMap.get(row.action_id) ?? { success: 0, failed: 0 }
        if (row.ok) cur.success++
        else cur.failed++
        byActionMap.set(row.action_id, cur)
      }
      const byAction = [...byActionMap.entries()]
        .map(([actionId, v]) => ({ actionId, success: v.success, failed: v.failed }))
        .sort((a, b) => b.success + b.failed - (a.success + a.failed))

      const profileIds = [
        ...(convs ?? []).map((c: { profile_id: string }) => c.profile_id),
        ...(userMsgs ?? []).map((m: { profile_id: string }) => m.profile_id),
        ...(actions ?? []).map((a: { profile_id: string }) => a.profile_id),
        ...(feedbackRows ?? []).map((f: { profile_id: string }) => f.profile_id),
      ]
      const names = await loadProfileNames(tenantId, profileIds)

      const recentConversations = (convs ?? []).slice(0, 40).map((c: Record<string, unknown>) => ({
        id: c.id as string,
        profile_id: c.profile_id as string,
        source: c.source as string,
        client_route: (c.client_route as string | null) ?? null,
        created_at: c.created_at as string,
        displayName: names.get(c.profile_id as string) ?? '—',
      }))

      const recentUserMessages = (userMsgs ?? []).slice(0, 40).map((m: Record<string, unknown>) => ({
        id: m.id as string,
        content: (m.content as string | null) ?? null,
        created_at: m.created_at as string,
        conversation_id: m.conversation_id as string,
        profile_id: m.profile_id as string,
        displayName: names.get(m.profile_id as string) ?? '—',
      }))

      const recentActions = (actions ?? []).slice(0, 40).map((a: Record<string, unknown>) => ({
        id: a.id as string,
        action_id: a.action_id as string,
        ok: a.ok as boolean,
        error_code: (a.error_code as string | null) ?? null,
        created_at: a.created_at as string,
        profile_id: a.profile_id as string,
        displayName: names.get(a.profile_id as string) ?? '—',
      }))

      const recentFeedback = (feedbackRows ?? []).slice(0, 40).map((row: Record<string, unknown>) => {
        const cid = row.conversation_id as string | null
        const meta = cid ? convMetaById.get(cid) : undefined
        return {
          id: row.id as string,
          rating: (row.rating as number | null) ?? null,
          comment: (row.comment as string | null) ?? null,
          created_at: row.created_at as string,
          profile_id: row.profile_id as string,
          displayName: names.get(row.profile_id as string) ?? '—',
          client_route: meta?.client_route ?? null,
          source: meta?.source ?? null,
        }
      })

      return {
        conversationCount: (convs ?? []).length,
        userMessageCount: (userMsgs ?? []).length,
        topQuestions,
        routeCounts,
        actionSummary: {
          total: (actions ?? []).length,
          success,
          failed,
          byAction,
        },
        recentConversations,
        recentUserMessages,
        recentActions,
        feedbackSummary: {
          total: (feedbackRows ?? []).length,
          thumbsUp,
          thumbsDown,
          netSentiment,
        },
        recentFeedback,
      }
    },
  })
}

function emptyReport(): AiObservabilityReport {
  return {
    conversationCount: 0,
    userMessageCount: 0,
    topQuestions: [],
    routeCounts: [],
    actionSummary: { total: 0, success: 0, failed: 0, byAction: [] },
    recentConversations: [],
    recentUserMessages: [],
    recentActions: [],
    feedbackSummary: { total: 0, thumbsUp: 0, thumbsDown: 0, netSentiment: 0 },
    recentFeedback: [],
  }
}

export function useAiObservabilityTeamProfiles(tenantId: string | null) {
  return useQuery({
    queryKey: qk.aiObservability.teamProfiles(tenantId),
    enabled: !!tenantId,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      if (!tenantId) return []
      const { data, error } = await supabase
        .from('profiles')
        .select('id, first_name, last_name')
        .eq('tenant_id', tenantId)
        .order('first_name')
        .limit(500)
      if (error) throw error
      return (data ?? []).map((p: { id: string; first_name?: string; last_name?: string }) => ({
        id: p.id,
        label: `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim() || p.id,
      }))
    },
  })
}
