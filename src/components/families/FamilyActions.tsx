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
    <div
      style={{
        marginLeft: 'auto',
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--space-sm)',
      }}
    >
      {canCreate && (
        <button
          className="btn-primary"
          onClick={onAddFamily}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-sm)',
            fontSize: 'var(--font-size-md)',
            padding: 'var(--space-sm) var(--space-lg)',
          }}
        >
          <Plus size={14} /> Add New Family
        </button>
      )}
      {canExport && (
        <button className="btn-ghost" onClick={onExportCsv} style={{ fontSize: 'var(--font-size-sm)' }}>
          Export CSV
        </button>
      )}
      <FamiliesPageGuide />
      <ReportIssueButton />
    </div>
  )
}

