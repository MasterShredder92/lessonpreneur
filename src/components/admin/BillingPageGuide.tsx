import { useState, useEffect } from 'react'
import { usePermissions } from '../../hooks/usePermissions'

interface GuideStep {
  selector: string
  title: string
  body: string
  tooltipAbove?: boolean
}

const STEPS: GuideStep[] = [
  {
    selector: '[data-tour-id="billing-header"]',
    title: 'Billing Overview',
    body: "This page is the financial heartbeat of your studio. It shows what's been collected, what's outstanding, what's overdue, and what's coming next month. You can see all of this and take action on individual families — all scoped to your location only.",
  },
  {
    selector: '[data-tour-id="billing-hero-cards"]',
    title: 'The Numbers at a Glance',
    body: "These cards tell you the health of your billing cycle at a glance: how many families have paid, how many are outstanding, total overdue amount, what's scheduled to bill next, and card-on-file rate. Low card-on-file rate = collection risk. High overdue = follow-up needed now.",
  },
  {
    selector: '[data-tour-id="billing-card-collected"]',
    title: 'Families Paid',
    body: "This counts how many families have successfully paid their invoice this cycle. As billing runs and payments process, this number climbs. By mid-month it should be most of your active families.",
  },
  {
    selector: '[data-tour-id="billing-card-awaiting"]',
    title: 'Outstanding Invoices',
    body: "Families who have been invoiced but haven't paid yet. Some are on autopay and will process shortly. Others need manual follow-up. Click into this number to see exactly who is outstanding.",
  },
  {
    selector: '[data-tour-id="billing-overdue-alert"], [data-tour-id="billing-tab-overdue"]',
    title: 'Overdue Balances',
    body: "Families past their payment due date. This is where you need to act. Overdue balances that sit too long become write-offs. A personal text from you as the director resolves most of these faster than an automated reminder.",
  },
  {
    selector: '[data-tour-id="billing-card-nextMonth"]',
    title: "Next Month's Revenue",
    body: "This shows what's already scheduled to bill next cycle based on current active students and their rates. This number should grow as you enroll new students. Watch it weekly — a declining number means you're losing students faster than you're gaining them.",
  },
  {
    selector: '[data-tour-id="billing-card-discounted"]',
    title: 'Card on File Rate',
    body: "The percentage of active families with a payment card stored. Families with a card on file pay automatically — zero collection effort. Families without one require manual invoicing every month. Your goal is to get every active family on autopay.",
  },
  {
    selector: '[data-tour-id="billing-families-section"]',
    title: 'Per-Student Billing',
    body: "Every active student at your location appears here with their individual monthly rate, session count, and invoice status. This is where you can see if someone's rate looks wrong or if a family has a credit applied.",
  },
  {
    selector: '[data-tour-id="billing-oneoff-btn"]',
    title: 'One-Off Invoices',
    body: "Need to charge a family for something outside their regular monthly billing? Use this. Registration fees, materials, or a catch-up payment — create it here and it goes directly to the family. It shows up in their billing history and sends them a notification.",
  },
  {
    selector: '[data-tour-id="billing-credits-btn"]',
    title: 'Credits and Adjustments',
    body: "If a family is owed a credit — a makeup session that needs to be refunded, a billing error, or an approved discount — apply it here. Credits reduce what they owe on their next invoice. Every credit is logged with who applied it and why.",
    tooltipAbove: true,
  },
  {
    selector: '[data-tour-id="billing-utility-strip"]',
    title: 'Square Sync',
    body: "Square Sync runs at the company level and is managed by ownership. You don't need to touch it — your billing data updates automatically when syncs run. If you notice data that looks off, report it using the issue button.",
    tooltipAbove: true,
  },
]

export default function BillingPageGuide() {
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

  // Spotlight target element
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
        el.style.animation = 'billGuidePulse 1.5s ease-in-out infinite'
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
  const next = () => {
    if (idx >= STEPS.length - 1) {
      exit()
      setShowToast(true)
      setTimeout(() => setShowToast(false), 3000)
    } else {
      setIdx((i) => i + 1)
    }
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
        @keyframes billGuidePulse {
          0%, 100% { box-shadow: 0 0 0 3px rgba(255,184,0,0.5); }
          50% { box-shadow: 0 0 0 7px rgba(255,184,0,0.15); }
        }
        @keyframes billGuideToast {
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
                  {idx >= STEPS.length - 1 ? 'Done' : 'Next →'}
                </button>
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
            animation: 'billGuideToast 220ms ease',
            whiteSpace: 'nowrap',
          }}
        >
          Billing guide complete. Tap 📖 Guide anytime to replay.
        </div>
      )}
    </>
  )
}
