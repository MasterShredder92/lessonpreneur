import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuthContext } from '../../app/AuthContext'
import { toast } from './Toast'
import { AlertCircle, X } from 'lucide-react'

const PAGE_AREAS = [
  'Dashboard', 'Schedule', 'Students', 'Families', 'Leads',
  'Billing', 'Retention', 'Teachers', 'Settings', 'Other',
]

const GUIDE_KEY = 'issue_report_guide_seen'

interface GuideStep {
  selector: string
  title: string
  body: string
}

const GUIDE_STEPS: GuideStep[] = [
  {
    selector: '[data-tour-id="report-issue-btn"]',
    title: 'Reporting an Issue',
    body: "If something looks broken, missing, or just doesn't make sense on any page — this is how you flag it. It takes 20 seconds and goes directly to the owner. Nothing gets fixed if it isn't reported. Don't work around bugs — report them.",
  },
  {
    selector: '[data-tour-id="report-issue-btn"]',
    title: 'How to Report Well',
    body: "Choose the page where you saw the issue, then describe exactly what happened in plain language. 'The check-in button on Schedule didn't do anything when I tapped it' is perfect. 'Something is broken' is not enough to fix. Be specific — you're the eyes on the ground.",
  },
  {
    selector: '[data-tour-id="issue-page-area"]',
    title: 'Which Page?',
    body: 'Pick the page where you saw the issue. This helps route it to the right fix immediately.',
  },
  {
    selector: '[data-tour-id="issue-description"]',
    title: 'Describe It',
    body: 'Type exactly what happened. What were you trying to do? What did you see instead? The more specific, the faster it gets fixed.',
  },
  {
    selector: '[data-tour-id="issue-submit-btn"]',
    title: 'Send It',
    body: 'Tap Submit. The report closes, you go back to where you were, and the owner sees it instantly. Done.',
  },
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
  const [guideStep, setGuideStep] = useState<number>(-1)

  const handleButtonClick = () => {
    const seen = typeof window !== 'undefined' && window.localStorage.getItem(GUIDE_KEY) === 'true'
    if (seen) {
      setOpen(true)
    } else {
      setGuideStep(0)
    }
  }

  const advanceGuide = () => {
    setGuideStep((s) => {
      const nextIdx = s + 1
      // After step 2 (index 1), open the modal so field targets exist.
      if (s === 1) setOpen(true)
      if (nextIdx >= GUIDE_STEPS.length) {
        try { window.localStorage.setItem(GUIDE_KEY, 'true') } catch {}
        return -1
      }
      return nextIdx
    })
  }

  const dismissGuide = () => {
    try { window.localStorage.setItem(GUIDE_KEY, 'true') } catch {}
    setGuideStep(-1)
  }

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
      toast('Issue reported — thank you!', 'success')
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
      onClick={handleButtonClick}
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
      onClick={handleButtonClick}
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
                data-tour-id="issue-page-area"
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
                data-tour-id="issue-description"
                value={description}
                onChange={(e) => setDescription(e.target.value.slice(0, 1500))}
                placeholder="Describe what's happening — the more detail, the faster we can fix it..."
                rows={6}
                maxLength={1500}
                style={{
                  width: '100%', padding: 10, fontSize: 13, fontFamily: 'inherit',
                  background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: 8, color: '#E0E0F4', outline: 'none', boxSizing: 'border-box', resize: 'vertical',
                }}
              />
              <div style={{ fontSize: 10, color: (1500 - description.length) < 100 ? '#D4226A' : '#606088', marginTop: 4, textAlign: 'right' }}>{1500 - description.length} characters remaining</div>
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
                data-tour-id="issue-submit-btn"
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
      {guideStep >= 0 && (
        <GuideOverlay
          step={GUIDE_STEPS[guideStep]}
          stepNumber={guideStep + 1}
          total={GUIDE_STEPS.length}
          onNext={advanceGuide}
          onSkip={dismissGuide}
        />
      )}
    </>
  )
}

