import { useQuery } from '@tanstack/react-query'
import { useAuthContext } from '../app/AuthContext'
import { getMonthStart } from './useBillingPage'
import {
  fetchBillingSnapshotData,
  type BillingSnapshotData,
} from '../services/billingSnapshotQuery'
import { qk } from '../lib/queryKeys'

export type { BillingSnapshotData }

// ══════════════════════════════════════════
// HOOK — queries square_invoices for 5 metrics
// locationId: LP location UUID (optional — omit for all-location aggregate)
// ══════════════════════════════════════════

export function useBillingSnapshot(locationId?: string) {
  const { tenantId, profile } = useAuthContext()
  const monthStart = getMonthStart()
  const locKey = locationId || 'all'

  return useQuery<BillingSnapshotData>({
    queryKey: [...qk.billing.snapshot, tenantId, monthStart, locKey],
    enabled: !!tenantId && profile?.role !== 'teacher' && profile?.role !== 'student',
    staleTime: 60_000,
    queryFn: () => fetchBillingSnapshotData(tenantId!, locationId),
  })
}
