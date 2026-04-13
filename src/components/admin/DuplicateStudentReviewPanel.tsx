import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { useAuthContext } from '../../app/AuthContext'
import { useStudentDuplicateReviews, useResolveStudentDuplicateReview } from '../../hooks/useStudentDuplicateReviews'
import { toast } from '../shared/Toast'
import type { DuplicateReviewRow } from '../../hooks/useStudentDuplicateReviews'

export type DuplicateReviewPanelProps = {
  variant?: 'full' | 'compact'
  /** Only this review row (e.g. immediately after convert). */
  filterByReviewId?: string | null
  /** Reviews tied to this lead (pipeline / enrolled). */
  filterByLeadId?: string | null
  /** Reviews for this family (Add Student modal). */
  filterByFamilyId?: string | null
  maxItems?: number
  className?: string
  style?: React.CSSProperties
  /** Called after staff resolves a review (merge or keep separate). */
  onResolved?: () => void
}

/**
 * Manual-review-first duplicate workflow: same family + same normalized name as existing active student.
 * Tier counting excludes the newer student until staff resolves (keep separate or merge).
 */
export default function DuplicateStudentReviewPanel({
  variant = 'full',
  filterByReviewId,
  filterByLeadId,
  filterByFamilyId,
  maxItems = 6,
  className,
  style,
  onResolved,
}: DuplicateReviewPanelProps) {
  const navigate = useNavigate()
  const { tenantId } = useAuthContext()
  const { data: allReviews, isLoading, isFetching } = useStudentDuplicateReviews()
  const resolve = useResolveStudentDuplicateReview()

  const reviews = useMemo(() => {
    let list = allReviews ?? []
    if (filterByReviewId) list = list.filter((r) => r.id === filterByReviewId)
    else if (filterByLeadId) list = list.filter((r) => r.lead_id === filterByLeadId)
    else if (filterByFamilyId) list = list.filter((r) => r.family_id === filterByFamilyId)
    if (variant === 'compact' && !filterByReviewId) list = list.slice(0, maxItems)
    return list
  }, [allReviews, filterByReviewId, filterByLeadId, filterByFamilyId, variant, maxItems])

  const ids = useMemo(() => {
    if (!reviews.length) return null
    const s = new Set<string>()
    for (const r of reviews) {
      s.add(r.new_student_id)
      s.add(r.candidate_existing_student_id)
      s.add(r.family_id)
    }
    return [...s]
  }, [reviews])

  const { data: enrich } = useQuery({
    queryKey: ['duplicate_review_enrich', tenantId, ids?.join(','), reviews.map((r) => r.id).join(',')],
    enabled: !!tenantId && !!ids?.length && reviews.length > 0,
    queryFn: async () => {
      const famIds = [...new Set(reviews.map((r) => r.family_id))]
      const studIds = [...new Set(reviews.flatMap((r) => [r.new_student_id, r.candidate_existing_student_id]))]
      const leadIds = [...new Set(reviews.map((r) => r.lead_id).filter((x): x is string => !!x))]
      const [{ data: fams }, { data: studs }, { data: leads }, { data: locs }] = await Promise.all([
        supabase
          .from('families')
          .select('id, name, primary_email, primary_phone, primary_contact_name')
          .eq('tenant_id', tenantId!)
          .in('id', famIds),
        supabase
          .from('students')
          .select('id, first_name, last_name, location_id, status, family_id')
          .eq('tenant_id', tenantId!)
          .in('id', studIds),
        leadIds.length
          ? supabase
              .from('leads')
              .select('id, first_name, last_name, parent_name, email, phone, source, location_id, stage, created_at')
              .eq('tenant_id', tenantId!)
              .in('id', leadIds)
          : Promise.resolve({ data: [] as any[] }),
        supabase.from('locations').select('id, name').eq('tenant_id', tenantId!),
      ])
      const locName = new Map((locs ?? []).map((l: any) => [l.id, (l.name as string).replace(' Music Lessons', '')]))
      const famMap = new Map(fams?.map((f: any) => [f.id, f]) ?? [])
      const studMap = new Map(studs?.map((s: any) => [s.id, s]) ?? [])
      const leadMap = new Map(leads?.map((L: any) => [L.id, L]) ?? [])
      return { famMap, studMap, leadMap, locName }
    },
  })

  if (!reviews.length) {
    if (filterByReviewId && (isLoading || isFetching)) {
      return (
        <div
          style={{
            marginBottom: variant === 'compact' ? 12 : 20,
            padding: '14px 16px',
            borderRadius: 12,
            border: '1px solid rgba(45,212,191,0.35)',
            background: 'rgba(45,212,191,0.06)',
            fontSize: 12,
            color: '#A0A0C8',
            ...style,
          }}
          className={className}
        >
          Loading duplicate review…
        </div>
      )
    }
    if (filterByReviewId && !isLoading) {
      return (
        <div
          style={{
            marginBottom: variant === 'compact' ? 12 : 20,
            padding: '14px 16px',
            borderRadius: 12,
            border: '1px solid rgba(255,184,0,0.25)',
            background: 'rgba(255,184,0,0.06)',
            fontSize: 12,
            color: '#C0C0D8',
            ...style,
          }}
          className={className}
        >
          Duplicate review not loaded yet. Check{' '}
          <button
            type="button"
            onClick={() => navigate('/admin/families')}
            style={{ background: 'none', border: 'none', color: '#5EEAD4', cursor: 'pointer', fontWeight: 700 }}
          >
            Families
          </button>{' '}
          or refresh this dialog.
        </div>
      )
    }
    return null
  }

  const compact = variant === 'compact'
  const pad = compact ? '12px 14px' : '16px 18px'
  const titleSize = compact ? 12 : 13

  return (
    <div
      className={className}
      style={{
        marginBottom: compact ? 12 : 20,
        padding: pad,
        borderRadius: 12,
        border: '1px solid rgba(45,212,191,0.35)',
        background: 'rgba(45,212,191,0.06)',
        ...style,
      }}
    >
      <div style={{ fontSize: titleSize, fontWeight: 800, color: '#E0E0F4', marginBottom: compact ? 6 : 4 }}>
        Possible duplicate students ({reviews.length}
        {compact && (allReviews?.length ?? 0) > reviews.length
          ? ` of ${allReviews?.length}`
          : ''}
        )
      </div>
      {!compact && (
        <div style={{ fontSize: 12, color: '#8080A8', marginBottom: 14, lineHeight: 1.5 }}>
          Same household + same first/last as an active roster student. The newer row is excluded from multi-student tier pricing until you resolve. If the name was a typo or wrong child,
          edit the student or lead first, then merge or keep separate.
        </div>
      )}
      {compact && (
        <div style={{ fontSize: 11, color: '#8080A8', marginBottom: 10, lineHeight: 1.45 }}>
          Resolve from here, Leads (Enrolled), or Families. Edit students if the form had a typo before merging.
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: compact ? 8 : 12 }}>
        {reviews.map((r) => (
          <ReviewCard
            key={r.id}
            r={r}
            enrich={enrich}
            compact={compact}
            resolve={resolve}
            navigate={navigate}
            onResolved={onResolved}
          />
        ))}
      </div>

      {compact && (allReviews?.length ?? 0) > maxItems && !filterByReviewId && (
        <div style={{ fontSize: 11, color: '#606088', marginTop: 10 }}>
          Showing {maxItems} of {allReviews?.length}. Open{' '}
          <button
            type="button"
            onClick={() => navigate('/admin/families')}
            style={{ background: 'none', border: 'none', color: '#5EEAD4', cursor: 'pointer', fontWeight: 700, padding: 0 }}
          >
            Families
          </button>{' '}
          or{' '}
          <button
            type="button"
            onClick={() => navigate('/admin/leads?view=enrolled')}
            style={{ background: 'none', border: 'none', color: '#5EEAD4', cursor: 'pointer', fontWeight: 700, padding: 0 }}
          >
            Leads → Enrolled
          </button>{' '}
          for the full list.
        </div>
      )}
    </div>
  )
}

