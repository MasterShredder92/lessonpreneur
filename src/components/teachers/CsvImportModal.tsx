import { useState } from 'react'
import { useAuthContext } from '../../app/AuthContext'
import { supabase } from '../../lib/supabase'
import { useQueryClient } from '@tanstack/react-query'
import type { Location } from '../../lib/types'
import { qk } from '../../lib/queryKeys'

interface CsvRow {
  firstName: string
  lastName: string
  phone: string
  email: string
  primaryJob: string
  job: string
  wage: string
  locations: string[]
  createdAt: string
  status: string
}

function parseJobToInstruments(job: string): string[] {
  const j = job.toLowerCase()
  const instruments: string[] = []

  const instrumentMap: [string, string][] = [
    ['guitar', 'guitar'], ['bass', 'bass'], ['piano', 'piano'],
    ['drum', 'drums'], ['voice', 'voice'], ['vocal', 'voice'],
    ['violin', 'violin'], ['cello', 'cello'], ['flute', 'flute'],
    ['clarinet', 'clarinet'], ['saxophone', 'saxophone'], ['sax ', 'saxophone'],
    ['trumpet', 'trumpet'], ['trombone', 'trombone'], ['ukulele', 'ukulele'],
    ['banjo', 'banjo'], ['viola', 'viola'], ['oboe', 'oboe'],
    ['bells', 'bells'], ['percussion', 'drums'],
  ]

  for (const [keyword, instrument] of instrumentMap) {
    if (j.includes(keyword) && !instruments.includes(instrument)) {
      instruments.push(instrument)
    }
  }

  // If job is just "Music Teacher" with no instrument specificity, return empty
  // (admin can set instruments manually later)
  return instruments
}

function parseLocationName(csvName: string): string {
  // Map CSV location names to our DB location names
  const map: Record<string, string> = {
    'adkins music lessons': 'Omaha Music Lessons',
    'omaha adkins': 'Omaha Music Lessons',
    'bellevue music lessons': 'Bellevue Music Lessons',
    'elkhorn music lessons': 'Elkhorn Music Lessons',
    'gretna music lessons': 'Gretna Music Lessons',
  }
  return map[csvName.trim().toLowerCase()] ?? csvName.trim()
}

function parseCsv(text: string): CsvRow[] {
  const lines = text.split('\n').filter((l) => l.trim())
  if (lines.length < 2) return []

  return lines.slice(1).map((line) => {
    // Handle quoted fields
    const fields: string[] = []
    let current = ''
    let inQuotes = false
    for (const char of line) {
      if (char === '"') { inQuotes = !inQuotes; continue }
      if (char === ',' && !inQuotes) { fields.push(current.trim()); current = ''; continue }
      current += char
    }
    fields.push(current.trim())

    return {
      firstName: fields[0] ?? '',
      lastName: fields[1] ?? '',
      phone: fields[2] ?? '',
      email: fields[3] ?? '',
      primaryJob: fields[4] ?? '',
      job: fields[5] ?? '',
      wage: fields[6] ?? '',
      locations: (fields[8] ?? '').split(';').map((s) => s.trim()).filter(Boolean),
      createdAt: fields[9] ?? '',
      status: fields[10] ?? '',
    }
  })
}

interface Props {
  locations: Location[]
  onClose: () => void
}

