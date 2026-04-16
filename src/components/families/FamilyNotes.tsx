import FamilyInsightBar from './FamilyInsightBar'

export function FamilyNotes({
  billingIssues,
  noAutopay,
  newThisMonth,
  autoPayPercent,
  totalActive,
  onFixBilling,
  onViewAutopay,
}: {
  billingIssues: any
  noAutopay: any
  newThisMonth: any
  autoPayPercent: any
  totalActive: number
  onFixBilling: () => void
  onViewAutopay: () => void
}) {
  return (
    <FamilyInsightBar
      billingIssues={billingIssues}
      noAutopay={noAutopay}
      newThisMonth={newThisMonth}
      autoPayPercent={autoPayPercent}
      totalActive={totalActive}
      onFixBilling={onFixBilling}
      onViewAutopay={onViewAutopay}
    />
  )
}

