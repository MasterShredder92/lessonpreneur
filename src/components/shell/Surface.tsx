import type { CSSProperties, ReactNode } from 'react'

export type SurfaceProps = {
  children: ReactNode
  className?: string
  style?: CSSProperties
}

/** Main content column — modular spacing and readable measure */
export default function Surface({ children, className = '', style }: SurfaceProps) {
  return (
    <div
      className={`zw-surface ${className}`.trim()}
      style={{
        flex: 1,
        minHeight: 0,
        overflow: 'auto',
        padding: 'clamp(20px, 3vw, 36px) clamp(20px, 4vw, 48px) 48px',
        maxWidth: 'min(1120px, 100%)',
        margin: '0 auto',
        width: '100%',
        ...style,
      }}
    >
      {children}
    </div>
  )
}
