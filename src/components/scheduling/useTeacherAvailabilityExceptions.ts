import { useSyncExternalStore } from 'react'

export interface TeacherExceptionRange {
  start: string | null
  end: string | null
}

export interface TeacherOverrideRange {
  start: string
  end: string
}

export interface TeacherDateExceptions {
  blackout?: TeacherExceptionRange[]
  override?: TeacherOverrideRange[]
}

export type TeacherAvailabilityExceptionsMap = {
  [teacherId: string]: {
    [dateKey: string]: TeacherDateExceptions
  }
}

let exceptionsState: TeacherAvailabilityExceptionsMap = {}
const listeners = new Set<() => void>()

function emit(): void {
  for (const cb of listeners) cb()
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

function timeToMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number)
  return (h ?? 0) * 60 + (m ?? 0)
}

function getTeacherDateExceptionsEntry(
  teacherId: string,
  dateKey: string,
): TeacherDateExceptions | undefined {
  return exceptionsState[teacherId]?.[dateKey]
}

function ensureTeacherDateExceptionsEntry(
  teacherId: string,
  dateKey: string,
): TeacherDateExceptions {
  if (!exceptionsState[teacherId]) exceptionsState = { ...exceptionsState, [teacherId]: {} }
  if (!exceptionsState[teacherId][dateKey]) {
    exceptionsState = {
      ...exceptionsState,
      [teacherId]: { ...exceptionsState[teacherId], [dateKey]: {} },
    }
  }
  return exceptionsState[teacherId][dateKey]
}

function cleanupTeacherDateExceptions(teacherId: string, dateKey: string): void {
  const teacherEntry = exceptionsState[teacherId]
  if (!teacherEntry) return
  const day = teacherEntry[dateKey]
  if (!day) return
  const hasBlackouts = (day.blackout?.length ?? 0) > 0
  const hasOverrides = (day.override?.length ?? 0) > 0
  if (hasBlackouts || hasOverrides) return
  const nextTeacher = { ...teacherEntry }
  delete nextTeacher[dateKey]
  const nextState = { ...exceptionsState }
  if (Object.keys(nextTeacher).length === 0) {
    delete nextState[teacherId]
  } else {
    nextState[teacherId] = nextTeacher
  }
  exceptionsState = nextState
}

export function addBlackout(
  teacherId: string,
  dateKey: string,
  range: TeacherExceptionRange,
): void {
  const day = ensureTeacherDateExceptionsEntry(teacherId, dateKey)
  const blackout = day.blackout ? [...day.blackout] : []
  blackout.push(range)
  exceptionsState = {
    ...exceptionsState,
    [teacherId]: {
      ...exceptionsState[teacherId],
      [dateKey]: { ...day, blackout },
    },
  }
  emit()
}

export function removeBlackout(teacherId: string, dateKey: string, index: number): void {
  const day = getTeacherDateExceptionsEntry(teacherId, dateKey)
  if (!day?.blackout || index < 0 || index >= day.blackout.length) return
  const blackout = day.blackout.filter((_, i) => i !== index)
  exceptionsState = {
    ...exceptionsState,
    [teacherId]: {
      ...exceptionsState[teacherId],
      [dateKey]: {
        ...day,
        blackout: blackout.length > 0 ? blackout : undefined,
      },
    },
  }
  cleanupTeacherDateExceptions(teacherId, dateKey)
  emit()
}

export function addOverride(
  teacherId: string,
  dateKey: string,
  range: TeacherOverrideRange,
): void {
  const day = ensureTeacherDateExceptionsEntry(teacherId, dateKey)
  const override = day.override ? [...day.override] : []
  override.push(range)
  exceptionsState = {
    ...exceptionsState,
    [teacherId]: {
      ...exceptionsState[teacherId],
      [dateKey]: { ...day, override },
    },
  }
  emit()
}

export function removeOverride(teacherId: string, dateKey: string, index: number): void {
  const day = getTeacherDateExceptionsEntry(teacherId, dateKey)
  if (!day?.override || index < 0 || index >= day.override.length) return
  const override = day.override.filter((_, i) => i !== index)
  exceptionsState = {
    ...exceptionsState,
    [teacherId]: {
      ...exceptionsState[teacherId],
      [dateKey]: {
        ...day,
        override: override.length > 0 ? override : undefined,
      },
    },
  }
  cleanupTeacherDateExceptions(teacherId, dateKey)
  emit()
}

