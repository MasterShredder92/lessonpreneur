import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'

const STORAGE_KEY = 'lp_first_visit'
const LOSS_PER_SECOND = 50000 / 365 / 24 / 60 / 60 // ≈ 0.0015854

function formatUsd(amount: number): string {
  return `$${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export default function StopTheBleedingBar() {
  const navigate = useNavigate()
  const [amount, setAmount] = useState(0)
  const [isReturning, setIsReturning] = useState(false)
  const [flash, setFlash] = useState(false)
  const startRef = useRef<number>(Date.now())

  useEffect(() => {
    const existing =
      typeof window !== 'undefined' ? window.localStorage.getItem(STORAGE_KEY) : null
    if (existing) {
      const parsed = parseInt(existing, 10)
      if (!Number.isNaN(parsed) && parsed > 0) {
        startRef.current = parsed
        setIsReturning(true)
      } else {
        const now = Date.now()
        window.localStorage.setItem(STORAGE_KEY, String(now))
        startRef.current = now
        setIsReturning(false)
      }
    } else {
      const now = Date.now()
      try {
        window.localStorage.setItem(STORAGE_KEY, String(now))
      } catch {
        /* ignore */
      }
      startRef.current = now
      setIsReturning(false)
    }

    const tick = () => {
      const elapsedSec = (Date.now() - startRef.current) / 1000
      setAmount(elapsedSec * LOSS_PER_SECOND)
      setFlash(true)
      window.setTimeout(() => setFlash(false), 90)
    }
    tick()
    const id = window.setInterval(tick, 100)
    return () => window.clearInterval(id)
  }, [])

  const handleReset = () => {
    const now = Date.now()
    try {
      window.localStorage.setItem(STORAGE_KEY, String(now))
    } catch {
      /* ignore */
    }
    startRef.current = now
    setIsReturning(false)
    setAmount(0)
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

      <div className="lp-bleed-bar" role="region" aria-label="Revenue loss counter">
        <div className="lp-bleed-inner">
          <div style={{ minWidth: 0 }}>
            <div
              className="lp-bleed-amount"
              style={{
                opacity: flash ? 0.7 : 1,
                transition: 'opacity 100ms ease-out',
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
