/**
 * Lightweight post-processing for Ziro assistant responses.
 *
 * The chat panel renders plain text (no markdown renderer), so raw markdown
 * artifacts look broken. This strips common markdown formatting the model
 * may emit despite system-prompt instructions, and collapses excessive
 * whitespace so responses feel tighter in the UI.
 */
export function cleanZiroResponseText(raw: string): string {
  let t = raw

  // Strip markdown headings → keep the text, drop the hashes
  // e.g. "### Revenue breakdown" → "Revenue breakdown"
  t = t.replace(/^#{1,4}\s+/gm, '')

  // Strip bold/italic markers → keep inner text
  // **bold** or __bold__ → bold
  t = t.replace(/(\*\*|__)(.*?)\1/g, '$2')
  // *italic* or _italic_ (single, only when surrounded by spaces or line boundaries)
  t = t.replace(/(?<=^|\s)\*([^*\n]+)\*(?=\s|$)/gm, '$1')

  // Strip horizontal rules (---, ***, ___)
  t = t.replace(/^[\s]*([-*_]){3,}\s*$/gm, '')

  // Collapse 3+ consecutive newlines → 2 (one blank line max)
  t = t.replace(/\n{3,}/g, '\n\n')

  // Trim leading/trailing whitespace
  t = t.trim()

  return t
}
