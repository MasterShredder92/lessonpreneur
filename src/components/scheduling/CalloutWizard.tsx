import { useState } from 'react'
import { useAuthContext } from '../../app/AuthContext'
import { useFindCoverage, useTransferBlock, type CoverageResult } from '../../hooks/useCallout'
import { supabase } from '../../lib/supabase'
import { instrumentWithEmojiTitle } from '../../utils/instrumentEmoji'

function formatTime(t: string) {
  const [h, m] = t.split(':')
  const hour = parseInt(h)
  return `${hour > 12 ? hour - 12 : hour}:${m}${hour >= 12 ? 'pm' : 'am'}`
}

interface Props {
  locationId: string
  locationName: string
  onClose: () => void
}

type Step = 'select' | 'review' | 'summary'

export default function CalloutWizard({ locationId, locationName, onClose }: Props) {
  const { tenantId } = useAuthContext()
  const findCoverage = useFindCoverage()
  const transferBlock = useTransferBlock()

  const [step, setStep] = useState<Step>('select')
  const [selectedTeacherId, setSelectedTeacherId] = useState('')
  const [date, setDate] = useState(new Date().toISOString().split('T')[0])
  const [teachers, setTeachers] = useState<{ id: string; name: string }[]>([])
  const [coverage, setCoverage] = useState<CoverageResult | null>(null)
  const [currentBlockIdx, setCurrentBlockIdx] = useState(0)
  const [results, setResults] = useState<{ student: string; status: 'covered' | 'skipped'; subName?: string }[]>([])
  const [loading, setLoading] = useState(false)

  // Load teachers at this location for selected date
  const loadTeachers = async () => {
    const { data: blocks } = await supabase
      .from('schedule_blocks')
      .select('teacher_id')
      .eq('location_id', locationId)
      .eq('block_date', date)
      .neq('student_id', null as any)
    const teacherIds = [...new Set(blocks?.map((b: any) => b.teacher_id) ?? [])]
    if (teacherIds.length === 0) { setTeachers([]); return }

    const { data: ts } = await supabase
      .from('teachers')
      .select('id, first_name, last_name, profile:profiles!teachers_profile_id_fkey(first_name, last_name)')
      .in('id', teacherIds)
    setTeachers(ts?.map((t: any) => ({ id: t.id, name: `${t.first_name ?? t.profile?.first_name ?? ''} ${t.last_name ?? t.profile?.last_name ?? ''}`.trim() })) ?? [])
  }

  const handleFindCoverage = async () => {
    if (!selectedTeacherId || !tenantId) return
    setLoading(true)
    try {
      const result = await findCoverage.mutateAsync({ teacherId: selectedTeacherId, date, tenantId })
      setCoverage(result)
      setCurrentBlockIdx(0)
      setResults([])
      setStep('review')
    } finally { setLoading(false) }
  }

  const handleTransfer = async (blockId: string, newTeacherId: string, availableBlockId: string | null, studentName: string, subName: string) => {
    await transferBlock.mutateAsync({ blockId, newTeacherId, availableBlockId })
    setResults((r) => [...r, { student: studentName, status: 'covered', subName }])
    advanceBlock()
  }

  const handleSkip = (studentName: string) => {
    setResults((r) => [...r, { student: studentName, status: 'skipped' }])
    advanceBlock()
  }

  const advanceBlock = () => {
    if (coverage && currentBlockIdx + 1 < coverage.blocks.length) {
      setCurrentBlockIdx((i) => i + 1)
    } else {
      setStep('summary')
    }
  }

  const currentBlock = coverage?.blocks[currentBlockIdx]
  const covered = results.filter((r) => r.status === 'covered').length
  const skipped = results.filter((r) => r.status === 'skipped').length

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 500, maxHeight: '85vh' }}>
        <div className="modal-header">
          <h2 style={{ color: '#EF4444' }}>Teacher Callout — {locationName}</h2>
          <button className="btn-ghost" onClick={onClose}>✕</button>
        </div>

        <div className="modal-form" style={{ overflowY: 'auto' }}>
          {/* Step 1: Select teacher */}
          {step === 'select' && (
            <>
              <div className="form-field">
                <label>Date</label>
                <input type="date" value={date} onChange={(e) => { setDate(e.target.value); setTeachers([]); setSelectedTeacherId(''); }} onBlur={loadTeachers} onFocus={loadTeachers} />
              </div>
              <div className="form-field">
                <label>Teacher calling out</label>
                <select value={selectedTeacherId} onChange={(e) => setSelectedTeacherId(e.target.value)} className="filter-select" style={{ width: '100%' }}
                  onFocus={() => { if (teachers.length === 0) loadTeachers(); }}>
                  <option value="">Select teacher...</option>
                  {teachers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>
              <div className="modal-actions">
                <button className="btn-ghost" onClick={onClose}>Cancel</button>
                <button className="btn-primary" style={{ background: '#EF4444' }} onClick={handleFindCoverage} disabled={!selectedTeacherId || loading}>
                  {loading ? 'Finding coverage...' : 'Find Coverage'}
                </button>
              </div>
            </>
          )}

          {/* Step 2: Review each student */}
          {step === 'review' && currentBlock && (
            <>
              <div className="callout-progress">
                Student {currentBlockIdx + 1} of {coverage?.total_blocks} · {covered} covered · {skipped} unresolved
              </div>

              <div className="callout-student-card">
                <div className="callout-student-name">{currentBlock.student_name}</div>
                <div className="callout-student-meta">
                  <span className="badge-primary">{instrumentWithEmojiTitle(currentBlock.instrument)}</span>
                  <span>{formatTime(currentBlock.start_time)} – {formatTime(currentBlock.end_time)}</span>
                </div>
              </div>

              {currentBlock.suggestions.length > 0 ? (
                <div className="callout-suggestions">
                  <span className="detail-label">Coverage Options</span>
                  {currentBlock.suggestions.map((sug, i) => (
                    <div key={i} className="callout-suggestion">
                      <div className="callout-sug-info">
                        <strong>{sug.teacher_name}</strong>
                        <div className="pill-group" style={{ marginTop: 2 }}>
                          {sug.instruments?.map((inst: string) => <span key={inst} className="badge-primary" style={{ fontSize: '10px' }}>{instrumentWithEmojiTitle(inst)}</span>)}
                          <span className={`badge-${sug.priority === 1 ? 'success' : 'gold'}`} style={{ fontSize: '10px' }}>
                            {sug.priority === 1 ? 'Scheduled today' : 'Available sub'}
                          </span>
                        </div>
                      </div>
                      <button
                        className="btn-primary"
                        style={{ fontSize: '11px', padding: '4px 12px' }}
                        onClick={() => handleTransfer(currentBlock.block_id, sug.teacher_id, sug.available_block_id, currentBlock.student_name, sug.teacher_name)}
                        disabled={transferBlock.isPending}
                      >
                        {transferBlock.isPending ? '...' : 'Move Here'}
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="callout-no-coverage">
                  <span className="text-muted">No automatic coverage found for {instrumentWithEmojiTitle(currentBlock.instrument)} at this time.</span>
                </div>
              )}

              <div className="modal-actions">
                <button className="btn-ghost" style={{ color: 'var(--gold)' }} onClick={() => handleSkip(currentBlock.student_name)}>
                  Skip — No Coverage
                </button>
              </div>
            </>
          )}

          {/* Step 3: Summary */}
          {step === 'summary' && (
            <>
              <div style={{ textAlign: 'center', padding: '16px' }}>
                <h3 style={{ marginBottom: '12px' }}>Callout Complete</h3>
                <div className="fifth-week-stats" style={{ marginBottom: '16px' }}>
                  <div className="fifth-week-stat">
                    <span className="fifth-week-value" style={{ color: 'var(--green)' }}>{covered}</span>
                    <span className="fifth-week-label">Covered</span>
                  </div>
                  <div className="fifth-week-stat">
                    <span className="fifth-week-value" style={{ color: skipped > 0 ? '#EF4444' : 'var(--text-muted)' }}>{skipped}</span>
                    <span className="fifth-week-label">Unresolved</span>
                  </div>
                </div>
              </div>

              <div className="callout-results">
                {results.map((r, i) => (
                  <div key={i} className="callout-result-row">
                    <span>{r.student}</span>
                    {r.status === 'covered' ? (
                      <span className="badge-success">→ {r.subName}</span>
                    ) : (
                      <span className="badge-gold">Needs coverage</span>
                    )}
                  </div>
                ))}
              </div>

              <div className="modal-actions">
                <button className="btn-primary" onClick={onClose}>Done</button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
