import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  forceResendAllUnsentLeads,
  getUnsentLeadBufferEntries,
  type LeadBufferEntry,
} from '../../lib/leadFailsafe'

function formatTs(ts: number | null): string {
  return ts ? new Date(ts).toLocaleString() : 'n/a'
}

export default function LeadFailsafePanel() {
  const [entries, setEntries] = useState<LeadBufferEntry[]>([])
  const [busy, setBusy] = useState(false)
  const [lastRun, setLastRun] = useState<string>('n/a')

  const refresh = useCallback(() => {
    setEntries(getUnsentLeadBufferEntries())
  }, [])

  useEffect(() => {
    refresh()
    const timer = window.setInterval(refresh, 15_000)
    const onStorage = (e: StorageEvent) => {
      if (e.key?.includes('lead_submit_')) refresh()
    }
    window.addEventListener('storage', onStorage)
    return () => {
      clearInterval(timer)
      window.removeEventListener('storage', onStorage)
    }
  }, [refresh])

  const rows = useMemo(() => entries.slice(0, 20), [entries])

  const onForceResend = useCallback(async () => {
    if (busy) return
    setBusy(true)
    try {
      await forceResendAllUnsentLeads()
      setLastRun(new Date().toLocaleString())
      refresh()
    } finally {
      setBusy(false)
    }
  }, [busy, refresh])

  return (
    <div
      style={{
        marginTop: 18,
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 14,
        background: 'rgba(255,255,255,0.02)',
        padding: 14,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 10 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 800, color: '#e8eaf4' }}>Lead Failsafe Queue</div>
          <div style={{ fontSize: 11, color: 'rgba(184,188,208,0.85)' }}>
            Unsent: {entries.length} · Last force resend: {lastRun}
          </div>
        </div>
        <button
          type="button"
          onClick={onForceResend}
          disabled={busy}
          style={{
            padding: '8px 12px',
            borderRadius: 10,
            border: '1px solid rgba(57,255,20,0.4)',
            background: 'rgba(57,255,20,0.12)',
            color: '#d9ffe0',
            fontSize: 12,
            fontWeight: 700,
            cursor: busy ? 'wait' : 'pointer',
          }}
        >
          {busy ? 'Resending…' : 'Force Resend'}
        </button>
      </div>

      {rows.length === 0 ? (
        <div style={{ fontSize: 12, color: 'rgba(184,188,208,0.8)' }}>No unsent leads in local backup queue.</div>
      ) : (
        <div style={{ display: 'grid', gap: 8 }}>
          {rows.map((entry) => (
            <div
              key={entry.id}
              style={{
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: 10,
                padding: '8px 10px',
                background: 'rgba(7,10,20,0.4)',
              }}
            >
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', fontSize: 11, color: 'rgba(184,188,208,0.92)' }}>
                <span>Status: {entry.status}</span>
                <span>Retries: {entry.retryCount}</span>
                <span>Created: {formatTs(entry.timestamp)}</span>
                <span>Last Attempt: {formatTs(entry.lastAttempt)}</span>
              </div>
              <div style={{ marginTop: 4, fontSize: 11, color: 'rgba(232,234,244,0.92)' }}>
                {(entry.payload.email as string | undefined) ?? 'no-email'} · {(entry.payload.first_name as string | undefined) ?? 'no-name'}
              </div>
              {entry.lastError ? (
                <div style={{ marginTop: 4, fontSize: 11, color: '#fda4af' }}>Error: {entry.lastError}</div>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
