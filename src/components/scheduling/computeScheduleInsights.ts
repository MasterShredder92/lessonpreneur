import type { GridBlock } from '../../hooks/useScheduleGrid'
import { scheduleSlotKey } from '../../hooks/useScheduleGrid'
import type { TeacherDayLoad } from './computeTeacherLoad'
import type { DayDensity } from './computeScheduleDensity'
import { countsTowardBookedLoad } from './computeTeacherLoad'
import {
  getExceptions,
  getTeacherDateExceptions,
  isRangeBlockedByBlackout,
} from './useTeacherAvailabilityExceptions'

export type InsightIconKind = 'warning' | 'suggestion' | 'neutral'

/** DOM / scroll resolver contract (passed back to the panel host). */
export type InsightScrollToRef =
  | { mode: 'block'; blockId: string }
  | { mode: 'cell'; date: string; teacherId: string; slot: string }
  | { mode: 'day'; date: string }

export interface Insight {
  id: string
  icon: InsightIconKind
  text: string
  tooltip: string
  scrollToRef?: InsightScrollToRef
  scrollTo?: { teacherId: string; dateKey: string; slotIndex: number }
}

export interface ComputeScheduleInsightsInput {
  teacherLoads: Map<string, Map<string, TeacherDayLoad>>
  dayDensity: Map<string, DayDensity>
  slotDensity: Map<string, Map<string, number>>
  conflictSets: {
    teacherConflicts: Set<string>
    studentConflicts: Set<string>
    crossTeacherConflicts: Set<string>
    blackoutConflicts?: Set<string>
  }
  blocks: GridBlock[]
  teachers: { id: string; name: string }[]
  /** Dates included in this insight window (single day or multi-day range). */
  dates: string[]
  timeSlots: string[]
  formatTime: (t: string) => string
  /** When set (e.g. focus mode), only teacher load over/under insights use this list; density stays studio-wide. */
  teachersForLoadInsights?: { id: string; name: string }[]
}

export interface ScheduleInsightsResult {
  teacherOverCapacity: Insight[]
  teacherUnderCapacity: Insight[]
  dayOverCapacity: Insight[]
  dayUnderCapacity: Insight[]
  highDemandSlots: Insight[]
  lowDemandSlots: Insight[]
  conflictSuggestions: Insight[]
  moveSuggestions: Insight[]
  blackoutConflicts: Insight[]
  unusedOverrides: Insight[]
  highBlackoutDensity: Insight[]
}

const OVER = 0.85
const UNDER = 0.3
const HIGH_SLOT = 0.6
const LOW_SLOT = 0.2
const LIGHT_DAY = 0.4
const HIGH_BLACKOUT_DENSITY_THRESHOLD = 3

function weekdayDayLabel(iso: string): string {
  const d = new Date(`${iso}T12:00:00`)
  return d.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric' }).replace(',', '')
}

function teacherLabel(teachers: { id: string; name: string }[], id: string): string {
  return teachers.find(t => t.id === id)?.name ?? 'Teacher'
}

function blockByIdMap(blocks: GridBlock[]): Map<string, GridBlock> {
  const m = new Map<string, GridBlock>()
  for (const b of blocks) {
    if (b.block_id) m.set(b.block_id, b)
  }
  return m
}

function slotIndex(timeSlots: string[], slot: string): number {
  const k = scheduleSlotKey(slot)
  return timeSlots.findIndex(s => scheduleSlotKey(s) === k)
}

function scrollPayload(
  timeSlots: string[],
  teacherId: string,
  dateKey: string,
  slot: string,
): { teacherId: string; dateKey: string; slotIndex: number } {
  return {
    teacherId,
    dateKey,
    slotIndex: Math.max(0, slotIndex(timeSlots, slot)),
  }
}

function isTeachingStudentBlock(b: GridBlock): boolean {
  if (!b.student_id || !b.block_id) return false
  const t = b.block_type
  return t === 'student_session' || t === 'first_day' || t === 'last_day' || t === 'makeup_session' || t === 'sub' || (t === 'call_out' && b.is_family_callout)
}

function openBlockAt(
  blocks: GridBlock[],
  date: string,
  teacherId: string,
  slot: string,
): GridBlock | undefined {
  const sk = scheduleSlotKey(slot)
  return blocks.find(
    b =>
      b.block_date === date &&
      b.teacher_id === teacherId &&
      scheduleSlotKey(b.start_time) === sk &&
      b.block_type === 'open_time' &&
      b.status === 'available' &&
      !b.student_id,
  )
}

