import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuthContext } from '../app/AuthContext'
import { postAiAssistantBusinessOverride, pickAiAssistantAnswerText } from '../services/aiAssistantClient'

// ─── Types ───────────────────────────────────────────

export interface CampaignRow {
  id: string
  student_id: string
  family_id: string | null
  campaign_type: string
  wave_number: number
  subject: string | null
  body: string | null
  status: string
  scheduled_date: string | null
  sent_at: string | null
  read_at: string | null
  student_status: string | null
  risk_score: number | null
  created_at: string
  // enriched
  student_name: string
  instrument: string | null
  location_name: string | null
}

export interface CampaignStats {
  wave1: { total: number; sent: number; read: number; pending: number }
  wave2: { total: number; sent: number; read: number; pending: number }
  wave3: { total: number; sent: number; read: number; pending: number }
}

// ─── Campaign stats ──────────────────────────────────

export function useCampaignStats() {
  const { tenantId } = useAuthContext()
  return useQuery<CampaignStats>({
    queryKey: ['campaign-stats', tenantId],
    enabled: !!tenantId,
    staleTime: 60_000,
    queryFn: async () => {
      const { data } = await supabase
        .from('retention_campaigns')
        .select('wave_number, status')
        .eq('tenant_id', tenantId!)
        .in('campaign_type', ['value_reinforcement', 'summer_bridge', 'return_incentive'])

      const waves = { wave1: { total: 0, sent: 0, read: 0, pending: 0 }, wave2: { total: 0, sent: 0, read: 0, pending: 0 }, wave3: { total: 0, sent: 0, read: 0, pending: 0 } }
      for (const row of data ?? []) {
        const key = `wave${row.wave_number}` as keyof typeof waves
        if (!waves[key]) continue
        waves[key].total++
        if (row.status === 'sent' || row.status === 'read' || row.status === 'actioned') waves[key].sent++
        if (row.status === 'read' || row.status === 'actioned') waves[key].read++
        if (row.status === 'pending' || row.status === 'generating' || row.status === 'generated') waves[key].pending++
      }
      return waves
    },
  })
}

// ─── Campaign list for a wave ────────────────────────

export function useCampaignList(wave: number) {
  const { tenantId } = useAuthContext()
  return useQuery<CampaignRow[]>({
    queryKey: ['campaign-list', tenantId, wave],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('retention_campaigns')
        .select('*')
        .eq('tenant_id', tenantId!)
        .eq('wave_number', wave)
        .order('created_at', { ascending: false })
        .limit(200)
      if (error) throw error

      const studentIds = [...new Set((data ?? []).map(r => r.student_id))]
      const studentMap = new Map<string, { name: string; instrument: string | null; location_id: string | null }>()
      if (studentIds.length > 0) {
        const { data: students } = await supabase.from('students').select('id, first_name, last_name, instrument, location_id').in('id', studentIds)
        students?.forEach((s: any) => studentMap.set(s.id, { name: `${s.first_name} ${s.last_name}`.trim(), instrument: s.instrument, location_id: s.location_id }))
      }

      const locIds = [...new Set([...(data ?? []).map(r => r.location_id), ...Array.from(studentMap.values()).map(s => s.location_id)].filter(Boolean))]
      const locMap = new Map<string, string>()
      if (locIds.length > 0) {
        const { data: locs } = await supabase.from('locations').select('id, name').in('id', locIds)
        locs?.forEach((l: any) => locMap.set(l.id, l.name?.replace(' Music Lessons', '') ?? ''))
      }

      return (data ?? []).map((r: any): CampaignRow => {
        const student = studentMap.get(r.student_id)
        return {
          ...r,
          student_name: student?.name ?? 'Unknown',
          instrument: student?.instrument ?? null,
          location_name: locMap.get(r.location_id ?? student?.location_id ?? '') ?? null,
        }
      })
    },
  })
}

// ─── Generate Wave 1: Semester Progress Summaries ────

