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
  flute: '\u{1F3B5}',
}

export function getInstrumentEmoji(instrument: string | null | undefined): string {
  if (!instrument || typeof instrument !== 'string') return '\u{1F3B5}'
  return INSTRUMENT_MAP[instrument.trim().toLowerCase()] ?? '\u{1F3B5}'
}
