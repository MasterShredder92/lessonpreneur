import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

/**
 * Subscribe to realtime events on schedule_blocks for the current location.
 * When any block changes (auto check-in, manual check-in, tally trigger after payment),
 * invalidates the schedule grid cache so the UI re-renders immediately.
 *
 * Cleans up the channel on unmount or when date/location changes — no leaks, no dupes.
 */
export function useScheduleRealtime(date: string | undefined, locationId: string | undefined) {
  const qc = useQueryClient()

  useEffect(() => {
    if (!date || !locationId) return

    const channelName = `schedule-blocks-rt-${date}-${locationId}`

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
          const row = payload.new as Record<string, any> | undefined
          if (row && row.block_date !== date) return

          qc.invalidateQueries({ queryKey: ['schedule-grid'] })
          qc.invalidateQueries({ queryKey: ['schedule-intelligence'] })
          qc.invalidateQueries({ queryKey: ['teachers-monthly-tally'] })
          qc.invalidateQueries({ queryKey: ['teacher-pay-summary'] })
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [date, locationId, qc])
}
