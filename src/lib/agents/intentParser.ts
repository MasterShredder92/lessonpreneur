import type { AgentAction } from './agents'
import type { AgentPersonality } from './personalityTypes'
import { longestPageBehaviorPrefix } from './reactionUtils'

export type ParseIntentContext = {
  pathname: string
  personality: AgentPersonality
  actions: AgentAction[]
}

export type ParseIntentResult = {
  actionLabel: string | null
  confidence: number
}

/** Minimum best similarity to treat intent as recognized (0–1). */
export const INTENT_PARSE_CONFIDENCE_THRESHOLD = 0.45

type CueSource = 'action-label' | 'action-desc' | 'example' | 'page-behavior'

type ScoredCue = {
  cue: string
  source: CueSource
  /** Set for action-derived cues; inferred later for persona/route cues when appropriate. */
  actionLabel: string | null
}

function normalizeText(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0
  const m = a.length
  const n = b.length
  if (!m) return n
  if (!n) return m
  const row = new Array<number>(n + 1)
  for (let j = 0; j <= n; j++) row[j] = j
  for (let i = 1; i <= m; i++) {
    let prev = row[0]!
    row[0] = i
    for (let j = 1; j <= n; j++) {
      const tmp = row[j]!
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      row[j] = Math.min(row[j - 1]! + 1, row[j]! + 1, prev + cost)
      prev = tmp
    }
  }
  return row[n]!
}

function wordJaccard(a: string, b: string): number {
  const wa = new Set(a.split(/\s+/).filter(Boolean))
  const wb = new Set(b.split(/\s+/).filter(Boolean))
  if (!wa.size && !wb.size) return 1
  if (!wa.size || !wb.size) return 0
  let inter = 0
  for (const w of wa) if (wb.has(w)) inter++
  return inter / (wa.size + wb.size - inter)
}

/**
 * Similarity in [0, 1]: substring hits, word overlap, and edit distance on normalized text.
 */
function textSimilarity(rawA: string, rawB: string): number {
  const a = normalizeText(rawA)
  const b = normalizeText(rawB)
  if (!a.length || !b.length) return 0
  if (a === b) return 1

  const short = a.length <= b.length ? a : b
  const long = a.length <= b.length ? b : a
  if (short.length >= 3 && long.includes(short)) {
    return Math.min(1, 0.82 + 0.18 * (short.length / long.length))
  }

  const j = wordJaccard(a, b)
  const maxLen = Math.max(a.length, b.length)
  const dist = levenshtein(a, b)
  const lev = 1 - dist / maxLen

  return Math.min(1, Math.max(j * 0.95, lev))
}

function pageBehaviorCues(raw: string): string[] {
  const trimmed = raw.trim()
  if (!trimmed) return []

  if (trimmed.includes('||')) {
    const [guidance, panel] = trimmed.split('||', 2)
    const out: string[] = []
    const g = guidance!.trim()
    const p = panel!.trim()
    if (g) out.push(g)
    if (p) out.push(...p.split('|').map((s) => s.trim()).filter(Boolean))
    return out
  }

  if (trimmed.includes('|')) {
    return trimmed.split('|').map((s) => s.trim()).filter(Boolean)
  }

  return [trimmed]
}

function buildCues(pathname: string, personality: AgentPersonality, actions: AgentAction[]): ScoredCue[] {
  const cues: ScoredCue[] = []

  for (const action of actions) {
    cues.push({ cue: action.label, source: 'action-label', actionLabel: action.label })
    if (action.description?.trim()) {
      cues.push({ cue: action.description, source: 'action-desc', actionLabel: action.label })
    }
  }

  for (const ex of personality.exampleMessages) {
    if (ex.trim()) cues.push({ cue: ex, source: 'example', actionLabel: null })
  }

  const prefix = longestPageBehaviorPrefix(pathname, Object.keys(personality.pageBehaviors))
  if (prefix) {
    const raw = personality.pageBehaviors[prefix]
    if (raw) {
      for (const chunk of pageBehaviorCues(raw)) {
        cues.push({ cue: chunk, source: 'page-behavior', actionLabel: null })
      }
    }
  }

  return cues
}

function bestActionMatchForUser(userNorm: string, actions: AgentAction[]): { label: string; score: number } | null {
  if (!actions.length) return null
  let bestLabel = actions[0]!.label
  let best = 0
  for (const a of actions) {
    const s = Math.max(textSimilarity(userNorm, a.label), textSimilarity(userNorm, a.description ?? ''))
    if (s > best) {
      best = s
      bestLabel = a.label
    }
  }
  return { label: bestLabel, score: best }
}

function sourcePriority(s: CueSource): number {
  switch (s) {
    case 'action-label':
      return 4
    case 'action-desc':
      return 3
    case 'page-behavior':
      return 2
    case 'example':
      return 1
    default:
      return 0
  }
}

/**
 * Map natural language to the best-matching panel action label for the active agent.
 *
 * Fuzzy match sources: each action's `label` / `description`, `personality.exampleMessages`,
 * and `pageBehaviors` text for the longest pathname prefix (including guidance and pipe-separated lines).
 *
 * @param text - raw user text
 * @param context - current route and agent persona + actions (typically the active agent panel)
 */
export function parseIntent(text: string, context: ParseIntentContext): ParseIntentResult {
  const userNorm = normalizeText(text)
  if (!userNorm) return { actionLabel: null, confidence: 0 }

  const { pathname, personality, actions } = context
  const cues = buildCues(pathname, personality, actions)

  let bestScore = 0
  let best: ScoredCue | null = null

  for (const c of cues) {
    const score = textSimilarity(userNorm, c.cue)
    if (
      score > bestScore ||
      (score === bestScore &&
        best &&
        (sourcePriority(c.source) > sourcePriority(best.source) ||
          (sourcePriority(c.source) === sourcePriority(best.source) && c.cue.length > best.cue.length)))
    ) {
      bestScore = score
      best = c
    }
  }

  if (!best || bestScore < INTENT_PARSE_CONFIDENCE_THRESHOLD) {
    return { actionLabel: null, confidence: bestScore }
  }

  if (best.source === 'action-label' || best.source === 'action-desc') {
    return { actionLabel: best.actionLabel, confidence: bestScore }
  }

  const bridged = bestActionMatchForUser(userNorm, actions)
  const bridgeFloor = INTENT_PARSE_CONFIDENCE_THRESHOLD * 0.72
  if (!bridged || bridged.score < bridgeFloor) {
    return { actionLabel: null, confidence: bestScore }
  }

  return { actionLabel: bridged.label, confidence: bestScore }
}
