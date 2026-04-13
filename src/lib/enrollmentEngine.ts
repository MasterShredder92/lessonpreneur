/**
 * Centralized enrollment engine.
 *
 * Owns the post-enrollment cache invalidation sequence so every entry
 * point (AddStudentModal, LinkFamilyModal, ConvertLeadModal, remove,
 * delete) stays in sync with billing, families, students, and
 * onboarding caches.
 *
 * Rate recalculation itself now happens via a Postgres trigger
 * (student_family_rate_recalc) that fires apply_family_rate_tier()
 * on every student INSERT / UPDATE(family_id, status, sessions_per_month)
 * / DELETE.  The frontend only needs to invalidate caches.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { QueryClient } from '@tanstack/react-query'
import { qk } from './queryKeys'
import { supabase } from './supabase'
import { useAuthContext } from '../app/AuthContext'

// ── Types ───────────────────────────────────────────────────────
export type EnrollmentType = 'new_enrollment' | 'existing_moved'

// ── Cache invalidation after any enrollment / family mutation ───
export async function invalidateEnrollmentCaches(
  qc: QueryClient,
  familyId?: string,
) {
  const keys = [
    // Students — prefix ['students'] covers list + detail
    qk.students.all,
    qk.students.roster,
    qk.students.followups,

    // Families
    qk.families.all,
    qk.families.page,
    qk.families.roster,

    // Billing (critical — student_effective_rate view changed)
    qk.billing.snapshot,
    qk.billing.overview,
    qk.billing.families,
    qk.billing.nextCycle,

    // Onboarding
    qk.onboarding.pipeline,

    // Tasks
    qk.tasks.all,

    // Dashboard (family counts, MRR)
    qk.dashboard.all,

    // Retention
    qk.retention.churnRisk,

    // Parent portal
    qk.parent.familyId,
    qk.parent.familyName,
    qk.parent.familyStudentRates,
    qk.parent.familyBilling,
    qk.parent.students,
  ]

  const promises = keys.map((k) => qc.invalidateQueries({ queryKey: k }))

  // Family-specific caches
  if (familyId) {
    promises.push(
      qc.invalidateQueries({ queryKey: qk.families.rate(familyId) }),
      qc.invalidateQueries({ queryKey: qk.families.billing(familyId) }),
      qc.invalidateQueries({ queryKey: qk.families.detail(familyId) }),
      qc.invalidateQueries({ queryKey: qk.families.fileDetail(familyId) }),
      qc.invalidateQueries({ queryKey: qk.families.files(familyId) }),
      qc.invalidateQueries({ queryKey: qk.families.activity(familyId) }),
      qc.invalidateQueries({ queryKey: qk.families.invStudents(familyId) }),
    )
  }

  // Tab counts need tenant prefix — invalidate by base prefix
  promises.push(
    qc.invalidateQueries({ queryKey: ['family-tab-counts'] }),
  )

  await Promise.all(promises)
}

// ── Fetch the family's current active student count ────────────
export async function getFamilyActiveStudentCount(
  familyId: string,
  tenantId: string,
): Promise<number> {
  const { count } = await supabase
    .from('students')
    .select('id', { count: 'exact', head: true })
    .eq('family_id', familyId)
    .eq('tenant_id', tenantId)
    .eq('status', 'active')
  return count ?? 0
}

// ── Fetch the family's current rate tier (cents) ───────────────
export async function getFamilyRateTier(
  familyId: string,
): Promise<number> {
  const { data } = await supabase
    .from('families')
    .select('rate_tier')
    .eq('id', familyId)
    .single()
  return data?.rate_tier ?? 4500
}

// ── Log enrollment event to audit_log ──────────────────────────
export async function logEnrollmentEvent(params: {
  tenantId: string
  studentId: string
  familyId: string
  enrollmentType: EnrollmentType
  performedBy: string | null
  userName: string | null
  userRole: string | null
  locationId: string | null
  studentName: string
}) {
  const action =
    params.enrollmentType === 'new_enrollment'
      ? 'student_enrolled'
      : 'student_moved_to_family'

  await supabase.from('audit_log').insert({
    tenant_id: params.tenantId,
    performed_by: params.performedBy,
    action,
    table_name: 'students',
    record_id: params.studentId,
    new_value: JSON.stringify({
      family_id: params.familyId,
      enrollment_type: params.enrollmentType,
    }),
    reason: params.enrollmentType === 'new_enrollment'
      ? `New student enrollment: ${params.studentName}`
      : `Existing student moved to family: ${params.studentName}`,
    user_name: params.userName,
    user_role: params.userRole,
    location_id: params.locationId,
    entity_name: params.studentName,
  })
}

// ═══════════════════════════════════════════════════════════════
// REMOVE STUDENT FROM FAMILY
// ═══════════════════════════════════════════════════════════════

/**
 * Clears student.family_id, logs audit, and invalidates all
 * family + student + billing caches so every view stays in sync.
 *
 * The Postgres trigger `student_family_rate_recalc` auto-fires
 * `apply_family_rate_tier()` on the old family when family_id
 * changes, recalculating rates for remaining siblings.
 */
