import { useState, useEffect, useRef, useCallback } from 'react'
import type { MouseEvent as ReactMouseEvent } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'

/* ═══════════════════════════════════════════════════════
   STICKY REVENUE LOSS COUNTER
   Persistent across landing page (/) and VSL (/start).
   Shows money lost in real-time like a taxi meter.
   Timer persists via localStorage so returning visitors
   see accumulated loss from their original first visit.

   Default rate: $180/mo × 10 students ÷ seconds-per-month
     ≈ $0.000694 / sec (~$0.07 every 100s)

   Slider tiers (fired by landing-page ROI slider via the
   'lp:studentcount' custom event) override the rate when
   the visitor is actively exploring student counts.
   ═══════════════════════════════════════════════════════ */

const STORAGE_KEY = 'lp_first_visit'
// $200/hr average cost of doing nothing → $/sec
const DEFAULT_RATE = 200 / 3600
const THIRTY_MIN_MS = 30 * 60 * 1000
const DAY_MS = 24 * 60 * 60 * 1000
const WEEK_MS = 7 * DAY_MS

type InitResult = { start: number; isReturning: boolean }

function initFirstVisit(): InitResult {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = parseInt(raw, 10)
      if (!isNaN(parsed)) return { start: parsed, isReturning: true }
    }
  } catch { /* ignore */ }
  const now = Date.now()
  try { localStorage.setItem(STORAGE_KEY, String(now)) } catch { /* ignore */ }
  return { start: now, isReturning: false }
}

function rateForStudents(count: number | null): number {
  if (count === null) return DEFAULT_RATE
  if (count <= 25) return 0.04
  if (count <= 75) return 0.07
  if (count <= 150) return 0.11
  return 0.17
}

function formatUSD(n: number): string {
  // 4 decimals so sub-cent motion is visible — ticker/gas-pump style
  return n.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 4,
    maximumFractionDigits: 4,
  })
}

function returningLabel(elapsedMs: number): string | null {
  if (elapsedMs < THIRTY_MIN_MS) return null
  if (elapsedMs < DAY_MS) return 'lost since you first visited. Welcome back.'
  if (elapsedMs < WEEK_MS) return 'lost while you were thinking it over. The meter never stopped.'
  return "lost while life got in the way. It's not too late — but it's not free either."
}

export default function StickyRevenueCounter() {
  const navigate = useNavigate()
  const location = useLocation()
  const firstVisit = useRef<InitResult>(initFirstVisit())
  const startTime = useRef<number>(firstVisit.current.start)
  const [elapsedMs, setElapsedMs] = useState<number>(() => Date.now() - startTime.current)
  const [rate, setRate] = useState<number>(DEFAULT_RATE)
  const [frozen, setFrozen] = useState(false)
  const [smartMove, setSmartMove] = useState(false)
  const frozenAmount = useRef(0)

  const isVSL = location.pathname === '/start'

  // Listen for student count changes from the ROI slider
  useEffect(() => {
    const handler = (e: Event) => {
      const count = (e as CustomEvent<number>).detail
      setRate(rateForStudents(count))
    }
    window.addEventListener('lp:studentcount', handler)
    return () => window.removeEventListener('lp:studentcount', handler)
  }, [])

  // rAF-driven tick off the persisted start time — smooth, not batched
  useEffect(() => {
    if (frozen) return
    let rafId = 0
    const loop = () => {
      setElapsedMs(Date.now() - startTime.current)
      rafId = requestAnimationFrame(loop)
    }
    rafId = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(rafId)
  }, [frozen])

  const liveAmount = (elapsedMs / 1000) * rate
  const displayAmount = frozen ? frozenAmount.current : liveAmount
  const formatted = formatUSD(displayAmount)

  const returningMsg = returningLabel(elapsedMs)
  const showReturning = firstVisit.current.isReturning && returningMsg !== null

  const handleCTA = useCallback(() => {
    if (frozen) return
    frozenAmount.current = liveAmount
    setFrozen(true)
    setSmartMove(true)
    setTimeout(() => {
      navigate(isVSL ? '/get-started' : '/start')
    }, 2000)
  }, [frozen, liveAmount, isVSL, navigate])

  const handleReset = useCallback((e: ReactMouseEvent<HTMLButtonElement>) => {
    e.preventDefault()
    try { localStorage.removeItem(STORAGE_KEY) } catch { /* ignore */ }
    const now = Date.now()
    try { localStorage.setItem(STORAGE_KEY, String(now)) } catch { /* ignore */ }
    firstVisit.current = { start: now, isReturning: false }
    startTime.current = now
    setElapsedMs(0)
    // Notify any other listeners (e.g. pricing guilt banner) to recompute
    try { window.dispatchEvent(new Event('lp:firstvisitreset')) } catch { /* ignore */ }
  }, [])

  return (
    <div className={`slc-bar${isVSL ? ' slc-bar-subtle' : ''}${smartMove ? ' slc-bar-success' : ''}`}>
      <style>{styles}</style>
      <div className="slc-inner">
        {smartMove ? (
          <div className="slc-left">
            <span className="slc-amount slc-amount-success">Smart move. Let&rsquo;s get that back.</span>
          </div>
        ) : (
          <>
            <div className="slc-left">
              <span className="slc-amount">{'\uD83D\uDCB8'} {formatted}</span>
              <span className={`slc-sub${showReturning ? ' slc-sub-returning' : ''}`}>
                {showReturning ? returningMsg : 'lost while you\u2019ve been thinking about it...'}
              </span>
              {showReturning && (
                <button type="button" className="slc-reset" onClick={handleReset}>reset counter</button>
              )}
            </div>
            <button className="slc-cta" onClick={handleCTA}>
              Stop the Bleeding &rarr;
            </button>
          </>
        )}
      </div>
    </div>
  )
}

