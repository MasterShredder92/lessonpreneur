import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuthContext } from '../app/AuthContext'

// ─── Helper: get teacher ID from profile ─────────────
async function getTeacherId(profileId: string): Promise<string | null> {
  const { data } = await supabase.from('teachers').select('id').eq('profile_id', profileId).single()
  return data?.id ?? null
}

// ─── Shared: Resolved Teacher Record (cached once) ───
export function useTeacherRecord() {
  const { profile } = useAuthContext()

  return useQuery<string | null>({
    queryKey: ['teacher_record', profile?.id],
    enabled: !!profile?.id,
    staleTime: Infinity,
    queryFn: () => getTeacherId(profile!.id),
  })
}

// ─── Today's Schedule ─────────────────────────────────
export interface TodayBlock {
  block_id: string
  student_id: string | null
  student_first_name: string | null
  instrument: string | null
  start_time: string
  end_time: string
  status: string
  block_type: string
  location_id: string
  location_name: string
}

export function useTeacherTodaySchedule() {
  const { data: teacherId } = useTeacherRecord()
  const today = new Date().toISOString().split('T')[0]

  return useQuery<TodayBlock[]>({
    queryKey: ['teacher_today', teacherId, today],
    enabled: !!teacherId,
    queryFn: async () => {
      if (!teacherId) return []

      const { data: blocks, error } = await supabase
        .from('schedule_blocks')
        .select('id, student_id, block_date, start_time, end_time, status, block_type, location_id')
        .eq('teacher_id', teacherId)
        .eq('block_date', today)
        .in('status', ['booked', 'available'])
        .order('start_time')

      if (error) throw error
      if (!blocks || blocks.length === 0) return []

      // Get student names
      const studentIds = blocks.filter(b => b.student_id).map(b => b.student_id!)
      const studentMap = new Map<string, { firstName: string; instrument: string | null }>()
      if (studentIds.length > 0) {
        const { data: students } = await supabase
          .from('students')
          .select('id, first_name, instrument')
          .in('id', studentIds)
        students?.forEach((s: any) => studentMap.set(s.id, { firstName: s.first_name, instrument: s.instrument }))
      }

      // Get location names
      const locationIds = [...new Set(blocks.map(b => b.location_id))]
      const locMap = new Map<string, string>()
      if (locationIds.length > 0) {
        const { data: locs } = await supabase.from('locations').select('id, name').in('id', locationIds)
        locs?.forEach((l: any) => locMap.set(l.id, l.name?.replace(' Music Lessons', '') ?? ''))
      }

      return blocks.map((b: any): TodayBlock => {
        const student = b.student_id ? studentMap.get(b.student_id) : null
        return {
          block_id: b.id,
          student_id: b.student_id,
          student_first_name: student?.firstName ?? null,
          instrument: student?.instrument ?? null,
          start_time: b.start_time,
          end_time: b.end_time,
          status: b.status,
          block_type: b.block_type ?? 'open_time',
          location_id: b.location_id,
          location_name: locMap.get(b.location_id) ?? '',
        }
      })
    },
  })
}

// ─── Teacher Tasks (Action Items) ─────────────────────
export interface TeacherTask {
  id: string
  task_type: string
  title: string
  description: string | null
  priority: string
  status: string
  created_at: string
  dedup_key: string | null
  is_overdue: boolean
}

export function useTeacherTasks() {
  const { data: teacherId } = useTeacherRecord()
  const { locationIds } = useAuthContext()

  return useQuery<TeacherTask[]>({
    queryKey: ['teacher_tasks', teacherId],
    enabled: !!teacherId,
    queryFn: async () => {
      if (!teacherId) return []

      // Tasks assigned directly to this teacher OR to 'teacher' role at their locations
      const { data: directTasks } = await supabase
        .from('tasks')
        .select('id, task_type, title, description, priority, status, created_at, dedup_key')
        .eq('assigned_to', teacherId)
        .eq('status', 'pending')
        .order('created_at', { ascending: false })

      const { data: roleTasks } = await supabase
        .from('tasks')
        .select('id, task_type, title, description, priority, status, created_at, dedup_key')
        .eq('assigned_role', 'teacher')
        .eq('status', 'pending')
        .in('location_id', locationIds)
        .order('created_at', { ascending: false })

      // Merge and deduplicate
      const allTasks = [...(directTasks ?? []), ...(roleTasks ?? [])]
      const seen = new Set<string>()
      const unique = allTasks.filter(t => {
        if (seen.has(t.id)) return false
        seen.add(t.id)
        return true
      })

      const now = Date.now()
      return unique.map((t: any): TeacherTask => ({
        ...t,
        is_overdue: now - new Date(t.created_at).getTime() > 24 * 60 * 60 * 1000,
      }))
    },
  })
}

