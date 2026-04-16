import type { Family } from '../../../hooks/useFamilies'
import type React from 'react'

export function stripFamily(name: string | null | undefined): string {
  if (!name) return '---'
  return name.replace(/\s+family$/i, '').trim() || name
}

export function familyNeedsAttention(f: Family): boolean {
  if (!f.primary_email || !f.primary_phone || !f.square_customer_id) return true
  const active = (f.students ?? []).filter(s => s.status === 'active')
  return active.some(s => !s.teacher_id || !s.instrument)
}

export function formatDollars(cents: number | null | undefined): string {
  if (cents == null || cents === 0) return '$0.00'
  const abs = Math.abs(cents) / 100
  const formatted = abs.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
  return cents < 0 ? `-$${formatted}` : `$${formatted}`
}

const RATE_EDGE_COLORS: Record<number, { solid: string; bg: string }> = {
  4500: { solid: 'var(--color-success)', bg: 'var(--success-15)' }, // Full price — green
  4000: { solid: 'var(--color-warning)', bg: 'var(--warning-15)' }, // Discount — yellow
  3750: { solid: 'var(--color-danger)', bg: 'var(--danger-15)' }, // Deep discount — red
}

export function getRateEdge(rateTier: number) {
  return RATE_EDGE_COLORS[rateTier] ?? RATE_EDGE_COLORS[4500]
}

export const labelStyle: React.CSSProperties = {
  fontSize: 'var(--font-size-sm)',
  fontWeight: 'var(--font-weight-bold)',
  color: 'var(--text-muted)',
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
}

export const valueStyle: React.CSSProperties = {
  marginTop: 'var(--space-3xs)',
  fontSize: 'var(--font-size-lg)',
  color: 'var(--text-secondary)',
}

export const sectionLabelStyle: React.CSSProperties = {
  fontSize: 'var(--font-size-md)',
  fontWeight: 'var(--font-weight-bold)',
  color: 'var(--text-ghost)',
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  marginBottom: 10,
  paddingBottom: 'var(--space-md)',
  borderBottom: '1px solid var(--white-6)',
}

/** Text block for Ziro: single-family facts from loaded family detail (authoritative for this modal). */
export function familyOperatorBlockFromDetail(family: Family): string {
  return [
    `Family: ${family.name}`,
    `Parent: ${family.parent_first_name ?? ''} ${
      family.parent_last_name ?? family.parent_name ?? ''
    }`.trim(),
    `Location: ${family.locationName ?? 'Unknown'}`,
    `Status: ${family.billing_status}`,
    `Rate: $${(family.rate_tier / 100).toFixed(2)}/session, Monthly: $${(
      family.monthlyTotalCents / 100
    ).toFixed(2)}${family.rate_tier_override ? ' (override)' : ''}`,
    `Balance: ${formatDollars(family.balance)}`,
    family.overdue_balance_cents && family.overdue_balance_cents > 0
      ? `Overdue: ${formatDollars(family.overdue_balance_cents)}`
      : null,
    `Lifetime Paid: ${formatDollars(family.lifetime_paid_cents)}`,
    `Active Students: ${family.activeStudentCount}`,
    family.students
      .filter(s => s.status === 'active')
      .map(
        s =>
          `  - ${s.first_name} ${s.last_name}: ${s.instrument}, teacher: ${s.teacher_name}`,
      )
      .join('\n'),
    family.scheduling_notes ? `Scheduling Notes: ${family.scheduling_notes}` : null,
    family.is_military ? 'Military family' : null,
  ]
    .filter(Boolean)
    .join('\n')
}

