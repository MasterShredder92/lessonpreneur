import { useState, useRef, useEffect, useLayoutEffect, useCallback, useMemo } from 'react'
import { ChevronLeft, ChevronRight, ChevronDown, HelpCircle, Lock, GripVertical } from 'lucide-react'
import { scheduleSlotKey, contiguousBookedSlotRange, type GridBlock } from '../../hooks/useScheduleGrid'
import { getInstrumentEmoji } from '../../utils/instrumentEmoji'
import { getLocationColor, abbreviateRoom } from '../../utils/locationColor'
import MultiDayScheduleGrid from './MultiDayScheduleGrid'
import { computeConflicts, conflictTooltip } from './computeConflicts'
import {
  computeTeacherLoadsMap,
  formatLoadTooltip,
  teacherRowTintBackground,
} from './computeTeacherLoad'
import {
  computeScheduleDensity,
  DEFAULT_SCHEDULE_OVERBOOKING_THRESHOLD,
  formatDayDensityTooltip,
  formatHighLoadTooltip,
} from './computeScheduleDensity'
import { computeScheduleInsights } from './computeScheduleInsights'
import ScheduleInsightsPanel from './ScheduleInsightsPanel'

interface Teacher {
  id: string
  name: string
  photo_url: string | null
}

interface Location {
  id: string
  name: string
  color?: string
  is_active: boolean
}

interface UtilizationItem {
  locationId: string
  locationName: string
  color: string
  openBlocks: number
  utilizationPercent: number
}

interface MobileScheduleProps {
  teachers: Teacher[]
  blocks: GridBlock[]
  timeSlots: string[]
  formatTime: (t: string) => string
  onBlockClick: (block: GridBlock) => void
  onOpenSlotClick: (block: GridBlock) => void
  onDragDrop: (sourceBlock: GridBlock, targetBlock: GridBlock) => void
  /** When set, booked sessions show an end-edge handle to extend/shrink along the slot grid */
  onResizeSessionEnd?: (anchorBlock: GridBlock, newEndSlotInclusive: string) => void
  locations: Location[]
  selectedLocation: string
  onLocationChange: (id: string) => void
  selectedDate: string
  onNavigateDate: (days: number) => void
  utilization?: UtilizationItem[]
  teacherAvailability?: Map<string, { start: string; end: string }> | null
  isStudioDirector?: boolean
  /** 2–7 ISO dates (`YYYY-MM-DD`): week-at-a-glance grid (all-teacher view only). Omit for single-day grid. */
  multiDayDates?: string[] | null
}

const BLOCK_COLORS: Record<string, { bg: string; dark: boolean }> = {
  student_session: { bg: '#FFB800', dark: false },
  first_day:       { bg: '#38BDF8', dark: false },
  meet_greet:      { bg: '#D4226A', dark: true },
  sub:             { bg: '#22C55E', dark: false },
  call_out:        { bg: '#F97316', dark: false },
  makeup_session:  { bg: '#FF6B6B', dark: true },
  last_day:        { bg: '#EF4444', dark: true },
  open_time:       { bg: 'rgba(255,255,255,0.04)', dark: true },
  not_bookable:    { bg: '#363656', dark: true },
  teacher_training:{ bg: '#6366F1', dark: true },
}

const DRAG_THRESHOLD_PX = 8

function slotIndexInGrid(timeSlots: string[], t: string): number {
  const k = scheduleSlotKey(t)
  return timeSlots.findIndex(s => scheduleSlotKey(s) === k)
}

function pickScheduleCellFromPoint(clientX: number, clientY: number): { teacherId: string; slot: string } | null {
  const stack = document.elementsFromPoint(clientX, clientY)
  for (const el of stack) {
    if (!(el instanceof HTMLElement)) continue
    const slot = el.dataset.scheduleSlot
    const tid = el.dataset.teacherId
    if (slot && tid) return { teacherId: tid, slot }
  }
  return null
}

function canPointerMoveBookedBlock(b: GridBlock): boolean {
  if (!b.student_id) return false
  if (b.block_type === 'call_out' && !b.is_family_callout) return false
  return true
}

function canResizeSessionEnd(b: GridBlock): boolean {
  if (!b.student_id || !canPointerMoveBookedBlock(b)) return false
  const t = b.block_type
  if (t === 'call_out' || t === 'not_bookable' || t === 'teacher_training' || t === 'open_time') return false
  return true
}

const LEGEND_ITEMS = [
  { type: 'student_session', label: 'Booked' },
  { type: 'first_day', label: 'First Day' },
  { type: 'meet_greet', label: 'Meet & Greet' },
  { type: 'sub', label: 'Sub' },
  { type: 'call_out', label: 'Callout' },
  { type: 'makeup_session', label: 'Makeup Session' },
  { type: 'last_day', label: 'Last Day' },
  { type: 'open_time', label: 'Open' },
  { type: 'not_bookable', label: 'Locked Times' },
  { type: 'teacher_training', label: 'Training' },
]

