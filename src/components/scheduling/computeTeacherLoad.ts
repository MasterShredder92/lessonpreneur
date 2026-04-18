import type { GridBlock } from '../../hooks/useScheduleGrid'
import { blockTimeRangeMinutes } from './computeConflicts'
import { getTeacherExceptionStateForSlot } from './useTeacherAvailabilityExceptions'

export interface TeacherDayLoad {
  availableMinutes: number
  bookedMinutes: number
  /** bookedMinutes / availableMinutes, clamped to [0, 1] */
  load: number
  /** true when availableMinutes === 0 — omit bars / use defaults */
  skipped: boolean
}

export function slotDurationMinutes(timeSlots: string[]): number {
  if (timeSlots.length < 2) return 30
  const [h0, m0] = timeSlots[0].split(':').map(Number)
  const [h1, m1] = timeSlots[1].split(':').map(Number)
  const a = (h0 ?? 0) * 60 + (m0 ?? 0)
  const b = (h1 ?? 0) * 60 + (m1 ?? 0)
  const d = b - a
  return d > 0 ? d : 30
}

/** Mirrors grid “outside availability” — true when this slot should not count as available capacity. */
export function isSlotUnavailableForTeacher(
  teacherAvailability: Map<string, { start: string; end: string }> | null | undefined,
  teacherId: string,
  time: string,
  dateKey?: string,
): boolean {
  if (dateKey) {
    const exception = getTeacherExceptionStateForSlot(teacherId, dateKey, time)
    if (exception.override) return false
    if (exception.blackout) return true
  }
  if (!teacherAvailability || !teacherAvailability.has(teacherId)) return false
  const avail = teacherAvailability.get(teacherId)!
  const [h, m] = time.split(':').map(Number)
  const mins = h * 60 + m
  const [sh, sm] = avail.start.split(':').map(Number)
  const [eh, em] = avail.end.split(':').map(Number)
  const startMins = sh * 60 + sm
  const endMins = eh * 60 + em
  if (mins < startMins) return true
  if (mins >= endMins) return true
  return false
}

/** Counts toward “booked load” — excludes open slots and teacher-wide callouts (not teaching). */
export function countsTowardBookedLoad(b: GridBlock): boolean {
  if (b.block_type === 'open_time' && b.status === 'available' && !b.student_id) return false
  if (b.block_type === 'call_out' && !b.is_family_callout) return false
  return true
}

export function computeTeacherDayLoad(
  teacherId: string,
  date: string,
  blocks: GridBlock[],
  timeSlots: string[],
  teacherAvailability: Map<string, { start: string; end: string }> | null | undefined,
): TeacherDayLoad {
  const slotMin = slotDurationMinutes(timeSlots)
  let availableMinutes = 0
  for (const slot of timeSlots) {
    if (!isSlotUnavailableForTeacher(teacherAvailability, teacherId, slot, date)) {
      availableMinutes += slotMin
    }
  }

  let bookedMinutes = 0
  for (const b of blocks) {
    if (b.teacher_id !== teacherId || b.block_date !== date) continue
    if (!countsTowardBookedLoad(b)) continue
    const { start, end } = blockTimeRangeMinutes(b)
    bookedMinutes += end - start
  }

  if (availableMinutes <= 0) {
    return { availableMinutes: 0, bookedMinutes, load: 0, skipped: true }
  }

  const load = Math.min(1, Math.max(0, bookedMinutes / availableMinutes))
  return { availableMinutes, bookedMinutes, load, skipped: false }
}

export function formatLoadTooltip(l: TeacherDayLoad): string {
  if (l.skipped) return ''
  const pct = Math.round(l.load * 100)
  const bh = (l.bookedMinutes / 60).toFixed(1)
  const ah = (l.availableMinutes / 60).toFixed(1)
  return `Booked ${bh}h of ${ah}h available (${pct}%)`
}

export function computeTeacherLoadsMap(
  teachers: { id: string }[],
  dates: string[],
  blocks: GridBlock[],
  timeSlots: string[],
  teacherAvailability: Map<string, { start: string; end: string }> | null | undefined,
): Map<string, Map<string, TeacherDayLoad>> {
  const m = new Map<string, Map<string, TeacherDayLoad>>()
  for (const t of teachers) {
    const inner = new Map<string, TeacherDayLoad>()
    for (const d of dates) {
      inner.set(d, computeTeacherDayLoad(t.id, d, blocks, timeSlots, teacherAvailability))
    }
    m.set(t.id, inner)
  }
  return m
}

export function averageLoadForDate(
  loads: Map<string, Map<string, TeacherDayLoad>>,
  teachers: { id: string }[],
  date: string,
): { avg: number; skippedAll: boolean } {
  let sum = 0
  let n = 0
  for (const t of teachers) {
    const l = loads.get(t.id)?.get(date)
    if (!l || l.skipped) continue
    sum += l.load
    n++
  }
  if (n === 0) return { avg: 0, skippedAll: true }
  return { avg: sum / n, skippedAll: false }
}

export function formatAverageLoadTooltip(avg: number): string {
  return `Average teacher load: ${Math.round(avg * 100)}%`
}

/** Row tint alpha from load [0,1] — keep subtle; heatmap/conflict sit above via stacking. */
export function teacherRowTintBackground(load: number, skipped: boolean): string | undefined {
  if (skipped) return undefined
  const a = 0.05 + 0.1 * Math.min(1, Math.max(0, load))
  return `hsla(210, 90%, 60%, ${a})`
}
