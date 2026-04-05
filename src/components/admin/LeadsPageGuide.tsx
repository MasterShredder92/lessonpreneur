import { useState, useEffect } from 'react'
import { usePermissions } from '../../hooks/usePermissions'

interface GuideStep {
  selector: string
  title: string
  body: string
  tooltipAbove?: boolean
  interactivePrompt?: string // if set, user advances by clicking the target
}

const STEPS: GuideStep[] = [
  {
    selector: '[data-guide-id="leads-list"]',
    title: 'The Lead Engine',
    body: "Every inquiry that comes through your studio's website lands here automatically. A lead is a potential student — someone who raised their hand and said 'I'm interested.' Your job is to follow up fast. Speed is everything in enrollment. The first studio to respond usually wins the student.",
  },
  {
    selector: '[data-guide-id="leads-stages"]',
    title: 'Lead Stages',
    body: "Every lead moves through stages: Inquiry → Contacted → Scheduled → Enrolled → Lost. Move them forward as you make progress. This tells you and the owner exactly where every potential student stands at any moment.",
  },
  {
    selector: '[data-guide-id="leads-first-card"]',
    title: 'Reading a Lead',
    body: "Each card shows the student's name, instrument interest, how they found you, and when they came in. The age matters — it affects which teacher is the right fit. Tap the card to open the full lead record.",
    interactivePrompt: 'Tap this lead to open the full record →',
  },
  {
    selector: '[data-guide-id="lead-contact"]',
    title: 'Parent Contact',
    body: "Phone and email are here. Text is almost always better than a call for first contact. Parents are busy — a text they can respond to on their own time converts better than a voicemail they'll never return.",
  },
  {
    selector: '[data-guide-id="lead-sms"]',
    title: 'Text the Lead Directly',
    body: "Tap the phone number to send a text message directly from the platform. The message comes from your studio's number via QUO. Keep the first message short and warm — introduce yourself, confirm their interest, and ask when they're available. Don't pitch. Just connect.",
  },
  {
    selector: '[data-guide-id="lead-stage-controls"]',
    title: 'Moving the Lead Forward',
    body: "After you make contact, update the stage to Contacted. After you book a meet and greet, update to Scheduled. After they enroll, mark Enrolled. Never leave a lead stuck in Inquiry — move it or mark it Lost with a reason so the data stays clean.",
    tooltipAbove: true,
  },
  {
    selector: '[data-guide-id="lead-notes"]',
    title: 'Log Your Follow-Up',
    body: "Every time you talk to or text a lead, add a note. What did they say? What instrument? What time slot works? What's holding them back? These notes create a conversation history so you never lose context — even if someone else follows up later.",
  },
  {
    selector: '[data-guide-id="lead-convert"]',
    title: 'Converting a Lead',
    body: "When a lead is ready to enroll, tap Enroll. This creates their student and family record, links their instrument and teacher preference, and moves them into the active roster. The lead record stays for history. This is the finish line — every lead should be working toward this.",
    tooltipAbove: true,
  },
  {
    selector: '[data-guide-id="lead-add-new"]',
    title: 'Adding a Lead Manually',
    body: "If someone calls instead of using the website form, add them manually here. Don't rely on memory — log every inquiry immediately. A lead not in the system is a lead you'll forget to follow up on.",
  },
]

export default function LeadsPageGuide() {
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

  // Spotlight target element + interactive click handler
  useEffect(() => {
    if (!active || !step) return
    setReady(false)
    setRect(null)
    let cancelled = false
    let tries = 0
    let boundEl: HTMLElement | null = null
    let clickHandler: ((e: Event) => void) | null = null

    const tick = () => {
      if (cancelled) return
      const el = document.querySelector(step.selector) as HTMLElement | null
      if (el) {
        boundEl = el
        el.dataset.guideOrigZIndex = el.style.zIndex
        el.dataset.guideOrigPosition = el.style.position
        el.dataset.guideOrigAnimation = el.style.animation
        el.style.animation = 'leadsGuidePulse 1.5s ease-in-out infinite'
        if (!el.style.position || el.style.position === 'static') el.style.position = 'relative'
        el.style.zIndex = '10001'
        el.scrollIntoView({ behavior: 'smooth', block: 'center' })

        if (step.interactivePrompt) {
          clickHandler = () => { setIdx((i) => Math.min(STEPS.length - 1, i + 1)) }
          el.addEventListener('click', clickHandler)
        }

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
    const t = setTimeout(tick, 120)
    return () => {
      cancelled = true
      clearTimeout(t)
      if (boundEl) {
        if (clickHandler) boundEl.removeEventListener('click', clickHandler)
        boundEl.style.animation = boundEl.dataset.guideOrigAnimation ?? ''
        boundEl.style.zIndex = boundEl.dataset.guideOrigZIndex ?? ''
        boundEl.style.position = boundEl.dataset.guideOrigPosition ?? ''
        delete boundEl.dataset.guideOrigAnimation
        delete boundEl.dataset.guideOrigZIndex
        delete boundEl.dataset.guideOrigPosition
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
        @keyframes leadsGuidePulse {
          0%, 100% { box-shadow: 0 0 0 3px rgba(255,184,0,0.5); }
          50% { box-shadow: 0 0 0 7px rgba(255,184,0,0.15); }
        }
        @keyframes leadsGuideToast {
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

            {step.interactivePrompt ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                <button
                  onClick={exit}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#8080A8', fontSize: 11, fontWeight: 600, padding: 0, fontFamily: 'inherit' }}
                >
                  ✕ Exit Guide
                </button>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#FFB800', fontStyle: 'italic' }}>
                  {step.interactivePrompt}
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                <button
                  onClick={exit}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#8080A8', fontSize: 11, fontWeight: 600, padding: 0, fontFamily: 'inherit' }}
                >
                  ✕ Exit Guide
                </button>
                <div style={{ display: 'flex', gap: 6 }}>
                  {idx > 0 && (
                    <button
                      onClick={back}
                      style={{ padding: '6px 12px', borderRadius: 8, cursor: 'pointer', background: 'transparent', color: '#A0A0C8', border: '1px solid rgba(255,255,255,0.12)', fontSize: 12, fontWeight: 600, fontFamily: 'inherit' }}
                    >
                      ← Back
                    </button>
                  )}
                  <button
                    onClick={next}
                    style={{ padding: '6px 12px', borderRadius: 8, cursor: 'pointer', background: '#D4226A', color: '#FFFFFF', border: 'none', fontSize: 12, fontWeight: 800, fontFamily: 'inherit' }}
                  >
                    {idx === STEPS.length - 1 ? 'Done' : 'Next →'}
                  </button>
                </div>
              </div>
            )}
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
            animation: 'leadsGuideToast 220ms ease',
            whiteSpace: 'nowrap',
          }}
        >
          Leads guide complete. Tap 📖 Guide anytime to replay.
        </div>
      )}
    </>
  )
}
