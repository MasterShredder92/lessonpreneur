import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { LocKey } from '../config/locations'

export interface LocationStats {
  stateRank: number
  studentsEnrolled: number
  studentsTaughtTotal: number
}

// Module-level cache so all pages share one fetch
let cache: Record<string, LocationStats> | null = null
let fetching = false
const listeners: Array<() => void> = []

function notify() { listeners.forEach(fn => fn()) }

async function fetchStats() {
  if (cache || fetching) return
  fetching = true
  const { data } = await supabase
    .from('locations')
    .select('name, state_rank, students_enrolled, students_taught_total')
  if (data) {
    const map: Record<string, LocationStats> = {}
    data.forEach((row: any) => {
      const key = (row.name as string).split(' ')[0].toLowerCase()
      map[key] = {
        stateRank: row.state_rank ?? 0,
        studentsEnrolled: row.students_enrolled ?? 0,
        studentsTaughtTotal: row.students_taught_total ?? 0,
      }
    })
    cache = map
  }
  fetching = false
  notify()
}

export function useLocationStats(loc: LocKey): LocationStats | null {
  const [, forceUpdate] = useState(0)

  useEffect(() => {
    const cb = () => forceUpdate(n => n + 1)
    listeners.push(cb)
    fetchStats()
    return () => { const i = listeners.indexOf(cb); if (i >= 0) listeners.splice(i, 1) }
  }, [])

  return cache?.[loc] ?? null
}
