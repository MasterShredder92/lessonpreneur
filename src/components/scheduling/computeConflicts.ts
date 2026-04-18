import type { GridBlock } from '../../hooks/useScheduleGrid'
import { scheduleSlotKey } from '../../hooks/useScheduleGrid'
import { isRangeBlockedByBlackout } from './useTeacherAvailabilityExceptions'

function timeToMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number)
  return (h ?? 0) * 60 + (m ?? 0)
}

/** Half-open style range in minutes from midnight; end may exceed 1440 if block crosses midnight. */
export function blockTimeRangeMinutes(block: GridBlock): { start: number; end: number } {
  const start = timeToMinutes(block.start_time)
  let end = timeToMinutes(block.end_time)
  if (end <= start) end += 24 * 60
  return { start, end }
}

export function rangesOverlap(a: GridBlock, b: GridBlock): boolean {
  if (a.block_date !== b.block_date) return false
  const ra = blockTimeRangeMinutes(a)
  const rb = blockTimeRangeMinutes(b)
  return ra.start < rb.end && rb.start < ra.end
}

function isPersistedBlock(b: GridBlock): boolean {
  return Boolean(b.block_id)
}

/**
 * Client-side conflict sets (block_id). Open-time / synthetic rows are ignored.
 * - teacherConflicts: same teacher, overlapping ranges on one date
 * - studentConflicts: same student, overlapping ranges on one date (any teachers)
 * - crossTeacherConflicts: same student + same start slot, different teachers
 */
export function computeConflicts(blocks: GridBlock[]): {
  teacherConflicts: Set<string>
  studentConflicts: Set<string>
  crossTeacherConflicts: Set<string>
  blackoutConflicts: Set<string>
} {
  const teacherConflicts = new Set<string>()
  const studentConflicts = new Set<string>()
  const crossTeacherConflicts = new Set<string>()
  const blackoutConflicts = new Set<string>()

  const byDate = new Map<string, GridBlock[]>()
  for (const b of blocks) {
    if (!isPersistedBlock(b)) continue
    if (!byDate.has(b.block_date)) byDate.set(b.block_date, [])
    byDate.get(b.block_date)!.push(b)
  }

  for (const [, list] of byDate) {
    const persisted = list.filter(isPersistedBlock)
    for (const b of persisted) {
      if (
        isRangeBlockedByBlackout(
          b.teacher_id,
          b.block_date,
          scheduleSlotKey(b.start_time),
          scheduleSlotKey(b.end_time),
        )
      ) {
        blackoutConflicts.add(b.block_id)
      }
    }

    // C — same student, same calendar slot start, different teachers
    const slotStudentMap = new Map<string, GridBlock[]>()
    for (const b of persisted) {
      if (!b.student_id) continue
      const k = `${b.block_date}|${scheduleSlotKey(b.start_time)}|${b.student_id}`
      if (!slotStudentMap.has(k)) slotStudentMap.set(k, [])
      slotStudentMap.get(k)!.push(b)
    }
    for (const [, group] of slotStudentMap) {
      const teachers = new Set(group.map(g => g.teacher_id))
      if (teachers.size >= 2) {
        for (const b of group) crossTeacherConflicts.add(b.block_id)
      }
    }

    // A — teacher double-booking (overlapping ranges)
    const byTeacher = new Map<string, GridBlock[]>()
    for (const b of persisted) {
      if (!byTeacher.has(b.teacher_id)) byTeacher.set(b.teacher_id, [])
      byTeacher.get(b.teacher_id)!.push(b)
    }
    for (const [, g] of byTeacher) {
      for (let i = 0; i < g.length; i++) {
        for (let j = i + 1; j < g.length; j++) {
          if (rangesOverlap(g[i], g[j])) {
            teacherConflicts.add(g[i].block_id)
            teacherConflicts.add(g[j].block_id)
          }
        }
      }
    }

    // B — student double-booking (overlapping ranges, any teachers)
    const byStudent = new Map<string, GridBlock[]>()
    for (const b of persisted) {
      if (!b.student_id) continue
      if (!byStudent.has(b.student_id)) byStudent.set(b.student_id, [])
      byStudent.get(b.student_id)!.push(b)
    }
    for (const [, g] of byStudent) {
      for (let i = 0; i < g.length; i++) {
        for (let j = i + 1; j < g.length; j++) {
          if (rangesOverlap(g[i], g[j])) {
            studentConflicts.add(g[i].block_id)
            studentConflicts.add(g[j].block_id)
          }
        }
      }
    }
  }

  return { teacherConflicts, studentConflicts, crossTeacherConflicts, blackoutConflicts }
}

export function conflictTooltip(
  blockId: string,
  teacherConflicts: Set<string>,
  studentConflicts: Set<string>,
  crossTeacherConflicts: Set<string>,
  blackoutConflicts?: Set<string>,
): string | undefined {
  if (!blockId) return undefined
  if (blackoutConflicts?.has(blockId)) return 'Teacher blackout conflict (session overlaps blackout)'
  if (crossTeacherConflicts.has(blockId)) return 'Cross-teacher conflict (same student, same slot)'
  if (teacherConflicts.has(blockId)) return 'Teacher double-booked (overlapping blocks)'
  if (studentConflicts.has(blockId)) return 'Student double-booked (overlapping blocks)'
  return undefined
}
