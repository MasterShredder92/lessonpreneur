import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuthContext } from '../app/AuthContext'
import { createNotification } from './useNotifications'

export interface PendingReminder {
  blockId: string
  studentId: string
  studentName: string
  familyId: string
  familyEmail: string | null
  teacherName: string
  instrument: string | null
  locationName: string
  blockDate: string
  startTime: string
}

// ─── Find sessions needing reminders (24-25h from now) ─

export function usePendingReminders() {
  const { tenantId } = useAuthContext()
  return useQuery<PendingReminder[]>({
    queryKey: ['pending-reminders', tenantId],
    enabled: !!tenantId,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      // Sessions happening tomorrow
      const tomorrow = new Date()
      tomorrow.setDate(tomorrow.getDate() + 1)
      const tomorrowStr = tomorrow.toISOString().split('T')[0]

      const { data: blocks } = await supabase
        .from('schedule_blocks')
        .select('id, student_id, teacher_id, location_id, block_date, start_time')
        .eq('block_date', tomorrowStr)
        .eq('status', 'booked')
        .eq('reminder_sent', false)
        .not('student_id', 'is', null)

      if (!blocks || blocks.length === 0) return []

      // Enrich with names
      const studentIds = [...new Set(blocks.map(b => b.student_id))]
      const teacherIds = [...new Set(blocks.map(b => b.teacher_id))]
      const locIds = [...new Set(blocks.map(b => b.location_id))]

      const { data: students } = await supabase.from('students').select('id, first_name, last_name, instrument, family_id').in('id', studentIds)
      const { data: families } = await supabase.from('families').select('id, primary_email').in('id', [...new Set((students ?? []).map(s => s.family_id))])
      const { data: teachers } = await supabase.from('teachers').select('id, first_name, last_name').in('id', teacherIds)
      const { data: locs } = await supabase.from('locations').select('id, name').in('id', locIds)

      const stuMap = new Map((students ?? []).map((s: any) => [s.id, s]))
      const famMap = new Map((families ?? []).map((f: any) => [f.id, f]))
      const tMap = new Map((teachers ?? []).map((t: any) => [t.id, `${t.first_name} ${t.last_name}`.trim()]))
      const locMap = new Map((locs ?? []).map((l: any) => [l.id, l.name?.replace(' Music Lessons', '') ?? '']))

      return blocks.map((b: any): PendingReminder => {
        const stu = stuMap.get(b.student_id)
        const fam = stu ? famMap.get(stu.family_id) : null
        return {
          blockId: b.id,
          studentId: b.student_id,
          studentName: stu ? `${stu.first_name} ${stu.last_name}`.trim() : 'Student',
          familyId: stu?.family_id ?? '',
          familyEmail: fam?.primary_email ?? null,
          teacherName: tMap.get(b.teacher_id) ?? 'Teacher',
          instrument: stu?.instrument ?? null,
          locationName: locMap.get(b.location_id) ?? '',
          blockDate: b.block_date,
          startTime: b.start_time,
        }
      })
    },
  })
}

// ─── Send reminders for pending blocks ───────────────

export function useSendReminders() {
  const { tenantId } = useAuthContext()
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (reminders: PendingReminder[]) => {
      if (!tenantId) throw new Error('No tenant')
      let sent = 0

      for (const r of reminders) {
        // Create notification for parents (if we can find their profile)
        const { data: parentProfile } = await supabase
          .from('profiles')
          .select('id')
          .ilike('email', r.familyEmail ?? '__none__')
          .limit(1)
          .single()

        if (parentProfile) {
          await createNotification({
            tenantId,
            profileId: parentProfile.id,
            type: 'reminder',
            title: `Reminder: ${r.studentName}'s session tomorrow`,
            body: `${r.instrument ?? 'Music'} at ${formatTimeShort(r.startTime)} with ${r.teacherName}`,
            route: '/parent/dashboard',
            referenceId: r.blockId,
            referenceType: 'schedule_block',
          })
        }

        // Mark reminder as sent
        await supabase.from('schedule_blocks').update({ reminder_sent: true }).eq('id', r.blockId)
        sent++
      }

      return { sent }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pending-reminders'] })
    },
  })
}

function formatTimeShort(t: string) {
  const [h, m] = t.split(':')
  const hour = parseInt(h)
  const ampm = hour >= 12 ? 'pm' : 'am'
  const display = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour
  return `${display}:${m}${ampm}`
}
