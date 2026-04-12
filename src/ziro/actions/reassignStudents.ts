import { supabase } from '../../lib/supabase'
import { logAudit } from '../../lib/auditLog'
import type { UserRole } from '../../lib/types'
import type { ZiroActionContext, ZiroActionResult } from './executeZiroAction'

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

/** Proposal from assistant text (before user confirmation + idempotency key). */
export interface ZiroReassignProposal {
  student_ids: string[]
  target_teacher_id: string
  expected_prior_teacher_id?: string | null
}

export interface ZiroReassignStudentsPayload {
  student_ids: string[]
  target_teacher_id: string
  /** When set, every student must currently have this primary teacher (stale-context guard). */
  expected_prior_teacher_id?: string | null
  /** Client-generated idempotency key (UUID recommended). */
  idempotency_key: string
}

function isUuid(s: string): boolean {
  return UUID_RE.test(s.trim())
}

/** Validates assistant / UI proposal (no idempotency key yet). */
export function validateZiroReassignProposal(
  raw: unknown,
): { ok: true; value: ZiroReassignProposal } | { ok: false; message: string } {
  if (raw === null || typeof raw !== 'object') {
    return { ok: false, message: 'Invalid proposal' }
  }
  const o = raw as Record<string, unknown>
  const ids = o.student_ids
  const target = o.target_teacher_id
  if (!Array.isArray(ids) || ids.length === 0 || ids.length > 50) {
    return { ok: false, message: 'student_ids must be a non-empty array (max 50)' }
  }
  for (const id of ids) {
    if (typeof id !== 'string' || !isUuid(id)) {
      return { ok: false, message: 'Each student id must be a valid UUID' }
    }
  }
  if (typeof target !== 'string' || !isUuid(target)) {
    return { ok: false, message: 'target_teacher_id must be a valid UUID' }
  }
  let expected_prior: string | null | undefined
  if ('expected_prior_teacher_id' in o && o.expected_prior_teacher_id != null && o.expected_prior_teacher_id !== '') {
    const e = o.expected_prior_teacher_id
    if (typeof e !== 'string' || !isUuid(e)) {
      return { ok: false, message: 'expected_prior_teacher_id must be a valid UUID when provided' }
    }
    expected_prior = e
  } else {
    expected_prior = null
  }
  return {
    ok: true,
    value: {
      student_ids: [...new Set(ids.map(s => s.trim()))],
      target_teacher_id: target.trim(),
      expected_prior_teacher_id: expected_prior ?? null,
    },
  }
}

/** Pure validation for RPC args — keep in sync with `ziro_reassign_students_to_teacher`. */
export function validateZiroReassignStudentsPayload(raw: unknown): { ok: true; value: ZiroReassignStudentsPayload } | { ok: false; message: string } {
  if (raw === null || typeof raw !== 'object') {
    return { ok: false, message: 'Invalid payload' }
  }
  const o = raw as Record<string, unknown>
  const ids = o.student_ids
  const target = o.target_teacher_id
  const idem = o.idempotency_key
  if (!Array.isArray(ids) || ids.length === 0 || ids.length > 50) {
    return { ok: false, message: 'student_ids must be a non-empty array (max 50)' }
  }
  for (const id of ids) {
    if (typeof id !== 'string' || !isUuid(id)) {
      return { ok: false, message: 'Each student id must be a valid UUID' }
    }
  }
  if (typeof target !== 'string' || !isUuid(target)) {
    return { ok: false, message: 'target_teacher_id must be a valid UUID' }
  }
  let expected_prior: string | null | undefined
  if ('expected_prior_teacher_id' in o && o.expected_prior_teacher_id != null) {
    const e = o.expected_prior_teacher_id
    if (typeof e !== 'string' || !isUuid(e)) {
      return { ok: false, message: 'expected_prior_teacher_id must be a valid UUID when provided' }
    }
    expected_prior = e
  } else {
    expected_prior = null
  }
  if (typeof idem !== 'string' || idem.trim().length < 8) {
    return { ok: false, message: 'idempotency_key is required' }
  }
  return {
    ok: true,
    value: {
      student_ids: [...new Set(ids.map(s => s.trim()))],
      target_teacher_id: target.trim(),
      expected_prior_teacher_id: expected_prior ?? null,
      idempotency_key: idem.trim(),
    },
  }
}

const REASSIGN_ROLES: UserRole[] = ['owner', 'admin', 'company_director', 'studio_director']

function canRoleReassignStudents(role: UserRole | null): boolean {
  if (!role) return false
  return (REASSIGN_ROLES as string[]).includes(role)
}

export async function executeZiroReassignStudents(
  payload: unknown,
  ctx: ZiroActionContext,
): Promise<ZiroActionResult> {
  const parsed = validateZiroReassignStudentsPayload(payload)
  if (!parsed.ok) {
    return { ok: false, code: 'validation', message: parsed.message }
  }
  const v = parsed.value
  if (!canRoleReassignStudents(ctx.role)) {
    return { ok: false, code: 'forbidden', message: 'Your role cannot reassign students.' }
  }

  const { data, error } = await supabase.rpc('ziro_reassign_students_to_teacher', {
    p_tenant_id: ctx.tenantId,
    p_student_ids: v.student_ids,
    p_target_teacher_id: v.target_teacher_id,
    p_expected_prior_teacher_id: v.expected_prior_teacher_id,
    p_idempotency_key: v.idempotency_key,
  })

  if (error) {
    return { ok: false, code: 'rpc_error', message: error.message || 'Reassign failed' }
  }

  const row = data as { ok?: boolean; code?: string; message?: string } | null
  if (row && typeof row === 'object' && row.ok === false) {
    return {
      ok: false,
      code: String(row.code ?? 'rejected'),
      message: String(row.message ?? 'Reassign rejected'),
    }
  }

  const msg =
    row && typeof row === 'object' && typeof row.message === 'string'
      ? row.message
      : 'Students reassigned.'

  await logAudit({
    tenantId: ctx.tenantId,
    performedBy: ctx.profileId,
    userName: ctx.userName,
    userRole: ctx.role ?? 'unknown',
    action: 'ziro_reassign_students',
    tableName: 'students',
    recordId: v.student_ids.join(','),
    newValue: {
      target_teacher_id: v.target_teacher_id,
      expected_prior_teacher_id: v.expected_prior_teacher_id,
      idempotency_key: v.idempotency_key,
      rpc: row,
    },
  })

  return { ok: true, message: msg }
}