// ─── Complete a Task ──────────────────────────────────
export function useCompleteTeacherTask() {
  const { profile, tenantId } = useAuthContext()
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (params: { taskId: string; note?: string }) => {
      if (!profile || !tenantId) throw new Error('Not authenticated')

      const { error } = await supabase
        .from('tasks')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString(),
          completed_by: profile.id,
          completion_note: params.note || null,
        })
        .eq('id', params.taskId)

      if (error) throw error

      await supabase.from('audit_log').insert({
        tenant_id: tenantId,
        performed_by: profile.id,
        action: 'TASK_COMPLETED',
        table_name: 'tasks',
        record_id: params.taskId,
        new_value: { completed_by_role: 'teacher', note: params.note || null },
      })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['teacher_tasks'] })
      qc.invalidateQueries({ queryKey: ['tasks'] })
    },
  })
}

// ─── Schedule Updates (last 30 days) ──────────────────
export interface ScheduleUpdate {
  id: string
  type: 'new_student' | 'cancellation' | 'time_change' | 'general'
  description: string
  updated_at: string
}

export function useTeacherScheduleUpdates() {
  const { data: teacherId } = useTeacherRecord()

  return useQuery<ScheduleUpdate[]>({
    queryKey: ['teacher_schedule_updates', teacherId],
    enabled: !!teacherId,
    queryFn: async () => {
      if (!teacherId) return []

      const thirtyDaysAgo = new Date()
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
      const cutoff = thirtyDaysAgo.toISOString()

      // New students added (blocks created recently)
      const { data: newBlocks } = await supabase
        .from('schedule_blocks')
        .select('id, student_id, block_date, start_time, location_id, status, created_at, updated_at')
        .eq('teacher_id', teacherId)
        .gte('created_at', cutoff)
        .not('student_id', 'is', null)
        .order('updated_at', { ascending: false })
        .limit(15)

      // Cancelled blocks
      const { data: cancelledBlocks } = await supabase
        .from('schedule_blocks')
        .select('id, student_id, block_date, start_time, status, updated_at')
        .eq('teacher_id', teacherId)
        .eq('status', 'cancelled')
        .gte('updated_at', cutoff)
        .order('updated_at', { ascending: false })
        .limit(10)

      // Get student names for all referenced students
      const allStudentIds = [
        ...(newBlocks ?? []).map(b => b.student_id).filter(Boolean),
        ...(cancelledBlocks ?? []).map(b => b.student_id).filter(Boolean),
      ]
      const studentMap = new Map<string, string>()
      if (allStudentIds.length > 0) {
        const { data: students } = await supabase
          .from('students')
          .select('id, first_name')
          .in('id', [...new Set(allStudentIds)])
        students?.forEach((s: any) => studentMap.set(s.id, s.first_name))
      }

      // Get location names
      const locIds = [...new Set((newBlocks ?? []).map(b => b.location_id))]
      const locMap = new Map<string, string>()
      if (locIds.length > 0) {
        const { data: locs } = await supabase.from('locations').select('id, name').in('id', locIds)
        locs?.forEach((l: any) => locMap.set(l.id, l.name?.replace(' Music Lessons', '') ?? ''))
      }

      const updates: ScheduleUpdate[] = []

      // New student additions
      const seenStudents = new Set<string>()
      for (const b of (newBlocks ?? [])) {
        if (!b.student_id || seenStudents.has(b.student_id)) continue
        seenStudents.add(b.student_id)
        const name = studentMap.get(b.student_id) ?? 'A student'
        const loc = locMap.get(b.location_id) ?? ''
        const day = new Date(b.block_date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long' })
        const time = formatTimeShort(b.start_time)
        updates.push({
          id: b.id + '-new',
          type: 'new_student',
          description: `${name} was added to your schedule — ${day}s ${time}${loc ? ` at ${loc}` : ''}`,
          updated_at: b.created_at,
        })
      }

      // Cancellations
      for (const b of (cancelledBlocks ?? [])) {
        const name = b.student_id ? (studentMap.get(b.student_id) ?? 'A session') : 'A session'
        const day = new Date(b.block_date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })
        const time = formatTimeShort(b.start_time)
        updates.push({
          id: b.id + '-cancel',
          type: 'cancellation',
          description: `Session cancelled — ${name}, ${day} ${time}`,
          updated_at: b.updated_at,
        })
      }

      // Sort by most recent
      updates.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
      return updates.slice(0, 10)
    },
  })
}

