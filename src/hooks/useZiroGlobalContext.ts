import { useMemo } from 'react'
import { useQuery, useQueryClient, type UseQueryOptions } from '@tanstack/react-query'
import { useAuthContext } from '../app/AuthContext'
import { usePermissions } from './usePermissions'
import { formatZiroPrompt, type StarPromptContext } from '../services/starContext'
import type { BillingSnapshotData } from '../services/billingSnapshotQuery'
import { buildZiroUserScope, loadZiroGlobalContext, type ZiroUserScope } from '../star'
import { qk } from '../lib/queryKeys'

/** Global CRM snapshot for Ziro (`get_star_context` RPC + billing merge). */
export interface ZiroGlobalSnapshot {
  summary: string
  raw: StarPromptContext | null
  billingSnapshot: BillingSnapshotData | null
}

/** @deprecated Use ZiroGlobalSnapshot */
export type StarContext = ZiroGlobalSnapshot

const FALLBACK_SNAPSHOT: ZiroGlobalSnapshot = {
  summary: 'Business context unavailable — answer only from what the user tells you.',
  raw: null,
  billingSnapshot: null,
}

/**
 * Live tenant snapshot for Ziro. Pass `{ enabled: false }` to avoid prefetching on pages
 * that should not load the RPC until an explicit action (or open Ziro).
 */
export function useZiroGlobalContext(options?: { enabled?: boolean }) {
  const { tenantId } = useAuthContext()
  const { role: effectiveRole, isStudioDirector, locationIds: allowedLocationIds, canUseZiro } = usePermissions()
  // Hard gate: forbidden roles never trigger the RPC. The edge function and
  // RPC also enforce this — this is the client-side fail-closed.
  const enabledFlag = (options?.enabled ?? true) && canUseZiro

  const scope = useMemo(
    () =>
      buildZiroUserScope({
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
    retry: false,
    queryFn: async () => {
      if (!scope) {
        return FALLBACK_SNAPSHOT
      }
      try {
        const raw = await Promise.race([
          loadZiroGlobalContext(scope),
          new Promise<null>((_, reject) =>
            setTimeout(() => reject(new Error('Ziro snapshot timed out')), 12_000),
          ),
        ])
        if (!raw) {
          return FALLBACK_SNAPSHOT
        }
        const base = formatZiroPrompt(raw, scope.effectiveRole)
        const summary = raw.skillsBlock ? `${base}\n\n${raw.skillsBlock}` : base
        return {
          summary,
          raw,
          billingSnapshot: raw.billing_snapshot,
        }
      } catch (e) {
        console.warn('[Ziro] Snapshot load failed, degrading gracefully:', e)
        return FALLBACK_SNAPSHOT
      }
    },
  })
}

/** Prefetch snapshot for explicit user actions without enabling the global hook on mount. */
export async function ensureZiroGlobalSnapshot(
  qc: ReturnType<typeof useQueryClient>,
  scope: ZiroUserScope | null,
  queryKey: readonly unknown[],
): Promise<ZiroGlobalSnapshot> {
  return qc.fetchQuery({
    ...ziroSnapshotQueryOptions(scope, queryKey),
  })
}

export function ziroSnapshotQueryOptions(
  scope: ZiroUserScope | null,
  queryKey: readonly unknown[],
): Pick<UseQueryOptions<ZiroGlobalSnapshot>, 'queryKey' | 'queryFn' | 'staleTime'> {
  return {
    queryKey,
    staleTime: 2 * 60_000,
    queryFn: async () => {
      if (!scope) return FALLBACK_SNAPSHOT
      try {
        const raw = await Promise.race([
          loadZiroGlobalContext(scope),
          new Promise<null>((_, reject) =>
            setTimeout(() => reject(new Error('Ziro snapshot timed out')), 12_000),
          ),
        ])
        if (!raw) return FALLBACK_SNAPSHOT
        const base = formatZiroPrompt(raw, scope.effectiveRole)
        const summary = raw.skillsBlock ? `${base}\n\n${raw.skillsBlock}` : base
        return {
          summary,
          raw,
          billingSnapshot: raw.billing_snapshot,
        }
      } catch (e) {
        console.warn('[Ziro] Snapshot load failed:', e)
        return FALLBACK_SNAPSHOT
      }
    },
  }
}
