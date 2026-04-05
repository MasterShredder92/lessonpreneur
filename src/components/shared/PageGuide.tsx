import { useState, useEffect, useCallback, type ReactNode } from 'react'
import { toast } from './Toast'

export interface GuideStep {
  id: string
  targetSelector: string
  title: string
  body: string
  skipIf?: boolean
  tooltipAbove?: boolean
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
      <style>{`
        @keyframes pageGuidePulse {
          0%, 100% { box-shadow: 0 0 0 3px rgba(255,184,0,0.6); }
          50% { box-shadow: 0 0 0 7px rgba(255,184,0,0.15); }
        }
      `}</style>
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
  const [isMobile, setIsMobile] = useState(typeof window !== 'undefined' && window.innerWidth < 768)

  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 768)
    window.addEventListener('resize', handler)
    return () => window.removeEventListener('resize', handler)
  }, [])

  useEffect(() => {
    setReady(false)
    setNotFound(false)
    setRect(null)
    let cancelled = false
    let tries = 0
    const tick = () => {
      if (cancelled) return
      const el = document.querySelector(step.targetSelector) as HTMLElement | null
      if (el) {
        el.dataset.guideOriginalBoxShadow = el.style.boxShadow
        el.dataset.guideOriginalZIndex = el.style.zIndex
        el.dataset.guideOriginalPosition = el.style.position
        el.dataset.guideOriginalAnimation = el.style.animation
        el.style.animation = 'pageGuidePulse 1.5s ease-in-out infinite'
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
      if (tries++ < 20) {
        setTimeout(tick, 100)
      } else {
        setNotFound(true)
        setReady(true)
      }
    }
    tick()
    return () => {
      cancelled = true
      const el = document.querySelector(step.targetSelector) as HTMLElement | null
      if (el) {
        el.style.animation = el.dataset.guideOriginalAnimation ?? ''
        el.style.boxShadow = el.dataset.guideOriginalBoxShadow ?? ''
        el.style.zIndex = el.dataset.guideOriginalZIndex ?? ''
        el.style.position = el.dataset.guideOriginalPosition ?? ''
        delete el.dataset.guideOriginalBoxShadow
        delete el.dataset.guideOriginalZIndex
        delete el.dataset.guideOriginalPosition
        delete el.dataset.guideOriginalAnimation
      }
    }
  }, [step.targetSelector])

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

  const cardW = 300

  let cardPos: React.CSSProperties
  let arrow: React.CSSProperties | null = null
  if (isMobile || !rect || notFound) {
    cardPos = { position: 'fixed', bottom: 80, left: 12, right: 12, zIndex: 10002 }
  } else {
    const placeAbove = step.tooltipAbove || (window.innerHeight - rect.bottom < 220)
    const verticalGap = 16
    const top = placeAbove ? rect.top - verticalGap : rect.bottom + verticalGap
    const transform = placeAbove ? 'translateY(-100%)' : 'none'
    let left = rect.left + rect.width / 2 - cardW / 2
    left = Math.max(12, Math.min(left, window.innerWidth - cardW - 12))
    cardPos = { position: 'fixed', top, left, transform, width: cardW, zIndex: 10002 }

    const arrowLeft = rect.left + rect.width / 2 - left - 8
    arrow = {
      position: 'absolute',
      left: Math.max(12, Math.min(arrowLeft, cardW - 24)),
      width: 16, height: 16,
      background: 'rgba(15,15,30,0.92)',
      borderLeft: '1px solid rgba(255,255,255,0.08)',
      borderTop: '1px solid rgba(255,255,255,0.08)',
      ...(placeAbove
        ? { bottom: -8, transform: 'rotate(225deg)' }
        : { top: -8, transform: 'rotate(45deg)' }),
    }
  }

  if (!ready) {
    return <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 10000, pointerEvents: 'none' }} />
  }

  return (
    <>
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 10000, pointerEvents: 'none' }} />
      <div style={{ ...cardStyle, ...cardPos, padding: 16 }}>
        {arrow && !isMobile && !notFound && <div style={arrow} />}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
          <div style={{ fontSize: 10, color: '#8080A8', fontWeight: 700, letterSpacing: '0.08em' }}>
            {stepNumber} / {total}
          </div>
          <button onClick={onClose} aria-label="Close guide" style={{ background: 'none', border: 'none', color: '#8080A8', cursor: 'pointer', fontSize: 16, padding: 0, lineHeight: 1 }}>×</button>
        </div>
        <div style={{ fontSize: 15, fontWeight: 800, color: '#FFFFFF', marginBottom: 6 }}>{step.title}</div>
        <div style={{ fontSize: 13, color: '#A0A0C8', lineHeight: 1.5, marginBottom: 14 }}>{step.body}</div>
        {notFound && (
          <div style={{ fontSize: 11, color: '#FFB800', marginBottom: 10, padding: '6px 8px', background: 'rgba(255,184,0,0.08)', border: '1px solid rgba(255,184,0,0.2)', borderRadius: 6 }}>
            Nothing to highlight for this step right now — keep going.
          </div>
        )}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <button onClick={onClose} style={linkBtn}>Close</button>
          <div style={{ display: 'flex', gap: 6 }}>
            {canGoBack && <button onClick={onBack} style={ghostBtn}>Back</button>}
            <button onClick={onNext} style={primaryBtn}>{stepNumber === total ? 'Done' : 'Next →'}</button>
          </div>
        </div>
      </div>
    </>
  )
}

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
