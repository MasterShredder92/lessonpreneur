import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useQueryClient } from '@tanstack/react-query'
import { useAuthContext } from '../../app/AuthContext'
import { calculatePreviewRate, getRateTierLabel, getRateTierColor } from '../../hooks/useFamilyRate'
import SearchableCombobox from '../shared/SearchableCombobox'
import type { LeadRow } from '../../hooks/useLeads'
import { instrumentWithEmojiTitle } from '../../utils/instrumentEmoji'
import { qk } from '../../lib/queryKeys'
import { toast } from '../shared/Toast'
import DuplicateStudentReviewPanel from '../admin/DuplicateStudentReviewPanel'

function formatTime(t: string) {
  const [h, m] = t.split(':')
  const hour = parseInt(h)
  const ampm = hour >= 12 ? 'pm' : 'am'
  const display = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour
  return `${display}:${m}${ampm}`
}

function dollars(amount: number): string {
  return `$${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function formatDate(d: string) {
  return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

interface Props {
  lead: LeadRow
  onClose: () => void
  onConverted: (studentId: string) => void
}

type Step = 'family' | 'schedule' | 'confirm' | 'done'

export default function ConvertLeadModal({ lead, onClose, onConverted }: Props) {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { tenantId } = useAuthContext()

  const [step, setStep] = useState<Step>('family')
  const [error, setError] = useState<string | null>(null)
  const [converting, setConverting] = useState(false)

  // Family step
  const [allFamilies, setAllFamilies] = useState<{ id: string; name: string; email: string | null }[]>([])
  const [existingFamilies, setExistingFamilies] = useState<{ id: string; name: string; email: string | null }[]>([])
  const [selectedFamilyId, setSelectedFamilyId] = useState<string | null>(null)
  const [newFamilyName, setNewFamilyName] = useState(
    'The ' + (lead.last_name || lead.first_name) + ' Family'
  )
  const [familyChoice, setFamilyChoice] = useState<'new' | 'existing'>('new')
  const [numStudents, setNumStudents] = useState(1)

  // Schedule step
  const [availableBlocks, setAvailableBlocks] = useState<any[]>([])
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null)
  const [recurring, setRecurring] = useState(false)
  const [rate, setRate] = useState(lead.is_military ? 40 : 45)
  const [teacherId, setTeacherId] = useState<string | null>(null)
  const [teachers, setTeachers] = useState<{ id: string; name: string }[]>([])

  // Done step
  const [result, setResult] = useState<{ student_id: string; student_name: string } | null>(null)
  const [resultFamilyId, setResultFamilyId] = useState<string | null>(null)
  const [creatingInvoice, setCreatingInvoice] = useState(false)
  const [invoiceCreated, setInvoiceCreated] = useState(false)
  /** Set when RPC returns `possible_duplicate_review` so the done step can embed the review panel. */
  const [pendingDupReviewId, setPendingDupReviewId] = useState<string | null>(null)

  // Auto-calculate rate tier
  const totalSessions = numStudents * 4
  const autoRateCents = calculatePreviewRate(numStudents, totalSessions, lead.is_military ?? false)
  const rateTierLabel = getRateTierLabel(rate * 100, lead.is_military ?? false, numStudents)
  const rateTierColor = getRateTierColor(autoRateCents)

  const [familyLoadError, setFamilyLoadError] = useState(false)
  const [teacherLoadError, setTeacherLoadError] = useState(false)
  const [blockLoadError, setBlockLoadError] = useState(false)

  // Load all families for searchable dropdown
  useEffect(() => {
    let cancelled = false
    setFamilyLoadError(false)
    supabase
      .from('families')
      .select('id, name, primary_email')
      .eq('tenant_id', tenantId)
      .order('name')
      .then(({ data, error: queryErr }) => {
        if (cancelled) return
        if (queryErr) { setFamilyLoadError(true); return }
        const fams = (data ?? []).map((f: any) => ({ id: f.id, name: f.name, email: f.primary_email }))
        setAllFamilies(fams)
        // Check for email match
        if (lead.email) {
          const matched = fams.filter(f => f.email === lead.email)
          if (matched.length > 0) {
            setExistingFamilies(matched)
            setFamilyChoice('existing')
            setSelectedFamilyId(matched[0].id)
          }
        }
      })
    return () => { cancelled = true }
  }, [lead.email, tenantId])

  useEffect(() => {
    setPendingDupReviewId(null)
  }, [lead.id])

  // Load teachers at lead's location
  useEffect(() => {
    if (!lead.location_id) return
    let cancelled = false
    setTeacherLoadError(false)
    const loadTeachers = async () => {
      try {
        const { data, error: tErr } = await supabase
          .from('teachers')
          .select('id, first_name, last_name, profile:profiles!teachers_profile_id_fkey(first_name, last_name), instruments')
          .eq('is_active', true)
        if (tErr) throw tErr

        const { data: tlData, error: tlErr } = await supabase
          .from('teacher_locations')
          .select('teacher_id, location_id')
          .eq('location_id', lead.location_id!)
        if (tlErr) throw tlErr

        const teacherIdsAtLoc = new Set(tlData?.map((tl: any) => tl.teacher_id) ?? [])
        const filtered = (data ?? []).filter((t: any) => teacherIdsAtLoc.has(t.id))
        const withInstrument = lead.instrument
          ? filtered.filter((t: any) => t.instruments?.includes(lead.instrument!.toLowerCase()) || t.instruments?.length === 0)
          : filtered
        setTeachers(withInstrument.map((t: any) => ({
          id: t.id,
          name: `${t.first_name ?? t.profile?.first_name ?? ''} ${t.last_name ?? t.profile?.last_name ?? ''}`.trim(),
        })))
      } catch {
        setTeacherLoadError(true)
      }
    }
    loadTeachers()
  }, [lead.location_id, lead.instrument])

  // Load available blocks when teacher is selected
  useEffect(() => {
    if (!lead.location_id) return
    setBlockLoadError(false)
    const today = new Date().toISOString().split('T')[0]
    const fourWeeks = new Date()
    fourWeeks.setDate(fourWeeks.getDate() + 28)

    let query = supabase
      .from('schedule_blocks')
      .select('id, block_date, start_time, end_time, teacher_id')
      .eq('status', 'available')
      .eq('location_id', lead.location_id)
      .gte('block_date', today)
      .lte('block_date', fourWeeks.toISOString().split('T')[0])
      .order('block_date')
      .order('start_time')
      .limit(200)

    if (teacherId) {
      query = query.eq('teacher_id', teacherId)
    }

    query.then(({ data, error: bErr }) => {
      if (bErr) { setBlockLoadError(true); return }
      setAvailableBlocks(data ?? [])
    })
  }, [lead.location_id, teacherId, step])

  const handleConvert = async () => {
    setError(null)
    setConverting(true)

    try {
      const { data, error: rpcErr } = await supabase.rpc('convert_lead_to_student', {
        p_lead_id: lead.id,
        p_family_id: familyChoice === 'existing' ? selectedFamilyId : null,
        p_family_name: familyChoice === 'new' ? newFamilyName : null,
        p_teacher_id: teacherId,
        p_block_id: selectedBlockId,
        p_recurring: recurring,
        p_rate: rate,
        p_blocks_per_week: 1,
      })

      if (rpcErr) throw rpcErr

      const payload = data as {
        student_id: string
        student_name: string
        possible_duplicate_review?: { review_id?: string; candidate_student_id?: string; new_student_id?: string; reason?: string } | null
      }

      const dup = payload?.possible_duplicate_review
      const hasDupReview =
        dup != null && typeof dup === 'object' && dup !== null && 'review_id' in dup && dup.review_id
      if (hasDupReview && dup && 'review_id' in dup && dup.review_id) {
        setPendingDupReviewId(String(dup.review_id))
        toast(
          'Possible duplicate student — same family and name as an existing active student. Resolve below; tier pricing excludes this enrollment until resolved.',
          'warning',
        )
      } else {
        setPendingDupReviewId(null)
      }

      setResult({ student_id: payload.student_id, student_name: payload.student_name })
      setStep('done')

      // Capture family_id for invoice creation
      if (familyChoice === 'existing' && selectedFamilyId) {
        setResultFamilyId(selectedFamilyId)
      } else {
        // New family was created by RPC — look up the student's family_id
        const { data: sRow } = await supabase.from('students').select('family_id').eq('id', payload.student_id).single()
        setResultFamilyId(sRow?.family_id ?? null)
      }

      // Invalidate all relevant caches
      qc.invalidateQueries({ queryKey: qk.leads.all })
      qc.invalidateQueries({ queryKey: qk.students.all })
      qc.invalidateQueries({ queryKey: qk.students.roster })
      qc.invalidateQueries({ queryKey: qk.students.instruments })
      qc.invalidateQueries({ queryKey: qk.students.tabCounts })
      qc.invalidateQueries({ queryKey: qk.families.all })
      await Promise.all([
        qc.invalidateQueries({ queryKey: qk.families.page }),
        qc.invalidateQueries({ queryKey: qk.families.roster }),
      ])
      qc.invalidateQueries({ queryKey: qk.families.tabCounts })
      qc.invalidateQueries({ queryKey: qk.leads.duplicateReviews(tenantId) })
      qc.invalidateQueries({ queryKey: qk.schedule.all })
      qc.invalidateQueries({ queryKey: qk.schedule.intelligence })
      qc.invalidateQueries({ queryKey: qk.students.blocks })

      onConverted(payload.student_id)
    } catch (err: any) {
      setError(err.message ?? 'Conversion failed.')
    } finally {
      setConverting(false)
    }
  }

  // Group available blocks by date
  const blocksByDate = new Map<string, any[]>()
  availableBlocks.forEach((b) => {
    const list = blocksByDate.get(b.block_date) ?? []
    list.push(b)
    blocksByDate.set(b.block_date, list)
  })

  const teacherMap = new Map(teachers.map((t) => [t.id, t.name]))

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 520, maxHeight: '85vh' }}>
        <div className="modal-header">
          <h2>
            {step === 'family' && 'Step 1: Family'}
            {step === 'schedule' && 'Step 2: Schedule'}
            {step === 'confirm' && 'Step 3: Confirm'}
            {step === 'done' && 'Enrolled!'}
          </h2>
          <button className="btn-ghost" onClick={onClose}>✕</button>
        </div>

        <div className="modal-form" style={{ overflowY: 'auto' }}>
          {/* Lead context */}
          <div className="assign-context">
            <span className="pipeline-card-name">{lead.parent_name ?? lead.first_name}</span>
            {lead.instrument && <span className="badge-primary">{instrumentWithEmojiTitle(lead.instrument)}</span>}
            <span className="badge-secondary">{lead.location_name}</span>
          </div>

          {/* Step 1: Family */}
          {step === 'family' && (
            <>
              {/* Family selection: searchable or create new */}
              {familyLoadError && (
                <div className="form-error" style={{ marginBottom: 8 }}>Failed to load families. Try closing and reopening this modal.</div>
              )}
              <div className="convert-option-group">
                <label className="convert-option">
                  <input type="radio" name="family" checked={familyChoice === 'existing'} onChange={() => setFamilyChoice('existing')} />
                  <div style={{ flex: 1 }}>
                    <strong>Add to existing family</strong>
                    {familyChoice === 'existing' && (
                      <div style={{ marginTop: 6 }}>
                        <SearchableCombobox
                          options={allFamilies.map(f => ({
                            id: f.id,
                            label: f.name,
                            sublabel: f.email ?? undefined,
                          }))}
                          value={selectedFamilyId ?? ''}
                          onChange={(id) => setSelectedFamilyId(id)}
                          placeholder="Search families..."
                        />
                        {existingFamilies.length > 0 && (
                          <span className="text-dim" style={{ fontSize: '10px', marginTop: 4, display: 'block' }}>
                            Email match found: {existingFamilies[0].name}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </label>
                <label className="convert-option">
                  <input type="radio" name="family" checked={familyChoice === 'new'} onChange={() => setFamilyChoice('new')} />
                  <div style={{ flex: 1 }}>
                    <strong>Create new family</strong>
                    {familyChoice === 'new' && (
                      <input
                        value={newFamilyName}
                        onChange={(e) => setNewFamilyName(e.target.value)}
                        className="filter-select"
                        style={{ width: '100%', marginTop: 6 }}
                      />
                    )}
                  </div>
                </label>
              </div>

              {familyChoice === 'new' && (
                <span className="text-dim" style={{ fontSize: '11px', marginTop: -4, display: 'block' }}>
                  Contact: {lead.parent_name} · {lead.email} · {lead.phone}
                </span>
              )}

              {/* Student count */}
              <div className="form-field">
                <label>Students in this family</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input
                    type="number" min={1} max={10} value={numStudents}
                    onChange={(e) => {
                      const n = Math.max(1, parseInt(e.target.value) || 1)
                      setNumStudents(n)
                      // Auto-adjust rate based on student count
                      const autoCents = calculatePreviewRate(n, n * 4, lead.is_military ?? false)
                      setRate(autoCents / 100)
                    }}
                    style={{ width: 70 }}
                  />
                  {numStudents > 1 && (
                    <span style={{ fontSize: 11, color: '#FFB800', fontWeight: 600 }}>
                      Multi-student family
                    </span>
                  )}
                </div>
              </div>

              {/* Rate + tier */}
              <div className="form-field">
                <label>Session Rate ($)</label>
                <input type="number" step="0.50" value={rate} onChange={(e) => setRate(parseFloat(e.target.value) || 45)} />
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
                  <span style={{
                    fontSize: 10, fontWeight: 700, padding: '3px 10px', borderRadius: 6,
                    background: rateTierColor.bg, color: rateTierColor.text,
                    border: `1px solid ${rateTierColor.border}`,
                  }}>
                    {rateTierLabel}
                  </span>
                  <span className="text-dim" style={{ fontSize: '11px' }}>
                    Est. {dollars(rate * numStudents * 4)}/mo ({numStudents} student{numStudents !== 1 ? 's' : ''} x 4 sessions)
                  </span>
                </div>
                {lead.is_military && <span className="text-dim" style={{ fontSize: '11px', marginTop: 2 }}>Military family — discount applied</span>}
              </div>

              <div className="modal-actions">
                <button className="btn-ghost" onClick={onClose}>Cancel</button>
                <button className="btn-primary" onClick={() => setStep('schedule')}>
                  Next: Pick a Slot →
                </button>
              </div>
            </>
          )}

          {/* Step 2: Schedule */}
          {step === 'schedule' && (
            <>
              <div className="form-field">
                <label>Teacher</label>
                {teacherLoadError ? (
                  <div className="form-error" style={{ fontSize: 12 }}>Failed to load teachers. Try closing and reopening this modal.</div>
                ) : (
                  <select value={teacherId ?? ''} onChange={(e) => { setTeacherId(e.target.value || null); setSelectedBlockId(null); }} className="filter-select" style={{ width: '100%' }}>
                    <option value="">All teachers at {lead.location_name}</option>
                    {teachers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                )}
              </div>

              {blockLoadError ? (
                <div className="form-error" style={{ padding: '16px', textAlign: 'center', fontSize: 12 }}>
                  Failed to load available blocks. Try selecting a different teacher or closing and reopening.
                </div>
              ) : availableBlocks.length === 0 ? (
                <p className="text-muted" style={{ padding: '16px', textAlign: 'center' }}>
                  No available blocks. Generate blocks first or select a different teacher.
                </p>
              ) : (
                <div className="slot-picker">
                  {Array.from(blocksByDate.entries()).slice(0, 14).map(([date, dateBlocks]) => (
                    <div key={date} className="slot-picker-day">
                      <div className="slot-picker-date">{formatDate(date)}</div>
                      <div className="slot-picker-slots">
                        {dateBlocks.map((b: any) => (
                          <button
                            key={b.id}
                            type="button"
                            className={`slot-picker-slot ${selectedBlockId === b.id ? 'selected' : ''}`}
                            onClick={() => { setSelectedBlockId(b.id); if (!teacherId) setTeacherId(b.teacher_id); }}
                          >
                            <span>{formatTime(b.start_time)}</span>
                            <span className="text-dim" style={{ fontSize: '10px' }}>{teacherMap.get(b.teacher_id) ?? ''}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <label className="checkbox-row">
                <input type="checkbox" checked={recurring} onChange={(e) => setRecurring(e.target.checked)} />
                <span>Recurring weekly at this time</span>
              </label>

              <div className="modal-actions">
                <button className="btn-ghost" onClick={() => setStep('family')}>← Back</button>
                <button className="btn-ghost" onClick={() => { setSelectedBlockId(null); setStep('confirm'); }}>Skip (no slot)</button>
                <button className="btn-primary" onClick={() => setStep('confirm')} disabled={!selectedBlockId}>
                  Next: Confirm →
                </button>
              </div>
            </>
          )}

          {/* Step 3: Confirm */}
          {step === 'confirm' && (
            <>
              <div className="convert-summary">
                <div className="detail-row"><span className="detail-label">Student</span><span>{lead.first_name} {lead.last_name ?? ''}</span></div>
                <div className="detail-row"><span className="detail-label">Instrument</span><span className="badge-primary">{instrumentWithEmojiTitle(lead.instrument)}</span></div>
                <div className="detail-row"><span className="detail-label">Location</span><span className="badge-secondary">{lead.location_name}</span></div>
                <div className="detail-row"><span className="detail-label">Family</span><span>{familyChoice === 'existing' ? existingFamilies.find((f) => f.id === selectedFamilyId)?.name : newFamilyName}</span></div>
                <div className="detail-row"><span className="detail-label">Rate</span><span>${rate}/session</span></div>
                <div className="detail-row"><span className="detail-label">Teacher</span><span>{teacherId ? teacherMap.get(teacherId) ?? '—' : 'Unassigned'}</span></div>
                <div className="detail-row"><span className="detail-label">First Slot</span><span>{selectedBlockId ? 'Selected' + (recurring ? ' (recurring)' : '') : 'None — assign later'}</span></div>
              </div>

              {error && <div className="form-error">{error}</div>}

              <div className="modal-actions">
                <button className="btn-ghost" onClick={() => setStep('schedule')}>← Back</button>
                <button className="btn-primary" onClick={handleConvert} disabled={converting} style={{ flex: 1 }}>
                  {converting ? 'Converting...' : 'Enroll Student'}
                </button>
              </div>
            </>
          )}

          {/* Done */}
          {step === 'done' && result && (
            <>
              <div style={{ textAlign: 'center', padding: '16px' }}>
                <div style={{ fontSize: '48px', marginBottom: '12px' }}>&#10003;</div>
                <h3 style={{ color: 'var(--green)', marginBottom: '8px' }}>{result.student_name} is enrolled!</h3>
                <p className="text-muted" style={{ fontSize: '13px' }}>
                  Student record created. Lead moved to Enrolled.
                </p>
              </div>

              {pendingDupReviewId && (
                <div style={{ textAlign: 'left', marginTop: 8 }}>
                  <DuplicateStudentReviewPanel
                    filterByReviewId={pendingDupReviewId}
                    variant="full"
                    onResolved={() => setPendingDupReviewId(null)}
                  />
                </div>
              )}

              {/* Invoice creation prompt */}
              {resultFamilyId && !invoiceCreated && (
                <div style={{
                  margin: '0 0 16px', padding: '14px 16px', borderRadius: 12,
                  background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.15)',
                }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#E0E0F4', marginBottom: 8 }}>Create First Invoice?</div>
                  <div style={{ display: 'flex', gap: 16, marginBottom: 10, fontSize: 12, color: '#C0C0D8' }}>
                    <div>
                      <span style={{ color: '#8080A8' }}>Family:</span>{' '}
                      {familyChoice === 'existing' ? allFamilies.find(f => f.id === selectedFamilyId)?.name : newFamilyName}
                    </div>
                    <div>
                      <span style={{ color: '#8080A8' }}>Rate:</span> ${rate}/session
                    </div>
                    <div>
                      <span style={{ color: '#8080A8' }}>Est. Monthly:</span> {dollars(rate * numStudents * 4)}
                    </div>
                  </div>
                  <button
                    onClick={async () => {
                      setCreatingInvoice(true)
                      try {
                        const monthlyCents = Math.round(rate * 100 * numStudents * 4)
                        const now = new Date()
                        const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1)
                        const periodLabel = nextMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
                        const dueDate = nextMonth.toISOString().slice(0, 10)

                        const { error: invErr } = await supabase.from('invoice_tokens').insert({
                          tenant_id: lead.tenant_id ?? tenantId,
                          family_id: resultFamilyId,
                          location_id: lead.location_id,
                          billing_period_label: periodLabel,
                          amount_cents: monthlyCents,
                          base_amount_cents: monthlyCents,
                          due_date: dueDate,
                          billing_day: 1,
                          status: 'pending',
                          expires_at: new Date(nextMonth.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString(),
                          invoice_snapshot: {
                            family_name: familyChoice === 'existing' ? allFamilies.find(f => f.id === selectedFamilyId)?.name : newFamilyName,
                            email: lead.email,
                            phone: lead.phone,
                            students: [{
                              name: `${lead.first_name} ${lead.last_name ?? ''}`.trim(),
                              instrument: lead.instrument,
                              sessions: 4 * numStudents,
                              rate: Math.round(rate * 100),
                              monthly: monthlyCents,
                            }],
                          },
                        })
                        if (invErr) throw invErr
                        setInvoiceCreated(true)
                        qc.invalidateQueries({ queryKey: qk.invoices.tokensList })
                        qc.invalidateQueries({ queryKey: qk.invoices.pendingCount })
                      } catch (err: any) {
                        setError(err.message ?? 'Failed to create invoice')
                      } finally {
                        setCreatingInvoice(false)
                      }
                    }}
                    disabled={creatingInvoice}
                    style={{
                      width: '100%', padding: '10px 0', borderRadius: 8, border: 'none',
                      background: creatingInvoice ? '#606088' : '#22C55E', color: '#fff',
                      fontSize: 13, fontWeight: 700, cursor: creatingInvoice ? 'default' : 'pointer',
                    }}
                  >
                    {creatingInvoice ? 'Creating...' : 'Create Pending Invoice'}
                  </button>
                </div>
              )}

              {invoiceCreated && (
                <div style={{
                  margin: '0 0 16px', padding: '12px 16px', borderRadius: 12,
                  background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.25)',
                  textAlign: 'center', fontSize: 13, fontWeight: 700, color: '#22C55E',
                }}>
                  &#10003; Invoice created — ready to send from Billing
                </div>
              )}

              {error && <div className="form-error">{error}</div>}

              <div className="modal-actions" style={{ justifyContent: 'center', flexWrap: 'wrap', gap: 8 }}>
                <button className="btn-primary" onClick={() => navigate(`/admin/students?id=${result.student_id}`)}>
                  View Student Profile
                </button>
                {resultFamilyId && (
                  <button className="btn-ghost" onClick={() => navigate(`/admin/families?family=${resultFamilyId}`)}>
                    View Family
                  </button>
                )}
                {invoiceCreated && (
                  <button className="btn-ghost" onClick={() => navigate('/admin/billing')}>
                    Go to Billing
                  </button>
                )}
                <button className="btn-ghost" onClick={onClose}>Close</button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
