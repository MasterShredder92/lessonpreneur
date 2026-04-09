import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuthContext } from '../app/AuthContext'
import { useTeacherRecord } from './useTeacherDashboard'
import { postAiAssistantBusinessOverride, pickAiAssistantAnswerText } from '../services/aiAssistantClient'

export interface SessionNote {
  id: string
  tenant_id: string
  student_id: string
  teacher_id: string
  schedule_block_id: string | null
  note_date: string
  raw_note: string
  ai_enhanced_note: string | null
  topics_covered: string[]
  skills_progressing: string[]
  mood: string | null
  is_visible_to_parent: boolean
  ai_enhanced_at: string | null
  created_at: string
  updated_at: string
}

// Fetch session notes for a student (teacher's view)
export function useStudentSessionNotes(studentId: string | undefined) {
  return useQuery<SessionNote[]>({
    queryKey: ['session-notes', studentId],
    enabled: !!studentId,
    queryFn: async () => {
      const { data } = await supabase
        .from('teacher_session_notes')
        .select('*')
        .eq('student_id', studentId!)
        .order('note_date', { ascending: false })
        .limit(30)
      return (data as SessionNote[]) ?? []
    },
  })
}

// Save a new session note
export function useSaveSessionNote() {
  const { tenantId } = useAuthContext()
  const { data: teacherId } = useTeacherRecord()
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (params: {
      studentId: string
      scheduleBlockId?: string
      noteDate: string
      rawNote: string
      aiEnhancedNote?: string
      topicsCovered: string[]
      skillsProgressing: string[]
      mood: string
      isVisibleToParent: boolean
    }) => {
      if (!tenantId || !teacherId) throw new Error('Not authenticated')

      const { data, error } = await supabase
        .from('teacher_session_notes')
        .insert({
          tenant_id: tenantId,
          student_id: params.studentId,
          teacher_id: teacherId,
          schedule_block_id: params.scheduleBlockId || null,
          note_date: params.noteDate,
          raw_note: params.rawNote,
          ai_enhanced_note: params.aiEnhancedNote || null,
          topics_covered: params.topicsCovered,
          skills_progressing: params.skillsProgressing,
          mood: params.mood,
          is_visible_to_parent: params.isVisibleToParent,
          ai_enhanced_at: params.aiEnhancedNote ? new Date().toISOString() : null,
        })
        .select('id')
        .single()

      if (error) throw error
      return data
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['session-notes', vars.studentId] })
      qc.invalidateQueries({ queryKey: ['portal-notes', vars.studentId] })
      qc.invalidateQueries({ queryKey: ['teacher-day-blocks'] })
    },
  })
}

// Update an existing session note
export function useUpdateSessionNote() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (params: {
      noteId: string
      studentId: string
      rawNote: string
      aiEnhancedNote?: string
      topicsCovered: string[]
      skillsProgressing: string[]
      mood: string
      isVisibleToParent: boolean
    }) => {
      const { error } = await supabase
        .from('teacher_session_notes')
        .update({
          raw_note: params.rawNote,
          ai_enhanced_note: params.aiEnhancedNote || null,
          topics_covered: params.topicsCovered,
          skills_progressing: params.skillsProgressing,
          mood: params.mood,
          is_visible_to_parent: params.isVisibleToParent,
          ai_enhanced_at: params.aiEnhancedNote ? new Date().toISOString() : null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', params.noteId)

      if (error) throw error
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['session-notes', vars.studentId] })
      qc.invalidateQueries({ queryKey: ['portal-notes', vars.studentId] })
    },
  })
}

// Polish note with Star AI
export async function polishNoteWithStar(params: {
  tenantId: string
  studentName: string
  instrument: string | null
  mood: string
  topicsCovered: string[]
  skillsProgressing: string[]
  rawNote: string
}): Promise<string> {
  const systemPrompt = `You are Star, the AI assistant for a music school. A teacher just wrote a session note about a student's lesson. Your job is to polish this into a warm, professional, parent-friendly summary. Keep the teacher's key points but make it read like a thoughtful progress update a parent would love to receive.

Include:
- What was worked on (from topics if provided)
- How the student did (from mood + note content)
- What to practice before next session
- An encouraging closing line

Keep it to 2-3 short paragraphs. Warm but professional tone. Use the student's first name. Do not use emojis. Do not make up information not in the original note.`

  const question = `Student: ${params.studentName}
Instrument: ${params.instrument ?? 'Not specified'}
Session Mood: ${params.mood}
Topics Covered: ${params.topicsCovered.join(', ') || 'Not specified'}
Skills Progress: ${params.skillsProgressing.join(', ') || 'Not specified'}

Teacher's Raw Note:
${params.rawNote}

Please polish this into a parent-friendly progress update.`

  const data = await postAiAssistantBusinessOverride({
    tenantId: params.tenantId,
    question,
    systemOverride: systemPrompt,
  })
  if (data.error) throw new Error(data.error)
  return pickAiAssistantAnswerText(data) || ''
}
