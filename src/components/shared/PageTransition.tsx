import { type ReactNode } from 'react'
import { useLocation } from 'react-router-dom'

export default function PageTransition({ children }: { children: ReactNode }) {
  const location = useLocation()

  return (
    <div
      key={location.pathname}
      className="page-transition-in"
      style={{ minHeight: '100%', background: '#020209' }}
    >
      {children}
    </div>
  )
}
