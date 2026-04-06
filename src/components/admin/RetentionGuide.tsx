import { useState, useEffect, useRef } from 'react'
import {
  getCardPosition, getArrowStyle, guideCardWidth,
  GUIDE_CARD_STYLE, GUIDE_PRIMARY_BTN, GUIDE_GHOST_BTN, GUIDE_LINK_BTN, GUIDE_PULSE_KEYFRAMES,
} from '../shared/guidePosition'

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

function StepOverlay({
  step, stepNumber, total, onNext, onBack, onSkip, canGoBack, waitingForTab,
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
  const elRef = useRef<HTMLElement | null>(null)
  const cardRef = useRef<HTMLDivElement>(null)
  const [cardDims, setCardDims] = useState({ w: guideCardWidth(), h: 200 })

  // Measure card after render
  useEffect(() => {
    if (!ready || !cardRef.current) return
    const r = cardRef.current.getBoundingClientRect()
    setCardDims({ w: r.width, h: r.height })
  }, [ready, step.id])

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
          }, 400)
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

  // Smart positioning
  const cardW = guideCardWidth()
  let cardPos: React.CSSProperties
  let arrowStyle: React.CSSProperties | null = null

  if (!rect) {
    cardPos = { position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: cardW, zIndex: 10002 }
  } else {
    const pos = getCardPosition(rect, cardW, cardDims.h)
    cardPos = { position: 'fixed', top: pos.top, left: pos.left, width: cardW, zIndex: 10002 }
    arrowStyle = getArrowStyle(pos.placement, rect, pos.left, pos.top, cardW, cardDims.h)
  }

  const isInteractive = step.waitForClick

  if (!ready) {
    return (
      <>
        <style>{GUIDE_PULSE_KEYFRAMES}</style>
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 10000, pointerEvents: 'none' }} />
      </>
    )
  }

  return (
    <>
      <style>{GUIDE_PULSE_KEYFRAMES}</style>
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 10000, pointerEvents: 'none' }} />
      <div ref={cardRef} style={{ ...GUIDE_CARD_STYLE, ...cardPos, padding: 14 }}>
        {arrowStyle && <div style={arrowStyle} />}
        <div style={{ fontSize: 10, color: '#8080A8', fontWeight: 700, letterSpacing: '0.08em', marginBottom: 4 }}>
          {stepNumber} / {total}
        </div>
        <div style={{ fontSize: 14, fontWeight: 800, color: '#FFFFFF', marginBottom: 4 }}>{step.title}</div>
        <div style={{ fontSize: 13, color: '#A0A0C8', lineHeight: 1.5, marginBottom: 12 }}>{step.body}</div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <button onClick={onSkip} style={GUIDE_LINK_BTN}>Skip</button>
          <div style={{ display: 'flex', gap: 6 }}>
            {canGoBack && <button onClick={onBack} style={GUIDE_GHOST_BTN}>Back</button>}
            {!isInteractive && (
              <button onClick={onNext} style={GUIDE_PRIMARY_BTN}>
                {stepNumber === total ? 'Finish' : 'Next →'}
              </button>
            )}
            {isInteractive && (
              <button onClick={onNext} style={GUIDE_GHOST_BTN}>Skip →</button>
            )}
          </div>
        </div>
      </div>
    </>
  )
}

function CompletionToast({ onDone }: { onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, 3200)
    return () => clearTimeout(t)
  }, [onDone])
  return (
    <div style={{
      position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
      zIndex: 10003, ...GUIDE_CARD_STYLE, padding: '14px 20px',
      fontSize: 13, fontWeight: 600, color: '#E0E0F4', maxWidth: 360, textAlign: 'center',
    }}>
      Retention guide complete. Tap 📖 Guide anytime to replay.
    </div>
  )
}
