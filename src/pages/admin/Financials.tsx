import { useState, useEffect } from 'react'
import { useAuthContext } from '../../app/AuthContext'
import { usePLSummary, useExpenses, useCreateExpense, useDeleteExpense, EXPENSE_CATEGORIES } from '../../hooks/useFinancials'
import { useLocations } from '../../hooks/useLocations'
import { toast } from '../../components/shared/Toast'
import MusicLoader from '../../components/shared/MusicLoader'
import { Plus, Trash2, DollarSign, Download } from 'lucide-react'
import { exportFinancials } from '../../hooks/useExport'

function dollars(cents: number): string {
  if (!cents) return '$0'
  return `$${(Math.abs(cents) / 100).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
}

function dollarsFull(cents: number): string {
  return `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

const LOCATION_COLORS: Record<string, string> = {
  Omaha: '#D41113', Gretna: '#00A651', Bellevue: '#A333FF', Elkhorn: '#00A5E8',
}

export default function Financials() {
  const { role, tenantId } = useAuthContext()
  const { data: pl, isLoading: plLoading } = usePLSummary()
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

  if (role !== 'owner' && role !== 'admin') {
    return <div className="page" style={{ padding: 40, textAlign: 'center', color: '#8080A8' }}>Owner access only.</div>
  }

  if (plLoading) {
    return <div className="page"><div className="page-header"><h1>Financials</h1></div><div style={{ height: 300 }}><MusicLoader /></div></div>
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
    <div className="page">
      <div className="page-header">
        <h1>Financials</h1>
        <button onClick={() => { if (tenantId) exportFinancials(tenantId) }} style={{
          display: 'flex', alignItems: 'center', gap: 5, padding: '6px 14px', borderRadius: 6,
          fontSize: 11, fontWeight: 600, cursor: 'pointer', marginLeft: 'auto',
          background: 'rgba(255,255,255,0.04)', color: '#8080A8', border: '1px solid rgba(255,255,255,0.08)',
        }}><Download size={12} /> Export</button>
      </div>

      {/* P&L HERO */}
      {pl && (
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(4, 1fr)', gap: isMobile ? 8 : 12, marginBottom: 28 }}>
          <PLCard label="Gross Revenue" cents={pl.grossRevenueCents} color="#22C55E" compact={isMobile} />
          <PLCard label="Teacher Payroll" cents={-pl.teacherPayrollCents} color="#fb923c" compact={isMobile} sub={`${((pl.teacherPayrollCents / Math.max(pl.grossRevenueCents, 1)) * 100).toFixed(0)}% of revenue`} />
          <PLCard label="Operating Expenses" cents={-pl.operatingExpensesCents} color="#EF4444" compact={isMobile} sub={`${Object.keys(pl.expensesByCategory).length} categories`} />
          {role === 'owner' && <PLCard label="Owner Take-Home" cents={pl.ownerTakeHomeCents} color="#FFB800" compact={isMobile} highlight sub={`${pl.marginPercent.toFixed(1)}% margin${marginDelta !== 0 ? ` (${marginDelta > 0 ? '+' : ''}${marginDelta.toFixed(1)}% vs last month)` : ''}`} />}
        </div>
      )}

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

      {/* LOCATION COMPARISON */}
      {pl && pl.locationBreakdown.length > 0 && (() => {
        const mobileLocs = isMobile ? [pl.locationBreakdown[selectedLocIdx] ?? pl.locationBreakdown[0]] : pl.locationBreakdown
        return (
          <div style={{ marginBottom: 28 }}>
            <div className="section-header" style={{ marginBottom: isMobile ? 8 : undefined }}>
              <span className="section-label">Location Comparison</span>
              <div className="section-line" />
            </div>

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
                        <span style={{ color: '#8080A8' }}>Revenue</span>
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
  )
}

// ─── P&L Card ────────────────────────────────────────

function PLCard({ label, cents, color, sub, highlight, compact }: { label: string; cents: number; color: string; sub?: string; highlight?: boolean; compact?: boolean }) {
  if (compact) {
    return (
      <div style={{
        padding: '10px 14px', borderRadius: 10,
        background: highlight ? `${color}08` : 'rgba(255,255,255,0.02)',
        border: `1px solid ${highlight ? `${color}30` : 'rgba(255,255,255,0.06)'}`,
        borderLeft: `3px solid ${color}`,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, color: '#8080A8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
          {sub && <div style={{ fontSize: 10, color: '#606088', marginTop: 1 }}>{sub}</div>}
        </div>
        <div style={{ fontSize: 22, fontWeight: 800, color: highlight ? color : '#E0E0F4', fontFamily: 'monospace', letterSpacing: '-0.02em' }}>
          {cents < 0 ? '-' : ''}{dollars(Math.abs(cents))}
        </div>
      </div>
    )
  }
  return (
    <div style={{
      padding: '18px 20px', borderRadius: 14,
      background: highlight ? `${color}08` : 'rgba(255,255,255,0.02)',
      border: `1px solid ${highlight ? `${color}30` : 'rgba(255,255,255,0.06)'}`,
      borderTop: `3px solid ${color}`,
    }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: '#8080A8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
        {label}
      </div>
      <div style={{ fontSize: 28, fontWeight: 800, color: highlight ? color : '#E0E0F4', fontFamily: 'monospace', letterSpacing: '-0.02em' }}>
        {cents < 0 ? '-' : ''}{dollars(Math.abs(cents))}
      </div>
      {sub && <div style={{ fontSize: 11, color: '#8080A8', marginTop: 4 }}>{sub}</div>}
    </div>
  )
}
