import { useState, useCallback } from 'react'
import { useAuthContext } from '../../app/AuthContext'
import { supabase } from '../../lib/supabase'
import { useQueryClient } from '@tanstack/react-query'
import { parseCsv } from '../../hooks/useImport'
import { toast } from '../../components/shared/Toast'
import MusicLoader from '../../components/shared/MusicLoader'
import { Upload, Check, AlertTriangle } from 'lucide-react'

type Step = 'upload' | 'map' | 'preview' | 'importing' | 'done'

const TARGET_FIELDS = [
  { key: 'first_name', label: 'Student First Name', required: true },
  { key: 'last_name', label: 'Student Last Name', required: false },
  { key: 'instrument', label: 'Instrument', required: false },
  { key: 'parent_name', label: 'Parent Name', required: false },
  { key: 'parent_email', label: 'Parent Email', required: false },
  { key: 'parent_phone', label: 'Parent Phone', required: false },
  { key: 'location', label: 'Location', required: false },
  { key: 'teacher', label: 'Teacher', required: false },
  { key: 'age', label: 'Age', required: false },
  { key: 'notes', label: 'Notes', required: false },
]

// Auto-detect column mapping from header names
function autoMap(headers: string[]): Record<string, string> {
  const map: Record<string, string> = {}
  const patterns: Record<string, RegExp[]> = {
    first_name: [/^first/i, /^student.*first/i, /^fname/i],
    last_name: [/^last/i, /^student.*last/i, /^lname/i, /^surname/i],
    instrument: [/^instrument/i, /^subject/i],
    parent_name: [/^parent/i, /^guardian/i, /^contact.*name/i, /^mother|^father/i],
    parent_email: [/email/i, /^e-?mail/i],
    parent_phone: [/phone/i, /^tel/i, /^mobile/i, /^cell/i],
    location: [/^location/i, /^studio/i, /^site/i, /^branch/i],
    teacher: [/^teacher/i, /^instructor/i],
    age: [/^age/i, /^birth/i, /^dob/i],
    notes: [/^note/i, /^comment/i],
  }
  for (const h of headers) {
    for (const [field, rxs] of Object.entries(patterns)) {
      if (map[field]) continue
      if (rxs.some(rx => rx.test(h))) { map[field] = h; break }
    }
  }
  // If "name" column exists but no first/last, try to use it
  if (!map.first_name) {
    const nameCol = headers.find(h => /^name$/i.test(h) || /^student.*name$/i.test(h) || /^full.*name$/i.test(h))
    if (nameCol) map.first_name = nameCol
  }
  return map
}