const styles = `
/* ── Sticky Loss Counter Bar ── */
.lp2, .vsl { padding-bottom: 80px; }

.slc-bar {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  z-index: 9999;
  background: #020209;
  border-top: 1px solid rgba(212,34,106,0.25);
  box-shadow: 0 -4px 24px rgba(0,0,0,0.6);
  transition: opacity 0.3s ease;
}
.slc-bar-subtle {
  opacity: 0.85;
}
.slc-bar-subtle:hover {
  opacity: 1;
}
.slc-bar-success {
  border-top-color: #22C55E;
}
.slc-inner {
  max-width: 1200px;
  margin: 0 auto;
  padding: 10px 20px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}
.slc-left {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}
.slc-amount {
  font-family: 'Plus Jakarta Sans', system-ui, sans-serif;
  font-size: 22px;
  font-weight: 900;
  color: #D4226A;
  letter-spacing: -0.02em;
  font-variant-numeric: tabular-nums;
  -webkit-text-fill-color: #D4226A;
  line-height: 1.2;
}
.slc-amount-success {
  color: #22C55E;
  -webkit-text-fill-color: #22C55E;
}
.slc-sub {
  font-family: 'Plus Jakarta Sans', system-ui, sans-serif;
  font-size: 12px;
  font-weight: 600;
  color: #6868A0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  line-height: 1.3;
}
.slc-sub-returning {
  color: #FFB800;
}
.slc-reset {
  background: none;
  border: none;
  padding: 0;
  margin-top: 2px;
  font-family: 'Plus Jakarta Sans', system-ui, sans-serif;
  font-size: 9px;
  font-weight: 500;
  color: #6868A0;
  opacity: 0.3;
  cursor: pointer;
  text-decoration: underline;
  text-align: left;
  transition: opacity 160ms ease;
  align-self: flex-start;
}
.slc-reset:hover {
  opacity: 1;
}
.slc-cta {
  flex-shrink: 0;
  padding: 10px 24px;
  border: none;
  border-radius: 10px;
  background: #D4226A;
  color: white;
  font-family: 'Plus Jakarta Sans', system-ui, sans-serif;
  font-size: 14px;
  font-weight: 800;
  cursor: pointer;
  transition: all 160ms ease;
  white-space: nowrap;
}
.slc-cta:hover {
  opacity: 0.9;
  transform: translateY(-1px);
  box-shadow: 0 4px 16px rgba(212,34,106,0.4);
}

@media (max-width: 600px) {
  .slc-inner {
    flex-direction: column;
    align-items: stretch;
    padding: 10px 16px;
    gap: 8px;
  }
  .slc-left {
    align-items: center;
    text-align: center;
  }
  .slc-reset {
    align-self: center;
  }
  .slc-amount {
    font-size: 20px;
  }
  .slc-sub {
    font-size: 11px;
  }
  .slc-cta {
    width: 100%;
    text-align: center;
    padding: 10px 16px;
    font-size: 13px;
  }
}
`
