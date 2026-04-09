import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuthContext } from '../app/AuthContext'
import { qk } from '../lib/queryKeys'

/**
 * Family Call-Out System
 *
 * Rules locked by product doctrine:
 * - 60-minute hard cutoff (can't call out within 60 min of start)
 * - Studio closure days block call-outs entirely
 * - No rescheduling — ever
 * - If no fifth week available this year → text studio
 * - Parents "call out" (never "cancel")
 */

export interface StudioClosure {
  id: string
  closure_date: string
  label: string
  emoji: string | null
  location_id: string | null
}

/** All closures for the tenant (location-specific or tenant-wide) across the upcoming window. */
export function useStudioClosures(tenantId: string | null, locationIds: string[]) {
  return useQuery<StudioClosure[]>({
    queryKey: [...qk.locations.closures, tenantId, locationIds.sort().join(',')],
    enabled: !!tenantId && locationIds.length > 0,
    queryFn: async () => {
      const today = new Date().toISOString().split('T')[0]
      const end = new Date()
      end.setDate(end.getDate() + 90)
      const endStr = end.toISOString().split('T')[0]

      const { data } = await supabase
        .from('studio_closures')
        .select('id, closure_date, label, emoji, location_id')
        .eq('tenant_id', tenantId!)
        .gte('closure_date', today)
        .lte('closure_date', endStr)
        .or(`location_id.is.null,location_id.in.(${locationIds.join(',')})`)

      return (data ?? []) as StudioClosure[]
    },
  })
}

/**
 * Returns next fifth-week date for a student (RPC wrapper).
 * Returns null if none available this year.
 */
export async function fetchNextFifthWeek(
  dayOfWeek: number,
  fromDate: string,
  tenantId: string,
  locationId: string
): Promise<string | null> {
  const { data, error } = await supabase.rpc('next_fifth_week_date', {
    p_day_of_week: dayOfWeek,
    p_from_date: fromDate,
    p_tenant_id: tenantId,
    p_location_id: locationId,
  })
  if (error) throw error
  return (data as string | null) ?? null
}

/** Is this date itself a fifth week? (RPC wrapper) */
export async function fetchIsFifthWeek(date: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('is_fifth_week', { p_date: date })
  if (error) throw error
  return Boolean(data)
}

export interface SessionInDay {
  block_id: string
  student_id: string
  student_first_name: string
  block_date: string
  start_time: string
  end_time: string
  teacher_id: string | null
  teacher_first_name: string
  teacher_profile_id: string | null
  instrument: string | null
  lesson_day_of_week: number | null
  location_id: string
}

/** Fetches all sessions for a family on a specific date (one row per schedule_block). */
export function useSessionsOnDate(
  familyStudentIds: string[],
  date: string | null,
  enabled: boolean
) {
  return useQuery<SessionInDay[]>({
    queryKey: qk.schedule.sessionsOnDate(date, familyStudentIds.sort().join(',')),
    enabled: enabled && !!date && familyStudentIds.length > 0,
    queryFn: async () => {
      const { data: blocks } = await supabase
        .from('schedule_blocks')
        .select('id, student_id, block_date, start_time, end_time, teacher_id, location_id, block_type, is_family_callout')
        .in('student_id', familyStudentIds)
        .eq('block_date', date!)
        .in('block_type', ['student_session', 'first_day'])

      if (!blocks || blocks.length === 0) return []
      // Exclude already-called-out blocks
      const active = blocks.filter((b: any) => !b.is_family_callout)
      if (active.length === 0) return []

      const studentIds = [...new Set(active.map((b: any) => b.student_id))]
      const teacherIds = [...new Set(active.map((b: any) => b.teacher_id).filter(Boolean))]

      const [{ data: students }, { data: teachers }] = await Promise.all([
        supabase.from('students').select('id, first_name, instrument, lesson_day_of_week').in('id', studentIds),
        teacherIds.length > 0
          ? supabase.from('teachers').select('id, first_name, profile_id').in('id', teacherIds)
          : Promise.resolve({ data: [] as any[] }),
      ])

      const sMap = new Map((students ?? []).map((s: any) => [s.id, s]))
      const tMap = new Map((teachers ?? []).map((t: any) => [t.id, t]))

      return active.map((b: any): SessionInDay => {
        const s = sMap.get(b.student_id)
        const t = b.teacher_id ? tMap.get(b.teacher_id) : null
        return {
          block_id: b.id,
          student_id: b.student_id,
          student_first_name: s?.first_name ?? '',
          block_date: b.block_date,
          start_time: b.start_time,
          end_time: b.end_time,
          teacher_id: b.teacher_id,
          teacher_first_name: t?.first_name ?? '',
          teacher_profile_id: t?.profile_id ?? null,
          instrument: s?.instrument ?? null,
          lesson_day_of_week: s?.lesson_day_of_week ?? null,
          location_id: b.location_id,
        }
      })
    },
  })
}

