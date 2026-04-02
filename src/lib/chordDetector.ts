/**
 * Guitar chord detection from fret positions.
 *
 * Standard tuning open string semitones (from C=0):
 *   E2=4, A2=9, D3=14(=2), G3=19(=7), B3=23(=11), E4=28(=4)
 *
 * Fret note = (stringOpen + fretNumber) % 12
 */

const STRING_OPEN_SEMITONES = [4, 9, 2, 7, 11, 4] // E A D G B E (mod 12)

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

// Interval sets for chord types — ORDER = simplicity rank (lower index = simpler)
const CHORD_TYPES: { name: string; intervals: number[]; rank: number }[] = [
  { name: 'major', intervals: [0, 4, 7], rank: 0 },
  { name: 'minor', intervals: [0, 3, 7], rank: 1 },
  { name: '7', intervals: [0, 4, 7, 10], rank: 2 },
  { name: 'm7', intervals: [0, 3, 7, 10], rank: 3 },
  { name: 'maj7', intervals: [0, 4, 7, 11], rank: 4 },
  { name: 'sus2', intervals: [0, 2, 7], rank: 5 },
  { name: 'sus4', intervals: [0, 5, 7], rank: 5 },
  { name: '5', intervals: [0, 7], rank: 6 },
  { name: 'dim', intervals: [0, 3, 6], rank: 7 },
  { name: 'aug', intervals: [0, 4, 8], rank: 7 },
  { name: '6', intervals: [0, 4, 7, 9], rank: 8 },
  { name: 'm6', intervals: [0, 3, 7, 9], rank: 8 },
  { name: 'dim7', intervals: [0, 3, 6, 9], rank: 9 },
  { name: 'm7b5', intervals: [0, 3, 6, 10], rank: 9 },
  { name: 'aug7', intervals: [0, 4, 8, 10], rank: 9 },
  { name: '7sus4', intervals: [0, 5, 7, 10], rank: 9 },
  { name: 'add9', intervals: [0, 2, 4, 7], rank: 10 },
  { name: 'madd9', intervals: [0, 2, 3, 7], rank: 10 },
  { name: '9', intervals: [0, 2, 4, 7, 10], rank: 11 },
  { name: 'maj9', intervals: [0, 2, 4, 7, 11], rank: 11 },
  { name: 'm9', intervals: [0, 2, 3, 7, 10], rank: 11 },
  { name: '6/9', intervals: [0, 2, 4, 7, 9], rank: 12 },
]

// Build full library: 12 roots × all types = 264 chords
interface ChordEntry {
  name: string
  root: number // semitone from C
  notes: Set<number> // unique semitones (mod 12)
  rank: number // simplicity rank (lower = simpler)
}

const FULL_LIBRARY: ChordEntry[] = []
for (let root = 0; root < 12; root++) {
  for (const type of CHORD_TYPES) {
    const notes = new Set(type.intervals.map(i => (root + i) % 12))
    const rootName = NOTE_NAMES[root]
    const typeSuffix = type.name === 'major' ? '' : type.name === 'minor' ? 'm' : type.name
    FULL_LIBRARY.push({
      name: `${rootName}${typeSuffix}`,
      root,
      notes,
      rank: type.rank,
    })
  }
}

// Known open shapes for priority matching (these feel more natural on guitar)
const OPEN_SHAPE_NAMES = new Set([
  'C', 'G', 'D', 'A', 'E', 'F',
  'Am', 'Em', 'Dm', 'Bm',
  'A7', 'E7', 'D7', 'G7', 'C7', 'B7',
  'Asus2', 'Dsus2', 'Esus4', 'Asus4', 'Dsus4',
  'Cmaj7', 'Fmaj7', 'Gmaj7', 'Dmaj7',
  'Am7', 'Em7', 'Dm7',
])

const NO_MATCH_MESSAGES = [
  "That's... a sound. 🤘",
  "Undefined chord detected. You might be inventing something new.",
  "Our chord database is confused. Keep going.",
  "Error 404: Chord not found. We like it though.",
  "Somewhere, a music theorist just raised an eyebrow.",
  "Bold choice. The notes respect your confidence.",
  "We'll file that under 'experimental.'",
]

/**
 * Detect what chord is being played from fret positions.
 * @param pressedFrets Array of 6 values: null=muted, 0-24=fret number
 * @returns { name: string, isChord: boolean }
 */
export function detectChord(pressedFrets: (number | null)[]): { name: string; isChord: boolean } {
  // Collect played notes
  const playedNotes = new Set<number>()
  let playedCount = 0

  for (let i = 0; i < 6; i++) {
    const fret = pressedFrets[i]
    if (fret === null) continue
    playedCount++
    const semitone = (STRING_OPEN_SEMITONES[i] + fret) % 12
    playedNotes.add(semitone)
  }

  if (playedCount === 0) return { name: '', isChord: false }
  if (playedCount <= 2) return { name: '', isChord: false }

  // Find the bass note (lowest sounding string that isn't muted)
  let bassNote = -1
  for (let i = 0; i < 6; i++) {
    if (pressedFrets[i] !== null) {
      bassNote = (STRING_OPEN_SEMITONES[i] + pressedFrets[i]!) % 12
      break
    }
  }

  // Collect ALL candidates: exact matches, superset matches (chord ⊂ played),
  // and subset matches (played ⊂ chord). Score them together so simpler chords
  // beat complex ones even when the complex chord is an exact note-count match.
  type Candidate = { chord: ChordEntry; missedNotes: number; extraNotes: number }
  const candidates: Candidate[] = []

  for (const chord of FULL_LIBRARY) {
    // How many chord notes are NOT in played notes?
    let missed = 0
    for (const n of chord.notes) {
      if (!playedNotes.has(n)) missed++
    }
    // How many played notes are NOT in chord notes?
    let extra = 0
    for (const n of playedNotes) {
      if (!chord.notes.has(n)) extra++
    }
    // Accept: all chord notes present (missed=0), up to 2 extra played notes
    // Also accept: 1 chord note missing (missed=1), 0 extra (partial voicing)
    if (missed === 0 && extra <= 2) {
      candidates.push({ chord, missedNotes: missed, extraNotes: extra })
    } else if (missed === 1 && extra === 0) {
      candidates.push({ chord, missedNotes: missed, extraNotes: extra })
    }
  }

  if (candidates.length > 0) {
    // Score each candidate — composite score, lower wins.
    // Key insight: a simple chord (major/minor/7th) with root = bass note
    // should beat a complex chord (6/9, add9, etc.) even if the complex
    // chord is a tighter note-count match.
    function score(c: Candidate): number {
      let s = 0
      // Base: total discrepant notes × 10
      s += (c.missedNotes + c.extraNotes) * 10
      // But complex chords (rank >= 8) get a penalty that offsets
      // having 1 fewer extra note. This means Em7 (rank 3, extra 1)
      // beats G6/9 (rank 12, extra 0) because 1*10 + 3 = 13 < 0*10 + 12.
      s += c.chord.rank
      // Root = bass note bonus (subtract 5)
      if (c.chord.root === bassNote) s -= 5
      // Open shape bonus (subtract 3)
      if (OPEN_SHAPE_NAMES.has(c.chord.name)) s -= 3
      // Prefer no missed notes
      s += c.missedNotes * 4
      return s
    }

    candidates.sort((a, b) => score(a) - score(b))

    return { name: candidates[0].chord.name, isChord: true }
  }

  // No match
  return {
    name: NO_MATCH_MESSAGES[Math.floor(Math.random() * NO_MATCH_MESSAGES.length)],
    isChord: false,
  }
}
