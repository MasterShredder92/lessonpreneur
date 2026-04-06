import { createContext, useContext, useState, useEffect, useCallback, useRef, type ReactNode } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuthContext } from '../app/AuthContext'

export interface TourStep {
  id: string
  navigateTo?: string
  targetSelector: string
  title: string
  body: string
  dualRoleOnly?: boolean
  tooltipAbove?: boolean
}

const STEPS: TourStep[] = [
  {
    id: 'dashboard',
    navigateTo: '/admin',
    targetSelector: '[data-tour-id="dashboard-nav"]',
    title: 'Your Command Center',
    body: "Everything that needs your attention lives here \u2014 call-outs, alerts, and your end-of-day closeout. Check this before the studio opens.",
  },
  {
    id: 'happening-today',
    navigateTo: '/admin',
    targetSelector: '[data-tour-id="happening-today"]',
    title: 'Things Happening Today',
    body: "When a family calls out, it appears here instantly. Tap the checkmark once you've handled it.",
  },
  {
    id: 'schedule',
    navigateTo: '/admin/schedule',
    targetSelector: '[data-tour-id="schedule-nav"]',
    title: 'The Schedule',
    body: "Your location's full weekly schedule \u2014 every teacher, every student, every open slot.",
  },
  {
    id: 'my-sessions',
    navigateTo: '/admin/schedule',
    targetSelector: '[data-tour-id="my-sessions-toggle"]',
    title: 'Your Personal Schedule',
    body: "Tap 'My Sessions' to filter down to only the sessions you're personally teaching this week.",
    dualRoleOnly: true,
  },
  {
    id: 'students',
    navigateTo: '/admin/students',
    targetSelector: '[data-tour-id="students-nav"]',
    title: 'Students on Your Schedule',
    body: "Every active student at your location. Tap any student to see their profile, session history, and fifth week balance.",
  },
  {
    id: 'leads',
    navigateTo: '/admin/leads',
    targetSelector: '[data-tour-id="leads-nav"]',
    title: 'New Inquiries',
    body: "When someone fills out a form on the website, they land here. Follow up fast \u2014 speed wins enrollments.",
  },
  {
    id: 'report-issue',
    targetSelector: '[data-tour-id="report-issue-btn"]',
    title: 'Found Something Off?',
    body: "Tap here anytime to flag a bug or something that doesn't look right. It goes straight to the owner to get fixed fast.",
  },
  {
    id: 'closeout',
    navigateTo: '/admin',
    targetSelector: '[data-tour-id="closeout-btn"]',
    title: 'End Your Day Here',
    body: "After sessions wrap up and recaps are logged, close out your day. Takes 10 seconds.",
    tooltipAbove: true,
  },
]

type Phase = 'idle' | 'welcome' | 'steps' | 'complete' | 'error'

interface OnboardingValue {
  startTour: () => void
  replayTour: () => Promise<void>
}

const OnboardingContext = createContext<OnboardingValue | null>(null)

export function useOnboarding() {
  const ctx = useContext(OnboardingContext)
  if (!ctx) throw new Error('useOnboarding must be used within OnboardingProvider')
  return ctx
}

// Module-level guard — survives React unmount/remount within the same page session
let _autoStartFired = false

