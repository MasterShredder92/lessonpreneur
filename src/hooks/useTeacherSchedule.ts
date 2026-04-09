import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuthContext } from '../app/AuthContext'
import { useTeacherRecord } from './useTeacherDashboard'
import { qk } from '../lib/queryKeys'

export interface TeacherBlock {
  block_id: string
  student_id: string | null
  student_name: string | null
  student_first_name: string | null
  instrument: string | null
  family_id: string | null
  block_date: string
  start_time: string
  end_time: string
  status: 'available' | 'booked'
  block_type: string
  checked_in: boolean
  room: string | null
  location_name: string
  location_id: string
  notes: string | null
  // Session log state
  has_session_log: boolean
  session_log_id: string | null
  // Session note state
  has_session_note: boolean
  session_note_id: string | null
  is_family_callout: boolean
  is_makeup_session: boolean
  makeup_session_id: string | null
  callout_id: string | null
}

export function useTeacherDayBlocks(date: string) {
  const { data: teacherId } = useTeacherRecord()

  return useQuery<TeacherBlock[]>({
    queryKey: ['teacher-day-blocks', date, teacherId],
    enabled: !!date && !!teacherId,
    queryFn: async () => {
      if (!teacherId) return []

      // Get all blocks for this teacher on this date
      const { data: blocks, error } = await supabase
        .from('schedule_blocks')
        .select('id, student_id, block_date, start_time, end_time, status, block_type, checked_in, room, room_id, notes, location_id, is_family_callout, is_makeup_session, makeup_session_id, callout_id')
        .eq('teacher_id', teacherId)
        .eq('block_date', date)
        .order('start_time')

      if (error) throw error
      if (!blocks || blocks.length === 0) return []

      // Get student details
      const studentIds = blocks.filter(b => b.student_id).map(b => b.student_id)
      const studentMap = new Map<string, { name: string; firstName: string; instrument: string; familyId: string }>()
      if (studentIds.length > 0) {
        const { data: students } = await supabase
          .from('students')
          .select('id, first_name, last_name, instrument, family_id')
          .in('id', studentIds)
        students?.forEach((s: any) => {
          studentMap.set(s.id, {
            name: `${s.first_name} ${s.last_name}`.trim(),
            firstName: s.first_name,
            instrument: s.instrument,
            familyId: s.family_id,
          })
        })
      }

      // Get location names
      const locationIds = [...new Set(blocks.map(b => b.location_id))]
      const locMap = new Map<string, string>()
      if (locationIds.length > 0) {
        const { data: locs } = await supabase
          .from('locations')
          .select('id, name')
          .in('id', locationIds)
        locs?.forEach((l: any) => locMap.set(l.id, l.name?.replace(' Music Lessons', '') ?? ''))
      }

      // Check which blocks already have session logs
      const blockIds = blocks.map(b => b.id)
      const { data: logs } = await supabase
        .from('session_log')
        .select('id, schedule_block_id')
        .in('schedule_block_id', blockIds)
      const logMap = new Map<string, string>()
      logs?.forEach((l: any) => logMap.set(l.schedule_block_id, l.id))

      // Check which blocks already have session notes
      const { data: sessionNotes } = await supabase
        .from('teacher_session_notes')
        .select('id, schedule_block_id')
        .in('schedule_block_id', blockIds)
      const noteMap = new Map<string, string>()
      sessionNotes?.forEach((n: any) => noteMap.set(n.schedule_block_id, n.id))

      return blocks.map((b: any): TeacherBlock => {
        const student = b.student_id ? studentMap.get(b.student_id) : null
        return {
          block_id: b.id,
          student_id: b.student_id,
          student_name: student?.name ?? null,
          student_first_name: student?.firstName ?? null,
          instrument: student?.instrument ?? null,
          family_id: student?.familyId ?? null,
          block_date: b.block_date,
          start_time: b.start_time,
          end_time: b.end_time,
          status: b.status,
          block_type: b.block_type ?? 'open_time',
          checked_in: b.checked_in ?? false,
          room: b.room ?? null,
          location_name: locMap.get(b.location_id) ?? '',
          location_id: b.location_id,
          notes: b.notes,
          has_session_log: logMap.has(b.id),
          session_log_id: logMap.get(b.id) ?? null,
          has_session_note: noteMap.has(b.id),
          session_note_id: noteMap.get(b.id) ?? null,
          is_family_callout: b.is_family_callout ?? false,
          is_makeup_session: b.is_makeup_session ?? false,
          makeup_session_id: b.makeup_session_id ?? null,
          callout_id: b.callout_id ?? null,
        }
      })
    },
  })
}

