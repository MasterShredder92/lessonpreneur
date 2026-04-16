import type React from 'react'
import { Check, XCircle } from 'lucide-react'
import type { Family } from '../../hooks/useFamilies'
import { toast } from '../shared/Toast'
import { getRateEdge, stripFamily } from './familyHelpers'

const PAYMENT_BADGE_STYLES: Record<string, { bg: string; color: string; border: string }> = {
  current: { bg: 'var(--success-12)', color: 'var(--color-success)', border: '1px solid var(--success-30)' },
  scheduled: { bg: 'var(--sky-10)', color: 'var(--color-sky)', border: '1px solid color-mix(in srgb, var(--color-sky) 30%, transparent)' },
  overdue: { bg: 'var(--danger-15)', color: 'var(--color-danger)', border: '1px solid var(--danger-30)' },
  paused: { bg: 'var(--white-4)', color: 'var(--text-muted)', border: 'var(--border-width) solid var(--white-8)' },
  no_invoice: { bg: 'var(--warning-12)', color: 'var(--color-warning)', border: '1px solid var(--warning-30)' },
  cancelled: { bg: 'var(--white-4)', color: 'var(--text-caption)', border: 'var(--border-width) solid var(--white-8)' },
}

const PAYMENT_BADGE_LABELS: Record<string, string> = {
  current: 'Current',
  scheduled: 'Scheduled',
  overdue: 'Overdue',
  paused: 'Paused',
  no_invoice: 'No Invoice',
  cancelled: 'Cancelled',
}

function PaymentBadge({ status, overdueAmount }: { status: string; overdueAmount?: string | null }) {
  const s = PAYMENT_BADGE_STYLES[status] ?? PAYMENT_BADGE_STYLES.current
  const label = PAYMENT_BADGE_LABELS[status] ?? 'Current'
  return (
    <span
      style={{
        fontSize: 9,
        fontWeight: 700,
        padding: '2px 7px',
        borderRadius: 100,
        background: s.bg,
        color: s.color,
        border: s.border,
      }}
    >
      {label}
      {status === 'overdue' && overdueAmount ? ` ${overdueAmount}` : ''}
    </span>
  )
}

function CopyText({ value, style }: { value: string | null | undefined; style?: React.CSSProperties }) {
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

export default function FamilyRosterRow({
  family: f,
  onClick,
  guideId,
}: {
  family: Family
  onClick: () => void
  guideId?: string
}) {
  const rateEdge = getRateEdge(f.rate_tier)
  const locColor = f.locationColor ?? 'var(--text-caption)'
  const isInactive = (f.billing_status ?? 'active') === 'cancelled'
  const activeStudents = (f.students ?? []).filter((s) => s.status === 'active')
  const studentNames = activeStudents
    .slice(0, 4)
    .map((s) => s.first_name)
    .join(', ')
  const studentInstruments = [...new Set(activeStudents.map((s) => s.instrument).filter(Boolean))]
    .slice(0, 4)
    .map((i) => i.charAt(0).toUpperCase() + i.slice(1))
    .join(', ')

  return (
    <div
      className="roster-row roster-row-family"
      onClick={onClick}
      data-guide-id={guideId}
      style={{
        display: 'grid',
        gridTemplateColumns:
          'minmax(140px,1.5fr) minmax(72px,0.55fr) minmax(160px,1.1fr) minmax(100px,0.75fr) minmax(200px,1.3fr) minmax(120px,0.85fr) minmax(100px,0.75fr) minmax(88px,0.65fr)',
        gap: '0 12px',
        alignItems: 'center',
        padding: '10px 14px',
        borderBottom: 'var(--border-width) solid var(--white-4)',
        cursor: 'pointer',
        fontSize: 12,
      }}
    >
      <div
        style={{
          borderLeft: `3px solid ${isInactive ? 'var(--text-caption)' : locColor}`,
          paddingLeft: 10,
          minWidth: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
          <span
            style={{
              fontWeight: 700,
              color: 'var(--text-secondary)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {stripFamily(f.name)}
          </span>
          {f.is_military && (
            <span
              style={{
                fontSize: 8,
                padding: '1px 5px',
                borderRadius: 4,
                background: 'var(--warning-15)',
                color: 'var(--color-warning)',
                border: '1px solid var(--warning-25)',
                fontWeight: 700,
                flexShrink: 0,
              }}
            >
              MIL
            </span>
          )}
        </div>
        {f.locationName && <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-caption)', marginTop: 2 }}>{f.locationName}</div>}
      </div>
      <div>
        <span
          style={{
            fontSize: 12,
            fontWeight: 800,
            padding: '2px 6px',
            borderRadius: 6,
            display: 'inline-block',
            background: isInactive ? 'var(--white-6)' : rateEdge.solid,
            color: isInactive ? 'var(--text-caption)' : 'var(--bg-base)',
          }}
        >
          ${f.monthlyTotalCents > 0 ? (f.monthlyTotalCents / 100).toFixed(0) : (f.rate_tier / 100).toFixed(0)}
          <span style={{ fontSize: 8, fontWeight: 600, opacity: 0.75 }}>/mo</span>
        </span>
      </div>
      <div style={{ color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>
        {f.primary_email ? (
          <CopyText
            value={f.primary_email}
            style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%' }}
          />
        ) : (
          '—'
        )}
      </div>
      <div style={{ color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {f.primary_phone ?? '—'}
      </div>
      <div style={{ color: 'var(--text-subtle)', lineHeight: 1.35, minWidth: 0 }}>
        <span style={{ fontWeight: 600 }}>{f.activeStudentCount}</span>
        {studentInstruments && <span style={{ color: 'var(--text-placard)' }}> · {studentInstruments}</span>}
        {studentNames && <span style={{ color: 'var(--text-placard)' }}> · {studentNames}</span>}
      </div>
      <div>
        <span
          style={{
            fontSize: 9,
            fontWeight: 700,
            padding: '2px 6px',
            borderRadius: 100,
            ...(f.card_last_four
              ? {
                  background: 'var(--success-12)',
                  color: 'var(--color-success)',
                  border: '1px solid var(--success-30)',
                }
              : {
                  background: 'var(--danger-10)',
                  color: 'var(--color-danger)',
                  border: '1px solid var(--danger-30)',
                }),
          }}
        >
          {f.card_last_four ? `${f.card_brand ?? 'Card'} ····${f.card_last_four}` : 'No card'}
        </span>
      </div>
      <div style={{ minWidth: 0 }}>
        <PaymentBadge status={f.paymentStatus} overdueAmount={f.overdueAmountDisplay} />
      </div>
      <div>
        {f.has_enrollment_agreement ? (
          <span
            style={{
              fontSize: 9,
              fontWeight: 700,
              padding: '2px 6px',
              borderRadius: 100,
              background: 'var(--success-12)',
              color: 'var(--color-success)',
              border: '1px solid var(--success-25)',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 3,
            }}
          >
            <Check size={8} /> Yes
          </span>
        ) : (
          <span
            style={{
              fontSize: 9,
              fontWeight: 700,
              padding: '2px 6px',
              borderRadius: 100,
              background: 'var(--danger-10)',
              color: 'var(--color-danger)',
              border: '1px solid var(--danger-30)',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 3,
            }}
          >
            <XCircle size={8} /> No
          </span>
        )}
      </div>
    </div>
  )
}

