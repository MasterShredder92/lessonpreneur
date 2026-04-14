import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { useUrlFilters } from '../../hooks/useUrlFilters'
import { useAuthContext } from '../../app/AuthContext'
import { useUserLocations } from '../../hooks/useUserLocations'
import {
  useValueCardQueue, useGenerateValueCard, useSendValueCard,
  useReviewQueue, useRetentionMetrics,
  useAtRiskStudents, useDismissAtRisk,
  useFormerStudents, useLostLeads, useWinBackMetrics,
} from '../../hooks/useRetentionData'
import { toast } from '../../components/shared/Toast'
import {
  Shield, Star, AlertTriangle, Send, X, Heart, Sparkles,
  ArrowRight, TrendingUp, Check, Loader2, Activity, RefreshCw, Zap,
} from 'lucide-react'
import { getInstrumentEmoji, instrumentWithEmojiTitle } from '../../utils/instrumentEmoji'
import { IssueContextProvider } from '../../contexts/IssueContext'
import ReportIssueButton from '../../components/shared/ReportIssueButton'
import { RetentionGuide } from '../../components/admin/RetentionGuide'
import ReviewRequestModal from '../../components/admin/ReviewRequestModal'
import { supabase } from '../../lib/supabase'

const LOC_COLORS: Record<string, string> = {
  Omaha: '#D41113', Bellevue: '#A333FF', Elkhorn: '#00A5E8', Gretna: '#00A651',
}

type TabKey = 'active' | 'at-risk' | 'win-back' | 'campaigns'
const TABS: { key: TabKey; label: string; icon: React.ReactNode; desc: string }[] = [
  { key: 'active', label: 'Active Retention', icon: <Activity size={15} />, desc: 'Progress updates & review requests for enrolled students' },
  { key: 'at-risk', label: 'At-Risk', icon: <AlertTriangle size={15} />, desc: 'Students likely to drop in the next 30–60 days' },
  { key: 'win-back', label: 'Win-Back', icon: <RefreshCw size={15} />, desc: 'Former students and lost leads to re-engage' },
  { key: 'campaigns', label: 'Campaigns', icon: <Zap size={15} />, desc: 'Seasonal outreach campaign templates' },
]

// ── Location badge ──
function LocBadge({ name }: { name: string }) {
  const color = LOC_COLORS[name] ?? '#8080A8'
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20,
      lineHeight: '16px', background: `${color}14`, color,
      border: `1px solid ${color}28`, whiteSpace: 'nowrap', letterSpacing: '0.02em',
    }}>
      {name}
    </span>
  )
}

// ── Premium metric card ──
function MetricCard({ label, value, color = '#E0E0F4', sub }: { label: string; value: string | number; color?: string; sub?: string }) {
  return (
    <div style={{
      flex: 1, minWidth: 130, padding: '16px 18px', borderRadius: 14,
      background: 'rgba(255,255,255,0.025)',
      border: '1px solid rgba(255,255,255,0.06)',
      position: 'relative', overflow: 'hidden',
    }}>
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: 2,
        background: `linear-gradient(90deg, ${color}55, transparent)`,
      }} />
      <div style={{ fontSize: 10, fontWeight: 700, color: '#5858A0', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 900, color, lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: 10, color: '#5050A0', marginTop: 4 }}>{sub}</div>}
    </div>
  )
}

// ── Circle selector (replaces checkbox) ──
function SelectRing({ selected, indeterminate, onToggle }: { selected: boolean; indeterminate?: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={e => { e.stopPropagation(); onToggle() }}
      style={{
        width: 22, height: 22, borderRadius: '50%', flexShrink: 0, cursor: 'pointer',
        border: selected || indeterminate ? '2px solid #D4226A' : '2px solid rgba(255,255,255,0.14)',
        background: selected ? '#D4226A' : indeterminate ? 'rgba(212,34,106,0.28)' : 'transparent',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        transition: 'all 150ms ease', padding: 0,
      }}
    >
      {selected && <Check size={11} color="#fff" />}
      {indeterminate && !selected && <div style={{ width: 8, height: 2, background: '#D4226A', borderRadius: 1 }} />}
    </button>
  )
}

// ── Portal modal ──
function PortalModal({ open, onClose, children, maxWidth = 520 }: { open: boolean; onClose: () => void; children: React.ReactNode; maxWidth?: number }) {
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose])

  if (!open) return null

  return createPortal(
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(0,0,0,0.82)', backdropFilter: 'blur(4px)',
        animation: 'fadeIn 180ms ease',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'linear-gradient(150deg, rgba(22,20,42,0.99), rgba(14,12,28,0.99))',
          border: '1px solid rgba(255,255,255,0.10)',
          borderRadius: 24,
          boxShadow: '0 32px 80px rgba(0,0,0,0.85), 0 0 0 1px rgba(212,34,106,0.05)',
          width: '100%', maxWidth, maxHeight: '90vh', overflowY: 'auto',
          animation: 'slideUp 240ms cubic-bezier(0.4,0,0.2,1)',
          position: 'relative',
        }}
      >
        {children}
      </div>
    </div>,
    document.body
  )
}

// ── Filter pill ──
function FilterPill({ label, active, onClick, color = '#D4226A' }: { label: string; active: boolean; onClick: () => void; color?: string }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '5px 12px', borderRadius: 20, fontSize: 11, fontWeight: 600, cursor: 'pointer',
        background: active ? `${color}16` : 'transparent',
        border: `1px solid ${active ? `${color}38` : 'rgba(255,255,255,0.07)'}`,
        color: active ? color : '#5858A0',
        transition: 'all 150ms ease', whiteSpace: 'nowrap',
      }}
    >
      {label}
    </button>
  )
}

// ── Section divider header ──
function SectionHeader({ title, count, action }: { title: string; count?: number; action?: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
      <div style={{ fontSize: 11, fontWeight: 800, color: '#8080A8', textTransform: 'uppercase', letterSpacing: '0.08em', whiteSpace: 'nowrap' }}>{title}</div>
      {count !== undefined && (
        <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 10, background: 'rgba(255,255,255,0.05)', color: '#5858A0' }}>{count}</span>
      )}
      <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.05)' }} />
      {action}
    </div>
  )
}

