import { useMemo } from 'react'
import { useQuery, useQueryClient, type UseQueryOptions } from '@tanstack/react-query'
import { useAuthContext } from '../app/AuthContext'
import { usePermissions } from './usePermissions'
import { formatStarPrompt, type StarPromptContext } from '../services/starContext'
import type { BillingSnapshotData } from '../services/billingSnapshotQuery'
import { buildStarUserScope, loadStarGlobalContext, type StarUserScope } from '../star'
import { qk } from '../lib/queryKeys'

/** Global CRM snapshot for Ziro (`get_star_context` RPC + billing merge). */
export interface ZiroGlobalSnapshot {
  summary: string
  raw: StarPromptContext | null
  billingSnapshot: BillingSnapshotData | null
}

/** @deprecated Use ZiroGlobalSnapshot */
export type StarContext = ZiroGlobalSnapshot

/**
 * Live tenant snapshot for Ziro. Pass `{ enabled: false }` to avoid prefetching on pages
 * that should not load the RPC until an explicit action (or open Ziro).
 */
export function useZiroGlobalContext(options?: { enabled?: boolean }) {
  const { tenantId } = useAuthContext()
  const { role: effectiveRole, isStudioDirector, locationIds: allowedLocationIds } = usePermissions()
  const enabledFlag = options?.enabled ?? true

  const scope = useMemo(
    () =>
      buildStarUserScope({
        tenantId,
        effectiveRole,
        isStudioDirector,
        allowedLocationIds: allowedLocationIds ?? [],
      }),
    [tenantId, effectiveRole, isStudioDirector, allowedLocationIds],
  )

  const locationScopeKey = useMemo(() => {
    if (!allowedLocationIds?.length) return 'none'
    return [...allowedLocationIds].sort().join(',')
  }, [allowedLocationIds])

  const billingScopeKey = scope?.billingLocationId ?? 'all'

  const queryKey = qk.ziro.context(tenantId, effectiveRole ?? 'unknown', locationScopeKey, billingScopeKey)

  return useQuery<ZiroGlobalSnapshot>({
    queryKey,
    enabled: enabledFlag && !!scope,
    staleTime: 2 * 60_000,
    queryFn: async () => {
      if (!scope) {
        return {
          summary: 'Business context unavailable — answer only from what the user tells you.',
          raw: null,
          billingSnapshot: null,
        }
      }
      const raw = await loadStarGlobalContext(scope)
      if (!raw) {
        return {
          summary: 'Business context unavailable — answer only from what the user tells you.',
          raw: null,
          billingSnapshot: null,
        }
      }
      return {
        summary: formatStarPrompt(raw, scope.effectiveRole),
        raw,
        billingSnapshot: raw.billing_snapshot,
      }
    },
  })
}

/** Prefetch snapshot for explicit user actions without enabling the global hook on mount. */
export async function ensureZiroGlobalSnapshot(
  qc: ReturnType<typeof useQueryClient>,
  scope: StarUserScope | null,
  queryKey: readonly unknown[],
): Promise<ZiroGlobalSnapshot> {
  return qc.fetchQuery({
    ...ziroSnapshotQueryOptions(scope, queryKey),
  })
}

export function ziroSnapshotQueryOptions(
  scope: StarUserScope | null,
  queryKey: readonly unknown[],
): Pick<UseQueryOptions<ZiroGlobalSnapshot>, 'queryKey' | 'queryFn' | 'staleTime'> {
  return {
    queryKey,
    staleTime: 2 * 60_000,
    queryFn: async () => {
      if (!scope) {
        return {
          summary: 'Business context unavailable — answer only from what the user tells you.',
          raw: null,
          billingSnapshot: null,
        }
      }
      const raw = await loadStarGlobalContext(scope)
      if (!raw) {
        return {
          summary: 'Business context unavailable — answer only from what the user tells you.',
          raw: null,
          billingSnapshot: null,
        }
      }
      return {
        summary: formatStarPrompt(raw, scope.effectiveRole),
        raw,
        billingSnapshot: raw.billing_snapshot,
      }
    },
  }
}
