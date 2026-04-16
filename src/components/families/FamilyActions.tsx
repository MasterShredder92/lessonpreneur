import { Plus } from 'lucide-react'

import FamiliesPageGuide from '../admin/FamiliesPageGuide'
import ReportIssueButton from '../shared/ReportIssueButton'

export function FamilyActions({
  canCreate,
  canExport,
  onAddFamily,
  onExportCsv,
}: {
  canCreate: boolean
  canExport: boolean
  onAddFamily: () => void
  onExportCsv: () => void
}) {
  return (
    <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
      {canCreate && (
        <button className="btn-primary" onClick={onAddFamily} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, padding: '8px 14px' }}>
          <Plus size={14} /> Add New Family
        </button>
      )}
      {canExport && (
        <button className="btn-ghost" onClick={onExportCsv} style={{ fontSize: 11 }}>Export CSV</button>
      )}
      <FamiliesPageGuide />
      <ReportIssueButton />
    </div>
  )
}

