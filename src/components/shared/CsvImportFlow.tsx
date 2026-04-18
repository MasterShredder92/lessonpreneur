import { useState, useRef } from 'react'
import { createPortal } from 'react-dom'
import MusicLoader from './MusicLoader'
import { parseCsv, type ImportPreview, type ImportResult, type ImportRow } from '../../hooks/useImport'
import { Upload, CheckCircle, AlertTriangle, XCircle, SkipForward, X } from 'lucide-react'

interface Props {
  title: string
  templateCsv: string
  templateFilename: string
  requiredColumns: string[]
  onCheck: (rows: Record<string, string>[]) => Promise<void>
  onRun: () => Promise<void>
  onReset: () => void
  status: 'idle' | 'checking' | 'ready' | 'importing' | 'done'
  progress: number
  preview: ImportPreview | null
  result: ImportResult | null
  onClose: () => void
}

const SUMMARY_BADGE_TOKENS: Record<string, { bg: string; border: string; color: string }> = {
  'Ready to import': { bg: 'var(--success-10)', border: 'var(--success-25)', color: 'var(--color-success)' },
  'Duplicates (skip)': { bg: 'var(--white-6)', border: 'var(--white-15)', color: 'var(--text-placard)' },
  'Possible duplicates': { bg: 'var(--warning-10)', border: 'var(--warning-25)', color: 'var(--color-warning)' },
  'Errors (skip)': { bg: 'var(--danger-10)', border: 'var(--danger-25)', color: 'var(--color-danger)' },
  Added: { bg: 'var(--success-10)', border: 'var(--success-25)', color: 'var(--color-success)' },
  Skipped: { bg: 'var(--white-6)', border: 'var(--white-15)', color: 'var(--text-placard)' },
  Failed: { bg: 'var(--danger-10)', border: 'var(--danger-25)', color: 'var(--color-danger)' },
}

