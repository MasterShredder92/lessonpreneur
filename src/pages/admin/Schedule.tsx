import { useState, useEffect, useRef, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { useSearchParams } from 'react-router-dom'
import MusicLoader from '../../components/shared/MusicLoader'
import { useAuthContext } from '../../app/AuthContext'
import { useLocations } from '../../hooks/useLocations'
import { useTeachers } from '../../hooks/useTeachers'
import { useScheduleGrid, useAssignStudent, useUnassignBlock, useChangeBlockType, useStudentsForAssignment, type GridBlock, type BlockType } from '../../hooks/useScheduleGrid'
import { useRooms } from '../../hooks/useRooms'
import { supabase } from '../../lib/supabase'
import { useQueryClient } from '@tanstack/react-query'
import SeriesControlModal from '../../components/scheduling/SeriesControlModal'
import CheckInModal from '../../components/scheduling/CheckInModal'
import LastDayConfirmModal from '../../components/scheduling/LastDayConfirmModal'
import FirstDayConfirmModal from '../../components/scheduling/FirstDayConfirmModal'
import ConfirmModal from '../../components/shared/ConfirmModal'
import { toast } from '../../components/shared/Toast'
import TeacherCalloutWizard from '../../components/scheduling/TeacherCalloutWizard'
import { useAI, type ScheduleContext } from '../../hooks/useAI'
import { ChevronLeft, ChevronRight, ChevronDown, Calendar, Music, MapPin, UserPlus, GripVertical, Check, Clock, DoorOpen, RefreshCw, Plus, PhoneOff, Star, Send, X } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'

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
}

// Block types that count toward teacher lesson tally
const COUNTS_AS_LESSON = new Set(['student_session', 'first_day', 'last_day', 'call_out', 'meet_greet', 'sub'])

