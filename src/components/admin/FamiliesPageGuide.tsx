import { useState, useEffect } from 'react'
import { usePermissions } from '../../hooks/usePermissions'

interface GuideStep {
  selector: string
  title: string
  body: string
  tooltipAbove?: boolean
  clickBeforeShow?: string  // click this selector before spotlighting (e.g. switch tab)
  interactive?: boolean     // if true, advance when user taps the spotlighted target
  interactivePrompt?: string
  skipIfMissing?: boolean
}

const STEPS: GuideStep[] = [
  {
    selector: '[data-guide-id="families-list"]',
    title: 'Family Accounts',
    body: "Every student belongs to a family account. Billing, contact info, and household-level details all live at the family level — not the student level. You'll come here when you need to update contact info, check payment status, or look up a family's full picture.",
  },
  {
    selector: '[data-guide-id="family-card-first"]',
    title: 'Family at a Glance',
    body: "Each row shows the family name, number of active students, their monthly billing amount, and payment status. Families with overdue balances are flagged here so you can follow up before it becomes a bigger issue.",
    interactive: true,
    interactivePrompt: 'Tap this family to open their full record →',
  },
  {
    selector: '[data-guide-id="family-tab-account"]',
    title: 'Account Tab',
    body: "This is the family's core account info — account name, their unique billing ID, military status, member since date, and their assigned location. The account name is how they appear in billing and communications. You can edit this directly.",
    clickBeforeShow: '[data-guide-id="family-tab-account"]',
  },
  {
    selector: '[data-guide-id="family-parent-contact"]',
    title: 'Contact Information',
    body: "Primary parent name, phone, and email live here. This is what you use to reach the family — calls, texts, follow-ups. Keep this current. If a family member calls with a different number, update it here so the next person who pulls this up has the right info.",
    clickBeforeShow: '[data-guide-id="family-tab-contact"]',
  },
  {
    selector: '[data-guide-id="family-emergency-contact"]',
    title: 'Emergency Contact',
    body: "Required for every active family. If something happens during a session and we can't reach the primary parent, this is who we call. Make sure it's filled out and current for every family at your studio.",
  },
  {
    selector: '[data-guide-id="family-students-list"]',
    title: 'Students in This Household',
    body: "Every student linked to this family appears here. Tap any student name to jump directly to their student profile. Families can have multiple students — siblings often take different instruments with different teachers.",
    clickBeforeShow: '[data-guide-id="family-tab-account"]',
  },
  {
    selector: '[data-guide-id="family-tab-billing"]',
    title: 'Billing Tab',
    body: "This tab shows the family's current billing status, their monthly rate, card on file status, and payment history. You can see whether autopay is active, if there's an outstanding balance, and when their last invoice was paid.",
    clickBeforeShow: '[data-guide-id="family-tab-billing"]',
  },
  {
    selector: '[data-guide-id="family-card-on-file"]',
    title: 'Card on File',
    body: "Families without a card on file are a collection risk. If this shows no card, follow up with the family to get one added before the next billing cycle. Autopay families almost never go overdue.",
  },
  {
    selector: '[data-guide-id="family-scheduling-notes"]',
    title: 'Scheduling Notes',
    body: "This is where you record anything the family has told you about scheduling preferences — 'doesn't want Monday slots', 'needs 4pm or later', 'can't do Saturdays'. This saves you from re-asking the same questions every time something changes.",
    skipIfMissing: true,
  },
  {
    selector: '[data-guide-id="family-billing-notes"]',
    title: 'Billing Notes',
    body: "Use this for anything billing-related that isn't captured automatically — payment arrangements, rate exceptions that were approved, or notes about a disputed invoice. This creates a paper trail so anyone can understand the situation without asking.",
    skipIfMissing: true,
  },
  {
    selector: '[data-guide-id="family-files-section"]',
    title: 'Family Documents',
    body: "Enrollment agreements, signed contracts, and any documents that belong to the household rather than an individual student are stored here. These are the permanent records for this family's relationship with the school.",
    skipIfMissing: true,
  },
]

