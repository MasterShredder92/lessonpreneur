import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuthContext } from '../app/AuthContext'

/**
 * Gathers rich business context for Star AI assistant.
 * This data is sent alongside user messages so Star can answer
 * specific questions about the school's operations.
 */

export interface StarContext {
  summary: string  // Pre-formatted text context for the AI
}

export function useStarContext() {
  const { tenantId, role } = useAuthContext()

  return useQuery<StarContext>({
    queryKey: ['star-context', tenantId],
    enabled: !!tenantId,
    staleTime: 2 * 60_000, // refresh every 2 min
    queryFn: async () => {
      const now = new Date()
      const today = now.toISOString().split('T')[0]
      const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`

      // Parallel queries for speed
      const [
        { data: students },
        { data: families },
        { data: teachers },
        { data: leads },
        { data: locations },
        { data: todayBlocks },
        { data: invoices },
        { data: recentLogs },
      ] = await Promise.all([
        supabase.from('students').select('id, first_name, last_name, instrument, status, location_id, teacher_id, created_at').eq('tenant_id', tenantId!),
        supabase.from('families').select('id, name, billing_status, rate_tier, primary_email').eq('tenant_id', tenantId!),
        supabase.from('teachers').select('id, first_name, last_name, is_active, instruments, status').eq('tenant_id', tenantId!),
        supabase.from('leads').select('id, first_name, stage, instrument, created_at, updated_at').eq('tenant_id', tenantId!),
        supabase.from('locations').select('id, name, is_active'),
        supabase.from('schedule_blocks').select('id, status, teacher_id, student_id, location_id, block_type, start_time').eq('block_date', today),
        supabase.from('square_invoices').select('requested_amount, amount_paid, location_id').eq('tenant_id', tenantId!).gte('invoice_date', monthStart),
        supabase.from('session_log').select('student_id, block_date, progress_indicator').eq('tenant_id', tenantId!).gte('block_date', monthStart).order('block_date', { ascending: false }).limit(100),
      ])

      const activeStudents = (students ?? []).filter(s => s.status === 'active')
      const activeFamilies = (families ?? []).filter(f => f.billing_status === 'active')
      const activeTeachers = (teachers ?? []).filter(t => t.is_active)
      const activeLeads = (leads ?? []).filter(l => !['enrolled', 'lost'].includes(l.stage))
      const locMap = new Map((locations ?? []).map(l => [l.id, l.name?.replace(' Music Lessons', '') ?? '']))

      // Per-location counts
      const studentsByLoc = new Map<string, number>()
      activeStudents.forEach(s => {
        const loc = locMap.get(s.location_id) ?? 'Unknown'
        studentsByLoc.set(loc, (studentsByLoc.get(loc) ?? 0) + 1)
      })

      // Today's schedule summary
      const bookedToday = (todayBlocks ?? []).filter(b => b.status === 'booked').length
      const openToday = (todayBlocks ?? []).filter(b => b.status === 'available').length
      const teachersToday = new Set((todayBlocks ?? []).map(b => b.teacher_id)).size

      // Revenue
      const totalInvoiced = (invoices ?? []).reduce((s, i) => s + (i.requested_amount ?? 0), 0)
      const totalPaid = (invoices ?? []).reduce((s, i) => s + (i.amount_paid ?? 0), 0)

      // Stale leads
      const nowMs = Date.now()
      const staleLeads = activeLeads.filter(l => (nowMs - new Date(l.updated_at).getTime()) / 86400000 >= 3)

      // At-risk students (no session in 14+ days)
      const recentStudentIds = new Set((recentLogs ?? []).map(l => l.student_id))
      const fourteenDaysAgo = new Date(nowMs - 14 * 86400000).toISOString().split('T')[0]
      const atRisk = activeStudents.filter(s => {
        const hasRecent = (recentLogs ?? []).some(l => l.student_id === s.id && l.block_date >= fourteenDaysAgo)
        return !hasRecent
      })

      // Build the context string
      const lines: string[] = [
        `=== BUSINESS SNAPSHOT (${today}) ===`,
        `Active students: ${activeStudents.length}`,
        `Active families: ${activeFamilies.length}`,
        `Active teachers: ${activeTeachers.length}`,
        `Leads in pipeline: ${activeLeads.length}`,
        '',
        `Students by location: ${[...studentsByLoc.entries()].map(([k, v]) => `${k}: ${v}`).join(', ')}`,
        '',
        `Today's schedule: ${bookedToday} sessions booked, ${openToday} open slots, ${teachersToday} teachers on site`,
        '',
        `This month's billing: $${(totalInvoiced / 100).toLocaleString()} invoiced, $${(totalPaid / 100).toLocaleString()} collected, $${((totalInvoiced - totalPaid) / 100).toLocaleString()} remaining`,
        '',
      ]

      if (staleLeads.length > 0) {
        lines.push(`Stale leads (3+ days no contact): ${staleLeads.length}`)
        lines.push(`  Names: ${staleLeads.slice(0, 5).map(l => l.first_name).join(', ')}${staleLeads.length > 5 ? ` (+${staleLeads.length - 5} more)` : ''}`)
      }

      if (atRisk.length > 0) {
        lines.push(`At-risk students (14+ days no session): ${atRisk.length}`)
        lines.push(`  Names: ${atRisk.slice(0, 8).map(s => `${s.first_name} ${s.last_name}`).join(', ')}${atRisk.length > 8 ? ` (+${atRisk.length - 8} more)` : ''}`)
      }

      // Teacher list with instruments
      lines.push('')
      lines.push('Teachers:')
      activeTeachers.forEach(t => {
        lines.push(`  ${t.first_name} ${t.last_name} — ${(t.instruments ?? []).join(', ') || 'no instruments set'} (${t.status})`)
      })

      // Location list
      lines.push('')
      lines.push('Locations:')
      ;(locations ?? []).filter(l => l.is_active).forEach(l => {
        const count = studentsByLoc.get(l.name?.replace(' Music Lessons', '') ?? '') ?? 0
        lines.push(`  ${l.name?.replace(' Music Lessons', '')} — ${count} students`)
      })

      // Recent session activity
      const logsThisMonth = (recentLogs ?? []).length
      const crushingCount = (recentLogs ?? []).filter(l => l.progress_indicator === 'crushing_it').length
      if (logsThisMonth > 0) {
        lines.push('')
        lines.push(`Session logs this month: ${logsThisMonth} (${crushingCount} "crushing it")`)
      }

      // Add role context for AI role restrictions
      const roleRestrictions: Record<string, string> = {
        owner: 'USER ROLE: Owner — full access to all data and actions.',
        admin: 'USER ROLE: Company Director — can see revenue/payroll/collections but NOT owner take-home or profit margin.',
        company_director: 'USER ROLE: Company Director — can see revenue/payroll/collections but NOT owner take-home or profit margin.',
        studio_director: 'USER ROLE: Studio Director — can ONLY answer questions about their assigned location. Cannot make financial changes, setting changes, or cross-location operations. If they ask about another location, say you can show summary numbers but not details.',
        teacher: 'USER ROLE: Teacher — can only answer questions about their own students and schedule. No financial data.',
        parent: 'USER ROLE: Parent — can only answer questions about their child\'s progress and schedule.',
      }
      lines.unshift(roleRestrictions[role ?? ''] ?? 'USER ROLE: Unknown')

      // Role-based filtering
      if (role === 'teacher' || role === 'parent' || role === 'student') {
        return { summary: lines.filter(l => !l.includes('billing') && !l.includes('invoiced') && !l.includes('collected') && !l.includes('Revenue') && !l.includes('Stale leads') && !l.includes('Teachers:')).join('\n') }
      }
      if (role !== 'owner') {
        return { summary: lines.filter(l => !l.includes('take-home') && !l.includes('margin')).join('\n') }
      }

      return { summary: lines.join('\n') }
    },
  })
}
