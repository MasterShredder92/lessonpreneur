import { useState, useRef, useCallback } from 'react'
import { useAuthContext } from '../../app/AuthContext'
import { supabase } from '../../lib/supabase'
import { useQueryClient } from '@tanstack/react-query'
import type { Location } from '../../lib/types'
import { instrumentWithEmojiTitle } from '../../utils/instrumentEmoji'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Step = 'upload' | 'map' | 'review'

/** Our canonical target fields */
type TargetField =
  | 'first_name'
  | 'last_name'
  | 'instrument'
  | 'status'
  | 'date_of_birth'
  | 'start_date'
  | 'blocks_per_week'
  | 'rate_per_session'
  | 'notes'
  | 'family_name'
  | 'primary_contact_name'
  | 'primary_phone'
  | 'primary_email'
  | 'location'
  | 'teacher_name'
  | 'square_customer_id'
  | 'emergency_contact_name'
  | 'emergency_contact_phone'
  | ''

const TARGET_FIELDS: { value: TargetField; label: string; required?: boolean }[] = [
  { value: 'first_name', label: 'First Name', required: true },
  { value: 'last_name', label: 'Last Name', required: true },
  { value: 'instrument', label: 'Instrument' },
  { value: 'status', label: 'Status' },
  { value: 'date_of_birth', label: 'Date of Birth' },
  { value: 'start_date', label: 'Start Date' },
  { value: 'blocks_per_week', label: 'Blocks / Week' },
  { value: 'rate_per_session', label: 'Rate / Session' },
  { value: 'notes', label: 'Notes' },
  { value: 'family_name', label: 'Family Name' },
  { value: 'primary_contact_name', label: 'Parent / Guardian' },
  { value: 'primary_phone', label: 'Phone' },
  { value: 'primary_email', label: 'Email' },
  { value: 'location', label: 'Location' },
  { value: 'teacher_name', label: 'Teacher' },
  { value: 'square_customer_id', label: 'Square Customer ID' },
  { value: 'emergency_contact_name', label: 'Emergency Contact Name' },
  { value: 'emergency_contact_phone', label: 'Emergency Contact Phone' },
]

interface ImportResult {
  imported: number
  skipped: number
  familiesCreated: number
  warnings: string[]
}

interface Props {
  locations: Location[]
  teachers: { id: string; first_name?: string; last_name?: string; profile?: { first_name: string; last_name: string } }[]
  families: { id: string; name: string; primary_email: string | null; primary_phone: string | null }[]
  onClose: () => void
}

// ---------------------------------------------------------------------------
// CSV Parsing
// ---------------------------------------------------------------------------

function parseCsvText(text: string): { headers: string[]; rows: string[][] } {
  const lines = text.split(/\r?\n/).filter((l) => l.trim())
  if (lines.length < 1) return { headers: [], rows: [] }

  const parse = (line: string): string[] => {
    const fields: string[] = []
    let current = ''
    let inQuotes = false
    for (const char of line) {
      if (char === '"') { inQuotes = !inQuotes; continue }
      if (char === ',' && !inQuotes) { fields.push(current.trim()); current = ''; continue }
      current += char
    }
    fields.push(current.trim())
    return fields
  }

  const headers = parse(lines[0])
  const rows = lines.slice(1).map(parse)
  return { headers, rows }
}

// ---------------------------------------------------------------------------
// Auto-detection
// ---------------------------------------------------------------------------

/** Exact header mappings from popular platforms */
const EXACT_MAPPINGS: Record<string, TargetField> = {
  // Square
  'first name': 'first_name',
  'last name': 'last_name',
  'email address': 'primary_email',
  'phone number': 'primary_phone',
  'birthday': 'date_of_birth',
  'square customer id': 'square_customer_id',
  'parent': 'primary_contact_name',
  'primary location': 'location',
  'emergency contact name': 'emergency_contact_name',
  'emergency contact phone number': 'emergency_contact_phone',
  'memo': 'notes',

  // My Music Staff
  'student first name': 'first_name',
  'student last name': 'last_name',
  'parent/guardian': 'primary_contact_name',
  'email': 'primary_email',
  'phone': 'primary_phone',
  'mobile': 'primary_phone',
  'instrument': 'instrument',
  'teacher': 'teacher_name',

  // Opus1
  'primary email': 'primary_email',
  'primary phone': 'primary_phone',
  'guardian name': 'primary_contact_name',
}

