import { useState, useMemo, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { X, Download } from 'lucide-react'
import { useFamilyActivityLog, type ActivityEvent } from '../../hooks/useFamilies'

/* ── Event type → icon + color mapping ── */
const EVENT_ICON_MAP: Record<string, { icon: string; color: string }> = {
  session_completed: { icon: '✅', color: '#4ADE80' },
  sub_session:       { icon: '✅', color: '#A78BFA' },
  callout:           { icon: '⚠️', color: '#FFB800' },
  fifth_week:        { icon: '📅', color: '#38BDF8' },
  cancelled:         { icon: '❌', color: '#F87171' },
  billing_status:    { icon: '💳', color: '#A78BFA' },
  payment_failed:    { icon: '💳', color: '#F87171' },
  rate_changed:      { icon: '💰', color: '#FFB800' },
  notification:      { icon: '🔔', color: '#2DD4BF' },
  invoice_created:   { icon: '📄', color: '#4ADE80' },
  other:             { icon: '•',  color: '#9CA3AF' },
}

function getEventMeta(type: string) {
  return EVENT_ICON_MAP[type] ?? EVENT_ICON_MAP.other
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function formatTime(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  })
}

/* ── CSV export helper ── */
function exportToCsv(events: ActivityEvent[], familyName: string) {
  const header = 'Date,Type,Description,Detail'
  const rows = events.map((e) => {
    const escape = (v: string) => `"${(v ?? '').replace(/"/g, '""')}"`
    return [escape(e.date), escape(e.type), escape(e.description), escape(e.detail ?? '')].join(',')
  })
  const csv = [header, ...rows].join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${familyName.replace(/\s+/g, '_')}_activity_log.csv`
  a.click()
  URL.revokeObjectURL(url)
}

/* ── Component ── */
export default function FamilyActivityLogModal({
  familyId,
  familyName,
  onClose,
}: {
  familyId: string
  familyName: string
  onClose: () => void
}) {
  const [limit, setLimit] = useState(50)
  const [search, setSearch] = useState('')

  const { data: events = [], isLoading, isFetching } = useFamilyActivityLog(familyId, limit)

  const filtered = useMemo(() => {
    if (!search.trim()) return events
    const q = search.toLowerCase()
    return events.filter(
      (e) =>
        e.description.toLowerCase().includes(q) ||
        e.type.toLowerCase().includes(q) ||
        (e.detail ?? '').toLowerCase().includes(q),
    )
  }, [events, search])

  const handleLoadMore = useCallback(() => {
    setLimit((prev) => prev + 50)
  }, [])

  const handleExport = useCallback(() => {
    exportToCsv(filtered, familyName)
  }, [filtered, familyName])

  /* Close on backdrop click */
  const handleBackdrop = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (e.target === e.currentTarget) onClose()
    },
    [onClose],
  )

  const content = (
    <div
      onClick={handleBackdrop}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 10003,
        background: 'rgba(2, 2, 9, 0.85)',
        backdropFilter: 'blur(12px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 900,
          maxHeight: 'calc(100vh - 48px)',
          background: '#141224',
          borderRadius: 16,
          border: '1px solid rgba(255,255,255,0.06)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* ── Header ── */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '20px 24px',
            borderBottom: '1px solid rgba(255,255,255,0.06)',
            flexShrink: 0,
          }}
        >
          <div>
            <h2
              style={{
                margin: 0,
                fontSize: 20,
                fontWeight: 800,
                color: '#E0E0F4',
                fontFamily: "'Plus Jakarta Sans', sans-serif",
              }}
            >
              Activity Log
            </h2>
            <p style={{ margin: '4px 0 0', fontSize: 13, color: 'rgba(224,224,244,0.5)' }}>
              {familyName} Family
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button
              onClick={handleExport}
              disabled={filtered.length === 0}
              title="Export CSV"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '8px 14px',
                borderRadius: 8,
                border: '1px solid rgba(255,255,255,0.1)',
                background: 'rgba(255,255,255,0.04)',
                color: '#E0E0F4',
                fontSize: 13,
                fontWeight: 600,
                cursor: filtered.length === 0 ? 'not-allowed' : 'pointer',
                opacity: filtered.length === 0 ? 0.4 : 1,
                transition: 'background 0.15s',
              }}
              onMouseEnter={(e) => {
                if (filtered.length > 0) e.currentTarget.style.background = 'rgba(255,255,255,0.08)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(255,255,255,0.04)'
              }}
            >
              <Download size={14} />
              Export
            </button>

            <button
              onClick={onClose}
              aria-label="Close"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 36,
                height: 36,
                borderRadius: 8,
                border: '1px solid rgba(255,255,255,0.1)',
                background: 'rgba(255,255,255,0.04)',
                color: '#E0E0F4',
                cursor: 'pointer',
                transition: 'background 0.15s',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(255,88,88,0.15)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(255,255,255,0.04)'
              }}
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* ── Search bar ── */}
        <div style={{ padding: '16px 24px 0', flexShrink: 0 }}>
          <input
            type="text"
            placeholder="Search events..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              width: '100%',
              padding: '10px 14px',
              borderRadius: 8,
              border: '1px solid rgba(255,255,255,0.08)',
              background: 'rgba(255,255,255,0.03)',
              color: '#E0E0F4',
              fontSize: 14,
              outline: 'none',
              fontFamily: "'Plus Jakarta Sans', sans-serif",
              boxSizing: 'border-box',
            }}
          />
        </div>

        {/* ── Body ── */}
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '12px 24px 24px',
          }}
        >
          {isLoading ? (
            <div
              style={{
                display: 'flex',
                justifyContent: 'center',
                padding: '48px 0',
                color: 'rgba(224,224,244,0.4)',
                fontSize: 14,
              }}
            >
              Loading activity...
            </div>
          ) : filtered.length === 0 ? (
            <div
              style={{
                display: 'flex',
                justifyContent: 'center',
                padding: '48px 0',
                color: 'rgba(224,224,244,0.4)',
                fontSize: 14,
              }}
            >
              {search ? 'No events match your search.' : 'No activity recorded yet.'}
            </div>
          ) : (
            <>
              {/* ── Table header ── */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '140px 36px 1fr 1fr',
                  gap: 8,
                  padding: '8px 12px',
                  fontSize: 11,
                  fontWeight: 700,
                  color: 'rgba(224,224,244,0.35)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  borderBottom: '1px solid rgba(255,255,255,0.06)',
                  position: 'sticky',
                  top: 0,
                  background: '#141224',
                  zIndex: 1,
                }}
              >
                <span>Date</span>
                <span />
                <span>Description</span>
                <span>Detail</span>
              </div>

              {/* ── Rows ── */}
              {filtered.map((event) => {
                const meta = getEventMeta(event.type)
                return (
                  <div
                    key={event.id}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '140px 36px 1fr 1fr',
                      gap: 8,
                      alignItems: 'center',
                      padding: '10px 12px',
                      borderBottom: '1px solid rgba(255,255,255,0.03)',
                      transition: 'background 0.12s',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = 'rgba(255,255,255,0.02)'
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'transparent'
                    }}
                  >
                    {/* Date + time */}
                    <div>
                      <div style={{ fontSize: 13, color: '#E0E0F4', fontWeight: 600 }}>
                        {formatDate(event.date)}
                      </div>
                      <div style={{ fontSize: 11, color: 'rgba(224,224,244,0.35)', marginTop: 2 }}>
                        {formatTime(event.date)}
                      </div>
                    </div>

                    {/* Icon */}
                    <div
                      style={{
                        fontSize: 16,
                        textAlign: 'center',
                        filter: `drop-shadow(0 0 4px ${meta.color}40)`,
                      }}
                      title={event.type.replace(/_/g, ' ')}
                    >
                      {meta.icon}
                    </div>

                    {/* Description */}
                    <div style={{ fontSize: 13, color: '#E0E0F4', lineHeight: 1.5 }}>
                      {event.description}
                    </div>

                    {/* Detail */}
                    <div
                      style={{
                        fontSize: 12,
                        color: 'rgba(224,224,244,0.45)',
                        lineHeight: 1.5,
                      }}
                    >
                      {event.detail ?? '—'}
                    </div>
                  </div>
                )
              })}

              {/* ── Load more ── */}
              {events.length >= limit && (
                <div style={{ display: 'flex', justifyContent: 'center', padding: '20px 0 4px' }}>
                  <button
                    onClick={handleLoadMore}
                    disabled={isFetching}
                    style={{
                      padding: '10px 28px',
                      borderRadius: 8,
                      border: '1px solid rgba(255,255,255,0.1)',
                      background: 'rgba(255,255,255,0.04)',
                      color: '#E0E0F4',
                      fontSize: 13,
                      fontWeight: 600,
                      cursor: isFetching ? 'not-allowed' : 'pointer',
                      opacity: isFetching ? 0.5 : 1,
                      transition: 'background 0.15s',
                    }}
                    onMouseEnter={(e) => {
                      if (!isFetching) e.currentTarget.style.background = 'rgba(255,255,255,0.08)'
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'rgba(255,255,255,0.04)'
                    }}
                  >
                    {isFetching ? 'Loading...' : `Load more (${events.length} loaded)`}
                  </button>
                </div>
              )}
            </>
          )}
        </div>

        {/* ── Footer count ── */}
        {!isLoading && filtered.length > 0 && (
          <div
            style={{
              padding: '12px 24px',
              borderTop: '1px solid rgba(255,255,255,0.06)',
              fontSize: 12,
              color: 'rgba(224,224,244,0.35)',
              textAlign: 'right',
              flexShrink: 0,
            }}
          >
            {search && filtered.length !== events.length
              ? `${filtered.length} of ${events.length} events shown`
              : `${events.length} event${events.length === 1 ? '' : 's'}`}
          </div>
        )}
      </div>
    </div>
  )

  return createPortal(content, document.body)
}
