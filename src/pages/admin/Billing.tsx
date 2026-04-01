import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import MusicLoader from '../../components/shared/MusicLoader'
import { useQueryClient } from '@tanstack/react-query'
import { createPortal } from 'react-dom'
import { useAuthContext } from '../../app/AuthContext'
import { supabase } from '../../lib/supabase'
import { useLocations } from '../../hooks/useLocations'
import { useBillingDashboard, useBillingAlerts, useBillingFamilies, useFamilyBillingDetail, useFamilyPaymentHistory, useUpdateBillingStatus, useUpdateBillingDay, useAdjustBalance, useAddBillingAdjustment, useDeleteBillingAdjustment, useSquareInvoiceSummary, useSquareInvoicesByFamily } from '../../hooks/useBillingPage'
import { useOverrideFamilyRate, useRemoveFamilyRateOverride } from '../../hooks/useFamilyRate'
import { toast } from '../../components/shared/Toast'
import ConfirmModal from '../../components/shared/ConfirmModal'
import DraggableModal from '../../components/shared/DraggableModal'
import { CreditCard, Lock, X, ChevronDown, ChevronRight } from 'lucide-react'
import { syncSquareCustomers, type SquareCustomer } from '../../lib/squareSync'
import { DEFAULT_SESSIONS_PER_MONTH, DEFAULT_RATE_PER_SESSION, DEFAULT_RATE_TIER_CENTS } from '../../lib/constants'
import InvoicesPanel from '../../components/billing/InvoicesPanel'
import { useQuery } from '@tanstack/react-query'

