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
    <div style={{ position: 'fixed', inset: 0, zIndex: 10000, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }} onClick={handleClose}>
      <div onClick={(e) => e.stopPropagation()} style={{
        width: '100%', maxWidth: 720, maxHeight: '92vh', display: 'flex', flexDirection: 'column',
        background: '#141224', borderRadius: 20, border: '1px solid rgba(212,34,106,0.15)',
        boxShadow: '0 0 60px rgba(212,34,106,0.08), 0 24px 60px rgba(0,0,0,0.5)',
      }}>
        <div style={{ height: 3, background: 'linear-gradient(90deg, #D4226A, #7B2CBF)', borderRadius: '20px 20px 0 0' }} />

        {/* Header */}
        <div style={{ padding: '20px 24px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <span style={{ fontSize: 18, fontWeight: 800, color: '#E0E0F4' }}>{title}</span>
          <button onClick={handleClose} style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, padding: 6, cursor: 'pointer', color: '#8080A8' }}><X size={16} /></button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '0 24px 24px' }}>
          {/* STEP 1 — UPLOAD */}
          {status === 'idle' && (
            <>
              <div
                onClick={() => fileRef.current?.click()}
                onDragOver={(e) => { e.preventDefault(); e.stopPropagation() }}
                onDrop={(e) => { e.preventDefault(); e.stopPropagation(); const f = e.dataTransfer.files[0]; if (f) handleFile(f) }}
                style={{
                  border: '2px dashed rgba(212,34,106,0.25)', borderRadius: 16, padding: '40px 20px',
                  textAlign: 'center', cursor: 'pointer', background: 'rgba(212,34,106,0.03)',
                  transition: 'all 200ms',
                }}
              >
                <Upload size={28} style={{ color: '#D4226A', marginBottom: 12 }} />
                <div style={{ fontSize: 14, fontWeight: 700, color: '#E0E0F4' }}>Drop your CSV here or click to browse</div>
                <div style={{ fontSize: 12, color: '#8080A8', marginTop: 4 }}>.csv files only</div>
              </div>
              <input ref={fileRef} type="file" accept=".csv" style={{ display: 'none' }} onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f) }} />

              {parseError && <div className="form-error" style={{ marginTop: 12 }}>{parseError}</div>}

              <button onClick={downloadTemplate} style={{
                marginTop: 16, display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px',
                borderRadius: 8, background: 'rgba(56,189,248,0.06)', border: '1px solid rgba(56,189,248,0.2)',
                color: '#38BDF8', fontSize: 12, fontWeight: 600, cursor: 'pointer',
              }}>Download Template</button>
            </>
          )}

          {/* STEP 2 — CHECKING */}
          {status === 'checking' && (
            <div style={{ padding: '40px 0', textAlign: 'center' }}>
              <MusicLoader />
              <div style={{ fontSize: 14, color: '#A0A0C8', marginTop: 12 }}>Checking {rowCount} rows for duplicates...</div>
            </div>
          )}

          {/* STEP 3+4 — PREVIEW */}
          {status === 'ready' && preview && (
            <>
              {/* Summary */}
              <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
                <SummaryBadge icon={<CheckCircle size={14} />} color="#22C55E" label="Ready to import" count={preview.newCount} />
                <SummaryBadge icon={<SkipForward size={14} />} color="#8080A8" label="Duplicates (skip)" count={preview.dupCount} />
                <SummaryBadge icon={<AlertTriangle size={14} />} color="#FFB800" label="Possible duplicates" count={preview.possibleDupCount} />
                <SummaryBadge icon={<XCircle size={14} />} color="#EF4444" label="Errors (skip)" count={preview.errorCount} />
              </div>

              <div style={{ fontSize: 12, color: '#8080A8', marginBottom: 12 }}>{fileName} — {preview.totalInFile} rows total</div>

              {/* Filter */}
              <div style={{ display: 'flex', gap: 4, marginBottom: 10 }}>
                {['', 'new', 'duplicate', 'possible_duplicate', 'error'].map((f) => (
                  <button key={f} onClick={() => { setStatusFilter(f); setPage(0) }} style={{
                    padding: '4px 10px', borderRadius: 6, fontSize: 10, fontWeight: 600, cursor: 'pointer',
                    background: statusFilter === f ? 'rgba(212,34,106,0.1)' : 'rgba(255,255,255,0.03)',
                    color: statusFilter === f ? '#E8488A' : '#8080A8',
                    border: `1px solid ${statusFilter === f ? 'rgba(212,34,106,0.2)' : 'rgba(255,255,255,0.06)'}`,
                  }}>{f === '' ? 'All' : f === 'new' ? 'New' : f === 'duplicate' ? 'Duplicate' : f === 'possible_duplicate' ? 'Possible' : 'Error'}</button>
                ))}
              </div>

              {/* Row table */}
              <div style={{ maxHeight: 300, overflowY: 'auto', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 10 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                  <thead>
                    <tr style={{ background: 'rgba(255,255,255,0.03)' }}>
                      <th style={{ padding: '6px 10px', textAlign: 'left', color: '#8080A8', fontWeight: 700 }}>#</th>
                      <th style={{ padding: '6px 10px', textAlign: 'left', color: '#8080A8', fontWeight: 700 }}>Name</th>
                      <th style={{ padding: '6px 10px', textAlign: 'left', color: '#8080A8', fontWeight: 700 }}>Status</th>
                      <th style={{ padding: '6px 10px', textAlign: 'left', color: '#8080A8', fontWeight: 700 }}>Reason</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pageRows.map((r) => (
                      <tr key={r.idx} style={{ borderTop: '1px solid rgba(255,255,255,0.03)' }}>
                        <td style={{ padding: '5px 10px', color: '#606088' }}>{r.idx + 2}</td>
                        <td style={{ padding: '5px 10px', color: '#C0C0E0' }}>{r.data.first_name} {r.data.last_name}</td>
                        <td style={{ padding: '5px 10px' }}>
                          <StatusPill status={r.status} />
                        </td>
                        <td style={{ padding: '5px 10px', color: '#8080A8' }}>{r.reason ?? ''}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 8, fontSize: 11, color: '#8080A8' }}>
                  <button onClick={() => setPage(Math.max(0, page - 1))} disabled={page === 0} className="btn-ghost" style={{ fontSize: 10, padding: '2px 8px' }}>Prev</button>
                  <span>{page + 1} / {totalPages}</span>
                  <button onClick={() => setPage(Math.min(totalPages - 1, page + 1))} disabled={page >= totalPages - 1} className="btn-ghost" style={{ fontSize: 10, padding: '2px 8px' }}>Next</button>
                </div>
              )}

              {/* Actions */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 16 }}>
                <button className="btn-ghost" onClick={handleClose}>Cancel</button>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 11, color: '#8080A8', marginBottom: 4 }}>
                    This will add {preview.newCount + preview.possibleDupCount} new records. Skipping {preview.dupCount} duplicates.
                  </div>
                  <button className="btn-primary" onClick={onRun} disabled={preview.newCount === 0} style={{ fontSize: 13, padding: '10px 24px' }}>
                    Run Import
                  </button>
                </div>
              </div>
            </>
          )}

          {/* STEP 5 — IMPORTING */}
          {status === 'importing' && (
            <div style={{ padding: '40px 0', textAlign: 'center' }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#E0E0F4', marginBottom: 12 }}>Importing...</div>
              <div style={{ width: '100%', height: 8, borderRadius: 4, background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
                <div style={{ width: `${progress}%`, height: '100%', background: 'linear-gradient(90deg, #D4226A, #E8488A)', borderRadius: 4, transition: 'width 300ms ease' }} />
              </div>
              <div style={{ fontSize: 12, color: '#A0A0C8', marginTop: 8 }}>{progress}%</div>
            </div>
          )}

          {/* STEP 6 — RESULTS */}
          {status === 'done' && result && (
            <div style={{ padding: '20px 0' }}>
              <div style={{ textAlign: 'center', marginBottom: 20 }}>
                <CheckCircle size={28} style={{ color: '#22C55E', marginBottom: 8 }} />
                <div style={{ fontSize: 16, fontWeight: 800, color: '#22C55E' }}>Import Complete</div>
              </div>

              <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginBottom: 20 }}>
                <SummaryBadge icon={<CheckCircle size={14} />} color="#22C55E" label="Added" count={result.added} />
                <SummaryBadge icon={<SkipForward size={14} />} color="#8080A8" label="Skipped" count={result.skipped} />
                <SummaryBadge icon={<XCircle size={14} />} color="#EF4444" label="Failed" count={result.failed} />
              </div>

              {result.errors.length > 0 && (
                <div style={{ background: 'rgba(239,68,68,0.04)', border: '1px solid rgba(239,68,68,0.1)', borderRadius: 10, padding: 12, maxHeight: 150, overflowY: 'auto', marginBottom: 16 }}>
                  {result.errors.map((e, i) => (
                    <div key={i} style={{ fontSize: 11, color: '#EF4444', padding: '2px 0' }}>{e}</div>
                  ))}
                </div>
              )}

              <div style={{ textAlign: 'center' }}>
                <button className="btn-primary" onClick={handleClose} style={{ fontSize: 13, padding: '10px 30px' }}>Done</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  )
}

function SummaryBadge({ icon, color, label, count }: { icon: React.ReactNode; color: string; label: string; count: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 8, background: `${color}10`, border: `1px solid ${color}25` }}>
      <span style={{ color }}>{icon}</span>
      <span style={{ fontSize: 14, fontWeight: 800, color }}>{count}</span>
      <span style={{ fontSize: 11, color: '#A0A0C8' }}>{label}</span>
    </div>
  )
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, { bg: string; color: string; label: string }> = {
    new: { bg: 'rgba(34,197,94,0.1)', color: '#22C55E', label: 'New' },
    duplicate: { bg: 'rgba(96,96,136,0.1)', color: '#8080A8', label: 'Duplicate' },
    possible_duplicate: { bg: 'rgba(255,184,0,0.1)', color: '#FFB800', label: 'Possible' },
    error: { bg: 'rgba(239,68,68,0.1)', color: '#EF4444', label: 'Error' },
  }
  const s = map[status] ?? map.error
  return <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 4, background: s.bg, color: s.color }}>{s.label}</span>
}
