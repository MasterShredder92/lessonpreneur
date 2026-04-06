import type { BillingSnapshotData } from '../../hooks/useBillingSnapshot'

// ══════════════════════════════════════════
// TYPES
// ══���════════════════════��══════════════════

interface Props {
  title: string
  data: BillingSnapshotData
  accentColor?: string           // Location brand color (defaults to pink)
  variant?: 'full' | 'summary'   // full = all 5 metrics, summary = collected + total invoiced only
  clickable?: boolean            // navigate on metric click
  onMetricClick?: (metric: string) => void
  size?: 'default' | 'large'     // large = billing page
}

// ═══════════════════���══════════════════════
// HELPERS
// ══════���═════════════════��═════════════════

function dollars(cents: number): string {
  const abs = Math.abs(cents) / 100
  const formatted = abs.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
  return `${cents < 0 ? '-' : ''}$${formatted}`
}

// ══════════════════════════════════════════
// COMPONENT
// ══════════════════════════════════════════

export default function BillingSnapshotCard({
  title,
  data,
  accentColor = '#D4226A',
  variant = 'full',
  clickable = false,
  onMetricClick,
  size = 'default',
}: Props) {
  const isLarge = size === 'large'
  const isSummary = variant === 'summary'

  const metricRow = (label: string, value: string, metricKey: string, muted = false) => {
    const isClickable = clickable && !muted
    return (
      <div
        key={label}
        onClick={isClickable ? () => onMetricClick?.(metricKey) : undefined}
        style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: isLarge ? '8px 0' : '5px 0',
          cursor: isClickable ? 'pointer' : 'default',
          borderRadius: 6,
          transition: 'background 150ms',
        }}
        onMouseEnter={isClickable ? (e) => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.04)' } : undefined}
        onMouseLeave={isClickable ? (e) => { (e.currentTarget as HTMLElement).style.background = 'transparent' } : undefined}
      >
        <span style={{
          fontSize: isLarge ? 13 : 12,
          fontWeight: 500,
          color: muted ? '#606088' : '#A0A0C8',
        }}>
          {label}
        </span>
        <span style={{
          fontSize: isLarge ? 18 : 15,
          fontWeight: 800,
          color: muted ? '#606088' : '#E0E0F4',
          fontVariantNumeric: 'tabular-nums',
        }}>
          {value}
        </span>
      </div>
    )
  }

  return (
    <div style={{
      position: 'relative',
      overflow: 'hidden',
      borderRadius: 14,
      background: 'rgba(255,255,255,0.03)',
      border: '1px solid rgba(255,255,255,0.06)',
      padding: isLarge ? '20px 22px' : '16px 18px',
    }}>
      {/* Left accent edge */}
      <div style={{
        position: 'absolute', top: 0, left: 0, bottom: 0, width: 3,
        background: accentColor,
        boxShadow: `0 0 18px ${accentColor}60`,
      }} />

      {/* Top glow */}
      <div style={{
        position: 'absolute', top: -20, left: -20, width: 100, height: 100,
        background: `radial-gradient(circle, ${accentColor}14 0%, transparent 70%)`,
        pointerEvents: 'none',
      }} />

      {/* Content */}
      <div style={{ position: 'relative' }}>
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8, marginBottom: isLarge ? 14 : 10,
        }}>
          <div style={{
            width: 8, height: 8, borderRadius: 4,
            background: accentColor,
            boxShadow: `0 0 8px ${accentColor}80`,
            flexShrink: 0,
          }} />
          <span style={{
            fontSize: isLarge ? 14 : 12,
            fontWeight: 700,
            color: '#E0E0F4',
            letterSpacing: '0.02em',
          }}>
            {title}
          </span>
        </div>

        {/* Metrics */}
        {metricRow('Collected This Month', dollars(data.collectedCents), 'collected')}
        {metricRow('Total Invoiced This Month', dollars(data.totalInvoicedCents), 'invoiced')}
        {!isSummary && metricRow('Discounted This Month', dollars(data.discountedCents), 'discounted')}
        {!isSummary && metricRow(`Next Month (Projected)`, dollars(data.nextMonthCents), 'nextMonth')}

        {/* Divider + secondary metric */}
        {!isSummary && (
          <>
            <div style={{
              height: 1,
              background: 'rgba(255,255,255,0.06)',
              margin: isLarge ? '8px 0' : '6px 0',
            }} />
            {metricRow('Scheduled Payments', dollars(data.scheduledPaymentsCents), 'scheduled', true)}
          </>
        )}
      </div>
    </div>
  )
}
