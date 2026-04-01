import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import MusicLoader from '../../components/shared/MusicLoader'
import { useQuery } from '@tanstack/react-query'
import { useAuthContext } from '../../app/AuthContext'
import { useDashboard } from '../../hooks/useDashboard'
import { useBillingSummary, useSquareInvoiceSummary } from '../../hooks/useBillingPage'
import { useLocations } from '../../hooks/useLocations'
import { useStudentFollowups, useDismissFollowup, type StudentFollowup } from '../../hooks/useRetention'
import { supabase } from '../../lib/supabase'
import { Star, X } from 'lucide-react'
import CalloutWizard from '../../components/scheduling/CalloutWizard'
import ReachOutModal from '../../components/students/ReachOutModal'
import TaskCenter from '../../components/tasks/TaskCenter'

export default function Dashboard() {
  const { tenantId } = useAuthContext()
  const { data, isLoading } = useDashboard()
  const { data: locations } = useLocations()
  const navigate = useNavigate()
  const [calloutLocation, setCalloutLocation] = useState<{ id: string; name: string } | null>(null)
  const [reachOutTarget, setReachOutTarget] = useState<StudentFollowup | null>(null)
  const { data: pendingFollowups } = useStudentFollowups({ status: 'pending', dueSoon: true })
  const dismissFollowup = useDismissFollowup()
  const { data: billingSummary } = useBillingSummary()
  const { data: sqSummary } = useSquareInvoiceSummary()

  // Fetch tenant info for business name + logo
  const { data: tenant } = useQuery({
    queryKey: ['tenant', tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data } = await supabase.from('tenants').select('name, slug, logo_url').eq('id', tenantId!).single()
      return data
    },
  })

  if (isLoading || !data) {
    return (
      <div className="page">
        <div className="page-header"><h1>Dashboard</h1></div>
        <div className="loading-screen" style={{ height: 300 }}><MusicLoader /></div>
      </div>
    )
  }

  const hasAlerts = data.newLeadsToday > 0 || data.staleLeadCount > 0 || data.flaggedInventoryCount > 0 || data.needsInstrumentReview > 0 || data.reactivationDueCount > 0

  // Enrolled + lost counts for ops widgets
  const enrolledThisMonth = (data.leadsByStage as Record<string, number>)['enrolled'] ?? 0
  const lostThisMonth = (data.leadsByStage as Record<string, number>)['lost'] ?? 0

  return (
    <div className="page">
      {/* Business Header */}
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

      {/* Task Center — always at top */}
      <TaskCenter />

      {/* Alerts */}
      {hasAlerts && (
        <div className="dash-alerts" style={{ marginBottom: 28 }}>
          {data.newLeadsToday > 0 && (
            <div className="alert alert-pink" onClick={() => navigate('/admin/leads')}>
              <span className="alert-dot" />
              <span><strong>{data.newLeadsToday}</strong> new contact form{data.newLeadsToday !== 1 ? 's' : ''} received today</span>
              <span className="alert-action">View Leads →</span>
            </div>
          )}
          {data.staleLeadCount > 0 && (
            <div className="alert alert-gold" onClick={() => navigate('/admin/leads')}>
              <span className="alert-dot" />
              <span><strong>{data.staleLeadCount}</strong> lead{data.staleLeadCount !== 1 ? 's' : ''} haven't moved in 3+ days</span>
              <span className="alert-action">View Pipeline →</span>
            </div>
          )}
          {data.flaggedInventoryCount > 0 && (
            <div className="alert alert-red" onClick={() => navigate('/admin/settings')}>
              <span className="alert-dot" />
              <span><strong>{data.flaggedInventoryCount}</strong> room issue{data.flaggedInventoryCount !== 1 ? 's' : ''} need attention</span>
              <span className="alert-action">View in Settings →</span>
            </div>
          )}
          {data.needsInstrumentReview > 0 && (
            <div className="alert alert-gold" onClick={() => navigate('/admin/teachers')}>
              <span className="alert-dot" />
              <span><strong>{data.needsInstrumentReview}</strong> teacher{data.needsInstrumentReview !== 1 ? 's' : ''} need instrument assignment</span>
              <span className="alert-action">Review Teachers →</span>
            </div>
          )}
          {data.reactivationDueCount > 0 && (
            <div className="alert alert-pink" onClick={() => navigate('/admin/students')}>
              <span className="alert-dot" />
              <span><strong>{data.reactivationDueCount}</strong> student{data.reactivationDueCount !== 1 ? 's' : ''} due for reactivation follow-up</span>
              <span className="alert-action">View Students →</span>
            </div>
          )}
        </div>
      )}

      {/* Reactivation Opportunities */}
      {pendingFollowups && pendingFollowups.length > 0 && (
        <div style={{ marginBottom: 32 }}>
          <div className="section-header">
            <span className="section-label">Reactivation Opportunities</span>
            <span className="badge-secondary" style={{ fontSize: 10 }}>{pendingFollowups.length}</span>
            <div className="section-line" />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {pendingFollowups.slice(0, 5).map((fu) => {
              const pausedMonths = fu.paused_at
                ? Math.round((Date.now() - new Date(fu.paused_at).getTime()) / (30 * 24 * 60 * 60 * 1000))
                : null
              const followupLabel = fu.followup_date
                ? new Date(fu.followup_date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
                : null
              return (
                <div key={fu.id} style={{
                  padding: '12px 16px', borderRadius: 12,
                  background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)',
                  display: 'flex', alignItems: 'center', gap: 12,
                }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#E0E0F4' }}>
                      {fu.student_name} <span style={{ fontWeight: 400, color: '#A0A0C8' }}>— {fu.student_instrument ? fu.student_instrument.charAt(0).toUpperCase() + fu.student_instrument.slice(1) : ''}</span>
                      {fu.location_name && <span style={{ fontWeight: 400, color: '#8080A8' }}> · {fu.location_name}</span>}
                    </div>
                    <div style={{ fontSize: 11, color: '#8080A8', marginTop: 2 }}>
                      {pausedMonths != null && <span>Paused {pausedMonths}mo ago</span>}
                      {fu.pause_reason && <span> · {fu.pause_reason}</span>}
                      {followupLabel && <span> · Follow-up: {followupLabel}</span>}
                    </div>
                  </div>
                  <button onClick={() => setReachOutTarget(fu)} className="btn-outline" style={{ fontSize: 11, padding: '5px 14px', color: '#22C55E', borderColor: 'rgba(34,197,94,0.3)' }}>
                    Reach Out
                  </button>
                  <button onClick={() => dismissFollowup.mutateAsync(fu.id)} style={{
                    background: 'none', border: 'none', cursor: 'pointer', color: '#606088', padding: 4,
                  }} title="Dismiss"><X size={14} /></button>
                </div>
              )
            })}
            {pendingFollowups.length > 5 && (
              <div style={{ textAlign: 'center', fontSize: 11, color: '#8080A8', padding: 4 }}>
                + {pendingFollowups.length - 5} more
              </div>
            )}
          </div>
        </div>
      )}

      {/* Reach Out Modal */}
      {reachOutTarget && <ReachOutModal followup={reachOutTarget} onClose={() => setReachOutTarget(null)} />}

      {/* Today's Snapshot — Location Cards */}
      <div style={{ marginBottom: 32 }}>
        <div className="section-header">
          <span className="section-label">Today's Snapshot</span>
          <div className="section-line" />
        </div>
        <div className="location-grid">
          {data.locationSummary.map((loc, idx) => {
            const edgeColors = [
              { grad: 'linear-gradient(180deg, #D4226A, #FF5500)', glow: 'rgba(212,34,106,0.1)', shadow: '0 0 18px rgba(212,34,106,0.5)', border: 'rgba(212,34,106,0.2)' },
              { grad: 'linear-gradient(180deg, #FF5500, #FF8C00)', glow: 'rgba(255,85,0,0.09)', shadow: '0 0 18px rgba(255,85,0,0.45)', border: 'rgba(255,85,0,0.18)' },
              { grad: 'linear-gradient(180deg, #D97706, #FFB800)', glow: 'rgba(255,184,0,0.09)', shadow: '0 0 18px rgba(255,184,0,0.4)', border: 'rgba(255,184,0,0.18)' },
              { grad: 'linear-gradient(180deg, #A73C96, #C060B0)', glow: 'rgba(167,60,150,0.09)', shadow: '0 0 18px rgba(167,60,150,0.4)', border: 'rgba(167,60,150,0.18)' },
            ]
            const edge = edgeColors[idx % edgeColors.length]
            return (
            <div
              key={loc.name}
              className="location-card card-hover"
              style={{ borderColor: edge.border }}
              onClick={() => {
                if (loc.locationId) navigate(`/admin/students?location=${loc.locationId}`)
                else navigate('/admin/schedule')
              }}
            >
              <div className="loc-card-edge" style={{ background: edge.grad, boxShadow: edge.shadow }} />
              <div className="loc-card-glow" style={{ background: `radial-gradient(circle, ${edge.glow} 0%, transparent 70%)` }} />
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
                <div className="location-metric-row">
                  <span className="location-metric-key">Leads Waiting</span>
                  <span className="location-metric-value accent-red">0</span>
                </div>
              </div>
            </div>
            )
          })}
        </div>
      </div>

      {/* FINANCIALS SECTION */}
      <div style={{ marginBottom: 32 }}>
        <div className="section-header">
          <span className="section-label">Financials</span>
          <div className="section-line" />
        </div>
        <div className="financial-grid" onClick={() => navigate('/admin/billing')} style={{ cursor: 'pointer' }}>
          {/* Scheduled Invoice Revenue — GREEN */}
          <div className="financial-card" style={{
            background: 'linear-gradient(150deg, rgba(6,18,9,0.97), rgba(4,12,6,0.99))',
            border: '1px solid rgba(34,197,94,0.2)',
            boxShadow: '0 14px 52px rgba(0,0,0,0.65), inset 0 1px 0 rgba(34,197,94,0.14), 0 0 0 1px rgba(22,163,74,0.04)'
          }}>
            <div className="financial-card-edge" style={{
              background: 'linear-gradient(180deg, #16A34A, #22C55E, #16A34A)',
              boxShadow: '0 0 24px rgba(22,163,74,0.65), 0 0 60px rgba(22,163,74,0.2)'
            }} />
            <div className="financial-card-glow-top" style={{ background: 'radial-gradient(circle, rgba(22,163,74,0.18) 0%, transparent 70%)' }} />
            <div className="financial-card-glow-bottom" style={{ background: 'radial-gradient(circle, rgba(22,163,74,0.08) 0%, transparent 70%)' }} />
            <div className="financial-card-content">
              <div className="financial-label">Scheduled Invoice Revenue</div>
              <div className="financial-value">{sqSummary ? `$${(sqSummary.actualRevenueCents / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}` : '—'}</div>
              <div className="financial-sub">{sqSummary ? 'Queued to charge after adjustments' : 'Loading...'}</div>
            </div>
          </div>

          {/* Family Monthly Rate — GOLD */}
          <div className="financial-card" style={{
            background: 'linear-gradient(150deg, rgba(13,10,4,0.97), rgba(9,7,3,0.99))',
            border: '1px solid rgba(251,191,36,0.18)',
            boxShadow: '0 14px 52px rgba(0,0,0,0.65), inset 0 1px 0 rgba(251,191,36,0.12)'
          }}>
            <div className="financial-card-edge" style={{
              background: 'linear-gradient(180deg, #D97706, #FBBF24, #D97706)',
              boxShadow: '0 0 24px rgba(251,191,36,0.55), 0 0 60px rgba(255,184,0,0.18)'
            }} />
            <div className="financial-card-glow-top" style={{ background: 'radial-gradient(circle, rgba(251,191,36,0.16) 0%, transparent 70%)' }} />
            <div className="financial-card-glow-bottom" style={{ background: 'radial-gradient(circle, rgba(255,184,0,0.07) 0%, transparent 70%)' }} />
            <div className="financial-card-content">
              <div className="financial-label">Family Monthly Rate</div>
              <div className="financial-value">{sqSummary ? `$${(sqSummary.recurringSeriesCents / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}` : '—'}</div>
              <div className="financial-sub">{sqSummary ? 'Total locked-in monthly rate before adjustments' : 'Loading...'}</div>
            </div>
          </div>

          {/* Overdue — RED */}
          <div className="financial-card" style={{
            background: 'linear-gradient(150deg, rgba(15,5,5,0.97), rgba(10,3,3,0.99))',
            border: '1px solid rgba(239,68,68,0.18)',
            boxShadow: '0 14px 52px rgba(0,0,0,0.65), inset 0 1px 0 rgba(239,68,68,0.12)'
          }}>
            <div className="financial-card-edge" style={{
              background: 'linear-gradient(180deg, #B91C1C, #EF4444, #B91C1C)',
              boxShadow: '0 0 24px rgba(239,68,68,0.5), 0 0 60px rgba(220,38,38,0.16)'
            }} />
            <div className="financial-card-glow-top" style={{ background: 'radial-gradient(circle, rgba(239,68,68,0.15) 0%, transparent 70%)' }} />
            <div className="financial-card-glow-bottom" style={{ background: 'radial-gradient(circle, rgba(220,38,38,0.07) 0%, transparent 70%)' }} />
            <div className="financial-card-content">
              <div className="financial-label">Overdue</div>
              <div className="financial-value">{sqSummary ? (sqSummary.overdueCents > 0 ? `$${(sqSummary.overdueCents / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}` : '$0.00') : '—'}</div>
              <div className="financial-sub">{sqSummary ? (sqSummary.overdueFamilyCount > 0 ? `${sqSummary.overdueFamilyCount} families overdue` : 'No overdue invoices') : 'Loading...'}</div>
            </div>
          </div>
        </div>
        {/* Monthly Adjustments delta */}
        {sqSummary && sqSummary.adjustmentDeltaCents !== 0 ? (
          <div style={{ textAlign: 'center', marginTop: 8, padding: '6px 0' }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: '#8080A8' }}>Monthly Adjustments </span>
            <span style={{ fontSize: 12, fontWeight: 700, color: '#A0A0C8' }}>-${(Math.abs(sqSummary.adjustmentDeltaCents) / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
            <span style={{ fontSize: 11, color: '#606088', marginLeft: 6 }}>credits &amp; discounts this cycle</span>
          </div>
        ) : sqSummary ? (
          <div style={{ textAlign: 'center', marginTop: 8, padding: '6px 0' }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: '#606088' }}>No adjustments this cycle</span>
          </div>
        ) : null}
      </div>

      {/* Ops Widgets — 5 widgets */}
      <div style={{ marginBottom: 32 }}>
        <div className="section-header">
          <span className="section-label">Operations</span>
          <div className="section-line" />
        </div>
        <div className="ops-grid">
          {/* Active Students */}
          <div className="ops-widget" style={{ borderColor: 'rgba(212,34,106,0.2)' }} onClick={() => navigate('/admin/students')}>
            <div className="ops-widget-edge" style={{ background: 'linear-gradient(180deg, #D4226A, #FF5500)', boxShadow: '0 0 18px rgba(212,34,106,0.52)' }} />
            <div className="ops-widget-glow" style={{ background: 'radial-gradient(circle, rgba(212,34,106,0.1) 0%, transparent 70%)' }} />
            <div className="ops-widget-label">Active Students</div>
            <div className="ops-widget-value">{data.activeStudents}</div>
            <div className="ops-widget-sub">
              {Object.entries(data.studentsByLocation).map(([loc, n]) => (
                <span key={loc}>{loc}: {n}  </span>
              ))}
              {data.activeStudents === 0 && <span>No students yet</span>}
            </div>
          </div>

          {/* Open Slots */}
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
            <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', marginTop: 10, paddingTop: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 10, fontWeight: 700, color: '#8080A8', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Potential Revenue</span>
                <span style={{ fontSize: 16, fontWeight: 800, color: '#FFB800' }}>${(data.openSlotsThisWeek * 160).toLocaleString()}/mo</span>
              </div>
              <div style={{ fontSize: 10, color: '#606088', marginTop: 2 }}>{data.openSlotsThisWeek} open slots × $160 avg</div>
            </div>
          </div>

          {/* Leads in Pipeline */}
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

          {/* Enrollments / Month */}
          <div className="ops-widget" style={{ borderColor: 'rgba(255,184,0,0.18)' }} onClick={() => navigate('/admin/leads')}>
            <div className="ops-widget-edge" style={{ background: 'linear-gradient(180deg, #D97706, #FFB800)', boxShadow: '0 0 18px rgba(255,184,0,0.4)' }} />
            <div className="ops-widget-glow" style={{ background: 'radial-gradient(circle, rgba(255,184,0,0.09) 0%, transparent 70%)' }} />
            <div className="ops-widget-label">Enrollments / Month</div>
            <div className="ops-widget-value">{enrolledThisMonth}</div>
            <div className="ops-widget-sub">Leads converted to students</div>
          </div>

          {/* Lost This Month */}
          <div className="ops-widget" style={{ borderColor: 'rgba(167,60,150,0.18)' }}>
            <div className="ops-widget-edge" style={{ background: 'linear-gradient(180deg, #A73C96, #C060B0)', boxShadow: '0 0 18px rgba(167,60,150,0.4)' }} />
            <div className="ops-widget-glow" style={{ background: 'radial-gradient(circle, rgba(167,60,150,0.09) 0%, transparent 70%)' }} />
            <div className="ops-widget-label">Lost This Month</div>
            <div className="ops-widget-value">{lostThisMonth}</div>
            <div className="ops-widget-sub">Leads marked as lost</div>
          </div>
        </div>
      </div>
      {calloutLocation && (
        <CalloutWizard
          locationId={calloutLocation.id}
          locationName={calloutLocation.name}
          onClose={() => setCalloutLocation(null)}
        />
      )}
    </div>
  )
}
