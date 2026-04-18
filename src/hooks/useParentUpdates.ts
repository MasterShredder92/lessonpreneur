import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuthContext } from '../app/AuthContext'
import { postAiAssistantBusinessOverride, pickAiAssistantAnswerText } from '../services/aiAssistantClient'
import { EDGE_FUNCTIONS } from '../lib/config'
import { safeFetchBackground } from '../lib/safeFetch'
import { qk } from '../lib/queryKeys'

// ─── Types ───────────────────────────────────────────

export interface ParentUpdate {
  id: string
  student_id: string
  student_name: string
  teacher_name: string
  instrument: string | null
  type: string
  body: string
  worked_on: string[]
  engagement_level: number | null
  progress_indicator: string | null
  status: string
  created_at: string
  read_at: string | null
}

// ─── Generate parent update from session log ─────────

export function useGenerateParentUpdate() {
  const { tenantId } = useAuthContext()
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (sessionLogId: string) => {
      if (!tenantId) throw new Error('No tenant context')

      // Fetch the session log with student + teacher details
      const { data: log, error: logErr } = await supabase
        .from('session_log')
        .select('id, student_id, teacher_id, block_date, worked_on, engagement_level, progress_indicator, teacher_note, instrument, lesson_notes')
        .eq('id', sessionLogId)
        .single()
      if (logErr || !log) throw new Error('Session log not found')

      // Get student + family info
      const { data: student } = await supabase
        .from('students')
        .select('id, first_name, last_name, instrument, family_id')
        .eq('id', log.student_id)
        .single()
      if (!student) throw new Error('Student not found')

      const { data: family } = await supabase
        .from('families')
        .select('id, name, parent_name, primary_email')
        .eq('id', student.family_id)
        .single()

      // Get teacher name
      const { data: teacher } = await supabase
        .from('teachers')
        .select('first_name, last_name')
        .eq('id', log.teacher_id)
        .single()
      const teacherName = teacher ? `${teacher.first_name} ${teacher.last_name}`.trim() : 'Your teacher'

      // Get recent session history for this student (last 4 sessions for context)
      const { data: recentLogs } = await supabase
        .from('session_log')
        .select('worked_on, progress_indicator, engagement_level, block_date')
        .eq('student_id', log.student_id)
        .neq('id', sessionLogId)
        .order('block_date', { ascending: false })
        .limit(4)

      // Build context for AI
      const workedOnStr = (log.worked_on ?? []).join(', ')
      const progressMap: Record<string, string> = {
        struggling: 'needs some extra support right now',
        on_track: 'is making steady progress',
        crushing_it: 'is doing amazing work',
      }
      const engagementMap: Record<number, string> = {
        1: 'low energy today',
        2: 'fair energy',
        3: 'good energy',
        4: 'great energy and focus',
        5: 'incredible energy and focus',
      }
      const progressStr = progressMap[log.progress_indicator ?? ''] ?? 'is progressing well'
      const engagementStr = engagementMap[log.engagement_level ?? 3] ?? 'good energy'
      const instrument = log.instrument ?? student.instrument ?? 'music'
      const studentFirst = student.first_name
      const parentFirst = family?.parent_name?.split(' ')[0] ?? 'there'

      // Build recent trend context
      let trendContext = ''
      if (recentLogs && recentLogs.length > 0) {
        const recentProgress = recentLogs.map(r => r.progress_indicator).filter(Boolean)
        const crushingCount = recentProgress.filter(p => p === 'crushing_it').length
        const strugglingCount = recentProgress.filter(p => p === 'struggling').length
        if (crushingCount >= 2) trendContext = `${studentFirst} has been on a strong streak lately.`
        else if (strugglingCount >= 2 && log.progress_indicator !== 'struggling') trendContext = `${studentFirst} has been working through some challenges recently and today showed improvement.`
      }

      const context = [
        `Student: ${studentFirst} (${instrument})`,
        `Teacher: ${teacherName}`,
        `Date: ${new Date(log.block_date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}`,
        `Worked on: ${workedOnStr || 'general practice'}`,
        `Progress: ${studentFirst} ${progressStr}`,
        `Energy/Engagement: ${engagementStr}`,
        log.teacher_note ? `Teacher note: ${log.teacher_note}` : null,
        trendContext || null,
      ].filter(Boolean).join('\n')

      const data = await postAiAssistantBusinessOverride({
        tenantId: tenantId!,
        question: `Generate a parent progress update for this session.\n\n${context}`,
        systemOverride: `You are writing a warm, professional progress update from a music school to a parent about their child's lesson today.

Rules:
- Address the parent casually (use "Hi ${parentFirst}" or similar)
- Mention specifically what ${studentFirst} worked on today
- Comment on their energy and progress honestly but encouragingly
- If they're struggling, be supportive and frame it as a normal part of learning
- If they're crushing it, celebrate genuinely without being over-the-top
- End with a brief note about what's coming next or what to practice
- Keep it 3-5 sentences. Warm but not cheesy. Professional but not corporate.
- Sign off as ${teacherName}
- Write the message only — no subject line, no markdown formatting
- This should feel like a text from a teacher who genuinely cares about the student`,
      })
      if (data.error) throw new Error(data.error)
      const body = pickAiAssistantAnswerText(data)
      if (!body) throw new Error('No update generated')

      // Save to communications table
      const { data: comm, error: commErr } = await supabase
        .from('communications')
        .insert({
          tenant_id: tenantId,
          student_id: student.id,
          family_id: student.family_id,
          session_log_id: sessionLogId,
          teacher_id: log.teacher_id,
          type: 'progress_update',
          subject: `${studentFirst}'s ${instrument} session — ${new Date(log.block_date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`,
          body,
          teacher_input_summary: [
            `Worked on: ${workedOnStr}`,
            `Engagement: ${log.engagement_level}/5`,
            `Progress: ${log.progress_indicator}`,
            log.teacher_note ? `Note: ${log.teacher_note}` : null,
          ].filter(Boolean).join(' | '),
          channel: 'in_app',
          status: 'sent',
          sent_at: new Date().toISOString(),
          ai_model: 'claude-sonnet',
        })
        .select('id')
        .single()

      if (commErr) throw commErr

      // Link session log to the communication
      await supabase
        .from('session_log')
        .update({ communication_id: comm.id, parent_update_status: 'sent' })
        .eq('id', sessionLogId)

      // Fire email in background (non-blocking)
      if (family?.primary_email) {
        const { progressUpdateEmail } = await import('../lib/emailTemplates')
        const { data: brand } = await supabase.from('brand_settings').select('studio_name, primary_color, logo_circle_path, website_domain').eq('location_id', log.location_id).maybeSingle()
        const emailBrand = {
          studioName: brand?.studio_name ?? 'Adkins Music Lessons',
          primaryColor: brand?.primary_color ?? '#D4226A',
          logoUrl: brand?.logo_circle_path ? supabase.storage.from('brand-assets').getPublicUrl(brand.logo_circle_path).data.publicUrl : null,
          websiteDomain: brand?.website_domain ?? 'zirowork.io',
          appUrl: window.location.origin,
        }
        const email = progressUpdateEmail(emailBrand, {
          studentName: studentFirst,
          instrument,
          teacherName,
          body,
          workedOn: log.worked_on ?? [],
          progressIndicator: log.progress_indicator,
        })
        // Queue email send (will no-op in dev) — fire-and-forget
        safeFetchBackground(EDGE_FUNCTIONS.sendEmail, {
          body: { to: family.primary_email, subject: email.subject, html: email.html, from_name: emailBrand.studioName, tenant_id: tenantId },
        })
      }

      return { communicationId: comm.id, body }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.sessions.teacherDay })
      qc.invalidateQueries({ queryKey: qk.communications.student })
      qc.invalidateQueries({ queryKey: qk.communications.family })
      qc.invalidateQueries({ queryKey: qk.sessions.all })
    },
  })
}