export default function Schedule() {
  const { tenantId, profile, role } = useAuthContext()
  const qc = useQueryClient()
  const { data: locations } = useLocations()
  const { data: allTeachersList } = useTeachers()
  const [searchParams] = useSearchParams()

  const [selectedDate, setSelectedDate] = useState(() => toDateString(new Date()))
  const [selectedLocation, setSelectedLocation] = useState<string>(() => searchParams.get('location') ?? '')
  const [selectedTeacherFilter, setSelectedTeacherFilter] = useState<string>('')

  type VisibilityMode = 'scheduled' | 'available' | 'all'
  const [teacherVisibility, setTeacherVisibility] = useState<VisibilityMode>(() => {
    return (localStorage.getItem('schedule-teacher-visibility') as VisibilityMode) || 'available'
  })
  useEffect(() => {
    localStorage.setItem('schedule-teacher-visibility', teacherVisibility)
  }, [teacherVisibility])

  // Modal state
  const [assignModal, setAssignModal] = useState<GridBlock | null>(null)
  const [detailModal, setDetailModal] = useState<GridBlock | null>(null)
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
  const [pendingConfirm, setPendingConfirm] = useState<{ title: string; message: string; variant?: 'warning' | 'danger' | 'info'; onConfirm: () => void } | null>(null)

  // Drag state
  const [dragBlock, setDragBlock] = useState<GridBlock | null>(null)
  const [dragOverTarget, setDragOverTarget] = useState<string | null>(null)

  // Star AI panel
  const [starOpen, setStarOpen] = useState(false)
  const [starInput, setStarInput] = useState('')

  const effectiveLocation = selectedLocation || (locations?.[0]?.id ?? '')
  const { data: gridData, isLoading } = useScheduleGrid(selectedDate, effectiveLocation || null)
  const { data: allStudents } = useStudentsForAssignment()
  const { data: rooms } = useRooms(effectiveLocation || undefined)

  // Build schedule context for Star AI — gives it full awareness of current view
  const activeLocationName = locations?.find((l: any) => l.id === effectiveLocation)?.name?.replace(' Music Lessons', '') ?? ''
  const starContext: ScheduleContext | null = useMemo(() => {
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

  const { messages: starMessages, isLoading: starLoading, sendMessage: starSend, clearConversation: starClear, pendingAction, confirmAction, rejectAction } = useAI(tenantId, starContext)
  const starEndRef = useRef<HTMLDivElement>(null)
  const gridWrapperRef = useRef<HTMLDivElement>(null)
  const [, forceUpdate] = useState(0)
  // Re-render once after grid mounts so time indicator can measure DOM, then every minute
  useEffect(() => {
    const t1 = setTimeout(() => forceUpdate(n => n + 1), 100)
    const t2 = setInterval(() => forceUpdate(n => n + 1), 60000)
    return () => { clearTimeout(t1); clearInterval(t2) }
  }, [selectedDate, effectiveLocation])
  useEffect(() => { starEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [starMessages])
  const assignStudent = useAssignStudent()
  const unassignBlock = useUnassignBlock()
  const changeBlockType = useChangeBlockType()

  // Location hours for the selected date
  const selectedDow = new Date(selectedDate + 'T00:00:00').getDay()
  const { data: locationHours } = useQuery({
    queryKey: ['location-hours', effectiveLocation, selectedDow],
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
    queryKey: ['teacher-avail-schedule', effectiveLocation, selectedDayName],
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
    queryKey: ['sub-teachers', effectiveLocation],
    enabled: !!effectiveLocation,
    queryFn: async () => {
      const { data } = await supabase.from('teachers')
        .select('id, sub_available, profile:profiles!teachers_profile_id_fkey(first_name, last_name)')
        .eq('is_active', true)
        .eq('sub_available', true)
      return data ?? []
    },
  })

  if (!selectedLocation && locations?.length && locations.length > 0) {
    setSelectedLocation(locations[0].id)
  }

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
      qc.invalidateQueries({ queryKey: ['schedule-grid'] })
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
    // If room selected, check for conflict then update
    if (assignRoom) {
      const room = rooms?.find((r: any) => r.id === assignRoom)
      const { data: conflict } = await supabase
        .from('schedule_blocks')
        .select('id')
        .eq('block_date', assignModal.block_date)
        .eq('start_time', assignModal.start_time)
        .eq('room_id', assignRoom)
        .neq('id', assignModal.block_id)
        .not('student_id', 'is', null)
        .limit(1)
      if (conflict && conflict.length > 0) {
        toast(`Room "${room?.name ?? 'selected'}" is already booked at this time. Pick another room.`, 'error')
        return
      }
      await supabase.from('schedule_blocks').update({ room_id: assignRoom, room: room?.name ?? null }).eq('id', assignModal.block_id)
    }
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
  }

  const handleUnassign = () => {
    if (!detailModal) return
    if (detailModal.is_recurring) {
      setSeriesBlock({ block: detailModal, action: 'unassign' })
    } else {
      unassignBlock.mutateAsync(detailModal.block_id).then(() => setDetailModal(null))
    }
  }

  const handleDeleteBlock = async () => {
    if (!detailModal) return
    const { error } = await supabase.from('schedule_blocks').delete().eq('id', detailModal.block_id)
    if (error) { toast('Failed to delete block: ' + error.message, 'error'); return }
    qc.invalidateQueries({ queryKey: ['schedule-grid'] })
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
      await qc.invalidateQueries({ queryKey: ['schedule-grid'] })
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

  const scheduledTeacherIds = new Set<string>()
  const subTeacherIds = new Set<string>()
  for (const b of allBlocks) {
    if (b.block_type !== 'open_time' && b.block_type !== 'not_bookable') scheduledTeacherIds.add(b.teacher_id)
    if (b.block_type === 'sub') subTeacherIds.add(b.teacher_id)
  }

  // Sort all teachers alphabetically by first name
  fullTeacherList.sort((a, b) => a.name.localeCompare(b.name))

  let visibleTeachers = fullTeacherList
  if (selectedTeacherFilter) {
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
    if (selectedTeacherFilter && b.teacher_id !== selectedTeacherFilter) continue
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

  // Secondary role check (primary is RouteGuard)
  if (role !== 'owner' && role !== 'admin') {
    return <div className="page" style={{ padding: 40, textAlign: 'center', color: '#8080A8' }}>Access restricted to owners and admins.</div>
  }

  return (
    <div className="page" style={{ maxWidth: 'none' }}>
      {/* Location tabs — big, prominent, colored */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        {locations?.filter((l: any) => l.is_active).map((loc: any) => {
          const c = (loc as any).color ?? '#D4226A'
          const active = loc.id === effectiveLocation
          return (
            <button key={loc.id} onClick={() => setSelectedLocation(loc.id)} style={{
              padding: '8px 20px', borderRadius: 10, fontSize: 14, fontWeight: 800, cursor: 'pointer', letterSpacing: '-0.01em',
              background: active ? c : 'transparent', color: active ? '#fff' : '#606088',
              border: active ? `2px solid ${c}` : '2px solid rgba(255,255,255,0.06)',
              boxShadow: active ? `0 4px 16px ${c}40` : 'none', transition: 'all 150ms ease',
            }}>{loc.name.replace(' Music Lessons', '')}</button>
          )
        })}
      </div>

      {/* Date nav + filters — clean bar with location-colored border */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', background: 'rgba(255,255,255,0.02)', border: `1px solid ${locColor}25`, borderRadius: 12, marginBottom: 10, position: 'relative', overflow: 'visible', zIndex: 50 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <button onClick={() => navigateDate(-1)} style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#A0A0C8' }}><ChevronLeft size={15} /></button>
          <button onClick={() => setSelectedDate(toDateString(new Date()))} style={{ padding: '4px 12px', borderRadius: 7, fontSize: 10, fontWeight: 700, cursor: 'pointer', background: isToday ? locColor : 'rgba(255,255,255,0.06)', color: isToday ? '#fff' : '#A0A0C8', border: isToday ? 'none' : '1px solid rgba(255,255,255,0.08)' }}>Today</button>
          <button onClick={() => navigateDate(1)} style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#A0A0C8' }}><ChevronRight size={15} /></button>
        </div>
        <div style={{ position: 'relative' }}>
          <button onClick={() => setShowCalendar(!showCalendar)} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}>
            <Calendar size={15} style={{ color: locColor }} />
            <span style={{ fontSize: 15, fontWeight: 700, color: '#E0E0F4', letterSpacing: '-0.02em' }}>{formatDateNav(currentDate)}</span>
            <ChevronDown size={12} style={{ color: '#8080A8' }} />
          </button>
          {showCalendar && <MiniCalendar selectedDate={selectedDate} onSelect={(d) => { setSelectedDate(d); setShowCalendar(false) }} onClose={() => setShowCalendar(false)} />}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 10, color: '#606088' }}>{teachers.length} teacher{teachers.length !== 1 ? 's' : ''}</span>
          <select value={selectedTeacherFilter} onChange={(e) => setSelectedTeacherFilter(e.target.value)} style={{ padding: '5px 10px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.04)', color: '#A0A0C8', fontSize: 11, outline: 'none' }}>
            <option value="">All Teachers</option>
            {allGridTeachersFull.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          <button onClick={() => setShowAddTeacher(true)} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', borderRadius: 7, border: `1px solid ${locColor}40`, background: `${locColor}15`, color: locColor, fontSize: 10, fontWeight: 600, cursor: 'pointer' }}><Plus size={11} /> Sub</button>
          <button onClick={() => setShowCalloutWizard(true)} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', borderRadius: 7, border: '1px solid rgba(239,68,68,0.4)', background: 'rgba(239,68,68,0.1)', color: '#EF4444', fontSize: 10, fontWeight: 600, cursor: 'pointer' }}><PhoneOff size={11} /> Call Out</button>
        </div>
      </div>

      {lastDayResult && <div style={{ padding: '8px 14px', background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.15)', borderRadius: 10, marginBottom: 8, fontSize: 11, color: '#EF4444' }}>{lastDayResult}</div>}
      {firstDayResult && <div style={{ padding: '8px 14px', background: 'rgba(59,130,246,0.06)', border: '1px solid rgba(59,130,246,0.15)', borderRadius: 10, marginBottom: 8, fontSize: 11, color: '#3B82F6' }}>{firstDayResult}</div>}

      {/* Legend — centered, readable */}
      <div style={{ display: 'flex', justifyContent: 'center', gap: 16, marginBottom: 12 }}>
        {[
          { label: 'Booked', color: '#FACC15' }, { label: 'First Day', color: '#38BDF8' }, { label: 'Last Day', color: '#DC0000' },
          { label: 'Call Out', color: '#FF8000' }, { label: 'Meet & Greet', color: '#FF1493' }, { label: 'Sub', color: '#22C55E' }, { label: 'Training', color: '#818CF8' },
        ].map((l) => (
          <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ width: 12, height: 12, borderRadius: 4, background: l.color }} />
            <span style={{ fontSize: 11, color: '#A0A0C8', fontWeight: 500 }}>{l.label}</span>
          </div>
        ))}
      </div>

      {/* Schedule Grid — Premium Column Layout */}
      {isLoading ? (
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
        <div ref={gridWrapperRef} style={{ overflowX: 'auto', borderRadius: 16, border: `1px solid ${locColor}20`, background: 'rgba(12,11,22,0.95)', position: 'relative' }}>
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

            return (
              <div style={{ position: 'absolute', top: topPos, left: 0, right: 0, zIndex: 10, pointerEvents: 'none', display: 'flex', alignItems: 'center' }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#E8488A', flexShrink: 0, marginLeft: -4 }} />
                <div style={{ flex: 1, height: 2, background: '#E8488A', opacity: 0.6 }} />
              </div>
            )
          })()}
          <div style={{ display: 'grid', gridTemplateColumns: `52px repeat(${teachers.length}, minmax(140px, 1fr))`, minWidth: teachers.length > 6 ? teachers.length * 150 : undefined }}>
            {/* Header Row — Clean teacher names like Square */}
            <div style={{ padding: '16px 6px', borderBottom: '1px solid rgba(255,255,255,0.08)' }} />
            {teachers.map((t) => {
              const booked = teacherBookedCount.get(t.id) ?? 0
              // Sub = teacher does NOT have availability at this location on this day
              const hasAvailToday = teacherAvailability ? teacherAvailability.has(t.id) : true
              const isSub = !hasAvailToday
              return (
                <div key={t.id} style={{ padding: '10px 10px', borderBottom: '1px solid rgba(255,255,255,0.08)', borderLeft: '1px solid rgba(255,255,255,0.04)', textAlign: 'center', position: 'relative' }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: isSub ? '#22C55E' : '#E0E0F4', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.name}</div>
                  {(t as any).photo_url && (
                    <img src={(t as any).photo_url} alt="" style={{ width: 28, height: 28, borderRadius: '50%', objectFit: 'cover', border: '1px solid rgba(255,255,255,0.1)', marginTop: 4, display: 'block', marginLeft: 'auto', marginRight: 'auto' }} />
                  )}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 2 }}>
                    {isSub && <span style={{ fontSize: 8, padding: '1px 6px', borderRadius: 4, background: 'rgba(34,197,94,0.15)', color: '#22C55E', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Sub</span>}
                    {booked > 0 && <span style={{ fontSize: 10, color: '#8080A8' }}>{booked} lesson{booked !== 1 ? 's' : ''}</span>}
                    {isSub && (
                      <button
                        onClick={async () => {
                          // Remove all blocks for this sub teacher on this date at this location
                          const { error } = await supabase.from('schedule_blocks').delete()
                            .eq('teacher_id', t.id)
                            .eq('block_date', selectedDate)
                            .eq('location_id', effectiveLocation)
                          if (error) { toast('Failed to remove sub: ' + error.message, 'error'); return }
                          qc.invalidateQueries({ queryKey: ['schedule-grid'] })
                          toast('Sub removed', 'success')
                        }}
                        title="Remove sub from today"
                        style={{ fontSize: 9, padding: '1px 6px', borderRadius: 4, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.15)', color: '#EF4444', cursor: 'pointer', fontWeight: 600 }}
                      >
                        Remove
                      </button>
                    )}
                  </div>
                </div>
              )
            })}

            {/* Time Rows */}
            {timeSlots.map((time, timeIdx) => (
              <>
                {/* Time Label — clean left axis */}
                <div key={`time-${time}`} {...(timeIdx === 0 ? { 'data-time-row': '' } : timeIdx === 1 ? { 'data-time-row-second': '' } : {})} style={{ padding: '0 4px', display: 'flex', alignItems: 'flex-start', justifyContent: 'flex-end', height: 72, paddingTop: 4, borderBottom: '1px solid rgba(255,255,255,0.03)', fontSize: 11, fontWeight: 500, color: '#606088' }}>
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
                      <div key={`${time}-${t.id}`} style={{ height: 72, borderBottom: '1px solid rgba(255,255,255,0.03)', borderLeft: '1px solid rgba(255,255,255,0.04)', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(72,72,112,0.03)' }}>
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
                            qc.invalidateQueries({ queryKey: ['schedule-grid'] })
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
                          height: 72, borderBottom: '1px solid rgba(255,255,255,0.03)', borderLeft: '1px solid rgba(255,255,255,0.04)',
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
                      <div key={`${time}-${t.id}`} style={{ height: 72, borderBottom: '1px solid rgba(255,255,255,0.03)', borderLeft: '1px solid rgba(255,255,255,0.04)', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(72,72,112,0.03)' }}>
                        <span style={{ fontSize: 9, color: '#363656', fontWeight: 500, textAlign: 'center', padding: '0 6px' }}>{unavailMsg}</span>
                      </div>
                    )
                  }

                  // Open slot — green "Open" block, clickable to book
                  if (bt === 'open_time') {
                    return (
                      <div
                        key={`${time}-${t.id}`}
                        onClick={() => { setAssignModal(block); setRecurring(true); setSelectedStudentId(''); setStudentSearch(''); setAssignRoom(''); setAssignError(null) }}
                        onDragOver={(e) => { e.preventDefault(); setDragOverTarget(block.block_id) }}
                        onDragLeave={() => setDragOverTarget(null)}
                        onDrop={(e) => { e.preventDefault(); handleDrop(block) }}
                        style={{
                          height: 72, borderBottom: '1px solid rgba(255,255,255,0.03)', borderLeft: '1px solid rgba(255,255,255,0.04)',
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
                      <div key={`${time}-${t.id}`} onClick={() => setCheckInBlock(block)} style={{ height: 72, borderBottom: '1px solid rgba(255,255,255,0.03)', borderLeft: '1px solid rgba(255,255,255,0.04)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <span style={{ fontSize: 10, color: '#363656', fontWeight: 600 }}>Locked</span>
                      </div>
                    )
                  }

                  // Teacher training — indigo chip
                  if (bt === 'teacher_training') {
                    return (
                      <div key={`${time}-${t.id}`} onClick={() => setCheckInBlock(block)} style={{ height: 72, borderBottom: '1px solid rgba(255,255,255,0.03)', borderLeft: '1px solid rgba(255,255,255,0.04)', padding: '3px 4px', cursor: 'pointer' }}>
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
                    call_out: '#FF8000',
                    meet_greet: '#FF1493',
                    sub: '#22C55E',
                  }
                  const bgColor = solidColors[bt] ?? '#FACC15'
                  // Dark text for light backgrounds (yellow, blue, teal, orange), white for dark (red, purple)
                  const darkBgTypes = new Set(['last_day', 'sub'])
                  const textColor = darkBgTypes.has(bt) ? '#fff' : '#111'
                  const textColorMuted = darkBgTypes.has(bt) ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.55)'

                  // Booked block — solid color fill, faded if checked in
                  const isCheckedIn = block.checked_in
                  const isPendingTally = block.checked_in && !block.teacher_tally
                  return (
                    <div
                      key={`${time}-${t.id}`}
                      draggable
                      onDragStart={(e) => { setDragBlock(block); e.dataTransfer.effectAllowed = 'move' }}
                      onDragEnd={() => { setDragBlock(null); setDragOverTarget(null) }}
                      onClick={() => setCheckInBlock(block)}
                      style={{ height: 72, borderBottom: '1px solid rgba(255,255,255,0.03)', borderLeft: '1px solid rgba(255,255,255,0.04)', padding: '3px 4px', cursor: 'grab' }}
                    >
                      <div
                        style={{
                          height: '100%', borderRadius: 8, padding: '6px 8px',
                          display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', textAlign: 'center' as const, gap: 1,
                          transition: 'transform 120ms ease, box-shadow 120ms ease',
                          border: isPendingTally ? `2px dashed ${bgColor}` : '2px solid transparent',
                          background: (isCheckedIn && !isPendingTally)
                            ? `${bgColor}50`   /* ~30% — done/tallied, no outline */
                            : isPendingTally
                            ? `${bgColor}50`   /* ~30% — pending, dashed outline */
                            : bgColor,          /* 100% — upcoming, no outline */
                          boxShadow: isCheckedIn ? 'none' : `0 2px 8px ${bgColor}40`,
                        }}
                        onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.transform = 'scale(1.03)' }}
                        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.transform = 'scale(1)' }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <span style={{ fontSize: 10, fontWeight: 800, color: textColor }}>{formatTime(block.start_time)}</span>
                          {isCheckedIn && <Check size={9} style={{ color: textColor }} />}
                          {block.fifth_week && <span style={{ fontSize: 7, color: textColorMuted, fontWeight: 800 }}>5th</span>}
                        </div>
                        <span style={{ fontSize: 11, fontWeight: 700, color: textColor, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%' }}>{block.student_name}</span>
                        {block.original_teacher_name && (
                          <span style={{ fontSize: 8, fontWeight: 700, color: '#FF8C00', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%' }}>↩ {block.original_teacher_name} called out</span>
                        )}
                        <span style={{ fontSize: 9, color: textColorMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%' }}>
                          {block.instrument ? block.instrument.charAt(0).toUpperCase() + block.instrument.slice(1) : ''}
                          {bt !== 'student_session' ? ` — ${bt === 'first_day' ? 'First Day' : bt === 'last_day' ? 'Last Day' : bt === 'call_out' ? 'Call Out' : bt === 'meet_greet' ? 'Meet & Greet' : bt === 'sub' ? 'Sub' : ''}` : ''}
                          {isPendingTally ? ' — Pending' : ''}
                        </span>
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
                              qc.invalidateQueries({ queryKey: ['schedule-grid'] })
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
                                qc.invalidateQueries({ queryKey: ['schedule-grid'] })
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
        <div className="modal-overlay" onClick={() => setAssignModal(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 400 }}>
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
                      try {
                        await supabase.from('schedule_blocks').update({ block_type: 'not_bookable', notes: `[Locked] ${lockReason.trim()}` }).eq('id', assignModal.block_id)
                        if (lockRecurring) {
                          // Lock all future blocks at same teacher/time/DOW
                          const dow = new Date(assignModal.block_date + 'T00:00:00').getDay()
                          const { data: futureBlocks } = await supabase.from('schedule_blocks').select('id, block_date')
                            .eq('teacher_id', assignModal.teacher_id).eq('start_time', assignModal.start_time).eq('status', 'available').gt('block_date', assignModal.block_date)
                          const sameDayIds = (futureBlocks ?? [])
                            .filter((fb: any) => new Date(fb.block_date + 'T00:00:00').getDay() === dow)
                            .map((fb: any) => fb.id)
                          if (sameDayIds.length > 0) {
                            await supabase.from('schedule_blocks').update({ block_type: 'not_bookable', notes: `[Locked] ${lockReason.trim()}` }).in('id', sameDayIds)
                          }
                        }
                        await supabase.from('activity_log').insert({
                          tenant_id: assignModal.tenant_id, entity_type: 'schedule_block', entity_id: assignModal.block_id,
                          action: 'lock_time', description: `Locked: ${assignModal.teacher_name} @ ${formatTime(assignModal.start_time)} on ${new Date(assignModal.block_date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}${lockRecurring ? ' (recurring)' : ''}. Reason: ${lockReason.trim()}`,
                          performed_by: profile?.id ?? null,
                        }).then(() => {})
                        qc.invalidateQueries({ queryKey: ['schedule-grid'] })
                        setAssignModal(null); setShowLockFlow(false); setLockReason(''); setLockRecurring(false)
                      } catch (err: any) { setAssignError(err.message) }
                      finally { setLockSubmitting(false) }
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
                    style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.04)', color: '#E0E0F4', fontSize: 13, outline: 'none', boxSizing: 'border-box' }}
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
                              display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px',
                              borderRadius: 8, border: 'none', background: 'rgba(255,255,255,0.03)', cursor: 'pointer',
                              transition: 'background 100ms ease', textAlign: 'left', width: '100%',
                            }}
                            onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,184,0,0.08)')}
                            onMouseLeave={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.03)')}
                          >
                            <div>
                              <span style={{ fontSize: 13, fontWeight: 700, color: '#E0E0F4' }}>{s.first_name} {s.last_name}</span>
                              <span style={{ fontSize: 11, color: '#A0A0C8', marginLeft: 8 }}>{s.instrument}</span>
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
                          <span style={{ fontSize: 11, color: '#A0A0C8', marginLeft: 8 }}>{picked?.instrument}</span>
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

                      {/* Room */}
                      {availableRoomsForAssign.length > 0 && (
                        <div style={{ marginBottom: 12 }}>
                          <label style={{ fontSize: 10, fontWeight: 700, color: '#8080A8', textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: 6 }}>Room</label>
                          <select value={assignRoom} onChange={(e) => setAssignRoom(e.target.value)} style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.04)', color: '#E0E0F4', fontSize: 13, outline: 'none' }}>
                            <option value="">No room</option>
                            {availableRoomsForAssign.map((r: any) => (
                              <option key={r.id} value={r.id} disabled={r.taken}>{r.name}{r.taken ? ' (taken)' : ''}</option>
                            ))}
                          </select>
                        </div>
                      )}

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
                            if (assignRoom) {
                              const room = rooms?.find((r: any) => r.id === assignRoom)
                              // Check room conflict
                              const { data: conflict } = await supabase
                                .from('schedule_blocks')
                                .select('id, teacher_id')
                                .eq('block_date', assignModal.block_date)
                                .eq('start_time', assignModal.start_time)
                                .eq('room_id', assignRoom)
                                .neq('id', assignModal.block_id)
                                .not('student_id', 'is', null)
                                .limit(1)
                              if (conflict && conflict.length > 0) {
                                setAssignError(`Room "${room?.name ?? 'selected'}" is already booked at this time. Pick another room.`)
                                return
                              }
                              await supabase.from('schedule_blocks').update({ room_id: assignRoom, room: room?.name ?? null }).eq('id', assignModal.block_id)
                            }
                            // Update block type if not default
                            if (assignBlockType !== 'student_session') {
                              await supabase.from('schedule_blocks').update({ block_type: assignBlockType }).eq('id', assignModal.block_id)
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
                        style={{ width: '100%', padding: '12px 16px', borderRadius: 10, background: '#FACC15', border: 'none', cursor: 'pointer', color: '#1A1A2E', fontWeight: 700, fontSize: 14 }}
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

      {/* Detail Modal */}
      {detailModal && (
        <div className="modal-overlay" onClick={() => setDetailModal(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 440 }}>
            <div className="modal-header">
              <span className="modal-title">Block Details</span>
              <button className="btn-ghost" onClick={() => setDetailModal(null)} style={{ padding: '4px 8px' }}>X</button>
            </div>
            <div className="modal-form">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {[
                  { label: 'Teacher', value: detailModal.teacher_name },
                  { label: 'Time', value: `${formatTime(detailModal.start_time)} – ${formatTime(detailModal.end_time)}` },
                  { label: 'Student', value: detailModal.student_name },
                  { label: 'Instrument', value: detailModal.instrument },
                  { label: 'Recurring', value: detailModal.is_recurring ? 'Yes' : 'No' },
                  ...(detailModal.room ? [{ label: 'Room', value: detailModal.room }] : []),
                  { label: 'Status', value: detailModal.checked_in ? 'Checked In' : 'Pending' },
                ].map((row) => (
                  <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                    <span style={{ fontSize: 11, color: '#8080A8', fontWeight: 600 }}>{row.label}</span>
                    <span style={{ fontSize: 12, color: '#E0E0F4', fontWeight: 600 }}>{row.value}</span>
                  </div>
                ))}
              </div>

              {/* Locked block context — explain why it's locked */}
              {detailModal.block_type === 'not_bookable' && !detailModal.student_id && (
                <div style={{ marginTop: 12, padding: '10px 14px', background: 'rgba(72,72,112,0.08)', border: '1px solid rgba(72,72,112,0.15)', borderRadius: 10, fontSize: 12, color: '#A0A0C8', lineHeight: 1.6 }}>
                  {detailModal.notes ? (
                    <span>{detailModal.notes}</span>
                  ) : (
                    <span>This slot is locked. It may be held for an upcoming First Day student. You can still book a <strong>one-off</strong> session here, but not a recurring one.</span>
                  )}
                </div>
              )}

              {detailModal.student_id && (
                <div className="form-field" style={{ marginTop: 12 }}>
                  <label>Block Type</label>
                  <select
                    value={detailModal.block_type}
                    onChange={async (e) => {
                      const newType = e.target.value as BlockType
                      if (newType === 'last_day') { setLastDayBlock(detailModal); return }
                      if (newType === 'first_day') { setFirstDayBlock(detailModal); return }
                      await changeBlockType.mutateAsync({ blockId: detailModal.block_id, blockType: newType })
                      setDetailModal({ ...detailModal, block_type: newType })
                    }}
                    className="filter-select"
                    style={{ width: '100%' }}
                    disabled={changeBlockType.isPending}
                  >
                    <option value="student_session">Music Session</option>
                    <option value="first_day">First Day</option>
                    <option value="last_day">Last Day</option>
                    <option value="call_out">Call Out</option>
                    <option value="meet_greet">Meet & Greet</option>
                    <option value="sub">Sub</option>
                    <option value="not_bookable">Locked</option>
                    <option value="teacher_training">Teacher Training</option>
                  </select>
                </div>
              )}

              <div className="modal-actions">
                {detailModal.student_id ? (
                  <button className="btn-ghost" onClick={handleUnassign} disabled={unassignBlock.isPending} style={{ color: '#EF4444' }}>
                    {unassignBlock.isPending ? 'Removing...' : 'Remove Student'}
                  </button>
                ) : (
                  <button className="btn-ghost" onClick={handleDeleteBlock} style={{ color: '#EF4444' }}>
                    Delete Block
                  </button>
                )}
                <button className="btn-ghost" onClick={() => setDetailModal(null)}>Close</button>
              </div>
            </div>
          </div>
        </div>
      )}

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
          onClose={() => setShowCalloutWizard(false)}
        />
      )}

      {/* Star AI — portaled to body so position:fixed works above overflow:auto ancestors */}
      {createPortal(<>
      <button
        onClick={() => setStarOpen(!starOpen)}
        style={{
          position: 'fixed', bottom: 24, right: 24, zIndex: 9999,
          height: 44, borderRadius: 22, border: 'none', cursor: 'pointer',
          padding: starOpen ? '0 16px' : '0 18px 0 14px',
          background: starOpen ? '#1A1830' : 'linear-gradient(135deg, #D4226A, #FF5500)',
          boxShadow: starOpen ? '0 4px 20px rgba(0,0,0,0.4)' : '0 6px 24px rgba(212,34,106,0.4)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
          transition: 'all 200ms ease',
        }}
      >
        {starOpen
          ? <X size={18} style={{ color: '#A0A0C8' }} />
          : <><Star size={17} style={{ color: '#fff' }} /><span style={{ color: '#fff', fontSize: 13, fontWeight: 700, letterSpacing: '-0.01em' }}>Ask Star</span></>
        }
      </button>

      {starOpen && (
        <div style={{
          position: 'fixed', bottom: 80, right: 24, zIndex: 9999,
          width: 380, maxHeight: '60vh', borderRadius: 16,
          background: '#141224', border: '1px solid rgba(212,34,106,0.2)',
          boxShadow: '0 20px 60px rgba(0,0,0,0.6), 0 0 40px rgba(212,34,106,0.06)',
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}>
          {/* Header */}
          <div style={{ padding: '14px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'linear-gradient(135deg, #FFB800, #FF5500)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Star size={13} style={{ color: '#fff' }} />
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 800, color: '#F0F0FF' }}>Star</div>
                <div style={{ fontSize: 10, color: '#A0A0C8' }}>Schedule Assistant</div>
              </div>
            </div>
            {starMessages.length > 0 && (
              <button onClick={starClear} style={{ fontSize: 10, color: '#8080A8', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>Clear</button>
            )}
          </div>

          {/* Messages */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px' }}>
            {starMessages.length === 0 && (
              <div style={{ textAlign: 'center', padding: '16px 0' }}>
                <p style={{ fontSize: 12, color: '#A0A0C8', lineHeight: 1.6, marginBottom: 12 }}>
                  Tell me what to do with the schedule. I can move lessons, find sub coverage, and cancel blocks.
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {['Move Maddox to 3:30 today', 'Find coverage for all callouts', 'Cancel John\'s lesson today — sick'].map(s => (
                    <button key={s} onClick={() => { starSend(s); setStarInput('') }} style={{
                      padding: '8px 12px', borderRadius: 8, fontSize: 11, fontWeight: 600, cursor: 'pointer',
                      background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', color: '#A0A0C8',
                      textAlign: 'left', transition: 'all 100ms ease',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(212,34,106,0.2)'; e.currentTarget.style.color = '#E0E0F4' }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)'; e.currentTarget.style.color = '#A0A0C8' }}
                    >{s}</button>
                  ))}
                </div>
              </div>
            )}
            {starMessages.map((msg, i) => (
              <div key={i} style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: msg.role === 'user' ? '#E8488A' : '#FFB800', marginBottom: 3, display: 'flex', alignItems: 'center', gap: 4 }}>
                  {msg.role === 'assistant' && <Star size={9} />}
                  {msg.role === 'user' ? 'You' : 'Star'}
                </div>
                <div style={{ fontSize: 12, color: '#E0E0F4', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{msg.content}</div>
              </div>
            ))}
            {starLoading && <div style={{ fontSize: 12, color: '#FFB800', fontStyle: 'italic' }}>Thinking...</div>}
            <div ref={starEndRef} />
          </div>

          {/* Action confirmation */}
          {pendingAction && (
            <div style={{ padding: '10px 16px', borderTop: '1px solid rgba(255,255,255,0.06)', background: 'rgba(168,85,247,0.06)', flexShrink: 0 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#A855F7', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Confirm Action</div>
              <div style={{ fontSize: 12, color: '#E8E8FC', marginBottom: 8, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{pendingAction.description}</div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button onClick={async () => { await confirmAction(); qc.invalidateQueries({ queryKey: ['schedule-grid'] }) }} disabled={starLoading} style={{ flex: 1, padding: '8px', borderRadius: 8, background: '#22C55E', border: 'none', color: '#fff', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>Confirm</button>
                <button onClick={rejectAction} style={{ flex: 1, padding: '8px', borderRadius: 8, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#A0A0C8', fontWeight: 600, fontSize: 12, cursor: 'pointer' }}>Cancel</button>
              </div>
            </div>
          )}

          {/* Input */}
          <div style={{ padding: '10px 12px', borderTop: '1px solid rgba(255,255,255,0.06)', display: 'flex', gap: 6, flexShrink: 0 }}>
            <input
              value={starInput}
              onChange={e => setStarInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && starInput.trim()) { starSend(starInput.trim()); setStarInput('') } }}
              placeholder="Move John to 3:30..."
              disabled={starLoading}
              style={{
                flex: 1, padding: '9px 12px', borderRadius: 8,
                background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)',
                color: '#F0F0FF', fontFamily: 'inherit', fontSize: 12, outline: 'none',
              }}
            />
            <button
              onClick={() => { if (starInput.trim()) { starSend(starInput.trim()); setStarInput('') } }}
              disabled={starLoading || !starInput.trim()}
              style={{
                padding: '9px 12px', borderRadius: 8, border: 'none', cursor: 'pointer',
                background: starInput.trim() ? '#D4226A' : '#363656', color: '#fff',
              }}
            >
              <Send size={14} />
            </button>
          </div>
        </div>
      )}
      </>, document.body)}
    </div>
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
