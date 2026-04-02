import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuthContext } from '../app/AuthContext'
import { checkFilename, checkNoteText } from '../lib/contentModeration'

// ─── Types ───────────────────────────────────────────

export interface TeacherUpload {
  id: string
  file_name: string
  file_name_original: string
  storage_path: string
  file_size_bytes: number
  moderation_status: string
  visible_to_parent: boolean
  uploaded_at: string
}

export interface TeacherStudentNote {
  id: string
  note_text: string
  moderation_status: string
  created_at: string
  updated_at: string
}

// ─── File uploads ────────────────────────────────────

export function useTeacherUploads(studentId: string | undefined) {
  const { profile } = useAuthContext()
  return useQuery<TeacherUpload[]>({
    queryKey: ['teacher-uploads', studentId, profile?.id],
    enabled: !!studentId && !!profile?.id,
    queryFn: async () => {
      const { data: teacher } = await supabase.from('teachers').select('id').eq('profile_id', profile!.id).single()
      if (!teacher) return []
      const { data } = await supabase.from('teacher_uploads')
        .select('id, file_name, file_name_original, storage_path, file_size_bytes, moderation_status, visible_to_parent, uploaded_at')
        .eq('student_id', studentId!)
        .eq('teacher_id', teacher.id)
        .order('uploaded_at', { ascending: false })
      return data ?? []
    },
  })
}

export function useUploadTeacherFile() {
  const { profile, tenantId } = useAuthContext()
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (params: { studentId: string; file: File }) => {
      if (!tenantId || !profile) throw new Error('Not authenticated')

      const { data: teacher } = await supabase.from('teachers').select('id').eq('profile_id', profile.id).single()
      if (!teacher) throw new Error('Teacher profile not found')

      // 1. Client-side filename check
      const filenameCheck = checkFilename(params.file.name)
      if (!filenameCheck.ok) throw new Error(filenameCheck.reason)

      // 2. Upload to storage
      const safeName = `${Date.now()}-${params.file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`
      const path = `${tenantId}/${params.studentId}/${safeName}`

      const { error: uploadErr } = await supabase.storage.from('teacher-uploads').upload(path, params.file, { upsert: false })
      if (uploadErr) throw uploadErr

      // 3. Create record
      const { error: insertErr } = await supabase.from('teacher_uploads').insert({
        tenant_id: tenantId,
        teacher_id: teacher.id,
        student_id: params.studentId,
        file_name: safeName,
        file_name_original: params.file.name,
        storage_path: path,
        file_size_bytes: params.file.size,
        mime_type: params.file.type,
        moderation_status: 'approved',
        visible_to_parent: true,
      })
      if (insertErr) throw insertErr

      return { success: true }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['teacher-uploads'] }) },
  })
}

// ─── Teacher notes about students ────────────────────

export function useTeacherStudentNotes(studentId: string | undefined) {
  const { profile } = useAuthContext()
  return useQuery<TeacherStudentNote[]>({
    queryKey: ['teacher-student-notes', studentId, profile?.id],
    enabled: !!studentId && !!profile?.id,
    queryFn: async () => {
      const { data: teacher } = await supabase.from('teachers').select('id').eq('profile_id', profile!.id).single()
      if (!teacher) return []
      const { data } = await supabase.from('teacher_student_notes')
        .select('id, note_text, moderation_status, created_at, updated_at')
        .eq('student_id', studentId!)
        .eq('teacher_id', teacher.id)
        .order('created_at', { ascending: false })
      return data ?? []
    },
  })
}

export function useSaveTeacherNote() {
  const { profile, tenantId } = useAuthContext()
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (params: { studentId: string; noteText: string }) => {
      if (!tenantId || !profile) throw new Error('Not authenticated')

      const { data: teacher } = await supabase.from('teachers').select('id').eq('profile_id', profile.id).single()
      if (!teacher) throw new Error('Teacher profile not found')

      // Content moderation check
      const check = checkNoteText(params.noteText)
      if (!check.ok && check.severity === 'block') {
        throw new Error(check.reason ?? 'Note contains inappropriate language. Please revise.')
      }

      const moderationStatus = check.ok ? 'approved' : 'flagged'

      const { error } = await supabase.from('teacher_student_notes').insert({
        tenant_id: tenantId,
        teacher_id: teacher.id,
        student_id: params.studentId,
        note_text: params.noteText,
        moderation_status: moderationStatus,
        moderation_reason: check.ok ? null : check.word ?? null,
      })
      if (error) throw error

      return { moderated: !check.ok }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['teacher-student-notes'] }) },
  })
}

// ─── Admin: files needing moderation ─────────────────

export function useModerationQueue() {
  const { tenantId } = useAuthContext()
  return useQuery({
    queryKey: ['moderation-queue', tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data: flaggedFiles } = await supabase.from('teacher_uploads').select('id, file_name_original, teacher_id, student_id, moderation_reason, uploaded_at').eq('tenant_id', tenantId!).eq('moderation_status', 'flagged')
      const { data: flaggedNotes } = await supabase.from('teacher_student_notes').select('id, note_text, teacher_id, student_id, moderation_reason, created_at').eq('tenant_id', tenantId!).eq('moderation_status', 'flagged')
      return { flaggedFiles: flaggedFiles ?? [], flaggedNotes: flaggedNotes ?? [], total: (flaggedFiles?.length ?? 0) + (flaggedNotes?.length ?? 0) }
    },
  })
}