/** Fetches the most recent session log note for a student (max 2 sentences, trimmed). */
export async function fetchLastSessionNote(studentId: string): Promise<string | null> {
  const { data } = await supabase
    .from('session_log')
    .select('teacher_note, lesson_notes, created_at')
    .eq('student_id', studentId)
    .order('created_at', { ascending: false })
    .limit(1)
    .single()
  if (!data) return null
  const raw = (data.teacher_note ?? data.lesson_notes ?? '').toString().trim()
  if (!raw) return null
  // Trim to first 2 sentences.
  const sentences = raw.match(/[^.!?]+[.!?]?/g) ?? [raw]
  return sentences.slice(0, 2).join(' ').trim()
}

export interface ConfirmCalloutInput {
  student_id: string
  student_first_name: string
  family_id: string
  location_id: string
  lesson_day_of_week: number
  callout_date: string
  /** Primary block being called out (clicked by user). */
  primary_block_id: string
  /** All blocks to flip if scope='all_today' (includes primary). If scope='this_session', just [primary_block_id]. */
  block_ids_to_flip: string[]
  scope: 'this_session' | 'all_today'
  makeup_date: string | null // null means call-out date was itself a fifth week
  previous_session_note: string | null
  teacher_profile_id: string | null
  teacher_first_name: string
  family_name: string
}

/**
 * Confirms a family call-out.
 * - Creates student_callout + makeup_session (if fifth week available)
 * - Flips schedule_blocks to call_out / makeup_session
 * - Increments student counters
 * - Creates dashboard_alert + notification + audit_log entries
 */
