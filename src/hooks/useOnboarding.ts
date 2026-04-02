import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuthContext } from '../app/AuthContext'

// ─── Types ───────────────────────────────────────────

export interface OnboardingSequence {
  id: string
  student_id: string
  family_id: string | null
  location_id: string | null
  enrollment_date: string
  status: 'active' | 'completed' | 'churned' | 'paused'
  risk_flag: boolean
  risk_reason: string | null
  // Touchpoints
  day_7_due: string | null
  day_7_completed_at: string | null
  day_14_due: string | null
  day_14_completed_at: string | null
  day_30_due: string | null
  day_30_completed_at: string | null
  day_60_due: string | null
  day_60_completed_at: string | null
  day_90_due: string | null
  day_90_completed_at: string | null
  // Enriched
  student_name: string
  instrument: string | null
  location_name: string | null
  teacher_name: string | null
  days_enrolled: number
  current_touchpoint: string | null
  next_due: string | null
  is_overdue: boolean
  last_session_date: string | null
}

type Touchpoint = 'day_7' | 'day_14' | 'day_30' | 'day_60' | 'day_90'

const TOUCHPOINTS: { key: Touchpoint; day: number; label: string }[] = [
  { key: 'day_7', day: 7, label: 'Day 7' },
  { key: 'day_14', day: 14, label: 'Day 14' },
  { key: 'day_30', day: 30, label: 'Day 30' },
  { key: 'day_60', day: 60, label: 'Day 60' },
  { key: 'day_90', day: 90, label: 'Day 90' },
]

export { TOUCHPOINTS }

// ─── Query active onboarding sequences ───────────────

export function useOnboardingPipeline() {
  const { tenantId } = useAuthContext()

  return useQuery<OnboardingSequence[]>({
    queryKey: ['onboarding-pipeline', tenantId],
    enabled: !!tenantId,
    staleTime: 60_000,
    queryFn: async () => {
      const { data: sequences, error } = await supabase
        .from('onboarding_sequences')
        .select('*')
        .eq('tenant_id', tenantId!)
        .eq('status', 'active')
        .order('enrollment_date', { ascending: false })

      if (error) throw error
      if (!sequences || sequences.length === 0) return []

      // Enrich with student/teacher/location names
      const studentIds = sequences.map(s => s.student_id)
      const { data: students } = await supabase
        .from('students')
        .select('id, first_name, last_name, instrument, teacher_id, location_id')
        .in('id', studentIds)

      const studentMap = new Map((students ?? []).map((s: any) => [s.id, s]))

      // Teacher names
      const teacherIds = [...new Set((students ?? []).map((s: any) => s.teacher_id).filter(Boolean))]
      const teacherMap = new Map<string, string>()
      if (teacherIds.length > 0) {
        const { data: teachers } = await supabase.from('teachers').select('id, first_name, last_name').in('id', teacherIds)
        teachers?.forEach((t: any) => teacherMap.set(t.id, `${t.first_name} ${t.last_name}`.trim()))
      }

      // Location names
      const locIds = [...new Set(sequences.map(s => s.location_id).filter(Boolean))]
      const locMap = new Map<string, string>()
      if (locIds.length > 0) {
        const { data: locs } = await supabase.from('locations').select('id, name').in('id', locIds)
        locs?.forEach((l: any) => locMap.set(l.id, l.name?.replace(' Music Lessons', '') ?? ''))
      }

      // Last session dates
      const { data: logs } = await supabase
        .from('session_log')
        .select('student_id, block_date')
        .in('student_id', studentIds)
        .order('block_date', { ascending: false })
      const lastSessionMap = new Map<string, string>()
      logs?.forEach((l: any) => { if (!lastSessionMap.has(l.student_id)) lastSessionMap.set(l.student_id, l.block_date) })

      const today = new Date().toISOString().split('T')[0]
      const nowMs = Date.now()

      return sequences.map((seq: any): OnboardingSequence => {
        const student = studentMap.get(seq.student_id)
        const daysEnrolled = Math.floor((nowMs - new Date(seq.enrollment_date).getTime()) / 86400000)

        // Find current touchpoint (first incomplete one)
        let currentTouchpoint: string | null = null
        let nextDue: string | null = null
        let isOverdue = false

        for (const tp of TOUCHPOINTS) {
          const dueKey = `${tp.key}_due` as keyof typeof seq
          const completedKey = `${tp.key}_completed_at` as keyof typeof seq
          if (!seq[completedKey]) {
            currentTouchpoint = tp.label
            nextDue = seq[dueKey] as string
            if (nextDue && today > nextDue) {
              // Check if overdue by 3+ days
              const dueDate = new Date(nextDue + 'T00:00:00')
              const daysPast = Math.floor((nowMs - dueDate.getTime()) / 86400000)
              if (daysPast >= 3) isOverdue = true
            }
            break
          }
        }

        // If all 5 are done, mark current as null
        const allDone = TOUCHPOINTS.every(tp => seq[`${tp.key}_completed_at`])
        if (allDone) currentTouchpoint = 'Complete'

        return {
          id: seq.id,
          student_id: seq.student_id,
          family_id: seq.family_id,
          location_id: seq.location_id,
          enrollment_date: seq.enrollment_date,
          status: seq.status,
          risk_flag: seq.risk_flag,
          risk_reason: seq.risk_reason,
          day_7_due: seq.day_7_due,
          day_7_completed_at: seq.day_7_completed_at,
          day_14_due: seq.day_14_due,
          day_14_completed_at: seq.day_14_completed_at,
          day_30_due: seq.day_30_due,
          day_30_completed_at: seq.day_30_completed_at,
          day_60_due: seq.day_60_due,
          day_60_completed_at: seq.day_60_completed_at,
          day_90_due: seq.day_90_due,
          day_90_completed_at: seq.day_90_completed_at,
          student_name: student ? `${student.first_name} ${student.last_name}`.trim() : 'Unknown',
          instrument: student?.instrument ?? null,
          location_name: locMap.get(seq.location_id ?? '') ?? null,
          teacher_name: student?.teacher_id ? teacherMap.get(student.teacher_id) ?? null : null,
          days_enrolled: daysEnrolled,
          current_touchpoint: currentTouchpoint,
          next_due: nextDue,
          is_overdue: isOverdue,
          last_session_date: lastSessionMap.get(seq.student_id) ?? null,
        }
      })
    },
  })
}

