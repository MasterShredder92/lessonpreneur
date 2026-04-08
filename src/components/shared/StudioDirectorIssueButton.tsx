import { useState, useEffect, useRef } from 'react'
import { useAuthContext } from '../../app/AuthContext'
import { useIssueContext } from '../../contexts/IssueContext'
import { useCreateIssue, CATEGORIES, DESCRIPTION_MAX_LENGTH } from '../../hooks/useIssues'
import { toast } from './Toast'
import { AlertCircle, X, Upload } from 'lucide-react'

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
    body: "Choose what kind of issue it is, then describe exactly what happened in plain language. 'The check-in button on Schedule didn't do anything when I tapped it' is perfect. 'Something is broken' is not enough to fix. Be specific — you're the eyes on the ground.",
  },
  {
    selector: '[data-tour-id="issue-category"]',
    title: 'What Kind of Issue?',
    body: 'Pick the category that best describes what you saw. This helps route it to the right fix immediately.',
  },
  {
    selector: '[data-tour-id="issue-description"]',
    title: 'What Happened?',
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
  const { profile } = useAuthContext()
  const { page, section, subsection } = useIssueContext()
  const createIssue = useCreateIssue()

  const [open, setOpen] = useState(false)
  const [category, setCategory] = useState('bug')
  const [description, setDescription] = useState('')
  const [stepsToReproduce, setStepsToReproduce] = useState('')
  const [screenshot, setScreenshot] = useState<File | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [guideStep, setGuideStep] = useState<number>(-1)
  const fileRef = useRef<HTMLInputElement>(null)

  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768
  const breadcrumb = [page, section, subsection].filter(Boolean).join(' → ')
  const selectedCategory = CATEGORIES.find(c => c.value === category)

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

  const handleScreenshot = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 5 * 1024 * 1024) {
      toast('Screenshot must be under 5MB', 'error')
      return
    }
    setScreenshot(file)
  }

  const resetForm = () => {
    setDescription('')
    setStepsToReproduce('')
    setCategory('bug')
    setScreenshot(null)
  }

  const submit = async () => {
    if (!description.trim() || description.trim().length < 10) {
      toast('Please describe the issue (at least 10 characters)', 'error')
      return
    }
    if (!profile) return
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
        user_friendly_category: selectedCategory?.friendlyLabel ?? null,
        screenshotFile: screenshot,
      })
      toast('Issue reported — thank you!', 'success')
      setOpen(false)
      resetForm()
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
            display: 'flex', alignItems: isMobile ? 'flex-end' : 'center', justifyContent: 'center', padding: 16,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: '#141224', borderRadius: isMobile ? '20px 20px 0 0' : 16,
              width: '100%', maxWidth: 440,
              maxHeight: isMobile ? '85vh' : '80vh', overflowY: 'auto',
              padding: isMobile ? '20px 16px 32px' : '24px 28px',
              border: '1px solid rgba(255,255,255,0.08)', boxShadow: '0 16px 48px rgba(0,0,0,0.6)',
            }}
          >
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <AlertCircle size={16} style={{ color: '#FFB800' }} />
                <span style={{ fontSize: 16, fontWeight: 800, color: '#FFFFFF' }}>How can we help?</span>
              </div>
              <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#8080A8', padding: 4 }}>
                <X size={18} />
              </button>
            </div>

            {/* Where did this occur? */}
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#8080A8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Where did this occur?</div>
              <div style={{ fontSize: 12, color: '#A0A0C8', fontWeight: 600, padding: '8px 12px', background: 'rgba(255,255,255,0.03)', borderRadius: 8, border: '1px solid rgba(255,255,255,0.06)' }}>
                {breadcrumb || page || 'Unknown'}
              </div>
            </div>

            {/* Category */}
            <div style={{ marginBottom: 14 }} data-tour-id="issue-category">
              <div style={{ fontSize: 11, fontWeight: 700, color: '#8080A8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>What kind of issue?</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {CATEGORIES.filter(c => c.value !== 'feature_request').map(c => (
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
              <div style={{ fontSize: 11, fontWeight: 700, color: '#8080A8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>What happened?</div>
              <textarea
                data-tour-id="issue-description"
                value={description}
                onChange={(e) => setDescription(e.target.value.slice(0, DESCRIPTION_MAX_LENGTH))}
                placeholder="Tell us what went wrong or what you expected to happen..."
                rows={4}
                maxLength={DESCRIPTION_MAX_LENGTH}
                style={{
                  width: '100%', padding: '10px 12px', fontSize: 13, fontFamily: 'inherit',
                  background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: 10, color: '#E0E0F4', outline: 'none', boxSizing: 'border-box',
                  resize: 'vertical', lineHeight: 1.5,
                }}
              />
              <div style={{ fontSize: 10, color: '#606088', marginTop: 3, textAlign: 'right' }}>{DESCRIPTION_MAX_LENGTH - description.length}</div>
            </div>

            {/* Steps to reproduce */}
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#8080A8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
                How can we reproduce it? <span style={{ fontWeight: 400, textTransform: 'none' }}>(optional)</span>
              </div>
              <textarea
                value={stepsToReproduce}
                onChange={(e) => setStepsToReproduce(e.target.value)}
                placeholder="e.g. 1. Go to Schedule  2. Tap on a block  3. Nothing happens"
                maxLength={1000}
                rows={2}
                style={{
                  width: '100%', padding: '10px 12px', fontSize: 13, fontFamily: 'inherit',
                  background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: 10, color: '#E0E0F4', outline: 'none', boxSizing: 'border-box',
                  resize: 'vertical', lineHeight: 1.5,
                }}
              />
            </div>

            {/* Screenshot */}
            <div style={{ marginBottom: 16 }}>
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

            {/* Submit */}
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
                disabled={submitting || description.trim().length < 10}
                style={{
                  padding: '10px 18px', borderRadius: 10, border: 'none',
                  background: description.trim().length >= 10 ? 'linear-gradient(135deg, #D4226A, #FF5500)' : 'rgba(255,255,255,0.08)',
                  color: '#FFFFFF', cursor: submitting ? 'wait' : description.trim().length >= 10 ? 'pointer' : 'not-allowed',
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
