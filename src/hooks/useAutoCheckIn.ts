import { useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { qk } from '../lib/queryKeys'

const SYSTEM_USER_ID = '00000000-0000-0000-0000-000000000099'
const TENANT_ID = '00000000-0000-0000-0000-000000000001'
const INTERVAL_MS = 60_000

/**
 * Module-level dedup set — survives across re-renders and StrictMode double-fires.
 * Once a block ID is in here, we never call check_in_block for it again this session.
 */
const attemptedBlockIds = new Set<string>()

/** Block types eligible for auto check-in */
const AUTO_CHECK_IN_TYPES: string[] = [
  'student_session',
  'first_day',
  'last_day',
  'call_out',
  'meet_greet',
  'sub',
  'virtual',
  'makeup_session',
  'teacher_training',
]

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
    if (!locationId) return

    const selStr = selectedDate.toISOString().split('T')[0]

    async function tick() {
      if (running.current) return
      running.current = true
      try {
        const ct = getCentralTime()
        if (selStr !== ct.dateStr) return
        const nowMinutes = ct.hours * 60 + ct.minutes

        // Fetch unchecked blocks — double-filter: DB-side AND client-side
        const { data: blocks } = await supabase
          .from('schedule_blocks')
          .select('id, end_time, checked_in')
          .eq('block_date', ct.dateStr)
          .eq('location_id', locationId)
          .eq('tenant_id', TENANT_ID)
          .eq('checked_in', false)
          .eq('fifth_week', false)
          .eq('status', 'booked')
          .in('block_type', AUTO_CHECK_IN_TYPES)

        if (!blocks || blocks.length === 0) return

        const eligible = blocks.filter((b: any) => {
          if (b.checked_in) return false
          if (attemptedBlockIds.has(b.id)) return false
          return timeToMinutes(b.end_time) <= nowMinutes
        })

        if (eligible.length === 0) return

        let checked = 0
        for (const block of eligible) {
          attemptedBlockIds.add(block.id)
          try {
            const { data } = await supabase.rpc('check_in_block', {
              p_block_id: block.id,
              p_action: 'check_in',
              p_user_id: SYSTEM_USER_ID,
            })
            if (data?.ok) checked++
          } catch {
            // Individual failures don't stop the batch
          }
        }

        if (checked > 0) {
          qc.invalidateQueries({ queryKey: qk.schedule.all })
          qc.invalidateQueries({ queryKey: qk.schedule.intelligence })
          qc.invalidateQueries({ queryKey: qk.teachers.monthlyTally })
          qc.invalidateQueries({ queryKey: qk.teachers.paySummary })
        }
      } finally {
        running.current = false
      }
    }

    const ct = getCentralTime()
    if (selStr !== ct.dateStr) return

    tick()
    const id = setInterval(tick, INTERVAL_MS)
    return () => clearInterval(id)
  }, [locationId, selectedDate, qc])
}