function firstTeacherBookedAtSlot(
  blocks: GridBlock[],
  teachers: { id: string }[],
  date: string,
  slot: string,
): string | null {
  const sk = scheduleSlotKey(slot)
  for (const t of teachers) {
    const hit = blocks.find(
      b =>
        b.block_date === date &&
        b.teacher_id === t.id &&
        scheduleSlotKey(b.start_time) === sk &&
        countsTowardBookedLoad(b),
    )
    if (hit) return t.id
  }
  return teachers[0]?.id ?? null
}

function firstTeacherOpenAtSlot(
  blocks: GridBlock[],
  teachers: { id: string }[],
  date: string,
  slot: string,
): string | null {
  for (const t of teachers) {
    if (openBlockAt(blocks, date, t.id, slot)) return t.id
  }
  return teachers[0]?.id ?? null
}

function firstBookedSlotForTeacher(
  blocks: GridBlock[],
  date: string,
  teacherId: string,
  timeSlots: string[],
): string {
  for (const slot of timeSlots) {
    const sk = scheduleSlotKey(slot)
    const hit = blocks.find(
      b =>
        b.block_date === date &&
        b.teacher_id === teacherId &&
        scheduleSlotKey(b.start_time) === sk &&
        countsTowardBookedLoad(b),
    )
    if (hit) return slot
  }
  return timeSlots[0] ?? '09:00'
}

/** Teachers who appear on at least one teaching block with this normalized instrument (same day window). */
function teachersWithInstrument(
  blocks: GridBlock[],
  dates: Set<string>,
  instrumentNorm: string,
): Set<string> {
  const s = new Set<string>()
  for (const b of blocks) {
    if (!dates.has(b.block_date)) continue
    if (!isTeachingStudentBlock(b)) continue
    const ins = b.instrument?.trim().toLowerCase()
    if (ins && ins === instrumentNorm) s.add(b.teacher_id)
  }
  return s
}

