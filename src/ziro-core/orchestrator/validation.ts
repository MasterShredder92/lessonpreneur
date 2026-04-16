export const VAGUE_AGENT_NAMES = ['builder', 'helper', 'assistant', 'worker', 'bot'] as const

export const PURPOSE_OVERLAP_THRESHOLD = 0.5

export const OVERLAP_MIN_WORD_LENGTH = 3

/** Check if any existing agent overlaps with the given name/purpose. */
export function findOverlappingAgent(
  existingAgents: Array<{ id: string; name: string; purpose: string | null }>,
  newName: string,
  newPurpose: string,
): { id: string; name: string } | undefined {
  const nameLower = newName.toLowerCase()
  const purposeWords = new Set(
    newPurpose.toLowerCase().split(/\s+/).filter(w => w.length > OVERLAP_MIN_WORD_LENGTH),
  )
  return existingAgents.find(a => {
    if (a.name.toLowerCase() === nameLower) return true
    if (a.purpose && purposeWords.size > 0) {
      const existingWords = new Set(
        a.purpose.toLowerCase().split(/\s+/).filter(w => w.length > OVERLAP_MIN_WORD_LENGTH),
      )
      let matches = 0
      for (const w of purposeWords) {
        if (existingWords.has(w)) matches++
      }
      if (matches / purposeWords.size >= PURPOSE_OVERLAP_THRESHOLD) return true
    }
    return false
  })
}

