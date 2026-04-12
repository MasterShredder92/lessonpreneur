import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { useUrlFilters } from '../../hooks/useUrlFilters'
import MusicLoader from '../../components/shared/MusicLoader'
import { useAuthContext } from '../../app/AuthContext'
import { useUserLocations } from '../../hooks/useUserLocations'
import { useLocations } from '../../hooks/useLocations'
import { useTeachers } from '../../hooks/useTeachers'
import { useScheduleGrid, useAssignStudent, useUnassignBlock, useChangeBlockType, useStudentsForAssignment, type GridBlock, type BlockType } from '../../hooks/useScheduleGrid'
import { useRooms } from '../../hooks/useRooms'
import { useTeacherRoomAssignmentsForDay, useSetTeacherRoomAssignment, useRemoveTeacherRoomAssignment } from '../../hooks/useTeacherRoomAssignments'
import { supabase } from '../../lib/supabase'
import { useQueryClient } from '@tanstack/react-query'
import { qk } from '../../lib/queryKeys'
import SeriesControlModal from '../../components/scheduling/SeriesControlModal'
import CheckInModal from '../../components/scheduling/CheckInModal'
import LastDayConfirmModal from '../../components/scheduling/LastDayConfirmModal'
import FirstDayConfirmModal from '../../components/scheduling/FirstDayConfirmModal'
import ConfirmModal from '../../components/shared/ConfirmModal'
import { toast } from '../../components/shared/Toast'
import TeacherCalloutWizard from '../../components/scheduling/TeacherCalloutWizard'
import MobileSchedule from '../../components/scheduling/MobileSchedule'
import BulkVirtualModal from '../../components/scheduling/BulkVirtualModal'
import { type ScheduleContext } from '../../hooks/useAI'
import { useScheduleIntelligence } from '../../hooks/useScheduleIntelligence'
import { ChevronLeft, ChevronRight, ChevronDown, Calendar, Music, MapPin, UserPlus, GripVertical, Check, Clock, DoorOpen, RefreshCw, Plus, PhoneOff, Lock } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { getInstrumentEmoji, instrumentWithEmojiTitle } from '../../utils/instrumentEmoji'
import { getLocationColor, abbreviateRoom } from '../../utils/locationColor'
import { useAutoCheckIn } from '../../hooks/useAutoCheckIn'
import { useScheduleRealtime } from '../../hooks/useScheduleRealtime'
import { IssueContextProvider } from '../../contexts/IssueContext'
import { useZiroShell } from '../../contexts/ZiroContext'
import ReportIssueButton from '../../components/shared/ReportIssueButton'
import PageGuide, { type GuideStep } from '../../components/shared/PageGuide'

function formatTime(t: string) {
  const [h, m] = t.split(':')
  const hour = parseInt(h)
  const ampm = hour >= 12 ? 'pm' : 'am'
  const display = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour
  return `${display}:${m}${ampm}`
}

function formatDateNav(d: Date) {
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })
}

function toDateString(d: Date) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

const EDGE_COLORS: Record<string, { bg: string; shadow: string; glow: string }> = {
  open_time:        { bg: 'linear-gradient(180deg, #22C55E, #16A34A)', shadow: '0 0 10px rgba(74,222,128,0.5)', glow: 'rgba(74,222,128,0.10)' },
  student_session:  { bg: 'linear-gradient(180deg, #FFB800, #FF8C00)', shadow: '0 0 10px rgba(255,184,0,0.4)', glow: 'rgba(255,184,0,0.08)' },
  first_day:        { bg: 'linear-gradient(180deg, #38BDF8, #0EA5E9)', shadow: '0 0 10px rgba(56,189,248,0.4)', glow: 'rgba(56,189,248,0.08)' },
  last_day:         { bg: 'linear-gradient(180deg, #EF4444, #B91C1C)', shadow: '0 0 10px rgba(239,68,68,0.4)', glow: 'rgba(239,68,68,0.08)' },
  not_bookable:     { bg: 'linear-gradient(180deg, #606088, #363656)', shadow: '0 0 6px rgba(72,72,112,0.3)', glow: 'rgba(72,72,112,0.06)' },
  sub:              { bg: 'linear-gradient(180deg, #A855F7, #7C3AED)', shadow: '0 0 10px rgba(168,85,247,0.4)', glow: 'rgba(168,85,247,0.08)' },
  call_out:         { bg: 'linear-gradient(180deg, #F97316, #EA580C)', shadow: '0 0 10px rgba(249,115,22,0.4)', glow: 'rgba(249,115,22,0.08)' },
  meet_greet:       { bg: 'linear-gradient(180deg, #14B8A6, #0D9488)', shadow: '0 0 10px rgba(20,184,166,0.4)', glow: 'rgba(20,184,166,0.08)' },
  teacher_training: { bg: 'linear-gradient(180deg, #6366F1, #4F46E5)', shadow: '0 0 10px rgba(99,102,241,0.4)', glow: 'rgba(99,102,241,0.08)' },
  makeup_session:   { bg: 'linear-gradient(180deg, #FF6B6B, #E55353)', shadow: '0 0 10px rgba(255,107,107,0.4)', glow: 'rgba(255,107,107,0.08)' },
}

// Block types that count toward teacher lesson tally
const COUNTS_AS_LESSON = new Set(['student_session', 'first_day', 'last_day', 'call_out', 'meet_greet', 'sub'])

interface ScheduleDetailProps {
  initialLocationId: string
  onBack: () => void
}

