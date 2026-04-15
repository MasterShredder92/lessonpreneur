import { useState, useEffect, useTransition, useMemo, useCallback, memo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useAuthContext } from '../../app/AuthContext'
import { usePermissions } from '../../hooks/usePermissions'
import { useDashboard } from '../../hooks/useDashboard'
import { useBillingHeroStats } from '../../hooks/useBillingPage'
import { useBillingSnapshot } from '../../hooks/useBillingSnapshot'
import { useUserLocations } from '../../hooks/useUserLocations'
import { useLocations } from '../../hooks/useLocations'
import { supabase } from '../../lib/supabase'
import { Video, FileWarning } from 'lucide-react'
import { useFamilyFilesStats } from '../../hooks/useFamilyFiles'
import TaskCenter from '../../components/tasks/TaskCenter'
import WhatsImportantNow from '../../components/admin/WhatsImportantNow'
import HappeningTodayFeed from '../../components/admin/HappeningTodayFeed'
import DirectorCloseoutSection from '../../components/admin/DirectorCloseoutSection'
import BillingSnapshotCard from '../../components/admin/BillingSnapshotCard'
import { getLocationColor } from '../../utils/locationColor'
import { IssueContextProvider } from '../../contexts/IssueContext'
import { useZiroShell } from '../../contexts/ZiroContext'
import ReportIssueButton from '../../components/shared/ReportIssueButton'
import DashboardPageGuide from '../../components/admin/DashboardPageGuide'
import { useDashboardRealtime } from '../../hooks/useDashboardRealtime'
import { qk } from '../../lib/queryKeys'

const EMPTY_LOCATION_ID_SET = new Set<string>()

const TaskCenterMemo = memo(TaskCenter)

type LocationSummaryRow = {
  name: string
  locationId: string
  students: number
  openSlotsToday: number
  teachersToday: number
  subsAvailable: number
}

