import type React from 'react'
import { toast } from './Toast'

export default function CopyText({
  value,
  style,
}: {
  value: string | null | undefined
  style?: React.CSSProperties
}) {
  if (!value) return <span style={style}>---</span>
  return (
    <span
      style={{ ...style, cursor: 'pointer' }}
      title="Click to copy"
      onClick={(e) => {
        e.stopPropagation()
        navigator.clipboard.writeText(value)
        toast('Copied', 'success')
      }}
    >
      {value}
    </span>
  )
}

