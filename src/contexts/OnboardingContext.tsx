import { createContext, useContext, useState, useEffect, useCallback, useRef, type ReactNode } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuthContext } from '../app/AuthContext'

export interface TourStep {
  id: string
  requiredPath?: string
  targetSelector: string
  title: string
  body: string
  dualRoleOnly?: boolean
}

const ALL_STEPS: TourStep[] = [
  {
    id: 'dashboard',
    targetSelector: '[data-tour-id="nav-dashboard"]',
    title: 'Your Daily Command Center',
    body: "Everything that needs your attention today lives here — call-outs, alerts, and your end-of-day closeout. Check this first every morning.",
  },
  {
    id: 'happening-today',
    requiredPath: '/admin/dashboard',
    targetSelector: '[data-tour-id="happening-today-feed"]',
    title: 'Things Happening Today',
    body: "When a family calls out, it appears here instantly. Tap the checkmark once you've handled it.",
  },
  {
    id: 'schedule',
    targetSelector: '[data-tour-id="nav-schedule"]',
    title: 'The Schedule',
    body: "Your location's full weekly schedule. Every teacher, every student, every open slot — all in one view.",
  },
  {
    id: 'my-sessions',
    requiredPath: '/admin/schedule',
    targetSelector: '[data-tour-id="my-sessions-toggle"]',
    title: 'Your Personal Schedule',
    body: "Since you're also a teacher, tap 'My Sessions' anytime to see only your own sessions for the week.",
    dualRoleOnly: true,
  },
  {
    id: 'students',
    targetSelector: '[data-tour-id="nav-students"]',
    title: 'Your Students',
    body: "Every active student at your location. Tap any student to see their profile, session history, fifth week balance, and teacher notes.",
  },
  {
    id: 'leads',
    targetSelector: '[data-tour-id="nav-leads"]',
    title: 'New Inquiries',
    body: "When someone fills out a form on the website, they land here. Your job is to follow up fast — speed wins enrollments.",
  },
  {
    id: 'close-out',
    requiredPath: '/admin/dashboard',
    targetSelector: '[data-tour-id="close-out-button"]',
    title: 'End Your Day Here',
    body: "After all your sessions are done and recaps are logged, close out your day. It takes 10 seconds and keeps everyone accountable.",
  },
]

type TourPhase = 'idle' | 'welcome' | 'steps' | 'complete'

interface OnboardingContextValue {
  startTour: () => void
  replayTour: () => Promise<void>
}

const OnboardingContext = createContext<OnboardingContextValue | null>(null)

export function useOnboarding() {
  const ctx = useContext(OnboardingContext)
  if (!ctx) throw new Error('useOnboarding must be used within OnboardingProvider')
  return ctx
}

