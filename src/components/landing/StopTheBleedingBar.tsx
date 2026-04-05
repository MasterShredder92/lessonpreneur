import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'

const STORAGE_KEY = 'lp_bleed_start'
const RATE_PER_SECOND = 200 / 3600 // $0.055556/sec
const TICK_MS = 180 // one cent every 180ms

function formatUsd(amount: number): string {
  return `$${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function readStart(): { start: number; wasPreexisting: boolean } {
  if (typeof window === 'undefined') {
    return { start: Date.now(), wasPreexisting: false }
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = parseInt(raw, 10)
      if (!Number.isNaN(parsed) && parsed > 0) {
        return { start: parsed, wasPreexisting: true }
      }
    }
  } catch {
    /* ignore */
  }
  const now = Date.now()
  try {
    window.localStorage.setItem(STORAGE_KEY, String(now))
  } catch {
    /* ignore */
  }
  return { start: now, wasPreexisting: false }
}

export default function StopTheBleedingBar() {
  const navigate = useNavigate()

  // Initialize synchronously so display opens at correct accumulated value
  const initRef = useRef<{ start: number; wasPreexisting: boolean } | null>(null)
  if (initRef.current === null) {
    initRef.current = readStart()
  }
  const initial = initRef.current
  const initialAmount = ((Date.now() - initial.start) / 1000) * RATE_PER_SECOND
  const initialReturning = Date.now() - initial.start > 60_000

  const [amount, setAmount] = useState<number>(initialAmount)
  const [isReturning, setIsReturning] = useState<boolean>(initialReturning)
  const [flash, setFlash] = useState(false)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const id = window.setInterval(() => {
      setAmount((prev) => prev + 0.01)
      setFlash(true)
      window.setTimeout(() => setFlash(false), 80)
    }, TICK_MS)
    return () => window.clearInterval(id)
  }, [])

  useEffect(() => {
    const timeoutId = window.setTimeout(() => setVisible(true), 15000)
    return () => window.clearTimeout(timeoutId)
  }, [])

  const handleReset = () => {
    const now = Date.now()
    try {
      window.localStorage.removeItem(STORAGE_KEY)
      window.localStorage.setItem(STORAGE_KEY, String(now))
    } catch {
      /* ignore */
    }
    initRef.current = { start: now, wasPreexisting: false }
    setAmount(0)
    setIsReturning(false)
  }

  const subText = isReturning
    ? 'lost since you first visited. Welcome back.'
    : "lost while you've been thinking about it."

  return (
    <>
      <style>{`
        @keyframes lp-bleed-pulse {
          0%, 100% { box-shadow: 0 0 16px rgba(212,34,106,0.4); }
          50%      { box-shadow: 0 0 32px rgba(212,34,106,0.8); }
        }
        .lp-bleed-bar {
          position: fixed;
          bottom: 0;
          left: 0;
          right: 0;
          z-index: 9999;
          background: rgba(10, 2, 9, 0.92);
          backdrop-filter: blur(16px);
          -webkit-backdrop-filter: blur(16px);
          border-top: 1px solid rgba(212,34,106,0.4);
          padding: 14px 20px;
          font-family: 'Plus Jakarta Sans', system-ui, -apple-system, sans-serif;
        }
        .lp-bleed-inner {
          display: flex;
          flex-direction: row;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          max-width: 1200px;
          margin: 0 auto;
        }
        .lp-bleed-amount {
          font-size: 22px;
          font-weight: 900;
          color: #D4226A;
          line-height: 1.1;
          white-space: nowrap;
        }
        .lp-bleed-sub {
          font-size: 12px;
          color: rgba(255,255,255,0.55);
          font-weight: 500;
          margin-top: 2px;
          line-height: 1.3;
        }
        .lp-bleed-reset {
          background: none;
          border: none;
          padding: 0;
          margin-top: 2px;
          font-size: 11px;
          color: rgba(255,255,255,0.30);
          text-decoration: underline;
          cursor: pointer;
          font-family: inherit;
        }
        .lp-bleed-reset:hover { color: rgba(255,255,255,0.55); }
        .lp-bleed-cta {
          flex-shrink: 0;
          background: #D4226A;
          color: #fff;
          font-weight: 800;
          font-size: 14px;
          padding: 12px 20px;
          border-radius: 8px;
          border: none;
          cursor: pointer;
          font-family: inherit;
          animation: lp-bleed-pulse 2s ease-in-out infinite;
          white-space: nowrap;
          min-height: 44px;
        }
        @media (min-width: 768px) {
          .lp-bleed-bar { padding: 16px 40px; }
          .lp-bleed-amount { font-size: 28px; }
          .lp-bleed-sub { font-size: 13px; }
          .lp-bleed-cta { font-size: 16px; padding: 14px 28px; }
        }
        @media (max-width: 479px) {
          .lp-bleed-inner {
            flex-direction: column;
            align-items: stretch;
            gap: 10px;
          }
          .lp-bleed-cta { width: 100%; text-align: center; }
          .lp-bleed-reset { display: none !important; }
        }
      `}</style>

      <div
        className="lp-bleed-bar"
        role="region"
        aria-label="Revenue loss counter"
        style={{
          opacity: visible ? 1 : 0,
          pointerEvents: visible ? 'all' : 'none',
          transform: visible ? 'translateY(0)' : 'translateY(100%)',
          transition: 'opacity 600ms ease-out, transform 600ms ease-out',
        }}
      >
        <div className="lp-bleed-inner">
          <div style={{ minWidth: 0 }}>
            <div
              className="lp-bleed-amount"
              style={{
                opacity: flash ? 0.6 : 1,
                transition: 'opacity 160ms ease-out',
              }}
            >
              💸 {formatUsd(amount)}
            </div>
            <div className="lp-bleed-sub">{subText}</div>
            <button type="button" className="lp-bleed-reset" onClick={handleReset}>
              reset counter
            </button>
          </div>
          <button
            type="button"
            className="lp-bleed-cta"
            onClick={() => navigate('/v2/start')}
          >
            Stop the Bleeding →
          </button>
        </div>
      </div>
    </>
  )
}