function formatTimeShort(t: string): string {
  const [h, m] = t.split(':')
  const hour = parseInt(h)
  const ampm = hour >= 12 ? 'PM' : 'AM'
  const display = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour
  return `${display}:${m} ${ampm}`
}

// ─── Student Quick Card Data ──────────────────────────
export interface StudentCardData {
  id: string
  first_name: string
  instrument: string | null
  age: string | null
  experience: string | null
  has_instrument: string | null
  start_date: string | null
  first_lesson_date: string | null
  total_lessons_taken: number | null
  goals: string | null
  learning_style: string | null
  bio: string | null
  location_id: string | null
  location_name: string | null
  blocks_per_week: number | null
  // Handoff fields
  previous_teacher_id: string | null
  previous_teacher_name: string | null
  teacher_changed_at: string | null
}

export function useTeacherStudentCard(studentId: string | null) {
  return useQuery<StudentCardData | null>({
    queryKey: ['teacher_student', studentId],
    enabled: !!studentId,
    queryFn: async () => {
      if (!studentId) return null

      const { data: student } = await supabase
        .from('students')
        .select('id, first_name, instrument, age, experience, has_instrument, start_date, first_lesson_date, total_lessons_taken, goals, learning_style, bio, location_id, blocks_per_week, previous_teacher_id, teacher_changed_at')
        .eq('id', studentId)
        .single()

      if (!student) return null

      let locationName: string | null = null
      if (student.location_id) {
        const { data: loc } = await supabase.from('locations').select('name').eq('id', student.location_id).single()
        locationName = loc?.name?.replace(' Music Lessons', '') ?? null
      }

      // Resolve previous teacher name for handoff
      let previousTeacherName: string | null = null
      if (student.previous_teacher_id) {
        const { data: prevTeacher } = await supabase
          .from('teachers')
          .select('first_name, last_name, profile:profiles!teachers_profile_id_fkey(first_name, last_name)')
          .eq('id', student.previous_teacher_id)
          .single()
        if (prevTeacher) {
          previousTeacherName = `${prevTeacher.first_name ?? (prevTeacher.profile as any)?.first_name ?? ''} ${prevTeacher.last_name ?? (prevTeacher.profile as any)?.last_name ?? ''}`.trim() || null
        }
      }

      return {
        id: student.id,
        first_name: student.first_name,
        instrument: student.instrument,
        age: student.age,
        experience: student.experience,
        has_instrument: student.has_instrument,
        start_date: student.start_date,
        first_lesson_date: student.first_lesson_date,
        total_lessons_taken: student.total_lessons_taken,
        goals: student.goals,
        learning_style: student.learning_style,
        bio: student.bio,
        location_id: student.location_id,
        location_name: locationName,
        blocks_per_week: student.blocks_per_week,
        previous_teacher_id: student.previous_teacher_id,
        previous_teacher_name: previousTeacherName,
        teacher_changed_at: student.teacher_changed_at,
      }
    },
  })
}

// ─── Teacher Documents (own docs) ─────────────────────
export interface TeacherDocument {
  id: string
  file_name: string
  file_url: string
  category: string | null
  uploaded_by: string | null
  uploaded_at: string
}

export function useTeacherDocuments() {
  const { data: teacherId } = useTeacherRecord()

  return useQuery<TeacherDocument[]>({
    queryKey: ['teacher_documents', teacherId],
    enabled: !!teacherId,
    queryFn: async () => {
      if (!teacherId) return []

      const { data, error } = await supabase
        .from('teacher_documents')
        .select('id, file_name, file_url, category, uploaded_by, uploaded_at')
        .eq('teacher_id', teacherId)
        .order('uploaded_at', { ascending: false })

      if (error) throw error
      return data ?? []
    },
  })
}

// ─── Teacher W-9 Status ───────────────────────────────
export interface TeacherW9Status {
  has_w9: boolean
  status: string | null
  signed_at: string | null
  pdf_url: string | null
}

