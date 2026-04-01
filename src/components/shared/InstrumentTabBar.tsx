import { Link, useLocation } from 'react-router-dom'
import { trackInstrumentSelected } from '../../lib/analytics'

const TABS = [
  { label: 'Piano', to: '/piano' },
  { label: 'Guitar', to: '/guitar' },
  { label: 'Vocals', to: '/vocals' },
  { label: 'Drums', to: '/drums' },
]

interface InstrumentTabBarProps {
  onSignUpClick?: () => void
}

export default function InstrumentTabBar({ onSignUpClick }: InstrumentTabBarProps) {
  const { pathname } = useLocation()

  return (
    <div className="ak-nlinks">
      {TABS.map(tab => (
        <Link
          key={tab.to}
          className="ak-nl"
          to={tab.to}
          style={pathname === tab.to ? { color: '#fff', background: '#141420' } : undefined}
          onClick={() => trackInstrumentSelected(tab.label)}
        >
          {tab.label}
        </Link>
      ))}
      {onSignUpClick && (
        <button
          className="ak-nl"
          onClick={onSignUpClick}
          style={{ border: 'none', cursor: 'pointer', background: 'transparent' }}
        >
          Sign Up
        </button>
      )}
    </div>
  )
}
