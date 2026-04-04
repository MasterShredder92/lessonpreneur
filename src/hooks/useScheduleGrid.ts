import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { sendAppointmentNotification, buildBlockContext } from '../lib/appointmentNotifications'

export type BlockType = 'open_time' | 'student_session' | 'first_day' | 'last_day' | 'not_bookable' | 'sub' | 'call_out' | 'meet_greet' | 'teacher_training' | 'makeup_session'

export interface SessionLogSummary {
  id: string
  worked_on: string[]
  engagement_level: number | null
  progress_indicator: string | null
  teacher_note: string | null
  parent_update_status: string | null
}

export interface GridBlock {
  block_id: string
  tenant_id: string
  location_id: string
  location_name: string
  teacher_id: string
  teacher_name: string
  student_id: string | null
  student_name: string | null
  instrument: string | null
  block_date: string
  start_time: string
  end_time: string
  status: 'available' | 'booked'
  block_type: BlockType
  is_recurring: boolean
  checked_in: boolean
  teacher_tally: boolean
  fifth_week: boolean
  room: string | null
  room_id: string | null
  notes: string | null
  original_teacher_id: string | null
  original_teacher_name: string | null
  has_session_log: boolean
  session_log: SessionLogSummary | null
  is_virtual: boolean
  meet_link: string | null
  meet_event_id: string | null
  is_family_callout: boolean
  callout_id: string | null
  is_makeup_session: boolean
  makeup_session_id: string | null
}

export function useScheduleGrid(date: string, locationId: string | null) {
  return useQuery({
    queryKey: ['schedule-grid', date, locationId],
    enabled: !!date,
    queryFn: async () => {
      let query = supabase
        .from('schedule_blocks')
        .select(`
          id, tenant_id, location_id, teacher_id, student_id,
          block_date, start_time, end_time, status, block_type,
          is_recurring, checked_in, teacher_tally, fifth_week, room, room_id, notes,
          original_teacher_id, original_teacher_name,
          is_virtual, meet_link, meet_event_id,
          is_family_callout, callout_id, is_makeup_session, makeup_session_id
        `)
        .eq('block_date', date)
        .order('start_time')

      if (locationId) {
        query = query.eq('location_id', locationId)
      }

      const { data: blocks, error } = await query
      if (error) throw error

      // Get teacher names
      const teacherIds = [...new Set(blocks.map((b: any) => b.teacher_id))]
      if (teacherIds.length === 0) return { blocks: [], teachers: [], timeSlots: [] }

      const { data: teachers } = await supabase
        .from('teachers')
        .select('id, first_name, last_name, photo_url, profile:profiles!teachers_profile_id_fkey(first_name, last_name)')
        .in('id', teacherIds)

      const teacherMap = new Map<string, string>()
      const teacherPhotoMap = new Map<string, string | null>()
      teachers?.forEach((t: any) => {
        const name = t.first_name ? `${t.first_name} ${t.last_name ?? ''}`.trim() : `${t.profile?.first_name ?? ''} ${t.profile?.last_name ?? ''}`.trim()
        teacherMap.set(t.id, name || 'Unknown')
        teacherPhotoMap.set(t.id, t.photo_url ?? null)
      })

      // Get student names for booked blocks
      const studentIds = blocks.filter((b: any) => b.student_id).map((b: any) => b.student_id)
      const studentMap = new Map<string, { name: string; instrument: string }>()
      if (studentIds.length > 0) {
        const { data: students } = await supabase
          .from('students')
          .select('id, first_name, last_name, instrument')
          .in('id', studentIds)
        students?.forEach((s: any) => {
          studentMap.set(s.id, { name: `${s.first_name} ${s.last_name}`, instrument: s.instrument })
        })
      }

      // Get room names
      const roomIds = blocks.filter((b: any) => b.room_id).map((b: any) => b.room_id)
      const roomMap = new Map<string, string>()
      if (roomIds.length > 0) {
        const { data: rooms } = await supabase.from('rooms').select('id, name').in('id', [...new Set(roomIds)])
        rooms?.forEach((r: any) => roomMap.set(r.id, r.name))
      }

      // Get location name
      const locId = locationId || blocks[0]?.location_id
      let locationName = ''
      if (locId) {
        const { data: loc } = await supabase.from('locations').select('name').eq('id', locId).single()
        locationName = loc?.name ?? ''
      }

      // Get session logs for these blocks
      const blockIds = blocks.map((b: any) => b.id)
      const sessionLogMap = new Map<string, SessionLogSummary>()
      if (blockIds.length > 0) {
        const { data: logs } = await supabase
          .from('session_log')
          .select('id, schedule_block_id, worked_on, engagement_level, progress_indicator, teacher_note, parent_update_status')
          .in('schedule_block_id', blockIds)
        logs?.forEach((l: any) => {
          sessionLogMap.set(l.schedule_block_id, {
            id: l.id,
            worked_on: l.worked_on ?? [],
            engagement_level: l.engagement_level,
            progress_indicator: l.progress_indicator,
            teacher_note: l.teacher_note,
            parent_update_status: l.parent_update_status,
          })
        })
      }

      // Build enriched blocks
      const enrichedBlocks: GridBlock[] = blocks.map((b: any) => {
        const student = b.student_id ? studentMap.get(b.student_id) : null
        const log = sessionLogMap.get(b.id) ?? null
        return {
          block_id: b.id,
          tenant_id: b.tenant_id,
          location_id: b.location_id,
          location_name: locationName,
          teacher_id: b.teacher_id,
          teacher_name: teacherMap.get(b.teacher_id) ?? 'Unknown',
          student_id: b.student_id,
          student_name: student?.name ?? null,
          instrument: student?.instrument ?? null,
          block_date: b.block_date,
          start_time: b.start_time,
          end_time: b.end_time,
          status: b.status,
          block_type: b.block_type ?? 'open_time',
          is_recurring: b.is_recurring,
          checked_in: b.checked_in ?? false,
          teacher_tally: b.teacher_tally ?? false,
          fifth_week: b.fifth_week ?? false,
          room: b.room_id ? roomMap.get(b.room_id) ?? b.room : b.room ?? null,
          room_id: b.room_id ?? null,
          notes: b.notes,
          original_teacher_id: b.original_teacher_id ?? null,
          original_teacher_name: b.original_teacher_name ?? null,
          has_session_log: !!log,
          session_log: log,
          is_virtual: b.is_virtual ?? false,
          meet_link: b.meet_link ?? null,
          meet_event_id: b.meet_event_id ?? null,
          is_family_callout: b.is_family_callout ?? false,
          callout_id: b.callout_id ?? null,
          is_makeup_session: b.is_makeup_session ?? false,
          makeup_session_id: b.makeup_session_id ?? null,
        }
      })

      // Derive unique teachers (columns) — alphabetical by first name
      const teacherOrder = [...new Set(enrichedBlocks.map((b) => b.teacher_id))]
      const teacherList = teacherOrder.map((tid) => ({
        id: tid,
        name: teacherMap.get(tid) ?? 'Unknown',
        photo_url: teacherPhotoMap.get(tid) ?? null,
      })).sort((a, b) => a.name.localeCompare(b.name))

      // Derive unique time slots (rows)
      const timeSlotSet = new Set(enrichedBlocks.map((b) => b.start_time))
      const timeSlots = [...timeSlotSet].sort()

      return { blocks: enrichedBlocks, teachers: teacherList, timeSlots }
    },
  })
}

