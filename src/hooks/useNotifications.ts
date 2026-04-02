import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuthContext } from '../app/AuthContext'
import { useEffect } from 'react'

export interface Notification {
  id: string
  type: string
  title: string
  body: string | null
  route: string | null
  reference_id: string | null
  reference_type: string | null
  read: boolean
  created_at: string
}

const NOTIF_ICONS: Record<string, string> = {
  progress_update: '\uD83C\uDFB5',
  campaign: '\uD83D\uDCE3',
  task: '\u2705',
  alert: '\u26A0\uFE0F',
  system: '\u2699\uFE0F',
  reminder: '\u23F0',
  lead: '\uD83C\uDFAF',
}

export { NOTIF_ICONS }

// ─── Unread count ────────────────────────────────────

export function useUnreadCount() {
  const { profile } = useAuthContext()
  return useQuery<number>({
    queryKey: ['notifications-unread', profile?.id],
    enabled: !!profile?.id,
    refetchInterval: 30_000, // poll every 30s
    queryFn: async () => {
      const { count } = await supabase
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('profile_id', profile!.id)
        .eq('read', false)
      return count ?? 0
    },
  })
}

// ─── Recent notifications ────────────────────────────

export function useRecentNotifications(limit = 15) {
  const { profile } = useAuthContext()
  return useQuery<Notification[]>({
    queryKey: ['notifications-recent', profile?.id, limit],
    enabled: !!profile?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from('notifications')
        .select('*')
        .eq('profile_id', profile!.id)
        .order('created_at', { ascending: false })
        .limit(limit)
      return data ?? []
    },
  })
}

// ─── Mark one as read ────────────────────────────────

export function useMarkNotificationRead() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      await supabase.from('notifications').update({ read: true, read_at: new Date().toISOString() }).eq('id', id)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notifications-unread'] })
      qc.invalidateQueries({ queryKey: ['notifications-recent'] })
    },
  })
}

// ─── Mark all as read ────────────────────────────────

export function useMarkAllNotificationsRead() {
  const { profile } = useAuthContext()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      if (!profile?.id) return
      await supabase.from('notifications').update({ read: true, read_at: new Date().toISOString() })
        .eq('profile_id', profile.id).eq('read', false)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notifications-unread'] })
      qc.invalidateQueries({ queryKey: ['notifications-recent'] })
    },
  })
}

// ─── Create notification helper ──────────────────────

export async function createNotification(params: {
  tenantId: string
  profileId: string
  type: string
  title: string
  body?: string
  route?: string
  referenceId?: string
  referenceType?: string
}) {
  await supabase.from('notifications').insert({
    tenant_id: params.tenantId,
    profile_id: params.profileId,
    type: params.type,
    title: params.title,
    body: params.body ?? null,
    route: params.route ?? null,
    reference_id: params.referenceId ?? null,
    reference_type: params.referenceType ?? null,
  })
}

// ─── Realtime subscription hook ──────────────────────

export function useNotificationRealtime() {
  const { profile } = useAuthContext()
  const qc = useQueryClient()

  useEffect(() => {
    if (!profile?.id) return

    const channel = supabase
      .channel('notifications-realtime')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'notifications',
        filter: `profile_id=eq.${profile.id}`,
      }, () => {
        qc.invalidateQueries({ queryKey: ['notifications-unread'] })
        qc.invalidateQueries({ queryKey: ['notifications-recent'] })
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [profile?.id, qc])
}
