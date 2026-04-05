import { useState, useEffect, useRef } from 'react'

type TabKey = 'active' | 'at-risk' | 'win-back' | 'campaigns'

interface GuideStep {
  id: string
  target: string
  title: string
  body: string
  requireTab: TabKey
  interactive?: boolean
  waitForClick?: boolean
}

const STEPS: GuideStep[] = [
  {
    id: 'intro',
    target: '[data-guide-id="retention-header"]',
    title: 'Retention = Revenue',
    body: "It costs 5x more to enroll a new student than to keep one. This page is your early warning system. It tells you which students are thriving, which are slipping, and which are about to quit — before they actually do. Work this page weekly.",
    requireTab: 'active',
  },
  {
    id: 'active-tab',
    target: '[data-guide-id="tab-active"]',
    title: 'Active Students',
    body: "These are your currently enrolled students ranked by engagement. Students at the top are your most consistent — great attendance, strong notes from teachers. Students toward the bottom need attention. The platform flags them automatically.",
    requireTab: 'active',
  },
  {
    id: 'progress-card',
    target: '[data-guide-id="progress-card"]',
    title: 'Progress Cards',
    body: "Each card is an AI-generated snapshot of that student's journey — sessions completed, what they've been working on, milestones hit, and how their attendance compares to other students. These are built from real teacher notes and session data.",
    requireTab: 'active',
  },
  {
    id: 'interactive',
    target: '[data-guide-id="generate-card-btn"]',
    title: 'Try It Live',
    body: "Tap 'Generate Card' on this student →",
    requireTab: 'active',
    interactive: true,
    waitForClick: true,
  },
  {
    id: 'interactive-followup',
    target: '[data-guide-id="generate-card-btn"]',
    title: 'Real Data, Real Impact',
    body: "That's a real progress snapshot built from actual session data. You can share this with the family to show them what their child has accomplished — it's one of the most powerful retention tools you have.",
    requireTab: 'active',
  },
  {
    id: 'at-risk',
    target: '[data-guide-id="tab-at-risk"]',
    title: 'At-Risk Students',
    body: "Students land here when their attendance drops, notes stop coming in, or they've been flagged by a teacher. These are the students most likely to quit in the next 30-60 days. The earlier you reach out, the better your odds of keeping them. A personal text from you as the director hits different than an automated message.",
    requireTab: 'at-risk',
  },
  {
    id: 'win-back',
    target: '[data-guide-id="tab-win-back"]',
    title: 'Win-Back',
    body: "These are former students who've left the studio. The platform automatically flags them for re-engagement outreach at the right time. A student who quit 6 months ago is often ready to come back — especially if a personal message comes from someone they remember.",
    requireTab: 'win-back',
  },
  {
    id: 'review',
    target: '[data-guide-id="review-request-btn"]',
    title: 'Getting Google Reviews',
    body: "This sends a review request to an active family. Reviews are how new families decide which studio to choose. Target your happiest, longest-enrolled families. One new 5-star review a week compounds into a massive competitive advantage over time.",
    requireTab: 'active',
  },
]

