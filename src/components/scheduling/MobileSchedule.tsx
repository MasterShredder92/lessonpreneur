import { useState, useRef, useEffect } from 'react'
import { ChevronLeft, ChevronRight, ChevronDown, HelpCircle, Lock } from 'lucide-react'
import type { GridBlock } from '../../hooks/useScheduleGrid'
import { getInstrumentEmoji } from '../../utils/instrumentEmoji'
import { getLocationColor, abbreviateRoom } from '../../utils/locationColor'

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
  locations: Location[]
  selectedLocation: string
  onLocationChange: (id: string) => void
  selectedDate: string
  onNavigateDate: (days: number) => void
  utilization?: UtilizationItem[]
  teacherAvailability?: Map<string, { start: string; end: string }> | null
  isStudioDirector?: boolean
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

export default function MobileSchedule({ teachers, blocks, timeSlots, formatTime, onBlockClick, onOpenSlotClick, onDragDrop, locations, selectedLocation, onLocationChange, selectedDate, onNavigateDate, utilization, teacherAvailability, isStudioDirector }: MobileScheduleProps) {
  const [focusedTeacher, setFocusedTeacher] = useState<string | null>(null)
  const [expandedTeacher, setExpandedTeacher] = useState<string | null>(null)
  const [showLocationDropdown, setShowLocationDropdown] = useState(false)
  const [showLegend, setShowLegend] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  // Long-press drag state for focus mode
  const [dragSource, setDragSource] = useState<GridBlock | null>(null)
  const [dragOverSlot, setDragOverSlot] = useState<string | null>(null)
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const touchStartY = useRef(0)

  // Build lookup: teacherId -> time -> block
  const blockLookup = new Map<string, Map<string, GridBlock>>()
  for (const b of blocks) {
    if (!blockLookup.has(b.teacher_id)) blockLookup.set(b.teacher_id, new Map())
    blockLookup.get(b.teacher_id)!.set(b.start_time, b)
  }

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

  // Auto-scroll to current time on mount/navigation
  const hasAutoScrolled = useRef(false)
  useEffect(() => { hasAutoScrolled.current = false }, [selectedDate, selectedLocation])
  useEffect(() => {
    if (hasAutoScrolled.current || currentSlotIdx < 0 || !scrollRef.current) return
    const colWidth = 76
    const teacherCol = 98
    const targetScroll = Math.max(0, teacherCol + currentSlotIdx * colWidth - scrollRef.current.clientWidth / 2)
    scrollRef.current.scrollTo({ left: targetScroll, behavior: 'smooth' })
    hasAutoScrolled.current = true
  }) // eslint-disable-line react-hooks/exhaustive-deps

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
  const locColor = (currentLocation as any)?.color ?? '#D4226A'

  // Build open-count lookup from utilization data
  const openCountMap = new Map<string, number>()
  utilization?.forEach(u => openCountMap.set(u.locationId, u.openBlocks))

  // Short date format: "Mar 31"
  const dateObj = new Date(selectedDate + 'T00:00:00')
  const shortDate = dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

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
          <span style={{ fontSize: 14, fontWeight: 700, color: '#E0E0F4', minWidth: 80, textAlign: 'center' }}>{shortDate}</span>
          <button
            onClick={() => onNavigateDate(1)}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: 30, height: 30, borderRadius: 8, border: '1px solid rgba(255,255,255,0.08)',
              background: 'rgba(255,255,255,0.04)', cursor: 'pointer', color: '#A0A0C8',
            }}
          ><ChevronRight size={15} /></button>
        </div>

        {/* Drag indicator */}
        {dragSource && (
          <div style={{ padding: '6px 12px', background: 'rgba(212,34,106,0.1)', borderBottom: '1px solid rgba(212,34,106,0.2)', fontSize: 11, color: '#D4226A', fontWeight: 600, textAlign: 'center', flexShrink: 0 }}>
            Moving {dragSource.student_name} — drop on an open slot
          </div>
        )}

        {/* Vertical time list */}
        <div
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
            const isDragOver = dragSource && dragOverSlot === slot && isOpen && !unavailMsg
            const isDragging = dragSource?.start_time === slot

            return (
              <div key={slot} data-slot={slot} style={{ display: 'flex', gap: 10, minHeight: 52, alignItems: 'stretch', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                {/* Time label */}
                <div style={{
                  width: 60, flexShrink: 0, display: 'flex', alignItems: 'center',
                  fontSize: 12, fontWeight: 600, color: isCurrent ? locColor : 'rgba(255,255,255,0.6)',
                }}>
                  {formatTime(slot)}
                </div>

                {/* Block */}
                <div data-slot={slot} style={{ flex: 1, padding: '4px 0' }}>
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
                      onClick={() => { if (dragSource) return; const b = block ?? makeOpenBlock(slot); onOpenSlotClick(b) }}
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
                      onClick={() => { if (dragSource) return; onBlockClick(block!) }}
                      style={{
                        height: '100%', minHeight: 44, borderRadius: 6, padding: '6px 12px',
                        display: 'flex', flexDirection: 'column', justifyContent: 'center',
                        cursor: 'pointer',
                        background: '#4A4540',
                        border: '1px solid rgba(217,119,6,0.25)',
                      }}
                    >
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
                      onClick={() => { if (dragSource) return; onBlockClick(block!) }}
                      onTouchStart={(e) => handleTouchStart(block!, e)}
                      style={{
                        height: '100%', minHeight: 44, borderRadius: 6, padding: '6px 12px',
                        display: 'flex', flexDirection: 'column', justifyContent: 'center',
                        cursor: 'pointer',
                        background: BLOCK_COLORS[block!.block_type]?.bg ?? BLOCK_COLORS.student_session.bg,
                        opacity: isDragging ? 0.4 : 1,
                        transition: 'opacity 120ms ease',
                      }}
                    >
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
                  const c = (loc as any).color ?? '#D4226A'
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
        {/* Center: Date nav */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1, justifyContent: 'center' }}>
          <button
            onClick={() => onNavigateDate(-1)}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: 26, height: 26, borderRadius: 7, border: '1px solid rgba(255,255,255,0.08)',
              background: 'rgba(255,255,255,0.04)', cursor: 'pointer', color: '#A0A0C8',
            }}
          ><ChevronLeft size={14} /></button>
          <span style={{ fontSize: 13, fontWeight: 700, color: '#E0E0F4', minWidth: 52, textAlign: 'center' }}>{shortDate}</span>
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

      {/* Grid — single scrollable container with sticky teacher column + sticky time header */}
      <div ref={scrollRef} style={{ flex: 1, overflow: 'auto', WebkitOverflowScrolling: 'touch', position: 'relative' }}>
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
                    <div key={`${t.id}-${slot}`} style={{ height: rowH, display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'height 150ms ease' }}>
                      <span style={{ fontSize: 8, color: '#363656', fontWeight: 500 }}>{unavailMsg}</span>
                    </div>
                  )
                }
                if (!block || block.block_type === 'open_time') {
                  return (
                    <div key={`${t.id}-${slot}`} style={{ height: rowH, padding: '2px 1px', position: 'relative', transition: 'height 150ms ease' }}
                      onClick={() => {
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
                      {/* Current time bar */}
                      {currentSlotIdx >= 0 && slot === timeSlots[currentSlotIdx] && (() => {
                        const slotStart = parseInt(slot.split(':')[0]) * 60 + parseInt(slot.split(':')[1])
                        const progress = (nowMinutes - slotStart) / 30
                        return <div style={{ position: 'absolute', left: progress * 76, top: 0, bottom: 0, width: 2, background: locColor, opacity: 0.6, zIndex: 3 }} />
                      })()}
                      <div style={{
                        height: '100%', borderRadius: 5,
                        border: '1px dashed rgba(74,222,128,0.3)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        cursor: 'pointer', background: 'rgba(74,222,128,0.04)',
                      }}>
                        <span style={{ fontSize: 9, color: 'rgba(74,222,128,0.5)', fontWeight: 600 }}>Open</span>
                      </div>
                    </div>
                  )
                }
                // Teacher callout — distinct locked style
                const isTeacherCallout = block.block_type === 'call_out' && !block.is_family_callout
                if (isTeacherCallout) {
                  return (
                    <div
                      key={`${t.id}-${slot}`}
                      onClick={() => onBlockClick(block)}
                      style={{
                        height: rowH, display: 'flex', flexDirection: 'column', justifyContent: 'center',
                        alignItems: 'center', background: '#4A4540', border: '1px solid rgba(217,119,6,0.2)',
                        borderRadius: 4, margin: '2px 1px', cursor: 'pointer', overflow: 'hidden', padding: '0 3px',
                        transition: 'height 150ms ease',
                      }}
                    >
                      <Lock size={10} style={{ color: '#D97706' }} />
                      <div style={{ fontSize: 8, fontWeight: 700, color: '#D97706', marginTop: 1 }}>Out</div>
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

                return (
                  <div
                    key={`${t.id}-${slot}`}
                    onClick={() => onBlockClick(block)}
                    style={{
                      height: rowH, display: 'flex', flexDirection: 'column', justifyContent: 'center',
                      alignItems: 'center',
                      background: blockBg,
                      borderRadius: 4, margin: '2px 1px',
                      cursor: 'pointer', overflow: 'hidden', padding: '0 3px', position: 'relative',
                      transition: 'height 150ms ease',
                      border: blockBorder,
                      boxShadow: isCheckedIn ? 'none' : undefined,
                    }}
                  >
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
                    }}>
                      {block.block_type === 'makeup_session'
                        ? '\u{1F33A} Makeup'
                        : block.block_type === 'call_out' && block.is_family_callout
                          ? `\u{1F468}\u200D\u{1F469}\u200D\u{1F467} ${block.student_name ?? 'Call Out'}`
                          : (block.student_name ?? (block.block_type === 'not_bookable' ? 'Locked' : block.block_type.replace(/_/g, ' ')))}
                    </div>
                    {isExpanded && block.instrument && (
                      <div title={block.instrument} style={{ fontSize: 13, marginTop: 1, textAlign: 'center' }}>
                        {getInstrumentEmoji(block.instrument)}
                      </div>
                    )}
                    {isCheckedIn && !isPendingTally && (
                      <span style={{ position: 'absolute', top: 1, right: 2, fontSize: 8, lineHeight: 1, color: '#FFB800' }}>✓</span>
                    )}
                  </div>
                )
              })}
            </>
          })}
        </div>
      </div>
    </div>
  )
}
