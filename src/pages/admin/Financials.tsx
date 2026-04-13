import { useState, useEffect, type CSSProperties } from 'react'
import { useAuthContext } from '../../app/AuthContext'
import {
  usePLSummary,
  useExpenses,
  useCreateExpense,
  useDeleteExpense,
  EXPENSE_CATEGORIES,
  usePaymentFactsSummary,
  useSyncSquarePaymentFacts,
  getCurrentMonthKey,
  shiftMonthKey,
  monthKeyToDateRange,
  monthKeyToSyncWindowIso,
} from '../../hooks/useFinancials'
import { useLocations } from '../../hooks/useLocations'
import { toast } from '../../components/shared/Toast'
import MusicLoader from '../../components/shared/MusicLoader'
import { Plus, Trash2, Download, ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react'
import { exportFinancials } from '../../hooks/useExport'
import { IssueContextProvider } from '../../contexts/IssueContext'
import ReportIssueButton from '../../components/shared/ReportIssueButton'

/** Whole dollars — location comparison & non-metric lines */
function dollars(cents: number): string {
  if (!cents) return '$0'
  return `$${(Math.abs(cents) / 100).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
}

function dollarsFull(cents: number): string {
  return `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

/** Metric cards — always USD with cents for scan consistency */
function moneyMetric(cents: number): string {
  const abs = Math.abs(cents) / 100
  const s = abs.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return cents < 0 ? `−${s}` : s
}

function formatMonthHeading(monthKey: string): string {
  const [y, m] = monthKey.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleString('en-US', { month: 'long', year: 'numeric' })
}

/** Short range line under month picker — UTC, matches synced reporting_date */
function formatUtcMonthRangeLine(monthKey: string): string {
  const { start, end } = monthKeyToDateRange(monthKey)
  const s = new Date(`${start}T12:00:00Z`)
  const e = new Date(`${end}T12:00:00Z`)
  const a = s.toLocaleString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
  const b = e.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
  return `Calendar month: ${a} – ${b} · UTC`
}

function formatUtcYmdLong(ymd: string): string {
  const d = new Date(`${ymd}T12:00:00Z`)
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
}

const glassSection: CSSProperties = {
  background: 'rgba(255,255,255,0.03)',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: 16,
  padding: '22px 22px 20px',
  marginBottom: 28,
  boxShadow: '0 8px 40px rgba(0,0,0,0.12)',
}

const LOCATION_COLORS: Record<string, string> = {
  Omaha: '#D41113', Gretna: '#00A651', Bellevue: '#A333FF', Elkhorn: '#00A5E8',
}

export default function Financials() {
  const { role, tenantId } = useAuthContext()
  const { data: pl, isLoading: plLoading } = usePLSummary()
  const [paymentMonthKey, setPaymentMonthKey] = useState(getCurrentMonthKey)
  const { data: payFacts, isLoading: payLoading, isError: payError, error: payErrorObj } = usePaymentFactsSummary(paymentMonthKey)
  const syncPaymentFacts = useSyncSquarePaymentFacts()
  const { data: expenses, isLoading: expLoading } = useExpenses()
  const { data: locations } = useLocations()
  const createExpense = useCreateExpense()
  const deleteExpense = useDeleteExpense()

  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState({ category: 'rent', description: '', amount: '', is_recurring: true, frequency: 'monthly' })
  const [showExpenseModal, setShowExpenseModal] = useState(false)
  const [expenseLocFilter, setExpenseLocFilter] = useState<string | null>(null)
  const [selectedLocIdx, setSelectedLocIdx] = useState(0)
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768)
  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 768)
    window.addEventListener('resize', handler)
    return () => window.removeEventListener('resize', handler)
  }, [])

  if (role !== 'owner' && role !== 'admin' && role !== 'company_director') {
    return <div className="page" style={{ padding: 40, textAlign: 'center', color: '#8080A8' }}>Owner, admin, or company director access only.</div>
  }

  const marginDelta = pl ? pl.marginPercent - pl.prevMonthMarginPercent : 0

  const handleAddExpense = async () => {
    const amountCents = Math.round(parseFloat(form.amount || '0') * 100)
    if (amountCents <= 0) { toast('Enter a valid amount', 'error'); return }
    try {
      await createExpense.mutateAsync({
        category: form.category,
        description: form.description || null,
        amount_cents: amountCents,
        location_id: expenseLocFilter || null,
        is_recurring: form.is_recurring,
        frequency: form.frequency,
        effective_date: null,
        end_date: null,
      } as any)
      toast('Expense added', 'success')
      setShowAdd(false)
      setForm({ category: 'rent', description: '', amount: '', is_recurring: true, frequency: 'monthly' })
    } catch (err: any) {
      toast(err.message ?? 'Failed to add expense', 'error')
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this expense?')) return
    try {
      await deleteExpense.mutateAsync(id)
      toast('Expense deleted', 'success')
    } catch (err: any) {
      toast(err.message ?? 'Failed to delete', 'error')
    }
  }

  // Group expenses by category
  const grouped = new Map<string, typeof expenses>()
  expenses?.forEach(e => {
    const list = grouped.get(e.category) ?? []
    list.push(e)
    grouped.set(e.category, list)
  })

  return (
    <IssueContextProvider page="Your Books — Financials">
    <div className="page">
      <div className="page-header">
        <h1>Financials</h1>
        <button onClick={() => { if (tenantId) exportFinancials(tenantId) }} style={{
          display: 'flex', alignItems: 'center', gap: 5, padding: '6px 14px', borderRadius: 6,
          fontSize: 11, fontWeight: 600, cursor: 'pointer', marginLeft: 'auto',
          background: 'rgba(255,255,255,0.04)', color: '#8080A8', border: '1px solid rgba(255,255,255,0.08)',
        }}><Download size={12} /> Export</button>
        <ReportIssueButton />
      </div>

      {/* ── Payment activity (Square facts) — separate from invoice AR below ── */}
      <div style={glassSection}>
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: 16,
            marginBottom: 18,
            borderBottom: '1px solid rgba(255,255,255,0.06)',
            paddingBottom: 18,
          }}
        >
          <div style={{ flex: '1 1 280px', minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 8 }}>
              <h2 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: '#E8E8FC', letterSpacing: '-0.02em' }}>
                Payment activity
              </h2>
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                  color: '#22C55E',
                  padding: '4px 10px',
                  borderRadius: 8,
                  background: 'rgba(34,197,94,0.12)',
                  border: '1px solid rgba(34,197,94,0.28)',
                }}
              >
                Square · synced
              </span>
            </div>
            <p style={{ fontSize: 12, color: '#9090B0', margin: 0, lineHeight: 1.55, maxWidth: 560 }}>
              Actual card and wallet charges and refunds from Square, matched to your locations. Use this to see cash movement and fees—not tuition invoices.
            </p>
          </div>

          <div
            style={{
              flexShrink: 0,
              display: 'flex',
              flexDirection: 'column',
              alignItems: isMobile ? 'stretch' : 'flex-end',
              gap: 6,
              minWidth: isMobile ? '100%' : 220,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: isMobile ? 'space-between' : 'flex-end', gap: 10 }}>
              <button
                type="button"
                aria-label="Previous month"
                onClick={() => setPaymentMonthKey(k => shiftMonthKey(k, -1))}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 40,
                  height: 40,
                  borderRadius: 12,
                  cursor: 'pointer',
                  border: '1px solid rgba(255,255,255,0.1)',
                  background: 'rgba(255,255,255,0.05)',
                  color: '#D0D0E8',
                }}
              >
                <ChevronLeft size={20} />
              </button>
              <div style={{ textAlign: 'center', flex: 1 }}>
                <div style={{ fontSize: 15, fontWeight: 800, color: '#F0F0FA', letterSpacing: '-0.02em' }}>
                  {formatMonthHeading(paymentMonthKey)}
                </div>
                <div style={{ fontSize: 11, color: '#707090', marginTop: 4, fontWeight: 500 }}>
                  {formatUtcMonthRangeLine(paymentMonthKey)}
                </div>
              </div>
              <button
                type="button"
                aria-label="Next month"
                onClick={() => setPaymentMonthKey(k => shiftMonthKey(k, 1))}
                disabled={paymentMonthKey >= getCurrentMonthKey()}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 40,
                  height: 40,
                  borderRadius: 12,
                  cursor: paymentMonthKey >= getCurrentMonthKey() ? 'not-allowed' : 'pointer',
                  opacity: paymentMonthKey >= getCurrentMonthKey() ? 0.35 : 1,
                  border: '1px solid rgba(255,255,255,0.1)',
                  background: 'rgba(255,255,255,0.05)',
                  color: '#D0D0E8',
                }}
              >
                <ChevronRight size={20} />
              </button>
            </div>
            <span style={{ fontSize: 10, color: '#606078', textAlign: isMobile ? 'center' : 'right' }}>
              Month filter is the full calendar month; totals only include rows already synced.
            </span>
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            marginBottom: 16,
            paddingBottom: 16,
            borderBottom: '1px solid rgba(255,255,255,0.05)',
          }}
        >
          <p style={{ margin: 0, fontSize: 12, color: '#8080A0', maxWidth: 420, lineHeight: 1.5 }}>
            Pulls read-only payment and refund facts from Square into Lessonpreneur. Does not change invoices or charge anyone.
          </p>
          <button
            type="button"
            disabled={syncPaymentFacts.isPending}
            onClick={() => {
              const win = monthKeyToSyncWindowIso(paymentMonthKey)
              syncPaymentFacts.mutate(win, {
                onSuccess: data => {
                  const p = data?.payments_upserted ?? 0
                  const r = data?.refunds_upserted ?? 0
                  const rid = data?.request_id
                  toast(
                    `Payment facts updated · ${p} payment rows · ${r} refund rows${rid ? ` · ${rid}` : ''}`,
                    'success',
                  )
                },
                onError: err => {
                  toast(err instanceof Error ? err.message : 'Sync failed', 'error')
                },
              })
            }}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              flexShrink: 0,
              padding: '10px 18px',
              borderRadius: 12,
              fontSize: 13,
              fontWeight: 700,
              cursor: syncPaymentFacts.isPending ? 'wait' : 'pointer',
              opacity: syncPaymentFacts.isPending ? 0.75 : 1,
              border: '1px solid rgba(212,34,106,0.35)',
              background: 'rgba(212,34,106,0.12)',
              color: '#F472B6',
            }}
          >
            <RefreshCw size={16} />
            {syncPaymentFacts.isPending ? 'Syncing…' : `Sync ${formatMonthHeading(paymentMonthKey)}`}
          </button>
        </div>

        {payError && (
          <div
            style={{
              padding: '14px 16px',
              borderRadius: 12,
              marginBottom: 16,
              background: 'rgba(248,113,113,0.08)',
              border: '1px solid rgba(248,113,113,0.25)',
              fontSize: 13,
              color: '#FCA5A5',
              lineHeight: 1.45,
            }}
          >
            {(payErrorObj as Error)?.message ?? 'Could not load payment activity. Try again or check your connection.'}
          </div>
        )}

        {payLoading ? (
          <div style={{ minHeight: 240, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <MusicLoader />
          </div>
        ) : payFacts ? (
          <>
            {payFacts.paymentRowCount + payFacts.refundRowCount === 0 ? (
              <div
                style={{
                  padding: '14px 16px',
                  borderRadius: 12,
                  marginBottom: 18,
                  background: 'rgba(96,96,128,0.12)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  fontSize: 13,
                  color: '#B0B0D0',
                  lineHeight: 1.5,
                }}
              >
                <strong style={{ color: '#D8D8F0' }}>No payment data for this month yet.</strong>{' '}
                Run <strong style={{ color: '#E8E8FC' }}>Sync {formatMonthHeading(paymentMonthKey)}</strong> above to pull Square payment and refund rows for this calendar window (read-only).
              </div>
            ) : payFacts.partialCalendarCoverage && payFacts.dataSpanMin && payFacts.dataSpanMax ? (
              <div
                style={{
                  padding: '14px 16px',
                  borderRadius: 12,
                  marginBottom: 18,
                  background: 'rgba(251,191,36,0.08)',
                  border: '1px solid rgba(251,191,36,0.35)',
                  fontSize: 13,
                  color: '#FCD34D',
                  lineHeight: 1.5,
                }}
              >
                <strong style={{ color: '#FDE68A' }}>Partial data for this calendar month.</strong> Rows in Lessonpreneur run{' '}
                <strong style={{ color: '#FFFBEB' }}>
                  {formatUtcYmdLong(payFacts.dataSpanMin)} – {formatUtcYmdLong(payFacts.dataSpanMax)}
                </strong>{' '}
                (UTC reporting dates). The month selector is the full month (
                {(() => {
                  const { start, end } = monthKeyToDateRange(paymentMonthKey)
                  return `${formatUtcYmdLong(start)} – ${formatUtcYmdLong(end)}`
                })()}
                {' '}
                UTC). Totals below sum only what is stored—missing days were either not synced or had no activity; run <strong style={{ color: '#FFFBEB' }}>Sync</strong> to pull the full month from Square.
              </div>
            ) : (
              <div
                style={{
                  padding: '12px 16px',
                  borderRadius: 12,
                  marginBottom: 18,
                  background: 'rgba(34,197,94,0.06)',
                  border: '1px solid rgba(34,197,94,0.22)',
                  fontSize: 12,
                  color: '#86EFAC',
                  lineHeight: 1.45,
                }}
              >
                <strong style={{ color: '#BBF7D0' }}>Data reaches month boundaries.</strong> Reporting dates in synced rows span{' '}
                {formatUtcYmdLong(payFacts.dataSpanMin!)} through {formatUtcYmdLong(payFacts.dataSpanMax!)} (UTC), matching the full calendar month range. Totals include all synced rows for this month.
                {payFacts.latestPaymentSyncedAt && (
                  <span style={{ display: 'block', marginTop: 8, fontSize: 11, color: '#6EE7B7', opacity: 0.9 }}>
                    Latest payment row sync: {new Date(payFacts.latestPaymentSyncedAt).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}
                  </span>
                )}
              </div>
            )}

            <div style={{ marginBottom: 6 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#707090', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                Summary
              </span>
            </div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: isMobile ? '1fr' : 'repeat(4, minmax(0, 1fr))',
                gap: 12,
                marginBottom: 22,
              }}
            >
              <PLCard
                label="Total collected"
                cents={payFacts.totalCollectedCents}
                color="#22C55E"
                compact={isMobile}
                money
                sub="Settled card & wallet payments (completed / approved)"
              />
              <PLCard
                label="Fees"
                cents={payFacts.feesCents}
                color="#F97316"
                compact={isMobile}
                money
                sub="Processing and application fees on those payments"
              />
              <PLCard
                label="Net total"
                cents={payFacts.netTotalCents}
                color="#38BDF8"
                compact={isMobile}
                money
                sub="After Square fees on each payment; refunds listed separately"
              />
              <PLCard
                label="Returns"
                cents={payFacts.returnsCents}
                color="#A78BFA"
                compact={isMobile}
                money
                sub="Refunds issued in this period (by refund date)"
              />
            </div>

            <div style={{ marginBottom: 6 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#707090', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                By tender type
              </span>
            </div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: isMobile ? '1fr' : 'repeat(4, minmax(0, 1fr))',
                gap: 12,
                marginBottom: 14,
              }}
            >
              <PLCard
                label="Tips"
                cents={payFacts.tipsCents}
                color="#FB7185"
                compact={isMobile}
                money
                sub="Tips on counted payments"
              />
              <PLCard
                label="Card"
                cents={payFacts.tenderCardCents}
                color="#D41113"
                compact={isMobile}
                money
                sub="Card-present and keyed card volume"
              />
              <PLCard
                label="Cash App"
                cents={payFacts.tenderCashAppCents}
                color="#00C853"
                compact={isMobile}
                money
                sub="Cash App Pay volume"
              />
              <PLCard
                label="Bank transfer"
                cents={payFacts.tenderBankTransferCents}
                color="#3B82F6"
                compact={isMobile}
                money
                sub="ACH / bank transfer volume"
              />
            </div>

            {payFacts.paymentRowCount === 0 && payFacts.refundRowCount === 0 ? (
              <p style={{ fontSize: 12, color: '#707090', margin: 0, fontStyle: 'italic' }}>
                No payment or refund data for this month. Sync a period that includes activity, or choose another month.
              </p>
            ) : (
              <p style={{ fontSize: 11, color: '#585878', margin: 0 }}>
                {payFacts.paymentRowCount} payment record{payFacts.paymentRowCount === 1 ? '' : 's'} · {payFacts.refundRowCount} refund
                {payFacts.refundRowCount === 1 ? '' : 's'} in range
              </p>
            )}
          </>
        ) : null}
      </div>

      {/* ── Invoice & planning (AR) — current calendar month, not payment cash ── */}
      {plLoading ? (
        <div style={{ ...glassSection, minHeight: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <MusicLoader />
        </div>
      ) : pl ? (
        <div style={glassSection}>
          <div style={{ marginBottom: 18, borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 8 }}>
              <h2 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: '#E8E8FC', letterSpacing: '-0.02em' }}>
                Tuition & invoices
              </h2>
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                  color: '#FFB800',
                  padding: '4px 10px',
                  borderRadius: 8,
                  background: 'rgba(255,184,0,0.1)',
                  border: '1px solid rgba(255,184,0,0.28)',
                }}
              >
                AR · this month
              </span>
            </div>
            <p style={{ fontSize: 12, color: '#9090B0', margin: 0, lineHeight: 1.55, maxWidth: 640 }}>
              {formatMonthHeading(getCurrentMonthKey())}: billed lesson amounts from synced Square invoices in Lessonpreneur (paid, unpaid, and scheduled). For billing and planning—not the same as cash collected above.
            </p>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: isMobile
                ? '1fr'
                : role === 'owner'
                  ? 'repeat(4, minmax(0, 1fr))'
                  : 'repeat(3, minmax(0, 1fr))',
              gap: 12,
              marginBottom: 0,
            }}
          >
            <PLCard
              label="Total invoiced (month)"
              cents={pl.syncedInvoiceMonthTotalCents}
              color="#22C55E"
              compact={isMobile}
              money
              sub="PAID + UNPAID + SCHEDULED · from invoice sync"
            />
            <PLCard
              label="Teacher payroll (estimate)"
              cents={-pl.teacherPayrollCents}
              color="#fb923c"
              compact={isMobile}
              money
              sub={`${((pl.teacherPayrollCents / Math.max(pl.syncedInvoiceMonthTotalCents, 1)) * 100).toFixed(0)}% of invoiced amount`}
            />
            <PLCard
              label="Operating expenses"
              cents={-pl.operatingExpensesCents}
              color="#EF4444"
              compact={isMobile}
              money
              sub={`${Object.keys(pl.expensesByCategory).length} categories in your books`}
            />
            {role === 'owner' && (
              <PLCard
                label="Owner take-home (estimate)"
                cents={pl.ownerTakeHomeCents}
                color="#FFB800"
                compact={isMobile}
                money
                highlight
                sub={`${pl.marginPercent.toFixed(1)}% margin${marginDelta !== 0 ? ` (${marginDelta > 0 ? '+' : ''}${marginDelta.toFixed(1)}% vs prior month)` : ''}`}
              />
            )}
          </div>
        </div>
      ) : null}

      {/* EXPENSE BUTTONS */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 28 }}>
        <button onClick={() => { setShowExpenseModal(true); setShowAdd(true) }} style={{
          flex: '0 0 60%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          padding: '12px 20px', borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: 'pointer',
          background: 'rgba(34,197,94,0.12)', color: '#22C55E', border: '1px solid rgba(34,197,94,0.3)',
        }}>
          <Plus size={16} /> Add Expense
        </button>
        <button onClick={() => { setShowExpenseModal(true); setShowAdd(false) }} style={{
          flex: '0 0 calc(40% - 10px)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          padding: '12px 16px', borderRadius: 10, fontSize: 12, fontWeight: 700, cursor: 'pointer',
          background: 'rgba(212,34,106,0.1)', color: '#D4226A', border: '1px solid rgba(212,34,106,0.25)',
        }}>
          View All Expenses
        </button>
      </div>

      {/* EXPENSE MODAL */}
      {showExpenseModal && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 9999,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)',
        }} onClick={e => { if (e.target === e.currentTarget) setShowExpenseModal(false) }}>
          <div style={{
            width: '95%', maxWidth: 640, maxHeight: '85vh', overflow: 'hidden',
            borderRadius: 18, background: '#12121E', border: '1px solid rgba(255,255,255,0.08)',
            display: 'flex', flexDirection: 'column',
            boxShadow: '0 24px 80px rgba(0,0,0,0.6)',
          }}>
            {/* Header */}
            <div style={{
              padding: '18px 22px 14px', borderBottom: '1px solid rgba(255,255,255,0.06)',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: '#E0E0F4' }}>Operating Expenses</h2>
                <span style={{ fontSize: 11, color: '#8080A8' }}>{expenses?.length ?? 0} items</span>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => setShowAdd(!showAdd)} style={{
                  display: 'flex', alignItems: 'center', gap: 5, padding: '6px 14px',
                  borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                  background: 'rgba(34,197,94,0.1)', color: '#22C55E', border: '1px solid rgba(34,197,94,0.2)',
                }}>
                  <Plus size={14} /> Add
                </button>
                <button onClick={() => setShowExpenseModal(false)} style={{
                  padding: '6px 12px', borderRadius: 8, fontSize: 16, cursor: 'pointer',
                  background: 'rgba(255,255,255,0.04)', color: '#8080A8', border: '1px solid rgba(255,255,255,0.08)',
                  lineHeight: 1,
                }}>
                  &times;
                </button>
              </div>
            </div>

            {/* Location filter pills */}
            <div style={{ padding: '10px 22px', display: 'flex', gap: 6, overflowX: 'auto', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
              <button onClick={() => setExpenseLocFilter(null)} style={{
                flexShrink: 0, padding: '4px 14px', borderRadius: 10, fontSize: 11, fontWeight: 700,
                cursor: 'pointer', whiteSpace: 'nowrap',
                background: expenseLocFilter === null ? '#D4226A' : 'transparent',
                color: expenseLocFilter === null ? '#fff' : '#8080A8',
                border: expenseLocFilter === null ? 'none' : '1px solid rgba(255,255,255,0.08)',
              }}>
                All
              </button>
              {locations?.filter((l: any) => l.is_active).map((l: any) => {
                const name = l.name.replace(' Music Lessons', '')
                const color = LOCATION_COLORS[name] ?? '#D4226A'
                const active = expenseLocFilter === l.id
                return (
                  <button key={l.id} onClick={() => setExpenseLocFilter(active ? null : l.id)} style={{
                    flexShrink: 0, padding: '4px 14px', borderRadius: 10, fontSize: 11, fontWeight: 700,
                    cursor: 'pointer', whiteSpace: 'nowrap',
                    background: active ? color : 'transparent',
                    color: active ? '#fff' : color,
                    border: active ? 'none' : `1px solid ${color}50`,
                  }}>
                    {name}
                  </button>
                )
              })}
            </div>

            {/* Scrollable content */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '14px 22px 22px' }}>
              {/* Add form */}
              {showAdd && (
                <div style={{
                  padding: 16, borderRadius: 12, marginBottom: 14,
                  background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)',
                }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
                    <select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} className="filter-select" style={{ fontSize: 12 }}>
                      {EXPENSE_CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.icon} {c.label}</option>)}
                    </select>
                    <input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="Owed to" className="filter-select" style={{ fontSize: 12 }} />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
                    <input value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} placeholder="$ Amount" type="number" step="0.01" className="filter-select" style={{ fontSize: 12 }} />
                    <select value={form.frequency} onChange={e => setForm({ ...form, frequency: e.target.value })} className="filter-select" style={{ fontSize: 12 }}>
                      <option value="monthly">Monthly</option>
                      <option value="quarterly">Quarterly</option>
                      <option value="annual">Annual</option>
                      <option value="one-time">One-time</option>
                    </select>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={() => setShowAdd(false)} style={{
                      flex: '0 0 40%', padding: '8px 14px', borderRadius: 8, fontSize: 12, fontWeight: 700,
                      background: 'rgba(239,68,68,0.1)', color: '#EF4444', border: '1px solid rgba(239,68,68,0.25)', cursor: 'pointer',
                    }}>
                      Cancel
                    </button>
                    <button onClick={handleAddExpense} disabled={createExpense.isPending} style={{
                      flex: '0 0 calc(60% - 8px)', padding: '8px 18px', borderRadius: 8, fontSize: 12, fontWeight: 700,
                      background: '#22C55E', color: '#000', border: 'none', cursor: 'pointer',
                      opacity: createExpense.isPending ? 0.5 : 1,
                    }}>
                      {createExpense.isPending ? 'Saving...' : 'Save'}
                    </button>
                  </div>
                </div>
              )}

              {/* Expense list grouped by category, filtered by location */}
              {expLoading ? <MusicLoader /> : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {EXPENSE_CATEGORIES.map(cat => {
                    const allItems = grouped.get(cat.value)
                    if (!allItems || allItems.length === 0) return null
                    const items = expenseLocFilter
                      ? allItems.filter(e => e.location_id === expenseLocFilter || !e.location_id)
                      : allItems
                    if (items.length === 0) return null
                    const catTotal = items.reduce((s, e) => s + e.amount_cents, 0)
                    return (
                      <div key={cat.value} style={{
                        padding: '10px 14px', borderRadius: 10,
                        background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)',
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                          <span style={{ fontSize: 12, fontWeight: 700, color: cat.color }}>{cat.icon} {cat.label}</span>
                          <span style={{ fontSize: 13, fontWeight: 700, color: '#E0E0F4', fontFamily: 'monospace' }}>{dollarsFull(catTotal)}/mo</span>
                        </div>
                        {items.map(e => (
                          <div key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', fontSize: 12 }}>
                            <span style={{ flex: 1, color: '#A0A0C8' }}>{e.description || '—'}</span>
                            <span style={{ color: '#606088', fontSize: 10 }}>{e.location_name ?? 'All'}</span>
                            <span style={{ color: '#C0C0E0', fontFamily: 'monospace', minWidth: 70, textAlign: 'right' }}>{dollarsFull(e.amount_cents)}</span>
                            <span style={{ fontSize: 9, color: '#606088' }}>{e.frequency}</span>
                            <button onClick={() => handleDelete(e.id)} style={{ background: 'none', border: 'none', color: '#363656', cursor: 'pointer', padding: 2 }}
                              onMouseEnter={ev => ev.currentTarget.style.color = '#EF4444'} onMouseLeave={ev => ev.currentTarget.style.color = '#363656'}>
                              <Trash2 size={12} />
                            </button>
                          </div>
                        ))}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* LOCATION COMPARISON — invoice basis (same month as tuition & invoices) */}
      {pl && pl.locationBreakdown.length > 0 && (() => {
        const mobileLocs = isMobile ? [pl.locationBreakdown[selectedLocIdx] ?? pl.locationBreakdown[0]] : pl.locationBreakdown
        return (
          <div style={{ marginBottom: 28 }}>
            <div className="section-header" style={{ marginBottom: isMobile ? 8 : undefined }}>
              <span className="section-label">By location · invoiced revenue</span>
              <div className="section-line" />
            </div>
            <p style={{ fontSize: 11, color: '#606088', margin: '0 0 14px', maxWidth: 640, lineHeight: 1.45 }}>
              {formatMonthHeading(getCurrentMonthKey())} · amounts follow the invoice sync, not payment activity above.
            </p>

            {/* Mobile: location picker pills */}
            {isMobile && (
              <div style={{ display: 'flex', gap: 6, marginBottom: 12, overflowX: 'auto', WebkitOverflowScrolling: 'touch' as any }}>
                {pl.locationBreakdown.map((loc, idx) => {
                  const color = LOCATION_COLORS[loc.locationName] ?? '#D4226A'
                  const active = idx === selectedLocIdx
                  return (
                    <button key={loc.locationId} onClick={() => setSelectedLocIdx(idx)} style={{
                      flexShrink: 0, padding: '4px 14px', borderRadius: 10, fontSize: 12, fontWeight: 700,
                      cursor: 'pointer', whiteSpace: 'nowrap', border: active ? 'none' : `1px solid ${color}50`,
                      background: active ? color : 'transparent', color: active ? '#fff' : color,
                    }}>
                      {loc.locationName}
                    </button>
                  )
                })}
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : `repeat(${pl.locationBreakdown.length}, 1fr)`, gap: 12 }}>
              {mobileLocs.map(loc => {
                const color = LOCATION_COLORS[loc.locationName] ?? '#D4226A'
                const locPayroll = Math.round(loc.revenueCents * 0.5)
                const locProfit = loc.revenueCents - locPayroll - loc.expensesCents
                const profitColor = locProfit >= 0 ? '#22C55E' : '#EF4444'
                return (
                  <div key={loc.locationId} style={{
                    padding: 16, borderRadius: 12,
                    background: 'rgba(255,255,255,0.02)', border: `1px solid ${color}25`,
                    borderTop: `3px solid ${color}`,
                  }}>
                    {!isMobile && <div style={{ fontSize: 15, fontWeight: 800, color, marginBottom: 12 }}>{loc.locationName}</div>}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: '#8080A8' }}>Invoiced</span>
                        <span style={{ color: '#E0E0F4', fontWeight: 600, fontFamily: 'monospace' }}>{dollars(loc.revenueCents)}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: '#8080A8' }}>Teacher Payroll</span>
                        <span style={{ color: '#fb923c', fontWeight: 600, fontFamily: 'monospace' }}>-{dollars(locPayroll)}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: '#8080A8' }}>Expenses</span>
                        <span style={{ color: '#E0E0F4', fontWeight: 600, fontFamily: 'monospace' }}>-{dollars(loc.expensesCents)}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: '#8080A8' }}>Students</span>
                        <span style={{ color: '#E0E0F4', fontWeight: 600 }}>{loc.studentCount}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: '#8080A8' }}>Cost/Student</span>
                        <span style={{ color: '#FFB800', fontWeight: 700, fontFamily: 'monospace' }}>{dollars(loc.costPerStudentCents)}/mo</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: '#8080A8' }}>Rev/Room</span>
                        <span style={{ color: '#22C55E', fontWeight: 700, fontFamily: 'monospace' }}>{dollars(loc.revenuePerRoomCents)}/mo</span>
                      </div>
                    </div>
                    {/* Location Profit */}
                    <div style={{
                      marginTop: 12, paddingTop: 10,
                      borderTop: '1px solid rgba(255,255,255,0.06)',
                      textAlign: 'center',
                    }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: '#8080A8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>
                        Location Profit
                      </div>
                      <div style={{ fontSize: 22, fontWeight: 800, color: profitColor, fontFamily: 'monospace', letterSpacing: '-0.02em' }}>
                        {locProfit < 0 ? '-' : ''}{dollars(Math.abs(locProfit))}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })()}
    </div>
    </IssueContextProvider>
  )
}