export function RetentionGuide({
  open,
  onClose,
  activeTab,
  setActiveTab,
}: {
  open: boolean
  onClose: () => void
  activeTab: TabKey
  setActiveTab: (t: TabKey) => void
}) {
  const [stepIdx, setStepIdx] = useState(0)
  const [completed, setCompleted] = useState(false)

  // Reset when opened
  useEffect(() => {
    if (open) {
      setStepIdx(0)
      setCompleted(false)
    }
  }, [open])

  const step = STEPS[stepIdx]

  // Switch tab if the current step requires a different one
  useEffect(() => {
    if (!open || !step) return
    if (activeTab !== step.requireTab) {
      setActiveTab(step.requireTab)
    }
  }, [open, step, activeTab, setActiveTab])

  const next = () => {
    if (stepIdx >= STEPS.length - 1) {
      setCompleted(true)
    } else {
      setStepIdx(stepIdx + 1)
    }
  }
  const back = () => setStepIdx((i) => Math.max(0, i - 1))

  const finish = () => {
    setCompleted(false)
    onClose()
  }

  // Listen for target click on interactive steps
  useEffect(() => {
    if (!open || !step?.waitForClick) return
    const handler = (e: MouseEvent) => {
      const targetEl = (e.target as HTMLElement)?.closest(step.target)
      if (targetEl) {
        // Give the user's click time to process, then advance
        setTimeout(() => setStepIdx((i) => i + 1), 200)
      }
    }
    document.addEventListener('click', handler, true)
    return () => document.removeEventListener('click', handler, true)
  }, [open, step])

  if (!open) return null

  if (completed) {
    return <CompletionToast onDone={finish} />
  }

  if (!step) return null

  // Wait for tab switch to settle before spotlighting
  const tabMatches = activeTab === step.requireTab

  return (
    <StepOverlay
      key={step.id}
      step={step}
      stepNumber={stepIdx + 1}
      total={STEPS.length}
      onNext={next}
      onBack={back}
      onSkip={finish}
      canGoBack={stepIdx > 0}
      waitingForTab={!tabMatches}
    />
  )
}

// ───────── Step Overlay (mirrors OnboardingContext style) ─────────
function StepOverlay({
  step,
  stepNumber,
  total,
  onNext,
  onBack,
  onSkip,
  canGoBack,
  waitingForTab,
}: {
  step: GuideStep
  stepNumber: number
  total: number
  onNext: () => void
  onBack: () => void
  onSkip: () => void
  canGoBack: boolean
  waitingForTab: boolean
}) {
  const [rect, setRect] = useState<DOMRect | null>(null)
  const [ready, setReady] = useState(false)
  const [isMobile, setIsMobile] = useState(typeof window !== 'undefined' && window.innerWidth < 768)
  const elRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 768)
    window.addEventListener('resize', handler)
    return () => window.removeEventListener('resize', handler)
  }, [])

  useEffect(() => {
    setReady(false)
    setRect(null)
    if (waitingForTab) return
    let cancelled = false
    const delay = 200
    const handle = setTimeout(() => {
      if (cancelled) return
      let tries = 0
      const tick = () => {
        if (cancelled) return
        const el = document.querySelector(step.target) as HTMLElement | null
        if (el) {
          elRef.current = el
          el.dataset.guideOriginalZIndex = el.style.zIndex
          el.dataset.guideOriginalPosition = el.style.position
          el.dataset.guideOriginalAnimation = el.style.animation
          el.style.animation = 'guidePulse 1.5s ease-in-out infinite'
          if (!el.style.position || el.style.position === 'static') el.style.position = 'relative'
          el.style.zIndex = '10001'
          el.scrollIntoView({ behavior: 'smooth', block: 'center' })
          setTimeout(() => {
            if (cancelled) return
            setRect(el.getBoundingClientRect())
            setReady(true)
          }, 300)
          return
        }
        if (tries++ < 30) setTimeout(tick, 100)
      }
      tick()
    }, delay)
    return () => {
      cancelled = true
      clearTimeout(handle)
      const el = elRef.current
      if (el) {
        el.style.animation = el.dataset.guideOriginalAnimation ?? ''
        el.style.zIndex = el.dataset.guideOriginalZIndex ?? ''
        el.style.position = el.dataset.guideOriginalPosition ?? ''
        delete el.dataset.guideOriginalZIndex
        delete el.dataset.guideOriginalPosition
        delete el.dataset.guideOriginalAnimation
      }
    }
  }, [step.target, waitingForTab])

  useEffect(() => {
    const update = () => {
      const el = document.querySelector(step.target) as HTMLElement | null
      if (el) setRect(el.getBoundingClientRect())
    }
    window.addEventListener('scroll', update, true)
    window.addEventListener('resize', update)
    return () => {
      window.removeEventListener('scroll', update, true)
      window.removeEventListener('resize', update)
    }
  }, [step.target])

  const cardW = 300

  let cardPos: React.CSSProperties
  if (isMobile || !rect) {
    cardPos = { position: 'fixed', bottom: 80, left: 12, right: 12, zIndex: 10002 }
  } else {
    const placeAbove = window.innerHeight - rect.bottom < 240
    const verticalGap = 16
    const top = placeAbove ? rect.top - verticalGap : rect.bottom + verticalGap
    const transform = placeAbove ? 'translateY(-100%)' : 'none'
    let left = rect.left + rect.width / 2 - cardW / 2
    left = Math.max(12, Math.min(left, window.innerWidth - cardW - 12))
    cardPos = { position: 'fixed', top, left, transform, width: cardW, zIndex: 10002 }
  }

  if (!ready) {
    return (
      <>
        <style>{pulseKeyframes}</style>
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 10000, pointerEvents: 'none' }} />
      </>
    )
  }

  const isInteractive = step.waitForClick

  return (
    <>
      <style>{pulseKeyframes}</style>
      <div
        style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
          zIndex: 10000,
          pointerEvents: isInteractive ? 'none' : 'none',
        }}
      />
      <div style={{ ...cardStyle, ...cardPos, padding: 16 }}>
        <div style={{ fontSize: 10, color: '#8080A8', fontWeight: 700, letterSpacing: '0.08em', marginBottom: 6 }}>
          {stepNumber} / {total}
        </div>
        <div style={{ fontSize: 15, fontWeight: 800, color: '#FFFFFF', marginBottom: 6 }}>{step.title}</div>
        <div style={{ fontSize: 13, color: '#A0A0C8', lineHeight: 1.5, marginBottom: 14 }}>{step.body}</div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <button onClick={onSkip} style={linkBtn}>Close Guide</button>
          <div style={{ display: 'flex', gap: 6 }}>
            {canGoBack && <button onClick={onBack} style={ghostBtn}>Back</button>}
            {!isInteractive && (
              <button onClick={onNext} style={primaryBtn}>
                {stepNumber === total ? 'Finish' : 'Next →'}
              </button>
            )}
            {isInteractive && (
              <button onClick={onNext} style={ghostBtn}>Skip →</button>
            )}
          </div>
        </div>
      </div>
    </>
  )
}

