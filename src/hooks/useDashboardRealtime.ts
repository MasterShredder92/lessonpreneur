import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuthContext } from '../app/AuthContext'
import { qk } from '../lib/queryKeys'

/**
 * Subscribes to realtime changes on key tables and invalidates
 * Dashboard queries when relevant data changes.
 * Only active when the Dashboard is mounted.
 */
export function useDashboardRealtime() {
  const queryClient = useQueryClient()
  const { tenantId } = useAuthContext()

  useEffect(() => {
    if (!tenantId) return

    const channel = supabase
      .channel('dashboard-realtime')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'students',
        filter: `tenant_id=eq.${tenantId}`,
      }, () => {
        queryClient.invalidateQueries({ queryKey: qk.dashboard.all, exact: false })
        queryClient.invalidateQueries({ queryKey: qk.students.all })
      })
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'leads',
        filter: `tenant_id=eq.${tenantId}`,
      }, () => {
        queryClient.invalidateQueries({ queryKey: qk.dashboard.all, exact: false })
        queryClient.invalidateQueries({ queryKey: qk.leads.all })
      })
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'session_log',
        filter: `tenant_id=eq.${tenantId}`,
      }, () => {
        queryClient.invalidateQueries({ queryKey: qk.dashboard.all, exact: false })
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [tenantId, queryClient])
}
