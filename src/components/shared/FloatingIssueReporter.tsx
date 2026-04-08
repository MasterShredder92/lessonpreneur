import { useState, useRef } from 'react'
import { createPortal } from 'react-dom'
import { Bug, X, Upload } from 'lucide-react'
import { useAuthContext } from '../../app/AuthContext'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { toast } from './Toast'

const PAGE_OPTIONS = [
  'Dashboard',
  'Schedule',
  'Students',
  'Families',
  'Teachers',
  'Billing',
  'Settings',
  'Something else',
]

const SEVERITY_OPTIONS = [
  { value: 'normal', label: "It's annoying but I can work around it", icon: '🟡' },
  { value: 'high', label: "It's slowing me down", icon: '🟠' },
  { value: 'critical', label: "I can't do my job right now", icon: '🔴' },
]

export default function FloatingIssueReporter() {
  const [open, setOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const { profile, tenantId, role } = useAuthContext()
  const qc = useQueryClient()
  const fileRef = useRef<HTMLInputElement>(null)

  const [description, setDescription] = useState('')
  const [page, setPage] = useState('')
  const [severity, setSeverity] = useState('normal')
  const [screenshot, setScreenshot] = useState<File | null>(null)

  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768

  const resetForm = () => {
    setDescription('')
    setPage('')
    setSeverity('normal')
    setScreenshot(null)
    setSubmitted(false)
  }

  const handleClose = () => {
    if (!submitting) {
      setOpen(false)
      resetForm()
    }
  }

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
    if (!description.trim() || !page) return
    if (!tenantId || !profile) return

    setSubmitting(true)
    try {
      const title = description.trim().slice(0, 100)
      const platform = window.innerWidth < 768 ? 'mobile' : 'desktop'

      // 1. Insert the issue
      const { data: issue, error } = await supabase.from('issues').insert({
        tenant_id: tenantId,
        reported_by: profile.id,
        reported_by_role: role ?? 'unknown',
        page,
        section: page,
        element_description: 'User-reported',
        title,
        description: description.trim(),
        category: 'bug',
        severity,
        status: 'reported',
        deploy_status: 'pending',
        platform,
        reported_from_url: window.location.href,
        reported_screen_width: window.innerWidth,
        reported_screen_height: window.innerHeight,
      }).select().single()

      if (error) throw error

      // 2. Upload screenshot if provided
      if (screenshot && issue) {
        const path = `${tenantId}/${issue.id}/${screenshot.name}`
        const { error: uploadErr } = await supabase.storage
          .from('issue-screenshots')
          .upload(path, screenshot)
        if (!uploadErr) {
          await supabase.from('issues').update({ screenshot_path: path }).eq('id', issue.id)
        }
      }

      // 3. Invalidate issues query so it shows immediately
      qc.invalidateQueries({ queryKey: ['issues'] })

      // 4. Show success state
      setSubmitted(true)
      setTimeout(() => {
        setOpen(false)
        resetForm()
      }, 1500)
    } catch (err: any) {
      toast(err.message ?? 'Failed to submit. Please try again.', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  const canSubmit = description.trim().length >= 10 && page && !submitting

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

      {/* Modal */}
      {open && createPortal(
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 10000,
            background: 'rgba(0,0,0,0.6)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: isMobile ? 'flex-end' : 'center',
            justifyContent: 'center',
          }}
          onClick={handleClose}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              width: isMobile ? '100%' : 440,
              maxHeight: '85vh',
              overflowY: 'auto',
              background: 'rgba(16, 14, 30, 0.99)',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: isMobile ? '20px 20px 0 0' : 16,
              padding: 24,
              boxShadow: '0 24px 80px rgba(0,0,0,0.8)',
            }}
          >
            {submitted ? (
              /* Success state */
              <div style={{ textAlign: 'center', padding: '32px 0' }}>
                <div style={{ fontSize: 28, marginBottom: 12 }}>✓</div>
                <div style={{ fontSize: 16, fontWeight: 800, color: '#22C55E', fontFamily: 'var(--font-display)' }}>
                  Got it — we're on it.
                </div>
              </div>
            ) : (
              <>
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
                    <div style={{ fontSize: 15, fontWeight: 700, color: '#E8E8FC' }}>Report an Issue</div>
                  </div>
                  <button
                    onClick={handleClose}
                    style={{ background: 'none', border: 'none', color: '#8080A8', cursor: 'pointer', padding: 4 }}
                  >
                    <X size={18} />
                  </button>
                </div>

                {/* Form */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  {/* Field 1 — What happened? */}
                  <div>
                    <label style={{ fontSize: 13, fontWeight: 700, color: '#E0E0F4', marginBottom: 6, display: 'block' }}>
                      What happened? *
                    </label>
                    <textarea
                      value={description}
                      onChange={e => setDescription(e.target.value)}
                      placeholder="Describe what went wrong in plain English. Don't worry about technical details."
                      maxLength={1500}
                      rows={5}
                      style={{
                        width: '100%', fontSize: 13, padding: '12px 14px', borderRadius: 10,
                        background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
                        color: '#E0E0F4', resize: 'vertical', fontFamily: 'inherit', outline: 'none',
                        lineHeight: 1.5, boxSizing: 'border-box',
                      }}
                    />
                  </div>

                  {/* Field 2 — Where were you? */}
                  <div>
                    <label style={{ fontSize: 13, fontWeight: 700, color: '#E0E0F4', marginBottom: 6, display: 'block' }}>
                      Where were you in the app? *
                    </label>
                    <select
                      value={page}
                      onChange={e => setPage(e.target.value)}
                      style={{
                        width: '100%', padding: '12px 14px', borderRadius: 10, fontSize: 13,
                        background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
                        color: page ? '#E0E0F4' : '#55516E', outline: 'none', cursor: 'pointer',
                        boxSizing: 'border-box',
                      }}
                    >
                      <option value="">Select a page...</option>
                      {PAGE_OPTIONS.map(p => <option key={p} value={p}>{p}</option>)}
                    </select>
                  </div>

                  {/* Field 3 — How bad is it? */}
                  <div>
                    <label style={{ fontSize: 13, fontWeight: 700, color: '#E0E0F4', marginBottom: 8, display: 'block' }}>
                      How bad is it? *
                    </label>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {SEVERITY_OPTIONS.map(s => (
                        <button
                          key={s.value}
                          onClick={() => setSeverity(s.value)}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 10,
                            padding: '10px 14px', borderRadius: 10, fontSize: 13, fontWeight: 600,
                            cursor: 'pointer', textAlign: 'left', width: '100%',
                            background: severity === s.value ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.02)',
                            color: severity === s.value ? '#E0E0F4' : '#8080A8',
                            border: severity === s.value ? '1.5px solid rgba(255,255,255,0.15)' : '1px solid rgba(255,255,255,0.06)',
                            transition: 'all 150ms ease',
                          }}
                        >
                          <span style={{ fontSize: 16 }}>{s.icon}</span>
                          <span>{s.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Field 4 — Screenshot (optional) */}
                  <div>
                    <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" onChange={handleScreenshot} style={{ display: 'none' }} />
                    {screenshot ? (
                      <div style={{
                        display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px',
                        background: 'rgba(255,255,255,0.03)', borderRadius: 10,
                        border: '1px solid rgba(255,255,255,0.06)',
                      }}>
                        <span style={{ fontSize: 12, color: '#A0A0C8', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {screenshot.name}
                        </span>
                        <button onClick={() => setScreenshot(null)} style={{
                          background: 'none', border: 'none', cursor: 'pointer', color: '#EF4444', padding: 2, display: 'flex',
                        }}>
                          <X size={14} />
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => fileRef.current?.click()}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderRadius: 10,
                          background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)',
                          color: '#8080A8', fontSize: 13, fontWeight: 600, cursor: 'pointer', width: '100%',
                        }}
                      >
                        <Upload size={14} /> Add a screenshot (optional)
                      </button>
                    )}
                  </div>

                  {/* Submit */}
                  <button
                    onClick={handleSubmit}
                    disabled={!canSubmit}
                    style={{
                      width: '100%', padding: '14px 0', borderRadius: 10, fontSize: 14, fontWeight: 700,
                      cursor: canSubmit ? 'pointer' : 'not-allowed',
                      background: canSubmit ? '#D4226A' : 'rgba(212,34,106,0.2)',
                      color: canSubmit ? '#fff' : '#8080A8',
                      border: 'none', fontFamily: 'inherit',
                      transition: 'background 150ms ease',
                    }}
                  >
                    {submitting ? 'Submitting...' : 'Submit'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>,
        document.body
      )}
    </>
  )
}