const LocationSummaryGrid = memo(function LocationSummaryGrid({
  locations,
  isStudioDirector,
  allowedLocationIdSet,
  navigate,
  startNavTransition,
}: {
  locations: LocationSummaryRow[]
  isStudioDirector: boolean
  allowedLocationIdSet: Set<string>
  navigate: ReturnType<typeof useNavigate>
  startNavTransition: (fn: () => void) => void
}) {
  const firstOwnIdx = useMemo(
    () =>
      locations.findIndex(
        (l) => !isStudioDirector || (!!l.locationId && allowedLocationIdSet.has(l.locationId)),
      ),
    [locations, isStudioDirector, allowedLocationIdSet],
  )

  return (
    <div className="location-grid" data-tour-id="dash-location-grid">
      {locations.map((loc, locIdx) => {
        const c = getLocationColor(loc.locationId)
        const locked = isStudioDirector && !!loc.locationId && !allowedLocationIdSet.has(loc.locationId)
        const tagOwn = locIdx === firstOwnIdx
        return (
          <div
            key={loc.locationId || loc.name}
            className={locked ? 'location-card' : 'location-card card-hover'}
            style={{
              borderColor: `${c}30`,
              opacity: locked ? 0.4 : 1,
              cursor: locked ? 'default' : 'pointer',
              pointerEvents: locked ? 'none' : 'auto',
            }}
            onClick={() => {
              if (locked) return
              startNavTransition(() => {
                if (loc.locationId) navigate(`/admin/students?location=${loc.locationId}`)
                else navigate('/admin/schedule')
              })
            }}
          >
            <div
              className="loc-card-edge"
              style={{ background: `linear-gradient(180deg, ${c}, ${c}CC)`, boxShadow: `0 0 18px ${c}80` }}
            />
            <div className="loc-card-glow" style={{ background: `radial-gradient(circle, ${c}18 0%, transparent 70%)` }} />
            <div className="location-card-header">
              <span className="location-name">{loc.name}</span>
            </div>
            <div className="location-metrics">
              <div className="location-metric-row" data-tour-id={tagOwn ? 'active-students-metric' : undefined}>
                <span className="location-metric-key">Active Students</span>
                <span className="location-metric-value">{loc.students}</span>
              </div>
              <div className="location-divider" />
              <div className="location-metric-row" data-tour-id={tagOwn ? 'schedule-utilization' : undefined}>
                <span className="location-metric-key">Teachers Scheduled</span>
                <span className="location-metric-value">{loc.teachersToday}</span>
              </div>
              <div className="location-metric-row" data-tour-id={tagOwn ? 'open-slots' : undefined}>
                <span className="location-metric-key">Open Slots</span>
                <span className="location-metric-value">{loc.openSlotsToday}</span>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
})

const DashboardOpsSection = memo(function DashboardOpsSection({
  activeStudents,
  studentsByLocation,
  openSlotsThisWeek,
  slotsByLocation,
  leadsInPipeline,
  leadsByStage,
  enrolledThisMonth,
  lostThisMonth,
  navigate,
  startNavTransition,
}: {
  activeStudents: number
  studentsByLocation: Record<string, number>
  openSlotsThisWeek: number
  slotsByLocation: Record<string, number>
  leadsInPipeline: number
  leadsByStage: Record<string, number>
  enrolledThisMonth: number
  lostThisMonth: number
  navigate: ReturnType<typeof useNavigate>
  startNavTransition: (fn: () => void) => void
}) {
  const pipelineStageSpans = useMemo(() => {
    return Object.entries(leadsByStage)
      .filter(([s]) => !['enrolled', 'lost'].includes(s))
      .map(([stage, n]) => (
        <span key={stage}>
          {stage}: {n}{' '}
        </span>
      ))
  }, [leadsByStage])

  const studentsLocSpans = useMemo(
    () =>
      Object.entries(studentsByLocation).map(([loc, n]) => (
        <span key={loc}>
          {loc}: {n}{' '}
        </span>
      )),
    [studentsByLocation],
  )

  const slotsLocSpans = useMemo(
    () =>
      Object.entries(slotsByLocation).map(([loc, n]) => (
        <span key={loc}>
          {loc}: {n}{' '}
        </span>
      )),
    [slotsByLocation],
  )

  return (
    <div className="ops-grid">
      <div
        className="ops-widget"
        style={{ borderColor: 'rgba(212,34,106,0.2)' }}
        onClick={() => startNavTransition(() => navigate('/admin/students'))}
      >
        <div
          className="ops-widget-edge"
          style={{ background: 'linear-gradient(180deg, #D4226A, #FF5500)', boxShadow: '0 0 18px rgba(212,34,106,0.52)' }}
        />
        <div
          className="ops-widget-glow"
          style={{ background: 'radial-gradient(circle, rgba(212,34,106,0.1) 0%, transparent 70%)' }}
        />
        <div className="ops-widget-label">Active Students</div>
        <div className="ops-widget-value">{activeStudents}</div>
        <div className="ops-widget-sub">{studentsLocSpans}</div>
      </div>
      <div
        className="ops-widget"
        style={{ borderColor: 'rgba(255,120,0,0.18)' }}
        onClick={() => startNavTransition(() => navigate('/admin/schedule'))}
      >
        <div
          className="ops-widget-edge"
          style={{ background: 'linear-gradient(180deg, #FF5500, #FF8C00)', boxShadow: '0 0 18px rgba(255,85,0,0.48)' }}
        />
        <div
          className="ops-widget-glow"
          style={{ background: 'radial-gradient(circle, rgba(255,85,0,0.09) 0%, transparent 70%)' }}
        />
        <div className="ops-widget-label">Open Slots This Week</div>
        <div className="ops-widget-value">{openSlotsThisWeek}</div>
        <div className="ops-widget-sub">{slotsLocSpans}</div>
      </div>
      <div
        className="ops-widget"
        style={{ borderColor: 'rgba(232,72,144,0.18)' }}
        onClick={() => startNavTransition(() => navigate('/admin/leads'))}
      >
        <div
          className="ops-widget-edge"
          style={{ background: 'linear-gradient(180deg, #BE185D, #E8488A)', boxShadow: '0 0 18px rgba(232,72,144,0.44)' }}
        />
        <div
          className="ops-widget-glow"
          style={{ background: 'radial-gradient(circle, rgba(232,72,144,0.09) 0%, transparent 70%)' }}
        />
        <div className="ops-widget-label">Leads in Pipeline</div>
        <div className="ops-widget-value">{leadsInPipeline}</div>
        <div className="ops-widget-sub">{pipelineStageSpans}</div>
      </div>
      <div
        className="ops-widget"
        style={{ borderColor: 'rgba(255,184,0,0.18)' }}
        onClick={() => startNavTransition(() => navigate('/admin/leads'))}
      >
        <div
          className="ops-widget-edge"
          style={{ background: 'linear-gradient(180deg, #D97706, #FFB800)', boxShadow: '0 0 18px rgba(255,184,0,0.4)' }}
        />
        <div
          className="ops-widget-glow"
          style={{ background: 'radial-gradient(circle, rgba(255,184,0,0.09) 0%, transparent 70%)' }}
        />
        <div className="ops-widget-label">Enrolled This Month</div>
        <div className="ops-widget-value">{enrolledThisMonth}</div>
        <div className="ops-widget-sub">Leads converted to students</div>
      </div>
      <div
        className="ops-widget"
        style={{ borderColor: 'rgba(167,60,150,0.18)' }}
        onClick={() => startNavTransition(() => navigate('/admin/retention?tab=win-back'))}
      >
        <div
          className="ops-widget-edge"
          style={{ background: 'linear-gradient(180deg, #A73C96, #C060B0)', boxShadow: '0 0 18px rgba(167,60,150,0.4)' }}
        />
        <div
          className="ops-widget-glow"
          style={{ background: 'radial-gradient(circle, rgba(167,60,150,0.09) 0%, transparent 70%)' }}
        />
        <div className="ops-widget-label">Lost This Month</div>
        <div className="ops-widget-value">{lostThisMonth}</div>
        <div className="ops-widget-sub">Leads marked as lost</div>
      </div>
    </div>
  )
})

/** Layout-aligned shell so first dashboard paint matches loaded chrome (CLS / FCP). */
function DashboardLoadingShell() {
  return (
    <div className="page">
      <IssueContextProvider page="Studio Overview">
        <div className="dash-business-header" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 52 }}>
            <div className="dash-business-logo-placeholder" style={{ opacity: 0.45 }} aria-hidden />
            <div>
              <div style={{ height: 22, width: 200, maxWidth: '55vw', borderRadius: 8, background: 'rgba(255,255,255,0.06)' }} />
              <div style={{ height: 12, width: 160, maxWidth: '45vw', borderRadius: 6, background: 'rgba(255,255,255,0.04)', marginTop: 8 }} />
            </div>
          </div>
        </div>
        <div
          style={{
            minHeight: 100, borderRadius: 14, marginBottom: 16,
            background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)',
          }}
          aria-busy
          aria-label="Loading dashboard feed"
        />
        <div className="section-header" style={{ marginBottom: 8 }}>
          <span className="section-label">{"Today's Snapshot"}</span>
          <div className="section-line" />
        </div>
        <div className="location-grid" style={{ marginBottom: 16 }}>
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="location-card" style={{ minHeight: 148, pointerEvents: 'none', opacity: 0.72 }}>
              <div style={{ height: 14, width: '48%', marginBottom: 14, borderRadius: 6, background: 'rgba(255,255,255,0.05)' }} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ height: 10, width: '88%', borderRadius: 4, background: 'rgba(255,255,255,0.04)' }} />
                <div style={{ height: 10, width: '76%', borderRadius: 4, background: 'rgba(255,255,255,0.04)' }} />
                <div style={{ height: 10, width: '64%', borderRadius: 4, background: 'rgba(255,255,255,0.04)' }} />
              </div>
            </div>
          ))}
        </div>
        <div className="section-header" style={{ marginBottom: 8 }}>
          <span className="section-label">Billing Snapshot</span>
          <div className="section-line" />
        </div>
        <div style={{ minHeight: 200, borderRadius: 16, marginBottom: 16, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }} />
        <div className="section-header" style={{ marginBottom: 8 }}>
          <span className="section-label">Operations</span>
          <div className="section-line" />
        </div>
        <div className="ops-grid" style={{ pointerEvents: 'none', opacity: 0.7 }}>
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="ops-widget" style={{ minHeight: 122 }}>
              <div style={{ height: 12, width: '55%', borderRadius: 6, background: 'rgba(255,255,255,0.06)', marginBottom: 14 }} />
              <div style={{ height: 30, width: 56, borderRadius: 8, background: 'rgba(255,255,255,0.07)' }} />
            </div>
          ))}
        </div>
      </IssueContextProvider>
    </div>
  )
}