export function OnboardingProvider({ children }: { children: ReactNode }) {
  const { profile, role, teacherRecord, isLoading } = useAuthContext()
  const navigate = useNavigate()
  const location = useLocation()
  const [phase, setPhase] = useState<TourPhase>('idle')
  const [stepIdx, setStepIdx] = useState(0)
  const autoStartedRef = useRef(false)

  const steps = ALL_STEPS.filter((s) => !s.dualRoleOnly || !!teacherRecord)

  // Auto-trigger on first login for studio directors
  useEffect(() => {
    if (isLoading || autoStartedRef.current) return
    if (role !== 'studio_director') return
    if (!profile) return
    if (profile.onboarding_completed_at) return
    autoStartedRef.current = true
    setPhase('welcome')
  }, [isLoading, role, profile])

  const markCompleted = useCallback(async (skipped: boolean) => {
    if (!profile) return
    try {
      await supabase
        .from('profiles')
        .update({
          onboarding_completed_at: new Date().toISOString(),
          onboarding_skipped: skipped,
        })
        .eq('id', profile.id)
    } catch (err) {
      console.error('Failed to mark onboarding completed:', err)
    }
  }, [profile])

  const startTour = useCallback(() => {
    setStepIdx(0)
    setPhase('welcome')
  }, [])

  const skipTour = useCallback(async () => {
    setPhase('idle')
    await markCompleted(true)
  }, [markCompleted])

  const beginSteps = useCallback(() => {
    setStepIdx(0)
    setPhase('steps')
  }, [])

  const advance = useCallback(() => {
    setStepIdx((idx) => {
      if (idx >= steps.length - 1) {
        setPhase('complete')
        return idx
      }
      return idx + 1
    })
  }, [steps.length])

  const back = useCallback(() => {
    setStepIdx((idx) => Math.max(0, idx - 1))
  }, [])

  const finish = useCallback(async () => {
    setPhase('idle')
    await markCompleted(false)
  }, [markCompleted])

  // Navigate to required path when entering a step
  useEffect(() => {
    if (phase !== 'steps') return
    const step = steps[stepIdx]
    if (!step) return
    if (step.requiredPath && location.pathname !== step.requiredPath) {
      navigate(step.requiredPath)
    }
  }, [phase, stepIdx, steps, location.pathname, navigate])

  const replayTour = useCallback(async () => {
    if (!profile) return
    try {
      await supabase
        .from('profiles')
        .update({ onboarding_completed_at: null, onboarding_skipped: false })
        .eq('id', profile.id)
      window.location.reload()
    } catch (err) {
      console.error('Failed to reset onboarding:', err)
    }
  }, [profile])

  return (
    <OnboardingContext.Provider value={{ startTour, replayTour }}>
      {children}
      {phase === 'welcome' && (
        <WelcomeModal onStart={beginSteps} onSkip={skipTour} />
      )}
      {phase === 'steps' && steps[stepIdx] && (
        <TourStepOverlay
          step={steps[stepIdx]}
          stepNumber={stepIdx + 1}
          totalSteps={steps.length}
          onNext={advance}
          onBack={back}
          onSkip={skipTour}
          canGoBack={stepIdx > 0}
        />
      )}
      {phase === 'complete' && <CompletionModal onConfirm={finish} />}
    </OnboardingContext.Provider>
  )
}

