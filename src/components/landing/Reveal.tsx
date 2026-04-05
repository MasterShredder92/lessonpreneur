import type { CSSProperties, ReactNode } from 'react'
import { useInView } from './useInView'

export default function Reveal({
  children,
  delay = 0,
  style,
  as = 'div',
}: {
  children: ReactNode
  delay?: number
  style?: CSSProperties
  as?: 'div' | 'section'
}) {
  const [ref, inView] = useInView<HTMLDivElement>(0.1)
  const Tag = as as 'div'
  return (
    <Tag
      ref={ref}
      style={{
        opacity: inView ? 1 : 0,
        transform: inView ? 'translateY(0)' : 'translateY(20px)',
        transition: `opacity 600ms ease-out ${delay}ms, transform 600ms ease-out ${delay}ms`,
        willChange: 'opacity, transform',
        ...style,
      }}
    >
      {children}
    </Tag>
  )
}