function dollars(cents: number | null | undefined): string {
  if (cents == null || cents === 0) return '$0.00'
  return `$${(Math.abs(cents) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}
function stripFamily(name: string | null): string { return (name ?? '').replace(/\s+family$/i, '').trim() || name ?? '' }

const RATE_LABELS: Record<number, { label: string; color: string; bg: string }> = {
  4500: { label: '$45.00 — Standard', color: '#A0A0C8', bg: 'rgba(128,128,168,0.1)' },
  4000: { label: '$40.00 — Multi-Student', color: '#FFB800', bg: 'rgba(255,184,0,0.1)' },
  3750: { label: '$37.50 — Volume', color: '#22C55E', bg: 'rgba(34,197,94,0.1)' },
}
const STATUS_COLORS: Record<string, { color: string; bg: string }> = {
  active: { color: '#22C55E', bg: 'rgba(34,197,94,0.12)' },
  paused: { color: '#FFB800', bg: 'rgba(255,184,0,0.12)' },
  suspended: { color: '#FF7800', bg: 'rgba(255,120,0,0.12)' },
  cancelled: { color: '#8080A8', bg: 'rgba(255,255,255,0.04)' },
}
const ALERT_ICONS: Record<string, { icon: string }> = {
  no_card: { icon: '🔴' }, overdue: { icon: '🟠' }, expiring_card: { icon: '🟡' }, paused_with_students: { icon: '🔵' },
}
const labelStyle: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: '#A0A0C8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }

export default function Billing() {
  const { role, tenantId } = useAuthContext()
  const { data: stats } = useBillingDashboard()
  const { data: alerts } = useBillingAlerts()
  const { data: locations } = useLocations()
  const [filters, setFilters] = useState<any>({})
  const [locationFilter, setLocationFilter] = useState('')
  const { data: families } = useBillingFamilies(filters)
  const { data: sqSummary } = useSquareInvoiceSummary()
  const { data: sqFamilies } = useSquareInvoicesByFamily()
  const { data: pendingInvoiceCount } = useQuery({
    queryKey: ['invoice_pending_count', tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { count } = await supabase.from('invoice_tokens').select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenantId!)
        .in('status', ['pending', 'sent', 'viewed'])
      return count ?? 0
    },
  })
  const [selectedFamilyId, setSelectedFamilyId] = useState<string | null>(null)
  const [alertsExpanded, setAlertsExpanded] = useState(false)
  const [billingTab, setBillingTab] = useState<'active' | 'paused' | 'inactive'>('active')
  const [dismissedAlerts, setDismissedAlerts] = useState<Set<string>>(new Set())
  const [page, setPage] = useState(0)
  const isOwner = role === 'owner' || role === 'admin'
  const queryClient = useQueryClient()
  const [syncLoading, setSyncLoading] = useState(false)
  const [syncStatus, setSyncStatus] = useState('')
  const [billingView, setBillingView] = useState<'families' | 'invoices'>('families')
  const [invoiceStatusFilter, setInvoiceStatusFilter] = useState('')
  const [unmatchedCustomers, setUnmatchedCustomers] = useState<SquareCustomer[]>([])
  const [showUnmatched, setShowUnmatched] = useState(false)

  async function handleSyncSquare() {
    setSyncLoading(true)
    setSyncStatus('Starting sync...')
    try {
      const result = await syncSquareCustomers((status) => setSyncStatus(status), tenantId!)
      toast(`Synced: ${result.squareCustomers} customers found, ${result.matched} matched, ${result.updated} updated`, 'success')
      setUnmatchedCustomers(result.unmatched)
      if (result.unmatched.length > 0) setShowUnmatched(true)
      await queryClient.invalidateQueries({ queryKey: ['billing_families'] })
      await queryClient.invalidateQueries({ queryKey: ['billing_dashboard'] })
      await queryClient.invalidateQueries({ queryKey: ['billing_summary'] })
      await queryClient.invalidateQueries({ queryKey: ['square_invoices_summary'] })
      await queryClient.invalidateQueries({ queryKey: ['square_invoices_by_family'] })
      setSyncStatus('')
    } catch (err) {
      console.error('Square sync error:', err)
      toast(`Sync failed: ${err instanceof Error ? err.message : 'Unknown error'}`, 'error')
      setSyncStatus('')
    } finally {
      setSyncLoading(false)
    }
  }

  // Apply location filter client-side (families have primary_location_id)
  const locationFiltered = useMemo(() => {
    if (!locationFilter || !families) return families ?? []
    return families.filter((f: any) => {
      // Check if any of the family's students are at this location
      return f.students?.some((s: any) => s.location_id === locationFilter) || false
    })
  }, [families, locationFilter])

  const visibleAlerts = (alerts ?? []).filter(a => !dismissedAlerts.has(a.id))

  const locationLabel = locationFilter ? locations?.find((l: any) => l.id === locationFilter)?.name?.replace(' Music Lessons', '') : 'All Locations'
  const billingTabFiltered = useMemo(() => {
    if (billingTab === 'active') return locationFiltered.filter((f: any) => f.billing_status === 'active')
    if (billingTab === 'paused') return locationFiltered.filter((f: any) => f.billing_status === 'paused')
    return locationFiltered.filter((f: any) => f.billing_status === 'cancelled' || f.billing_status === 'suspended' || (f.billing_status !== 'active' && f.billing_status !== 'paused'))
  }, [locationFiltered, billingTab])
  return (
    <div className="page">
      <div className="page-header">
        <h1>Billing</h1>
        <button
          onClick={handleSyncSquare}
          disabled={syncLoading}
          style={{
            padding: '6px 14px', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer',
            background: 'rgba(0,120,255,0.12)', color: '#0078FF', border: '1px solid rgba(0,120,255,0.25)',
            opacity: syncLoading ? 0.6 : 1, marginLeft: 12,
          }}
        >
          {syncLoading ? syncStatus || 'Syncing...' : 'Sync from Square'}
        </button>
        {/* Location filter tabs */}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 3, background: 'rgba(255,255,255,0.04)', borderRadius: 8, padding: 3 }}>
          <button onClick={() => { setLocationFilter(''); setPage(0) }} style={{
            padding: '5px 12px', borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: 'pointer',
            background: !locationFilter ? 'rgba(212,34,106,0.12)' : 'transparent',
            color: !locationFilter ? '#E8488A' : '#8080A8',
            border: !locationFilter ? '1px solid rgba(212,34,106,0.2)' : '1px solid transparent',
          }}>All</button>
          {locations?.filter((l: any) => l.is_active).map((loc: any) => {
            const locName = loc.name.replace(' Music Lessons', '')
            const isActive = locationFilter === loc.id
            const locColor = loc.color ?? '#D4226A'
            return (
              <button key={loc.id} onClick={() => { setLocationFilter(isActive ? '' : loc.id); setPage(0) }} style={{
                padding: '5px 12px', borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: 'pointer',
                background: isActive ? `${locColor}20` : 'transparent',
                color: isActive ? locColor : '#8080A8',
                border: isActive ? `1px solid ${locColor}40` : '1px solid transparent',
              }}>{locName}</button>
            )
          })}
        </div>
      </div>

      {/* FINANCIAL HERO CARDS — powered by Square invoices */}
      <div className="financial-grid" style={{ marginBottom: 8 }}>
        {/* LEFT — Scheduled Invoice Revenue (SCHEDULED invoices) — GREEN */}
        <div className="financial-card" style={{ background: 'linear-gradient(150deg, rgba(6,18,9,0.97), rgba(4,12,6,0.99))', border: '1px solid rgba(34,197,94,0.2)', boxShadow: '0 14px 52px rgba(0,0,0,0.65), inset 0 1px 0 rgba(34,197,94,0.14)' }}>
          <div className="financial-card-edge" style={{ background: 'linear-gradient(#16A34A, #22C55E, #16A34A)', boxShadow: '0 0 24px rgba(22,163,74,0.65), 0 0 60px rgba(22,163,74,0.2)' }} />
          <div className="financial-card-glow-top" style={{ background: 'radial-gradient(circle, rgba(22,163,74,0.18) 0%, transparent 70%)' }} />
          <div className="financial-card-glow-bottom" style={{ background: 'radial-gradient(circle, rgba(22,163,74,0.08) 0%, transparent 70%)' }} />
          <div className="financial-card-content">
            <div className="financial-label">Scheduled Invoice Revenue</div>
            <div className="financial-value">{dollars(sqSummary?.actualRevenueCents ?? 0)}</div>
            <div className="financial-sub">Queued to charge after adjustments · {locationLabel}</div>
          </div>
        </div>

        {/* MIDDLE — Recurring Series Revenue (active subscriptions) — GOLD */}
        <div className="financial-card" style={{ background: 'linear-gradient(150deg, rgba(13,10,4,0.97), rgba(9,7,3,0.99))', border: '1px solid rgba(251,191,36,0.18)', boxShadow: '0 14px 52px rgba(0,0,0,0.65), inset 0 1px 0 rgba(251,191,36,0.12)' }}>
          <div className="financial-card-edge" style={{ background: 'linear-gradient(#D97706, #FBBF24, #D97706)', boxShadow: '0 0 24px rgba(251,191,36,0.55), 0 0 60px rgba(255,184,0,0.18)' }} />
          <div className="financial-card-glow-top" style={{ background: 'radial-gradient(circle, rgba(251,191,36,0.16) 0%, transparent 70%)' }} />
          <div className="financial-card-glow-bottom" style={{ background: 'radial-gradient(circle, rgba(255,184,0,0.07) 0%, transparent 70%)' }} />
          <div className="financial-card-content">
            <div className="financial-label">Family Monthly Rate</div>
            <div className="financial-value">{dollars(sqSummary?.recurringSeriesCents ?? 0)}</div>
            <div className="financial-sub">Total locked-in monthly rate before adjustments · {locationLabel}</div>
          </div>
        </div>

        {/* RIGHT — Overdue (UNPAID) — RED */}
        <div className="financial-card" style={{ background: 'linear-gradient(150deg, rgba(15,5,5,0.97), rgba(10,3,3,0.99))', border: '1px solid rgba(239,68,68,0.18)', boxShadow: '0 14px 52px rgba(0,0,0,0.65), inset 0 1px 0 rgba(239,68,68,0.12)' }}>
          <div className="financial-card-edge" style={{ background: 'linear-gradient(#B91C1C, #EF4444, #B91C1C)', boxShadow: '0 0 24px rgba(239,68,68,0.5), 0 0 60px rgba(220,38,38,0.16)' }} />
          <div className="financial-card-glow-top" style={{ background: 'radial-gradient(circle, rgba(239,68,68,0.15) 0%, transparent 70%)' }} />
          <div className="financial-card-glow-bottom" style={{ background: 'radial-gradient(circle, rgba(220,38,38,0.07) 0%, transparent 70%)' }} />
          <div className="financial-card-content">
            <div className="financial-label">Overdue</div>
            <div className="financial-value">{(sqSummary?.overdueCents ?? 0) > 0 ? dollars(sqSummary?.overdueCents ?? 0) : '$0.00'}</div>
            <div className="financial-sub">{(sqSummary?.overdueCents ?? 0) > 0 ? 'Unpaid invoices past due' : 'No overdue invoices'}</div>
          </div>
        </div>
      </div>

      {/* Monthly Adjustments delta */}
      {(() => {
        const delta = sqSummary?.adjustmentDeltaCents ?? 0
        return delta !== 0 ? (
          <div style={{ textAlign: 'center', marginBottom: 20, padding: '6px 0' }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: '#8080A8' }}>Monthly Adjustments </span>
            <span style={{ fontSize: 12, fontWeight: 700, color: '#A0A0C8' }}>-{dollars(delta)}</span>
            <span style={{ fontSize: 11, color: '#606088', marginLeft: 6 }}>credits &amp; discounts this cycle</span>
          </div>
        ) : (
          <div style={{ textAlign: 'center', marginBottom: 20, padding: '6px 0' }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: '#606088' }}>No adjustments this cycle</span>
          </div>
        )
      })()}

      {/* 5 STAT CARDS */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12, marginBottom: 24 }}>
        {[
          { label: 'Families w/ Invoices', value: sqFamilies?.length ?? 0, color: '#22C55E', filter: {}, invoiceFilter: '' },
          { label: 'Families Outstanding', value: sqSummary?.overdueFamilyCount ?? 0, color: '#FF8C00', filter: { balance: 'overdue' }, invoiceFilter: 'overdue' },
          { label: 'Total Overdue', value: (sqSummary?.overdueCents ?? 0) > 0 ? dollars(sqSummary?.overdueCents ?? 0) : '$0', color: '#EF4444', filter: { balance: 'overdue' }, invoiceFilter: 'overdue' },
          { label: 'Scheduled Revenue', value: dollars(sqSummary?.recurringSeriesCents ?? 0), color: '#38BDF8', filter: {}, invoiceFilter: '' },
          { label: 'Paid This Month', value: dollars(sqSummary?.actualRevenueCents ?? 0), color: '#22C55E', filter: {}, invoiceFilter: '' },
        ].map((c, i) => (
          <div key={i} onClick={() => {
            if (c.invoiceFilter) {
              setBillingView('invoices')
              setInvoiceStatusFilter(c.invoiceFilter)
            } else if (c.filter && Object.keys(c.filter).length) {
              setFilters(c.filter); setPage(0)
            }
          }} style={{
            padding: '16px 18px', borderRadius: 14, cursor: Object.keys(c.filter).length ? 'pointer' : 'default',
            background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)',
            borderLeft: `3px solid ${c.color}`,
          }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: '#E0E0F4' }}>{c.value}</div>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#8080A8', marginTop: 2 }}>{c.label}</div>
          </div>
        ))}
      </div>

      {/* SECTION TABS */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 24, padding: '4px', background: 'rgba(255,255,255,0.02)', borderRadius: 14, border: '1px solid rgba(255,255,255,0.06)' }}>
        <button onClick={() => { setBillingView('families'); setInvoiceStatusFilter('') }} style={{
          flex: 1, padding: '12px 32px', borderRadius: 10, fontSize: 15, fontWeight: 700, cursor: 'pointer',
          background: billingView === 'families' ? '#D4226A' : 'transparent',
          color: billingView === 'families' ? '#fff' : '#8080A8',
          border: 'none',
          boxShadow: billingView === 'families' ? '0 4px 16px rgba(212,34,106,0.3)' : 'none',
          transition: 'all 0.2s',
        }}>
          {'\u{1F468}\u{200D}\u{1F469}\u{200D}\u{1F467}'} Families
        </button>
        <button onClick={() => setBillingView('invoices')} style={{
          flex: 1, padding: '12px 32px', borderRadius: 10, fontSize: 15, fontWeight: 700, cursor: 'pointer',
          background: billingView === 'invoices' ? '#D4226A' : 'transparent',
          color: billingView === 'invoices' ? '#fff' : '#8080A8',
          border: 'none',
          boxShadow: billingView === 'invoices' ? '0 4px 16px rgba(212,34,106,0.3)' : 'none',
          transition: 'all 0.2s',
        }}>
          {'\u{1F9FE}'} Invoices{(pendingInvoiceCount ?? 0) > 0 && (
            <span style={{ marginLeft: 8, fontSize: 12, fontWeight: 800, padding: '2px 8px', borderRadius: 100, background: billingView === 'invoices' ? 'rgba(255,255,255,0.2)' : 'rgba(212,34,106,0.15)', color: billingView === 'invoices' ? '#fff' : '#D4226A' }}>
              {pendingInvoiceCount}
            </span>
          )}
        </button>
      </div>

      {billingView === 'invoices' ? (
        <InvoicesPanel locations={locations ?? []} initialStatusFilter={invoiceStatusFilter} />
      ) : (<>
      {/* ALERTS */}
      <div style={{ marginBottom: 24, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 14, overflow: 'hidden' }}>
        <div onClick={() => setAlertsExpanded(!alertsExpanded)} style={{ padding: '12px 18px', display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
          {alertsExpanded ? <ChevronDown size={14} style={{ color: '#8080A8' }} /> : <ChevronRight size={14} style={{ color: '#8080A8' }} />}
          <span style={{ fontSize: 13, fontWeight: 700, color: '#E0E0F4' }}>Action Required</span>
          {visibleAlerts.length > 0 ? <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 999, background: 'rgba(239,68,68,0.12)', color: '#EF4444' }}>{visibleAlerts.length}</span>
            : <span style={{ fontSize: 11, color: '#22C55E', fontWeight: 600 }}>All clear</span>}
        </div>
        {alertsExpanded && visibleAlerts.length > 0 && (
          <div style={{ padding: '0 18px 14px', display: 'flex', flexDirection: 'column', gap: 4 }}>
            {visibleAlerts.slice(0, 20).map((a) => (
              <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 8, background: 'rgba(255,255,255,0.02)' }}>
                <span style={{ fontSize: 14 }}>{ALERT_ICONS[a.type]?.icon}</span>
                <div style={{ flex: 1 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#D0D0E8' }}>{a.familyName}</span>
                  {a.parentName && <span style={{ fontSize: 11, color: '#8080A8' }}> — {a.parentName}</span>}
                  <span style={{ fontSize: 11, color: '#A0A0C8' }}> — {a.detail}</span>
                </div>
                <button onClick={() => setSelectedFamilyId(a.familyId)} className="btn-outline" style={{ fontSize: 10, padding: '3px 10px' }}>View</button>
                <button onClick={() => setDismissedAlerts(new Set([...dismissedAlerts, a.id]))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#606088', padding: 2 }}><X size={12} /></button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ACTIVE / INACTIVE TABS + SEARCH */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
        <div className="lead-view-tabs" style={{ marginBottom: 0 }}>
          <button className={`lead-view-tab${billingTab === 'active' ? ' active' : ''}`} onClick={() => setBillingTab('active')}>
            Active <span className="tab-count">{locationFiltered.filter((f: any) => f.billing_status === 'active').length}</span>
          </button>
          <button className={`lead-view-tab${billingTab === 'paused' ? ' active' : ''}`} onClick={() => setBillingTab('paused')}>
            Paused <span className="tab-count">{locationFiltered.filter((f: any) => f.billing_status === 'paused').length}</span>
          </button>
          <button className={`lead-view-tab${billingTab === 'inactive' ? ' active' : ''}`} onClick={() => setBillingTab('inactive')}>
            Inactive <span className="tab-count">{locationFiltered.filter((f: any) => f.billing_status === 'cancelled' || f.billing_status === 'suspended' || (f.billing_status !== 'active' && f.billing_status !== 'paused')).length}</span>
          </button>
        </div>
        <input value={filters.search ?? ''} onChange={(e) => setFilters({ ...filters, search: e.target.value })} placeholder="Search families..." className="filter-select" style={{ minWidth: 200, fontSize: 12 }} />
        <select value={filters.rateTier ?? ''} onChange={(e) => setFilters({ ...filters, rateTier: Number(e.target.value) || undefined })} className="filter-select" style={{ fontSize: 11, width: 'auto' }}>
          <option value="">All Rates</option><option value="4500">$45</option><option value="4000">$40</option><option value="3750">$37.50</option>
        </select>
        {Object.values(filters).some(Boolean) && <button className="btn-ghost" onClick={() => setFilters({})} style={{ fontSize: 10 }}>Clear</button>}
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 12, color: '#8080A8' }}>{billingTabFiltered.length} families</span>
      </div>

      {/* COMPACT ROWS — grouped by location or flat */}
      <BillingFamilyList families={billingTabFiltered} onSelect={setSelectedFamilyId} locationFilter={locationFilter} locations={locations ?? []} onLocationSelect={setLocationFilter} sqFamilies={sqFamilies ?? []} />

      {selectedFamilyId && <BillingDetailModal familyId={selectedFamilyId} onClose={() => setSelectedFamilyId(null)} />}

      {/* UNMATCHED SQUARE CUSTOMERS PANEL */}
      {unmatchedCustomers.length > 0 && <UnmatchedCustomersPanel
        customers={unmatchedCustomers}
        expanded={showUnmatched}
        onToggle={() => setShowUnmatched(!showUnmatched)}
      />}
      </>)}
    </div>
  )
}

// ═══════════════════════════════════════
// UNMATCHED SQUARE CUSTOMERS PANEL
// ═══════════════════════════════════════

const PAGE_SIZE = 50

function UnmatchedCustomersPanel({ customers, expanded, onToggle }: {
  customers: SquareCustomer[]; expanded: boolean; onToggle: () => void
}) {
  const [search, setSearch] = useState('')
  const [sortDesc, setSortDesc] = useState(true)
  const [page, setPage] = useState(0)

  const filtered = useMemo(() => {
    let list = customers
    if (search) {
      const q = search.toLowerCase()
      list = list.filter(c =>
        `${c.given_name ?? ''} ${c.family_name ?? ''} ${c.email_address ?? ''} ${c.phone_number ?? ''}`.toLowerCase().includes(q)
      )
    }
    list = [...list].sort((a, b) => {
      const da = a.created_at ?? ''
      const db = b.created_at ?? ''
      return sortDesc ? db.localeCompare(da) : da.localeCompare(db)
    })
    return list
  }, [customers, search, sortDesc])

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE)
  const pageList = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  return (
    <div style={{ marginTop: 24, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 14, overflow: 'hidden' }}>
      <div onClick={onToggle} style={{ padding: '12px 18px', display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
        {expanded ? <ChevronDown size={14} style={{ color: '#8080A8' }} /> : <ChevronRight size={14} style={{ color: '#8080A8' }} />}
        <span style={{ fontSize: 13, fontWeight: 700, color: '#E0E0F4' }}>Unmatched Square Customers</span>
        <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 999, background: 'rgba(255,184,0,0.12)', color: '#FFB800' }}>{customers.length}</span>
      </div>

      {expanded && (
        <div style={{ padding: '0 18px 16px' }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12 }}>
            <input
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(0) }}
              placeholder="Filter by name, email, or phone..."
              className="filter-select"
              style={{ minWidth: 260, fontSize: 12 }}
            />
            <button onClick={() => setSortDesc(!sortDesc)} style={{
              padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: 'pointer',
              background: 'rgba(255,255,255,0.04)', color: '#A0A0C8', border: '1px solid rgba(255,255,255,0.08)',
            }}>
              Created {sortDesc ? 'Newest' : 'Oldest'}
            </button>
            <div style={{ flex: 1 }} />
            <span style={{ fontSize: 12, color: '#8080A8' }}>{filtered.length} customers</span>
          </div>

          {/* Header */}
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 2fr 1.5fr 1fr', gap: 8, padding: '6px 12px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
            <span style={labelStyle}>Name</span>
            <span style={labelStyle}>Email</span>
            <span style={labelStyle}>Phone</span>
            <span style={labelStyle}>Created</span>
          </div>

          {/* Rows */}
          {pageList.map(c => (
            <div key={c.id} style={{
              display: 'grid', gridTemplateColumns: '2fr 2fr 1.5fr 1fr', gap: 8,
              padding: '8px 12px', borderBottom: '1px solid rgba(255,255,255,0.03)',
              fontSize: 12, color: '#C0C0D8',
            }}>
              <span style={{ fontWeight: 600, color: '#E0E0F4' }}>
                {[c.given_name, c.family_name].filter(Boolean).join(' ') || '—'}
              </span>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {c.email_address || '—'}
              </span>
              <span>{c.phone_number || '—'}</span>
              <span style={{ color: '#A0A0C8' }}>
                {c.created_at ? new Date(c.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
              </span>
            </div>
          ))}

          {filtered.length === 0 && (
            <div style={{ padding: '20px 12px', textAlign: 'center', fontSize: 12, color: '#8080A8' }}>No customers match your filter</div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div style={{ display: 'flex', justifyContent: 'center', gap: 6, marginTop: 12 }}>
              <button disabled={page === 0} onClick={() => setPage(page - 1)} style={{
                padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: page === 0 ? 'default' : 'pointer',
                background: 'rgba(255,255,255,0.04)', color: page === 0 ? '#404060' : '#A0A0C8', border: '1px solid rgba(255,255,255,0.06)',
              }}>Prev</button>
              <span style={{ fontSize: 11, color: '#8080A8', padding: '4px 8px' }}>{page + 1} / {totalPages}</span>
              <button disabled={page >= totalPages - 1} onClick={() => setPage(page + 1)} style={{
                padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: page >= totalPages - 1 ? 'default' : 'pointer',
                background: 'rgba(255,255,255,0.04)', color: page >= totalPages - 1 ? '#404060' : '#A0A0C8', border: '1px solid rgba(255,255,255,0.06)',
              }}>Next</button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ═══════════════════════════════════════
// BILLING DETAIL MODAL
// ═══════════════════════════════════════

// ═══════════════════════════════════════
// COMPACT BILLING LIST — location grouped, expandable rows
// ═══════════════════════════════════════

function BillingFamilyList({ families, onSelect, locationFilter, locations, onLocationSelect, sqFamilies }: {
  families: BillingFamily[]; onSelect: (id: string) => void; locationFilter: string; locations: any[]; onLocationSelect?: (id: string) => void; sqFamilies: import('../../hooks/useBillingPage').SquareInvoiceFamily[]
}) {
  // Group by location if no filter active
  const locMap = new Map(locations.map((l: any) => [l.id, { name: l.name?.replace(' Music Lessons', ''), color: l.color ?? '#D4226A' }]))

  // If filtered to one location, show the family rows
  if (locationFilter) {
    return <CompactFamilyRows families={families} onSelect={onSelect} />
  }

  // Build Square invoice lookup by family_id
  const sqByFamily = new Map(sqFamilies.map(sf => [sf.family_id, sf]))

  // ALL VIEW — location summary cards (click to filter)
  const groups = new Map<string, { name: string; color: string; id: string; families: BillingFamily[] }>()
  for (const f of families) {
    const stuLoc = f.students?.[0]?.location_id
    if (stuLoc && locMap.has(stuLoc)) {
      const loc = locMap.get(stuLoc)!
      if (!groups.has(stuLoc)) groups.set(stuLoc, { ...loc, id: stuLoc, families: [] })
      groups.get(stuLoc)!.families.push(f)
    }
  }
  const sortedGroups = [...groups.entries()].sort((a, b) => a[1].name.localeCompare(b[1].name))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {sortedGroups.map(([locId, group]) => {
        const activeFams = group.families.filter(f => f.billing_status === 'active')
        // Aggregate Square invoice data for families in this location
        const locSqFamilies = group.families.map(f => sqByFamily.get(f.id)).filter(Boolean) as import('../../hooks/useBillingPage').SquareInvoiceFamily[]
        const recurringCents = locSqFamilies.reduce((s, sf) => s + sf.scheduled_cents, 0)
        const actualCents = locSqFamilies.reduce((s, sf) => s + sf.paid_this_month_cents, 0)
        const overdueFams = locSqFamilies.filter(sf => sf.has_unpaid)
        const overdueCents = 0 // would need per-family unpaid cents; using count for now
        const paidFams = locSqFamilies.filter(sf => sf.paid_this_month_cents > 0).length
        const outstandingFams = overdueFams.length

        return (
          <div key={locId} onClick={() => onLocationSelect?.(locId)} style={{
            padding: '14px 18px', borderRadius: 14, cursor: 'pointer',
            background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)',
            borderLeft: `3px solid ${group.color}`, transition: 'all 120ms',
          }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; e.currentTarget.style.borderColor = `${group.color}40` }}
            onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.02)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)' }}
          >
            {/* Location name + family count */}
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: 10 }}>
              <span style={{ fontSize: 15, fontWeight: 800, color: '#E0E0F4' }}>{group.name}</span>
              <span style={{ fontSize: 11, color: '#8080A8', marginLeft: 10 }}>{activeFams.length} families</span>
            </div>
            {/* Stats row */}
            <div style={{ display: 'flex', gap: 0 }}>
              <div style={{ flex: 1, textAlign: 'center' }}>
                <div style={{ fontSize: 16, fontWeight: 800, color: '#22C55E' }}>${(actualCents / 100).toLocaleString('en-US', { minimumFractionDigits: 0 })}</div>
                <div style={{ fontSize: 9, fontWeight: 600, color: '#8080A8', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Invoice Revenue</div>
              </div>
              <div style={{ width: 1, background: 'rgba(255,255,255,0.04)', margin: '0 4px' }} />
              <div style={{ flex: 1, textAlign: 'center' }}>
                <div style={{ fontSize: 16, fontWeight: 800, color: '#FFB800' }}>${(recurringCents / 100).toLocaleString('en-US', { minimumFractionDigits: 0 })}</div>
                <div style={{ fontSize: 9, fontWeight: 600, color: '#8080A8', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Recurring</div>
              </div>
              <div style={{ width: 1, background: 'rgba(255,255,255,0.04)', margin: '0 4px' }} />
              <div style={{ flex: 1, textAlign: 'center' }}>
                <div style={{ fontSize: 16, fontWeight: 800, color: '#22C55E' }}>{paidFams}</div>
                <div style={{ fontSize: 9, fontWeight: 600, color: '#8080A8', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Paid</div>
              </div>
              <div style={{ width: 1, background: 'rgba(255,255,255,0.04)', margin: '0 4px' }} />
              <div style={{ flex: 1, textAlign: 'center' }}>
                <div style={{ fontSize: 16, fontWeight: 800, color: outstandingFams > 0 ? '#FF8C00' : '#8080A8' }}>{outstandingFams}</div>
                <div style={{ fontSize: 9, fontWeight: 600, color: '#8080A8', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Unpaid</div>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function CompactFamilyRows({ families, onSelect }: {
  families: BillingFamily[]; onSelect: (id: string) => void
}) {
  return (
    <div style={{ borderRadius: 12, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.06)' }}>
      {families.map((f, i) => {
        const bal = f.balance ?? 0
        const monthlyTotal = f.students.reduce((s: number, st: any) => s + (st.monthly_cents ?? (st.sessions_per_month ?? DEFAULT_SESSIONS_PER_MONTH) * (f.rate_tier ?? DEFAULT_RATE_TIER_CENTS)), 0)

        return (
          <div key={f.id}
            onClick={() => onSelect(f.id)}
            style={{
              display: 'flex', alignItems: 'center', gap: 0, padding: '10px 14px',
              background: 'rgba(255,255,255,0.015)',
              borderTop: i > 0 ? '1px solid rgba(255,255,255,0.04)' : 'none',
              cursor: 'pointer', transition: 'background 100ms',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.03)' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.015)' }}
          >
            {/* Family + Parent */}
            <div style={{ width: 150, minWidth: 120, flexShrink: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#D0D0E8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{stripFamily(f.name)}</div>
              <div style={{ fontSize: 10, color: '#8080A8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.parent_name ?? '—'}</div>
            </div>
            {/* Students — each name with instrument underneath */}
            <div style={{ flex: 1, minWidth: 0, marginLeft: 12, display: 'flex', gap: 14 }}>
              {f.students.length > 0 ? f.students.slice(0, 4).map((s: any) => (
                <div key={s.student_id ?? s.first_name} style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: '#C0C0E0', whiteSpace: 'nowrap' }}>{s.first_name}</div>
                  <div style={{ fontSize: 9, color: '#606088', whiteSpace: 'nowrap' }}>{s.instrument ? s.instrument.charAt(0).toUpperCase() + s.instrument.slice(1) : '—'}</div>
                </div>
              )) : <span style={{ fontSize: 11, color: '#606088' }}>—</span>}
              {f.students.length > 4 && <span style={{ fontSize: 10, color: '#606088', alignSelf: 'center' }}>+{f.students.length - 4}</span>}
            </div>
            {/* Monthly */}
            <span style={{ fontSize: 13, fontWeight: 800, color: '#E0E0F4', width: 85, textAlign: 'right', flexShrink: 0 }}>
              ${(monthlyTotal / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </span>
            {/* Rate pill */}
            <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 6, background: (RATE_LABELS[f.rate_tier] ?? RATE_LABELS[4500]).bg, color: (RATE_LABELS[f.rate_tier] ?? RATE_LABELS[4500]).color, marginLeft: 10, flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 3 }}>
              ${(f.rate_tier / 100).toFixed(0)}{f.rate_tier_override && <Lock size={8} />}
            </span>
            {/* Billing Day */}
            <span style={{ fontSize: 10, color: '#8080A8', width: 30, textAlign: 'center', marginLeft: 10, flexShrink: 0 }}>
              {f.billing_day ?? 1}{(f.billing_day ?? 1) === 1 ? 'st' : 'th'}
            </span>
            {/* Balance */}
            <div style={{ width: 70, textAlign: 'right', marginLeft: 8, flexShrink: 0 }}>
              {bal > 0 ? <span style={{ fontSize: 11, fontWeight: 700, color: '#22C55E' }}>{dollars(bal)}</span>
                : bal < 0 ? <span style={{ fontSize: 11, fontWeight: 700, color: '#EF4444' }}>{dollars(bal)}</span>
                : <span style={{ fontSize: 11, color: '#363656' }}>—</span>}
            </div>
            {/* Card */}
            <div style={{ width: 70, textAlign: 'right', marginLeft: 8, flexShrink: 0 }}>
              {f.card_last_four
                ? <span style={{ fontSize: 10, color: '#8080A8' }}>••••{f.card_last_four}</span>
                : <span style={{ fontSize: 10, color: '#606088' }}>No Card</span>}
            </div>
            {/* Arrow */}
            <ChevronRight size={14} style={{ color: '#363656', marginLeft: 6, flexShrink: 0 }} />
          </div>
        )
      })}
    </div>
  )
}

function BillingDetailModal({ familyId, onClose }: { familyId: string; onClose: () => void }) {
  const navigate = useNavigate()
  const { role } = useAuthContext()
  const isOwner = role === 'owner' || role === 'admin'
  const { data } = useFamilyBillingDetail(familyId)
  const { data: history } = useFamilyPaymentHistory(familyId)
  const updateStatus = useUpdateBillingStatus()
  const updateDay = useUpdateBillingDay()
  const adjustBalance = useAdjustBalance()
  const addAdjustment = useAddBillingAdjustment()
  const deleteAdjustment = useDeleteBillingAdjustment()
  const overrideRate = useOverrideFamilyRate()
  const removeOverride = useRemoveFamilyRateOverride()

  const [tab, setTab] = useState<'overview' | 'history'>('overview')
  const [showBalanceAdj, setShowBalanceAdj] = useState(false)
  const [balType, setBalType] = useState<'credit' | 'debit'>('credit')
  const [balAmount, setBalAmount] = useState('')
  const [balReason, setBalReason] = useState('')
  const [showRateOverride, setShowRateOverride] = useState(false)
  const [overrideValue, setOverrideValue] = useState(4500)
  const [overrideReason, setOverrideReason] = useState('')
  const [showAddAdj, setShowAddAdj] = useState(false)
  const [adjStudent, setAdjStudent] = useState('')
  const [adjAmount, setAdjAmount] = useState('')
  const [adjReason, setAdjReason] = useState('')
  const [confirmStatus, setConfirmStatus] = useState<string | null>(null)
  const [pauseReason, setPauseReason] = useState('')
  const [pauseReturnDate, setPauseReturnDate] = useState('')
  const [inactiveReason, setInactiveReason] = useState('')

  const family = data?.family
  const students = data?.students ?? []
  const adjustments = data?.adjustments ?? []

  if (!family) return createPortal(<div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={onClose}><div onClick={(e) => e.stopPropagation()} style={{ padding: 40, background: '#141224', borderRadius: 20 }}><MusicLoader /></div></div>, document.body)

  const rate = RATE_LABELS[family.rate_tier ?? DEFAULT_RATE_TIER_CENTS] ?? RATE_LABELS[4500]
  const sc = STATUS_COLORS[family.billing_status ?? 'active'] ?? STATUS_COLORS.active
  const bal = family.balance ?? 0
  const pendingAdj = adjustments.filter((a: any) => !a.applied)
  const appliedAdj = adjustments.filter((a: any) => a.applied)
  const monthlySubtotal = students.reduce((sum: number, s: any) => sum + (s.sessions_per_month ?? DEFAULT_SESSIONS_PER_MONTH) * (s.rate_per_session ?? DEFAULT_RATE_PER_SESSION), 0)
  const pendingAdjTotal = pendingAdj.reduce((sum: number, a: any) => sum + (a.amount_cents ?? 0), 0) / 100
  const monthlyTotal = monthlySubtotal - Math.abs(pendingAdjTotal)

  const handleStatusChange = (s: string) => {
    if (s === 'paused' || s === 'cancelled') { setConfirmStatus(s); setPauseReason(''); setPauseReturnDate(''); setInactiveReason(''); return }
    updateStatus.mutateAsync({ familyId, oldStatus: family.billing_status, newStatus: s }).then(() => toast('Updated', 'success'))
  }

  return (
    <DraggableModal
      id={`billing-${familyId}`}
      onClose={onClose}
      title={stripFamily(family.name)}
      subtitle={family.parent_name ?? '—'}
      width={680}
      height="75vh"
      headerRight={<div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><button onClick={() => { onClose(); navigate(`/admin/families?family=${familyId}`) }} style={{ fontSize: 11, color: '#38BDF8', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', fontFamily: 'inherit', padding: 0 }}>View Family</button><span style={{ fontSize: 11, fontWeight: 700, padding: '4px 12px', borderRadius: 8, background: sc.bg, color: sc.color }}>{(family.billing_status ?? 'active').charAt(0).toUpperCase() + (family.billing_status ?? '').slice(1)}</span></div>}
    >
        {/* Tabs */}
        <div style={{ display: 'flex', gap: 4, padding: '12px 20px 0', borderBottom: '1px solid rgba(255,255,255,0.06)', flexShrink: 0 }}>
          {(['overview', 'history'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)} style={{ padding: '8px 20px', fontSize: 12, fontWeight: 700, cursor: 'pointer', borderRadius: '8px 8px 0 0', background: tab === t ? 'rgba(212,34,106,0.08)' : 'transparent', color: tab === t ? '#E8488A' : '#8080A8', border: tab === t ? '1px solid rgba(212,34,106,0.15)' : '1px solid transparent', borderBottom: tab === t ? '1px solid #141224' : 'none', marginBottom: -1 }}>{t.charAt(0).toUpperCase() + t.slice(1)}</button>
          ))}
        </div>

        {/* Tab content — scrollable, fixed height */}
        <div style={{ flex: 1, overflowY: 'auto' }}>

        {/* OVERVIEW TAB */}
        {tab === 'overview' && (
          <div style={{ padding: '20px 20px 24px' }}>
            {/* Monthly Breakdown */}
            <div style={{ marginBottom: 16 }}>
              <div style={labelStyle}>Monthly Breakdown</div>
              <div style={{ marginTop: 8 }}>
                {students.map((s: any) => (<div key={s.id} style={{ padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.04)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><div><div style={{ fontSize: 13, fontWeight: 700, color: '#D0D0E8' }}>{s.first_name} {s.last_name}</div><div style={{ fontSize: 11, color: '#8080A8' }}>{s.instrument ? s.instrument.charAt(0).toUpperCase() + s.instrument.slice(1) : '—'} · {s.sessions_per_month ?? DEFAULT_SESSIONS_PER_MONTH} sessions × ${(s.rate_per_session ?? DEFAULT_RATE_PER_SESSION).toFixed(2)}</div></div><span style={{ fontSize: 14, fontWeight: 800, color: '#D0D0E8' }}>${((s.sessions_per_month ?? DEFAULT_SESSIONS_PER_MONTH) * (s.rate_per_session ?? DEFAULT_RATE_PER_SESSION)).toFixed(2)}</span></div>))}
                {pendingAdj.map((a: any) => (<div key={a.id} style={{ padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.04)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><span style={{ fontSize: 12, color: '#FFB800' }}>{a.reason}</span>{isOwner && <button onClick={() => deleteAdjustment.mutateAsync({ id: a.id, familyId })} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#606088', padding: 0 }}><X size={11} /></button>}</div><span style={{ fontSize: 13, fontWeight: 700, color: '#FFB800' }}>−${((a.amount_cents ?? 0) / 100).toFixed(2)}</span></div>))}
                <div style={{ borderTop: '2px solid rgba(255,255,255,0.08)', marginTop: 6, paddingTop: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><span style={{ fontSize: 13, fontWeight: 700, color: '#A0A0C8' }}>Next Month's Charge</span><span style={{ fontSize: 18, fontWeight: 800, color: '#E0E0F4' }}>${monthlyTotal.toFixed(2)}</span></div>
              </div>
            </div>

            {/* Next Month Adjustment — inline add */}
            <div style={{ padding: 14, borderRadius: 12, background: 'rgba(255,184,0,0.04)', border: '1px solid rgba(255,184,0,0.12)', marginBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: showAddAdj ? 10 : 0 }}>
                <div><div style={{ fontSize: 12, fontWeight: 700, color: '#FFB800' }}>Adjust Next Month</div><div style={{ fontSize: 10, color: '#8080A8' }}>Credit for something that happened this month</div></div>
                {!showAddAdj && <button onClick={() => { setShowAddAdj(true); if (students.length === 1) { setAdjStudent(students[0].id); setAdjAmount(((students[0].rate_per_session ?? DEFAULT_RATE_PER_SESSION)).toFixed(2)) } }} className="btn-outline" style={{ fontSize: 10, padding: '4px 12px', borderColor: 'rgba(255,184,0,0.3)', color: '#FFB800' }}>+ Add Credit</button>}
              </div>
              {showAddAdj && (() => {
                const presetReasons = ['Teacher Callout', 'Studio Cancellation'] as const
                const isPreset = presetReasons.includes(adjReason as any)
                const isOther = !isPreset && adjReason !== ''
                const pickStudent = (id: string) => {
                  setAdjStudent(id)
                  const stu = students.find((s: any) => s.id === id)
                  if (stu) setAdjAmount(((stu.rate_per_session ?? DEFAULT_RATE_PER_SESSION)).toFixed(2))
                }
                return (
                <div>
                  <div style={{ display: 'flex', gap: 10, marginBottom: 8 }}>
                    {students.length > 1 ? (
                      <div style={{ flex: 1 }}><div style={labelStyle}>Student</div><select value={adjStudent} onChange={(e) => pickStudent(e.target.value)} className="filter-select" style={{ width: '100%' }}><option value="">Select...</option>{students.map((s: any) => <option key={s.id} value={s.id}>{s.first_name} {s.last_name}</option>)}</select></div>
                    ) : (
                      <div style={{ flex: 1 }}><div style={labelStyle}>Student</div><div style={{ fontSize: 12, color: '#C0C0E0', padding: '6px 0' }}>{students[0]?.first_name} {students[0]?.last_name}</div></div>
                    )}
                    <div style={{ width: 120 }}><div style={labelStyle}>Amount ($)</div><input type="number" value={adjAmount} onChange={(e) => setAdjAmount(e.target.value)} className="filter-select" style={{ width: '100%' }} placeholder="45.00" /></div>
                  </div>
                  <div style={{ marginBottom: 8 }}>
                    <div style={labelStyle}>Reason</div>
                    <div style={{ display: 'flex', gap: 4, marginBottom: isOther ? 6 : 0 }}>
                      {presetReasons.map(r => (<button key={r} onClick={() => setAdjReason(r)} style={{ padding: '3px 10px', borderRadius: 8, fontSize: 10, cursor: 'pointer', background: adjReason === r ? 'rgba(255,184,0,0.1)' : 'rgba(255,255,255,0.03)', color: adjReason === r ? '#FFB800' : '#8080A8', border: `1px solid ${adjReason === r ? 'rgba(255,184,0,0.25)' : 'rgba(255,255,255,0.06)'}` }}>{r}</button>))}
                      <button onClick={() => { setAdjReason(''); setTimeout(() => document.getElementById('adj-custom-reason')?.focus(), 50) }} style={{ padding: '3px 10px', borderRadius: 8, fontSize: 10, cursor: 'pointer', background: isOther ? 'rgba(255,184,0,0.1)' : 'rgba(255,255,255,0.03)', color: isOther ? '#FFB800' : '#8080A8', border: `1px solid ${isOther ? 'rgba(255,184,0,0.25)' : 'rgba(255,255,255,0.06)'}` }}>Other</button>
                    </div>
                    {!isPreset && <input id="adj-custom-reason" value={adjReason} onChange={(e) => setAdjReason(e.target.value)} className="filter-select" style={{ width: '100%', fontSize: 12 }} placeholder="Describe what happened..." autoFocus />}
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}><button className="btn-ghost" style={{ fontSize: 11 }} onClick={() => { setShowAddAdj(false); setAdjAmount(''); setAdjReason(''); setAdjStudent('') }}>Cancel</button><button className="btn-primary" style={{ fontSize: 11, background: 'rgba(255,184,0,0.15)', color: '#FFB800' }} onClick={async () => { if (!adjStudent || !adjAmount || !adjReason) { toast('Fill all fields', 'error'); return }; await addAdjustment.mutateAsync({ familyId, studentId: adjStudent, adjustmentType: 'credit', amountCents: Math.round(parseFloat(adjAmount) * 100), reason: adjReason }); toast('Credit added — will reduce next month\'s charge', 'success'); setShowAddAdj(false); setAdjAmount(''); setAdjReason(''); setAdjStudent('') }}>Apply Credit</button></div>
                </div>
                )
              })()}
            </div>

            {/* Account Details — compact inline bar */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 0, padding: '10px 14px', borderRadius: 10, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)', marginBottom: 12 }}>
              {/* Rate */}
              <div style={{ textAlign: 'center', flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, padding: '2px 8px', borderRadius: 6, background: rate.bg, color: rate.color, display: 'inline-flex', alignItems: 'center', gap: 3 }}>{rate.label}{family.rate_tier_override && <Lock size={9} />}</span>
                  {isOwner && <button onClick={() => { setOverrideValue(family.rate_tier ?? DEFAULT_RATE_TIER_CENTS); setShowRateOverride(true) }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#606088', fontSize: 9, padding: 0 }}>edit</button>}
                </div>
                <div style={{ fontSize: 8, color: '#606088', marginTop: 2, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Rate</div>
              </div>
              <div style={{ width: 1, height: 28, background: 'rgba(255,255,255,0.04)' }} />
              {/* Billing Day */}
              <div style={{ textAlign: 'center', flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#D0D0E8' }}>{family.billing_day ?? 1}{(family.billing_day ?? 1) === 1 ? 'st' : 'th'}</span>
                  {isOwner && <select value={family.billing_day ?? 1} onChange={(e) => updateDay.mutateAsync({ familyId, billingDay: Number(e.target.value) }).then(() => toast('Updated', 'success'))} className="filter-select" style={{ fontSize: 9, width: 'auto', padding: '1px 4px' }}><option value={1}>1st</option><option value={15}>15th</option></select>}
                </div>
                <div style={{ fontSize: 8, color: '#606088', marginTop: 2, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Bill Day</div>
              </div>
              <div style={{ width: 1, height: 28, background: 'rgba(255,255,255,0.04)' }} />
              {/* Card */}
              <div style={{ textAlign: 'center', flex: 1 }}>
                <div style={{ fontSize: 11, color: family.card_last_four ? '#C0C0E0' : '#EF4444', fontWeight: 600 }}>
                  {family.card_last_four ? `••••${family.card_last_four}` : 'No card'}
                </div>
                <div style={{ fontSize: 8, color: '#606088', marginTop: 2, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Card</div>
              </div>
              <div style={{ width: 1, height: 28, background: 'rgba(255,255,255,0.04)' }} />
              {/* Balance */}
              <div style={{ textAlign: 'center', flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: bal > 0 ? '#22C55E' : bal < 0 ? '#EF4444' : '#8080A8' }}>
                  {bal !== 0 ? dollars(bal) : '$0'}
                </div>
                <div style={{ fontSize: 8, color: '#606088', marginTop: 2, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Balance{isOwner && <button onClick={() => setShowBalanceAdj(true)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#606088', fontSize: 8, padding: 0, marginLeft: 4 }}>adj</button>}</div>
              </div>
            </div>

            {/* Status + Notes row */}
            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 9, fontWeight: 700, color: '#606088', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 }}>Status</div>
                <div style={{ display: 'flex', gap: 4 }}>{['active', 'paused', 'inactive'].filter(s => s !== (family.billing_status === 'cancelled' || family.billing_status === 'suspended' ? 'inactive' : family.billing_status)).map(s => (<button key={s} onClick={() => handleStatusChange(s === 'inactive' ? 'cancelled' : s)} className="btn-outline" style={{ fontSize: 9, padding: '2px 8px', color: STATUS_COLORS[s === 'inactive' ? 'cancelled' : s]?.color ?? '#8080A8', borderColor: `${(STATUS_COLORS[s === 'inactive' ? 'cancelled' : s]?.color ?? '#8080A8')}40` }}>{s.charAt(0).toUpperCase() + s.slice(1)}</button>))}</div>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 9, fontWeight: 700, color: '#606088', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 }}>Notes</div>
                <textarea defaultValue={family.billing_notes ?? ''} onBlur={async (e) => { if (e.target.value !== (family.billing_notes ?? '')) { const { error } = await supabase.from('families').update({ billing_notes: e.target.value }).eq('id', familyId); if (error) { toast('Failed to save notes: ' + error.message, 'error') } else { toast('Saved', 'success') } } }} rows={2} placeholder="Billing notes..." className="filter-select" style={{ width: '100%', fontSize: 10, resize: 'vertical', fontFamily: 'inherit' }} />
              </div>
            </div>

            {/* Applied adjustments history (collapsed) */}
            {appliedAdj.length > 0 && (
              <div style={{ marginTop: 16, paddingTop: 12, borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: '#606088', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6 }}>Past Adjustments</div>
                {appliedAdj.map((a: any) => (<div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '3px 0', fontSize: 11, color: '#8080A8' }}><span style={{ flex: 1 }}>{a.reason}</span><span>−${((a.amount_cents ?? 0) / 100).toFixed(2)}</span><span style={{ fontSize: 9, color: '#606088' }}>{a.applied_at ? new Date(a.applied_at).toLocaleDateString() : ''}</span></div>))}
              </div>
            )}
          </div>
        )}

        {/* HISTORY TAB */}
        {tab === 'history' && (
          <div style={{ padding: '20px 20px 24px' }}>
            {(history ?? []).length === 0 ? <div style={{ padding: 30, textAlign: 'center', color: '#606088', fontSize: 13 }}>No payment history yet.</div> : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>{(history ?? []).map((h: any) => { const ok = h.status === 'completed' || h.status === 'succeeded'; return (<div key={h.id} style={{ padding: '10px 14px', borderRadius: 10, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)', display: 'flex', alignItems: 'center', gap: 12 }}><div style={{ flex: 1 }}><div style={{ fontSize: 13, fontWeight: 700, color: '#D0D0E8' }}>{dollars(h.amount_cents)}</div><div style={{ fontSize: 11, color: '#8080A8' }}>{new Date(h.created_at).toLocaleDateString()} · {h.card_brand ?? ''} ••••{h.card_last_four ?? ''}</div></div><span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 6, background: ok ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)', color: ok ? '#22C55E' : '#EF4444' }}>{h.status}</span>{isOwner && ok && <button onClick={() => toast('Refund requires Square integration', 'info')} className="btn-ghost" style={{ fontSize: 10 }}>Refund</button>}</div>) })}</div>
            )}
          </div>
        )}
        </div>{/* end scroll wrapper */}

      {/* Sub-modals */}
      {showBalanceAdj && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 10001, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setShowBalanceAdj(false)}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: '#1A1830', borderRadius: 16, padding: 24, width: 360, border: '1px solid rgba(255,255,255,0.1)' }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: '#E0E0F4', marginBottom: 16 }}>Adjust Balance</h3>
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>{(['credit', 'debit'] as const).map(t => (<button key={t} onClick={() => setBalType(t)} style={{ flex: 1, padding: 8, borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer', background: balType === t ? (t === 'credit' ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)') : 'rgba(255,255,255,0.03)', color: balType === t ? (t === 'credit' ? '#22C55E' : '#EF4444') : '#8080A8', border: `1px solid ${balType === t ? (t === 'credit' ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)') : 'rgba(255,255,255,0.06)'}` }}>{t.charAt(0).toUpperCase() + t.slice(1)}</button>))}</div>
            <div style={{ marginBottom: 12 }}><div style={labelStyle}>Amount ($)</div><input value={balAmount} onChange={(e) => setBalAmount(e.target.value)} type="number" className="filter-select" style={{ width: '100%' }} /></div>
            <div style={{ marginBottom: 16 }}><div style={labelStyle}>Reason *</div><input value={balReason} onChange={(e) => setBalReason(e.target.value)} className="filter-select" style={{ width: '100%' }} /></div>
            <div style={{ display: 'flex', gap: 8 }}><button className="btn-ghost" onClick={() => setShowBalanceAdj(false)}>Cancel</button><button className="btn-primary" onClick={async () => { if (!balAmount || !balReason) { toast('Required', 'error'); return }; const cents = Math.round(parseFloat(balAmount) * 100) * (balType === 'debit' ? -1 : 1); await adjustBalance.mutateAsync({ familyId, amountCents: cents, reason: balReason }); toast('Adjusted', 'success'); setShowBalanceAdj(false); setBalAmount(''); setBalReason('') }}>Save</button></div>
          </div>
        </div>
      )}

      {showRateOverride && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 10001, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setShowRateOverride(false)}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: '#1A1830', borderRadius: 16, padding: 24, width: 400, border: '1px solid rgba(255,255,255,0.1)' }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: '#E0E0F4', marginBottom: 16 }}>Override Rate</h3>
            <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>{[4500, 4000, 3750].map(v => { const r = RATE_LABELS[v]; return <button key={v} onClick={() => setOverrideValue(v)} style={{ flex: 1, padding: 8, borderRadius: 8, fontSize: 11, fontWeight: 700, cursor: 'pointer', background: overrideValue === v ? `${r.color}18` : 'rgba(255,255,255,0.03)', color: overrideValue === v ? r.color : '#8080A8', border: `1px solid ${overrideValue === v ? `${r.color}40` : 'rgba(255,255,255,0.06)'}` }}>{r.label}</button> })}</div>
            <div style={{ marginBottom: 16 }}><div style={labelStyle}>Reason *</div><input value={overrideReason} onChange={(e) => setOverrideReason(e.target.value)} className="filter-select" style={{ width: '100%' }} /></div>
            <div style={{ display: 'flex', gap: 8 }}><button className="btn-ghost" onClick={() => setShowRateOverride(false)}>Cancel</button>{family.rate_tier_override && <button className="btn-ghost" onClick={async () => { await removeOverride.mutateAsync({ familyId }); toast('Removed', 'success'); setShowRateOverride(false) }} style={{ color: '#FFB800' }}>Remove</button>}<button className="btn-primary" onClick={async () => { if (!overrideReason) { toast('Reason required', 'error'); return }; await overrideRate.mutateAsync({ familyId, rateTier: overrideValue, reason: overrideReason }); toast('Overridden', 'success'); setShowRateOverride(false) }}>Save</button></div>
          </div>
        </div>
      )}

      {/* Pause Modal — reason + expected return date */}
      {confirmStatus === 'paused' && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 10001, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setConfirmStatus(null)}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: '#1A1830', borderRadius: 16, padding: 24, width: 400, border: '1px solid rgba(255,184,0,0.2)' }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: '#FFB800', marginBottom: 4 }}>Pause Billing</h3>
            <div style={{ fontSize: 11, color: '#8080A8', marginBottom: 16 }}>This family will move to the Paused tab with AI follow-up tracking.</div>
            <div style={{ marginBottom: 12 }}>
              <div style={labelStyle}>Why are they pausing?</div>
              <div style={{ display: 'flex', gap: 4, marginBottom: 6 }}>
                {['Summer Break', 'Financial', 'Scheduling Conflict', 'Trying Something Else', 'Other'].map(r => (
                  <button key={r} onClick={() => setPauseReason(r === 'Other' ? '' : r)} style={{ padding: '3px 10px', borderRadius: 8, fontSize: 10, cursor: 'pointer', background: pauseReason === r ? 'rgba(255,184,0,0.1)' : 'rgba(255,255,255,0.03)', color: pauseReason === r ? '#FFB800' : '#8080A8', border: `1px solid ${pauseReason === r ? 'rgba(255,184,0,0.25)' : 'rgba(255,255,255,0.06)'}` }}>{r}</button>
                ))}
              </div>
              {!['Summer Break', 'Financial', 'Scheduling Conflict', 'Trying Something Else'].includes(pauseReason) && (
                <input value={pauseReason} onChange={(e) => setPauseReason(e.target.value)} className="filter-select" style={{ width: '100%', fontSize: 12 }} placeholder="Describe the reason..." autoFocus />
              )}
            </div>
            <div style={{ marginBottom: 16 }}>
              <div style={labelStyle}>When do they expect to come back?</div>
              <div style={{ display: 'flex', gap: 4, marginBottom: 6 }}>
                {['After Summer', 'Next Month', '2 Months', 'Unsure'].map(r => (
                  <button key={r} onClick={() => setPauseReturnDate(r)} style={{ padding: '3px 10px', borderRadius: 8, fontSize: 10, cursor: 'pointer', background: pauseReturnDate === r ? 'rgba(255,184,0,0.1)' : 'rgba(255,255,255,0.03)', color: pauseReturnDate === r ? '#FFB800' : '#8080A8', border: `1px solid ${pauseReturnDate === r ? 'rgba(255,184,0,0.25)' : 'rgba(255,255,255,0.06)'}` }}>{r}</button>
                ))}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn-ghost" onClick={() => setConfirmStatus(null)}>Cancel</button>
              <button className="btn-primary" style={{ background: 'rgba(255,184,0,0.15)', color: '#FFB800' }} onClick={async () => {
                if (!pauseReason) { toast('Reason required', 'error'); return }
                if (!pauseReturnDate) { toast('Expected return required', 'error'); return }
                await updateStatus.mutateAsync({ familyId, oldStatus: family.billing_status, newStatus: 'paused' })
                // Log the pause reason and return date
                await supabase.from('audit_log').insert({ tenant_id: family.tenant_id, entity_type: 'family', entity_id: familyId, action: 'billing_paused', details: { reason: pauseReason, expected_return: pauseReturnDate }, performed_by: (await supabase.auth.getUser()).data.user?.id })
                const { error: notesErr } = await supabase.from('families').update({ billing_notes: `PAUSED: ${pauseReason} | Return: ${pauseReturnDate}${family.billing_notes ? '\n' + family.billing_notes : ''}` }).eq('id', familyId)
                if (notesErr) toast('Status paused but notes failed to save', 'error')
                else toast('Paused — will track for follow-up', 'success')
                setConfirmStatus(null)
              }}>Pause Billing</button>
            </div>
          </div>
        </div>
      )}

      {/* Inactive Modal — required reason, final */}
      {confirmStatus === 'cancelled' && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 10001, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setConfirmStatus(null)}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: '#1A1830', borderRadius: 16, padding: 24, width: 400, border: '1px solid rgba(239,68,68,0.2)' }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: '#EF4444', marginBottom: 4 }}>Set Inactive</h3>
            <div style={{ fontSize: 11, color: '#8080A8', marginBottom: 16 }}>This marks the family as no longer returning. This stops billing and removes them from active views.</div>
            <div style={{ marginBottom: 12 }}>
              <div style={labelStyle}>Why are they leaving? *</div>
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 6 }}>
                {['Moved Away', 'Financial', 'Lost Interest', 'Switched Schools', 'Graduated', 'Bad Experience', 'Other'].map(r => (
                  <button key={r} onClick={() => setInactiveReason(r === 'Other' ? '' : r)} style={{ padding: '3px 10px', borderRadius: 8, fontSize: 10, cursor: 'pointer', background: inactiveReason === r ? 'rgba(239,68,68,0.1)' : 'rgba(255,255,255,0.03)', color: inactiveReason === r ? '#EF4444' : '#8080A8', border: `1px solid ${inactiveReason === r ? 'rgba(239,68,68,0.25)' : 'rgba(255,255,255,0.06)'}` }}>{r}</button>
                ))}
              </div>
              {!['Moved Away', 'Financial', 'Lost Interest', 'Switched Schools', 'Graduated', 'Bad Experience'].includes(inactiveReason) && (
                <input value={inactiveReason} onChange={(e) => setInactiveReason(e.target.value)} className="filter-select" style={{ width: '100%', fontSize: 12 }} placeholder="Required: why are they leaving..." autoFocus />
              )}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn-ghost" onClick={() => setConfirmStatus(null)}>Cancel</button>
              <button className="btn-primary" style={{ background: 'rgba(239,68,68,0.15)', color: '#EF4444' }} onClick={async () => {
                if (!inactiveReason) { toast('Reason required', 'error'); return }
                await updateStatus.mutateAsync({ familyId, oldStatus: family.billing_status, newStatus: 'cancelled' })
                await supabase.from('audit_log').insert({ tenant_id: family.tenant_id, entity_type: 'family', entity_id: familyId, action: 'billing_cancelled', details: { reason: inactiveReason }, performed_by: (await supabase.auth.getUser()).data.user?.id })
                const { error: notesErr2 } = await supabase.from('families').update({ billing_notes: `INACTIVE: ${inactiveReason}${family.billing_notes ? '\n' + family.billing_notes : ''}` }).eq('id', familyId)
                if (notesErr2) toast('Status set but notes failed to save', 'error')
                else toast('Set to Inactive', 'success')
                setConfirmStatus(null)
              }}>Confirm Inactive</button>
            </div>
          </div>
        </div>
      )}
    </DraggableModal>
  )
}
