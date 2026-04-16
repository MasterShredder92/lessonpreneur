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
    <span style={{ fontSize: 13, color: '#94A3B8' }}>
      <strong style={{ color: '#E0E0F4' }}>{countActive}</strong> Active
      <span style={{ margin: '0 6px', color: '#363656' }}>&middot;</span>
      <strong style={{ color: '#E0E0F4' }}>{countInactive}</strong> Inactive
      <span style={{ margin: '0 6px', color: '#363656' }}>&middot;</span>
      <strong style={{ color: '#E0E0F4' }}>{countTotal}</strong> Total
    </span>
  )
}