export default function CsvImportFlow({ title, templateCsv, templateFilename, requiredColumns, onCheck, onRun, onReset, status, progress, preview, result, onClose }: Props) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [fileName, setFileName] = useState('')
  const [rowCount, setRowCount] = useState(0)
  const [parseError, setParseError] = useState<string | null>(null)
  const [page, setPage] = useState(0)
  const [statusFilter, setStatusFilter] = useState<string>('')

  const handleFile = async (file: File) => {
    setParseError(null)
    const text = await file.text()
    const { headers, rows } = parseCsv(text)

    // Validate required columns
    const missing = requiredColumns.filter(c => !headers.includes(c))
    if (missing.length > 0) {
      setParseError(`Missing required columns: ${missing.join(', ')}`)
      return
    }
    if (rows.length === 0) { setParseError('No data rows found'); return }

    setFileName(file.name)
    setRowCount(rows.length)
    await onCheck(rows)
  }

  const downloadTemplate = () => {
    const blob = new Blob([templateCsv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = templateFilename; a.click()
    URL.revokeObjectURL(url)
  }

  const handleClose = () => { onReset(); onClose() }

  // Filter preview rows
  const filteredRows = preview?.rows.filter(r => !statusFilter || r.status === statusFilter) ?? []
  const pageSize = 20
  const pageRows = filteredRows.slice(page * pageSize, (page + 1) * pageSize)
  const totalPages = Math.ceil(filteredRows.length / pageSize)

  return createPortal(
    <div style={{ position: 'fixed', inset: 0, zIndex: 10000, background: 'var(--overlay-scrim-70)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 'var(--space-2xl)' }} onClick={handleClose}>
      <div onClick={(e) => e.stopPropagation()} style={{
        width: '100%', maxWidth: 'var(--max-width-csv)', maxHeight: '92vh', display: 'flex', flexDirection: 'column',
        background: 'var(--surface-modal)', borderRadius: 'var(--radius-2xl)', border: 'var(--border-width) solid var(--primary-15)',
        boxShadow: 'var(--shadow-modal-brand)',
      }}>
        <div style={{ height: 'var(--space-3xs)', background: 'var(--grad-brand)', borderRadius: 'var(--radius-2xl) var(--radius-2xl) 0 0' }} />

        {/* Header */}
        <div style={{ padding: 'var(--space-2xl) var(--space-xl) var(--space-md)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <span style={{ fontSize: 'var(--font-size-xl)', fontWeight: 'var(--font-weight-bold)', color: 'var(--text-secondary)' }}>{title}</span>
          <button onClick={handleClose} style={{ background: 'var(--white-4)', border: 'var(--border-width) solid var(--white-8)', borderRadius: 'var(--radius-sm)', padding: 'var(--space-6)', cursor: 'pointer', color: 'var(--text-placard)' }}><X size={16} /></button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '0 var(--space-xl) var(--space-xl)' }}>
          {/* STEP 1 — UPLOAD */}
          {status === 'idle' && (
            <>
              <div
                onClick={() => fileRef.current?.click()}
                onDragOver={(e) => { e.preventDefault(); e.stopPropagation() }}
                onDrop={(e) => { e.preventDefault(); e.stopPropagation(); const f = e.dataTransfer.files[0]; if (f) handleFile(f) }}
                style={{
                  border: 'var(--dash-border-primary)', borderRadius: 'var(--radius-lg)', padding: 'var(--space-5xl) var(--space-2xl)',
                  textAlign: 'center', cursor: 'pointer', background: 'var(--primary-8)',
                  transition: 'all 200ms',
                }}
              >
                <Upload size={28} style={{ color: 'var(--color-primary)', marginBottom: 'var(--space-md)' }} />
                <div style={{ fontSize: 'var(--font-size-lg)', fontWeight: 'var(--font-weight-bold)', color: 'var(--text-secondary)' }}>Drop your CSV here or click to browse</div>
                <div style={{ fontSize: 'var(--font-size-lg)', color: 'var(--text-placard)', marginTop: 'var(--space-xs)' }}>.csv files only</div>
              </div>
              <input ref={fileRef} type="file" accept=".csv" style={{ display: 'none' }} onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f) }} />

              {parseError && <div className="form-error" style={{ marginTop: 'var(--space-md)' }}>{parseError}</div>}

              <button onClick={downloadTemplate} style={{
                marginTop: 'var(--space-lg)', display: 'flex', alignItems: 'center', gap: 'var(--space-6)', padding: 'var(--space-sm) var(--space-lg)',
                borderRadius: 'var(--radius-sm)', background: 'var(--sky-8)', border: 'var(--border-width) solid var(--sky-20)',
                color: 'var(--color-sky)', fontSize: 'var(--font-size-lg)', fontWeight: 'var(--font-weight-medium)', cursor: 'pointer',
              }}>Download Template</button>
            </>
          )}

          {/* STEP 2 — CHECKING */}
          {status === 'checking' && (
            <div style={{ padding: 'var(--space-5xl) 0', textAlign: 'center' }}>
              <MusicLoader />
              <div style={{ fontSize: 'var(--font-size-lg)', color: 'var(--text-muted)', marginTop: 'var(--space-md)' }}>Checking {rowCount} rows for duplicates...</div>
            </div>
          )}

          {/* STEP 3+4 — PREVIEW */}
          {status === 'ready' && preview && (
            <>
              {/* Summary */}
              <div style={{ display: 'flex', gap: 'var(--space-md)', marginBottom: 'var(--space-lg)', flexWrap: 'wrap' }}>
                <SummaryBadge icon={<CheckCircle size={14} />} label="Ready to import" count={preview.newCount} />
                <SummaryBadge icon={<SkipForward size={14} />} label="Duplicates (skip)" count={preview.dupCount} />
                <SummaryBadge icon={<AlertTriangle size={14} />} label="Possible duplicates" count={preview.possibleDupCount} />
                <SummaryBadge icon={<XCircle size={14} />} label="Errors (skip)" count={preview.errorCount} />
              </div>

              <div style={{ fontSize: 'var(--font-size-lg)', color: 'var(--text-placard)', marginBottom: 'var(--space-md)' }}>{fileName} — {preview.totalInFile} rows total</div>

              {/* Filter */}
              <div style={{ display: 'flex', gap: 'var(--space-xs)', marginBottom: 'var(--space-10)' }}>
                {['', 'new', 'duplicate', 'possible_duplicate', 'error'].map((f) => (
                  <button key={f} onClick={() => { setStatusFilter(f); setPage(0) }} style={{
                    padding: 'var(--space-xs) var(--space-10)', borderRadius: 'var(--radius-xs)', fontSize: 'var(--font-size-xs)', fontWeight: 'var(--font-weight-medium)', cursor: 'pointer',
                    background: statusFilter === f ? 'var(--primary-12)' : 'var(--white-3)',
                    color: statusFilter === f ? 'var(--pink-light)' : 'var(--text-placard)',
                    border: `var(--border-width) solid ${statusFilter === f ? 'var(--primary-20)' : 'var(--white-6)'}`,
                  }}>{f === '' ? 'All' : f === 'new' ? 'New' : f === 'duplicate' ? 'Duplicate' : f === 'possible_duplicate' ? 'Possible' : 'Error'}</button>
                ))}
              </div>

              {/* Row table */}
              <div style={{ maxHeight: 'calc(var(--space-5xl) * 7 + var(--space-2xl))', overflowY: 'auto', border: 'var(--border-width) solid var(--white-6)', borderRadius: 'var(--radius-md)' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--font-size-sm)' }}>
                  <thead>
                    <tr style={{ background: 'var(--white-3)' }}>
                      <th style={{ padding: 'var(--space-6) var(--space-10)', textAlign: 'left', color: 'var(--text-placard)', fontWeight: 'var(--font-weight-bold)' }}>#</th>
                      <th style={{ padding: 'var(--space-6) var(--space-10)', textAlign: 'left', color: 'var(--text-placard)', fontWeight: 'var(--font-weight-bold)' }}>Name</th>
                      <th style={{ padding: 'var(--space-6) var(--space-10)', textAlign: 'left', color: 'var(--text-placard)', fontWeight: 'var(--font-weight-bold)' }}>Status</th>
                      <th style={{ padding: 'var(--space-6) var(--space-10)', textAlign: 'left', color: 'var(--text-placard)', fontWeight: 'var(--font-weight-bold)' }}>Reason</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pageRows.map((r) => (
                      <tr key={r.idx} style={{ borderTop: 'var(--border-width) solid var(--white-3)' }}>
                        <td style={{ padding: 'var(--space-mini) var(--space-10)', color: 'var(--text-caption)' }}>{r.idx + 2}</td>
                        <td style={{ padding: 'var(--space-mini) var(--space-10)', color: 'var(--text-subtle)' }}>{r.data.first_name} {r.data.last_name}</td>
                        <td style={{ padding: 'var(--space-mini) var(--space-10)' }}>
                          <StatusPill status={r.status} />
                        </td>
                        <td style={{ padding: 'var(--space-mini) var(--space-10)', color: 'var(--text-placard)' }}>{r.reason ?? ''}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 'var(--space-sm)', marginTop: 'var(--space-sm)', fontSize: 'var(--font-size-sm)', color: 'var(--text-placard)' }}>
                  <button onClick={() => setPage(Math.max(0, page - 1))} disabled={page === 0} className="btn-ghost" style={{ fontSize: 'var(--font-size-xs)', padding: 'var(--space-2xs) var(--space-sm)' }}>Prev</button>
                  <span>{page + 1} / {totalPages}</span>
                  <button onClick={() => setPage(Math.min(totalPages - 1, page + 1))} disabled={page >= totalPages - 1} className="btn-ghost" style={{ fontSize: 'var(--font-size-xs)', padding: 'var(--space-2xs) var(--space-sm)' }}>Next</button>
                </div>
              )}

              {/* Actions */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 'var(--space-lg)' }}>
                <button className="btn-ghost" onClick={handleClose}>Cancel</button>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-placard)', marginBottom: 'var(--space-xs)' }}>
                    This will add {preview.newCount + preview.possibleDupCount} new records. Skipping {preview.dupCount} duplicates.
                  </div>
                  <button className="btn-primary" onClick={onRun} disabled={preview.newCount === 0} style={{ fontSize: 'var(--font-size-md)', padding: 'var(--space-10) var(--space-xl)' }}>
                    Run Import
                  </button>
                </div>
              </div>
            </>
          )}

          {/* STEP 5 — IMPORTING */}
          {status === 'importing' && (
            <div style={{ padding: 'var(--space-5xl) 0', textAlign: 'center' }}>
              <div style={{ fontSize: 'var(--font-size-lg)', fontWeight: 'var(--font-weight-bold)', color: 'var(--text-secondary)', marginBottom: 'var(--space-md)' }}>Importing...</div>
              <div style={{ width: '100%', height: 'var(--space-sm)', borderRadius: 'var(--radius-2xs)', background: 'var(--white-6)', overflow: 'hidden' }}>
                <div style={{ width: `${progress}%`, height: '100%', background: 'var(--grad-primary)', borderRadius: 'var(--radius-2xs)', transition: 'width 300ms ease' }} />
              </div>
              <div style={{ fontSize: 'var(--font-size-lg)', color: 'var(--text-muted)', marginTop: 'var(--space-sm)' }}>{progress}%</div>
            </div>
          )}

          {/* STEP 6 — RESULTS */}
          {status === 'done' && result && (
            <div style={{ padding: 'var(--space-2xl) 0' }}>
              <div style={{ textAlign: 'center', marginBottom: 'var(--space-2xl)' }}>
                <CheckCircle size={28} style={{ color: 'var(--color-success)', marginBottom: 'var(--space-sm)' }} />
                <div style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 'var(--font-weight-bold)', color: 'var(--color-success)' }}>Import Complete</div>
              </div>

              <div style={{ display: 'flex', gap: 'var(--space-md)', justifyContent: 'center', marginBottom: 'var(--space-2xl)' }}>
                <SummaryBadge icon={<CheckCircle size={14} />} label="Added" count={result.added} />
                <SummaryBadge icon={<SkipForward size={14} />} label="Skipped" count={result.skipped} />
                <SummaryBadge icon={<XCircle size={14} />} label="Failed" count={result.failed} />
              </div>

              {result.errors.length > 0 && (
                <div style={{ background: 'var(--danger-8)', border: 'var(--border-width) solid var(--danger-20)', borderRadius: 'var(--radius-md)', padding: 'var(--space-md)', maxHeight: 'calc(var(--space-5xl) * 3 + var(--space-3xl))', overflowY: 'auto', marginBottom: 'var(--space-lg)' }}>
                  {result.errors.map((e, i) => (
                    <div key={i} style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-danger)', padding: 'var(--space-2xs) 0' }}>{e}</div>
                  ))}
                </div>
              )}

              <div style={{ textAlign: 'center' }}>
                <button className="btn-primary" onClick={handleClose} style={{ fontSize: 'var(--font-size-md)', padding: 'var(--space-10) var(--space-3xl)' }}>Done</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  )
}