// ─── Query communications for a student ──────────────

export function useStudentCommunications(studentId: string | undefined, opts?: { enabled?: boolean }) {
  const queryEnabled = !!studentId && (opts?.enabled ?? true)
  return useQuery<ParentUpdate[]>({
    queryKey: qk.communications.student(studentId),
    enabled: queryEnabled,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('communications')
        .select(`
          id, student_id, type, body, status, created_at, read_at,
          session_log:session_log_id (worked_on, engagement_level, progress_indicator),
          teacher:teacher_id (first_name, last_name),
          student:student_id (first_name, last_name, instrument)
        `)
        .eq('student_id', studentId!)
        .eq('type', 'progress_update')
        .order('created_at', { ascending: false })
        .limit(20)

      if (error) throw error

      return (data ?? []).map((c: any) => ({
        id: c.id,
        student_id: c.student_id,
        student_name: c.student ? `${c.student.first_name} ${c.student.last_name}`.trim() : '',
        teacher_name: c.teacher ? `${c.teacher.first_name} ${c.teacher.last_name}`.trim() : '',
        instrument: c.student?.instrument ?? null,
        type: c.type,
        body: c.body,
        worked_on: c.session_log?.worked_on ?? [],
        engagement_level: c.session_log?.engagement_level ?? null,
        progress_indicator: c.session_log?.progress_indicator ?? null,
        status: c.status,
        created_at: c.created_at,
        read_at: c.read_at,
      }))
    },
  })
}

// ─── Query communications for a family (parent view) ─

export function useFamilyCommunications(familyId: string | undefined) {
  return useQuery<ParentUpdate[]>({
    queryKey: qk.communications.family(familyId),
    enabled: !!familyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('communications')
        .select(`
          id, student_id, type, body, status, created_at, read_at,
          session_log:session_log_id (worked_on, engagement_level, progress_indicator),
          teacher:teacher_id (first_name, last_name),
          student:student_id (first_name, last_name, instrument)
        `)
        .eq('family_id', familyId!)
        .in('type', ['progress_update', 'milestone'])
        .in('status', ['sent', 'read'])
        .order('created_at', { ascending: false })
        .limit(30)

      if (error) throw error

      return (data ?? []).map((c: any) => ({
        id: c.id,
        student_id: c.student_id,
        student_name: c.student ? `${c.student.first_name} ${c.student.last_name}`.trim() : '',
        teacher_name: c.teacher ? `${c.teacher.first_name} ${c.teacher.last_name}`.trim() : '',
        instrument: c.student?.instrument ?? null,
        type: c.type,
        body: c.body,
        worked_on: c.session_log?.worked_on ?? [],
        engagement_level: c.session_log?.engagement_level ?? null,
        progress_indicator: c.session_log?.progress_indicator ?? null,
        status: c.status,
        created_at: c.created_at,
        read_at: c.read_at,
      }))
    },
  })
}