export function useTeacherW9Status() {
  const { data: teacherId } = useTeacherRecord()

  return useQuery<TeacherW9Status>({
    queryKey: ['teacher_w9_status', teacherId],
    enabled: !!teacherId,
    queryFn: async () => {
      if (!teacherId) return { has_w9: false, status: null, signed_at: null, pdf_url: null }

      const { data } = await supabase
        .from('teacher_w9')
        .select('status, signed_at, pdf_url')
        .eq('teacher_id', teacherId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (!data) return { has_w9: false, status: null, signed_at: null, pdf_url: null }

      return {
        has_w9: data.status === 'completed' || data.status === 'signed',
        status: data.status,
        signed_at: data.signed_at,
        pdf_url: data.pdf_url,
      }
    },
  })
}

// ─── Teacher's Students (all on schedule) ─────────────
export interface TeacherStudentItem {
  student_id: string
  first_name: string
  instrument: string | null
  location_id: string
  location_name: string
  experience: string | null
  day_label: string
  time_label: string
  has_notes: boolean
}

export function useTeacherStudents() {
  const { data: teacherId } = useTeacherRecord()

  return useQuery<TeacherStudentItem[]>({
    queryKey: ['teacher_students', teacherId],
    enabled: !!teacherId,
    queryFn: async () => {
      if (!teacherId) return []

      // Get all booked blocks for this teacher (current + future)
      const today = new Date().toISOString().split('T')[0]
      const { data: blocks } = await supabase
        .from('schedule_blocks')
        .select('student_id, block_date, start_time, location_id')
        .eq('teacher_id', teacherId)
        .eq('status', 'booked')
        .not('student_id', 'is', null)
        .gte('block_date', today)
        .order('start_time')

      if (!blocks || blocks.length === 0) {
        // Fallback: check past blocks too (some teachers only have historical data)
        const { data: pastBlocks } = await supabase
          .from('schedule_blocks')
          .select('student_id, block_date, start_time, location_id')
          .eq('teacher_id', teacherId)
          .eq('status', 'booked')
          .not('student_id', 'is', null)
          .order('block_date', { ascending: false })
          .limit(100)
        if (!pastBlocks || pastBlocks.length === 0) return []
        return buildStudentList(pastBlocks, teacherId)
      }

      return buildStudentList(blocks, teacherId)
    },
  })
}

async function buildStudentList(blocks: any[], teacherId: string): Promise<TeacherStudentItem[]> {
  // Dedupe by student_id, keep the first (next upcoming) block per student
  const studentBlockMap = new Map<string, any>()
  for (const b of blocks) {
    if (!b.student_id || studentBlockMap.has(b.student_id)) continue
    studentBlockMap.set(b.student_id, b)
  }

  const studentIds = [...studentBlockMap.keys()]
  if (studentIds.length === 0) return []

  // Get student safe fields
  const { data: students } = await supabase
    .from('students')
    .select('id, first_name, instrument, experience')
    .in('id', studentIds)
  const studentMap = new Map<string, any>()
  students?.forEach((s: any) => studentMap.set(s.id, s))

  // Get location names
  const locationIds = [...new Set(blocks.map(b => b.location_id))]
  const locMap = new Map<string, string>()
  if (locationIds.length > 0) {
    const { data: locs } = await supabase.from('locations').select('id, name').in('id', locationIds)
    locs?.forEach((l: any) => locMap.set(l.id, l.name?.replace(' Music Lessons', '') ?? ''))
  }

  // Check which students have notes from this teacher
  const { data: noteCounts } = await supabase
    .from('teacher_student_notes')
    .select('student_id')
    .eq('teacher_id', teacherId)
    .in('student_id', studentIds)
  const studentsWithNotes = new Set((noteCounts ?? []).map((n: any) => n.student_id))

  const results: TeacherStudentItem[] = []
  for (const [sid, block] of studentBlockMap.entries()) {
    const student = studentMap.get(sid)
    if (!student) continue
    const d = new Date(block.block_date + 'T12:00:00')
    const dayLabel = d.toLocaleDateString('en-US', { weekday: 'long' }) + 's'
    const [h, m] = block.start_time.split(':')
    const hour = parseInt(h)
    const ampm = hour >= 12 ? 'PM' : 'AM'
    const display = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour
    const timeLabel = `${display}:${m} ${ampm}`

    results.push({
      student_id: sid,
      first_name: student.first_name,
      instrument: student.instrument,
      location_id: block.location_id,
      location_name: locMap.get(block.location_id) ?? '',
      experience: student.experience,
      day_label: dayLabel,
      time_label: timeLabel,
      has_notes: studentsWithNotes.has(sid),
    })
  }

  results.sort((a, b) => a.first_name.localeCompare(b.first_name))
  return results
}

// ─── Student Files (teacher's uploads for a student) ──
export interface StudentFileItem {
  id: string
  file_name: string
  file_url: string
  file_size: number | null
  created_at: string
}

export function useTeacherStudentFiles(studentId: string | null) {
  const { profile } = useAuthContext()

  return useQuery<StudentFileItem[]>({
    queryKey: ['teacher_student_files', profile?.id, studentId],
    enabled: !!profile?.id && !!studentId,
    queryFn: async () => {
      if (!studentId || !profile) return []
      // uploaded_by stores the profile id as text
      const { data, error } = await supabase
        .from('student_files')
        .select('id, file_name, file_url, file_size, created_at')
        .eq('student_id', studentId)
        .eq('uploaded_by', profile.id)
        .order('created_at', { ascending: false })

      if (error) throw error
      return data ?? []
    },
  })
}

// ─── Upload File to Student Record ────────────────────
export function useUploadStudentFile() {
  const { profile, tenantId } = useAuthContext()
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (params: { studentId: string; studentFirstName: string; file: File }) => {
      if (!profile || !tenantId) throw new Error('Not authenticated')
      if (params.file.size > 10 * 1024 * 1024) throw new Error('File must be under 10MB')

      const safeName = `${Date.now()}-${params.file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`
      const path = `${tenantId}/${params.studentId}/teacher-uploads/${safeName}`

      const { error: uploadErr } = await supabase.storage
        .from('student-files')
        .upload(path, params.file, { upsert: false })
      if (uploadErr) throw uploadErr

      const { data: urlData } = supabase.storage.from('student-files').getPublicUrl(path)

      const { data: record, error: insertErr } = await supabase
        .from('student_files')
        .insert({
          tenant_id: tenantId,
          student_id: params.studentId,
          file_name: params.file.name,
          file_url: urlData.publicUrl,
          file_size: params.file.size,
          uploaded_by: profile.id,
          uploaded_by_role: 'teacher',
          folder: 'teacher-uploads',
        })
        .select('id')
        .single()
      if (insertErr) throw insertErr

      await supabase.from('audit_log').insert({
        tenant_id: tenantId,
        performed_by: profile.id,
        action: 'STUDENT_FILE_UPLOADED',
        table_name: 'student_files',
        record_id: record.id,
        new_value: { student_first_name: params.studentFirstName, file_name: params.file.name, uploaded_by_role: 'teacher' },
      })

      return { success: true }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['teacher_student_files'] })
    },
  })
}

