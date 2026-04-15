import { fetchStarContext, type StarPromptContext } from '../services/starContext'
import { loadActiveSkillsContext } from './skillsContext'
import type { ZiroUserScope } from './resolveScope'

/** Merged prompt context: live JSONB snapshot + billing + active skills list. */
export type ZiroGlobalContext = StarPromptContext & { skillsBlock: string }

/** Live global Ziro payload: `get_star_context` + canonical billing snapshot for scope + active skills. */
export async function loadZiroGlobalContext(scope: ZiroUserScope): Promise<ZiroGlobalContext | null> {
  const [ctx, skillsBlock] = await Promise.all([
    fetchStarContext(scope.tenantId, scope.effectiveRole, {
      billingLocationId: scope.billingLocationId,
    }),
    loadActiveSkillsContext(scope.tenantId),
  ])

  if (!ctx) return null
  return { ...ctx, skillsBlock }
}