// Quick-input session log mutation
export function useSubmitSessionLog() {
  const { profile, tenantId } = useAuthContext()
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (params: {
      block: TeacherBlock
      workedOn: string[]
      engagementLevel: number
      progressIndicator: 'struggling' | 'on_track' | 'crushing_it'
      teacherNote: string
    }) => {
      if (!tenantId || !profile) throw new Error('Not authenticated')

      // Get teacher ID
      const { data: teacher } = await supabase
        .from('teachers')
        .select('id, pay_rate_per_half_hour')
        .eq('profile_id', profile.id)
        .single()
      if (!teacher) throw new Error('Teacher profile not found')

      // Get student rate
      const { data: student } = await supabase
        .from('students')
        .select('rate_per_session')
        .eq('id', params.block.student_id!)
        .single()

      // Insert session log
      const { data: log, error } = await supabase
        .from('session_log')
        .insert({
          tenant_id: tenantId,
          schedule_block_id: params.block.block_id,
          location_id: params.block.location_id,
          teacher_id: teacher.id,
          student_id: params.block.student_id!,
          block_date: params.block.block_date,
          status: 'completed',
          teacher_rate: teacher.pay_rate_per_half_hour ?? 0,
          student_rate: student?.rate_per_session ?? 0,
          worked_on: params.workedOn,
          engagement_level: params.engagementLevel,
          progress_indicator: params.progressIndicator,
          teacher_note: params.teacherNote || null,
          instrument: params.block.instrument,
          parent_update_status: 'pending',
        })
        .select('id')
        .single()

      if (error) throw error

      return { sessionLogId: log.id }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.sessions.teacherDay })
      qc.invalidateQueries({ queryKey: qk.schedule.all })
      qc.invalidateQueries({ queryKey: qk.schedule.intelligence })
      qc.invalidateQueries({ queryKey: qk.students.blocks })
      qc.invalidateQueries({ queryKey: qk.dashboard.all })
      qc.invalidateQueries({ queryKey: qk.teachers.paySummary })
      qc.invalidateQueries({ queryKey: qk.sessions.all })
    },
  })
}

// Instrument-specific "worked on" tag options
export const WORKED_ON_OPTIONS: Record<string, string[]> = {
  piano: ['Scales', 'Chords', 'Sight Reading', 'Theory', 'Song Practice', 'Technique', 'Ear Training', 'Improvisation', 'Performance Prep', 'New Piece'],
  guitar: ['Chords', 'Strumming', 'Fingerpicking', 'Scales', 'Song Practice', 'Theory', 'Technique', 'Tab Reading', 'Improvisation', 'Performance Prep'],
  bass: ['Scales', 'Groove Patterns', 'Fingerstyle', 'Slap/Pop', 'Song Practice', 'Theory', 'Technique', 'Reading', 'Improvisation'],
  vocals: ['Warm-Ups', 'Breathing', 'Pitch Training', 'Range Extension', 'Song Practice', 'Performance Prep', 'Ear Training', 'Harmony', 'Stage Presence'],
  voice: ['Warm-Ups', 'Breathing', 'Pitch Training', 'Range Extension', 'Song Practice', 'Performance Prep', 'Ear Training', 'Harmony', 'Stage Presence'],
  drums: ['Rudiments', 'Grooves', 'Fills', 'Reading', 'Song Practice', 'Technique', 'Time/Tempo', 'Coordination', 'Performance Prep', 'Ear Training'],
  violin: ['Scales', 'Bowing', 'Vibrato', 'Shifting', 'Sight Reading', 'Song Practice', 'Theory', 'Ear Training', 'Performance Prep', 'Technique'],
  cello: ['Scales', 'Bowing', 'Vibrato', 'Shifting', 'Sight Reading', 'Song Practice', 'Theory', 'Ear Training', 'Performance Prep', 'Technique'],
  ukulele: ['Chords', 'Strumming', 'Fingerpicking', 'Song Practice', 'Theory', 'Technique', 'Performance Prep'],
  default: ['Technique', 'Theory', 'Song Practice', 'Sight Reading', 'Ear Training', 'Scales', 'Performance Prep', 'Improvisation'],
}