/** Fuzzy / pattern-based fallback */
function detectFieldByPattern(header: string): TargetField {
  const h = header.toLowerCase()
  if (h.includes('first') && h.includes('name')) return 'first_name'
  if (h.includes('last') && h.includes('name')) return 'last_name'
  if (h.includes('email')) return 'primary_email'
  if (h.includes('phone')) return 'primary_phone'
  if (h.includes('parent') || h.includes('guardian')) return 'primary_contact_name'
  if (h.includes('instrument')) return 'instrument'
  if (h.includes('birthday') || h.includes('dob') || h.includes('birth')) return 'date_of_birth'
  if (h.includes('location')) return 'location'
  if (h.includes('teacher')) return 'teacher_name'
  if (h.includes('note') || h.includes('memo')) return 'notes'
  if (h.includes('status')) return 'status'
  if (h.includes('family')) return 'family_name'
  if (h.includes('rate')) return 'rate_per_session'
  if (h.includes('start') && h.includes('date')) return 'start_date'
  if (h.includes('square') && h.includes('id')) return 'square_customer_id'
  if (h.includes('emergency') && h.includes('phone')) return 'emergency_contact_phone'
  if (h.includes('emergency') && h.includes('name')) return 'emergency_contact_name'
  return ''
}

function autoDetectMappings(headers: string[]): Record<number, TargetField> {
  const mappings: Record<number, TargetField> = {}
  const used = new Set<TargetField>()

  // Pass 1: exact matches
  headers.forEach((h, i) => {
    const norm = h.toLowerCase().trim()
    const match = EXACT_MAPPINGS[norm]
    if (match && !used.has(match)) {
      mappings[i] = match
      used.add(match)
    }
  })

  // Pass 2: pattern-based for unmapped columns
  headers.forEach((h, i) => {
    if (mappings[i]) return
    const match = detectFieldByPattern(h)
    if (match && !used.has(match)) {
      mappings[i] = match
      used.add(match)
    }
  })

  return mappings
}

// ---------------------------------------------------------------------------
// Fuzzy matching helpers
// ---------------------------------------------------------------------------

function fuzzyMatchLocation(name: string, locations: Location[]): string | null {
  if (!name) return null
  const n = name.toLowerCase().trim()
  // Exact
  const exact = locations.find((l) => l.name.toLowerCase() === n)
  if (exact) return exact.id
  // Contains
  const partial = locations.find((l) => l.name.toLowerCase().includes(n) || n.includes(l.name.toLowerCase().replace(' music lessons', '')))
  if (partial) return partial.id
  // Word match (e.g., "Omaha" matches "Omaha Music Lessons")
  const word = locations.find((l) => {
    const words = n.split(/\s+/)
    return words.some((w) => w.length > 2 && l.name.toLowerCase().includes(w))
  })
  return word?.id ?? null
}

