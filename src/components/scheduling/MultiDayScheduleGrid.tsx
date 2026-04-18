/**
 * Week-at-a-glance multi-day grid (2–7 days). Read-only cells (click handlers only;
 * drag/resize live on the single-day MobileSchedule grid).
 */
import { useRef, useEffect, useMemo } from 'react'
import { ArrowDownToLine, Lock } from 'lucide-react'
import type { GridBlock } from '../../hooks/useScheduleGrid'
import { scheduleSlotKey } from '../../hooks/useScheduleGrid'
import { getInstrumentEmoji } from '../../utils/instrumentEmoji'
import { computeConflicts, conflictTooltip } from './computeConflicts'
import {
  averageLoadForDate,
  computeTeacherLoadsMap,
  formatAverageLoadTooltip,
  teacherRowTintBackground,
} from './computeTeacherLoad'
import {
  computeScheduleDensity,
  DEFAULT_SCHEDULE_OVERBOOKING_THRESHOLD,
  formatDayDensityTooltip,
  formatHighLoadTooltip,
} from './computeScheduleDensity'

const BLOCK_COLORS: Record<string, { bg: string; dark: boolean }> = {
  student_session: { bg: '#FFB800', dark: false },
  first_day: { bg: '#38BDF8', dark: false },
  meet_greet: { bg: '#D4226A', dark: true },
  sub: { bg: '#22C55E', dark: false },
  call_out: { bg: '#F97316', dark: false },
  makeup_session: { bg: '#FF6B6B', dark: true },
  last_day: { bg: '#EF4444', dark: true },
  open_time: { bg: 'rgba(255,255,255,0.04)', dark: true },
  not_bookable: { bg: '#363656', dark: true },
  teacher_training: { bg: '#6366F1', dark: true },
}

const TEACHER_COL_W = 96
const DAY_MIN_W = 240
const ROW_H = 44
/** Room for day label + optional “Today” badge + schedule density + aggregate load bar */
const HEADER_DAY_H = 68
const HEADER_TIME_H = 26
const SURFACE = 'rgba(12,11,22,0.98)'
const SURFACE_TINT = 'rgba(24,22,40,0.92)'

function formatDayHeader(isoDate: string): string {
  const d = new Date(isoDate + 'T12:00:00')
  return d.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric' }).replace(',', '')
}

