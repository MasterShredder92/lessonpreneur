import { EDGE_FUNCTIONS } from './config'
import { safeFetch } from './safeFetch'

export type LeadBufferStatus = 'pending' | 'sent' | 'failed'

export interface LeadBufferEntry {
  id: string
  payload: Record<string, unknown>
  timestamp: number
  status: LeadBufferStatus
  lastAttempt: number | null
  retryCount: number
  lastError: string | null
  intakeSubmissionId: string | null
  leadId: string | null
}

const STORAGE_KEY = 'lead_submit_buffer_v1'
const LAST_SUCCESS_KEY = 'lead_submit_last_success_at'
const LAST_DEADMAN_ALERT_KEY = 'lead_submit_last_deadman_alert_at'
const RETENTION_MS = 7 * 24 * 60 * 60 * 1000
const RETRY_INTERVAL_MS = 5 * 60 * 1000
const DEADMAN_WINDOW_MS = 6 * 60 * 60 * 1000
const ALERT_RECIPIENT = import.meta.env.VITE_INTAKE_ALERT_EMAIL || 'adkinsguitarandmusic@gmail.com'

let workerTimer: number | null = null

function nowMs(): number {
  return Date.now()
}

function asArray(input: unknown): LeadBufferEntry[] {
  return Array.isArray(input) ? (input as LeadBufferEntry[]) : []
}

function readBuffer(): LeadBufferEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    return asArray(JSON.parse(raw))
  } catch {
    return []
  }
}

function writeBuffer(entries: LeadBufferEntry[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries))
}

function purgeExpired(entries: LeadBufferEntry[], now: number): LeadBufferEntry[] {
  return entries.filter((entry) => now - entry.timestamp <= RETENTION_MS)
}

function setLastSuccessAt(ts: number): void {
  localStorage.setItem(LAST_SUCCESS_KEY, String(ts))
}

function getLastSuccessAt(): number | null {
  const raw = localStorage.getItem(LAST_SUCCESS_KEY)
  const value = raw ? Number(raw) : NaN
  return Number.isFinite(value) ? value : null
}

function setLastDeadmanAlertAt(ts: number): void {
  localStorage.setItem(LAST_DEADMAN_ALERT_KEY, String(ts))
}

function getLastDeadmanAlertAt(): number | null {
  const raw = localStorage.getItem(LAST_DEADMAN_ALERT_KEY)
  const value = raw ? Number(raw) : NaN
  return Number.isFinite(value) ? value : null
}

function toIso(ts: number | null): string {
  return ts ? new Date(ts).toISOString() : 'n/a'
}

async function sendBackupAlert(subject: string, payload: Record<string, unknown>): Promise<void> {
  const html = `
    <div style="font-family: ui-monospace, SFMono-Regular, Menlo, monospace; line-height: 1.4;">
      <h2 style="margin:0 0 12px 0;">${subject}</h2>
      <pre style="white-space: pre-wrap; background: #0f172a; color: #e2e8f0; padding: 12px; border-radius: 8px;">${JSON.stringify(payload, null, 2)}</pre>
    </div>
  `
  try {
    await safeFetch(EDGE_FUNCTIONS.sendEmail, {
      timeoutMs: 10_000,
      body: {
        to: ALERT_RECIPIENT,
        subject,
        html,
        from_name: 'Lead Intake Failsafe',
      },
    })
  } catch (err) {
    console.warn('[leadFailsafe] backup alert failed', err)
  }
}

