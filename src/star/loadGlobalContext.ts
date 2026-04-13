import { fetchStarContext, type StarPromptContext } from '../services/starContext'
import { loadActiveSkillsContext } from './skillsContext'
import type { StarUserScope } from './resolveScope'

/** Merged prompt context: live JSONB snapshot + billing + active skills list. */
export type StarGlobalContext = StarPromptContext & { skillsBlock: string }

/** Live global Star payload: `get_star_context` + canonical billing snapshot for scope + active skills. */
export async function loadStarGlobalContext(scope: StarUserScope): Promise<StarGlobalContext | null> {
  const [ctx, skillsBlock] = await Promise.all([
    fetchStarContext(scope.tenantId, scope.effectiveRole, {
      billingLocationId: scope.billingLocationId,
    }),
    loadActiveSkillsContext(scope.tenantId),
  ])

  if (!ctx) return null
  return { ...ctx, skillsBlock }
}