export default function Import() {
  const { tenantId } = useAuthContext()
  const qc = useQueryClient()
  const [step, setStep] = useState<Step>('upload')
  const [headers, setHeaders] = useState<string[]>([])
  const [rows, setRows] = useState<Record<string, string>[]>([])
  const [mapping, setMapping] = useState<Record<string, string>>({})
  const [results, setResults] = useState<{ imported: number; skipped: number; errors: string[] }>({ imported: 0, skipped: 0, errors: [] })

  const handleFile = useCallback((file: File) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      const text = e.target?.result as string
      const parsed = parseCsv(text)
      setHeaders(parsed.headers)
      setRows(parsed.rows)
      setMapping(autoMap(parsed.headers))
      setStep('map')
    }
    reader.readAsText(file)
  }, [])

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }

  const getMapped = (row: Record<string, string>, field: string): string => {
    const col = mapping[field]
    return col ? (row[col] ?? '').trim() : ''
  }

  // Validate rows
  const validationResults = rows.map(row => {
    const firstName = getMapped(row, 'first_name')
    const email = getMapped(row, 'parent_email')
    const phone = getMapped(row, 'parent_phone')
    const hasContact = !!(email || phone)
    const issues: string[] = []
    if (!firstName) issues.push('Missing student name')
    if (!hasContact) issues.push('No parent email or phone')
    return { row, firstName, valid: firstName.length > 0, issues }
  })
  const validCount = validationResults.filter(r => r.valid).length
  const issueCount = validationResults.filter(r => !r.valid).length

  const handleImport = async () => {
    if (!tenantId) return
    setStep('importing')
    const res = { imported: 0, skipped: 0, errors: [] as string[] }

    const validRows = validationResults.filter(r => r.valid)

    // Get locations for matching
    const { data: locations } = await supabase.from('locations').select('id, name').eq('tenant_id', tenantId)
    const locMap = new Map((locations ?? []).map(l => [l.name?.toLowerCase().replace(' music lessons', '') ?? '', l.id]))

    for (let i = 0; i < validRows.length; i += 50) {
      const batch = validRows.slice(i, i + 50)
      for (const { row } of batch) {
        try {
          const firstName = getMapped(row, 'first_name')
          const lastName = getMapped(row, 'last_name')
          const parentEmail = getMapped(row, 'parent_email')
          const parentPhone = getMapped(row, 'parent_phone')
          const parentName = getMapped(row, 'parent_name')
          const instrument = getMapped(row, 'instrument')?.toLowerCase()
          const locationStr = getMapped(row, 'location')?.toLowerCase()
          const age = getMapped(row, 'age')

          // Split name if single "name" column was mapped to first_name
          let fn = firstName, ln = lastName
          if (!ln && firstName.includes(' ')) {
            const parts = firstName.split(/\s+/)
            fn = parts[0]
            ln = parts.slice(1).join(' ')
          }

          // Find or create family
          let familyId: string | null = null
          if (parentEmail) {
            const { data: existing } = await supabase.from('families').select('id').ilike('primary_email', parentEmail).limit(1).single()
            if (existing) {
              familyId = existing.id
            }
          }
          if (!familyId) {
            const famName = ln ? `The ${ln} Family` : `${fn}'s Family`
            const { data: newFam } = await supabase.from('families').insert({
              tenant_id: tenantId,
              name: famName,
              parent_name: parentName || null,
              primary_email: parentEmail || null,
              primary_phone: parentPhone || null,
              billing_status: 'active',
              is_military: false,
              balance: 0,
            }).select('id').single()
            familyId = newFam?.id ?? null
          }

          if (!familyId) { res.skipped++; continue }

          // Match location
          const locationId = locationStr ? (locMap.get(locationStr) ?? null) : null

          // Create student
          await supabase.from('students').insert({
            tenant_id: tenantId,
            family_id: familyId,
            first_name: fn,
            last_name: ln || '',
            instrument: instrument || null,
            status: 'active',
            location_id: locationId,
            age: age ? parseInt(age) || null : null,
          })

          res.imported++
        } catch (err: any) {
          res.skipped++
          res.errors.push(`${getMapped(row, 'first_name')}: ${err.message}`)
        }
      }
    }

    setResults(res)
    setStep('done')
    qc.invalidateQueries({ queryKey: ['students'] })
    qc.invalidateQueries({ queryKey: ['families'] })
    qc.invalidateQueries({ queryKey: ['onboarding-mode'] })
    qc.invalidateQueries({ queryKey: ['onboarding-checklist'] })
  }

  return (
    <div className="page" style={{ maxWidth: 700, margin: '0 auto' }}>
      <div className="page-header"><h1>Import Students</h1></div>

      {/* Upload */}
      {step === 'upload' && (
        <div onDragOver={e => e.preventDefault()} onDrop={handleDrop} style={{
          padding: 48, borderRadius: 16, textAlign: 'center', cursor: 'pointer',
          background: 'rgba(255,255,255,0.02)', border: '2px dashed rgba(255,255,255,0.1)',
        }} onClick={() => { const i = document.createElement('input'); i.type = 'file'; i.accept = '.csv,.xlsx,.txt'; i.onchange = (e) => { const f = (e.target as HTMLInputElement).files?.[0]; if (f) handleFile(f) }; i.click() }}>
          <Upload size={32} style={{ color: '#8080A8', marginBottom: 12 }} />
          <div style={{ fontSize: 16, fontWeight: 700, color: '#E0E0F4', marginBottom: 4 }}>Drop your CSV file here</div>
          <div style={{ fontSize: 13, color: '#8080A8' }}>or click to browse. Accepts .csv files from any source.</div>
        </div>
      )}

      {/* Column Mapping */}
      {step === 'map' && (
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#E0E0F4', marginBottom: 12 }}>Map Your Columns</div>
          <div style={{ fontSize: 12, color: '#8080A8', marginBottom: 16 }}>We auto-detected some columns. Adjust if needed.</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
            {TARGET_FIELDS.map(f => (
              <div key={f.key} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ width: 140, fontSize: 12, color: f.required ? '#E0E0F4' : '#8080A8', fontWeight: f.required ? 700 : 400 }}>
                  {f.label}{f.required ? ' *' : ''}
                </span>
                <select value={mapping[f.key] ?? ''} onChange={e => setMapping({ ...mapping, [f.key]: e.target.value })} className="filter-select" style={{ flex: 1, fontSize: 12 }}>
                  <option value="">— Skip —</option>
                  {headers.map(h => <option key={h} value={h}>{h}</option>)}
                </select>
              </div>
            ))}
          </div>
          {/* Preview first 3 rows */}
          <div style={{ fontSize: 11, color: '#606088', marginBottom: 8 }}>Preview (first 3 rows):</div>
          <div style={{ overflow: 'auto', marginBottom: 16 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
              <thead><tr>{headers.slice(0, 6).map(h => <th key={h} style={{ padding: '4px 8px', textAlign: 'left', color: '#8080A8', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>{h}</th>)}</tr></thead>
              <tbody>{rows.slice(0, 3).map((r, i) => <tr key={i}>{headers.slice(0, 6).map(h => <td key={h} style={{ padding: '4px 8px', color: '#C0C0E0', borderBottom: '1px solid rgba(255,255,255,0.03)' }}>{r[h] ?? ''}</td>)}</tr>)}</tbody>
            </table>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => setStep('upload')} style={{ padding: '10px 20px', borderRadius: 8, background: 'rgba(255,255,255,0.06)', color: '#8080A8', border: '1px solid rgba(255,255,255,0.08)', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>Back</button>
            <button onClick={() => setStep('preview')} disabled={!mapping.first_name} style={{ flex: 1, padding: '10px 20px', borderRadius: 8, background: mapping.first_name ? '#f59e0b' : 'rgba(255,255,255,0.06)', color: mapping.first_name ? '#000' : '#606088', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>
              Review {rows.length} Rows
            </button>
          </div>
        </div>
      )}

      {/* Preview & Validate */}
      {step === 'preview' && (
        <div>
          <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
            <div style={{ flex: 1, padding: 16, borderRadius: 10, background: 'rgba(34,197,94,0.04)', border: '1px solid rgba(34,197,94,0.1)', textAlign: 'center' }}>
              <div style={{ fontSize: 28, fontWeight: 800, color: '#22C55E' }}>{validCount}</div>
              <div style={{ fontSize: 11, color: '#8080A8' }}>ready to import</div>
            </div>
            {issueCount > 0 && (
              <div style={{ flex: 1, padding: 16, borderRadius: 10, background: 'rgba(255,184,0,0.04)', border: '1px solid rgba(255,184,0,0.1)', textAlign: 'center' }}>
                <div style={{ fontSize: 28, fontWeight: 800, color: '#FFB800' }}>{issueCount}</div>
                <div style={{ fontSize: 11, color: '#8080A8' }}>will be skipped</div>
              </div>
            )}
          </div>
          {issueCount > 0 && (
            <div style={{ marginBottom: 16, maxHeight: 150, overflowY: 'auto' }}>
              {validationResults.filter(r => !r.valid).slice(0, 10).map((r, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 0', fontSize: 11, color: '#FFB800' }}>
                  <AlertTriangle size={10} /> Row {rows.indexOf(r.row) + 2}: {r.issues.join(', ')}
                </div>
              ))}
            </div>
          )}
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => setStep('map')} style={{ padding: '10px 20px', borderRadius: 8, background: 'rgba(255,255,255,0.06)', color: '#8080A8', border: '1px solid rgba(255,255,255,0.08)', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>Back</button>
            <button onClick={handleImport} style={{ flex: 1, padding: '12px 20px', borderRadius: 8, background: '#22C55E', color: '#000', border: 'none', cursor: 'pointer', fontSize: 14, fontWeight: 700, boxShadow: '0 2px 12px rgba(34,197,94,0.3)' }}>
              Import {validCount} Students
            </button>
          </div>
        </div>
      )}

      {/* Importing */}
      {step === 'importing' && (
        <div style={{ padding: 40, textAlign: 'center' }}><MusicLoader /><div style={{ marginTop: 12, color: '#8080A8' }}>Importing students...</div></div>
      )}

      {/* Done */}
      {step === 'done' && (
        <div style={{ textAlign: 'center', padding: 32 }}>
          <Check size={40} style={{ color: '#22C55E', marginBottom: 12 }} />
          <div style={{ fontSize: 22, fontWeight: 800, color: '#E0E0F4', marginBottom: 8 }}>Import Complete!</div>
          <div style={{ fontSize: 14, color: '#A0A0C8', marginBottom: 20 }}>{results.imported} students imported{results.skipped > 0 ? `, ${results.skipped} skipped` : ''}</div>
          <button onClick={() => { setStep('upload'); setRows([]); setHeaders([]); setMapping({}) }} style={{ padding: '10px 24px', borderRadius: 8, background: 'rgba(255,255,255,0.06)', color: '#A0A0C8', border: '1px solid rgba(255,255,255,0.08)', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
            Import More
          </button>
        </div>
      )}
    </div>
  )
}
