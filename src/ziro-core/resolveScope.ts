/**
 * Single place for Ziro user scope: tenant, effective role, and billing location alignment with Dashboard.
 */
export interface ZiroUserScopeInput {
  tenantId: string | null
  effectiveRole: string | null
  isStudioDirector: boolean
  allowedLocationIds: string[]
}

export interface ZiroUserScope {
  tenantId: string
  effectiveRole: string | null
  allowedLocationIds: string[]
  /** Matches `useBillingSnapshot(directorLocationId)` — first assigned location for studio directors. */
  billingLocationId: string | undefined
}

export function resolveZiroBillingLocationId(
  isStudioDirector: boolean,
  allowedLocationIds: string[],
): string | undefined {
  return isStudioDirector && allowedLocationIds.length > 0 ? allowedLocationIds[0] : undefined
}

export function buildZiroUserScope(input: ZiroUserScopeInput): ZiroUserScope | null {
  if (!input.tenantId) return null
  return {
    tenantId: input.tenantId,
    effectiveRole: input.effectiveRole,
    allowedLocationIds: input.allowedLocationIds ?? [],
    billingLocationId: resolveZiroBillingLocationId(input.isStudioDirector, input.allowedLocationIds ?? []),
  }
}
