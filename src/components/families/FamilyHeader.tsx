import { FamilyActions } from './FamilyActions'
import { FamilyStats } from './FamilyStats'

export function FamilyHeader({
  countActive,
  countInactive,
  countTotal,
  canCreate,
  canExport,
  onAddFamily,
  onExportCsv,
}: {
  countActive: number
  countInactive: number
  countTotal: number
  canCreate: boolean
  canExport: boolean
  onAddFamily: () => void
  onExportCsv: () => void
}) {
  return (
    <div className="page-header">
      <h1 style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 28, letterSpacing: '0.5px', marginRight: 16 }}>Families</h1>
      <FamilyStats countActive={countActive} countInactive={countInactive} countTotal={countTotal} />
      <FamilyActions canCreate={canCreate} canExport={canExport} onAddFamily={onAddFamily} onExportCsv={onExportCsv} />
    </div>
  )
}

