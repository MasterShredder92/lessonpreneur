import { useMemo } from 'react'
import { appendPageContextToStarPrompt, starPageDisplayName, type StarPageId } from '../star'
import { useStarGlobalContext, type StarContext } from './useStarContext'

const STAR_BUSINESS_LOADING_PROMPT =
  '[STAR INTERNAL] School snapshot is still loading. Do not use scheduling tools or invent metrics. If the user sends a message, reply only: "School data is still loading — please wait a moment."'

export interface UseStarComposedBusinessPromptOptions {
  pageId: StarPageId
  /** Row-level or page export text; omitted or empty → global-only prompt. */
  pageBody?: string | null
  /** Override display name in the PAGE CONTEXT header. */
  pageDisplayName?: string
  /**
   * When set, this string becomes the entire system prompt (e.g. sub-resource still loading).
   * Matches prior Family modal behavior when detail is not ready.
   */
  overridePrompt?: string | null
}

export interface StarComposedBusinessPrompt {
  systemPrompt: string
  raw: StarContext['raw']
  billingSnapshot: StarContext['billingSnapshot']
  globalLoading: boolean
  globalFetching: boolean
}

/**
 * Layer 1 (global live snapshot) + optional layer 2 (page adapter).
 * Use from Family detail, future Billing/Lead panels, etc.
 */
export function useStarComposedBusinessPrompt(
  options: UseStarComposedBusinessPromptOptions,
): StarComposedBusinessPrompt {
  const global = useStarGlobalContext()

  return useMemo(() => {
    if (options.overridePrompt != null && options.overridePrompt !== '') {
      return {
        systemPrompt: options.overridePrompt,
        raw: global.data?.raw ?? null,
        billingSnapshot: global.data?.billingSnapshot ?? null,
        globalLoading: global.isLoading,
        globalFetching: global.isFetching,
      }
    }

    const loading = global.isLoading || global.isFetching
    if (loading) {
      return {
        systemPrompt: STAR_BUSINESS_LOADING_PROMPT,
        raw: global.data?.raw ?? null,
        billingSnapshot: global.data?.billingSnapshot ?? null,
        globalLoading: true,
        globalFetching: global.isFetching,
      }
    }

    const base =
      global.data?.summary?.trim() ||
      'Business context unavailable — answer only from what the user tells you.'

    const displayName = options.pageDisplayName ?? starPageDisplayName(options.pageId)
    const pageBody = options.pageBody?.trim()
    const systemPrompt =
      pageBody && pageBody.length > 0
        ? appendPageContextToStarPrompt(base, {
            pageId: options.pageId,
            displayName,
            body: pageBody,
          })
        : base

    return {
      systemPrompt,
      raw: global.data?.raw ?? null,
      billingSnapshot: global.data?.billingSnapshot ?? null,
      globalLoading: false,
      globalFetching: false,
    }
  }, [
    global.data,
    global.isLoading,
    global.isFetching,
    options.overridePrompt,
    options.pageBody,
    options.pageId,
    options.pageDisplayName,
  ])
}
