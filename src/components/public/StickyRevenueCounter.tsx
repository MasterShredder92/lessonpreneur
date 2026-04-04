import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'

/* ═══════════════════════════════════════════════════════
   STICKY REVENUE LOSS COUNTER
   Persistent across landing page (/) and VSL (/start).
   Shows money lost in real-time like a taxi meter.

   Rate tiers (per second) based on student count slider:
     1–25 students:  $0.04/sec
     26–75 students: $0.07/sec
     76–150 students: $0.11/sec
     150+ students:  $0.17/sec
     Default (no slider): $0.0667/sec ($1 every 15 seconds)

   Listens for custom event 'lp:studentcount' from the
   ROI slider on the landing page to adjust rate live.
   ═══════════════════════════════════════════════════════ */

const SESSION_KEY = 'lp_session_start'

function getStartTime(): number {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY)
    if (raw) return parseInt(raw, 10)
  } catch { /* ignore */ }
  const now = Date.now()
  sessionStorage.setItem(SESSION_KEY, String(now))
  return now
}

function rateForStudents(count: number | null): number {
  if (count === null) return 0.0667
  if (count <= 25) return 0.04
  if (count <= 75) return 0.07
  if (count <= 150) return 0.11
  return 0.17
}

function formatUSD(n: number): string {
  return n.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

export default function StickyRevenueCounter() {
  const navigate = useNavigate()
  const location = useLocation()
  const startTime = useRef(getStartTime())
  const [amount, setAmount] = useState(0)
  const [rate, setRate] = useState(0.0667)
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

  // Tick the counter every second
  useEffect(() => {
    if (frozen) return
    const tick = () => {
      const elapsed = (Date.now() - startTime.current) / 1000
      setAmount(elapsed * rate)
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [rate, frozen])

  const displayAmount = frozen ? frozenAmount.current : amount
  const formatted = formatUSD(displayAmount)

  const handleCTA = useCallback(() => {
    if (frozen) return
    frozenAmount.current = amount
    setFrozen(true)
    setSmartMove(true)
    setTimeout(() => {
      navigate(isVSL ? '/get-started' : '/start')
    }, 2000)
  }, [frozen, amount, isVSL, navigate])

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
              <span className="slc-sub">
                {isVSL ? 'lost while you\u2019ve been watching.' : 'lost while you\u2019ve been reading this.'}
              </span>
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