export function useGenerateWave1() {
  const { tenantId } = useAuthContext()
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (onProgress: (done: number, total: number) => void) => {
      if (!tenantId) throw new Error('No tenant context')

      // 1. Get all active students with session data since January
      const { data: students } = await supabase
        .from('students')
        .select('id, first_name, last_name, instrument, family_id, location_id, teacher_id, created_at')
        .eq('status', 'active')

      if (!students || students.length === 0) return { generated: 0, skipped: 0 }

      // 2. Get session logs since January
      const { data: allLogs } = await supabase
        .from('session_log')
        .select('student_id, worked_on, progress_indicator, engagement_level, block_date')
        .gte('block_date', '2026-01-01')
        .order('block_date', { ascending: false })

      const logsByStudent = new Map<string, typeof allLogs>()
      allLogs?.forEach(l => {
        const list = logsByStudent.get(l.student_id) ?? []
        list.push(l)
        logsByStudent.set(l.student_id, list)
      })

      // 3. Get teacher names
      const teacherIds = [...new Set(students.map(s => s.teacher_id).filter(Boolean))]
      const teacherMap = new Map<string, string>()
      if (teacherIds.length > 0) {
        const { data: teachers } = await supabase.from('teachers').select('id, first_name, last_name').in('id', teacherIds)
        teachers?.forEach((t: any) => teacherMap.set(t.id, `${t.first_name} ${t.last_name}`.trim()))
      }

      // 4. Check which students already have Wave 1 campaigns
      const { data: existing } = await supabase
        .from('retention_campaigns')
        .select('student_id')
        .eq('tenant_id', tenantId)
        .eq('campaign_type', 'value_reinforcement')
        .eq('wave_number', 1)
      const alreadyGenerated = new Set((existing ?? []).map(e => e.student_id))

      // 5. Filter to students with session data and not already generated
      const eligible = students.filter(s => {
        if (alreadyGenerated.has(s.id)) return false
        const logs = logsByStudent.get(s.id)
        return logs && logs.length > 0
      })

      let generated = 0
      let skipped = 0
      const total = eligible.length

      // 6. Process in batches of 5
      for (let i = 0; i < eligible.length; i += 5) {
        const batch = eligible.slice(i, i + 5)

        await Promise.all(batch.map(async (student) => {
          try {
            const logs = logsByStudent.get(student.id) ?? []
            const teacherName = student.teacher_id ? teacherMap.get(student.teacher_id) ?? 'your teacher' : 'your teacher'

            // Build context
            const allTags = new Set<string>()
            let crushingCount = 0, onTrackCount = 0, strugglingCount = 0
            let highEngagement = 0
            logs.forEach(l => {
              l.worked_on?.forEach((t: string) => allTags.add(t))
              if (l.progress_indicator === 'crushing_it') crushingCount++
              if (l.progress_indicator === 'on_track') onTrackCount++
              if (l.progress_indicator === 'struggling') strugglingCount++
              if ((l.engagement_level ?? 0) >= 4) highEngagement++
            })

            const context = [
              `Student: ${student.first_name} (${student.instrument ?? 'music'})`,
              `Teacher: ${teacherName}`,
              `Total sessions this semester: ${logs.length}`,
              `Skills worked on: ${[...allTags].slice(0, 10).join(', ')}`,
              `Progress breakdown: ${crushingCount} crushing it, ${onTrackCount} on track, ${strugglingCount} needs work`,
              `High-engagement sessions (4-5/5): ${highEngagement} of ${logs.length}`,
              logs.length > 0 ? `Most recent focus: ${(logs[0].worked_on ?? []).join(', ') || 'general practice'}` : null,
            ].filter(Boolean).join('\n')

            const result = await postAiAssistantBusinessOverride({
              tenantId: tenantId!,
              question: `Generate a semester progress summary:\n\n${context}`,
              systemOverride: `You are writing a personalized semester progress update for a music student's family. This highlights their growth and encourages them to continue through summer. Use the session data to reference SPECIFIC things the student worked on and skills they developed. Be warm, genuine, and specific — never generic. 3-4 sentences. End with encouragement about summer being a great time to build on momentum. The student's name is ${student.first_name}. They study ${student.instrument ?? 'music'}. Sign off as ${teacherName}.`,
            })
            const body = pickAiAssistantAnswerText(result)
            if (!body || result.error) { skipped++; return }

            // Save to communications
            const { data: comm } = await supabase.from('communications').insert({
              tenant_id: tenantId,
              student_id: student.id,
              family_id: student.family_id,
              teacher_id: student.teacher_id,
              type: 'progress_update',
              subject: `${student.first_name}'s Semester Progress`,
              body,
              teacher_input_summary: `Wave 1 — ${logs.length} sessions, ${[...allTags].length} skills`,
              channel: 'in_app',
              status: 'sent',
              sent_at: new Date().toISOString(),
              ai_model: 'claude-sonnet',
            }).select('id').single()

            // Save to retention_campaigns
            await supabase.from('retention_campaigns').insert({
              tenant_id: tenantId,
              student_id: student.id,
              family_id: student.family_id,
              location_id: student.location_id,
              campaign_type: 'value_reinforcement',
              wave_number: 1,
              subject: `${student.first_name}'s Semester Progress`,
              body,
              ai_context: { sessions: logs.length, skills: [...allTags], progress: { crushingCount, onTrackCount, strugglingCount } },
              status: 'sent',
              sent_at: new Date().toISOString(),
              student_status: 'active',
              communication_id: comm?.id ?? null,
            })

            generated++
          } catch {
            skipped++
          }
        }))

        onProgress(Math.min(i + 5, total), total)

        // Rate limit: small pause between batches
        if (i + 5 < eligible.length) await new Promise(r => setTimeout(r, 200))
      }

      return { generated, skipped, total }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['campaign-stats'] })
      qc.invalidateQueries({ queryKey: ['campaign-list'] })
      qc.invalidateQueries({ queryKey: ['family-communications'] })
      qc.invalidateQueries({ queryKey: ['student-communications'] })
    },
  })
}

// ─── Mark campaign as read ───────────────────────────

export function useMarkCampaignRead() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (campaignId: string) => {
      await supabase.from('retention_campaigns').update({ status: 'read', read_at: new Date().toISOString() }).eq('id', campaignId)
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['campaign-stats'] }) },
  })
}