// ───────── Micro-Guide Overlay ─────────
function GuideOverlay({
  step, stepNumber, total, onNext, onSkip,
}: {
  step: GuideStep
  stepNumber: number
  total: number
  onNext: () => void
  onSkip: () => void
}) {
  const [rect, setRect] = useState<DOMRect | null>(null)

  useEffect(() => {
    let cancelled = false
    let tries = 0
    const find = () => {
      if (cancelled) return
      const el = document.querySelector(step.selector) as HTMLElement | null
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' })
        setTimeout(() => {
          if (cancelled) return
          setRect(el.getBoundingClientRect())
        }, 250)
        return
      }
      if (tries++ < 30) setTimeout(find, 100)
    }
    setRect(null)
    find()

    const update = () => {
      const el = document.querySelector(step.selector) as HTMLElement | null
      if (el) setRect(el.getBoundingClientRect())
    }
    window.addEventListener('scroll', update, true)
    window.addEventListener('resize', update)
    return () => {
      cancelled = true
      window.removeEventListener('scroll', update, true)
      window.removeEventListener('resize', update)
    }
  }, [step.selector])

  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768
  const cardW = 280

  let cardPos: React.CSSProperties
  if (isMobile || !rect) {
    cardPos = { position: 'fixed', bottom: 80, left: 12, right: 12, zIndex: 20001 }
  } else {
    const placeAbove = window.innerHeight - rect.bottom < 220
    const gap = 14
    const top = placeAbove ? rect.top - gap : rect.bottom + gap
    const transform = placeAbove ? 'translateY(-100%)' : 'none'
    let left = rect.left + rect.width / 2 - cardW / 2
    left = Math.max(12, Math.min(left, window.innerWidth - cardW - 12))
    cardPos = { position: 'fixed', top, left, transform, width: cardW, zIndex: 20001 }
  }

  return (
    <>
      <style>{`
        @keyframes issueGuidePulse {
          0%, 100% { box-shadow: 0 0 0 3px rgba(255,184,0,0.7), 0 0 0 8px rgba(255,184,0,0.18); }
          50% { box-shadow: 0 0 0 5px rgba(255,184,0,0.4), 0 0 0 14px rgba(255,184,0,0.06); }
        }
      `}</style>
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 20000, pointerEvents: 'none' }} />
      {rect && (
        <div
          style={{
            position: 'fixed',
            top: rect.top - 4,
            left: rect.left - 4,
            width: rect.width + 8,
            height: rect.height + 8,
            borderRadius: 10,
            zIndex: 20000,
            pointerEvents: 'none',
            animation: 'issueGuidePulse 1.5s ease-in-out infinite',
          }}
        />
      )}
      <div
        style={{
          ...cardPos,
          background: 'rgba(15,15,30,0.94)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 14,
          boxShadow: '0 16px 48px rgba(0,0,0,0.6)',
          padding: 16,
        }}
      >
        <div style={{ fontSize: 10, color: '#8080A8', fontWeight: 700, letterSpacing: '0.08em', marginBottom: 6 }}>
          {stepNumber} / {total}
        </div>
        <div style={{ fontSize: 15, fontWeight: 800, color: '#FFFFFF', marginBottom: 6 }}>{step.title}</div>
        <div style={{ fontSize: 13, color: '#A0A0C8', lineHeight: 1.5, marginBottom: 14 }}>{step.body}</div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <button
            onClick={onSkip}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: '#8080A8', fontSize: 12, fontWeight: 500, padding: 0,
            }}
          >
            Skip
          </button>
          <button
            onClick={onNext}
            style={{
              padding: '8px 14px', borderRadius: 8, border: 'none', cursor: 'pointer',
              background: '#D4226A', color: '#FFFFFF', fontSize: 13, fontWeight: 800,
            }}
          >
            {stepNumber === total ? 'Got It' : 'Next →'}
          </button>
        </div>
      </div>
    </>
  )
}
