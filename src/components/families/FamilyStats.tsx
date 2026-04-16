export function FamilyStats({
  countActive,
  countInactive,
  countTotal,
}: {
  countActive: number
  countInactive: number
  countTotal: number
}) {
  return (
    <span style={{ fontSize: 'var(--font-size-md)', color: 'var(--color-secondary)' }}>
      <strong style={{ color: 'var(--text-secondary)' }}>{countActive}</strong> Active
      <span style={{ margin: '0 var(--space-sm)', color: 'var(--text-ghost)' }}>&middot;</span>
      <strong style={{ color: 'var(--text-secondary)' }}>{countInactive}</strong> Inactive
      <span style={{ margin: '0 var(--space-sm)', color: 'var(--text-ghost)' }}>&middot;</span>
      <strong style={{ color: 'var(--text-secondary)' }}>{countTotal}</strong> Total
    </span>
  )
}

