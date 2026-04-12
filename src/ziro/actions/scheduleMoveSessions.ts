import { supabase } from '../../lib/supabase'
import { logAudit } from '../../lib/auditLog'
import type { UserRole } from '../../lib/types'
import type { ZiroActionContext, ZiroActionResult } from './executeZiroAction'

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export interface ZiroScheduleMoveEntry {
  source_block_id: string
  target_block_id: string
  expected_student_id?: string | null
}

export interface ZiroScheduleMoveProposal {
  moves: ZiroScheduleMoveEntry[]
}

export interface ZiroScheduleMovePayload extends ZiroScheduleMoveProposal {
  idempotency_key: string
  /** Studio director cross-teacher confirmation — move indices from preflight. */
  override_ack?: ZiroScheduleMoveOverrideAck | null
  /** Default true server-side; all-or-nothing when false. */
  apply_partial?: boolean
}

export interface ZiroScheduleMoveOverrideAck {
  cross_teacher: number[]
}

export type ZiroScheduleMovePreflightClassification = 'safe' | 'blocked' | 'override_required'

export interface ZiroScheduleMovePreflightRow {
  index: number
  source_block_id: string
  target_block_id: string
  classification: ZiroScheduleMovePreflightClassification
  reason_code: string | null
  message: string | null
  flags?: { cross_teacher?: boolean }
}

export interface ZiroScheduleMovePreflightOk {
  ok: true
  moves: ZiroScheduleMovePreflightRow[]
  summary: {
    safe_count: number
    blocked_count: number
    override_required_count: number
  }
}

export interface ZiroScheduleMoveRpcRow {
  ok?: boolean
  code?: string
  message?: string
  moves_applied?: number
  applied_moves?: unknown
  failed_moves?: unknown
}

function isUuid(s: string): boolean {
  return UUID_RE.test(s.trim())
}

export function validateZiroScheduleMoveProposal(
  raw: unknown,
): { ok: true; value: ZiroScheduleMoveProposal } | { ok: false; message: string } {
  if (raw === null || typeof raw !== 'object') {
    return { ok: false, message: 'Invalid proposal' }
  }
  const o = raw as Record<string, unknown>
  const moves = o.moves
  if (!Array.isArray(moves) || moves.length < 1 || moves.length > 20) {
    return { ok: false, message: 'moves must be a non-empty array (max 20)' }
  }
  const normalized: ZiroScheduleMoveEntry[] = []
  for (const m of moves) {
    if (m === null || typeof m !== 'object') {
      return { ok: false, message: 'Each move must be an object' }
    }
    const e = m as Record<string, unknown>
    const src = e.source_block_id
    const tgt = e.target_block_id
    if (typeof src !== 'string' || !isUuid(src) || typeof tgt !== 'string' || !isUuid(tgt)) {
      return { ok: false, message: 'Each move needs valid source_block_id and target_block_id UUIDs' }
    }
    if (src === tgt) {
      return { ok: false, message: 'Source and target blocks must differ' }
    }
    let exp: string | null = null
    if ('expected_student_id' in e && e.expected_student_id != null && e.expected_student_id !== '') {
      if (typeof e.expected_student_id !== 'string' || !isUuid(e.expected_student_id)) {
        return { ok: false, message: 'expected_student_id must be a valid UUID when set' }
      }
      exp = e.expected_student_id.trim()
    }
    normalized.push({
      source_block_id: src.trim(),
      target_block_id: tgt.trim(),
      expected_student_id: exp,
    })
  }
  const ids = new Set<string>()
  for (const m of normalized) {
    ids.add(m.source_block_id)
    ids.add(m.target_block_id)
  }
  if (ids.size !== normalized.length * 2) {
    return { ok: false, message: 'Each block id may appear only once across the batch' }
  }
  return { ok: true, value: { moves: normalized } }
}

function validateOverrideAck(raw: unknown): { ok: true; value: ZiroScheduleMoveOverrideAck } | { ok: false; message: string } {
  if (raw === null || raw === undefined) {
    return { ok: true, value: { cross_teacher: [] } }
  }
  if (typeof raw !== 'object') {
    return { ok: false, message: 'override_ack must be an object' }
  }
  const o = raw as Record<string, unknown>
  const ct = o.cross_teacher
  if (ct === undefined) {
    return { ok: true, value: { cross_teacher: [] } }
  }
  if (!Array.isArray(ct)) {
    return { ok: false, message: 'override_ack.cross_teacher must be an array of indices' }
  }
  const out: number[] = []
  for (const x of ct) {
    if (typeof x !== 'number' || !Number.isInteger(x) || x < 0 || x > 19) {
      return { ok: false, message: 'override_ack.cross_teacher indices must be integers 0–19' }
    }
    out.push(x)
  }
  return { ok: true, value: { cross_teacher: [...new Set(out)].sort((a, b) => a - b) } }
}

