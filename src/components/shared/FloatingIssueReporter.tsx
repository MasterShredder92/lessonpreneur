import { useState, useRef } from 'react'
import { Bug, X, Send, AlertTriangle } from 'lucide-react'
import { useAuthContext } from '../../app/AuthContext'
import { useIssueContext } from '../../contexts/IssueContext'
import { useCreateIssue, CATEGORIES, DESCRIPTION_MAX_LENGTH, checkForDuplicateIssue } from '../../hooks/useIssues'
import { toast } from './Toast'

export default function FloatingIssueReporter() {
  const [open, setOpen] = useState(false)
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768

  return (
    <>
      {/* Floating bug button */}
      <button
        onClick={() => setOpen(true)}
        aria-label="Report an issue"
        style={{
          position: 'fixed',
          bottom: isMobile ? `calc(68px + env(safe-area-inset-bottom))` : 20,
          right: 16,
          zIndex: 9980,
          width: 44,
          height: 44,
          borderRadius: '50%',
          border: '1px solid rgba(212, 34, 106, 0.4)',
          background: 'rgba(212, 34, 106, 0.15)',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 4px 16px rgba(212, 34, 106, 0.25)',
          transition: 'transform 150ms ease, box-shadow 150ms ease',
          WebkitTapHighlightColor: 'transparent',
        }}
        onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.1)'; e.currentTarget.style.boxShadow = '0 6px 24px rgba(212, 34, 106, 0.4)' }}
        onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.boxShadow = '0 4px 16px rgba(212, 34, 106, 0.25)' }}
      >
        <Bug size={20} style={{ color: '#D4226A' }} />
      </button>

      {open && <FloatingReportModal onClose={() => setOpen(false)} />}
    </>
  )
}