function makeId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${nowMs()}-${Math.random().toString(36).slice(2)}`
}

export function getLeadBufferEntries(): LeadBufferEntry[] {
  const now = nowMs()
  const pruned = purgeExpired(readBuffer(), now)
  writeBuffer(pruned)
  return pruned.sort((a, b) => b.timestamp - a.timestamp)
}

export function getUnsentLeadBufferEntries(): LeadBufferEntry[] {
  return getLeadBufferEntries().filter((entry) => entry.status !== 'sent')
}

export function bufferLeadSubmission(payload: Record<string, unknown>): string {
  const now = nowMs()
  const next: LeadBufferEntry = {
    id: makeId(),
    payload,
    timestamp: now,
    status: 'pending',
    lastAttempt: null,
    retryCount: 0,
    lastError: null,
    intakeSubmissionId: null,
    leadId: null,
  }
  const entries = purgeExpired(readBuffer(), now)
  entries.push(next)
  writeBuffer(entries)
  return next.id
}

export function markLeadSubmissionSent(entryId: string, result?: { intake_submission_id?: string; lead_id?: string }): void {
  const now = nowMs()
  const entries = purgeExpired(readBuffer(), now).map((entry) =>
    entry.id === entryId
      ? {
          ...entry,
          status: 'sent' as const,
          lastAttempt: now,
          lastError: null,
          intakeSubmissionId: result?.intake_submission_id ?? entry.intakeSubmissionId,
          leadId: result?.lead_id ?? entry.leadId,
        }
      : entry,
  )
  writeBuffer(entries)
  setLastSuccessAt(now)
}

export async function markLeadSubmissionFailed(entryId: string, errorMessage: string): Promise<void> {
  const now = nowMs()
  const entries = purgeExpired(readBuffer(), now).map((entry) =>
    entry.id === entryId
      ? {
          ...entry,
          status: 'failed' as const,
          lastAttempt: now,
          retryCount: entry.retryCount + 1,
          lastError: errorMessage,
        }
      : entry,
  )
  writeBuffer(entries)

  const failedEntry = entries.find((entry) => entry.id === entryId)
  if (failedEntry) {
    await sendBackupAlert('[Intake Failsafe] Lead submit failed', {
      reason: errorMessage,
      failed_at: toIso(now),
      entry_id: failedEntry.id,
      retry_count: failedEntry.retryCount,
      payload: failedEntry.payload,
    })
  }
}

async function attemptSend(entry: LeadBufferEntry): Promise<{ ok: true; leadId: string | null; intakeSubmissionId: string | null } | { ok: false; error: string }> {
  try {
    const result = await safeFetch<{
      success?: boolean
      error?: string
      lead_id?: string
      intake_submission_id?: string
    }>(EDGE_FUNCTIONS.publicLeadSubmit, {
      body: entry.payload,
      timeoutMs: 15_000,
    })
    if (result.success) {
      return {
        ok: true,
        leadId: result.lead_id ?? null,
        intakeSubmissionId: result.intake_submission_id ?? null,
      }
    }
    return { ok: false, error: result.error || 'Lead submit returned success=false' }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Unknown retry error' }
  }
}

export async function retryLeadBufferQueue(): Promise<{ sent: number; failed: number; total: number }> {
  const now = nowMs()
  const entries = purgeExpired(readBuffer(), now)
  let sent = 0
  let failed = 0

  for (const entry of entries) {
    if (entry.status === 'sent') continue
    const attempt = await attemptSend(entry)
    if (attempt.ok) {
      sent += 1
      Object.assign(entry, {
        status: 'sent' as const,
        lastAttempt: nowMs(),
        lastError: null,
        leadId: attempt.leadId,
        intakeSubmissionId: attempt.intakeSubmissionId,
      })
      setLastSuccessAt(nowMs())
    } else {
      failed += 1
      Object.assign(entry, {
        status: 'failed' as const,
        lastAttempt: nowMs(),
        retryCount: entry.retryCount + 1,
        lastError: attempt.error,
      })
      await sendBackupAlert('[Intake Failsafe] Retry failed', {
        reason: attempt.error,
        failed_at: toIso(nowMs()),
        entry_id: entry.id,
        retry_count: entry.retryCount,
        payload: entry.payload,
      })
    }
  }

  writeBuffer(entries)
  return { sent, failed, total: entries.filter((e) => e.status !== 'sent').length + sent }
}

async function runDeadmanSwitch(): Promise<void> {
  const now = nowMs()
  const lastSuccess = getLastSuccessAt()
  const lastAlert = getLastDeadmanAlertAt()
  const shouldAlert =
    (!lastSuccess || now - lastSuccess >= DEADMAN_WINDOW_MS) &&
    (!lastAlert || now - lastAlert >= DEADMAN_WINDOW_MS)

  if (!shouldAlert) return

  const unsent = getUnsentLeadBufferEntries()
  await sendBackupAlert('[Intake Failsafe] No leads received in 6 hours', {
    message: 'No leads received in 6 hours - check intake pipeline.',
    triggered_at: toIso(now),
    last_success_at: toIso(lastSuccess),
    unsent_count: unsent.length,
    unsent_ids: unsent.map((entry) => entry.id),
  })
  setLastDeadmanAlertAt(now)
}

async function workerTick(): Promise<void> {
  try {
    await retryLeadBufferQueue()
    await runDeadmanSwitch()
  } catch (err) {
    console.warn('[leadFailsafe] worker tick error', err)
  }
}

export function startLeadFailsafeWorker(): () => void {
  if (workerTimer != null) {
    return () => {}
  }
  void workerTick()
  workerTimer = window.setInterval(() => {
    void workerTick()
  }, RETRY_INTERVAL_MS)
  return () => {
    if (workerTimer != null) {
      clearInterval(workerTimer)
      workerTimer = null
    }
  }
}

export async function forceResendAllUnsentLeads(): Promise<{ sent: number; failed: number; total: number }> {
  return retryLeadBufferQueue()
}
