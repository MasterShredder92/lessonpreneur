import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { useQueryClient } from '@tanstack/react-query'
import { useAuthContext } from '../app/AuthContext'

// ═══════════════════════════════════════
// TYPES
// ═══════════════════════════════════════

export type RowStatus = 'new' | 'duplicate' | 'possible_duplicate' | 'error'

export interface ImportRow {
  idx: number
  data: Record<string, string>
  status: RowStatus
  reason?: string
  skip?: boolean
}

export interface ImportPreview {
  rows: ImportRow[]
  newCount: number
  dupCount: number
  possibleDupCount: number
  errorCount: number
  totalInFile: number
}

export interface ImportResult {
  added: number
  skipped: number
  failed: number
  errors: string[]
}

// ═══════════════════════════════════════
// CSV PARSER
// ═══════════════════════════════════════

export function parseCsv(text: string): { headers: string[]; rows: Record<string, string>[] } {
  const lines = text.split(/\r?\n/).filter(l => l.trim())
  if (lines.length < 2) return { headers: [], rows: [] }

  const headers = lines[0].split(',').map(h => h.trim().replace(/^["']|["']$/g, '').toLowerCase().replace(/\s+/g, '_'))

  const rows = lines.slice(1).map(line => {
    const values: string[] = []
    let current = ''
    let inQuotes = false
    for (const ch of line) {
      if (ch === '"') { inQuotes = !inQuotes; continue }
      if (ch === ',' && !inQuotes) { values.push(current.trim()); current = ''; continue }
      current += ch
    }
    values.push(current.trim())
    const obj: Record<string, string> = {}
    headers.forEach((h, i) => { obj[h] = values[i] ?? '' })
    return obj
  }).filter(r => Object.values(r).some(v => v.trim()))

  return { headers, rows }
}

// Date normalizer
export function normalizeDate(val: string): string | null {
  if (!val) return null
  // YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(val)) return val
  // M/D/YYYY or M/D/YY
  const m = val.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/)
  if (m) {
    const mm = m[1].padStart(2, '0')
    const dd = m[2].padStart(2, '0')
    let yyyy = m[3]
    if (yyyy.length === 2) yyyy = (parseInt(yyyy) > 50 ? '19' : '20') + yyyy
    return `${yyyy}-${mm}-${dd}`
  }
  return null
}

// Location map
const LOCATION_MAP: Record<string, string> = {
  gretna: '40c67ffc-91b5-46a9-94bd-6ddffdfb7638',
  bellevue: 'f7b52dd5-12ee-437f-9c60-f8adf454ac31',
  elkhorn: 'cebd97d4-c241-4de2-8ade-49e5cc0070d5',
  omaha: 'd48229c1-b70a-4d29-893e-5079887dab76',
}

function resolveLocation(name: string | undefined, id: string | undefined): string | null {
  if (id && /^[0-9a-f-]{36}$/.test(id)) return id
  if (name) {
    const key = name.toLowerCase().replace(/\s*music\s*lessons?\s*/i, '').trim()
    return LOCATION_MAP[key] ?? null
  }
  return null
}

// ═══════════════════════════════════════
// STUDENT IMPORT
// ═══════════════════════════════════════

export function useImportStudents() {
  const { tenantId, user } = useAuthContext()
  const qc = useQueryClient()
  const [status, setStatus] = useState<'idle' | 'checking' | 'ready' | 'importing' | 'done'>('idle')
  const [progress, setProgress] = useState(0)
  const [preview, setPreview] = useState<ImportPreview | null>(null)
  const [result, setResult] = useState<ImportResult | null>(null)

  const check = async (rows: Record<string, string>[]) => {
    if (!tenantId) return
    setStatus('checking')

    // Fetch existing for dedup
    const { data: existingStudents } = await supabase
      .from('students')
      .select('id, first_name, last_name, ai_context')
      .eq('tenant_id', tenantId)

    const sqIdSet = new Set<string>()
    const nameSet = new Set<string>();
    (existingStudents ?? []).forEach((s: any) => {
      const sqId = s.ai_context?.square_customer_id
      if (sqId) sqIdSet.add(String(sqId))
      nameSet.add(`${(s.first_name ?? '').toLowerCase()} ${(s.last_name ?? '').toLowerCase()}`)
    })

    const importRows: ImportRow[] = rows.map((data, idx) => {
      const fn = (data.first_name ?? '').trim()
      const ln = (data.last_name ?? '').trim()
      if (!fn || !ln) return { idx, data, status: 'error' as RowStatus, reason: 'Missing first or last name' }

      const sqId = (data.square_customer_id ?? '').trim()
      if (sqId && sqIdSet.has(sqId)) return { idx, data, status: 'duplicate' as RowStatus, reason: 'Square ID already exists' }

      const fullName = `${fn.toLowerCase()} ${ln.toLowerCase()}`
      if (!sqId && nameSet.has(fullName)) return { idx, data, status: 'possible_duplicate' as RowStatus, reason: 'Name match found' }

      return { idx, data, status: 'new' as RowStatus }
    })

    const p: ImportPreview = {
      rows: importRows,
      newCount: importRows.filter(r => r.status === 'new').length,
      dupCount: importRows.filter(r => r.status === 'duplicate').length,
      possibleDupCount: importRows.filter(r => r.status === 'possible_duplicate').length,
      errorCount: importRows.filter(r => r.status === 'error').length,
      totalInFile: rows.length,
    }
    setPreview(p)
    setStatus('ready')
  }

  const run = async () => {
    if (!tenantId || !preview) return
    setStatus('importing')
    setProgress(0)

    const toImport = preview.rows.filter(r => r.status === 'new' || (r.status === 'possible_duplicate' && !r.skip))
    let added = 0, skipped = 0, failed = 0
    const errors: string[] = []

    // Pre-fetch families for email lookup
    const { data: existingFamilies } = await supabase.from('families').select('id, name, primary_email').eq('tenant_id', tenantId)
    const famByEmail = new Map<string, string>()
    existingFamilies?.forEach((f: any) => { if (f.primary_email) famByEmail.set(f.primary_email.toLowerCase(), f.id) })

    const BATCH = 50
    for (let i = 0; i < toImport.length; i += BATCH) {
      const batch = toImport.slice(i, i + BATCH)

      for (const row of batch) {
        const d = row.data
        try {
          const email = (d.email ?? d.primary_email ?? '').trim().toLowerCase()
          const parentName = (d.parent_name ?? d.primary_contact_name ?? '').trim()
          const lastName = (d.last_name ?? '').trim()
          const locationId = resolveLocation(d.location_name, d.location_id)

          // Family resolution
          let familyId: string | null = null
          if (email) {
            familyId = famByEmail.get(email) ?? null
            if (!familyId) {
              const { data: newFam } = await supabase.from('families').insert({
                tenant_id: tenantId, name: `${lastName} Family`,
                parent_name: parentName || null, primary_email: email || null,
                primary_contact_name: parentName || null,
                billing_status: 'active', billing_day: 1,
                primary_location_id: locationId,
              }).select('id').single()
              if (newFam) { familyId = newFam.id; famByEmail.set(email, newFam.id) }
            }
          }

          // Build ai_context
          const aiCtx: Record<string, any> = {}
          if (d.square_customer_id?.trim()) aiCtx.square_customer_id = d.square_customer_id.trim()
          if (parentName) aiCtx.parent_name = parentName

          const startDate = normalizeDate(d.start_date ?? '')

          await supabase.from('students').insert({
            tenant_id: tenantId,
            family_id: familyId,
            location_id: locationId,
            first_name: (d.first_name ?? '').trim(),
            last_name: lastName,
            status: (d.status ?? 'active').trim().toLowerCase() || 'active',
            start_date: startDate,
            first_lesson_date: startDate,
            total_lessons_taken: parseInt(d.sessions_taken ?? '') || 0,
            total_paid: parseFloat(d.lifetime_paid ?? '') || 0,
            sessions_per_month: parseInt(d.sessions_per_month ?? '') || 4,
            instrument: (d.instrument ?? '').trim().toLowerCase() || null,
            bio: (d.notes ?? d.bio ?? '').trim() || null,
            ai_context: Object.keys(aiCtx).length > 0 ? aiCtx : null,
          })

          // Update family lifetime_paid
          if (familyId && d.lifetime_paid) {
            const cents = Math.round(parseFloat(d.lifetime_paid) * 100)
            if (cents > 0) {
              await supabase.rpc('increment_family_lifetime_paid', { fam_id: familyId, amount: cents }).catch(() => {})
            }
          }

          added++
        } catch (err: any) {
          failed++
          errors.push(`Row ${row.idx + 2}: ${err.message}`)
        }
      }
      setProgress(Math.min(100, Math.round(((i + batch.length) / toImport.length) * 100)))
    }

    // Audit log
    await supabase.from('audit_log').insert({
      tenant_id: tenantId, action: 'CSV_IMPORT_STUDENTS', table_name: 'students',
      new_value: JSON.stringify({ rows_in_file: preview.totalInFile, rows_added: added, rows_skipped_duplicate: preview.dupCount + skipped, rows_skipped_error: failed }),
      performed_by: user?.id ?? null,
    })

    setResult({ added, skipped: preview.dupCount, failed, errors })
    setStatus('done')
    qc.invalidateQueries({ queryKey: ['students'] })
    qc.invalidateQueries({ queryKey: ['families'] })
    qc.invalidateQueries({ queryKey: ['families_page'] })
  }

  const reset = () => { setStatus('idle'); setProgress(0); setPreview(null); setResult(null) }

  return { status, progress, preview, result, check, run, reset }
}

// ═══════════════════════════════════════
// TEACHER IMPORT
// ═══════════════════════════════════════

export function useImportTeachers() {
  const { tenantId, user } = useAuthContext()
  const qc = useQueryClient()
  const [status, setStatus] = useState<'idle' | 'checking' | 'ready' | 'importing' | 'done'>('idle')
  const [progress, setProgress] = useState(0)
  const [preview, setPreview] = useState<ImportPreview | null>(null)
  const [result, setResult] = useState<ImportResult | null>(null)

  const check = async (rows: Record<string, string>[]) => {
    if (!tenantId) return
    setStatus('checking')

    const { data: existingTeachers } = await supabase
      .from('teachers')
      .select('id, first_name, last_name, email')
      .eq('tenant_id', tenantId)

    const emailSet = new Set<string>()
    const nameSet = new Set<string>();
    (existingTeachers ?? []).forEach((t: any) => {
      if (t.email) emailSet.add(t.email.toLowerCase())
      nameSet.add(`${(t.first_name ?? '').toLowerCase()} ${(t.last_name ?? '').toLowerCase()}`)
    })

    const importRows: ImportRow[] = rows.map((data, idx) => {
      const fn = (data.first_name ?? '').trim()
      const ln = (data.last_name ?? '').trim()
      if (!fn || !ln) return { idx, data, status: 'error' as RowStatus, reason: 'Missing first or last name' }

      const email = (data.email ?? '').trim().toLowerCase()
      if (email && emailSet.has(email)) return { idx, data, status: 'duplicate' as RowStatus, reason: 'Email already exists' }

      const fullName = `${fn.toLowerCase()} ${ln.toLowerCase()}`
      if (!email && nameSet.has(fullName)) return { idx, data, status: 'possible_duplicate' as RowStatus, reason: 'Name match found' }

      return { idx, data, status: 'new' as RowStatus }
    })

    setPreview({
      rows: importRows,
      newCount: importRows.filter(r => r.status === 'new').length,
      dupCount: importRows.filter(r => r.status === 'duplicate').length,
      possibleDupCount: importRows.filter(r => r.status === 'possible_duplicate').length,
      errorCount: importRows.filter(r => r.status === 'error').length,
      totalInFile: rows.length,
    })
    setStatus('ready')
  }

  const run = async () => {
    if (!tenantId || !preview) return
    setStatus('importing')
    setProgress(0)

    const toImport = preview.rows.filter(r => r.status === 'new' || (r.status === 'possible_duplicate' && !r.skip))
    let added = 0, failed = 0
    const errors: string[] = []

    const BATCH = 50
    for (let i = 0; i < toImport.length; i += BATCH) {
      const batch = toImport.slice(i, i + BATCH)

      for (const row of batch) {
        const d = row.data
        try {
          const instruments = (d.instruments ?? '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean)

          await supabase.from('teachers').insert({
            tenant_id: tenantId,
            first_name: (d.first_name ?? '').trim(),
            last_name: (d.last_name ?? '').trim(),
            email: (d.email ?? '').trim() || null,
            phone: (d.phone ?? '').trim() || null,
            display_name: (d.display_name ?? '').trim() || `${(d.first_name ?? '').trim()} ${(d.last_name ?? '').trim()}`,
            instruments: instruments.length > 0 ? instruments : null,
            pay_rate_per_half_hour: parseFloat(d.pay_rate ?? '') || null,
            hire_date: normalizeDate(d.hire_date ?? '') || null,
            teacher_role: (d.role ?? 'Teacher').trim(),
            status: (d.status ?? 'active').trim().toLowerCase() || 'active',
            is_active: true,
            bio: (d.bio ?? '').trim() || null,
            square_team_member_id: (d.square_team_id ?? '').trim() || null,
            ai_context: {},
          })
          added++
        } catch (err: any) {
          failed++
          errors.push(`Row ${row.idx + 2}: ${err.message}`)
        }
      }
      setProgress(Math.min(100, Math.round(((i + batch.length) / toImport.length) * 100)))
    }

    await supabase.from('audit_log').insert({
      tenant_id: tenantId, action: 'CSV_IMPORT_TEACHERS', table_name: 'teachers',
      new_value: JSON.stringify({ rows_in_file: preview.totalInFile, rows_added: added, rows_skipped_duplicate: preview.dupCount, rows_skipped_error: failed }),
      performed_by: user?.id ?? null,
    })

    setResult({ added, skipped: preview.dupCount, failed, errors })
    setStatus('done')
    qc.invalidateQueries({ queryKey: ['teachers'] })
    qc.invalidateQueries({ queryKey: ['teacher-spreadsheet'] })
  }

  const reset = () => { setStatus('idle'); setProgress(0); setPreview(null); setResult(null) }

  return { status, progress, preview, result, check, run, reset }
}

// ═══════════════════════════════════════
// TEMPLATES
// ═══════════════════════════════════════

export const STUDENT_TEMPLATE = `first_name,last_name,email,parent_name,location_name,start_date,sessions_taken,lifetime_paid,sessions_per_month,square_customer_id,status,instrument,notes
Jane,Doe,jane.doe@email.com,Sarah Doe,Omaha,2024-01-15,12,540,4,SQ12345,active,piano,Enjoys pop music`

export const TEACHER_TEMPLATE = `first_name,last_name,email,phone,instruments,pay_rate,hire_date,role,status,bio,square_team_id,display_name
John,Smith,john@school.com,4025551234,"Piano, Guitar",25,2023-06-01,Teacher,active,10 years experience,TM_123,John Smith`
