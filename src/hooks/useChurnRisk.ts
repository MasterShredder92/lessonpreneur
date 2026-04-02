import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { batchIn } from '../lib/batchQuery'
import { useAuthContext } from '../app/AuthContext'

// ─── Types ───────────────────────────────────────────

export interface ChurnRiskScore {
  studentId: string
  studentName: string
  instrument: string | null
  locationName: string | null
  teacherName: string | null
  score: number
  tier: 'low' | 'moderate' | 'high' | 'critical'
  signals: RiskSignal[]
  enrollmentDate: string | null
  daysEnrolled: number
  lastSessionDate: string | null
  daysSinceSession: number | null
}

export interface RiskSignal {
  label: string
  points: number
  detail: string
}

export const RISK_TIERS = {
  low:      { label: 'Low', color: '#22C55E', bg: 'rgba(34,197,94,0.1)', min: 0, max: 20 },
  moderate: { label: 'Moderate', color: '#FFB800', bg: 'rgba(255,184,0,0.1)', min: 21, max: 40 },
  high:     { label: 'High', color: '#fb923c', bg: 'rgba(251,146,60,0.1)', min: 41, max: 60 },
  critical: { label: 'Critical', color: '#EF4444', bg: 'rgba(239,68,68,0.1)', min: 61, max: 999 },
}

function getTier(score: number): 'low' | 'moderate' | 'high' | 'critical' {
  if (score >= 61) return 'critical'
  if (score >= 41) return 'high'
  if (score >= 21) return 'moderate'
  return 'low'
}

// ─── Calculate risk for all active students ──────────

