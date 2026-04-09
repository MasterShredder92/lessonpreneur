import { formatStarPrompt } from '../services/starContext'
import { appendPageContextToStarPrompt, starPageDisplayName } from './composePrompt'
import { loadStarGlobalContext } from './loadGlobalContext'
import type { StarUserScope } from './resolveScope'
import type { StarPageId } from './types'

/** One-shot: full system prompt for Students page AI (e.g. export insight). Uses same global loader as the modal. */
export async function buildStudentsPageStarSystemPrompt(
  scope: StarUserScope,
  studentsExportStatsBlock: string,
): Promise<string> {
  const raw = await loadStarGlobalContext(scope)
  const global = raw
    ? formatStarPrompt(raw, scope.effectiveRole)
    : 'Business context unavailable — answer from the students export block only.'
  return appendPageContextToStarPrompt(global, {
    pageId: 'students',
    displayName: starPageDisplayName('students'),
    body: studentsExportStatsBlock,
  })
}

/** Generic one-shot composer when you already have stats text and need global+page in one call. */
export async function buildStarSystemPromptWithPageBody(
  scope: StarUserScope,
  pageId: StarPageId,
  pageBody: string,
): Promise<string> {
  const raw = await loadStarGlobalContext(scope)
  const global = raw
    ? formatStarPrompt(raw, scope.effectiveRole)
    : 'Business context unavailable — answer only from the page block below.'
  return appendPageContextToStarPrompt(global, {
    pageId,
    displayName: starPageDisplayName(pageId),
    body: pageBody,
  })
}