// ───────── Completion Toast ─────────
function CompletionToast({ onDone }: { onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, 3200)
    return () => clearTimeout(t)
  }, [onDone])
  return (
    <div style={{
      position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
      zIndex: 10003, padding: '14px 20px', borderRadius: 12,
      background: 'rgba(15,15,30,0.96)',
      border: '1px solid rgba(34,197,94,0.3)',
      boxShadow: '0 16px 48px rgba(0,0,0,0.6)',
      fontSize: 13, fontWeight: 600, color: '#E0E0F4',
      maxWidth: 360, textAlign: 'center',
    }}>
      Retention guide complete. Tap 📖 Guide anytime to replay.
    </div>
  )
}

const pulseKeyframes = `@keyframes guidePulse {
  0%, 100% { box-shadow: 0 0 0 3px rgba(255,184,0,0.6); }
  50% { box-shadow: 0 0 0 7px rgba(255,184,0,0.15); }
}`

const cardStyle: React.CSSProperties = {
  background: 'rgba(15,15,30,0.92)',
  backdropFilter: 'blur(12px)',
  WebkitBackdropFilter: 'blur(12px)',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: 14,
  boxShadow: '0 16px 48px rgba(0,0,0,0.6)',
}

const primaryBtn: React.CSSProperties = {
  padding: '8px 14px', borderRadius: 8, border: 'none', cursor: 'pointer',
  background: '#D4226A', color: '#FFFFFF', fontSize: 13, fontWeight: 800,
}

const ghostBtn: React.CSSProperties = {
  padding: '8px 14px', borderRadius: 8, cursor: 'pointer',
  background: 'transparent', color: '#A0A0C8',
  border: '1px solid rgba(255,255,255,0.12)', fontSize: 13, fontWeight: 600,
}

const linkBtn: React.CSSProperties = {
  background: 'none', border: 'none', cursor: 'pointer',
  color: '#8080A8', fontSize: 12, fontWeight: 500, padding: 0,
}
