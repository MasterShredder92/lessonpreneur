import { fetchStarContext, type StarPromptContext } from '../services/starContext'
import type { StarUserScope } from './resolveScope'

/** Live global Star payload: `get_star_context` + canonical billing snapshot for scope. */
export async function loadStarGlobalContext(scope: StarUserScope): Promise<StarPromptContext | null> {
  return fetchStarContext(scope.tenantId, scope.effectiveRole, {
    billingLocationId: scope.billingLocationId,
  })
}