export function useRemoveStudentFromFamily() {
  const qc = useQueryClient()
  const { tenantId, profile, role } = useAuthContext()

  return useMutation({
    mutationFn: async (params: {
      studentId: string
      familyId: string
      studentName: string
    }) => {
      // Clear the canonical relationship
      const { error } = await supabase
        .from('students')
        .update({ family_id: null })
        .eq('id', params.studentId)
      if (error) throw error

      // Audit log
      await supabase.from('audit_log').insert({
        tenant_id: tenantId!,
        performed_by: profile?.id ?? null,
        action: 'student_removed_from_family',
        table_name: 'students',
        record_id: params.studentId,
        old_value: params.familyId,
        new_value: null,
        reason: `${params.studentName} removed from family`,
        user_name: profile ? `${profile.first_name} ${profile.last_name}` : null,
        user_role: role ?? null,
        entity_name: params.studentName,
      })
    },
    onSuccess: async (_d, vars) => {
      await invalidateEnrollmentCaches(qc, vars.familyId)
    },
  })
}

// ═══════════════════════════════════════════════════════════════
// DELETE FAMILY
// ═══════════════════════════════════════════════════════════════

/**
 * Deletes a family via the `safe_delete_family` RPC which atomically:
 * 1. Orphans all students (sets family_id = null — NOT deleted)
 * 2. Nullifies nullable FK references (invoices, leads, reviews, etc.)
 * 3. Deletes NOT-NULL FK records (billing_adjustments, payment_history, etc.)
 * 4. Lets CASCADE handle family_files, makeup_sessions, callouts, etc.
 * 5. Deletes the family row
 *
 * Storage blobs for family_files are cleaned up best-effort before the RPC.
 * The Postgres trigger auto-recalculates student rates when family_id changes.
 */
export function useDeleteFamily() {
  const qc = useQueryClient()
  const { tenantId, profile, role } = useAuthContext()

  return useMutation({
    mutationFn: async (params: {
      familyId: string
      familyName: string
    }) => {
      // Best-effort: clean up storage blobs before the RPC cascade-deletes family_files rows
      const { data: files } = await supabase
        .from('family_files')
        .select('file_url')
        .eq('family_id', params.familyId)

      if (files && files.length > 0) {
        const storagePaths = files
          .map((f: any) => {
            const parts = f.file_url?.split('/family-files/')
            return parts?.length > 1 ? parts[1] : null
          })
          .filter(Boolean) as string[]

        if (storagePaths.length > 0) {
          await supabase.storage.from('family-files').remove(storagePaths)
        }
      }

      // Atomic deletion via RPC — handles all 29 FK references
      const { error } = await supabase.rpc('safe_delete_family', {
        p_family_id: params.familyId,
      })
      if (error) throw error

      // Audit log (family row is gone, but audit_log has no FK to families)
      await supabase.from('audit_log').insert({
        tenant_id: tenantId!,
        performed_by: profile?.id ?? null,
        action: 'family_deleted',
        table_name: 'families',
        record_id: params.familyId,
        reason: `Family deleted: ${params.familyName}`,
        user_name: profile ? `${profile.first_name} ${profile.last_name}` : null,
        user_role: role ?? null,
        entity_name: params.familyName,
      })
    },
    onSuccess: async (_d, vars) => {
      await invalidateEnrollmentCaches(qc, vars.familyId)
    },
  })
}