export default function FamiliesPageGuide() {
  const { isStudioDirector } = usePermissions()
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

  const step = active ? STEPS[idx] : null

  // Spotlight target element (with optional tab-switch click first)
  useEffect(() => {
    if (!active || !step) return
    setReady(false)
    setRect(null)
    let cancelled = false

    // Fire tab switch click if needed
    if (step.clickBeforeShow) {
      const tabEl = document.querySelector(step.clickBeforeShow) as HTMLElement | null
      if (tabEl) tabEl.click()
    }

    let tries = 0
    const tick = () => {
      if (cancelled) return
      const el = document.querySelector(step.selector) as HTMLElement | null
      if (el) {
        el.dataset.famGuideOrigZIndex = el.style.zIndex
        el.dataset.famGuideOrigPosition = el.style.position
        el.dataset.famGuideOrigAnimation = el.style.animation
        el.style.animation = 'famGuidePulse 1.5s ease-in-out infinite'
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
      if (tries++ < 25) {
        setTimeout(tick, 100)
      } else if (step.skipIfMissing) {
        // auto-advance past missing optional targets
        if (!cancelled) advance()
      } else {
        setReady(true)
      }
    }
    const t = setTimeout(tick, step.clickBeforeShow ? 200 : 80)
    return () => {
      cancelled = true
      clearTimeout(t)
      const el = document.querySelector(step.selector) as HTMLElement | null
      if (el) {
        el.style.animation = el.dataset.famGuideOrigAnimation ?? ''
        el.style.zIndex = el.dataset.famGuideOrigZIndex ?? ''
        el.style.position = el.dataset.famGuideOrigPosition ?? ''
        delete el.dataset.famGuideOrigAnimation
        delete el.dataset.famGuideOrigZIndex
        delete el.dataset.famGuideOrigPosition
      }
    }
  }, [active, idx, step])

  // Interactive step: advance when user taps the spotlighted element
  useEffect(() => {
    if (!active || !step || !step.interactive || !ready) return
    const el = document.querySelector(step.selector) as HTMLElement | null
    if (!el) return
    const onClick = () => {
      // allow native click (e.g. opens modal) to propagate, then advance
      setTimeout(() => advance(), 50)
    }
    el.addEventListener('click', onClick, { once: true })
    return () => el.removeEventListener('click', onClick)
  }, [active, step, ready, idx])

  // Keep rect in sync on scroll/resize
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

  const start = () => { setIdx(0); setActive(true) }
  const exit = () => { setActive(false); setRect(null); setReady(false) }
  const advance = () => {
    setIdx((i) => {
      if (i >= STEPS.length - 1) {
        setActive(false)
        setRect(null)
        setReady(false)
        setShowToast(true)
        setTimeout(() => setShowToast(false), 3000)
        return i
      }
      return i + 1
    })
  }
  const back = () => setIdx((i) => Math.max(0, i - 1))

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

  return (
    <>
      <style>{`
        @keyframes famGuidePulse {
          0%, 100% { box-shadow: 0 0 0 3px rgba(255,184,0,0.5); }
          50% { box-shadow: 0 0 0 7px rgba(255,184,0,0.15); }
        }
        @keyframes famGuideToast {
          from { opacity: 0; transform: translate(-50%, 10px); }
          to { opacity: 1; transform: translate(-50%, 0); }
        }
      `}</style>

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

      {active && step && ready && (
        <>
          {/* Dim overlay — positioned below modals (9500) so family modal (9999) shows through */}
          <div
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(0,0,0,0.5)',
              zIndex: 9500,
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
                  fontSize: 12,
                  color: '#FFB800',
                  fontWeight: 700,
                  padding: '8px 10px',
                  borderRadius: 8,
                  background: 'rgba(255,184,0,0.08)',
                  border: '1px solid rgba(255,184,0,0.25)',
                  marginBottom: 12,
                }}
              >
                {step.interactivePrompt}
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
                    onClick={advance}
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
            animation: 'famGuideToast 220ms ease',
            whiteSpace: 'nowrap',
          }}
        >
          Families guide complete. Tap 📖 Guide anytime to replay.
        </div>
      )}
    </>
  )
}