export function useAssignStudent() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (params: { blockId: string; studentId: string; recurring: boolean }) => {
      const { error } = await supabase
        .from('schedule_blocks')
        .update({
          student_id: params.studentId,
          status: 'booked' as const,
          block_type: 'student_session',
          is_recurring: params.recurring,
        })
        .eq('id', params.blockId)

      if (error) throw error

      // If recurring, also assign to future blocks at same day/time/DOW
      if (params.recurring) {
        const { data: block } = await supabase
          .from('schedule_blocks')
          .select('teacher_id, block_date, start_time')
          .eq('id', params.blockId)
          .single()

        if (block) {
          const dow = new Date(block.block_date + 'T00:00:00').getDay()
          const { data: futureBlocks } = await supabase
            .from('schedule_blocks')
            .select('id, block_date')
            .eq('teacher_id', block.teacher_id)
            .eq('start_time', block.start_time)
            .eq('status', 'available')
            .gt('block_date', block.block_date)

          // Filter to same day of week
          const sameDayBlockIds = (futureBlocks ?? [])
            .filter((fb: any) => new Date(fb.block_date + 'T00:00:00').getDay() === dow)
            .map((fb: any) => fb.id)

          if (sameDayBlockIds.length > 0) {
            await supabase
              .from('schedule_blocks')
              .update({
                student_id: params.studentId,
                status: 'booked' as const,
                block_type: 'student_session',
                is_recurring: true,
              })
              .in('id', sameDayBlockIds)
          }
        }
      }

      // Fire "booked" notification (non-blocking)
      buildBlockContext(params.blockId).then(ctx => {
        if (ctx) sendAppointmentNotification('booked', ctx)
      })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['schedule-grid'] })
      qc.invalidateQueries({ queryKey: ['student-blocks'] })
      qc.invalidateQueries({ queryKey: ['students'] })
      qc.invalidateQueries({ queryKey: ['students-for-assignment'] })
      qc.invalidateQueries({ queryKey: ['available-blocks-for-student'] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
      qc.invalidateQueries({ queryKey: ['schedule-intelligence'] })
    },
  })
}

