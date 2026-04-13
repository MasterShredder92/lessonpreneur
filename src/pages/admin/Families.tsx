import { useState, useMemo, useRef, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import MusicLoader from '../../components/shared/MusicLoader'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuthContext } from '../../app/AuthContext'
import { usePermissions } from '../../hooks/usePermissions'
import { useLocations } from '../../hooks/useLocations'
import { useFamiliesPage, useFamiliesRosterInfinite, useFamilyTabCounts, useFamilyCountsByLocation, useFamilyDetail, useUpdateFamilyInfo, useChangeFamilyBillingStatus, useUploadFamilyFile, useDeleteFamilyFile, useFamilyActivityLog, type Family, type FamilyFile, type ActivityEvent } from '../../hooks/useFamilies'
import { formatRate, getRateTierColor } from '../../hooks/useFamilyRate'
import { useZiroShell } from '../../contexts/ZiroContext'
import { toast } from '../../components/shared/Toast'
import ConfirmModal from '../../components/shared/ConfirmModal'
import { X, Lock, Shield, CreditCard, Users, Pencil, Star, ChevronRight, ChevronDown, Receipt, Bell, MessageCircle, Send, Plus, Check, XCircle } from 'lucide-react'
import { getInstrumentEmoji, instrumentWithEmojiTitle } from '../../utils/instrumentEmoji'
import { useReactivateStudent } from '../../hooks/useRetention'
import { useUrlFilters } from '../../hooks/useUrlFilters'
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query'
import { DEFAULT_SESSIONS_PER_MONTH } from '../../lib/constants'
import { supabase } from '../../lib/supabase'
import { calculatePreviewRate } from '../../hooks/useFamilyRate'
import { IssueContextProvider } from '../../contexts/IssueContext'
import { logAudit } from '../../lib/auditLog'
import ReportIssueButton from '../../components/shared/ReportIssueButton'
import FamiliesPageGuide from '../../components/admin/FamiliesPageGuide'
import { qk } from '../../lib/queryKeys'
import AddFamilyModal from '../../components/admin/AddFamilyModal'
import ReviewRequestModal from '../../components/admin/ReviewRequestModal'
import { useLastReviewRequest } from '../../hooks/useReviewRequest'
import FamilyDocumentsSection from '../../components/admin/FamilyDocumentsSection'
import DuplicateStudentReviewBanner from '../../components/admin/DuplicateStudentReviewBanner'
import { useRemoveStudentFromFamily, useDeleteFamily } from '../../lib/enrollmentEngine'
import { useFamilyInvoices, useGenerateInvoice } from '../../hooks/useFamilyInvoices'
import FamilyActivityLogModal from '../../components/admin/FamilyActivityLogModal'
import { Trash2, UserMinus, FileText, Download } from 'lucide-react'
import { useFamilyInsights } from '../../hooks/useInsights'
import { useAutoPayStats } from '../../hooks/useAutoPayNudge'

// ═══════════════════════════════════════
// DISPLAY HELPERS
// ═══════════════════════════════════════

function stripFamily(name: string | null | undefined): string {
  if (!name) return '---'
  return name.replace(/\s+family$/i, '').trim() || name
}

function familyNeedsAttention(f: Family): boolean {
  if (!f.primary_email || !f.primary_phone || !f.square_customer_id) return true
  const active = (f.students ?? []).filter(s => s.status === 'active')
  return active.some(s => !s.teacher_id || !s.instrument)
}

function formatDollars(cents: number | null | undefined): string {
  if (cents == null || cents === 0) return '$0.00'
  const abs = Math.abs(cents) / 100
  const formatted = abs.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return cents < 0 ? `-$${formatted}` : `$${formatted}`
}

// ═══════════════════════════════════════
// RATE TIER COLORS (edge + filter)
// ═══════════════════════════════════════

const RATE_EDGE_COLORS: Record<number, { solid: string; bg: string }> = {
  4500: { solid: '#22C55E', bg: 'rgba(34,197,94,0.15)' },    // Full price — green
  4000: { solid: '#FFB800', bg: 'rgba(255,184,0,0.15)' },    // Discount — yellow
  3750: { solid: '#EF4444', bg: 'rgba(239,68,68,0.15)' },    // Deep discount — red
}

function getRateEdge(rateTier: number) {
  return RATE_EDGE_COLORS[rateTier] ?? RATE_EDGE_COLORS[4500]
}

// ---- At-a-glance insight bar for the Families page ----
function FamilyInsightBar({
  billingIssues,
  noAutopay,
  newThisMonth,
  autoPayPercent,
  totalActive,
  onFixBilling,
  onViewAutopay,
}: {
  billingIssues: number | undefined
  noAutopay: number | undefined
  newThisMonth: number | undefined
  autoPayPercent: number | undefined
  totalActive: number
  onFixBilling: () => void
  onViewAutopay: () => void
}) {
  const pct = autoPayPercent ?? 0
  const autopayColor = pct >= 80 ? '#22C55E' : pct >= 60 ? '#FFB800' : '#EF4444'
  const autopayBg = pct >= 80 ? 'rgba(34,197,94,0.06)' : pct >= 60 ? 'rgba(255,184,0,0.06)' : 'rgba(239,68,68,0.06)'
  const autopayBorder = pct >= 80 ? 'rgba(34,197,94,0.18)' : pct >= 60 ? 'rgba(255,184,0,0.18)' : 'rgba(239,68,68,0.18)'

  const hasIssues = (billingIssues ?? 0) > 0
  const hasNoAutopay = (noAutopay ?? 0) > 0

  const tiles: {
    label: string
    value: string | number | undefined
    color: string
    bg: string
    border: string
    sub: string
    action?: { label: string; onClick: () => void }
  }[] = [
    {
      label: 'Billing Issues',
      value: billingIssues,
      color: hasIssues ? '#EF4444' : '#22C55E',
      bg: hasIssues ? 'rgba(239,68,68,0.06)' : 'rgba(34,197,94,0.06)',
      border: hasIssues ? 'rgba(239,68,68,0.18)' : 'rgba(34,197,94,0.18)',
      sub: hasIssues ? 'no card or overdue balance' : 'all billing current',
      action: hasIssues ? { label: 'Fix Billing Issues →', onClick: onFixBilling } : undefined,
    },
    {
      label: 'No Autopay',
      value: noAutopay,
      color: hasNoAutopay ? '#fb923c' : '#22C55E',
      bg: hasNoAutopay ? 'rgba(251,146,60,0.06)' : 'rgba(34,197,94,0.06)',
      border: hasNoAutopay ? 'rgba(251,146,60,0.18)' : 'rgba(34,197,94,0.18)',
      sub: 'families without card on file',
      action: hasNoAutopay ? { label: 'Send Nudge →', onClick: onViewAutopay } : undefined,
    },
    {
      label: 'New This Month',
      value: newThisMonth,
      color: '#22C55E',
      bg: 'rgba(34,197,94,0.06)',
      border: 'rgba(34,197,94,0.18)',
      sub: 'new active families',
    },
    {
      label: 'Autopay Rate',
      value: autoPayPercent !== undefined ? `${autoPayPercent}%` : undefined,
      color: autopayColor,
      bg: autopayBg,
      border: autopayBorder,
      sub: `${totalActive} active families`,
    },
  ]

  return (
    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 20 }}>
      {tiles.map((tile) => (
        <div
          key={tile.label}
          style={{
            flex: '1 0 150px',
            background: tile.bg,
            border: `1px solid ${tile.border}`,
            borderLeft: `3px solid ${tile.color}`,
            borderRadius: 10,
            padding: '14px 16px',
          }}
        >
          <div style={{ fontSize: 10, fontWeight: 700, color: '#A0A0C8', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>
            {tile.label}
          </div>
          <div style={{ fontSize: 24, fontWeight: 900, color: tile.color, fontFamily: "'Plus Jakarta Sans', sans-serif", lineHeight: 1 }}>
            {tile.value !== undefined ? tile.value : '…'}
          </div>
          <div style={{ fontSize: 10, color: '#606088', marginTop: 4 }}>
            {tile.sub}
          </div>
          {tile.action && (
            <button
              onClick={tile.action.onClick}
              style={{
                marginTop: 8,
                fontSize: 10,
                fontWeight: 700,
                color: tile.color,
                background: 'transparent',
                border: `1px solid ${tile.border}`,
                borderRadius: 6,
                padding: '3px 8px',
                cursor: 'pointer',
              }}
            >
              {tile.action.label}
            </button>
          )}
        </div>
      ))}
    </div>
  )
}

const RATE_OPTIONS = [
  { label: 'All Rates', value: 0 },
  { label: '$45.00', value: 4500 },
  { label: '$40.00', value: 4000 },
  { label: '$37.50', value: 3750 },
]

const STATUS_BADGE: Record<string, { bg: string; border: string; color: string }> = {
  active:    { bg: 'rgba(34,197,94,0.12)',  border: 'rgba(34,197,94,0.25)',  color: '#22C55E' },
  paused:    { bg: 'rgba(255,184,0,0.12)',  border: 'rgba(255,184,0,0.25)',  color: '#FFB800' },
  suspended: { bg: 'rgba(255,120,0,0.12)',  border: 'rgba(255,120,0,0.25)',  color: '#FF7800' },
  cancelled: { bg: 'rgba(255,255,255,0.04)', border: 'rgba(255,255,255,0.08)', color: '#8080A8' },
}

// Inline-editable field styles
const labelStyle: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: '#A0A0C8', textTransform: 'uppercase', letterSpacing: '0.08em' }
const valueStyle: React.CSSProperties = { marginTop: 3, fontSize: 14, color: '#D0D0E8' }
const sectionLabelStyle: React.CSSProperties = { fontSize: 12, fontWeight: 700, color: '#6060A0', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10, paddingBottom: 6, borderBottom: '1px solid rgba(255,255,255,0.06)' }

// Location brand colors — keyed by Supabase UUID (CLAUDE.md authoritative source)
const LOCATION_COLORS: Record<string, string> = {
  'f7b52dd5-12ee-437f-9c60-f8adf454ac31': '#A333FF', // Bellevue
  'cebd97d4-c241-4de2-8ade-49e5cc0070d5': '#00A5E8', // Elkhorn
  '40c67ffc-91b5-46a9-94bd-6ddffdfb7638': '#00A651', // Gretna
  'd48229c1-b70a-4d29-893e-5079887dab76': '#D41113', // Omaha
}

// ---- Tier 1: Location Overview Grid ----
function FamilyLocationGrid({
  locations,
  locationCounts,
  totalActive,
  onSelectLocation,
  isStudioDirector,
  lockedLocationId,
}: {
  locations: any[] | undefined
  locationCounts: Record<string, number> | undefined
  totalActive: number | undefined
  onSelectLocation: (id: string) => void
  isStudioDirector: boolean
  lockedLocationId: string | null
}) {
  const visible = useMemo(() => {
    if (!locations) return []
    if (isStudioDirector && lockedLocationId) return locations.filter((l) => l.id === lockedLocationId)
    return locations.filter((l) => l.is_active)
  }, [locations, isStudioDirector, lockedLocationId])

  return (
    <div>
      <p style={{ fontSize: 13, color: '#8080A8', marginBottom: 20, marginTop: 4 }}>
        Click a location to view its family roster. Data loads on demand — no delay.
      </p>
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))',
        gap: 14,
      }}>
        {visible.map((loc) => {
          const color = LOCATION_COLORS[loc.id] ?? '#D4226A'
          const count = locationCounts?.[loc.id]
          return (
            <button
              key={loc.id}
              onClick={() => onSelectLocation(loc.id)}
              style={{
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.06)',
                borderRadius: 16,
                padding: 0,
                cursor: 'pointer',
                textAlign: 'left',
                display: 'flex',
                overflow: 'hidden',
                transition: 'border-color 150ms ease, background 150ms ease, transform 150ms ease',
              }}
              onMouseEnter={(e) => {
                ;(e.currentTarget as HTMLElement).style.borderColor = color + '60'
                ;(e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.05)'
              }}
              onMouseLeave={(e) => {
                ;(e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.06)'
                ;(e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.03)'
              }}
            >
              <div style={{ width: 5, background: color, flexShrink: 0, borderRadius: '16px 0 0 16px' }} />
              <div style={{ padding: '22px 20px', flex: 1 }}>
                <div style={{ fontWeight: 800, color: '#E0E0F4', fontSize: 15, marginBottom: 10 }}>
                  {loc.name.replace(' Music Lessons', '')}
                </div>
                <div style={{
                  fontWeight: 900,
                  color,
                  fontSize: 38,
                  lineHeight: 1,
                  fontFamily: "'Plus Jakarta Sans', sans-serif",
                  marginBottom: 2,
                }}>
                  {count !== undefined ? count.toLocaleString() : '…'}
                </div>
                <div style={{ fontSize: 11, color: '#606088', marginBottom: 10 }}>active families</div>
                {loc.city && (
                  <div style={{ fontSize: 11, color: '#8080A8' }}>
                    {loc.city}, {loc.state}
                  </div>
                )}
              </div>
            </button>
          )
        })}

        {/* All Families aggregate card */}
        {!isStudioDirector && (
          <button
            onClick={() => onSelectLocation('all')}
            style={{
              background: 'rgba(212,34,106,0.04)',
              border: '1px solid rgba(212,34,106,0.12)',
              borderRadius: 16,
              padding: 0,
              cursor: 'pointer',
              textAlign: 'left',
              display: 'flex',
              overflow: 'hidden',
              transition: 'border-color 150ms ease, background 150ms ease',
            }}
            onMouseEnter={(e) => {
              ;(e.currentTarget as HTMLElement).style.borderColor = 'rgba(212,34,106,0.3)'
              ;(e.currentTarget as HTMLElement).style.background = 'rgba(212,34,106,0.07)'
            }}
            onMouseLeave={(e) => {
              ;(e.currentTarget as HTMLElement).style.borderColor = 'rgba(212,34,106,0.12)'
              ;(e.currentTarget as HTMLElement).style.background = 'rgba(212,34,106,0.04)'
            }}
          >
            <div style={{ width: 5, background: '#D4226A', flexShrink: 0, borderRadius: '16px 0 0 16px' }} />
            <div style={{ padding: '22px 20px', flex: 1 }}>
              <div style={{ fontWeight: 800, color: '#E0E0F4', fontSize: 15, marginBottom: 10 }}>All Families</div>
              <div style={{
                fontWeight: 900,
                color: '#D4226A',
                fontSize: 38,
                lineHeight: 1,
                fontFamily: "'Plus Jakarta Sans', sans-serif",
                marginBottom: 2,
              }}>
                {totalActive !== undefined ? totalActive.toLocaleString() : '…'}
              </div>
              <div style={{ fontSize: 11, color: '#606088', marginBottom: 10 }}>active families</div>
              <div style={{ fontSize: 11, color: '#8080A8' }}>Across all locations</div>
            </div>
          </button>
        )}
      </div>
    </div>
  )
}

