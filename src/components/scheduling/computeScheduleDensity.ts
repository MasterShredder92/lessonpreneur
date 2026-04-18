import type { GridBlock } from '../../hooks/useScheduleGrid'
import { scheduleSlotKey } from '../../hooks/useScheduleGrid'
import { blockTimeRangeMinutes } from './computeConflicts'
import {
  countsTowardBookedLoad,
  isSlotUnavailableForTeacher,
  slotDurationMinutes,
} from './computeTeacherLoad'

/** Default ratio (booked/available) at or above which overbooking UI activates */
export const DEFAULT_SCHEDULE_OVERBOOKING_THRESHOLD = 0.85

export interface DayDensity {
  bookedMinutes: number
  availableMinutes: number
  /** bookedMinutes / availableMinutes, clamped [0,1] */
  ratio: number
  skipped: boolean
}

export function formatDayDensityTooltip(d: DayDensity): string {
  if (d.skipped) return ''
  const pct = Math.round(d.ratio * 100)
  const bh = (d.bookedMinutes / 60).toFixed(1)
  const ah = (d.availableMinutes / 60).toFixed(1)
  return `${bh}h booked of ${ah}h available (${pct}%)`
}

export function formatHighLoadTooltip(ratio: number): string {
  return `High load — schedule at ${Math.round(ratio * 100)}% capacity`
}

/**
 * Studio-wide schedule density (Tasks 27–30 availability + booked rules).
 * - dayDensity: summed booked / summed available minutes per date
 * - slotDensity: per date & slot key, fraction of teachers with a booked block starting in that slot
 */
export function computeScheduleDensity(
  blocks: GridBlock[],
  teachers: { id: string }[],
  dates: string[],
  timeSlots: string[],
  teacherAvailability: Map<string, { start: string; end: string }> | null | undefined,
): {
  dayDensity: Map<string, DayDensity>
  slotDensity: Map<string, Map<string, number>>
} {
  const slotMin = slotDurationMinutes(timeSlots)
  const dayDensity = new Map<string, DayDensity>()
  const slotDensity = new Map<string, Map<string, number>>()

  const bookedStartKeys = new Set<string>()
  for (const b of blocks) {
    if (!countsTowardBookedLoad(b)) continue
    const sk = scheduleSlotKey(b.start_time)
    bookedStartKeys.add(`${b.block_date}|${b.teacher_id}|${sk}`)
  }

  for (const date of dates) {
    let availableMinutes = 0
    for (const t of teachers) {
      for (const slot of timeSlots) {
        if (!isSlotUnavailableForTeacher(teacherAvailability, t.id, slot, date)) {
          availableMinutes += slotMin
        }
      }
    }

    let bookedMinutes = 0
    for (const b of blocks) {
      if (b.block_date !== date) continue
      if (!countsTowardBookedLoad(b)) continue
      const { start, end } = blockTimeRangeMinutes(b)
      bookedMinutes += end - start
    }

    if (availableMinutes <= 0) {
      dayDensity.set(date, { bookedMinutes, availableMinutes: 0, ratio: 0, skipped: true })
    } else {
      const ratio = Math.min(1, Math.max(0, bookedMinutes / availableMinutes))
      dayDensity.set(date, { bookedMinutes, availableMinutes, ratio, skipped: false })
    }

    const nTeachers = Math.max(1, teachers.length)
    const perSlot = new Map<string, number>()
    for (const slot of timeSlots) {
      const sk = scheduleSlotKey(slot)
      let bookedTeachers = 0
      for (const t of teachers) {
        if (bookedStartKeys.has(`${date}|${t.id}|${sk}`)) bookedTeachers += 1
      }
      perSlot.set(sk, bookedTeachers / nTeachers)
    }
    slotDensity.set(date, perSlot)
  }

  return { dayDensity, slotDensity }
}