// ─── P&L Card ────────────────────────────────────────

function PLCard({
  label,
  cents,
  color,
  sub,
  highlight,
  compact,
  money,
}: {
  label: string
  cents: number
  color: string
  sub?: string
  highlight?: boolean
  compact?: boolean
  /** Use currency with cents — Financials metric cards */
  money?: boolean
}) {
  const value = money ? moneyMetric(cents) : `${cents < 0 ? '−' : ''}${dollars(Math.abs(cents))}`
  const valueSize = compact ? 20 : 26
  if (compact) {
    return (
      <div style={{
        padding: '12px 14px', borderRadius: 12,
        minHeight: 72,
        background: highlight ? `${color}08` : 'rgba(255,255,255,0.02)',
        border: `1px solid ${highlight ? `${color}30` : 'rgba(255,255,255,0.06)'}`,
        borderLeft: `3px solid ${color}`,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        gap: 10,
      }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: '#9090B0', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
          {sub && <div style={{ fontSize: 10, color: '#606088', marginTop: 3, lineHeight: 1.35 }}>{sub}</div>}
        </div>
        <div style={{
          fontSize: valueSize,
          fontWeight: 800,
          color: highlight ? color : '#E8E8FC',
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
          letterSpacing: '-0.02em',
          flexShrink: 0,
        }}>
          {value}
        </div>
      </div>
    )
  }
  return (
    <div style={{
      padding: '18px 18px 16px', borderRadius: 14,
      minHeight: 118,
      display: 'flex',
      flexDirection: 'column',
      background: highlight ? `${color}08` : 'rgba(255,255,255,0.02)',
      border: `1px solid ${highlight ? `${color}30` : 'rgba(255,255,255,0.06)'}`,
      borderTop: `3px solid ${color}`,
    }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: '#9090B0', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
        {label}
      </div>
      <div style={{
        fontSize: 28,
        fontWeight: 800,
        color: highlight ? color : '#E8E8FC',
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
        letterSpacing: '-0.02em',
        marginBottom: 'auto',
      }}>
        {value}
      </div>
      {sub && <div style={{ fontSize: 11, color: '#8080A8', marginTop: 8, lineHeight: 1.4 }}>{sub}</div>}
    </div>
  )
}
