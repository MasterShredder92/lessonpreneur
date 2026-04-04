// Canonical instrument → emoji map. Keys are stored lowercase; lookup is
// case-insensitive so callers can pass the raw DB value (e.g. "Piano", "piano",
// "PIANO") without any normalization.
const INSTRUMENT_MAP: Record<string, string> = {
  piano: '\u{1F3B9}',
  guitar: '\u{1F3B8}',
  voice: '\u{1F3A4}',
  vocals: '\u{1F3A4}',
  drums: '\u{1F941}',
  'bass guitar': '\u{1F3B8}',
  bass: '\u{1F3B8}',
  violin: '\u{1F3BB}',
  saxophone: '\u{1F3B7}',
  sax: '\u{1F3B7}',
  clarinet: '\u{1F3B5}',
  ukulele: '\u{1FA95}',
  mandolin: '\u{1FA95}',
  percussion: '\u{1F941}',
  'band percussion': '\u{1F941}',
  'band instruments': '\u{1F3B5}',
  woodwinds: '\u{1F3B5}',
  flute: '\u{1FA88}',
}

const DEFAULT_EMOJI = '\u{1F3B5}' // 🎵

export function getInstrumentEmoji(instrument?: string | null): string {
  if (!instrument || typeof instrument !== 'string') return DEFAULT_EMOJI
  return INSTRUMENT_MAP[instrument.trim().toLowerCase()] ?? DEFAULT_EMOJI
}

/** "🎹 Piano" — emoji always first, never truncated; falls back to 🎵 Unknown. */
export function instrumentWithEmoji(instrument?: string | null): string {
  return `${getInstrumentEmoji(instrument)} ${instrument ?? 'Unknown'}`
}

/** Title-case variant: "🎹 Piano" when DB stores "piano". */
export function instrumentWithEmojiTitle(instrument?: string | null): string {
  const name = instrument
    ? instrument.charAt(0).toUpperCase() + instrument.slice(1).toLowerCase()
    : 'Unknown'
  return `${getInstrumentEmoji(instrument)} ${name}`
}