function FloatingReportModal({ onClose }: { onClose: () => void }) {
  const { page, section, subsection } = useIssueContext()
  const { tenantId } = useAuthContext()
  const createIssue = useCreateIssue()

  const [description, setDescription] = useState('')
  const [stepsToReproduce, setStepsToReproduce] = useState('')
  const [category, setCategory] = useState('bug')
  const [submitting, setSubmitting] = useState(false)

  // Duplicate warning state
  const [duplicateWarning, setDuplicateWarning] = useState<{ id: string; title: string } | null>(null)
  const [duplicateChecked, setDuplicateChecked] = useState(false)

  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768
  const breadcrumb = [page, section, subsection].filter(Boolean).join(' > ')

  const doSubmit = async () => {
    setSubmitting(true)
    try {
      const title = description.trim().slice(0, 100)
      await createIssue.mutateAsync({
        title,
        page,
        section: section ?? 'General',
        subsection: subsection ?? null,
        platform: isMobile ? 'mobile' : 'desktop',
        element_description: breadcrumb,
        category,
        severity: 'normal',
        description: description.trim(),
        steps_to_reproduce: stepsToReproduce.trim() || null,
      })
      toast('Issue reported — thank you!', 'success')
      onClose()
    } catch {
      toast('Failed to submit issue. Please try again.', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  const handleSubmit = async () => {
    if (!description.trim() || description.trim().length < 10) {
      toast('Please describe the issue (at least 10 characters)', 'error')
      return
    }

    if (duplicateChecked) {
      await doSubmit()
      return
    }

    if (tenantId && page) {
      setSubmitting(true)
      try {
        const dup = await checkForDuplicateIssue(tenantId, page, description.trim())
        if (dup) {
          setDuplicateWarning(dup)
          setSubmitting(false)
          return
        }
      } catch {
        // If check fails, proceed
      }
      setSubmitting(false)
    }

    await doSubmit()
  }

  const handleSubmitAnyway = async () => {
    setDuplicateWarning(null)
    setDuplicateChecked(true)
    await doSubmit()
  }

  const modal = (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 10000,
        background: 'rgba(0,0,0,0.6)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: isMobile ? 'flex-end' : 'center',
        justifyContent: 'center',
      }}
      onClick={() => { if (!submitting) onClose() }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: isMobile ? '100%' : 420,
          maxHeight: '85vh',
          overflowY: 'auto',
          background: 'rgba(16, 14, 30, 0.99)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: isMobile ? '20px 20px 0 0' : 16,
          padding: 24,
          boxShadow: '0 24px 80px rgba(0,0,0,0.8)',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 32, height: 32, borderRadius: '50%',
              background: 'rgba(212, 34, 106, 0.15)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Bug size={16} style={{ color: '#D4226A' }} />
            </div>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#E8E8FC' }}>How can we help?</div>
              <div style={{ fontSize: 11, color: '#8080A8' }}>{breadcrumb}</div>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: '#8080A8', cursor: 'pointer', padding: 4 }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Form */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Category - user_friendly_category */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#8080A8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>What kind of issue?</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {CATEGORIES.map(c => (
                <button
                  key={c.value}
                  onClick={() => setCategory(c.value)}
                  style={{
                    padding: '5px 12px',
                    borderRadius: 8,
                    fontSize: 11,
                    fontWeight: 700,
                    cursor: 'pointer',
                    background: category === c.value ? `${c.color}18` : 'rgba(255,255,255,0.04)',
                    color: category === c.value ? c.color : '#8080A8',
                    border: category === c.value ? `1px solid ${c.color}40` : '1px solid rgba(255,255,255,0.06)',
                    transition: 'all 150ms ease',
                  }}
                >
                  {c.pillLabel}
                </button>
              ))}
            </div>
          </div>

          {/* Description - "What happened?" */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#8080A8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>What happened?</div>
            <textarea
              value={description}
              onChange={e => { setDescription(e.target.value); setDuplicateWarning(null); setDuplicateChecked(false) }}
              placeholder="Tell us what went wrong or what you expected to happen..."
              maxLength={DESCRIPTION_MAX_LENGTH}
              rows={4}
              style={{
                width: '100%',
                padding: '10px 12px',
                borderRadius: 10,
                border: '1px solid rgba(255,255,255,0.08)',
                background: 'rgba(255,255,255,0.04)',
                color: '#D0D0E8',
                fontSize: 13,
                fontFamily: 'inherit',
                outline: 'none',
                resize: 'vertical',
                lineHeight: 1.5,
                boxSizing: 'border-box',
              }}
            />
            <div style={{ fontSize: 10, color: '#55516E', marginTop: 3, textAlign: 'right' }}>{DESCRIPTION_MAX_LENGTH - description.length}</div>
          </div>

          {/* Steps to reproduce - "Where did this occur?" */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#8080A8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Where did this occur? <span style={{ fontWeight: 400, textTransform: 'none' }}>(optional)</span></div>
            <textarea
              value={stepsToReproduce}
              onChange={e => setStepsToReproduce(e.target.value)}
              placeholder='e.g. 1. Go to Schedule  2. Tap on a block  3. Nothing happens'
              maxLength={1000}
              rows={2}
              style={{
                width: '100%',
                padding: '10px 12px',
                borderRadius: 10,
                border: '1px solid rgba(255,255,255,0.08)',
                background: 'rgba(255,255,255,0.04)',
                color: '#D0D0E8',
                fontSize: 13,
                fontFamily: 'inherit',
                outline: 'none',
                resize: 'vertical',
                lineHeight: 1.5,
                boxSizing: 'border-box',
              }}
            />
          </div>

          {/* Duplicate Warning */}
          {duplicateWarning && (
            <div style={{
              padding: '12px 14px', borderRadius: 10,
              background: 'rgba(217,119,6,0.08)', border: '1px solid rgba(217,119,6,0.25)',
            }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 10 }}>
                <AlertTriangle size={16} style={{ color: '#D97706', flexShrink: 0, marginTop: 1 }} />
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#D97706', marginBottom: 3 }}>Possible duplicate</div>
                  <div style={{ fontSize: 11, color: '#D4C5A0', lineHeight: 1.4 }}>
                    This may be similar to: <strong>"{duplicateWarning.title}"</strong>
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={handleSubmitAnyway} disabled={submitting} style={{
                  flex: 1, padding: '9px 12px', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer',
                  background: 'rgba(217,119,6,0.15)', border: '1px solid rgba(217,119,6,0.3)', color: '#D97706',
                }}>{submitting ? 'Submitting...' : 'Submit Anyway'}</button>
                <button onClick={() => setDuplicateWarning(null)} style={{
                  flex: 1, padding: '9px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                  background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#A0A0C8',
                }}>Edit Report</button>
              </div>
            </div>
          )}

          {!duplicateWarning && (
            <button
              onClick={handleSubmit}
              disabled={submitting || description.trim().length < 10}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                width: '100%',
                padding: '12px',
                borderRadius: 10,
                border: 'none',
                background: submitting || description.trim().length < 10
                  ? 'rgba(212,34,106,0.3)'
                  : '#D4226A',
                color: '#fff',
                fontSize: 14,
                fontWeight: 700,
                cursor: submitting ? 'wait' : 'pointer',
                fontFamily: 'inherit',
                transition: 'background 150ms ease',
              }}
            >
              <Send size={14} />
              {submitting ? 'Submitting...' : 'Submit Issue'}
            </button>
          )}
        </div>
      </div>
    </div>
  )

  return createPortal(modal, document.body)
}