export function validateZiroScheduleMovePayload(
  raw: unknown,
): { ok: true; value: ZiroScheduleMovePayload } | { ok: false; message: string } {
  if (raw === null || typeof raw !== 'object') {
    return { ok: false, message: 'Invalid payload' }
  }
  const o = raw as Record<string, unknown>
  const idem = o.idempotency_key
  if (typeof idem !== 'string' || idem.trim().length < 8) {
    return { ok: false, message: 'idempotency_key is required' }
  }
  const { idempotency_key: _ik, override_ack: oa, apply_partial: ap, ...rest } = o
  void _ik
  const pr = validateZiroScheduleMoveProposal(rest)
  if (!pr.ok) return pr
  const oack = validateOverrideAck(oa)
  if (!oack.ok) return oack
  let apply_partial = true
  if (ap !== undefined) {
    if (typeof ap !== 'boolean') {
      return { ok: false, message: 'apply_partial must be a boolean when set' }
    }
    apply_partial = ap
  }
  return {
    ok: true,
    value: {
      ...pr.value,
      idempotency_key: idem.trim(),
      override_ack: oack.value,
      apply_partial,
    },
  }
}

const MOVE_ROLES: UserRole[] = ['owner', 'admin', 'company_director', 'studio_director']

function canRoleMoveSchedule(role: UserRole | null): boolean {
  if (!role) return false
  return (MOVE_ROLES as string[]).includes(role)
}

function rpcJson(data: unknown): ZiroScheduleMoveRpcRow | null {
  if (data === null || typeof data !== 'object') return null
  return data as ZiroScheduleMoveRpcRow
}

function parsePreflightMoves(data: unknown): ZiroScheduleMovePreflightRow[] {
  if (!Array.isArray(data)) return []
  const out: ZiroScheduleMovePreflightRow[] = []
  for (const row of data) {
    if (row === null || typeof row !== 'object') continue
    const r = row as Record<string, unknown>
    const idx = r.index
    const classification = r.classification
    if (typeof idx !== 'number' || typeof classification !== 'string') continue
    out.push({
      index: idx,
      source_block_id: String(r.source_block_id ?? ''),
      target_block_id: String(r.target_block_id ?? ''),
      classification: classification as ZiroScheduleMovePreflightClassification,
      reason_code: r.reason_code === null || r.reason_code === undefined ? null : String(r.reason_code),
      message: r.message === null || r.message === undefined ? null : String(r.message),
      flags:
        r.flags && typeof r.flags === 'object'
          ? (r.flags as { cross_teacher?: boolean })
          : undefined,
    })
  }
  return out
}

/** Read-only: same conflict rules as execute; no writes. */
export async function preflightZiroScheduleMoves(
  proposal: ZiroScheduleMoveProposal,
  tenantId: string,
): Promise<{ ok: true; value: ZiroScheduleMovePreflightOk } | { ok: false; code: string; message: string }> {
  const movesJson = proposal.moves.map((m) => ({
    source_block_id: m.source_block_id,
    target_block_id: m.target_block_id,
    ...(m.expected_student_id != null ? { expected_student_id: m.expected_student_id } : {}),
  }))

  const { data, error } = await supabase.rpc('ziro_preflight_schedule_moves', {
    p_tenant_id: tenantId,
    p_moves: movesJson,
  })

  if (error) {
    return { ok: false, code: 'rpc_error', message: error.message || 'Preflight failed' }
  }

  const row = data as Record<string, unknown> | null
  if (!row || row.ok === false) {
    return {
      ok: false,
      code: String(row?.code ?? 'rejected'),
      message: String(row?.message ?? 'Preflight rejected'),
    }
  }

  const moves = parsePreflightMoves(row.moves)
  const summary = row.summary as Record<string, unknown> | undefined
  return {
    ok: true,
    value: {
      moves,
      summary: {
        safe_count: typeof summary?.safe_count === 'number' ? summary.safe_count : 0,
        blocked_count: typeof summary?.blocked_count === 'number' ? summary.blocked_count : 0,
        override_required_count:
          typeof summary?.override_required_count === 'number' ? summary.override_required_count : 0,
      },
    },
  }
}

