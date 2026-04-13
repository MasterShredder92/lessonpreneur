import { useState, useEffect, type CSSProperties } from 'react'
import { useAuthContext } from '../../app/AuthContext'
import {
  usePLSummary,
  useExpenses,
  useCreateExpense,
  useUpdateExpense,
  useDeleteExpense,
  EXPENSE_CATEGORIES,
  usePaymentFactsSummary,
  useSyncSquarePaymentFacts,
  getCurrentMonthKey,
  shiftMonthKey,
  monthKeyToDateRange,
  monthKeyToSyncWindowIso,
  type Expense,
} from '../../hooks/useFinancials'
import { useLocations } from '../../hooks/useLocations'
import { toast } from '../../components/shared/Toast'
import MusicLoader from '../../components/shared/MusicLoader'
import { Plus, Trash2, Download, ChevronLeft, ChevronRight, RefreshCw, Pencil, X } from 'lucide-react'
import { exportFinancials } from '../../hooks/useExport'
import { IssueContextProvider } from '../../contexts/IssueContext'
import ReportIssueButton from '../../components/shared/ReportIssueButton'

// ─── Formatters ───────────────────────────────────────

function dollars(cents: number): string {
  if (!cents) return '$0'
  return `$${(Math.abs(cents) / 100).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
}

function dollarsFull(cents: number): string {
  return `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function moneyMetric(cents: number): string {
  const abs = Math.abs(cents) / 100
  const s = abs.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return cents < 0 ? `−${s}` : s
}

function formatMonthHeading(monthKey: string): string {
  const [y, m] = monthKey.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleString('en-US', { month: 'long', year: 'numeric' })
}

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

// ─── Style constants ──────────────────────────────────

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

const labelStyle: CSSProperties = {
  display: 'block',
  fontSize: 10,
  fontWeight: 700,
  color: '#707090',
  textTransform: 'uppercase',
  letterSpacing: '0.07em',
  marginBottom: 6,
}

// ─── Types ────────────────────────────────────────────

type TabId = 'square' | 'expenses' | 'summary'

interface ExpenseForm {
  category: string
  description: string
  amount: string
  location_id: string
  is_recurring: boolean
  frequency: string
  effective_date: string
}

const EMPTY_FORM: ExpenseForm = {
  category: 'rent',
  description: '',
  amount: '',
  location_id: '',
  is_recurring: true,
  frequency: 'monthly',
  effective_date: '',
}

// ─── Expense Modal ────────────────────────────────────

function ExpenseFormModal({
  title,
  form,
  setForm,
  onSave,
  onClose,
  isPending,
  locations,
}: {
  title: string
  form: ExpenseForm
  setForm: (f: ExpenseForm) => void
  onSave: () => void
  onClose: () => void
  isPending: boolean
  locations: any[]
}) {
  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(8px)',
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{
        width: '95%', maxWidth: 520,
        borderRadius: 18, background: '#12121E',
        border: '1px solid rgba(255,255,255,0.1)',
        boxShadow: '0 24px 80px rgba(0,0,0,0.6)',
        display: 'flex', flexDirection: 'column',
      }}>
        {/* Modal header */}
        <div style={{
          padding: '18px 22px 16px',
          borderBottom: '1px solid rgba(255,255,255,0.07)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: '#E0E0F4' }}>{title}</h2>
          <button
            onClick={onClose}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: 30, height: 30, borderRadius: 8,
              background: 'rgba(255,255,255,0.05)', color: '#8080A8',
              border: '1px solid rgba(255,255,255,0.08)', cursor: 'pointer',
            }}
          >
            <X size={14} />
          </button>
        </div>

        {/* Form body */}
        <div style={{ padding: '20px 22px 22px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Row 1: Category + Location */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={labelStyle}>Category</label>
              <select
                value={form.category}
                onChange={e => setForm({ ...form, category: e.target.value })}
                className="filter-select"
                style={{ width: '100%' }}
              >
                {EXPENSE_CATEGORIES.map(c => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Location</label>
              <select
                value={form.location_id}
                onChange={e => setForm({ ...form, location_id: e.target.value })}
                className="filter-select"
                style={{ width: '100%' }}
              >
                <option value="">All Locations</option>
                {locations.filter((l: any) => l.is_active).map((l: any) => (
                  <option key={l.id} value={l.id}>{l.name.replace(' Music Lessons', '')}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Row 2: Description */}
          <div>
            <label style={labelStyle}>Description</label>
            <input
              value={form.description}
              onChange={e => setForm({ ...form, description: e.target.value })}
              placeholder="e.g. Studio rent, Amazon supplies"
              className="filter-select"
              style={{ width: '100%', boxSizing: 'border-box' }}
            />
          </div>

          {/* Row 3: Amount + Date */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={labelStyle}>Amount ($)</label>
              <input
                value={form.amount}
                onChange={e => setForm({ ...form, amount: e.target.value })}
                placeholder="0.00"
                type="number"
                step="0.01"
                min="0"
                className="filter-select"
                style={{ width: '100%', boxSizing: 'border-box' }}
              />
            </div>
            <div>
              <label style={labelStyle}>Effective Date</label>
              <input
                value={form.effective_date}
                onChange={e => setForm({ ...form, effective_date: e.target.value })}
                type="date"
                className="filter-select"
                style={{ width: '100%', boxSizing: 'border-box', colorScheme: 'dark' }}
              />
            </div>
          </div>

          {/* Row 4: Recurring toggle + Frequency */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, alignItems: 'start' }}>
            <div>
              <label style={labelStyle}>Recurring</label>
              <div style={{ display: 'flex', gap: 6, marginTop: 2 }}>
                <button
                  type="button"
                  onClick={() => setForm({ ...form, is_recurring: true, frequency: form.frequency === 'one-time' ? 'monthly' : form.frequency })}
                  style={{
                    flex: 1, padding: '8px 10px', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer',
                    background: form.is_recurring ? 'rgba(34,197,94,0.15)' : 'rgba(255,255,255,0.04)',
                    color: form.is_recurring ? '#22C55E' : '#505070',
                    border: form.is_recurring ? '1px solid rgba(34,197,94,0.35)' : '1px solid rgba(255,255,255,0.08)',
                  }}
                >
                  Yes
                </button>
                <button
                  type="button"
                  onClick={() => setForm({ ...form, is_recurring: false, frequency: 'one-time' })}
                  style={{
                    flex: 1, padding: '8px 10px', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer',
                    background: !form.is_recurring ? 'rgba(212,34,106,0.15)' : 'rgba(255,255,255,0.04)',
                    color: !form.is_recurring ? '#F472B6' : '#505070',
                    border: !form.is_recurring ? '1px solid rgba(212,34,106,0.35)' : '1px solid rgba(255,255,255,0.08)',
                  }}
                >
                  One-time
                </button>
              </div>
            </div>
            {form.is_recurring && (
              <div>
                <label style={labelStyle}>Frequency</label>
                <select
                  value={form.frequency}
                  onChange={e => setForm({ ...form, frequency: e.target.value })}
                  className="filter-select"
                  style={{ width: '100%' }}
                >
                  <option value="monthly">Monthly</option>
                  <option value="quarterly">Quarterly</option>
                  <option value="annual">Annual</option>
                </select>
              </div>
            )}
          </div>

          {/* Buttons */}
          <div style={{ display: 'flex', gap: 10, marginTop: 4, paddingTop: 4, borderTop: '1px solid rgba(255,255,255,0.05)' }}>
            <button
              onClick={onClose}
              style={{
                flex: '0 0 32%', padding: '10px 14px', borderRadius: 9, fontSize: 13, fontWeight: 700,
                background: 'rgba(255,255,255,0.04)', color: '#8080A8',
                border: '1px solid rgba(255,255,255,0.1)', cursor: 'pointer',
              }}
            >
              Cancel
            </button>
            <button
              onClick={onSave}
              disabled={isPending}
              style={{
                flex: 1, padding: '10px 18px', borderRadius: 9, fontSize: 13, fontWeight: 700,
                background: isPending ? 'rgba(34,197,94,0.15)' : '#22C55E',
                color: isPending ? '#22C55E' : '#000',
                border: isPending ? '1px solid rgba(34,197,94,0.3)' : 'none',
                cursor: isPending ? 'wait' : 'pointer',
                opacity: isPending ? 0.7 : 1,
              }}
            >
              {isPending ? 'Saving…' : 'Save Expense'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Main Component ───────────────────────────────────

export default function Financials() {
  const { role, tenantId } = useAuthContext()
  const { data: pl, isLoading: plLoading } = usePLSummary()
  const [paymentMonthKey, setPaymentMonthKey] = useState(getCurrentMonthKey)
  const { data: payFacts, isLoading: payLoading, isError: payError, error: payErrorObj } = usePaymentFactsSummary(paymentMonthKey)
  const syncPaymentFacts = useSyncSquarePaymentFacts()
  const { data: expenses, isLoading: expLoading } = useExpenses()
  const { data: locations } = useLocations()
  const createExpense = useCreateExpense()
  const updateExpense = useUpdateExpense()
  const deleteExpense = useDeleteExpense()

  const [activeTab, setActiveTab] = useState<TabId>('expenses')
  const [expenseLocFilter, setExpenseLocFilter] = useState<string | null>(null)
  const [selectedLocIdx, setSelectedLocIdx] = useState(0)
  const [showAddModal, setShowAddModal] = useState(false)
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null)
  const [addForm, setAddForm] = useState<ExpenseForm>(EMPTY_FORM)
  const [editForm, setEditForm] = useState<ExpenseForm>(EMPTY_FORM)
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768)

  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 768)
    window.addEventListener('resize', handler)
    return () => window.removeEventListener('resize', handler)
  }, [])

  if (role !== 'owner' && role !== 'admin' && role !== 'company_director') {
    return (
      <div className="page" style={{ padding: 40, textAlign: 'center', color: '#8080A8' }}>
        Owner, admin, or company director access only.
      </div>
    )
  }

  const marginDelta = pl ? pl.marginPercent - pl.prevMonthMarginPercent : 0

  const filteredExpenses = (expenses ?? []).filter(e =>
    expenseLocFilter === null || e.location_id === expenseLocFilter
  )
  const totalFilteredCents = filteredExpenses.reduce((s, e) => s + e.amount_cents, 0)

  const getCatMeta = (value: string) =>
    EXPENSE_CATEGORIES.find(c => c.value === value) ?? { label: value, color: '#8080A8', icon: '' }

  const openAddModal = () => {
    setAddForm({ ...EMPTY_FORM, location_id: expenseLocFilter ?? '' })
    setShowAddModal(true)
  }

  const handleAddExpense = async () => {
    const amountCents = Math.round(parseFloat(addForm.amount || '0') * 100)
    if (amountCents <= 0) { toast('Enter a valid amount', 'error'); return }
    try {
      await createExpense.mutateAsync({
        category: addForm.category,
        description: addForm.description || null,
        amount_cents: amountCents,
        location_id: addForm.location_id || null,
        is_recurring: addForm.is_recurring,
        frequency: addForm.frequency,
        effective_date: addForm.effective_date || null,
        end_date: null,
      } as any)
      toast('Expense added', 'success')
      setShowAddModal(false)
      setAddForm(EMPTY_FORM)
    } catch (err: any) {
      toast(err.message ?? 'Failed to add expense', 'error')
    }
  }

  const openEditModal = (e: Expense) => {
    setEditingExpense(e)
    setEditForm({
      category: e.category,
      description: e.description || '',
      amount: (e.amount_cents / 100).toFixed(2),
      location_id: e.location_id || '',
      is_recurring: e.is_recurring,
      frequency: e.frequency,
      effective_date: e.effective_date || '',
    })
  }

  const handleEditSave = async () => {
    if (!editingExpense) return
    const amountCents = Math.round(parseFloat(editForm.amount || '0') * 100)
    if (amountCents <= 0) { toast('Enter a valid amount', 'error'); return }
    try {
      await updateExpense.mutateAsync({
        id: editingExpense.id,
        category: editForm.category,
        description: editForm.description || null,
        amount_cents: amountCents,
        location_id: editForm.location_id || null,
        is_recurring: editForm.is_recurring,
        frequency: editForm.frequency,
        effective_date: editForm.effective_date || null,
      })
      toast('Expense updated', 'success')
      setEditingExpense(null)
    } catch (err: any) {
      toast(err.message ?? 'Failed to update expense', 'error')
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

  const tabStyle = (id: TabId): CSSProperties => ({
    flex: 1,
    padding: '10px 16px',
    borderRadius: 9,
    fontSize: 13,
    fontWeight: 700,
    cursor: 'pointer',
    border: 'none',
    background: activeTab === id ? 'rgba(212,34,106,0.15)' : 'transparent',
    color: activeTab === id ? '#F472B6' : '#60607A',
    outline: activeTab === id ? '1px solid rgba(212,34,106,0.25)' : 'none',
    letterSpacing: '-0.01em',
    transition: 'all 0.15s',
  })

  const locPill = (active: boolean, color: string): CSSProperties => ({
    padding: '5px 16px',
    borderRadius: 20,
    fontSize: 12,
    fontWeight: 700,
    cursor: 'pointer',
    border: active ? 'none' : `1px solid ${color}40`,
    background: active ? color : 'transparent',
    color: active ? '#fff' : color,
    whiteSpace: 'nowrap',
    flexShrink: 0,
  })

  const activeLocations = (locations ?? []).filter((l: any) => l.is_active)

  return (
    <IssueContextProvider page="Your Books — Financials">
      <div className="page">
        {/* ── Page header ── */}
        <div className="page-header">
          <h1>Financials</h1>
          <button
            onClick={() => { if (tenantId) exportFinancials(tenantId) }}
            style={{
              display: 'flex', alignItems: 'center', gap: 5, padding: '6px 14px', borderRadius: 6,
              fontSize: 11, fontWeight: 600, cursor: 'pointer', marginLeft: 'auto',
              background: 'rgba(255,255,255,0.04)', color: '#8080A8', border: '1px solid rgba(255,255,255,0.08)',
            }}
          >
            <Download size={12} /> Export
          </button>
          <ReportIssueButton />
        </div>

        {/* ── Tab bar ── */}
        <div style={{
          display: 'flex', gap: 4, marginBottom: 28,
          background: 'rgba(255,255,255,0.02)',
          borderRadius: 12, padding: 4,
          border: '1px solid rgba(255,255,255,0.08)',
        }}>
          <button style={tabStyle('square')} onClick={() => setActiveTab('square')}>Square Sync</button>
          <button style={tabStyle('expenses')} onClick={() => setActiveTab('expenses')}>Expenses</button>
          <button style={tabStyle('summary')} onClick={() => setActiveTab('summary')}>Summary</button>
        </div>

        {/* ══════════════════════════════════════════
            TAB: Square Sync
        ══════════════════════════════════════════ */}
        {activeTab === 'square' && (
          <div style={glassSection}>
            <div style={{
              display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start',
              justifyContent: 'space-between', gap: 16, marginBottom: 18,
              borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: 18,
            }}>
              <div style={{ flex: '1 1 280px', minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 8 }}>
                  <h2 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: '#E8E8FC', letterSpacing: '-0.02em' }}>
                    Payment activity
                  </h2>
                  <span style={{
                    fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
                    color: '#22C55E', padding: '4px 10px', borderRadius: 8,
                    background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.28)',
                  }}>
                    Square · synced
                  </span>
                </div>
                <p style={{ fontSize: 12, color: '#9090B0', margin: 0, lineHeight: 1.55, maxWidth: 560 }}>
                  Actual card and wallet charges and refunds from Square, matched to your locations. Use this to see cash movement and fees—not tuition invoices.
                </p>
              </div>

              <div style={{
                flexShrink: 0,
                display: 'flex', flexDirection: 'column',
                alignItems: isMobile ? 'stretch' : 'flex-end',
                gap: 6, minWidth: isMobile ? '100%' : 220,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: isMobile ? 'space-between' : 'flex-end', gap: 10 }}>
                  <button
                    type="button"
                    aria-label="Previous month"
                    onClick={() => setPaymentMonthKey(k => shiftMonthKey(k, -1))}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      width: 40, height: 40, borderRadius: 12, cursor: 'pointer',
                      border: '1px solid rgba(255,255,255,0.1)',
                      background: 'rgba(255,255,255,0.05)', color: '#D0D0E8',
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
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      width: 40, height: 40, borderRadius: 12,
                      cursor: paymentMonthKey >= getCurrentMonthKey() ? 'not-allowed' : 'pointer',
                      opacity: paymentMonthKey >= getCurrentMonthKey() ? 0.35 : 1,
                      border: '1px solid rgba(255,255,255,0.1)',
                      background: 'rgba(255,255,255,0.05)', color: '#D0D0E8',
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

            <div style={{
              display: 'flex', flexWrap: 'wrap', alignItems: 'center',
              justifyContent: 'space-between', gap: 12, marginBottom: 16,
              paddingBottom: 16, borderBottom: '1px solid rgba(255,255,255,0.05)',
            }}>
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
                  display: 'inline-flex', alignItems: 'center', gap: 8, flexShrink: 0,
                  padding: '10px 18px', borderRadius: 12, fontSize: 13, fontWeight: 700,
                  cursor: syncPaymentFacts.isPending ? 'wait' : 'pointer',
                  opacity: syncPaymentFacts.isPending ? 0.75 : 1,
                  border: '1px solid rgba(212,34,106,0.35)',
                  background: 'rgba(212,34,106,0.12)', color: '#F472B6',
                }}
              >
                <RefreshCw size={16} />
                {syncPaymentFacts.isPending ? 'Syncing…' : `Sync ${formatMonthHeading(paymentMonthKey)}`}
              </button>
            </div>

            {payError && (
              <div style={{
                padding: '14px 16px', borderRadius: 12, marginBottom: 16,
                background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.25)',
                fontSize: 13, color: '#FCA5A5', lineHeight: 1.45,
              }}>
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
                  <div style={{
                    padding: '14px 16px', borderRadius: 12, marginBottom: 18,
                    background: 'rgba(96,96,128,0.12)', border: '1px solid rgba(255,255,255,0.08)',
                    fontSize: 13, color: '#B0B0D0', lineHeight: 1.5,
                  }}>
                    <strong style={{ color: '#D8D8F0' }}>No payment data for this month yet.</strong>{' '}
                    Run <strong style={{ color: '#E8E8FC' }}>Sync {formatMonthHeading(paymentMonthKey)}</strong> above to pull Square payment and refund rows for this calendar window (read-only).
                  </div>
                ) : payFacts.partialCalendarCoverage && payFacts.dataSpanMin && payFacts.dataSpanMax ? (
                  <div style={{
                    padding: '14px 16px', borderRadius: 12, marginBottom: 18,
                    background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.35)',
                    fontSize: 13, color: '#FCD34D', lineHeight: 1.5,
                  }}>
                    <strong style={{ color: '#FDE68A' }}>Partial data for this calendar month.</strong> Rows in Lessonpreneur run{' '}
                    <strong style={{ color: '#FFFBEB' }}>
                      {formatUtcYmdLong(payFacts.dataSpanMin)} – {formatUtcYmdLong(payFacts.dataSpanMax)}
                    </strong>{' '}
                    (UTC reporting dates). The month selector is the full month (
                    {(() => {
                      const { start, end } = monthKeyToDateRange(paymentMonthKey)
                      return `${formatUtcYmdLong(start)} – ${formatUtcYmdLong(end)}`
                    })()}
                    {' '}UTC). Totals below sum only what is stored—missing days were either not synced or had no activity; run <strong style={{ color: '#FFFBEB' }}>Sync</strong> to pull the full month from Square.
                  </div>
                ) : (
                  <div style={{
                    padding: '12px 16px', borderRadius: 12, marginBottom: 18,
                    background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.22)',
                    fontSize: 12, color: '#86EFAC', lineHeight: 1.45,
                  }}>
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
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: isMobile ? '1fr' : 'repeat(4, minmax(0, 1fr))',
                  gap: 12, marginBottom: 22,
                }}>
                  <PLCard label="Total collected" cents={payFacts.totalCollectedCents} color="#22C55E" compact={isMobile} money sub="Settled card & wallet payments (completed / approved)" />
                  <PLCard label="Fees" cents={payFacts.feesCents} color="#F97316" compact={isMobile} money sub="Processing and application fees on those payments" />
                  <PLCard label="Net total" cents={payFacts.netTotalCents} color="#38BDF8" compact={isMobile} money sub="After Square fees on each payment; refunds listed separately" />
                  <PLCard label="Returns" cents={payFacts.returnsCents} color="#A78BFA" compact={isMobile} money sub="Refunds issued in this period (by refund date)" />
                </div>

                <div style={{ marginBottom: 6 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#707090', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                    By tender type
                  </span>
                </div>
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: isMobile ? '1fr' : 'repeat(4, minmax(0, 1fr))',
                  gap: 12, marginBottom: 14,
                }}>
                  <PLCard label="Tips" cents={payFacts.tipsCents} color="#FB7185" compact={isMobile} money sub="Tips on counted payments" />
                  <PLCard label="Card" cents={payFacts.tenderCardCents} color="#D41113" compact={isMobile} money sub="Card-present and keyed card volume" />
                  <PLCard label="Cash App" cents={payFacts.tenderCashAppCents} color="#00C853" compact={isMobile} money sub="Cash App Pay volume" />
                  <PLCard label="Bank transfer" cents={payFacts.tenderBankTransferCents} color="#3B82F6" compact={isMobile} money sub="ACH / bank transfer volume" />
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
        )}

        {/* ══════════════════════════════════════════
            TAB: Expenses
        ══════════════════════════════════════════ */}
        {activeTab === 'expenses' && (
          <div>
            {/* Controls row: location filter + Add button */}
            <div style={{
              display: 'flex', alignItems: 'center',
              justifyContent: 'space-between', gap: 12,
              marginBottom: 16, flexWrap: 'wrap',
            }}>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', flex: 1, minWidth: 0 }}>
                <button
                  style={locPill(expenseLocFilter === null, '#D4226A')}
                  onClick={() => setExpenseLocFilter(null)}
                >
                  All Locations
                </button>
                {activeLocations.map((l: any) => {
                  const name = l.name.replace(' Music Lessons', '')
                  const color = LOCATION_COLORS[name] ?? '#D4226A'
                  return (
                    <button
                      key={l.id}
                      style={locPill(expenseLocFilter === l.id, color)}
                      onClick={() => setExpenseLocFilter(expenseLocFilter === l.id ? null : l.id)}
                    >
                      {name}
                    </button>
                  )
                })}
              </div>
              <button
                onClick={openAddModal}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '9px 18px', borderRadius: 10, fontSize: 13, fontWeight: 700,
                  background: 'rgba(34,197,94,0.12)', color: '#22C55E',
                  border: '1px solid rgba(34,197,94,0.3)', cursor: 'pointer', flexShrink: 0,
                }}
              >
                <Plus size={15} /> Add Expense
              </button>
            </div>

            {/* Stats bar */}
            {!expLoading && filteredExpenses.length > 0 && (
              <div style={{
                display: 'flex', gap: 28, padding: '12px 18px',
                background: 'rgba(255,255,255,0.02)',
                border: '1px solid rgba(255,255,255,0.06)',
                borderRadius: 10, marginBottom: 16, flexWrap: 'wrap',
              }}>
                <div>
                  <div style={{ fontSize: 10, fontWeight: 700, color: '#707090', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Total</div>
                  <div style={{ fontSize: 22, fontWeight: 800, color: '#E8E8FC', fontFamily: 'monospace', marginTop: 3, letterSpacing: '-0.02em' }}>
                    {dollarsFull(totalFilteredCents)}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 10, fontWeight: 700, color: '#707090', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Entries</div>
                  <div style={{ fontSize: 22, fontWeight: 800, color: '#E8E8FC', marginTop: 3 }}>{filteredExpenses.length}</div>
                </div>
                <div>
                  <div style={{ fontSize: 10, fontWeight: 700, color: '#707090', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Categories</div>
                  <div style={{ fontSize: 22, fontWeight: 800, color: '#E8E8FC', marginTop: 3 }}>
                    {new Set(filteredExpenses.map(e => e.category)).size}
                  </div>
                </div>
              </div>
            )}

            {/* Expense list */}
            {expLoading ? (
              <div style={{ display: 'flex', justifyContent: 'center', padding: 56 }}>
                <MusicLoader />
              </div>
            ) : filteredExpenses.length === 0 ? (
              <div style={{
                textAlign: 'center', padding: '60px 24px',
                background: 'rgba(255,255,255,0.02)',
                border: '1px solid rgba(255,255,255,0.06)', borderRadius: 14,
              }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: '#6060A0', marginBottom: 8 }}>
                  No expenses {expenseLocFilter ? 'for this location' : 'yet'}
                </div>
                <div style={{ fontSize: 13, color: '#50507A', marginBottom: 22 }}>
                  Track operating costs to see your real owner take-home.
                </div>
                <button
                  onClick={openAddModal}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    padding: '10px 20px', borderRadius: 10, fontSize: 13, fontWeight: 700,
                    background: 'rgba(34,197,94,0.12)', color: '#22C55E',
                    border: '1px solid rgba(34,197,94,0.3)', cursor: 'pointer',
                  }}
                >
                  <Plus size={14} /> Add First Expense
                </button>
              </div>
            ) : (
              <div style={{
                background: 'rgba(255,255,255,0.02)',
                border: '1px solid rgba(255,255,255,0.07)',
                borderRadius: 14, overflow: 'hidden',
              }}>
                {/* Table header — desktop only */}
                {!isMobile && (
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: '150px 1fr 120px 110px 100px 72px',
                    padding: '9px 16px',
                    background: 'rgba(255,255,255,0.025)',
                    borderBottom: '1px solid rgba(255,255,255,0.06)',
                    fontSize: 10, fontWeight: 700, color: '#606080',
                    textTransform: 'uppercase', letterSpacing: '0.07em',
                  }}>
                    <div>Category</div>
                    <div>Description</div>
                    <div>Location</div>
                    <div style={{ textAlign: 'right' }}>Amount</div>
                    <div>Frequency</div>
                    <div style={{ textAlign: 'right' }}>Actions</div>
                  </div>
                )}

                {filteredExpenses.map((e, idx) => {
                  const cat = getCatMeta(e.category)
                  return (
                    <div
                      key={e.id}
                      style={{
                        display: isMobile ? 'flex' : 'grid',
                        ...(isMobile
                          ? { flexDirection: 'column' as const, gap: 8, padding: '14px 16px' }
                          : { gridTemplateColumns: '150px 1fr 120px 110px 100px 72px', padding: '11px 16px', alignItems: 'center' }
                        ),
                        borderBottom: idx < filteredExpenses.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none',
                        background: idx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.008)',
                      }}
                    >
                      {/* Category badge */}
                      <div>
                        <span style={{
                          display: 'inline-block', padding: '3px 10px', borderRadius: 6,
                          fontSize: 11, fontWeight: 700,
                          background: `${cat.color}18`,
                          color: cat.color,
                          border: `1px solid ${cat.color}30`,
                        }}>
                          {cat.label}
                        </span>
                      </div>

                      {/* Description */}
                      <div style={{ fontSize: 13, color: '#C0C0E0' }}>
                        {e.description || <span style={{ color: '#505070' }}>—</span>}
                      </div>

                      {/* Location */}
                      <div>
                        {e.location_name ? (
                          <span style={{
                            padding: '2px 8px', borderRadius: 5, fontSize: 11, fontWeight: 600,
                            background: `${LOCATION_COLORS[e.location_name] ?? '#8080A8'}18`,
                            color: LOCATION_COLORS[e.location_name] ?? '#8080A8',
                          }}>
                            {e.location_name}
                          </span>
                        ) : (
                          <span style={{ fontSize: 11, color: '#484868' }}>All</span>
                        )}
                      </div>

                      {/* Amount */}
                      <div style={{
                        fontSize: 14, fontWeight: 700, color: '#E0E0F4',
                        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
                        textAlign: isMobile ? 'left' : 'right',
                      }}>
                        {dollarsFull(e.amount_cents)}
                      </div>

                      {/* Frequency */}
                      <div style={{ fontSize: 11, color: '#707090', textTransform: 'capitalize' }}>
                        {e.is_recurring ? e.frequency : 'one-time'}
                      </div>

                      {/* Actions */}
                      <div style={{ display: 'flex', gap: 4, justifyContent: isMobile ? 'flex-start' : 'flex-end' }}>
                        <button
                          onClick={() => openEditModal(e)}
                          title="Edit expense"
                          style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            width: 30, height: 30, borderRadius: 7,
                            border: '1px solid rgba(255,255,255,0.08)',
                            background: 'rgba(255,255,255,0.04)', color: '#8080A8', cursor: 'pointer',
                          }}
                          onMouseEnter={ev => { ev.currentTarget.style.color = '#D4226A'; ev.currentTarget.style.borderColor = 'rgba(212,34,106,0.35)' }}
                          onMouseLeave={ev => { ev.currentTarget.style.color = '#8080A8'; ev.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)' }}
                        >
                          <Pencil size={12} />
                        </button>
                        <button
                          onClick={() => handleDelete(e.id)}
                          title="Delete expense"
                          style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            width: 30, height: 30, borderRadius: 7,
                            border: '1px solid rgba(255,255,255,0.08)',
                            background: 'rgba(255,255,255,0.04)', color: '#8080A8', cursor: 'pointer',
                          }}
                          onMouseEnter={ev => { ev.currentTarget.style.color = '#EF4444'; ev.currentTarget.style.borderColor = 'rgba(239,68,68,0.35)' }}
                          onMouseLeave={ev => { ev.currentTarget.style.color = '#8080A8'; ev.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)' }}
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* ══════════════════════════════════════════
            TAB: Summary
        ══════════════════════════════════════════ */}
        {activeTab === 'summary' && (
          <>
            {/* Tuition & Invoices P&L section */}
            {plLoading ? (
              <div style={{ ...glassSection, minHeight: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <MusicLoader />
              </div>
            ) : pl ? (
              <div style={glassSection}>
                <div style={{ marginBottom: 18, borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: 16 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 8 }}>
                    <h2 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: '#E8E8FC', letterSpacing: '-0.02em' }}>
                      Tuition &amp; invoices
                    </h2>
                    <span style={{
                      fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
                      color: '#FFB800', padding: '4px 10px', borderRadius: 8,
                      background: 'rgba(255,184,0,0.1)', border: '1px solid rgba(255,184,0,0.28)',
                    }}>
                      AR · this month
                    </span>
                  </div>
                  <p style={{ fontSize: 12, color: '#9090B0', margin: 0, lineHeight: 1.55, maxWidth: 640 }}>
                    {formatMonthHeading(getCurrentMonthKey())}: billed lesson amounts from synced Square invoices (paid, unpaid, and scheduled). For billing and planning—not the same as cash collected in Square Sync.
                  </p>
                </div>

                <div style={{
                  display: 'grid',
                  gridTemplateColumns: isMobile
                    ? '1fr'
                    : role === 'owner'
                      ? 'repeat(4, minmax(0, 1fr))'
                      : 'repeat(3, minmax(0, 1fr))',
                  gap: 12,
                }}>
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

            {/* Location breakdown */}
            {pl && pl.locationBreakdown.length > 0 && (() => {
              const mobileLocs = isMobile ? [pl.locationBreakdown[selectedLocIdx] ?? pl.locationBreakdown[0]] : pl.locationBreakdown
              return (
                <div style={{ marginBottom: 28 }}>
                  <div className="section-header" style={{ marginBottom: isMobile ? 8 : undefined }}>
                    <span className="section-label">By location · invoiced revenue</span>
                    <div className="section-line" />
                  </div>
                  <p style={{ fontSize: 11, color: '#606088', margin: '0 0 14px', maxWidth: 640, lineHeight: 1.45 }}>
                    {formatMonthHeading(getCurrentMonthKey())} · amounts follow the invoice sync, not payment activity.
                  </p>

                  {isMobile && (
                    <div style={{ display: 'flex', gap: 6, marginBottom: 12, overflowX: 'auto' }}>
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

                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: isMobile ? '1fr' : `repeat(${pl.locationBreakdown.length}, 1fr)`,
                    gap: 12,
                  }}>
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
          </>
        )}

        {/* ── Add Expense Modal ── */}
        {showAddModal && (
          <ExpenseFormModal
            title="Add Expense"
            form={addForm}
            setForm={setAddForm}
            onSave={handleAddExpense}
            onClose={() => setShowAddModal(false)}
            isPending={createExpense.isPending}
            locations={locations ?? []}
          />
        )}

        {/* ── Edit Expense Modal ── */}
        {editingExpense && (
          <ExpenseFormModal
            title="Edit Expense"
            form={editForm}
            setForm={setEditForm}
            onSave={handleEditSave}
            onClose={() => setEditingExpense(null)}
            isPending={updateExpense.isPending}
            locations={locations ?? []}
          />
        )}
      </div>
    </IssueContextProvider>
  )
}

// ─── P&L Card ─────────────────────────────────────────

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
  money?: boolean
}) {
  const value = money ? moneyMetric(cents) : `${cents < 0 ? '−' : ''}${dollars(Math.abs(cents))}`
  const valueSize = compact ? 20 : 26
  if (compact) {
    return (
      <div style={{
        padding: '12px 14px', borderRadius: 12, minHeight: 72,
        background: highlight ? `${color}08` : 'rgba(255,255,255,0.02)',
        border: `1px solid ${highlight ? `${color}30` : 'rgba(255,255,255,0.06)'}`,
        borderLeft: `3px solid ${color}`,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
      }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: '#9090B0', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
          {sub && <div style={{ fontSize: 10, color: '#606088', marginTop: 3, lineHeight: 1.35 }}>{sub}</div>}
        </div>
        <div style={{
          fontSize: valueSize, fontWeight: 800,
          color: highlight ? color : '#E8E8FC',
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
          letterSpacing: '-0.02em', flexShrink: 0,
        }}>
          {value}
        </div>
      </div>
    )
  }
  return (
    <div style={{
      padding: '18px 18px 16px', borderRadius: 14, minHeight: 118,
      display: 'flex', flexDirection: 'column',
      background: highlight ? `${color}08` : 'rgba(255,255,255,0.02)',
      border: `1px solid ${highlight ? `${color}30` : 'rgba(255,255,255,0.06)'}`,
      borderTop: `3px solid ${color}`,
    }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: '#9090B0', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
        {label}
      </div>
      <div style={{
        fontSize: 28, fontWeight: 800,
        color: highlight ? color : '#E8E8FC',
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
        letterSpacing: '-0.02em', marginBottom: 'auto',
      }}>
        {value}
      </div>
      {sub && <div style={{ fontSize: 11, color: '#8080A8', marginTop: 8, lineHeight: 1.4 }}>{sub}</div>}
    </div>
  )
}
