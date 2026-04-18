import type { CSSProperties, ReactNode } from 'react'

export type CardProps = {
  children: ReactNode
  title?: string
  className?: string
  style?: CSSProperties
  /** Slightly stronger elevation */
  elevated?: boolean
}

export default function Card({ children, title, className = '', style, elevated }: CardProps) {
  return (
    <div
      className={`zw-card ${elevated ? 'zw-card--elevated' : ''} ${className}`.trim()}
      style={{
        borderRadius: 16,
        border: '1px solid rgba(255,255,255,0.09)',
        background: elevated
          ? 'linear-gradient(165deg, rgba(28,32,44,0.92) 0%, rgba(18,20,28,0.88) 100%)'
          : 'linear-gradient(165deg, rgba(24,27,38,0.78) 0%, rgba(16,18,24,0.82) 100%)',
        boxShadow: elevated
          ? '0 24px 48px rgba(0,0,0,0.45), 0 0 0 1px rgba(57,255,20,0.06) inset, 0 1px 0 rgba(255,255,255,0.06) inset'
          : '0 12px 32px rgba(0,0,0,0.35), 0 0 0 1px rgba(255,255,255,0.04) inset',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        padding: title ? '18px 20px 20px' : 20,
        ...style,
      }}
    >
      {title ? (
        <>
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              color: 'rgba(139,144,168,0.95)',
              marginBottom: 12,
            }}
          >
            {title}
          </div>
          {children}
        </>
      ) : (
        children
      )}
    </div>
  )
}