/**
 * From preflight rows, pick moves that may execute: safe, or override_required when acked.
 */
export function pickMovesForExecute(
  proposal: ZiroScheduleMoveProposal,
  preflight: ZiroScheduleMovePreflightOk,
  crossTeacherAck: boolean,
): { moves: ZiroScheduleMoveEntry[]; override_ack: ZiroScheduleMoveOverrideAck } {
  const override_ack: ZiroScheduleMoveOverrideAck = { cross_teacher: [] }
  const moves: ZiroScheduleMoveEntry[] = []

  for (const row of preflight.moves) {
    if (row.classification === 'safe') {
      moves.push(proposal.moves[row.index])
      continue
    }
    if (
      row.classification === 'override_required' &&
      row.reason_code === 'cross_teacher' &&
      crossTeacherAck
    ) {
      moves.push(proposal.moves[row.index])
      override_ack.cross_teacher.push(row.index)
    }
  }

  override_ack.cross_teacher.sort((a, b) => a - b)
  return { moves, override_ack }
}

export function preflightFingerprint(proposal: ZiroScheduleMoveProposal): string {
  return JSON.stringify(proposal.moves)
}

function parseFailedMoves(raw: unknown): Array<{ index: number; message: string; reason_code?: string | null }> {
  if (!Array.isArray(raw)) return []
  return raw
    .map((x) => {
      if (x === null || typeof x !== 'object') return null
      const o = x as Record<string, unknown>
      const idx = o.index
      const msg = o.message
      if (typeof idx !== 'number' || typeof msg !== 'string') return null
      return {
        index: idx,
        message: msg,
        reason_code:
          o.reason_code === null || o.reason_code === undefined
            ? null
            : String(o.reason_code),
      }
    })
    .filter(Boolean) as Array<{ index: number; message: string; reason_code?: string | null }>
}

export async function executeZiroScheduleMoveSessions(
  payload: unknown,
  ctx: ZiroActionContext,
): Promise<ZiroActionResult> {
  const parsed = validateZiroScheduleMovePayload(payload)
  if (!parsed.ok) {
    return { ok: false, code: 'validation', message: parsed.message }
  }
  if (!canRoleMoveSchedule(ctx.role)) {
    return { ok: false, code: 'forbidden', message: 'Your role cannot move schedule sessions.' }
  }

  const v = parsed.value
  const movesJson = v.moves.map((m) => ({
    source_block_id: m.source_block_id,
    target_block_id: m.target_block_id,
    ...(m.expected_student_id != null ? { expected_student_id: m.expected_student_id } : {}),
  }))

  const overrideAck = v.override_ack ?? { cross_teacher: [] }

  const { data, error } = await supabase.rpc('ziro_move_schedule_sessions', {
    p_tenant_id: ctx.tenantId,
    p_moves: movesJson,
    p_idempotency_key: v.idempotency_key,
    p_override_ack: overrideAck,
    p_apply_partial: v.apply_partial !== false,
  })

  if (error) {
    return { ok: false, code: 'rpc_error', message: error.message || 'Schedule move failed' }
  }

  const row = rpcJson(data)
  if (row && row.ok === false) {
    return {
      ok: false,
      code: String(row.code ?? 'rejected'),
      message: String(row.message ?? 'Schedule move rejected'),
      scheduleMove: {
        movesApplied: typeof row.moves_applied === 'number' ? row.moves_applied : 0,
        failedMoves: parseFailedMoves(row.failed_moves),
      },
    }
  }

  const movesApplied = typeof row?.moves_applied === 'number' ? row.moves_applied : 0
  const failed = parseFailedMoves(row?.failed_moves)
  const msg =
    row && typeof row.message === 'string' ? row.message : 'Schedule updated.'

  if (movesApplied > 0) {
    await logAudit({
      tenantId: ctx.tenantId,
      performedBy: ctx.profileId,
      userName: ctx.userName,
      userRole: ctx.role ?? 'unknown',
      action: 'ziro_move_schedule_sessions',
      tableName: 'schedule_blocks',
      recordId: v.moves.map((m) => m.source_block_id).join(','),
      newValue: { moves: v.moves, idempotency_key: v.idempotency_key, rpc: row },
    })
  }

  return {
    ok: true,
    message: msg,
    scheduleMove: {
      movesApplied,
      failedMoves: failed,
      partial: movesApplied > 0 && failed.length > 0,
    },
  }
}
