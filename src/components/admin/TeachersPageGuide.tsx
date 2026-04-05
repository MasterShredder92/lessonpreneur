import { useState, useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { usePermissions } from '../../hooks/usePermissions'

type Page = 'list' | 'detail'

interface GuideStep {
  page: Page
  selector: string
  title: string
  body: string
  interactive?: boolean
  interactiveHint?: string
  tooltipAbove?: boolean
}

const STEPS: GuideStep[] = [
  {
    page: 'list',
    selector: '[data-tour-id="teachers-list"]',
    title: 'The Teaching Roster',
    body: "You can see all active teachers across every location — not just yours. That's intentional. Every teacher is a potential sub for any location. Knowing who's available, what they teach, and their personality helps you make smart coverage calls when someone calls out.",
  },
  {
    page: 'list',
    selector: '[data-tour-id="teacher-card-first"]',
    title: 'Teacher at a Glance',
    body: "Each row shows the teacher's name, instruments, locations, and current student count. The student count tells you how full their schedule is. A teacher at capacity can't take new students. A teacher with open slots is someone to grow.",
    interactive: true,
    interactiveHint: 'Tap a teacher to open their profile →',
  },
  {
    page: 'detail',
    selector: '[data-tour-id="teaching-profile"]',
    title: 'Teaching Profile',
    body: "This is the public-facing side of the teacher — their personality type, lesson style, best age range, and instrument strengths. Use this when a lead asks 'what's the teacher like?' You can speak to it specifically instead of guessing. It's also how the compatibility matching works on the enrollment form.",
  },
  {
    page: 'detail',
    selector: '[data-tour-id="star-ai-profile"]',
    title: 'Star AI Profile',
    body: "This is what Star AI knows about this teacher. It powers the compatibility matching and helps Star recommend the right teacher for each new student inquiry. You can view this to understand how the AI thinks about teacher-student fit. You cannot edit it — Star builds it from real data over time.",
  },
  {
    page: 'detail',
    selector: '[data-tour-id="teacher-students-list"]',
    title: 'Their Current Students',
    body: "Every student currently assigned to this teacher appears here. Tap any student to jump to their full profile. This is critical during a teacher callout or transition — you can see exactly which students need coverage and pull up their records instantly.",
  },
  {
    page: 'detail',
    selector: '[data-tour-id="private-documents"]',
    title: 'Private Documents',
    body: "W-9s, contracts, and personal uploaded documents are not visible to studio directors. Those are between the teacher and the company. What you CAN see is everything related to their teaching — profile, schedule, students, and session history. That's all you need to run your studio effectively.",
  },
]

const LS_ACTIVE = 'lp_teachers_guide_active'
const LS_IDX = 'lp_teachers_guide_idx'

function readActive(): boolean {
  try { return typeof window !== 'undefined' && window.localStorage.getItem(LS_ACTIVE) === '1' } catch { return false }
}
function readIdx(): number {
  try { return Math.max(0, parseInt(window.localStorage.getItem(LS_IDX) ?? '0', 10) || 0) } catch { return 0 }
}
function writeState(active: boolean, idx: number) {
  try {
    if (active) {
      window.localStorage.setItem(LS_ACTIVE, '1')
      window.localStorage.setItem(LS_IDX, String(idx))
    } else {
      window.localStorage.removeItem(LS_ACTIVE)
      window.localStorage.removeItem(LS_IDX)
    }
  } catch { /* noop */ }
}

export default function TeachersPageGuide() {
  const { isStudioDirector } = usePermissions()
  const location = useLocation()
  const currentPage: Page = /^\/admin\/teachers\/[^/]+/.test(location.pathname) ? 'detail' : 'list'

  const [active, setActive] = useState(false)
  const [idx, setIdx] = useState(0)
  const [rect, setRect] = useState<DOMRect | null>(null)
  const [ready, setReady] = useState(false)
  const [showToast, setShowToast] = useState(false)
  const [isMobile, setIsMobile] = useState(typeof window !== 'undefined' && window.innerWidth < 768)

  useEffect(() => {
    const h = () => setIsMobile(window.innerWidth < 768)
    window.addEventListener('resize', h)
    return () => window.removeEventListener('resize', h)
  }, [])

  // Restore guide state on mount / route change; advance to a step matching current page
  useEffect(() => {
    if (!readActive()) { setActive(false); return }
    let resumeIdx = readIdx()
    while (resumeIdx < STEPS.length && STEPS[resumeIdx].page !== currentPage) {
      resumeIdx++
    }
    if (resumeIdx >= STEPS.length) {
      writeState(false, 0)
      setActive(false)
      return
    }
    setIdx(resumeIdx)
    setActive(true)
    writeState(true, resumeIdx)
  }, [currentPage])

  const step = active ? STEPS[idx] : null

  // Spotlight target
  useEffect(() => {
    if (!active || !step) return
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
        el.style.animation = 'teachersGuidePulse 1.5s ease-in-out infinite'
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
      if (tries++ < 20) setTimeout(tick, 100)
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
  }, [active, idx, step])

  // Keep rect in sync
  useEffect(() => {
    if (!active || !step) return
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
  }, [active, step])

  if (!isStudioDirector) return null

  // Only show the Guide button on the list page header
  const showStartButton = currentPage === 'list'

  const start = () => { setIdx(0); setActive(true); writeState(true, 0) }
  const exit = () => { setActive(false); setRect(null); setReady(false); writeState(false, 0) }
  const next = () => {
    const nextIdx = idx + 1
    if (nextIdx >= STEPS.length) {
      exit()
      setShowToast(true)
      setTimeout(() => setShowToast(false), 3000)
      return
    }
    setIdx(nextIdx)
    writeState(true, nextIdx)
  }
  const back = () => {
    const prev = Math.max(0, idx - 1)
    // Don't jump across pages with Back
    if (STEPS[prev].page !== currentPage) return
    setIdx(prev)
    writeState(true, prev)
  }

  const cardW = 260
  let cardPos: React.CSSProperties
  let arrow: React.CSSProperties | null = null
  if (isMobile || !rect) {
    cardPos = { position: 'fixed', bottom: 80, left: 12, right: 12, zIndex: 10002 }
  } else {
    const placeAbove = step?.tooltipAbove || (window.innerHeight - rect.bottom < 220)
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

  const canGoBack = idx > 0 && STEPS[idx - 1].page === currentPage

  return (
    <>
      <style>{`
        @keyframes teachersGuidePulse {
          0%, 100% { box-shadow: 0 0 0 3px rgba(255,184,0,0.5); }
          50% { box-shadow: 0 0 0 7px rgba(255,184,0,0.15); }
        }
        @keyframes teachersGuideToast {
          from { opacity: 0; transform: translate(-50%, 10px); }
          to { opacity: 1; transform: translate(-50%, 0); }
        }
      `}</style>

      {showStartButton && (
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

      {active && step && ready && (
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

            {step.interactive && step.interactiveHint && (
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: '#FFB800',
                  background: 'rgba(255,184,0,0.08)',
                  border: '1px solid rgba(255,184,0,0.2)',
                  borderRadius: 8,
                  padding: '8px 10px',
                  marginBottom: 12,
                }}
              >
                {step.interactiveHint}
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
                {canGoBack && (
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
                    Next →
                  </button>
                )}
              </div>
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
            animation: 'teachersGuideToast 220ms ease',
            whiteSpace: 'nowrap',
          }}
        >
          Teachers guide complete. Tap 📖 Guide anytime to replay.
        </div>
      )}
    </>
  )
}
