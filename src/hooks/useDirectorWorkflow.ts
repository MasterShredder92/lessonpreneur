import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuthContext } from '../app/AuthContext'

// ═══════════════════════════════════════
// SELF-SERVICE RESCHEDULING
// ═══════════════════════════════════════

export interface RescheduleSlot {
  blockId: string
  blockDate: string
  startTime: string
  endTime: string
  teacherName: string
}

export function useAvailableRescheduleSlots(studentId: string | undefined, currentBlockId: string | undefined) {
  return useQuery<RescheduleSlot[]>({
    queryKey: ['reschedule-slots', studentId, currentBlockId],
    enabled: !!studentId && !!currentBlockId,
    queryFn: async () => {
      // Get the current block's teacher and location
      const { data: currentBlock } = await supabase
        .from('schedule_blocks')
        .select('teacher_id, location_id, start_time')
        .eq('id', currentBlockId!)
        .single()
      if (!currentBlock) return []

      const today = new Date().toISOString().split('T')[0]
      const sevenDays = new Date()
      sevenDays.setDate(sevenDays.getDate() + 7)

      // Find available blocks for the same teacher within 7 days
      const { data: openBlocks } = await supabase
        .from('schedule_blocks')
        .select('id, block_date, start_time, end_time, teacher_id')
        .eq('teacher_id', currentBlock.teacher_id)
        .eq('location_id', currentBlock.location_id)
        .eq('status', 'available')
        .gt('block_date', today)
        .lte('block_date', sevenDays.toISOString().split('T')[0])
        .order('block_date')
        .order('start_time')
        .limit(20)

      if (!openBlocks || openBlocks.length === 0) return []

      // Get teacher name
      const { data: teacher } = await supabase.from('teachers').select('first_name, last_name').eq('id', currentBlock.teacher_id).single()
      const teacherName = teacher ? `${teacher.first_name} ${teacher.last_name}`.trim() : 'Your teacher'

      return openBlocks.map((b: any): RescheduleSlot => ({
        blockId: b.id,
        blockDate: b.block_date,
        startTime: b.start_time,
        endTime: b.end_time,
        teacherName,
      }))
    },
  })
}

export function useRescheduleSession() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ currentBlockId, newBlockId, studentId }: { currentBlockId: string; newBlockId: string; studentId: string }) => {
      // Check reschedule limit (max 2 per month)
      const monthStart = new Date()
      monthStart.setDate(1)
      const { count } = await supabase
        .from('activity_log')
        .select('id', { count: 'exact', head: true })
        .eq('entity_type', 'self_reschedule')
        .eq('entity_id', studentId)
        .gte('created_at', monthStart.toISOString())
      if ((count ?? 0) >= 2) throw new Error('Maximum 2 reschedules per month reached')

      // Check 24h advance requirement
      const { data: currentBlock } = await supabase.from('schedule_blocks').select('block_date, start_time').eq('id', currentBlockId).single()
      if (currentBlock) {
        const blockTime = new Date(`${currentBlock.block_date}T${currentBlock.start_time}`)
        const hoursUntil = (blockTime.getTime() - Date.now()) / (1000 * 60 * 60)
        if (hoursUntil < 24) throw new Error('Must reschedule at least 24 hours in advance')
      }

      // Move student from current to new block
      const { error: clearErr } = await supabase.from('schedule_blocks').update({
        student_id: null, status: 'available', block_type: 'open_time',
      }).eq('id', currentBlockId)
      if (clearErr) throw clearErr

      const { error: bookErr } = await supabase.from('schedule_blocks').update({
        student_id: studentId, status: 'booked', block_type: 'student_session',
      }).eq('id', newBlockId)
      if (bookErr) throw bookErr

      // Log the reschedule
      await supabase.from('activity_log').insert({
        entity_type: 'self_reschedule', entity_id: studentId,
        action: 'reschedule', description: `Student self-rescheduled`,
      }).then(() => {})
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['schedule-grid'] })
      qc.invalidateQueries({ queryKey: ['schedule-intelligence'] })
      qc.invalidateQueries({ queryKey: ['student-blocks'] })
      qc.invalidateQueries({ queryKey: ['parent-upcoming'] })
      qc.invalidateQueries({ queryKey: ['reschedule-slots'] })
    },
  })
}

// ═══════════════════════════════════════
// TASK AUTO-CREATION
// ═══════════════════════════════════════