// ---- Tier 2: Location Family Panel (lazy-loaded slide panel) ----
function LocationFamilyPanel({
  locationId,
  locations,
  canEdit,
  onClose,
  onAddFamily,
  onOpenFamily,
  navigate,
}: {
  locationId: string
  locations: any[] | undefined
  canEdit: boolean
  onClose: () => void
  onAddFamily: () => void
  onOpenFamily: (id: string) => void
  navigate: (path: string) => void
}) {
  const [search, setSearch] = useState('')
  const [rateFilter, setRateFilter] = useState(0)
  const [sortBy, setSortBy] = useState<'az' | 'za' | 'newest' | 'oldest'>('az')
  const [activeTab, setActiveTab] = useState<'active' | 'inactive'>('active')

  const effectiveLocationId = locationId === 'all' ? null : locationId
  const loc = locationId === 'all' ? null : locations?.find((l: any) => l.id === locationId)
  const locColor = locationId === 'all' ? '#D4226A' : (LOCATION_COLORS[locationId] ?? '#D4226A')

  const rosterInfinite = useFamiliesRosterInfinite({
    familyTab: activeTab,
    locationId: effectiveLocationId,
    rateFilter,
    search,
    sortBy,
    enabled: true,
  })

  const rosterRows = useMemo(
    () => rosterInfinite.data?.pages.flatMap((p) => p.rows) ?? [],
    [rosterInfinite.data],
  )

  const loadMoreRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = loadMoreRef.current
    if (!el) return
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && rosterInfinite.hasNextPage && !rosterInfinite.isFetchingNextPage) {
          rosterInfinite.fetchNextPage()
        }
      },
      { rootMargin: '200px' },
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [rosterInfinite.hasNextPage, rosterInfinite.isFetchingNextPage, rosterInfinite.fetchNextPage])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  const gridCols = 'minmax(140px,1.5fr) minmax(72px,0.55fr) minmax(160px,1.1fr) minmax(100px,0.75fr) minmax(200px,1.3fr) minmax(120px,0.85fr) minmax(100px,0.75fr) minmax(88px,0.65fr)'

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 300,
          background: 'rgba(2,2,9,0.72)',
          backdropFilter: 'blur(4px)',
          WebkitBackdropFilter: 'blur(4px)',
        }}
      />

      {/* Slide panel */}
      <div
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          width: 'min(900px, 100vw)',
          height: '100vh',
          zIndex: 301,
          display: 'flex',
          flexDirection: 'column',
          background: 'linear-gradient(160deg, #0C0C18 0%, #08080F 100%)',
          borderLeft: '1px solid rgba(255,255,255,0.08)',
          boxShadow: '-24px 0 80px rgba(0,0,0,0.7)',
          animation: 'slideInRight 260ms cubic-bezier(0.22, 1, 0.36, 1)',
        }}
      >
        {/* Panel header */}
        <div style={{
          padding: '18px 24px',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          display: 'flex',
          alignItems: 'center',
          gap: 14,
          flexShrink: 0,
          background: 'rgba(0,0,0,0.2)',
        }}>
          <div style={{ width: 4, height: 46, borderRadius: 2, background: locColor, flexShrink: 0 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2 style={{ margin: 0, fontWeight: 800, fontSize: 17, color: '#E0E0F4', letterSpacing: '-0.01em' }}>
              {locationId === 'all' ? 'All Families' : (loc?.name ?? 'Families')}
            </h2>
            <p style={{ margin: '3px 0 0', fontSize: 11, color: '#8080A8' }}>
              {locationId === 'all'
                ? 'Across all locations'
                : (loc?.city ? `${loc.city}, ${loc.state}` : '')}
            </p>
          </div>
          <button
            onClick={onAddFamily}
            style={{
              fontSize: 12,
              padding: '7px 14px',
              borderRadius: 8,
              background: '#D4226A',
              border: 'none',
              color: '#fff',
              fontWeight: 700,
              cursor: 'pointer',
              flexShrink: 0,
              letterSpacing: '-0.01em',
            }}
          >
            + Add Family
          </button>
          <button
            onClick={onClose}
            style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.08)',
              color: '#8080A8',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <X size={14} />
          </button>
        </div>

        {/* Status tabs */}
        <div style={{
          padding: '0 24px',
          borderBottom: '1px solid rgba(255,255,255,0.04)',
          flexShrink: 0,
          display: 'flex',
          gap: 0,
        }}>
          {(['active', 'inactive'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                padding: '11px 18px',
                fontWeight: 700,
                fontSize: 12,
                color: activeTab === tab ? locColor : '#606088',
                background: 'none',
                border: 'none',
                borderBottom: `2px solid ${activeTab === tab ? locColor : 'transparent'}`,
                cursor: 'pointer',
                transition: 'color 150ms ease, border-color 150ms ease',
                textTransform: 'capitalize',
              }}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>

        {/* Filters */}
        <div style={{
          padding: '10px 24px',
          borderBottom: '1px solid rgba(255,255,255,0.04)',
          display: 'flex',
          gap: 8,
          flexShrink: 0,
          flexWrap: 'wrap',
          background: 'rgba(0,0,0,0.1)',
        }}>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, email, phone..."
            className="filter-select"
            style={{ flex: '1 1 180px', minWidth: 0 }}
          />
          <select
            value={rateFilter}
            onChange={(e) => setRateFilter(Number(e.target.value))}
            className="filter-select"
            style={{ flex: '0 0 auto', minWidth: 110 }}
          >
            <option value={0}>All Rates</option>
            {RATE_OPTIONS.filter(r => r.value).map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as 'az' | 'za' | 'newest' | 'oldest')}
            className="filter-select"
            style={{ flex: '0 0 auto', minWidth: 120 }}
          >
            <option value="az">A → Z</option>
            <option value="za">Z → A</option>
            <option value="newest">Newest First</option>
            <option value="oldest">Oldest First</option>
          </select>
        </div>

        {/* Row count */}
        <div style={{ padding: '6px 24px 4px', fontSize: 11, color: '#606088', flexShrink: 0 }}>
          {rosterInfinite.isLoading
            ? 'Loading...'
            : `${rosterRows.length}${rosterInfinite.hasNextPage ? '+' : ''} famil${rosterRows.length !== 1 ? 'ies' : 'y'}`}
        </div>

        {/* Column headers */}
        {!rosterInfinite.isLoading && (
          <div style={{
            display: 'grid',
            gridTemplateColumns: gridCols,
            gap: '0 12px',
            padding: '7px 24px',
            fontSize: 10,
            fontWeight: 700,
            color: '#8080A8',
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            borderBottom: '1px solid rgba(255,255,255,0.06)',
            background: 'rgba(0,0,0,0.2)',
            flexShrink: 0,
          }}>
            <span>Family</span>
            <span>Monthly</span>
            <span>Email</span>
            <span>Phone</span>
            <span>Students</span>
            <span>Card</span>
            <span>Billing</span>
            <span>Agreement</span>
          </div>
        )}

        {/* Roster rows */}
        <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden' }}>
          {rosterInfinite.isLoading ? (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 200 }}>
              <MusicLoader />
            </div>
          ) : rosterRows.length === 0 ? (
            <div className="empty-state" style={{ border: 'none', padding: 28 }}>
              No {activeTab} families found{search ? ' matching your search' : ''}.
            </div>
          ) : (
            <>
              {rosterRows.map((f) => (
                <FamilyRosterRow
                  key={f.id}
                  family={f}
                  onClick={() => onOpenFamily(f.id)}
                />
              ))}
              <div ref={loadMoreRef} style={{ height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
                {rosterInfinite.isFetchingNextPage && <span style={{ fontSize: 12, color: '#8080A8' }}>Loading more…</span>}
              </div>
            </>
          )}
        </div>
      </div>
    </>
  )
}

// ═══════════════════════════════════════
// FAMILIES PAGE
// ═══════════════════════════════════════

