import type React from 'react'

interface FamilyInsightBarProps {
  billingIssues: number | undefined
  noAutopay: number | undefined
  newThisMonth: number | undefined
  autoPayPercent: number | undefined
  totalActive: number
  onFixBilling: () => void
  onViewAutopay: () => void
}

export default function FamilyInsightBar({
  billingIssues,
  noAutopay,
  newThisMonth,
  autoPayPercent,
  totalActive,
  onFixBilling,
  onViewAutopay,
}: FamilyInsightBarProps) {
  const pct = autoPayPercent ?? 0
  const autopayColor = pct >= 80 ? '#22C55E' : pct >= 60 ? '#FFB800' : '#EF4444'
  const autopayBg =
    pct >= 80
      ? 'rgba(34,197,94,0.06)'
      : pct >= 60
        ? 'rgba(255,184,0,0.06)'
        : 'rgba(239,68,68,0.06)'
  const autopayBorder =
    pct >= 80
      ? 'rgba(34,197,94,0.18)'
      : pct >= 60
        ? 'rgba(255,184,0,0.18)'
        : 'rgba(239,68,68,0.18)'

  const hasIssues = (billingIssues ?? 0) > 0
  const hasNoAutopay = (noAutopay ?? 0) > 0

  const tiles: {
    label: string
    value: string | number | undefined
    color: string
    bg: string
    border: string
    sub: string
    action?: { label: string; onClick: () => void }
  }[] = [
    {
      label: 'Billing Issues',
      value: billingIssues,
      color: hasIssues ? '#EF4444' : '#22C55E',
      bg: hasIssues ? 'rgba(239,68,68,0.06)' : 'rgba(34,197,94,0.06)',
      border: hasIssues ? 'rgba(239,68,68,0.18)' : 'rgba(34,197,94,0.18)',
      sub: hasIssues ? 'no card or overdue balance' : 'all billing current',
      action: hasIssues ? { label: 'Fix Billing Issues →', onClick: onFixBilling } : undefined,
    },
    {
      label: 'No Autopay',
      value: noAutopay,
      color: hasNoAutopay ? '#fb923c' : '#22C55E',
      bg: hasNoAutopay ? 'rgba(251,146,60,0.06)' : 'rgba(34,197,94,0.06)',
      border: hasNoAutopay ? 'rgba(251,146,60,0.18)' : 'rgba(34,197,94,0.18)',
      sub: 'families without card on file',
      action: hasNoAutopay ? { label: 'Send Nudge →', onClick: onViewAutopay } : undefined,
    },
    {
      label: 'New This Month',
      value: newThisMonth,
      color: '#22C55E',
      bg: 'rgba(34,197,94,0.06)',
      border: 'rgba(34,197,94,0.18)',
      sub: 'new active families',
    },
    {
      label: 'Autopay Rate',
      value: autoPayPercent !== undefined ? `${autoPayPercent}%` : undefined,
      color: autopayColor,
      bg: autopayBg,
      border: autopayBorder,
      sub: `${totalActive} active families`,
    },
  ]

  return (
    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 20 }}>
      {tiles.map((tile) => (
        <div
          key={tile.label}
          style={{
            flex: '1 0 150px',
            background: tile.bg,
            border: `1px solid ${tile.border}`,
            borderLeft: `3px solid ${tile.color}`,
            borderRadius: 10,
            padding: '14px 16px',
          }}
        >
          <div
            style={{
              fontSize: 10,
              fontWeight: 700,
              color: '#A0A0C8',
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              marginBottom: 6,
            }}
          >
            {tile.label}
          </div>
          <div
            style={{
              fontSize: 24,
              fontWeight: 900,
              color: tile.color,
              fontFamily: "'Plus Jakarta Sans', sans-serif",
              lineHeight: 1,
            }}
          >
            {tile.value !== undefined ? tile.value : '…'}
          </div>
          <div style={{ fontSize: 10, color: '#606088', marginTop: 4 }}>{tile.sub}</div>
          {tile.action && (
            <button
              onClick={tile.action.onClick}
              style={{
                marginTop: 8,
                fontSize: 10,
                fontWeight: 700,
                color: tile.color,
                background: 'transparent',
                border: `1px solid ${tile.border}`,
                borderRadius: 6,
                padding: '3px 8px',
                cursor: 'pointer',
              }}
            >
              {tile.action.label}
            </button>
          )}
        </div>
      ))}
    </div>
  )
}

