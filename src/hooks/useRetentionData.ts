import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuthContext } from '../app/AuthContext'
import { supabase } from '../lib/supabase'

const TENANT_ID = '00000000-0000-0000-0000-000000000001'

// ── VALUE CARD QUEUE ──
// Students who haven't received a value card in 30+ days
export function useValueCardQueue(locationIds?: string[] | null) {
  return useQuery({
    queryKey: ['value-card-queue', locationIds ?? 'all'],
    queryFn: async () => {
      const thirtyDaysAgo = new Date()
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
      const cutoff = thirtyDaysAgo.toISOString()

      // Get active students
      let studentQuery = supabase
        .from('students')
        .select('id, first_name, last_name, instrument, location_id, family_id, created_at')
        .eq('status', 'active')
      if (locationIds) studentQuery = studentQuery.in('location_id', locationIds)
      const { data: students } = await studentQuery

      if (!students || students.length === 0) return []

      // Get most recent value card per student
      const { data: recentCards } = await supabase
        .from('value_cards')
        .select('student_id, created_at')
        .in('student_id', students.map(s => s.id))
        .order('created_at', { ascending: false })

      const lastCardMap = new Map<string, string>()
      recentCards?.forEach((c: any) => {
        if (!lastCardMap.has(c.student_id)) lastCardMap.set(c.student_id, c.created_at)
      })

      // Get location names
      const { data: locations } = await supabase.from('locations').select('id, name')
      const locMap = new Map(locations?.map((l: any) => [l.id, l.name?.replace(' Music Lessons', '')]) ?? [])

      return students
        .filter(s => {
          const lastCard = lastCardMap.get(s.id)
          return !lastCard || lastCard < cutoff
        })
        .map(s => ({
          id: s.id,
          name: `${s.first_name} ${s.last_name}`.trim(),
          instrument: s.instrument,
          locationId: s.location_id,
          locationName: locMap.get(s.location_id) ?? 'Unknown',
          familyId: s.family_id,
          createdAt: s.created_at,
          lastCardDate: lastCardMap.get(s.id) ?? null,
        }))
        .sort((a, b) => {
          // Never sent first, then oldest sent
          if (!a.lastCardDate && b.lastCardDate) return -1
          if (a.lastCardDate && !b.lastCardDate) return 1
          return 0
        })
    },
    staleTime: 1000 * 60 * 2,
  })
}