// ══════════════════════════════
//  OVERVIEW PANEL
// ══════════════════════════════
function RetentionOverview({ locationIds, onEnter }: { locationIds?: string[] | null; onEnter: () => void }) {
  const { data: metrics } = useRetentionMetrics(locationIds)
  const { data: atRisk } = useAtRiskStudents(locationIds)

  return (
    <div style={{ maxWidth: 820, margin: '0 auto' }}>
      {/* Hero card */}
      <div style={{
        padding: '44px 40px', borderRadius: 24,
        background: 'linear-gradient(135deg, rgba(212,34,106,0.055) 0%, rgba(163,51,255,0.04) 50%, rgba(56,189,248,0.03) 100%)',
        border: '1px solid rgba(255,255,255,0.07)',
        marginBottom: 20, position: 'relative', overflow: 'hidden',
      }}>
        <div style={{
          position: 'absolute', top: -80, right: -80, width: 280, height: 280, borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(212,34,106,0.07) 0%, transparent 70%)',
          pointerEvents: 'none',
        }} />

        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 20, marginBottom: 32, flexWrap: 'wrap' }}>
          <div style={{
            width: 52, height: 52, borderRadius: 16, flexShrink: 0,
            background: 'linear-gradient(135deg, rgba(212,34,106,0.18), rgba(163,51,255,0.12))',
            border: '1px solid rgba(212,34,106,0.22)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Shield size={24} color="#D4226A" />
          </div>
          <div style={{ flex: 1, minWidth: 200 }}>
            <h2 style={{ fontSize: 28, fontWeight: 900, color: '#E8E8F4', margin: 0, letterSpacing: '-0.02em' }}>
              Retention Center
            </h2>
            <p style={{ fontSize: 14, color: '#5858A0', margin: '8px 0 0', lineHeight: 1.65 }}>
              Your workspace for identifying students who need follow-up, lesson updates,
              scheduling attention, re-engagement, or general retention review.
            </p>
          </div>
        </div>

        {/* Metrics preview */}
        {metrics ? (
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 32 }}>
            <MetricCard label="Active Students" value={metrics.activeStudents} color="#22C55E" />
            <MetricCard label="At-Risk" value={atRisk?.length ?? 0} color="#EF4444" />
            <MetricCard label="Avg Months Enrolled" value={metrics.avgMonthsEnrolled} color="#FFB800" sub="per student" />
            <MetricCard label="Cards This Month" value={metrics.valueCardsSentThisMonth} color="#38BDF8" />
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 10, marginBottom: 32 }}>
            {[0,1,2,3].map(i => (
              <div key={i} style={{ flex: 1, height: 78, borderRadius: 14, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)' }} />
            ))}
          </div>
        )}

        <button
          onClick={onEnter}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 10,
            padding: '14px 28px', borderRadius: 14,
            background: 'linear-gradient(135deg, #D4226A, #A333FF)',
            border: 'none', color: '#fff', fontWeight: 800, fontSize: 15,
            cursor: 'pointer', letterSpacing: '-0.01em',
            boxShadow: '0 8px 28px rgba(212,34,106,0.28)',
          }}
        >
          Enter Retention Queue
          <ArrowRight size={18} />
        </button>
      </div>

      {/* Section explainers */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 10 }}>
        {TABS.map(tab => (
          <div key={tab.key} style={{
            padding: '18px 20px', borderRadius: 16,
            background: 'rgba(255,255,255,0.018)',
            border: '1px solid rgba(255,255,255,0.055)',
          }}>
            <div style={{ marginBottom: 10, color: '#7070A0' }}>{tab.icon}</div>
            <div style={{ fontSize: 13, fontWeight: 800, color: '#C8C8E8', marginBottom: 5, letterSpacing: '-0.01em' }}>{tab.label}</div>
            <div style={{ fontSize: 11, color: '#4848A0', lineHeight: 1.6 }}>{tab.desc}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ══════════════════════════════
//  MAIN PAGE
// ══════════════════════════════
export default function Retention() {
  const { getParam, setParam } = useUrlFilters()
  const activeTab = (getParam('tab') || 'active') as TabKey
  const setActiveTab = (v: TabKey) => setParam('tab', v === 'active' ? '' : v)
  const { data: userLocations } = useUserLocations()
  const { role } = useAuthContext()
  const [guideOpen, setGuideOpen] = useState(false)
  const [entered, setEntered] = useState(false)
  const isStudioDirector = role === 'studio_director'

  return (
    <IssueContextProvider page="Backstage — Retention">
      <div className="page">
        <div className="page-header" data-guide-id="retention-header">
          <h1 style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Shield size={20} /> Retention
          </h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {entered && (
              <button
                onClick={() => setEntered(false)}
                style={{
                  padding: '6px 12px', borderRadius: 8, background: 'transparent',
                  border: '1px solid rgba(255,255,255,0.08)',
                  color: '#5858A0', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                  minHeight: 36, whiteSpace: 'nowrap',
                }}
              >
                ← Overview
              </button>
            )}
            {isStudioDirector && (
              <button
                onClick={() => setGuideOpen(true)}
                style={{
                  padding: '6px 12px', borderRadius: 8,
                  background: 'rgba(255,184,0,0.07)',
                  border: '1px solid rgba(255,184,0,0.18)',
                  color: '#FFB800', fontSize: 12, fontWeight: 700, cursor: 'pointer',
                  minHeight: 36, whiteSpace: 'nowrap',
                }}
              >
                📖 Guide
              </button>
            )}
            <ReportIssueButton />
          </div>
        </div>

        {!entered ? (
          <RetentionOverview locationIds={userLocations} onEnter={() => setEntered(true)} />
        ) : (
          <>
            {/* Tab bar */}
            <div style={{
              display: 'flex', gap: 2, padding: 4,
              background: 'rgba(255,255,255,0.022)',
              border: '1px solid rgba(255,255,255,0.05)',
              borderRadius: 16, marginBottom: 28,
              overflowX: 'auto', WebkitOverflowScrolling: 'touch',
            }}>
              {TABS.map(tab => {
                const isActive = activeTab === tab.key
                return (
                  <button
                    key={tab.key}
                    onClick={() => setActiveTab(tab.key)}
                    data-guide-id={`tab-${tab.key}`}
                    style={{
                      flex: 1, minWidth: 130, padding: '10px 16px', borderRadius: 12,
                      border: 'none',
                      background: isActive
                        ? 'linear-gradient(135deg, rgba(212,34,106,0.11), rgba(163,51,255,0.07))'
                        : 'transparent',
                      color: isActive ? '#E0E0F4' : '#5050A0',
                      fontWeight: isActive ? 800 : 500, fontSize: 13, cursor: 'pointer',
                      transition: 'all 150ms',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
                      whiteSpace: 'nowrap', position: 'relative',
                    }}
                  >
                    <span style={{ opacity: isActive ? 1 : 0.55 }}>{tab.icon}</span>
                    {tab.label}
                    {isActive && (
                      <div style={{
                        position: 'absolute', bottom: 2, left: '25%', right: '25%',
                        height: 2, borderRadius: 1,
                        background: 'linear-gradient(90deg, #D4226A, #A333FF)',
                      }} />
                    )}
                  </button>
                )
              })}
            </div>

            {activeTab === 'active'    && <ActiveRetentionTab locationIds={userLocations} />}
            {activeTab === 'at-risk'   && <AtRiskTab locationIds={userLocations} />}
            {activeTab === 'win-back'  && <WinBackTab locationIds={userLocations} />}
            {activeTab === 'campaigns' && <CampaignsTab locationIds={userLocations} />}
          </>
        )}

        {isStudioDirector && (
          <RetentionGuide
            open={guideOpen}
            onClose={() => setGuideOpen(false)}
            activeTab={activeTab}
            setActiveTab={setActiveTab}
          />
        )}
      </div>
    </IssueContextProvider>
  )
}

// ══════════════════════════════
//  TAB 1: ACTIVE RETENTION
// ══════════════════════════════
function ActiveRetentionTab({ locationIds }: { locationIds?: string[] | null }) {
  const { data: metrics } = useRetentionMetrics(locationIds)
  const { data: valueQueue } = useValueCardQueue(locationIds)
  const generateCard = useGenerateValueCard()
  const sendCard = useSendValueCard()
  const { data: reviewQueue } = useReviewQueue(locationIds)
  const [generatingFor, setGeneratingFor] = useState<string | null>(null)
  const [reviewModalData, setReviewModalData] = useState<{
    familyId: string; familyName: string; parentName: string; locationId: string
    students: { name: string; instrument: string; createdAt: string }[]
  } | null>(null)
  const [loadingReviewFor, setLoadingReviewFor] = useState<string | null>(null)
  const [previewCard, setPreviewCard] = useState<any>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkConfirmOpen, setBulkConfirmOpen] = useState(false)
  const [bulkProgress, setBulkProgress] = useState<{ current: number; total: number; name: string } | null>(null)
  const [bulkResult, setBulkResult] = useState<{ successes: string[]; failures: { name: string; error: string }[] } | null>(null)

  const locKey = JSON.stringify(locationIds)
  useEffect(() => { setSelectedIds(new Set()) }, [locKey])

  const visibleQueue = (valueQueue ?? []).slice(0, 15)
  const allSelected = visibleQueue.length > 0 && visibleQueue.every(s => selectedIds.has(s.id))
  const someSelected = visibleQueue.some(s => selectedIds.has(s.id))

  function toggleSelect(id: string) {
    setSelectedIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  }

  async function handleBulkGenerate() {
    setBulkConfirmOpen(false)
    const selected = visibleQueue.filter(s => selectedIds.has(s.id))
    const successes: string[] = []
    const failures: { name: string; error: string }[] = []
    for (let i = 0; i < selected.length; i++) {
      const s = selected[i]
      setBulkProgress({ current: i + 1, total: selected.length, name: s.name })
      try {
        const card = await generateCard.mutateAsync(s.id)
        await sendCard.mutateAsync(card.id)
        successes.push(s.name)
      } catch (err: any) {
        failures.push({ name: s.name, error: err?.message ?? 'Unknown error' })
      }
    }
    setBulkProgress(null)
    setBulkResult({ successes, failures })
    setSelectedIds(new Set())
  }

  return (
    <div>
      {/* Metrics */}
      {metrics && (
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 28 }}>
          <MetricCard label="Active Students" value={metrics.activeStudents} color="#22C55E" />
          <MetricCard label="Avg Months" value={metrics.avgMonthsEnrolled} color="#FFB800" sub="enrolled" />
          <MetricCard label="Cards Sent" value={metrics.valueCardsSentThisMonth} color="#38BDF8" sub="this month" />
          <MetricCard label="Review Requests" value={metrics.reviewRequestsSentThisMonth} color="#D4226A" sub="this month" />
          <MetricCard label="Reviews Received" value={metrics.reviewsReceivedThisMonth} color="#A333FF" sub="this month" />
        </div>
      )}

      {/* A) Value Card Queue */}
      <div style={{ marginBottom: 36 }}>
        <SectionHeader
          title="Students Due for a Progress Update"
          count={valueQueue?.length ?? 0}
          action={
            selectedIds.size > 0 ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: '#FFB800' }}>
                  {selectedIds.size} selected
                </span>
                <button
                  onClick={() => setSelectedIds(new Set())}
                  style={{ background: 'none', border: 'none', color: '#5050A0', fontSize: 11, cursor: 'pointer', padding: '4px 6px' }}
                >
                  Clear
                </button>
                <button
                  onClick={() => setBulkConfirmOpen(true)}
                  style={{
                    padding: '5px 14px', borderRadius: 8, border: 'none',
                    background: 'linear-gradient(135deg, #D4226A, #A333FF)',
                    color: '#fff', fontWeight: 700, fontSize: 11, cursor: 'pointer',
                  }}
                >
                  Generate All
                </button>
              </div>
            ) : undefined
          }
        />

        {visibleQueue.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '2px 16px', marginBottom: 8 }}>
            <SelectRing
              selected={allSelected}
              indeterminate={someSelected && !allSelected}
              onToggle={() => allSelected ? setSelectedIds(new Set()) : setSelectedIds(new Set(visibleQueue.map(s => s.id)))}
            />
            <span style={{ fontSize: 11, color: '#5050A0', fontWeight: 600 }}>
              {allSelected ? 'Deselect all' : 'Select all'}
            </span>
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {visibleQueue.map((s, idx) => {
            const isSelected = selectedIds.has(s.id)
            return (
              <div
                key={s.id}
                data-guide-id={idx === 0 ? 'progress-card' : undefined}
                onClick={() => toggleSelect(s.id)}
                style={{
                  padding: '14px 18px', borderRadius: 14, cursor: 'pointer',
                  background: isSelected
                    ? 'linear-gradient(135deg, rgba(212,34,106,0.06), rgba(163,51,255,0.04))'
                    : 'rgba(255,255,255,0.018)',
                  border: `1px solid ${isSelected ? 'rgba(212,34,106,0.24)' : 'rgba(255,255,255,0.055)'}`,
                  display: 'flex', alignItems: 'center', gap: 14,
                  transition: 'all 150ms ease',
                }}
              >
                <SelectRing selected={isSelected} onToggle={() => toggleSelect(s.id)} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 14, fontWeight: 700, color: '#E0E0F4' }}>{s.name}</span>
                    <span style={{ fontSize: 11, color: '#5050A0' }}>{instrumentWithEmojiTitle(s.instrument)}</span>
                    <LocBadge name={s.locationName} />
                  </div>
                  <div style={{ fontSize: 11, color: '#4848A0', marginTop: 3 }}>
                    {s.lastCardDate
                      ? `Last update: ${new Date(s.lastCardDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
                      : 'No progress update sent yet'}
                  </div>
                </div>
                <button
                  data-guide-id={idx === 0 ? 'generate-card-btn' : undefined}
                  disabled={generatingFor === s.id || generateCard.isPending}
                  onClick={async e => {
                    e.stopPropagation()
                    setGeneratingFor(s.id)
                    try {
                      const card = await generateCard.mutateAsync(s.id)
                      setPreviewCard(card)
                    } catch { toast('Failed to generate card', 'error') }
                    setGeneratingFor(null)
                  }}
                  style={{
                    padding: '8px 16px', borderRadius: 10, flexShrink: 0,
                    background: 'rgba(56,189,248,0.07)',
                    border: '1px solid rgba(56,189,248,0.18)',
                    color: '#38BDF8', fontSize: 11, fontWeight: 700, cursor: 'pointer',
                    minHeight: 36, whiteSpace: 'nowrap',
                    display: 'flex', alignItems: 'center', gap: 6, transition: 'all 150ms',
                  }}
                >
                  {generatingFor === s.id
                    ? <><Loader2 size={11} style={{ animation: 'spin 1s linear infinite' }} /> Generating…</>
                    : <><Sparkles size={11} /> Generate Card</>
                  }
                </button>
              </div>
            )
          })}
          {(valueQueue ?? []).length === 0 && (
            <div style={{
              padding: '40px 24px', textAlign: 'center',
              background: 'rgba(255,255,255,0.012)', borderRadius: 16,
              border: '1px dashed rgba(255,255,255,0.06)',
            }}>
              <Check size={20} style={{ color: '#22C55E', margin: '0 auto 8px' }} />
              <div style={{ fontSize: 14, fontWeight: 700, color: '#22C55E', marginBottom: 4 }}>All caught up!</div>
              <div style={{ fontSize: 12, color: '#5050A0' }}>All students have received a recent progress update.</div>
            </div>
          )}
        </div>
      </div>

      {/* B) Google Review Requests */}
      <div style={{ marginBottom: 32 }}>
        <SectionHeader title="Ask for a Google Review" count={reviewQueue?.length ?? 0} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {(reviewQueue ?? []).slice(0, 10).map((f, idx) => (
            <div
              key={f.id}
              style={{
                padding: '14px 18px', borderRadius: 14,
                background: 'rgba(255,255,255,0.018)',
                border: '1px solid rgba(255,255,255,0.055)',
                display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
              }}
            >
              <div style={{ flex: 1, minWidth: 140 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#E0E0F4' }}>{f.name}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                  <span style={{ fontSize: 11, color: '#5050A0' }}>{f.monthsEnrolled} months enrolled</span>
                  <LocBadge name={f.locationName} />
                </div>
              </div>
              <span style={{ fontSize: 11, color: '#404080', whiteSpace: 'nowrap' }}>
                {f.lastRequestDate
                  ? `Last: ${new Date(f.lastRequestDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
                  : 'Never requested'}
              </span>
              <button
                data-guide-id={idx === 0 ? 'review-request-btn' : undefined}
                onClick={async () => {
                  setLoadingReviewFor(f.id)
                  try {
                    const { data: fam } = await supabase.from('families').select('parent_name, primary_contact_name').eq('id', f.id).single()
                    const { data: studs } = await supabase.from('students').select('first_name, last_name, instrument, created_at').eq('family_id', f.id).eq('status', 'active')
                    setReviewModalData({
                      familyId: f.id, familyName: f.name,
                      parentName: fam?.parent_name ?? fam?.primary_contact_name ?? '',
                      locationId: f.locationId,
                      students: (studs ?? []).map((s: any) => ({
                        name: `${s.first_name ?? ''} ${s.last_name ?? ''}`.trim(),
                        instrument: s.instrument ?? 'music',
                        createdAt: s.created_at ?? new Date().toISOString(),
                      })),
                    })
                  } catch { toast('Failed to load family data', 'error') }
                  setLoadingReviewFor(null)
                }}
                disabled={loadingReviewFor === f.id}
                style={{
                  padding: '8px 16px', borderRadius: 10,
                  background: 'rgba(212,34,106,0.07)',
                  border: '1px solid rgba(212,34,106,0.18)',
                  color: '#D4226A', fontSize: 11, fontWeight: 700, cursor: 'pointer',
                  minHeight: 36, whiteSpace: 'nowrap',
                  display: 'flex', alignItems: 'center', gap: 6,
                }}
              >
                <Star size={11} />
                {loadingReviewFor === f.id ? 'Loading…' : 'Request Review'}
              </button>
            </div>
          ))}
          {(reviewQueue ?? []).length === 0 && (
            <div style={{ padding: '40px 24px', textAlign: 'center', color: '#5050A0', fontSize: 13, background: 'rgba(255,255,255,0.012)', borderRadius: 16, border: '1px dashed rgba(255,255,255,0.06)' }}>
              No families eligible right now.
            </div>
          )}
        </div>
      </div>

      {/* Value Card Preview Modal */}
      <PortalModal open={!!previewCard} onClose={() => setPreviewCard(null)} maxWidth={440}>
        {previewCard && (() => {
          const instrEmoji = getInstrumentEmoji(previewCard.instrument ?? '')
          const highlights: string[] = previewCard.teacher_highlights ?? []
          const skills: string[] = previewCard.skills_worked_on ?? []
          const attendRate = previewCard.attendance_rate
          const hasAttendance = attendRate !== null && attendRate !== undefined
          const attendLabel = hasAttendance ? (attendRate >= 90 ? 'Outstanding' : attendRate >= 75 ? 'Strong' : attendRate >= 50 ? 'Building' : 'Needs Love') : 'New'
          const attendEmoji = hasAttendance ? (attendRate >= 90 ? '🔥' : attendRate >= 75 ? '💪' : attendRate >= 50 ? '📈' : '💛') : '🌱'
          const hasPercentile = previewCard.percentile_rank !== null && previewCard.percentile_rank !== undefined
          const topPct = hasPercentile ? 100 - previewCard.percentile_rank : null
          return (
            <>
              <div style={{ padding: '24px 24px 16px', background: 'linear-gradient(135deg, rgba(34,197,94,0.07) 0%, rgba(56,189,248,0.05) 100%)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ fontSize: 36, lineHeight: 1 }}>{instrEmoji}</div>
                  <div>
                    <div style={{ fontSize: 10, fontWeight: 700, color: '#5858A0', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Progress Report</div>
                    <div style={{ fontSize: 16, fontWeight: 800, color: '#E0E0F4', marginTop: 2 }}>{previewCard.instrument || 'Music'} with {previewCard.teacher_name}</div>
                  </div>
                </div>
              </div>
              <div style={{ padding: '20px 24px 24px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 18 }}>
                  <div style={{ padding: '14px 16px', borderRadius: 14, background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.12)', textAlign: 'center' }}>
                    <div style={{ fontSize: 28, fontWeight: 900, color: '#22C55E', lineHeight: 1 }}>{hasAttendance ? `${attendRate}%` : '—'}</div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#22C55E', marginTop: 4 }}>{attendEmoji} {attendLabel}</div>
                    <div style={{ fontSize: 10, color: '#5858A0', marginTop: 2 }}>Attendance Rate</div>
                  </div>
                  {hasPercentile ? (
                    <div style={{ padding: '14px 16px', borderRadius: 14, background: 'rgba(212,34,106,0.06)', border: '1px solid rgba(212,34,106,0.12)', textAlign: 'center' }}>
                      <div style={{ fontSize: 28, fontWeight: 900, color: '#D4226A', lineHeight: 1 }}>Top {topPct}%</div>
                      <div style={{ fontSize: 11, fontWeight: 700, color: '#D4226A', marginTop: 4 }}>{topPct! <= 10 ? '🏆' : topPct! <= 25 ? '⭐' : '🎯'} {topPct! <= 10 ? 'Elite' : topPct! <= 25 ? 'Excellent' : 'Great'}</div>
                      <div style={{ fontSize: 10, color: '#5858A0', marginTop: 2 }}>Student Ranking</div>
                    </div>
                  ) : (
                    <div style={{ padding: '14px 16px', borderRadius: 14, background: 'rgba(255,184,0,0.06)', border: '1px solid rgba(255,184,0,0.12)', textAlign: 'center' }}>
                      <div style={{ fontSize: 28, fontWeight: 900, color: '#FFB800', lineHeight: 1 }}>{previewCard.attended_sessions_period}/{previewCard.total_sessions_period}</div>
                      <div style={{ fontSize: 11, fontWeight: 700, color: '#FFB800', marginTop: 4 }}>🎶 Attended</div>
                      <div style={{ fontSize: 10, color: '#5858A0', marginTop: 2 }}>This Period</div>
                    </div>
                  )}
                  {hasPercentile && (
                    <div style={{ padding: '14px 16px', borderRadius: 14, background: 'rgba(255,184,0,0.06)', border: '1px solid rgba(255,184,0,0.12)', textAlign: 'center' }}>
                      <div style={{ fontSize: 28, fontWeight: 900, color: '#FFB800', lineHeight: 1 }}>{previewCard.attended_sessions_period}</div>
                      <div style={{ fontSize: 11, fontWeight: 700, color: '#FFB800', marginTop: 4 }}>🎶 Sessions</div>
                      <div style={{ fontSize: 10, color: '#5858A0', marginTop: 2 }}>This Period</div>
                    </div>
                  )}
                  <div style={{ padding: '14px 16px', borderRadius: 14, background: 'rgba(56,189,248,0.06)', border: '1px solid rgba(56,189,248,0.12)', textAlign: 'center' }}>
                    <div style={{ fontSize: 28, fontWeight: 900, color: '#38BDF8', lineHeight: 1 }}>{previewCard.months_enrolled}</div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#38BDF8', marginTop: 4 }}>📅 {previewCard.months_enrolled === 1 ? 'Month' : 'Months'}</div>
                    <div style={{ fontSize: 10, color: '#5858A0', marginTop: 2 }}>Enrolled</div>
                  </div>
                </div>
                {skills.length > 0 && (
                  <div style={{ marginBottom: 14 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#8080A8', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <TrendingUp size={12} /> Skills & Focus Areas
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {skills.map((sk, i) => (
                        <span key={i} style={{ fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 10, background: 'rgba(163,51,255,0.07)', border: '1px solid rgba(163,51,255,0.15)', color: '#C084FC' }}>
                          {sk}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {highlights.length > 0 && (
                  <div style={{ marginBottom: 14 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#8080A8', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Heart size={12} /> Teacher Notes
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {highlights.map((h, i) => (
                        <div key={i} style={{ fontSize: 12, color: '#C0C0E0', padding: '6px 10px', borderRadius: 8, background: 'rgba(255,255,255,0.025)', borderLeft: '3px solid rgba(255,184,0,0.32)' }}>
                          {h}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {previewCard.ai_summary && (
                  <div style={{ padding: '12px 14px', borderRadius: 12, background: 'rgba(255,255,255,0.018)', border: '1px solid rgba(255,255,255,0.05)', marginBottom: 18 }}>
                    <div style={{ fontSize: 12, color: '#C0C0E0', lineHeight: 1.8, whiteSpace: 'pre-line' }}>
                      {previewCard.ai_summary}
                    </div>
                  </div>
                )}
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    onClick={async () => {
                      await sendCard.mutateAsync(previewCard.id)
                      toast('Value card sent!', 'success')
                      setPreviewCard(null)
                    }}
                    style={{ flex: 2, padding: '12px 16px', borderRadius: 12, background: '#22C55E', border: 'none', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 44 }}
                  >
                    <Send size={14} /> Send to Family
                  </button>
                  <button
                    onClick={() => setPreviewCard(null)}
                    style={{ flex: 1, padding: '12px 16px', borderRadius: 12, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', color: '#5858A0', fontWeight: 600, fontSize: 13, cursor: 'pointer', minHeight: 44 }}
                  >
                    Discard
                  </button>
                </div>
              </div>
            </>
          )
        })()}
      </PortalModal>

      {/* Bulk Confirm Modal */}
      <PortalModal open={bulkConfirmOpen} onClose={() => setBulkConfirmOpen(false)} maxWidth={480}>
        <div style={{ padding: '24px' }}>
          <div style={{ fontSize: 18, fontWeight: 800, color: '#E0E0F4', marginBottom: 8 }}>
            Generate Cards for {selectedIds.size} Student{selectedIds.size !== 1 ? 's' : ''}
          </div>
          <div style={{ maxHeight: 200, overflowY: 'auto', marginBottom: 16, padding: '8px 0' }}>
            {visibleQueue.filter(s => selectedIds.has(s.id)).map(s => (
              <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                <Check size={12} style={{ color: '#22C55E', flexShrink: 0 }} />
                <span style={{ fontSize: 13, color: '#E0E0F4', fontWeight: 600 }}>{s.name}</span>
                <span style={{ fontSize: 11, color: '#5858A0' }}>{instrumentWithEmojiTitle(s.instrument)}</span>
                <div style={{ flex: 1 }} />
                <LocBadge name={s.locationName} />
              </div>
            ))}
          </div>
          <div style={{ fontSize: 12, color: '#8080A0', lineHeight: 1.5, marginBottom: 20 }}>
            This will generate and send a progress value card to each selected student's family.
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button
              onClick={() => setBulkConfirmOpen(false)}
              style={{ padding: '10px 20px', borderRadius: 10, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', color: '#5858A0', fontWeight: 600, fontSize: 13, cursor: 'pointer', minHeight: 44 }}
            >
              Cancel
            </button>
            <button
              onClick={handleBulkGenerate}
              style={{ padding: '10px 24px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg, #D4226A, #A333FF)', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer', minHeight: 44 }}
            >
              Confirm & Send
            </button>
          </div>
        </div>
      </PortalModal>

      {/* Bulk Progress Modal */}
      <PortalModal open={!!bulkProgress} onClose={() => {}} maxWidth={400}>
        {bulkProgress && (
          <div style={{ padding: '32px 24px', textAlign: 'center' }}>
            <Loader2 size={32} style={{ color: '#D4226A', animation: 'spin 1s linear infinite', marginBottom: 16 }} />
            <div style={{ fontSize: 14, fontWeight: 700, color: '#E0E0F4', marginBottom: 8 }}>
              Sending to {bulkProgress.name}…
            </div>
            <div style={{ fontSize: 12, color: '#5858A0' }}>{bulkProgress.current} of {bulkProgress.total}</div>
            <div style={{ marginTop: 12, height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
              <div style={{ height: '100%', borderRadius: 2, background: 'linear-gradient(90deg, #D4226A, #A333FF)', width: `${(bulkProgress.current / bulkProgress.total) * 100}%`, transition: 'width 300ms ease' }} />
            </div>
          </div>
        )}
      </PortalModal>

      {/* Bulk Result Modal */}
      <PortalModal open={!!bulkResult} onClose={() => setBulkResult(null)} maxWidth={440}>
        {bulkResult && (
          <div style={{ padding: '24px' }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: '#22C55E', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Check size={20} /> Cards Sent
            </div>
            {bulkResult.successes.length > 0 && (
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#E0E0F4', marginBottom: 6 }}>
                  Cards requested for {bulkResult.successes.length} student{bulkResult.successes.length !== 1 ? 's' : ''}
                </div>
                <div style={{ fontSize: 12, color: '#8080A0', lineHeight: 1.6 }}>{bulkResult.successes.join(', ')}</div>
              </div>
            )}
            {bulkResult.failures.length > 0 && (
              <div style={{ marginBottom: 12, padding: '10px 12px', borderRadius: 10, background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.12)' }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#EF4444', marginBottom: 4 }}>{bulkResult.failures.length} failed:</div>
                {bulkResult.failures.map((f, i) => (
                  <div key={i} style={{ fontSize: 11, color: '#EF4444', padding: '2px 0' }}>{f.name}: {f.error}</div>
                ))}
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setBulkResult(null)}
                style={{ padding: '10px 24px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg, #D4226A, #A333FF)', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer', minHeight: 44 }}
              >
                Done
              </button>
            </div>
          </div>
        )}
      </PortalModal>

      {reviewModalData && (
        <ReviewRequestModal
          familyId={reviewModalData.familyId}
          familyName={reviewModalData.familyName}
          parentName={reviewModalData.parentName}
          locationId={reviewModalData.locationId}
          students={reviewModalData.students}
          onClose={() => setReviewModalData(null)}
        />
      )}
    </div>
  )
}

// ══════════════════════════════
//  TAB 2: AT-RISK
// ══════════════════════════════
function AtRiskTab({ locationIds }: { locationIds?: string[] | null }) {
  const { data: students } = useAtRiskStudents(locationIds)
  const dismiss = useDismissAtRisk()
  const navigate = useNavigate()
  const [reasonFilter, setReasonFilter] = useState<string | null>(null)

  const byLocation: Record<string, number> = {}
  students?.forEach(s => { byLocation[s.locationName] = (byLocation[s.locationName] ?? 0) + 1 })

  const allReasons = Array.from(new Set((students ?? []).flatMap(s => s.reasons)))
  const filtered = reasonFilter ? (students ?? []).filter(s => s.reasons.includes(reasonFilter)) : (students ?? [])

  return (
    <div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 28 }}>
        <MetricCard label="Total At-Risk" value={students?.length ?? 0} color="#EF4444" />
        {Object.entries(byLocation).map(([loc, count]) => (
          <MetricCard key={loc} label={loc} value={count} color={LOC_COLORS[loc] ?? '#8080A8'} />
        ))}
      </div>

      {allReasons.length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 20 }}>
          <FilterPill label="All" active={reasonFilter === null} onClick={() => setReasonFilter(null)} color="#EF4444" />
          {allReasons.map(r => (
            <FilterPill key={r} label={r} active={reasonFilter === r} onClick={() => setReasonFilter(reasonFilter === r ? null : r)} color="#EF4444" />
          ))}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {filtered.map(s => (
          <div
            key={s.id}
            style={{
              padding: '16px 18px', borderRadius: 14,
              background: 'rgba(239,68,68,0.022)',
              border: '1px solid rgba(239,68,68,0.1)',
              display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap',
            }}
          >
            <div style={{
              width: 36, height: 36, borderRadius: 10, flexShrink: 0,
              background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.18)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <AlertTriangle size={16} color="#EF4444" />
            </div>
            <div style={{ flex: 1, minWidth: 160, cursor: 'pointer' }} onClick={() => navigate(`/admin/students?id=${s.id}`)}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: '#E0E0F4' }}>{s.name}</span>
                <span style={{ fontSize: 11, color: '#5050A0' }}>{instrumentWithEmojiTitle(s.instrument)}</span>
                <LocBadge name={s.locationName} />
              </div>
              {s.familyName && <div style={{ fontSize: 11, color: '#404080' }}>{s.familyName}</div>}
            </div>
            <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
              {s.reasons.map((r, i) => (
                <span key={i} style={{
                  fontSize: 10, fontWeight: 700, padding: '3px 9px', borderRadius: 20,
                  background: 'rgba(239,68,68,0.1)', color: '#EF4444',
                  border: '1px solid rgba(239,68,68,0.2)', whiteSpace: 'nowrap',
                }}>
                  {r}
                </span>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button
                onClick={() => navigate(`/admin/students?id=${s.id}`)}
                style={{
                  padding: '7px 14px', borderRadius: 9,
                  background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
                  color: '#8080A0', fontSize: 11, fontWeight: 600, cursor: 'pointer', minHeight: 34,
                }}
              >
                View
              </button>
              <button
                onClick={() => { dismiss.mutateAsync({ studentId: s.id, locationId: s.locationId }); toast('Dismissed for 30 days', 'success') }}
                style={{
                  padding: '7px', borderRadius: 9,
                  background: 'transparent', border: '1px solid rgba(255,255,255,0.06)',
                  color: '#404080', cursor: 'pointer', minHeight: 34, minWidth: 34,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
                title="Dismiss for 30 days"
              >
                <X size={13} />
              </button>
            </div>
          </div>
        ))}
        {filtered.length === 0 && (
          <div style={{ padding: '40px 24px', textAlign: 'center', background: 'rgba(255,255,255,0.012)', borderRadius: 16, border: '1px dashed rgba(255,255,255,0.06)' }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#22C55E', marginBottom: 4 }}>
              {reasonFilter ? 'No students match this filter.' : 'No at-risk students right now.'}
            </div>
            {!reasonFilter && <div style={{ fontSize: 12, color: '#5050A0' }}>Great job keeping your students engaged!</div>}
          </div>
        )}
      </div>
    </div>
  )
}

// ══════════════════════════════
//  TAB 3: WIN-BACK
// ══════════════════════════════
function WinBackTab({ locationIds }: { locationIds?: string[] | null }) {
  const [subTab, setSubTab] = useState<'former' | 'leads'>('former')
  const { data: metrics } = useWinBackMetrics(locationIds)
  const { data: formerStudents } = useFormerStudents(locationIds)
  const { data: lostLeads } = useLostLeads(locationIds)
  const navigate = useNavigate()
  const [exitFilter, setExitFilter] = useState<string | null>(null)

  const EXIT_LABELS: Record<string, string> = {
    summer_break: 'Summer Break', holiday_break: 'Holiday Break', financial: 'Financial',
    schedule_conflict: 'Schedule', moving: 'Moving', lost_interest: 'Lost Interest',
    sports: 'Sports', teacher_fit: 'Teacher Fit', transferred: 'Transferred', other: 'Other',
  }
  const LOST_LABELS: Record<string, string> = {
    never_responded: 'Never Responded', price_objection: 'Price', schedule_conflict: 'Schedule',
    chose_competitor: 'Chose Competitor', not_ready: 'Not Ready', other: 'Other',
  }

  const allExitCategories = Array.from(new Set((formerStudents ?? []).map(s => s.exitCategory).filter(Boolean))) as string[]
  const filteredFormer = exitFilter ? (formerStudents ?? []).filter(s => s.exitCategory === exitFilter) : (formerStudents ?? [])

  return (
    <div>
      {metrics && (
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 28 }}>
          <MetricCard label="Former Students" value={metrics.totalFormer} color="#EF4444" />
          <MetricCard label="Due for Reactivation" value={metrics.dueForReactivation} color="#FFB800" />
          <MetricCard label="Contacted" value={metrics.contactedThisMonth} color="#38BDF8" sub="this month" />
          <MetricCard label="Won Back" value={metrics.wonBackThisMonth} color="#22C55E" sub="this month" />
          <MetricCard label="Lost Leads" value={metrics.totalLostLeads} color="#A333FF" />
        </div>
      )}

      {/* Sub-tab toggle */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 24, padding: 4, background: 'rgba(255,255,255,0.02)', borderRadius: 12, border: '1px solid rgba(255,255,255,0.05)', width: 'fit-content' }}>
        {(['former', 'leads'] as const).map(st => (
          <button
            key={st}
            onClick={() => setSubTab(st)}
            style={{
              padding: '8px 18px', borderRadius: 9,
              background: subTab === st ? 'rgba(255,255,255,0.07)' : 'transparent',
              border: `1px solid ${subTab === st ? 'rgba(255,255,255,0.11)' : 'transparent'}`,
              color: subTab === st ? '#E0E0F4' : '#5050A0',
              fontWeight: subTab === st ? 700 : 500, fontSize: 12, cursor: 'pointer', transition: 'all 150ms',
            }}
          >
            {st === 'former' ? 'Former Students' : 'Lost Leads'}
            <span style={{ fontSize: 10, color: '#5050A0', marginLeft: 5 }}>
              ({st === 'former' ? (formerStudents?.length ?? 0) : (lostLeads?.length ?? 0)})
            </span>
          </button>
        ))}
      </div>

      {subTab === 'former' && (
        <div>
          {allExitCategories.length > 0 && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
              <FilterPill label="All" active={exitFilter === null} onClick={() => setExitFilter(null)} color="#A333FF" />
              {allExitCategories.map(cat => (
                <FilterPill key={cat} label={EXIT_LABELS[cat] ?? cat} active={exitFilter === cat} onClick={() => setExitFilter(exitFilter === cat ? null : cat)} color="#A333FF" />
              ))}
            </div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {filteredFormer.map(s => {
              const isTransferred = !!s.transferredTo
              const isDue = s.reactivationDate && new Date(s.reactivationDate) <= new Date()
              return (
                <div
                  key={s.id}
                  style={{
                    padding: '14px 18px', borderRadius: 14,
                    background: 'rgba(255,255,255,0.018)',
                    border: `1px solid ${isDue ? 'rgba(255,184,0,0.16)' : 'rgba(255,255,255,0.055)'}`,
                    display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
                  }}
                >
                  <div style={{ flex: 1, minWidth: 160, cursor: 'pointer' }} onClick={() => navigate(`/admin/students?id=${s.id}`)}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 14, fontWeight: 700, color: '#E0E0F4' }}>{s.name}</span>
                      <span style={{ fontSize: 11, color: '#5050A0' }}>{instrumentWithEmojiTitle(s.instrument)}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <LocBadge name={s.locationName} />
                      {s.familyName && <span style={{ fontSize: 11, color: '#404080' }}>{s.familyName}</span>}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', alignItems: 'center' }}>
                    {s.exitCategory && (
                      <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 9px', borderRadius: 20, background: 'rgba(255,255,255,0.05)', color: '#8080A0', border: '1px solid rgba(255,255,255,0.08)', whiteSpace: 'nowrap' }}>
                        {EXIT_LABELS[s.exitCategory] ?? s.exitCategory}
                      </span>
                    )}
                    {isTransferred && (
                      <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 9px', borderRadius: 20, background: 'rgba(56,189,248,0.08)', color: '#38BDF8', border: '1px solid rgba(56,189,248,0.16)', whiteSpace: 'nowrap' }}>
                        → {s.transferredTo}
                      </span>
                    )}
                    {isDue && !isTransferred && (
                      <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 9px', borderRadius: 20, background: 'rgba(255,184,0,0.1)', color: '#FFB800', border: '1px solid rgba(255,184,0,0.2)', whiteSpace: 'nowrap' }}>
                        Due
                      </span>
                    )}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    {s.deactivatedAt && (
                      <span style={{ fontSize: 11, color: '#404080', whiteSpace: 'nowrap' }}>
                        Exit: {new Date(s.deactivatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' })}
                      </span>
                    )}
                    {s.outreachCount > 0 && (
                      <span style={{ fontSize: 10, color: '#5050A0' }}>{s.outreachCount} contact{s.outreachCount !== 1 ? 's' : ''}</span>
                    )}
                  </div>
                </div>
              )
            })}
            {filteredFormer.length === 0 && (
              <div style={{ padding: '40px 24px', textAlign: 'center', color: '#5050A0', fontSize: 13, background: 'rgba(255,255,255,0.012)', borderRadius: 16, border: '1px dashed rgba(255,255,255,0.06)' }}>
                {exitFilter ? 'No students match this filter.' : 'No former students.'}
              </div>
            )}
          </div>
        </div>
      )}

      {subTab === 'leads' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {(lostLeads ?? []).map(l => (
            <div key={l.id} style={{
              padding: '14px 18px', borderRadius: 14,
              background: 'rgba(255,255,255,0.018)',
              border: '1px solid rgba(255,255,255,0.055)',
              display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
            }}>
              <div style={{ flex: 1, minWidth: 140 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: '#E0E0F4' }}>{l.name}</span>
                  {l.parentName && l.parentName !== l.name && (
                    <span style={{ fontSize: 11, color: '#5050A0' }}>({l.parentName})</span>
                  )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 11, color: '#5050A0' }}>{instrumentWithEmojiTitle(l.instrument)}</span>
                  <LocBadge name={l.locationName} />
                </div>
              </div>
              {l.lostCategory && (
                <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 9px', borderRadius: 20, background: 'rgba(255,255,255,0.05)', color: '#8080A0', border: '1px solid rgba(255,255,255,0.08)', whiteSpace: 'nowrap' }}>
                  {LOST_LABELS[l.lostCategory] ?? l.lostCategory}
                </span>
              )}
              {l.lostDate && (
                <span style={{ fontSize: 11, color: '#404080', whiteSpace: 'nowrap' }}>
                  Lost: {new Date(l.lostDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </span>
              )}
            </div>
          ))}
          {(lostLeads ?? []).length === 0 && (
            <div style={{ padding: '40px 24px', textAlign: 'center', color: '#5050A0', fontSize: 13, background: 'rgba(255,255,255,0.012)', borderRadius: 16, border: '1px dashed rgba(255,255,255,0.06)' }}>
              No lost leads.
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ══════════════════════════════
//  TAB 4: CAMPAIGNS
// ══════════════════════════════
function CampaignsTab({ locationIds: _locationIds }: { locationIds?: string[] | null }) {
  const month = new Date().getMonth()
  const recommended = month >= 3 && month <= 4 ? 'Summer Retention'
    : month === 7 ? 'Back to School'
    : month === 10 ? 'Holiday Retention'
    : month === 0 ? 'New Year Win-Back'
    : null

  const CAMPAIGNS = [
    { name: 'Summer Retention', desc: 'Keep students enrolled through summer break', waves: 3, months: 'April – May', color: '#FFB800' },
    { name: 'Back to School', desc: 'Re-engage families for fall semester', waves: 2, months: 'August', color: '#22C55E' },
    { name: 'Holiday Retention', desc: 'Prevent holiday season drop-off', waves: 2, months: 'November', color: '#EF4444' },
    { name: 'New Year Win-Back', desc: 'Win back former students for the new year', waves: 3, months: 'January', color: '#38BDF8' },
    { name: 'Custom Campaign', desc: 'Build a custom outreach campaign', waves: 0, months: 'Anytime', color: '#A333FF' },
  ]

  return (
    <div>
      {recommended && (
        <div style={{
          padding: '20px 24px', borderRadius: 16,
          background: 'linear-gradient(135deg, rgba(255,184,0,0.055), rgba(255,85,0,0.035))',
          border: '1px solid rgba(255,184,0,0.16)',
          marginBottom: 28, display: 'flex', alignItems: 'center', gap: 16,
        }}>
          <div style={{
            width: 44, height: 44, borderRadius: 12, flexShrink: 0,
            background: 'rgba(255,184,0,0.1)', border: '1px solid rgba(255,184,0,0.18)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Sparkles size={20} color="#FFB800" />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: '#FFB800', marginBottom: 3 }}>Recommended: {recommended}</div>
            <div style={{ fontSize: 12, color: '#8080A0', lineHeight: 1.5 }}>Based on the time of year, this campaign is most relevant right now.</div>
          </div>
          <button style={{
            padding: '10px 20px', borderRadius: 11, background: '#FFB800', border: 'none',
            color: '#1A1A2E', fontWeight: 800, fontSize: 13, cursor: 'pointer', minHeight: 44, whiteSpace: 'nowrap',
          }}>
            Start Campaign
          </button>
        </div>
      )}

      <SectionHeader title="Campaign Templates" count={CAMPAIGNS.length} />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 }}>
        {CAMPAIGNS.map(c => (
          <div
            key={c.name}
            style={{
              padding: '22px', borderRadius: 16,
              background: 'rgba(255,255,255,0.018)',
              border: `1px solid ${c.name === recommended ? `${c.color}26` : 'rgba(255,255,255,0.055)'}`,
              cursor: 'pointer', transition: 'border-color 150ms, background 150ms',
              position: 'relative', overflow: 'hidden',
            }}
          >
            <div style={{
              position: 'absolute', top: 0, left: 0, right: 0, height: 2,
              background: `linear-gradient(90deg, ${c.color}48, transparent)`,
              opacity: c.name === recommended ? 1 : 0.5,
            }} />
            <div style={{ fontSize: 15, fontWeight: 800, color: c.color, marginBottom: 6, letterSpacing: '-0.01em' }}>{c.name}</div>
            <div style={{ fontSize: 12, color: '#8080A0', marginBottom: 14, lineHeight: 1.6 }}>{c.desc}</div>
            <div style={{ display: 'flex', gap: 8 }}>
              {c.waves > 0 && (
                <span style={{ fontSize: 11, color: '#5050A0', padding: '3px 8px', borderRadius: 8, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
                  {c.waves} waves
                </span>
              )}
              <span style={{ fontSize: 11, color: '#5050A0', padding: '3px 8px', borderRadius: 8, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
                {c.months}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