// ---- Welcome Modal ----
function WelcomeModal({ onStart, onSkip }: { onStart: () => void; onSkip: () => void }) {
  return (
    <div style={overlayStyle}>
      <div style={{ ...cardStyle, maxWidth: 420, padding: 28, textAlign: 'center' }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>👋</div>
        <div style={{ fontSize: 20, fontWeight: 800, color: '#FFFFFF', marginBottom: 10 }}>
          Welcome to Lessonpreneur
        </div>
        <div style={{ fontSize: 13, color: '#A0A0C8', lineHeight: 1.5, marginBottom: 24 }}>
          You're logged in as a Studio Director. Let's take 2 minutes to show you around so you can hit the ground running.
        </div>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
          <button onClick={onSkip} style={ghostBtnStyle}>Skip Tour</button>
          <button onClick={onStart} style={primaryBtnStyle}>Let's Go →</button>
        </div>
      </div>
    </div>
  )
}

// ---- Completion Modal ----
function CompletionModal({ onConfirm }: { onConfirm: () => void }) {
  return (
    <div style={overlayStyle}>
      <div style={{ ...cardStyle, maxWidth: 420, padding: 28, textAlign: 'center' }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>🌽</div>
        <div style={{ fontSize: 20, fontWeight: 800, color: '#FFFFFF', marginBottom: 10 }}>
          You're all set!
        </div>
        <div style={{ fontSize: 13, color: '#A0A0C8', lineHeight: 1.5, marginBottom: 8 }}>
          You now know the essentials. The platform will feel natural fast — just use it like a real day.
        </div>
        <div style={{ fontSize: 13, color: '#A0A0C8', lineHeight: 1.5, marginBottom: 24 }}>
          Questions? Your owner has your back.
        </div>
        <button onClick={onConfirm} style={{ ...primaryBtnStyle, width: '100%' }}>
          Start Using Lessonpreneur
        </button>
      </div>
    </div>
  )
}

// ---- Spotlight + Tooltip ----
function TourStepOverlay({
  step,
  stepNumber,
  totalSteps,
  onNext,
  onBack,
  onSkip,
  canGoBack,
}: {
  step: TourStep
  stepNumber: number
  totalSteps: number
  onNext: () => void
  onBack: () => void
  onSkip: () => void
  canGoBack: boolean
}) {
  const [rect, setRect] = useState<DOMRect | null>(null)
  const [isMobile, setIsMobile] = useState(typeof window !== 'undefined' && window.innerWidth < 768)

  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 768)
    window.addEventListener('resize', handler)
    return () => window.removeEventListener('resize', handler)
  }, [])

  useEffect(() => {
    setRect(null)
    let cancelled = false
    let tries = 0
    const tick = () => {
      if (cancelled) return
      const el = document.querySelector(step.targetSelector) as HTMLElement | null
      if (el) {
        el.style.boxShadow = '0 0 0 3px rgba(255,184,0,0.6)'
        el.style.borderRadius = el.style.borderRadius || '8px'
        el.style.position = el.style.position || 'relative'
        el.style.zIndex = '10001'
        const r = el.getBoundingClientRect()
        setRect(r)
        // Scroll target into view if needed
        if (r.top < 80 || r.bottom > window.innerHeight - 80) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' })
        }
        return
      }
      if (tries++ < 30) {
        setTimeout(tick, 100)
      }
    }
    tick()
    return () => {
      cancelled = true
      const el = document.querySelector(step.targetSelector) as HTMLElement | null
      if (el) {
        el.style.boxShadow = ''
        el.style.zIndex = ''
      }
    }
  }, [step.targetSelector])

  // Recompute rect on scroll/resize
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

  const tooltipStyle: React.CSSProperties = isMobile
    ? {
        position: 'fixed', bottom: 16, left: 16, right: 16, zIndex: 10002,
        padding: 18,
        ...cardStyle,
      }
    : rect
      ? (() => {
          const spaceBelow = window.innerHeight - rect.bottom
          const placeBelow = spaceBelow > 220
          const top = placeBelow ? rect.bottom + 12 : rect.top - 12
          const transform = placeBelow ? 'none' : 'translateY(-100%)'
          let left = rect.left + rect.width / 2 - 160
          left = Math.max(12, Math.min(left, window.innerWidth - 332))
          return {
            position: 'fixed' as const, top, left, transform, width: 320, zIndex: 10002,
            padding: 18,
            ...cardStyle,
          }
        })()
      : { position: 'fixed' as const, top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: 320, zIndex: 10002, padding: 18, ...cardStyle }

  return (
    <>
      {/* Dark overlay — pointer-events: none so the target stays interactive */}
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 10000, pointerEvents: 'none' }} />
      <div style={tooltipStyle}>
        <div style={{ fontSize: 10, color: '#8080A8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>
          Step {stepNumber} of {totalSteps}
        </div>
        <div style={{ fontSize: 16, fontWeight: 800, color: '#FFFFFF', marginBottom: 8 }}>{step.title}</div>
        <div style={{ fontSize: 13, color: '#A0A0C8', lineHeight: 1.5, marginBottom: 18 }}>{step.body}</div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <button onClick={onSkip} style={{ ...linkBtnStyle, padding: 0 }}>Skip Tour</button>
          <div style={{ display: 'flex', gap: 8 }}>
            {canGoBack && <button onClick={onBack} style={ghostBtnStyle}>Back</button>}
            <button onClick={onNext} style={primaryBtnStyle}>Next →</button>
          </div>
        </div>
      </div>
    </>
  )
}

// ---- Styles ----
const overlayStyle: React.CSSProperties = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 10000,
  display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
}

const cardStyle: React.CSSProperties = {
  background: '#141224',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: 16,
  boxShadow: '0 16px 48px rgba(0,0,0,0.6)',
}

const primaryBtnStyle: React.CSSProperties = {
  padding: '10px 18px', borderRadius: 10, border: 'none', cursor: 'pointer',
  background: 'linear-gradient(135deg, #D4226A, #FF5500)', color: '#FFFFFF',
  fontSize: 13, fontWeight: 800, letterSpacing: '-0.01em',
  boxShadow: '0 4px 16px rgba(212,34,106,0.3)',
}

const ghostBtnStyle: React.CSSProperties = {
  padding: '10px 18px', borderRadius: 10, cursor: 'pointer',
  background: 'rgba(255,255,255,0.04)', color: '#A0A0C8',
  border: '1px solid rgba(255,255,255,0.08)',
  fontSize: 13, fontWeight: 600,
}

const linkBtnStyle: React.CSSProperties = {
  background: 'none', border: 'none', cursor: 'pointer',
  color: '#8080A8', fontSize: 12, fontWeight: 500,
}