export default function Families() {
  const { role } = useAuthContext()
  const { isAtLeast, isStudioDirector, locationIds } = usePermissions()
  const navigate = useNavigate()
  const { data: locations } = useLocations()
  const { data: tabCounts } = useFamilyTabCounts()
  const { data: familyInsights } = useFamilyInsights()
  const { data: autoPayStats } = useAutoPayStats()

  const [selectedLocationId, setSelectedLocationId] = useState<string | null>(null)
  const [selectedFamilyId, setSelectedFamilyId] = useState<string | null>(null)
  const [showAddFamily, setShowAddFamily] = useState(false)
  const [showExport, setShowExport] = useState(false)

  const canEdit = role === 'owner' || role === 'admin'
  const canExport = role === 'owner' || role === 'admin' || role === 'company_director'
  const canCreate = role === 'owner' || role === 'admin' || role === 'company_director' || role === 'studio_director'
  const canView = isAtLeast('studio_director')

  const activeLocationIds = useMemo(() => {
    if (isStudioDirector && locationIds?.length) return locationIds
    return (locations ?? []).filter((l: any) => l.is_active).map((l: any) => l.id)
  }, [locations, isStudioDirector, locationIds])

  const { data: locationCounts } = useFamilyCountsByLocation(activeLocationIds)
  const lockedLocationId = isStudioDirector && locationIds?.length ? locationIds[0] : null

  const { data: exportFamilies, isLoading: exportLoading } = useFamiliesPage({ enabled: showExport })

  const onSelectLocation = useCallback((id: string) => setSelectedLocationId(id), [])

  if (!canView) {
    navigate('/login', { replace: true })
    return null
  }

  const countActive = tabCounts?.active ?? 0
  const countInactive = tabCounts?.inactive ?? 0
  const countTotal = tabCounts?.all ?? 0

  return (
    <IssueContextProvider page="Roster — Families">
    <div className="page">
      {/* HEADER — stat bar */}
      <div className="page-header">
        <h1 style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 28, letterSpacing: '0.5px', marginRight: 16 }}>Families</h1>
        <span style={{ fontSize: 13, color: '#94A3B8' }}>
          <strong style={{ color: '#E0E0F4' }}>{countActive}</strong> Active
          <span style={{ margin: '0 6px', color: '#363656' }}>&middot;</span>
          <strong style={{ color: '#E0E0F4' }}>{countInactive}</strong> Inactive
          <span style={{ margin: '0 6px', color: '#363656' }}>&middot;</span>
          <strong style={{ color: '#E0E0F4' }}>{countTotal}</strong> Total
        </span>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
          {canCreate && (
            <button className="btn-primary" onClick={() => setShowAddFamily(true)} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, padding: '8px 14px' }}>
              <Plus size={14} /> Add New Family
            </button>
          )}
          {canExport && (
            <button className="btn-ghost" onClick={() => setShowExport(true)} style={{ fontSize: 11 }}>Export CSV</button>
          )}
          <FamiliesPageGuide />
          <ReportIssueButton />
        </div>
      </div>

      {canView && <DuplicateStudentReviewBanner />}

      {/* At-a-glance insight tiles */}
      <FamilyInsightBar
        billingIssues={familyInsights?.billingIssues}
        noAutopay={autoPayStats?.manualPayFamilies}
        newThisMonth={familyInsights?.newThisMonth}
        autoPayPercent={autoPayStats?.autoPayPercent}
        totalActive={countActive}
        onFixBilling={() => navigate('/admin/billing')}
        onViewAutopay={() => navigate('/admin/billing?section=autopay')}
      />

      {/* TIER 1: Location overview grid */}
      <FamilyLocationGrid
        locations={locations}
        locationCounts={locationCounts}
        totalActive={tabCounts?.active}
        onSelectLocation={onSelectLocation}
        isStudioDirector={isStudioDirector}
        lockedLocationId={lockedLocationId}
      />

      {/* TIER 2: Slide panel — lazy-loads on location click */}
      {selectedLocationId !== null && (
        <LocationFamilyPanel
          locationId={selectedLocationId}
          locations={locations}
          canEdit={canEdit}
          onClose={() => setSelectedLocationId(null)}
          onAddFamily={() => setShowAddFamily(true)}
          onOpenFamily={setSelectedFamilyId}
          navigate={navigate}
        />
      )}

      {/* Family detail modal (portals to document.body) */}
      {selectedFamilyId && (
        <FamilyDetailModal
          familyId={selectedFamilyId}
          canEdit={canEdit}
          onClose={() => setSelectedFamilyId(null)}
          onNavigateStudent={(id) => {
            setSelectedFamilyId(null)
            navigate(`/admin/students?id=${id}`)
          }}
        />
      )}

      {/* Add Family Modal */}
      {showAddFamily && (
        <AddFamilyModal
          onClose={() => setShowAddFamily(false)}
          onCreated={(familyId) => {
            setShowAddFamily(false)
            setSelectedFamilyId(familyId)
          }}
        />
      )}

      {/* Export Modal */}
      {showExport && (
        <div className="modal-overlay" onClick={() => setShowExport(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 400 }}>
            <div className="modal-header">
              <span className="modal-title">Export Families CSV</span>
              <button className="btn-ghost" onClick={() => setShowExport(false)} style={{ padding: '4px 8px' }}>X</button>
            </div>
            <div style={{ padding: 22 }}>
              <p style={{ fontSize: 12.5, color: '#A0A0C8', marginBottom: 16 }}>
                {exportLoading ? 'Loading full roster for export…' : `Export ${exportFamilies?.length ?? 0} families.`}
              </p>
              <button
                className="btn-primary"
                disabled={exportLoading || !exportFamilies}
                style={{ width: '100%', justifyContent: 'center', padding: 12 }}
                onClick={() => {
                  if (!exportFamilies) return
                  const headers = ['Family Name', 'Parent Name', 'Email', 'Phone', 'Location', 'Rate', 'Billing Status', 'Students', 'Teachers', 'Instruments', 'Lifetime Paid', 'Balance', 'Military']
                  const rows = exportFamilies.map((f) => [
                    f.name ?? '',
                    f.parent_name ?? '',
                    f.primary_email ?? '',
                    f.primary_phone ?? '',
                    f.locationName ?? '',
                    `$${(f.rate_tier / 100).toFixed(2)}`,
                    f.billing_status ?? 'active',
                    String(f.activeStudentCount),
                    f.teacherNames?.join('; ') ?? '',
                    f.instrumentList?.join(', ') ?? '',
                    `$${((f.lifetime_paid_cents ?? 0) / 100).toFixed(2)}`,
                    `$${((f.balance ?? 0) / 100).toFixed(2)}`,
                    f.is_military ? 'Yes' : 'No',
                  ])
                  const csv = [headers, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n')
                  const blob = new Blob([csv], { type: 'text/csv' })
                  const url = URL.createObjectURL(blob)
                  const a = document.createElement('a')
                  a.href = url; a.download = `families_export_${new Date().toISOString().split('T')[0]}.csv`; a.click()
                  URL.revokeObjectURL(url)
                  setShowExport(false)
                  toast('Export downloaded', 'success')
                }}
              >
                Export {exportFamilies?.length ?? 0} Families
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
    </IssueContextProvider>
  )
}

// ═══════════════════════════════════════
// COMPACT ROSTER ROW
// ═══════════════════════════════════════

function FamilyRosterRow({ family: f, onClick, guideId }: { family: Family; onClick: () => void; guideId?: string }) {
  const rateEdge = getRateEdge(f.rate_tier)
  const locColor = f.locationColor ?? '#606088'
  const isInactive = (f.billing_status ?? 'active') === 'cancelled'
  const activeStudents = (f.students ?? []).filter(s => s.status === 'active')
  const studentNames = activeStudents.slice(0, 4).map(s => s.first_name).join(', ')
  const studentInstruments = [...new Set(activeStudents.map(s => s.instrument).filter(Boolean))].slice(0, 4).map(i => i.charAt(0).toUpperCase() + i.slice(1)).join(', ')

  return (
    <div
      className="roster-row roster-row-family"
      onClick={onClick}
      data-guide-id={guideId}
      style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(140px,1.5fr) minmax(72px,0.55fr) minmax(160px,1.1fr) minmax(100px,0.75fr) minmax(200px,1.3fr) minmax(120px,0.85fr) minmax(100px,0.75fr) minmax(88px,0.65fr)',
        gap: '0 12px',
        alignItems: 'center',
        padding: '10px 14px',
        borderBottom: '1px solid rgba(255,255,255,0.04)',
        cursor: 'pointer',
        fontSize: 12,
      }}
    >
      <div style={{ borderLeft: `3px solid ${isInactive ? '#606088' : locColor}`, paddingLeft: 10, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
          <span style={{ fontWeight: 700, color: '#E0E0F4', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{stripFamily(f.name)}</span>
          {f.is_military && <span style={{ fontSize: 8, padding: '1px 5px', borderRadius: 4, background: 'rgba(255,184,0,0.15)', color: '#FFB800', border: '1px solid rgba(255,184,0,0.25)', fontWeight: 700, flexShrink: 0 }}>MIL</span>}
        </div>
        {f.locationName && <div style={{ fontSize: 10, color: '#606088', marginTop: 2 }}>{f.locationName}</div>}
      </div>
      <div>
        <span style={{
          fontSize: 12, fontWeight: 800, padding: '2px 6px', borderRadius: 6, display: 'inline-block',
          background: isInactive ? 'rgba(255,255,255,0.06)' : rateEdge.solid,
          color: isInactive ? '#606088' : '#1A1A2E',
        }}>
          ${f.monthlyTotalCents > 0 ? (f.monthlyTotalCents / 100).toFixed(0) : (f.rate_tier / 100).toFixed(0)}
          <span style={{ fontSize: 8, fontWeight: 600, opacity: 0.75 }}>/mo</span>
        </span>
      </div>
      <div style={{ color: '#A0A0C8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>
        {f.primary_email ? <CopyText value={f.primary_email} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%' }} /> : '—'}
      </div>
      <div style={{ color: '#A0A0C8', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{f.primary_phone ?? '—'}</div>
      <div style={{ color: '#C0C0E0', lineHeight: 1.35, minWidth: 0 }}>
        <span style={{ fontWeight: 600 }}>{f.activeStudentCount}</span>
        {studentInstruments && <span style={{ color: '#8080A8' }}> · {studentInstruments}</span>}
        {studentNames && <span style={{ color: '#8080A8' }}> · {studentNames}</span>}
      </div>
      <div>
        <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 100, ...(f.card_last_four ? { background: 'rgba(74,222,128,0.12)', color: '#4ADE80', border: '1px solid rgba(74,222,128,0.3)' } : { background: 'rgba(248,113,113,0.12)', color: '#F87171', border: '1px solid rgba(248,113,113,0.3)' }) }}>
          {f.card_last_four ? `${f.card_brand ?? 'Card'} ····${f.card_last_four}` : 'No card'}
        </span>
      </div>
      <div style={{ minWidth: 0 }}><PaymentBadge status={f.paymentStatus} overdueAmount={f.overdueAmountDisplay} /></div>
      <div>
        {f.has_enrollment_agreement ? (
          <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 100, background: 'rgba(34,197,94,0.12)', color: '#22C55E', border: '1px solid rgba(34,197,94,0.25)', display: 'inline-flex', alignItems: 'center', gap: 3 }}>
            <Check size={8} /> Yes
          </span>
        ) : (
          <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 100, background: 'rgba(239,68,68,0.12)', color: '#F87171', border: '1px solid rgba(239,68,68,0.3)', display: 'inline-flex', alignItems: 'center', gap: 3 }}>
            <XCircle size={8} /> No
          </span>
        )}
      </div>
    </div>
  )
}

// ═══════════════════════════════════════
// PAYMENT STATUS BADGE
// ═══════════════════════════════════════

const PAYMENT_BADGE_STYLES: Record<string, { bg: string; color: string; border: string }> = {
  current:    { bg: 'rgba(74,222,128,0.12)',  color: '#4ADE80', border: '1px solid rgba(74,222,128,0.3)' },
  scheduled:  { bg: 'rgba(56,189,248,0.12)',  color: '#38BDF8', border: '1px solid rgba(56,189,248,0.3)' },
  overdue:    { bg: 'rgba(248,113,113,0.15)', color: '#F87171', border: '1px solid rgba(248,113,113,0.4)' },
  paused:     { bg: 'rgba(148,163,184,0.12)', color: '#94A3B8', border: '1px solid rgba(148,163,184,0.3)' },
  no_invoice: { bg: 'rgba(255,184,0,0.12)',   color: '#FFB800', border: '1px solid rgba(255,184,0,0.3)' },
  cancelled:  { bg: 'rgba(96,96,136,0.12)',   color: '#606088', border: '1px solid rgba(96,96,136,0.3)' },
}

const PAYMENT_BADGE_LABELS: Record<string, string> = {
  current: 'Current', scheduled: 'Scheduled', overdue: 'Overdue',
  paused: 'Paused', no_invoice: 'No Invoice', cancelled: 'Cancelled',
}

function PaymentBadge({ status, overdueAmount }: { status: string; overdueAmount?: string | null }) {
  const s = PAYMENT_BADGE_STYLES[status] ?? PAYMENT_BADGE_STYLES.current
  const label = PAYMENT_BADGE_LABELS[status] ?? 'Current'
  return (
    <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 100, background: s.bg, color: s.color, border: s.border }}>
      {label}{status === 'overdue' && overdueAmount ? ` ${overdueAmount}` : ''}
    </span>
  )
}

// ═══════════════════════════════════════
// FAMILY DETAIL MODAL — 2-TAB (Account / Director)
// ═══════════════════════════════════════

type ModalTab = 'account' | 'director' | 'messages'
type MobileTab = 'account' | 'contact' | 'billing' | 'documents' | 'notifications'