export default function MobileSchedule({ teachers, blocks, timeSlots, formatTime, onBlockClick, onOpenSlotClick, onDragDrop, onResizeSessionEnd, locations, selectedLocation, onLocationChange, selectedDate, onNavigateDate, utilization, teacherAvailability, isStudioDirector, multiDayDates }: MobileScheduleProps) {
  const [focusedTeacher, setFocusedTeacher] = useState<string | null>(null)
  const [expandedTeacher, setExpandedTeacher] = useState<string | null>(null)
  const [showLocationDropdown, setShowLocationDropdown] = useState(false)
  const [showLegend, setShowLegend] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  /** Focus-mode vertical list scroll root for insight “View” targeting. */
  const insightsScrollRef = useRef<HTMLDivElement>(null)
  const suppressClickRef = useRef(false)

  // Long-press drag state for focus mode
  const [dragSource, setDragSource] = useState<GridBlock | null>(null)
  const [dragOverSlot, setDragOverSlot] = useState<string | null>(null)
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const touchStartY = useRef(0)

  // Pointer drag (move) — grid + focus list
  const pointerMoveRef = useRef<{ src: GridBlock; sx: number; sy: number; active: boolean } | null>(null)
  const [pointerDragOver, setPointerDragOver] = useState<{ teacherId: string; slot: string } | null>(null)
  const [pointerDragging, setPointerDragging] = useState(false)
  /** True between pointerdown on a draggable block and pointerup (enables window listeners before drag threshold). */
  const [pointerSession, setPointerSession] = useState(false)
  const [pointerDragSrcBlock, setPointerDragSrcBlock] = useState<GridBlock | null>(null)

  // Pointer resize — end edge
  const resizeRef = useRef<{ anchor: GridBlock; startIdx: number; origEndIdx: number; ghostEndIdx: number } | null>(null)
  const [, setResizeGhostEndIdx] = useState<number | null>(null)
  const [resizeActive, setResizeActive] = useState(false)
  /** Mirrors resize ref indices for render-safe resize preview (avoid ref reads during render). */
  const [resizeLive, setResizeLive] = useState<{
    teacherId: string
    startIdx: number
    origEndIdx: number
    ghostEndIdx: number
  } | null>(null)

  const blocksRef = useRef(blocks)
  const timeSlotsRef = useRef(timeSlots)
  const teachersRef = useRef(teachers)
  const blockLookupRef = useRef(new Map<string, Map<string, GridBlock>>())
  const selectedDateRef = useRef(selectedDate)
  const selectedLocationRef = useRef(selectedLocation)
  useEffect(() => { blocksRef.current = blocks }, [blocks])
  useEffect(() => { timeSlotsRef.current = timeSlots }, [timeSlots])
  useEffect(() => { teachersRef.current = teachers }, [teachers])
  useEffect(() => { selectedDateRef.current = selectedDate }, [selectedDate])
  useEffect(() => { selectedLocationRef.current = selectedLocation }, [selectedLocation])

  // Build lookup: teacherId -> time -> block
  const blockLookup = useMemo(() => {
    const m = new Map<string, Map<string, GridBlock>>()
    for (const b of blocks) {
      if (!m.has(b.teacher_id)) m.set(b.teacher_id, new Map())
      m.get(b.teacher_id)!.set(b.start_time, b)
    }
    return m
  }, [blocks])

  useLayoutEffect(() => {
    blockLookupRef.current = blockLookup
  }, [blockLookup])

  const conflictSets = useMemo(() => computeConflicts(blocks), [blocks])

  const teacherLoadsMap = useMemo(
    () => computeTeacherLoadsMap(teachers, [selectedDate], blocks, timeSlots, teacherAvailability ?? null),
    [blocks, selectedDate, teacherAvailability, teachers, timeSlots],
  )

  const scheduleDensity = useMemo(
    () => computeScheduleDensity(blocks, teachers, [selectedDate], timeSlots, teacherAvailability ?? null),
    [blocks, selectedDate, teacherAvailability, teachers, timeSlots],
  )

  const hasConflict = useCallback(
    (blockId: string) =>
      Boolean(
        blockId &&
          (conflictSets.teacherConflicts.has(blockId) ||
            conflictSets.studentConflicts.has(blockId) ||
            conflictSets.crossTeacherConflicts.has(blockId)),
      ),
    [conflictSets],
  )

  const insightDates = useMemo(() => {
    if (multiDayDates && multiDayDates.length >= 2 && focusedTeacher === null) {
      return multiDayDates.slice(0, 7)
    }
    return [selectedDate]
  }, [multiDayDates, focusedTeacher, selectedDate])

  const insightTeacherLoadsMap = useMemo(
    () => computeTeacherLoadsMap(teachers, insightDates, blocks, timeSlots, teacherAvailability ?? null),
    [blocks, insightDates, teacherAvailability, teachers, timeSlots],
  )

  const insightScheduleDensity = useMemo(
    () => computeScheduleDensity(blocks, teachers, insightDates, timeSlots, teacherAvailability ?? null),
    [blocks, insightDates, teacherAvailability, teachers, timeSlots],
  )

  const scheduleInsights = useMemo(
    () =>
      computeScheduleInsights({
        teacherLoads: insightTeacherLoadsMap,
        dayDensity: insightScheduleDensity.dayDensity,
        slotDensity: insightScheduleDensity.slotDensity,
        conflictSets,
        blocks,
        teachers,
        dates: insightDates,
        timeSlots,
        formatTime,
        teachersForLoadInsights:
          focusedTeacher !== null
            ? teachers.filter(t => t.id === focusedTeacher).map(t => ({ id: t.id, name: t.name }))
            : undefined,
      }),
    [
      blocks,
      conflictSets,
      focusedTeacher,
      formatTime,
      insightDates,
      insightScheduleDensity.dayDensity,
      insightScheduleDensity.slotDensity,
      insightTeacherLoadsMap,
      teachers,
      timeSlots,
    ],
  )

  const synthOpenBlock = useCallback((teacherId: string, teacherName: string, slot: string): GridBlock => {
    const [h, m] = slot.split(':').map(Number)
    const endM = m === 30 ? '00' : '30'
    const endH = m === 30 ? String(h + 1).padStart(2, '0') : String(h).padStart(2, '0')
    return {
      block_id: '', teacher_id: teacherId, teacher_name: teacherName,
      tenant_id: '', location_id: selectedLocationRef.current, location_name: '',
      student_id: null, student_name: null, instrument: null,
      block_date: selectedDateRef.current, start_time: slot, end_time: `${endH}:${endM}:00`,
      status: 'available', block_type: 'open_time', is_recurring: false,
      checked_in: false, teacher_tally: false, fifth_week: false,
      room: null, room_id: null, notes: null,
      original_teacher_id: null, original_teacher_name: null,
    }
  }, [])

  const resizePreviewBand = useCallback((teacherId: string, slot: string): 'extend' | 'shrink' | null => {
    if (!resizeActive || !resizeLive || teacherId !== resizeLive.teacherId) return null
    const idx = slotIndexInGrid(timeSlots, slot)
    if (idx < 0) return null
    const { origEndIdx, ghostEndIdx } = resizeLive
    if (ghostEndIdx > origEndIdx) {
      if (idx > origEndIdx && idx <= ghostEndIdx) return 'extend'
    }
    if (ghostEndIdx < origEndIdx) {
      if (idx > ghostEndIdx && idx <= origEndIdx) return 'shrink'
    }
    return null
  }, [resizeActive, resizeLive, timeSlots])

  useEffect(() => {
    if (!pointerSession && !resizeActive) return
    const onPointerMove = (e: PointerEvent) => {
      if (resizeActive) {
        const hit = pickScheduleCellFromPoint(e.clientX, e.clientY)
        const r = resizeRef.current
        if (!hit || !r) return
        if (hit.teacherId !== r.anchor.teacher_id) return
        const idx = slotIndexInGrid(timeSlotsRef.current, hit.slot)
        if (idx < 0) return
        const next = Math.max(r.startIdx, idx)
        if (next !== r.ghostEndIdx) {
          resizeRef.current = { ...r, ghostEndIdx: next }
          setResizeLive(prev => (prev ? { ...prev, ghostEndIdx: next } : null))
          setResizeGhostEndIdx(next)
        }
        return
      }
      const pm = pointerMoveRef.current
      if (pm && !pm.active) {
        const dx = e.clientX - pm.sx
        const dy = e.clientY - pm.sy
        if (dx * dx + dy * dy > DRAG_THRESHOLD_PX * DRAG_THRESHOLD_PX) {
          pm.active = true
          setPointerDragging(true)
          suppressClickRef.current = true
        }
      }
      if (pm?.active) {
        const cell = pickScheduleCellFromPoint(e.clientX, e.clientY)
        setPointerDragOver(prev => {
          if (!cell && !prev) return prev
          if (!cell) return null
          if (prev && prev.teacherId === cell.teacherId && prev.slot === cell.slot) return prev
          return cell
        })
      }
    }
    const onPointerUp = (e: PointerEvent) => {
      if (resizeActive) {
        const r = resizeRef.current
        resizeRef.current = null
        setResizeLive(null)
        setResizeActive(false)
        setResizeGhostEndIdx(null)
        if (r && onResizeSessionEnd && r.ghostEndIdx !== r.origEndIdx) {
          const slotStr = timeSlotsRef.current[r.ghostEndIdx]
          if (slotStr) onResizeSessionEnd(r.anchor, slotStr)
        }
        setPointerSession(false)
        return
      }
      const ref = pointerMoveRef.current
      pointerMoveRef.current = null
      setPointerSession(false)
      setPointerDragging(false)
      setPointerDragSrcBlock(null)
      setPointerDragOver(null)
      if (!ref?.active) {
        setTimeout(() => { suppressClickRef.current = false }, 0)
        return
      }
      const cell = pickScheduleCellFromPoint(e.clientX, e.clientY)
      if (!cell) {
        setTimeout(() => { suppressClickRef.current = false }, 0)
        return
      }
      const tch = teachersRef.current.find(t => t.id === cell.teacherId)
      const teacherName = tch?.name ?? 'Teacher'
      const slotKey = scheduleSlotKey(cell.slot)
      const existing = blocksRef.current.find(
        b => b.teacher_id === cell.teacherId && scheduleSlotKey(b.start_time) === slotKey,
      )
      const isOpen = !existing || (existing.block_type === 'open_time' && !existing.student_id)
      if (!isOpen) {
        setTimeout(() => { suppressClickRef.current = false }, 0)
        return
      }
      const targetBlock = existing?.block_id
        ? existing
        : synthOpenBlock(cell.teacherId, teacherName, cell.slot)
      if (ref.src.block_id && targetBlock.block_id && ref.src.block_id === targetBlock.block_id) {
        setTimeout(() => { suppressClickRef.current = false }, 0)
        return
      }
      onDragDrop(ref.src, targetBlock)
      setTimeout(() => { suppressClickRef.current = false }, 0)
    }
    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp, true)
    window.addEventListener('pointercancel', onPointerUp, true)
    return () => {
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp, true)
      window.removeEventListener('pointercancel', onPointerUp, true)
    }
  }, [pointerSession, resizeActive, onDragDrop, onResizeSessionEnd, synthOpenBlock])

  // Check if a time is outside a teacher's availability
  const isTeacherUnavailable = (teacherId: string, time: string): string | null => {
    if (!teacherAvailability || !teacherAvailability.has(teacherId)) return null
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

  // Current time slot index for highlighting
  const now = new Date()
  const nowParts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', hour: 'numeric', minute: 'numeric', hour12: false }).formatToParts(now)
  const nowHour = parseInt(nowParts.find(p => p.type === 'hour')?.value ?? '0')
  const nowMin = parseInt(nowParts.find(p => p.type === 'minute')?.value ?? '0')
  const nowMinutes = nowHour * 60 + nowMin

  // Find current time slot index
  let currentSlotIdx = -1
  for (let i = 0; i < timeSlots.length; i++) {
    const [h, m] = timeSlots[i].split(':').map(Number)
    const slotMin = h * 60 + m
    if (nowMinutes >= slotMin && nowMinutes < slotMin + 30) {
      currentSlotIdx = i
      break
    }
  }

  const isMultiDayWeekView = Boolean(multiDayDates && multiDayDates.length >= 2 && focusedTeacher === null)

  // Auto-scroll to current time on mount/navigation (single-day grid only; multi-day scrolls in MultiDayScheduleGrid)
  const hasAutoScrolled = useRef(false)
  useEffect(() => { hasAutoScrolled.current = false }, [selectedDate, selectedLocation, multiDayDates])
  useEffect(() => {
    if (isMultiDayWeekView) return
    if (hasAutoScrolled.current || currentSlotIdx < 0 || !scrollRef.current) return
    const colWidth = 76
    const teacherCol = 98
    const targetScroll = Math.max(0, teacherCol + currentSlotIdx * colWidth - scrollRef.current.clientWidth / 2)
    scrollRef.current.scrollTo({ left: targetScroll, behavior: 'smooth' })
    hasAutoScrolled.current = true
  }, [isMultiDayWeekView, currentSlotIdx, selectedDate, selectedLocation])

  // Close dropdowns on outside tap
  useEffect(() => {
    if (!showLocationDropdown && !showLegend) return
    const handler = () => { setShowLocationDropdown(false); setShowLegend(false) }
    // Delay so the click that opened it doesn't immediately close it
    const id = setTimeout(() => document.addEventListener('click', handler), 0)
    return () => { clearTimeout(id); document.removeEventListener('click', handler) }
  }, [showLocationDropdown, showLegend])

  const activeLocations = locations.filter(l => l.is_active)
  const currentLocation = activeLocations.find(l => l.id === selectedLocation)
  const currentLocationName = currentLocation?.name?.replace(' Music Lessons', '') ?? 'Location'
  const locColor = currentLocation?.color ?? '#D4226A'

  // Build open-count lookup from utilization data
  const openCountMap = new Map<string, number>()
  utilization?.forEach(u => openCountMap.set(u.locationId, u.openBlocks))

  // Short date format: "Mar 31"
  const dateObj = new Date(selectedDate + 'T00:00:00')
  const shortDate = dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

  const dayScheduleDensity = scheduleDensity.dayDensity.get(selectedDate)
  const highLoadScheduleDay = Boolean(
    dayScheduleDensity &&
      !dayScheduleDensity.skipped &&
      dayScheduleDensity.ratio >= DEFAULT_SCHEDULE_OVERBOOKING_THRESHOLD,
  )
  const firstTeacherIdForSlotStripe = teachers[0]?.id
  const slotDensityByKey = scheduleDensity.slotDensity.get(selectedDate)

  // Fixed row height avoids CLS when teacher count changes (e.g. availability merges after grid RPC)
  const baseRowHeight = 44

  // ── Focus Mode ──
  if (focusedTeacher !== null) {
    const teacher = teachers.find(t => t.id === focusedTeacher)
    const teacherName = teacher?.name ?? 'Teacher'
    const teacherBlocks = blockLookup.get(focusedTeacher)
    let teacherRoom: string | null = null
    if (teacherBlocks) {
      for (const b of teacherBlocks.values()) {
        if (b.room) { teacherRoom = b.room; break }
      }
    }

    const focusedDayLoad = teacherLoadsMap.get(focusedTeacher)?.get(selectedDate)
    const focusRowTint =
      focusedDayLoad && !focusedDayLoad.skipped
        ? teacherRowTintBackground(focusedDayLoad.load, focusedDayLoad.skipped)
        : undefined

    const makeOpenBlock = (slot: string): GridBlock => {
      const [hh, mm] = slot.split(':')
      const endM = mm === '30' ? '00' : '30'
      const endH = mm === '30' ? String(Number(hh) + 1).padStart(2, '0') : hh
      return {
        block_id: '', teacher_id: focusedTeacher, teacher_name: teacherName,
        tenant_id: '', location_id: selectedLocation, location_name: '',
        student_id: null, student_name: null, instrument: null,
        block_date: selectedDate, start_time: slot, end_time: `${endH}:${endM}:00`,
        status: 'available', block_type: 'open_time', is_recurring: false,
        checked_in: false, teacher_tally: false, fifth_week: false,
        room: null, room_id: null, notes: null,
        original_teacher_id: null, original_teacher_name: null,
      }
    }

    // Long-press handlers for drag-and-drop
    const handleTouchStart = (block: GridBlock, e: React.TouchEvent) => {
      touchStartY.current = e.touches[0].clientY
      longPressTimer.current = setTimeout(() => {
        if (block.student_id) {
          setDragSource(block)
          if (navigator.vibrate) navigator.vibrate(30)
        }
      }, 500)
    }
    const handleTouchMove = (e: React.TouchEvent) => {
      // Cancel long press if finger moves too much before activation
      if (!dragSource && longPressTimer.current) {
        const dy = Math.abs(e.touches[0].clientY - touchStartY.current)
        if (dy > 10) { clearTimeout(longPressTimer.current); longPressTimer.current = null }
        return
      }
      if (!dragSource) return
      // Find which slot the finger is over
      const el = document.elementFromPoint(e.touches[0].clientX, e.touches[0].clientY)
      const slotEl = el?.closest('[data-slot]') as HTMLElement | null
      setDragOverSlot(slotEl?.dataset.slot ?? null)
    }
    const handleTouchEnd = () => {
      if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null }
      if (dragSource && dragOverSlot) {
        const targetBlock = teacherBlocks?.get(dragOverSlot)
        if (targetBlock && targetBlock.block_type === 'open_time') {
          onDragDrop(dragSource, targetBlock)
        } else if (!targetBlock) {
          // No block at target — synthesize an open one
          onDragDrop(dragSource, makeOpenBlock(dragOverSlot))
        }
      }
      setDragSource(null)
      setDragOverSlot(null)
    }

    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 60px)', overflow: 'hidden' }}>
        {/* Focus header — teacher info + date nav + back */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '8px 12px', flexShrink: 0, borderBottom: `1px solid ${locColor}20`,
        }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: '#E0E0F4', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{teacherName}</div>
            <div
              title={focusedDayLoad && !focusedDayLoad.skipped ? formatLoadTooltip(focusedDayLoad) : undefined}
              style={{
                height: 6,
                width: '100%',
                maxWidth: 220,
                marginTop: 6,
                borderRadius: 9999,
                background: 'rgba(113,113,122,0.22)',
                overflow: 'hidden',
                flexShrink: 0,
                pointerEvents: 'none',
              }}
            >
              {focusedDayLoad && !focusedDayLoad.skipped && (
                <div
                  style={{
                    height: '100%',
                    width: `${focusedDayLoad.load * 100}%`,
                    background: 'rgba(59,130,246,0.88)',
                    transition: 'width 0.28s ease',
                    maxWidth: '100%',
                    borderRadius: 9999,
                  }}
                />
              )}
            </div>
            {teacherRoom && <span style={{ fontSize: 13, fontWeight: 700, marginTop: 2, padding: '1px 6px', borderRadius: 4, background: `${getLocationColor(selectedLocation)}25`, color: getLocationColor(selectedLocation), display: 'inline-block' }}>{abbreviateRoom(teacherRoom)}</span>}
          </div>
          <button
            onClick={() => setFocusedTeacher(null)}
            style={{
              display: 'flex', alignItems: 'center', gap: 4, padding: '5px 12px', flexShrink: 0,
              borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)',
              background: 'rgba(255,255,255,0.04)', color: '#A0A0C8',
              fontSize: 12, fontWeight: 600, cursor: 'pointer',
            }}
          >
            <ChevronLeft size={14} /> All
          </button>
        </div>

        {/* Date nav row */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
          padding: '6px 12px', flexShrink: 0, borderBottom: '1px solid rgba(255,255,255,0.04)',
        }}>
          <button
            onClick={() => onNavigateDate(-1)}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: 30, height: 30, borderRadius: 8, border: '1px solid rgba(255,255,255,0.08)',
              background: 'rgba(255,255,255,0.04)', cursor: 'pointer', color: '#A0A0C8',
            }}
          ><ChevronLeft size={15} /></button>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, flex: 1, minWidth: 0, maxWidth: 220 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'center' }}>
              {highLoadScheduleDay && (
                <span
                  title={dayScheduleDensity ? formatHighLoadTooltip(dayScheduleDensity.ratio) : undefined}
                  style={{
                    fontSize: 10,
                    fontWeight: 800,
                    background: '#d97706',
                    color: '#fff',
                    borderRadius: 4,
                    padding: '0 6px',
                    lineHeight: '16px',
                    pointerEvents: 'none',
                    flexShrink: 0,
                  }}
                >
                  !
                </span>
              )}
              <span style={{ fontSize: 14, fontWeight: 700, color: '#E0E0F4', textAlign: 'center' }}>{shortDate}</span>
            </div>
            <div
              title={dayScheduleDensity && !dayScheduleDensity.skipped ? formatDayDensityTooltip(dayScheduleDensity) : undefined}
              style={{
                height: 6,
                width: '100%',
                borderRadius: 9999,
                background: 'rgba(113,113,122,0.22)',
                overflow: 'hidden',
                pointerEvents: 'none',
              }}
            >
              {dayScheduleDensity && !dayScheduleDensity.skipped && (
                <div
                  style={{
                    height: '100%',
                    width: `${dayScheduleDensity.ratio * 100}%`,
                    background: 'rgba(168,85,247,0.88)',
                    transition: 'width 0.28s ease',
                    maxWidth: '100%',
                    borderRadius: 9999,
                  }}
                />
              )}
            </div>
          </div>
          <button
            onClick={() => onNavigateDate(1)}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: 30, height: 30, borderRadius: 8, border: '1px solid rgba(255,255,255,0.08)',
              background: 'rgba(255,255,255,0.04)', cursor: 'pointer', color: '#A0A0C8',
            }}
          ><ChevronRight size={15} /></button>
        </div>

        <ScheduleInsightsPanel
          insights={scheduleInsights}
          scrollRootRef={scrollRef}
          focusScrollRootRef={insightsScrollRef}
          useFocusScrollRoot={focusedTeacher !== null}
          accentColor={locColor}
        />

        {/* Drag indicator (touch long-press or pointer drag) */}
        {(dragSource || (pointerDragging && pointerDragSrcBlock)) && (
          <div style={{ padding: '6px 12px', background: 'rgba(212,34,106,0.1)', borderBottom: '1px solid rgba(212,34,106,0.2)', fontSize: 11, color: '#D4226A', fontWeight: 600, textAlign: 'center', flexShrink: 0 }}>
            Moving {(dragSource ?? pointerDragSrcBlock)!.student_name} — drop on an open slot
          </div>
        )}

        {/* Vertical time list */}
        <div
          ref={insightsScrollRef}
          data-schedule-insight-day={selectedDate}
          style={{ flex: 1, overflowY: 'auto', WebkitOverflowScrolling: 'touch', padding: '0 10px 20px' }}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          {timeSlots.map(slot => {
            const block = teacherBlocks?.get(slot)
            const [h, m] = slot.split(':').map(Number)
            const slotMin = h * 60 + m
            const isCurrent = nowMinutes >= slotMin && nowMinutes < slotMin + 30
            const isOpen = !block || block.block_type === 'open_time'
            const unavailMsg = isTeacherUnavailable(focusedTeacher, slot)
            const isPointerDropOver =
              pointerDragOver &&
              pointerDragOver.teacherId === focusedTeacher &&
              scheduleSlotKey(pointerDragOver.slot) === scheduleSlotKey(slot) &&
              isOpen &&
              !unavailMsg
            const isDragOver = (dragSource && dragOverSlot === slot && isOpen && !unavailMsg) || isPointerDropOver
            const isDragging = dragSource?.start_time === slot ||
              (pointerDragging && pointerDragSrcBlock && scheduleSlotKey(pointerDragSrcBlock.start_time) === scheduleSlotKey(slot))

            return (
              <div
                key={slot}
                data-slot={slot}
                style={{ display: 'flex', gap: 10, minHeight: 52, alignItems: 'stretch', borderBottom: '1px solid rgba(255,255,255,0.04)', position: 'relative' }}
              >
                {focusRowTint && (
                  <div
                    aria-hidden
                    style={{
                      position: 'absolute',
                      inset: 0,
                      left: 70,
                      pointerEvents: 'none',
                      zIndex: 0,
                      backgroundColor: focusRowTint,
                      borderRadius: 6,
                    }}
                  />
                )}
                <div
                  aria-hidden
                  style={{
                    position: 'absolute',
                    left: 70,
                    right: 0,
                    top: 0,
                    height: 2,
                    pointerEvents: 'none',
                    zIndex: 2,
                    background: `rgba(168,85,247,${0.12 + 0.38 * (slotDensityByKey?.get(scheduleSlotKey(slot)) ?? 0)})`,
                  }}
                />
                {/* Time label */}
                <div style={{
                  width: 60, flexShrink: 0, display: 'flex', alignItems: 'center',
                  fontSize: 12, fontWeight: 600, color: isCurrent ? locColor : 'rgba(255,255,255,0.6)',
                  position: 'relative',
                  zIndex: 1,
                }}>
                  {formatTime(slot)}
                </div>

                {/* Block */}
                <div data-slot={slot} data-schedule-slot={slot} data-teacher-id={focusedTeacher} style={{ flex: 1, padding: '4px 0', position: 'relative', zIndex: 1 }}>
                  {isOpen && unavailMsg ? (
                    <div style={{
                      height: '100%', minHeight: 44, borderRadius: 6,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      background: 'rgba(72,72,112,0.03)',
                    }}>
                      <span style={{ fontSize: 10, color: '#363656', fontWeight: 500 }}>{unavailMsg}</span>
                    </div>
                  ) : isOpen ? (
                    <div
                      data-slot={slot}
                      onClick={() => { if (dragSource || pointerDragging) return; const b = block ?? makeOpenBlock(slot); onOpenSlotClick(b) }}
                      style={{
                        height: '100%', minHeight: 44, borderRadius: 6,
                        border: isDragOver ? '2px solid rgba(74,222,128,0.6)' : '1px dashed rgba(74,222,128,0.3)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        cursor: 'pointer',
                        background: isDragOver ? 'rgba(74,222,128,0.12)' : 'rgba(74,222,128,0.04)',
                        transition: 'all 120ms ease',
                      }}
                    >
                      <span style={{ fontSize: 11, color: isDragOver ? 'rgba(74,222,128,0.9)' : 'rgba(74,222,128,0.5)', fontWeight: 600 }}>
                        {isDragOver ? 'Drop here' : 'Open'}
                      </span>
                    </div>
                  ) : block!.block_type === 'call_out' && !block!.is_family_callout ? (
                    /* ── Teacher callout — locked gray/amber block ── */
                    <div
                      data-slot={slot}
                      data-schedule-block-id={block!.block_id || undefined}
                      title={hasConflict(block!.block_id) ? conflictTooltip(block!.block_id, conflictSets.teacherConflicts, conflictSets.studentConflicts, conflictSets.crossTeacherConflicts) : undefined}
                      onClick={() => { if (dragSource || pointerDragging) return; onBlockClick(block!) }}
                      style={{
                        height: '100%', minHeight: 44, borderRadius: 6, padding: '6px 12px',
                        display: 'flex', flexDirection: 'column', justifyContent: 'center',
                        cursor: 'pointer',
                        background: '#4A4540',
                        border: hasConflict(block!.block_id) ? '1px solid rgba(239,68,68,0.9)' : '1px solid rgba(217,119,6,0.25)',
                        position: 'relative',
                      }}
                    >
                      {hasConflict(block!.block_id) && (
                        <span style={{ position: 'absolute', top: 6, right: 8, zIndex: 6, fontSize: 9, fontWeight: 900, background: '#dc2626', color: '#fff', borderRadius: 4, width: 14, height: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1, pointerEvents: 'none' }}>!</span>
                      )}
                      <div style={{
                        fontSize: 14, fontWeight: 700, color: '#fff',
                        display: 'flex', alignItems: 'center', gap: 4,
                      }}>
                        {block!.student_name ?? 'Student'}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'rgba(255,255,255,0.55)', marginTop: 2 }}>
                        <Lock size={11} style={{ color: '#D97706' }} />
                        <span style={{ fontWeight: 600, color: '#D97706' }}>Called Out</span>
                        {block!.callout_reason && (
                          <span style={{ color: 'rgba(255,255,255,0.4)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            — {block!.callout_reason}
                          </span>
                        )}
                      </div>
                      {block!.instrument && (
                        <div title={block!.instrument} style={{ fontSize: 16, marginTop: 2 }}>
                          {getInstrumentEmoji(block!.instrument)}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div
                      data-slot={slot}
                      data-schedule-block-id={block!.block_id || undefined}
                      title={hasConflict(block!.block_id) ? conflictTooltip(block!.block_id, conflictSets.teacherConflicts, conflictSets.studentConflicts, conflictSets.crossTeacherConflicts) : undefined}
                      onClick={() => {
                        if (dragSource || pointerDragging) return
                        if (suppressClickRef.current) return
                        onBlockClick(block!)
                      }}
                      onPointerDown={(e) => {
                        if (e.button !== 0) return
                        if (!canPointerMoveBookedBlock(block!)) return
                        pointerMoveRef.current = { src: block!, sx: e.clientX, sy: e.clientY, active: false }
                        setPointerSession(true)
                      }}
                      onTouchStart={(e) => handleTouchStart(block!, e)}
                      style={{
                        height: '100%', minHeight: 44, borderRadius: 6, padding: '6px 12px',
                        display: 'flex', flexDirection: 'column', justifyContent: 'center',
                        cursor: 'grab',
                        background: BLOCK_COLORS[block!.block_type]?.bg ?? BLOCK_COLORS.student_session.bg,
                        opacity: isDragging ? 0.4 : 1,
                        transition: 'opacity 120ms ease',
                        position: 'relative',
                        boxShadow: hasConflict(block!.block_id) ? 'inset 0 0 0 1px rgba(239,68,68,0.9)' : undefined,
                      }}
                    >
                      {hasConflict(block!.block_id) && (
                        <span style={{ position: 'absolute', top: 6, right: 8, zIndex: 6, fontSize: 9, fontWeight: 900, background: '#dc2626', color: '#fff', borderRadius: 4, width: 14, height: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1, pointerEvents: 'none' }}>!</span>
                      )}
                      <div style={{
                        fontSize: 14, fontWeight: 700,
                        color: BLOCK_COLORS[block!.block_type]?.dark ? '#fff' : '#1a1a2e',
                        display: 'flex', alignItems: 'center', gap: 4,
                      }}>
                        {block!.block_type === 'makeup_session' && <span style={{ fontSize: 13 }}>{'\u{1F33A}'}</span>}
                        {block!.block_type === 'call_out' && block!.is_family_callout && <span style={{ fontSize: 13 }}>{'\u{1F468}\u200D\u{1F469}\u200D\u{1F467}'}</span>}
                        {block!.block_type === 'makeup_session'
                          ? `Makeup \u00B7 ${block!.student_name ?? ''}`.trim()
                          : block!.block_type === 'call_out' && block!.is_family_callout
                            ? `${block!.student_name ?? 'Student'} \u00B7 Call Out`
                            : (block!.student_name ?? block!.block_type.replace(/_/g, ' '))}
                      </div>
                      {block!.instrument && (
                        <div title={block!.instrument} style={{
                          fontSize: 16, marginTop: 2,
                        }}>
                          {getInstrumentEmoji(block!.instrument)}
                        </div>
                      )}
                      {onResizeSessionEnd && canResizeSessionEnd(block!) && (() => {
                        const si = slotIndexInGrid(timeSlots, slot)
                        const { endIdx } = contiguousBookedSlotRange(blocks, focusedTeacher, block!.student_id!, timeSlots, si)
                        if (si !== endIdx) return null
                        return (
                          <div
                            role="separator"
                            aria-label="Resize session end time"
                            onPointerDown={(e) => {
                              e.stopPropagation()
                              if (e.button !== 0) return
                              const anchorIdx = slotIndexInGrid(timeSlots, block!.start_time)
                              const { startIdx, endIdx: oe } = contiguousBookedSlotRange(blocks, focusedTeacher, block!.student_id!, timeSlots, anchorIdx)
                              resizeRef.current = { anchor: block!, startIdx, origEndIdx: oe, ghostEndIdx: oe }
                              setResizeLive({ teacherId: focusedTeacher, startIdx, origEndIdx: oe, ghostEndIdx: oe })
                              setResizeActive(true)
                              setResizeGhostEndIdx(oe)
                            }}
                            style={{
                              position: 'absolute', left: 6, right: 6, bottom: 2, height: 10, cursor: 'ns-resize', zIndex: 6,
                              touchAction: 'none', borderRadius: 4, background: 'linear-gradient(180deg, transparent, rgba(0,0,0,0.18))',
                              display: 'flex', alignItems: 'flex-end', justifyContent: 'center', paddingBottom: 1,
                            }}
                          >
                            <GripVertical size={12} style={{ opacity: 0.55, color: BLOCK_COLORS[block!.block_type]?.dark ? '#fff' : '#1a1a2e' }} />
                          </div>
                        )
                      })()}
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 60px)', overflow: 'hidden' }}>
      {/* Row 1 — Location dropdown */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '6px 10px', flexShrink: 0, position: 'relative',
        gap: 8,
      }}>
        {/* Left: Location — static for studio directors, dropdown for owners/admins */}
        {isStudioDirector ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', flex: 1, minWidth: 0 }}>
            <div style={{ width: 8, height: 8, borderRadius: 3, background: locColor, boxShadow: `0 0 6px ${locColor}60`, flexShrink: 0 }} />
            <span style={{ fontSize: 13, fontWeight: 800, color: locColor, letterSpacing: '-0.01em' }}>Schedule — {currentLocationName}</span>
          </div>
        ) : (
          <div style={{ position: 'relative', flex: 1, minWidth: 0 }}>
            <button
              onClick={(e) => { e.stopPropagation(); setShowLocationDropdown(v => !v); setShowLegend(false) }}
              style={{
                display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px',
                background: `${locColor}18`, border: `1px solid ${locColor}30`, borderRadius: 8,
                color: '#E0E0F4', fontSize: 12, fontWeight: 700, cursor: 'pointer',
                width: '100%',
              }}
            >
              <div style={{ width: 8, height: 8, borderRadius: 3, background: locColor, flexShrink: 0 }} />
              <span style={{ flex: 1, textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{currentLocationName}</span>
              <span style={{ fontSize: 10, color: '#8080A8', fontWeight: 500, flexShrink: 0, minWidth: 56, textAlign: 'right', visibility: openCountMap.has(selectedLocation) ? 'visible' : 'hidden' }} aria-hidden={!openCountMap.has(selectedLocation)}>
                {openCountMap.has(selectedLocation) ? `${openCountMap.get(selectedLocation)} open` : '0 open'}
              </span>
              <ChevronDown size={12} style={{ color: '#8080A8', flexShrink: 0 }} />
            </button>

            {/* Location dropdown */}
            {showLocationDropdown && (
              <div
                onClick={(e) => e.stopPropagation()}
                style={{
                  position: 'absolute', top: '100%', left: 0, marginTop: 4, zIndex: 100,
                  background: '#1C1C2E', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10,
                  boxShadow: '0 8px 24px rgba(0,0,0,0.5)', minWidth: 200, overflow: 'hidden',
                }}
              >
                {activeLocations.map(loc => {
                  const c = loc.color ?? '#D4226A'
                  const active = loc.id === selectedLocation
                  const openCount = openCountMap.get(loc.id)
                  return (
                    <button
                      key={loc.id}
                      onClick={() => { onLocationChange(loc.id); setShowLocationDropdown(false) }}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                        padding: '10px 12px', border: 'none', cursor: 'pointer', textAlign: 'left',
                        background: active ? `${c}20` : 'transparent', color: active ? '#fff' : '#A0A0C8',
                        fontSize: 12, fontWeight: active ? 700 : 500,
                      }}
                    >
                      <div style={{ width: 8, height: 8, borderRadius: 3, background: c, flexShrink: 0 }} />
                      <span style={{ flex: 1 }}>{loc.name.replace(' Music Lessons', '')}</span>
                      {openCount != null && (
                        <span style={{ fontSize: 10, color: '#606088', fontWeight: 500 }}>{openCount} open</span>
                      )}
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        )}

      </div>

      {/* Row 2 — Date nav + Legend */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '4px 10px 6px', flexShrink: 0,
        borderBottom: `1px solid ${locColor}20`,
      }}>
        {/* Center: Date nav + schedule density (single-day grid only) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1, justifyContent: 'center' }}>
          <button
            onClick={() => onNavigateDate(-1)}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: 26, height: 26, borderRadius: 7, border: '1px solid rgba(255,255,255,0.08)',
              background: 'rgba(255,255,255,0.04)', cursor: 'pointer', color: '#A0A0C8',
            }}
          ><ChevronLeft size={14} /></button>
          {!isMultiDayWeekView ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, minWidth: 0, flex: 1, maxWidth: 160 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'center' }}>
                {highLoadScheduleDay && (
                  <span
                    title={dayScheduleDensity ? formatHighLoadTooltip(dayScheduleDensity.ratio) : undefined}
                    style={{
                      fontSize: 9,
                      fontWeight: 800,
                      background: '#d97706',
                      color: '#fff',
                      borderRadius: 4,
                      padding: '0 5px',
                      lineHeight: '14px',
                      pointerEvents: 'none',
                      flexShrink: 0,
                    }}
                  >
                    !
                  </span>
                )}
                <span style={{ fontSize: 13, fontWeight: 700, color: '#E0E0F4', textAlign: 'center' }}>{shortDate}</span>
              </div>
              <div
                title={dayScheduleDensity && !dayScheduleDensity.skipped ? formatDayDensityTooltip(dayScheduleDensity) : undefined}
                style={{
                  height: 5,
                  width: '100%',
                  borderRadius: 9999,
                  background: 'rgba(113,113,122,0.22)',
                  overflow: 'hidden',
                  pointerEvents: 'none',
                }}
              >
                {dayScheduleDensity && !dayScheduleDensity.skipped && (
                  <div
                    style={{
                      height: '100%',
                      width: `${dayScheduleDensity.ratio * 100}%`,
                      background: 'rgba(168,85,247,0.88)',
                      transition: 'width 0.28s ease',
                      maxWidth: '100%',
                      borderRadius: 9999,
                    }}
                  />
                )}
              </div>
            </div>
          ) : (
            <span style={{ fontSize: 13, fontWeight: 700, color: '#E0E0F4', minWidth: 52, textAlign: 'center' }}>{shortDate}</span>
          )}
          <button
            onClick={() => onNavigateDate(1)}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: 26, height: 26, borderRadius: 7, border: '1px solid rgba(255,255,255,0.08)',
              background: 'rgba(255,255,255,0.04)', cursor: 'pointer', color: '#A0A0C8',
            }}
          ><ChevronRight size={14} /></button>
        </div>

        {/* Right: Legend button */}
        <div style={{ position: 'relative' }}>
          <button
            onClick={(e) => { e.stopPropagation(); setShowLegend(v => !v); setShowLocationDropdown(false) }}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: 28, height: 28, borderRadius: 8, border: '1px solid rgba(255,255,255,0.08)',
              background: showLegend ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.04)',
              cursor: 'pointer', color: '#8080A8',
            }}
          ><HelpCircle size={14} /></button>

          {/* Legend popover */}
          {showLegend && (
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                position: 'absolute', top: '100%', right: 0, marginTop: 4, zIndex: 100,
                background: '#1C1C2E', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10,
                boxShadow: '0 8px 24px rgba(0,0,0,0.5)', padding: '10px 12px', minWidth: 150,
              }}
            >
              {LEGEND_ITEMS.map(item => (
                <div key={item.type} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0' }}>
                  <div style={{
                    width: 12, height: 12, borderRadius: 3, flexShrink: 0,
                    background: BLOCK_COLORS[item.type]?.bg ?? '#666',
                  }} />
                  <span style={{ fontSize: 11, color: '#A0A0C8', fontWeight: 500 }}>{item.label}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <ScheduleInsightsPanel
        insights={scheduleInsights}
        scrollRootRef={scrollRef}
        focusScrollRootRef={insightsScrollRef}
        useFocusScrollRoot={false}
        accentColor={locColor}
      />

      {/* Teacher pills row */}
      <div style={{
        display: 'flex', gap: 4, overflowX: 'auto', padding: '2px 10px', flexShrink: 0,
        WebkitOverflowScrolling: 'touch',
      }}>
        <button
          onClick={() => setFocusedTeacher(null)}
          style={{
            flexShrink: 0, padding: '1px 8px', borderRadius: 10, lineHeight: '16px',
            border: focusedTeacher === null ? 'none' : `1px solid ${locColor}60`,
            background: focusedTeacher === null ? locColor : 'transparent',
            color: focusedTeacher === null ? '#fff' : locColor,
            fontSize: 10, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap',
          }}
        >All</button>
        {teachers.map(t => {
          const firstName = t.name.split(' ')[0]
          const isActive = focusedTeacher === t.id
          return (
            <button
              key={t.id}
              onClick={() => setFocusedTeacher(t.id)}
              style={{
                flexShrink: 0, padding: '1px 8px', borderRadius: 10, lineHeight: '16px',
                border: isActive ? 'none' : `1px solid ${locColor}60`,
                background: isActive ? locColor : 'transparent',
                color: isActive ? '#fff' : locColor,
                fontSize: 10, fontWeight: isActive ? 700 : 600,
                cursor: 'pointer', whiteSpace: 'nowrap',
              }}
            >{firstName}</button>
          )
        })}
      </div>

      {pointerDragging && pointerDragSrcBlock && !isMultiDayWeekView && (
        <div style={{
          padding: '5px 10px', flexShrink: 0, background: 'rgba(212,34,106,0.1)', borderBottom: '1px solid rgba(212,34,106,0.2)',
          fontSize: 11, color: '#D4226A', fontWeight: 600, textAlign: 'center',
        }}>
          Moving {pointerDragSrcBlock.student_name} — drop on an open slot
        </div>
      )}

      {isMultiDayWeekView ? (
        <MultiDayScheduleGrid
          dates={multiDayDates!.slice(0, 7)}
          teachers={teachers}
          blocks={blocks}
          timeSlots={timeSlots}
          formatTime={formatTime}
          onBlockClick={onBlockClick}
          onOpenSlotClick={onOpenSlotClick}
          selectedLocation={selectedLocation}
          locColor={locColor}
          teacherAvailability={teacherAvailability}
          scrollParentRef={scrollRef}
        />
      ) : (
      <div
        ref={scrollRef}
        data-schedule-insight-day={selectedDate}
        style={{ flex: 1, overflow: 'auto', WebkitOverflowScrolling: 'touch', position: 'relative' }}
      >
        <div style={{ display: 'inline-grid', gridTemplateColumns: `98px repeat(${timeSlots.length}, 76px)`, minWidth: 98 + timeSlots.length * 76 }}>
          {/* Corner cell — sticky both ways */}
          <div style={{ position: 'sticky', left: 0, top: 0, zIndex: 10, height: 28, background: 'rgba(12,11,22,0.98)', borderBottom: '1px solid rgba(255,255,255,0.06)', borderRight: '1px solid rgba(255,255,255,0.06)' }} />
          {/* Time header row — sticky top */}
          {timeSlots.map((slot, idx) => (
            <div
              key={slot}
              style={{
                position: 'sticky', top: 0, zIndex: 6, height: 28, background: 'rgba(12,11,22,0.98)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 11, fontWeight: 600, color: idx === currentSlotIdx ? locColor : 'rgba(255,255,255,0.6)',
                borderBottom: '1px solid rgba(255,255,255,0.06)',
              }}
            >{formatTime(slot)}</div>
          ))}

          {/* Teacher rows */}
          {teachers.map(t => {
            const isExpanded = expandedTeacher === t.id
            const rowH = isExpanded ? baseRowHeight + 20 : baseRowHeight
            const teacherBlocks = blockLookup.get(t.id)
            let roomName: string | null = null
            if (teacherBlocks) { for (const b of teacherBlocks.values()) { if (b.room) { roomName = b.room; break } } }

            const dayLoad = teacherLoadsMap.get(t.id)?.get(selectedDate)
            const rowTintBg =
              dayLoad && !dayLoad.skipped ? teacherRowTintBackground(dayLoad.load, dayLoad.skipped) : undefined
            const showSlotStripe = firstTeacherIdForSlotStripe != null && t.id === firstTeacherIdForSlotStripe
            const slotStripeStyle = (s: string) => ({
              position: 'absolute' as const,
              left: 0,
              right: 0,
              top: 0,
              height: 2,
              pointerEvents: 'none' as const,
              zIndex: 1,
              background: `rgba(168,85,247,${0.12 + 0.38 * (slotDensityByKey?.get(scheduleSlotKey(s)) ?? 0)})`,
            })

            return <>
              {/* Teacher name cell — sticky left */}
              <div
                key={`name-${t.id}`}
                onClick={() => setExpandedTeacher(isExpanded ? null : t.id)}
                style={{
                  position: 'sticky', left: 0, zIndex: 5, background: 'rgba(12,11,22,0.98)',
                  height: rowH, display: 'flex', flexDirection: 'column', justifyContent: 'center',
                  padding: '0 8px', borderBottom: '1px solid rgba(255,255,255,0.04)',
                  borderRight: '1px solid rgba(255,255,255,0.06)',
                  cursor: 'pointer', transition: 'height 150ms ease',
                }}
              >
                <div style={{ fontSize: 12, fontWeight: 700, color: '#E0E0F4', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {t.name.split(' ')[0]}
                </div>
                <div
                  title={dayLoad && !dayLoad.skipped ? formatLoadTooltip(dayLoad) : undefined}
                  style={{
                    height: 6,
                    width: '100%',
                    marginTop: 4,
                    borderRadius: 9999,
                    background: 'rgba(113,113,122,0.22)',
                    overflow: 'hidden',
                    flexShrink: 0,
                    pointerEvents: 'none',
                  }}
                >
                  {dayLoad && !dayLoad.skipped && (
                    <div
                      style={{
                        height: '100%',
                        width: `${dayLoad.load * 100}%`,
                        background: 'rgba(59,130,246,0.88)',
                        transition: 'width 0.28s ease',
                        maxWidth: '100%',
                        borderRadius: 9999,
                      }}
                    />
                  )}
                </div>
                {isExpanded && roomName && (
                  <span style={{ fontSize: 11, fontWeight: 700, marginTop: 1, padding: '0px 4px', borderRadius: 3, background: `${getLocationColor(selectedLocation)}25`, color: getLocationColor(selectedLocation), display: 'inline-block', width: 'fit-content' }}>{abbreviateRoom(roomName)}</span>
                )}
              </div>

              {/* Time slot cells */}
              {timeSlots.map(slot => {
                const block = teacherBlocks?.get(slot)
                const unavailMsg = isTeacherUnavailable(t.id, slot)
                if ((!block || block.block_type === 'open_time') && unavailMsg) {
                  return (
                    <div key={`${t.id}-${slot}`} style={{ height: rowH, display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'height 150ms ease', position: 'relative' }}>
                      {showSlotStripe && <div aria-hidden style={slotStripeStyle(slot)} />}
                      {rowTintBg && (
                        <div
                          aria-hidden
                          style={{
                            position: 'absolute',
                            inset: 0,
                            pointerEvents: 'none',
                            zIndex: 0,
                            backgroundColor: rowTintBg,
                            borderRadius: 4,
                          }}
                        />
                      )}
                      <span style={{ fontSize: 8, color: '#363656', fontWeight: 500, position: 'relative', zIndex: 1 }}>{unavailMsg}</span>
                    </div>
                  )
                }
                if (!block || block.block_type === 'open_time') {
                  const isPtrDrop =
                    pointerDragOver &&
                    pointerDragOver.teacherId === t.id &&
                    scheduleSlotKey(pointerDragOver.slot) === scheduleSlotKey(slot)
                  return (
                    <div
                      key={`${t.id}-${slot}`}
                      data-schedule-slot={slot}
                      data-teacher-id={t.id}
                      style={{ height: rowH, padding: '2px 1px', position: 'relative', transition: 'height 150ms ease' }}
                      onClick={() => {
                        if (pointerDragging) return
                        if (block) { onOpenSlotClick(block); return }
                        onOpenSlotClick({
                          block_id: '', teacher_id: t.id, teacher_name: t.name,
                          tenant_id: '', location_id: selectedLocation, location_name: '',
                          student_id: null, student_name: null, instrument: null,
                          block_date: selectedDate, start_time: slot,
                          end_time: (() => { const [h, m] = slot.split(':'); const endM = m === '30' ? '00' : '30'; const endH = m === '30' ? String(Number(h) + 1).padStart(2, '0') : h; return `${endH}:${endM}:00` })(),
                          status: 'available', block_type: 'open_time', is_recurring: false,
                          checked_in: false, teacher_tally: false, fifth_week: false,
                          room: null, room_id: null, notes: null,
                          original_teacher_id: null, original_teacher_name: null,
                        })
                      }}
                    >
                      {showSlotStripe && <div aria-hidden style={slotStripeStyle(slot)} />}
                      {rowTintBg && (
                        <div
                          aria-hidden
                          style={{
                            position: 'absolute',
                            inset: 0,
                            pointerEvents: 'none',
                            zIndex: 0,
                            backgroundColor: rowTintBg,
                            borderRadius: 5,
                          }}
                        />
                      )}
                      {/* Current time bar */}
                      {currentSlotIdx >= 0 && slot === timeSlots[currentSlotIdx] && (() => {
                        const slotStart = parseInt(slot.split(':')[0]) * 60 + parseInt(slot.split(':')[1])
                        const progress = (nowMinutes - slotStart) / 30
                        return <div style={{ position: 'absolute', left: progress * 76, top: 0, bottom: 0, width: 2, background: locColor, opacity: 0.6, zIndex: 3 }} />
                      })()}
                      <div style={{
                        height: '100%', borderRadius: 5,
                        border: isPtrDrop ? '2px solid rgba(74,222,128,0.65)' : '1px dashed rgba(74,222,128,0.3)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        cursor: 'pointer',
                        background: isPtrDrop ? 'rgba(74,222,128,0.12)' : 'rgba(74,222,128,0.04)',
                        transition: 'border-color 120ms ease, background 120ms ease',
                        position: 'relative',
                        zIndex: 1,
                      }}>
                        <span style={{ fontSize: 9, color: isPtrDrop ? 'rgba(74,222,128,0.95)' : 'rgba(74,222,128,0.5)', fontWeight: 600 }}>
                          {isPtrDrop ? 'Drop' : 'Open'}
                        </span>
                      </div>
                    </div>
                  )
                }
                // Teacher callout — distinct locked style
                const isTeacherCallout = block.block_type === 'call_out' && !block.is_family_callout
                if (isTeacherCallout) {
                  const tc = hasConflict(block.block_id)
                  return (
                    <div
                      key={`${t.id}-${slot}`}
                      data-schedule-slot={slot}
                      data-teacher-id={t.id}
                      data-schedule-block-id={block.block_id || undefined}
                      onClick={() => onBlockClick(block)}
                      style={{
                        height: rowH,
                        margin: '2px 1px',
                        padding: 0,
                        position: 'relative',
                        transition: 'height 150ms ease',
                        display: 'flex',
                        flexDirection: 'column',
                      }}
                    >
                      {showSlotStripe && <div aria-hidden style={slotStripeStyle(slot)} />}
                      {rowTintBg && (
                        <div
                          aria-hidden
                          style={{
                            position: 'absolute',
                            inset: 0,
                            pointerEvents: 'none',
                            zIndex: 0,
                            backgroundColor: rowTintBg,
                            borderRadius: 4,
                          }}
                        />
                      )}
                      <div
                        title={tc ? conflictTooltip(block.block_id, conflictSets.teacherConflicts, conflictSets.studentConflicts, conflictSets.crossTeacherConflicts) : undefined}
                        style={{
                          flex: 1,
                          minHeight: 0,
                          width: '100%',
                          display: 'flex',
                          flexDirection: 'column',
                          justifyContent: 'center',
                          alignItems: 'center',
                          background: '#4A4540',
                          border: tc ? '1px solid rgba(239,68,68,0.9)' : '1px solid rgba(217,119,6,0.2)',
                          borderRadius: 4,
                          cursor: 'pointer',
                          overflow: 'hidden',
                          padding: '0 3px',
                          position: 'relative',
                          zIndex: 1,
                        }}
                      >
                        {tc && (
                          <span style={{ position: 'absolute', top: 2, right: 2, zIndex: 6, fontSize: 9, fontWeight: 900, background: '#dc2626', color: '#fff', borderRadius: 4, width: 14, height: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1, pointerEvents: 'none' }}>!</span>
                        )}
                        <Lock size={10} style={{ color: '#D97706' }} />
                        <div style={{ fontSize: 8, fontWeight: 700, color: '#D97706', marginTop: 1 }}>Out</div>
                      </div>
                    </div>
                  )
                }

                const colors = BLOCK_COLORS[block.block_type] ?? BLOCK_COLORS.student_session
                const isCheckedIn = block.checked_in
                const isPendingTally = block.checked_in && !block.teacher_tally

                // Block colors — never use location brand colors.
                // Checked-in: faded block color. Not checked-in: solid block color.
                const blockBg = isCheckedIn ? `${colors.bg}50` : colors.bg
                const blockBorder = isCheckedIn
                  ? isPendingTally
                    ? `1px dashed ${colors.bg}`
                    : `1px solid ${colors.bg}`
                  : '1px solid transparent'

                const slotIdx = slotIndexInGrid(timeSlots, slot)
                const spanEnd =
                  block.student_id != null
                    ? contiguousBookedSlotRange(blocks, t.id, block.student_id, timeSlots, slotIdx).endIdx
                    : slotIdx
                const isLastInBookedSpan = block.student_id != null && slotIdx === spanEnd
                const band = resizePreviewBand(t.id, slot)
                const isPtrSource =
                  pointerDragging &&
                  pointerDragSrcBlock &&
                  pointerDragSrcBlock.block_id === block.block_id

                const showConflict = hasConflict(block.block_id)
                const conflictTitle = showConflict
                  ? conflictTooltip(block.block_id, conflictSets.teacherConflicts, conflictSets.studentConflicts, conflictSets.crossTeacherConflicts)
                  : undefined
                const showCheckCorner = isCheckedIn && !isPendingTally

                return (
                  <div
                    key={`${t.id}-${slot}`}
                    data-schedule-slot={slot}
                    data-teacher-id={t.id}
                    data-schedule-block-id={block.block_id || undefined}
                    onClick={() => {
                      if (suppressClickRef.current) return
                      onBlockClick(block)
                    }}
                    onPointerDown={(e) => {
                      if (e.button !== 0) return
                      if (!canPointerMoveBookedBlock(block)) return
                      pointerMoveRef.current = { src: block, sx: e.clientX, sy: e.clientY, active: false }
                      setPointerSession(true)
                    }}
                    style={{
                      height: rowH,
                      margin: '2px 1px',
                      padding: 0,
                      position: 'relative',
                      transition: 'height 150ms ease',
                      display: 'flex',
                      flexDirection: 'column',
                      opacity: isPtrSource ? 0.45 : 1,
                      touchAction: canPointerMoveBookedBlock(block) ? 'none' : undefined,
                    }}
                  >
                    {showSlotStripe && <div aria-hidden style={slotStripeStyle(slot)} />}
                    {rowTintBg && (
                      <div
                        aria-hidden
                        style={{
                          position: 'absolute',
                          inset: 0,
                          pointerEvents: 'none',
                          zIndex: 0,
                          backgroundColor: rowTintBg,
                          borderRadius: 4,
                        }}
                      />
                    )}
                    <div
                      title={conflictTitle}
                      style={{
                        flex: 1,
                        minHeight: 0,
                        width: '100%',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'center',
                        alignItems: 'center',
                        background: blockBg,
                        borderRadius: 4,
                        cursor: canPointerMoveBookedBlock(block) ? 'grab' : 'pointer',
                        overflow: 'hidden',
                        padding: '0 3px',
                        position: 'relative',
                        zIndex: 1,
                        border: showConflict ? '1px solid rgba(239,68,68,0.9)' : blockBorder,
                        boxShadow: isCheckedIn ? 'none' : undefined,
                      }}
                    >
                      {band === 'extend' && (
                        <div style={{ position: 'absolute', inset: 0, background: 'rgba(74,222,128,0.12)', pointerEvents: 'none', zIndex: 2, borderRadius: 3 }} />
                      )}
                      {band === 'shrink' && (
                        <div style={{ position: 'absolute', inset: 0, background: 'rgba(251,191,36,0.12)', pointerEvents: 'none', zIndex: 2, borderRadius: 3 }} />
                      )}
                      {/* Current time bar */}
                      {currentSlotIdx >= 0 && slot === timeSlots[currentSlotIdx] && (() => {
                        const slotStart = parseInt(slot.split(':')[0]) * 60 + parseInt(slot.split(':')[1])
                        const progress = (nowMinutes - slotStart) / 30
                        return <div style={{ position: 'absolute', left: progress * 76, top: 0, bottom: 0, width: 2, background: locColor, opacity: 0.6, zIndex: 3 }} />
                      })()}
                      <div style={{
                        fontSize: isExpanded ? 12 : 10,
                        fontWeight: 700, color: colors.dark ? '#fff' : '#1a1a2e',
                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                        maxWidth: '100%', textAlign: 'center', lineHeight: 1.2,
                        position: 'relative', zIndex: 4,
                      }}>
                        {block.block_type === 'makeup_session'
                          ? '\u{1F33A} Makeup'
                          : block.block_type === 'call_out' && block.is_family_callout
                            ? `\u{1F468}\u200D\u{1F469}\u200D\u{1F467} ${block.student_name ?? 'Call Out'}`
                            : (block.student_name ?? (block.block_type === 'not_bookable' ? 'Locked' : block.block_type.replace(/_/g, ' ')))}
                      </div>
                      {isExpanded && block.instrument && (
                        <div title={block.instrument} style={{ fontSize: 13, marginTop: 1, textAlign: 'center', position: 'relative', zIndex: 4 }}>
                          {getInstrumentEmoji(block.instrument)}
                        </div>
                      )}
                      {showConflict && (
                        <span style={{ position: 'absolute', top: 2, right: showCheckCorner ? 14 : 2, zIndex: 6, fontSize: 9, fontWeight: 900, background: '#dc2626', color: '#fff', borderRadius: 4, width: 14, height: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1, pointerEvents: 'none' }}>!</span>
                      )}
                      {showCheckCorner && (
                        <span style={{ position: 'absolute', top: 1, right: 2, fontSize: 8, lineHeight: 1, color: '#FFB800', zIndex: 5 }}>✓</span>
                      )}
                      {onResizeSessionEnd && canResizeSessionEnd(block) && isLastInBookedSpan && (
                        <div
                          role="separator"
                          aria-label="Resize session end time"
                          onPointerDown={(e) => {
                            e.stopPropagation()
                            if (e.button !== 0) return
                            const anchorIdx = slotIndexInGrid(timeSlots, block.start_time)
                            const { startIdx, endIdx: oe } = contiguousBookedSlotRange(blocks, t.id, block.student_id!, timeSlots, anchorIdx)
                            resizeRef.current = { anchor: block, startIdx, origEndIdx: oe, ghostEndIdx: oe }
                            setResizeLive({ teacherId: t.id, startIdx, origEndIdx: oe, ghostEndIdx: oe })
                            setResizeActive(true)
                            setResizeGhostEndIdx(oe)
                          }}
                          style={{
                            position: 'absolute', right: 0, top: 0, bottom: 0, width: 8, cursor: 'ew-resize', zIndex: 7,
                            touchAction: 'none',
                            background: 'linear-gradient(90deg, transparent, rgba(0,0,0,0.2))',
                          }}
                        />
                      )}
                    </div>
                  </div>
                )
              })}
            </>
          })}
        </div>
      </div>
      )}
    </div>
  )
}
