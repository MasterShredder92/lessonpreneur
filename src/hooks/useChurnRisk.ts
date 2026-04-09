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

/** Shared scoring for one or many active student rows (same fields as roster query). */
async function computeChurnScoresForStudents(
  tenantId: string,
  students: Array<{
    id: string
    first_name: string
    last_name: string
    instrument: string | null
    location_id: string | null
    teacher_id: string | null
    family_id: string | null
    created_at?: string | null
    start_date?: string | null
  }>,
): Promise<ChurnRiskScore[]> {
  if (students.length === 0) return []

  const now = Date.now()
  const today = new Date().toISOString().split('T')[0]
  const studentIds = students.map(s => s.id)
  const familyIds = [...new Set(students.map(s => s.family_id).filter(Boolean))] as string[]

  const sessionLogs = await batchIn('session_log', 'student_id, block_date', 'student_id', studentIds, undefined, 80, tenantId)

  const lastSessionMap = new Map<string, string>()
  sessionLogs?.forEach((l: any) => {
    if (!lastSessionMap.has(l.student_id)) lastSessionMap.set(l.student_id, l.block_date)
  })

  const thirtyDaysAgo = new Date(now - 30 * 86400000).toISOString().split('T')[0]
  const missedBlocks = await batchIn('schedule_blocks', 'student_id', 'student_id', studentIds, (q: any) =>
    q.eq('status', 'booked').neq('block_type', 'call_out').eq('checked_in', false).lt('block_date', today).gte('block_date', thirtyDaysAgo),
  80, tenantId)

  const missedCountMap = new Map<string, number>()
  missedBlocks?.forEach((b: any) => {
    missedCountMap.set(b.student_id, (missedCountMap.get(b.student_id) ?? 0) + 1)
  })

  const comms = await batchIn('communications', 'student_id, created_at', 'student_id', studentIds, undefined, 80, tenantId)

  const lastCommMap = new Map<string, string>()
  comms?.forEach((c: any) => {
    if (!lastCommMap.has(c.student_id)) lastCommMap.set(c.student_id, c.created_at)
  })

  const overdueFamilyIds = new Set<string>()
  if (familyIds.length > 0) {
    const { data: overdueInv } = await supabase
      .from('square_invoices')
      .select('family_id, due_date, amount_paid')
      .eq('tenant_id', tenantId)
      .in('family_id', familyIds)
      .eq('amount_paid', 0)

    const sevenDaysAgo = new Date(now - 7 * 86400000).toISOString().split('T')[0]
    overdueInv?.forEach((inv: any) => {
      if (inv.due_date && inv.due_date < sevenDaysAgo && inv.family_id) {
        overdueFamilyIds.add(inv.family_id)
      }
    })
  }

  const teacherIds = [...new Set(students.map(s => s.teacher_id).filter(Boolean))] as string[]
  const teacherMap = new Map<string, string>()
  if (teacherIds.length > 0) {
    const { data: teachers } = await supabase.from('teachers').select('id, first_name, last_name').eq('tenant_id', tenantId).in('id', teacherIds)
    teachers?.forEach((t: any) => teacherMap.set(t.id, `${t.first_name} ${t.last_name}`.trim()))
  }

  const locIds = [...new Set(students.map(s => s.location_id).filter(Boolean))] as string[]
  const locMap = new Map<string, string>()
  if (locIds.length > 0) {
    const { data: locs } = await supabase.from('locations').select('id, name').eq('tenant_id', tenantId).in('id', locIds)
    locs?.forEach((l: any) => locMap.set(l.id, l.name?.replace(' Music Lessons', '') ?? ''))
  }

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

    const missed = missedCountMap.get(s.id) ?? 0
    if (missed >= 2) {
      signals.push({ label: 'Missed sessions', points: 20, detail: `${missed} unchecked sessions in 30 days` })
      score += 20
    }

    if (s.family_id && overdueFamilyIds.has(s.family_id)) {
      signals.push({ label: 'Overdue payment', points: 25, detail: 'Family has unpaid invoice 7+ days past due' })
      score += 25
    }

    if (daysEnrolled <= 90 && daysEnrolled > 0) {
      signals.push({ label: 'New student (first 90 days)', points: 10, detail: `Day ${daysEnrolled} of enrollment` })
      score += 10
    }

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
}

// ─── Calculate risk for all active students ──────────

export function useChurnRiskScores() {
  const { tenantId } = useAuthContext()

  return useQuery<ChurnRiskScore[]>({
    queryKey: ['churn-risk', tenantId],
    enabled: !!tenantId,
    staleTime: 2 * 60_000,
    queryFn: async () => {
      const { data: students } = await supabase
        .from('students')
        .select('id, first_name, last_name, instrument, location_id, teacher_id, family_id, created_at, start_date')
        .eq('tenant_id', tenantId!)
        .eq('status', 'active')

      if (!students || students.length === 0) return []

      const scored = await computeChurnScoresForStudents(tenantId!, students as any[])
      return scored
        .filter(s => s.score > 0)
        .sort((a, b) => b.score - a.score)
    },
  })
}

// ─── Single student risk (detail pages — does not load full roster) ──────────

export function useStudentChurnRisk(studentId: string | undefined) {
  const { tenantId } = useAuthContext()

  const { data } = useQuery<ChurnRiskScore | null>({
    queryKey: ['churn-risk-student', tenantId, studentId],
    enabled: !!tenantId && !!studentId,
    staleTime: 2 * 60_000,
    queryFn: async () => {
      const { data: s, error } = await supabase
        .from('students')
        .select('id, first_name, last_name, instrument, location_id, teacher_id, family_id, created_at, start_date, status')
        .eq('tenant_id', tenantId!)
        .eq('id', studentId!)
        .single()

      if (error || !s || s.status !== 'active') return null

      const [row] = await computeChurnScoresForStudents(tenantId!, [s as any])
      if (!row || row.score <= 0) return null
      return row
    },
  })

  return data ?? null
}
