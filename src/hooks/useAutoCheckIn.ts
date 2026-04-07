import { useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

const SYSTEM_USER_ID = '00000000-0000-0000-0000-000000000099'
const TENANT_ID = '00000000-0000-0000-0000-000000000001'
const INTERVAL_MS = 60_000

function getCentralTime(): { hours: number; minutes: number; dateStr: string } {
  const now = new Date()
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: 'numeric', minute: 'numeric', hour12: false,
  }).formatToParts(now)

  const get = (type: string) => parts.find(p => p.type === type)?.value ?? '0'
  const hours = parseInt(get('hour'))
  const minutes = parseInt(get('minute'))
  const dateStr = `${get('year')}-${get('month')}-${get('day')}`
  return { hours, minutes, dateStr }
}

function timeToMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}

export function useAutoCheckIn(locationId: string, selectedDate: Date) {
  const qc = useQueryClient()
  const running = useRef(false)

  useEffect(() => {
    const selStr = selectedDate.toISOString().split('T')[0]

    async function tick() {
      if (running.current) return
      running.current = true
      try {
        const ct = getCentralTime()
        // Only run when viewing today
        if (selStr !== ct.dateStr) return
        const nowMinutes = ct.hours * 60 + ct.minutes

        // Find ended, unchecked sessions
        const { data: blocks } = await supabase
          .from('schedule_blocks')
          .select('id, end_time')
          .eq('block_date', ct.dateStr)
          .eq('location_id', locationId)
          .eq('tenant_id', TENANT_ID)
          .eq('checked_in', false)
          .eq('fifth_week', false)
          .eq('status', 'booked')
          .not('student_id', 'is', null)
          .in('block_type', ['student_session', 'first_day', 'last_day'])

        if (!blocks || blocks.length === 0) return

        const eligible = blocks.filter((b: any) => timeToMinutes(b.end_time) <= nowMinutes)
        if (eligible.length === 0) return

        let checked = 0
        for (const block of eligible) {
          try {
            await supabase.rpc('check_in_block', {
              p_block_id: block.id,
              p_action: 'check_in',
              p_user_id: SYSTEM_USER_ID,
            })
            checked++
          } catch (err) {
            // Individual block failures don't stop the batch
            console.warn('[AutoCheckIn] Failed for block', block.id, err)
          }
        }

        if (checked > 0) {
          console.log(`[AutoCheckIn] Auto-checked ${checked} session(s)`)
          qc.invalidateQueries({ queryKey: ['schedule-grid'] })
          qc.invalidateQueries({ queryKey: ['schedule-intelligence'] })
          qc.invalidateQueries({ queryKey: ['teachers-monthly-tally'] })
          qc.invalidateQueries({ queryKey: ['teacher-pay-summary'] })
        }
      } finally {
        running.current = false
      }
    }

    // Check if viewing today before setting up interval
    const ct = getCentralTime()
    if (selStr !== ct.dateStr) return

    // Run immediately, then every 60s
    tick()
    const id = setInterval(tick, INTERVAL_MS)
    return () => clearInterval(id)
  }, [locationId, selectedDate, qc])
}