function useIsMobile(breakpoint = 900) {
  const [mobile, setMobile] = useState(typeof window !== 'undefined' && window.innerWidth < breakpoint)
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${breakpoint - 1}px)`)
    const handler = (e: MediaQueryListEvent) => setMobile(e.matches)
    setMobile(mq.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [breakpoint])
  return mobile
}

function MobileNotificationPrefs({ family, toggleStyle, thumbStyle }: {
  family: any
  toggleStyle: (on: boolean) => React.CSSProperties
  thumbStyle: (on: boolean) => React.CSSProperties
}) {
  const qc = useQueryClient()
  const [sms, setSms] = useState(family.notify_via_sms ?? true)
  const [email, setEmail] = useState(family.notify_via_email ?? true)
  const [rem4hr, setRem4hr] = useState(family.reminder_4hr ?? true)
  const [rem1hr, setRem1hr] = useState(family.reminder_1hr ?? false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const dirty = sms !== (family.notify_via_sms ?? true) ||
    email !== (family.notify_via_email ?? true) ||
    rem4hr !== (family.reminder_4hr ?? true) ||
    rem1hr !== (family.reminder_1hr ?? false)

  const handleToggle = (field: 'sms' | 'email', val: boolean) => {
    setError('')
    if (field === 'sms') {
      if (!val && !email) { setError('At least one notification method is required.'); return }
      setSms(val)
    } else {
      if (!val && !sms) { setError('At least one notification method is required.'); return }
      setEmail(val)
    }
  }

  const handleSave = async () => {
    setSaving(true)
    setError('')
    try {
      const { error: err } = await supabase.from('families').update({
        notify_via_sms: sms,
        notify_via_email: email,
        reminder_4hr: rem4hr,
        reminder_1hr: rem1hr,
      }).eq('id', family.id)
      if (err) throw err
      qc.invalidateQueries({ queryKey: qk.families.fileDetail })
      qc.invalidateQueries({ queryKey: qk.families.all })
      toast('Notification preferences saved', 'success')
    } catch (e: any) {
      setError(e.message ?? 'Failed to save')
    } finally { setSaving(false) }
  }

  const sectionLabel = (text: string) => (
    <div style={{ fontSize: 11, fontWeight: 700, color: '#606088', textTransform: 'uppercase' as const, letterSpacing: '0.06em', marginBottom: 10 }}>{text}</div>
  )

  const row = (label: string, control: React.ReactNode) => (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', minHeight: 44, padding: '0 4px' }}>
      <span style={{ fontSize: 14, color: '#C0C0E0' }}>{label}</span>
      {control}
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {sectionLabel('How We Reach You')}
      {row('Text message', (
        <button style={toggleStyle(sms)} onClick={() => handleToggle('sms', !sms)}>
          <div style={thumbStyle(sms)} />
        </button>
      ))}
      {row('Email', (
        <button style={toggleStyle(email)} onClick={() => handleToggle('email', !email)}>
          <div style={thumbStyle(email)} />
        </button>
      ))}

      <div style={{ height: 12 }} />
      {sectionLabel('Session Reminders')}
      {row('24 hours before', (
        <span style={{ fontSize: 11, fontWeight: 700, color: '#22C55E', padding: '3px 12px', borderRadius: 8, background: 'rgba(34,197,94,0.1)' }}>Always on</span>
      ))}
      {row('4 hours before', (
        <button style={toggleStyle(rem4hr)} onClick={() => setRem4hr(!rem4hr)}>
          <div style={thumbStyle(rem4hr)} />
        </button>
      ))}
      {row('1 hour before', (
        <button style={toggleStyle(rem1hr)} onClick={() => setRem1hr(!rem1hr)}>
          <div style={thumbStyle(rem1hr)} />
        </button>
      ))}

      {error && <div style={{ fontSize: 13, color: '#EF4444', marginTop: 8, padding: '8px 12px', background: 'rgba(239,68,68,0.08)', borderRadius: 10 }}>{error}</div>}

      {dirty && (
        <button
          onClick={handleSave}
          disabled={saving}
          style={{
            width: '100%', padding: '12px 16px', borderRadius: 12, marginTop: 10,
            background: '#22C55E', border: 'none', cursor: 'pointer',
            color: '#fff', fontWeight: 700, fontSize: 14, minHeight: 44,
          }}
        >
          {saving ? 'Saving...' : 'Save Preferences'}
        </button>
      )}
    </div>
  )
}

/** Text block for Ziro: single-family facts from loaded family detail (authoritative for this modal). */
function familyOperatorBlockFromDetail(family: Family): string {
  return [
    `Family: ${family.name}`,
    `Parent: ${family.parent_first_name ?? ''} ${family.parent_last_name ?? family.parent_name ?? ''}`.trim(),
    `Location: ${family.locationName ?? 'Unknown'}`,
    `Status: ${family.billing_status}`,
    `Rate: $${(family.rate_tier / 100).toFixed(2)}/session, Monthly: $${(family.monthlyTotalCents / 100).toFixed(2)}${family.rate_tier_override ? ' (override)' : ''}`,
    `Balance: ${formatDollars(family.balance)}`,
    family.overdue_balance_cents && family.overdue_balance_cents > 0 ? `Overdue: ${formatDollars(family.overdue_balance_cents)}` : null,
    `Lifetime Paid: ${formatDollars(family.lifetime_paid_cents)}`,
    `Active Students: ${family.activeStudentCount}`,
    family.students.filter(s => s.status === 'active').map(s => `  - ${s.first_name} ${s.last_name}: ${s.instrument}, teacher: ${s.teacher_name}`).join('\n'),
    family.scheduling_notes ? `Scheduling Notes: ${family.scheduling_notes}` : null,
    family.is_military ? 'Military family' : null,
  ]
    .filter(Boolean)
    .join('\n')
}

// ═══════════════════════════════════════
// COLLAPSED SECTION
// ═══════════════════════════════════════

function CollapsedSection({ title, count, open, onToggle, children }: {
  title: string; count?: number; open: boolean; onToggle: () => void; children: React.ReactNode
}) {
  return (
    <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', marginTop: 20, paddingTop: 16 }}>
      <button onClick={onToggle} style={{
        display: 'flex', alignItems: 'center', gap: 8, width: '100%', background: 'none', border: 'none',
        cursor: 'pointer', padding: 0, marginBottom: open ? 12 : 0,
      }}>
        <ChevronDown size={14} style={{ color: '#8080A8', transition: 'transform 150ms', transform: open ? 'rotate(180deg)' : 'rotate(0)' }} />
        <span style={{ fontSize: 12, fontWeight: 700, color: '#8080A8', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{title}</span>
        {count != null && count > 0 && <span className="badge-secondary" style={{ fontSize: 9 }}>{count}</span>}
      </button>
      {open && children}
    </div>
  )
}

// ═══════════════════════════════════════
// FAMILY INVOICE SECTION (collapsed)
// ═══════════════════════════════════════

const INVOICE_STATUS_STYLE: Record<string, { bg: string; border: string; color: string }> = {
  pending:  { bg: 'rgba(255,184,0,0.1)',  border: 'rgba(255,184,0,0.25)',  color: '#FFB800' },
  viewed:   { bg: 'rgba(99,102,241,0.1)', border: 'rgba(99,102,241,0.25)', color: '#6366F1' },
  paid:     { bg: 'rgba(34,197,94,0.1)',  border: 'rgba(34,197,94,0.25)',  color: '#22C55E' },
  expired:  { bg: 'rgba(255,255,255,0.04)', border: 'rgba(255,255,255,0.08)', color: '#8080A8' },
  cancelled: { bg: 'rgba(239,68,68,0.1)', border: 'rgba(239,68,68,0.25)', color: '#EF4444' },
}

function FamilyInvoiceSection({ familyId, family, invoices, open, onToggle }: {
  familyId: string; family: any; invoices: any[] | undefined; open: boolean; onToggle: () => void
}) {
  const { tenantId, role } = useAuthContext()
  const [showCreateInvoice, setShowCreateInvoice] = useState(false)

  const nextScheduled = invoices?.find((inv: any) => inv.status === 'pending' || inv.status === 'viewed')

  return (
    <CollapsedSection title="Invoices" count={invoices?.length ?? 0} open={open} onToggle={onToggle}>
      {/* Next scheduled / pending */}
      {nextScheduled && (
        <div style={{
          padding: '10px 14px', borderRadius: 10, marginBottom: 10,
          background: 'rgba(255,184,0,0.06)', border: '1px solid rgba(255,184,0,0.15)',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: '#FFB800', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              {nextScheduled.status === 'viewed' ? 'Viewed by Family' : 'Pending'}
            </span>
            <span style={{ fontSize: 12, fontWeight: 700, color: '#E0E0F4' }}>
              {formatDollars(nextScheduled.amount_cents)}
            </span>
          </div>
          <div style={{ fontSize: 11, color: '#A0A0C8' }}>
            {nextScheduled.billing_period_label}
            {nextScheduled.due_date && <span> &middot; Due {new Date(nextScheduled.due_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>}
          </div>
        </div>
      )}

      {/* Invoice history */}
      {invoices && invoices.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 10 }}>
          {invoices.map((inv: any) => {
            const st = INVOICE_STATUS_STYLE[inv.status] ?? INVOICE_STATUS_STYLE.pending
            return (
              <div key={inv.id} style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 8,
                background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)',
              }}>
                <FileText size={13} style={{ color: '#606088', flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: '#D0D0E8' }}>{inv.billing_period_label}</span>
                  <span style={{ fontSize: 10, color: '#606088', marginLeft: 8 }}>
                    {new Date(inv.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </span>
                </div>
                <span style={{
                  fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em',
                  padding: '2px 8px', borderRadius: 6, background: st.bg, border: `1px solid ${st.border}`, color: st.color,
                }}>{inv.status}</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: '#E0E0F4', minWidth: 60, textAlign: 'right' }}>
                  {formatDollars(inv.amount_cents)}
                </span>
                {inv.invoice_snapshot?.pdf_url && (
                  <button
                    title="View PDF"
                    onClick={() => window.open(inv.invoice_snapshot.pdf_url, '_blank')}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, color: '#606088' }}
                  >
                    <Download size={12} />
                  </button>
                )}
              </div>
            )
          })}
        </div>
      ) : (
        <div style={{ fontSize: 12, color: '#606088', padding: '8px 0' }}>No invoices yet.</div>
      )}

      {/* Generate Invoice button */}
      {(role === 'owner' || role === 'admin' || role === 'studio_director') && (
        <button
          onClick={() => setShowCreateInvoice(true)}
          style={{
            width: '100%', padding: '10px 0', borderRadius: 10, fontSize: 12, fontWeight: 700,
            background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)',
            color: '#22C55E', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          }}
        >
          <Receipt size={13} /> Generate Invoice
        </button>
      )}

      {showCreateInvoice && family && (
        <CreateInvoiceFromFamily family={family} onClose={() => setShowCreateInvoice(false)} />
      )}
    </CollapsedSection>
  )
}

function FamilyDetailModal({ familyId, canEdit, onClose, onNavigateStudent }: {
  familyId: string; canEdit: boolean; onClose: () => void; onNavigateStudent: (studentId: string) => void
}) {
  const { role, tenantId, profile } = useAuthContext()
  const { isStudioDirector: sdFromPerm } = usePermissions()
  const { setPageContext } = useZiroShell()
  const { data: family, isLoading } = useFamilyDetail(familyId)
  const updateFamily = useUpdateFamilyInfo()
  const changeBillingStatus = useChangeFamilyBillingStatus()
  const uploadFile = useUploadFamilyFile()
  const deleteFile = useDeleteFamilyFile()

  useEffect(() => {
    if (!family) return
    const summary = familyOperatorBlockFromDetail(family)
    setPageContext((prev) => ({
      ...prev,
      page: 'family_detail',
      familyId: family.id,
      familyOperatorSummary: summary,
    }))
    return () => {
      setPageContext((prev) => {
        const next = { ...prev }
        if (next.familyId === family.id) {
          delete next.familyId
          delete next.familyOperatorSummary
          if (next.page === 'family_detail') delete next.page
        }
        return next
      })
    }
  }, [family, setPageContext])
  const { data: activityLog } = useFamilyActivityLog(familyId, 5)
  const [showFullActivityLog, setShowFullActivityLog] = useState(false)
  const [activityOpen, setActivityOpen] = useState(false)
  const [invoicesOpen, setInvoicesOpen] = useState(false)
  const { data: familyInvoices } = useFamilyInvoices(familyId)

  const isMobile = useIsMobile()
  const [tab, setTab] = useState<ModalTab>('account')
  const [mobileTab, setMobileTab] = useState<MobileTab>('account')
  const [confirmAction, setConfirmAction] = useState<{ status: string } | null>(null)
  const [editing, setEditing] = useState(false)
  const [showPausedStudents, setShowPausedStudents] = useState(false)
  const reactivateStudent = useReactivateStudent()
  const removeFromFamily = useRemoveStudentFromFamily()
  const deleteFamilyMut = useDeleteFamily()
  const [removeStudentConfirm, setRemoveStudentConfirm] = useState<{ id: string; name: string } | null>(null)
  const [deleteFamilyConfirm, setDeleteFamilyConfirm] = useState(false)
  const [uploadType, setUploadType] = useState<string>('other')
  const [uploadNotes, setUploadNotes] = useState('')
  const [showUploadModal, setShowUploadModal] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState<FamilyFile | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [showReviewModal, setShowReviewModal] = useState(false)
  const { data: lastReviewReq } = useLastReviewRequest(familyId)
  const reviewRecentlySent = lastReviewReq?.sent_at
    ? (Date.now() - new Date(lastReviewReq.sent_at).getTime()) < 90 * 24 * 60 * 60 * 1000
    : false
  const reviewSentDate = lastReviewReq?.sent_at
    ? new Date(lastReviewReq.sent_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    : null

  // Edit form — one form for all editable fields, toggled by single Edit button
  const [form, setForm] = useState<Record<string, string>>({})

  const canUpload = role === 'owner' || role === 'admin' || role === 'company_director'

  const startEditing = () => {
    if (!family) return
    setForm({
      name: family.name ?? '',
      parent_first_name: family.parent_first_name ?? '',
      parent_last_name: family.parent_last_name ?? '',
      primary_email: family.primary_email ?? '',
      primary_phone: family.primary_phone ?? '',
      emergency_contact_name: family.emergency_contact_name ?? '',
      emergency_contact_phone: family.emergency_contact_phone ?? '',
      emergency_contact_relationship: family.emergency_contact_relationship ?? '',
      billing_notes: family.billing_notes ?? '',
      scheduling_notes: family.scheduling_notes ?? '',
    })
    setEditing(true)
  }

  const cancelEditing = () => { setEditing(false) }

  const handleSave = async () => {
    if (!family) return
    // Build only changed fields
    const updates: Record<string, string> = {}
    const fields = ['name', 'parent_first_name', 'parent_last_name', 'primary_email', 'primary_phone',
      'emergency_contact_name', 'emergency_contact_phone', 'emergency_contact_relationship',
      'billing_notes', 'scheduling_notes']
    for (const f of fields) {
      const original = (family as any)[f] ?? ''
      if (form[f] !== original) updates[f] = form[f]
    }
    if (Object.keys(updates).length === 0) { setEditing(false); return }
    try {
      await updateFamily.mutateAsync({ id: family.id, ...updates })
      if (sdFromPerm && tenantId && profile?.id) {
        logAudit({
          tenantId, performedBy: profile.id,
          userName: `${profile.first_name ?? ''} ${profile.last_name ?? ''}`.trim() || 'Studio Director',
          userRole: 'studio_director', action: 'FAMILY_UPDATE_CONTACT',
          tableName: 'families', recordId: family.id,
          entityName: family.name ?? null,
          locationId: family.primary_location_id ?? null,
          newValue: updates,
        })
      }
      toast('Saved', 'success')
      setEditing(false)
    } catch (err: any) { toast(err.message ?? 'Failed to save', 'error') }
  }

  const handleStatusChange = async (newStatus: string) => {
    if (!family) return
    if (newStatus === 'suspended' || newStatus === 'cancelled') { setConfirmAction({ status: newStatus }); return }
    await doStatusChange(newStatus)
  }

  const doStatusChange = async (newStatus: string) => {
    if (!family) return
    try {
      await changeBillingStatus.mutateAsync({ familyId: family.id, oldStatus: family.billing_status, newStatus })
      if (sdFromPerm && tenantId && profile?.id) {
        logAudit({
          tenantId, performedBy: profile.id,
          userName: `${profile.first_name ?? ''} ${profile.last_name ?? ''}`.trim() || 'Studio Director',
          userRole: 'studio_director', action: 'FAMILY_BILLING_STATUS_CHANGE',
          tableName: 'families', recordId: family.id,
          entityName: family.name ?? null,
          locationId: family.primary_location_id ?? null,
          oldValue: { billing_status: family.billing_status }, newValue: { billing_status: newStatus },
        })
      }
      toast(`Status changed to ${newStatus}`, 'success')
      setConfirmAction(null)
    } catch (err: any) { toast(err.message ?? 'Failed', 'error') }
  }

  const handleUpload = async (file: File) => {
    if (!family || !tenantId) return
    try {
      await uploadFile.mutateAsync({ tenantId, familyId: family.id, file, fileType: uploadType, notes: uploadNotes || undefined })
      toast('File uploaded', 'success')
      setShowUploadModal(false); setUploadNotes('')
    } catch (err: any) { toast(err.message ?? 'Upload failed', 'error') }
  }

  const handleDeleteFile = async (f: FamilyFile) => {
    try {
      await deleteFile.mutateAsync({ fileId: f.id, familyId: f.family_id, fileUrl: f.file_url })
      toast('File deleted', 'success'); setDeleteConfirm(null)
    } catch (err: any) { toast(err.message ?? 'Delete failed', 'error') }
  }

  const status = family?.billing_status ?? 'active'
  const statusStyle = STATUS_BADGE[status] ?? STATUS_BADGE.active
  const rateColor = family ? getRateTierColor(family.rate_tier) : getRateTierColor(4500)

  // ── Render helpers (plain functions, NOT components — avoids React type-instability on re-render) ──
  const fld = (label: string, value: React.ReactNode) => (
    <div style={{ marginBottom: 8 }}>
      <span style={labelStyle}>{label}</span>
      <div style={valueStyle}>{value || <span style={{ color: '#363656' }}>—</span>}</div>
    </div>
  )

  const inp = (field: string, label: string) => (
    <div key={field} style={{ marginBottom: 8 }}>
      <span style={labelStyle}>{label}</span>
      {editing ? (
        <input value={form[field] ?? ''} onChange={(e) => setForm(prev => ({ ...prev, [field]: e.target.value }))} className="filter-select" style={{ width: '100%', fontSize: 13, marginTop: 3 }} />
      ) : (
        <div style={valueStyle}>{(family as any)?.[field] || <span style={{ color: '#363656' }}>—</span>}</div>
      )}
    </div>
  )

  const txt = (field: string, label: string, placeholder?: string) => (
    <div key={field} style={{ marginBottom: 8 }}>
      <span style={labelStyle}>{label}</span>
      {editing ? (
        <textarea value={form[field] ?? ''} onChange={(e) => setForm(prev => ({ ...prev, [field]: e.target.value }))} rows={3} placeholder={placeholder} className="filter-select" style={{ width: '100%', fontSize: 13, marginTop: 3, resize: 'vertical', fontFamily: 'inherit' }} />
      ) : (
        <div style={{ ...valueStyle, whiteSpace: 'pre-wrap' }}>{(family as any)?.[field] || <span style={{ color: '#363656' }}>—</span>}</div>
      )}
    </div>
  )

  // ── Shared toggle styles ──
  const mToggle = (on: boolean): React.CSSProperties => ({
    width: 44, height: 24, borderRadius: 12, cursor: 'pointer',
    background: on ? '#22C55E' : '#333', position: 'relative',
    transition: 'background 200ms', flexShrink: 0, border: 'none',
  })
  const mThumb = (on: boolean): React.CSSProperties => ({
    position: 'absolute', top: 2, left: on ? 22 : 2,
    width: 20, height: 20, borderRadius: '50%', background: '#fff',
    transition: 'left 200ms', pointerEvents: 'none' as const,
  })

  // ── Tab switch handler ──
  const switchTab = (t: MobileTab) => {
    setMobileTab(t)
    if (editing) { setEditing(false) }
  }

  // ── Safe accessors ──
  const students = family?.students ?? []
  const activeStudents = students.filter((s: any) => s.status === 'active')

  // ── MOBILE LAYOUT ──
  if (isMobile) {
    return createPortal(
      <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.7)' }} onClick={onClose}>
        <div onClick={(e) => e.stopPropagation()} style={{
          position: 'absolute', bottom: 0, left: 0, right: 0, height: '95vh',
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
          background: '#141224', borderRadius: '20px 20px 0 0',
          border: '1px solid rgba(212,34,106,0.15)', borderBottom: 'none',
        }}>
          <div style={{ height: 3, background: 'linear-gradient(90deg, #D4226A, #7B2CBF)', borderRadius: '20px 20px 0 0', flexShrink: 0 }} />

          {isLoading || !family ? (
            <div style={{ padding: 40, textAlign: 'center' }}><MusicLoader /></div>
          ) : (<>
            {/* ── MOBILE HEADER ── */}
            <div style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 8, borderBottom: '1px solid rgba(255,255,255,0.06)', flexShrink: 0 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 18, fontWeight: 800, color: '#E0E0F4', overflowWrap: 'break-word' }}>{stripFamily(family.name)}</div>
              </div>
              <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 10px', borderRadius: 8, background: statusStyle.bg, border: `1px solid ${statusStyle.border}`, color: statusStyle.color, flexShrink: 0 }}>
                {status.charAt(0).toUpperCase() + status.slice(1)}
              </span>
              {canEdit && !editing && (
                <button onClick={startEditing} title="Edit" style={{ width: 32, height: 32, borderRadius: 8, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#8080A8', flexShrink: 0 }}>
                  <Pencil size={14} />
                </button>
              )}
              {editing && (
                <>
                  <button className="btn-ghost" onClick={() => setEditing(false)} style={{ fontSize: 11, padding: '5px 10px', flexShrink: 0 }}>Cancel</button>
                  <button className="btn-primary" onClick={handleSave} disabled={updateFamily.isPending} style={{ fontSize: 11, padding: '5px 12px', flexShrink: 0 }}>
                    {updateFamily.isPending ? 'Saving...' : 'Save'}
                  </button>
                </>
              )}
              <button onClick={onClose} style={{ width: 32, height: 32, borderRadius: 8, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#8080A8', flexShrink: 0 }}>
                <X size={16} />
              </button>
            </div>

            {/* ── MOBILE TABS ── */}
            <div style={{ display: 'flex', gap: 6, padding: '10px 16px', overflowX: 'auto', flexShrink: 0, borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
              {(['account', 'contact', 'billing', 'documents', 'notifications'] as MobileTab[]).map((t) => (
                <button key={t} data-guide-id={`family-tab-${t}`} onClick={() => switchTab(t)} style={{
                  padding: '6px 16px', fontSize: 12, fontWeight: 700, cursor: 'pointer', borderRadius: 20, whiteSpace: 'nowrap', flexShrink: 0,
                  background: mobileTab === t ? 'rgba(212,34,106,0.12)' : 'rgba(255,255,255,0.04)',
                  color: mobileTab === t ? '#E8488A' : '#8080A8',
                  border: mobileTab === t ? '1px solid rgba(212,34,106,0.25)' : '1px solid rgba(255,255,255,0.06)',
                }}>{t === 'account' ? 'Account' : t === 'contact' ? 'Contact' : t === 'billing' ? 'Billing' : t === 'documents' ? 'Documents' : 'Notifications'}</button>
              ))}
            </div>

            {/* ── MOBILE TAB CONTENT ── */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '16px 16px 24px' }}>

              {/* ── MOBILE: ACCOUNT ── */}
              {mobileTab === 'account' && (<>
                {inp('name', 'Account Name')}
                {fld('Member Since', family.created_at ? new Date(family.created_at).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) : '---')}
                {family.locationName && fld('Location', family.locationName)}
                {family.square_customer_id && (
                  <div style={{ marginBottom: 8 }}>
                    <span style={labelStyle}>Square ID</span>
                    <div style={{ marginTop: 3, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontSize: 12, color: '#606088', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 140 }}>{family.square_customer_id}</span>
                      <button onClick={() => { navigator.clipboard.writeText(family.square_customer_id); toast('Copied', 'success') }} style={{ fontSize: 10, fontWeight: 600, color: '#8080A8', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 4, padding: '2px 8px', cursor: 'pointer', flexShrink: 0 }}>Copy</button>
                    </div>
                  </div>
                )}

                {/* Students */}
                <div data-guide-id="family-students-list">
                <div style={{ ...sectionLabelStyle, marginTop: 16 }}>Students ({family.activeStudentCount ?? 0} active)</div>
                {activeStudents.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {activeStudents.map((s: any) => (
                      <div key={s.id} onClick={() => onNavigateStudent(s.id)} style={{
                        padding: '12px 14px', borderRadius: 10, cursor: 'pointer', minHeight: 44,
                        background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)',
                        display: 'flex', alignItems: 'center', gap: 10,
                      }}>
                        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 1 }}>
                          <span style={{ fontSize: 14, fontWeight: 700, color: '#E0E0F4', overflowWrap: 'break-word' }}>{s.first_name} {s.last_name}</span>
                          {s.student_display_id && (
                            <span style={{ fontSize: 10, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace', color: '#606088', fontWeight: 600 }}>{s.student_display_id}</span>
                          )}
                        </div>
                        <span style={{ fontSize: 12, color: '#A0A0C8', flexShrink: 0 }}>{s.instrument ? getInstrumentEmoji(s.instrument) : ''}</span>
                        <span style={{ fontSize: 11, color: '#8080A8', flexShrink: 0 }}>{s.teacher_name}</span>
                        <ChevronRight size={12} style={{ color: '#363656', flexShrink: 0 }} />
                      </div>
                    ))}
                  </div>
                ) : <div style={{ fontSize: 13, color: '#606088', padding: '12px 0' }}>No students linked.</div>}
                </div>

                {/* Activity — collapsed */}
                {canEdit && (
                  <CollapsedSection title="Recent Activity" count={activityLog?.length ?? 0} open={activityOpen} onToggle={() => setActivityOpen(!activityOpen)}>
                    {activityLog && activityLog.length > 0 ? (
                      <>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                          {activityLog.slice(0, 5).map((ev) => <ActivityRow key={ev.id} event={ev} />)}
                        </div>
                        <button onClick={() => setShowFullActivityLog(true)} style={{
                          background: 'none', border: 'none', color: '#6366F1', fontSize: 11, fontWeight: 600,
                          cursor: 'pointer', padding: '8px 0', textAlign: 'center', width: '100%',
                        }}>View Full Audit Log</button>
                      </>
                    ) : <div style={{ fontSize: 12, color: '#606088', padding: '8px 0' }}>No activity yet.</div>}
                  </CollapsedSection>
                )}

                {/* Invoices — collapsed */}
                {canEdit && (
                  <FamilyInvoiceSection familyId={familyId} family={family} invoices={familyInvoices} open={invoicesOpen} onToggle={() => setInvoicesOpen(!invoicesOpen)} />
                )}
              </>)}

              {/* ── MOBILE: CONTACT ── */}
              {mobileTab === 'contact' && (<>
                <div data-guide-id="family-parent-contact">
                <div style={sectionLabelStyle}>Primary Contact</div>
                {inp('parent_first_name', 'First Name')}
                {inp('parent_last_name', 'Last Name')}
                {editing ? inp('primary_email', 'Email') : (
                  <div style={{ marginBottom: 8 }}>
                    <span style={labelStyle}>Email</span>
                    <div style={{ ...valueStyle, overflowWrap: 'break-word', wordBreak: 'break-all' }}>{family.primary_email || <span style={{ color: '#363656' }}>—</span>}</div>
                  </div>
                )}
                {editing ? inp('primary_phone', 'Phone') : (
                  <div style={{ marginBottom: 8 }}>
                    <span style={labelStyle}>Phone</span>
                    <div style={valueStyle}>{family.primary_phone ? <a href={`tel:${family.primary_phone}`} style={{ color: '#D0D0E8', textDecoration: 'none' }}>{family.primary_phone}</a> : <span style={{ color: '#363656' }}>—</span>}</div>
                  </div>
                )}
                </div>

                <div data-guide-id="family-emergency-contact">
                <div style={{ ...sectionLabelStyle, marginTop: 20 }}>Emergency Contact</div>
                {inp('emergency_contact_name', 'Name')}
                {editing ? inp('emergency_contact_phone', 'Phone') : (
                  <div style={{ marginBottom: 8 }}>
                    <span style={labelStyle}>Phone</span>
                    <div style={valueStyle}>{family.emergency_contact_phone ? <a href={`tel:${family.emergency_contact_phone}`} style={{ color: '#D0D0E8', textDecoration: 'none' }}>{family.emergency_contact_phone}</a> : <span style={{ color: '#363656' }}>—</span>}</div>
                  </div>
                )}
                {inp('emergency_contact_relationship', 'Relationship')}
                </div>
              </>)}

              {/* ── MOBILE: BILLING ── */}
              {mobileTab === 'billing' && (<>
                <div style={{ marginBottom: 12 }}>
                  <span style={{
                    fontSize: 14, fontWeight: 700, padding: '5px 14px', borderRadius: 8,
                    background: rateColor.bg, border: `1px solid ${rateColor.border}`, color: rateColor.text,
                    display: 'inline-flex', alignItems: 'center', gap: 4,
                  }}>
                    ${formatRate(family.rate_tier)}/mo
                    {family.rate_tier_override && <Lock size={11} />}
                  </span>
                </div>
                <div data-guide-id="family-card-on-file">
                {fld('Card on File', family.card_last_four ? (
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#22C55E' }}><CreditCard size={13} /> {family.card_brand ?? 'Card'} ····{family.card_last_four}</span>
                ) : <span style={{ color: '#EF4444', fontWeight: 700 }}>No Card</span>)}
                </div>
                <div style={{ marginBottom: 12 }}>
                  <span style={labelStyle}>Balance</span>
                  <div style={{ marginTop: 3, fontSize: 18, fontWeight: 800, color: (family.balance ?? 0) > 0 ? '#22C55E' : (family.balance ?? 0) < 0 ? '#EF4444' : '#A0A0C8' }}>
                    {formatDollars(family.balance)}
                  </div>
                </div>
                {fld('Lifetime Paid', <span style={{ fontWeight: 700, color: '#A0A0C8' }}>{formatDollars(family.lifetime_paid_cents)}</span>)}
                {(family.overdue_balance_cents ?? 0) > 0 && fld('Overdue', <span style={{ fontWeight: 700, color: '#EF4444' }}>{formatDollars(family.overdue_balance_cents)}</span>)}

                <div style={{ ...sectionLabelStyle, marginTop: 20 }}>Notes</div>
                <div data-guide-id="family-scheduling-notes">
                  {txt('scheduling_notes', 'Scheduling Notes', 'e.g. No Mondays after 6pm, prefers same teacher for siblings...')}
                </div>
                <div data-guide-id="family-billing-notes">
                  {txt('billing_notes', 'Billing Notes', 'Billing-related notes...')}
                </div>

              </>)}

              {/* ── MOBILE: DOCUMENTS ── */}
              {mobileTab === 'documents' && (
                <FamilyDocumentsSection
                  familyId={family.id}
                  canUpload={canUpload}
                  variant="compact"
                  onUploadClick={() => { setUploadType('enrollment_agreement'); setShowUploadModal(true) }}
                  onDeleteRequest={setDeleteConfirm}
                />
              )}

              {/* ── MOBILE: NOTIFICATIONS ── */}
              {mobileTab === 'notifications' && (
                <MobileNotificationPrefs family={family} toggleStyle={mToggle} thumbStyle={mThumb} />
              )}
            </div>
          </>)}
        </div>

        {/* Modals (shared) */}
        {confirmAction && <ConfirmModal title={`${confirmAction.status === 'suspended' ? 'Suspend' : 'Cancel'} Family Billing?`} message={confirmAction.status === 'suspended' ? 'This will suspend billing.' : 'This will cancel billing.'} variant={confirmAction.status === 'cancelled' ? 'danger' : 'warning'} confirmLabel={confirmAction.status === 'suspended' ? 'Suspend' : 'Cancel Billing'} onConfirm={() => doStatusChange(confirmAction.status)} onCancel={() => setConfirmAction(null)} />}
        {deleteConfirm && <ConfirmModal title="Delete File?" message={`Delete "${deleteConfirm.file_name}"?`} variant="danger" confirmLabel="Delete" onConfirm={() => handleDeleteFile(deleteConfirm)} onCancel={() => setDeleteConfirm(null)} />}
        {showUploadModal && family && (
          <div style={{ position: 'fixed', inset: 0, zIndex: 10001, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={() => setShowUploadModal(false)}>
            <div onClick={(e) => e.stopPropagation()} style={{ background: '#1A1830', borderRadius: 16, padding: 24, width: '100%', maxWidth: 400, border: '1px solid rgba(255,255,255,0.1)' }}>
              <h3 style={{ fontSize: 16, fontWeight: 700, color: '#E0E0F4', marginBottom: 16 }}>Upload Document</h3>
              <div style={{ marginBottom: 12 }}>
                <span style={labelStyle}>Document Type</span>
                <select value={uploadType} onChange={(e) => setUploadType(e.target.value)} className="filter-select" style={{ width: '100%', marginTop: 4 }}>
                  <option value="enrollment_agreement">Enrollment Agreement</option>
                  <option value="contract">Contract</option>
                  <option value="id">ID</option>
                  <option value="insurance">Insurance</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div style={{ marginBottom: 12 }}>
                <span style={labelStyle}>Notes (optional)</span>
                <input value={uploadNotes} onChange={(e) => setUploadNotes(e.target.value)} className="filter-select" style={{ width: '100%', marginTop: 4 }} placeholder="Optional notes..." />
              </div>
              <input ref={fileInputRef} type="file" accept=".pdf,application/pdf" style={{ display: 'none' }} onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUpload(f) }} />
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" className="btn-ghost" onClick={() => setShowUploadModal(false)}>Cancel</button>
                <button type="button" className="btn-primary" onClick={() => fileInputRef.current?.click()} disabled={uploadFile.isPending}>{uploadFile.isPending ? 'Uploading...' : 'Choose File'}</button>
              </div>
            </div>
          </div>
        )}
      </div>,
      document.body
    )
  }

  // ── DESKTOP LAYOUT (unchanged) ──
  return createPortal(
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{
        width: '100%', maxWidth: 800, height: '85vh', display: 'flex', flexDirection: 'column', overflow: 'hidden',
        background: '#141224', borderRadius: 20, border: '1px solid rgba(212,34,106,0.15)',
        boxShadow: '0 0 60px rgba(212,34,106,0.08), 0 24px 60px rgba(0,0,0,0.5)',
      }}>
        <div style={{ height: 3, background: 'linear-gradient(90deg, #D4226A, #7B2CBF)', borderRadius: '20px 20px 0 0' }} />

        {isLoading || !family ? (
          <div style={{ padding: 40, textAlign: 'center' }}><MusicLoader /></div>
        ) : (<>
          {/* ── HEADER ── */}
          <div style={{ padding: '24px 28px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div style={{ fontSize: 22, fontWeight: 800, color: '#E0E0F4' }}>{stripFamily(family.name)}</div>
              <div style={{ fontSize: 14, color: '#A0A0C8', marginTop: 4 }}>
                {family.parent_first_name || family.parent_last_name
                  ? `${family.parent_first_name ?? ''} ${family.parent_last_name ?? ''}`.trim()
                  : family.parent_name ?? '---'}
                {family.is_military && <span style={{ marginLeft: 8, fontSize: 9, padding: '1px 6px', borderRadius: 4, background: 'rgba(255,184,0,0.15)', color: '#FFB800', border: '1px solid rgba(255,184,0,0.25)', fontWeight: 700 }}>MIL</span>}
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              {canEdit && !editing && (
                <button onClick={startEditing} className="btn-outline" style={{ fontSize: 11, padding: '5px 14px', display: 'flex', alignItems: 'center', gap: 5 }}>
                  <Pencil size={11} /> Edit
                </button>
              )}
              {editing && (
                <div style={{ display: 'flex', gap: 6 }}>
                  <button className="btn-ghost" onClick={cancelEditing} style={{ fontSize: 11, padding: '5px 12px' }}>Cancel</button>
                  <button className="btn-primary" onClick={handleSave} disabled={updateFamily.isPending} style={{ fontSize: 11, padding: '5px 14px' }}>
                    {updateFamily.isPending ? 'Saving...' : 'Save'}
                  </button>
                </div>
              )}
              <span style={{ fontSize: 11, fontWeight: 700, padding: '4px 12px', borderRadius: 8, background: statusStyle.bg, border: `1px solid ${statusStyle.border}`, color: statusStyle.color }}>
                {status.charAt(0).toUpperCase() + status.slice(1)}
              </span>
              <button
                disabled={reviewRecentlySent}
                onClick={() => { if (!reviewRecentlySent) setShowReviewModal(true) }}
                style={{
                  fontSize: 10, fontWeight: 700, padding: '4px 12px', borderRadius: 8,
                  background: reviewRecentlySent ? 'rgba(34,197,94,0.08)' : 'rgba(212,34,106,0.08)',
                  border: `1px solid ${reviewRecentlySent ? 'rgba(34,197,94,0.2)' : 'rgba(212,34,106,0.2)'}`,
                  color: reviewRecentlySent ? '#22C55E' : '#D4226A',
                  cursor: reviewRecentlySent ? 'default' : 'pointer',
                  display: 'flex', alignItems: 'center', gap: 4,
                }}
              >
                <Star size={10} /> {reviewRecentlySent ? `Review Requested ${reviewSentDate}` : 'Generate Review Request'}
              </button>
              <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, padding: 6, cursor: 'pointer', color: '#8080A8' }}><X size={16} /></button>
            </div>
          </div>

          {/* ── TABS + EDIT BUTTON ── */}
          <div style={{ display: 'flex', alignItems: 'center', padding: '16px 28px 0', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
            <div style={{ display: 'flex', gap: 4, flex: 1 }}>
              {(['account', 'director', 'messages'] as ModalTab[]).map((t) => (
                <button key={t} onClick={() => { setTab(t); if (editing) cancelEditing() }} style={{
                  padding: '8px 20px', fontSize: 12, fontWeight: 700, cursor: 'pointer', borderRadius: '8px 8px 0 0',
                  background: tab === t ? 'rgba(212,34,106,0.08)' : 'transparent',
                  color: tab === t ? '#E8488A' : '#8080A8',
                  border: tab === t ? '1px solid rgba(212,34,106,0.15)' : '1px solid transparent',
                  borderBottom: tab === t ? '1px solid #141224' : '1px solid transparent', marginBottom: -1,
                }}>{t === 'account' ? 'Account' : t === 'director' ? 'Director' : 'Messages'}</button>
              ))}
            </div>
          </div>

          {/* Tab content — scrollable, fixed height */}
          <div style={{ flex: 1, overflowY: 'auto' }}>

          {/* ── TAB 1: ACCOUNT ── */}
          {tab === 'account' && (
            <div style={{ padding: '20px 28px 24px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
                {/* LEFT */}
                <div>
                  <div style={sectionLabelStyle}>Primary Contact</div>
                  {inp('parent_first_name', 'First Name')}
                  {inp('parent_last_name', 'Last Name')}
                  {inp('primary_email', 'Email')}
                  {inp('primary_phone', 'Phone')}
                  {editing && (
                    <div style={{ marginBottom: 8 }}>
                      <span style={labelStyle}>Military</span>
                      <div style={{ marginTop: 4 }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#C0C0E0', cursor: 'pointer' }}>
                          <input type="checkbox" checked={family.is_military} onChange={async (e) => {
                            try { await updateFamily.mutateAsync({ id: family.id, is_military: e.target.checked }); toast('Saved', 'success') } catch { toast('Failed', 'error') }
                          }} style={{ accentColor: '#D4226A' }} />
                          {family.is_military ? 'Yes' : 'No'}
                        </label>
                      </div>
                    </div>
                  )}

                  <div style={{ ...sectionLabelStyle, marginTop: 20 }}>Emergency Contact</div>
                  {inp('emergency_contact_name', 'Name')}
                  {inp('emergency_contact_phone', 'Phone')}
                  {inp('emergency_contact_relationship', 'Relationship')}
                </div>

                {/* RIGHT */}
                <div>
                  <div style={sectionLabelStyle}>Account</div>
                  {inp('name', 'Account Name')}
                  {fld('Member Since', family.created_at ? new Date(family.created_at).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) : '---')}
                  {family.square_customer_id && fld('Adkins Music Lessons ID', <span style={{ color: '#606088', fontSize: 11 }}>{family.square_customer_id}</span>)}
                  {family.locationName && fld('Location', family.locationName)}

                  <div style={{ ...sectionLabelStyle, marginTop: 20 }}>Billing</div>
                  <div style={{ marginBottom: 8 }}>
                    <span style={labelStyle}>Rate</span>
                    <div style={{ marginTop: 4 }}>
                      <span style={{
                        fontSize: 13, fontWeight: 700, padding: '4px 12px', borderRadius: 8,
                        background: rateColor.bg, border: `1px solid ${rateColor.border}`, color: rateColor.text,
                        display: 'inline-flex', alignItems: 'center', gap: 4,
                      }}>
                        ${formatRate(family.rate_tier)}/mo
                        {family.rate_tier_override && <Lock size={11} />}
                      </span>
                    </div>
                  </div>
                  {fld('Card on File', family.card_last_four ? (
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><CreditCard size={13} /> {family.card_brand ?? 'Card'} ····{family.card_last_four}</span>
                  ) : <span style={{ color: '#EF4444' }}>No Card</span>)}
                  <div style={{ marginBottom: 8 }}>
                    <span style={labelStyle}>Balance</span>
                    <div style={{ marginTop: 3, fontSize: 16, fontWeight: 800, color: (family.balance ?? 0) > 0 ? '#22C55E' : (family.balance ?? 0) < 0 ? '#EF4444' : '#A0A0C8' }}>
                      {formatDollars(family.balance)}
                    </div>
                  </div>
                </div>
              </div>

              {/* STUDENTS */}
              <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', marginTop: 20, paddingTop: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                  <Users size={14} style={{ color: '#8080A8' }} />
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#8080A8', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Students ({family.activeStudentCount} active)</span>
                </div>
                {(family.students?.length ?? 0) > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {family.students?.map((s) => {
                      const isActive = s.status === 'active'
                      return (
                        <div key={s.id} onClick={() => onNavigateStudent(s.id)} style={{
                          padding: '10px 14px', borderRadius: 10, cursor: 'pointer',
                          background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)',
                          display: 'flex', alignItems: 'center', gap: 12, opacity: isActive ? 1 : 0.5,
                        }}>
                          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 1 }}>
                            <span style={{ fontSize: 13, fontWeight: 700, color: '#E0E0F4' }}>{s.first_name} {s.last_name}</span>
                            {s.student_display_id && (
                              <span style={{ fontSize: 10, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace', color: '#606088', fontWeight: 600 }}>{s.student_display_id}</span>
                            )}
                          </div>
                          <span style={{ fontSize: 11, color: '#A0A0C8', padding: '2px 8px', borderRadius: 6, background: 'rgba(255,255,255,0.04)' }}>{instrumentWithEmojiTitle(s.instrument)}</span>
                          <span style={{ fontSize: 11, color: '#A0A0C8' }}>{s.teacher_name}</span>
                          <span style={{ fontSize: 10, color: '#A0A0C8' }}>{s.sessions_per_month ?? DEFAULT_SESSIONS_PER_MONTH} sessions</span>
                          {canEdit && isActive && (
                            <button
                              title="Remove from family"
                              onClick={(e) => { e.stopPropagation(); setRemoveStudentConfirm({ id: s.id, name: `${s.first_name} ${s.last_name}` }) }}
                              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: '#606088', display: 'flex', alignItems: 'center' }}
                              onMouseEnter={(e) => (e.currentTarget.style.color = '#EF4444')}
                              onMouseLeave={(e) => (e.currentTarget.style.color = '#606088')}
                            >
                              <UserMinus size={14} />
                            </button>
                          )}
                          <ChevronRight size={12} style={{ color: '#363656' }} />
                        </div>
                      )
                    })}
                  </div>
                ) : <div style={{ fontSize: 13, color: '#606088', padding: '12px 0' }}>No students linked to this account.</div>}

                {/* Paused / Inactive students */}
                {(() => {
                  const pausedStudents = family.students.filter((s) => s.status === 'paused' || s.status === 'inactive')
                  if (pausedStudents.length === 0) return null
                  return (
                    <div style={{ marginTop: 12 }}>
                      <button onClick={() => setShowPausedStudents(!showPausedStudents)} style={{
                        background: 'none', border: 'none', cursor: 'pointer', color: '#8080A8',
                        fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6, padding: '4px 0',
                      }}>
                        <ChevronDown size={12} style={{ transform: showPausedStudents ? 'rotate(0deg)' : 'rotate(-90deg)', transition: 'transform 200ms' }} />
                        Paused / Inactive ({pausedStudents.length})
                      </button>
                      {showPausedStudents && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 6 }}>
                          {pausedStudents.map((s) => {
                            const pausedAgo = (s as any).deactivated_at
                              ? Math.round((Date.now() - new Date((s as any).deactivated_at).getTime()) / (30 * 24 * 60 * 60 * 1000))
                              : null
                            return (
                              <div key={s.id} style={{
                                padding: '10px 14px', borderRadius: 10, background: 'rgba(255,255,255,0.02)',
                                border: '1px solid rgba(255,255,255,0.04)', display: 'flex', alignItems: 'center', gap: 12, opacity: 0.7,
                              }}>
                                <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 1 }}>
                                  <span style={{ fontSize: 13, fontWeight: 700, color: '#A0A0C8' }}>{s.first_name} {s.last_name}</span>
                                  {s.student_display_id && (
                                    <span style={{ fontSize: 10, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace', color: '#606088', fontWeight: 600 }}>{s.student_display_id}</span>
                                  )}
                                </div>
                                <span style={{ fontSize: 11, color: '#8080A8' }}>{instrumentWithEmojiTitle(s.instrument)}</span>
                                {pausedAgo != null && <span style={{ fontSize: 10, color: '#606088' }}>{pausedAgo}mo ago</span>}
                                {(s as any).pause_reason && <span style={{ fontSize: 10, color: '#606088' }}>{(s as any).pause_reason}</span>}
                                {canEdit && (
                                  <button onClick={(e) => {
                                    e.stopPropagation()
                                    reactivateStudent.mutateAsync({ studentId: s.id, familyId: family.id, tenantId: family.tenant_id })
                                      .then(() => toast('Student reactivated', 'success'))
                                      .catch((err: any) => toast(err.message ?? 'Failed', 'error'))
                                  }} style={{
                                    fontSize: 10, fontWeight: 700, color: '#22C55E', background: 'rgba(34,197,94,0.08)',
                                    border: '1px solid rgba(34,197,94,0.2)', borderRadius: 6, padding: '3px 10px', cursor: 'pointer',
                                  }}>Reactivate</button>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )
                })()}
              </div>

              {/* ACTIVITY — collapsed */}
              {canEdit && (
                <CollapsedSection title="Recent Activity" count={activityLog?.length ?? 0} open={activityOpen} onToggle={() => setActivityOpen(!activityOpen)}>
                  {activityLog && activityLog.length > 0 ? (
                    <>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        {activityLog.slice(0, 5).map((ev) => <ActivityRow key={ev.id} event={ev} />)}
                      </div>
                      <button onClick={() => setShowFullActivityLog(true)} style={{
                        background: 'none', border: 'none', color: '#6366F1', fontSize: 11, fontWeight: 600,
                        cursor: 'pointer', padding: '8px 0', textAlign: 'center', width: '100%',
                      }}>View Full Audit Log</button>
                    </>
                  ) : <div style={{ fontSize: 12, color: '#606088', padding: '8px 0' }}>No activity yet.</div>}
                </CollapsedSection>
              )}

              {/* INVOICES — collapsed */}
              {canEdit && (
                <FamilyInvoiceSection familyId={familyId} family={family} invoices={familyInvoices} open={invoicesOpen} onToggle={() => setInvoicesOpen(!invoicesOpen)} />
              )}

              {/* NOTIFICATIONS */}
              <NotificationPrefs family={family} />

              {/* DELETE FAMILY — owner only */}
              {role === 'owner' && (
                <div style={{ borderTop: '1px solid rgba(239,68,68,0.15)', marginTop: 28, paddingTop: 20 }}>
                  <button
                    onClick={() => setDeleteFamilyConfirm(true)}
                    disabled={deleteFamilyMut.isPending}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)',
                      borderRadius: 10, padding: '10px 18px', cursor: 'pointer',
                      color: '#EF4444', fontSize: 13, fontWeight: 700, width: '100%', justifyContent: 'center',
                    }}
                  >
                    <Trash2 size={14} />
                    {deleteFamilyMut.isPending ? 'Deleting…' : 'Delete Family'}
                  </button>
                  <p style={{ fontSize: 11, color: '#606088', marginTop: 8, textAlign: 'center' }}>
                    Students will be unlinked, not deleted. Billing history will be removed.
                  </p>
                </div>
              )}

            </div>
          )}

          {/* ── TAB 2: DIRECTOR ── */}
          {tab === 'director' && (
            <div style={{ padding: '20px 28px 24px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
                {/* LEFT — Billing + Sessions (locked) */}
                <div>
                  <div style={sectionLabelStyle}>Billing</div>
                  <div style={{ marginBottom: 8 }}>
                    <span style={labelStyle}>Rate</span>
                    <div style={{ marginTop: 4 }}>
                      <span style={{
                        fontSize: 13, fontWeight: 700, padding: '4px 12px', borderRadius: 8,
                        background: rateColor.bg, border: `1px solid ${rateColor.border}`, color: rateColor.text,
                        display: 'inline-flex', alignItems: 'center', gap: 4,
                      }}>
                        ${formatRate(family.rate_tier)}/mo
                        {family.rate_tier_override && <Lock size={11} />}
                      </span>
                    </div>
                  </div>
                  {fld('Billing Day', family.billing_day ? `${family.billing_day}${family.billing_day === 1 ? 'st' : 'th'}` : '---')}
                  {fld('Card on File', family.card_last_four ? (
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><CreditCard size={13} /> {family.card_brand ?? 'Card'} ····{family.card_last_four}</span>
                  ) : <span style={{ color: '#EF4444' }}>No Card</span>)}
                  <div style={{ marginBottom: 8 }}>
                    <span style={labelStyle}>Balance</span>
                    <div style={{ marginTop: 3, fontSize: 16, fontWeight: 800, color: (family.balance ?? 0) > 0 ? '#22C55E' : (family.balance ?? 0) < 0 ? '#EF4444' : '#A0A0C8' }}>
                      {formatDollars(family.balance)}
                    </div>
                  </div>
                  {fld('Lifetime Paid', <span style={{ fontWeight: 700, color: '#A0A0C8' }}>{formatDollars(family.lifetime_paid_cents)}</span>)}
                  {(family.overdue_balance_cents ?? 0) > 0 && fld('Overdue', <span style={{ fontWeight: 700, color: '#EF4444' }}>{formatDollars(family.overdue_balance_cents)}</span>)}

                  <div style={{ ...sectionLabelStyle, marginTop: 20 }}>Sessions</div>
                  {fld('Instruments', (family.instrumentList?.length ?? 0) > 0 ? family.instrumentList?.map((i: string) => instrumentWithEmojiTitle(i)).join(', ') : '—')}
                  {fld('Session Days', family.sessionDays?.length ? family.sessionDays?.join(', ') : '—')}
                  {fld('Sessions / Month', String(family.totalSessionsPerMonth ?? 0))}
                </div>

                {/* RIGHT — Notes (editable) + family documents */}
                <div>
                  <div style={sectionLabelStyle}>Notes</div>
                  {txt('billing_notes', 'Billing Notes', 'Billing-related notes...')}
                  {txt('scheduling_notes', 'Scheduling Notes', 'e.g. No Mondays after 6pm, prefers same teacher for siblings...')}

                  <div style={{ marginTop: 20 }}>
                    <div style={sectionLabelStyle}>Documents</div>
                    <FamilyDocumentsSection
                      familyId={family.id}
                      canUpload={canUpload}
                      onUploadClick={() => { setUploadType('enrollment_agreement'); setShowUploadModal(true) }}
                      onDeleteRequest={setDeleteConfirm}
                    />
                  </div>
                </div>
              </div>

              {/* STATUS ACTIONS */}
              {canEdit && (
                <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', marginTop: 20, paddingTop: 16, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {status !== 'active' && <button className="btn-outline" onClick={() => handleStatusChange('active')} style={{ fontSize: 12, color: '#22C55E', borderColor: 'rgba(34,197,94,0.3)' }}>Set Active</button>}
                  {status !== 'paused' && <button className="btn-outline" onClick={() => handleStatusChange('paused')} style={{ fontSize: 12, color: '#FFB800', borderColor: 'rgba(255,184,0,0.3)' }}>Pause</button>}
                  {status !== 'suspended' && <button className="btn-outline" onClick={() => handleStatusChange('suspended')} style={{ fontSize: 12, color: '#FF7800', borderColor: 'rgba(255,120,0,0.3)' }}>Suspend</button>}
                  {status !== 'cancelled' && <button className="btn-outline" onClick={() => handleStatusChange('cancelled')} style={{ fontSize: 12, color: '#EF4444', borderColor: 'rgba(239,68,68,0.3)' }}>Cancel</button>}
                </div>
              )}
            </div>
          )}

          {/* ── TAB 3: MESSAGES ── */}
          {tab === 'messages' && (
            <div style={{ padding: '20px 28px 24px' }}>
              <FamilyMessagesTab familyId={family.id} locationId={family.primary_location_id ?? null} familyPhone={family.primary_phone ?? null} />
            </div>
          )}
          </div>{/* end scroll wrapper */}
        </>)}
      </div>

      {/* Upload Modal */}
      {showUploadModal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 10001, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setShowUploadModal(false)}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: '#1A1830', borderRadius: 16, padding: 24, width: 400, border: '1px solid rgba(255,255,255,0.1)' }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: '#E0E0F4', marginBottom: 16 }}>Upload Document</h3>
            <div style={{ marginBottom: 12 }}>
              <span style={labelStyle}>Document Type</span>
              <select value={uploadType} onChange={(e) => setUploadType(e.target.value)} className="filter-select" style={{ width: '100%', marginTop: 4 }}>
                <option value="enrollment_agreement">Enrollment Agreement</option>
                <option value="contract">Contract</option>
                <option value="id">ID</option>
                <option value="insurance">Insurance</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div style={{ marginBottom: 12 }}>
              <span style={labelStyle}>Notes (optional)</span>
              <input value={uploadNotes} onChange={(e) => setUploadNotes(e.target.value)} className="filter-select" style={{ width: '100%', marginTop: 4 }} placeholder="Optional notes..." />
            </div>
            <input ref={fileInputRef} type="file" accept=".pdf,application/pdf" style={{ display: 'none' }} onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUpload(f) }} />
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn-ghost" onClick={() => setShowUploadModal(false)}>Cancel</button>
              <button className="btn-primary" onClick={() => fileInputRef.current?.click()} disabled={uploadFile.isPending}>{uploadFile.isPending ? 'Uploading...' : 'Choose File'}</button>
            </div>
          </div>
        </div>
      )}

      {confirmAction && (
        <ConfirmModal
          title={`${confirmAction.status === 'suspended' ? 'Suspend' : 'Cancel'} Family Billing?`}
          message={confirmAction.status === 'suspended' ? 'This will suspend billing. Sessions will not be charged until reactivated.' : 'This will cancel billing. Typically used when a family is leaving permanently.'}
          variant={confirmAction.status === 'cancelled' ? 'danger' : 'warning'}
          confirmLabel={confirmAction.status === 'suspended' ? 'Suspend' : 'Cancel Billing'}
          onConfirm={() => doStatusChange(confirmAction.status)} onCancel={() => setConfirmAction(null)}
        />
      )}
      {deleteConfirm && (
        <ConfirmModal title="Delete File?" message={`Delete "${deleteConfirm.file_name}"? This cannot be undone.`} variant="danger" confirmLabel="Delete"
          onConfirm={() => handleDeleteFile(deleteConfirm)} onCancel={() => setDeleteConfirm(null)} />
      )}

      {removeStudentConfirm && (
        <ConfirmModal
          title="Remove Student from Family?"
          message={`Remove "${removeStudentConfirm.name}" from this family? The student will become unlinked and family rates will be recalculated.`}
          variant="warning"
          confirmLabel="Remove"
          onConfirm={() => {
            removeFromFamily.mutate(
              { studentId: removeStudentConfirm.id, familyId, studentName: removeStudentConfirm.name },
              {
                onSuccess: () => { toast.success(`${removeStudentConfirm.name} removed from family`); setRemoveStudentConfirm(null) },
                onError: (err: any) => { toast.error(err.message ?? 'Failed to remove student'); setRemoveStudentConfirm(null) },
              },
            )
          }}
          onCancel={() => setRemoveStudentConfirm(null)}
        />
      )}

      {deleteFamilyConfirm && family && (
        <ConfirmModal
          title="Delete Family?"
          message={`Permanently delete the "${family.name}" family? All ${family.activeStudentCount ?? 0} student(s) will be unlinked (not deleted). Billing history will be removed.`}
          variant="danger"
          confirmLabel="Delete Family"
          onConfirm={() => {
            deleteFamilyMut.mutate(
              { familyId: family.id, familyName: family.name },
              {
                onSuccess: () => { toast.success(`${family.name} deleted`); setDeleteFamilyConfirm(false); onClose() },
                onError: (err: any) => { toast.error(err.message ?? 'Failed to delete family'); setDeleteFamilyConfirm(false) },
              },
            )
          }}
          onCancel={() => setDeleteFamilyConfirm(false)}
        />
      )}

      {showReviewModal && family && (
        <ReviewRequestModal
          familyId={family.id}
          familyName={family.name}
          parentName={family.parent_name ?? family.primary_contact_name ?? ''}
          locationId={family.primary_location_id ?? family.students?.[0]?.location_id ?? ''}
          students={(family.students ?? []).filter((s: any) => s.status === 'active').map((s: any) => ({
            name: `${s.first_name ?? ''} ${s.last_name ?? ''}`.trim(),
            instrument: s.instrument ?? 'music',
            createdAt: s.created_at ?? new Date().toISOString(),
          }))}
          onClose={() => setShowReviewModal(false)}
        />
      )}

      {showFullActivityLog && family && (
        <FamilyActivityLogModal
          familyId={family.id}
          familyName={family.name}
          onClose={() => setShowFullActivityLog(false)}
        />
      )}
    </div>,
    document.body
  )
}

// ═══════════════════════════════════════
// ACTIVITY LOG ROW
// ═══════════════════════════════════════

const EVENT_ICON: Record<string, { icon: string; color: string }> = {
  session_completed: { icon: '✅', color: '#22C55E' },
  sub_session:       { icon: '✅', color: '#A78BFA' },
  callout:           { icon: '⚠️', color: '#FFB800' },
  fifth_week:        { icon: '📅', color: '#38BDF8' },
  cancelled:         { icon: '❌', color: '#EF4444' },
  billing_status:    { icon: '💳', color: '#A78BFA' },
  payment_failed:    { icon: '💳', color: '#EF4444' },
  rate_changed:      { icon: '💰', color: '#FFB800' },
  notification:      { icon: '🔔', color: '#00BCD4' },
  other:             { icon: '•',  color: '#8080A8' },
}

function CopyText({ value, style }: { value: string | null | undefined; style?: React.CSSProperties }) {
  if (!value) return <span style={style}>---</span>
  return (
    <span
      style={{ ...style, cursor: 'pointer' }}
      title="Click to copy"
      onClick={(e) => {
        e.stopPropagation()
        navigator.clipboard.writeText(value)
        toast('Copied', 'success')
      }}
    >
      {value}
    </span>
  )
}

function ActivityRow({ event }: { event: ActivityEvent }) {
  const cfg = EVENT_ICON[event.type] ?? EVENT_ICON.other
  const dateLabel = event.date ? new Date(event.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—'

  return (
    <div style={{ display: 'flex', gap: 10, padding: '6px 0', alignItems: 'flex-start' }}>
      <span style={{ fontSize: 13, lineHeight: '18px', width: 20, textAlign: 'center', flexShrink: 0 }}>{cfg.icon}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 10, color: '#606088', fontWeight: 600, flexShrink: 0 }}>{dateLabel}</span>
          <span style={{ fontSize: 12, color: '#C0C0E0', fontWeight: 600 }}>{event.description}</span>
        </div>
        {event.detail && (
          <div style={{ fontSize: 11, color: '#8080A8', marginTop: 1 }}>{event.detail}</div>
        )}
      </div>
    </div>
  )
}

// ═══════════════════════════════════════
// CREATE INVOICE FROM FAMILY MODAL
// ═══════════════════════════════════════

function CreateInvoiceFromFamily({ family, onClose }: { family: any; onClose: () => void }) {
  const { user, profile, tenantId } = useAuthContext()
  const TENANT_ID = tenantId!
  const qc = useQueryClient()
  const [creating, setCreating] = useState(false)
  const [isMilitary, setIsMilitary] = useState(family.is_military ?? false)
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

  // Fetch student effective rates + tier flags (exclude pending duplicate candidates from tier math)
  const { data: invoiceStudentBundle } = useQuery({
    queryKey: ['family_inv_students', TENANT_ID, family.id],
    queryFn: async () => {
      const { data: rows, error: rErr } = await supabase.from('student_effective_rate')
        .select('student_id, family_id, first_name, last_name, instrument, sessions_per_month, rate_per_session, monthly_cents, location_id')
        .eq('family_id', family.id)
      if (rErr) throw rErr
      const list = rows ?? []
      const ids = [...new Set(list.map((s: any) => s.student_id).filter(Boolean))]
      let tierMap = new Map<string, boolean | null>()
      if (ids.length) {
        const { data: flags, error: fErr } = await supabase
          .from('students')
          .select('id, counts_toward_family_tier')
          .eq('tenant_id', TENANT_ID)
          .in('id', ids)
        if (fErr) throw fErr
        tierMap = new Map((flags ?? []).map((f: any) => [f.id, f.counts_toward_family_tier]))
      }
      return { rows: list, tierMap }
    },
  })

  // Recalculate rates with military toggle (tier tier uses only students that count toward family tier)
  const students = useMemo(() => {
    if (!invoiceStudentBundle) return []
    const { rows: familyStudents, tierMap } = invoiceStudentBundle
    const eligible = familyStudents.filter((st: any) => tierMap.get(st.student_id) !== false)
    const activeCount = eligible.length
    const totalSessions = eligible.reduce((s: number, st: any) => s + (st.sessions_per_month ?? DEFAULT_SESSIONS_PER_MONTH), 0)
    const rate = calculatePreviewRate(activeCount, totalSessions, isMilitary)
    return familyStudents.map((s: any) => {
      const sessions = s.sessions_per_month ?? DEFAULT_SESSIONS_PER_MONTH
      return { ...s, computed_rate: rate, computed_monthly: rate * sessions }
    })
  }, [invoiceStudentBundle, isMilitary])

  const tierEligibleCountForLabel = useMemo(() => {
    if (!invoiceStudentBundle) return students.length
    return invoiceStudentBundle.rows.filter((st: any) => invoiceStudentBundle.tierMap.get(st.student_id) !== false).length
  }, [invoiceStudentBundle, students.length])

  const totalCents = students.reduce((s: number, st: any) => s + st.computed_monthly, 0)

  const generateInvoice = useGenerateInvoice()

  async function handleCreate() {
    if (students.length === 0) return
    setCreating(true)
    try {
      const result = await generateInvoice.mutateAsync({
        tenantId: TENANT_ID,
        familyId: family.id,
        familyName: family.name,
        parentName: family.parent_name ?? family.parent_first_name ?? '',
        primaryEmail: family.primary_email ?? null,
        primaryPhone: family.primary_phone ?? null,
        cardLastFour: family.card_last_four ?? null,
        isMilitary,
        billingDay: family.billing_day ?? 1,
        primaryLocationId: family.primary_location_id ?? null,
        periodLabel,
        dueDate,
        performedBy: user?.id ?? null,
        performerName: profile ? `${profile.first_name} ${profile.last_name}`.trim() : null,
      })
      toast(`Invoice created for ${formatDollars(result.totalCents)}${result.pdfUrl ? ' — PDF saved' : ''}`, 'success')
      onClose()
    } catch (err: any) {
      toast(err.message ?? 'Failed to create invoice', 'error')
    } finally {
      setCreating(false)
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 10002, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={onClose}>
      <div style={{ width: '100%', maxWidth: 540, background: '#141224', borderRadius: 20, border: '1px solid rgba(34,197,94,0.2)', boxShadow: '0 40px 100px rgba(0,0,0,0.6)' }} onClick={e => e.stopPropagation()}>

        <div style={{ padding: '18px 24px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 800, color: '#E0E0F4' }}>Create Invoice — {stripFamily(family.name)}</div>
            <div style={{ fontSize: 12, color: '#8080A8' }}>
              {family.parent_first_name || family.parent_last_name
                ? `${family.parent_first_name ?? ''} ${family.parent_last_name ?? ''}`.trim()
                : family.parent_name ?? ''}
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#8080A8' }}><X size={20} /></button>
        </div>

        <div style={{ padding: '18px 24px' }}>
          {/* Controls */}
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
          {students.length > 0 ? (
            <div style={{ marginBottom: 16 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 0.7fr 0.8fr 1fr', gap: 8, padding: '6px 0', fontSize: 10, fontWeight: 700, color: '#606088', textTransform: 'uppercase', letterSpacing: '0.06em', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                <span>Student</span><span>Instrument</span><span>Sessions</span><span>Rate</span><span style={{ textAlign: 'right' }}>Monthly</span>
              </div>
              {students.map((s: any) => (
                <div key={s.student_id} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 0.7fr 0.8fr 1fr', gap: 8, padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.03)', fontSize: 12, color: '#C0C0D8' }}>
                  <span style={{ fontWeight: 600, color: '#E0E0F4' }}>{s.first_name} {s.last_name}</span>
                  <span>{instrumentWithEmojiTitle(s.instrument)}</span>
                  <span>{s.sessions_per_month ?? DEFAULT_SESSIONS_PER_MONTH}</span>
                  <span>${(s.computed_rate / 100).toFixed(2)}</span>
                  <span style={{ textAlign: 'right', fontWeight: 700 }}>${(s.computed_monthly / 100).toFixed(2)}</span>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ padding: 20, textAlign: 'center', color: '#606088', fontSize: 13 }}>No active students found.</div>
          )}

          {/* Summary */}
          {students.length > 0 && (
            <div style={{ display: 'flex', gap: 16, marginBottom: 16, padding: '12px 16px', background: 'rgba(34,197,94,0.06)', borderRadius: 12, border: '1px solid rgba(34,197,94,0.15)', alignItems: 'center' }}>
              <div><div style={{ fontSize: 20, fontWeight: 800, color: '#22C55E' }}>{formatDollars(totalCents)}</div><div style={{ fontSize: 10, color: '#8080A8' }}>Total</div></div>
              <div style={{ width: 1, height: 32, background: 'rgba(255,255,255,0.06)' }} />
              <div style={{ fontSize: 11, color: '#A0A0C8' }}>
                {students.length} student{students.length !== 1 ? 's' : ''} &middot; ${(students[0]?.computed_rate / 100).toFixed(2)}/session
                {isMilitary && <span style={{ color: '#FFB800', fontWeight: 700 }}> &middot; Military rate</span>}
                {!isMilitary && tierEligibleCountForLabel >= 2 && <span style={{ color: '#FFB800', fontWeight: 700 }}> &middot; Multi-student rate</span>}
              </div>
            </div>
          )}

          <button onClick={handleCreate} disabled={creating || students.length === 0} style={{
            width: '100%', padding: '13px 0', borderRadius: 12, border: 'none',
            background: creating || students.length === 0 ? '#606088' : '#22C55E',
            color: '#fff', fontSize: 14, fontWeight: 700, cursor: creating ? 'default' : 'pointer',
            boxShadow: creating ? 'none' : '0 4px 20px rgba(34,197,94,0.3)',
          }}>
            {creating ? 'Creating...' : `Create Invoice — ${formatDollars(totalCents)}`}
          </button>
        </div>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════
// NOTIFICATION PREFERENCES
// ═══════════════════════════════════════

function NotificationPrefs({ family }: { family: any }) {
  const qc = useQueryClient()
  const [sms, setSms] = useState(family.notify_via_sms ?? true)
  const [email, setEmail] = useState(family.notify_via_email ?? true)
  const [rem4hr, setRem4hr] = useState(family.reminder_4hr ?? true)
  const [rem1hr, setRem1hr] = useState(family.reminder_1hr ?? false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const dirty = sms !== (family.notify_via_sms ?? true) ||
    email !== (family.notify_via_email ?? true) ||
    rem4hr !== (family.reminder_4hr ?? true) ||
    rem1hr !== (family.reminder_1hr ?? false)

  const handleToggle = (field: 'sms' | 'email', val: boolean) => {
    setError('')
    if (field === 'sms') {
      if (!val && !email) { setError('At least one notification method is required.'); return }
      setSms(val)
    } else {
      if (!val && !sms) { setError('At least one notification method is required.'); return }
      setEmail(val)
    }
  }

  const handleSave = async () => {
    setSaving(true)
    setError('')
    try {
      const { error: err } = await supabase.from('families').update({
        notify_via_sms: sms,
        notify_via_email: email,
        reminder_4hr: rem4hr,
        reminder_1hr: rem1hr,
      }).eq('id', family.id)
      if (err) throw err
      qc.invalidateQueries({ queryKey: qk.families.fileDetail })
      qc.invalidateQueries({ queryKey: qk.families.all })
      toast('Notification preferences saved', 'success')
    } catch (e: any) {
      setError(e.message ?? 'Failed to save')
    } finally { setSaving(false) }
  }

  const toggleStyle = (on: boolean): React.CSSProperties => ({
    width: 40, height: 22, borderRadius: 11, cursor: 'pointer',
    background: on ? '#22C55E' : '#333',
    position: 'relative', transition: 'background 200ms',
    flexShrink: 0, border: 'none',
  })
  const thumbStyle = (on: boolean): React.CSSProperties => ({
    position: 'absolute', top: 2, left: on ? 20 : 2,
    width: 18, height: 18, borderRadius: '50%', background: '#fff',
    transition: 'left 200ms', pointerEvents: 'none',
  })

  return (
    <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', marginTop: 16, paddingTop: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
        <Bell size={13} style={{ color: '#8080A8' }} />
        <span style={{ fontSize: 10, fontWeight: 700, color: '#8080A8', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Notifications</span>
      </div>

      <div style={{ fontSize: 10, fontWeight: 700, color: '#606088', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>How We Reach You</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 13, color: '#C0C0E0' }}>Text message</span>
          <button style={toggleStyle(sms)} onClick={() => handleToggle('sms', !sms)}>
            <div style={thumbStyle(sms)} />
          </button>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 13, color: '#C0C0E0' }}>Email</span>
          <button style={toggleStyle(email)} onClick={() => handleToggle('email', !email)}>
            <div style={thumbStyle(email)} />
          </button>
        </div>
      </div>

      <div style={{ fontSize: 10, fontWeight: 700, color: '#606088', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Session Reminders</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 13, color: '#C0C0E0' }}>24 hours before</span>
          <span style={{ fontSize: 10, fontWeight: 700, color: '#22C55E', padding: '2px 10px', borderRadius: 6, background: 'rgba(34,197,94,0.1)' }}>Always on</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 13, color: '#C0C0E0' }}>4 hours before</span>
          <button style={toggleStyle(rem4hr)} onClick={() => setRem4hr(!rem4hr)}>
            <div style={thumbStyle(rem4hr)} />
          </button>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 13, color: '#C0C0E0' }}>1 hour before</span>
          <button style={toggleStyle(rem1hr)} onClick={() => setRem1hr(!rem1hr)}>
            <div style={thumbStyle(rem1hr)} />
          </button>
        </div>
      </div>

      {error && <div style={{ fontSize: 12, color: '#EF4444', marginBottom: 8, padding: '6px 10px', background: 'rgba(239,68,68,0.08)', borderRadius: 8 }}>{error}</div>}

      {dirty && (
        <button
          onClick={handleSave}
          disabled={saving}
          style={{
            width: '100%', padding: '9px 16px', borderRadius: 10,
            background: '#22C55E', border: 'none', cursor: 'pointer',
            color: '#fff', fontWeight: 700, fontSize: 12,
          }}
        >
          {saving ? 'Saving...' : 'Save Notification Preferences'}
        </button>
      )}
    </div>
  )
}

// ═══════════════════════════════════════
// FAMILY MESSAGES TAB (studio_messages)
// ═══════════════════════════════════════

interface StudioMessageRow {
  id: string
  message_text: string
  direction: string
  created_at: string
  sent_by_profile_id: string | null
  read: boolean | null
}

function FamilyMessagesTab({ familyId, locationId, familyPhone }: {
  familyId: string; locationId: string | null; familyPhone: string | null
}) {
  const { user, tenantId } = useAuthContext()
  const qc = useQueryClient()
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const [text, setText] = useState('')

  const { data: location } = useQuery({
    queryKey: qk.communications.adminFamilyLocation(locationId),
    enabled: !!locationId,
    queryFn: async () => {
      const { data } = await supabase.from('locations').select('id, phone, name').eq('id', locationId!).single()
      return data
    },
  })

  const { data: messages, isLoading } = useQuery<StudioMessageRow[]>({
    queryKey: qk.communications.adminFamily(familyId),
    queryFn: async () => {
      const { data } = await supabase
        .from('studio_messages')
        .select('id, message_text, direction, created_at, sent_by_profile_id, read')
        .eq('family_id', familyId)
        .order('created_at', { ascending: true })
        .limit(500)
      return (data ?? []) as StudioMessageRow[]
    },
    refetchInterval: 60_000,
  })

  useEffect(() => {
    if (!messages?.length) return
    const frame = requestAnimationFrame(() => {
      const el = scrollRef.current
      if (el) el.scrollTop = el.scrollHeight
    })
    return () => cancelAnimationFrame(frame)
  }, [messages])

  // Mark unread inbound messages as read — batched IN clauses + cancellation-safe invalidate
  useEffect(() => {
    if (!messages || !user) return
    let cancelled = false
    const unread = messages.filter(m => m.direction === 'inbound' && !m.read)
    if (unread.length === 0) return

    const ids = unread.map(m => m.id)
    const BATCH = 80

    ;(async () => {
      for (let i = 0; i < ids.length; i += BATCH) {
        if (cancelled) return
        const slice = ids.slice(i, i + BATCH)
        const { error } = await supabase.from('studio_messages').update({
          read: true, read_at: new Date().toISOString(), read_by: user.id,
        }).in('id', slice)
        if (error) return
      }
      if (!cancelled) {
        qc.invalidateQueries({ queryKey: qk.communications.adminFamily(familyId) })
      }
    })()

    return () => {
      cancelled = true
    }
  }, [messages, user, familyId, qc])

  const sendMessage = useMutation({
    mutationFn: async (body: string) => {
      if (!tenantId) throw new Error('No tenant')
      const { error } = await supabase.from('studio_messages').insert({
        tenant_id: tenantId,
        family_id: familyId,
        location_id: locationId,
        message_text: body,
        direction: 'outbound',
        sent_via: 'quo',
        quo_queued: true,
        to_phone: familyPhone,
        from_phone: location?.phone ?? null,
        sent_by_profile_id: user?.id ?? null,
      })
      if (error) throw error
    },
    onSuccess: () => {
      setText('')
      qc.invalidateQueries({ queryKey: qk.communications.adminFamily(familyId) })
      toast('Message queued for delivery', 'success')
    },
    onError: (err: any) => toast(err.message ?? 'Failed to send', 'error'),
  })

  const handleSend = () => {
    const body = text.trim()
    if (!body || sendMessage.isPending) return
    sendMessage.mutate(body)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '60vh', minHeight: 400 }}>
      <div style={{ fontSize: 11, color: '#8080A8', marginBottom: 10 }}>
        Two-way SMS with the family{location?.name ? ` via ${location.name}` : ''}. Delivered by QUO.
      </div>

      <div ref={scrollRef} style={{
        flex: 1, overflowY: 'auto', padding: 12, borderRadius: 10,
        background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)',
        display: 'flex', flexDirection: 'column', gap: 8,
      }}>
        {isLoading ? (
          <div style={{ margin: 'auto', color: '#606088', fontSize: 12 }}>Loading...</div>
        ) : !messages || messages.length === 0 ? (
          <div style={{ margin: 'auto', textAlign: 'center', color: '#606088', fontSize: 12, maxWidth: 280 }}>
            <MessageCircle size={24} style={{ color: '#606088', marginBottom: 8 }} />
            <div>No messages yet.</div>
          </div>
        ) : (
          messages.map(m => {
            const isOutbound = m.direction === 'outbound'
            return (
              <div key={m.id} style={{
                alignSelf: isOutbound ? 'flex-end' : 'flex-start',
                maxWidth: '78%', padding: '8px 12px', borderRadius: 12,
                background: isOutbound ? 'rgba(212,34,106,0.15)' : 'rgba(255,255,255,0.04)',
                border: `1px solid ${isOutbound ? 'rgba(212,34,106,0.25)' : 'rgba(255,255,255,0.06)'}`,
              }}>
                <div style={{ fontSize: 13, color: '#E0E0F4', lineHeight: 1.4, whiteSpace: 'pre-wrap' }}>{m.message_text}</div>
                <div style={{ fontSize: 9, color: '#606088', marginTop: 4, textAlign: isOutbound ? 'right' : 'left' }}>
                  {new Date(m.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                </div>
              </div>
            )
          })
        )}
      </div>

      <div style={{ marginTop: 10, display: 'flex', gap: 8, alignItems: 'flex-end' }}>
        <textarea
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); handleSend() } }}
          placeholder="Type a message to the family..."
          rows={2}
          style={{
            flex: 1, padding: '10px 12px', borderRadius: 10, resize: 'none',
            border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.04)',
            color: '#E8E8FC', fontSize: 13, fontFamily: 'inherit', outline: 'none',
          }}
        />
        <button
          onClick={handleSend}
          disabled={!text.trim() || sendMessage.isPending}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: 44, height: 44, borderRadius: 10, border: 'none',
            cursor: (!text.trim() || sendMessage.isPending) ? 'not-allowed' : 'pointer',
            background: text.trim() ? '#D4226A' : 'rgba(255,255,255,0.06)',
            color: text.trim() ? '#fff' : '#606088', flexShrink: 0,
            opacity: sendMessage.isPending ? 0.5 : 1,
          }}
        >
          <Send size={16} />
        </button>
      </div>
    </div>
  )
}
