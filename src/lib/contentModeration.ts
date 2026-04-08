/**
 * Content moderation for filenames and teacher notes.
 * Client-side fast check + server-side full check.
 */
import { EDGE_FUNCTIONS } from './config'

// Basic blocked words — client-side fast check (catches obvious stuff)
const BASIC_BLOCKED = [
  'fuck','shit','bitch','dick','cock','pussy','cunt','porn','xxx',
  'nude','naked','rape','molest','pedo','nigger','faggot','retard',
]

/**
 * Normalize text for profanity detection.
 * Handles leet speak, special characters, spacing tricks.
 */
function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/0/g, 'o')
    .replace(/1/g, 'i')
    .replace(/3/g, 'e')
    .replace(/4/g, 'a')
    .replace(/5/g, 's')
    .replace(/\$/g, 's')
    .replace(/@/g, 'a')
    .replace(/\*/g, '')
    .replace(/[^a-z]/g, '')
}

/**
 * Check a filename for profanity. Returns ok:true or ok:false with reason.
 */
export function checkFilename(name: string): { ok: boolean; reason?: string } {
  const normalized = normalize(name)
  for (const word of BASIC_BLOCKED) {
    if (normalized.includes(word)) {
      return { ok: false, reason: 'File name contains inappropriate language. Please rename the file and try again.' }
    }
  }
  return { ok: true }
}

/**
 * Check note text for profanity. Checks each word AND substrings.
 * Returns: { ok: true } or { ok: false, severity: 'block'|'flag', reason, word }
 */
export function checkNoteText(text: string): { ok: boolean; severity?: 'block' | 'flag'; reason?: string; word?: string } {
  const normalizedFull = normalize(text)
  for (const word of BASIC_BLOCKED) {
    if (normalizedFull.includes(word)) {
      return {
        ok: false,
        severity: 'block',
        reason: 'Your note contains language that can\'t be saved. Please revise.',
        word,
      }
    }
  }
  return { ok: true }
}

/**
 * Server-side moderation check via edge function.
 * Checks against the full content_moderation_words table.
 */
export async function serverModerateContent(
  content: string,
  type: 'filename' | 'note',
  token: string
): Promise<{ approved: boolean; severity?: string; reason?: string; word?: string }> {
  try {
    const res = await fetch(
      EDGE_FUNCTIONS.moderateContent,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ content, type }),
      }
    )
    if (!res.ok) return { approved: true } // fail open on server error
    return await res.json()
  } catch {
    return { approved: true } // fail open
  }
}
