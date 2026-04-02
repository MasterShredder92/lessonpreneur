/**
 * Robust CSV parser for Square recurring series exports.
 * Handles quoted fields with embedded commas and newlines.
 */

export interface SquareSeriesRow {
  seriesToken: string
  createdDate: string        // YYYY-MM-DD
  startDate: string
  endedDate: string
  customerName: string
  customerEmail: string
  customerPhone: string
  seriesId: string
  seriesTitle: string
  repeatClause: string
  status: string
  amount: number             // in cents
  amountDisplay: string      // e.g. "$180.00"
  location: string           // omaha | bellevue | elkhorn | gretna
}

export interface ParsedStudent {
  firstName: string
}

export interface ParsedFamily {
  row: SquareSeriesRow
  familyLastName: string
  students: ParsedStudent[]
  sessionsPerMonth: number
  billingDay: number
  autoCreate: boolean
  reviewReason: string | null
  rule: number
}

// Location IDs from config/locations.ts
const LOCATION_IDS: Record<string, string> = {
  omaha: 'd48229c1-b70a-4d29-893e-5079887dab76',
  bellevue: 'f7b52dd5-12ee-437f-9c60-f8adf454ac31',
  elkhorn: 'cebd97d4-c241-4de2-8ade-49e5cc0070d5',
  gretna: '40c67ffc-91b5-46a9-94bd-6ddffdfb7638',
}

export function getLocationId(loc: string): string {
  return LOCATION_IDS[loc] ?? ''
}

export function getLocationName(loc: string): string {
  return loc.charAt(0).toUpperCase() + loc.slice(1)
}

/**
 * Parse a CSV string handling quoted fields with embedded commas/newlines
 */
function parseCsvRobust(text: string): string[][] {
  const rows: string[][] = []
  let current: string[] = []
  let field = ''
  let inQuotes = false
  let i = 0

  while (i < text.length) {
    const ch = text[i]

    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < text.length && text[i + 1] === '"') {
          field += '"'
          i += 2
        } else {
          inQuotes = false
          i++
        }
      } else {
        field += ch
        i++
      }
    } else {
      if (ch === '"') {
        inQuotes = true
        i++
      } else if (ch === ',') {
        current.push(field.trim())
        field = ''
        i++
      } else if (ch === '\n' || (ch === '\r' && i + 1 < text.length && text[i + 1] === '\n')) {
        current.push(field.trim())
        field = ''
        if (current.length >= 10) { // valid row has 16 columns, but allow partial
          rows.push(current)
        }
        current = []
        i += ch === '\r' ? 2 : 1
      } else if (ch === '\r') {
        current.push(field.trim())
        field = ''
        if (current.length >= 10) {
          rows.push(current)
        }
        current = []
        i++
      } else {
        field += ch
        i++
      }
    }
  }

  // Last field/row
  if (field || current.length > 0) {
    current.push(field.trim())
    if (current.length >= 10) {
      rows.push(current)
    }
  }

  return rows
}

/**
 * Parse amount string like "$180.00" to cents
 */
function parseAmount(s: string): number {
  const cleaned = s.replace(/[$,]/g, '').trim()
  const val = parseFloat(cleaned)
  return isNaN(val) ? 0 : Math.round(val * 100)
}

/**
 * Extract billing day from repeat clause like "Repeats monthly on the 1st"
 */
function parseBillingDay(clause: string): number {
  const m = clause.match(/on the (\d+)/i)
  if (m) return parseInt(m[1])
  return 1 // default
}

/**
 * Parse a single location CSV file
 */
export function parseSeriesCsv(text: string, location: string): SquareSeriesRow[] {
  const rows = parseCsvRobust(text)
  if (rows.length === 0) return []

  // Skip header row
  const header = rows[0]
  const dataRows = rows.slice(1)

  // Map column indices from header
  const colIndex: Record<string, number> = {}
  header.forEach((h, i) => { colIndex[h.toLowerCase().replace(/\s+/g, '_')] = i })

  return dataRows
    .map(cols => {
      const get = (key: string) => cols[colIndex[key] ?? -1] ?? ''
      const amount = get('amount')
      return {
        seriesToken: get('series_token'),
        createdDate: get('created_date'),
        startDate: get('start_date'),
        endedDate: get('ended_date'),
        customerName: get('customer_name'),
        customerEmail: get('customer_email'),
        customerPhone: get('customer_phone'),
        seriesId: get('series_id'),
        seriesTitle: get('series_title'),
        repeatClause: get('repeat_clause'),
        status: get('status'),
        amount: parseAmount(amount),
        amountDisplay: amount,
        location,
      }
    })
    .filter(r => r.status === 'Active' && r.amount > 0)
}

/**
 * Check if a date string falls within March 2026
 */
export function isMarch2026(dateStr: string): boolean {
  if (!dateStr) return false
  return dateStr.startsWith('2026-03')
}

