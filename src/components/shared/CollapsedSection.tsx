import type React from 'react'
import { ChevronDown } from 'lucide-react'

export default function CollapsedSection({
  title,
  count,
  open,
  onToggle,
  children,
}: {
  title: string
  count?: number
  open: boolean
  onToggle: () => void
  children: React.ReactNode
}) {
  return (
    <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', marginTop: 20, paddingTop: 16 }}>
      <button
        onClick={onToggle}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          width: '100%',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          padding: 0,
          marginBottom: open ? 12 : 0,
        }}
      >
        <ChevronDown
          size={14}
          style={{
            color: '#8080A8',
            transition: 'transform 150ms',
            transform: open ? 'rotate(180deg)' : 'rotate(0)',
          }}
        />
        <span
          style={{
            fontSize: 12,
            fontWeight: 700,
            color: '#8080A8',
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
          }}
        >
          {title}
        </span>
        {count != null && count > 0 && (
          <span className="badge-secondary" style={{ fontSize: 9 }}>
            {count}
          </span>
        )}
      </button>
      {open && children}
    </div>
  )
}