// ─── Missing Notes Items (computed action items) ──────
export interface MissingNoteItem {
  student_id: string
  student_first_name: string
  block_date: string
  block_id: string
  hours_ago: number
}

export function useMissingNotesItems() {
  const { data: teacherId } = useTeacherRecord()

  return useQuery<MissingNoteItem[]>({
    queryKey: ['missing_notes', teacherId],
    enabled: !!teacherId,
    queryFn: async () => {
      if (!teacherId) return []

      // Get sessions from the last 3 days that were booked
      const threeDaysAgo = new Date()
      threeDaysAgo.setDate(threeDaysAgo.getDate() - 3)
      const cutoff = threeDaysAgo.toISOString().split('T')[0]
      const today = new Date().toISOString().split('T')[0]

      const { data: recentBlocks } = await supabase
        .from('schedule_blocks')
        .select('id, student_id, block_date, start_time')
        .eq('teacher_id', teacherId)
        .eq('status', 'booked')
        .not('student_id', 'is', null)
        .gte('block_date', cutoff)
        .lt('block_date', today) // Only past sessions, not today
        .order('block_date', { ascending: false })

      if (!recentBlocks || recentBlocks.length === 0) return []

      // Dedupe by student — only show the most recent session per student
      const studentBlockMap = new Map<string, any>()
      for (const b of recentBlocks) {
        if (!b.student_id || studentBlockMap.has(b.student_id)) continue
        studentBlockMap.set(b.student_id, b)
      }

      const studentIds = [...studentBlockMap.keys()]

      // Check which students have notes added AFTER the session date
      const items: MissingNoteItem[] = []
      for (const [sid, block] of studentBlockMap.entries()) {
        const blockDatetime = new Date(block.block_date + 'T' + block.start_time)
        const { count } = await supabase
          .from('teacher_student_notes')
          .select('id', { count: 'exact', head: true })
          .eq('teacher_id', teacherId)
          .eq('student_id', sid)
          .gte('created_at', blockDatetime.toISOString())

        if ((count ?? 0) === 0) {
          items.push({
            student_id: sid,
            student_first_name: '', // filled below
            block_date: block.block_date,
            block_id: block.id,
            hours_ago: Math.floor((Date.now() - blockDatetime.getTime()) / (1000 * 60 * 60)),
          })
        }
      }

      if (items.length === 0) return []

      // Get student names
      const { data: students } = await supabase
        .from('students')
        .select('id, first_name')
        .in('id', items.map(i => i.student_id))
      const nameMap = new Map<string, string>()
      students?.forEach((s: any) => nameMap.set(s.id, s.first_name))

      return items.map(i => ({
        ...i,
        student_first_name: nameMap.get(i.student_id) ?? 'A student',
      }))

      // TODO: Escalation — create system tasks for directors when notes are 24+ hours overdue.
      // This should be handled by a Supabase Edge Function or n8n workflow that runs daily:
      // 1. Query booked sessions from 24+ hours ago with no teacher notes
      // 2. Create task with task_type='missing_session_notes', dedup_key='missing_notes:{block_id}'
      // 3. When teacher adds note, auto-resolve via dedup_key match
    },
  })
}