export default function Dashboard() {
  const { tenantId } = useAuthContext()
  const [, startNavTransition] = useTransition()
  const { setPageContext } = useZiroShell()
  useEffect(() => {
    setPageContext({ page: 'dashboard' })
  }, [setPageContext])
  useDashboardRealtime()
  const { isStudioDirector, locationIds: allowedLocationIds } = usePermissions()
  const allowedLocationSignature = !allowedLocationIds?.length
    ? ''
    : [...allowedLocationIds].sort().join('\0')
  const allowedLocationIdSet = useMemo(() => {
    if (!allowedLocationSignature) return EMPTY_LOCATION_ID_SET
    return new Set(allowedLocationSignature.split('\0'))
  }, [allowedLocationSignature])
  const { data: userLocations } = useUserLocations()
  const { data, isLoading } = useDashboard(userLocations)
  const navigate = useNavigate()
  const goBilling = useCallback(() => {
    startNavTransition(() => navigate('/admin/billing'))
  }, [navigate, startNavTransition])
  const { data: heroStats } = useBillingHeroStats()
  const { data: agreementStats } = useFamilyFilesStats()

  // Billing snapshot data — role-scoped
  const directorLocationId = isStudioDirector ? (allowedLocationIds?.[0] ?? undefined) : undefined
  const { data: snapshotAll, isPending: snapshotAllPending } = useBillingSnapshot()                          // all-location aggregate
  const { data: snapshotDirector, isPending: snapshotDirectorPending } = useBillingSnapshot(directorLocationId)   // director's location only
  const showBillingSkeleton = isStudioDirector
    ? (snapshotDirectorPending && !snapshotDirector)
    : (snapshotAllPending && !snapshotAll)
  const { data: locations } = useLocations()

  // Resolve director's location name + color
  const directorLocation = isStudioDirector && directorLocationId
    ? locations?.find((l: any) => l.id === directorLocationId)
    : null
  const directorLocationName = directorLocation?.name ?? 'My Location'
  const directorLocationColor = directorLocationId ? getLocationColor(directorLocationId) : '#D4226A'

  // Fetch tenant info for business name + logo
  const { data: tenant } = useQuery({
    queryKey: [...qk.tenant.info, tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data } = await supabase.from('tenants').select('name, slug, logo_url').eq('id', tenantId!).single()
      return data
    },
  })

  // Last month virtual sessions summary — tenant-scoped, hard-capped row count, abortable, batched IN counts
  const { data: virtualSummary } = useQuery({
    queryKey: ['virtual-summary-last-month', tenantId, userLocations],
    enabled: !!tenantId,
    queryFn: async ({ signal }) => {
      const now = new Date()
      const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1)
      const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0)
      const startStr = lastMonthStart.toISOString().split('T')[0]
      const endStr = lastMonthEnd.toISOString().split('T')[0]

      const VIRTUAL_BLOCK_CAP = 8000
      const IN_CHUNK = 120

      let vq = supabase
        .from('schedule_blocks')
        .select('id, location_id')
        .eq('tenant_id', tenantId!)
        .eq('is_virtual', true)
        .gte('block_date', startStr)
        .lte('block_date', endStr)
        .limit(VIRTUAL_BLOCK_CAP)
        .abortSignal(signal)
      if (userLocations && userLocations.length > 0) {
        vq = vq.in('location_id', userLocations)
      }
      const { data: virtualBlocks, error: vbErr } = await vq

      if (vbErr) throw vbErr
      if (!virtualBlocks || virtualBlocks.length === 0) return null

      const blockIds = virtualBlocks.map(b => b.id)
      const locationCount = new Set(virtualBlocks.map(b => b.location_id)).size

      let notifCount = 0
      let failCount = 0
      for (let i = 0; i < blockIds.length; i += IN_CHUNK) {
        const chunk = blockIds.slice(i, i + IN_CHUNK)
        const { count: n } = await supabase
          .from('appointment_notifications')
          .select('*', { count: 'exact', head: true })
          .in('block_id', chunk)
          .abortSignal(signal)
        notifCount += n ?? 0
        const { count: f } = await supabase
          .from('appointment_notifications')
          .select('*', { count: 'exact', head: true })
          .in('block_id', chunk)
          .eq('success', false)
          .abortSignal(signal)
        failCount += f ?? 0
      }

      return {
        sessions: virtualBlocks.length,
        locations: locationCount,
        notifications: notifCount,
        failures: failCount,
        monthLabel: lastMonthStart.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
      }
    },
    staleTime: 1000 * 60 * 5,
  })

  // Onboarding insight modal (metadata stored so dismiss is one write — no read-before-update)
  const [insightModal, setInsightModal] = useState<{ id: string; content: string; metadata?: Record<string, unknown> } | null>(null)
  const { profile } = useAuthContext()

  useEffect(() => {
    if (!profile?.id || !tenantId) return
    let cancelled = false
    const checkInsight = async () => {
      try {
        const { data: rows, error } = await supabase
          .from('ai_legacy_message_log')
          .select('id, content, metadata')
          .eq('tenant_id', tenantId)
          .eq('profile_id', profile.id)
          .eq('role', 'assistant')
          .order('created_at', { ascending: false })
          .limit(10)
        if (cancelled) return
        if (error) return
        const insight = rows?.find((r: any) => r.metadata?.type === 'onboarding_insight' && !r.metadata?.shown)
        if (insight) setInsightModal({ id: insight.id, content: insight.content, metadata: insight.metadata ?? {} })
      } catch { /* silent */ }
    }
    checkInsight()
    return () => {
      cancelled = true
    }
  }, [profile?.id, tenantId])

  const dismissInsight = useCallback(() => {
    const snapshot = insightModal
    setInsightModal(null)
    if (!snapshot) return
    void supabase
      .from('ai_legacy_message_log')
      .update({ metadata: { ...(snapshot.metadata ?? {}), shown: true } })
      .eq('id', snapshot.id)
      .then(() => { /* persisted */ }, () => { /* silent */ })
  }, [insightModal])

  if (isLoading || !data) {
    return <DashboardLoadingShell />
  }

  // Enrolled + lost counts for ops widgets
  const enrolledThisMonth = (data.leadsByStage as Record<string, number>)['enrolled'] ?? 0
  const lostThisMonth = (data.leadsByStage as Record<string, number>)['lost'] ?? 0

  const dollars = (cents: number) => `$${(Math.abs(cents) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

  return (
    <div className="page">
      <IssueContextProvider page="Studio Overview">
      {/* Business Header — Ziro lives in the app shell sidebar */}
      <div className="dash-business-header" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
        <div className="dash-business-identity">
          {tenant?.logo_url ? (
            <img src={tenant.logo_url} alt="" className="dash-business-logo" />
          ) : (
            <div className="dash-business-logo-placeholder">
              {tenant?.name?.[0] ?? 'L'}
            </div>
          )}
          <div>
            <h1 className="dash-business-name">{tenant?.name ?? 'Dashboard'}</h1>
            <span className="page-date">
              {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
            </span>
          </div>
        </div>
        <ReportIssueButton />
        <DashboardPageGuide />
      </div>

      {/* Things Happening Today — live feed of today's call-outs */}
      <HappeningTodayFeed userLocations={userLocations} />

      {/* 1. What's Important Now — AI Insight Cards (FIRST after header) */}
      <div data-tour-id="whats-important">
        <WhatsImportantNow data={data} heroStats={heroStats} />
      </div>

      {/* 2. Today's Snapshot — Location Cards */}
      <div style={{ marginBottom: 16 }}>
        <div className="section-header" style={{ marginBottom: 8 }}>
          <span className="section-label">Today's Snapshot</span>
          <div className="section-line" />
        </div>
        <LocationSummaryGrid
          locations={data.locationSummary}
          isStudioDirector={isStudioDirector}
          allowedLocationIdSet={allowedLocationIdSet}
          navigate={navigate}
          startNavTransition={startNavTransition}
        />
      </div>

      {/* 3. Billing Snapshot — role-scoped cards (reserve space while snapshot queries resolve — reduces CLS) */}
      <div style={{ marginBottom: 16, minHeight: showBillingSkeleton ? 200 : undefined }}>
        <div className="section-header" style={{ marginBottom: 8 }}>
          <span className="section-label">Billing Snapshot</span>
          <div className="section-line" />
        </div>

        {showBillingSkeleton ? (
          <div
            style={{
              borderRadius: 16,
              padding: 20,
              border: '1px solid rgba(255,255,255,0.06)',
              background: 'linear-gradient(135deg, rgba(255,255,255,0.03), rgba(255,255,255,0.01))',
              display: 'flex',
              flexDirection: 'column',
              gap: 14,
            }}
          >
            <div style={{ height: 12, width: 180, borderRadius: 6, background: 'rgba(255,255,255,0.06)' }} />
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))', gap: 10 }}>
              {[0, 1, 2, 3].map((i) => (
                <div key={i} style={{ height: 56, borderRadius: 12, background: 'rgba(255,255,255,0.04)' }} />
              ))}
            </div>
          </div>
        ) : (snapshotAll || snapshotDirector) ? (
          <>
          {isStudioDirector ? (
            /* Studio Director: two cards — all-schools summary + their location full detail */
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {snapshotAll && (
                <BillingSnapshotCard
                  title="All Schools Overview"
                  data={snapshotAll}
                  accentColor="#8080A8"
                  variant="summary"
                  clickable={false}
                />
              )}
              {snapshotDirector && (
                <BillingSnapshotCard
                  title={directorLocationName}
                  data={snapshotDirector}
                  accentColor={directorLocationColor}
                  variant="full"
                  clickable={false}
                />
              )}
            </div>
          ) : (
            /* Owner / Company Director / Admin: single aggregate card, all metrics clickable */
            snapshotAll && (
              <BillingSnapshotCard
                title="All Schools"
                data={snapshotAll}
                accentColor="#D4226A"
                variant="full"
                clickable={true}
                onMetricClick={goBilling}
              />
            )
          )}
          </>
        ) : null}
      </div>

      {/* 4. Operations Metrics */}
      <div style={{ marginBottom: 16 }}>
        <div className="section-header" style={{ marginBottom: 8 }}>
          <span className="section-label">Operations</span>
          <div className="section-line" />
        </div>
        <DashboardOpsSection
          activeStudents={data.activeStudents}
          studentsByLocation={data.studentsByLocation}
          openSlotsThisWeek={data.openSlotsThisWeek}
          slotsByLocation={data.slotsByLocation}
          leadsInPipeline={data.leadsInPipeline}
          leadsByStage={data.leadsByStage}
          enrolledThisMonth={enrolledThisMonth}
          lostThisMonth={lostThisMonth}
          navigate={navigate}
          startNavTransition={startNavTransition}
        />
      </div>

      {/* Missing Enrollment Agreements Warning */}
      {agreementStats && agreementStats.familiesMissingAgreement > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div
            onClick={() => startNavTransition(() => navigate('/admin/families?agreement=missing'))}
            style={{
              padding: '16px 20px', borderRadius: 14, cursor: 'pointer',
              background: 'rgba(255,184,0,0.04)', border: '1px solid rgba(255,184,0,0.15)',
              display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap',
              transition: 'border-color 200ms',
            }}
            onMouseEnter={e => (e.currentTarget.style.borderColor = 'rgba(255,184,0,0.35)')}
            onMouseLeave={e => (e.currentTarget.style.borderColor = 'rgba(255,184,0,0.15)')}
          >
            <div style={{
              width: 40, height: 40, borderRadius: 10,
              background: 'rgba(255,184,0,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>
              <FileWarning size={20} style={{ color: '#FFB800' }} />
            </div>
            <div style={{ flex: 1, minWidth: 140 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#FFB800' }}>Missing Enrollment Agreements</div>
              <div style={{ fontSize: 11, color: '#8080A8', marginTop: 2 }}>
                {agreementStats.familiesMissingAgreement} of {agreementStats.totalFamilies} active families
              </div>
            </div>
            <div style={{ fontSize: 28, fontWeight: 800, color: '#FFB800', flexShrink: 0 }}>
              {agreementStats.familiesMissingAgreement}
            </div>
          </div>
        </div>
      )}

      {/* Virtual sessions summary — last month */}
      {virtualSummary && (
        <div style={{ marginBottom: 24 }}>
          <div style={{
            padding: '16px 20px', borderRadius: 14,
            background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(0,188,212,0.12)',
            display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap',
          }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(0,188,212,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Video size={18} style={{ color: '#00BCD4' }} />
            </div>
            <div style={{ flex: 1, minWidth: 140 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#A0A0C8' }}>{virtualSummary.monthLabel} — Virtual Sessions</div>
              <div style={{ fontSize: 11, color: '#8080A8', marginTop: 2 }}>
                <strong style={{ color: '#00BCD4' }}>{virtualSummary.sessions}</strong> virtual session{virtualSummary.sessions !== 1 ? 's' : ''} across <strong style={{ color: '#00BCD4' }}>{virtualSummary.locations}</strong> location{virtualSummary.locations !== 1 ? 's' : ''}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 16, fontSize: 11 }}>
              <div>
                <div style={{ color: '#606088', fontWeight: 600 }}>Sent</div>
                <div style={{ color: '#A0A0C8', fontWeight: 700 }}>{virtualSummary.notifications}</div>
              </div>
              <div>
                <div style={{ color: '#606088', fontWeight: 600 }}>Failed</div>
                <div style={{ color: virtualSummary.failures > 0 ? '#EF4444' : '#22C55E', fontWeight: 700 }}>{virtualSummary.failures}</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 5. Tasks — 2 tasks max on dashboard */}
      <TaskCenterMemo compact limit={2} />

      {/* Director End of Day — only studio_director sees this */}
      <DirectorCloseoutSection />
      </IssueContextProvider>

      {/* Ziro onboarding insight modal */}
      {insightModal && (
        <div className="modal-overlay" onClick={dismissInsight}>
          <div
            className="modal"
            style={{ maxWidth: 480, animation: 'slideUpInsight 300ms ease', textAlign: 'center' }}
            onClick={e => e.stopPropagation()}
          >
            <style>{`
              @keyframes slideUpInsight {
                from { opacity: 0; transform: translateY(40px); }
                to { opacity: 1; transform: translateY(0); }
              }
            `}</style>
            <div style={{ padding: '32px 28px 28px' }}>
              <div style={{
                width: 56, height: 56, borderRadius: '50%', margin: '0 auto 20px',
                background: 'rgba(212,34,106,0.12)', border: '1px solid rgba(212,34,106,0.25)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <svg width="32" height="32" viewBox="0 0 28 28" fill="none">
                  <path d="M14 4l3.1 6.2 6.9 1-5 4.9 1.2 6.6L14 19.5l-6.2 3.2 1.2-6.6-5-4.9 6.9-1L14 4z" fill="#D4226A" />
                </svg>
              </div>
              <p style={{
                fontSize: 16, lineHeight: 1.65, color: '#E8E8FC', fontWeight: 500,
                margin: '0 0 28px',
              }}>
                {insightModal.content}
              </p>
              <button
                className="btn-primary"
                style={{ width: '100%', justifyContent: 'center', padding: '12px 16px', fontSize: 14 }}
                onClick={dismissInsight}
              >
                Got it
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