// ── GENERATE VALUE CARD ──
export function useGenerateValueCard() {
  const { user } = useAuthContext()
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (studentId: string) => {
      const now = new Date()
      const periodEnd = now.toISOString().split('T')[0]
      const periodStart = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate()).toISOString().split('T')[0]

      // Get student info (including teacher_id for direct lookup)
      const { data: student } = await supabase
        .from('students')
        .select('id, first_name, last_name, instrument, location_id, family_id, teacher_id, created_at')
        .eq('id', studentId)
        .single()
      if (!student) throw new Error('Student not found')

      // FIX 1: Get attendance data — filter by block_type='student_session' only
      const sixtyDaysAgo = new Date(now)
      sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60)
      const { data: blocks } = await supabase
        .from('schedule_blocks')
        .select('id, checked_in, block_type')
        .eq('student_id', studentId)
        .eq('status', 'booked')
        .eq('block_type', 'student_session')
        .gte('block_date', sixtyDaysAgo.toISOString().split('T')[0])
        .lte('block_date', periodEnd)

      const totalSessions = blocks?.length ?? 0
      const attended = blocks?.filter((b: any) => b.checked_in)?.length ?? 0
      // FIX 2: No fake 95% default — use real rate or null
      const attendanceRate = totalSessions > 0 ? Math.round((attended / totalSessions) * 100) : null

      // Get session logs for teacher highlights (from session_log table)
      const { data: logs } = await supabase
        .from('session_log')
        .select('teacher_note, worked_on, progress_indicator, instrument')
        .eq('student_id', studentId)
        .order('created_at', { ascending: false })
        .limit(10)

      // Also pull from teacher_session_notes (newer system)
      const { data: tsNotes } = await supabase
        .from('teacher_session_notes')
        .select('raw_note, ai_enhanced_note, topics_covered, skills_progressing, mood')
        .eq('student_id', studentId)
        .order('created_at', { ascending: false })
        .limit(10)

      const workedOn = [...new Set([
        ...(logs ?? []).flatMap((l: any) => l.worked_on ?? []),
        ...(tsNotes ?? []).flatMap((n: any) => n.topics_covered ?? []),
      ])]
      const skillsProgressing = [...new Set((tsNotes ?? []).flatMap((n: any) => n.skills_progressing ?? []))]
      const teacherNotes = [
        ...(logs ?? []).filter((l: any) => l.teacher_note).map((l: any) => l.teacher_note),
        ...(tsNotes ?? []).filter((n: any) => n.ai_enhanced_note || n.raw_note).map((n: any) => n.ai_enhanced_note || n.raw_note),
      ]

      // FIX 3: Get teacher name from students.teacher_id → teachers table (has first_name directly)
      let teacherName = 'your teacher'
      if (student.teacher_id) {
        const { data: teacher } = await supabase
          .from('teachers')
          .select('first_name, last_name')
          .eq('profile_id', student.teacher_id)
          .single()
        if (teacher) teacherName = teacher.first_name
      }

      // Get instrument — prefer students.instrument, fallback to session_log instrument
      const instrument = student.instrument
        || (logs ?? []).find((l: any) => l.instrument)?.instrument
        || null

      // Calculate months enrolled
      const monthsEnrolled = Math.max(1, Math.round((now.getTime() - new Date(student.created_at).getTime()) / (30 * 24 * 60 * 60 * 1000)))

      // FIX 4: Real percentile rank — compare this student's attendance to all active students
      let percentileRank: number | null = null
      if (attendanceRate !== null) {
        // Get attendance rates for all active students in the same period
        const { data: allBlocks } = await supabase
          .from('schedule_blocks')
          .select('student_id, checked_in')
          .eq('status', 'booked')
          .eq('block_type', 'student_session')
          .gte('block_date', sixtyDaysAgo.toISOString().split('T')[0])
          .lte('block_date', periodEnd)

        if (allBlocks && allBlocks.length > 0) {
          const studentRates = new Map<string, { total: number; attended: number }>()
          allBlocks.forEach((b: any) => {
            const cur = studentRates.get(b.student_id) ?? { total: 0, attended: 0 }
            cur.total++
            if (b.checked_in) cur.attended++
            studentRates.set(b.student_id, cur)
          })
          const rates = [...studentRates.values()]
            .filter(r => r.total >= 2) // need at least 2 sessions to rank
            .map(r => Math.round((r.attended / r.total) * 100))
          if (rates.length > 1) {
            const belowCount = rates.filter(r => r < attendanceRate).length
            percentileRank = Math.round((belowCount / rates.length) * 100)
          }
        }
      }

      // Lifetime attended sessions
      const { count: lifetimeSessions } = await supabase
        .from('schedule_blocks')
        .select('*', { count: 'exact', head: true })
        .eq('student_id', studentId)
        .eq('status', 'booked')
        .eq('block_type', 'student_session')
        .eq('checked_in', true)

      // FIX 5: Redesigned AI prompt — short, emoji-led, 3-5 lines
      const token = (await supabase.auth.getSession()).data.session?.access_token
      const attendanceStr = attendanceRate !== null ? `${attendanceRate}%` : 'just getting started'
      const periodStr = totalSessions > 0 ? `${attended}/${totalSessions} sessions attended` : 'new this period'
      const rankStr = percentileRank !== null ? `Top ${100 - percentileRank}% of students` : ''
      const skillsStr = [...workedOn, ...skillsProgressing].slice(0, 5).join(', ') || 'building foundations'
      const highlightsStr = teacherNotes.slice(0, 2).join(' | ') || ''

      const aiResponse = await fetch(`https://dhsyxyhtoadrqfrlmsqe.supabase.co/functions/v1/ai-assistant`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({
          question: `Generate a value card progress summary for this student.`,
          tenant_id: TENANT_ID,
          conversation_history: [],
          system_override: `You write SHORT parent-facing progress snapshots for music students. NEVER mention payment or billing.

FORMAT: Exactly 3-5 short lines. Each line starts with an emoji. No paragraphs. No bold. No "top X%" unless rankStr is provided.

DATA:
Student: ${student.first_name}
Instrument: ${instrument || 'Music'}
Teacher: ${teacherName}
Months enrolled: ${monthsEnrolled}
Attendance: ${attendanceStr} (${periodStr})
${rankStr ? `Ranking: ${rankStr}` : ''}
Skills: ${skillsStr}
${highlightsStr ? `Teacher says: ${highlightsStr}` : ''}

EXAMPLE OUTPUT:
🎵 Emma attended 12/13 guitar sessions this month — amazing consistency!
📈 Working on chord transitions, strumming patterns, and reading tabs
⭐ Teacher Sam says: "Really nailing those barre chords now"
🏆 Top 15% attendance among all students
🎯 Keep it up Emma — real momentum building!

Write in this exact style. Be genuine, not generic. Use the real data above. If data is limited, keep it to 3 lines.`,
        }),
      })
      const aiData = await aiResponse.json()

      // Save value card
      const { data: card, error } = await supabase.from('value_cards').insert({
        tenant_id: TENANT_ID,
        student_id: studentId,
        family_id: student.family_id,
        location_id: student.location_id,
        period_start: periodStart,
        period_end: periodEnd,
        attendance_rate: attendanceRate,
        total_sessions_period: totalSessions,
        attended_sessions_period: attended,
        total_sessions_lifetime: lifetimeSessions ?? 0,
        months_enrolled: monthsEnrolled,
        percentile_rank: percentileRank,
        teacher_highlights: teacherNotes.slice(0, 3),
        skills_worked_on: [...workedOn, ...skillsProgressing].slice(0, 10),
        milestones: skillsProgressing.length > 0 ? skillsProgressing.slice(0, 5).map(s => ({ skill: s, status: 'progressing' })) : [],
        ai_summary: aiData?.answer ?? `🎵 ${student.first_name} is building great ${instrument || 'music'} habits with ${teacherName}!\n📈 ${periodStr}\n🎯 Keep showing up — consistency is everything!`,
        instrument,
        teacher_name: teacherName,
      }).select().single()

      if (error) throw error
      return card
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['value-card-queue'] })
    },
  })
}

