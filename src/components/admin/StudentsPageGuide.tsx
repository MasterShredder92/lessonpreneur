import { useState, useEffect, useRef } from 'react'
import { usePermissions } from '../../hooks/usePermissions'

type GuidePage = 'list' | 'detail'

interface GuideStep {
  selector: string
  title: string
  body: string
  page: GuidePage
  tooltipAbove?: boolean
  interactive?: boolean
  interactivePrompt?: string
}

const STEPS: GuideStep[] = [
  {
    page: 'list',
    selector: '[data-tour-id="students-list"]',
    title: 'Students on Your Schedule',
    body: "This is every active student enrolled at your studio. These are not 'your' students — they belong to the school. You're responsible for their experience at your location. Tap any student to open their full profile.",
  },
  {
    page: 'list',
    selector: '[data-tour-id="students-search"]',
    title: 'Finding Students Fast',
    body: "Use the search bar to find any student by name. Filter by instrument or teacher to narrow the list. If a parent calls asking about their child, you can pull up the record in under 5 seconds.",
  },
  {
    page: 'list',
    selector: '[data-tour-id="first-student-row"]',
    title: 'Student at a Glance',
    body: "Each row shows the student's name, instrument, teacher, and their unique student ID. The ID (like GRE-00042) is how we reference students in any communication — it prevents confusion when two students have similar names.",
    interactive: true,
    interactivePrompt: 'Tap this student to open their profile →',
  },
  {
    page: 'detail',
    selector: '[data-tour-id="student-header"]',
    title: 'Student Profile',
    body: "This is the student's full record. The badge shows their status — Active, Paused, or Inactive. Their unique ID appears here for reference. Everything about this student lives on this page.",
  },
  {
    page: 'detail',
    selector: '[data-tour-id="student-edit-btn"]',
    title: 'Editing Student Info',
    body: "Tap Edit to update the student's details — instrument, lesson day, teacher assignment, rate, or status. As a studio director, you have full edit access for students at your location. Always save before navigating away.",
  },
  {
    page: 'detail',
    selector: '[data-tour-id="student-family-card"]',
    title: 'The Family Record',
    body: "This links the student to their family account. Tap the family name to jump directly to the full family profile — billing info, contact details, and all students in that household. Every student belongs to a family record, which is where billing lives.",
  },
  {
    page: 'detail',
    selector: '[data-tour-id="student-lesson-stats"]',
    title: 'Lesson Stats',
    body: "This shows the student's enrollment length, sessions per month, their rate, and their lesson day. The rate and session count drive the monthly billing calculation. If something looks wrong here, this is where you'd flag it.",
  },
  {
    page: 'detail',
    selector: '[data-tour-id="student-session-tracker"]',
    title: 'Fifth Week Tracker',
    body: "This school's policy gives students a makeup session on their fifth week of the month instead of paying for it. This card tracks how many fifth weeks are banked, how many have been used as makeups after a call-out, and the running balance. If it goes negative, follow up.",
  },
  {
    page: 'detail',
    selector: '[data-tour-id="student-director-notes"]',
    title: 'Director Notes',
    body: "This is your private scratchpad for this student. Parents and teachers cannot see this. Use it to log anything important — 'family prefers afternoon slots', 'parent requested teacher change', 'payment history issue'. It creates a record that survives staff changes.",
  },
  {
    page: 'detail',
    selector: '[data-tour-id="student-teacher-notes"]',
    title: 'Teacher Session Notes',
    body: "Teachers log what happened in each session here — what they worked on, what the student should practice, milestones reached. This is the student's learning history. If there's ever a teacher change or sub situation, these notes are the handoff.",
  },
  {
    page: 'detail',
    selector: '[data-tour-id="student-files"]',
    title: 'Student Files',
    body: "Documents uploaded here are shared between the teacher and the studio. Lesson plans, practice recordings, progress sheets — anything relevant to the student's learning. You can upload files here and the teacher sees them. W-9s and contracts are stored at the family level and are not visible here.",
  },
  {
    page: 'detail',
    selector: '[data-tour-id="student-handoff-btn"]',
    title: 'Teacher Handoff Report',
    body: "If a teacher leaves or a sub is needed, this generates a complete snapshot of the student — their history, progress, teacher notes, and everything a new teacher needs to get up to speed instantly. Tap the button and it generates in real time.",
    interactive: true,
    interactivePrompt: 'Tap to generate a real handoff report for this student right now.',
    tooltipAbove: true,
  },
]

const STORAGE_KEY = 'studentsGuide_v1'

interface StoredState { active: boolean; idx: number }