function fuzzyMatchTeacher(
  name: string,
  teachers: Props['teachers'],
): string | null {
  if (!name) return null
  const n = name.toLowerCase().trim()
  for (const t of teachers) {
    const fn = (t.first_name ?? t.profile?.first_name ?? '').toLowerCase()
    const ln = (t.last_name ?? t.profile?.last_name ?? '').toLowerCase()
    const full = `${fn} ${ln}`.trim()
    if (full === n) return t.id
    if (n.includes(fn) && n.includes(ln)) return t.id
    if (fn && ln && (n === fn || n === ln || n === `${fn} ${ln}` || n === `${ln}, ${fn}`)) return t.id
  }
  return null
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function StudentImportModal({ locations, teachers, families, onClose }: Props) {
  const { tenantId } = useAuthContext()
  const qc = useQueryClient()
  const fileRef = useRef<HTMLInputElement>(null)

  // State
  const [step, setStep] = useState<Step>('upload')
  const [headers, setHeaders] = useState<string[]>([])
  const [rows, setRows] = useState<string[][]>([])
  const [mappings, setMappings] = useState<Record<number, TargetField>>({})
  const [importing, setImporting] = useState(false)
  const [result, setResult] = useState<ImportResult | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [fileName, setFileName] = useState('')

  // ---- Upload handlers ----
  const processFile = useCallback((file: File) => {
    setFileName(file.name)
    const reader = new FileReader()
    reader.onload = (ev) => {
      const text = ev.target?.result as string
      const { headers: h, rows: r } = parseCsvText(text)
      setHeaders(h)
      setRows(r)
      setMappings(autoDetectMappings(h))
    }
    reader.readAsText(file)
  }, [])

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) processFile(file)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files?.[0]
    if (file && file.name.endsWith('.csv')) processFile(file)
  }

  // ---- Mapping helpers ----
  const setMapping = (colIdx: number, field: TargetField) => {
    setMappings((prev) => {
      const next = { ...prev }
      if (field === '') {
        delete next[colIdx]
      } else {
        // Remove field from any other column first
        for (const k of Object.keys(next)) {
          if (next[Number(k)] === field) delete next[Number(k)]
        }
        next[colIdx] = field
      }
      return next
    })
  }

  const mappedFields = new Set(Object.values(mappings))
  const hasRequired = mappedFields.has('first_name') && mappedFields.has('last_name')

  // ---- Build preview data for review step ----
  const getVal = (row: string[], field: TargetField): string => {
    for (const [idx, f] of Object.entries(mappings)) {
      if (f === field) return row[Number(idx)] ?? ''
    }
    return ''
  }

  const validRows = rows.filter((r) => {
    const fn = getVal(r, 'first_name').trim()
    const ln = getVal(r, 'last_name').trim()
    return fn && ln
  })

  const skippedRows = rows.filter((r) => {
    const fn = getVal(r, 'first_name').trim()
    const ln = getVal(r, 'last_name').trim()
    return !fn || !ln
  })

  // Detect potential duplicates against existing families by last_name + email
  const existingFamilyKeys = new Set(
    families.map((f) => `${f.name.toLowerCase()}|${(f.primary_email ?? '').toLowerCase()}`),
  )

  const duplicateCount = validRows.filter((r) => {
    const ln = getVal(r, 'last_name').trim()
    const email = getVal(r, 'primary_email').trim()
    const famName = getVal(r, 'family_name').trim() || `${ln} Family`
    return existingFamilyKeys.has(`${famName.toLowerCase()}|${email.toLowerCase()}`)
  }).length

  // ---- Import logic ----
  const handleImport = async () => {
    if (!tenantId) return
    setImporting(true)

    let imported = 0
    let skipped = 0
    let familiesCreated = 0
    const warnings: string[] = []

    // Build lookup maps
    const familyByKey = new Map<string, string>()
    families.forEach((f) => {
      familyByKey.set(`${f.name.toLowerCase()}|${(f.primary_email ?? '').toLowerCase()}`, f.id)
    })

    for (const row of rows) {
      const firstName = getVal(row, 'first_name').trim()
      const lastName = getVal(row, 'last_name').trim()
      if (!firstName || !lastName) { skipped++; continue }

      try {
        const email = getVal(row, 'primary_email').trim()
        const phone = getVal(row, 'primary_phone').trim()
        const parentName = getVal(row, 'primary_contact_name').trim()
        const famNameRaw = getVal(row, 'family_name').trim()
        const familyName = famNameRaw || `${lastName} Family`

        // -- Resolve or create family --
        const famKey = `${familyName.toLowerCase()}|${email.toLowerCase()}`
        let familyId = familyByKey.get(famKey)

        if (!familyId) {
          // Try match by family name only (without email)
          const byNameOnly = families.find((f) => f.name.toLowerCase() === familyName.toLowerCase())
          if (byNameOnly) {
            familyId = byNameOnly.id
          } else {
            // Create new family
            const { data: newFam, error: famErr } = await supabase
              .from('families')
              .insert({
                tenant_id: tenantId,
                name: familyName,
                primary_contact_name: parentName || null,
                primary_email: email || null,
                primary_phone: phone || null,
              })
              .select('id')
              .single()

            if (famErr) {
              warnings.push(`${firstName} ${lastName}: Failed to create family — ${famErr.message}`)
              skipped++
              continue
            }
            familyId = newFam.id
            familyByKey.set(famKey, familyId)
            familiesCreated++
          }
        }

        // -- Resolve location --
        const locationName = getVal(row, 'location').trim()
        const locationId = fuzzyMatchLocation(locationName, locations) ?? locations[0]?.id ?? null

        // -- Resolve teacher --
        const teacherName = getVal(row, 'teacher_name').trim()
        const teacherId = fuzzyMatchTeacher(teacherName, teachers)

        // -- Parse optional fields --
        const instrument = getVal(row, 'instrument').trim().toLowerCase() || null
        const status = getVal(row, 'status').trim().toLowerCase()
        const dob = getVal(row, 'date_of_birth').trim() || null
        const startDate = getVal(row, 'start_date').trim() || null
        const blocksRaw = parseInt(getVal(row, 'blocks_per_week').trim())
        const rateRaw = parseFloat(getVal(row, 'rate_per_session').trim())
        const notes = getVal(row, 'notes').trim() || null
        const squareId = getVal(row, 'square_customer_id').trim() || null
        const emergName = getVal(row, 'emergency_contact_name').trim() || null
        const emergPhone = getVal(row, 'emergency_contact_phone').trim() || null

        // Build student insert
        const studentInsert: Record<string, unknown> = {
          tenant_id: tenantId,
          family_id: familyId,
          first_name: firstName,
          last_name: lastName,
          instrument,
          status: ['active', 'inactive', 'former'].includes(status) ? status : 'active',
          date_of_birth: dob ? normalizeDate(dob) : null,
          start_date: startDate ? normalizeDate(startDate) : null,
          blocks_per_week: isNaN(blocksRaw) ? 1 : blocksRaw,
          rate_per_session: isNaN(rateRaw) ? 45 : rateRaw,
          notes: [notes, squareId ? `Square ID: ${squareId}` : '', emergName ? `Emergency: ${emergName}` : '', emergPhone ? `Emergency Phone: ${emergPhone}` : ''].filter(Boolean).join('\n') || null,
          location_id: locationId,
          teacher_id: teacherId,
        }

        const { error: stuErr } = await supabase.from('students').insert(studentInsert)
        if (stuErr) {
          warnings.push(`${firstName} ${lastName}: ${stuErr.message}`)
          skipped++
        } else {
          imported++
        }
      } catch (err: any) {
        warnings.push(`${firstName} ${lastName}: ${err.message}`)
        skipped++
      }
    }

    setResult({ imported, skipped, familiesCreated, warnings })
    setImporting(false)
    if (imported > 0) {
      void Promise.all([
        qc.invalidateQueries({ queryKey: ['students'] }),
        qc.invalidateQueries({ queryKey: ['students_roster'] }),
        qc.invalidateQueries({ queryKey: ['student-instruments'] }),
        qc.invalidateQueries({ queryKey: ['student-tab-counts'] }),
        qc.invalidateQueries({ queryKey: ['families'] }),
        qc.invalidateQueries({ queryKey: ['families_page'] }),
        qc.invalidateQueries({ queryKey: ['families_roster'] }),
        qc.invalidateQueries({ queryKey: ['family-tab-counts'] }),
      ])
    }
  }

  // ---- Date normalization ----
  function normalizeDate(raw: string): string | null {
    // Try ISO first
    if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10)
    // MM/DD/YYYY
    const mdy = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/)
    if (mdy) return `${mdy[3]}-${mdy[1].padStart(2, '0')}-${mdy[2].padStart(2, '0')}`
    // MM/DD/YY
    const mdy2 = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2})$/)
    if (mdy2) {
      const yr = parseInt(mdy2[3])
      const full = yr > 50 ? 1900 + yr : 2000 + yr
      return `${full}-${mdy2[1].padStart(2, '0')}-${mdy2[2].padStart(2, '0')}`
    }
    return null
  }

  // ---- Detected platform ----
  const detectedPlatform = (() => {
    const joined = headers.join('|').toLowerCase()
    if (joined.includes('square customer id')) return 'Square'
    if (joined.includes('student first name') || joined.includes('parent/guardian')) return 'My Music Staff'
    if (joined.includes('guardian name') || joined.includes('primary email')) return 'Opus1'
    return null
  })()

  // ---- Render ----
  const stepIdx = step === 'upload' ? 0 : step === 'map' ? 1 : 2

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 720, maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
        {/* Header */}
        <div className="modal-header">
          <h2 style={{ fontSize: 16, fontWeight: 700 }}>Import Students from CSV</h2>
          <button className="btn-ghost" onClick={onClose} style={{ padding: '4px 8px' }}>✕</button>
        </div>

        {/* Step Indicator */}
        <div style={{ display: 'flex', gap: 0, padding: '0 24px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          {['Upload', 'Map Columns', 'Review & Import'].map((label, i) => (
            <div key={label} style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{
                width: 24, height: 24, borderRadius: '50%', fontSize: 11, fontWeight: 700,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: i <= stepIdx ? 'linear-gradient(135deg, #D4226A, #A8195A)' : 'rgba(255,255,255,0.06)',
                color: i <= stepIdx ? '#fff' : '#8080A8',
                transition: 'all 200ms ease',
              }}>
                {i + 1}
              </div>
              <span style={{
                fontSize: 12, fontWeight: i === stepIdx ? 700 : 500,
                color: i <= stepIdx ? '#E0E0F4' : '#8080A8',
              }}>
                {label}
              </span>
              {i < 2 && (
                <div style={{ flex: 1, height: 1, background: i < stepIdx ? 'rgba(212,34,106,0.3)' : 'rgba(255,255,255,0.06)', margin: '0 8px' }} />
              )}
            </div>
          ))}
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>

          {/* ---- STEP 1: UPLOAD ---- */}
          {step === 'upload' && (
            <>
              {/* Drop zone */}
              <div
                onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                onClick={() => fileRef.current?.click()}
                style={{
                  border: `2px dashed ${dragOver ? '#D4226A' : 'rgba(255,255,255,0.1)'}`,
                  borderRadius: 12,
                  padding: '40px 20px',
                  textAlign: 'center',
                  cursor: 'pointer',
                  background: dragOver ? 'rgba(212,34,106,0.04)' : 'rgba(255,255,255,0.02)',
                  transition: 'all 200ms ease',
                }}
              >
                <div style={{ fontSize: 28, marginBottom: 8 }}>&#128196;</div>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#E0E0F4', marginBottom: 4 }}>
                  {fileName || 'Drop a CSV file here or click to browse'}
                </div>
                <div style={{ fontSize: 12, color: '#8080A8' }}>
                  Supports Square, My Music Staff, Opus1, and generic CSV formats
                </div>
                <input ref={fileRef} type="file" accept=".csv" onChange={handleFileChange} style={{ display: 'none' }} />
              </div>

              {/* Preview */}
              {headers.length > 0 && (
                <>
                  {detectedPlatform && (
                    <div style={{
                      marginTop: 16, padding: '8px 14px', borderRadius: 8,
                      background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.15)',
                      fontSize: 12, color: '#22C55E', fontWeight: 600,
                    }}>
                      Detected format: {detectedPlatform}
                    </div>
                  )}
                  <div style={{ marginTop: 16, fontSize: 13, color: '#A0A0C8', fontWeight: 600, marginBottom: 8 }}>
                    Preview (first {Math.min(5, rows.length)} of {rows.length} rows)
                  </div>
                  <div style={{ overflowX: 'auto', borderRadius: 8, border: '1px solid rgba(255,255,255,0.06)' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                      <thead>
                        <tr>
                          {headers.map((h, i) => (
                            <th key={i} style={{
                              padding: '8px 10px', textAlign: 'left', fontWeight: 700,
                              color: '#A0A0C8', borderBottom: '1px solid rgba(255,255,255,0.06)',
                              background: 'rgba(255,255,255,0.02)', whiteSpace: 'nowrap',
                            }}>
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {rows.slice(0, 5).map((r, ri) => (
                          <tr key={ri}>
                            {headers.map((_, ci) => (
                              <td key={ci} style={{
                                padding: '6px 10px', color: '#C0C0E0',
                                borderBottom: '1px solid rgba(255,255,255,0.03)',
                                whiteSpace: 'nowrap', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis',
                              }}>
                                {r[ci] ?? ''}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </>
          )}

          {/* ---- STEP 2: MAP COLUMNS ---- */}
          {step === 'map' && (
            <>
              <div style={{ fontSize: 13, color: '#A0A0C8', marginBottom: 16 }}>
                Map your CSV columns to student fields. We auto-detected what we could{detectedPlatform ? ` from ${detectedPlatform}` : ''}.
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {headers.map((h, i) => {
                  const sampleVal = rows[0]?.[i] ?? ''
                  return (
                    <div key={i} style={{
                      display: 'flex', alignItems: 'center', gap: 12,
                      padding: '10px 14px', borderRadius: 8,
                      background: mappings[i] ? 'rgba(212,34,106,0.04)' : 'rgba(255,255,255,0.02)',
                      border: `1px solid ${mappings[i] ? 'rgba(212,34,106,0.12)' : 'rgba(255,255,255,0.04)'}`,
                    }}>
                      {/* CSV column info */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: '#E0E0F4' }}>{h}</div>
                        <div style={{ fontSize: 11, color: '#8080A8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {sampleVal ? `e.g. "${sampleVal}"` : '(empty)'}
                        </div>
                      </div>

                      {/* Arrow */}
                      <span style={{ fontSize: 14, color: '#606088' }}>&rarr;</span>

                      {/* Dropdown */}
                      <select
                        value={mappings[i] ?? ''}
                        onChange={(e) => setMapping(i, e.target.value as TargetField)}
                        className="filter-select"
                        style={{
                          width: 200, fontSize: 12, padding: '6px 10px',
                          background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
                          borderRadius: 6, color: '#E0E0F4',
                        }}
                      >
                        <option value="">-- Skip --</option>
                        {TARGET_FIELDS.map((tf) => (
                          <option
                            key={tf.value}
                            value={tf.value}
                            disabled={mappedFields.has(tf.value) && mappings[i] !== tf.value}
                          >
                            {tf.label}{tf.required ? ' *' : ''}
                          </option>
                        ))}
                      </select>
                    </div>
                  )
                })}
              </div>

              {!hasRequired && (
                <div style={{
                  marginTop: 16, padding: '10px 14px', borderRadius: 8,
                  background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.15)',
                  fontSize: 12, color: '#EF4444',
                }}>
                  First Name and Last Name are required. Please map them before continuing.
                </div>
              )}
            </>
          )}

          {/* ---- STEP 3: REVIEW & IMPORT ---- */}
          {step === 'review' && !result && (
            <>
              <div style={{ fontSize: 13, color: '#A0A0C8', marginBottom: 20 }}>
                Review before importing. This will create student and family records.
              </div>

              {/* Summary cards */}
              <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
                {[
                  { label: 'Ready to Import', value: validRows.length, color: '#22C55E' },
                  { label: 'Will Be Skipped', value: skippedRows.length, color: '#EF4444' },
                  { label: 'Possible Duplicates', value: duplicateCount, color: '#F59E0B' },
                ].map((card) => (
                  <div key={card.label} style={{
                    flex: 1, padding: '14px 16px', borderRadius: 10,
                    background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)',
                    textAlign: 'center',
                  }}>
                    <div style={{ fontSize: 24, fontWeight: 700, color: card.color }}>{card.value}</div>
                    <div style={{ fontSize: 11, color: '#8080A8', marginTop: 2 }}>{card.label}</div>
                  </div>
                ))}
              </div>

              {/* Mapped fields summary */}
              <div style={{ fontSize: 12, color: '#8080A8', marginBottom: 12 }}>
                <strong style={{ color: '#A0A0C8' }}>Mapped fields:</strong>{' '}
                {Object.values(mappings).map((f) => TARGET_FIELDS.find((tf) => tf.value === f)?.label).join(', ')}
              </div>

              {/* Warnings */}
              {skippedRows.length > 0 && (
                <div style={{
                  padding: '10px 14px', borderRadius: 8, marginBottom: 12,
                  background: 'rgba(239,68,68,0.04)', border: '1px solid rgba(239,68,68,0.1)',
                  fontSize: 12, color: '#EF4444',
                }}>
                  {skippedRows.length} row{skippedRows.length !== 1 ? 's' : ''} will be skipped (missing first or last name).
                </div>
              )}

              {duplicateCount > 0 && (
                <div style={{
                  padding: '10px 14px', borderRadius: 8, marginBottom: 12,
                  background: 'rgba(245,158,11,0.04)', border: '1px solid rgba(245,158,11,0.1)',
                  fontSize: 12, color: '#F59E0B',
                }}>
                  {duplicateCount} row{duplicateCount !== 1 ? 's' : ''} may match existing families (by name + email). They will still be imported as new students.
                </div>
              )}

              {/* Preview of first few records */}
              <div style={{ fontSize: 12, fontWeight: 600, color: '#A0A0C8', marginBottom: 8, marginTop: 8 }}>
                First {Math.min(5, validRows.length)} records:
              </div>
              <div style={{ overflowX: 'auto', borderRadius: 8, border: '1px solid rgba(255,255,255,0.06)' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                  <thead>
                    <tr>
                      {['Name', 'Instrument', 'Parent', 'Email', 'Location', 'Teacher'].map((h) => (
                        <th key={h} style={{
                          padding: '8px 10px', textAlign: 'left', fontWeight: 700,
                          color: '#A0A0C8', borderBottom: '1px solid rgba(255,255,255,0.06)',
                          background: 'rgba(255,255,255,0.02)', whiteSpace: 'nowrap',
                        }}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {validRows.slice(0, 5).map((r, i) => (
                      <tr key={i}>
                        <td style={{ padding: '6px 10px', color: '#E0E0F4', borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                          {getVal(r, 'first_name')} {getVal(r, 'last_name')}
                        </td>
                        <td style={{ padding: '6px 10px', color: '#C0C0E0', borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                          {getVal(r, 'instrument') ? instrumentWithEmojiTitle(getVal(r, 'instrument')) : '—'}
                        </td>
                        <td style={{ padding: '6px 10px', color: '#C0C0E0', borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                          {getVal(r, 'primary_contact_name') || '—'}
                        </td>
                        <td style={{ padding: '6px 10px', color: '#C0C0E0', borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                          {getVal(r, 'primary_email') || '—'}
                        </td>
                        <td style={{ padding: '6px 10px', color: '#C0C0E0', borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                          {getVal(r, 'location') || '—'}
                        </td>
                        <td style={{ padding: '6px 10px', color: '#C0C0E0', borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                          {getVal(r, 'teacher_name') || '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {/* ---- RESULT ---- */}
          {result && (
            <div style={{ textAlign: 'center', padding: '20px 0' }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>{result.imported > 0 ? '\u2705' : '\u26A0\uFE0F'}</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: '#E0E0F4', marginBottom: 8 }}>
                Import Complete
              </div>
              <div style={{ display: 'flex', gap: 16, justifyContent: 'center', marginBottom: 20 }}>
                <div>
                  <div style={{ fontSize: 22, fontWeight: 700, color: '#22C55E' }}>{result.imported}</div>
                  <div style={{ fontSize: 11, color: '#8080A8' }}>Imported</div>
                </div>
                <div>
                  <div style={{ fontSize: 22, fontWeight: 700, color: '#EF4444' }}>{result.skipped}</div>
                  <div style={{ fontSize: 11, color: '#8080A8' }}>Skipped</div>
                </div>
                <div>
                  <div style={{ fontSize: 22, fontWeight: 700, color: '#8B5CF6' }}>{result.familiesCreated}</div>
                  <div style={{ fontSize: 11, color: '#8080A8' }}>Families Created</div>
                </div>
              </div>
              {result.warnings.length > 0 && (
                <div style={{
                  textAlign: 'left', maxHeight: 160, overflowY: 'auto',
                  padding: '12px 14px', borderRadius: 8,
                  background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)',
                }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#F59E0B', marginBottom: 6 }}>Warnings:</div>
                  {result.warnings.map((w, i) => (
                    <div key={i} style={{ fontSize: 11, color: '#A0A0C8', marginBottom: 3 }}>{w}</div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '16px 24px', borderTop: '1px solid rgba(255,255,255,0.06)',
        }}>
          <div>
            {step !== 'upload' && !result && (
              <button
                className="btn-ghost"
                onClick={() => setStep(step === 'map' ? 'upload' : 'map')}
                style={{ fontSize: 12 }}
              >
                &larr; Back
              </button>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn-ghost" onClick={onClose} style={{ fontSize: 12 }}>
              {result ? 'Close' : 'Cancel'}
            </button>
            {step === 'upload' && headers.length > 0 && (
              <button className="btn-primary" onClick={() => setStep('map')} style={{ fontSize: 12 }}>
                Next: Map Columns
              </button>
            )}
            {step === 'map' && hasRequired && (
              <button className="btn-primary" onClick={() => setStep('review')} style={{ fontSize: 12 }}>
                Next: Review
              </button>
            )}
            {step === 'review' && !result && (
              <button
                className="btn-primary"
                onClick={handleImport}
                disabled={importing || validRows.length === 0}
                style={{ fontSize: 12 }}
              >
                {importing ? 'Importing...' : `Import ${validRows.length} Student${validRows.length !== 1 ? 's' : ''}`}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
