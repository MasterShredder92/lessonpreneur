import { useState, useRef } from 'react'
import { createPortal } from 'react-dom'
import { Bug, X, Upload, ChevronDown } from 'lucide-react'
import { useAuthContext } from '../../app/AuthContext'
import { useIssueContext } from '../../contexts/IssueContext'
import { useCreateIssue, CATEGORIES, SEVERITIES } from '../../hooks/useIssues'
import { toast } from './Toast'

const ALLOWED_ROLES = ['owner', 'admin', 'company_director']

export default function ReportIssueButton() {
  const { role } = useAuthContext()
  if (!role || !ALLOWED_ROLES.includes(role)) return null
  return <ReportButton role={role} />
}

function ReportButton({ role }: { role: string }) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title="Report an issue"
        style={{
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          color: '#55516E',
          opacity: 0.6,
          padding: 4,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'opacity 150ms, color 150ms',
          flexShrink: 0,
        }}
        onMouseEnter={e => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.color = '#D4226A' }}
        onMouseLeave={e => { e.currentTarget.style.opacity = '0.6'; e.currentTarget.style.color = '#55516E' }}
      >
        <Bug size={14} />
      </button>
      {open && <ReportModal role={role} onClose={() => setOpen(false)} />}
    </>
  )
}

function ReportModal({ role, onClose }: { role: string; onClose: () => void }) {
  const { page, section, subsection } = useIssueContext()
  const createIssue = useCreateIssue()
  const fileRef = useRef<HTMLInputElement>(null)

  const [description, setDescription] = useState('')
  const [category, setCategory] = useState('bug')
  const [severity, setSeverity] = useState('normal')
  const [screenshot, setScreenshot] = useState<File | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const canSetSeverity = ALLOWED_ROLES.includes(role)
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768

  const breadcrumb = [page, section, subsection].filter(Boolean).join(' → ')

  const handleScreenshot = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 5 * 1024 * 1024) {
      toast('Screenshot must be under 5MB', 'error')
      return
    }
    setScreenshot(file)
  }

  const handleSubmit = async () => {
    if (!description.trim() || description.trim().length < 10) {
      toast('Please describe the issue (at least 10 characters)', 'error')
      return
    }

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
        severity: canSetSeverity ? severity : 'normal',
        description: description.trim(),
        screenshotFile: screenshot,
      })
      toast('Issue reported — fix pipeline activated', 'success')
      onClose()
    } catch (err: any) {
      toast(err.message ?? 'Failed to report issue', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  const modal = (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 10000, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: isMobile ? 'flex-end' : 'center', justifyContent: 'center' }}
      onClick={onClose}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: isMobile ? '100%' : 440,
          maxHeight: isMobile ? '85vh' : '80vh',
          overflowY: 'auto',
          background: 'rgba(20, 18, 36, 0.98)',
          backdropFilter: 'blur(20px)',
          border: '1px solid rgba(212,34,106,0.15)',
          borderRadius: isMobile ? '20px 20px 0 0' : 16,
          padding: isMobile ? '20px 16px 32px' : '24px 28px',
          boxShadow: '0 0 60px rgba(212,34,106,0.08), 0 24px 60px rgba(0,0,0,0.5)',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Bug size={16} style={{ color: '#D4226A' }} />
            <span style={{ fontSize: 15, fontWeight: 700, color: '#E0E0F4' }}>Report Issue</span>
          </div>
          <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, padding: 6, cursor: 'pointer', color: '#8080A8', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <X size={14} />
          </button>
        </div>

        {/* Breadcrumb */}
        <div style={{ fontSize: 11, color: '#8080A8', marginBottom: 16, padding: '8px 12px', background: 'rgba(255,255,255,0.03)', borderRadius: 8, border: '1px solid rgba(255,255,255,0.06)' }}>
          <span style={{ fontSize: 9, fontWeight: 700, color: '#606088', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Reporting on</span>
          <div style={{ marginTop: 3, color: '#A0A0C8', fontWeight: 600 }}>{breadcrumb}</div>
        </div>

        {/* Category */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#8080A8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>What kind of issue?</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {CATEGORIES.filter(c => c.value !== 'feature_request' || role === 'owner').map(c => (
              <button
                key={c.value}
                onClick={() => setCategory(c.value)}
                style={{
                  padding: '5px 12px', borderRadius: 8, fontSize: 11, fontWeight: 700, cursor: 'pointer',
                  background: category === c.value ? `${c.color}18` : 'rgba(255,255,255,0.04)',
                  color: category === c.value ? c.color : '#8080A8',
                  border: category === c.value ? `1px solid ${c.color}40` : '1px solid rgba(255,255,255,0.06)',
                }}
              >
                {c.pillLabel}
              </button>
            ))}
          </div>
        </div>

        {/* Description */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#8080A8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>What's wrong?</div>
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="Describe the issue..."
            maxLength={500}
            rows={4}
            style={{
              width: '100%', fontSize: 13, padding: '10px 12px', borderRadius: 10,
              background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
              color: '#D0D0E8', resize: 'vertical', fontFamily: 'inherit', outline: 'none',
              lineHeight: 1.5, boxSizing: 'border-box',
            }}
          />
          <div style={{ fontSize: 10, color: '#55516E', marginTop: 3, textAlign: 'right' }}>{500 - description.length}</div>
        </div>

        {/* Screenshot */}
        <div style={{ marginBottom: 14 }}>
          <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" onChange={handleScreenshot} style={{ display: 'none' }} />
          {screenshot ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: 'rgba(255,255,255,0.03)', borderRadius: 8, border: '1px solid rgba(255,255,255,0.06)' }}>
              <span style={{ fontSize: 12, color: '#A0A0C8', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{screenshot.name}</span>
              <button onClick={() => setScreenshot(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#EF4444', padding: 2, display: 'flex' }}>
                <X size={12} />
              </button>
            </div>
          ) : (
            <button
              onClick={() => fileRef.current?.click()}
              style={{
                display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 8,
                background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)',
                color: '#8080A8', fontSize: 12, fontWeight: 600, cursor: 'pointer',
              }}
            >
              <Upload size={12} /> Attach Screenshot
            </button>
          )}
        </div>

        {/* Severity (role-gated) */}
        {canSetSeverity && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#8080A8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Severity</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {SEVERITIES.map(s => (
                <button
                  key={s.value}
                  onClick={() => setSeverity(s.value)}
                  title={s.hint}
                  style={{
                    padding: '5px 12px', borderRadius: 8, fontSize: 11, fontWeight: 700, cursor: 'pointer',
                    background: severity === s.value ? `${s.color}20` : 'rgba(255,255,255,0.04)',
                    color: severity === s.value ? s.color : '#8080A8',
                    border: severity === s.value ? `1px solid ${s.color}40` : '1px solid rgba(255,255,255,0.06)',
                  }}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Submit */}
        <button
          onClick={handleSubmit}
          disabled={submitting || description.trim().length < 10}
          style={{
            width: '100%', padding: '12px 0', borderRadius: 10, fontSize: 14, fontWeight: 700,
            cursor: submitting ? 'wait' : 'pointer',
            background: submitting || description.trim().length < 10 ? 'rgba(212,34,106,0.15)' : 'linear-gradient(135deg, #D4226A, #9B1B5A)',
            color: submitting || description.trim().length < 10 ? '#8080A8' : '#fff',
            border: 'none',
            boxShadow: submitting || description.trim().length < 10 ? 'none' : '0 4px 20px rgba(212,34,106,0.3)',
          }}
        >
          {submitting ? 'Submitting...' : 'Submit Issue'}
        </button>
      </div>
    </div>
  )

  return createPortal(modal, document.body)
}
