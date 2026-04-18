import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Activity, ArrowRight, Radio, Sparkles, Target } from 'lucide-react'
import { useAuthContext } from '../../app/AuthContext'
import { getAgent } from '../../lib/agents/agents'
import { useAgentAvatarImage } from '../../hooks/useAgentAvatarImage'
import { getAgentIdForSurface } from '../../lib/agents/pageMap'
import { usePageInsights } from '../../lib/agents/pageIntelligence'
import { supabase } from '../../lib/supabase'
import { qk } from '../../lib/queryKeys'
import { useUserLocations } from '../../hooks/useUserLocations'
import { usePreviewMode } from '../../hooks/usePreviewMode'
import { usePermissions } from '../../hooks/usePermissions'
import { useDashboard } from '../../hooks/useDashboard'
import { useBillingSnapshot } from '../../hooks/useBillingSnapshot'
import { useDashboardRealtime } from '../../hooks/useDashboardRealtime'
import Card from '../shell/Card'
import PageIntelligenceStrip from '../ziro/PageIntelligenceStrip'

function weekMondayIso(d: Date): string {
  const dow = d.getDay()
  const monday = new Date(d)
  monday.setDate(d.getDate() - (dow === 0 ? 6 : dow - 1))
  return monday.toISOString().split('T')[0]
}