export function getExceptions(): TeacherAvailabilityExceptionsMap {
  return exceptionsState
}

function slotInRange(slot: string, range: { start: string; end: string }): boolean {
  const slotMin = timeToMinutes(slot)
  const startMin = timeToMinutes(range.start)
  const endMin = timeToMinutes(range.end)
  return slotMin >= startMin && slotMin < endMin
}

function overlapMinutes(
  startA: number,
  endA: number,
  startB: number,
  endB: number,
): boolean {
  return startA < endB && startB < endA
}

function normalizeEnd(start: number, end: number): number {
  if (end <= start) return end + 24 * 60
  return end
}

export function hasTeacherExceptionOnDate(teacherId: string, dateKey: string): boolean {
  const day = getTeacherDateExceptionsEntry(teacherId, dateKey)
  return Boolean((day?.blackout?.length ?? 0) > 0 || (day?.override?.length ?? 0) > 0)
}

export function hasAnyTeacherExceptionOnDate(
  dateKey: string,
  teacherIds?: string[],
): boolean {
  if (teacherIds && teacherIds.length > 0) {
    for (const tid of teacherIds) {
      if (hasTeacherExceptionOnDate(tid, dateKey)) return true
    }
    return false
  }
  for (const tid of Object.keys(exceptionsState)) {
    if (hasTeacherExceptionOnDate(tid, dateKey)) return true
  }
  return false
}

export function getTeacherDateExceptions(
  teacherId: string,
  dateKey: string,
): TeacherDateExceptions {
  return getTeacherDateExceptionsEntry(teacherId, dateKey) ?? {}
}

export function isTeacherOverrideAtSlot(
  teacherId: string,
  dateKey: string,
  slot: string,
): boolean {
  const day = getTeacherDateExceptionsEntry(teacherId, dateKey)
  if (!day?.override || day.override.length === 0) return false
  return day.override.some(range => slotInRange(slot, range))
}

export function isTeacherBlackoutAtSlot(
  teacherId: string,
  dateKey: string,
  slot: string,
): boolean {
  const day = getTeacherDateExceptionsEntry(teacherId, dateKey)
  if (!day?.blackout || day.blackout.length === 0) return false
  return day.blackout.some(range => {
    if (range.start == null || range.end == null) return true
    return slotInRange(slot, { start: range.start, end: range.end })
  })
}

export function getTeacherExceptionStateForSlot(
  teacherId: string,
  dateKey: string,
  slot: string,
): { blackout: boolean; override: boolean } {
  const override = isTeacherOverrideAtSlot(teacherId, dateKey, slot)
  const blackout = !override && isTeacherBlackoutAtSlot(teacherId, dateKey, slot)
  return { blackout, override }
}

export function isRangeBlockedByBlackout(
  teacherId: string,
  dateKey: string,
  start: string,
  end: string,
): boolean {
  const day = getTeacherDateExceptionsEntry(teacherId, dateKey)
  if (!day?.blackout || day.blackout.length === 0) return false
  const startMin = timeToMinutes(start)
  const endMin = normalizeEnd(startMin, timeToMinutes(end))
  for (const range of day.blackout) {
    if (range.start == null || range.end == null) {
      if (!day.override || day.override.length === 0) return true
      const fullyCoveredByOverrides = day.override.some(ov => {
        const ovStart = timeToMinutes(ov.start)
        const ovEnd = normalizeEnd(ovStart, timeToMinutes(ov.end))
        return startMin >= ovStart && endMin <= ovEnd
      })
      if (!fullyCoveredByOverrides) return true
      continue
    }
    const boStart = timeToMinutes(range.start)
    const boEnd = normalizeEnd(boStart, timeToMinutes(range.end))
    if (!overlapMinutes(startMin, endMin, boStart, boEnd)) continue
    const coveredByOverride = (day.override ?? []).some(ov => {
      const ovStart = timeToMinutes(ov.start)
      const ovEnd = normalizeEnd(ovStart, timeToMinutes(ov.end))
      return overlapMinutes(startMin, endMin, ovStart, ovEnd)
    })
    if (!coveredByOverride) return true
  }
  return false
}

export function useTeacherAvailabilityExceptions() {
  const exceptions = useSyncExternalStore(subscribe, getExceptions, getExceptions)
  return {
    exceptions,
    addBlackout,
    removeBlackout,
    addOverride,
    removeOverride,
    getExceptions,
  }
}
