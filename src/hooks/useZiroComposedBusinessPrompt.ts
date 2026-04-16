import { useMemo } from 'react'
import { appendPageContextToZiroPrompt, ziroPageDisplayName, type ZiroPageId } from '../ziro-core'
import { useZiroGlobalContext, type ZiroGlobalSnapshot } from './useZiroGlobalContext'

const ZIRO_BUSINESS_LOADING_PROMPT =
  '[ZIRO INTERNAL] School snapshot is still loading. Do not use scheduling tools or invent metrics. If the user sends a message, reply only: "School data is still loading — please wait a moment."'

export interface UseZiroComposedBusinessPromptOptions {
  pageId: ZiroPageId
  pageBody?: string | null
  pageDisplayName?: string
  overridePrompt?: string | null
  /**
   * When false, do not prefetch `get_ziro_context` until needed (e.g. family modal before "Ask Ziro" is opened).
   */
  enableGlobalSnapshot?: boolean
}

export interface ZiroComposedBusinessPrompt {
  systemPrompt: string
  raw: ZiroGlobalSnapshot['raw']
  billingSnapshot: ZiroGlobalSnapshot['billingSnapshot']
  globalLoading: boolean
  globalFetching: boolean
}

/**
 * Layer 1 (global live snapshot) + optional layer 2 (page adapter).
 */
export function useZiroComposedBusinessPrompt(
  options: UseZiroComposedBusinessPromptOptions,
): ZiroComposedBusinessPrompt {
  const global = useZiroGlobalContext({ enabled: options.enableGlobalSnapshot ?? true })

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

    if (global.isLoading && !global.data) {
      return {
        systemPrompt: ZIRO_BUSINESS_LOADING_PROMPT,
        raw: null,
        billingSnapshot: null,
        globalLoading: true,
        globalFetching: global.isFetching,
      }
    }

    const base =
      global.data?.summary?.trim() ||
      'Business context unavailable — answer only from what the user tells you.'

    const displayName = options.pageDisplayName ?? ziroPageDisplayName(options.pageId)
    const pageBody = options.pageBody?.trim()
    let systemPrompt =
      pageBody && pageBody.length > 0
        ? appendPageContextToZiroPrompt(base, {
            pageId: options.pageId,
            displayName,
            body: pageBody,
          })
        : base

    if (global.data?.isStale) {
      const staleWarning =
        '[ZIRO INTERNAL] Business snapshot may be outdated — some recent changes may not be reflected. Acknowledge this if the user asks about very recent changes.'
      systemPrompt = staleWarning + '\n\n' + systemPrompt
    }

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
    options.enableGlobalSnapshot,
  ])
}
