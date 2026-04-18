import { Command } from 'lucide-react'
import type { CSSProperties } from 'react'

export type CommandButtonProps = {
  onClick: () => void
  title?: string
  style?: CSSProperties
}

/** Floating command palette trigger — glossy, premium */
export default function CommandButton({ onClick, title = 'Command palette (⌘K)', style }: CommandButtonProps) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      style={{
        position: 'fixed',
        bottom: 28,
        right: 28,
        zIndex: 60,
        width: 56,
        height: 56,
        borderRadius: 18,
        border: '1px solid rgba(57,255,20,0.35)',
        background: 'linear-gradient(145deg, rgba(28,32,44,0.95) 0%, rgba(14,16,22,0.98) 100%)',
        boxShadow:
          '0 0 0 1px rgba(255,255,255,0.06) inset, 0 8px 32px rgba(0,0,0,0.5), 0 0 28px rgba(57,255,20,0.15)',
        color: '#39ff14',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        transition: 'transform 0.15s ease, box-shadow 0.15s ease',
        ...style,
      }}
      onMouseDown={(e) => {
        e.currentTarget.style.transform = 'scale(0.96)'
      }}
      onMouseUp={(e) => {
        e.currentTarget.style.transform = ''
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = ''
      }}
    >
      <Command size={24} strokeWidth={2.2} />
    </button>
  )
}
