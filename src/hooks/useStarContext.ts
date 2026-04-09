import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useAuthContext } from '../app/AuthContext'
import { usePermissions } from './usePermissions'
import { formatStarPrompt, type StarPromptContext } from '../services/starContext'
import type { BillingSnapshotData } from '../services/billingSnapshotQuery'
import { buildStarUserScope, loadStarGlobalContext } from '../star'
import { qk } from '../lib/queryKeys'

/**
 * Global Star context only (layer 1): live `get_star_context` + billing snapshot for the current user scope.
 * Page-specific prompts should compose via `useStarComposedBusinessPrompt` or `appendPageContextToStarPrompt`.
 */
export interface StarContext {
  summary: string
  raw: StarPromptContext | null
  billingSnapshot: BillingSnapshotData | null
}

export function useStarGlobalContext() {
  const { tenantId } = useAuthContext()
  const { role: effectiveRole, isStudioDirector, locationIds: allowedLocationIds } = usePermissions()

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

  return useQuery<StarContext>({
    queryKey: qk.star.context(tenantId, effectiveRole ?? 'unknown', locationScopeKey, billingScopeKey),
    enabled: !!scope,
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

/** @deprecated Prefer `useStarGlobalContext` — name reflects “global layer only”. */
export const useStarContext = useStarGlobalContext
