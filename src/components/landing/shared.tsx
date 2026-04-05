import { useState, type CSSProperties, type ReactNode } from 'react'

export const COLORS = {
  bg: '#020209',
  pink: '#D4226A',
  orange: '#FF5500',
  gold: '#FFB800',
  textPrimary: '#FFFFFF',
  textSecondary: 'rgba(255,255,255,0.65)',
  textMuted: 'rgba(255,255,255,0.4)',
  cardBg: 'rgba(255,255,255,0.04)',
  cardBorder: 'rgba(255,255,255,0.08)',
}

export const FONT = 'Plus Jakarta Sans, system-ui, -apple-system, sans-serif'

export const sectionStyle: CSSProperties = {
  position: 'relative',
  zIndex: 1,
  maxWidth: '1100px',
  margin: '0 auto',
  padding: '100px 24px',
  boxSizing: 'border-box',
}

export const mobileSectionCss = `
@media (max-width: 768px) {
  .lp-section { padding: 64px 20px !important; }
  .lp-h1 { font-size: 36px !important; line-height: 1.1 !important; }
  .lp-h2 { font-size: 28px !important; line-height: 1.2 !important; }
  .lp-h3 { font-size: 30px !important; line-height: 1.2 !important; }
  .lp-h-final { font-size: 32px !important; line-height: 1.1 !important; }
  .lp-sub { font-size: 17px !important; }
  .lp-body { font-size: 16px !important; }
  .lp-grid-2 { grid-template-columns: 1fr !important; }
  .lp-grid-3 { grid-template-columns: 1fr !important; }
  .lp-trust-row { justify-content: flex-start !important; }
  .lp-founder-row { flex-direction: column !important; align-items: flex-start !important; }
  .lp-steps-row { flex-direction: column !important; gap: 32px !important; }
  .lp-cta-btn { width: 100% !important; max-width: 400px !important; }
  .lp-row-item { font-size: 16px !important; }
}
`

export function PrimaryButton({
  children,
  onClick,
  type = 'button',
  fullWidth = false,
  disabled = false,
}: {
  children: ReactNode
  onClick?: () => void
  type?: 'button' | 'submit'
  fullWidth?: boolean
  disabled?: boolean
}) {
  const [hover, setHover] = useState(false)
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      className="lp-cta-btn"
      style={{
        background: COLORS.pink,
        color: '#fff',
        border: 'none',
        borderRadius: '8px',
        padding: '16px 32px',
        fontWeight: 800,
        fontSize: '18px',
        fontFamily: FONT,
        cursor: disabled ? 'not-allowed' : 'pointer',
        transition: 'transform 200ms, filter 200ms',
        filter: hover ? 'brightness(1.1)' : 'brightness(1)',
        transform: hover ? 'scale(1.02)' : 'scale(1)',
        width: fullWidth ? '100%' : 'auto',
        opacity: disabled ? 0.6 : 1,
      }}
    >
      {children}
    </button>
  )
}

export function TrustChips() {
  const chips = [
    'No credit card required',
    '60-day free trial',
    'Cancel anytime',
    'Works with Square',
    'Guided setup included',
  ]
  return (
    <div
      className="lp-trust-row"
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: '8px',
        justifyContent: 'center',
      }}
    >
      {chips.map((chip) => (
        <span
          key={chip}
          style={{
            border: '1px solid rgba(255,255,255,0.15)',
            background: 'rgba(255,255,255,0.05)',
            color: 'rgba(255,255,255,0.7)',
            fontSize: '13px',
            padding: '6px 12px',
            borderRadius: '999px',
            fontFamily: FONT,
            fontWeight: 500,
          }}
        >
          {chip}
        </span>
      ))}
    </div>
  )
}

export function GlassCard({
  children,
  style,
}: {
  children: ReactNode
  style?: CSSProperties
}) {
  return (
    <div
      style={{
        background: COLORS.cardBg,
        border: `1px solid ${COLORS.cardBorder}`,
        borderRadius: '16px',
        padding: '32px',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        ...style,
      }}
    >
      {children}
    </div>
  )
}