function ReviewCard({
  r,
  enrich,
  compact,
  resolve,
  navigate,
  onResolved,
}: {
  r: DuplicateReviewRow
  enrich:
    | {
        famMap: Map<string, any>
        studMap: Map<string, any>
        leadMap: Map<string, any>
        locName: Map<string, string>
      }
    | undefined
  compact: boolean
  resolve: ReturnType<typeof useResolveStudentDuplicateReview>
  navigate: ReturnType<typeof useNavigate>
  onResolved?: () => void
}) {
  const fam = enrich?.famMap.get(r.family_id)
  const newS = enrich?.studMap.get(r.new_student_id)
  const cand = enrich?.studMap.get(r.candidate_existing_student_id)
  const lead = r.lead_id ? enrich?.leadMap.get(r.lead_id) : null
  const famName = fam?.name ?? 'Family'
  const newName = newS ? `${newS.first_name} ${newS.last_name ?? ''}`.trim() : 'New'
  const candName = cand ? `${cand.first_name} ${cand.last_name ?? ''}`.trim() : 'Existing'
  const newLoc = newS?.location_id ? enrich?.locName.get(newS.location_id) : null
  const candLoc = cand?.location_id ? enrich?.locName.get(cand.location_id) : null
  const inquiryLoc = lead?.location_id ? enrich?.locName.get(lead.location_id as string) : null

  return (
    <div
      style={{
        padding: compact ? '10px 12px' : '12px 14px',
        borderRadius: 10,
        background: 'rgba(0,0,0,0.25)',
        border: '1px solid rgba(255,255,255,0.08)',
      }}
    >
      <div style={{ fontSize: compact ? 11 : 12, color: '#A0A0C8', marginBottom: 8 }}>
        <span style={{ color: '#E0E0F4', fontWeight: 700 }}>{famName}</span>
        <span style={{ margin: '0 8px', opacity: 0.4 }}>·</span>
        Flag: same family + same normalized name
      </div>

      {!compact && fam && (
        <div style={{ fontSize: 11, color: '#8080A8', marginBottom: 8, lineHeight: 1.5 }}>
          <strong style={{ color: '#A0A0C8' }}>Family contact:</strong>{' '}
          {[fam.primary_email, fam.primary_phone].filter(Boolean).join(' · ') || '—'}
          {fam.primary_contact_name && ` · ${fam.primary_contact_name}`}
        </div>
      )}

      <div style={{ fontSize: compact ? 12 : 13, color: '#D0D0E8', marginBottom: 8 }}>
        <strong>New</strong> ({newS?.status ?? '…'}): {newName}
        {newLoc && <span style={{ color: '#606088' }}> · {newLoc}</span>}
        <span style={{ margin: '0 8px', color: '#606088' }}>vs</span>
        <strong>Existing</strong> ({cand?.status ?? '…'}): {candName}
        {candLoc && <span style={{ color: '#606088' }}> · {candLoc}</span>}
      </div>

      {lead && (
        <div style={{ fontSize: 11, color: '#8080A8', marginBottom: 8, lineHeight: 1.45 }}>
          <strong style={{ color: '#A0A0C8' }}>Inquiry:</strong> {lead.parent_name ?? lead.first_name}{' '}
          · {[lead.email, lead.phone].filter(Boolean).join(' · ') || '—'} · source: {lead.source ?? '—'} · {inquiryLoc ?? '—'}{' '}
          · stage {lead.stage} · {lead.created_at ? new Date(lead.created_at as string).toLocaleDateString() : ''}
        </div>
      )}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
        <button
          type="button"
          disabled={resolve.isPending}
          onClick={() => navigate(`/admin/students/${r.new_student_id}`)}
          style={btnGhost}
        >
          Edit new student
        </button>
        <button type="button" disabled={resolve.isPending} onClick={() => navigate(`/admin/students/${r.candidate_existing_student_id}`)} style={btnGhost}>
          Edit matched student
        </button>
        {r.lead_id && (
          <button type="button" disabled={resolve.isPending} onClick={() => navigate('/admin/leads?view=enrolled')} style={btnGhost}>
            Leads (Enrolled)
          </button>
        )}
        <button type="button" disabled={resolve.isPending} onClick={() => navigate(`/admin/families?family=${r.family_id}`)} style={btnGhost}>
          Family roster
        </button>
      </div>

      <div style={{ fontSize: 10, color: '#606088', marginBottom: 8, lineHeight: 1.4 }}>
        <strong>Wrong family only?</strong> Open <em>Edit new student</em>, change the family, fix the name if needed, then return here and choose{' '}
        <strong>Keep separate</strong> (two real siblings) or <strong>Merge</strong> if it was the same child twice.
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        <button
          type="button"
          disabled={resolve.isPending}
          onClick={async () => {
            try {
              await resolve.mutateAsync({ reviewId: r.id, resolution: 'keep_separate' })
              toast('Marked as separate students — both count toward family tier.', 'success')
              onResolved?.()
            } catch (e: any) {
              toast(e.message ?? 'Failed to resolve', 'error')
            }
          }}
          style={btnKeep}
        >
          Keep separate
        </button>
        <button
          type="button"
          disabled={resolve.isPending}
          onClick={async () => {
            if (!confirm(`Merge "${newName}" into "${candName}"? The newer roster row will be set to former; leads and schedules point to the existing student.`)) return
            try {
              await resolve.mutateAsync({
                reviewId: r.id,
                resolution: 'merge_into_existing',
                canonicalStudentId: r.candidate_existing_student_id,
              })
              toast('Merged into existing student.', 'success')
              onResolved?.()
            } catch (e: any) {
              toast(e.message ?? 'Failed to merge', 'error')
            }
          }}
          style={btnMerge}
        >
          Merge into existing
        </button>
      </div>
    </div>
  )
}

const btnGhost: React.CSSProperties = {
  padding: '6px 10px',
  borderRadius: 8,
  border: '1px solid rgba(255,255,255,0.12)',
  background: 'rgba(255,255,255,0.04)',
  color: '#C0C0D8',
  fontWeight: 600,
  fontSize: 11,
  cursor: 'pointer',
}

const btnKeep: React.CSSProperties = {
  padding: '8px 14px',
  borderRadius: 8,
  border: '1px solid rgba(34,197,94,0.35)',
  background: 'rgba(34,197,94,0.12)',
  color: '#4ADE80',
  fontWeight: 700,
  fontSize: 12,
  cursor: 'pointer',
}

const btnMerge: React.CSSProperties = {
  padding: '8px 14px',
  borderRadius: 8,
  border: '1px solid rgba(212,34,106,0.35)',
  background: 'rgba(212,34,106,0.12)',
  color: '#E8488A',
  fontWeight: 700,
  fontSize: 12,
  cursor: 'pointer',
}
