import { formatZiroPrompt } from '../services/starContext'
import { appendPageContextToZiroPrompt, ziroPageDisplayName } from './composePrompt'
import { loadZiroGlobalContext } from './loadGlobalContext'
import type { ZiroUserScope } from './resolveScope'
import type { ZiroPageId } from './types'

/** Combines formatted global prompt with skills block. */
function withSkills(globalPrompt: string, skillsBlock: string): string {
  if (!skillsBlock) return globalPrompt
  return `${globalPrompt}\n\n${skillsBlock}`
}

/** One-shot: full system prompt for Students page AI (e.g. export insight). Uses same global loader as the modal. */
export async function buildStudentsPageZiroSystemPrompt(
  scope: ZiroUserScope,
  studentsExportStatsBlock: string,
): Promise<string> {
  const raw = await loadZiroGlobalContext(scope)
  const global = raw
    ? withSkills(formatZiroPrompt(raw, scope.effectiveRole), raw.skillsBlock)
    : 'Business context unavailable — answer from the students export block only.'
  return appendPageContextToZiroPrompt(global, {
    pageId: 'students',
    displayName: ziroPageDisplayName('students'),
    body: studentsExportStatsBlock,
  })
}

/** Generic one-shot composer when you already have stats text and need global+page in one call. */
export async function buildZiroSystemPromptWithPageBody(
  scope: ZiroUserScope,
  pageId: ZiroPageId,
  pageBody: string,
): Promise<string> {
  const raw = await loadZiroGlobalContext(scope)
  const global = raw
    ? withSkills(formatZiroPrompt(raw, scope.effectiveRole), raw.skillsBlock)
    : 'Business context unavailable — answer only from the page block below.'
  return appendPageContextToZiroPrompt(global, {
    pageId,
    displayName: ziroPageDisplayName(pageId),
    body: pageBody,
  })
}
