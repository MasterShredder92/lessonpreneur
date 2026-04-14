/**
 * SPEED → Cursor handoff — Phase 1
 *
 * Phase 1: generate the right prompt, copy to clipboard, UI tells user to paste in Cursor.
 * Phase 2 (deferred): optional local bridge / one-click send — add alongside this module without
 * rewriting selection or generation; extend `runPhase1CursorHandoff` or add `runPhase2BridgeSend`.
 */

import {
  generateFixPrompts,
  type PerformanceAlert,
  type FixPrompt,
  type AlertType,
} from './alerts'

/** Reliable help link (no local path hacks). */
export const CURSOR_HANDOFF_HELP_URL = 'https://cursor.com/docs'

// ─── Clipboard (shared by UI copy buttons) ───────────────────────────────────

export async function copyTextToClipboard(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text)
    return
  } catch {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    document.execCommand('copy')
    document.body.removeChild(ta)
  }
}

// ─── Prompt routing (which generated prompt to hand off) ─────────────────────

/**
 * Pick the single best prompt for Cursor from existing SPEED generators.
 * - Vitals → frontend-oriented prompt when present
 * - Slow query / rate → SQL-oriented prompt when present
 * - Otherwise first prompt in the list
 */
export function selectPrimaryHandoffPrompt(alert: PerformanceAlert): FixPrompt {
  const prompts = generateFixPrompts(alert)
  if (!prompts.length) {
    return { category: 'fix', label: 'Copy Fix Prompt', prompt: '' }
  }

  const pick = (category: FixPrompt['category']) => prompts.find((p) => p.category === category)

  const t = alert.alert_type as AlertType
  if (t === 'slow_query') return pick('sql') ?? pick('fix') ?? prompts[0]
  if (t === 'high_slow_query_rate') return pick('sql') ?? pick('fix') ?? prompts[0]
  if (t === 'slow_lcp' || t === 'slow_fcp' || t === 'slow_inp' || t === 'high_cls') {
    return pick('frontend') ?? pick('fix') ?? prompts[0]
  }
  return pick('fix') ?? prompts[0]
}

// ─── Phase 1 handoff action (copy only; no bridge) ───────────────────────────

export interface Phase1HandoffResult {
  /** Prompt that was copied */
  prompt: FixPrompt
}

/**
 * Phase 1 handoff: select primary prompt for this alert and copy to clipboard.
 * Does not open Cursor or any local app (Phase 2 only).
 */
export async function runPhase1CursorHandoff(alert: PerformanceAlert): Promise<Phase1HandoffResult> {
  const prompt = selectPrimaryHandoffPrompt(alert)
  if (!prompt.prompt?.trim()) {
    throw new Error('No prompt content generated for this alert.')
  }
  await copyTextToClipboard(prompt.prompt)
  return { prompt }
}
