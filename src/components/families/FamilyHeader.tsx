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
      <h1 className="page-header-title-families">Families</h1>
      <FamilyStats countActive={countActive} countInactive={countInactive} countTotal={countTotal} />
      <FamilyActions canCreate={canCreate} canExport={canExport} onAddFamily={onAddFamily} onExportCsv={onExportCsv} />
    </div>
  )
}