// ─── Create onboarding sequence for a student ────────

export function useCreateOnboarding() {
  const { tenantId } = useAuthContext()
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (params: { studentId: string; familyId?: string; locationId?: string; enrollmentDate?: string }) => {
      if (!tenantId) throw new Error('No tenant context')

      const enrollDate = params.enrollmentDate || new Date().toISOString().split('T')[0]
      const base = new Date(enrollDate + 'T12:00:00')

      const addDays = (d: Date, n: number) => {
        const r = new Date(d)
        r.setDate(r.getDate() + n)
        return r.toISOString().split('T')[0]
      }

      const { error } = await supabase.from('onboarding_sequences').insert({
        tenant_id: tenantId,
        student_id: params.studentId,
        family_id: params.familyId ?? null,
        location_id: params.locationId ?? null,
        enrollment_date: enrollDate,
        day_7_due: addDays(base, 7),
        day_14_due: addDays(base, 14),
        day_30_due: addDays(base, 30),
        day_60_due: addDays(base, 60),
        day_90_due: addDays(base, 90),
        status: 'active',
      })

      if (error) {
        // Unique constraint violation = sequence already exists, ignore
        if (error.code === '23505') return
        throw error
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['onboarding-pipeline'] })
    },
  })
}

// ─── Complete a touchpoint ───────────────────────────

export function useCompleteTouchpoint() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async ({ sequenceId, touchpoint, type }: { sequenceId: string; touchpoint: Touchpoint; type: 'auto' | 'manual' }) => {
      const update: Record<string, any> = {
        [`${touchpoint}_completed_at`]: new Date().toISOString(),
        [`${touchpoint}_type`]: type,
      }

      const { error } = await supabase
        .from('onboarding_sequences')
        .update(update)
        .eq('id', sequenceId)

      if (error) throw error

      // Check if all touchpoints are now complete
      const { data: seq } = await supabase
        .from('onboarding_sequences')
        .select('day_7_completed_at, day_14_completed_at, day_30_completed_at, day_60_completed_at, day_90_completed_at')
        .eq('id', sequenceId)
        .single()

      if (seq && seq.day_7_completed_at && seq.day_14_completed_at && seq.day_30_completed_at && seq.day_60_completed_at && seq.day_90_completed_at) {
        await supabase.from('onboarding_sequences').update({ status: 'completed' }).eq('id', sequenceId)
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['onboarding-pipeline'] })
    },
  })
}

// ─── Update risk flag ────────────────────────────────

export function useUpdateOnboardingRisk() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async ({ sequenceId, riskFlag, riskReason }: { sequenceId: string; riskFlag: boolean; riskReason: string | null }) => {
      const { error } = await supabase
        .from('onboarding_sequences')
        .update({ risk_flag: riskFlag, risk_reason: riskReason })
        .eq('id', sequenceId)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['onboarding-pipeline'] })
    },
  })
}