function localTodayIso(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function teacherAccentBorder(teacherId: string): string {
  let h = 0
  for (let i = 0; i < teacherId.length; i++) h = (h * 31 + teacherId.charCodeAt(i)) >>> 0
  const hue = h % 360
  return `hsl(${hue} 62% 52%)`
}

function blockMayContinuePastMidnight(block: GridBlock): boolean {
  const p = (s: string) => {
    const [a, b] = s.split(':').map(Number)
    return (a ?? 0) * 60 + (b ?? 0)
  }
  const sm = p(block.start_time)
  const em = p(block.end_time)
  return em > 0 && em <= sm
}

function isTeacherUnavailable(
  teacherAvailability: Map<string, { start: string; end: string }> | null | undefined,
  teacherId: string,
  time: string,
): string | null {
  if (!teacherAvailability?.has(teacherId)) return null
  const avail = teacherAvailability.get(teacherId)!
  const [h, m] = time.split(':').map(Number)
  const mins = h * 60 + m
  const [sh, sm] = avail.start.split(':').map(Number)
  const [eh, em] = avail.end.split(':').map(Number)
  const startMins = sh * 60 + sm
  const endMins = eh * 60 + em
  if (mins < startMins) {
    const startH = sh > 12 ? sh - 12 : sh
    const startAmPm = sh >= 12 ? 'pm' : 'am'
    return `Not until ${startH}:${String(sm).padStart(2, '0')}${startAmPm}`
  }
  if (mins >= endMins) return 'Done'
  return null
}

/** Open bookable grid cell and within optional availability hours (for heatmap density). */
function isTeacherAvailableAtSlot(
  block: GridBlock | undefined,
  teacherId: string,
  slot: string,
  teacherAvailability: Map<string, { start: string; end: string }> | null | undefined,
): boolean {
  if (!block || block.block_type !== 'open_time' || block.status !== 'available' || block.student_id) return false
  if (isTeacherUnavailable(teacherAvailability, teacherId, slot)) return false
  return true
}

/**
 * Per (date, slot): count of teachers with an open, bookable slot.
 * Returns normalized intensities in [0, 1] or null if max is 0 (skip heatmap).
 */
// eslint-disable-next-line react-refresh/only-export-components -- shared heatmap helper
export function computeAvailabilityHeatmap(
  dates: string[],
  timeSlots: string[],
  teachers: { id: string }[],
  lookup: Map<string, Map<string, Map<string, GridBlock>>>,
  teacherAvailability: Map<string, { start: string; end: string }> | null | undefined,
): Map<string, Map<string, number>> | null {
  if (dates.length === 0 || timeSlots.length === 0 || teachers.length === 0) return null

  let maxAvailable = 0
  const rawCounts = new Map<string, Map<string, number>>()

  for (const date of dates) {
    const perSlot = new Map<string, number>()
    rawCounts.set(date, perSlot)
    for (const slot of timeSlots) {
      const sk = scheduleSlotKey(slot)
      let n = 0
      for (const t of teachers) {
        const block = lookup.get(date)?.get(t.id)?.get(sk)
        if (isTeacherAvailableAtSlot(block, t.id, slot, teacherAvailability)) n++
      }
      perSlot.set(sk, n)
      maxAvailable = Math.max(maxAvailable, n)
    }
  }

  if (maxAvailable === 0) return null

  const intensities = new Map<string, Map<string, number>>()
  for (const date of dates) {
    const im = new Map<string, number>()
    intensities.set(date, im)
    const perSlot = rawCounts.get(date)!
    for (const slot of timeSlots) {
      const sk = scheduleSlotKey(slot)
      im.set(sk, (perSlot.get(sk) ?? 0) / maxAvailable)
    }
  }
  return intensities
}

// eslint-disable-next-line react-refresh/only-export-components -- shared heatmap helper
export function intensityToColor(intensity: number): string {
  const x = Math.max(0, Math.min(1, intensity))
  if (x <= 0) return 'transparent'
  return `hsla(210, 90%, 58%, ${0.06 + 0.14 * x})`
}

export interface MultiDayScheduleGridProps {
  dates: string[]
  teachers: { id: string; name: string; photo_url: string | null }[]
  blocks: GridBlock[]
  timeSlots: string[]
  formatTime: (t: string) => string
  onBlockClick: (block: GridBlock) => void
  onOpenSlotClick: (block: GridBlock) => void
  selectedLocation: string
  locColor: string
  teacherAvailability?: Map<string, { start: string; end: string }> | null
  /** Optional: sync with parent scroll ref for layout */
  scrollParentRef?: React.RefObject<HTMLDivElement | null>
}

export default function MultiDayScheduleGrid({
  dates,
  teachers,
  blocks,
  timeSlots,
  formatTime,
  onBlockClick,
  onOpenSlotClick,
  selectedLocation,
  locColor,
  teacherAvailability,
  scrollParentRef,
}: MultiDayScheduleGridProps) {
  const fallbackRef = useRef<HTMLDivElement>(null)
  const hScrollRef = scrollParentRef ?? fallbackRef

  const slotColW = Math.max(26, Math.floor((DAY_MIN_W - 16) / Math.max(1, timeSlots.length)))
  const dayPanelInnerW = Math.max(DAY_MIN_W, 8 + slotColW * timeSlots.length)

  const lookup = useMemo(() => {
    const m = new Map<string, Map<string, Map<string, GridBlock>>>()
    for (const date of dates) {
      const byTeacher = new Map<string, Map<string, GridBlock>>()
      for (const t of teachers) {
        byTeacher.set(t.id, new Map())
      }
      m.set(date, byTeacher)
    }
    for (const b of blocks) {
      const byDate = m.get(b.block_date)
      if (!byDate) continue
      const byTeacher = byDate.get(b.teacher_id)
      if (!byTeacher) continue
      byTeacher.set(scheduleSlotKey(b.start_time), b)
    }
    return m
  }, [blocks, dates, teachers])

  const now = new Date()
  const nowParts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', hour: 'numeric', minute: 'numeric', hour12: false }).formatToParts(now)
  const nowHour = parseInt(nowParts.find(p => p.type === 'hour')?.value ?? '0')
  const nowMin = parseInt(nowParts.find(p => p.type === 'minute')?.value ?? '0')
  const nowMinutes = nowHour * 60 + nowMin
  let currentSlotIdx = -1
  for (let i = 0; i < timeSlots.length; i++) {
    const [h, m] = timeSlots[i].split(':').map(Number)
    const slotMin = h * 60 + m
    if (nowMinutes >= slotMin && nowMinutes < slotMin + 30) {
      currentSlotIdx = i
      break
    }
  }

  const todayIso = localTodayIso()

  const datesKey = dates.join(',')

  const heatmapIntensity = useMemo(
    () => computeAvailabilityHeatmap(dates, timeSlots, teachers, lookup, teacherAvailability),
    [dates, lookup, teacherAvailability, teachers, timeSlots],
  )

  const conflictSets = useMemo(() => computeConflicts(blocks), [blocks])

  const teacherLoadsMap = useMemo(
    () => computeTeacherLoadsMap(teachers, dates, blocks, timeSlots, teacherAvailability ?? null),
    [blocks, dates, teacherAvailability, teachers, timeSlots],
  )

  const scheduleDensity = useMemo(
    () => computeScheduleDensity(blocks, teachers, dates, timeSlots, teacherAvailability ?? null),
    [blocks, dates, teacherAvailability, teachers, timeSlots],
  )

  useEffect(() => {
    const el = hScrollRef.current
    if (!el || !datesKey) return
    const dateList = datesKey.split(',')
    if (dateList.length < 2) return
    const idx = dateList.findIndex(d => d === todayIso)
    if (idx <= 0) return
    const scrollTarget = idx * dayPanelInnerW * 0.92
    el.scrollTo({ left: Math.max(0, scrollTarget - el.clientWidth * 0.15), behavior: 'smooth' })
  }, [datesKey, dayPanelInnerW, hScrollRef, todayIso])

  const synthOpen = (date: string, teacherId: string, teacherName: string, slot: string): GridBlock => {
    const [h, m] = slot.split(':').map(Number)
    const endM = m === 30 ? '00' : '30'
    const endH = m === 30 ? String(h + 1).padStart(2, '0') : String(h).padStart(2, '0')
    return {
      block_id: '',
      teacher_id: teacherId,
      teacher_name: teacherName,
      tenant_id: '',
      location_id: selectedLocation,
      location_name: '',
      student_id: null,
      student_name: null,
      instrument: null,
      block_date: date,
      start_time: slot,
      end_time: `${endH}:${endM}:00`,
      status: 'available',
      block_type: 'open_time',
      is_recurring: false,
      checked_in: false,
      teacher_tally: false,
      fifth_week: false,
      room: null,
      room_id: null,
      notes: null,
      original_teacher_id: null,
      original_teacher_name: null,
      has_session_log: false,
      session_log: null,
      is_virtual: false,
      meet_link: null,
      meet_event_id: null,
      callout_reason: null,
      is_family_callout: false,
      callout_id: null,
      is_makeup_session: false,
      makeup_session_id: null,
    }
  }

  return (
    <div
      ref={hScrollRef}
      style={{
        flex: 1,
        overflowX: 'auto',
        overflowY: 'auto',
        WebkitOverflowScrolling: 'touch',
        position: 'relative',
        minHeight: 0,
        overscrollBehaviorX: 'contain',
        scrollSnapType: 'x mandatory',
      }}
    >
        <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'stretch', minHeight: HEADER_DAY_H + HEADER_TIME_H + teachers.length * ROW_H }}>
          {/* Sticky time + teacher axis */}
          <div
            style={{
              position: 'sticky',
              left: 0,
              zIndex: 20,
              flexShrink: 0,
              width: TEACHER_COL_W,
              background: SURFACE,
              borderRight: '1px solid rgba(255,255,255,0.08)',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <div
              style={{
                height: HEADER_DAY_H,
                borderBottom: '1px solid rgba(255,255,255,0.06)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 10,
                fontWeight: 700,
                color: 'rgba(160,160,200,0.85)',
              }}
            >
              Time
            </div>
            <div style={{ height: HEADER_TIME_H, borderBottom: '1px solid rgba(255,255,255,0.05)' }} />
            {teachers.map(t => (
              <div
                key={t.id}
                style={{
                  height: ROW_H,
                  display: 'flex',
                  alignItems: 'center',
                  padding: '0 6px',
                  borderBottom: '1px solid rgba(255,255,255,0.04)',
                  fontSize: 11,
                  fontWeight: 700,
                  color: '#E0E0F4',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {t.name.split(' ')[0]}
              </div>
            ))}
          </div>

          {dates.map(date => {
            const isToday = date === todayIso
            const byTeacher = lookup.get(date)
            const { avg: dayAvgLoad, skippedAll: dayLoadSkippedAll } = averageLoadForDate(teacherLoadsMap, teachers, date)
            const dayDen = scheduleDensity.dayDensity.get(date)
            const highLoad =
              Boolean(dayDen && !dayDen.skipped && dayDen.ratio >= DEFAULT_SCHEDULE_OVERBOOKING_THRESHOLD)
            const colBackground = highLoad
              ? isToday
                ? `linear-gradient(hsla(40, 90%, 60%, 0.07), hsla(40, 90%, 60%, 0.07)), ${SURFACE_TINT}`
                : 'hsla(40, 90%, 60%, 0.06)'
              : isToday
                ? SURFACE_TINT
                : 'transparent'
            return (
              <div
                key={date}
                data-schedule-insight-day={date}
                style={{
                  flex: '0 0 auto',
                  width: dayPanelInnerW,
                  minWidth: DAY_MIN_W,
                  scrollSnapAlign: 'start',
                  display: 'flex',
                  flexDirection: 'column',
                  background: colBackground,
                  borderRight: '1px solid rgba(255,255,255,0.06)',
                }}
              >
                <div
                  style={{
                    position: 'sticky',
                    top: 0,
                    zIndex: 30,
                    minHeight: HEADER_DAY_H,
                    background: isToday ? 'rgba(28,26,48,0.98)' : SURFACE,
                    borderBottom: '1px solid rgba(255,255,255,0.08)',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '4px 4px 2px',
                  }}
                >
                  {highLoad && (
                    <div
                      title={dayDen ? formatHighLoadTooltip(dayDen.ratio) : undefined}
                      style={{
                        position: 'absolute',
                        top: 4,
                        right: 4,
                        zIndex: 4,
                        fontSize: 10,
                        fontWeight: 800,
                        background: '#d97706',
                        color: '#fff',
                        borderRadius: 4,
                        padding: '0 5px',
                        lineHeight: '16px',
                        pointerEvents: 'none',
                      }}
                    >
                      !
                    </div>
                  )}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', justifyContent: 'center' }}>
                    <span style={{ fontSize: 12, fontWeight: 800, color: isToday ? locColor : '#E0E0F4' }}>{formatDayHeader(date)}</span>
                    {isToday && (
                      <span
                        style={{
                          fontSize: 9,
                          fontWeight: 800,
                          textTransform: 'uppercase',
                          letterSpacing: '0.04em',
                          padding: '2px 6px',
                          borderRadius: 6,
                          background: `${locColor}28`,
                          color: locColor,
                          border: `1px solid ${locColor}44`,
                        }}
                      >
                        Today
                      </span>
                    )}
                  </div>
                  <div
                    title={dayDen && !dayDen.skipped ? formatDayDensityTooltip(dayDen) : undefined}
                    style={{
                      marginTop: 4,
                      alignSelf: 'stretch',
                      width: '100%',
                      maxWidth: dayPanelInnerW - 16,
                      height: 6,
                      borderRadius: 9999,
                      background: 'rgba(113,113,122,0.22)',
                      overflow: 'hidden',
                      pointerEvents: 'none',
                      flexShrink: 0,
                    }}
                  >
                    {dayDen && !dayDen.skipped && (
                      <div
                        style={{
                          height: '100%',
                          width: `${dayDen.ratio * 100}%`,
                          background: 'rgba(168,85,247,0.88)',
                          transition: 'width 0.28s ease',
                          maxWidth: '100%',
                          borderRadius: 9999,
                        }}
                      />
                    )}
                  </div>
                  <div
                    title={dayLoadSkippedAll ? undefined : formatAverageLoadTooltip(dayAvgLoad)}
                    style={{
                      marginTop: 4,
                      alignSelf: 'stretch',
                      width: '100%',
                      maxWidth: dayPanelInnerW - 16,
                      height: 6,
                      borderRadius: 9999,
                      background: 'rgba(113,113,122,0.22)',
                      overflow: 'hidden',
                      pointerEvents: 'none',
                      flexShrink: 0,
                    }}
                  >
                    {!dayLoadSkippedAll && (
                      <div
                        style={{
                          height: '100%',
                          width: `${dayAvgLoad * 100}%`,
                          background: 'rgba(59,130,246,0.88)',
                          transition: 'width 0.28s ease',
                          maxWidth: '100%',
                          borderRadius: 9999,
                        }}
                      />
                    )}
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'row', height: HEADER_TIME_H, flexShrink: 0, background: SURFACE, borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                  {timeSlots.map((slot, idx) => (
                    <div
                      key={`${date}-${slot}`}
                      style={{
                        width: slotColW,
                        flex: '0 0 auto',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 9,
                        fontWeight: 600,
                        color: idx === currentSlotIdx && isToday ? locColor : 'rgba(255,255,255,0.55)',
                      }}
                    >
                      {formatTime(slot)}
                    </div>
                  ))}
                </div>

                <div style={{ position: 'relative', flexShrink: 0 }}>
                  {heatmapIntensity && (
                    <div
                      aria-hidden
                      style={{
                        position: 'absolute',
                        left: 0,
                        top: 0,
                        right: 0,
                        height: teachers.length * ROW_H,
                        display: 'flex',
                        flexDirection: 'row',
                        pointerEvents: 'none',
                        zIndex: 0,
                      }}
                    >
                      {timeSlots.map(slot => {
                        const sk = scheduleSlotKey(slot)
                        const x = heatmapIntensity.get(date)?.get(sk) ?? 0
                        return (
                          <div
                            key={`hm-${date}-${slot}`}
                            style={{
                              width: slotColW,
                              flex: '0 0 auto',
                              height: '100%',
                              backgroundColor: intensityToColor(x),
                              transition: 'background-color 0.2s ease',
                            }}
                          />
                        )
                      })}
                    </div>
                  )}
                  <div
                    aria-hidden
                    style={{
                      position: 'absolute',
                      left: 0,
                      top: 0,
                      right: 0,
                      height: 2,
                      display: 'flex',
                      flexDirection: 'row',
                      pointerEvents: 'none',
                      zIndex: 2,
                    }}
                  >
                    {timeSlots.map(slot => {
                      const sk = scheduleSlotKey(slot)
                      const r = scheduleDensity.slotDensity.get(date)?.get(sk) ?? 0
                      return (
                        <div
                          key={`sd-${date}-${sk}`}
                          style={{
                            width: slotColW,
                            flex: '0 0 auto',
                            height: 2,
                            background: `rgba(168,85,247,${0.12 + 0.38 * r})`,
                            transition: 'background 0.2s ease',
                          }}
                        />
                      )
                    })}
                  </div>
                  {teachers.map(t => {
                    const dayLoad = teacherLoadsMap.get(t.id)?.get(date)
                    const rowTint =
                      dayLoad && !dayLoad.skipped ? teacherRowTintBackground(dayLoad.load, dayLoad.skipped) : undefined
                    return (
                    <div
                      key={`${date}-${t.id}`}
                      style={{
                        height: ROW_H,
                        display: 'flex',
                        flexDirection: 'row',
                        alignItems: 'stretch',
                        borderBottom: '1px solid rgba(255,255,255,0.04)',
                        position: 'relative',
                        zIndex: 10,
                      }}
                    >
                    {rowTint && (
                      <div
                        aria-hidden
                        style={{
                          position: 'absolute',
                          inset: 0,
                          zIndex: 0,
                          pointerEvents: 'none',
                          backgroundColor: rowTint,
                        }}
                      />
                    )}
                    {timeSlots.map(slot => {
                      const key = scheduleSlotKey(slot)
                      const block = byTeacher?.get(t.id)?.get(key)
                      const unavailMsg = isTeacherUnavailable(teacherAvailability, t.id, slot)

                      if ((!block || block.block_type === 'open_time') && unavailMsg) {
                        return (
                          <div
                            key={`${date}-${t.id}-${slot}`}
                            style={{
                              width: slotColW,
                              flex: '0 0 auto',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                            }}
                          >
                            <span style={{ fontSize: 7, color: '#363656', fontWeight: 500 }}>{unavailMsg}</span>
                          </div>
                        )
                      }

                      if (!block || block.block_type === 'open_time') {
                        return (
                          <div
                            key={`${date}-${t.id}-${slot}`}
                            data-schedule-slot={slot}
                            data-teacher-id={t.id}
                            style={{
                              width: slotColW,
                              flex: '0 0 auto',
                              padding: '2px 1px',
                              boxSizing: 'border-box',
                            }}
                          >
                            <button
                              type="button"
                              onClick={() => {
                                if (block) onOpenSlotClick(block)
                                else onOpenSlotClick(synthOpen(date, t.id, t.name, slot))
                              }}
                              style={{
                                width: '100%',
                                height: '100%',
                                minHeight: ROW_H - 6,
                                borderRadius: 4,
                                border: '1px dashed rgba(74,222,128,0.28)',
                                background: 'rgba(74,222,128,0.04)',
                                cursor: 'pointer',
                                padding: 0,
                                margin: 0,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                              }}
                            >
                              <span style={{ fontSize: 8, color: 'rgba(74,222,128,0.45)', fontWeight: 600 }}>·</span>
                            </button>
                          </div>
                        )
                      }

                      const isTeacherCallout = block.block_type === 'call_out' && !block.is_family_callout
                      if (isTeacherCallout) {
                        const showC =
                          Boolean(block.block_id) &&
                          (conflictSets.teacherConflicts.has(block.block_id) ||
                            conflictSets.studentConflicts.has(block.block_id) ||
                            conflictSets.crossTeacherConflicts.has(block.block_id))
                        return (
                          <div
                            key={`${date}-${t.id}-${slot}`}
                            data-schedule-slot={slot}
                            data-teacher-id={t.id}
                            data-schedule-block-id={block.block_id || undefined}
                            style={{
                              width: slotColW,
                              flex: '0 0 auto',
                              padding: '2px 1px',
                              boxSizing: 'border-box',
                            }}
                          >
                            <button
                              type="button"
                              title={showC ? conflictTooltip(block.block_id, conflictSets.teacherConflicts, conflictSets.studentConflicts, conflictSets.crossTeacherConflicts) : undefined}
                              onClick={() => onBlockClick(block)}
                              style={{
                                width: '100%',
                                height: '100%',
                                minHeight: ROW_H - 6,
                                borderRadius: 4,
                                background: '#4A4540',
                                border: showC ? '1px solid rgba(239,68,68,0.9)' : '1px solid rgba(217,119,6,0.22)',
                                cursor: 'pointer',
                                padding: 2,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                position: 'relative',
                              }}
                            >
                              {showC && (
                                <span style={{ position: 'absolute', top: 2, right: 2, zIndex: 6, fontSize: 8, fontWeight: 900, background: '#dc2626', color: '#fff', borderRadius: 3, width: 12, height: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1, pointerEvents: 'none' }}>!</span>
                              )}
                              <Lock size={10} style={{ color: '#D97706' }} />
                            </button>
                          </div>
                        )
                      }

                      const colors = BLOCK_COLORS[block.block_type] ?? BLOCK_COLORS.student_session
                      const isCheckedIn = block.checked_in
                      const isPendingTally = block.checked_in && !block.teacher_tally
                      const blockBg = isCheckedIn ? `${colors.bg}50` : colors.bg
                      const blockBorder = isCheckedIn
                        ? isPendingTally
                          ? `1px dashed ${colors.bg}`
                          : `1px solid ${colors.bg}`
                        : '1px solid transparent'
                      const accent = block.student_id ? teacherAccentBorder(t.id) : 'transparent'
                      const midnight = blockMayContinuePastMidnight(block)
                      const showConflict =
                        Boolean(block.block_id) &&
                        (conflictSets.teacherConflicts.has(block.block_id) ||
                          conflictSets.studentConflicts.has(block.block_id) ||
                          conflictSets.crossTeacherConflicts.has(block.block_id))
                      const ct = showConflict
                        ? conflictTooltip(block.block_id, conflictSets.teacherConflicts, conflictSets.studentConflicts, conflictSets.crossTeacherConflicts)
                        : undefined
                      const tip = [block.student_name, ct].filter(Boolean).join(' — ') || undefined

                      return (
                        <div
                          key={`${date}-${t.id}-${slot}`}
                          data-schedule-slot={slot}
                          data-teacher-id={t.id}
                          data-schedule-block-id={block.block_id || undefined}
                          style={{
                            width: slotColW,
                            flex: '0 0 auto',
                            padding: '2px 1px',
                            boxSizing: 'border-box',
                          }}
                        >
                          <button
                            type="button"
                            onClick={() => onBlockClick(block)}
                            title={tip}
                            style={{
                              width: '100%',
                              height: '100%',
                              minHeight: ROW_H - 6,
                              borderRadius: 4,
                              background: blockBg,
                              border: showConflict ? '1px solid rgba(239,68,68,0.9)' : blockBorder,
                              cursor: 'pointer',
                              padding: '2px 3px',
                              position: 'relative',
                              boxSizing: 'border-box',
                              transition: 'filter 0.12s ease, box-shadow 0.12s ease',
                              boxShadow: block.student_id ? `inset 3px 0 0 0 ${accent}` : undefined,
                            }}
                            onMouseEnter={e => {
                              e.currentTarget.style.filter = 'brightness(1.08)'
                              const inset = block.student_id ? `inset 3px 0 0 0 ${accent}, ` : ''
                              e.currentTarget.style.boxShadow = `${inset}inset 0 0 0 1px rgba(255,255,255,0.14)`
                            }}
                            onMouseLeave={e => {
                              e.currentTarget.style.filter = 'none'
                              e.currentTarget.style.boxShadow = block.student_id ? `inset 3px 0 0 0 ${accent}` : 'none'
                            }}
                          >
                            {midnight && (
                              <span
                                style={{
                                  position: 'absolute',
                                  top: 2,
                                  right: showConflict ? 14 : 2,
                                  opacity: 0.75,
                                  display: 'flex',
                                  alignItems: 'center',
                                  color: colors.dark ? '#fff' : '#1a1a2e',
                                  zIndex: 3,
                                }}
                                title="Continues past midnight"
                              >
                                <ArrowDownToLine size={10} strokeWidth={2.5} />
                              </span>
                            )}
                            {showConflict && (
                              <span
                                style={{
                                  position: 'absolute',
                                  top: 2,
                                  right: 2,
                                  zIndex: 6,
                                  fontSize: 8,
                                  fontWeight: 900,
                                  background: '#dc2626',
                                  color: '#fff',
                                  borderRadius: 3,
                                  width: 12,
                                  height: 12,
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  lineHeight: 1,
                                  pointerEvents: 'none',
                                }}
                              >
                                !
                              </span>
                            )}
                            <div
                              style={{
                                fontSize: 9,
                                fontWeight: 700,
                                color: colors.dark ? '#fff' : '#1a1a2e',
                                whiteSpace: 'nowrap',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                textAlign: 'center',
                                lineHeight: 1.15,
                              }}
                            >
                              {block.block_type === 'makeup_session'
                                ? '\u{1F33A}'
                                : block.block_type === 'call_out' && block.is_family_callout
                                  ? '\u{1F468}\u200D\u{1F469}\u200D\u{1F467}'
                                  : ''}{' '}
                              {block.student_name
                                ? block.student_name.split(' ')[0]
                                : block.block_type === 'not_bookable'
                                  ? '—'
                                  : ''}
                            </div>
                            {block.instrument && (
                              <div style={{ fontSize: 10, textAlign: 'center', marginTop: 1 }}>{getInstrumentEmoji(block.instrument)}</div>
                            )}
                            {isCheckedIn && !isPendingTally && (
                              <span style={{ position: 'absolute', bottom: 1, right: 2, fontSize: 7, color: '#FFB800' }}>✓</span>
                            )}
                          </button>
                        </div>
                      )
                    })}
                  </div>
                  )
                })}
                </div>
              </div>
            )
          })}
        </div>
    </div>
  )
}