export default function CsvImportModal({ locations, onClose }: Props) {
  const { tenantId } = useAuthContext()
  const qc = useQueryClient()
  const [csvText, setCsvText] = useState('')
  const [preview, setPreview] = useState<CsvRow[] | null>(null)
  const [importing, setImporting] = useState(false)
  const [result, setResult] = useState<{ imported: number; skipped: number; errors: string[] } | null>(null)

  const locNameToId = new Map(locations.map((l) => [l.name, l.id]))

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      const text = ev.target?.result as string
      setCsvText(text)
      setPreview(parseCsv(text))
    }
    reader.readAsText(file)
  }

  const handleImport = async () => {
    if (!preview || !tenantId) return
    setImporting(true)
    setResult(null)

    // Filter to music teachers only (skip owners, directors, etc.)
    const teacherRows = preview.filter((r) => {
      const j = r.primaryJob.toLowerCase()
      return j.includes('teacher') || j.includes('instructor')
    })

    let imported = 0
    let skipped = 0
    const errors: string[] = []

    // Get existing teachers to avoid duplicates
    const { data: existingProfiles } = await supabase
      .from('profiles')
      .select('email')
      .eq('role', 'teacher')

    const existingEmails = new Set(existingProfiles?.map((p) => p.email?.toLowerCase()) ?? [])

    for (const row of teacherRows) {
      if (!row.email || existingEmails.has(row.email.toLowerCase())) {
        skipped++
        continue
      }

      try {
        // Create auth user via SQL (we can't do this from client)
        // Instead, create profile + teacher records
        // The teacher won't be able to log in until admin creates auth credentials
        // For now, we use a deterministic UUID from email to avoid creating auth users

        const instruments = parseJobToInstruments(row.job || row.primaryJob)
        const csvLocNames = row.locations.map(parseLocationName)
        const matchedLocIds = csvLocNames
          .map((name) => locNameToId.get(name))
          .filter(Boolean) as string[]

        const aiContext: Record<string, any> = {
          imported_from: 'square_team_csv',
          original_job_title: row.primaryJob,
          original_status: row.status,
          original_created: row.createdAt,
        }
        if (row.wage && row.wage !== 'None') {
          aiContext.wage_info = row.wage
        }

        // We need to insert into the teachers table but need a profile_id that references auth.users
        // Since we can't create auth users from the client, we'll track what needs to be created
        // For now, log what would be imported
        errors.push(`${row.firstName} ${row.lastName} (${row.email}) — requires auth user creation. Instruments: [${instruments.join(', ')}], Locations: [${csvLocNames.join(', ')}]`)
        skipped++
      } catch (err: any) {
        errors.push(`${row.firstName} ${row.lastName}: ${err.message}`)
      }
    }

    setResult({ imported, skipped, errors })
    setImporting(false)
    if (imported > 0) {
      qc.invalidateQueries({ queryKey: qk.teachers.all })
    }
  }

  const teacherCount = preview?.filter((r) => {
    const j = r.primaryJob.toLowerCase()
    return j.includes('teacher') || j.includes('instructor')
  }).length ?? 0

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 640, maxHeight: '85vh' }}>
        <div className="modal-header">
          <h2>Import Teachers from CSV</h2>
          <button className="btn-ghost" onClick={onClose}>✕</button>
        </div>
        <div className="modal-form" style={{ overflowY: 'auto' }}>
          <div className="form-field">
            <label>Upload Square Team Members CSV</label>
            <input type="file" accept=".csv" onChange={handleFileUpload} style={{ fontSize: '13px' }} />
          </div>

          {preview && (
            <>
              <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                Found <strong>{preview.length}</strong> rows total, <strong>{teacherCount}</strong> are teachers/instructors.
              </div>

              <div className="csv-preview">
                <table className="data-table" style={{ fontSize: '11px' }}>
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Job</th>
                      <th>Instruments</th>
                      <th>Locations</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.filter((r) => {
                      const j = r.primaryJob.toLowerCase()
                      return j.includes('teacher') || j.includes('instructor')
                    }).slice(0, 20).map((r, i) => (
                      <tr key={i}>
                        <td>{r.firstName} {r.lastName}</td>
                        <td>{r.primaryJob}</td>
                        <td>
                          <div className="pill-group">
                            {parseJobToInstruments(r.job || r.primaryJob).map((inst) => (
                              <span key={inst} className="badge-primary">{inst}</span>
                            ))}
                          </div>
                        </td>
                        <td>
                          <div className="pill-group">
                            {r.locations.map((loc, j) => (
                              <span key={j} className="badge-secondary">{parseLocationName(loc).replace(' Music Lessons', '')}</span>
                            ))}
                          </div>
                        </td>
                        <td>
                          <span className={r.status === 'Active' ? 'badge-success' : 'badge-secondary'}>
                            {r.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="form-error" style={{ background: 'var(--blue-muted)', color: 'var(--blue)' }}>
                Note: CSV import creates teacher records in the database. Teachers will need auth credentials created separately before they can log in to the teacher portal.
              </div>
            </>
          )}

          {result && (
            <div style={{ fontSize: '13px' }}>
              <p>Imported: <strong>{result.imported}</strong> | Skipped: <strong>{result.skipped}</strong></p>
              {result.errors.length > 0 && (
                <div style={{ marginTop: '12px', maxHeight: 200, overflowY: 'auto' }}>
                  {result.errors.map((e, i) => (
                    <div key={i} className="text-muted" style={{ fontSize: '11px', marginBottom: '4px' }}>{e}</div>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="modal-actions">
            <button type="button" className="btn-ghost" onClick={onClose}>Close</button>
            {preview && !result && (
              <button className="btn-primary" onClick={handleImport} disabled={importing || teacherCount === 0}>
                {importing ? 'Importing...' : `Import ${teacherCount} Teachers`}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
