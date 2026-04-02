import { useRef, useState, useEffect, type ReactNode } from 'react'
import { useLocation } from 'react-router-dom'

export default function PageTransition({ children }: { children: ReactNode }) {
  const location = useLocation()
  const [displayChildren, setDisplayChildren] = useState(children)
  const [phase, setPhase] = useState<'in' | 'out'>('in')
  const prevKey = useRef(location.key)

  useEffect(() => {
    if (location.key !== prevKey.current) {
      prevKey.current = location.key
      setPhase('out')
      const timer = setTimeout(() => {
        setDisplayChildren(children)
        setPhase('in')
      }, 100)
      return () => clearTimeout(timer)
    } else {
      setDisplayChildren(children)
    }
  }, [location.key, children])

  return (
    <div
      className={phase === 'out' ? 'page-transition-out' : 'page-transition-in'}
      style={{ minHeight: '100%', background: '#020209' }}
    >
      {displayChildren}
    </div>
  )
}
