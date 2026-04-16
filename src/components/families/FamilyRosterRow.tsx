import type React from 'react'
import { Check, XCircle } from 'lucide-react'
import type { Family } from '../../hooks/useFamilies'
import { toast } from '../shared/Toast'
import { getRateEdge, stripFamily } from './familyHelpers'

const PAYMENT_BADGE_STYLES: Record<string, { bg: string; color: string; border: string }> = {
  current: { bg: 'rgba(74,222,128,0.12)', color: '#4ADE80', border: '1px solid rgba(74,222,128,0.3)' },
  scheduled: { bg: 'rgba(56,189,248,0.12)', color: '#38BDF8', border: '1px solid rgba(56,189,248,0.3)' },
  overdue: { bg: 'rgba(248,113,113,0.15)', color: '#F87171', border: '1px solid rgba(248,113,113,0.4)' },
  paused: { bg: 'rgba(148,163,184,0.12)', color: '#94A3B8', border: '1px solid rgba(148,163,184,0.3)' },
  no_invoice: { bg: 'rgba(255,184,0,0.12)', color: '#FFB800', border: '1px solid rgba(255,184,0,0.3)' },
  cancelled: { bg: 'rgba(96,96,136,0.12)', color: '#606088', border: '1px solid rgba(96,96,136,0.3)' },
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
  const locColor = f.locationColor ?? '#606088'
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
        borderBottom: '1px solid rgba(255,255,255,0.04)',
        cursor: 'pointer',
        fontSize: 12,
      }}
    >
      <div
        style={{
          borderLeft: `3px solid ${isInactive ? '#606088' : locColor}`,
          paddingLeft: 10,
          minWidth: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
          <span
            style={{
              fontWeight: 700,
              color: '#E0E0F4',
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
                background: 'rgba(255,184,0,0.15)',
                color: '#FFB800',
                border: '1px solid rgba(255,184,0,0.25)',
                fontWeight: 700,
                flexShrink: 0,
              }}
            >
              MIL
            </span>
          )}
        </div>
        {f.locationName && <div style={{ fontSize: 10, color: '#606088', marginTop: 2 }}>{f.locationName}</div>}
      </div>
      <div>
        <span
          style={{
            fontSize: 12,
            fontWeight: 800,
            padding: '2px 6px',
            borderRadius: 6,
            display: 'inline-block',
            background: isInactive ? 'rgba(255,255,255,0.06)' : rateEdge.solid,
            color: isInactive ? '#606088' : '#1A1A2E',
          }}
        >
          ${f.monthlyTotalCents > 0 ? (f.monthlyTotalCents / 100).toFixed(0) : (f.rate_tier / 100).toFixed(0)}
          <span style={{ fontSize: 8, fontWeight: 600, opacity: 0.75 }}>/mo</span>
        </span>
      </div>
      <div style={{ color: '#A0A0C8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>
        {f.primary_email ? (
          <CopyText
            value={f.primary_email}
            style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%' }}
          />
        ) : (
          '—'
        )}
      </div>
      <div style={{ color: '#A0A0C8', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {f.primary_phone ?? '—'}
      </div>
      <div style={{ color: '#C0C0E0', lineHeight: 1.35, minWidth: 0 }}>
        <span style={{ fontWeight: 600 }}>{f.activeStudentCount}</span>
        {studentInstruments && <span style={{ color: '#8080A8' }}> · {studentInstruments}</span>}
        {studentNames && <span style={{ color: '#8080A8' }}> · {studentNames}</span>}
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
                  background: 'rgba(74,222,128,0.12)',
                  color: '#4ADE80',
                  border: '1px solid rgba(74,222,128,0.3)',
                }
              : {
                  background: 'rgba(248,113,113,0.12)',
                  color: '#F87171',
                  border: '1px solid rgba(248,113,113,0.3)',
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
              background: 'rgba(34,197,94,0.12)',
              color: '#22C55E',
              border: '1px solid rgba(34,197,94,0.25)',
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
              background: 'rgba(239,68,68,0.12)',
              color: '#F87171',
              border: '1px solid rgba(239,68,68,0.3)',
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