// ─── Save Teacher Note with Audit ─────────────────────
export function useSaveTeacherNoteWithAudit() {
  const { profile, tenantId } = useAuthContext()
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (params: { studentId: string; studentFirstName: string; noteText: string }) => {
      if (!tenantId || !profile) throw new Error('Not authenticated')

      const teacherId = await getTeacherId(profile.id)
      if (!teacherId) throw new Error('Teacher profile not found')

      if (params.noteText.length > 1000) throw new Error('Note must be under 1000 characters')

      const { data: note, error } = await supabase
        .from('teacher_student_notes')
        .insert({
          tenant_id: tenantId,
          teacher_id: teacherId,
          student_id: params.studentId,
          note_text: params.noteText,
          moderation_status: 'approved',
        })
        .select('id')
        .single()

      if (error) throw error

      await supabase.from('audit_log').insert({
        tenant_id: tenantId,
        performed_by: profile.id,
        action: 'TEACHER_NOTE_ADDED',
        table_name: 'teacher_student_notes',
        record_id: note.id,
        new_value: { student_first_name: params.studentFirstName, note_preview: params.noteText.slice(0, 100) },
      })

      return { noteId: note.id }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['teacher-student-notes'] })
      qc.invalidateQueries({ queryKey: ['missing_notes'] })
      qc.invalidateQueries({ queryKey: ['teacher_students'] })
    },
  })
}

// ─── Upload Teacher Document ──────────────────────────
export function useUploadTeacherDocument() {
  const { profile, tenantId } = useAuthContext()
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (params: { file: File; category: string }) => {
      if (!profile || !tenantId) throw new Error('Not authenticated')

      const teacherId = await getTeacherId(profile.id)
      if (!teacherId) throw new Error('Teacher profile not found')

      if (params.file.size > 10 * 1024 * 1024) throw new Error('File must be under 10MB')

      // Upload to storage
      const safeName = `${Date.now()}-${params.file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`
      const path = `${tenantId}/${teacherId}/${params.category}/${safeName}`

      const { error: uploadErr } = await supabase.storage
        .from('teacher-uploads')
        .upload(path, params.file, { upsert: false })
      if (uploadErr) throw uploadErr

      // Get public URL
      const { data: urlData } = supabase.storage.from('teacher-uploads').getPublicUrl(path)

      // Insert document record
      const { error: insertErr } = await supabase.from('teacher_documents').insert({
        teacher_id: teacherId,
        file_name: params.file.name,
        file_url: urlData.publicUrl,
        category: params.category,
        uploaded_by: 'teacher',
      })
      if (insertErr) throw insertErr

      // Auto-resolve matching tasks
      const dedupKey = params.category === 'w9' ? `missing_teacher_w9:${teacherId}` :
                       params.category === 'contract' ? `missing_teacher_contract:${teacherId}` : null
      if (dedupKey) {
        await supabase
          .from('tasks')
          .update({ status: 'completed', completed_at: new Date().toISOString(), completed_by: profile.id })
          .eq('dedup_key', dedupKey)
          .eq('status', 'pending')
      }

      return { success: true }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['teacher_documents'] })
      qc.invalidateQueries({ queryKey: ['teacher_tasks'] })
      qc.invalidateQueries({ queryKey: ['tasks'] })
    },
  })
}