function formatUsd(cents: number): string {
  return `$${(Math.abs(cents) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

const PLACEHOLDER_SIGNALS = [
  { t: 'Pipeline velocity steady', s: 'Agent signal — wiring to live feed next.' },
  { t: 'Schedule density nominal', s: 'Placeholder until signal bus is exposed.' },
  { t: 'Billing pulse green', s: 'Placeholder — will mirror Ziro runtime signals.' },
]

const PLACEHOLDER_ACTIONS = [
  { t: 'Review top at-risk students', s: 'Open Retention and confirm outreach.' },
  { t: 'Clear stale trial follow-ups', s: 'Leads in “contacted” > 3 days.' },
  { t: 'Reconcile week billing', s: 'Match collected vs scheduled for the month.' },
]

function KpiTile({
  label,
  value,
  hint,
}: {
  label: string
  value: string | number
  hint?: string
}) {
  return (
    <div
      style={{
        borderRadius: 14,
        padding: '16px 18px',
        background: 'linear-gradient(165deg, rgba(28,32,44,0.55) 0%, rgba(16,18,24,0.65) 100%)',
        border: '1px solid rgba(255,255,255,0.07)',
        boxShadow: '0 8px 24px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.04)',
        minHeight: 104,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}
    >
      <div
        style={{
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: '0.14em',
          textTransform: 'uppercase',
          color: 'rgba(139,144,168,0.95)',
        }}
      >
        {label}
      </div>
      <div style={{ fontSize: 26, fontWeight: 700, letterSpacing: '-0.02em', color: '#f0f2fa', lineHeight: 1.1 }}>
        {value}
      </div>
      {hint ? (
        <div style={{ fontSize: 12, color: 'rgba(184,188,208,0.85)', marginTop: 'auto' }}>{hint}</div>
      ) : null}
    </div>
  )
}

export default function ZiroDashboard() {
  useDashboardRealtime()
  const { profile, tenantId } = useAuthContext()
  const { preview } = usePreviewMode()
  const { isStudioDirector, locationIds: allowedLocationIds } = usePermissions()
  const { data: userLocations } = useUserLocations()

  const dashboardLocIds = useMemo(() => {
    if (preview.active && preview.locationId) return [preview.locationId]
    return userLocations
  }, [preview.active, preview.locationId, userLocations])

  const billingLocationId =
    preview.active && preview.locationId
      ? preview.locationId
      : isStudioDirector
        ? (allowedLocationIds?.[0] ?? undefined)
        : undefined

  const { data: dash, isLoading: dashLoading, isError: dashError } = useDashboard(dashboardLocIds)
  const { data: billing, isLoading: billingLoading } = useBillingSnapshot(billingLocationId)
  const insights = usePageInsights('dashboard')
  const topInsights = useMemo(() => insights.slice(0, 3), [insights])

  const weekStart = useMemo(() => weekMondayIso(new Date()), [])
  const leadsWeekKey = [tenantId, weekStart, dashboardLocIds ?? 'all'] as const

  const { data: leadsThisWeek = 0, isLoading: leadsWeekLoading } = useQuery({
    queryKey: [...qk.dashboard.all, 'leads-week', ...leadsWeekKey],
    enabled: !!tenantId,
    queryFn: async () => {
      let q = supabase
        .from('leads')
        .select('*', { count: 'exact', head: true })
        .eq('tenant_id', tenantId!)
        .gte('created_at', `${weekStart}T00:00:00`)
      if (dashboardLocIds?.length) {
        q = q.in('location_id', dashboardLocIds)
      }
      const { count, error } = await q
      if (error) throw error
      return count ?? 0
    },
    staleTime: 60_000,
  })

  const { data: trialsThisWeek = 0, isLoading: trialsWeekLoading } = useQuery({
    queryKey: [...qk.dashboard.all, 'trials-week', ...leadsWeekKey],
    enabled: !!tenantId,
    queryFn: async () => {
      let q = supabase
        .from('leads')
        .select('*', { count: 'exact', head: true })
        .eq('tenant_id', tenantId!)
        .eq('stage', 'scheduled')
        .gte('updated_at', `${weekStart}T00:00:00`)
      if (dashboardLocIds?.length) {
        q = q.in('location_id', dashboardLocIds)
      }
      const { count, error } = await q
      if (error) throw error
      return count ?? 0
    },
    staleTime: 60_000,
  })

  const agent = useMemo(() => getAgent(getAgentIdForSurface('dashboard')), [])
  const { avatar, showImg, onImgError } = useAgentAvatarImage(agent.id)
  const greetingName = profile?.first_name?.trim()?.split(/\s+/)[0] ?? 'there'

  const retentionRisk = dash?.atRiskStudents?.length ?? 0
  const collected = billing?.collectedCents ?? 0

  const loading = dashLoading || billingLoading || leadsWeekLoading || trialsWeekLoading
  const showEmpty = dashError || !dash

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
      {/* Hero */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: 20,
          padding: '4px 0 8px',
        }}
      >
        <div
          style={{
            position: 'relative',
            width: 72,
            height: 72,
            borderRadius: 20,
            overflow: 'hidden',
            border: '1px solid rgba(57,255,20,0.35)',
            boxShadow: '0 0 32px rgba(57,255,20,0.12), 0 12px 28px rgba(0,0,0,0.35)',
            background: 'rgba(24,27,38,0.8)',
          }}
        >
          {showImg ? (
            <img
              src={avatar}
              alt=""
              width={72}
              height={72}
              style={{ display: 'block', objectFit: 'cover' }}
              onError={onImgError}
            />
          ) : (
            <div
              style={{
                width: 72,
                height: 72,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 22,
                fontWeight: 800,
                color: '#39ff14',
                letterSpacing: '-0.02em',
              }}
            >
              {agent.name.slice(0, 2).toUpperCase()}
            </div>
          )}
        </div>
        <div style={{ flex: '1 1 220px', minWidth: 0 }}>
          <div
            style={{
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: '0.2em',
              textTransform: 'uppercase',
              color: 'rgba(57,255,20,0.85)',
              marginBottom: 8,
            }}
          >
            ZiroWork · Operating layer
          </div>
          <h1
            style={{
              margin: 0,
              fontSize: 'clamp(1.45rem, 2.4vw, 1.85rem)',
              fontWeight: 750,
              letterSpacing: '-0.03em',
              color: '#f4f6ff',
              lineHeight: 1.15,
            }}
          >
            Hey {greetingName} — {agent.name} has your studio pulse.
          </h1>
          <p style={{ margin: '10px 0 0', fontSize: 15, lineHeight: 1.55, color: 'rgba(198,202,222,0.9)', maxWidth: 560 }}>
            One surface for signals, capacity, pipeline, and cash — so you run the school, not the tabs.
          </p>
        </div>
      </div>

      {/* What matters */}
      <Card elevated title="What matters right now">
        {loading ? (
          <p style={{ margin: 0, color: 'rgba(184,188,208,0.9)' }}>Loading insights…</p>
        ) : topInsights.length === 0 ? (
          <p style={{ margin: 0, color: 'rgba(184,188,208,0.9)' }}>No insights yet for this week.</p>
        ) : (
          <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 14 }}>
            {topInsights.map((line, i) => (
              <li
                key={i}
                style={{
                  display: 'flex',
                  gap: 12,
                  alignItems: 'flex-start',
                  padding: '12px 14px',
                  borderRadius: 12,
                  background: 'rgba(57,255,20,0.06)',
                  border: '1px solid rgba(57,255,20,0.14)',
                }}
              >
                <Sparkles size={18} style={{ color: '#c8ff00', flexShrink: 0, marginTop: 2 }} />
                <span style={{ fontSize: 15, lineHeight: 1.5, color: 'rgba(232,234,244,0.95)' }}>{line}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* KPI grid */}
      <div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            marginBottom: 14,
            color: 'rgba(232,234,244,0.92)',
            fontSize: 13,
            fontWeight: 700,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
          }}
        >
          <Activity size={16} style={{ color: '#39ff14' }} />
          Live KPIs
        </div>
        {showEmpty ? (
          <Card>
            <p style={{ margin: 0, color: 'rgba(232,234,244,0.88)' }}>
              {dashError ? 'Could not load dashboard data. Retry in a moment.' : 'No data yet.'}
            </p>
          </Card>
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(168px, 1fr))',
              gap: 16,
            }}
          >
            <KpiTile label="Active students" value={loading ? '—' : dash!.activeStudents} />
            <KpiTile
              label="Trials this week"
              value={loading ? '—' : trialsThisWeek}
              hint="Trial booked (scheduled) updates this week"
            />
            <KpiTile label="Leads this week" value={loading ? '—' : leadsThisWeek} hint="New leads since Monday" />
            <KpiTile
              label="Teacher availability"
              value={loading ? '—' : dash!.openSlotsThisWeek}
              hint="Open bookable slots this week"
            />
            <KpiTile label="Retention risk" value={loading ? '—' : retentionRisk} hint="At-risk students flagged" />
            <KpiTile
              label="Billing collected (month)"
              value={loading ? '—' : formatUsd(collected)}
              hint="Cash collected MTD (net of refunds)"
            />
          </div>
        )}
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: 16,
        }}
      >
        <Card title="Signals">
          <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 12 }}>
            {PLACEHOLDER_SIGNALS.map((row) => (
              <li
                key={row.t}
                style={{
                  display: 'flex',
                  gap: 10,
                  alignItems: 'flex-start',
                  paddingBottom: 12,
                  borderBottom: '1px solid rgba(255,255,255,0.06)',
                }}
              >
                <Radio size={16} style={{ color: '#39ff14', flexShrink: 0, marginTop: 3 }} />
                <div>
                  <div style={{ fontWeight: 650, color: '#e8eaf4', fontSize: 14 }}>{row.t}</div>
                  <div style={{ fontSize: 13, color: 'rgba(184,188,208,0.88)', marginTop: 4 }}>{row.s}</div>
                </div>
              </li>
            ))}
          </ul>
        </Card>

        <Card title="Next actions">
          <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 12 }}>
            {PLACEHOLDER_ACTIONS.map((row) => (
              <li
                key={row.t}
                style={{
                  display: 'flex',
                  gap: 10,
                  alignItems: 'flex-start',
                  paddingBottom: 12,
                  borderBottom: '1px solid rgba(255,255,255,0.06)',
                }}
              >
                <Target size={16} style={{ color: '#c8ff00', flexShrink: 0, marginTop: 3 }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 650, color: '#e8eaf4', fontSize: 14 }}>{row.t}</div>
                  <div style={{ fontSize: 13, color: 'rgba(184,188,208,0.88)', marginTop: 4 }}>{row.s}</div>
                </div>
                <ArrowRight size={16} style={{ color: 'rgba(139,144,168,0.8)', flexShrink: 0, marginTop: 2 }} />
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <div style={{ marginTop: 4 }}>
        <PageIntelligenceStrip />
      </div>
    </div>
  )
}
