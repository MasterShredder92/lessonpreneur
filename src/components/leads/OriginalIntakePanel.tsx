import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { qk } from '../../lib/queryKeys'

/** Display order for public-lead-submit / SignupLanding payload (source of truth for ordering). */
const WEBSITE_INTAKE_KEY_ORDER: string[] = [
  'school_slug',
  'location_id',
  'first_name',
  'last_name',
  'student_name',
  'parent_name',
  'email',
  'phone',
  'instrument',
  'age_range',
  'experience',
  'preferred_days',
  'preferred_locations',
  'secondary_location_ids',
  'has_instrument',
  'personality_notes',
  'goals',
  'is_military',
  'compatibility_score',
  'matched_teacher_id',
  'source',
  'referral_source',
  'students',
]

const LABELS: Record<string, string> = {
  school_slug: 'School',
  location_id: 'Location ID',
  first_name: 'First name',
  last_name: 'Last name',
  student_name: 'Student name',
  parent_name: 'Parent / guardian',
  email: 'Email',
  phone: 'Phone',
  instrument: 'Instrument(s)',
  age_range: 'Age',
  experience: 'Experience',
  preferred_days: 'Preferred days',
  preferred_locations: 'Also works (locations)',
  secondary_location_ids: 'Secondary location IDs',
  has_instrument: 'Has instrument',
  personality_notes: 'Personality / notes',
  goals: 'Goals',
  is_military: 'Military',
  compatibility_score: 'Match score',
  matched_teacher_id: 'Matched teacher ID',
  source: 'Source',
  referral_source: 'How they heard',
  students: 'Additional students',
}

function formatValue(v: unknown): string {
  if (v === null || v === undefined) return '—'
  if (Array.isArray(v)) return v.map((x) => String(x)).join(', ')
  if (typeof v === 'object') return JSON.stringify(v, null, 2)
  if (typeof v === 'boolean') return v ? 'Yes' : 'No'
  return String(v)
}

function orderedEntries(raw: Record<string, unknown>): [string, unknown][] {
  const keys = new Set(Object.keys(raw))
  const out: [string, unknown][] = []
  for (const k of WEBSITE_INTAKE_KEY_ORDER) {
    if (keys.has(k)) {
      out.push([k, raw[k]])
      keys.delete(k)
    }
  }
  for (const k of [...keys].sort()) {
    out.push([k, raw[k]])
  }
  return out
}

export function OriginalIntakePanel({
  intakeSubmissionId,
  compact,
}: {
  intakeSubmissionId: string
  compact?: boolean
}) {
  const { data, isLoading, error } = useQuery({
    queryKey: qk.intakeSubmission.detail(intakeSubmissionId),
    enabled: !!intakeSubmissionId,
    queryFn: async () => {
      const { data: row, error: err } = await supabase
        .from('intake_submissions')
        .select('id, raw_payload, source, form_version, created_at')
        .eq('id', intakeSubmissionId)
        .single()
      if (err) throw err
      return row as {
        id: string
        raw_payload: Record<string, unknown>
        source: string
        form_version: string
        created_at: string
      }
    },
  })

  if (isLoading) {
    return (
      <div style={{ padding: compact ? '8px 0' : '12px 0', fontSize: 12, color: '#8080A8' }}>Loading original intake…</div>
    )
  }
  if (error || !data?.raw_payload) {
    return (
      <div style={{ padding: compact ? '8px 0' : '12px 0', fontSize: 12, color: '#EF4444' }}>
        Could not load intake snapshot.
      </div>
    )
  }

  const raw = data.raw_payload
  const entries = orderedEntries(raw)

  return (
    <div
      className="lead-star-section"
      style={{
        background: 'rgba(255,184,0,0.04)',
        border: '1px solid rgba(255,184,0,0.12)',
        borderRadius: 12,
        padding: compact ? '10px 12px' : '14px 16px',
        marginBottom: compact ? 8 : 12,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: '#FFB800', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          Original intake
        </span>
        <span style={{ fontSize: 10, color: '#606088' }}>
          {data.source} · v{data.form_version} · {new Date(data.created_at).toLocaleString()}
        </span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: compact ? 200 : 360, overflowY: 'auto' }}>
        {entries.map(([key, val]) => (
          <div key={key} style={{ display: 'grid', gridTemplateColumns: compact ? 'minmax(100px,140px) 1fr' : '160px 1fr', gap: 8, fontSize: 12, alignItems: 'start' }}>
            <span style={{ color: '#8080A8', fontWeight: 600 }}>{LABELS[key] ?? key}</span>
            <span style={{ color: '#E0E0F4', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{formatValue(val)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
