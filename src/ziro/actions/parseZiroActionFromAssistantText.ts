import type { ZiroActionId } from './executeZiroAction'

const MARKER = '\nZIRO_ACTION '
const PREFIX = 'ZIRO_ACTION '

const KNOWN: ZiroActionId[] = [
  'crm.navigate',
  'crm.audit_ping',
  'crm.reassign_students',
  'crm.move_schedule_sessions',
]

function isZiroActionId(s: string): s is ZiroActionId {
  return (KNOWN as string[]).includes(s)
}

/**
 * Strips optional machine-readable action lines from assistant replies.
 * Format (must be its own line at the end): `ZIRO_ACTION crm.navigate {"path":"/admin/leads"}`
 */
export function parseZiroActionFromAssistantText(full: string): {
  displayText: string
  action: { actionId: ZiroActionId; payload: unknown } | null
} {
  let idx = full.lastIndexOf(MARKER)
  let head: string
  let tail: string
  if (idx === -1 && full.trimStart().startsWith(PREFIX)) {
    head = ''
    tail = full.trim().slice(PREFIX.length).trim()
  } else if (idx === -1) {
    return { displayText: full, action: null }
  } else {
    head = full.slice(0, idx).trimEnd()
    tail = full.slice(idx + MARKER.length).trim()
  }
  const space = tail.indexOf(' ')
  if (space === -1) return { displayText: full, action: null }

  const actionIdRaw = tail.slice(0, space).trim()
  const jsonStr = tail.slice(space + 1).trim()
  if (!isZiroActionId(actionIdRaw)) return { displayText: full, action: null }

  try {
    const payload = JSON.parse(jsonStr) as unknown
    return { displayText: head, action: { actionId: actionIdRaw, payload } }
  } catch {
    return { displayText: full, action: null }
  }
}