export function useConfirmCallout() {
  const { profile, tenantId } = useAuthContext()
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (input: ConfirmCalloutInput) => {
      if (!tenantId) throw new Error('No tenant')
      const now = new Date().toISOString()
      const year = new Date(input.callout_date + 'T00:00:00').getFullYear()

      // ─── 1. Create student_callout ──────────────────────────────
      const { data: callout, error: cErr } = await supabase
        .from('student_callouts')
        .insert({
          tenant_id: tenantId,
          student_id: input.student_id,
          family_id: input.family_id,
          location_id: input.location_id,
          schedule_block_id: input.primary_block_id,
          callout_date: input.callout_date,
          callout_scope: input.scope,
          confirmed_by_parent: true,
          confirmed_at: now,
          previous_session_note: input.previous_session_note,
          initiated_by_user_id: profile?.id ?? null,
          is_within_one_hour: false,
          no_fifth_week_available: input.makeup_date === null,
        })
        .select('id')
        .single()
      if (cErr || !callout) throw cErr ?? new Error('Failed to create callout')

      // ─── 2. Create makeup_session if fifth week available ──────
      let makeupId: string | null = null
      let makeupBlockId: string | null = null
      if (input.makeup_date) {
        // Find the block on the makeup date for this student (if it exists)
        const { data: makeupBlock } = await supabase
          .from('schedule_blocks')
          .select('id')
          .eq('student_id', input.student_id)
          .eq('block_date', input.makeup_date)
          .in('block_type', ['open_time', 'student_session'])
          .limit(1)
          .maybeSingle()
        makeupBlockId = makeupBlock?.id ?? null

        const { data: makeup, error: mErr } = await supabase
          .from('makeup_sessions')
          .insert({
            tenant_id: tenantId,
            student_id: input.student_id,
            family_id: input.family_id,
            location_id: input.location_id,
            original_callout_id: callout.id,
            scheduled_date: input.makeup_date,
            day_of_week: input.lesson_day_of_week,
            schedule_block_id: makeupBlockId,
            status: 'banked',
            is_payroll_event: false,
            year,
          })
          .select('id')
          .single()
        if (mErr || !makeup) throw mErr ?? new Error('Failed to create makeup')
        makeupId = makeup.id

        // Link makeup back to callout
        await supabase
          .from('student_callouts')
          .update({ makeup_session_id: makeupId })
          .eq('id', callout.id)

        // Flip the fifth-week block to makeup_session (if we found one)
        if (makeupBlockId) {
          await supabase
            .from('schedule_blocks')
            .update({
              block_type: 'makeup_session',
              is_makeup_session: true,
              makeup_session_id: makeupId,
              teacher_tally: false,
            })
            .eq('id', makeupBlockId)
        }
      }

      // ─── 3. Flip original schedule_blocks to call_out ──────────
      const { error: flipErr } = await supabase
        .from('schedule_blocks')
        .update({
          block_type: 'call_out',
          is_family_callout: true,
          callout_id: callout.id,
          teacher_tally: false,
        })
        .in('id', input.block_ids_to_flip)
      if (flipErr) throw flipErr

      // ─── 4. Increment student counters ─────────────────────────
      const { data: studentRow } = await supabase
        .from('students')
        .select('fifth_weeks_used, total_callouts')
        .eq('id', input.student_id)
        .single()
      const currentFifth = (studentRow?.fifth_weeks_used ?? 0) as number
      const currentTotal = (studentRow?.total_callouts ?? 0) as number
      await supabase
        .from('students')
        .update({
          fifth_weeks_used: input.makeup_date ? currentFifth + 1 : currentFifth,
          total_callouts: currentTotal + 1,
        })
        .eq('id', input.student_id)

      // ─── 5. Dashboard alert ────────────────────────────────────
      const calloutDateLabel = new Date(input.callout_date + 'T12:00:00').toLocaleDateString('en-US', {
        weekday: 'short', month: 'short', day: 'numeric',
      })
      await supabase.from('dashboard_alerts').insert({
        tenant_id: tenantId,
        location_id: input.location_id,
        alert_type: 'family_callout',
        priority: 'high',
        title: `${input.student_first_name} called out — ${calloutDateLabel}`,
        body: `${input.family_name} called out ${input.student_first_name}'s session. ${
          input.makeup_date
            ? `Makeup banked for ${new Date(input.makeup_date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}.`
            : 'No fifth week available.'
        }`,
        emoji: '📞',
        target_role: 'studio_director',
        related_entity_type: 'student_callout',
        related_entity_id: callout.id,
        related_entity_name: input.student_first_name,
        alert_date: input.callout_date,
      })

      // ─── 6. Notification for teacher ──────────────────────────
      if (input.teacher_profile_id) {
        await supabase.from('notifications').insert({
          tenant_id: tenantId,
          profile_id: input.teacher_profile_id,
          type: 'family_callout',
          title: `Family Call-Out — ${input.student_first_name}`,
          body: `${input.family_name} called out ${input.student_first_name}'s session on ${calloutDateLabel}. Family-initiated.`,
          reference_id: callout.id,
          reference_type: 'student_callout',
        })
      }

      // ─── 7. Audit log ─────────────────────────────────────────
      await supabase.from('audit_log').insert({
        tenant_id: tenantId,
        performed_by: profile?.id ?? null,
        user_name: input.family_name,
        user_role: 'parent',
        action: 'FAMILY_CALLOUT_CONFIRMED',
        table_name: 'student_callouts',
        record_id: callout.id,
        entity_name: input.student_first_name,
        location_id: input.location_id,
        new_value: {
          callout_date: input.callout_date,
          makeup_date: input.makeup_date,
          student_id: input.student_id,
          scope: input.scope,
        },
      })

      return { calloutId: callout.id, makeupId }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.parent.sessions })
      qc.invalidateQueries({ queryKey: ['sessions-on-date'] })
    },
  })
}

/**
 * Logs a blocked (within-1-hour) call-out attempt. Still logged for audit.
 */
export function useLogBlockedCallout() {
  const { profile, tenantId } = useAuthContext()

  return useMutation({
    mutationFn: async (input: {
      student_id: string
      family_id: string
      location_id: string
      callout_date: string
      schedule_block_id: string
    }) => {
      if (!tenantId) throw new Error('No tenant')
      await supabase.from('student_callouts').insert({
        tenant_id: tenantId,
        student_id: input.student_id,
        family_id: input.family_id,
        location_id: input.location_id,
        schedule_block_id: input.schedule_block_id,
        callout_date: input.callout_date,
        callout_scope: 'this_session',
        confirmed_by_parent: false,
        initiated_by_user_id: profile?.id ?? null,
        is_within_one_hour: true,
        no_fifth_week_available: false,
      })
    },
  })
}
