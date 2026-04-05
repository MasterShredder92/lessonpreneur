import { useState, useMemo } from 'react'
import MusicLoader from '../../components/shared/MusicLoader'
import { useLocations } from '../../hooks/useLocations'
import { usePermissions } from '../../hooks/usePermissions'
import { useUrlFilters } from '../../hooks/useUrlFilters'
import {
  useBillingHeroStats,
  useBillingFamilies,
  useNextCycle,
  useRemainingToCollect,
  useOverdueFamilies,
  usePaidThisMonth,
  useCreditsLedger,
  useCreateBillingAdjustment,
  useCreateOneOffInvoice,
} from '../../hooks/useBillingPage'
import { toast } from '../../components/shared/Toast'
import {
  CreditCard, DollarSign, AlertTriangle, CheckCircle, Users,
  FileText, RefreshCw, X, ChevronDown, Plus, Search,
} from 'lucide-react'
import { IssueContextProvider } from '../../contexts/IssueContext'
import ReportIssueButton from '../../components/shared/ReportIssueButton'
import BillingPageGuide from '../../components/admin/BillingPageGuide'
import { instrumentWithEmojiTitle } from '../../utils/instrumentEmoji'

// ══════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════

function dollars(cents: number | null | undefined): string {
  if (cents == null || cents === 0) return '$0.00'
  const abs = Math.abs(cents) / 100
  return `${cents < 0 ? '-' : ''}$${abs.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

type SectionKey = 'invoices' | 'next' | 'remaining' | 'overdue' | 'paid'

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
// MAIN PAGE
// ══════════════════════════════════════════

function BillingInner() {
  const { data: locations } = useLocations()
  const { isStudioDirector, locationIds } = usePermissions()

  const { getParam, setParam } = useUrlFilters()
  const locationFilter = isStudioDirector ? (locationIds?.[0] ?? '') : getParam('location')
  const setLocationFilter = (v: string) => setParam('location', v)
  const activeSection = (getParam('tab') || 'invoices') as SectionKey
  const setActiveSection = (v: SectionKey) => setParam('tab', v === 'invoices' ? '' : v)
  const search = getParam('q')
  const setSearch = (v: string) => setParam('q', v)
  const sortBy = getParam('sort') || 'name'
  const setSortBy = (v: string) => setParam('sort', v === 'name' ? '' : v)
  const [showCreditsLedger, setShowCreditsLedger] = useState(false)
  const [showOneOff, setShowOneOff] = useState(false)
  const [showSquareSync, setShowSquareSync] = useState(false)
  const [creditRow, setCreditRow] = useState<string | null>(null)
  const [expandedCard, setExpandedCard] = useState<string>('collected')

  // Data hooks
  const { data: heroStats, isLoading: heroLoading } = useBillingHeroStats(locationFilter || undefined)
  const { data: families, isLoading: familiesLoading } = useBillingFamilies(locationFilter)
  const { data: nextCycle, isLoading: nextLoading } = useNextCycle(locationFilter)
  const { data: remaining, isLoading: remainingLoading } = useRemainingToCollect(locationFilter)
  const { data: overdue, isLoading: overdueLoading } = useOverdueFamilies(locationFilter)
  const { data: paidData, isLoading: paidLoading } = usePaidThisMonth(locationFilter)
  const { data: credits } = useCreditsLedger(locationFilter)

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

  // Snapshot card config
  const snapshotCards = heroStats ? [
    {
      key: 'collected',
      label: 'Collected This Month',
      value: dollars(heroStats.collectedCents),
      sub: `${heroStats.collectedCount} payments received`,
      accent: '#22C55E',
      border: 'rgba(34,197,94,0.2)',
      bg: 'linear-gradient(150deg, rgba(6,18,9,0.97), rgba(4,12,6,0.99))',
      edgeBg: 'linear-gradient(#16A34A, #22C55E, #16A34A)',
      edgeShadow: '0 0 24px rgba(22,163,74,0.65)',
      glowColor: 'rgba(22,163,74,0.18)',
    },
    {
      key: 'awaiting',
      label: 'Awaiting Payment',
      value: dollars(heroStats.awaitingCents),
      sub: `${heroStats.awaitingCount} invoices scheduled`,
      accent: '#FBBF24',
      border: 'rgba(251,191,36,0.18)',
      bg: 'linear-gradient(150deg, rgba(13,10,4,0.97), rgba(9,7,3,0.99))',
      edgeBg: 'linear-gradient(#D97706, #FBBF24, #D97706)',
      edgeShadow: '0 0 24px rgba(251,191,36,0.55)',
      glowColor: 'rgba(251,191,36,0.16)',
    },
    {
      key: 'discounted',
      label: 'Discounted This Month',
      value: dollars(heroStats.discountedCents),
      sub: `Full potential: ${dollars(heroStats.fullPotentialCents)}`,
      accent: '#EF4444',
      border: 'rgba(239,68,68,0.18)',
      bg: 'linear-gradient(150deg, rgba(15,5,5,0.97), rgba(10,3,3,0.99))',
      edgeBg: 'linear-gradient(#B91C1C, #EF4444, #B91C1C)',
      edgeShadow: '0 0 24px rgba(239,68,68,0.5)',
      glowColor: 'rgba(239,68,68,0.15)',
    },
    {
      key: 'nextMonth',
      label: `${heroStats.nextMonthLabel} Billing`,
      value: dollars(heroStats.nextMonthCents),
      sub: `${heroStats.nextMonthCount} invoices scheduled`,
      accent: '#8080A8',
      border: 'rgba(128,128,168,0.18)',
      bg: 'linear-gradient(150deg, rgba(8,8,14,0.97), rgba(5,5,10,0.99))',
      edgeBg: 'linear-gradient(#606088, #8080A8, #606088)',
      edgeShadow: '0 0 24px rgba(128,128,168,0.4)',
      glowColor: 'rgba(128,128,168,0.12)',
    },
  ] : []

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

      {/* SNAPSHOT CARDS */}
      {heroLoading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><MusicLoader size={28} /></div>
      ) : heroStats ? (
        <div data-tour-id="billing-hero-cards">
          {/* Desktop: 4 cards in a row */}
          <div className="billing-snapshot-desktop" style={{
            display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 10,
          }}>
            {snapshotCards.map(card => (
              <div key={card.key} data-tour-id={`billing-card-${card.key}`} style={{
                position: 'relative', overflow: 'hidden', borderRadius: 14,
                background: card.bg, border: `1px solid ${card.border}`,
                boxShadow: `0 14px 52px rgba(0,0,0,0.65), inset 0 1px 0 ${card.border}`,
                padding: '18px 16px',
              }}>
                <div style={{
                  position: 'absolute', top: 0, left: 0, bottom: 0, width: 3,
                  background: card.edgeBg, boxShadow: card.edgeShadow,
                }} />
                <div style={{
                  position: 'absolute', top: -20, left: -20, width: 100, height: 100,
                  background: `radial-gradient(circle, ${card.glowColor} 0%, transparent 70%)`,
                  pointerEvents: 'none',
                }} />
                <div style={{ position: 'relative' }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: '#A0A0C8', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    {card.label}
                  </div>
                  <div style={{ fontSize: 26, fontWeight: 800, color: card.accent === '#8080A8' ? '#C0C0E0' : card.accent, marginBottom: 6 }}>
                    {card.value}
                  </div>
                  <div style={{ fontSize: 11, color: '#606088' }}>{card.sub}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Mobile: Accordion cards */}
          <div className="billing-snapshot-mobile" style={{ display: 'none', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
            {snapshotCards.map(card => {
              const isExpanded = expandedCard === card.key
              return (
                <div key={card.key} data-tour-id={`billing-card-${card.key}-m`} style={{
                  position: 'relative', overflow: 'hidden', borderRadius: 12,
                  background: card.bg, border: `1px solid ${card.border}`,
                  cursor: 'pointer',
                }} onClick={() => setExpandedCard(isExpanded ? '' : card.key)}>
                  <div style={{
                    position: 'absolute', top: 0, left: 0, bottom: 0, width: 3,
                    background: card.edgeBg,
                  }} />
                  {isExpanded ? (
                    <div style={{ padding: '14px 14px 14px 16px', position: 'relative' }}>
                      <div style={{
                        position: 'absolute', top: -20, left: -20, width: 80, height: 80,
                        background: `radial-gradient(circle, ${card.glowColor} 0%, transparent 70%)`,
                        pointerEvents: 'none',
                      }} />
                      <div style={{ position: 'relative' }}>
                        <div style={{ fontSize: 10, fontWeight: 600, color: '#A0A0C8', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6 }}>
                          {card.label}
                        </div>
                        <div style={{ fontSize: 24, fontWeight: 800, color: card.accent === '#8080A8' ? '#C0C0E0' : card.accent, marginBottom: 4 }}>
                          {card.value}
                        </div>
                        <div style={{ fontSize: 11, color: '#606088' }}>{card.sub}</div>
                      </div>
                    </div>
                  ) : (
                    <div style={{ padding: '10px 14px 10px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: 12, fontWeight: 600, color: '#A0A0C8' }}>{card.label}</span>
                      <span style={{ fontSize: 16, fontWeight: 800, color: card.accent === '#8080A8' ? '#C0C0E0' : card.accent }}>
                        {card.value}
                      </span>
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {/* Earning Potential Bar */}
          <div style={{ padding: '6px 14px', textAlign: 'center', fontSize: 11, color: '#606088', marginBottom: 4 }}>
            Full earning potential this month: <span style={{ fontWeight: 700, color: '#8080A8' }}>{dollars(heroStats.fullPotentialCents)}</span>
          </div>

          {/* Past Due Alert */}
          {heroStats.pastDueCents > 0 && (
            <div data-tour-id="billing-overdue-alert" style={{ marginBottom: 12, padding: '8px 14px', borderRadius: 10, background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.18)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 8, height: 8, borderRadius: 4, background: '#EF4444', boxShadow: '0 0 8px rgba(239,68,68,0.6)', flexShrink: 0 }} />
              <span style={{ fontSize: 11, color: '#EF4444', fontWeight: 700 }}>
                {dollars(heroStats.pastDueCents)} past due
              </span>
              <span style={{ fontSize: 10, color: '#8080A8' }}>
                — {heroStats.pastDueFamilies} {heroStats.pastDueFamilies === 1 ? 'family' : 'families'}
              </span>
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
        {!isStudioDirector && (
          <button onClick={() => setShowSquareSync(true)} style={utilBtn}>
            <RefreshCw size={13} /> Square Sync
          </button>
        )}
      </div>

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
          families={families ?? []}
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
        <SquareSyncModal onClose={() => setShowSquareSync(false)} />
      )}

      {/* RESPONSIVE STYLES */}
      <style>{`
        @media (max-width: 768px) {
          .billing-loc-pills { display: none !important; }
          .billing-loc-dropdown { display: block !important; }
          .billing-snapshot-desktop { display: none !important; }
          .billing-snapshot-mobile { display: flex !important; }
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

function SquareSyncModal({ onClose }: { onClose: () => void }) {
  return (
    <ModalShell title="Square Sync" onClose={onClose}>
      <div style={{ textAlign: 'center', padding: '20px 0' }}>
        <RefreshCw size={32} style={{ color: '#606088', marginBottom: 12 }} />
        <div style={{ fontSize: 14, color: '#A0A0C8', marginBottom: 16 }}>
          Sync payment data from Square to update balances and payment history.
        </div>
        <div style={{
          padding: '10px 14px', borderRadius: 8,
          background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)',
          fontSize: 12, color: '#606088', marginBottom: 16,
        }}>
          Last sync: Manual trigger not yet connected
        </div>
        <button
          onClick={() => toast('Square sync coming soon', 'info')}
          style={{
            background: '#D4226A', color: '#fff', border: 'none',
            borderRadius: 10, padding: '12px 24px', fontSize: 14, fontWeight: 700,
            cursor: 'pointer', minHeight: 44,
          }}
        >
          Sync Now
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
