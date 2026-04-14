import { useEffect, useCallback, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuthContext } from '../app/AuthContext'
import { qk } from '../lib/queryKeys'
import type { Notification } from './useNotifications'

// ─── Fetch notifications for current user ──────────────
function useNotificationList() {
  const { tenantId, profile } = useAuthContext()
  const profileId = profile?.id

  return useQuery({
    queryKey: qk.notificationCenter.list(tenantId, profileId ?? ''),
    queryFn: async () => {
      if (!tenantId || !profileId) return []
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('profile_id', profileId)
        .order('created_at', { ascending: false })
        .limit(50)
      if (error) throw error
      return (data ?? []) as Notification[]
    },
    enabled: !!tenantId && !!profileId,
    staleTime: 30_000,
  })
}

// ─── Mark single notification as read ──────────────────
function useMarkRead() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      await supabase
        .from('notifications')
        .update({ read: true })
        .eq('id', id)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.notificationCenter.all })
    },
  })
}

// ─── Mark all as read ──────────────────────────────────
function useMarkAllRead() {
  const { tenantId, profile } = useAuthContext()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      if (!tenantId || !profile?.id) return
      await supabase
        .from('notifications')
        .update({ read: true })
        .eq('tenant_id', tenantId)
        .eq('profile_id', profile.id)
        .eq('read', false)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.notificationCenter.all })
    },
  })
}

// ─── Browser notification permission ───────────────────
function requestBrowserPermission() {
  if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
    Notification.requestPermission()
  }
}

function showBrowserNotification(title: string, body?: string, route?: string) {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return
  const n = new Notification(title, {
    body: body ?? undefined,
    icon: '/lp-logo.png?v=2',
    tag: 'lp-notification',
  })
  if (route) {
    n.onclick = () => {
      window.focus()
      window.location.href = route
    }
  }
}

// ─── Realtime subscription for push ────────────────────
function useNotificationRealtime() {
  const { tenantId, profile } = useAuthContext()
  const qc = useQueryClient()
  const profileId = profile?.id
  const subscribed = useRef(false)

  useEffect(() => {
    if (!tenantId || !profileId || subscribed.current) return

    const channel = supabase
      .channel('notification-center')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `profile_id=eq.${profileId}`,
        },
        (payload) => {
          const row = payload.new as Notification & { title: string; body: string | null; route: string | null }
          // Refresh the list
          qc.invalidateQueries({ queryKey: qk.notificationCenter.all })
          // Show browser notification
          showBrowserNotification(row.title, row.body ?? undefined, row.route ?? undefined)
        }
      )
      .subscribe()

    subscribed.current = true

    return () => {
      supabase.removeChannel(channel)
      subscribed.current = false
    }
  }, [tenantId, profileId, qc])
}

// ─── Main hook ─────────────────────────────────────────
export function useNotificationCenter() {
  const list = useNotificationList()
  const markRead = useMarkRead()
  const markAllRead = useMarkAllRead()
  useNotificationRealtime()

  const requestPermission = useCallback(() => {
    requestBrowserPermission()
  }, [])

  const notifications = list.data ?? []
  const unreadCount = notifications.filter(n => !n.read).length

  return {
    notifications,
    unreadCount,
    isLoading: list.isLoading,
    markRead: markRead.mutate,
    markAllRead: markAllRead.mutate,
    requestPermission,
  }
}
