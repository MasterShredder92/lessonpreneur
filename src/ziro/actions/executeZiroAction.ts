import { logAudit } from '../../lib/auditLog'

import { logZiroStructuredAction } from '../../services/aiObservability'

import type { UserRole } from '../../lib/types'

import { supabase } from '../../lib/supabase'

import { executeZiroReassignStudents } from './reassignStudents'

import { executeZiroScheduleMoveSessions } from './scheduleMoveSessions'



export type ZiroActionId =

  | 'crm.navigate'

  | 'crm.audit_ping'

  | 'crm.reassign_students'

  | 'crm.move_schedule_sessions'



export interface ZiroActionContext {

  tenantId: string

  profileId: string

  userName: string

  role: UserRole | null

  /** ai_conversations.id when known (links tool execution to chat session). */

  conversationId?: string | null

}



export interface ZiroScheduleMoveOutcome {

  movesApplied: number

  failedMoves: Array<{ index: number; message: string; reason_code?: string | null }>

  partial?: boolean

}



export type ZiroActionResult =

  | { ok: true; message: string; scheduleMove?: ZiroScheduleMoveOutcome }

  | { ok: false; code: string; message: string; scheduleMove?: ZiroScheduleMoveOutcome }



const DEDUPE = new Map<string, number>()

const DEDUPE_MS = 8_000
const DEDUPE_CLEANUP_INTERVAL = 60_000

let lastCleanup = Date.now()
function cleanupDedupe() {
  const now = Date.now()
  if (now - lastCleanup < DEDUPE_CLEANUP_INTERVAL) return
  lastCleanup = now
  for (const [key, timestamp] of DEDUPE) {
    if (now - timestamp > DEDUPE_MS * 3) {
      DEDUPE.delete(key)
    }
  }
}



function dedupeKey(id: ZiroActionId, payload: unknown): string {

  return `${id}:${JSON.stringify(payload)}`

}



/**

 * Single entry point for structured CRM side-effects initiated from Ziro.

 * Add new actions here with explicit validation — never call Supabase directly from raw model output without this layer.

 */

export async function executeZiroAction(

  input: { actionId: ZiroActionId; payload: unknown },

  ctx: ZiroActionContext,

): Promise<ZiroActionResult> {
  cleanupDedupe()

  const key = dedupeKey(input.actionId, input.payload)

  const now = Date.now()

  const last = DEDUPE.get(key)

  if (last && now - last < DEDUPE_MS) {

    const result: ZiroActionResult = {

      ok: false,

      code: 'duplicate',

      message: 'This action was just submitted. Wait a moment before retrying.',

    }

    void logZiroStructuredAction({
      ctx,
      actionId: input.actionId,
      payload: input.payload,
      result,
      idempotencyKey: key,
      conversationId: ctx.conversationId,
    })

    return result

  }

  DEDUPE.set(key, now)

  // Server-side idempotency (multi-tab / refresh safe)
  try {
    const { data: existing } = await supabase
      .from('ziro_idempotency_keys')
      .select('id')
      .eq('key', key)
      .eq('tenant_id', ctx.tenantId)
      .maybeSingle()

    if (existing) {
      const duplicate: ZiroActionResult = {
        ok: false,
        code: 'duplicate',
        message: 'This action was already processed.',
      }

      void logZiroStructuredAction({
        ctx,
        actionId: input.actionId,
        payload: input.payload,
        result: duplicate,
        idempotencyKey: key,
        conversationId: ctx.conversationId,
      })

      return duplicate
    }
  } catch (e) {
    // If idempotency table is unavailable due to RLS or transient issues, fall back to in-memory dedupe.
    console.warn('[executeZiroAction] idempotency check failed, proceeding:', e)
  }



  let result: ZiroActionResult



  switch (input.actionId) {

    case 'crm.navigate': {

      const path = typeof input.payload === 'object' && input.payload && 'path' in input.payload

        ? String((input.payload as { path?: string }).path ?? '')

        : ''

      if (!path.startsWith('/admin')) {

        result = { ok: false, code: 'validation', message: 'Invalid navigation target.' }

        break

      }

      await logAudit({

        tenantId: ctx.tenantId,

        performedBy: ctx.profileId,

        userName: ctx.userName,

        userRole: ctx.role ?? 'unknown',

        action: 'ziro_navigate',

        tableName: 'ziro_action',

        recordId: path,

        newValue: { path },

      })

      window.dispatchEvent(new CustomEvent('ziro-navigate', { detail: { path } }))

      result = { ok: true, message: 'Navigating…' }

      break

    }

    case 'crm.audit_ping': {

      await logAudit({

        tenantId: ctx.tenantId,

        performedBy: ctx.profileId,

        userName: ctx.userName,

        userRole: ctx.role ?? 'unknown',

        action: 'ziro_audit_ping',

        tableName: 'ziro_action',

        recordId: ctx.tenantId,

        newValue: input.payload,

      })

      result = { ok: true, message: 'Logged.' }

      break

    }

    case 'crm.reassign_students': {

      result = await executeZiroReassignStudents(input.payload, ctx)

      break

    }

    case 'crm.move_schedule_sessions': {

      result = await executeZiroScheduleMoveSessions(input.payload, ctx)

      break

    }

    default:

      result = { ok: false, code: 'unknown_action', message: 'Unknown Ziro action.' }

  }



  void logZiroStructuredAction({
    ctx,
    actionId: input.actionId,
    payload: input.payload,
    result,
    idempotencyKey: key,
    conversationId: ctx.conversationId,
  })

  if (result.ok) {
    try {
      await supabase.from('ziro_idempotency_keys').insert({
        key,
        tenant_id: ctx.tenantId,
        action_id: input.actionId,
        created_at: new Date().toISOString(),
      })
    } catch (e) {
      console.warn('[executeZiroAction] idempotency record insert failed:', e)
    }
  }

  return result

}

