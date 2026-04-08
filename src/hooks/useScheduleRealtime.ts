import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

/**
 * Subscribe to realtime UPDATE events on schedule_blocks for the current location.
 * When any block changes (auto check-in, manual check-in, tally trigger after payment),
 * invalidates the schedule grid cache so the UI re-renders immediately.
 *
 * Cleans up the channel on unmount or when date/location changes — no leaks, no dupes.
 */
export function useScheduleRealtime(date: string | undefined, locationId: string | undefined) {
  const qc = useQueryClient()

  useEffect(() => {
    if (!date || !locationId) return

    console.log('[Realtime] Subscribing to schedule_blocks', { date, location: locationId })

    const channelName = `schedule-blocks-rt-${date}-${locationId}`

    // Filter on location_id (uuid) — Supabase realtime supports eq filters on any column.
    // We filter by location rather than date because location_id is the tighter scope
    // and we do a client-side date check on the payload.
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'schedule_blocks',
          filter: `location_id=eq.${locationId}`,
        },
        (payload) => {
          console.log('[Realtime] Event received', payload.eventType, payload.new)

          // Client-side date filter — only react to changes for the current date
          const row = payload.new as Record<string, any> | undefined
          if (row && row.block_date !== date) return

          qc.invalidateQueries({ queryKey: ['schedule-grid'] })
          qc.invalidateQueries({ queryKey: ['schedule-intelligence'] })
          qc.invalidateQueries({ queryKey: ['teachers-monthly-tally'] })
          qc.invalidateQueries({ queryKey: ['teacher-pay-summary'] })
        }
      )
      .subscribe((status, err) => {
        console.log('[Realtime] Channel status:', status, err ?? '')
      })

    return () => {
      console.log('[Realtime] Unsubscribing', channelName)
      supabase.removeChannel(channel)
    }
  }, [date, locationId, qc])
}
