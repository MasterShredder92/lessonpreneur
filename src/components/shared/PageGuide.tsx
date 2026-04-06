import { useState, useEffect, useCallback, useRef, type ReactNode } from 'react'
import { toast } from './Toast'
import {
  getCardPosition, getArrowStyle, guideCardWidth,
  GUIDE_CARD_STYLE, GUIDE_PRIMARY_BTN, GUIDE_GHOST_BTN, GUIDE_LINK_BTN, GUIDE_PULSE_KEYFRAMES,
} from './guidePosition'

export interface GuideStep {
  id: string
  targetSelector: string
  title: string
  body: string
  skipIf?: boolean
  tooltipAbove?: boolean
  /** Click this selector before spotlighting (e.g. switch a tab). */
  clickBeforeShow?: string
  /** Shown as a hint in the card; clicking the target advances the guide. */
  interactivePrompt?: string
  /** If true and the target cannot be found, skip this step instead of showing "Nothing to highlight". */
  skipIfMissing?: boolean
}

interface PageGuideProps {
  steps: GuideStep[]
  completionMessage?: string
  buttonLabel?: string
  /** If false, the guide button is not rendered. */
  enabled?: boolean
}

type Phase = 'idle' | 'steps'

export default function PageGuide({
  steps,
  completionMessage = 'Guide complete. Tap 📖 Guide anytime to replay.',
  buttonLabel = '📖 Guide',
  enabled = true,
}: PageGuideProps) {
  const [phase, setPhase] = useState<Phase>('idle')
  const [stepIdx, setStepIdx] = useState(0)

  const activeSteps = steps.filter((s) => !s.skipIf)

  const start = useCallback(() => {
    setStepIdx(0)
    setPhase('steps')
  }, [])

  const next = useCallback(() => {
    setStepIdx((i) => {
      if (i >= activeSteps.length - 1) {
        setPhase('idle')
        toast(completionMessage, 'success')
        return i
      }
      return i + 1
    })
  }, [activeSteps.length, completionMessage])

  const back = useCallback(() => setStepIdx((i) => Math.max(0, i - 1)), [])

  const close = useCallback(() => setPhase('idle'), [])

  if (!enabled) return null

  return (
    <>
      <style>{GUIDE_PULSE_KEYFRAMES}</style>
      <button
        onClick={start}
        style={{
          display: 'flex', alignItems: 'center', gap: 5,
          padding: '4px 10px', borderRadius: 7,
          border: '1px solid rgba(255,184,0,0.3)',
          background: 'rgba(255,184,0,0.08)',
          color: '#FFB800', fontSize: 11, fontWeight: 700, cursor: 'pointer',
          whiteSpace: 'nowrap',
        }}
      >
        {buttonLabel}
      </button>
      {phase === 'steps' && activeSteps[stepIdx] && (
        <StepOverlay
          key={activeSteps[stepIdx].id}
          step={activeSteps[stepIdx]}
          stepNumber={stepIdx + 1}
          total={activeSteps.length}
          onNext={next}
          onBack={back}
          onClose={close}
          canGoBack={stepIdx > 0}
        />
      )}
    </>
  )
}