// ── SEND VALUE CARD ──
export function useSendValueCard() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (cardId: string) => {
      await supabase.from('value_cards').update({ sent_at: new Date().toISOString(), sent_via: 'sms' }).eq('id', cardId)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['value-card-queue'] })
      qc.invalidateQueries({ queryKey: ['retention-metrics'] })
    },
  })
}

// ── GOOGLE REVIEW QUEUE ──
export function useReviewQueue(locationIds?: string[] | null) {
  return useQuery({
    queryKey: ['review-queue', locationIds ?? 'all'],
    queryFn: async () => {
      const threeMonthsAgo = new Date()
      threeMonthsAgo.setDate(threeMonthsAgo.getDate() - 90)

      // Active families with students enrolled 3+ months
      const threeMonthsCutoff = new Date()
      threeMonthsCutoff.setMonth(threeMonthsCutoff.getMonth() - 3)

      let studentsQuery = supabase
        .from('students')
        .select('id, family_id, location_id, created_at')
        .eq('status', 'active')
        .lte('created_at', threeMonthsCutoff.toISOString())
      if (locationIds) studentsQuery = studentsQuery.in('location_id', locationIds)
      const { data: students } = await studentsQuery

      if (!students || students.length === 0) return []

      // Get unique family IDs
      const familyIds = [...new Set(students.map(s => s.family_id).filter(Boolean))]
      if (familyIds.length === 0) return []

      // Get family info
      const { data: families } = await supabase
        .from('families')
        .select('id, name, primary_email')
        .in('id', familyIds)

      // Get recent review requests (last 90 days)
      const { data: recentRequests } = await supabase
        .from('review_requests')
        .select('family_id, sent_at')
        .in('family_id', familyIds)
        .gte('sent_at', threeMonthsAgo.toISOString())

      const requestedFamilyIds = new Set(recentRequests?.map(r => r.family_id) ?? [])

      // Get location names
      const { data: locations } = await supabase.from('locations').select('id, name')
      const locMap = new Map(locations?.map((l: any) => [l.id, l.name?.replace(' Music Lessons', '')]) ?? [])

      // Get all review request dates per family (for "last asked" display)
      const { data: allRequests } = await supabase
        .from('review_requests')
        .select('family_id, sent_at')
        .in('family_id', familyIds)
        .order('sent_at', { ascending: false })

      const lastRequestMap = new Map<string, string>()
      allRequests?.forEach((r: any) => {
        if (!lastRequestMap.has(r.family_id)) lastRequestMap.set(r.family_id, r.sent_at)
      })

      // Build family → location map from oldest student
      const familyLocMap = new Map<string, string>()
      const familyEnrolledMap = new Map<string, string>()
      students.forEach(s => {
        if (!familyLocMap.has(s.family_id)) {
          familyLocMap.set(s.family_id, s.location_id)
          familyEnrolledMap.set(s.family_id, s.created_at)
        }
      })

      return (families ?? [])
        .filter(f => !requestedFamilyIds.has(f.id))
        .map(f => {
          const enrolledDate = familyEnrolledMap.get(f.id) ?? new Date().toISOString()
          const monthsEnrolled = Math.round((Date.now() - new Date(enrolledDate).getTime()) / (30 * 24 * 60 * 60 * 1000))
          return {
            id: f.id,
            name: f.name,
            locationId: familyLocMap.get(f.id) ?? '',
            locationName: locMap.get(familyLocMap.get(f.id) ?? '') ?? 'Unknown',
            monthsEnrolled,
            lastRequestDate: lastRequestMap.get(f.id) ?? null,
          }
        })
        .sort((a, b) => b.monthsEnrolled - a.monthsEnrolled)
    },
    staleTime: 1000 * 60 * 2,
  })
}