export function OnboardingProvider({ children }: { children: ReactNode }) {
  const { profile, role, teacherRecord, isLoading, signOut, refreshProfile } = useAuthContext()
  const navigate = useNavigate()
  const location = useLocation()
  const [phase, setPhase] = useState<Phase>('idle')
  const [stepIdx, setStepIdx] = useState(0)
  const [saving, setSaving] = useState(false)

  const steps = STEPS.filter((s) => !s.dualRoleOnly || !!teacherRecord)

  // Auto-start: only fires once per page session, only when profile data confirms onboarding not done
  useEffect(() => {
    if (_autoStartFired || isLoading) return
    if (role !== 'studio_director' || !profile) return
    if (profile.onboarding_completed_at) return
    _autoStartFired = true
    setPhase('welcome')
  }, [isLoading, role, profile])

  // Write to DB, await confirmation, then refresh cached profile
  const markCompleted = useCallback(async (skipped: boolean): Promise<boolean> => {
    if (!profile) return false
    setSaving(true)
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ onboarding_completed_at: new Date().toISOString(), onboarding_skipped: skipped })
        .eq('id', profile.id)

      if (error) {
        console.error('[Onboarding] DB write failed:', error)
        setSaving(false)
        return false
      }

      // Refresh the cached profile so parent condition sees the update
      await refreshProfile()
      setSaving(false)
      return true
    } catch (err) {
      console.error('[Onboarding] markCompleted failed:', err)
      setSaving(false)
      return false
    }
  }, [profile, refreshProfile])

  const startTour = useCallback(() => { setStepIdx(0); setPhase('welcome') }, [])

  const skip = useCallback(async () => {
    const success = await markCompleted(true)
    if (success) {
      setPhase('idle')
    } else {
      setPhase('error')
    }
  }, [markCompleted])

  const begin = useCallback(() => { setStepIdx(0); setPhase('steps') }, [])

  const next = useCallback(() => {
    setStepIdx((i) => {
      if (i >= steps.length - 1) { setPhase('complete'); return i }
      return i + 1
    })
  }, [steps.length])

  const back = useCallback(() => setStepIdx((i) => Math.max(0, i - 1)), [])

  const finish = useCallback(async () => {
    const success = await markCompleted(false)
    if (success) {
      setPhase('idle')
    } else {
      setPhase('error')
    }
  }, [markCompleted])

  // Navigate to step target page when in steps phase
  useEffect(() => {
    if (phase !== 'steps') return
    const step = steps[stepIdx]
    if (!step) return
    if (step.navigateTo && location.pathname !== step.navigateTo) navigate(step.navigateTo)
  }, [phase, stepIdx, steps, location.pathname, navigate])

  const replayTour = useCallback(async () => {
    if (!profile) return
    try {
      await supabase
        .from('profiles')
        .update({ onboarding_completed_at: null, onboarding_skipped: false })
        .eq('id', profile.id)
      // Reset module guard so auto-start can fire after re-login
      _autoStartFired = false
      await signOut()
    } catch (err) { console.error(err) }
  }, [profile, signOut])

  return (
    <OnboardingContext.Provider value={{ startTour, replayTour }}>
      <style>{`
        @keyframes tourPulse {
          0%, 100% { box-shadow: 0 0 0 3px rgba(255,184,0,0.6); }
          50% { box-shadow: 0 0 0 7px rgba(255,184,0,0.15); }
        }
      `}</style>
      {children}
      {phase === 'welcome' && <WelcomeModal onStart={begin} onSkip={skip} saving={saving} />}
      {phase === 'steps' && steps[stepIdx] && (
        <StepOverlay
          key={steps[stepIdx].id}
          step={steps[stepIdx]}
          stepNumber={stepIdx + 1}
          total={steps.length}
          onNext={next}
          onBack={back}
          onSkip={skip}
          canGoBack={stepIdx > 0}
          requiresNavigation={!!steps[stepIdx].navigateTo && location.pathname !== steps[stepIdx].navigateTo}
          saving={saving}
        />
      )}
      {phase === 'complete' && <CompletionModal onConfirm={finish} saving={saving} />}
      {phase === 'error' && <ErrorModal onDismiss={() => setPhase('idle')} />}
    </OnboardingContext.Provider>
  )
}

// ───────── Welcome Modal ─────────
function WelcomeModal({ onStart, onSkip, saving }: { onStart: () => void; onSkip: () => void; saving: boolean }) {
  return (
    <div style={overlayStyle}>
      <div style={{ ...cardStyle, maxWidth: 380, padding: 24, textAlign: 'center' }}>
        <img src="/lp-logo.png" alt="Lessonpreneur" style={{ width: 56, height: 56, marginBottom: 12, borderRadius: 12 }} />
        <div style={{ fontSize: 19, fontWeight: 800, color: '#FFFFFF', marginBottom: 10 }}>Welcome to Lessonpreneur</div>
        <div style={{ fontSize: 13, color: '#A0A0C8', lineHeight: 1.5, marginBottom: 22 }}>
          You're logged in as a Studio Director. Let's take 2 minutes to show you around so you can hit the ground running.
        </div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
          <button onClick={onSkip} disabled={saving} style={{ ...ghostBtn, opacity: saving ? 0.5 : 1 }}>Skip Tour</button>
          <button onClick={onStart} style={primaryBtn}>Let's Go &rarr;</button>
        </div>
      </div>
    </div>
  )
}

// ───────── Completion Modal ─────────
function CompletionModal({ onConfirm, saving }: { onConfirm: () => void; saving: boolean }) {
  return (
    <div style={overlayStyle}>
      <div style={{ ...cardStyle, maxWidth: 380, padding: 24, textAlign: 'center' }}>
        <img src="/lp-logo.png" alt="Lessonpreneur" style={{ width: 56, height: 56, marginBottom: 12, borderRadius: 12 }} />
        <div style={{ fontSize: 19, fontWeight: 800, color: '#FFFFFF', marginBottom: 10 }}>You're all set!</div>
        <div style={{ fontSize: 13, color: '#A0A0C8', lineHeight: 1.5, marginBottom: 8 }}>
          You now know the essentials. The platform will feel natural fast &mdash; just use it like a real day.
        </div>
        <div style={{ fontSize: 13, color: '#A0A0C8', lineHeight: 1.5, marginBottom: 22 }}>
          Questions? Your owner has your back.
        </div>
        <button onClick={onConfirm} disabled={saving} style={{ ...primaryBtn, width: '100%', opacity: saving ? 0.7 : 1 }}>
          {saving ? 'Saving...' : 'Start Using Lessonpreneur'}
        </button>
      </div>
    </div>
  )
}