function StepOverlay({
  step, stepNumber, total, onNext, onBack, onClose, canGoBack,
}: {
  step: GuideStep
  stepNumber: number
  total: number
  onNext: () => void
  onBack: () => void
  onClose: () => void
  canGoBack: boolean
}): ReactNode {
  const [rect, setRect] = useState<DOMRect | null>(null)
  const [ready, setReady] = useState(false)
  const [notFound, setNotFound] = useState(false)
  const cardRef = useRef<HTMLDivElement>(null)
  const [cardDims, setCardDims] = useState({ w: guideCardWidth(), h: 200 })

  // Measure card dimensions after render
  useEffect(() => {
    if (!ready || !cardRef.current) return
    const r = cardRef.current.getBoundingClientRect()
    setCardDims({ w: r.width, h: r.height })
  }, [ready, step.id])

  useEffect(() => {
    setReady(false)
    setNotFound(false)
    setRect(null)
    let cancelled = false
    let tries = 0
    let boundEl: HTMLElement | null = null
    let clickHandler: (() => void) | null = null

    // Fire a tab-switch click first if requested
    if (step.clickBeforeShow) {
      const tabEl = document.querySelector(step.clickBeforeShow) as HTMLElement | null
      if (tabEl) tabEl.click()
    }

    const tick = () => {
      if (cancelled) return
      const el = document.querySelector(step.targetSelector) as HTMLElement | null
      if (el) {
        boundEl = el
        el.dataset.guideOrigBoxShadow = el.style.boxShadow
        el.dataset.guideOrigZIndex = el.style.zIndex
        el.dataset.guideOrigPosition = el.style.position
        el.dataset.guideOrigAnimation = el.style.animation
        el.style.animation = 'guidePulse 1.5s ease-in-out infinite'
        if (!el.style.position || el.style.position === 'static') el.style.position = 'relative'
        el.style.zIndex = '10001'
        el.scrollIntoView({ behavior: 'smooth', block: 'center' })

        if (step.interactivePrompt) {
          clickHandler = () => { setTimeout(() => onNext(), 50) }
          el.addEventListener('click', clickHandler)
        }

        setTimeout(() => {
          if (cancelled) return
          setRect(el.getBoundingClientRect())
          setReady(true)
        }, 400)
        return
      }
      if (tries++ < 20) {
        setTimeout(tick, 100)
      } else if (step.skipIfMissing) {
        if (!cancelled) onNext()
      } else {
        setNotFound(true)
        setReady(true)
      }
    }
    const startDelay = step.clickBeforeShow ? 200 : 0
    const handle = setTimeout(tick, startDelay)
    return () => {
      cancelled = true
      clearTimeout(handle)
      if (boundEl && clickHandler) boundEl.removeEventListener('click', clickHandler)
      const el = boundEl ?? (document.querySelector(step.targetSelector) as HTMLElement | null)
      if (el) {
        el.style.animation = el.dataset.guideOrigAnimation ?? ''
        el.style.boxShadow = el.dataset.guideOrigBoxShadow ?? ''
        el.style.zIndex = el.dataset.guideOrigZIndex ?? ''
        el.style.position = el.dataset.guideOrigPosition ?? ''
        delete el.dataset.guideOrigBoxShadow
        delete el.dataset.guideOrigZIndex
        delete el.dataset.guideOrigPosition
        delete el.dataset.guideOrigAnimation
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step.targetSelector])

  // Recalculate position on scroll/resize
  useEffect(() => {
    const update = () => {
      const el = document.querySelector(step.targetSelector) as HTMLElement | null
      if (el) setRect(el.getBoundingClientRect())
    }
    window.addEventListener('scroll', update, true)
    window.addEventListener('resize', update)
    return () => {
      window.removeEventListener('scroll', update, true)
      window.removeEventListener('resize', update)
    }
  }, [step.targetSelector])

  // Calculate position using smart algorithm
  const cardW = guideCardWidth()
  let cardPos: React.CSSProperties
  let arrowStyle: React.CSSProperties | null = null

  if (!rect || notFound) {
    // Fallback: center in viewport
    cardPos = { position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: cardW, zIndex: 10002 }
  } else {
    const pos = getCardPosition(rect, cardW, cardDims.h)
    cardPos = { position: 'fixed', top: pos.top, left: pos.left, width: cardW, zIndex: 10002 }
    arrowStyle = getArrowStyle(pos.placement, rect, pos.left, pos.top, cardW, cardDims.h)
  }

  if (!ready) {
    return <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 10000, pointerEvents: 'none' }} />
  }

  return (
    <>
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 10000, pointerEvents: 'none' }} />
      <div ref={cardRef} style={{ ...GUIDE_CARD_STYLE, ...cardPos, padding: 14 }}>
        {arrowStyle && <div style={arrowStyle} />}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
          <div style={{ fontSize: 10, color: '#8080A8', fontWeight: 700, letterSpacing: '0.08em' }}>
            {stepNumber} / {total}
          </div>
          <button onClick={onClose} aria-label="Close guide" style={{ background: 'none', border: 'none', color: '#8080A8', cursor: 'pointer', fontSize: 16, padding: 0, lineHeight: 1 }}>×</button>
        </div>
        <div style={{ fontSize: 14, fontWeight: 800, color: '#FFFFFF', marginBottom: 4 }}>{step.title}</div>
        <div style={{ fontSize: 13, color: '#A0A0C8', lineHeight: 1.5, marginBottom: 12 }}>{step.body}</div>
        {step.interactivePrompt && !notFound && (
          <div style={{ fontSize: 11, color: '#FFB800', marginBottom: 10, padding: '6px 8px', background: 'rgba(255,184,0,0.08)', border: '1px solid rgba(255,184,0,0.2)', borderRadius: 6, fontWeight: 600 }}>
            {step.interactivePrompt}
          </div>
        )}
        {notFound && (
          <div style={{ fontSize: 11, color: '#FFB800', marginBottom: 10, padding: '6px 8px', background: 'rgba(255,184,0,0.08)', border: '1px solid rgba(255,184,0,0.2)', borderRadius: 6 }}>
            Nothing to highlight for this step right now — keep going.
          </div>
        )}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <button onClick={onClose} style={GUIDE_LINK_BTN}>Skip</button>
          <div style={{ display: 'flex', gap: 6 }}>
            {canGoBack && <button onClick={onBack} style={GUIDE_GHOST_BTN}>Back</button>}
            <button onClick={onNext} style={GUIDE_PRIMARY_BTN}>{stepNumber === total ? 'Done' : 'Next →'}</button>
          </div>
        </div>
      </div>
    </>
  )
}