// ── SEND REVIEW REQUEST ──
export function useSendReviewRequest() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ familyId, locationId }: { familyId: string; locationId: string }) => {
      const { error } = await supabase.from('review_requests').insert({
        tenant_id: TENANT_ID,
        family_id: familyId,
        location_id: locationId,
        sent_at: new Date().toISOString(),
        trigger_reason: 'manual_retention',
      })
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['review-queue'] })
      qc.invalidateQueries({ queryKey: ['retention-metrics'] })
    },
  })
}

// ── RETENTION METRICS ──
export function useRetentionMetrics(locationIds?: string[] | null) {
  return useQuery({
    queryKey: ['retention-metrics', locationIds ?? 'all'],
    queryFn: async () => {
      const now = new Date()
      const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`

      // Active students
      let studentsQuery = supabase.from('students').select('id, created_at', { count: 'exact', head: false }).eq('status', 'active')
      if (locationIds) studentsQuery = studentsQuery.in('location_id', locationIds)
      const { data: activeStudents, count: activeCount } = await studentsQuery

      // Average months enrolled
      const avgMonths = activeStudents && activeStudents.length > 0
        ? Math.round(activeStudents.reduce((sum, s: any) => sum + Math.round((now.getTime() - new Date(s.created_at).getTime()) / (30 * 24 * 60 * 60 * 1000)), 0) / activeStudents.length)
        : 0

      // Value cards sent this month
      let cardsQuery = supabase.from('value_cards').select('*', { count: 'exact', head: true }).gte('sent_at', monthStart).not('sent_at', 'is', null)
      if (locationIds) cardsQuery = cardsQuery.in('location_id', locationIds)
      const { count: cardsSent } = await cardsQuery

      // Review requests sent this month
      let reviewReqQuery = supabase.from('review_requests').select('*', { count: 'exact', head: true }).gte('sent_at', monthStart)
      if (locationIds) reviewReqQuery = reviewReqQuery.in('location_id', locationIds)
      const { count: reviewsSent } = await reviewReqQuery

      // Reviews received this month (from reviews table)
      const { count: reviewsReceived } = await supabase.from('reviews').select('*', { count: 'exact', head: true }).gte('created_at', monthStart)

      return {
        activeStudents: activeCount ?? 0,
        avgMonthsEnrolled: avgMonths,
        valueCardsSentThisMonth: cardsSent ?? 0,
        reviewRequestsSentThisMonth: reviewsSent ?? 0,
        reviewsReceivedThisMonth: reviewsReceived ?? 0,
      }
    },
    staleTime: 1000 * 60 * 2,
  })
}

// ── AT-RISK STUDENTS ──
export function useAtRiskStudents(locationIds?: string[] | null) {
  return useQuery({
    queryKey: ['at-risk-students', locationIds ?? 'all'],
    queryFn: async () => {
      const now = new Date()
      const fourteenDaysAgo = new Date(now)
      fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14)
      const cutoff = fourteenDaysAgo.toISOString().split('T')[0]

      let studentsQuery = supabase.from('students').select('id, first_name, last_name, instrument, location_id, family_id').eq('status', 'active')
      if (locationIds) studentsQuery = studentsQuery.in('location_id', locationIds)
      const { data: students } = await studentsQuery
      if (!students || students.length === 0) return []

      // Get last session date per student
      const { data: blocks } = await supabase
        .from('schedule_blocks')
        .select('student_id, block_date, checked_in')
        .in('student_id', students.map(s => s.id))
        .eq('status', 'booked')
        .eq('checked_in', true)
        .order('block_date', { ascending: false })

      const lastSessionMap = new Map<string, string>()
      blocks?.forEach((b: any) => {
        if (!lastSessionMap.has(b.student_id)) lastSessionMap.set(b.student_id, b.block_date)
      })

      // Get failed payments
      const { data: failedInvoices } = await supabase
        .from('square_invoices')
        .select('student_id')
        .eq('amount_paid', 0)
        .lt('due_date', now.toISOString().split('T')[0])
      const failedStudentIds = new Set(failedInvoices?.map((i: any) => i.student_id) ?? [])

      // Get location names
      const { data: locations } = await supabase.from('locations').select('id, name')
      const locMap = new Map(locations?.map((l: any) => [l.id, l.name?.replace(' Music Lessons', '')]) ?? [])

      // Get family names
      const familyIds = [...new Set(students.map(s => s.family_id).filter(Boolean))]
      const { data: families } = familyIds.length > 0
        ? await supabase.from('families').select('id, name').in('id', familyIds)
        : { data: [] }
      const familyMap = new Map((families ?? []).map((f: any) => [f.id, f.name]))

      // Get dismissed at-risk (from retention_outreach with outcome = 'dismissed')
      const thirtyDaysAgo = new Date(now)
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
      const { data: dismissed } = await supabase
        .from('retention_outreach')
        .select('student_id')
        .eq('outcome', 'dismissed')
        .gte('outreach_date', thirtyDaysAgo.toISOString())
      const dismissedIds = new Set(dismissed?.map((d: any) => d.student_id) ?? [])

      return students
        .filter(s => {
          if (dismissedIds.has(s.id)) return false
          const lastSession = lastSessionMap.get(s.id)
          const daysSince = lastSession
            ? Math.floor((now.getTime() - new Date(lastSession).getTime()) / 86400000)
            : 999
          return daysSince >= 14 || failedStudentIds.has(s.id)
        })
        .map(s => {
          const lastSession = lastSessionMap.get(s.id)
          const daysSince = lastSession
            ? Math.floor((now.getTime() - new Date(lastSession).getTime()) / 86400000)
            : 999
          const reasons: string[] = []
          if (daysSince >= 14) reasons.push(daysSince >= 999 ? 'No sessions logged' : `${daysSince}d inactive`)
          if (failedStudentIds.has(s.id)) reasons.push('Payment failed')
          return {
            id: s.id,
            name: `${s.first_name} ${s.last_name}`.trim(),
            familyName: familyMap.get(s.family_id) ?? '',
            instrument: s.instrument,
            locationId: s.location_id,
            locationName: locMap.get(s.location_id) ?? 'Unknown',
            daysSinceSession: daysSince,
            reasons,
          }
        })
        .sort((a, b) => b.daysSinceSession - a.daysSinceSession)
    },
    staleTime: 1000 * 60 * 2,
  })
}

// ── DISMISS AT-RISK ──
export function useDismissAtRisk() {
  const { user } = useAuthContext()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ studentId, locationId }: { studentId: string; locationId: string }) => {
      await supabase.from('retention_outreach').insert({
        tenant_id: TENANT_ID,
        student_id: studentId,
        location_id: locationId,
        outreach_type: 'dismiss',
        outcome: 'dismissed',
        sent_by: user?.id ?? null,
        message_content: 'Dismissed from at-risk list for 30 days',
      })
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['at-risk-students'] }),
  })
}

// ── WIN-BACK: FORMER STUDENTS ──
export function useFormerStudents(locationIds?: string[] | null) {
  return useQuery({
    queryKey: ['former-students', locationIds ?? 'all'],
    queryFn: async () => {
      let query = supabase
        .from('students')
        .select('id, first_name, last_name, instrument, location_id, family_id, status, exit_category, exit_reason, transferred_to_location_id, deactivated_at, reactivation_date, created_at')
        .in('status', ['inactive', 'former'])
      if (locationIds) query = query.in('location_id', locationIds)
      const { data: students } = await query
      if (!students || students.length === 0) return []

      // Get location names
      const { data: locations } = await supabase.from('locations').select('id, name')
      const locMap = new Map(locations?.map((l: any) => [l.id, l.name?.replace(' Music Lessons', '')]) ?? [])

      // Get family names
      const familyIds = [...new Set(students.map(s => s.family_id).filter(Boolean))]
      const { data: families } = familyIds.length > 0
        ? await supabase.from('families').select('id, name').in('id', familyIds)
        : { data: [] }
      const familyMap = new Map((families ?? []).map((f: any) => [f.id, f.name]))

      // Get last outreach per student
      const studentIds = students.map(s => s.id)
      const { data: outreach } = await supabase
        .from('retention_outreach')
        .select('student_id, outreach_date, outcome')
        .in('student_id', studentIds)
        .order('outreach_date', { ascending: false })

      const lastOutreachMap = new Map<string, { date: string; outcome: string | null }>()
      const outreachCountMap = new Map<string, number>()
      outreach?.forEach((o: any) => {
        if (!lastOutreachMap.has(o.student_id)) lastOutreachMap.set(o.student_id, { date: o.outreach_date, outcome: o.outcome })
        outreachCountMap.set(o.student_id, (outreachCountMap.get(o.student_id) ?? 0) + 1)
      })

      return students.map((s: any) => ({
        id: s.id,
        name: `${s.first_name} ${s.last_name}`.trim(),
        familyName: familyMap.get(s.family_id) ?? '',
        instrument: s.instrument,
        locationId: s.location_id,
        locationName: locMap.get(s.location_id) ?? 'Unknown',
        exitCategory: s.exit_category,
        exitReason: s.exit_reason,
        transferredTo: s.transferred_to_location_id ? locMap.get(s.transferred_to_location_id) : null,
        deactivatedAt: s.deactivated_at,
        reactivationDate: s.reactivation_date,
        lastOutreach: lastOutreachMap.get(s.id) ?? null,
        outreachCount: outreachCountMap.get(s.id) ?? 0,
      }))
    },
    staleTime: 1000 * 60 * 2,
  })
}

// ── WIN-BACK: LOST LEADS ──
export function useLostLeads(locationIds?: string[] | null) {
  return useQuery({
    queryKey: ['lost-leads', locationIds ?? 'all'],
    queryFn: async () => {
      let query = supabase
        .from('leads')
        .select('id, student_name, first_name, parent_name, instrument, location_id, lost_category, lost_reason, updated_at')
        .eq('stage', 'lost')
      if (locationIds) query = query.in('location_id', locationIds)
      const { data: leads } = await query
      if (!leads || leads.length === 0) return []

      const { data: locations } = await supabase.from('locations').select('id, name')
      const locMap = new Map(locations?.map((l: any) => [l.id, l.name?.replace(' Music Lessons', '')]) ?? [])

      // Get outreach per lead
      const leadIds = leads.map(l => l.id)
      const { data: outreach } = await supabase
        .from('retention_outreach')
        .select('lead_id, outreach_date')
        .in('lead_id', leadIds)
        .order('outreach_date', { ascending: false })
      const lastOutreachMap = new Map<string, string>()
      outreach?.forEach((o: any) => {
        if (!lastOutreachMap.has(o.lead_id)) lastOutreachMap.set(o.lead_id, o.outreach_date)
      })

      return leads.map((l: any) => ({
        id: l.id,
        name: l.student_name || l.first_name || l.parent_name || 'Unknown',
        parentName: l.parent_name,
        instrument: l.instrument,
        locationId: l.location_id,
        locationName: locMap.get(l.location_id) ?? 'Unknown',
        lostCategory: l.lost_category,
        lostReason: l.lost_reason,
        lostDate: l.updated_at,
        lastOutreachDate: lastOutreachMap.get(l.id) ?? null,
      }))
    },
    staleTime: 1000 * 60 * 2,
  })
}

// ── WIN-BACK METRICS ──
export function useWinBackMetrics(locationIds?: string[] | null) {
  return useQuery({
    queryKey: ['win-back-metrics', locationIds ?? 'all'],
    queryFn: async () => {
      const now = new Date()
      const today = now.toISOString().split('T')[0]
      const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`

      let formerQuery = supabase.from('students').select('*', { count: 'exact', head: true }).in('status', ['inactive', 'former'])
      if (locationIds) formerQuery = formerQuery.in('location_id', locationIds)
      const { count: totalFormer } = await formerQuery

      // Due for reactivation
      let dueQuery = supabase.from('students').select('*', { count: 'exact', head: true }).in('status', ['inactive', 'former']).not('reactivation_date', 'is', null).lte('reactivation_date', today)
      if (locationIds) dueQuery = dueQuery.in('location_id', locationIds)
      const { count: dueCt } = await dueQuery

      // Contacted this month
      let contactedQuery = supabase.from('retention_outreach').select('*', { count: 'exact', head: true }).gte('outreach_date', monthStart).not('student_id', 'is', null)
      if (locationIds) contactedQuery = contactedQuery.in('location_id', locationIds)
      const { count: contactedCt } = await contactedQuery

      // Won back this month
      let wonBackQuery = supabase.from('retention_outreach').select('*', { count: 'exact', head: true }).gte('outreach_date', monthStart).eq('outcome', 're_enrolled')
      if (locationIds) wonBackQuery = wonBackQuery.in('location_id', locationIds)
      const { count: wonBackCt } = await wonBackQuery

      // Lost leads
      let lostQuery = supabase.from('leads').select('*', { count: 'exact', head: true }).eq('stage', 'lost')
      if (locationIds) lostQuery = lostQuery.in('location_id', locationIds)
      const { count: lostCt } = await lostQuery

      return {
        totalFormer: totalFormer ?? 0,
        dueForReactivation: dueCt ?? 0,
        contactedThisMonth: contactedCt ?? 0,
        wonBackThisMonth: wonBackCt ?? 0,
        totalLostLeads: lostCt ?? 0,
      }
    },
    staleTime: 1000 * 60 * 2,
  })
}