function readState(): StoredState {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return { active: false, idx: 0 }
    return JSON.parse(raw)
  } catch {
    return { active: false, idx: 0 }
  }
}

function writeState(s: StoredState) {
  try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(s)) } catch {}
}

export default function StudentsPageGuide({ mode }: { mode: GuidePage }) {
  const { isStudioDirector } = usePermissions()
  const initial = readState()
  const [active, setActive] = useState(initial.active)
  const [idx, setIdx] = useState(initial.idx)
  const [rect, setRect] = useState<DOMRect | null>(null)
  const [ready, setReady] = useState(false)
  const [showToast, setShowToast] = useState(false)
  const [showCompletionCard, setShowCompletionCard] = useState(false)
  const [isMobile, setIsMobile] = useState(typeof window !== 'undefined' && window.innerWidth < 768)
  const interactiveHandlerRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    const h = () => setIsMobile(window.innerWidth < 768)
    window.addEventListener('resize', h)
    return () => window.removeEventListener('resize', h)
  }, [])

  // Persist to sessionStorage
  useEffect(() => { writeState({ active, idx }) }, [active, idx])

  const step = active ? STEPS[idx] : null
  const stepVisibleHere = step && step.page === mode

  // Spotlight target element
  useEffect(() => {
    if (!active || !step || !stepVisibleHere) {
      setRect(null)
      setReady(false)
      return
    }
    setReady(false)
    setRect(null)
    let cancelled = false
    let tries = 0
    const tick = () => {
      if (cancelled) return
      const el = document.querySelector(step.selector) as HTMLElement | null
      if (el) {
        el.dataset.guideOrigZIndex = el.style.zIndex
        el.dataset.guideOrigPosition = el.style.position
        el.dataset.guideOrigAnimation = el.style.animation
        el.style.animation = 'studentsGuidePulse 1.5s ease-in-out infinite'
        if (!el.style.position || el.style.position === 'static') el.style.position = 'relative'
        el.style.zIndex = '10001'
        el.scrollIntoView({ behavior: 'smooth', block: 'center' })
        setTimeout(() => {
          if (cancelled) return
          setRect(el.getBoundingClientRect())
          setReady(true)
        }, 320)
        return
      }
      if (tries++ < 30) setTimeout(tick, 120)
      else setReady(true)
    }
    const t = setTimeout(tick, 80)
    return () => {
      cancelled = true
      clearTimeout(t)
      const el = document.querySelector(step.selector) as HTMLElement | null
      if (el) {
        el.style.animation = el.dataset.guideOrigAnimation ?? ''
        el.style.zIndex = el.dataset.guideOrigZIndex ?? ''
        el.style.position = el.dataset.guideOrigPosition ?? ''
        delete el.dataset.guideOrigAnimation
        delete el.dataset.guideOrigZIndex
        delete el.dataset.guideOrigPosition
      }
    }
  }, [active, idx, step, stepVisibleHere])

  // Keep rect in sync on scroll/resize
  useEffect(() => {
    if (!active || !step || !stepVisibleHere) return
    const update = () => {
      const el = document.querySelector(step.selector) as HTMLElement | null
      if (el) setRect(el.getBoundingClientRect())
    }
    window.addEventListener('scroll', update, true)
    window.addEventListener('resize', update)
    return () => {
      window.removeEventListener('scroll', update, true)
      window.removeEventListener('resize', update)
    }
  }, [active, step, stepVisibleHere])

  // For interactive "tap the student" step — advance when the target gets clicked
  useEffect(() => {
    if (!active || !step || !stepVisibleHere || !step.interactive) return
    const el = document.querySelector(step.selector) as HTMLElement | null
    if (!el) return
    const onClick = () => {
      // Advance to next step before navigation occurs
      const nextIdx = idx + 1
      if (nextIdx >= STEPS.length) {
        setActive(false)
        writeState({ active: false, idx: 0 })
      } else {
        setIdx(nextIdx)
        writeState({ active: true, idx: nextIdx })
      }
    }
    el.addEventListener('click', onClick, { capture: true })
    interactiveHandlerRef.current = () => el.removeEventListener('click', onClick, { capture: true } as any)
    return () => {
      if (interactiveHandlerRef.current) interactiveHandlerRef.current()
      interactiveHandlerRef.current = null
    }
  }, [active, step, stepVisibleHere, idx])

  // Watch for handoff report completion — show completion card after last interactive step
  useEffect(() => {
    if (!active) return
    if (idx !== STEPS.length - 1) return
    if (!stepVisibleHere) return
    // Look for the handoff report textarea to appear
    const check = () => {
      const reportBox = document.querySelector('[data-tour-id="student-handoff-report"]')
      if (reportBox) {
        setShowCompletionCard(true)
        return true
      }
      return false
    }
    if (check()) return
    const i = window.setInterval(() => { if (check()) window.clearInterval(i) }, 600)
    return () => window.clearInterval(i)
  }, [active, idx, stepVisibleHere])

  if (!isStudioDirector) return null

  const start = () => {
    setIdx(0)
    setActive(true)
    setShowCompletionCard(false)
    writeState({ active: true, idx: 0 })
  }
  const exit = () => {
    setActive(false)
    setRect(null)
    setReady(false)
    setShowCompletionCard(false)
    writeState({ active: false, idx: 0 })
  }
  const next = () => {
    if (idx >= STEPS.length - 1) {
      exit()
      setShowToast(true)
      setTimeout(() => setShowToast(false), 3500)
    } else {
      const n = idx + 1
      setIdx(n)
      writeState({ active: true, idx: n })
    }
  }
  const back = () => {
    const n = Math.max(0, idx - 1)
    setIdx(n)
    writeState({ active: true, idx: n })
  }
  const finishCompletion = () => {
    setShowCompletionCard(false)
    exit()
    setShowToast(true)
    setTimeout(() => setShowToast(false), 3500)
  }

  const cardW = 260
  let cardPos: React.CSSProperties
  let arrow: React.CSSProperties | null = null
  if (isMobile || !rect) {
    cardPos = { position: 'fixed', bottom: 80, left: 12, right: 12, zIndex: 10002 }
  } else {
    const placeAbove = step?.tooltipAbove || (window.innerHeight - rect.bottom < 240)
    const gap = 16
    const top = placeAbove ? rect.top - gap : rect.bottom + gap
    const transform = placeAbove ? 'translateY(-100%)' : 'none'
    let left = rect.left + rect.width / 2 - cardW / 2
    left = Math.max(12, Math.min(left, window.innerWidth - cardW - 12))
    cardPos = { position: 'fixed', top, left, transform, width: cardW, zIndex: 10002 }
    const arrowLeft = rect.left + rect.width / 2 - left - 8
    arrow = {
      position: 'absolute',
      left: Math.max(12, Math.min(arrowLeft, cardW - 24)),
      width: 14, height: 14,
      background: 'rgba(15,15,30,0.95)',
      borderLeft: '1px solid rgba(255,255,255,0.12)',
      borderTop: '1px solid rgba(255,255,255,0.12)',
      ...(placeAbove
        ? { bottom: -7, transform: 'rotate(225deg)' }
        : { top: -7, transform: 'rotate(45deg)' }),
    }
  }

  return (
    <>
      <style>{`
        @keyframes studentsGuidePulse {
          0%, 100% { box-shadow: 0 0 0 3px rgba(255,184,0,0.5); }
          50% { box-shadow: 0 0 0 7px rgba(255,184,0,0.15); }
        }
        @keyframes studentsGuideToast {
          from { opacity: 0; transform: translate(-50%, 10px); }
          to { opacity: 1; transform: translate(-50%, 0); }
        }
      `}</style>

      {mode === 'list' && (
        <button
          onClick={start}
          title="Page Guide"
          style={{
            padding: '4px 10px',
            borderRadius: 999,
            cursor: 'pointer',
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.3)',
            color: '#A0A0C8',
            fontSize: 12,
            fontWeight: 600,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            flexShrink: 0,
            fontFamily: 'inherit',
            lineHeight: 1.4,
          }}
        >
          📖 Guide
        </button>
      )}

      {active && step && stepVisibleHere && ready && !showCompletionCard && (
        <>
          <div
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(0,0,0,0.5)',
              zIndex: 10000,
              pointerEvents: 'none',
            }}
          />
          <div
            style={{
              ...cardPos,
              maxWidth: cardW,
              background: 'rgba(15,15,30,0.95)',
              border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: 12,
              padding: '14px 16px',
              boxShadow: '0 16px 48px rgba(0,0,0,0.6)',
              backdropFilter: 'blur(12px)',
              WebkitBackdropFilter: 'blur(12px)',
            }}
          >
            {arrow && !isMobile && <div style={arrow} />}

            <button
              onClick={exit}
              title="Exit Guide"
              style={{
                position: 'absolute',
                top: 6,
                right: 6,
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: '#8080A8',
                padding: 4,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 12,
                lineHeight: 1,
                fontFamily: 'inherit',
              }}
            >
              ✕
            </button>

            <div
              style={{
                fontSize: 10,
                color: '#8080A8',
                fontWeight: 700,
                letterSpacing: '0.08em',
                marginBottom: 6,
                paddingRight: 24,
                textAlign: 'right',
              }}
            >
              {idx + 1} / {STEPS.length}
            </div>

            <div style={{ fontSize: 14, fontWeight: 800, color: '#FFFFFF', marginBottom: 6 }}>
              {step.title}
            </div>
            <div style={{ fontSize: 12, color: '#A0A0C8', lineHeight: 1.55, marginBottom: 12 }}>
              {step.body}
            </div>

            {step.interactive && step.interactivePrompt && (
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: '#FFB800',
                  background: 'rgba(255,184,0,0.08)',
                  border: '1px solid rgba(255,184,0,0.25)',
                  borderRadius: 8,
                  padding: '8px 10px',
                  marginBottom: 10,
                  lineHeight: 1.4,
                }}
              >
                👉 {step.interactivePrompt}
              </div>
            )}

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
              <button
                onClick={exit}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: '#8080A8',
                  fontSize: 11,
                  fontWeight: 600,
                  padding: 0,
                  fontFamily: 'inherit',
                }}
              >
                ✕ Exit Guide
              </button>
              <div style={{ display: 'flex', gap: 6 }}>
                {idx > 0 && (
                  <button
                    onClick={back}
                    style={{
                      padding: '6px 12px',
                      borderRadius: 8,
                      cursor: 'pointer',
                      background: 'transparent',
                      color: '#A0A0C8',
                      border: '1px solid rgba(255,255,255,0.12)',
                      fontSize: 12,
                      fontWeight: 600,
                      fontFamily: 'inherit',
                    }}
                  >
                    ← Back
                  </button>
                )}
                {!step.interactive && (
                  <button
                    onClick={next}
                    style={{
                      padding: '6px 12px',
                      borderRadius: 8,
                      cursor: 'pointer',
                      background: '#D4226A',
                      color: '#FFFFFF',
                      border: 'none',
                      fontSize: 12,
                      fontWeight: 800,
                      fontFamily: 'inherit',
                    }}
                  >
                    {idx >= STEPS.length - 1 ? 'Finish' : 'Next →'}
                  </button>
                )}
              </div>
            </div>
          </div>
        </>
      )}

      {showCompletionCard && (
        <>
          <div
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(0,0,0,0.5)',
              zIndex: 10000,
              pointerEvents: 'none',
            }}
          />
          <div
            style={{
              position: 'fixed',
              left: '50%',
              top: '50%',
              transform: 'translate(-50%, -50%)',
              width: 'min(320px, calc(100vw - 24px))',
              background: 'rgba(15,15,30,0.96)',
              border: '1px solid rgba(255,184,0,0.3)',
              borderRadius: 14,
              padding: '18px 20px',
              boxShadow: '0 20px 60px rgba(0,0,0,0.7)',
              zIndex: 10002,
              backdropFilter: 'blur(14px)',
              WebkitBackdropFilter: 'blur(14px)',
            }}
          >
            <div style={{ fontSize: 15, fontWeight: 800, color: '#FFB800', marginBottom: 8 }}>
              Handoff Report Generated ✨
            </div>
            <div style={{ fontSize: 12.5, color: '#C0C0E0', lineHeight: 1.55, marginBottom: 14 }}>
              That's the handoff report. It captures everything a new teacher needs to know — no verbal briefing required.
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button
                onClick={finishCompletion}
                style={{
                  padding: '8px 16px',
                  borderRadius: 8,
                  cursor: 'pointer',
                  background: '#D4226A',
                  color: '#FFFFFF',
                  border: 'none',
                  fontSize: 12,
                  fontWeight: 800,
                  fontFamily: 'inherit',
                }}
              >
                Finish Guide
              </button>
            </div>
          </div>
        </>
      )}

      {showToast && (
        <div
          style={{
            position: 'fixed',
            bottom: 100,
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'rgba(15,15,30,0.95)',
            border: '1px solid rgba(255,184,0,0.3)',
            borderRadius: 10,
            padding: '10px 16px',
            fontSize: 12,
            color: '#E0E0F4',
            fontWeight: 600,
            zIndex: 10003,
            boxShadow: '0 10px 30px rgba(0,0,0,0.5)',
            animation: 'studentsGuideToast 220ms ease',
            whiteSpace: 'nowrap',
          }}
        >
          Students guide complete. Tap 📖 Guide anytime to replay.
        </div>
      )}
    </>
  )
}