// ─── Win-back: pending campaigns due today or earlier ─

export function usePendingWinBacks() {
  const { tenantId } = useAuthContext()
  return useQuery({
    queryKey: ['pending-winbacks', tenantId],
    enabled: !!tenantId,
    staleTime: 60_000,
    queryFn: async () => {
      const today = new Date().toISOString().split('T')[0]
      const { data } = await supabase
        .from('retention_campaigns')
        .select('id, student_id, family_id, wave_number, scheduled_date')
        .eq('tenant_id', tenantId!)
        .eq('campaign_type', 'win_back')
        .eq('status', 'pending')
        .lte('scheduled_date', today)
        .order('scheduled_date')
      return data ?? []
    },
  })
}

// ─── Generate win-back message for a single campaign ─

export function useGenerateWinBack() {
  const { tenantId } = useAuthContext()
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (campaignId: string) => {
      if (!tenantId) throw new Error('No tenant context')

      // Get the campaign
      const { data: campaign } = await supabase.from('retention_campaigns').select('*').eq('id', campaignId).single()
      if (!campaign) throw new Error('Campaign not found')

      // Get student + teacher info
      const { data: student } = await supabase.from('students').select('first_name, last_name, instrument, teacher_id, deactivated_at, pause_reason').eq('id', campaign.student_id).single()
      if (!student) throw new Error('Student not found')

      const teacherName = student.teacher_id
        ? await supabase.from('teachers').select('first_name, last_name').eq('id', student.teacher_id).single().then(r => r.data ? `${r.data.first_name} ${r.data.last_name}`.trim() : 'your teacher')
        : 'your teacher'

      // Get last session data
      const { data: lastLogs } = await supabase.from('session_log').select('worked_on, progress_indicator, block_date').eq('student_id', campaign.student_id).order('block_date', { ascending: false }).limit(3)

      const daysPaused = student.deactivated_at ? Math.floor((Date.now() - new Date(student.deactivated_at).getTime()) / 86400000) : campaign.wave_number * 30
      const lastTopics = (lastLogs ?? []).flatMap((l: any) => l.worked_on ?? []).slice(0, 5)

      const prompts: Record<number, string> = {
        1: `Write a warm "we miss you" message for ${student.first_name}'s family. They've been away for about ${daysPaused} days. They were studying ${student.instrument ?? 'music'} with ${teacherName}. Their last sessions covered: ${lastTopics.join(', ') || 'various topics'}. ${student.pause_reason ? `They paused because: ${student.pause_reason}.` : ''} Keep it brief (2-3 sentences), personal, and low-pressure. Reference what they were working on. Don't sound like marketing.`,
        2: `Write a "your teacher has open spots" message for ${student.first_name}'s family. ${teacherName} is their teacher. They study ${student.instrument ?? 'music'}. They've been away ${daysPaused} days. Mention that ${teacherName} has availability and would love to pick up where they left off. 2-3 sentences, warm and specific.`,
        3: `Write an "it's not too late" message for ${student.first_name}'s family. They've been away ${daysPaused} days. They were studying ${student.instrument ?? 'music'} and were working on ${lastTopics.join(', ') || 'building their skills'}. Encourage a fresh start. Mention that their progress isn't lost — they can pick up right where they left off. 2-3 sentences, encouraging and genuine.`,
      }

      const result = await postAiAssistantBusinessOverride({
        tenantId: tenantId!,
        question: prompts[campaign.wave_number] ?? prompts[1],
        systemOverride: 'You are writing a warm re-engagement message for a music school. Be personal, specific, and brief. Sign off as the studio team. No subject line, just the message body.',
      })
      const body = pickAiAssistantAnswerText(result)
      if (!body || result.error) throw new Error(result.error || 'AI generation failed')

      // Save to communications
      const subjects: Record<number, string> = {
        1: `We miss ${student.first_name}!`,
        2: `${teacherName} has open spots`,
        3: `It's not too late, ${student.first_name}`,
      }

      const { data: comm } = await supabase.from('communications').insert({
        tenant_id: tenantId,
        student_id: campaign.student_id,
        family_id: campaign.family_id,
        teacher_id: student.teacher_id,
        type: 'reengagement',
        subject: subjects[campaign.wave_number] ?? subjects[1],
        body,
        channel: 'in_app',
        status: 'sent',
        sent_at: new Date().toISOString(),
        ai_model: 'claude-sonnet',
      }).select('id').single()

      // Update campaign
      await supabase.from('retention_campaigns').update({
        body,
        subject: subjects[campaign.wave_number],
        status: 'sent',
        sent_at: new Date().toISOString(),
        communication_id: comm?.id ?? null,
      }).eq('id', campaignId)

      return { campaignId, body }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pending-winbacks'] })
      qc.invalidateQueries({ queryKey: ['campaign-stats'] })
      qc.invalidateQueries({ queryKey: ['campaign-list'] })
      qc.invalidateQueries({ queryKey: ['family-communications'] })
    },
  })
}
