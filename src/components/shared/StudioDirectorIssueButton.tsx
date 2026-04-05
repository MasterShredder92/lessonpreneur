import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuthContext } from '../../app/AuthContext'
import { toast } from './Toast'
import { AlertCircle, X } from 'lucide-react'

const PAGE_AREAS = [
  'Dashboard', 'Schedule', 'Students', 'Families', 'Leads',
  'Billing', 'Retention', 'Teachers', 'Settings', 'Other',
]

interface Props {
  variant?: 'sidebar' | 'mobile'
  onClose?: () => void
}

export default function StudioDirectorIssueButton({ variant = 'sidebar', onClose }: Props) {
  const { profile, tenantId } = useAuthContext()
  const [open, setOpen] = useState(false)
  const [pageArea, setPageArea] = useState('Dashboard')
  const [description, setDescription] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const submit = async () => {
    if (!description.trim() || !profile || !tenantId) return
    setSubmitting(true)
    try {
      const { error } = await supabase.from('issue_reports').insert({
        tenant_id: tenantId,
        submitted_by: profile.id,
        page_area: pageArea,
        description: description.trim(),
        status: 'open',
      })
      if (error) throw error
      toast('Report submitted — thank you!', 'success')
      setOpen(false)
      setDescription('')
      setPageArea('Dashboard')
      onClose?.()
    } catch (err: any) {
      toast(err.message ?? 'Failed to submit report', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  const buttonEl = variant === 'sidebar' ? (
    <button
      data-tour-id="report-issue-btn"
      onClick={() => setOpen(true)}
      style={{
        display: 'flex', alignItems: 'center', gap: 8, width: '100%',
        padding: '10px 14px', border: 'none', background: 'rgba(255,184,0,0.08)',
        borderRadius: 8, color: '#FFB800', fontSize: 12, fontWeight: 600,
        cursor: 'pointer', fontFamily: 'inherit',
      }}
    >
      <AlertCircle size={15} />
      <span>Report an Issue</span>
    </button>
  ) : (
    <button
      data-tour-id="report-issue-btn"
      onClick={() => setOpen(true)}
      style={{
        display: 'flex', alignItems: 'center', gap: 14, width: '100%',
        padding: '14px 0', background: 'none', border: 'none',
        borderBottom: '0.5px solid rgba(255,255,255,0.04)',
        cursor: 'pointer', color: '#FFB800',
        WebkitTapHighlightColor: 'transparent',
      }}
    >
      <AlertCircle size={20} style={{ flexShrink: 0 }} />
      <span style={{ fontSize: 15, fontWeight: 600, flex: 1, textAlign: 'left' }}>Report an Issue</span>
    </button>
  )

  return (
    <>
      {buttonEl}
      {open && (
        <div
          onClick={() => setOpen(false)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 10000,
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: '#141224', borderRadius: 16, width: '100%', maxWidth: 440, padding: 20,
              border: '1px solid rgba(255,255,255,0.08)', boxShadow: '0 16px 48px rgba(0,0,0,0.6)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <div style={{ fontSize: 16, fontWeight: 800, color: '#FFFFFF' }}>Report an Issue</div>
              <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#8080A8', padding: 4 }}>
                <X size={18} />
              </button>
            </div>

            <div style={{ marginBottom: 12 }}>
              <label style={{ display: 'block', fontSize: 12, color: '#A0A0C8', fontWeight: 600, marginBottom: 6 }}>
                Page / Area
              </label>
              <select
                value={pageArea}
                onChange={(e) => setPageArea(e.target.value)}
                style={{
                  width: '100%', padding: '10px 12px', fontSize: 13,
                  background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: 8, color: '#E0E0F4', outline: 'none', boxSizing: 'border-box',
                }}
              >
                {PAGE_AREAS.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 12, color: '#A0A0C8', fontWeight: 600, marginBottom: 6 }}>
                Description
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value.slice(0, 500))}
                placeholder="Describe what's happening..."
                rows={4}
                maxLength={500}
                style={{
                  width: '100%', padding: 10, fontSize: 13, fontFamily: 'inherit',
                  background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: 8, color: '#E0E0F4', outline: 'none', boxSizing: 'border-box', resize: 'vertical',
                }}
              />
              <div style={{ fontSize: 10, color: '#606088', marginTop: 4, textAlign: 'right' }}>{description.length}/500</div>
            </div>

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button
                onClick={() => setOpen(false)}
                style={{
                  padding: '10px 16px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.08)',
                  background: 'rgba(255,255,255,0.04)', color: '#A0A0C8', cursor: 'pointer',
                  fontSize: 13, fontWeight: 600,
                }}
              >
                Cancel
              </button>
              <button
                onClick={submit}
                disabled={submitting || !description.trim()}
                style={{
                  padding: '10px 18px', borderRadius: 10, border: 'none',
                  background: description.trim() ? 'linear-gradient(135deg, #D4226A, #FF5500)' : 'rgba(255,255,255,0.08)',
                  color: '#FFFFFF', cursor: submitting ? 'wait' : description.trim() ? 'pointer' : 'not-allowed',
                  fontSize: 13, fontWeight: 800,
                }}
              >
                {submitting ? 'Submitting...' : 'Submit Report'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
