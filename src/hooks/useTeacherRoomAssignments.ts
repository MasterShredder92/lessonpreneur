import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuthContext } from '../app/AuthContext'
import { qk } from '../lib/queryKeys'

const TENANT_ID = '00000000-0000-0000-0000-000000000001'

export interface TeacherRoomAssignment {
  id: string
  teacher_id: string
  room_id: string
  room_name: string
  location_id: string
  assignment_date: string
}

/**
 * Fetch a single teacher's room assignment for a given date.
 */
export function useTeacherRoomAssignment(teacherId: string | undefined, date: string | undefined) {
  return useQuery({
    queryKey: qk.teachers.roomAssignment(teacherId, date),
    enabled: !!teacherId && !!date,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('teacher_room_assignments')
        .select('id, teacher_id, room_id, location_id, assignment_date')
        .eq('tenant_id', TENANT_ID)
        .eq('teacher_id', teacherId!)
        .eq('assignment_date', date!)
        .maybeSingle()
      if (error) throw error
      if (!data) return null

      // Fetch room name separately (avoids FK join issues with PostgREST schema cache)
      let roomName = ''
      if (data.room_id) {
        const { data: room } = await supabase.from('rooms').select('name').eq('id', data.room_id).single()
        roomName = room?.name ?? ''
      }

      return {
        id: data.id,
        teacher_id: data.teacher_id,
        room_id: data.room_id,
        room_name: roomName,
        location_id: data.location_id,
        assignment_date: data.assignment_date,
      } as TeacherRoomAssignment
    },
  })
}

/**
 * Fetch all teacher→room assignments for a location on a specific date.
 * Returns a map: { [teacherId]: { roomId, roomName } }
 */
export function useTeacherRoomAssignmentsForDay(locationId: string | undefined, date: string | undefined) {
  return useQuery({
    queryKey: ['teacher-room-assignments-day', locationId, date],
    enabled: !!locationId && !!date,
    placeholderData: {} as Record<string, { roomId: string; roomName: string }>,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('teacher_room_assignments')
        .select('id, teacher_id, room_id, location_id, assignment_date')
        .eq('tenant_id', TENANT_ID)
        .eq('location_id', locationId!)
        .eq('assignment_date', date!)
      if (error) throw error
      if (!data || data.length === 0) return {}

      // Fetch room names in a separate query
      const roomIds = [...new Set(data.map((r: any) => r.room_id).filter(Boolean))]
      const roomNameMap = new Map<string, string>()
      if (roomIds.length > 0) {
        const { data: rooms } = await supabase.from('rooms').select('id, name').in('id', roomIds)
        rooms?.forEach((r: any) => roomNameMap.set(r.id, r.name))
      }

      const map: Record<string, { roomId: string; roomName: string }> = {}
      for (const row of data) {
        map[row.teacher_id] = {
          roomId: row.room_id,
          roomName: roomNameMap.get(row.room_id) ?? '',
        }
      }
      return map
    },
  })
}

/**
 * Upsert a teacher's room assignment for a date, then propagate to all their blocks that day.
 * Uses the UNIQUE(teacher_id, assignment_date) constraint for upsert.
 */
export function useSetTeacherRoomAssignment() {
  const qc = useQueryClient()
  const { profile } = useAuthContext()

  return useMutation({
    mutationFn: async (params: {
      teacherId: string
      roomId: string
      roomName: string
      date: string
      locationId: string
    }) => {
      // 1. Upsert the assignment row
      const { error: upsertErr } = await supabase
        .from('teacher_room_assignments')
        .upsert(
          {
            tenant_id: TENANT_ID,
            teacher_id: params.teacherId,
            room_id: params.roomId,
            location_id: params.locationId,
            assignment_date: params.date,
            created_by: profile?.id ?? null,
          },
          { onConflict: 'teacher_id,assignment_date' }
        )
      if (upsertErr) throw upsertErr

      // 2. Propagate: update all booked blocks for this teacher on this date at this location
      await propagateRoomToBlocks(params.teacherId, params.date, params.roomId, params.locationId)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.teachers.roomAssignment })
      qc.invalidateQueries({ queryKey: qk.teachers.roomAssignmentsDay })
      qc.invalidateQueries({ queryKey: qk.schedule.all })
    },
  })
}

/**
 * Remove a teacher's daily room assignment.
 * Does NOT clear room_id from existing blocks (they keep their per-block assignment).
 */
export function useRemoveTeacherRoomAssignment() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (params: { teacherId: string; date: string }) => {
      const { error } = await supabase
        .from('teacher_room_assignments')
        .delete()
        .eq('tenant_id', TENANT_ID)
        .eq('teacher_id', params.teacherId)
        .eq('assignment_date', params.date)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.teachers.roomAssignment })
      qc.invalidateQueries({ queryKey: qk.teachers.roomAssignmentsDay })
      qc.invalidateQueries({ queryKey: qk.schedule.all })
    },
  })
}

/**
 * Propagate a room assignment to all schedule_blocks for a teacher on a given date/location.
 * Only touches booked blocks (status='booked').
 */
async function propagateRoomToBlocks(
  teacherId: string,
  date: string,
  roomId: string,
  locationId: string
) {
  // Fetch the room name for the denormalized `room` column
  const { data: roomRow } = await supabase
    .from('rooms')
    .select('name')
    .eq('id', roomId)
    .single()

  const roomName = roomRow?.name ?? null

  const { error } = await supabase
    .from('schedule_blocks')
    .update({ room_id: roomId, room: roomName })
    .eq('tenant_id', TENANT_ID)
    .eq('teacher_id', teacherId)
    .eq('block_date', date)
    .eq('location_id', locationId)
    .eq('status', 'booked')

  if (error) throw error
}
