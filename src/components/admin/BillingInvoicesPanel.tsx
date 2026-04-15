import { useState, useMemo } from 'react'
import { ChevronDown, ChevronRight, Search, FileText, ExternalLink } from 'lucide-react'
import MusicLoader from '../shared/MusicLoader'
import { useAuthContext } from '../../app/AuthContext'
import {
  useSquareInvoiceSummary,
  useSquareInvoicesInfinite,
  getInvoiceMonthBounds,
  type InvoicePanelStatusFilter,
  type InvoiceDatePreset,
} from '../../hooks/useBillingPage'

function dollars(cents: number | null | undefined): string {
  if (cents == null || cents === 0) return '$0.00'
  const abs = Math.abs(cents) / 100
  return `${cents < 0 ? '-' : ''}$${abs.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

const glass: React.CSSProperties = {
  background: 'rgba(255,255,255,0.03)',
  border: '1px solid rgba(255,255,255,0.06)',
  borderRadius: 16,
  padding: 16,
}

const selectStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: 8,
  padding: '8px 10px',
  color: '#E0E0F4',
  fontSize: 13,
  minHeight: 36,
  cursor: 'pointer',
  flex: '1 1 140px',
  maxWidth: 220,
}

/** Visually hidden, available to screen readers (captions, loading text). */
const srOnly: React.CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: 'hidden',
  clip: 'rect(0, 0, 0, 0)',
  clipPath: 'inset(50%)',
  whiteSpace: 'nowrap',
  border: 0,
}

// —— Copy: Square hosted invoice links (not PDFs / not file downloads) ——
/** Hover / keyboard tooltip on column header and each link. */
const SQUARE_LINK_TITLE =
  'Opens the hosted invoice on Square in a new browser tab. Not a PDF or file download.'

/** Accessible name for icon-only links; `familyLabel` disambiguates rows (WCAG 2.4.4). */
function squareLinkAriaLabel(familyLabel: string): string {
  const row = familyLabel === '—' ? 'invoice not linked to a family' : familyLabel
  return `Open hosted invoice in Square in a new tab — ${row}`
}

function squareLinkMissingTitle(familyLabel: string): string {
  const row = familyLabel === '—' ? 'Invoice not linked to a family' : familyLabel
  return `No hosted invoice link from Square for ${row}`
}

function squareLinkMissingAriaLabel(familyLabel: string): string {
  const row = familyLabel === '—' ? 'invoice not linked to a family' : familyLabel
  return `No hosted invoice link — ${row}`
}

const INVOICES_PANEL_HELP = [
  'Payment reconciliation only — lesson schedules and recurrence are managed in Lessonpreneur, not in Square.',
  'Default: invoices dated this month, plus any overdue unpaid invoices (any date). Use Date range for Full history or a custom period. Use Search family to match a family name; widen the date range to see that family’s older invoices.',
  'An em dash (—) under Family means this Square row is not linked to a Lessonpreneur family (customer or email match missing on sync).',
  'View in Square opens the hosted invoice on square.com in a new tab—a web page, not a PDF or file download.',
].join(' ')

const INVOICES_TABLE_CAPTION_SR =
  'Invoices from Square. View in Square links open the hosted invoice on square.com in a new tab; they are web pages, not downloads.'

/** DOM ids for label associations and landmarks (stable for tests / a11y). */
const IDS = {
  section: 'billing-invoices-panel',
  expanded: 'billing-invoices-expanded',
  filters: 'billing-invoices-filters',
  familySearch: 'billing-invoices-family-search',
  location: 'billing-invoices-location',
  datePreset: 'billing-invoices-date-preset',
  customFrom: 'billing-invoices-custom-from',
  customTo: 'billing-invoices-custom-to',
  status: 'billing-invoices-status',
  help: 'billing-invoices-help',
  customRange: 'billing-invoices-custom-range',
} as const

type Props = {
  isStudioDirector: boolean
  directorLocationId?: string
  activeLocations: { id: string; name: string }[]
}

export default function BillingInvoicesPanel({ isStudioDirector, directorLocationId, activeLocations }: Props) {
  const { tenantId } = useAuthContext()
  const [expanded, setExpanded] = useState(false)
  const [invLocation, setInvLocation] = useState('')
  const [invDatePreset, setInvDatePreset] = useState<InvoiceDatePreset>('this_month')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [invStatus, setInvStatus] = useState<InvoicePanelStatusFilter>('operating')
  const [invSearch, setInvSearch] = useState('')

  const effectiveLocation = isStudioDirector ? (directorLocationId ?? '') : invLocation

  const { data: summary, isLoading: summaryLoading } = useSquareInvoiceSummary(
    effectiveLocation || undefined,
    true,
  )

  const listQuery = useSquareInvoicesInfinite({
    tenantId,
    locationId: effectiveLocation,
    datePreset: invDatePreset,
    customFrom,
    customTo,
    statusFilter: invStatus,
    search: invSearch,
    enabled: expanded,
  })

  const flatRows = useMemo(
    () => listQuery.data?.pages.flatMap((p) => p.rows) ?? [],
    [listQuery.data?.pages],
  )
  const totalLoaded = flatRows.length
  const totalCount = listQuery.data?.pages[0]?.totalCount ?? 0
  const hasMore = listQuery.hasNextPage
  const listInitialLoading = listQuery.isLoading

  return (
    <section
      id={IDS.section}
      style={{ ...glass, marginBottom: 20 }}
      aria-label="Square invoices"
      data-tour-id="billing-invoices-panel"
    >
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls={expanded ? IDS.expanded : undefined}
        onClick={() => setExpanded((e) => !e)}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          width: '100%',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          padding: 0,
          gap: 12,
          textAlign: 'left',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          <span aria-hidden style={{ display: 'inline-flex' }}>
            {expanded ? <ChevronDown size={18} color="#D4226A" /> : <ChevronRight size={18} color="#A0A0C8" />}
          </span>
          <FileText size={18} style={{ color: '#D4226A', flexShrink: 0 }} aria-hidden />
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#E0E0F4' }}>Invoices</div>
            {/* minHeight reserves two lines so summary text does not reflow the panel when data arrives */}
            <div style={{ marginTop: 2, minHeight: 36, lineHeight: 1.4 }} role="status">
              {summaryLoading ? (
                <div style={{ fontSize: 12, color: '#606088' }}>Loading summary…</div>
              ) : summary ? (
                <div style={{ fontSize: 12, color: '#A0A0C8' }}>
                  Operating view {summary.monthOperating} · Paid this month {summary.paidThisMonth} · Overdue unpaid (any date){' '}
                  {summary.overdueUnpaid}
                </div>
              ) : (
                <div style={{ fontSize: 12, color: '#606088' }}>No invoice data</div>
              )}
            </div>
          </div>
        </div>
        <span style={{ fontSize: 11, color: '#606088', flexShrink: 0 }}>
          {expanded ? 'Hide invoice list' : 'Show invoice list'}
        </span>
      </button>

      {/* Skeleton + reserved height while collapsed avoids CLS when recent rows appear after summary loads */}
      {!expanded && summaryLoading && (
        <div
          style={{
            marginTop: 12,
            paddingTop: 12,
            borderTop: '1px solid rgba(255,255,255,0.06)',
            fontSize: 11,
            color: '#8080A8',
            minHeight: 108,
          }}
        >
          <div style={{ height: 11, width: '62%', borderRadius: 4, background: 'rgba(255,255,255,0.06)', marginBottom: 10 }} />
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              style={{
                marginTop: i === 0 ? 0 : 4,
                display: 'flex',
                justifyContent: 'space-between',
                gap: 8,
                alignItems: 'center',
              }}
            >
              <div style={{ height: 11, flex: 1, maxWidth: '42%', borderRadius: 4, background: 'rgba(255,255,255,0.05)' }} />
              <div style={{ height: 11, flex: 1, borderRadius: 4, background: 'rgba(255,255,255,0.04)' }} />
            </div>
          ))}
        </div>
      )}
      {!expanded && !summaryLoading && summary && summary.recent.length > 0 && (
        <div
          style={{
            marginTop: 12,
            paddingTop: 12,
            borderTop: '1px solid rgba(255,255,255,0.06)',
            fontSize: 11,
            color: '#8080A8',
          }}
        >
          Recent by invoice date ({summary.recent.length}):{' '}
          {summary.recent.map((r) => (
            <div key={r.id} style={{ marginTop: 4, display: 'flex', justifyContent: 'space-between', gap: 8 }}>
              <span style={{ color: '#C0C0E0' }}>{r.family_name ?? '—'}</span>
              <span>
                {r.invoice_date ?? '—'} · {r.status} · {dollars(r.requested_amount)}
              </span>
            </div>
          ))}
        </div>
      )}

      {expanded && (
        <div
          id={IDS.expanded}
          style={{ marginTop: 16, borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 14 }}
        >
          <div
            id={IDS.filters}
            role="group"
            aria-label="Invoice list filters"
            style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 12, alignItems: 'flex-end' }}
          >
            {!isStudioDirector && (
              <div style={{ flex: '1 1 160px' }}>
                <label
                  htmlFor={IDS.location}
                  style={{ fontSize: 10, color: '#A0A0C8', display: 'block', marginBottom: 4 }}
                >
                  Location
                </label>
                <select
                  id={IDS.location}
                  name="billing_invoices_location"
                  value={invLocation}
                  onChange={(e) => setInvLocation(e.target.value)}
                  style={{ ...selectStyle, width: '100%', maxWidth: 'none' }}
                >
                  <option value="">All locations</option>
                  {activeLocations.map((loc) => (
                    <option key={loc.id} value={loc.id}>
                      {loc.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {isStudioDirector && (
              <div
                role="group"
                aria-label={`Studio location: ${activeLocations.find((l) => l.id === directorLocationId)?.name ?? 'your location'}`}
                style={{ fontSize: 12, color: '#A0A0C8' }}
              >
                Location:{' '}
                <span style={{ color: '#E0E0F4' }}>
                  {activeLocations.find((l) => l.id === directorLocationId)?.name ?? 'Your location'}
                </span>
              </div>
            )}
            <div style={{ flex: '1 1 160px' }}>
              <label
                htmlFor={IDS.datePreset}
                style={{ fontSize: 10, color: '#A0A0C8', display: 'block', marginBottom: 4 }}
              >
                Date range
              </label>
              <select
                id={IDS.datePreset}
                name="billing_invoices_date_preset"
                aria-controls={invDatePreset === 'custom' ? IDS.customRange : undefined}
                value={invDatePreset}
                onChange={(e) => {
                  const v = e.target.value as InvoiceDatePreset
                  setInvDatePreset(v)
                  if (v === 'custom') {
                    const now = new Date()
                    const { monthStart, nextMonthStart } = getInvoiceMonthBounds(now)
                    const last = new Date(nextMonthStart)
                    last.setDate(last.getDate() - 1)
                    const lastStr = `${last.getFullYear()}-${String(last.getMonth() + 1).padStart(2, '0')}-${String(last.getDate()).padStart(2, '0')}`
                    setCustomFrom(monthStart)
                    setCustomTo(lastStr)
                  }
                }}
                style={{ ...selectStyle, width: '100%', maxWidth: 'none' }}
              >
                <option value="this_month">This month (default)</option>
                <option value="prev_month">Previous month</option>
                <option value="custom">Custom range</option>
                <option value="all">Full history</option>
              </select>
            </div>
            {invDatePreset === 'custom' && (
              <div
                id={IDS.customRange}
                role="group"
                aria-label="Custom invoice date range"
                style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'flex-end' }}
              >
                <div>
                  <label
                    htmlFor={IDS.customFrom}
                    style={{ fontSize: 10, color: '#A0A0C8', display: 'block', marginBottom: 4 }}
                  >
                    From
                  </label>
                  <input
                    id={IDS.customFrom}
                    name="billing_invoices_custom_from"
                    type="date"
                    value={customFrom}
                    onChange={(e) => setCustomFrom(e.target.value)}
                    style={{ ...selectStyle, maxWidth: 160 }}
                  />
                </div>
                <div>
                  <label htmlFor={IDS.customTo} style={{ fontSize: 10, color: '#A0A0C8', display: 'block', marginBottom: 4 }}>
                    To
                  </label>
                  <input
                    id={IDS.customTo}
                    name="billing_invoices_custom_to"
                    type="date"
                    value={customTo}
                    onChange={(e) => setCustomTo(e.target.value)}
                    style={{ ...selectStyle, maxWidth: 160 }}
                  />
                </div>
              </div>
            )}
            <div style={{ flex: '1 1 160px' }}>
              <label htmlFor={IDS.status} style={{ fontSize: 10, color: '#A0A0C8', display: 'block', marginBottom: 4 }}>
                Status
              </label>
              <select
                id={IDS.status}
                name="billing_invoices_status"
                value={invStatus}
                onChange={(e) => setInvStatus(e.target.value as InvoicePanelStatusFilter)}
                style={{ ...selectStyle, width: '100%', maxWidth: 'none' }}
              >
                <option value="operating">Operating (this month + overdue)</option>
                <option value="open">Open (scheduled, not due yet)</option>
                <option value="overdue">Overdue only</option>
                <option value="paid">Paid</option>
                <option value="all">All statuses in range</option>
              </select>
            </div>
            <div style={{ flex: '2 1 200px', minWidth: 0 }}>
              <label
                htmlFor={IDS.familySearch}
                style={{ fontSize: 10, color: '#A0A0C8', display: 'block', marginBottom: 4 }}
              >
                Search family
              </label>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: 8,
                  padding: '0 10px',
                  minHeight: 36,
                }}
              >
                <Search size={14} style={{ color: '#606088', flexShrink: 0 }} aria-hidden focusable={false} />
                <input
                  id={IDS.familySearch}
                  name="billing_invoices_family_search"
                  type="search"
                  placeholder="Family name…"
                  autoComplete="off"
                  enterKeyHint="search"
                  value={invSearch}
                  onChange={(e) => setInvSearch(e.target.value)}
                  style={{
                    background: 'none',
                    border: 'none',
                    outline: 'none',
                    color: '#E0E0F4',
                    fontSize: 13,
                    width: '100%',
                    padding: '8px 0',
                  }}
                />
              </div>
            </div>
          </div>

          <p
            id={IDS.help}
            style={{ fontSize: 10, color: '#606088', margin: '0 0 10px', lineHeight: 1.35 }}
          >
            {INVOICES_PANEL_HELP}
          </p>

          {listInitialLoading && flatRows.length === 0 ? (
            <div
              role="status"
              aria-live="polite"
              style={{
                minHeight: 320,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'stretch',
                justifyContent: 'center',
                gap: 12,
                padding: '20px 0',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 10 }}>
                <MusicLoader size={24} />
                <span style={srOnly}>Loading invoice list…</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {[0, 1, 2, 3, 4, 5].map((i) => (
                  <div
                    key={i}
                    style={{
                      height: 36,
                      borderRadius: 6,
                      background: 'rgba(255,255,255,0.04)',
                    }}
                  />
                ))}
              </div>
            </div>
          ) : flatRows.length === 0 ? (
            <div role="status" style={{ textAlign: 'center', padding: 24, color: '#606088', fontSize: 13 }}>
              No invoices match the current filters.
            </div>
          ) : (
            <>
              <div style={{ overflowX: 'auto', position: 'relative' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <caption style={srOnly}>{INVOICES_TABLE_CAPTION_SR}</caption>
                  <thead>
                    <tr style={{ color: '#A0A0C8', textAlign: 'left' }}>
                      <th scope="col" style={{ padding: '8px 6px', fontWeight: 600 }}>
                        Family
                      </th>
                      <th scope="col" style={{ padding: '8px 6px', fontWeight: 600 }}>
                        Invoice date
                      </th>
                      <th scope="col" style={{ padding: '8px 6px', fontWeight: 600 }}>
                        Due
                      </th>
                      <th scope="col" style={{ padding: '8px 6px', fontWeight: 600 }}>
                        Status
                      </th>
                      <th scope="col" style={{ padding: '8px 6px', fontWeight: 600, textAlign: 'right' }}>
                        Amount
                      </th>
                      <th
                        scope="col"
                        style={{ padding: '8px 6px', fontWeight: 600, textAlign: 'center' }}
                        title={SQUARE_LINK_TITLE}
                      >
                        View in Square
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {flatRows.map((row) => (
                      <tr key={row.id} style={{ borderTop: '1px solid rgba(255,255,255,0.05)', color: '#E0E0F4' }}>
                        <td style={{ padding: '8px 6px', fontWeight: 600 }}>{row.family_name}</td>
                        <td style={{ padding: '8px 6px', color: '#A0A0C8' }}>{row.invoice_date ?? '—'}</td>
                        <td style={{ padding: '8px 6px', color: '#A0A0C8' }}>{row.due_date ?? '—'}</td>
                        <td style={{ padding: '8px 6px' }}>{row.status}</td>
                        <td style={{ padding: '8px 6px', textAlign: 'right', color: '#FFB800', fontWeight: 600 }}>
                          {dollars(row.requested_amount)}
                        </td>
                        <td style={{ padding: '8px 6px', textAlign: 'center' }}>
                          {row.public_url ? (
                            <a
                              href={row.public_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              title={SQUARE_LINK_TITLE}
                              aria-label={squareLinkAriaLabel(row.family_name)}
                              style={{ color: '#D4226A', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                            >
                              <ExternalLink size={14} aria-hidden focusable={false} />
                            </a>
                          ) : (
                            <span
                              style={{ color: '#505068' }}
                              title={squareLinkMissingTitle(row.family_name)}
                              aria-label={squareLinkMissingAriaLabel(row.family_name)}
                            >
                              —
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }}>
                <span style={{ fontSize: 11, color: '#606088' }}>
                  Showing {totalLoaded} of {totalCount} invoices
                </span>
                {hasMore && (
                  <button
                    type="button"
                    onClick={() => listQuery.fetchNextPage()}
                    disabled={listQuery.isFetchingNextPage}
                    aria-label={
                      listQuery.isFetchingNextPage ? 'Loading more invoices' : 'Load more invoices in this list'
                    }
                    style={{
                      background: 'rgba(212,34,106,0.15)',
                      border: '1px solid rgba(212,34,106,0.35)',
                      color: '#D4226A',
                      borderRadius: 8,
                      padding: '8px 16px',
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: listQuery.isFetchingNextPage ? 'wait' : 'pointer',
                    }}
                  >
                    {listQuery.isFetchingNextPage ? 'Loading…' : 'Load more'}
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </section>
  )
}
