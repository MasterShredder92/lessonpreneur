/**
 * Lightweight response-policy enforcement for Ziro.
 *
 * Runs AFTER `cleanZiroResponseText` (works on clean plain text)
 * and BEFORE `transformBusinessAssistantText` (ZIRO_ACTION lines
 * are still present but excluded from content analysis).
 *
 * This is NOT NLP. It is simple heuristics that catch the most
 * common failure modes: responses that are too long, responses
 * that dump data instead of answering, and responses that skip
 * a useful follow-up question on broad queries.
 */

const ZIRO_ACTION_LINE = /\nZIRO_ACTION /

// ── Query classification ──────────────────────────────────────

/** Words/phrases that signal the user wants a specific, narrow fact. */
const SPECIFIC_SIGNALS = [
  /^how many\b/i,
  /^who is\b/i,
  /^what is\b/i,
  /^what's\b/i,
  /^when\b/i,
  /^which\b/i,
  /^is \w+/i,
  /^does\b/i,
  /^did\b/i,
  /^can you (show|find|look up|check)\b/i,
  /^show me\b/i,
  /^look up\b/i,
  /\b(name|phone|email|rate|instrument|teacher|location)\s*(\?|$)/i,
]

/** Words/phrases that signal a broad/exploratory question. */
const BROAD_SIGNALS = [
  /^how('s| is| are) (the |my |our )?(school|business|everything)/i,
  /^what('s| is) (going on|happening|the (status|state|situation))/i,
  /^give me (a |an |the )?(overview|summary|update|pulse|rundown|snapshot)/i,
  /^(update|brief|catch) me/i,
  /^how are (we|things)\b/i,
  /^what should (i|we)\b/i,
  /^anything (i|we) should\b/i,
  /^what do (i|we) need to\b/i,
]

/** Phrases that signal the user explicitly wants detail. */
const DETAIL_SIGNALS = [
  /\b(full|detailed|complete|entire)\s+(breakdown|report|list|summary|overview)\b/i,
  /\blist (all|every|each)\b/i,
  /\bbreak (it|that|this) down\b/i,
  /\bshow (me )?(all|every|each)\b/i,
  /\bgive me (all|every|the details)\b/i,
  /\bin detail\b/i,
  /\bexpand\b/i,
  /\bmore detail/i,
  /\btell me more\b/i,
  /\bgo deeper\b/i,
]

export type QueryIntent = 'specific' | 'broad' | 'detail'

export function classifyQuery(question: string): QueryIntent {
  const q = question.trim()
  if (DETAIL_SIGNALS.some((r) => r.test(q))) return 'detail'
  if (BROAD_SIGNALS.some((r) => r.test(q))) return 'broad'
  if (SPECIFIC_SIGNALS.some((r) => r.test(q))) return 'specific'
  // Default: if the question is short (≤8 words), likely specific.
  // If longer, lean broad.
  return q.split(/\s+/).length <= 8 ? 'specific' : 'broad'
}

// ── Response enforcement ──────────────────────────────────────

/** Split response into content body and any trailing ZIRO_ACTION line. */
function splitAction(text: string): { body: string; actionTail: string } {
  const m = text.match(ZIRO_ACTION_LINE)
  if (!m || m.index == null) return { body: text, actionTail: '' }
  return {
    body: text.slice(0, m.index).trimEnd(),
    actionTail: text.slice(m.index),
  }
}

/** Count double-newline-separated sections (paragraphs/blocks). */
function countBlocks(text: string): number {
  return text.split(/\n\n+/).filter((b) => b.trim()).length
}

/** Does the text already end with a question? */
function endsWithQuestion(text: string): boolean {
  // Check last non-empty line
  const lines = text.trim().split('\n').filter((l) => l.trim())
  if (!lines.length) return false
  return lines[lines.length - 1].trimEnd().endsWith('?')
}

/** Trim to the first N paragraph blocks, preserving full blocks. */
function trimToBlocks(text: string, maxBlocks: number): string {
  const blocks = text.split(/\n\n+/).filter((b) => b.trim())
  if (blocks.length <= maxBlocks) return text
  return blocks.slice(0, maxBlocks).join('\n\n')
}

/**
 * Enforce Ziro's response policy based on user intent.
 *
 * - `specific`: if the response is already short, pass through.
 *   If it ballooned, trim to first 2 blocks.
 * - `broad`: trim to first 2 blocks, ensure it ends with a
 *   follow-up question.
 * - `detail`: pass through untouched (user asked for depth).
 */
export function enforceZiroResponsePolicy(
  responseText: string,
  intent: QueryIntent,
): string {
  // Detail mode: user explicitly asked for depth — let it through
  if (intent === 'detail') return responseText

  const { body, actionTail } = splitAction(responseText)
  const blocks = countBlocks(body)

  if (intent === 'specific') {
    // Specific questions should be tight. If model stayed under
    // 4 blocks, trust it (the 4th is often a useful follow-up
    // question from the model). Over 4 = it over-explained.
    if (blocks <= 4) return responseText
    const trimmed = trimToBlocks(body, 3)
    return trimmed + actionTail
  }

  // Broad: keep first 2 blocks, ensure follow-up question exists.
  let shaped = blocks > 2 ? trimToBlocks(body, 2) : body

  if (!endsWithQuestion(shaped)) {
    shaped += '\n\nWant me to break that down further, or zoom into a specific area?'
  }

  return shaped + actionTail
}
