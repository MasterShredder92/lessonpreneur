import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

export interface DayHours {
  day_of_week: number
  open_time: string
  close_time: string
  is_closed: boolean
}

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

function formatTime(time: string): string {
  const [h, m] = time.split(':').map(Number)
  const ampm = h >= 12 ? 'pm' : 'am'
  const hour = h % 12 || 12
  return m === 0 ? `${hour}${ampm}` : `${hour}:${m.toString().padStart(2, '0')}${ampm}`
}

export function formatHoursDisplay(hours: DayHours[]): string[] {
  if (!hours.length) return []
  const sorted = [...hours].sort((a, b) => a.day_of_week - b.day_of_week)
  const lines: string[] = []

  for (const h of sorted) {
    const day = DAY_NAMES[h.day_of_week]
    if (h.is_closed) {
      lines.push(`${day}: Closed`)
    } else {
      lines.push(`${day}: ${formatTime(h.open_time)} – ${formatTime(h.close_time)}`)
    }
  }
  return lines
}

export function useLocationHours(locationId: string | undefined) {
  const [hours, setHours] = useState<DayHours[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!locationId) return
    let cancelled = false
    setLoading(true)

    supabase
      .from('location_hours')
      .select('day_of_week, open_time, close_time, is_closed')
      .eq('location_id', locationId)
      .order('day_of_week')
      .then(({ data }: { data: DayHours[] | null }) => {
        if (cancelled) return
        setHours(data || [])
        setLoading(false)
      })

    return () => { cancelled = true }
  }, [locationId])

  return { hours, loading, formatted: formatHoursDisplay(hours) }
}