function SummaryBadge({ icon, label, count }: { icon: React.ReactNode; label: string; count: number }) {
  const t = SUMMARY_BADGE_TOKENS[label] ?? SUMMARY_BADGE_TOKENS['Errors (skip)']
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-6)', padding: 'var(--space-6) var(--space-md)', borderRadius: 'var(--radius-sm)', background: t.bg, border: `var(--border-width) solid ${t.border}` }}>
      <span style={{ color: t.color }}>{icon}</span>
      <span style={{ fontSize: 'var(--font-size-lg)', fontWeight: 'var(--font-weight-bold)', color: t.color }}>{count}</span>
      <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-muted)' }}>{label}</span>
    </div>
  )
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, { bg: string; color: string; label: string }> = {
    new: { bg: 'var(--success-10)', color: 'var(--color-success)', label: 'New' },
    duplicate: { bg: 'var(--white-6)', color: 'var(--text-placard)', label: 'Duplicate' },
    possible_duplicate: { bg: 'var(--warning-10)', color: 'var(--color-warning)', label: 'Possible' },
    error: { bg: 'var(--danger-10)', color: 'var(--color-danger)', label: 'Error' },
  }
  const s = map[status] ?? map.error
  return <span style={{ fontSize: 'var(--font-size-xs)', fontWeight: 'var(--font-weight-bold)', padding: 'var(--space-2xs) var(--space-sm)', borderRadius: 'var(--radius-2xs)', background: s.bg, color: s.color }}>{s.label}</span>
}
