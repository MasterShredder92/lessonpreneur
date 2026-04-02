import { useNavigate } from 'react-router-dom'
import MusicLoader from '../../components/shared/MusicLoader'
import { useQuery } from '@tanstack/react-query'
import { useAuthContext } from '../../app/AuthContext'
import { useDashboard } from '../../hooks/useDashboard'
import { useBillingHeroStats } from '../../hooks/useBillingPage'
import { useUserLocations } from '../../hooks/useUserLocations'
import { supabase } from '../../lib/supabase'
import { Star, Video } from 'lucide-react'
import TaskCenter from '../../components/tasks/TaskCenter'
import WhatsImportantNow from '../../components/admin/WhatsImportantNow'
import { getLocationColor } from '../../utils/locationColor'

export default function Dashboard() {
  const { tenantId } = useAuthContext()
  const { data: userLocations } = useUserLocations()
  const { data, isLoading } = useDashboard(userLocations)
  const navigate = useNavigate()
  const { data: heroStats } = useBillingHeroStats()

  // Fetch tenant info for business name + logo
  const { data: tenant } = useQuery({
    queryKey: ['tenant', tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data } = await supabase.from('tenants').select('name, slug, logo_url').eq('id', tenantId!).single()
      return data
    },
  })

  // Last month virtual sessions summary
  const { data: virtualSummary } = useQuery({
    queryKey: ['virtual-summary-last-month'],
    queryFn: async () => {
      const now = new Date()
      const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1)
      const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0)
      const startStr = lastMonthStart.toISOString().split('T')[0]
      const endStr = lastMonthEnd.toISOString().split('T')[0]

      const { data: virtualBlocks } = await supabase
        .from('schedule_blocks')
        .select('id, location_id')
        .eq('is_virtual', true)
        .gte('block_date', startStr)
        .lte('block_date', endStr)

      if (!virtualBlocks || virtualBlocks.length === 0) return null

      const blockIds = virtualBlocks.map(b => b.id)
      const locationCount = new Set(virtualBlocks.map(b => b.location_id)).size

      const { count: notifCount } = await supabase
        .from('appointment_notifications')
        .select('*', { count: 'exact', head: true })
        .in('block_id', blockIds)

      const { count: failCount } = await supabase
        .from('appointment_notifications')
        .select('*', { count: 'exact', head: true })
        .in('block_id', blockIds)
        .eq('success', false)

      return {
        sessions: virtualBlocks.length,
        locations: locationCount,
        notifications: notifCount ?? 0,
        failures: failCount ?? 0,
        monthLabel: lastMonthStart.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
      }
    },
    staleTime: 1000 * 60 * 5,
  })

  if (isLoading || !data) {
    return (
      <div className="page">
        <div className="page-header"><h1>Dashboard</h1></div>
        <div className="loading-screen" style={{ height: 300 }}><MusicLoader /></div>
      </div>
    )
  }

  // Enrolled + lost counts for ops widgets
  const enrolledThisMonth = (data.leadsByStage as Record<string, number>)['enrolled'] ?? 0
  const lostThisMonth = (data.leadsByStage as Record<string, number>)['lost'] ?? 0

  const dollars = (cents: number) => `$${(Math.abs(cents) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

  return (
    <div className="page">
      {/* Business Header + Star AI Bar */}
      <div className="dash-business-header">
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
        <div
          className="ai-ask-bar"
          onClick={() => window.dispatchEvent(new CustomEvent('open-ai-panel'))}
        >
          <Star size={14} style={{ color: '#FFB800', flexShrink: 0 }} />
          <span className="ai-ask-text">Ask Star anything about your business...</span>
          <span className="ai-ask-badge">Star</span>
        </div>
      </div>

      {/* 1. What's Important Now — AI Insight Cards (FIRST after header) */}
      <WhatsImportantNow data={data} heroStats={heroStats} />

      {/* 2. Today's Snapshot — Location Cards */}
      <div style={{ marginBottom: 16 }}>
        <div className="section-header" style={{ marginBottom: 8 }}>
          <span className="section-label">Today's Snapshot</span>
          <div className="section-line" />
        </div>
        <div className="location-grid">
          {data.locationSummary.map((loc) => {
            const c = getLocationColor(loc.locationId)
            return (
            <div
              key={loc.name}
              className="location-card card-hover"
              style={{ borderColor: `${c}30` }}
              onClick={() => {
                if (loc.locationId) navigate(`/admin/students?location=${loc.locationId}`)
                else navigate('/admin/schedule')
              }}
            >
              <div className="loc-card-edge" style={{ background: `linear-gradient(180deg, ${c}, ${c}CC)`, boxShadow: `0 0 18px ${c}80` }} />
              <div className="loc-card-glow" style={{ background: `radial-gradient(circle, ${c}18 0%, transparent 70%)` }} />
              <div className="location-card-header">
                <span className="location-name">{loc.name}</span>
              </div>
              <div className="location-metrics">
                <div className="location-metric-row">
                  <span className="location-metric-key">Active Students</span>
                  <span className="location-metric-value">{loc.students}</span>
                </div>
                <div className="location-divider" />
                <div className="location-metric-row">
                  <span className="location-metric-key">Teachers Scheduled</span>
                  <span className="location-metric-value">{loc.teachersToday}</span>
                </div>
                <div className="location-metric-row">
                  <span className="location-metric-key">Open Slots</span>
                  <span className="location-metric-value">{loc.openSlotsToday}</span>
                </div>
              </div>
            </div>
            )
          })}
        </div>
      </div>

      {/* 3. Billing Snapshot — premium cards matching Billing page */}
      {heroStats && (
        <div style={{ marginBottom: 16 }}>
          <div className="section-header" style={{ marginBottom: 8 }}>
            <span className="section-label">Billing Snapshot</span>
            <div className="section-line" />
          </div>
          <div className="financial-grid" style={{ marginBottom: 6 }}>
            {/* Paid This Month — GREEN */}
            <div className="financial-card" style={{ background: 'linear-gradient(150deg, rgba(6,18,9,0.97), rgba(4,12,6,0.99))', border: '1px solid rgba(34,197,94,0.2)', boxShadow: '0 14px 52px rgba(0,0,0,0.65), inset 0 1px 0 rgba(34,197,94,0.14)', cursor: 'pointer' }} onClick={() => navigate('/admin/billing')}>
              <div className="financial-card-edge" style={{ background: 'linear-gradient(#16A34A, #22C55E, #16A34A)', boxShadow: '0 0 24px rgba(22,163,74,0.65), 0 0 60px rgba(22,163,74,0.2)' }} />
              <div className="financial-card-glow-top" style={{ background: 'radial-gradient(circle, rgba(22,163,74,0.18) 0%, transparent 70%)' }} />
              <div className="financial-card-glow-bottom" style={{ background: 'radial-gradient(circle, rgba(22,163,74,0.08) 0%, transparent 70%)' }} />
              <div className="financial-card-content">
                <div className="financial-label">Paid This Month</div>
                <div className="financial-value">{dollars(heroStats.paidThisMonthCents ?? 0)}</div>
                <div className="financial-sub">Confirmed payments collected</div>
              </div>
            </div>
            {/* Remaining to Collect — GOLD */}
            <div className="financial-card" style={{ background: 'linear-gradient(150deg, rgba(13,10,4,0.97), rgba(9,7,3,0.99))', border: '1px solid rgba(251,191,36,0.18)', boxShadow: '0 14px 52px rgba(0,0,0,0.65), inset 0 1px 0 rgba(251,191,36,0.12)', cursor: 'pointer' }} onClick={() => navigate('/admin/billing')}>
              <div className="financial-card-edge" style={{ background: 'linear-gradient(#D97706, #FBBF24, #D97706)', boxShadow: '0 0 24px rgba(251,191,36,0.55), 0 0 60px rgba(255,184,0,0.18)' }} />
              <div className="financial-card-glow-top" style={{ background: 'radial-gradient(circle, rgba(251,191,36,0.16) 0%, transparent 70%)' }} />
              <div className="financial-card-glow-bottom" style={{ background: 'radial-gradient(circle, rgba(255,184,0,0.07) 0%, transparent 70%)' }} />
              <div className="financial-card-content">
                <div className="financial-label">Remaining to Collect</div>
                <div className="financial-value">{dollars(heroStats.remainingToCollectCents ?? 0)}</div>
                <div className="financial-sub">Invoices sent minus payments received</div>
              </div>
            </div>
            {/* Total Overdue — RED */}
            <div className="financial-card" style={{ background: 'linear-gradient(150deg, rgba(15,5,5,0.97), rgba(10,3,3,0.99))', border: '1px solid rgba(239,68,68,0.18)', boxShadow: '0 14px 52px rgba(0,0,0,0.65), inset 0 1px 0 rgba(239,68,68,0.12)', cursor: 'pointer' }} onClick={() => navigate('/admin/billing')}>
              <div className="financial-card-edge" style={{ background: 'linear-gradient(#B91C1C, #EF4444, #B91C1C)', boxShadow: '0 0 24px rgba(239,68,68,0.5), 0 0 60px rgba(220,38,38,0.16)' }} />
              <div className="financial-card-glow-top" style={{ background: 'radial-gradient(circle, rgba(239,68,68,0.15) 0%, transparent 70%)' }} />
              <div className="financial-card-glow-bottom" style={{ background: 'radial-gradient(circle, rgba(220,38,38,0.07) 0%, transparent 70%)' }} />
              <div className="financial-card-content">
                <div className="financial-label">Total Overdue</div>
                <div className="financial-value">{(heroStats.totalOverdueCents ?? 0) > 0 ? dollars(heroStats.totalOverdueCents ?? 0) : '$0.00'}</div>
                <div className="financial-sub">{(heroStats.totalOverdueCents ?? 0) > 0 ? `${heroStats.familiesOutstanding ?? 0} families past grace period` : 'No overdue invoices'}</div>
              </div>
            </div>
          </div>
          {/* Collection Progress */}
          {(() => {
            const paid = heroStats.paidThisMonthCents ?? 0
            const total = (heroStats.remainingToCollectCents ?? 0) + paid
            const pct = total > 0 ? Math.round((paid / total) * 100) : 0
            return (
              <div style={{ padding: '8px 14px', borderRadius: 10, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                  <span style={{ fontSize: 10, fontWeight: 700, color: '#8080A8' }}>Collection Progress</span>
                  <span style={{ fontSize: 10, fontWeight: 700, color: '#A0A0C8' }}>{pct}%</span>
                </div>
                <div style={{ height: 5, borderRadius: 3, background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
                  <div style={{ height: '100%', borderRadius: 3, background: 'linear-gradient(90deg, #16A34A, #22C55E)', width: `${pct}%`, transition: 'width 300ms ease' }} />
                </div>
                <div style={{ fontSize: 10, color: '#606088', marginTop: 3 }}>
                  {dollars(paid)} paid of {dollars(total)} expected
                </div>
              </div>
            )
          })()}
        </div>
      )}

      {/* 4. Operations Metrics */}
      <div style={{ marginBottom: 16 }}>
        <div className="section-header" style={{ marginBottom: 8 }}>
          <span className="section-label">Operations</span>
          <div className="section-line" />
        </div>
        <div className="ops-grid">
          <div className="ops-widget" style={{ borderColor: 'rgba(212,34,106,0.2)' }} onClick={() => navigate('/admin/students')}>
            <div className="ops-widget-edge" style={{ background: 'linear-gradient(180deg, #D4226A, #FF5500)', boxShadow: '0 0 18px rgba(212,34,106,0.52)' }} />
            <div className="ops-widget-glow" style={{ background: 'radial-gradient(circle, rgba(212,34,106,0.1) 0%, transparent 70%)' }} />
            <div className="ops-widget-label">Active Students</div>
            <div className="ops-widget-value">{data.activeStudents}</div>
            <div className="ops-widget-sub">
              {Object.entries(data.studentsByLocation).map(([loc, n]) => (
                <span key={loc}>{loc}: {n}  </span>
              ))}
            </div>
          </div>
          <div className="ops-widget" style={{ borderColor: 'rgba(255,120,0,0.18)' }} onClick={() => navigate('/admin/schedule')}>
            <div className="ops-widget-edge" style={{ background: 'linear-gradient(180deg, #FF5500, #FF8C00)', boxShadow: '0 0 18px rgba(255,85,0,0.48)' }} />
            <div className="ops-widget-glow" style={{ background: 'radial-gradient(circle, rgba(255,85,0,0.09) 0%, transparent 70%)' }} />
            <div className="ops-widget-label">Open Slots This Week</div>
            <div className="ops-widget-value">{data.openSlotsThisWeek}</div>
            <div className="ops-widget-sub">
              {Object.entries(data.slotsByLocation).map(([loc, n]) => (
                <span key={loc}>{loc}: {n}  </span>
              ))}
            </div>
          </div>
          <div className="ops-widget" style={{ borderColor: 'rgba(232,72,144,0.18)' }} onClick={() => navigate('/admin/leads')}>
            <div className="ops-widget-edge" style={{ background: 'linear-gradient(180deg, #BE185D, #E8488A)', boxShadow: '0 0 18px rgba(232,72,144,0.44)' }} />
            <div className="ops-widget-glow" style={{ background: 'radial-gradient(circle, rgba(232,72,144,0.09) 0%, transparent 70%)' }} />
            <div className="ops-widget-label">Leads in Pipeline</div>
            <div className="ops-widget-value">{data.leadsInPipeline}</div>
            <div className="ops-widget-sub">
              {Object.entries(data.leadsByStage).filter(([s]) => !['enrolled', 'lost'].includes(s)).map(([stage, n]) => (
                <span key={stage}>{stage}: {n}  </span>
              ))}
            </div>
          </div>
          <div className="ops-widget" style={{ borderColor: 'rgba(255,184,0,0.18)' }} onClick={() => navigate('/admin/leads')}>
            <div className="ops-widget-edge" style={{ background: 'linear-gradient(180deg, #D97706, #FFB800)', boxShadow: '0 0 18px rgba(255,184,0,0.4)' }} />
            <div className="ops-widget-glow" style={{ background: 'radial-gradient(circle, rgba(255,184,0,0.09) 0%, transparent 70%)' }} />
            <div className="ops-widget-label">Enrolled This Month</div>
            <div className="ops-widget-value">{enrolledThisMonth}</div>
            <div className="ops-widget-sub">Leads converted to students</div>
          </div>
          <div className="ops-widget" style={{ borderColor: 'rgba(167,60,150,0.18)' }} onClick={() => navigate('/admin/retention?tab=win-back')}>
            <div className="ops-widget-edge" style={{ background: 'linear-gradient(180deg, #A73C96, #C060B0)', boxShadow: '0 0 18px rgba(167,60,150,0.4)' }} />
            <div className="ops-widget-glow" style={{ background: 'radial-gradient(circle, rgba(167,60,150,0.09) 0%, transparent 70%)' }} />
            <div className="ops-widget-label">Lost This Month</div>
            <div className="ops-widget-value">{lostThisMonth}</div>
            <div className="ops-widget-sub">Leads marked as lost</div>
          </div>
        </div>
      </div>

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
      <TaskCenter compact limit={2} />
    </div>
  )
}