export function useChurnRiskScores() {
  const { tenantId } = useAuthContext()

  return useQuery<ChurnRiskScore[]>({
    queryKey: ['churn-risk', tenantId],
    enabled: !!tenantId,
    staleTime: 2 * 60_000,
    queryFn: async () => {
      const now = Date.now()
      const today = new Date().toISOString().split('T')[0]

      // 1. Get all active students
      const { data: students } = await supabase
        .from('students')
        .select('id, first_name, last_name, instrument, location_id, teacher_id, family_id, created_at, start_date')
        .eq('status', 'active')

      if (!students || students.length === 0) return []

      const studentIds = students.map(s => s.id)
      const familyIds = [...new Set(students.map(s => s.family_id).filter(Boolean))]

      // 2. Get last session date per student (batched to avoid URL length limits)
      const sessionLogs = await batchIn('session_log', 'student_id, block_date', 'student_id', studentIds)

      const lastSessionMap = new Map<string, string>()
      sessionLogs?.forEach((l: any) => {
        if (!lastSessionMap.has(l.student_id)) lastSessionMap.set(l.student_id, l.block_date)
      })

      // 3. Get missed sessions (booked blocks not checked in, in the past) — batched
      const thirtyDaysAgo = new Date(now - 30 * 86400000).toISOString().split('T')[0]
      const missedBlocks = await batchIn('schedule_blocks', 'student_id', 'student_id', studentIds, (q: any) =>
        q.eq('status', 'booked').eq('checked_in', false).lt('block_date', today).gte('block_date', thirtyDaysAgo)
      )

      const missedCountMap = new Map<string, number>()
      missedBlocks?.forEach((b: any) => {
        missedCountMap.set(b.student_id, (missedCountMap.get(b.student_id) ?? 0) + 1)
      })

      // 4. Get last communication per student — batched
      const comms = await batchIn('communications', 'student_id, created_at', 'student_id', studentIds)

      const lastCommMap = new Map<string, string>()
      comms?.forEach((c: any) => {
        if (!lastCommMap.has(c.student_id)) lastCommMap.set(c.student_id, c.created_at)
      })

      // 5. Get overdue families (from square_invoices)
      const overdueFamilyIds = new Set<string>()
      if (familyIds.length > 0) {
        const { data: overdueInv } = await supabase
          .from('square_invoices')
          .select('family_id, due_date, amount_paid')
          .in('family_id', familyIds)
          .eq('amount_paid', 0)

        const sevenDaysAgo = new Date(now - 7 * 86400000).toISOString().split('T')[0]
        overdueInv?.forEach((inv: any) => {
          if (inv.due_date && inv.due_date < sevenDaysAgo && inv.family_id) {
            overdueFamilyIds.add(inv.family_id)
          }
        })
      }

      // 6. Enrich with names
      const teacherIds = [...new Set(students.map(s => s.teacher_id).filter(Boolean))]
      const teacherMap = new Map<string, string>()
      if (teacherIds.length > 0) {
        const { data: teachers } = await supabase.from('teachers').select('id, first_name, last_name').in('id', teacherIds)
        teachers?.forEach((t: any) => teacherMap.set(t.id, `${t.first_name} ${t.last_name}`.trim()))
      }

      const locIds = [...new Set(students.map(s => s.location_id).filter(Boolean))]
      const locMap = new Map<string, string>()
      if (locIds.length > 0) {
        const { data: locs } = await supabase.from('locations').select('id, name').in('id', locIds)
        locs?.forEach((l: any) => locMap.set(l.id, l.name?.replace(' Music Lessons', '') ?? ''))
      }

      // 7. Score each student
      return students.map((s: any): ChurnRiskScore => {
        const signals: RiskSignal[] = []
        let score = 0

        const lastSession = lastSessionMap.get(s.id)
        const daysSinceSession = lastSession
          ? Math.floor((now - new Date(lastSession + 'T00:00:00').getTime()) / 86400000)
          : null

        const enrollDate = s.start_date || s.created_at?.split('T')[0]
        const daysEnrolled = enrollDate
          ? Math.floor((now - new Date(enrollDate + 'T00:00:00').getTime()) / 86400000)
          : 0

        // Signal: No session in 21+ days
        if (daysSinceSession !== null && daysSinceSession >= 21) {
          signals.push({ label: 'No session in 21+ days', points: 50, detail: `Last session ${daysSinceSession} days ago` })
          score += 50
        } else if (daysSinceSession !== null && daysSinceSession >= 14) {
          signals.push({ label: 'No session in 14+ days', points: 30, detail: `Last session ${daysSinceSession} days ago` })
          score += 30
        } else if (daysSinceSession === null && daysEnrolled > 7) {
          signals.push({ label: 'No sessions logged', points: 30, detail: 'No session data found' })
          score += 30
        }

        // Signal: Missed 2+ sessions
        const missed = missedCountMap.get(s.id) ?? 0
        if (missed >= 2) {
          signals.push({ label: 'Missed sessions', points: 20, detail: `${missed} unchecked sessions in 30 days` })
          score += 20
        }

        // Signal: Overdue payment
        if (s.family_id && overdueFamilyIds.has(s.family_id)) {
          signals.push({ label: 'Overdue payment', points: 25, detail: 'Family has unpaid invoice 7+ days past due' })
          score += 25
        }

        // Signal: In first 90 days
        if (daysEnrolled <= 90 && daysEnrolled > 0) {
          signals.push({ label: 'New student (first 90 days)', points: 10, detail: `Day ${daysEnrolled} of enrollment` })
          score += 10
        }

        // Signal: No parent communication in 30+ days
        const lastComm = lastCommMap.get(s.id)
        if (lastComm) {
          const daysSinceComm = Math.floor((now - new Date(lastComm).getTime()) / 86400000)
          if (daysSinceComm >= 30) {
            signals.push({ label: 'No parent communication in 30+ days', points: 15, detail: `Last update ${daysSinceComm} days ago` })
            score += 15
          }
        } else if (daysEnrolled > 14) {
          signals.push({ label: 'No parent communication sent', points: 15, detail: 'No progress updates found' })
          score += 15
        }

        return {
          studentId: s.id,
          studentName: `${s.first_name} ${s.last_name}`.trim(),
          instrument: s.instrument,
          locationName: locMap.get(s.location_id) ?? null,
          teacherName: s.teacher_id ? teacherMap.get(s.teacher_id) ?? null : null,
          score,
          tier: getTier(score),
          signals,
          enrollmentDate: enrollDate,
          daysEnrolled,
          lastSessionDate: lastSession ?? null,
          daysSinceSession,
        }
      })
      .filter(s => s.score > 0)
      .sort((a, b) => b.score - a.score)
    },
  })
}

// ─── Single student risk (for detail pages) ──────────

export function useStudentChurnRisk(studentId: string | undefined) {
  const { data: allScores } = useChurnRiskScores()

  if (!studentId || !allScores) return null
  return allScores.find(s => s.studentId === studentId) ?? null
}
