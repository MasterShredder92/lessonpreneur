/**
 * Single place for Star user scope: tenant, effective role, and billing location alignment with Dashboard.
 */
export interface StarUserScopeInput {
  tenantId: string | null
  effectiveRole: string | null
  isStudioDirector: boolean
  allowedLocationIds: string[]
}

export interface StarUserScope {
  tenantId: string
  effectiveRole: string | null
  allowedLocationIds: string[]
  /** Matches `useBillingSnapshot(directorLocationId)` — first assigned location for studio directors. */
  billingLocationId: string | undefined
}

export function resolveStarBillingLocationId(
  isStudioDirector: boolean,
  allowedLocationIds: string[],
): string | undefined {
  return isStudioDirector && allowedLocationIds.length > 0 ? allowedLocationIds[0] : undefined
}

export function buildStarUserScope(input: StarUserScopeInput): StarUserScope | null {
  if (!input.tenantId) return null
  return {
    tenantId: input.tenantId,
    effectiveRole: input.effectiveRole,
    allowedLocationIds: input.allowedLocationIds ?? [],
    billingLocationId: resolveStarBillingLocationId(input.isStudioDirector, input.allowedLocationIds ?? []),
  }
}
