import { useState, useEffect, useRef } from 'react'
import { usePermissions } from '../../hooks/usePermissions'
import {
  getCardPosition, getArrowStyle, guideCardWidth,
  GUIDE_CARD_STYLE, GUIDE_PRIMARY_BTN, GUIDE_GHOST_BTN, GUIDE_LINK_BTN, GUIDE_PULSE_KEYFRAMES,
} from '../shared/guidePosition'

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
  const interactiveHandlerRef = useRef<(() => void) | null>(null)
  const cardRef = useRef<HTMLDivElement>(null)
  const [cardDims, setCardDims] = useState({ w: guideCardWidth(), h: 200 })

  // Measure card after render
  useEffect(() => {
    if (!ready || !cardRef.current) return
    const r = cardRef.current.getBoundingClientRect()
    setCardDims({ w: r.width, h: r.height })
  }, [ready, idx])

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

  // Interactive click handler — advance when the target gets clicked
  useEffect(() => {
    if (!active || !step || !stepVisibleHere || !step.interactive) return
    const el = document.querySelector(step.selector) as HTMLElement | null
    if (!el) return
    const onClick = () => {
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

  // Watch for handoff report completion
  useEffect(() => {
    if (!active) return
    if (idx !== STEPS.length - 1) return
    if (!stepVisibleHere) return
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

  return (
    <>
      <style>{GUIDE_PULSE_KEYFRAMES}</style>

      {mode === 'list' && (
        <button onClick={start} title="Page Guide" style={{
          padding: '4px 10px', borderRadius: 999, cursor: 'pointer',
          background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.3)',
          color: '#A0A0C8', fontSize: 12, fontWeight: 600,
          display: 'inline-flex', alignItems: 'center', gap: 4, flexShrink: 0,
          fontFamily: 'inherit', lineHeight: 1.4,
        }}>
          📖 Guide
        </button>
      )}

      {active && step && stepVisibleHere && ready && !showCompletionCard && (
        <>
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 10000, pointerEvents: 'none' }} />
          <div ref={cardRef} style={{ ...GUIDE_CARD_STYLE, ...cardPos, padding: '14px 16px' }}>
            {arrowStyle && <div style={arrowStyle} />}
            <button onClick={exit} title="Exit Guide" style={{
              position: 'absolute', top: 6, right: 6, background: 'none', border: 'none',
              cursor: 'pointer', color: '#8080A8', padding: 4, fontSize: 12, lineHeight: 1, fontFamily: 'inherit',
            }}>✕</button>
            <div style={{ fontSize: 10, color: '#8080A8', fontWeight: 700, letterSpacing: '0.08em', marginBottom: 6, paddingRight: 24, textAlign: 'right' }}>
              {idx + 1} / {STEPS.length}
            </div>
            <div style={{ fontSize: 14, fontWeight: 800, color: '#FFFFFF', marginBottom: 4 }}>{step.title}</div>
            <div style={{ fontSize: 12, color: '#A0A0C8', lineHeight: 1.55, marginBottom: 12 }}>{step.body}</div>
            {step.interactive && step.interactivePrompt && (
              <div style={{ fontSize: 11, fontWeight: 700, color: '#FFB800', background: 'rgba(255,184,0,0.08)', border: '1px solid rgba(255,184,0,0.25)', borderRadius: 8, padding: '8px 10px', marginBottom: 10, lineHeight: 1.4 }}>
                👉 {step.interactivePrompt}
              </div>
            )}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
              <button onClick={exit} style={GUIDE_LINK_BTN}>Skip</button>
              <div style={{ display: 'flex', gap: 6 }}>
                {idx > 0 && <button onClick={back} style={GUIDE_GHOST_BTN}>← Back</button>}
                {!step.interactive && (
                  <button onClick={next} style={GUIDE_PRIMARY_BTN}>
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
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 10000, pointerEvents: 'none' }} />
          <div style={{
            position: 'fixed', left: '50%', top: '50%', transform: 'translate(-50%, -50%)',
            width: 'min(320px, calc(100vw - 24px))',
            ...GUIDE_CARD_STYLE, padding: '18px 20px', zIndex: 10002,
          }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: '#FFB800', marginBottom: 8 }}>Handoff Report Generated</div>
            <div style={{ fontSize: 12.5, color: '#C0C0E0', lineHeight: 1.55, marginBottom: 14 }}>
              That's the handoff report. It captures everything a new teacher needs to know — no verbal briefing required.
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button onClick={finishCompletion} style={GUIDE_PRIMARY_BTN}>Finish Guide</button>
            </div>
          </div>
        </>
      )}

      {showToast && (
        <div style={{
          position: 'fixed', bottom: 100, left: '50%', transform: 'translateX(-50%)',
          ...GUIDE_CARD_STYLE, padding: '10px 16px', fontSize: 12, color: '#E0E0F4', fontWeight: 600,
          zIndex: 10003, whiteSpace: 'nowrap',
        }}>
          Students guide complete. Tap 📖 Guide anytime to replay.
        </div>
      )}
    </>
  )
}
