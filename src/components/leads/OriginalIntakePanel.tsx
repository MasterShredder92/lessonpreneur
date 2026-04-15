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
  if (Array.isArray(v)) {
    if (v.length === 0) return '—'
    if (typeof v[0] === 'object' && v[0] !== null) return JSON.stringify(v, null, 2)
    return v.map((x) => String(x)).join(', ')
  }
  if (typeof v === 'object') return JSON.stringify(v, null, 2)
  if (typeof v === 'boolean') return v ? 'Yes' : 'No'
  return String(v)
}

interface IntakeStudent {
  name?: string
  first_name?: string
  last_name?: string
  instrument?: string
  age_range?: string
  age?: string
  experience?: string
  personality_notes?: string
  notes?: string
  goals?: string
  preferred_days?: string | string[]
  [key: string]: unknown
}

function StudentCards({ students }: { students: IntakeStudent[] }) {
  if (!students || students.length === 0) return <span style={{ color: '#8080A8' }}>—</span>
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%' }}>
      {students.map((s, i) => {
        const displayName = s.name ?? [s.first_name, s.last_name].filter(Boolean).join(' ') ?? `Student ${i + 1}`
        const days = Array.isArray(s.preferred_days)
          ? s.preferred_days.join(', ')
          : typeof s.preferred_days === 'string'
          ? s.preferred_days
          : null
        return (
          <div
            key={i}
            style={{
              padding: '10px 12px',
              borderRadius: 10,
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid rgba(255,255,255,0.07)',
              borderLeft: '3px solid rgba(212,34,106,0.45)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <span style={{ fontSize: 13, fontWeight: 800, color: '#E0E0F4' }}>{displayName}</span>
              {s.instrument && (
                <span style={{ fontSize: 11, fontWeight: 600, color: '#A0A0C8' }}>· {s.instrument}</span>
              )}
              {(s.age_range ?? s.age) && (
                <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 4, background: 'rgba(255,255,255,0.06)', color: '#8080A8' }}>
                  {s.age_range ?? s.age}
                </span>
              )}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              {s.experience && (
                <div style={{ fontSize: 11, color: '#A0A0C8' }}>
                  <span style={{ color: '#6060A0', fontWeight: 600 }}>Experience: </span>{s.experience}
                </div>
              )}
              {(s.personality_notes ?? s.notes) && (
                <div style={{ fontSize: 11, color: '#A0A0C8', fontStyle: 'italic' }}>
                  "{s.personality_notes ?? s.notes}"
                </div>
              )}
              {s.goals && (
                <div style={{ fontSize: 11, color: '#A0A0C8' }}>
                  <span style={{ color: '#6060A0', fontWeight: 600 }}>Goals: </span>{s.goals}
                </div>
              )}
              {days && (
                <div style={{ fontSize: 11, color: '#A0A0C8' }}>
                  <span style={{ color: '#6060A0', fontWeight: 600 }}>Preferred days: </span>{days}
                </div>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
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
      className="lead-ziro-section"
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
        {entries.map(([key, val]) => {
          const isStudents = key === 'students' && Array.isArray(val) && val.length > 0 && typeof val[0] === 'object'
          return (
            <div
              key={key}
              style={{
                display: isStudents ? 'flex' : 'grid',
                flexDirection: isStudents ? 'column' : undefined,
                gridTemplateColumns: isStudents ? undefined : (compact ? 'minmax(100px,140px) 1fr' : '160px 1fr'),
                gap: 8,
                fontSize: 12,
                alignItems: 'start',
              }}
            >
              <span style={{ color: '#8080A8', fontWeight: 600, marginBottom: isStudents ? 2 : 0 }}>
                {LABELS[key] ?? key}
              </span>
              {isStudents ? (
                <StudentCards students={val as IntakeStudent[]} />
              ) : (
                <span style={{ color: '#E0E0F4', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                  {formatValue(val)}
                </span>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
