import { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { FunctionsHttpError } from '@supabase/supabase-js'
import { supabase } from '../../lib/supabase'
import { useAuthContext } from '../../app/AuthContext'
import MusicLoader from '../../components/shared/MusicLoader'
import { useLocations } from '../../hooks/useLocations'
import { usePermissions } from '../../hooks/usePermissions'
import { useUrlFilters } from '../../hooks/useUrlFilters'
import {
  useBillingFamilies,
  useBillingFamiliesForOneOff,
  useNextCycle,
  useRemainingToCollect,
  useOverdueFamilies,
  usePaidThisMonth,
  useCreditsLedger,
  useCreateBillingAdjustment,
  useCreateOneOffInvoice,
} from '../../hooks/useBillingPage'
import { useBillingSnapshot } from '../../hooks/useBillingSnapshot'
import BillingSnapshotCard from '../../components/admin/BillingSnapshotCard'
import { getLocationColor } from '../../utils/locationColor'
import { toast } from '../../components/shared/Toast'
import {
  CreditCard, DollarSign, AlertTriangle, CheckCircle, Users,
  FileText, RefreshCw, X, ChevronDown, Plus, Search,
} from 'lucide-react'
import { IssueContextProvider } from '../../contexts/IssueContext'
import ReportIssueButton from '../../components/shared/ReportIssueButton'
import BillingPageGuide from '../../components/admin/BillingPageGuide'
import BillingInvoicesPanel from '../../components/admin/BillingInvoicesPanel'
import { instrumentWithEmojiTitle } from '../../utils/instrumentEmoji'

// ══════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════

function dollars(cents: number | null | undefined): string {
  if (cents == null || cents === 0) return '$0.00'
  const abs = Math.abs(cents) / 100
  return `${cents < 0 ? '-' : ''}$${abs.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

type SectionKey = 'none' | 'invoices' | 'next' | 'remaining' | 'overdue' | 'paid'

// ══════════════════════════════════════════
// GLASS CARD STYLES
// ══════════════════════════════════════════

const glass: React.CSSProperties = {
  background: 'rgba(255,255,255,0.03)',
  border: '1px solid rgba(255,255,255,0.06)',
  borderRadius: 16,
  padding: 20,
}

const glassCompact: React.CSSProperties = {
  ...glass,
  padding: 14,
}

// ══════════════════════════════════════════
// STATUS BADGE
// ══════════════════════════════════════════

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    active: '#22C55E',
    paused: '#FFB800',
    suspended: '#FF7800',
    cancelled: '#8080A8',
    pending: '#FFB800',
    completed: '#22C55E',
    failed: '#EF4444',
  }
  const c = colors[status] ?? '#606088'
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      fontSize: 11, fontWeight: 600, color: c,
      padding: '2px 8px', borderRadius: 6,
      background: `${c}18`, border: `1px solid ${c}30`,
    }}>
      <span style={{ width: 6, height: 6, borderRadius: 3, background: c }} />
      {status}
    </span>
  )
}

// ══════════════════════════════════════════
// CARD ON FILE
// ══════════════════════════════════════════

function CardBadge({ brand, last4 }: { brand: string | null; last4: string | null }) {
  if (!last4) return <span style={{ fontSize: 11, color: '#EF4444' }}>No card</span>
  return (
    <span style={{ fontSize: 11, color: '#A0A0C8', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
      <CreditCard size={12} />
      {brand ?? 'Card'} ····{last4}
    </span>
  )
}

// ══════════════════════════════════════════
// MODAL SHELL
// ══════════════════════════════════════════

function ModalShell({ onClose, title, children }: { onClose: () => void; title: string; children: React.ReactNode }) {
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 10000,
      background: 'rgba(2,2,9,0.95)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 16,
    }} onClick={onClose}>
      <div style={{
        ...glass,
        maxWidth: 680, width: '100%', maxHeight: '85vh', overflow: 'auto',
        background: 'rgba(255,255,255,0.04)',
        border: '1px solid rgba(255,255,255,0.08)',
      }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: '#E0E0F4', margin: 0 }}>{title}</h2>
          <button onClick={onClose} style={{
            background: 'rgba(255,255,255,0.06)', border: 'none', borderRadius: 8,
            width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', color: '#A0A0C8',
          }}>
            <X size={16} />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

// ══════════════════════════════════════════
// SHARED INPUT STYLES
// ══════════════════════════════════════════

const inputStyle: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box' as const,
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: 8, padding: '8px 10px',
  color: '#E0E0F4', fontSize: 13,
  outline: 'none', minHeight: 36,
}

const selectStyle: React.CSSProperties = {
  ...inputStyle,
  cursor: 'pointer',
}

const labelStyle: React.CSSProperties = {
  fontSize: 11, color: '#A0A0C8', fontWeight: 500,
  display: 'block', marginBottom: 4,
}

const utilBtn: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 5,
  fontSize: 12, fontWeight: 500, color: '#A0A0C8',
  background: 'rgba(255,255,255,0.03)',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: 8, padding: '6px 12px',
  cursor: 'pointer', minHeight: 32,
}

// ══════════════════════════════════════════
// PER-LOCATION SNAPSHOT CARD (loads its own data)
// ══════════════════════════════════════════

function LocationSnapshotCard({ locationId, name, color, onSelect }: {
  locationId: string; name: string; color: string; onSelect: () => void
}) {
  const { data } = useBillingSnapshot(locationId)
  if (!data) return null
  return (
    <div onClick={onSelect} style={{ cursor: 'pointer' }}>
      <BillingSnapshotCard
        title={name}
        data={data}
        accentColor={color}
        variant="full"
        size="default"
        clickable={false}
      />
    </div>
  )
}

// ══════════════════════════════════════════
// MAIN PAGE
// ══════════════════════════════════════════

const SQUARE_SYNC_STORAGE_OK = 'lp_square_sync_last_ok'
const SQUARE_SYNC_STORAGE_ERR = 'lp_square_sync_last_err'

function BillingInner() {
  const { data: locations } = useLocations()
  const { isStudioDirector, locationIds } = usePermissions()
  const { role } = useAuthContext()
  const canSquareSync = role === 'owner' || role === 'admin' || role === 'company_director'

  const { getParam, setParam } = useUrlFilters()
  const locationFilter = isStudioDirector ? (locationIds?.[0] ?? '') : getParam('location')
  const setLocationFilter = (v: string) => setParam('location', v)
  const tabRaw = getParam('tab')
  const activeSection = (
    tabRaw === 'invoices' || tabRaw === 'next' || tabRaw === 'remaining' || tabRaw === 'overdue' || tabRaw === 'paid'
      ? tabRaw
      : 'none'
  ) as SectionKey
  const setActiveSection = (v: SectionKey) => {
    if (v === 'none') setParam('tab', '')
    else setParam('tab', v)
  }
  const search = getParam('q')
  const setSearch = (v: string) => setParam('q', v)
  const sortBy = getParam('sort') || 'name'
  const setSortBy = (v: string) => setParam('sort', v === 'name' ? '' : v)
  const [showCreditsLedger, setShowCreditsLedger] = useState(false)
  const [showOneOff, setShowOneOff] = useState(false)
  const [showSquareSync, setShowSquareSync] = useState(false)
  const [creditRow, setCreditRow] = useState<string | null>(null)
  // Data hooks — billing snapshot (new role-scoped cards)
  const { data: snapshotAll, isLoading: snapshotLoading } = useBillingSnapshot()
  const directorLocId = isStudioDirector ? (locationIds?.[0] ?? undefined) : undefined
  const { data: snapshotDirectorLoc } = useBillingSnapshot(directorLocId)

  // Data hooks — each section loads only when its tab is active (faster initial paint)
  const { data: families, isLoading: familiesLoading } = useBillingFamilies(locationFilter, activeSection === 'invoices')
  const { data: oneOffFamilies } = useBillingFamiliesForOneOff(showOneOff)
  const { data: nextCycle, isLoading: nextLoading } = useNextCycle(locationFilter, activeSection === 'next')
  const { data: remaining, isLoading: remainingLoading } = useRemainingToCollect(locationFilter, activeSection === 'remaining')
  const { data: overdue, isLoading: overdueLoading } = useOverdueFamilies(locationFilter, activeSection === 'overdue')
  const { data: paidData, isLoading: paidLoading } = usePaidThisMonth(locationFilter, activeSection === 'paid')
  const { data: credits } = useCreditsLedger(locationFilter, showCreditsLedger)

  // Mutations
  const createAdj = useCreateBillingAdjustment()
  const createInvoice = useCreateOneOffInvoice()

  // Locations
  const activeLocations = useMemo(() =>
    (locations ?? []).filter((l: any) => l.is_active),
    [locations],
  )

  const locColorMap = useMemo(() => {
    const m: Record<string, string> = {}
    for (const l of activeLocations) {
      m[l.id] = l.color || '#D4226A'
    }
    return m
  }, [activeLocations])

  // Filtered families for Section 1
  const filteredFamilies = useMemo(() => {
    let list = families ?? []
    if (search) {
      const q = search.toLowerCase()
      list = list.filter(f =>
        f.name?.toLowerCase().includes(q) ||
        f.parent_name?.toLowerCase().includes(q) ||
        f.students.some(s => `${s.first_name} ${s.last_name}`.toLowerCase().includes(q))
      )
    }
    if (sortBy === 'name') list = [...list].sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''))
    if (sortBy === 'amount') list = [...list].sort((a, b) => b.monthlyTotalCents - a.monthlyTotalCents)
    if (sortBy === 'students') list = [...list].sort((a, b) => b.activeStudentCount - a.activeStudentCount)
    return list
  }, [families, search, sortBy])

  // Per-location snapshot data for owner/admin breakdown
  const perLocationSnapshots = useMemo(() => {
    if (isStudioDirector || !activeLocations.length) return []
    return activeLocations.map((loc: any) => ({
      locationId: loc.id,
      name: loc.name,
      color: getLocationColor(loc.id),
    }))
  }, [isStudioDirector, activeLocations])

  return (
    <div style={{ minHeight: '100vh', background: '#020209', padding: '0 16px 40px' }}>
      {/* HEADER */}
      <div data-tour-id="billing-header" style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '20px 0 12px', flexWrap: 'wrap', gap: 8,
      }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: '#E0E0F4', margin: 0 }}>Billing</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <ReportIssueButton context="billing" />
          {isStudioDirector && <BillingPageGuide />}
        </div>
      </div>

      {/* LOCATION FILTER — Desktop pills */}
      {!isStudioDirector && <div className="billing-loc-pills" style={{
        display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16,
      }}>
        <button
          onClick={() => setLocationFilter('')}
          style={{
            padding: '6px 14px', borderRadius: 20, fontSize: 12, fontWeight: 600,
            border: `1px solid ${!locationFilter ? '#D4226A' : 'rgba(255,255,255,0.1)'}`,
            background: !locationFilter ? 'rgba(212,34,106,0.15)' : 'rgba(255,255,255,0.03)',
            color: !locationFilter ? '#D4226A' : '#A0A0C8',
            cursor: 'pointer', whiteSpace: 'nowrap', minHeight: 32,
          }}
        >
          All Locations
        </button>
        {activeLocations.map((loc: any) => {
          const c = loc.color || '#D4226A'
          const active = locationFilter === loc.id
          return (
            <button
              key={loc.id}
              onClick={() => setLocationFilter(active ? '' : loc.id)}
              style={{
                padding: '6px 14px', borderRadius: 20, fontSize: 12, fontWeight: 600,
                border: `1px solid ${active ? c : 'rgba(255,255,255,0.1)'}`,
                background: active ? `${c}22` : 'rgba(255,255,255,0.03)',
                color: active ? c : '#A0A0C8',
                cursor: 'pointer', whiteSpace: 'nowrap', minHeight: 32,
              }}
            >
              {loc.name}
            </button>
          )
        })}
      </div>}

      {/* LOCATION FILTER — Mobile dropdown */}
      {!isStudioDirector && <div className="billing-loc-dropdown" style={{ display: 'none', marginBottom: 16 }}>
        <div style={{ position: 'relative' }}>
          <select
            value={locationFilter}
            onChange={e => setLocationFilter(e.target.value)}
            style={{
              width: '100%', appearance: 'none' as const,
              background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 10, color: '#E0E0F4', fontSize: 13, fontWeight: 600,
              padding: '10px 36px 10px 14px', cursor: 'pointer', minHeight: 40,
            }}
          >
            <option value="">All Locations</option>
            {activeLocations.map((loc: any) => (
              <option key={loc.id} value={loc.id}>{loc.name}</option>
            ))}
          </select>
          <ChevronDown size={14} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', color: '#606088', pointerEvents: 'none' as const }} />
        </div>
      </div>}

      {/* BILLING SNAPSHOT CARDS — role-scoped */}
      {snapshotLoading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><MusicLoader size={28} /></div>
      ) : isStudioDirector ? (
        /* Studio Director: only their location */
        snapshotDirectorLoc && (
          <div data-tour-id="billing-hero-cards" style={{ marginBottom: 16 }}>
            <BillingSnapshotCard
              title={activeLocations.find((l: any) => l.id === directorLocId)?.name ?? 'My Location'}
              data={snapshotDirectorLoc}
              accentColor={directorLocId ? getLocationColor(directorLocId) : '#D4226A'}
              variant="full"
              size="large"
              clickable={false}
            />
          </div>
        )
      ) : snapshotAll ? (
        /* Owner / Admin: aggregate + per-location breakdown */
        <div data-tour-id="billing-hero-cards" style={{ marginBottom: 16 }}>
          <BillingSnapshotCard
            title="All Schools"
            data={snapshotAll}
            accentColor="#D4226A"
            variant="full"
            size="large"
            clickable={true}
            onMetricClick={(metric) => {
              if (metric === 'invoiced') setLocationFilter('')
              else if (metric === 'scheduled') setLocationFilter('')
            }}
          />
          {/* Per-location breakdown */}
          {perLocationSnapshots.length > 0 && (
            <div style={{
              display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
              gap: 10, marginTop: 12,
            }}>
              {perLocationSnapshots.map((loc) => (
                <LocationSnapshotCard
                  key={loc.locationId}
                  locationId={loc.locationId}
                  name={loc.name}
                  color={loc.color}
                  onSelect={() => setLocationFilter(loc.locationId)}
                />
              ))}
            </div>
          )}
        </div>
      ) : null}

      {/* UTILITY STRIP */}
      <div data-tour-id="billing-utility-strip" style={{
        display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap',
      }}>
        <button data-tour-id="billing-credits-btn" onClick={() => setShowCreditsLedger(true)} style={utilBtn}>
          <FileText size={13} /> Credits Ledger
        </button>
        <button data-tour-id="billing-oneoff-btn" onClick={() => setShowOneOff(true)} style={utilBtn}>
          <Plus size={13} /> One-Off Invoice
        </button>
        {!isStudioDirector && canSquareSync && (
          <button type="button" data-tour-id="billing-square-sync-btn" onClick={() => setShowSquareSync(true)} style={utilBtn}>
            <RefreshCw size={13} /> Square Sync
          </button>
        )}
      </div>

      <BillingInvoicesPanel
        isStudioDirector={isStudioDirector}
        directorLocationId={directorLocId}
        activeLocations={activeLocations.map((l: any) => ({ id: l.id, name: l.name }))}
      />

      {activeSection === 'none' && (
        <div style={{ color: '#8080A8', fontSize: 13, padding: '8px 0 16px', textAlign: 'center' }}>
          Choose a section below for family billing detail, cycles, and payments.
        </div>
      )}

      {/* SECTION TABS */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 16, overflowX: 'auto' }}>
        {([
          { key: 'invoices' as SectionKey, label: 'Families' },
          { key: 'next' as SectionKey, label: 'Next Cycle' },
          { key: 'remaining' as SectionKey, label: 'Remaining' },
          { key: 'overdue' as SectionKey, label: 'Overdue' },
          { key: 'paid' as SectionKey, label: 'Paid' },
        ]).map(tab => (
          <button
            key={tab.key}
            data-tour-id={`billing-tab-${tab.key}`}
            onClick={() => setActiveSection(tab.key)}
            style={{
              padding: '6px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600,
              border: `1px solid ${activeSection === tab.key ? '#D4226A' : 'rgba(255,255,255,0.08)'}`,
              background: activeSection === tab.key ? 'rgba(212,34,106,0.12)' : 'rgba(255,255,255,0.02)',
              color: activeSection === tab.key ? '#D4226A' : '#A0A0C8',
              cursor: 'pointer', whiteSpace: 'nowrap', minHeight: 32,
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* SECTION CONTENT */}
      {activeSection === 'invoices' && (
        <div data-tour-id="billing-families-section">
        <SectionInvoices
          families={filteredFamilies}
          loading={familiesLoading}
          search={search}
          setSearch={setSearch}
          sortBy={sortBy}
          setSortBy={setSortBy}
          locColorMap={locColorMap}
        />
        </div>
      )}
      {activeSection === 'next' && (
        <SectionNextCycle
          data={nextCycle}
          loading={nextLoading}
          creditRow={creditRow}
          setCreditRow={setCreditRow}
          onAddCredit={async (familyId, amt, reason) => {
            try {
              await createAdj.mutateAsync({
                familyId,
                adjustmentType: 'credit',
                amountCents: amt,
                reason,
              })
              toast('Credit added', 'success')
              setCreditRow(null)
            } catch {
              toast('Failed to add credit', 'error')
            }
          }}
        />
      )}
      {activeSection === 'remaining' && (
        <SectionRemaining data={remaining} loading={remainingLoading} />
      )}
      {activeSection === 'overdue' && (
        <SectionOverdue data={overdue} loading={overdueLoading} />
      )}
      {activeSection === 'paid' && (
        <SectionPaid data={paidData} loading={paidLoading} />
      )}

      {/* MODALS */}
      {showCreditsLedger && (
        <CreditsLedgerModal credits={credits ?? []} onClose={() => setShowCreditsLedger(false)} />
      )}
      {showOneOff && (
        <OneOffInvoiceModal
          families={oneOffFamilies ?? []}
          onClose={() => setShowOneOff(false)}
          onSubmit={async (data) => {
            try {
              await createInvoice.mutateAsync(data)
              toast('Invoice created', 'success')
              setShowOneOff(false)
            } catch {
              toast('Failed to create invoice', 'error')
            }
          }}
          submitting={createInvoice.isPending}
        />
      )}
      {showSquareSync && (
        <SquareSyncModal canSync={canSquareSync} onClose={() => setShowSquareSync(false)} />
      )}

      {/* RESPONSIVE STYLES */}
      <style>{`
        @media (max-width: 768px) {
          .billing-loc-pills { display: none !important; }
          .billing-loc-dropdown { display: block !important; }
        }
      `}</style>
    </div>
  )
}

// ══════════════════════════════════════════
// SECTION 1: FAMILIES INVOICES
// ══════════════════════════════════════════

function SectionInvoices({
  families, loading, search, setSearch, sortBy, setSortBy, locColorMap,
}: {
  families: any[]; loading: boolean; search: string; setSearch: (s: string) => void;
  sortBy: string; setSortBy: (s: string) => void; locColorMap: Record<string, string>;
}) {
  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><MusicLoader size={24} /></div>

  return (
    <div>
      {/* TOOLBAR */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6,
          background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 8, padding: '0 10px', flex: '1 1 200px', minHeight: 36,
        }}>
          <Search size={14} style={{ color: '#606088' }} />
          <input
            placeholder="Search families or students..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{
              background: 'none', border: 'none', outline: 'none',
              color: '#E0E0F4', fontSize: 13, width: '100%', padding: '8px 0',
            }}
          />
        </div>
        <div style={{ position: 'relative' }}>
          <select
            value={sortBy}
            onChange={e => setSortBy(e.target.value)}
            style={{
              appearance: 'none' as const, background: 'rgba(255,255,255,0.03)',
              border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8,
              color: '#A0A0C8', fontSize: 12, padding: '8px 28px 8px 10px',
              cursor: 'pointer', minHeight: 36,
            }}
          >
            <option value="name">Sort: Name</option>
            <option value="amount">Sort: Amount</option>
            <option value="students">Sort: Students</option>
          </select>
          <ChevronDown size={12} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', color: '#606088', pointerEvents: 'none' as const }} />
        </div>
      </div>

      {families.length === 0 ? (
        <div style={{ ...glass, textAlign: 'center', padding: 40, color: '#606088' }}>
          No active families found
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {families.map(f => (
            <div key={f.id} style={glass}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: '#E0E0F4' }}>{f.name}</div>
                  {f.parent_name && <div style={{ fontSize: 12, color: '#A0A0C8' }}>{f.parent_name}</div>}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <StatusBadge status={f.billing_status} />
                  <CardBadge brand={f.card_brand} last4={f.card_last_four} />
                </div>
              </div>

              {/* Students */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 10 }}>
                {f.students.map((s: any) => {
                  const locColor = s.location_id ? locColorMap[s.location_id] : null
                  return (
                    <div key={s.id} style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '6px 10px', borderRadius: 8,
                      background: 'rgba(255,255,255,0.02)', flexWrap: 'wrap', gap: 4,
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        {locColor && <span style={{ width: 6, height: 6, borderRadius: 3, background: locColor, flexShrink: 0 }} />}
                        <span style={{ fontSize: 13, color: '#E0E0F4', fontWeight: 500 }}>{s.first_name} {s.last_name}</span>
                        {s.instrument && <span style={{ fontSize: 11, color: '#606088' }}>{instrumentWithEmojiTitle(s.instrument)}</span>}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12 }}>
                        <span style={{ color: '#A0A0C8' }}>{s.sessions_per_month} sessions</span>
                        <span style={{ color: '#A0A0C8' }}>@ {dollars(s.rate_per_session * 100)}</span>
                        <span style={{ color: '#FFB800', fontWeight: 600 }}>{dollars(s.monthly_cents)}</span>
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* Footer */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
                <div style={{ fontSize: 11, color: '#606088' }}>
                  {f.billing_day ? `Bills on day ${f.billing_day}` : 'No billing day set'}
                  {f.overdue_balance_cents > 0 && (
                    <span style={{ color: '#EF4444', marginLeft: 10, fontWeight: 600 }}>
                      Overdue: {dollars(f.overdue_balance_cents)}
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 16, fontWeight: 800, color: '#FFB800' }}>
                  {dollars(f.monthlyTotalCents)}<span style={{ fontSize: 11, fontWeight: 400, color: '#606088' }}>/mo</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ══════════════════════════════════════════
// SECTION 2: NEXT CYCLE
// ══════════════════════════════════════════

function SectionNextCycle({
  data, loading, creditRow, setCreditRow, onAddCredit,
}: {
  data: any; loading: boolean;
  creditRow: string | null; setCreditRow: (id: string | null) => void;
  onAddCredit: (familyId: string, amountCents: number, reason: string) => Promise<void>;
}) {
  const [creditAmt, setCreditAmt] = useState('')
  const [creditReason, setCreditReason] = useState('')

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><MusicLoader size={24} /></div>
  if (!data) return null

  const { families: fams, totalCents, totalSessions } = data

  return (
    <div>
      {/* Summary bar */}
      <div style={{
        ...glassCompact,
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        marginBottom: 12, flexWrap: 'wrap', gap: 8,
      }}>
        <span style={{ fontSize: 13, color: '#A0A0C8' }}>
          {fams.length} families &middot; {totalSessions} sessions
        </span>
        <span style={{ fontSize: 16, fontWeight: 800, color: '#FFB800' }}>
          Projected: {dollars(totalCents)}
        </span>
      </div>

      {fams.length === 0 ? (
        <div style={{ ...glass, textAlign: 'center', padding: 40, color: '#606088' }}>
          No families for next cycle
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {fams.map((f: any) => (
            <div key={f.id} style={glass}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#E0E0F4' }}>{f.name}</div>
                  {f.parent_name && <div style={{ fontSize: 11, color: '#A0A0C8' }}>{f.parent_name}</div>}
                </div>
                <CardBadge brand={f.card_brand} last4={f.card_last_four} />
              </div>

              {/* Students */}
              <div style={{ marginBottom: 8 }}>
                {f.students.map((s: any) => (
                  <div key={s.id} style={{ fontSize: 12, color: '#A0A0C8', padding: '2px 0' }}>
                    {s.first_name}{s.instrument ? ` (${instrumentWithEmojiTitle(s.instrument)})` : ''} — {s.sessions_per_month} sessions — {dollars(s.monthly_cents)}
                  </div>
                ))}
              </div>

              {/* Totals row */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12 }}>
                  <span style={{ color: '#A0A0C8' }}>Base: {dollars(f.baseCents)}</span>
                  {f.creditCents > 0 && (
                    <span style={{ color: '#22C55E', fontWeight: 600 }}>-{dollars(f.creditCents)}</span>
                  )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 16, fontWeight: 800, color: f.creditCents > 0 ? '#22C55E' : '#FFB800' }}>
                    {dollars(f.adjustedCents)}
                  </span>
                  <button
                    onClick={() => { setCreditRow(creditRow === f.id ? null : f.id); setCreditAmt(''); setCreditReason('') }}
                    style={{
                      ...utilBtn, fontSize: 11, padding: '4px 8px', minHeight: 28,
                      color: creditRow === f.id ? '#D4226A' : '#A0A0C8',
                    }}
                  >
                    <Plus size={11} /> Credit
                  </button>
                </div>
              </div>

              {/* Inline credit panel */}
              {creditRow === f.id && (
                <div style={{
                  marginTop: 10, padding: 12, borderRadius: 10,
                  background: 'rgba(212,34,106,0.06)', border: '1px solid rgba(212,34,106,0.15)',
                  display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end',
                }}>
                  <div style={{ flex: '1 1 80px' }}>
                    <label style={{ fontSize: 10, color: '#A0A0C8', display: 'block', marginBottom: 3 }}>Amount ($)</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={creditAmt}
                      onChange={e => setCreditAmt(e.target.value)}
                      placeholder="0.00"
                      style={inputStyle}
                    />
                  </div>
                  <div style={{ flex: '2 1 140px' }}>
                    <label style={{ fontSize: 10, color: '#A0A0C8', display: 'block', marginBottom: 3 }}>Reason</label>
                    <input
                      value={creditReason}
                      onChange={e => setCreditReason(e.target.value)}
                      placeholder="Missed session, etc."
                      style={inputStyle}
                    />
                  </div>
                  <button
                    onClick={() => {
                      const cents = Math.round(parseFloat(creditAmt || '0') * 100)
                      if (cents <= 0 || !creditReason.trim()) { toast('Enter amount and reason', 'error'); return }
                      onAddCredit(f.id, cents, creditReason.trim())
                    }}
                    style={{
                      background: '#D4226A', color: '#fff', border: 'none',
                      borderRadius: 8, padding: '8px 14px', fontSize: 12, fontWeight: 600,
                      cursor: 'pointer', minHeight: 36,
                    }}
                  >
                    Add Credit
                  </button>
                </div>
              )}

              {/* Applied adjustments */}
              {f.adjustments.length > 0 && (
                <div style={{ marginTop: 8 }}>
                  {f.adjustments.map((a: any) => (
                    <div key={a.id} style={{
                      fontSize: 11, color: '#22C55E', padding: '3px 0',
                      display: 'flex', gap: 6,
                    }}>
                      <span>-{dollars(Math.abs(a.amount_cents ?? 0))}</span>
                      <span style={{ color: '#606088' }}>{a.reason}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ══════════════════════════════════════════
// SECTION 3: REMAINING TO COLLECT
// ══════════════════════════════════════════

function SectionRemaining({ data, loading }: { data: any; loading: boolean }) {
  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><MusicLoader size={24} /></div>
  const list = data ?? []
  const total = list.reduce((s: number, f: any) => s + f.remainingCents, 0)

  return (
    <div>
      <div style={{
        ...glassCompact,
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        marginBottom: 12, flexWrap: 'wrap', gap: 8,
      }}>
        <span style={{ fontSize: 13, color: '#A0A0C8' }}>{list.length} families with balance</span>
        <span style={{ fontSize: 16, fontWeight: 800, color: '#FFB800' }}>{dollars(total)}</span>
      </div>

      {list.length === 0 ? (
        <div style={{ ...glass, textAlign: 'center', padding: 40, color: '#22C55E' }}>
          <CheckCircle size={24} style={{ marginBottom: 8 }} />
          <div>All collected — nothing outstanding</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {list.map((f: any) => (
            <div key={f.id} style={glass}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#E0E0F4' }}>{f.name}</div>
                  {f.parent_name && <div style={{ fontSize: 11, color: '#A0A0C8' }}>{f.parent_name}</div>}
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 18, fontWeight: 800, color: '#FFB800' }}>{dollars(f.remainingCents)}</div>
                  <CardBadge brand={f.card_brand} last4={f.card_last_four} />
                </div>
              </div>
              {f.billing_day && <div style={{ fontSize: 11, color: '#606088', marginTop: 6 }}>Bills on day {f.billing_day}</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ══════════════════════════════════════════
// SECTION 4: OVERDUE
// ══════════════════════════════════════════

function SectionOverdue({ data, loading }: { data: any; loading: boolean }) {
  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><MusicLoader size={24} /></div>
  const list = data ?? []
  const total = list.reduce((s: number, f: any) => s + f.overdueCents, 0)

  return (
    <div>
      {/* Red-accented header */}
      <div style={{
        ...glassCompact,
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        marginBottom: 12, flexWrap: 'wrap', gap: 8,
        borderColor: 'rgba(239,68,68,0.2)',
        background: 'rgba(239,68,68,0.04)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <AlertTriangle size={14} style={{ color: '#EF4444' }} />
          <span style={{ fontSize: 13, color: '#EF4444', fontWeight: 600 }}>{list.length} overdue families</span>
        </div>
        <span style={{ fontSize: 16, fontWeight: 800, color: '#EF4444' }}>{dollars(total)}</span>
      </div>

      {list.length === 0 ? (
        <div style={{ ...glass, textAlign: 'center', padding: 40, color: '#22C55E' }}>
          <CheckCircle size={24} style={{ marginBottom: 8 }} />
          <div>No overdue accounts</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {list.map((f: any) => (
            <div key={f.id} style={{
              ...glass,
              borderColor: 'rgba(239,68,68,0.15)',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#E0E0F4' }}>{f.name}</div>
                  {f.parent_name && <div style={{ fontSize: 11, color: '#A0A0C8' }}>{f.parent_name}</div>}
                  <CardBadge brand={f.card_brand} last4={f.card_last_four} />
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 20, fontWeight: 800, color: '#EF4444' }}>{dollars(f.overdueCents)}</div>
                  <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                    <button style={{
                      fontSize: 11, fontWeight: 600, color: '#FFB800',
                      background: 'rgba(255,184,0,0.1)', border: '1px solid rgba(255,184,0,0.2)',
                      borderRadius: 6, padding: '4px 10px', cursor: 'pointer', minHeight: 28,
                    }}>
                      Retry
                    </button>
                    <button style={{
                      fontSize: 11, fontWeight: 600, color: '#A0A0C8',
                      background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
                      borderRadius: 6, padding: '4px 10px', cursor: 'pointer', minHeight: 28,
                    }}>
                      Contact
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ══════════════════════════════════════════
// SECTION 5: PAID THIS MONTH
// ══════════════════════════════════════════

function SectionPaid({ data, loading }: { data: any; loading: boolean }) {
  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><MusicLoader size={24} /></div>
  const payments = data?.payments ?? []
  const total = data?.totalCents ?? 0

  return (
    <div>
      <div style={{
        ...glassCompact,
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        marginBottom: 12, flexWrap: 'wrap', gap: 8,
        borderColor: 'rgba(34,197,94,0.2)',
        background: 'rgba(34,197,94,0.04)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <CheckCircle size={14} style={{ color: '#22C55E' }} />
          <span style={{ fontSize: 13, color: '#22C55E', fontWeight: 600 }}>{payments.length} payments this month</span>
        </div>
        <span style={{ fontSize: 16, fontWeight: 800, color: '#22C55E' }}>{dollars(total)}</span>
      </div>

      {payments.length === 0 ? (
        <div style={{ ...glass, textAlign: 'center', padding: 40, color: '#606088' }}>
          No payments recorded this month
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {payments.map((p: any) => (
            <div key={p.id} style={glassCompact}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#E0E0F4' }}>{p.familyName}</div>
                  {p.parentName && <div style={{ fontSize: 11, color: '#A0A0C8' }}>{p.parentName}</div>}
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 16, fontWeight: 800, color: '#22C55E' }}>{dollars(p.amount_cents)}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'flex-end' }}>
                    <CardBadge brand={p.card_brand} last4={p.card_last_four} />
                    <span style={{ fontSize: 10, color: '#606088' }}>
                      {new Date(p.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ══════════════════════════════════════════
// MODAL: CREDITS LEDGER
// ══════════════════════════════════════════

function CreditsLedgerModal({ credits, onClose }: { credits: any[]; onClose: () => void }) {
  return (
    <ModalShell title="Credits Ledger" onClose={onClose}>
      {credits.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 30, color: '#606088' }}>No adjustments recorded</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {credits.map((c: any) => (
            <div key={c.id} style={{
              padding: '10px 12px', borderRadius: 10,
              background: 'rgba(255,255,255,0.02)',
              border: '1px solid rgba(255,255,255,0.05)',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 6 }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#E0E0F4' }}>{c.familyName}</div>
                  {c.studentName && <div style={{ fontSize: 11, color: '#A0A0C8' }}>{c.studentName}</div>}
                  <div style={{ fontSize: 11, color: '#606088', marginTop: 2 }}>{c.reason}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#22C55E' }}>-{dollars(Math.abs(c.amount_cents ?? 0))}</div>
                  <div style={{ fontSize: 10, color: '#606088' }}>
                    {c.adjustment_type} &middot; {c.applied ? 'Applied' : 'Pending'}
                  </div>
                  <div style={{ fontSize: 10, color: '#606088' }}>
                    Cycle: {c.applies_to_cycle} &middot; {new Date(c.created_at).toLocaleDateString()}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </ModalShell>
  )
}

// ══════════════════════════════════════════
// MODAL: ONE-OFF INVOICE
// ══════════════════════════════════════════

function OneOffInvoiceModal({
  families, onClose, onSubmit, submitting,
}: {
  families: any[]; onClose: () => void;
  onSubmit: (data: { familyId: string; studentId?: string; description: string; amountCents: number; dueDate: string; note?: string }) => Promise<void>;
  submitting: boolean;
}) {
  const [familyId, setFamilyId] = useState('')
  const [studentId, setStudentId] = useState('')
  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [note, setNote] = useState('')

  const selectedFamily = families.find(f => f.id === familyId)

  return (
    <ModalShell title="Create One-Off Invoice" onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {/* Family */}
        <div>
          <label style={labelStyle}>Family</label>
          <select value={familyId} onChange={e => { setFamilyId(e.target.value); setStudentId('') }} style={selectStyle}>
            <option value="">Select family...</option>
            {families.map(f => (
              <option key={f.id} value={f.id}>{f.name}{f.parent_name ? ` (${f.parent_name})` : ''}</option>
            ))}
          </select>
        </div>

        {/* Student (optional) */}
        {selectedFamily && selectedFamily.students.length > 0 && (
          <div>
            <label style={labelStyle}>Student (optional)</label>
            <select value={studentId} onChange={e => setStudentId(e.target.value)} style={selectStyle}>
              <option value="">All / General</option>
              {selectedFamily.students.map((s: any) => (
                <option key={s.id} value={s.id}>{s.first_name} {s.last_name}</option>
              ))}
            </select>
          </div>
        )}

        {/* Description */}
        <div>
          <label style={labelStyle}>Description</label>
          <input value={description} onChange={e => setDescription(e.target.value)} placeholder="e.g., Book fee, recital costume" style={inputStyle} />
        </div>

        {/* Amount */}
        <div>
          <label style={labelStyle}>Amount ($)</label>
          <input type="number" step="0.01" min="0" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00" style={inputStyle} />
        </div>

        {/* Due Date */}
        <div>
          <label style={labelStyle}>Due Date</label>
          <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} style={inputStyle} />
        </div>

        {/* Note */}
        <div>
          <label style={labelStyle}>Note (optional)</label>
          <input value={note} onChange={e => setNote(e.target.value)} placeholder="Internal note" style={inputStyle} />
        </div>

        <button
          disabled={submitting || !familyId || !description || !amount || !dueDate}
          onClick={() => {
            const cents = Math.round(parseFloat(amount || '0') * 100)
            if (cents <= 0) { toast('Enter a valid amount', 'error'); return }
            onSubmit({
              familyId,
              studentId: studentId || undefined,
              description,
              amountCents: cents,
              dueDate,
              note: note || undefined,
            })
          }}
          style={{
            background: '#D4226A', color: '#fff', border: 'none',
            borderRadius: 10, padding: '12px 20px', fontSize: 14, fontWeight: 700,
            cursor: submitting ? 'wait' : 'pointer',
            opacity: submitting ? 0.6 : 1,
            minHeight: 44,
          }}
        >
          {submitting ? 'Creating...' : 'Create Invoice'}
        </button>
      </div>
    </ModalShell>
  )
}

// ══════════════════════════════════════════
// MODAL: SQUARE SYNC
// ══════════════════════════════════════════

type SquareSyncFnResponse = {
  success?: boolean
  error?: string
  request_id?: string
  synced_at?: string
  invoices?: { fetched?: number; deduplicated?: number; upserted?: number; upsert_errors?: number }
  families?: { matched?: number; unmatched?: number; overdue_updated?: number; square_id_backfilled?: number }
}

async function squareSyncInvokeErrorMessage(error: unknown): Promise<string> {
  if (error instanceof FunctionsHttpError && error.context instanceof Response) {
    try {
      const body = await error.context.clone().json() as { error?: string; request_id?: string }
      let msg =
        body?.error && typeof body.error === 'string'
          ? body.error
          : 'Edge Function returned a non-2xx status code'
      if (body?.request_id && typeof body.request_id === 'string' && !msg.includes(body.request_id)) {
        msg = `${msg} (request_id: ${body.request_id})`
      }
      return msg
    } catch {
      /* use fallback */
    }
  }
  if (error && typeof error === 'object' && 'message' in error && typeof (error as { message: string }).message === 'string') {
    return (error as { message: string }).message
  }
  return 'Square sync failed'
}

function SquareSyncModal({ canSync, onClose }: { canSync: boolean; onClose: () => void }) {
  const qc = useQueryClient()
  const [syncing, setSyncing] = useState(false)
  const syncInFlight = useRef(false)
  const [lastOk, setLastOk] = useState<{ at: string; body: string; requestId?: string } | null>(null)
  const [lastErr, setLastErr] = useState<string | null>(null)

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(SQUARE_SYNC_STORAGE_OK)
      if (raw) {
        const p = JSON.parse(raw) as { at: string; body: string; requestId?: string }
        if (p?.at && p?.body) {
          setLastOk(p)
          setLastErr(null)
        }
      } else {
        const er = sessionStorage.getItem(SQUARE_SYNC_STORAGE_ERR)
        if (er) setLastErr(er)
      }
    } catch {
      /* ignore */
    }
  }, [])

  const invalidateAfterSync = useCallback(() => {
    qc.invalidateQueries({
      predicate: (q) => {
        const k = q.queryKey[0]
        return typeof k === 'string' && (k.startsWith('billing') || k.startsWith('financials'))
      },
    })
  }, [qc])

  const runSync = async () => {
    if (!canSync) {
      toast('Your role cannot run Square sync', 'error')
      return
    }
    if (syncInFlight.current) return
    syncInFlight.current = true
    setSyncing(true)
    setLastErr(null)
    try {
      const { data, error } = await supabase.functions.invoke<SquareSyncFnResponse>('square-payment-sync', {
        method: 'POST',
        body: {},
      })

      if (error) {
        const msg = await squareSyncInvokeErrorMessage(error)
        setLastErr(msg)
        try {
          sessionStorage.setItem(SQUARE_SYNC_STORAGE_ERR, msg)
        } catch {
          /* ignore */
        }
        toast(msg, 'error')
        return
      }
      if (data && typeof data === 'object' && 'error' in data && (data as { error?: string }).error) {
        const msg = String((data as { error: string }).error)
        setLastErr(msg)
        try {
          sessionStorage.setItem(SQUARE_SYNC_STORAGE_ERR, msg)
        } catch {
          /* ignore */
        }
        toast(msg, 'error')
        return
      }
      if (data?.success) {
        const at = data.synced_at ?? new Date().toISOString()
        const inv = data.invoices
        const fam = data.families
        const line = [
          inv?.upserted != null ? `${inv.upserted} invoices saved` : null,
          fam?.matched != null ? `${fam.matched} invoice rows matched to families` : null,
          data.request_id ? `Request ${data.request_id}` : null,
        ]
          .filter(Boolean)
          .join(' · ')
        const ok = { at, body: line || 'Sync completed.', requestId: data.request_id }
        setLastOk(ok)
        try {
          sessionStorage.setItem(SQUARE_SYNC_STORAGE_OK, JSON.stringify(ok))
          sessionStorage.removeItem(SQUARE_SYNC_STORAGE_ERR)
        } catch {
          /* ignore */
        }
        toast('Square sync finished', 'success')
        invalidateAfterSync()
      } else {
        const msg = 'Unexpected response from Square sync'
        setLastErr(msg)
        try {
          sessionStorage.setItem(SQUARE_SYNC_STORAGE_ERR, msg)
        } catch {
          /* ignore */
        }
        toast(msg, 'error')
      }
    } catch (e: unknown) {
      let msg = 'Square sync failed'
      if (e instanceof DOMException && (e.name === 'AbortError' || e.name === 'TimeoutError')) {
        msg = 'Square sync timed out. If this persists, try again or check Edge Function logs.'
      } else if (e instanceof Error) {
        msg = e.message.includes('timed out') ? 'Square sync timed out. Try again in a moment.' : e.message
      }
      setLastErr(msg)
      try {
        sessionStorage.setItem(SQUARE_SYNC_STORAGE_ERR, msg)
      } catch {
        /* ignore */
      }
      toast(msg, 'error')
    } finally {
      syncInFlight.current = false
      setSyncing(false)
    }
  }

  return (
    <ModalShell title="Square Sync" onClose={onClose}>
      <div style={{ textAlign: 'center', padding: '20px 0' }}>
        <RefreshCw size={32} style={{ color: '#606088', marginBottom: 12 }} aria-hidden />
        <div style={{ fontSize: 14, color: '#A0A0C8', marginBottom: 16 }}>
          Imports Square invoice and payment status for reconciliation (amounts, paid/unpaid, hosted invoice links).
          Updates <code style={{ color: '#C0C0E0' }}>square_invoices</code> and family balances from that data.
          Schedules and recurring lessons are managed only in Lessonpreneur — not via Square.
        </div>
        <div style={{
          padding: '10px 14px', borderRadius: 8,
          background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)',
          fontSize: 12, color: '#606088', marginBottom: 16, textAlign: 'left', lineHeight: 1.45,
        }}>
          {!canSync ? (
            <span style={{ color: '#F87171' }}>Your role cannot run Square sync.</span>
          ) : lastOk ? (
            <>
              <div style={{ color: '#A0A0C8', marginBottom: 4 }}>Last successful sync</div>
              <div style={{ color: '#E0E0F4' }}>{new Date(lastOk.at).toLocaleString()}</div>
              <div style={{ marginTop: 8 }}>{lastOk.body}</div>
            </>
          ) : lastErr ? (
            <>
              <div style={{ color: '#F87171', marginBottom: 4 }}>Last attempt</div>
              <div>{lastErr}</div>
            </>
          ) : (
            <>Owner, admin, or company director. Requires Square API access for payment data (deploy secrets).</>
          )}
        </div>
        <button
          type="button"
          aria-busy={syncing}
          disabled={syncing || !canSync}
          onClick={() => void runSync()}
          style={{
            background: '#D4226A', color: '#fff', border: 'none',
            borderRadius: 10, padding: '12px 24px', fontSize: 14, fontWeight: 700,
            cursor: syncing || !canSync ? 'not-allowed' : 'pointer', minHeight: 44,
            opacity: syncing || !canSync ? 0.75 : 1,
          }}
        >
          {syncing ? 'Syncing…' : 'Sync Now'}
        </button>
      </div>
    </ModalShell>
  )
}

// ══════════════════════════════════════════
// EXPORT (wrapped with IssueContextProvider)
// ══════════════════════════════════════════

export default function Billing() {
  return (
    <IssueContextProvider page="billing">
      <BillingInner />
    </IssueContextProvider>
  )
}
