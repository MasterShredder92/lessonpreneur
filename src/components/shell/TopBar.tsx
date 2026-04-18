import type { ReactNode } from 'react'
import { Menu } from 'lucide-react'

export type TopBarProps = {
  /** Primary line — surface title */
  title: string
  subtitle?: string
  /** Studio / tenant label */
  studioName?: string
  /** Extra controls (notifications, etc.) */
  trailing?: ReactNode
  onOpenMobileNav?: () => void
  showMobileMenu?: boolean
}

export default function TopBar({ title, subtitle, studioName, trailing, onOpenMobileNav, showMobileMenu }: TopBarProps) {
  return (
    <header
      style={{
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        padding: '14px clamp(16px, 3vw, 28px)',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        background: 'linear-gradient(180deg, rgba(18,20,28,0.92) 0%, rgba(12,14,18,0.75) 100%)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
      }}
    >
      {showMobileMenu && onOpenMobileNav ? (
        <button
          type="button"
          onClick={onOpenMobileNav}
          aria-label="Open navigation"
          className="zw-topbar__menu-btn"
          style={{
            alignItems: 'center',
            justifyContent: 'center',
            width: 44,
            height: 44,
            borderRadius: 12,
            border: '1px solid rgba(255,255,255,0.1)',
            background: 'rgba(255,255,255,0.04)',
            color: '#e8eaf4',
            cursor: 'pointer',
          }}
        >
          <Menu size={22} />
        </button>
      ) : null}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'baseline',
            gap: 10,
            flexWrap: 'wrap',
          }}
        >
          <span
            style={{
              fontSize: 13,
              fontWeight: 800,
              letterSpacing: '0.02em',
              background: 'linear-gradient(90deg, #39ff14 0%, #c8ff00 55%, #e8eaf4 100%)',
              WebkitBackgroundClip: 'text',
              backgroundClip: 'text',
              color: 'transparent',
            }}
          >
            ZiroWork
          </span>
          {studioName ? (
            <span style={{ fontSize: 12, fontWeight: 600, color: 'rgba(139,144,168,0.9)' }}>· {studioName}</span>
          ) : null}
        </div>
        <h1
          style={{
            margin: '6px 0 0',
            fontSize: 'clamp(1.15rem, 2.2vw, 1.45rem)',
            fontWeight: 700,
            letterSpacing: '-0.02em',
            color: '#f0f2fa',
            lineHeight: 1.25,
          }}
        >
          {title}
        </h1>
        {subtitle ? (
          <p
            style={{
              margin: '6px 0 0',
              fontSize: 14,
              lineHeight: 1.5,
              color: 'rgba(184,188,208,0.88)',
              maxWidth: 640,
            }}
          >
            {subtitle}
          </p>
        ) : null}
      </div>
      {trailing ? <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>{trailing}</div> : null}
      <style>{`
        .zw-topbar__menu-btn { display: none; }
        @media (max-width: 900px) {
          .zw-topbar__menu-btn { display: flex !important; }
        }
      `}</style>
    </header>
  )
}
