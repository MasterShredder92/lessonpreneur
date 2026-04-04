import { useState } from 'react'
import { createPortal } from 'react-dom'
import { Bug, X, Send } from 'lucide-react'
import { useLocation } from 'react-router-dom'
import { useAuthContext } from '../../app/AuthContext'
import { supabase } from '../../lib/supabase'
import { toast } from './Toast'

const PAGE_MAP: Record<string, string> = {
  '/admin/dashboard': 'Dashboard',
  '/admin/schedule': 'Schedule',
  '/admin/students': 'Students',
  '/admin/leads': 'Leads',
  '/admin/families': 'Families',
  '/admin/teachers': 'Teachers',
  '/admin/billing': 'Billing',
  '/admin/payroll': 'Payroll',
  '/admin/retention': 'Retention',
  '/admin/financials': 'Financials',
  '/admin/recruitment': 'Recruitment',
  '/admin/settings': 'Settings',
  '/admin/workflows': 'Workflows',
  '/admin/analytics': 'Analytics',
  '/admin/integrations': 'Integrations',
  '/admin/import': 'Import',
  '/admin/platform': 'Platform',
}

const CATEGORIES = [
  { value: 'bug', label: 'Bug' },
  { value: 'feature', label: 'Feature Request' },
  { value: 'ui', label: 'UI / Design' },
  { value: 'other', label: 'Other' },
]

export default function FloatingIssueReporter() {
  const [open, setOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const location = useLocation()
  const { profile, tenantId, role } = useAuthContext()

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState('bug')
  const [section, setSection] = useState('')

  const currentPage = PAGE_MAP[location.pathname] ?? 'Unknown'
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768

  const resetForm = () => {
    setTitle('')
    setDescription('')
    setCategory('bug')
    setSection('')
  }

  const handleSubmit = async () => {
    if (!title.trim() || !description.trim()) return
    setSubmitting(true)
    try {
      const { error } = await supabase.from('issues').insert({
        tenant_id: tenantId,
        reported_by: profile?.id,
        reported_by_role: role ?? 'unknown',
        page: currentPage,
        section: section.trim() || (isMobile ? `Mobile ${currentPage}` : currentPage),
        element_description: 'User-reported',
        title: title.trim(),
        description: description.trim(),
        category,
        severity: 'normal',
        platform: isMobile ? 'mobile' : 'desktop',
        reported_from_url: location.pathname,
        reported_screen_width: window.innerWidth,
        reported_screen_height: window.innerHeight,
      })
      if (error) throw error
      toast.success('Issue reported — thank you!')
      resetForm()
      setOpen(false)
    } catch {
      toast.error('Failed to submit issue. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

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
          color: '#E8488A',
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
        <Bug size={20} />
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
          onClick={() => { if (!submitting) { setOpen(false); resetForm() } }}
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
                  color: '#E8488A',
                }}>
                  <Bug size={16} />
                </div>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: '#E8E8FC' }}>Report an Issue</div>
                  <div style={{ fontSize: 11, color: '#8080A8' }}>Page: {currentPage}</div>
                </div>
              </div>
              <button
                onClick={() => { setOpen(false); resetForm() }}
                style={{ background: 'none', border: 'none', color: '#8080A8', cursor: 'pointer', padding: 4 }}
              >
                <X size={18} />
              </button>
            </div>

            {/* Form */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: '#A0A0C8', marginBottom: 4, display: 'block' }}>Category</label>
                <div style={{ display: 'flex', gap: 6 }}>
                  {CATEGORIES.map(c => (
                    <button
                      key={c.value}
                      onClick={() => setCategory(c.value)}
                      style={{
                        flex: 1,
                        padding: '7px 0',
                        borderRadius: 8,
                        border: `1px solid ${category === c.value ? 'rgba(212,34,106,0.5)' : 'rgba(255,255,255,0.08)'}`,
                        background: category === c.value ? 'rgba(212,34,106,0.12)' : 'rgba(255,255,255,0.03)',
                        color: category === c.value ? '#E8488A' : '#8080A8',
                        fontSize: 11,
                        fontWeight: 600,
                        cursor: 'pointer',
                        transition: 'all 150ms ease',
                      }}
                    >
                      {c.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: '#A0A0C8', marginBottom: 4, display: 'block' }}>Title *</label>
                <input
                  type="text"
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  placeholder="Brief summary of the issue"
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: 8,
                    border: '1px solid rgba(255,255,255,0.08)',
                    background: 'rgba(255,255,255,0.04)',
                    color: '#E8E8FC',
                    fontSize: 13,
                    fontFamily: 'inherit',
                    outline: 'none',
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: '#A0A0C8', marginBottom: 4, display: 'block' }}>Section (optional)</label>
                <input
                  type="text"
                  value={section}
                  onChange={e => setSection(e.target.value)}
                  placeholder={`e.g. "Mobile Schedule", "Billing Tab"`}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: 8,
                    border: '1px solid rgba(255,255,255,0.08)',
                    background: 'rgba(255,255,255,0.04)',
                    color: '#E8E8FC',
                    fontSize: 13,
                    fontFamily: 'inherit',
                    outline: 'none',
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: '#A0A0C8', marginBottom: 4, display: 'block' }}>Description *</label>
                <textarea
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  placeholder="What happened? What did you expect?"
                  rows={4}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: 8,
                    border: '1px solid rgba(255,255,255,0.08)',
                    background: 'rgba(255,255,255,0.04)',
                    color: '#E8E8FC',
                    fontSize: 13,
                    fontFamily: 'inherit',
                    outline: 'none',
                    resize: 'vertical',
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              <button
                onClick={handleSubmit}
                disabled={submitting || !title.trim() || !description.trim()}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  width: '100%',
                  padding: '12px',
                  borderRadius: 10,
                  border: 'none',
                  background: submitting || !title.trim() || !description.trim()
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
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  )
}
