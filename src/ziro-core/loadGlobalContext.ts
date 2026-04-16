import { fetchZiroContext, type ZiroPromptContext } from '../services/ziroContext'
import { loadActiveSkillsContext } from './skillsContext'
import type { ZiroUserScope } from './resolveScope'

/** Merged prompt context: live JSONB snapshot + billing + active skills list. */
export type ZiroGlobalContext = ZiroPromptContext & { skillsBlock: string }

/** Live global Ziro payload: `get_ziro_context` + canonical billing snapshot for scope + active skills. */
export async function loadZiroGlobalContext(scope: ZiroUserScope): Promise<ZiroGlobalContext | null> {
  const [ctx, skillsBlock] = await Promise.all([
    fetchZiroContext(scope.tenantId, scope.effectiveRole, {
      billingLocationId: scope.billingLocationId,
    }),
    loadActiveSkillsContext(scope.tenantId),
  ])

  if (!ctx) return null
  return { ...ctx, skillsBlock }
}
