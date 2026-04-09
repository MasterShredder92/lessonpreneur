import { supabase } from '../lib/supabase'
import { useAuthContext } from '../app/AuthContext'

function toCsv(headers: string[], rows: string[][]): string {
  const escape = (val: string) => `"${String(val ?? '').replace(/"/g, '""')}"`
  const lines = [headers.map(escape).join(',')]
  for (const row of rows) lines.push(row.map(escape).join(','))
  return lines.join('\n')
}

function download(csv: string, filename: string) {
  const blob = new Blob([csv], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

// ─── Students Export ─────────────────────────────────

export async function exportStudents(tenantId: string) {
  const { data: students } = await supabase
    .from('students')
    .select('first_name, last_name, instrument, status, location_id, teacher_id, created_at, sessions_per_month, rate_per_session')
    .eq('tenant_id', tenantId)
    .order('first_name')

  // Enrich
  const locIds = [...new Set((students ?? []).map(s => s.location_id).filter(Boolean))]
  const teacherIds = [...new Set((students ?? []).map(s => s.teacher_id).filter(Boolean))]
  const locMap = new Map<string, string>()
  const tMap = new Map<string, string>()
  if (locIds.length) { const { data } = await supabase.from('locations').select('id, name').in('id', locIds); data?.forEach((l: any) => locMap.set(l.id, l.name?.replace(' Music Lessons', '') ?? '')) }
  if (teacherIds.length) { const { data } = await supabase.from('teachers').select('id, first_name, last_name').in('id', teacherIds); data?.forEach((t: any) => tMap.set(t.id, `${t.first_name} ${t.last_name}`.trim())) }

  // Session counts
  const stuIds = (students ?? []).map(s => s.first_name) // placeholder — we need actual IDs
  const { data: logs } = await supabase.from('session_log').select('student_id, block_date').eq('tenant_id', tenantId).limit(50000)
  const sessionMap = new Map<string, number>()
  const lastSessionMap = new Map<string, string>()
  // We need student IDs — re-query
  const { data: stuWithId } = await supabase.from('students').select('id, first_name, last_name').eq('tenant_id', tenantId).limit(10000)
  const idToName = new Map((stuWithId ?? []).map((s: any) => [s.id, `${s.first_name} ${s.last_name}`]))
  logs?.forEach((l: any) => { sessionMap.set(l.student_id, (sessionMap.get(l.student_id) ?? 0) + 1); if (!lastSessionMap.has(l.student_id)) lastSessionMap.set(l.student_id, l.block_date) })

  const headers = ['Name', 'Instrument', 'Location', 'Teacher', 'Status', 'Enrolled', 'Sessions/Mo', 'Rate', 'Total Sessions', 'Last Session']
  const rows = (stuWithId ?? []).map((s: any) => {
    const stu = (students ?? []).find((st: any) => st.first_name === s.first_name && st.last_name === s.last_name) ?? {} as any
    return [
      `${s.first_name} ${s.last_name}`,
      stu.instrument ?? '',
      locMap.get(stu.location_id) ?? '',
      tMap.get(stu.teacher_id) ?? '',
      stu.status ?? '',
      stu.created_at ? new Date(stu.created_at).toLocaleDateString() : '',
      String(stu.sessions_per_month ?? ''),
      stu.rate_per_session ? `$${stu.rate_per_session}` : '',
      String(sessionMap.get(s.id) ?? 0),
      lastSessionMap.get(s.id) ?? '',
    ]
  })

  download(toCsv(headers, rows), `students-export-${new Date().toISOString().split('T')[0]}.csv`)
}

// ─── Financial Export ────────────────────────────────

export async function exportFinancials(tenantId: string) {
  const { data: invoices } = await supabase
    .from('square_invoices')
    .select('invoice_date, requested_amount, amount_paid, location_id, customer_name, status')
    .eq('tenant_id', tenantId)
    .order('invoice_date', { ascending: false })
    .limit(10000)

  const locIds = [...new Set((invoices ?? []).map(i => i.location_id).filter(Boolean))]
  const locMap = new Map<string, string>()
  if (locIds.length) { const { data } = await supabase.from('locations').select('id, name').in('id', locIds); data?.forEach((l: any) => locMap.set(l.id, l.name?.replace(' Music Lessons', '') ?? '')) }

  const headers = ['Date', 'Customer', 'Location', 'Status', 'Requested', 'Paid']
  const rows = (invoices ?? []).map((i: any) => [
    i.invoice_date ?? '',
    i.customer_name ?? '',
    locMap.get(i.location_id) ?? '',
    i.status ?? '',
    i.requested_amount ? `$${(i.requested_amount / 100).toFixed(2)}` : '',
    i.amount_paid ? `$${(i.amount_paid / 100).toFixed(2)}` : '$0.00',
  ])

  download(toCsv(headers, rows), `financials-export-${new Date().toISOString().split('T')[0]}.csv`)
}

// ─── Session Log Export ──────────────────────────────

export async function exportSessionLogs(tenantId: string, dateFrom?: string, dateTo?: string) {
  let query = supabase
    .from('session_log')
    .select('block_date, student_id, teacher_id, instrument, worked_on, progress_indicator, engagement_level, teacher_note')
    .eq('tenant_id', tenantId)
    .order('block_date', { ascending: false })

  if (dateFrom) query = query.gte('block_date', dateFrom)
  if (dateTo) query = query.lte('block_date', dateTo)

  const { data: logs } = await query

  const stuIds = [...new Set((logs ?? []).map(l => l.student_id))]
  const tIds = [...new Set((logs ?? []).map(l => l.teacher_id))]
  const stuMap = new Map<string, string>()
  const tMap = new Map<string, string>()
  if (stuIds.length) { const { data } = await supabase.from('students').select('id, first_name, last_name').eq('tenant_id', tenantId).in('id', stuIds); data?.forEach((s: any) => stuMap.set(s.id, `${s.first_name} ${s.last_name}`.trim())) }
  if (tIds.length) { const { data } = await supabase.from('teachers').select('id, first_name, last_name').eq('tenant_id', tenantId).in('id', tIds); data?.forEach((t: any) => tMap.set(t.id, `${t.first_name} ${t.last_name}`.trim())) }

  const headers = ['Date', 'Student', 'Teacher', 'Instrument', 'Worked On', 'Progress', 'Engagement', 'Note']
  const rows = (logs ?? []).map((l: any) => [
    l.block_date ?? '',
    stuMap.get(l.student_id) ?? '',
    tMap.get(l.teacher_id) ?? '',
    l.instrument ?? '',
    (l.worked_on ?? []).join(', '),
    l.progress_indicator ?? '',
    l.engagement_level ? String(l.engagement_level) : '',
    l.teacher_note ?? '',
  ])

  download(toCsv(headers, rows), `session-logs-${new Date().toISOString().split('T')[0]}.csv`)
}

// ─── Retention Export ────────────────────────────────

export async function exportRetention(tenantId: string) {
  const { data: students } = await supabase
    .from('students')
    .select('id, first_name, last_name, status, created_at, location_id, family_id')
    .eq('tenant_id', tenantId)
    .eq('status', 'active')

  const locIds = [...new Set((students ?? []).map(s => s.location_id).filter(Boolean))]
  const locMap = new Map<string, string>()
  if (locIds.length) { const { data } = await supabase.from('locations').select('id, name').in('id', locIds); data?.forEach((l: any) => locMap.set(l.id, l.name?.replace(' Music Lessons', '') ?? '')) }

  // Last session per student
  const stuIds = (students ?? []).map(s => s.id)
  const { data: logs } = await supabase.from('session_log').select('student_id, block_date').in('student_id', stuIds).order('block_date', { ascending: false })
  const lastSession = new Map<string, string>()
  logs?.forEach((l: any) => { if (!lastSession.has(l.student_id)) lastSession.set(l.student_id, l.block_date) })

  // Onboarding status
  const { data: onboarding } = await supabase.from('onboarding_sequences').select('student_id, status').in('student_id', stuIds).eq('status', 'active')
  const onboardingSet = new Set((onboarding ?? []).map(o => o.student_id))

  const headers = ['Name', 'Location', 'Status', 'Enrolled', 'Last Session', 'Days Since Session', 'In Onboarding']
  const now = Date.now()
  const rows = (students ?? []).map((s: any) => {
    const ls = lastSession.get(s.id)
    const daysSince = ls ? Math.floor((now - new Date(ls + 'T00:00:00').getTime()) / 86400000) : ''
    return [
      `${s.first_name} ${s.last_name}`,
      locMap.get(s.location_id) ?? '',
      s.status,
      s.created_at ? new Date(s.created_at).toLocaleDateString() : '',
      ls ?? 'None',
      String(daysSince),
      onboardingSet.has(s.id) ? 'Yes' : 'No',
    ]
  })

  download(toCsv(headers, rows), `retention-export-${new Date().toISOString().split('T')[0]}.csv`)
}