export function computeScheduleInsights(input: ComputeScheduleInsightsInput): ScheduleInsightsResult {
  const {
    teacherLoads,
    dayDensity,
    slotDensity,
    conflictSets,
    blocks,
    teachers,
    dates,
    timeSlots,
    formatTime,
    teachersForLoadInsights,
  } = input

  const loadTeachers = teachersForLoadInsights ?? teachers
  const dateSet = new Set(dates)
  const byId = blockByIdMap(blocks)

  const teacherOverCapacity: Insight[] = []
  const teacherUnderCapacity: Insight[] = []

  for (const t of loadTeachers) {
    for (const date of dates) {
      const day = teacherLoads.get(t.id)?.get(date)
      if (!day || day.skipped) continue
      const pct = Math.round(day.load * 100)
      const wd = weekdayDayLabel(date)
      if (day.load >= OVER) {
        const slot = firstBookedSlotForTeacher(blocks, date, t.id, timeSlots)
        teacherOverCapacity.push({
          id: `to-${t.id}-${date}`,
          icon: 'warning',
          text: `${t.name.split(' ')[0]} is over capacity on ${wd} (${pct}%)`,
          tooltip: `${t.name} is at ${pct}% capacity on ${wd}`,
          scrollToRef: { mode: 'cell', date, teacherId: t.id, slot },
          scrollTo: scrollPayload(timeSlots, t.id, date, slot),
        })
      } else if (day.load <= UNDER) {
        teacherUnderCapacity.push({
          id: `tu-${t.id}-${date}`,
          icon: 'neutral',
          text: `${t.name.split(' ')[0]} is lightly booked on ${wd} (${pct}%)`,
          tooltip: `${t.name} is at ${pct}% capacity on ${wd}`,
          scrollToRef: { mode: 'cell', date, teacherId: t.id, slot: timeSlots[0] ?? '09:00' },
          scrollTo: scrollPayload(timeSlots, t.id, date, timeSlots[0] ?? '09:00'),
        })
      }
    }
  }

  const dayOverCapacity: Insight[] = []
  const dayUnderCapacity: Insight[] = []
  for (const date of dates) {
    const d = dayDensity.get(date)
    if (!d || d.skipped) continue
    const pct = Math.round(d.ratio * 100)
    const dayName = new Date(`${date}T12:00:00`).toLocaleDateString('en-US', { weekday: 'long' })
    if (d.ratio >= OVER) {
      dayOverCapacity.push({
        id: `do-${date}`,
        icon: 'warning',
        text: `${dayName} is heavily booked (${pct}%)`,
        tooltip: `${dayName} is at ${pct}% studio capacity`,
        scrollToRef: { mode: 'day', date },
      })
    } else if (d.ratio <= LIGHT_DAY) {
      dayUnderCapacity.push({
        id: `du-${date}`,
        icon: 'neutral',
        text: `${dayName} is lightly booked (${pct}%)`,
        tooltip: `${dayName} is lightly booked (${pct}%)`,
        scrollToRef: { mode: 'day', date },
      })
    }
  }

  const highDemandSlots: Insight[] = []
  const lowDemandSlots: Insight[] = []
  for (const date of dates) {
    const per = slotDensity.get(date)
    if (!per) continue
    for (const slot of timeSlots) {
      const sk = scheduleSlotKey(slot)
      const r = per.get(sk) ?? 0
      const label = formatTime(slot)
      if (r >= HIGH_SLOT) {
        const tid = firstTeacherBookedAtSlot(blocks, teachers, date, slot)
        highDemandSlots.push({
          id: `hs-${date}-${sk}`,
          icon: 'warning',
          text: `${label} is heavily booked across teachers`,
          tooltip: `${label} is heavily booked across teachers`,
          scrollToRef: tid ? { mode: 'cell', date, teacherId: tid, slot } : undefined,
          scrollTo: tid ? scrollPayload(timeSlots, tid, date, slot) : undefined,
        })
      } else if (r <= LOW_SLOT) {
        const tidOpen = firstTeacherOpenAtSlot(blocks, teachers, date, slot)
        lowDemandSlots.push({
          id: `ls-${date}-${sk}`,
          icon: 'neutral',
          text: `${label} is a low-demand slot — consider shifting lessons`,
          tooltip: `${label} is lightly booked across teachers on ${weekdayDayLabel(date)}`,
          scrollToRef: tidOpen ? { mode: 'cell', date, teacherId: tidOpen, slot } : undefined,
          scrollTo: tidOpen ? scrollPayload(timeSlots, tidOpen, date, slot) : undefined,
        })
      }
    }
  }

  const conflictedIds = new Set<string>()
  for (const id of conflictSets.teacherConflicts) conflictedIds.add(id)
  for (const id of conflictSets.studentConflicts) conflictedIds.add(id)
  for (const id of conflictSets.crossTeacherConflicts) conflictedIds.add(id)
  for (const id of conflictSets.blackoutConflicts ?? []) conflictedIds.add(id)

  const conflictSuggestions: Insight[] = []
  for (const blockId of conflictedIds) {
    const b = byId.get(blockId)
    if (!b || !dateSet.has(b.block_date)) continue
    const tLabel = formatTime(b.start_time)
    const stu = b.student_name?.split(' ')[0] ?? 'Student'
    let text: string
    let tooltip: string
    if (conflictSets.studentConflicts.has(blockId)) {
      text = `Student double-booked near ${tLabel} — consider moving one of these lessons.`
      tooltip = `Overlapping lessons for the same student around ${tLabel}`
    } else if (conflictSets.blackoutConflicts?.has(blockId)) {
      text = `Session overlaps teacher blackout near ${tLabel} — move or remove this booking.`
      tooltip = 'Booked session intersects a teacher blackout exception'
    } else if (conflictSets.teacherConflicts.has(blockId)) {
      text = `Teacher double-booked — consider shifting ${stu}'s lesson.`
      tooltip = 'This teacher has overlapping blocks'
    } else {
      text = `Cross-teacher overlap at ${tLabel} for ${stu} — review both lessons.`
      tooltip = 'Same student scheduled with two teachers in the same slot'
    }
    conflictSuggestions.push({
      id: `cf-${blockId}`,
      icon: 'warning',
      text,
      tooltip,
      scrollToRef: { mode: 'block', blockId },
      scrollTo: scrollPayload(timeSlots, b.teacher_id, b.block_date, b.start_time),
    })
  }

  const moveSuggestions: Insight[] = []
  const blackoutConflictInsights: Insight[] = []
  const unusedOverrideInsights: Insight[] = []
  const highBlackoutDensity: Insight[] = []

  // Heuristic 1: move conflicted lesson to nearest low-demand slot (same teacher, open cell).
  for (const blockId of conflictedIds) {
    const b = byId.get(blockId)
    if (!b || !b.student_id || !dateSet.has(b.block_date)) continue
    if (!isTeachingStudentBlock(b)) continue
    const per = slotDensity.get(b.block_date)
    if (!per) continue
    const fromIdx = slotIndex(timeSlots, b.start_time)
    if (fromIdx < 0) continue
    let best: { idx: number; slot: string } | null = null
    let bestDist = Infinity
    for (let i = 0; i < timeSlots.length; i++) {
      const slot = timeSlots[i]
      const sk = scheduleSlotKey(slot)
      const dens = per.get(sk) ?? 1
      if (dens > LOW_SLOT) continue
      if (!openBlockAt(blocks, b.block_date, b.teacher_id, slot)) continue
      const dist = Math.abs(i - fromIdx)
      if (dist < bestDist) {
        bestDist = dist
        best = { idx: i, slot }
      }
    }
    if (best && scheduleSlotKey(best.slot) !== scheduleSlotKey(b.start_time)) {
      const stu = b.student_name?.split(' ')[0] ?? 'Student'
      moveSuggestions.push({
        id: `mv-low-${blockId}`,
        icon: 'suggestion',
        text: `Move ${stu} (${formatTime(b.start_time)}) to ${formatTime(best.slot)} to reduce conflict`,
        tooltip: `Target slot is low-demand (${Math.round((per.get(scheduleSlotKey(best.slot)) ?? 0) * 100)}% teachers booked)`,
        scrollToRef: { mode: 'cell', date: b.block_date, teacherId: b.teacher_id, slot: best.slot },
        scrollTo: scrollPayload(timeSlots, b.teacher_id, b.block_date, best.slot),
      })
    }
  }

  // Heuristic 2: swap two blocks between two overloaded teachers (same instrument if possible).
  const overloadTeachers = loadTeachers
    .map(t => ({ t, loads: dates.map(d => teacherLoads.get(t.id)?.get(d)).filter(Boolean) as TeacherDayLoad[] }))
    .filter(({ loads }) => loads.some(l => !l.skipped && l.load >= OVER))
    .map(({ t }) => t)

  if (overloadTeachers.length >= 2) {
    const t1 = overloadTeachers[0]
    const t2 = overloadTeachers[1]
    const pickBlock = (tid: string) =>
      blocks.find(
        b =>
          dateSet.has(b.block_date) &&
          b.teacher_id === tid &&
          isTeachingStudentBlock(b) &&
          (slotDensity.get(b.block_date)?.get(scheduleSlotKey(b.start_time)) ?? 0) >= HIGH_SLOT,
      )
    const b1 = pickBlock(t1.id)
    const b2 = pickBlock(t2.id)
    if (b1 && b2 && b1.block_date === b2.block_date) {
      const sameIns =
        b1.instrument &&
        b2.instrument &&
        b1.instrument.trim().toLowerCase() === b2.instrument.trim().toLowerCase()
      if (sameIns) {
        moveSuggestions.push({
          id: `mv-swap-${t1.id}-${t2.id}-${b1.block_date}`,
          icon: 'suggestion',
          text: `Consider swapping ${formatTime(b1.start_time)} / ${formatTime(b2.start_time)} between ${t1.name.split(' ')[0]} and ${t2.name.split(' ')[0]} to balance overload`,
          tooltip: 'Both teachers are over 85% load; swapping peak lessons can help',
          scrollToRef: b1.block_id ? { mode: 'block', blockId: b1.block_id } : undefined,
          scrollTo: scrollPayload(timeSlots, b1.teacher_id, b1.block_date, b1.start_time),
        })
      }
    }
  }

  // Heuristic 3: reassign to a less-loaded teacher teaching the same instrument.
  for (const b of blocks) {
    if (!dateSet.has(b.block_date)) continue
    if (!isTeachingStudentBlock(b) || !b.instrument?.trim()) continue
    const ins = b.instrument.trim().toLowerCase()
    const pool = teachersWithInstrument(blocks, dateSet, ins)
    if (pool.size < 2) continue
    const curLoad = teacherLoads.get(b.teacher_id)?.get(b.block_date)
    if (!curLoad || curLoad.skipped || curLoad.load < OVER) continue

    let bestAlt: { id: string; load: number } | null = null
    for (const tid of pool) {
      if (tid === b.teacher_id) continue
      const ld = teacherLoads.get(tid)?.get(b.block_date)
      if (!ld || ld.skipped) continue
      if (ld.load >= curLoad.load - 0.05) continue
      if (!openBlockAt(blocks, b.block_date, tid, b.start_time)) continue
      if (!bestAlt || ld.load < bestAlt.load) bestAlt = { id: tid, load: ld.load }
    }
    if (bestAlt && b.block_id) {
      moveSuggestions.push({
        id: `mv-re-${b.block_id}`,
        icon: 'suggestion',
        text: `Consider reassigning ${b.student_name?.split(' ')[0] ?? 'Student'} (${b.instrument}) to ${teacherLabel(teachers, bestAlt.id).split(' ')[0]} — lower load that day`,
        tooltip: `${teacherLabel(teachers, bestAlt.id)} has open time at ${formatTime(b.start_time)} and lower utilization`,
        scrollToRef: { mode: 'block', blockId: b.block_id },
        scrollTo: scrollPayload(timeSlots, b.teacher_id, b.block_date, b.start_time),
      })
    }
  }

  const exceptions = getExceptions()
  for (const b of blocks) {
    if (!b.block_id || !dateSet.has(b.block_date)) continue
    if (!countsTowardBookedLoad(b)) continue
    if (!isRangeBlockedByBlackout(b.teacher_id, b.block_date, b.start_time, b.end_time)) continue
    blackoutConflictInsights.push({
      id: `bo-conf-${b.block_id}`,
      icon: 'warning',
      text: `${teacherLabel(teachers, b.teacher_id).split(' ')[0]} has a blackout conflict at ${formatTime(b.start_time)}`,
      tooltip: 'Booked session overlaps a blackout exception',
      scrollToRef: { mode: 'block', blockId: b.block_id },
      scrollTo: scrollPayload(timeSlots, b.teacher_id, b.block_date, b.start_time),
    })
  }

  for (const t of teachers) {
    for (const date of dates) {
      const day = getTeacherDateExceptions(t.id, date)
      const overrides = day.override ?? []
      for (let i = 0; i < overrides.length; i++) {
        const range = overrides[i]
        const used = blocks.some(b => {
          if (b.teacher_id !== t.id || b.block_date !== date) return false
          if (!countsTowardBookedLoad(b)) return false
          return !(
            scheduleSlotKey(b.end_time) <= scheduleSlotKey(range.start) ||
            scheduleSlotKey(range.end) <= scheduleSlotKey(b.start_time)
          )
        })
        if (used) continue
        unusedOverrideInsights.push({
          id: `ov-unused-${t.id}-${date}-${i}`,
          icon: 'neutral',
          text: `${t.name.split(' ')[0]} has an unused override on ${weekdayDayLabel(date)} (${range.start}-${range.end})`,
          tooltip: 'Override exists but no booked session uses it',
          scrollToRef: { mode: 'cell', date, teacherId: t.id, slot: range.start },
          scrollTo: scrollPayload(timeSlots, t.id, date, range.start),
        })
      }
    }
  }

  for (const t of teachers) {
    let count = 0
    let firstDate: string | null = null
    for (const date of dates) {
      const bCount = exceptions[t.id]?.[date]?.blackout?.length ?? 0
      if (bCount > 0 && firstDate == null) firstDate = date
      count += bCount
    }
    if (count <= HIGH_BLACKOUT_DENSITY_THRESHOLD || firstDate == null) continue
    highBlackoutDensity.push({
      id: `bo-density-${t.id}-${firstDate}`,
      icon: 'warning',
      text: `${t.name.split(' ')[0]} has high blackout density in this range (${count})`,
      tooltip: `More than ${HIGH_BLACKOUT_DENSITY_THRESHOLD} blackout exceptions in visible range`,
      scrollToRef: { mode: 'cell', date: firstDate, teacherId: t.id, slot: timeSlots[0] ?? '09:00' },
      scrollTo: scrollPayload(timeSlots, t.id, firstDate, timeSlots[0] ?? '09:00'),
    })
  }

  const cap = <T,>(arr: T[], n: number) => (arr.length > n ? arr.slice(0, n) : arr)

  return {
    teacherOverCapacity: cap(teacherOverCapacity, 8),
    teacherUnderCapacity: cap(teacherUnderCapacity, 8),
    dayOverCapacity: cap(dayOverCapacity, 7),
    dayUnderCapacity: cap(dayUnderCapacity, 7),
    highDemandSlots: cap(highDemandSlots, 6),
    lowDemandSlots: cap(lowDemandSlots, 6),
    conflictSuggestions: cap(conflictSuggestions, 8),
    moveSuggestions: cap(moveSuggestions, 5),
    blackoutConflicts: cap(blackoutConflictInsights, 8),
    unusedOverrides: cap(unusedOverrideInsights, 8),
    highBlackoutDensity: cap(highBlackoutDensity, 5),
  }
}

export function countScheduleInsights(r: ScheduleInsightsResult): number {
  return (
    r.teacherOverCapacity.length +
    r.teacherUnderCapacity.length +
    r.dayOverCapacity.length +
    r.dayUnderCapacity.length +
    r.highDemandSlots.length +
    r.lowDemandSlots.length +
    r.conflictSuggestions.length +
    r.moveSuggestions.length +
    r.blackoutConflicts.length +
    r.unusedOverrides.length +
    r.highBlackoutDensity.length
  )
}
