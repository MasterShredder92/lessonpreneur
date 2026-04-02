import { useState, useMemo, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuthContext } from '../../app/AuthContext'
import { supabase, getCurrentBillingCycleId } from '../../lib/supabase'
import { calculatePreviewRate } from '../../hooks/useFamilyRate'
import { toast } from '../shared/Toast'
import SearchableCombobox from '../shared/SearchableCombobox'
import { Send, ExternalLink, Copy, ChevronDown, X, Check, Ban } from 'lucide-react'
import { DEFAULT_SESSIONS_PER_MONTH } from '../../lib/constants'

// TENANT_ID removed — use tenantId from useAuthContext() instead

function dollars(cents: number): string {
  return `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}`
}

function fmtDate(d: string | null): string {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

const STATUS_STYLES: Record<string, { bg: string; color: string; border: string }> = {
  pending: { bg: 'rgba(255,255,255,0.04)', color: '#8080A8', border: 'rgba(255,255,255,0.08)' },
  sent: { bg: 'rgba(56,189,248,0.1)', color: '#38BDF8', border: 'rgba(56,189,248,0.25)' },
  viewed: { bg: 'rgba(163,51,255,0.1)', color: '#A333FF', border: 'rgba(163,51,255,0.25)' },
  paid: { bg: 'rgba(34,197,94,0.1)', color: '#22C55E', border: 'rgba(34,197,94,0.25)' },
  overdue: { bg: 'rgba(239,68,68,0.1)', color: '#EF4444', border: 'rgba(239,68,68,0.25)' },
  expired: { bg: 'rgba(239,68,68,0.08)', color: '#EF4444', border: 'rgba(239,68,68,0.2)' },
  cancelled: { bg: 'rgba(255,255,255,0.04)', color: '#8080A8', border: 'rgba(255,255,255,0.08)' },
}

// ═══════════════════════════════════════
// MAIN PANEL
// ═══════════════════════════════════════

export default function InvoicesPanel({ locations, initialStatusFilter }: { locations: any[]; initialStatusFilter?: string }) {
  const qc = useQueryClient()
  const { user, profile, tenantId } = useAuthContext()
  const TENANT_ID = tenantId!
  const [showGenerate, setShowGenerate] = useState(false)
  const [showSend, setShowSend] = useState<any>(null)
  const [showCancel, setShowCancel] = useState<any>(null)
  const [showCreateFamily, setShowCreateFamily] = useState(false)
  const [showCreateSingle, setShowCreateSingle] = useState(false)
  const [statusFilter, setStatusFilter] = useState(initialStatusFilter || 'all')
  useEffect(() => { if (initialStatusFilter) setStatusFilter(initialStatusFilter) }, [initialStatusFilter])
  const [locationFilter, setLocationFilter] = useState('')
  const [periodFilter, setPeriodFilter] = useState('')

  // Fetch invoices
  const { data: invoices, isLoading } = useQuery({
    queryKey: ['invoice_tokens_list', statusFilter, locationFilter, periodFilter],
    queryFn: async () => {
      let q = supabase.from('invoice_tokens').select('*, families!inner(name, primary_email, primary_phone, card_last_four)')
        .eq('tenant_id', TENANT_ID)
        .order('created_at', { ascending: false })
        .limit(200)

      if (statusFilter !== 'all') q = q.eq('status', statusFilter)
      if (locationFilter) q = q.eq('location_id', locationFilter)
      if (periodFilter) q = q.eq('billing_period_label', periodFilter)

      const { data, error } = await q
      if (error) throw error
      return data ?? []
    },
  })

  // Get distinct periods for filter
  const periods = useMemo(() => {
    if (!invoices) return []
    const set = new Set(invoices.map((i: any) => i.billing_period_label).filter(Boolean))
    return [...set].sort().reverse()
  }, [invoices])

  const locMap = useMemo(() => new Map(locations.map(l => [l.id, l])), [locations])

  return (
    <div>
      {/* Header controls */}
      <div className="invoice-controls">
        <div className="invoice-actions">
          <button onClick={() => setShowGenerate(true)} title="Creates pending invoices for all active families based on their current students and rate tiers" style={{
            padding: '10px 20px', borderRadius: 10, border: 'none',
            background: '#D4226A', color: '#fff', fontSize: 13, fontWeight: 700,
            cursor: 'pointer', boxShadow: '0 4px 16px rgba(212,34,106,0.3)',
          }}>
            Run Monthly Billing
          </button>
          <button onClick={() => setShowCreateFamily(true)} style={{
            padding: '10px 20px', borderRadius: 10, fontSize: 13, fontWeight: 700,
            cursor: 'pointer', background: 'rgba(34,197,94,0.12)',
            color: '#22C55E', border: '1px solid rgba(34,197,94,0.25)',
          }}>
            Create Family Invoice
          </button>
          <button onClick={() => setShowCreateSingle(true)} style={{
            padding: '10px 20px', borderRadius: 10, fontSize: 13, fontWeight: 700,
            cursor: 'pointer', background: 'rgba(56,189,248,0.1)',
            color: '#38BDF8', border: '1px solid rgba(56,189,248,0.25)',
          }}>
            Create Single Invoice
          </button>
        </div>

        <div className="invoice-filters">
          <select value={periodFilter} onChange={e => setPeriodFilter(e.target.value)}
            className="filter-select" style={{ fontSize: 11 }}>
            <option value="">All Periods</option>
            {periods.map(p => <option key={p} value={p}>{p}</option>)}
          </select>

          <select value={locationFilter} onChange={e => setLocationFilter(e.target.value)}
            className="filter-select" style={{ fontSize: 11 }}>
            <option value="">All Locations</option>
            {locations.filter(l => l.is_active).map(l => (
              <option key={l.id} value={l.id}>{l.name.replace(' Music Lessons', '')}</option>
            ))}
          </select>

          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
            className="filter-select" style={{ fontSize: 11 }}>
            <option value="all">All Status</option>
            <option value="pending">Pending</option>
            <option value="sent">Sent</option>
            <option value="viewed">Viewed</option>
            <option value="paid">Paid</option>
            <option value="overdue">Overdue</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>

        <span style={{ fontSize: 12, color: '#8080A8' }}>{invoices?.length ?? 0} invoices</span>
      </div>

      {/* Table header */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 0.8fr 1.2fr 0.8fr 1fr 1fr 1.2fr', gap: 8, padding: '8px 14px', fontSize: 10, fontWeight: 700, color: '#606088', textTransform: 'uppercase', letterSpacing: '0.06em', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <span>Family</span>
        <span>Location</span>
        <span>Amount</span>
        <span>Adj.</span>
        <span>Period</span>
        <span>Status</span>
        <span>Due</span>
        <span>Sent</span>
        <span>Actions</span>
      </div>

      {/* Rows */}
      {isLoading ? (
        <div style={{ padding: 40, textAlign: 'center', color: '#606088' }}>Loading...</div>
      ) : invoices && invoices.length > 0 ? (
        <div>
          {invoices.map((inv: any) => {
            const fam = inv.families
            const locName = locMap.get(inv.location_id)?.name?.replace(' Music Lessons', '') ?? '—'
            const s = STATUS_STYLES[inv.status] ?? STATUS_STYLES.pending

            return (
              <div key={inv.id} style={{
                display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 0.8fr 1.2fr 0.8fr 1fr 1fr 1.2fr',
                gap: 8, padding: '10px 14px', alignItems: 'center',
                borderBottom: '1px solid rgba(255,255,255,0.03)',
                fontSize: 12, color: '#C0C0D8',
              }}>
                <div>
                  <div style={{ fontWeight: 600, color: '#E0E0F4' }}>{fam?.name?.replace(/\s*family\s*/i, '') ?? '—'}</div>
                  {fam?.primary_email && <div style={{ fontSize: 10, color: '#8080A8' }}>{fam.primary_email}</div>}
                </div>
                <span style={{ fontSize: 11 }}>{locName}</span>
                <span style={{ fontWeight: 700, color: '#E0E0F4' }}>{dollars(inv.amount_cents)}</span>
                <span style={{ fontSize: 11, color: inv.adjustment_total_cents ? '#EF4444' : '#363656' }}>
                  {inv.adjustment_total_cents ? `-${dollars(Math.abs(inv.adjustment_total_cents))}` : ''}
                </span>
                <span style={{ fontSize: 11 }}>{inv.billing_period_label ?? '—'}</span>
                <span style={{
                  fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 6,
                  background: s.bg, color: s.color, border: `1px solid ${s.border}`,
                  display: 'inline-block', textAlign: 'center',
                }}>
                  {inv.status.charAt(0).toUpperCase() + inv.status.slice(1)}
                </span>
                <span style={{ fontSize: 11 }}>{fmtDate(inv.due_date)}</span>
                <span style={{ fontSize: 11 }}>{fmtDate(inv.sent_at)}</span>
                <div style={{ display: 'flex', gap: 4 }}>
                  {inv.status === 'pending' && (
                    <button onClick={() => setShowSend(inv)} title="Send" style={{ padding: '4px 8px', borderRadius: 6, background: 'rgba(56,189,248,0.1)', border: '1px solid rgba(56,189,248,0.2)', color: '#38BDF8', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3, fontSize: 10, fontWeight: 600 }}>
                      <Send size={10} /> Send
                    </button>
                  )}
                  <button onClick={() => window.open(`/pay/${inv.token}`, '_blank')} title="View" style={{ padding: '4px 8px', borderRadius: 6, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#A0A0C8', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3, fontSize: 10, fontWeight: 600 }}>
                    <ExternalLink size={10} /> View
                  </button>
                  <button onClick={() => { navigator.clipboard.writeText(`${window.location.origin}/pay/${inv.token}`); toast('Link copied', 'success') }} title="Copy link" style={{ padding: '4px 6px', borderRadius: 6, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#8080A8', cursor: 'pointer' }}>
                    <Copy size={10} />
                  </button>
                  {inv.status !== 'paid' && inv.status !== 'cancelled' && (
                    <button onClick={() => setShowCancel(inv)} title="Cancel invoice" style={{ padding: '4px 8px', borderRadius: 6, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.15)', color: '#EF4444', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3, fontSize: 10, fontWeight: 600 }}>
                      <Ban size={10} /> Cancel
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <div style={{ padding: 40, textAlign: 'center', color: '#606088', fontSize: 13 }}>
          No invoices found. Click "Generate Invoices" to create a new batch.
        </div>
      )}

      {/* Generate Modal */}
      {showGenerate && (
        <GenerateInvoicesModal
          locations={locations}
          onClose={() => { setShowGenerate(false); qc.invalidateQueries({ queryKey: ['invoice_tokens_list'] }) }}
        />
      )}

      {/* Send Modal */}
      {showSend && (
        <SendInvoiceModal
          invoice={showSend}
          onClose={() => { setShowSend(null); qc.invalidateQueries({ queryKey: ['invoice_tokens_list'] }) }}
        />
      )}

      {/* Cancel Modal */}
      {showCancel && (
        <CancelInvoiceModal
          invoice={showCancel}
          userId={user?.id ?? null}
          userName={profile ? `${profile.first_name} ${profile.last_name}`.trim() : 'Unknown'}
          onClose={() => { setShowCancel(null); qc.invalidateQueries({ queryKey: ['invoice_tokens_list'] }); qc.invalidateQueries({ queryKey: ['invoice_pending_count'] }) }}
        />
      )}

      {/* Create Family Invoice Modal */}
      {showCreateFamily && (
        <CreateFamilyInvoiceModal
          locations={locations}
          onClose={() => { setShowCreateFamily(false); qc.invalidateQueries({ queryKey: ['invoice_tokens_list'] }); qc.invalidateQueries({ queryKey: ['invoice_pending_count'] }) }}
        />
      )}

      {/* Create Single Invoice Modal */}
      {showCreateSingle && (
        <CreateSingleInvoiceModal
          locations={locations}
          onClose={() => { setShowCreateSingle(false); qc.invalidateQueries({ queryKey: ['invoice_tokens_list'] }); qc.invalidateQueries({ queryKey: ['invoice_pending_count'] }) }}
        />
      )}
    </div>
  )
}

// ═══════════════════════════════════════
// GENERATE INVOICES MODAL
// ═══════════════════════════════════════

function GenerateInvoicesModal({ locations, onClose }: { locations: any[]; onClose: () => void }) {
  const [generating, setGenerating] = useState(false)
  const [excluded, setExcluded] = useState<Set<string>>(new Set())

  // Default billing period = next month
  const now = new Date()
  const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1)
  const defaultLabel = nextMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
  const defaultDue = nextMonth.toISOString().slice(0, 10)

  const [periodLabel, setPeriodLabel] = useState(defaultLabel)
  const [dueDate, setDueDate] = useState(defaultDue)

  // Fetch active families with rates
  const { data: families, isLoading } = useQuery({
    queryKey: ['invoice_gen_families'],
    queryFn: async () => {
      const { data: fams, error: famErr } = await supabase.from('families')
        .select('id, name, parent_name, primary_email, primary_phone, billing_status, billing_day, card_last_four, primary_location_id')
        .eq('tenant_id', TENANT_ID)
        .eq('billing_status', 'active')
        .order('name')
      if (famErr) { console.error('Failed to load families:', famErr); throw famErr }

      const { data: rates, error: ratesErr } = await supabase.from('student_effective_rate')
        .select('family_id, student_id, first_name, last_name, instrument, sessions_per_month, rate_per_session, monthly_cents, location_id')
      if (ratesErr) { console.error('Failed to load rates:', ratesErr); throw ratesErr }

      const ratesByFamily = new Map<string, any[]>()
      rates?.forEach((r: any) => {
        const list = ratesByFamily.get(r.family_id) ?? []
        list.push(r)
        ratesByFamily.set(r.family_id, list)
      })

      return (fams ?? []).map((f: any) => {
        const students = ratesByFamily.get(f.id) ?? []
        const totalCents = students.reduce((s: number, st: any) => s + (st.monthly_cents ?? 0), 0)
        const locationId = students[0]?.location_id ?? f.primary_location_id ?? null
        return { ...f, students, totalCents, locationId }
      }).filter((f: any) => f.totalCents > 0)
    },
  })

  const selected = families?.filter(f => !excluded.has(f.id)) ?? []
  const totalCents = selected.reduce((s, f) => s + f.totalCents, 0)

  const locMap = new Map(locations.map(l => [l.id, l]))

  async function handleGenerate() {
    if (selected.length === 0) return
    setGenerating(true)

    try {
      const cycleId = await getCurrentBillingCycleId(TENANT_ID)
      const rows = selected.map(f => ({
        tenant_id: TENANT_ID,
        family_id: f.id,
        location_id: f.locationId,
        billing_period_label: periodLabel,
        billing_cycle_id: cycleId,
        amount_cents: f.totalCents,
        base_amount_cents: f.totalCents,
        due_date: dueDate,
        billing_day: f.billing_day ?? 1,
        status: 'pending',
        expires_at: new Date(new Date(dueDate).getTime() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        invoice_snapshot: {
          family_name: f.name,
          parent_name: f.parent_name,
          email: f.primary_email,
          phone: f.primary_phone,
          card_on_file: !!f.card_last_four,
          location: locMap.get(f.locationId)?.name ?? null,
          students: f.students.map((s: any) => ({
            name: `${s.first_name} ${s.last_name}`,
            instrument: s.instrument,
            sessions: s.sessions_per_month,
            rate: s.rate_per_session,
            monthly: s.monthly_cents,
          })),
        },
      }))

      // Batch insert in chunks of 50
      let inserted = 0
      for (let i = 0; i < rows.length; i += 50) {
        const chunk = rows.slice(i, i + 50)
        const { error } = await supabase.from('invoice_tokens').insert(chunk)
        if (error) {
          console.error('Insert error at offset', i, error)
          toast(`Error generating invoices: ${error.message}`, 'error')
          break
        }
        inserted += chunk.length
      }

      toast(`${inserted} invoices generated`, 'success')
      onClose()
    } catch (err) {
      toast('Failed to generate invoices', 'error')
    } finally {
      setGenerating(false)
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 10000, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', overflowY: 'auto', padding: '24px 16px' }} onClick={onClose}>
      <div style={{ width: '100%', maxWidth: 720, background: '#141224', borderRadius: 20, border: '1px solid rgba(255,255,255,0.08)', boxShadow: '0 40px 100px rgba(0,0,0,0.6)' }} onClick={e => e.stopPropagation()}>

        <div style={{ padding: '18px 24px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 800, color: '#E0E0F4' }}>Generate Invoices</div>
            <div style={{ fontSize: 12, color: '#8080A8' }}>Create payment links for active families</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#8080A8' }}><X size={20} /></button>
        </div>

        <div style={{ padding: '18px 24px' }}>
          {/* Controls */}
          <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
            <div>
              <label style={{ fontSize: 10, fontWeight: 700, color: '#8080A8', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 4 }}>Billing Period</label>
              <input value={periodLabel} onChange={e => setPeriodLabel(e.target.value)}
                style={{ padding: '8px 14px', borderRadius: 8, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: '#E0E0F4', fontFamily: 'inherit', fontSize: 13, outline: 'none' }} />
            </div>
            <div>
              <label style={{ fontSize: 10, fontWeight: 700, color: '#8080A8', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 4 }}>Due Date</label>
              <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)}
                style={{ padding: '8px 14px', borderRadius: 8, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: '#E0E0F4', fontFamily: 'inherit', fontSize: 13, outline: 'none' }} />
            </div>
          </div>

          {/* Summary */}
          <div style={{ display: 'flex', gap: 16, marginBottom: 16, padding: '12px 16px', background: 'rgba(212,34,106,0.06)', borderRadius: 12, border: '1px solid rgba(212,34,106,0.15)' }}>
            <div><div style={{ fontSize: 20, fontWeight: 800, color: '#E0E0F4' }}>{selected.length}</div><div style={{ fontSize: 10, color: '#8080A8' }}>Families</div></div>
            <div style={{ width: 1, background: 'rgba(255,255,255,0.06)' }} />
            <div><div style={{ fontSize: 20, fontWeight: 800, color: '#D4226A' }}>{dollars(totalCents)}</div><div style={{ fontSize: 10, color: '#8080A8' }}>Total</div></div>
          </div>

          {/* Family list */}
          <div style={{ maxHeight: 360, overflowY: 'auto', marginBottom: 18 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '28px 2fr 1fr 1fr', gap: 8, padding: '6px 0', fontSize: 10, fontWeight: 700, color: '#606088', textTransform: 'uppercase', letterSpacing: '0.06em', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
              <span />
              <span>Family</span>
              <span>Location</span>
              <span style={{ textAlign: 'right' }}>Amount</span>
            </div>
            {isLoading ? (
              <div style={{ padding: 20, textAlign: 'center', color: '#606088' }}>Loading families...</div>
            ) : (families ?? []).map(f => {
              const isExcl = excluded.has(f.id)
              const locName = locMap.get(f.locationId)?.name?.replace(' Music Lessons', '') ?? '—'
              return (
                <div key={f.id} style={{
                  display: 'grid', gridTemplateColumns: '28px 2fr 1fr 1fr', gap: 8,
                  padding: '8px 0', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.03)',
                  opacity: isExcl ? 0.35 : 1,
                }}>
                  <div onClick={() => setExcluded(s => { const n = new Set(s); isExcl ? n.delete(f.id) : n.add(f.id); return n })} style={{ width: 18, height: 18, borderRadius: 4, border: isExcl ? '1px solid #606088' : '1px solid #D4226A', background: isExcl ? 'transparent' : 'rgba(212,34,106,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                    {!isExcl && <Check size={11} style={{ color: '#D4226A' }} />}
                  </div>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: '#E0E0F4' }}>{f.name?.replace(/\s*family\s*/i, '')}</div>
                    <div style={{ fontSize: 10, color: '#8080A8' }}>{f.students.length} student{f.students.length !== 1 ? 's' : ''}</div>
                  </div>
                  <span style={{ fontSize: 11, color: '#A0A0C8' }}>{locName}</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#E0E0F4', textAlign: 'right' }}>{dollars(f.totalCents)}</span>
                </div>
              )
            })}
          </div>

          <button onClick={handleGenerate} disabled={generating || selected.length === 0} style={{
            width: '100%', padding: '13px 0', borderRadius: 12, border: 'none',
            background: generating || selected.length === 0 ? '#606088' : '#D4226A',
            color: '#fff', fontSize: 14, fontWeight: 700, cursor: generating ? 'default' : 'pointer',
            boxShadow: generating ? 'none' : '0 4px 20px rgba(212,34,106,0.3)',
          }}>
            {generating ? 'Generating...' : `Generate ${selected.length} Invoices`}
          </button>
        </div>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════
// SEND INVOICE MODAL
// ═══════════════════════════════════════

function SendInvoiceModal({ invoice, onClose }: { invoice: any; onClose: () => void }) {
  const [sendVia, setSendVia] = useState<'sms' | 'email' | 'both'>('sms')
  const [sending, setSending] = useState(false)
  const fam = invoice.families

  async function handleSend() {
    setSending(true)
    try {
      const payUrl = `${window.location.origin}/pay/${invoice.token}`

      // TODO: Wire up actual SMS/email sending via edge function
      // SMS: fam?.primary_phone, Email: fam?.primary_email

      await supabase.from('invoice_tokens').update({
        status: 'sent',
        sent_via: sendVia,
        sent_at: new Date().toISOString(),
      }).eq('id', invoice.id)

      toast(`Invoice sent via ${sendVia.toUpperCase()}`, 'success')
      onClose()
    } catch (err) {
      toast('Failed to send', 'error')
    } finally {
      setSending(false)
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 10001, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={onClose}>
      <div style={{ width: 380, background: '#1A1830', borderRadius: 16, padding: 24, border: '1px solid rgba(255,255,255,0.1)' }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, color: '#E0E0F4' }}>Send Invoice</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#8080A8' }}><X size={18} /></button>
        </div>

        <div style={{ marginBottom: 16, padding: '12px 14px', background: 'rgba(255,255,255,0.03)', borderRadius: 10, border: '1px solid rgba(255,255,255,0.06)' }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#E0E0F4' }}>{fam?.name?.replace(/\s*family\s*/i, '') ?? '—'}</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: '#D4226A', marginTop: 4 }}>{dollars(invoice.amount_cents)}</div>
          <div style={{ fontSize: 11, color: '#8080A8', marginTop: 2 }}>{invoice.billing_period_label}</div>
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 10, fontWeight: 700, color: '#8080A8', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 8 }}>Send Via</label>
          <div style={{ display: 'flex', gap: 8 }}>
            {(['sms', 'email', 'both'] as const).map(v => (
              <button key={v} onClick={() => setSendVia(v)} style={{
                flex: 1, padding: '10px 0', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer',
                background: sendVia === v ? 'rgba(212,34,106,0.12)' : 'rgba(255,255,255,0.04)',
                color: sendVia === v ? '#D4226A' : '#8080A8',
                border: `1px solid ${sendVia === v ? 'rgba(212,34,106,0.3)' : 'rgba(255,255,255,0.08)'}`,
                textTransform: 'uppercase',
              }}>{v}</button>
            ))}
          </div>
          {sendVia !== 'email' && fam?.primary_phone && <div style={{ fontSize: 11, color: '#8080A8', marginTop: 6 }}>SMS to: {fam.primary_phone}</div>}
          {sendVia !== 'sms' && fam?.primary_email && <div style={{ fontSize: 11, color: '#8080A8', marginTop: 4 }}>Email to: {fam.primary_email}</div>}
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={onClose} className="btn-ghost" style={{ flex: 1 }}>Cancel</button>
          <button onClick={handleSend} disabled={sending} style={{
            flex: 1, padding: '10px 0', borderRadius: 8, border: 'none',
            background: sending ? '#606088' : '#D4226A', color: '#fff',
            fontSize: 13, fontWeight: 700, cursor: sending ? 'default' : 'pointer',
          }}>
            {sending ? 'Sending...' : 'Send Invoice'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════
// CANCEL INVOICE MODAL
// ═══════════════════════════════════════

function CancelInvoiceModal({ invoice, userId, userName, onClose }: {
  invoice: any; userId: string | null; userName: string; onClose: () => void
}) {
  const [reason, setReason] = useState('')
  const [cancelling, setCancelling] = useState(false)
  const fam = invoice.families

  async function handleCancel() {
    if (!reason.trim()) { toast('A reason is required to cancel an invoice', 'error'); return }
    setCancelling(true)
    try {
      const { error } = await supabase.from('invoice_tokens').update({
        status: 'cancelled',
      }).eq('id', invoice.id)
      if (error) throw error

      // Write audit log
      await supabase.from('audit_log').insert({
        action: 'INVOICE_CANCELLED',
        table_name: 'invoice_tokens',
        record_id: invoice.id,
        old_value: invoice.status,
        new_value: 'cancelled',
        reason: reason.trim(),
        performed_by: userId,
        metadata: {
          family_name: fam?.name ?? null,
          amount_cents: invoice.amount_cents,
          billing_period: invoice.billing_period_label,
          cancelled_by_name: userName,
        },
      })

      toast('Invoice cancelled', 'success')
      onClose()
    } catch (err) {
      toast('Failed to cancel invoice', 'error')
    } finally {
      setCancelling(false)
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 10001, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={onClose}>
      <div style={{ width: 420, background: '#1A1830', borderRadius: 16, padding: 24, border: '1px solid rgba(239,68,68,0.2)' }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, color: '#EF4444' }}>Cancel Invoice</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#8080A8' }}><X size={18} /></button>
        </div>

        <div style={{ marginBottom: 16, padding: '12px 14px', background: 'rgba(239,68,68,0.06)', borderRadius: 10, border: '1px solid rgba(239,68,68,0.12)' }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#E0E0F4' }}>{fam?.name?.replace(/\s*family\s*/i, '') ?? '—'}</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: '#EF4444', marginTop: 4 }}>{dollars(invoice.amount_cents)}</div>
          <div style={{ fontSize: 11, color: '#8080A8', marginTop: 2 }}>{invoice.billing_period_label} &middot; Status: {invoice.status}</div>
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 10, fontWeight: 700, color: '#8080A8', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 6 }}>Reason for Cancellation *</label>
          <textarea
            value={reason}
            onChange={e => setReason(e.target.value)}
            placeholder="Why is this invoice being cancelled?"
            rows={3}
            style={{
              width: '100%', padding: '10px 14px', borderRadius: 8, fontSize: 13,
              background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)',
              color: '#E0E0F4', fontFamily: 'inherit', resize: 'vertical', outline: 'none',
            }}
          />
        </div>

        <div style={{ marginBottom: 16, padding: '8px 12px', background: 'rgba(255,255,255,0.02)', borderRadius: 8, fontSize: 11, color: '#8080A8' }}>
          This action will be logged as performed by <strong style={{ color: '#E0E0F4' }}>{userName}</strong>
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={onClose} className="btn-ghost" style={{ flex: 1 }}>Keep Invoice</button>
          <button onClick={handleCancel} disabled={cancelling || !reason.trim()} style={{
            flex: 1, padding: '10px 0', borderRadius: 8, border: 'none',
            background: cancelling || !reason.trim() ? '#606088' : '#EF4444', color: '#fff',
            fontSize: 13, fontWeight: 700, cursor: cancelling || !reason.trim() ? 'default' : 'pointer',
          }}>
            {cancelling ? 'Cancelling...' : 'Cancel Invoice'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════
// CREATE FAMILY INVOICE MODAL
// ═══════════════════════════════════════

// Rate calculation uses calculatePreviewRate from useFamilyRate.ts

function CreateFamilyInvoiceModal({ locations, onClose }: { locations: any[]; onClose: () => void }) {
  const { user, profile } = useAuthContext()
  const qc = useQueryClient()
  const [creating, setCreating] = useState(false)
  const [selectedFamilyId, setSelectedFamilyId] = useState('')
  const [isMilitary, setIsMilitary] = useState(false)
  const [showLocationConfirm, setShowLocationConfirm] = useState(false)
  const [showNewFamilyForm, setShowNewFamilyForm] = useState(false)
  const [newFamName, setNewFamName] = useState('')
  const [newFamParent, setNewFamParent] = useState('')
  const [newFamEmail, setNewFamEmail] = useState('')
  const [newFamPhone, setNewFamPhone] = useState('')
  const [creatingFamily, setCreatingFamily] = useState(false)
  const [dueDate, setDueDate] = useState(() => {
    const now = new Date()
    const next = new Date(now.getFullYear(), now.getMonth() + 1, 1)
    return next.toISOString().slice(0, 10)
  })
  const [periodLabel, setPeriodLabel] = useState(() => {
    const now = new Date()
    const next = new Date(now.getFullYear(), now.getMonth() + 1, 1)
    return next.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
  })

  // Fetch all active families
  const { data: families, isLoading: familiesLoading } = useQuery({
    queryKey: ['create_inv_families'],
    queryFn: async () => {
      const { data, error } = await supabase.from('families')
        .select('id, name, parent_name, primary_email, primary_phone, billing_status, billing_day, card_last_four, primary_location_id, is_military')
        .eq('tenant_id', TENANT_ID)
        .in('billing_status', ['active', 'paused'])
        .order('name')
      if (error) { console.error('Failed to load families:', error); throw error }
      return data ?? []
    },
  })

  // Fetch students for the selected family
  const { data: familyStudents } = useQuery({
    queryKey: ['create_inv_students', selectedFamilyId],
    enabled: !!selectedFamilyId,
    queryFn: async () => {
      const { data } = await supabase.from('student_effective_rate')
        .select('student_id, family_id, first_name, last_name, instrument, sessions_per_month, rate_per_session, monthly_cents, location_id')
        .eq('family_id', selectedFamilyId)
      return data ?? []
    },
  })

  const selectedFamily = families?.find(f => f.id === selectedFamilyId)

  // When family changes, sync the military flag
  useEffect(() => {
    if (selectedFamily) setIsMilitary(selectedFamily.is_military ?? false)
  }, [selectedFamily])

  // Recalculate rates based on military toggle + student count
  const students = useMemo(() => {
    if (!familyStudents) return []
    const activeCount = familyStudents.length
    const totalSessions = familyStudents.reduce((s, st: any) => s + (st.sessions_per_month ?? DEFAULT_SESSIONS_PER_MONTH), 0)
    const rate = calculatePreviewRate(activeCount, totalSessions, isMilitary)
    return familyStudents.map((s: any) => {
      const sessions = s.sessions_per_month ?? DEFAULT_SESSIONS_PER_MONTH
      return { ...s, computed_rate: rate, computed_monthly: rate * sessions }
    })
  }, [familyStudents, isMilitary])

  const totalCents = students.reduce((s, st) => s + st.computed_monthly, 0)
  const locMap = new Map(locations.map(l => [l.id, l]))

  async function handleCreate() {
    if (!selectedFamily || students.length === 0) return
    setCreating(true)
    try {
      const cycleId = await getCurrentBillingCycleId(TENANT_ID)
      const locationId = students[0]?.location_id ?? selectedFamily.primary_location_id ?? null
      const { error } = await supabase.from('invoice_tokens').insert({
        tenant_id: TENANT_ID,
        family_id: selectedFamily.id,
        location_id: locationId,
        billing_period_label: periodLabel,
        billing_cycle_id: cycleId,
        amount_cents: totalCents,
        base_amount_cents: totalCents,
        due_date: dueDate,
        billing_day: selectedFamily.billing_day ?? 1,
        status: 'pending',
        expires_at: new Date(new Date(dueDate).getTime() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        invoice_snapshot: {
          family_name: selectedFamily.name,
          parent_name: selectedFamily.parent_name,
          email: selectedFamily.primary_email,
          phone: selectedFamily.primary_phone,
          card_on_file: !!selectedFamily.card_last_four,
          location: locMap.get(locationId)?.name ?? null,
          is_military: isMilitary,
          students: students.map(s => ({
            name: `${s.first_name} ${s.last_name}`,
            instrument: s.instrument,
            sessions: s.sessions_per_month ?? DEFAULT_SESSIONS_PER_MONTH,
            rate: s.computed_rate,
            monthly: s.computed_monthly,
          })),
        },
      })
      if (error) throw error

      await supabase.from('audit_log').insert({
        action: 'INVOICE_CREATED',
        table_name: 'invoice_tokens',
        record_id: selectedFamily.id,
        new_value: JSON.stringify({ amount_cents: totalCents, period: periodLabel, family: selectedFamily.name }),
        performed_by: user?.id ?? null,
        metadata: { created_by_name: profile ? `${profile.first_name} ${profile.last_name}`.trim() : 'Unknown', type: 'family' },
      })

      toast(`Family invoice created for ${dollars(totalCents)}`, 'success')
      onClose()
    } catch (err) {
      toast('Failed to create invoice', 'error')
    } finally {
      setCreating(false)
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 10000, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', overflowY: 'auto', padding: '24px 16px' }} onClick={onClose}>
      <div style={{ width: '100%', maxWidth: 620, background: '#141224', borderRadius: 20, border: '1px solid rgba(34,197,94,0.2)', boxShadow: '0 40px 100px rgba(0,0,0,0.6)' }} onClick={e => e.stopPropagation()}>

        <div style={{ padding: '18px 24px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 800, color: '#E0E0F4' }}>Create Family Invoice</div>
            <div style={{ fontSize: 12, color: '#8080A8' }}>Invoice based on family's students and rate tier</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#8080A8' }}><X size={20} /></button>
        </div>

        <div style={{ padding: '18px 24px' }}>
          {/* Family Selector */}
          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 10, fontWeight: 700, color: '#8080A8', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 4 }}>Select Family</label>
            <SearchableCombobox
              options={(families ?? []).map(f => ({
                id: f.id,
                label: `${f.name?.replace(/\s*family\s*/i, '') ?? ''} — ${f.parent_name ?? ''}`,
                sublabel: f.primary_email ?? undefined,
              }))}
              value={selectedFamilyId}
              onChange={id => { setSelectedFamilyId(id); setShowNewFamilyForm(false) }}
              placeholder="Search families..."
              isLoading={familiesLoading}
              showCreateNew
              onCreateNew={() => { setShowNewFamilyForm(true); setSelectedFamilyId('') }}
              createNewLabel="+ Create New Family"
            />
          </div>

          {/* Inline new family form */}
          {showNewFamilyForm && (
            <div style={{ marginBottom: 16, padding: '14px 16px', borderRadius: 12, background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.15)' }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#22C55E', marginBottom: 10 }}>New Family</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={{ fontSize: 10, fontWeight: 700, color: '#8080A8', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 3 }}>Family Name *</label>
                  <input value={newFamName} onChange={e => setNewFamName(e.target.value)} placeholder="e.g. The Smith Family" style={{ width: '100%', padding: '8px 12px', borderRadius: 8, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: '#E0E0F4', fontFamily: 'inherit', fontSize: 12, outline: 'none', boxSizing: 'border-box' }} />
                </div>
                <div>
                  <label style={{ fontSize: 10, fontWeight: 700, color: '#8080A8', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 3 }}>Parent Name</label>
                  <input value={newFamParent} onChange={e => setNewFamParent(e.target.value)} placeholder="First Last" style={{ width: '100%', padding: '8px 12px', borderRadius: 8, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: '#E0E0F4', fontFamily: 'inherit', fontSize: 12, outline: 'none', boxSizing: 'border-box' }} />
                </div>
                <div>
                  <label style={{ fontSize: 10, fontWeight: 700, color: '#8080A8', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 3 }}>Email</label>
                  <input type="email" value={newFamEmail} onChange={e => setNewFamEmail(e.target.value)} placeholder="email@example.com" style={{ width: '100%', padding: '8px 12px', borderRadius: 8, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: '#E0E0F4', fontFamily: 'inherit', fontSize: 12, outline: 'none', boxSizing: 'border-box' }} />
                </div>
                <div>
                  <label style={{ fontSize: 10, fontWeight: 700, color: '#8080A8', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 3 }}>Phone</label>
                  <input type="tel" value={newFamPhone} onChange={e => setNewFamPhone(e.target.value)} placeholder="(555) 123-4567" style={{ width: '100%', padding: '8px 12px', borderRadius: 8, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: '#E0E0F4', fontFamily: 'inherit', fontSize: 12, outline: 'none', boxSizing: 'border-box' }} />
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                <button onClick={() => setShowNewFamilyForm(false)} style={{ padding: '7px 16px', borderRadius: 8, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#8080A8', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
                <button
                  disabled={creatingFamily || !newFamName.trim()}
                  onClick={async () => {
                    setCreatingFamily(true)
                    try {
                      const { data: newFam, error } = await supabase.from('families').insert({
                        tenant_id: TENANT_ID,
                        name: newFamName.trim(),
                        parent_name: newFamParent.trim() || null,
                        primary_contact_name: newFamParent.trim() || null,
                        primary_email: newFamEmail.trim() || null,
                        primary_phone: newFamPhone.trim() || null,
                        billing_status: 'active',
                        rate_tier: 4500,
                        is_military: false,
                      }).select('id').single()
                      if (error) throw error
                      setSelectedFamilyId(newFam.id)
                      setShowNewFamilyForm(false)
                      qc.invalidateQueries({ queryKey: ['create_inv_families'] })
                      toast('Family created', 'success')
                    } catch (err) {
                      toast('Failed to create family', 'error')
                    } finally {
                      setCreatingFamily(false)
                    }
                  }}
                  style={{ padding: '7px 20px', borderRadius: 8, background: creatingFamily || !newFamName.trim() ? '#606088' : '#22C55E', border: 'none', color: '#fff', fontSize: 11, fontWeight: 700, cursor: creatingFamily ? 'default' : 'pointer' }}
                >
                  {creatingFamily ? 'Creating...' : 'Create Family'}
                </button>
              </div>
            </div>
          )}

          {/* Controls row */}
          <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
            <div>
              <label style={{ fontSize: 10, fontWeight: 700, color: '#8080A8', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 4 }}>Billing Period</label>
              <input value={periodLabel} onChange={e => setPeriodLabel(e.target.value)} style={{ padding: '8px 14px', borderRadius: 8, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: '#E0E0F4', fontFamily: 'inherit', fontSize: 13, outline: 'none' }} />
            </div>
            <div>
              <label style={{ fontSize: 10, fontWeight: 700, color: '#8080A8', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 4 }}>Due Date</label>
              <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} style={{ padding: '8px 14px', borderRadius: 8, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: '#E0E0F4', fontFamily: 'inherit', fontSize: 13, outline: 'none' }} />
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-end', paddingBottom: 2 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, fontWeight: 700, color: isMilitary ? '#FFB800' : '#8080A8', padding: '8px 16px', borderRadius: 8, background: isMilitary ? 'rgba(255,184,0,0.12)' : 'rgba(255,255,255,0.04)', border: `1px solid ${isMilitary ? 'rgba(255,184,0,0.3)' : 'rgba(255,255,255,0.08)'}` }}>
                <input type="checkbox" checked={isMilitary} onChange={e => setIsMilitary(e.target.checked)} style={{ accentColor: '#FFB800' }} />
                Military
              </label>
            </div>
          </div>

          {/* Student line items */}
          {selectedFamilyId && students.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 0.7fr 0.8fr 1fr', gap: 8, padding: '6px 0', fontSize: 10, fontWeight: 700, color: '#606088', textTransform: 'uppercase', letterSpacing: '0.06em', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                <span>Student</span><span>Instrument</span><span>Sessions</span><span>Rate</span><span style={{ textAlign: 'right' }}>Monthly</span>
              </div>
              {students.map(s => (
                <div key={s.student_id} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 0.7fr 0.8fr 1fr', gap: 8, padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.03)', fontSize: 12, color: '#C0C0D8' }}>
                  <span style={{ fontWeight: 600, color: '#E0E0F4' }}>{s.first_name} {s.last_name}</span>
                  <span>{s.instrument?.charAt(0).toUpperCase()}{s.instrument?.slice(1)}</span>
                  <span>{s.sessions_per_month ?? DEFAULT_SESSIONS_PER_MONTH}</span>
                  <span>{dollars(s.computed_rate)}</span>
                  <span style={{ textAlign: 'right', fontWeight: 700 }}>{dollars(s.computed_monthly)}</span>
                </div>
              ))}
            </div>
          )}

          {selectedFamilyId && students.length === 0 && (
            <div style={{ padding: 20, textAlign: 'center', color: '#606088', fontSize: 13 }}>No active students found for this family.</div>
          )}

          {/* Summary + rate explanation */}
          {students.length > 0 && (
            <div style={{ display: 'flex', gap: 16, marginBottom: 16, padding: '12px 16px', background: 'rgba(34,197,94,0.06)', borderRadius: 12, border: '1px solid rgba(34,197,94,0.15)', alignItems: 'center' }}>
              <div><div style={{ fontSize: 20, fontWeight: 800, color: '#22C55E' }}>{dollars(totalCents)}</div><div style={{ fontSize: 10, color: '#8080A8' }}>Total</div></div>
              <div style={{ width: 1, height: 32, background: 'rgba(255,255,255,0.06)' }} />
              <div style={{ fontSize: 11, color: '#A0A0C8' }}>
                {students.length} student{students.length !== 1 ? 's' : ''} &middot; {dollars(students[0]?.computed_rate ?? 0)}/session
                {isMilitary && <span style={{ color: '#FFB800', fontWeight: 700 }}> &middot; Military rate</span>}
                {!isMilitary && students.length >= 2 && <span style={{ color: '#FFB800', fontWeight: 700 }}> &middot; Multi-student rate</span>}
              </div>
            </div>
          )}

          {/* Location confirmation prompt */}
          {showLocationConfirm && (() => {
            const locationId = students[0]?.location_id ?? selectedFamily?.primary_location_id ?? null
            const locationName = locationId ? (locMap.get(locationId)?.name ?? 'Unknown location') : 'No location set'
            return (
              <div style={{ marginBottom: 16, padding: '14px 16px', borderRadius: 12, background: 'rgba(255,184,0,0.08)', border: '1px solid rgba(255,184,0,0.25)' }}>
                <div style={{ fontSize: 13, color: '#FFB800', fontWeight: 700, marginBottom: 8 }}>
                  You are creating this invoice under {locationName}. Is that correct?
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => { setShowLocationConfirm(false); handleCreate() }} style={{ padding: '8px 20px', borderRadius: 8, background: '#22C55E', border: 'none', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>Yes</button>
                  <button onClick={() => setShowLocationConfirm(false)} style={{ padding: '8px 20px', borderRadius: 8, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#8080A8', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
                </div>
              </div>
            )
          })()}

          <button onClick={() => setShowLocationConfirm(true)} disabled={creating || !selectedFamilyId || students.length === 0} style={{
            width: '100%', padding: '13px 0', borderRadius: 12, border: 'none',
            background: creating || !selectedFamilyId || students.length === 0 ? '#606088' : '#22C55E',
            color: '#fff', fontSize: 14, fontWeight: 700, cursor: creating ? 'default' : 'pointer',
            boxShadow: creating ? 'none' : '0 4px 20px rgba(34,197,94,0.3)',
          }}>
            {creating ? 'Creating...' : `Create Invoice — ${dollars(totalCents)}`}
          </button>
        </div>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════
// CREATE SINGLE (AD-HOC) INVOICE MODAL
// ═══════════════════════════════════════

function CreateSingleInvoiceModal({ locations, onClose }: { locations: any[]; onClose: () => void }) {
  const { user, profile } = useAuthContext()
  const [creating, setCreating] = useState(false)
  const [selectedFamilyId, setSelectedFamilyId] = useState('')
  const [amountStr, setAmountStr] = useState('')
  const [description, setDescription] = useState('')
  const [showLocationConfirm, setShowLocationConfirm] = useState(false)
  const [locationId, setLocationId] = useState('')
  const [dueDate, setDueDate] = useState(() => {
    const now = new Date()
    const next = new Date(now.getFullYear(), now.getMonth() + 1, 1)
    return next.toISOString().slice(0, 10)
  })
  const [periodLabel, setPeriodLabel] = useState('')

  // Fetch all families for the dropdown
  const { data: families, isLoading: familiesLoading } = useQuery({
    queryKey: ['create_single_inv_families'],
    queryFn: async () => {
      const { data, error } = await supabase.from('families')
        .select('id, name, parent_name, primary_email, primary_phone, card_last_four, primary_location_id')
        .eq('tenant_id', TENANT_ID)
        .order('name')
      if (error) { console.error('Failed to load families:', error); throw error }
      return data ?? []
    },
  })

  const selectedFamily = families?.find(f => f.id === selectedFamilyId)
  const amountCents = Math.round((parseFloat(amountStr) || 0) * 100)

  async function handleCreate() {
    if (!selectedFamilyId || amountCents <= 0) { toast('Select a family and enter an amount', 'error'); return }
    if (!description.trim()) { toast('Enter a description for this invoice', 'error'); return }
    setCreating(true)
    try {
      const cycleId = await getCurrentBillingCycleId(TENANT_ID)
      const locId = locationId || selectedFamily?.primary_location_id || null
      const { error } = await supabase.from('invoice_tokens').insert({
        tenant_id: TENANT_ID,
        family_id: selectedFamilyId,
        location_id: locId,
        billing_period_label: periodLabel || 'One-Time',
        billing_cycle_id: cycleId,
        amount_cents: amountCents,
        base_amount_cents: amountCents,
        due_date: dueDate,
        billing_day: 1,
        status: 'pending',
        expires_at: new Date(new Date(dueDate).getTime() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        invoice_snapshot: {
          family_name: selectedFamily?.name ?? 'N/A',
          parent_name: selectedFamily?.parent_name ?? null,
          email: selectedFamily?.primary_email ?? null,
          phone: selectedFamily?.primary_phone ?? null,
          card_on_file: !!selectedFamily?.card_last_four,
          description: description.trim(),
          type: 'single',
        },
      })
      if (error) throw error

      await supabase.from('audit_log').insert({
        action: 'INVOICE_CREATED',
        table_name: 'invoice_tokens',
        record_id: selectedFamilyId,
        new_value: JSON.stringify({ amount_cents: amountCents, description: description.trim(), family: selectedFamily?.name }),
        performed_by: user?.id ?? null,
        metadata: { created_by_name: profile ? `${profile.first_name} ${profile.last_name}`.trim() : 'Unknown', type: 'single' },
      })

      toast(`Single invoice created for ${dollars(amountCents)}`, 'success')
      onClose()
    } catch (err) {
      toast('Failed to create invoice', 'error')
    } finally {
      setCreating(false)
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 10000, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', overflowY: 'auto', padding: '24px 16px' }} onClick={onClose}>
      <div style={{ width: '100%', maxWidth: 500, background: '#141224', borderRadius: 20, border: '1px solid rgba(56,189,248,0.2)', boxShadow: '0 40px 100px rgba(0,0,0,0.6)' }} onClick={e => e.stopPropagation()}>

        <div style={{ padding: '18px 24px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 800, color: '#E0E0F4' }}>Create Single Invoice</div>
            <div style={{ fontSize: 12, color: '#8080A8' }}>One-off invoice for any amount</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#8080A8' }}><X size={20} /></button>
        </div>

        <div style={{ padding: '18px 24px' }}>
          {/* Family Selector */}
          <div style={{ marginBottom: 14 }}>
            <label style={{ fontSize: 10, fontWeight: 700, color: '#8080A8', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 4 }}>Family</label>
            <SearchableCombobox
              options={(families ?? []).map(f => ({
                id: f.id,
                label: `${f.name?.replace(/\s*family\s*/i, '') ?? ''} — ${f.parent_name ?? ''}`,
                sublabel: f.primary_email ?? undefined,
              }))}
              value={selectedFamilyId}
              onChange={id => setSelectedFamilyId(id)}
              placeholder="Search families..."
              isLoading={familiesLoading}
            />
          </div>

          {/* Amount */}
          <div style={{ marginBottom: 14 }}>
            <label style={{ fontSize: 10, fontWeight: 700, color: '#8080A8', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 4 }}>Amount ($)</label>
            <input type="number" step="0.01" min="0" value={amountStr} onChange={e => setAmountStr(e.target.value)} placeholder="0.00" style={{
              width: '100%', padding: '10px 14px', borderRadius: 8,
              background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)',
              color: '#E0E0F4', fontFamily: 'inherit', fontSize: 16, fontWeight: 700, outline: 'none',
            }} />
          </div>

          {/* Description */}
          <div style={{ marginBottom: 14 }}>
            <label style={{ fontSize: 10, fontWeight: 700, color: '#8080A8', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 4 }}>Description / Reason *</label>
            <textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="What is this invoice for?" rows={2} style={{
              width: '100%', padding: '10px 14px', borderRadius: 8, fontSize: 13,
              background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)',
              color: '#E0E0F4', fontFamily: 'inherit', resize: 'vertical', outline: 'none',
            }} />
          </div>

          {/* Row: location, period, due date */}
          <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 120 }}>
              <label style={{ fontSize: 10, fontWeight: 700, color: '#8080A8', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 4 }}>Location</label>
              <select value={locationId} onChange={e => setLocationId(e.target.value)} style={{ width: '100%', padding: '8px 14px', borderRadius: 8, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: '#E0E0F4', fontFamily: 'inherit', fontSize: 13, outline: 'none' }}>
                <option value="">Auto</option>
                {locations.filter(l => l.is_active).map(l => <option key={l.id} value={l.id}>{l.name.replace(' Music Lessons', '')}</option>)}
              </select>
            </div>
            <div style={{ flex: 1, minWidth: 120 }}>
              <label style={{ fontSize: 10, fontWeight: 700, color: '#8080A8', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 4 }}>Period Label</label>
              <input value={periodLabel} onChange={e => setPeriodLabel(e.target.value)} placeholder="One-Time" style={{ width: '100%', padding: '8px 14px', borderRadius: 8, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: '#E0E0F4', fontFamily: 'inherit', fontSize: 13, outline: 'none' }} />
            </div>
            <div style={{ flex: 1, minWidth: 120 }}>
              <label style={{ fontSize: 10, fontWeight: 700, color: '#8080A8', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 4 }}>Due Date</label>
              <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} style={{ width: '100%', padding: '8px 14px', borderRadius: 8, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: '#E0E0F4', fontFamily: 'inherit', fontSize: 13, outline: 'none' }} />
            </div>
          </div>

          {/* Location confirmation prompt */}
          {showLocationConfirm && (() => {
            const locId = locationId || selectedFamily?.primary_location_id || null
            const locObj = locId ? locations.find(l => l.id === locId) : null
            const locationName = locObj ? locObj.name.replace(' Music Lessons', '') : 'No location set'
            return (
              <div style={{ marginBottom: 16, padding: '14px 16px', borderRadius: 12, background: 'rgba(255,184,0,0.08)', border: '1px solid rgba(255,184,0,0.25)' }}>
                <div style={{ fontSize: 13, color: '#FFB800', fontWeight: 700, marginBottom: 8 }}>
                  You are creating this invoice under {locationName}. Is that correct?
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => { setShowLocationConfirm(false); handleCreate() }} style={{ padding: '8px 20px', borderRadius: 8, background: '#38BDF8', border: 'none', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>Yes</button>
                  <button onClick={() => setShowLocationConfirm(false)} style={{ padding: '8px 20px', borderRadius: 8, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#8080A8', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
                </div>
              </div>
            )
          })()}

          <button onClick={() => setShowLocationConfirm(true)} disabled={creating || !selectedFamilyId || amountCents <= 0 || !description.trim()} style={{
            width: '100%', padding: '13px 0', borderRadius: 12, border: 'none',
            background: creating || !selectedFamilyId || amountCents <= 0 || !description.trim() ? '#606088' : '#38BDF8',
            color: '#fff', fontSize: 14, fontWeight: 700, cursor: creating ? 'default' : 'pointer',
            boxShadow: creating ? 'none' : '0 4px 20px rgba(56,189,248,0.3)',
          }}>
            {creating ? 'Creating...' : amountCents > 0 ? `Create Invoice — ${dollars(amountCents)}` : 'Create Invoice'}
          </button>
        </div>
      </div>
    </div>
  )
}