/**
 * Parse student names from a series title.
 * Handles patterns:
 *   "Jack & Julia Invoice"
 *   "Eleanor & Benjamin's invoice"
 *   "Charlotte and Lily's Invoice"
 *   "Jace, Damon, Brayden and Mikayla's Invoice"
 *   "Alice Richter Music Sessions"
 *   "Maximus and Russell Tisell Music Sessions"
 */
function parseNamesFromTitle(title: string, customerName: string): string[] {
  if (!title.trim()) return []

  // Remove common suffixes
  let cleaned = title
    .replace(/['']s?\s*(invoice|music\s*sessions?)\s*$/i, '')
    .replace(/\s*(invoice|music\s*sessions?)\s*$/i, '')
    .trim()

  // Remove year prefixes like "2025 Piano Invoice" -> extract nothing useful
  if (/^\d{4}\b/.test(cleaned)) return []

  // Remove promotional text
  if (/buy\s+\d|free\s+month|benefit\s+gifted/i.test(cleaned)) return []

  // Split on "and", "&", ","
  const parts = cleaned
    .split(/\s*(?:,\s*(?:and\s+)?|&|\band\b)\s*/i)
    .map(p => p.trim())
    .filter(Boolean)

  // Extract first names only (the last part might include a last name)
  const customerLastName = customerName.split(/\s+/).pop() ?? ''

  return parts.map(p => {
    // If the part contains the customer last name, strip it
    const words = p.split(/\s+/)
    if (words.length > 1 && words[words.length - 1].toLowerCase() === customerLastName.toLowerCase()) {
      return words[0]
    }
    // Just take the first word as the first name
    return words[0]
  }).filter(Boolean)
}

/**
 * Extract customer last name from full name
 */
function getLastName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/)
  return parts.length > 1 ? parts[parts.length - 1] : parts[0]
}

/**
 * Extract customer first name from full name
 */
function getFirstName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/)
  return parts[0] ?? ''
}

/**
 * Apply the 6 parsing rules to categorize a series row
 */
export function categorizeRow(row: SquareSeriesRow): ParsedFamily {
  const amountDollars = row.amount / 100
  const title = row.seriesTitle.trim()
  const billingDay = parseBillingDay(row.repeatClause)
  const familyLastName = getLastName(row.customerName)

  const base: Omit<ParsedFamily, 'students' | 'sessionsPerMonth' | 'autoCreate' | 'reviewReason' | 'rule'> = {
    row,
    familyLastName,
    billingDay,
  }

  // Rule 1: $180 (or $160), single student
  if (amountDollars <= 180) {
    const titleNames = parseNamesFromTitle(title, row.customerName)
    const firstName = titleNames.length > 0 ? titleNames[0] : getFirstName(row.customerName)
    return {
      ...base,
      students: [{ firstName }],
      sessionsPerMonth: 4,
      autoCreate: true,
      reviewReason: null,
      rule: 1,
    }
  }

  // $320 tier
  if (amountDollars === 320) {
    const titleNames = parseNamesFromTitle(title, row.customerName)

    // Rule 2: $320, title contains "and" or "&" — multiple students
    if (title && /\band\b|&/i.test(title) && titleNames.length >= 2) {
      return {
        ...base,
        students: titleNames.map(n => ({ firstName: n })),
        sessionsPerMonth: 4,
        autoCreate: true,
        reviewReason: null,
        rule: 2,
      }
    }

    // Rule 3: $320, title contains single name — double lessons
    if (title && titleNames.length === 1) {
      return {
        ...base,
        students: [{ firstName: titleNames[0] }],
        sessionsPerMonth: 8,
        autoCreate: true,
        reviewReason: null,
        rule: 3,
      }
    }

    // Rule 4: $320, blank or unparseable title — needs review
    return {
      ...base,
      students: [],
      sessionsPerMonth: 4,
      autoCreate: false,
      reviewReason: title ? 'Could not parse student names from title' : 'No series title — cannot determine students',
      rule: 4,
    }
  }

  // $480+ tier
  if (amountDollars >= 480) {
    const titleNames = parseNamesFromTitle(title, row.customerName)

    // Rule 5: $480+, title contains names
    if (title && titleNames.length >= 1) {
      return {
        ...base,
        students: titleNames.map(n => ({ firstName: n })),
        sessionsPerMonth: 4,
        autoCreate: true,
        reviewReason: null,
        rule: 5,
      }
    }

    // Rule 6: $480+, blank or unparseable title — needs review
    return {
      ...base,
      students: [],
      sessionsPerMonth: 4,
      autoCreate: false,
      reviewReason: title ? 'High amount — could not parse student names' : 'High amount with no series title — cannot determine students',
      rule: 6,
    }
  }

  // Amounts between $180-$320 (e.g. $280) — treat like Rule 1 variant
  const titleNames = parseNamesFromTitle(title, row.customerName)
  const firstName = titleNames.length > 0 ? titleNames[0] : getFirstName(row.customerName)
  return {
    ...base,
    students: [{ firstName }],
    sessionsPerMonth: 4,
    autoCreate: true,
    reviewReason: null,
    rule: 1,
  }
}

// Re-export for convenience
export { LOCATION_IDS, parseAmount, parseBillingDay }