export default function ScheduleDetail({ initialLocationId, onBack }: ScheduleDetailProps) {
  const { tenantId, profile, role, teacherRecord, locationIds } = useAuthContext()
  const { data: userLocIds } = useUserLocations()

  // Studio director location scoping — hard-lock to their assigned location
  const isStudioDirector = role === 'studio_director'
  const studioDirectorLocationId = isStudioDirector ? (locationIds?.[0] ?? '') : ''

  // My Sessions toggle — only meaningful for dual-role studio directors
  const [viewMode, setViewMode] = useState<'all' | 'mine'>(() => {
    if (typeof window === 'undefined') return 'all'
    return window.localStorage.getItem('schedule_view_mode') === 'mine' ? 'mine' : 'all'
  })
  useEffect(() => {
    try {
      window.localStorage.setItem('schedule_view_mode', viewMode)
    } catch { /* noop */ }
  }, [viewMode])
  const qc = useQueryClient()

  const [isMobile, setIsMobile] = useState(window.innerWidth < 900)
  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 900)
    window.addEventListener('resize', handler)
    return () => window.removeEventListener('resize', handler)
  }, [])
  const { data: locations } = useLocations()
  const visibleLocations = useMemo(() => {
    const raw = (locations ?? []).filter((l: { is_active?: boolean }) => l.is_active)
    if (!userLocIds || userLocIds.length === 0) return raw
    return raw.filter((l: { id: string }) => userLocIds.includes(l.id))
  }, [locations, userLocIds])
  const { data: allTeachersList } = useTeachers()
  const { getParam, setParam } = useUrlFilters()

  const selectedDate = getParam('date') || toDateString(new Date())
  const setSelectedDate = (v: string) => {
    const today = toDateString(new Date())
    setParam('date', v === today ? '' : v)
  }
  const selectedLocation = getParam('location')
  const setSelectedLocation = (v: string) => setParam('location', v)

  // Schedule intelligence — week boundaries from selected date
  const weekBounds = useMemo(() => {
    const d = new Date(selectedDate + 'T12:00:00')
    const dow = d.getDay()
    const mon = new Date(d); mon.setDate(d.getDate() - (dow === 0 ? 6 : dow - 1))
    const sun = new Date(mon); sun.setDate(mon.getDate() + 6)
    return { start: toDateString(mon), end: toDateString(sun) }
  }, [selectedDate])

  const intelligenceLocationIds = useMemo((): string[] | null => {
    if (isStudioDirector) {
      return studioDirectorLocationId ? [studioDirectorLocationId] : []
    }
    if (userLocIds && userLocIds.length > 0) return userLocIds
    return null
  }, [isStudioDirector, studioDirectorLocationId, userLocIds])

  const { data: scheduleIntel } = useScheduleIntelligence(weekBounds.start, weekBounds.end, {
    tenantId,
    locationIds: intelligenceLocationIds,
  })
  const selectedTeacherFilter = getParam('teacher')
  const setSelectedTeacherFilter = (v: string) => setParam('teacher', v)

  type VisibilityMode = 'scheduled' | 'available' | 'all'
  const teacherVisibility = (getParam('view') || 'available') as VisibilityMode
  const setTeacherVisibility = (v: VisibilityMode) => setParam('view', v === 'available' ? '' : v)

  // Modal state
  const [assignModal, setAssignModal] = useState<GridBlock | null>(null)
  const [detailModal, setDetailModal] = useState<GridBlock | null>(null) // legacy — kept for LastDay/FirstDay/Series modal refs
  const [recurring, setRecurring] = useState(true)
  const [nonRecurringReason, setNonRecurringReason] = useState('')
  const [selectedStudentId, setSelectedStudentId] = useState('')
  const [studentSearch, setStudentSearch] = useState('')
  const [seriesBlock, setSeriesBlock] = useState<{ block: GridBlock; action: 'delete' | 'unassign' } | null>(null)
  const [checkInBlock, setCheckInBlock] = useState<GridBlock | null>(null)
  const [lastDayBlock, setLastDayBlock] = useState<GridBlock | null>(null)
  const [lastDayResult, setLastDayResult] = useState<string | null>(null)
  const [firstDayBlock, setFirstDayBlock] = useState<GridBlock | null>(null)
  const [firstDayResult, setFirstDayResult] = useState<string | null>(null)
  const [assignRoom, setAssignRoom] = useState('')
  const [assignBlockType, setAssignBlockType] = useState<BlockType>('student_session')
  const [assignError, setAssignError] = useState<string | null>(null)
  const [showLockFlow, setShowLockFlow] = useState(false)
  const [lockReason, setLockReason] = useState('')
  const [lockRecurring, setLockRecurring] = useState(false)
  const [lockSubmitting, setLockSubmitting] = useState(false)
  const [showCalendar, setShowCalendar] = useState(false)
  const [showAddTeacher, setShowAddTeacher] = useState(false)
  const [showCalloutWizard, setShowCalloutWizard] = useState(false)
  const [calloutPreselectedTeacherId, setCalloutPreselectedTeacherId] = useState<string | undefined>(undefined)
  const [bulkVirtualOpen, setBulkVirtualOpen] = useState(false)
  const [showLegend, setShowLegend] = useState(false)
  const [pendingConfirm, setPendingConfirm] = useState<{ title: string; message: string; variant?: 'warning' | 'danger' | 'info'; onConfirm: () => void } | null>(null)

  const effectiveLocation = useMemo(() => {
    if (isStudioDirector) return studioDirectorLocationId
    const raw = selectedLocation || initialLocationId
    if (userLocIds && userLocIds.length > 0) {
      if (raw && userLocIds.includes(raw)) return raw
      return userLocIds[0] ?? ''
    }
    return raw ?? ''
  }, [isStudioDirector, studioDirectorLocationId, selectedLocation, initialLocationId, userLocIds])

  const { data: gridData, isLoading } = useScheduleGrid(selectedDate, effectiveLocation || null)

  // Drag state
  const [dragBlock, setDragBlock] = useState<GridBlock | null>(null)
  const [dragOverTarget, setDragOverTarget] = useState<string | null>(null)

  const { setPageContext: setZiroPageContext } = useZiroShell()

  useAutoCheckIn(effectiveLocation, new Date(selectedDate + 'T12:00:00'))
  useScheduleRealtime(selectedDate, effectiveLocation || undefined)
  const { data: allStudents } = useStudentsForAssignment({ enabled: !!assignModal })
  const { data: rooms } = useRooms(effectiveLocation || undefined)

  // Teacher daily room assignments
  const { data: dailyRoomMap = {} } = useTeacherRoomAssignmentsForDay(effectiveLocation || undefined, selectedDate || undefined)
  const setTeacherRoom = useSetTeacherRoomAssignment()
  const removeTeacherRoom = useRemoveTeacherRoomAssignment()
  const [roomPopoverTeacher, setRoomPopoverTeacher] = useState<string | null>(null)

  /** Grid snapshot for the global Ziro schedule assistant (mounted in app shell). */
  const activeLocationName = locations?.find((l: any) => l.id === effectiveLocation)?.name?.replace(' Music Lessons', '') ?? ''
  const scheduleContextForZiro: ScheduleContext | null = useMemo(() => {
    if (!gridData || !effectiveLocation) return null
    return {
      location_id: effectiveLocation,
      location_name: activeLocationName,
      date: selectedDate,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      teachers: gridData.teachers.map((t: any) => ({ id: t.id, name: t.name })),
      blocks: gridData.blocks.map((b: GridBlock) => ({
        block_id: b.block_id,
        teacher_id: b.teacher_id,
        teacher_name: b.teacher_name,
        student_id: b.student_id,
        student_name: b.student_name,
        instrument: b.instrument,
        start_time: b.start_time,
        end_time: b.end_time,
        status: b.status,
        block_type: b.block_type,
        room: b.room,
      })),
      time_slots: gridData.timeSlots,
    }
  }, [gridData, effectiveLocation, activeLocationName, selectedDate])

  const ziroSchedulePatch = useMemo(
    () => ({
      page: 'schedule' as const,
      date: selectedDate,
      locationId: effectiveLocation || null,
      scheduleContext: scheduleContextForZiro,
      activeDrag: dragBlock
        ? {
            source_block_id: dragBlock.block_id,
            student_id: dragBlock.student_id,
            teacher_id: dragBlock.teacher_id,
          }
        : null,
    }),
    [selectedDate, effectiveLocation, dragBlock, scheduleContextForZiro],
  )
  useEffect(() => {
    setZiroPageContext(ziroSchedulePatch)
  }, [setZiroPageContext, ziroSchedulePatch])

  const gridWrapperRef = useRef<HTMLDivElement>(null)
  const [_gridMounted, setGridMounted] = useState(false) // triggers re-render for time indicator DOM measurement
  const gridCallbackRef = useCallback((node: HTMLDivElement | null) => {
    gridWrapperRef.current = node
    setGridMounted(!!node)
  }, [])
  // Close room popover on outside click — uses ref to avoid leaked listeners
  const popoverListenerRef = useRef<(() => void) | null>(null)
  useEffect(() => {
    // Clean up any previous listener
    if (popoverListenerRef.current) {
      document.removeEventListener('click', popoverListenerRef.current)
      popoverListenerRef.current = null
    }
    if (!roomPopoverTeacher) return
    const handler = () => setRoomPopoverTeacher(null)
    popoverListenerRef.current = handler
    // Delay add so the opening click doesn't immediately close
    const t = setTimeout(() => {
      if (popoverListenerRef.current === handler) {
        document.addEventListener('click', handler)
      }
    }, 10)
    return () => {
      clearTimeout(t)
      document.removeEventListener('click', handler)
      if (popoverListenerRef.current === handler) popoverListenerRef.current = null
    }
  }, [roomPopoverTeacher])
  // Auto-scroll to current time indicator on mount/navigation
  const hasAutoScrolled = useRef(false)
  useEffect(() => { hasAutoScrolled.current = false }, [selectedDate, effectiveLocation])
  const assignStudent = useAssignStudent()
  const unassignBlock = useUnassignBlock()
  const changeBlockType = useChangeBlockType()

  // Location hours for the selected date
  const selectedDow = new Date(selectedDate + 'T00:00:00').getDay()
  const { data: locationHours } = useQuery({
    queryKey: qk.locations.hours(effectiveLocation, selectedDow),
    enabled: !!effectiveLocation,
    queryFn: async () => {
      const { data } = await supabase.from('location_hours').select('*').eq('location_id', effectiveLocation).eq('day_of_week', selectedDow).single()
      return data as { open_time: string; close_time: string; is_closed: boolean } | null
    },
  })

  // Teachers assigned to the selected location
  // Teachers who have ANY active availability at this location (not just today)
  const { data: locationTeacherIds } = useQuery({
    queryKey: ['teacher-at-location', effectiveLocation],
    enabled: !!effectiveLocation,
    queryFn: async () => {
      // Check both teacher_locations AND teacher_availability
      const { data: fromLocs } = await supabase.from('teacher_locations').select('teacher_id').eq('location_id', effectiveLocation)
      const { data: fromAvail } = await supabase.from('teacher_availability').select('teacher_id').eq('location_id', effectiveLocation).eq('is_active', true)
      const ids = new Set<string>()
      fromLocs?.forEach((r: any) => ids.add(r.teacher_id))
      fromAvail?.forEach((r: any) => ids.add(r.teacher_id))
      return ids
    },
  })

  // Teacher availability for this day + location
  const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
  const selectedDayName = dayNames[new Date(selectedDate + 'T00:00:00').getDay()]
  const { data: teacherAvailability } = useQuery({
    queryKey: qk.teachers.availSchedule(effectiveLocation, selectedDayName),
    enabled: !!effectiveLocation,
    queryFn: async () => {
      const { data } = await supabase.from('teacher_availability')
        .select('teacher_id, start_time, end_time')
        .eq('location_id', effectiveLocation)
        .eq('day_of_week', selectedDayName)
        .eq('is_active', true)
      const map = new Map<string, { start: string; end: string }>()
      data?.forEach((r: any) => map.set(r.teacher_id, { start: r.start_time, end: r.end_time }))
      return map
    },
  })

  // Sub-available teachers (not at this location but can sub)
  const { data: subTeachers } = useQuery({
    queryKey: ['sub-teachers', tenantId, effectiveLocation],
    enabled: !!effectiveLocation && !!tenantId,
    queryFn: async () => {
      const { data } = await supabase.from('teachers')
        .select('id, sub_available, profile:profiles!teachers_profile_id_fkey(first_name, last_name)')
        .eq('tenant_id', tenantId!)
        .eq('is_active', true)
        .eq('sub_available', true)
      return data ?? []
    },
  })

  useEffect(() => {
    if (!selectedLocation && initialLocationId) {
      setSelectedLocation(initialLocationId)
    }
  }, [selectedLocation, initialLocationId, setSelectedLocation])

  useEffect(() => {
    if (isStudioDirector) return
    if (!userLocIds || userLocIds.length === 0) return
    const raw = selectedLocation || initialLocationId
    if (raw && !userLocIds.includes(raw) && userLocIds[0]) {
      setSelectedLocation(userLocIds[0])
    }
  }, [isStudioDirector, userLocIds, selectedLocation, initialLocationId, setSelectedLocation])

  const navigateDate = (days: number) => {
    const d = new Date(selectedDate + 'T00:00:00')
    d.setDate(d.getDate() + days)
    setSelectedDate(toDateString(d))
  }

  // Check if a time is outside a teacher's availability
  const isTeacherUnavailable = (teacherId: string, time: string): string | null => {
    if (!teacherAvailability || !teacherAvailability.has(teacherId)) return null // No data = assume available
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
      return `Not available until ${startH}:${String(sm).padStart(2, '0')}${startAmPm}`
    }
    if (mins >= endMins) return 'Done for the day'
    return null
  }

  // Check if a time is outside location operating hours
  const isOutsideHours = (time: string) => {
    if (!locationHours || locationHours.is_closed) return true
    const [h, m] = time.split(':').map(Number)
    const mins = h * 60 + m
    const [oh, om] = locationHours.open_time.split(':').map(Number)
    const [ch, cm] = locationHours.close_time.split(':').map(Number)
    return mins < oh * 60 + om || mins >= ch * 60 + cm
  }

  // Click empty cell to create a new block and open assign modal
  const handleClickEmptyCell = async (teacherId: string, teacherName: string, time: string) => {
    if (!tenantId || !effectiveLocation) return
    // Warn if outside operating hours
    const proceedWithBooking = async () => {
      const h = Math.floor(parseFloat(time.replace(':', '.')))
      const m = time.split(':')[1]
      const endH = m === '30' ? h + 1 : h
      const endM = m === '30' ? '00' : '30'
      const endTime = `${String(endH).padStart(2, '0')}:${endM}:00`

      const { data: newBlock, error } = await supabase.from('schedule_blocks').insert({
        tenant_id: tenantId,
        location_id: effectiveLocation,
        teacher_id: teacherId,
        block_date: selectedDate,
        start_time: time,
        end_time: endTime,
        status: 'available',
        block_type: 'open_time',
        is_recurring: false,
      }).select().single()

      if (error || !newBlock) return

      // Open assign modal for the new block
      setAssignModal({
        block_id: newBlock.id,
        tenant_id: tenantId,
        location_id: effectiveLocation,
        location_name: '',
        teacher_id: teacherId,
        teacher_name: teacherName,
        student_id: null,
        student_name: null,
        instrument: null,
        block_date: selectedDate,
        start_time: time,
        end_time: endTime,
        status: 'available',
        block_type: 'open_time',
        is_recurring: false,
        checked_in: false,
        fifth_week: false,
        room: null,
        notes: null,
      })
      setRecurring(true)
    setNonRecurringReason('')
      setSelectedStudentId('')
      setStudentSearch('')
      setAssignRoom('')
      qc.invalidateQueries({ queryKey: qk.schedule.all }); qc.invalidateQueries({ queryKey: qk.schedule.intelligence })
    }

    if (isOutsideHours(time)) {
      const locName = locations?.find((l: any) => l.id === effectiveLocation)?.name?.replace(' Music Lessons', '') ?? 'This location'
      const hoursStr = locationHours && !locationHours.is_closed
        ? `${formatTime(locationHours.open_time)} – ${formatTime(locationHours.close_time)}`
        : 'closed'
      setPendingConfirm({
        title: 'Outside Operating Hours',
        message: `${formatTime(time)} is outside ${locName}'s operating hours (${hoursStr}). Are you sure you want to book here?`,
        variant: 'warning',
        onConfirm: () => { setPendingConfirm(null); proceedWithBooking() },
      })
      return
    }
    proceedWithBooking()
  }

  const handleAssign = async () => {
    if (!assignModal || !selectedStudentId) return
    // Resolve effective room: explicit selection > daily teacher assignment > none
    const teacherDailyRoomId = dailyRoomMap?.[assignModal.teacher_id]?.roomId ?? ''
    const effectiveRoomId = assignRoom || teacherDailyRoomId
    // If room selected (explicit or from daily default), check for conflict then update
    if (effectiveRoomId) {
      const room = rooms?.find((r: any) => r.id === effectiveRoomId)
      const { data: conflict } = await supabase
        .from('schedule_blocks')
        .select('id')
        .eq('block_date', assignModal.block_date)
        .eq('start_time', assignModal.start_time)
        .eq('room_id', effectiveRoomId)
        .neq('id', assignModal.block_id)
        .not('student_id', 'is', null)
        .limit(1)
      if (conflict && conflict.length > 0) {
        toast(`Room "${room?.name ?? 'selected'}" is already booked at this time. Pick another room.`, 'error')
        return
      }
      const { error: roomErr } = await supabase.from('schedule_blocks').update({ room_id: effectiveRoomId, room: room?.name ?? null }).eq('id', assignModal.block_id)
      if (roomErr) { toast('Failed to set room: ' + roomErr.message, 'error'); return }
    }
    try {
      await assignStudent.mutateAsync({
        blockId: assignModal.block_id,
        studentId: selectedStudentId,
        recurring,
      })
      setAssignModal(null)
      setSelectedStudentId('')
      setRecurring(true)
      setNonRecurringReason('')
      setStudentSearch('')
      setAssignRoom('')
    } catch (err: any) {
      toast(err.message || 'Failed to assign student', 'error')
    }
  }

  const handleUnassign = () => {
    if (!detailModal) return
    if (detailModal.is_recurring) {
      setSeriesBlock({ block: detailModal, action: 'unassign' })
    } else {
      unassignBlock.mutateAsync(detailModal.block_id).then(() => setDetailModal(null)).catch((err: any) => toast(err.message || 'Failed to unassign', 'error'))
    }
  }

  const handleDeleteBlock = async () => {
    if (!detailModal) return
    const { error } = await supabase.from('schedule_blocks').delete().eq('id', detailModal.block_id)
    if (error) { toast('Failed to delete block: ' + error.message, 'error'); return }
    qc.invalidateQueries({ queryKey: qk.schedule.all }); qc.invalidateQueries({ queryKey: qk.schedule.intelligence })
    toast('Block deleted', 'success')
    setDetailModal(null)
  }

  // Drag and drop handler — with sibling proximity warning
  const handleDrop = async (targetBlock: GridBlock) => {
    if (!dragBlock || !dragBlock.student_id || targetBlock.block_type !== 'open_time') return

    // Check for siblings scheduled on the same day
    const { data: student } = await supabase.from('students').select('family_id').eq('id', dragBlock.student_id).single()
    if (student?.family_id) {
      const { data: siblings } = await supabase.from('students').select('id, first_name').eq('family_id', student.family_id).neq('id', dragBlock.student_id)
      if (siblings && siblings.length > 0) {
        const siblingIds = siblings.map(s => s.id)
        const { data: sibBlocks } = await supabase.from('schedule_blocks')
          .select('student_id, start_time')
          .eq('block_date', targetBlock.block_date)
          .eq('location_id', targetBlock.location_id)
          .in('student_id', siblingIds)
          .eq('status', 'booked')
        if (sibBlocks && sibBlocks.length > 0) {
          const targetMinutes = parseInt(targetBlock.start_time.split(':')[0]) * 60 + parseInt(targetBlock.start_time.split(':')[1])
          const tooFar = sibBlocks.some((sb: any) => {
            const sibMin = parseInt(sb.start_time.split(':')[0]) * 60 + parseInt(sb.start_time.split(':')[1])
            return Math.abs(targetMinutes - sibMin) > 30
          })
          if (tooFar) {
            const sibNames = siblings.map(s => s.first_name).join(', ')
            const capturedDragBlock = dragBlock
            const capturedTarget = targetBlock
            setPendingConfirm({
              title: 'Sibling Schedule Gap',
              message: `Heads up — ${sibNames} (sibling) is already scheduled today but more than 30 minutes apart from this time. Are you sure you want to move this lesson here?`,
              variant: 'warning',
              onConfirm: async () => {
                setPendingConfirm(null)
                // Continue with teacher change check and move — use centralized executeDrop
                if (capturedDragBlock.teacher_id !== capturedTarget.teacher_id) {
                  setPendingConfirm({
                    title: 'Teacher Change',
                    message: `You're moving ${capturedDragBlock.student_name} from ${capturedDragBlock.teacher_name} to a different teacher. Are you sure?`,
                    variant: 'warning',
                    onConfirm: async () => {
                      setPendingConfirm(null)
                      await executeDrop(capturedDragBlock, capturedTarget)
                      setDragBlock(null); setDragOverTarget(null)
                    },
                  })
                  return
                }
                await executeDrop(capturedDragBlock, capturedTarget)
                setDragBlock(null); setDragOverTarget(null)
              },
            })
            setDragBlock(null); setDragOverTarget(null); return
          }
        }
      }
    }

    // Teacher change warning
    const executeDrop = async (source: GridBlock, target: GridBlock) => {
      // Preserve sub metadata: block_type, original_teacher_id, original_teacher_name
      const isSub = source.block_type === 'sub' || !!source.original_teacher_id
      const targetPayload: Record<string, any> = {
        student_id: source.student_id, status: 'booked',
        block_type: source.block_type,
        original_teacher_id: source.original_teacher_id ?? null,
        original_teacher_name: source.original_teacher_name ?? null,
      }
      const { error: e1 } = await supabase.from('schedule_blocks').update(targetPayload).eq('id', target.block_id)
      if (e1) { toast(`Failed to move: ${e1.message}`, 'error'); return }
      const { error: e2 } = await supabase.from('schedule_blocks').update({
        student_id: null, status: 'available', block_type: 'open_time', is_recurring: false,
        original_teacher_id: null, original_teacher_name: null,
      }).eq('id', source.block_id)
      if (e2) toast('Warning: moved but old slot not cleared', 'error')
      else toast(isSub ? 'Sub lesson moved' : 'Student moved', 'success')
      await qc.invalidateQueries({ queryKey: qk.schedule.all }); qc.invalidateQueries({ queryKey: qk.schedule.intelligence })
    }

    if (dragBlock.teacher_id !== targetBlock.teacher_id) {
      const capturedDrag = dragBlock
      const capturedTarget = targetBlock
      setPendingConfirm({
        title: 'Teacher Change',
        message: `You're moving ${dragBlock.student_name} from ${dragBlock.teacher_name} to a different teacher. Are you sure?`,
        variant: 'warning',
        onConfirm: async () => {
          setPendingConfirm(null)
          await executeDrop(capturedDrag, capturedTarget)
          setDragBlock(null); setDragOverTarget(null)
        },
      })
      setDragBlock(null); setDragOverTarget(null)
      return
    }

    // Move student from source to target
    await executeDrop(dragBlock, targetBlock)
    setDragBlock(null)
    setDragOverTarget(null)
  }

  // Data — merge grid teachers with all teachers at this location
  const allGridTeachers = gridData?.teachers ?? []
  const allBlocks = gridData?.blocks ?? []
  const gridTimeSlots = gridData?.timeSlots ?? []

  // Build teacher list: teachers with availability for this day at this location
  // PLUS any teachers who already have blocks (even if availability was removed after booking)
  const gridTeacherIds = new Set(allGridTeachers.map(t => t.id))
  const availTeacherIds = teacherAvailability ? new Set(teacherAvailability.keys()) : null
  const fullTeacherList = [...allGridTeachers]

  // Add teachers from availability who don't have blocks yet
  if (availTeacherIds && availTeacherIds.size > 0) {
    allTeachersList?.forEach((t: any) => {
      if (t.is_active && availTeacherIds.has(t.id) && !gridTeacherIds.has(t.id)) {
        fullTeacherList.push({ id: t.id, name: `${t.first_name ?? t.profile?.first_name ?? ''} ${t.last_name ?? t.profile?.last_name ?? ''}`.trim(), photo_url: t.photo_url ?? null })
      }
    })
  }

  // Remove teachers from grid who have NO availability on this day AND no booked blocks
  // (they show up from open_time blocks but shouldn't be visible if not available)
  const bookedTeacherIds = new Set<string>()
  for (const b of allBlocks) {
    if (b.student_id || b.block_type === 'teacher_training' || b.block_type === 'not_bookable') {
      bookedTeacherIds.add(b.teacher_id)
    }
  }

  // Time range from location hours, fallback 2pm-9pm
  const isClosed = locationHours?.is_closed ?? false
  const defaultSlots: string[] = []
  if (!isClosed) {
    const openH = locationHours ? parseInt(locationHours.open_time.split(':')[0]) : 14
    const openM = locationHours ? parseInt(locationHours.open_time.split(':')[1]) : 0
    const closeH = locationHours ? parseInt(locationHours.close_time.split(':')[0]) : 21
    const closeM = locationHours ? parseInt(locationHours.close_time.split(':')[1]) : 0
    const startMin = openH * 60 + openM
    const endMin = closeH * 60 + closeM
    for (let m = startMin; m < endMin; m += 30) {
      const h = Math.floor(m / 60)
      const mm = m % 60
      defaultSlots.push(`${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00`)
    }
  }
  const allTimeSet = new Set([...defaultSlots, ...gridTimeSlots])
  const timeSlots = [...allTimeSet].sort()

  // Auto-scroll to current time indicator (must be after timeSlots declaration)
  useEffect(() => {
    if (hasAutoScrolled.current || !gridWrapperRef.current || !timeSlots?.length) return
    const isViewingToday = toDateString(new Date()) === selectedDate
    if (!isViewingToday) return
    const nowP = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', hour: 'numeric', minute: 'numeric', hour12: false }).formatToParts(new Date())
    const nowM = parseInt(nowP.find(p => p.type === 'hour')?.value ?? '0') * 60 + parseInt(nowP.find(p => p.type === 'minute')?.value ?? '0')
    const firstM = parseInt(timeSlots[0].split(':')[0]) * 60 + parseInt(timeSlots[0].split(':')[1])
    const lastM = parseInt(timeSlots[timeSlots.length - 1].split(':')[0]) * 60 + parseInt(timeSlots[timeSlots.length - 1].split(':')[1]) + 30
    if (nowM < firstM || nowM > lastM) return
    const progress = (nowM - firstM) / (lastM - firstM)
    const scrollWidth = gridWrapperRef.current.scrollWidth
    const clientWidth = gridWrapperRef.current.clientWidth
    const targetScroll = Math.max(0, progress * scrollWidth - clientWidth / 2)
    gridWrapperRef.current.scrollTo({ left: targetScroll, behavior: 'smooth' })
    hasAutoScrolled.current = true
  })

  const scheduledTeacherIds = new Set<string>()
  const subTeacherIds = new Set<string>()
  for (const b of allBlocks) {
    if (b.block_type !== 'open_time' && b.block_type !== 'not_bookable') scheduledTeacherIds.add(b.teacher_id)
    if (b.block_type === 'sub') subTeacherIds.add(b.teacher_id)
  }

  // Sort all teachers alphabetically by first name
  fullTeacherList.sort((a, b) => a.name.localeCompare(b.name))

  let visibleTeachers = fullTeacherList
  const showMineOnly = viewMode === 'mine' && !!teacherRecord && !isMobile
  if (showMineOnly) {
    visibleTeachers = fullTeacherList.filter((t) => t.id === teacherRecord!.id)
  } else if (selectedTeacherFilter) {
    visibleTeachers = fullTeacherList.filter((t) => t.id === selectedTeacherFilter)
  } else if (teacherVisibility === 'scheduled') {
    visibleTeachers = fullTeacherList.filter((t) => scheduledTeacherIds.has(t.id) || subTeacherIds.has(t.id))
  }

  const teachers = visibleTeachers
  const blocks = allBlocks
  const allGridTeachersFull = fullTeacherList

  // Grid lookup
  const gridLookup = new Map<string, Map<string, GridBlock>>()
  for (const b of blocks) {
    if (showMineOnly && b.teacher_id !== teacherRecord!.id) continue
    if (!showMineOnly && selectedTeacherFilter && b.teacher_id !== selectedTeacherFilter) continue
    if (!gridLookup.has(b.start_time)) gridLookup.set(b.start_time, new Map())
    gridLookup.get(b.start_time)!.set(b.teacher_id, b)
  }

  // Count booked blocks per teacher (for tally — only types that count as lessons)
  const teacherBookedCount = new Map<string, number>()
  for (const b of blocks) {
    if (COUNTS_AS_LESSON.has(b.block_type)) {
      teacherBookedCount.set(b.teacher_id, (teacherBookedCount.get(b.teacher_id) ?? 0) + 1)
    }
  }

  // Rooms used at each time slot (for availability)
  const roomsUsedAtTime = new Map<string, Set<string>>()
  for (const b of blocks) {
    if (b.room && b.student_id) {
      const key = b.start_time
      if (!roomsUsedAtTime.has(key)) roomsUsedAtTime.set(key, new Set())
      roomsUsedAtTime.get(key)!.add(b.room)
    }
  }

  const filteredStudents = allStudents?.filter((s) => {
    if (!studentSearch) return true
    const q = studentSearch.toLowerCase()
    return `${s.first_name} ${s.last_name}`.toLowerCase().includes(q) || (s.family_name ?? '').toLowerCase().includes(q)
  }) ?? []

  const currentDate = new Date(selectedDate + 'T00:00:00')
  const isToday = toDateString(new Date()) === selectedDate

  // Current location color
  const currentLoc = locations?.find((l: any) => l.id === effectiveLocation)
  const locColor = (currentLoc as any)?.color ?? '#D4226A'
  const locName = currentLoc?.name?.replace(' Music Lessons', '') ?? 'Schedule'

  // Available rooms for assign modal
  // All active rooms — mark which are taken at this time
  const allActiveRooms = rooms?.filter((r: any) => r.is_active && r.status === 'active') ?? []
  const takenRoomNames = assignModal ? (roomsUsedAtTime.get(assignModal.start_time) ?? new Set()) : new Set()
  const availableRoomsForAssign = allActiveRooms.map((r: any) => ({
    ...r,
    taken: takenRoomNames.has(r.name),
  }))

  const scheduleGuideSteps: GuideStep[] = useMemo(() => ([
    {
      id: 'location',
      targetSelector: '[data-guide-id="location-selector"]',
      title: 'Your Location',
      body: "This shows your studio location. As a studio director, you're locked to your assigned location — this keeps your schedule focused on what matters to you. You'll always see your studio's full teaching grid here.",
    },
    {
      id: 'date-nav',
      targetSelector: '[data-guide-id="date-nav"]',
      title: 'Navigating the Week',
      body: "Tap the arrows to move forward or backward by week. The schedule always shows 7 days at a time. Use this to look ahead at upcoming sessions or review what happened earlier in the week.",
    },
    {
      id: 'my-sessions',
      targetSelector: '[data-tour-id="my-sessions-toggle"]',
      title: 'Your Personal Sessions',
      body: "Since you're also a teacher, this toggle filters the entire schedule down to only the sessions you're personally teaching. Tap 'My Sessions' to see just your week, tap 'All Sessions' to see the full studio grid.",
      skipIf: !teacherRecord,
    },
    {
      id: 'grid',
      targetSelector: '[data-guide-id="schedule-grid"]',
      title: 'The Teaching Grid',
      body: "Each column is a day, each row is a teacher. Colored blocks are booked sessions — tap any block to see details. Yellow blocks are open time slots available for new students. Coral blocks are makeup sessions. Gray blocks are not available.",
    },
    {
      id: 'legend',
      targetSelector: '[data-guide-id="legend-button"]',
      title: 'Reading the Schedule',
      body: "Tap the legend to see what every color means. Pink/red = active student session. Yellow = open slot. Coral = makeup session. Gray = not bookable. Orange with family icon = family called out. Knowing these at a glance lets you read the day in seconds.",
    },
    {
      id: 'tap-session',
      targetSelector: '[data-guide-block-type="student_session"]',
      title: 'Tap Any Session',
      body: "Tap a session block to open its details. From here you can check the student in when they arrive, mark a call-out if the family contacts you directly, or see teacher and student info. Everything that happens in a session starts with this tap.",
    },
    {
      id: 'check-in',
      targetSelector: '[data-guide-block-type="student_session"]',
      title: 'Checking Students In',
      body: "When a student arrives, tap their block then tap Check In. This logs the session as completed and notifies the teacher to complete their session recap afterward. Never skip check-in — it's how teacher pay and attendance are tracked.",
    },
    {
      id: 'call-out',
      targetSelector: '[data-guide-family-callout="true"], [data-guide-block-type="call_out"], [data-guide-id="legend-button"]',
      title: 'When a Family Calls Out',
      body: "When a family cancels through the parent app, their block automatically flips to a call-out and appears in your dashboard feed. A coral makeup block auto-books on their next fifth week. You don't have to do anything — the system handles it. Just acknowledge it in the dashboard feed.",
    },
    {
      id: 'open-slots',
      targetSelector: '[data-guide-block-type="open_time"]',
      title: 'Open Slots = Opportunity',
      body: "Yellow blocks are open teaching slots with no student assigned yet. These are your growth opportunities. When a lead converts and picks a time, it fills one of these yellow blocks and turns it into a session.",
    },
  ]), [teacherRecord])

  // Secondary role check (primary is RouteGuard)
  if (role !== 'owner' && role !== 'admin' && role !== 'company_director' && role !== 'studio_director') {
    return <div className="page" style={{ padding: 40, textAlign: 'center', color: '#8080A8' }}>Access restricted to owners and admins.</div>
  }

  return (
    <IssueContextProvider page="Schedule">
    <div className="page" style={{ maxWidth: 'none' }}>
      {/* Unified toolbar — locations | date nav | actions (desktop only) */}
      {!isMobile && <div style={{ display: 'flex', alignItems: 'center', padding: '8px 12px', background: 'rgba(255,255,255,0.02)', border: `1px solid ${locColor}25`, borderRadius: 12, marginBottom: 8, position: 'relative', overflow: 'visible', zIndex: 50, gap: 8, flexWrap: 'wrap' }}>
        {/* Back to overview */}
        {!isStudioDirector && (
          <button onClick={onBack} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '5px 12px', borderRadius: 7, border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.04)', color: '#A0A0C8', fontSize: 11, fontWeight: 600, cursor: 'pointer', flexShrink: 0 }} title="Back to schedule overview">
            <ChevronLeft size={14} /> Overview
          </button>
        )}
        {/* Location tabs — hidden for studio directors, replaced with static location name */}
        {isStudioDirector ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 10, height: 10, borderRadius: 4, background: locColor, boxShadow: `0 0 8px ${locColor}60` }} />
            <span style={{ fontSize: 14, fontWeight: 800, color: locColor, letterSpacing: '-0.01em' }}>Schedule — {activeLocationName}</span>
          </div>
        ) : (
          <div data-guide-id="location-selector" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {visibleLocations.map((loc: any) => {
              const c = (loc as any).color ?? '#D4226A'
              const active = loc.id === effectiveLocation
              return (
                <button key={loc.id} onClick={() => setSelectedLocation(loc.id)} style={{
                  padding: '5px 14px', borderRadius: 8, fontSize: 12, fontWeight: 800, cursor: 'pointer', letterSpacing: '-0.01em',
                  background: active ? c : 'transparent', color: active ? '#fff' : '#606088',
                  border: active ? `2px solid ${c}` : '2px solid rgba(255,255,255,0.06)',
                  boxShadow: active ? `0 4px 16px ${c}40` : 'none', transition: 'all 150ms ease',
                }}>{loc.name.replace(' Music Lessons', '')}</button>
              )
            })}
          </div>
        )}

        {/* Separator */}
        <div style={{ width: 1, height: 24, background: 'rgba(255,255,255,0.08)', flexShrink: 0 }} />

        {/* Sub + Call Out — left side */}
        <button onClick={() => setShowAddTeacher(true)} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '5px 12px', borderRadius: 7, border: `1px solid ${locColor}40`, background: `${locColor}15`, color: locColor, fontSize: 11, fontWeight: 600, cursor: 'pointer' }}><Plus size={12} /> Sub</button>
        <button onClick={() => { setCalloutPreselectedTeacherId(undefined); setShowCalloutWizard(true) }} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '5px 12px', borderRadius: 7, border: '1px solid rgba(239,68,68,0.4)', background: 'rgba(239,68,68,0.1)', color: '#EF4444', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}><PhoneOff size={12} /> Call Out</button>
        <button onClick={() => setBulkVirtualOpen(true)} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '5px 12px', borderRadius: 7, border: '1px solid rgba(0,188,212,0.4)', background: 'rgba(0,188,212,0.1)', color: '#00BCD4', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}><DoorOpen size={12} /> Go Virtual</button>

        {/* Center — date nav + calendar */}
        <div data-guide-id="date-nav" style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 'auto', marginRight: 'auto' }}>
          <button onClick={() => navigateDate(-1)} style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#A0A0C8' }}><ChevronLeft size={16} /></button>
          <button onClick={() => setSelectedDate(toDateString(new Date()))} style={{ padding: '5px 12px', borderRadius: 7, fontSize: 12, fontWeight: 700, cursor: 'pointer', background: isToday ? locColor : 'rgba(255,255,255,0.06)', color: isToday ? '#fff' : '#A0A0C8', border: isToday ? 'none' : '1px solid rgba(255,255,255,0.08)' }}>Today</button>
          <button onClick={() => navigateDate(1)} style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#A0A0C8' }}><ChevronRight size={16} /></button>
          <div style={{ position: 'relative' }}>
            <button onClick={() => setShowCalendar(!showCalendar)} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
              <Calendar size={16} style={{ color: locColor }} />
              <span style={{ fontSize: 15, fontWeight: 700, color: '#E0E0F4', letterSpacing: '-0.02em' }}>{formatDateNav(currentDate)}</span>
              <ChevronDown size={12} style={{ color: '#8080A8' }} />
            </button>
            {showCalendar && <MiniCalendar selectedDate={selectedDate} onSelect={(d) => { setSelectedDate(d); setShowCalendar(false) }} onClose={() => setShowCalendar(false)} />}
          </div>
        </div>

        {/* Spacer — pushes actions to the right */}
        <div style={{ flex: 1 }} />

        {/* Actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <select value={selectedTeacherFilter} onChange={(e) => setSelectedTeacherFilter(e.target.value)} style={{ padding: '4px 8px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.04)', color: '#A0A0C8', fontSize: 11, outline: 'none' }}>
            <option value="">All Teachers</option>
            {allGridTeachersFull.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>

          {teacherRecord && (
            <div data-tour-id="my-sessions-toggle" style={{ display: 'flex', alignItems: 'center', height: 32, borderRadius: 8, border: '1px solid rgba(255,255,255,0.08)', overflow: 'hidden', background: 'rgba(255,255,255,0.04)' }}>
              <button onClick={() => setViewMode('all')} style={{
                padding: '0 12px', height: 32, fontSize: 12, fontWeight: viewMode === 'all' ? 800 : 500, cursor: 'pointer', border: 'none',
                background: viewMode === 'all' ? '#FFFFFF' : 'transparent',
                color: viewMode === 'all' ? '#141224' : '#A0A0C8', transition: 'all 150ms ease',
              }}>All Sessions</button>
              <button onClick={() => setViewMode('mine')} style={{
                padding: '0 12px', height: 32, fontSize: 12, fontWeight: viewMode === 'mine' ? 800 : 500, cursor: 'pointer', border: 'none',
                background: viewMode === 'mine' ? '#FFFFFF' : 'transparent',
                color: viewMode === 'mine' ? '#141224' : '#A0A0C8', transition: 'all 150ms ease',
              }}>My Sessions</button>
            </div>
          )}
          <ReportIssueButton />
          {role === 'studio_director' && (
            <PageGuide
              steps={scheduleGuideSteps}
              completionMessage="Schedule guide complete. Tap 📖 Guide anytime to replay."
            />
          )}
          {/* Legend dropdown */}
          <div style={{ position: 'relative' }}>
            <button data-guide-id="legend-button" onClick={() => setShowLegend(!showLegend)} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 10px', borderRadius: 7, border: '1px solid rgba(255,255,255,0.08)', background: showLegend ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.04)', color: '#A0A0C8', fontSize: 10, fontWeight: 600, cursor: 'pointer' }}>
              <span style={{ fontSize: 10, fontWeight: 600, color: '#8080A8' }}>Legend:</span>
              <div style={{ display: 'flex', gap: 3 }}>
                {['#FACC15','#38BDF8','#DC0000','#FF5500','#FF6B6B','#FF1493','#22C55E','#818CF8'].map(c => (
                  <div key={c} style={{ width: 8, height: 8, borderRadius: 2, background: c }} />
                ))}
              </div>
              <ChevronDown size={10} />
            </button>
            {showLegend && (
              <>
                <div style={{ position: 'fixed', inset: 0, zIndex: 99 }} onClick={() => setShowLegend(false)} />
                <div style={{ position: 'absolute', top: '100%', right: 0, marginTop: 6, padding: '10px 14px', background: '#1C1C2A', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, zIndex: 100, display: 'flex', flexDirection: 'column', gap: 8, minWidth: 140, boxShadow: '0 8px 24px rgba(0,0,0,0.4)' }}>
                  {[
                    { label: 'Booked', color: '#FACC15' }, { label: 'First Day', color: '#38BDF8' }, { label: 'Last Day', color: '#DC0000' },
                    { label: 'Call Out', color: '#FF5500' }, { label: 'Makeup Session', color: '#FF6B6B' }, { label: 'Meet & Greet', color: '#FF1493' }, { label: 'Sub', color: '#22C55E' }, { label: 'Training', color: '#818CF8' }, { label: 'Locked Times', color: '#606088' },
                  ].map((l) => (
                    <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ width: 12, height: 12, borderRadius: 4, background: l.color, flexShrink: 0 }} />
                      <span style={{ fontSize: 11, color: '#A0A0C8', fontWeight: 500, whiteSpace: 'nowrap' }}>{l.label}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </div>}

      {lastDayResult && <div style={{ padding: '8px 14px', background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.15)', borderRadius: 10, marginBottom: 8, fontSize: 11, color: '#EF4444' }}>{lastDayResult}</div>}
      {firstDayResult && <div style={{ padding: '8px 14px', background: 'rgba(59,130,246,0.06)', border: '1px solid rgba(59,130,246,0.15)', borderRadius: 10, marginBottom: 8, fontSize: 11, color: '#3B82F6' }}>{firstDayResult}</div>}
      {showMineOnly && <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginBottom: 6, paddingLeft: 4 }}>Showing your sessions only</div>}

      {/* Schedule Intelligence — utilization bar (desktop only) */}
      {!isMobile && scheduleIntel && scheduleIntel.utilization.length > 0 && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          {scheduleIntel.utilization.map(loc => (
            <div key={loc.locationId} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: 6, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)' }}>
              <div style={{ width: 6, height: 6, borderRadius: 3, background: loc.color }} />
              <span style={{ fontSize: 10, color: '#A0A0C8', fontWeight: 600 }}>{loc.locationName}</span>
              <span style={{ fontSize: 10, fontWeight: 700, color: loc.utilizationPercent >= 80 ? '#22C55E' : loc.utilizationPercent >= 50 ? '#FFB800' : '#EF4444', fontFamily: 'monospace' }}>{loc.utilizationPercent}% utilized</span>
              <span style={{ fontSize: 9, color: '#606088' }}>{loc.bookedBlocks}/{loc.totalBlocks} slots</span>
            </div>
          ))}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: 6, background: 'rgba(212,34,106,0.04)', border: '1px solid rgba(212,34,106,0.12)' }}>
            <span style={{ fontSize: 10, color: '#D4226A', fontWeight: 700, fontFamily: 'monospace' }}>{scheduleIntel.overall.utilizationPercent}%</span>
            <span style={{ fontSize: 10, color: '#A0A0C8', fontWeight: 600 }}>Total</span>
            <span style={{ fontSize: 9, color: '#606088' }}>{scheduleIntel.overall.bookedBlocks}/{scheduleIntel.overall.totalBlocks} slots</span>
          </div>
          {scheduleIntel.insights.filter(i => i.priority === 'high').map((insight, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', borderRadius: 6, background: 'rgba(239,68,68,0.04)', border: '1px solid rgba(239,68,68,0.1)' }}>
              <span style={{ fontSize: 10, color: '#EF4444' }}>{insight.message}</span>
            </div>
          ))}
        </div>
      )}

      {/* Schedule Grid — Premium Column Layout */}
      {isMobile ? (
        <MobileSchedule
          teachers={teachers}
          blocks={blocks}
          timeSlots={timeSlots}
          formatTime={formatTime}
          onBlockClick={(block) => setCheckInBlock(block)}
          onOpenSlotClick={async (block) => {
            if (!tenantId) return
            if (block.block_id) {
              // Existing open_time block — use it directly
              setAssignModal(block); setRecurring(true); setSelectedStudentId(''); setStudentSearch(''); setAssignRoom(''); setAssignError(null)
              return
            }
            // No block exists — create one first
            const { data: newBlock, error } = await supabase.from('schedule_blocks').insert({
              tenant_id: tenantId, location_id: block.location_id, teacher_id: block.teacher_id,
              block_date: block.block_date, start_time: block.start_time, end_time: block.end_time,
              status: 'available', block_type: 'open_time', is_recurring: false,
            }).select().single()
            if (error || !newBlock) return
            setAssignModal({ ...block, block_id: newBlock.id }); setRecurring(true); setSelectedStudentId(''); setStudentSearch(''); setAssignRoom(''); setAssignError(null)
          }}
          onDragDrop={async (source, target) => {
            if (!source.student_id || (target.block_type !== 'open_time' && target.block_id !== '')) return
            // If target doesn't exist yet (block_id empty), create it first
            let targetId = target.block_id
            if (!targetId && tenantId) {
              const { data: newBlock } = await supabase.from('schedule_blocks').insert({
                tenant_id: tenantId, location_id: target.location_id, teacher_id: target.teacher_id,
                block_date: target.block_date, start_time: target.start_time, end_time: target.end_time,
                status: 'available', block_type: 'open_time', is_recurring: false,
              }).select('id').single()
              if (!newBlock) { toast('Failed to create slot', 'error'); return }
              targetId = newBlock.id
            }
            const { error: e1 } = await supabase.from('schedule_blocks').update({
              student_id: source.student_id, status: 'booked', block_type: source.block_type,
              original_teacher_id: source.original_teacher_id ?? null,
              original_teacher_name: source.original_teacher_name ?? null,
            }).eq('id', targetId)
            if (e1) { toast(`Failed to move: ${e1.message}`, 'error'); return }
            const { error: e2 } = await supabase.from('schedule_blocks').update({
              student_id: null, status: 'available', block_type: 'open_time', is_recurring: false,
              original_teacher_id: null, original_teacher_name: null,
            }).eq('id', source.block_id)
            if (e2) toast('Warning: moved but old slot not cleared', 'error')
            else toast('Student moved', 'success')
            await qc.invalidateQueries({ queryKey: qk.schedule.all }); qc.invalidateQueries({ queryKey: qk.schedule.intelligence })
          }}
          locations={visibleLocations}
          selectedLocation={effectiveLocation}
          onLocationChange={setSelectedLocation}
          selectedDate={selectedDate}
          onNavigateDate={navigateDate}
          utilization={scheduleIntel?.utilization ?? []}
          teacherAvailability={teacherAvailability}
          isStudioDirector={isStudioDirector}
        />
      ) : isLoading ? (
        <div className="loading-screen" style={{ height: 400 }}><MusicLoader /></div>
      ) : isClosed && timeSlots.length === 0 ? (
        <div style={{ padding: '48px 24px', textAlign: 'center' }}>
          <Calendar size={32} style={{ color: '#606088', marginBottom: 10 }} />
          <p style={{ fontSize: 16, fontWeight: 700, color: '#8080A8' }}>Closed</p>
          <p style={{ fontSize: 12, color: '#606088', marginTop: 4 }}>{locations?.find((l: any) => l.id === effectiveLocation)?.name?.replace(' Music Lessons', '')} is closed on {new Date(selectedDate + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long' })}s</p>
          <p style={{ fontSize: 11, color: '#606088', marginTop: 10 }}>If there are existing bookings on this day, they'll still show above.</p>
        </div>
      ) : teachers.length === 0 ? (
        <div style={{ padding: '48px 24px', textAlign: 'center' }}>
          <Calendar size={32} style={{ color: '#606088', marginBottom: 10 }} />
          <p style={{ fontSize: 14, color: '#8080A8', fontWeight: 600 }}>No teachers available</p>
          <p style={{ fontSize: 12, color: '#606088', marginTop: 4 }}>Add teachers in Settings to see them here.</p>
        </div>
      ) : (
        <div ref={gridCallbackRef} data-guide-id="schedule-grid" style={{ overflowX: 'auto', borderRadius: 16, border: `1px solid ${locColor}20`, background: 'rgba(12,11,22,0.95)', position: 'relative' }}>
          {/* Current time indicator line — only shows today, measures real DOM positions */}
          {isToday && timeSlots.length > 0 && gridWrapperRef.current && (() => {
            const nowParts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', hour: 'numeric', minute: 'numeric', hour12: false }).formatToParts(new Date())
            const nowHour = parseInt(nowParts.find(p => p.type === 'hour')?.value ?? '0')
            const nowMin = parseInt(nowParts.find(p => p.type === 'minute')?.value ?? '0')
            const nowMinutes = nowHour * 60 + nowMin
            const firstSlotMin = parseInt(timeSlots[0].split(':')[0]) * 60 + parseInt(timeSlots[0].split(':')[1])
            const lastSlotMin = parseInt(timeSlots[timeSlots.length - 1].split(':')[0]) * 60 + parseInt(timeSlots[timeSlots.length - 1].split(':')[1]) + 30
            if (nowMinutes < firstSlotMin || nowMinutes > lastSlotMin) return null

            // Measure real DOM: find the first time-label cell to get actual header height and row height
            const gridEl = gridWrapperRef.current!.querySelector('[data-time-row]') as HTMLElement | null
            const gridEl2 = gridWrapperRef.current!.querySelector('[data-time-row-second]') as HTMLElement | null
            if (!gridEl) return null
            const headerHeight = gridEl.offsetTop
            const rowHeight = gridEl2 ? gridEl2.offsetTop - gridEl.offsetTop : 72

            const progress = (nowMinutes - firstSlotMin) / (lastSlotMin - firstSlotMin)
            const totalDataHeight = timeSlots.length * rowHeight
            const topPos = headerHeight + progress * totalDataHeight

            const timeBarColor = getLocationColor(effectiveLocation)
            return (
              <div style={{ position: 'absolute', top: topPos, left: 0, right: 0, zIndex: 10, pointerEvents: 'none', display: 'flex', alignItems: 'center' }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: timeBarColor, boxShadow: `0 0 8px ${timeBarColor}66`, flexShrink: 0, marginLeft: -4 }} />
                <div style={{ flex: 1, height: 2, background: timeBarColor, opacity: 0.7, boxShadow: `0 0 6px ${timeBarColor}40` }} />
              </div>
            )
          })()}
          <div style={{ display: 'grid', gridTemplateColumns: `52px repeat(${teachers.length}, minmax(140px, 1fr))`, minWidth: teachers.length > 6 ? teachers.length * 150 : undefined }}>
            {/* Header Row — Clean teacher names like Square */}
            <div style={{ padding: '16px 6px', borderBottom: '1px solid rgba(255,255,255,0.08)' }} />
            {teachers.map((t) => {
              // Daily room assignment from teacher_room_assignments table
              const dailyAssignment = dailyRoomMap?.[t.id] ?? null
              const teacherRoom = dailyAssignment?.roomName ?? null
              const isPopoverOpen = roomPopoverTeacher === t.id
              const activeRoomsForHeader = rooms?.filter((r: any) => r.is_active && r.status === 'active') ?? []
              // Sub = teacher does NOT have availability at this location on this day
              const hasAvailToday = teacherAvailability ? teacherAvailability.has(t.id) : true
              const isSub = !hasAvailToday
              return (
                <div key={t.id} style={{ padding: '10px 10px', borderBottom: '1px solid rgba(255,255,255,0.08)', borderLeft: '1px solid rgba(255,255,255,0.04)', textAlign: 'center', position: 'relative' }}>
                  <div
                    onClick={() => { setCalloutPreselectedTeacherId(t.id); setShowCalloutWizard(true) }}
                    title={`Mark ${t.name} called out`}
                    style={{ fontSize: 13, fontWeight: 700, color: isSub ? '#22C55E' : '#E0E0F4', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', cursor: 'pointer' }}
                  >{t.name}</div>
                  {(t as any).photo_url && (
                    <img src={(t as any).photo_url} alt="" style={{ width: 28, height: 28, borderRadius: '50%', objectFit: 'cover', border: '1px solid rgba(255,255,255,0.1)', marginTop: 4, display: 'block', marginLeft: 'auto', marginRight: 'auto' }} />
                  )}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 2 }}>
                    {isSub && <span style={{ fontSize: 8, padding: '1px 6px', borderRadius: 4, background: 'rgba(34,197,94,0.15)', color: '#22C55E', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Sub</span>}
                    {/* Room badge — shows daily assignment or "+ Assign Room" tap target */}
                    {teacherRoom ? (
                      <span
                        onClick={(e) => { e.stopPropagation(); setRoomPopoverTeacher(isPopoverOpen ? null : t.id) }}
                        style={{ fontSize: 13, fontWeight: 700, padding: '1px 6px', borderRadius: 4, background: `${getLocationColor(effectiveLocation)}25`, color: getLocationColor(effectiveLocation), cursor: 'pointer' }}
                        title={`${t.name}'s room today: ${teacherRoom}`}
                      >{abbreviateRoom(teacherRoom)}</span>
                    ) : (
                      <span
                        onClick={(e) => { e.stopPropagation(); setRoomPopoverTeacher(isPopoverOpen ? null : t.id) }}
                        style={{ fontSize: 10, color: '#606088', cursor: 'pointer', padding: '1px 4px', borderRadius: 4, border: '1px dashed rgba(96,96,136,0.3)' }}
                        title={`Assign a room for ${t.name} today`}
                      >+ Room</span>
                    )}
                    {isSub && (
                      <button
                        onClick={async () => {
                          const { error } = await supabase.from('schedule_blocks').delete()
                            .eq('teacher_id', t.id)
                            .eq('block_date', selectedDate)
                            .eq('location_id', effectiveLocation)
                          if (error) { toast('Failed to remove sub: ' + error.message, 'error'); return }
                          qc.invalidateQueries({ queryKey: qk.schedule.all }); qc.invalidateQueries({ queryKey: qk.schedule.intelligence })
                          toast('Sub removed', 'success')
                        }}
                        title="Remove sub from today"
                        style={{ fontSize: 9, padding: '1px 6px', borderRadius: 4, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.15)', color: '#EF4444', cursor: 'pointer', fontWeight: 600 }}
                      >
                        Remove
                      </button>
                    )}
                  </div>
                  {/* Room assignment popover */}
                  {isPopoverOpen && (
                    <div
                      onClick={(e) => e.stopPropagation()}
                      style={{
                        position: 'absolute', top: '100%', left: '50%', transform: 'translateX(-50%)',
                        zIndex: 50, width: 200, padding: 12, borderRadius: 12,
                        background: 'rgba(18,17,32,0.98)', border: '1px solid rgba(255,255,255,0.1)',
                        boxShadow: '0 8px 32px rgba(0,0,0,0.6)', textAlign: 'left',
                      }}
                    >
                      <div style={{ fontSize: 10, fontWeight: 700, color: '#8080A8', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>Room for Today</div>
                      {activeRoomsForHeader.map((r: any) => (
                        <button
                          key={r.id}
                          onClick={async () => {
                            try {
                              await setTeacherRoom.mutateAsync({
                                teacherId: t.id,
                                roomId: r.id,
                                roomName: r.name,
                                date: selectedDate,
                                locationId: effectiveLocation,
                              })
                              toast(`${t.name} → ${r.name} for today`, 'success')
                              setRoomPopoverTeacher(null)
                            } catch (err: any) {
                              toast(err.message || 'Failed to assign room', 'error')
                            }
                          }}
                          style={{
                            display: 'block', width: '100%', padding: '8px 10px', marginBottom: 4,
                            borderRadius: 8, border: dailyAssignment?.roomId === r.id ? `1px solid ${getLocationColor(effectiveLocation)}` : '1px solid rgba(255,255,255,0.06)',
                            background: dailyAssignment?.roomId === r.id ? `${getLocationColor(effectiveLocation)}15` : 'rgba(255,255,255,0.03)',
                            color: '#E0E0F4', fontSize: 12, fontWeight: 600, cursor: 'pointer', textAlign: 'left',
                          }}
                        >
                          {r.name}
                          {dailyAssignment?.roomId === r.id && <span style={{ float: 'right', color: getLocationColor(effectiveLocation) }}>✓</span>}
                        </button>
                      ))}
                      {dailyAssignment && (
                        <button
                          onClick={async () => {
                            try {
                              await removeTeacherRoom.mutateAsync({ teacherId: t.id, date: selectedDate })
                              toast(`Room assignment removed for ${t.name}`, 'success')
                              setRoomPopoverTeacher(null)
                            } catch (err: any) {
                              toast(err.message || 'Failed to remove assignment', 'error')
                            }
                          }}
                          style={{
                            display: 'block', width: '100%', padding: '6px 10px', marginTop: 6,
                            borderRadius: 8, border: '1px solid rgba(239,68,68,0.15)',
                            background: 'rgba(239,68,68,0.06)', color: '#EF4444',
                            fontSize: 11, fontWeight: 600, cursor: 'pointer', textAlign: 'center',
                          }}
                        >
                          Remove Assignment
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )
            })}

            {/* Time Rows */}
            {timeSlots.map((time, timeIdx) => (
              <>
                {/* Time Label — clean left axis */}
                <div key={`time-${time}`} {...(timeIdx === 0 ? { 'data-time-row': '' } : timeIdx === 1 ? { 'data-time-row-second': '' } : {})} style={{ padding: '0 4px', display: 'flex', alignItems: 'flex-start', justifyContent: 'flex-end', height: 68, paddingTop: 4, borderBottom: '1px solid rgba(255,255,255,0.03)', fontSize: 11, fontWeight: 500, color: '#606088' }}>
                  {formatTime(time)}
                </div>

                {/* Teacher Cells */}
                {teachers.map((t) => {
                  const block = gridLookup.get(time)?.get(t.id)

                  // Check teacher availability for this time
                  const unavailMsg = isTeacherUnavailable(t.id, time)

                  // No block — check if teacher is available at this time
                  if (!block && unavailMsg) {
                    return (
                      <div key={`${time}-${t.id}`} style={{ height: 68, borderBottom: '1px solid rgba(255,255,255,0.03)', borderLeft: '1px solid rgba(255,255,255,0.04)', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(72,72,112,0.03)' }}>
                        <span style={{ fontSize: 9, color: '#363656', fontWeight: 500, textAlign: 'center', padding: '0 6px' }}>{unavailMsg}</span>
                      </div>
                    )
                  }

                  // No block = open time (green) — click to book
                  if (!block) {
                    const isDropping = dragBlock && dragOverTarget === `empty-${time}-${t.id}`
                    return (
                      <div
                        key={`${time}-${t.id}`}
                        onClick={() => handleClickEmptyCell(t.id, t.name, time)}
                        onDragOver={(e) => { e.preventDefault(); setDragOverTarget(`empty-${time}-${t.id}`) }}
                        onDragLeave={() => setDragOverTarget(null)}
                        onDrop={async (e) => {
                          e.preventDefault()
                          if (!dragBlock || !dragBlock.student_id || !tenantId) return
                          const h = Math.floor(parseFloat(time.replace(':', '.')))
                          const m = time.split(':')[1]
                          const endH = m === '30' ? h + 1 : h
                          const endM = m === '30' ? '00' : '30'
                          const endTime = `${String(endH).padStart(2, '0')}:${endM}:00`
                          const doEmptyDrop = async (srcBlock: GridBlock, teacherId: string) => {
                            // Check if target teacher already has a block at this time (open_time)
                            // If so, update it instead of inserting a new one
                            const { data: existing } = await supabase.from('schedule_blocks')
                              .select('id')
                              .eq('teacher_id', teacherId)
                              .eq('block_date', selectedDate)
                              .eq('start_time', time)
                              .limit(1)
                              .single()

                            if (existing) {
                              // Update existing block with student
                              const { error: upErr } = await supabase.from('schedule_blocks').update({
                                student_id: srcBlock.student_id, status: 'booked', block_type: srcBlock.block_type,
                                original_teacher_id: srcBlock.original_teacher_id, original_teacher_name: srcBlock.original_teacher_name,
                              }).eq('id', existing.id)
                              if (upErr) { toast(`Failed to move: ${upErr.message}`, 'error'); return }
                            } else {
                              // Create new block
                              const { error: insertErr } = await supabase.from('schedule_blocks').insert({
                                tenant_id: tenantId, location_id: effectiveLocation, teacher_id: teacherId,
                                student_id: srcBlock.student_id, block_date: selectedDate,
                                start_time: time, end_time: endTime, status: 'booked', block_type: srcBlock.block_type, is_recurring: false,
                                original_teacher_id: srcBlock.original_teacher_id, original_teacher_name: srcBlock.original_teacher_name,
                              })
                              if (insertErr) { toast(`Failed to move: ${insertErr.message}`, 'error'); return }
                            }
                            // Clear source block
                            const { error: clearErr } = await supabase.from('schedule_blocks').update({ student_id: null, status: 'available', block_type: 'open_time', is_recurring: false, original_teacher_id: null, original_teacher_name: null }).eq('id', srcBlock.block_id)
                            if (clearErr) toast('Warning: moved but old slot not cleared', 'error')
                            else toast('Student moved', 'success')
                            setDragBlock(null); setDragOverTarget(null)
                            qc.invalidateQueries({ queryKey: qk.schedule.all }); qc.invalidateQueries({ queryKey: qk.schedule.intelligence })
                          }
                          if (dragBlock.teacher_id !== t.id) {
                            const capturedDrag = dragBlock
                            const targetTeacherId = t.id
                            setPendingConfirm({
                              title: 'Teacher Change',
                              message: `You're moving ${dragBlock.student_name} from ${dragBlock.teacher_name} to a different teacher. Are you sure?`,
                              variant: 'warning',
                              onConfirm: () => { setPendingConfirm(null); doEmptyDrop(capturedDrag, targetTeacherId) },
                            })
                            setDragBlock(null); return
                          }
                          doEmptyDrop(dragBlock, t.id)
                        }}
                        style={{
                          height: 68, borderBottom: '1px solid rgba(255,255,255,0.03)', borderLeft: '1px solid rgba(255,255,255,0.04)',
                          padding: '3px 4px', cursor: 'pointer', transition: 'all 120ms ease',
                          background: isDropping ? 'rgba(74,222,128,0.18)' : 'rgba(74,222,128,0.06)',
                          ...(isDropping ? { outline: '2px dashed rgba(74,222,128,0.5)', outlineOffset: -2 } : {}),
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(74,222,128,0.10)')}
                        onMouseLeave={(e) => { if (!isDropping) (e.currentTarget as HTMLElement).style.background = 'rgba(74,222,128,0.06)' }}
                      >
                        <div style={{ height: '100%', borderRadius: 6, border: '1px dashed rgba(74,222,128,0.18)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <span style={{ fontSize: 10, color: 'rgba(74,222,128,0.5)', fontWeight: 600 }}>Open</span>
                        </div>
                      </div>
                    )
                  }

                  const bt = block.block_type
                  const isDropTarget = dragOverTarget === block.block_id

                  // Open slot — check if teacher is available at this time
                  if (bt === 'open_time' && unavailMsg) {
                    return (
                      <div key={`${time}-${t.id}`} style={{ height: 68, borderBottom: '1px solid rgba(255,255,255,0.03)', borderLeft: '1px solid rgba(255,255,255,0.04)', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(72,72,112,0.03)' }}>
                        <span style={{ fontSize: 9, color: '#363656', fontWeight: 500, textAlign: 'center', padding: '0 6px' }}>{unavailMsg}</span>
                      </div>
                    )
                  }

                  // Open slot — green "Open" block, clickable to book
                  if (bt === 'open_time') {
                    return (
                      <div
                        key={`${time}-${t.id}`}
                        data-guide-block-type="open_time"
                        onClick={() => { setAssignModal(block); setRecurring(true); setSelectedStudentId(''); setStudentSearch(''); setAssignRoom(''); setAssignError(null) }}
                        onDragOver={(e) => { e.preventDefault(); setDragOverTarget(block.block_id) }}
                        onDragLeave={() => setDragOverTarget(null)}
                        onDrop={(e) => { e.preventDefault(); handleDrop(block) }}
                        style={{
                          height: 68, borderBottom: '1px solid rgba(255,255,255,0.03)', borderLeft: '1px solid rgba(255,255,255,0.04)',
                          padding: '3px 4px', cursor: 'pointer', transition: 'all 120ms ease',
                          background: isDropTarget ? 'rgba(74,222,128,0.18)' : 'rgba(74,222,128,0.06)',
                          ...(isDropTarget ? { outline: '2px dashed rgba(74,222,128,0.5)', outlineOffset: -2 } : {}),
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(74,222,128,0.10)')}
                        onMouseLeave={(e) => { if (!isDropTarget) (e.currentTarget as HTMLElement).style.background = 'rgba(74,222,128,0.06)' }}
                      >
                        <div style={{ height: '100%', borderRadius: 6, border: '1px dashed rgba(74,222,128,0.18)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <span style={{ fontSize: 10, color: 'rgba(74,222,128,0.5)', fontWeight: 600 }}>Open</span>
                        </div>
                      </div>
                    )
                  }

                  // Locked — minimal
                  if (bt === 'not_bookable') {
                    return (
                      <div key={`${time}-${t.id}`} onClick={() => setCheckInBlock(block)} style={{ height: 68, borderBottom: '1px solid rgba(255,255,255,0.03)', borderLeft: '1px solid rgba(255,255,255,0.04)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <span style={{ fontSize: 10, color: '#363656', fontWeight: 600 }}>Locked</span>
                      </div>
                    )
                  }

                  // Teacher training — indigo chip
                  if (bt === 'teacher_training') {
                    return (
                      <div key={`${time}-${t.id}`} onClick={() => setCheckInBlock(block)} style={{ height: 68, borderBottom: '1px solid rgba(255,255,255,0.03)', borderLeft: '1px solid rgba(255,255,255,0.04)', padding: '3px 4px', cursor: 'pointer' }}>
                        <div style={{ height: '100%', borderRadius: 8, background: '#818CF8', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <span style={{ fontSize: 11, color: '#fff', fontWeight: 700 }}>Training</span>
                        </div>
                      </div>
                    )
                  }

                  // Solid color map — like Square's filled blocks
                  const solidColors: Record<string, string> = {
                    student_session: '#FACC15',
                    first_day: '#38BDF8',
                    last_day: '#DC0000',
                    call_out: '#FF5500',
                    meet_greet: '#FF1493',
                    sub: '#22C55E',
                    makeup_session: '#FF6B6B',
                  }
                  // Virtual override — teal #00BCD4
                  const isVirtual = block.is_virtual
                  const bgColor = isVirtual ? '#00BCD4' : (solidColors[bt] ?? '#FACC15')
                  // White text for dark backgrounds, dark text for light backgrounds
                  const whiteBgTypes = new Set(['last_day', 'sub', 'call_out', 'meet_greet', 'makeup_session'])
                  const useWhiteText = isVirtual || whiteBgTypes.has(bt)
                  const textColor = useWhiteText ? '#ffffff' : bt === 'first_day' ? '#072030' : '#111111'
                  const textColorMuted = useWhiteText ? 'rgba(255,255,255,0.65)' : bt === 'first_day' ? 'rgba(7,32,48,0.65)' : 'rgba(0,0,0,0.6)'
                  const textColorFaint = useWhiteText ? 'rgba(255,255,255,0.5)' : bt === 'first_day' ? 'rgba(7,32,48,0.5)' : 'rgba(0,0,0,0.5)'

                  // Booked block — solid color fill, faded if checked in
                  const isCheckedIn = block.checked_in
                  const isPendingTally = isCheckedIn && !block.teacher_tally
                  const isFamilyCallout = bt === 'call_out' && block.is_family_callout
                  const isTeacherCallout = bt === 'call_out' && !block.is_family_callout
                  const isMakeup = bt === 'makeup_session'

                  // Teacher callout — distinct locked visual (gray/slate with amber tint)
                  if (isTeacherCallout) {
                    return (
                      <div
                        key={`${time}-${t.id}`}
                        data-guide-block-type="call_out"
                        onClick={() => setCheckInBlock(block)}
                        title={`Called Out${block.callout_reason ? ` — ${block.callout_reason}` : ''}`}
                        style={{ height: 68, borderBottom: '1px solid rgba(255,255,255,0.03)', borderLeft: '1px solid rgba(255,255,255,0.04)', padding: '3px 4px', cursor: 'pointer' }}
                      >
                        <div style={{
                          height: '100%', borderRadius: 8,
                          background: '#4A4540',
                          border: '1px solid rgba(217,119,6,0.25)',
                          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2,
                          padding: '4px 6px', textAlign: 'center', position: 'relative',
                        }}>
                          <div style={{ fontWeight: 700, fontSize: '14px', color: '#ffffff', lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%' }}>
                            {block.student_name || 'Student'}
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'rgba(255,255,255,0.55)' }}>
                            <Lock size={10} style={{ color: '#D97706' }} />
                            <span style={{ fontWeight: 600, color: '#D97706' }}>Called Out</span>
                            {block.instrument && <span title={block.instrument}>{getInstrumentEmoji(block.instrument)}</span>}
                            {formatTime(block.start_time)}
                          </div>
                          {block.callout_reason && (
                            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%' }}>
                              — {block.callout_reason}
                            </div>
                          )}
                        </div>
                      </div>
                    )
                  }

                  const blockTitle = isFamilyCallout
                    ? `${block.student_name ?? 'Student'} — Family initiated via parent portal on ${block.block_date}`
                    : isMakeup
                      ? `${block.student_name ?? 'Student'} — Makeup session (banked from prior call-out)`
                      : undefined
                  return (
                    <div
                      key={`${time}-${t.id}`}
                      data-guide-block-type={bt}
                      data-guide-family-callout={isFamilyCallout ? 'true' : undefined}
                      draggable
                      onDragStart={(e) => { setDragBlock(block); e.dataTransfer.effectAllowed = 'move' }}
                      onDragEnd={() => { setDragBlock(null); setDragOverTarget(null) }}
                      onClick={() => setCheckInBlock(block)}
                      title={blockTitle}
                      style={{ height: 68, borderBottom: '1px solid rgba(255,255,255,0.03)', borderLeft: '1px solid rgba(255,255,255,0.04)', padding: '3px 4px', cursor: 'grab' }}
                    >
                      <div style={{
                        height: '100%',
                        borderRadius: 8,
                        background: isCheckedIn ? `${bgColor}50` : bgColor,
                        boxShadow: isCheckedIn ? 'none' : `0 2px 8px ${bgColor}40`,
                        border: isCheckedIn
                          ? isPendingTally
                            ? `2px dashed ${bgColor}`
                            : `2px solid ${bgColor}`
                          : '2px solid transparent',
                        transition: 'transform 120ms, box-shadow 120ms',
                        position: 'relative',
                      }}>
                        {/* Tally status indicators */}
                        {isCheckedIn && !isPendingTally && (
                          <span title="Session checked in — tally credited" style={{
                            position: 'absolute', top: 2, right: 3, fontSize: 10, lineHeight: 1,
                            color: '#FFB800', fontWeight: 700,
                          }}>✓</span>
                        )}
                        {isFamilyCallout && (
                          <span title="Family initiated via parent portal" style={{
                            position: 'absolute', top: 2, right: isFamilyCallout && (isCheckedIn || isPendingTally) ? 16 : 3, fontSize: 10, lineHeight: 1,
                          }}>👨‍👩‍👧</span>
                        )}
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '2px', padding: '4px 6px', height: '100%', textAlign: 'center' }}>
                          <div style={{ fontWeight: 700, fontSize: '16px', color: textColor, lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%' }}>
                            {isMakeup
                              ? <>Makeup {'\uD83C\uDF3A'}</>
                              : (block.student_name || 'Student')}
                          </div>
                          <div style={{ fontSize: '14px', color: textColorMuted, lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                            {isVirtual && <span title="Virtual — Google Meet" style={{ fontSize: 12 }}>{'\uD83D\uDCF9'}</span>}
                            {block.instrument && <span title={block.instrument} style={{ fontSize: 14 }}>{getInstrumentEmoji(block.instrument)}</span>}
                            {formatTime(block.start_time)}
                            {isFamilyCallout && (
                              <span style={{ fontSize: 11, opacity: 0.85 }}>{'\u00B7'} Call Out</span>
                            )}
                            {isMakeup && block.student_name && (
                              <span style={{ fontSize: 11, opacity: 0.85 }}>{'\u00B7'} {block.student_name.split(' ')[0]}</span>
                            )}
                            {block.has_session_log && <span title="Session logged" style={{ fontSize: 10, opacity: 0.8 }}>&#9998;</span>}
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </>
            ))}
          </div>
        </div>
      )}

      {/* Legend moved to top — see above date nav */}

      {/* Add Teacher (Sub) Modal */}
      {showAddTeacher && (
        <div className="modal-overlay" onClick={() => setShowAddTeacher(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 400 }}>
            <div style={{ padding: '16px 20px 12px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: '#A855F7' }}>Add Teacher to Schedule</span>
                <button onClick={() => setShowAddTeacher(false)} style={{ background: 'none', border: 'none', color: '#8080A8', cursor: 'pointer', fontSize: 18 }}>×</button>
              </div>
              <div style={{ fontSize: 11, color: '#8080A8', marginTop: 4 }}>Add a substitute or guest teacher to today's schedule</div>
              <input
                value={studentSearch}
                onChange={(e) => setStudentSearch(e.target.value)}
                placeholder="Search teacher name..."
                autoFocus
                style={{ width: '100%', marginTop: 10, padding: '8px 12px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.04)', color: '#E0E0F4', fontSize: 12, outline: 'none', boxSizing: 'border-box' }}
              />
            </div>
            <div style={{ padding: '14px 20px', maxHeight: 400, overflowY: 'auto' }}>
              {(() => {
                const subSearch = studentSearch.toLowerCase()
                const nameMatch = (t: any) => {
                  if (!subSearch) return true
                  const n = `${t.first_name ?? t.profile?.first_name ?? ''} ${t.last_name ?? t.profile?.last_name ?? ''}`.toLowerCase()
                  return n.includes(subSearch)
                }
                const sortByName = (a: any, b: any) => {
                  const an = `${a.first_name ?? a.profile?.first_name ?? ''} ${a.last_name ?? a.profile?.last_name ?? ''}`
                  const bn = `${b.first_name ?? b.profile?.first_name ?? ''} ${b.last_name ?? b.profile?.last_name ?? ''}`
                  return an.localeCompare(bn)
                }
                const onScheduleIds = new Set(teachers.map(t => t.id))
                const availableSubs = (subTeachers ?? []).filter((t: any) => !onScheduleIds.has(t.id) && nameMatch(t)).sort(sortByName)
                const otherTeachers = (allTeachersList ?? []).filter((t: any) => t.is_active && !onScheduleIds.has(t.id) && !availableSubs.some((s: any) => s.id === t.id) && nameMatch(t)).sort(sortByName)

                return (
                  <>
                    {availableSubs.length > 0 && (
                      <div style={{ marginBottom: 12 }}>
                        <div style={{ fontSize: 10, fontWeight: 700, color: '#A855F7', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>Substitutes Available</div>
                        {availableSubs.map((t: any) => (
                          <button
                            key={t.id}
                            onClick={async () => {
                              // Create an open block for this teacher at the current date/location
                              if (!tenantId) return
                              await supabase.from('schedule_blocks').insert({
                                tenant_id: tenantId, location_id: effectiveLocation, teacher_id: t.id,
                                block_date: selectedDate, start_time: '15:00:00', end_time: '15:30:00',
                                status: 'available', block_type: 'open_time', is_recurring: false,
                              })
                              qc.invalidateQueries({ queryKey: qk.schedule.all }); qc.invalidateQueries({ queryKey: qk.schedule.intelligence })
                              setShowAddTeacher(false)
                            }}
                            style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', padding: '10px 12px', borderRadius: 8, border: 'none', background: 'rgba(168,85,247,0.06)', cursor: 'pointer', marginBottom: 4, textAlign: 'left' }}
                            onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(168,85,247,0.12)')}
                            onMouseLeave={(e) => (e.currentTarget.style.background = 'rgba(168,85,247,0.06)')}
                          >
                            <span style={{ fontSize: 13, fontWeight: 700, color: '#E0E0F4' }}>{t.first_name ?? t.profile?.first_name} {t.last_name ?? t.profile?.last_name}</span>
                            <span style={{ fontSize: 10, color: '#A855F7', fontWeight: 600 }}>Sub</span>
                          </button>
                        ))}
                      </div>
                    )}
                    {otherTeachers.length > 0 && (
                      <div>
                        <div style={{ fontSize: 10, fontWeight: 700, color: '#8080A8', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>Other Teachers</div>
                        {otherTeachers.map((t: any) => (
                          <button
                            key={t.id}
                            onClick={async () => {
                              const name = `${t.first_name ?? t.profile?.first_name ?? ''} ${t.last_name ?? t.profile?.last_name ?? ''}`.trim()
                              const isAtLocation = locationTeacherIds?.has(t.id)
                              const addTeacherToSchedule = async (teacherId: string) => {
                                if (!tenantId) return
                                await supabase.from('schedule_blocks').insert({
                                  tenant_id: tenantId, location_id: effectiveLocation, teacher_id: teacherId,
                                  block_date: selectedDate, start_time: '15:00:00', end_time: '15:30:00',
                                  status: 'available', block_type: 'open_time', is_recurring: false,
                                })
                                qc.invalidateQueries({ queryKey: qk.schedule.all }); qc.invalidateQueries({ queryKey: qk.schedule.intelligence })
                                setShowAddTeacher(false)
                              }
                              if (!isAtLocation) {
                                const teacherId = t.id
                                setPendingConfirm({
                                  title: 'Different Location',
                                  message: `${name} doesn't teach at this location. Are you sure you want to add them to today's schedule?`,
                                  variant: 'warning',
                                  onConfirm: () => { setPendingConfirm(null); addTeacherToSchedule(teacherId) },
                                })
                                return
                              }
                              addTeacherToSchedule(t.id)
                            }}
                            style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', padding: '10px 12px', borderRadius: 8, border: 'none', background: 'rgba(255,255,255,0.03)', cursor: 'pointer', marginBottom: 4, textAlign: 'left' }}
                            onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.06)')}
                            onMouseLeave={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.03)')}
                          >
                            <span style={{ fontSize: 13, fontWeight: 600, color: '#A0A0C8' }}>{t.first_name ?? t.profile?.first_name} {t.last_name ?? t.profile?.last_name}</span>
                            <span style={{ fontSize: 10, color: '#606088' }}>Not assigned here</span>
                          </button>
                        ))}
                      </div>
                    )}
                    {availableSubs.length === 0 && otherTeachers.length === 0 && (
                      <p style={{ fontSize: 12, color: '#606088', textAlign: 'center', padding: '20px 0' }}>All teachers are already on today's schedule.</p>
                    )}
                  </>
                )
              })()}
            </div>
          </div>
        </div>
      )}

      {/* Assign Student Modal — search → select → configure → book */}
      {assignModal && (
        <div className={isMobile ? undefined : 'modal-overlay'} style={isMobile ? { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 1000, backdropFilter: 'blur(2px)' } : {}} onClick={() => setAssignModal(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={isMobile ? { maxWidth: '100vw', width: '100%', borderRadius: '20px 20px 0 0', maxHeight: '92vh', overflowY: 'auto', WebkitOverflowScrolling: 'touch' as any } : { maxWidth: 400 }}>
            {/* Drag handle on mobile */}
            {isMobile && (
              <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 10, paddingBottom: 4 }}>
                <div style={{ width: 36, height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.15)' }} />
              </div>
            )}
            {/* Header */}
            <div style={{ padding: '16px 20px 12px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: '#E0E0F4' }}>Book Lesson</span>
              <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 6, background: 'rgba(255,255,255,0.06)', color: '#C0C0E0', fontWeight: 600 }}>{assignModal.teacher_name}</span>
                <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 6, background: 'rgba(255,184,0,0.1)', color: '#FFB800', fontWeight: 600 }}>{formatTime(assignModal.start_time)}</span>
                <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 6, background: 'rgba(255,255,255,0.04)', color: '#8080A8' }}>{new Date(assignModal.block_date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</span>
              </div>
            </div>

            <div style={{ padding: '14px 20px' }}>

              {/* Lock flow */}
              {showLockFlow ? (
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#64648C', marginBottom: 10 }}>Lock this time slot</div>
                  <label style={{ fontSize: 10, fontWeight: 700, color: '#EF4444', textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: 4 }}>Reason — Required</label>
                  <textarea
                    value={lockReason}
                    onChange={(e) => setLockReason(e.target.value)}
                    placeholder="Why are you locking this time?"
                    autoFocus
                    rows={2}
                    style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: `1px solid ${lockReason.trim() ? 'rgba(255,255,255,0.1)' : 'rgba(239,68,68,0.3)'}`, background: 'rgba(255,255,255,0.04)', color: '#E0E0F4', fontSize: 13, outline: 'none', boxSizing: 'border-box', resize: 'vertical', fontFamily: 'inherit', marginBottom: 10 }}
                  />
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, cursor: 'pointer' }}>
                    <input type="checkbox" checked={lockRecurring} onChange={(e) => setLockRecurring(e.target.checked)} style={{ accentColor: '#E8488A' }} />
                    <span style={{ fontSize: 12, color: '#C0C0E0' }}>Lock every {new Date(assignModal.block_date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long' })} at this time</span>
                  </label>
                  <button
                    onClick={async () => {
                      if (!lockReason.trim()) { setAssignError('Please enter a reason'); return }
                      setLockSubmitting(true)
                      setAssignError(null)
                      try {
                        const lockPromise = (async () => {
                          const { error: lockErr } = await supabase.from('schedule_blocks').update({ block_type: 'not_bookable', notes: `[Locked] ${lockReason.trim()}`, is_recurring: lockRecurring }).eq('id', assignModal.block_id)
                          if (lockErr) throw new Error(lockErr.message)
                          if (lockRecurring) {
                            const dow = new Date(assignModal.block_date + 'T00:00:00').getDay()
                            const upperDate = new Date(assignModal.block_date + 'T00:00:00')
                            upperDate.setMonth(upperDate.getMonth() + 6)
                            const upperBound = upperDate.toISOString().slice(0, 10)
                            const { data: futureBlocks } = await supabase.from('schedule_blocks').select('id, block_date')
                              .eq('tenant_id', assignModal.tenant_id)
                              .eq('teacher_id', assignModal.teacher_id).eq('start_time', assignModal.start_time).eq('status', 'available').gt('block_date', assignModal.block_date).lte('block_date', upperBound)
                              .limit(2000)
                            const sameDayIds = (futureBlocks ?? [])
                              .filter((fb: any) => new Date(fb.block_date + 'T00:00:00').getDay() === dow)
                              .map((fb: any) => fb.id)
                            if (sameDayIds.length > 0) {
                              const { error: recurErr } = await supabase.from('schedule_blocks').update({ block_type: 'not_bookable', notes: `[Locked] ${lockReason.trim()}`, is_recurring: true }).in('id', sameDayIds)
                              if (recurErr) throw new Error(recurErr.message)
                            }
                          }
                          await supabase.from('activity_log').insert({
                            tenant_id: assignModal.tenant_id, entity_type: 'schedule_block', entity_id: assignModal.block_id,
                            action: 'lock_time', description: `Locked: ${assignModal.teacher_name} @ ${formatTime(assignModal.start_time)} on ${new Date(assignModal.block_date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}${lockRecurring ? ' (recurring)' : ''}. Reason: ${lockReason.trim()}`,
                            performed_by: profile?.id ?? null,
                          })
                        })()
                        const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('Lock timed out — please try again')), 15000))
                        await Promise.race([lockPromise, timeout])
                        qc.invalidateQueries({ queryKey: qk.schedule.all }); qc.invalidateQueries({ queryKey: qk.schedule.intelligence })
                        toast('Time locked', 'success')
                        setAssignModal(null); setShowLockFlow(false); setLockReason(''); setLockRecurring(false)
                      } catch (err: any) {
                        toast(err.message || 'Failed to lock time', 'error')
                        setAssignError(err.message || 'Failed to lock time')
                      } finally { setLockSubmitting(false) }
                    }}
                    disabled={!lockReason.trim() || lockSubmitting}
                    style={{ width: '100%', padding: '11px 16px', borderRadius: 10, background: lockReason.trim() ? '#64648C' : '#363656', border: 'none', cursor: lockReason.trim() ? 'pointer' : 'not-allowed', color: '#fff', fontWeight: 700, fontSize: 13, opacity: lockReason.trim() ? 1 : 0.5, marginBottom: 6 }}
                  >
                    {lockSubmitting ? 'Locking...' : 'Lock Time'}
                  </button>
                  {assignError && <div style={{ padding: '8px 12px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.15)', borderRadius: 8, fontSize: 12, color: '#EF4444', marginBottom: 6 }}>{assignError}</div>}
                  <button onClick={() => { setShowLockFlow(false); setLockReason(''); setAssignError(null) }} style={{ width: '100%', padding: '8px', borderRadius: 8, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#8080A8', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>Go Back</button>
                </div>
              ) : !selectedStudentId ? (
              /* Step 1: Search & select student */
                <>
                  <input
                    value={studentSearch}
                    onChange={(e) => setStudentSearch(e.target.value)}
                    placeholder="Search student name..."
                    autoFocus
                    style={{ width: '100%', padding: isMobile ? '14px 14px' : '10px 14px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.04)', color: '#E0E0F4', fontSize: isMobile ? 16 : 13, outline: 'none', boxSizing: 'border-box', minHeight: isMobile ? 48 : undefined }}
                  />
                  <div style={{ maxHeight: 260, overflowY: 'auto', marginTop: 8 }}>
                    {studentSearch.length === 0 ? (
                      <p style={{ fontSize: 12, color: '#606088', textAlign: 'center', padding: '20px 0' }}>Start typing to find a student...</p>
                    ) : filteredStudents.length === 0 ? (
                      <p style={{ fontSize: 12, color: '#606088', textAlign: 'center', padding: '20px 0' }}>No students match "{studentSearch}"</p>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        {filteredStudents.slice(0, 15).map((s) => (
                          <button
                            key={s.id}
                            type="button"
                            onClick={() => {
                              if (s.location_id !== assignModal.location_id) {
                                const studentId = s.id
                                setPendingConfirm({
                                  title: 'Different Location',
                                  message: `${s.first_name} ${s.last_name} is assigned to ${s.location_name || 'a different location'}. Are you sure you want to book them here?`,
                                  variant: 'warning',
                                  onConfirm: () => { setPendingConfirm(null); setSelectedStudentId(studentId); setAssignError(null) },
                                })
                                return
                              }
                              setSelectedStudentId(s.id)
                              setAssignError(null)
                            }}
                            style={{
                              display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: isMobile ? '14px 12px' : '10px 12px',
                              borderRadius: 8, border: 'none', background: 'rgba(255,255,255,0.03)', cursor: 'pointer',
                              transition: 'background 100ms ease', textAlign: 'left', width: '100%', minHeight: isMobile ? 48 : undefined,
                            }}
                            onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,184,0,0.08)')}
                            onMouseLeave={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.03)')}
                          >
                            <div>
                              <span style={{ fontSize: 13, fontWeight: 700, color: '#E0E0F4' }}>{s.first_name} {s.last_name}</span>
                              <span style={{ fontSize: 11, color: '#A0A0C8', marginLeft: 8 }}>{instrumentWithEmojiTitle(s.instrument)}</span>
                            </div>
                            <span style={{ fontSize: 10, color: s.location_id !== assignModal.location_id ? '#F97316' : '#606088' }}>{s.location_name}{s.location_id !== assignModal.location_id ? ' ⚠' : ''}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: 6, marginTop: 12 }}>
                    <button onClick={() => { setShowLockFlow(true); setAssignError(null) }} style={{ flex: 1, padding: '8px', borderRadius: 8, background: 'rgba(100,100,140,0.1)', border: '1px solid rgba(100,100,140,0.2)', color: '#64648C', cursor: 'pointer', fontSize: 11, fontWeight: 600 }}>Lock This Time</button>
                    <button onClick={() => setAssignModal(null)} style={{ flex: 1, padding: '8px', borderRadius: 8, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#8080A8', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>Cancel</button>
                  </div>
                </>
              ) : (
                /* Step 2: Configure the booking */
                (() => {
                  const picked = filteredStudents.find(s => s.id === selectedStudentId) ?? allStudents?.find((s: any) => s.id === selectedStudentId)
                  return (
                    <>
                      {/* Selected student display */}
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: 'rgba(255,184,0,0.08)', border: '1px solid rgba(255,184,0,0.15)', borderRadius: 10, marginBottom: 14 }}>
                        <div>
                          <span style={{ fontSize: 14, fontWeight: 800, color: '#E0E0F4' }}>{picked?.first_name} {picked?.last_name}</span>
                          <span style={{ fontSize: 11, color: '#A0A0C8', marginLeft: 8 }}>{instrumentWithEmojiTitle(picked?.instrument)}</span>
                        </div>
                        <button onClick={() => setSelectedStudentId('')} style={{ background: 'none', border: 'none', color: '#8080A8', cursor: 'pointer', fontSize: 11, textDecoration: 'underline' }}>Change</button>
                      </div>

                      {/* Session type */}
                      <div style={{ marginBottom: 12 }}>
                        <label style={{ fontSize: 10, fontWeight: 700, color: '#8080A8', textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: 6 }}>Session Type</label>
                        <select
                          value={assignBlockType}
                          onChange={(e) => setAssignBlockType(e.target.value as BlockType)}
                          style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.04)', color: '#E0E0F4', fontSize: 13, outline: 'none' }}
                        >
                          <option value="student_session">Music Session</option>
                          <option value="first_day">First Day</option>
                          <option value="last_day">Last Day</option>
                          <option value="meet_greet">Meet & Greet</option>
                          <option value="call_out">Call Out</option>
                          <option value="sub">Sub</option>
                          <option value="teacher_training">Teacher Training</option>
                        </select>
                      </div>

                      {/* Room — defaults to teacher's daily assignment if one exists */}
                      {availableRoomsForAssign.length > 0 && (() => {
                        const teacherDailyRoom = assignModal ? dailyRoomMap?.[assignModal.teacher_id] : null
                        const effectiveRoom = assignRoom || (teacherDailyRoom?.roomId ?? '')
                        return (
                          <div style={{ marginBottom: 12 }}>
                            <label style={{ fontSize: 10, fontWeight: 700, color: '#8080A8', textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: 6 }}>Room</label>
                            {teacherDailyRoom && !assignRoom && (
                              <div style={{ fontSize: 11, color: getLocationColor(effectiveLocation), marginBottom: 6, padding: '4px 8px', borderRadius: 6, background: `${getLocationColor(effectiveLocation)}10`, border: `1px solid ${getLocationColor(effectiveLocation)}20` }}>
                                Defaulting to {assignModal?.teacher_name?.split(' ')[0]}'s room today ({teacherDailyRoom.roomName})
                              </div>
                            )}
                            {!teacherDailyRoom && (
                              <div style={{ fontSize: 11, color: '#606088', marginBottom: 6, fontStyle: 'italic' }}>
                                No daily room set — assign one from the column header
                              </div>
                            )}
                            <select value={effectiveRoom} onChange={(e) => setAssignRoom(e.target.value)} style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.04)', color: '#E0E0F4', fontSize: 13, outline: 'none' }}>
                              <option value="">No room</option>
                              {availableRoomsForAssign.map((r: any) => (
                                <option key={r.id} value={r.id} disabled={r.taken}>{r.name}{r.taken ? ' (taken)' : ''}</option>
                              ))}
                            </select>
                          </div>
                        )
                      })()}

                      {/* Recurring — default ON, reason required if OFF */}
                      <div style={{ marginBottom: 14 }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                          <input type="checkbox" checked={recurring} onChange={(e) => { setRecurring(e.target.checked); if (e.target.checked) setNonRecurringReason('') }} style={{ accentColor: '#E8488A' }} />
                          <span style={{ fontSize: 12, color: '#C0C0E0' }}>Recurring every {new Date(assignModal.block_date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long' })}</span>
                        </label>
                        {!recurring && (
                          <div style={{ marginTop: 8, padding: 10, borderRadius: 8, background: 'rgba(255,184,0,0.06)', border: '1px solid rgba(255,184,0,0.15)' }}>
                            <div style={{ fontSize: 10, fontWeight: 700, color: '#FFB800', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Reason for single session</div>
                            <select value={nonRecurringReason} onChange={(e) => setNonRecurringReason(e.target.value)} style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.04)', color: '#E0E0F4', fontSize: 12, outline: 'none', marginBottom: nonRecurringReason === 'custom' ? 6 : 0 }}>
                              <option value="">Select reason...</option>
                              <option value="Substitute Coverage">Substitute Coverage</option>
                              <option value="Trial / Meet & Greet">Trial / Meet & Greet</option>
                              <option value="Make-Up Session">Make-Up Session</option>
                              <option value="One-Time Request">One-Time Request</option>
                              <option value="Schedule Conflict">Schedule Conflict</option>
                              <option value="custom">Custom reason...</option>
                            </select>
                            {nonRecurringReason === 'custom' && (
                              <input placeholder="Type your reason..." onChange={(e) => setNonRecurringReason(e.target.value)} className="filter-select" style={{ width: '100%', fontSize: 12 }} />
                            )}
                          </div>
                        )}
                      </div>

                      {assignError && <div style={{ padding: '8px 12px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.15)', borderRadius: 8, fontSize: 12, color: '#EF4444', marginBottom: 10 }}>{assignError}</div>}

                      {/* Book button */}
                      <button
                        onClick={async () => {
                          setAssignError(null)
                          // Require reason if not recurring
                          if (!recurring && (!nonRecurringReason || nonRecurringReason === 'custom')) {
                            setAssignError('Please select a reason for this single session.')
                            return
                          }
                          try {
                            // Log non-recurring reason to audit
                            if (!recurring && nonRecurringReason) {
                              await supabase.from('audit_log').insert({
                                action: 'NON_RECURRING_BOOKING',
                                table_name: 'schedule_blocks',
                                record_id: assignModal.block_id,
                                new_value: JSON.stringify({ reason: nonRecurringReason, teacher: assignModal.teacher_name, date: assignModal.block_date, time: assignModal.start_time }),
                                performed_by: profile?.id ?? null,
                              })
                            }
                            const bookTeacherDailyRoomId = dailyRoomMap?.[assignModal.teacher_id]?.roomId ?? ''
                            const bookEffectiveRoomId = assignRoom || bookTeacherDailyRoomId
                            if (bookEffectiveRoomId) {
                              const room = rooms?.find((r: any) => r.id === bookEffectiveRoomId)
                              // Check room conflict
                              const { data: conflict } = await supabase
                                .from('schedule_blocks')
                                .select('id, teacher_id')
                                .eq('block_date', assignModal.block_date)
                                .eq('start_time', assignModal.start_time)
                                .eq('room_id', bookEffectiveRoomId)
                                .neq('id', assignModal.block_id)
                                .not('student_id', 'is', null)
                                .limit(1)
                              if (conflict && conflict.length > 0) {
                                setAssignError(`Room "${room?.name ?? 'selected'}" is already booked at this time. Pick another room.`)
                                return
                              }
                              const { error: roomErr } = await supabase.from('schedule_blocks').update({ room_id: bookEffectiveRoomId, room: room?.name ?? null }).eq('id', assignModal.block_id)
                              if (roomErr) throw new Error('Failed to set room: ' + roomErr.message)
                            }
                            // Update block type if not default
                            if (assignBlockType !== 'student_session') {
                              const { error: typeErr } = await supabase.from('schedule_blocks').update({ block_type: assignBlockType }).eq('id', assignModal.block_id)
                              if (typeErr) throw new Error('Failed to set block type: ' + typeErr.message)
                            }
                            await assignStudent.mutateAsync({ blockId: assignModal.block_id, studentId: selectedStudentId, recurring })
                            setAssignModal(null)
                            setSelectedStudentId('')
                            setStudentSearch('')
                            setAssignRoom('')
                            setAssignBlockType('student_session')
                            setAssignError(null)
                          } catch (err: any) {
                            setAssignError(err.message ?? 'Failed to book lesson')
                          }
                        }}
                        disabled={assignStudent.isPending}
                        style={{ width: '100%', padding: isMobile ? '16px 16px' : '12px 16px', borderRadius: 10, background: '#FACC15', border: 'none', cursor: 'pointer', color: '#1A1A2E', fontWeight: 700, fontSize: 14, minHeight: isMobile ? 52 : undefined }}
                      >
                        {assignStudent.isPending ? 'Booking...' : 'Book Appointment'}
                      </button>
                      <button onClick={() => { setSelectedStudentId(''); setAssignModal(null) }} style={{ width: '100%', marginTop: 6, padding: '8px', borderRadius: 8, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#8080A8', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>Cancel</button>
                    </>
                  )
                })()
              )}
            </div>
          </div>
        </div>
      )}

      {/* Legacy detailModal removed — all block clicks now use CheckInModal which is fully responsive */}

      {lastDayBlock && (
        <LastDayConfirmModal block={lastDayBlock} onClose={() => setLastDayBlock(null)}
          onComplete={(count) => { setLastDayResult(`Last Day set. ${count} future block${count !== 1 ? 's' : ''} reverted to Open Time.`); setLastDayBlock(null); setDetailModal(null); setTimeout(() => setLastDayResult(null), 6000) }} />
      )}
      {firstDayBlock && (
        <FirstDayConfirmModal block={firstDayBlock} onClose={() => setFirstDayBlock(null)}
          onComplete={(count) => { setFirstDayResult(`First Day set. ${count} prior slot${count !== 1 ? 's' : ''} locked.`); setFirstDayBlock(null); setDetailModal(null); setTimeout(() => setFirstDayResult(null), 6000) }} />
      )}
      {checkInBlock && <CheckInModal block={checkInBlock} onClose={() => setCheckInBlock(null)} />}
      {seriesBlock && (
        <SeriesControlModal blockId={seriesBlock.block.block_id} action={seriesBlock.action}
          studentName={seriesBlock.block.student_name} teacherName={seriesBlock.block.teacher_name}
          time={formatTime(seriesBlock.block.start_time)} dayOfWeek={new Date(seriesBlock.block.block_date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long' })}
          onClose={() => setSeriesBlock(null)} onComplete={() => { setSeriesBlock(null); setDetailModal(null) }} />
      )}
      {pendingConfirm && (
        <ConfirmModal
          title={pendingConfirm.title}
          message={pendingConfirm.message}
          variant={pendingConfirm.variant ?? 'warning'}
          confirmLabel="Yes, Continue"
          onConfirm={pendingConfirm.onConfirm}
          onCancel={() => setPendingConfirm(null)}
        />
      )}
      {showCalloutWizard && (
        <TeacherCalloutWizard
          date={selectedDate}
          locationId={effectiveLocation}
          teachers={allGridTeachersFull}
          onClose={() => { setShowCalloutWizard(false); setCalloutPreselectedTeacherId(undefined) }}
          preSelectedTeacherId={calloutPreselectedTeacherId}
        />
      )}

      {bulkVirtualOpen && (
        <BulkVirtualModal
          blocks={blocks}
          date={selectedDate}
          tenantId={tenantId ?? ''}
          onClose={() => { setBulkVirtualOpen(false); qc.invalidateQueries({ queryKey: qk.schedule.all }); qc.invalidateQueries({ queryKey: qk.schedule.intelligence }) }}
        />
      )}

    </div>
    </IssueContextProvider>
  )
}

// Mini calendar component — like Square's date picker
function MiniCalendar({ selectedDate, onSelect, onClose }: { selectedDate: string; onSelect: (d: string) => void; onClose: () => void }) {
  const selected = new Date(selectedDate + 'T00:00:00')
  const [viewMonth, setViewMonth] = useState(selected.getMonth())
  const [viewYear, setViewYear] = useState(selected.getFullYear())

  const todayStr = toDateString(new Date())
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate()
  const firstDow = new Date(viewYear, viewMonth, 1).getDay()
  const monthName = new Date(viewYear, viewMonth, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })

  const prevMonth = () => {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(viewYear - 1) }
    else setViewMonth(viewMonth - 1)
  }
  const nextMonth = () => {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(viewYear + 1) }
    else setViewMonth(viewMonth + 1)
  }

  const days: (number | null)[] = []
  for (let i = 0; i < firstDow; i++) days.push(null)
  for (let d = 1; d <= daysInMonth; d++) days.push(d)

  return (
    <>
      <div style={{ position: 'fixed', inset: 0, zIndex: 9990 }} onClick={onClose} onContextMenu={(e) => { e.preventDefault(); onClose() }} />
      <div style={{
        position: 'absolute', top: '100%', left: '50%', transform: 'translateX(-50%)', marginTop: 8, zIndex: 9991,
        background: 'rgba(20,18,36,0.98)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 14,
        boxShadow: '0 12px 40px rgba(0,0,0,0.6)', padding: '14px 16px', width: 280,
      }}>
        {/* Month nav */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <button onClick={prevMonth} style={{ background: 'none', border: 'none', color: '#A0A0C8', cursor: 'pointer', fontSize: 16, padding: '2px 6px' }}>‹</button>
          <span style={{ fontSize: 14, fontWeight: 700, color: '#E0E0F4' }}>{monthName}</span>
          <button onClick={nextMonth} style={{ background: 'none', border: 'none', color: '#A0A0C8', cursor: 'pointer', fontSize: 16, padding: '2px 6px' }}>›</button>
        </div>
        {/* Day headers */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2, marginBottom: 4 }}>
          {['Su','Mo','Tu','We','Th','Fr','Sa'].map(d => (
            <div key={d} style={{ textAlign: 'center', fontSize: 10, fontWeight: 600, color: '#606088', padding: '4px 0' }}>{d}</div>
          ))}
        </div>
        {/* Day grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2 }}>
          {days.map((day, i) => {
            if (day === null) return <div key={`e${i}`} />
            const dateStr = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
            const isSelected = dateStr === selectedDate
            const isToday = dateStr === todayStr
            return (
              <button
                key={dateStr}
                onClick={() => onSelect(dateStr)}
                style={{
                  width: 34, height: 34, borderRadius: 10, border: 'none', cursor: 'pointer',
                  fontSize: 12, fontWeight: isSelected || isToday ? 700 : 500,
                  background: isSelected ? '#E8488A' : isToday ? 'rgba(232,72,138,0.15)' : 'transparent',
                  color: isSelected ? '#fff' : isToday ? '#E8488A' : '#C0C0E0',
                  transition: 'all 100ms ease',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
                onMouseEnter={(e) => { if (!isSelected) (e.currentTarget.style.background = 'rgba(255,255,255,0.06)') }}
                onMouseLeave={(e) => { if (!isSelected) (e.currentTarget.style.background = isToday ? 'rgba(232,72,138,0.15)' : 'transparent') }}
              >
                {day}
              </button>
            )
          })}
        </div>
      </div>
    </>
  )
}