export function useUnassignBlock() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (blockId: string) => {
      // Build context BEFORE unassigning (we need student info)
      const ctx = await buildBlockContext(blockId)

      const { error } = await supabase
        .from('schedule_blocks')
        .update({
          student_id: null,
          status: 'available' as const,
          is_recurring: false,
        })
        .eq('id', blockId)

      if (error) throw error

      // Fire "cancelled" notification (non-blocking)
      if (ctx) sendAppointmentNotification('cancelled', ctx)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['schedule-grid'] })
      qc.invalidateQueries({ queryKey: ['student-blocks'] })
      qc.invalidateQueries({ queryKey: ['available-blocks-for-student'] })
      qc.invalidateQueries({ queryKey: ['students-for-assignment'] })
      qc.invalidateQueries({ queryKey: ['schedule-intelligence'] })
    },
  })
}

export function useChangeBlockType() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ blockId, blockType, runLastDayRevert, runFirstDayLock }: { blockId: string; blockType: BlockType; runLastDayRevert?: boolean; runFirstDayLock?: boolean }) => {
      const { error } = await supabase
        .from('schedule_blocks')
        .update({ block_type: blockType })
        .eq('id', blockId)
      if (error) throw error

      if (blockType === 'last_day' && runLastDayRevert) {
        const { data, error: revertErr } = await supabase.rpc('handle_last_day_revert', { p_block_id: blockId })
        if (revertErr) throw revertErr
        return data as { reverted: number; last_day_date: string }
      }

      if (blockType === 'first_day' && runFirstDayLock) {
        const { data, error: lockErr } = await supabase.rpc('handle_first_day_notbookable', { p_block_id: blockId })
        if (lockErr) throw lockErr
        return data as { locked: number; first_day_date: string }
      }

      return null
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['schedule-grid'] })
      qc.invalidateQueries({ queryKey: ['student-blocks'] })
      qc.invalidateQueries({ queryKey: ['available-blocks-for-student'] })
      qc.invalidateQueries({ queryKey: ['schedule-intelligence'] })
    },
  })
}

export interface AssignableStudent {
  id: string
  first_name: string
  last_name: string
  instrument: string
  location_id: string
  teacher_id: string | null
  teacher_name: string
  location_name: string
  family_name: string
}

export function useStudentsForAssignment() {
  return useQuery({
    queryKey: ['students-for-assignment'],
    queryFn: async () => {
      // Fetch ALL active students across all locations
      const { data: students, error } = await supabase
        .from('students')
        .select('id, first_name, last_name, instrument, location_id, teacher_id, family_id')
        .eq('status', 'active')
        .order('last_name')
      if (error) throw error

      // Get teacher names
      const teacherIds = [...new Set(students.filter((s: any) => s.teacher_id).map((s: any) => s.teacher_id))]
      const teacherMap = new Map<string, string>()
      if (teacherIds.length > 0) {
        const { data: teachers } = await supabase
          .from('teachers')
          .select('id, first_name, last_name, status, is_active, profile:profiles!teachers_profile_id_fkey(first_name, last_name)')
          .in('id', teacherIds)
        teachers?.forEach((t: any) => {
          // Filter out inactive teachers from the assignment dropdown
          const status = t.status ?? (t.is_active ? 'active' : 'inactive')
          if (status === 'inactive') return
          teacherMap.set(t.id, `${t.first_name ?? t.profile?.first_name ?? ''} ${t.last_name ?? t.profile?.last_name ?? ''}`.trim())
        })
      }

      // Get location names
      const locIds = [...new Set(students.filter((s: any) => s.location_id).map((s: any) => s.location_id))]
      const locMap = new Map<string, string>()
      if (locIds.length > 0) {
        const { data: locations } = await supabase.from('locations').select('id, name').in('id', locIds)
        locations?.forEach((l: any) => locMap.set(l.id, l.name?.replace(' Music Lessons', '') ?? ''))
      }

      // Get family names
      const famIds = [...new Set(students.filter((s: any) => s.family_id).map((s: any) => s.family_id))]
      const famMap = new Map<string, string>()
      if (famIds.length > 0) {
        const { data: families } = await supabase.from('families').select('id, name').in('id', famIds)
        families?.forEach((f: any) => famMap.set(f.id, f.name))
      }

      return students.map((s: any) => ({
        id: s.id,
        first_name: s.first_name,
        last_name: s.last_name,
        instrument: s.instrument,
        location_id: s.location_id,
        teacher_id: s.teacher_id,
        teacher_name: s.teacher_id ? teacherMap.get(s.teacher_id) ?? '' : '',
        location_name: locMap.get(s.location_id) ?? '',
        family_name: famMap.get(s.family_id) ?? '',
      })) as AssignableStudent[]
    },
  })
}