export function useAutoCreateTasks() {
  const { tenantId } = useAuthContext()
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async () => {
      if (!tenantId) return { created: 0 }
      const today = new Date().toISOString().split('T')[0]
      let created = 0

      // 1. New leads → auto-create follow-up tasks
      const { data: newLeads } = await supabase
        .from('leads')
        .select('id, first_name, last_name, location_id, created_at')
        .eq('tenant_id', tenantId!)
        .eq('stage', 'inquiry')
        .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())

      for (const lead of newLeads ?? []) {
        const dedup = `lead_followup:${lead.id}`
        const { error } = await supabase.from('tasks').upsert({
          tenant_id: tenantId,
          task_type: 'manual',
          title: `Follow up with ${lead.first_name} ${lead.last_name ?? ''}`.trim(),
          priority: 'high',
          assigned_role: 'studio_director',
          entity_type: 'lead',
          entity_id: lead.id,
          status: 'pending',
          dedup_key: dedup,
        }, { onConflict: 'dedup_key', ignoreDuplicates: true })
        if (!error) created++
      }

      // 2. Missed sessions → auto-create check-on tasks
      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0]
      const { data: missed } = await supabase
        .from('schedule_blocks')
        .select('id, student_id, teacher_id, block_date')
        .eq('tenant_id', tenantId!)
        .eq('status', 'booked')
        .eq('checked_in', false)
        .eq('block_date', yesterday)
        .not('student_id', 'is', null)

      const missedStudentIds = [...new Set((missed ?? []).map(m => m.student_id).filter(Boolean))]
      if (missedStudentIds.length > 0) {
        const { data: missedStudents } = await supabase.from('students').select('id, first_name, last_name').eq('tenant_id', tenantId!).in('id', missedStudentIds)
        const nameMap = new Map((missedStudents ?? []).map((s: any) => [s.id, `${s.first_name} ${s.last_name}`.trim()]))

        for (const studentId of missedStudentIds) {
          const dedup = `missed_session:${studentId}:${yesterday}`
          await supabase.from('tasks').upsert({
            tenant_id: tenantId,
            task_type: 'manual',
            title: `Check on ${nameMap.get(studentId) ?? 'student'} — missed session ${yesterday}`,
            priority: 'normal',
            assigned_role: 'studio_director',
            entity_type: 'student',
            entity_id: studentId,
            status: 'pending',
            dedup_key: dedup,
          }, { onConflict: 'dedup_key', ignoreDuplicates: true })
          created++
        }
      }

      // 3. Overdue payments (7+ days) → auto-create follow-up tasks
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
      const { data: overdue } = await supabase
        .from('square_invoices')
        .select('family_id, customer_name')
        .eq('tenant_id', tenantId)
        .eq('amount_paid', 0)
        .lt('due_date', sevenDaysAgo)
        .not('family_id', 'is', null)

      const overdueFamilyIds = [...new Set((overdue ?? []).map(o => o.family_id).filter(Boolean))]
      const overdueNames = new Map((overdue ?? []).map((o: any) => [o.family_id, o.customer_name]))

      for (const famId of overdueFamilyIds) {
        const dedup = `payment_overdue:${famId}:${today.substring(0, 7)}`
        await supabase.from('tasks').upsert({
          tenant_id: tenantId,
          task_type: 'billing_overdue',
          title: `Payment follow-up: ${overdueNames.get(famId) ?? 'Family'}`,
          priority: 'high',
          assigned_role: 'studio_director',
          entity_type: 'family',
          entity_id: famId!,
          status: 'pending',
          dedup_key: dedup,
        }, { onConflict: 'dedup_key', ignoreDuplicates: true })
        created++
      }

      return { created }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tasks'] })
    },
  })
}

// ═══════════════════════════════════════
// WEEKLY LOCATION SUMMARY (auto-generated)
// ═══════════════════════════════════════

export interface WeeklyLocationSummary {
  locationName: string
  locationColor: string
  activeStudents: number
  sessionsCompleted: number
  atRiskCount: number
  newLeads: number
  overdueCount: number
}

export function useWeeklyLocationSummaries() {
  const { tenantId } = useAuthContext()
  return useQuery<WeeklyLocationSummary[]>({
    queryKey: ['weekly-location-summaries', tenantId],
    enabled: !!tenantId,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const now = new Date()
      const dow = now.getDay()
      const monday = new Date(now)
      monday.setDate(now.getDate() - (dow === 0 ? 6 : dow - 1))
      const mondayStr = monday.toISOString().split('T')[0]
      const todayStr = now.toISOString().split('T')[0]

      const COLORS: Record<string, string> = {
        'd48229c1-b70a-4d29-893e-5079887dab76': '#D41113',
        'f7b52dd5-12ee-437f-9c60-f8adf454ac31': '#A333FF',
        'cebd97d4-c241-4de2-8ade-49e5cc0070d5': '#00A5E8',
        '40c67ffc-91b5-46a9-94bd-6ddffdfb7638': '#00A651',
      }

      const { data: locations } = await supabase.from('locations').select('id, name').eq('tenant_id', tenantId!).eq('is_active', true)
      const { data: students } = await supabase.from('students').select('id, location_id, status').eq('tenant_id', tenantId!)
      const { data: sessions } = await supabase.from('session_log').select('location_id').eq('tenant_id', tenantId!).gte('block_date', mondayStr).lte('block_date', todayStr)
      const { data: leads } = await supabase.from('leads').select('location_id').eq('tenant_id', tenantId!).gte('created_at', mondayStr + 'T00:00:00')

      // At-risk: active students with no session in 14 days
      const fourteenDaysAgo = new Date(Date.now() - 14 * 86400000).toISOString().split('T')[0]
      const { data: recentSessions } = await supabase.from('session_log').select('student_id').eq('tenant_id', tenantId!).gte('block_date', fourteenDaysAgo)
      const recentStudentIds = new Set((recentSessions ?? []).map(s => s.student_id))
      const activeStudents = (students ?? []).filter(s => s.status === 'active')

      // Overdue invoices
      const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0]
      const { data: overdueInv } = await supabase.from('square_invoices').select('location_id').eq('tenant_id', tenantId!).eq('amount_paid', 0).lt('due_date', sevenDaysAgo)

      return (locations ?? []).map((loc: any): WeeklyLocationSummary => {
        const locName = loc.name?.replace(' Music Lessons', '') ?? ''
        return {
          locationName: locName,
          locationColor: COLORS[loc.id] ?? '#D4226A',
          activeStudents: activeStudents.filter(s => s.location_id === loc.id).length,
          sessionsCompleted: (sessions ?? []).filter(s => s.location_id === loc.id).length,
          atRiskCount: activeStudents.filter(s => s.location_id === loc.id && !recentStudentIds.has(s.id)).length,
          newLeads: (leads ?? []).filter(l => l.location_id === loc.id).length,
          overdueCount: (overdueInv ?? []).filter(i => i.location_id === loc.id).length,
        }
      })
    },
  })
}
