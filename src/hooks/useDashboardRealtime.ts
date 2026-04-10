import { useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuthContext } from '../app/AuthContext'
import { qk } from '../lib/queryKeys'

/**
 * Subscribes to realtime changes on key tables and invalidates
 * Dashboard queries when relevant data changes.
 * Debounced to 5 seconds to prevent rapid-fire re-queries
 * when multiple rows change in quick succession.
 *
 * Only invalidates specific query keys — NOT broad prefix matches.
 */
export function useDashboardRealtime() {
  const queryClient = useQueryClient()
  const { tenantId } = useAuthContext()
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingKeys = useRef<Set<readonly string[]>>(new Set())

  useEffect(() => {
    if (!tenantId) return

    const DEBOUNCE_MS = 5000

    const flush = () => {
      // Invalidate the single dashboard RPC — exact match only
      queryClient.invalidateQueries({ queryKey: qk.dashboard.all })
      // Also invalidate any page-level keys that were queued
      for (const key of pendingKeys.current) {
        queryClient.invalidateQueries({ queryKey: key })
      }
      pendingKeys.current.clear()
      timerRef.current = null
    }

    const scheduleInvalidation = (extraKey?: readonly string[]) => {
      if (extraKey) pendingKeys.current.add(extraKey)
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(flush, DEBOUNCE_MS)
    }

    const channel = supabase
      .channel('dashboard-realtime')
      // Students: only care about status changes (INSERT/UPDATE), not every field edit
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'students',
        filter: `tenant_id=eq.${tenantId}`,
      }, () => {
        scheduleInvalidation(qk.students.all)
      })
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'students',
        filter: `tenant_id=eq.${tenantId}`,
      }, () => {
        scheduleInvalidation(qk.students.all)
      })
      // Leads: new leads matter most for dashboard counts
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'leads',
        filter: `tenant_id=eq.${tenantId}`,
      }, () => {
        scheduleInvalidation(qk.leads.all)
      })
      // Session log: check-in events
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'session_log',
        filter: `tenant_id=eq.${tenantId}`,
      }, () => {
        scheduleInvalidation()
      })
      .subscribe()

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
      supabase.removeChannel(channel)
    }
  }, [tenantId, queryClient])
}