// ───────── Error Modal ─────────
function ErrorModal({ onDismiss }: { onDismiss: () => void }) {
  return (
    <div style={overlayStyle}>
      <div style={{ ...cardStyle, maxWidth: 380, padding: 24, textAlign: 'center' }}>
        <div style={{ fontSize: 19, fontWeight: 800, color: '#FFFFFF', marginBottom: 10 }}>Something went wrong</div>
        <div style={{ fontSize: 13, color: '#A0A0C8', lineHeight: 1.5, marginBottom: 22 }}>
          We couldn't save your onboarding progress. You can dismiss this and try again later from Settings.
        </div>
        <button onClick={onDismiss} style={{ ...primaryBtn, width: '100%' }}>Dismiss</button>
      </div>
    </div>
  )
}

// ───────── Step Overlay ─────────
function StepOverlay({
  step, stepNumber, total, onNext, onBack, onSkip, canGoBack, requiresNavigation, saving,
}: {
  step: TourStep
  stepNumber: number
  total: number
  onNext: () => void
  onBack: () => void
  onSkip: () => void
  canGoBack: boolean
  requiresNavigation: boolean
  saving: boolean
}) {
  const [rect, setRect] = useState<DOMRect | null>(null)
  const [ready, setReady] = useState(false)
  const [isMobile, setIsMobile] = useState(typeof window !== 'undefined' && window.innerWidth < 768)

  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 768)
    window.addEventListener('resize', handler)
    return () => window.removeEventListener('resize', handler)
  }, [])

  // Wait after navigation, then find + spotlight target
  useEffect(() => {
    setReady(false)
    setRect(null)
    let cancelled = false
    const delay = requiresNavigation ? 400 : 100
    const handle = setTimeout(() => {
      if (cancelled) return
      let tries = 0
      const tick = () => {
        if (cancelled) return
        const el = document.querySelector(step.targetSelector) as HTMLElement | null
        if (el) {
          el.dataset.tourOriginalBoxShadow = el.style.boxShadow
          el.dataset.tourOriginalZIndex = el.style.zIndex
          el.dataset.tourOriginalPosition = el.style.position
          el.dataset.tourOriginalAnimation = el.style.animation
          el.style.animation = 'tourPulse 1.5s ease-in-out infinite'
          if (!el.style.position || el.style.position === 'static') el.style.position = 'relative'
          el.style.zIndex = '10001'
          el.scrollIntoView({ behavior: 'smooth', block: 'center' })
          setTimeout(() => {
            if (cancelled) return
            const r = el.getBoundingClientRect()
            setRect(r)
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
      const el = document.querySelector(step.targetSelector) as HTMLElement | null
      if (el) {
        el.style.animation = el.dataset.tourOriginalAnimation ?? ''
        el.style.boxShadow = el.dataset.tourOriginalBoxShadow ?? ''
        el.style.zIndex = el.dataset.tourOriginalZIndex ?? ''
        el.style.position = el.dataset.tourOriginalPosition ?? ''
        delete el.dataset.tourOriginalBoxShadow
        delete el.dataset.tourOriginalZIndex
        delete el.dataset.tourOriginalPosition
        delete el.dataset.tourOriginalAnimation
      }
    }
  }, [step.targetSelector, requiresNavigation])

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

  const cardW = 280

  let cardPos: React.CSSProperties
  let arrow: React.CSSProperties | null = null
  if (isMobile || !rect) {
    cardPos = { position: 'fixed', bottom: 80, left: 12, right: 12, zIndex: 10002 }
  } else {
    const placeAbove = step.tooltipAbove || (window.innerHeight - rect.bottom < 200)
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

  if (!ready) return <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 10000, pointerEvents: 'none' }} />

  return (
    <>
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 10000, pointerEvents: 'none' }} />
      <div style={{ ...cardStyle, ...cardPos, padding: 16 }}>
        {arrow && !isMobile && <div style={arrow} />}
        <div style={{ fontSize: 10, color: '#8080A8', fontWeight: 700, letterSpacing: '0.08em', marginBottom: 6 }}>
          {stepNumber} / {total}
        </div>
        <div style={{ fontSize: 15, fontWeight: 800, color: '#FFFFFF', marginBottom: 6 }}>{step.title}</div>
        <div style={{ fontSize: 13, color: '#A0A0C8', lineHeight: 1.5, marginBottom: 14 }}>{step.body}</div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <button onClick={onSkip} disabled={saving} style={{ ...linkBtn, opacity: saving ? 0.5 : 1 }}>Skip Tour</button>
          <div style={{ display: 'flex', gap: 6 }}>
            {canGoBack && <button onClick={onBack} style={ghostBtn}>Back</button>}
            <button onClick={onNext} style={primaryBtn}>Next &rarr;</button>
          </div>
        </div>
      </div>
    </>
  )
}

// ───────── Styles ─────────
const overlayStyle: React.CSSProperties = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 10000,
  display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
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
