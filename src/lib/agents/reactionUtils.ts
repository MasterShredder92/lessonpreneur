/** Longest matching `pageBehaviors` key for `pathname`. */
export function longestPageBehaviorPrefix(pathname: string, keys: string[]): string | null {
  let best: string | null = null
  for (const k of keys) {
    if (pathname.startsWith(k) && (!best || k.length > best.length)) best = k
  }
  return best
}

/**
 * Panel copy lives after `||` (guidance before it is ignored for reactions).
 * If there is no `||` but the string contains `|`, the whole string is treated as pipe-separated reactions.
 */
export function panelReactionsFromBehavior(raw: string): string[] | null {
  let panel: string
  if (raw.includes('||')) {
    panel = raw.split('||', 2)[1]!.trim()
  } else if (raw.includes('|')) {
    panel = raw.trim()
  } else {
    return null
  }
  const parts = panel.split('|').map(s => s.trim()).filter(Boolean)
  return parts.length ? parts : null
}

export function pickReactionIndex(seed: string, len: number): number {
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0
  return Math.abs(h) % len
}
