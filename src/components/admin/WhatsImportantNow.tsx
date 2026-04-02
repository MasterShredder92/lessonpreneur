import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthContext } from '../../app/AuthContext'
import { supabase } from '../../lib/supabase'
import { Star, ChevronLeft, ChevronRight } from 'lucide-react'

// ─── Types ───────────────────────────────────────────

interface Insight {
  priority: 'critical' | 'warning' | 'info' | 'positive'
  title: string
  body: string
  metric: string | null
  metricLabel: string | null
  action: string | null
  actionRoute: string | null
}

const priorityConfig = {
  critical: { color: '#ef4444', bg: 'rgba(239,68,68,0.09)', border: 'rgba(239,68,68,0.25)', icon: '\uD83D\uDD34', label: 'CRITICAL' },
  warning:  { color: '#fb923c', bg: 'rgba(251,146,60,0.09)', border: 'rgba(251,146,60,0.25)', icon: '\uD83D\uDFE0', label: 'ATTENTION' },
  info:     { color: '#3b82f6', bg: 'rgba(59,130,246,0.09)', border: 'rgba(59,130,246,0.25)', icon: '\uD83D\uDD35', label: 'INFO' },
  positive: { color: '#22c55e', bg: 'rgba(34,197,94,0.09)', border: 'rgba(34,197,94,0.25)', icon: '\uD83D\uDFE2', label: 'GOOD NEWS' },
}

const PRIORITY_ORDER = { critical: 0, warning: 1, info: 2, positive: 3 }

// ─── Main Component ──────────────────────────────────

interface Props {
  data: any
  heroStats: any
}

export default function WhatsImportantNow({ data, heroStats }: Props) {
  const { tenantId } = useAuthContext()
  const navigate = useNavigate()
  const [insights, setInsights] = useState<Insight[]>([])
  const [loading, setLoading] = useState(false)
  const [generated, setGenerated] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const [failed, setFailed] = useState(false)

  const calledRef = useRef(false)
  useEffect(() => {
    if (calledRef.current || !data || !tenantId) return
    calledRef.current = true
    generate()
  }, [data, tenantId])

  const generate = async () => {
    setLoading(true)
    try {
      const session = await supabase.auth.getSession()
      const token = session.data.session?.access_token
      if (!token) { setFailed(true); setLoading(false); setGenerated(true); return }

      const context = [
        `Active students: ${data.activeStudents}`,
        `Open slots this week: ${data.openSlotsThisWeek}`,
        `Leads in pipeline: ${data.leadsInPipeline}`,
        data.staleLeadCount > 0 ? `Stale leads (3+ days no contact): ${data.staleLeadCount}` : `Stale leads: 0`,
        data.newLeadsToday > 0 ? `New leads today: ${data.newLeadsToday}` : null,
        data.reactivationDueCount > 0 ? `Students due for reactivation outreach: ${data.reactivationDueCount}` : null,
        data.atRiskStudents?.length > 0 ? `At-risk students (14+ days since last session): ${data.atRiskStudents.length}` : `At-risk students: 0`,
        data.flaggedInventoryCount > 0 ? `Room issues flagged: ${data.flaggedInventoryCount}` : null,
        heroStats ? `Remaining to collect this month: $${(heroStats.remainingToCollectCents / 100).toLocaleString()}` : null,
        heroStats?.familiesOutstanding > 0 ? `Families outstanding (past grace period): ${heroStats.familiesOutstanding}` : null,
        heroStats?.paidThisMonthCents > 0 ? `Paid this month: $${(heroStats.paidThisMonthCents / 100).toLocaleString()}` : `Paid this month: $0`,
        heroStats ? `Families with invoices this month: ${heroStats.familiesWithInvoices}` : null,
        data.sessionLogsToday > 0 ? `Session logs recorded today: ${data.sessionLogsToday}` : `Session logs today: 0`,
        data.sessionLogsThisWeek > 0 ? `Session logs this week: ${data.sessionLogsThisWeek}` : null,
        `Location student breakdown: ${Object.entries(data.studentsByLocation).map(([k, v]) => `${k}: ${v}`).join(', ')}`,
        `Open slots by location: ${Object.entries(data.slotsByLocation).map(([k, v]) => `${k}: ${v}`).join(', ')}`,
      ].filter(Boolean).join('\n')

      const res = await fetch(
        'https://dhsyxyhtoadrqfrlmsqe.supabase.co/functions/v1/ai-assistant',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({
            question: `Analyze this music school data and return structured insights:\n\n${context}`,
            tenant_id: tenantId,
            conversation_history: [],
            system_override: `You are an operational intelligence system for a music school. Analyze the data provided and return ONLY a valid JSON array of insight objects. No markdown, no prose, no backticks, no code fences. Just the raw JSON array.

Each insight must have these exact fields:
- "priority": one of "critical", "warning", "info", "positive"
- "title": short specific title (e.g. "20 At-Risk Students")
- "body": 1-2 sentences explaining why this matters and what to do about it
- "metric": the key number as a string (e.g. "20" or "$98,465"), or null if no single metric
- "metricLabel": what the metric means (e.g. "students at risk"), or null
- "action": button text for suggested next step (e.g. "View At-Risk List"), or null
- "actionRoute": the app route to navigate to, or null. Valid routes: /admin/students, /admin/leads, /admin/schedule, /admin/billing, /admin/teachers

Rules:
- Generate 3-6 insights
- Sort by priority: critical first, then warning, then info, then positive
- Be direct and specific. Use real numbers from the data.
- critical = needs action today (student attrition risk, stale leads going cold)
- warning = needs attention soon (outstanding billing, open slots to fill)
- info = worth knowing (operational stats, capacity data)
- positive = good news (steady metrics, strong engagement)
- If at-risk students > 0, that's always critical
- If stale leads > 0, that's warning or critical depending on count
- Always include at least one positive insight if the data supports it
- NEVER include generic motivational fluff. Every insight must reference specific data.`,
          }),
        }
      )

      const result = await res.json()
      const answer = result.answer ?? ''

      // Parse JSON — try to extract array from response
      let parsed: Insight[] = []
      try {
        // Try direct parse first
        parsed = JSON.parse(answer)
      } catch {
        // Try extracting JSON from markdown code block
        const match = answer.match(/\[[\s\S]*\]/)
        if (match) {
          try { parsed = JSON.parse(match[0]) } catch { /* fall through */ }
        }
      }

      if (!Array.isArray(parsed) || parsed.length === 0) {
        console.warn('[WhatsImportantNow] Failed to parse AI response as JSON:', answer?.slice(0, 200))
      }
      if (Array.isArray(parsed) && parsed.length > 0) {
        // Validate and sort
        const valid = parsed
          .filter((i: any) => i.priority && i.title && i.body)
          .map((i: any): Insight => ({
            priority: (['critical', 'warning', 'info', 'positive'].includes(i.priority) ? i.priority : 'info') as Insight['priority'],
            title: String(i.title),
            body: String(i.body),
            metric: i.metric ? String(i.metric) : null,
            metricLabel: i.metricLabel ? String(i.metricLabel) : null,
            action: i.action ? String(i.action) : null,
            actionRoute: i.actionRoute ? String(i.actionRoute) : null,
          }))
          .sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority])

        setInsights(valid)
      } else {
        setFailed(true)
      }
    } catch {
      setFailed(true)
    }
    setLoading(false)
    setGenerated(true)
  }

  // Swipe support for mobile
  const touchStartX = useRef(0)

  // Hide on failure
  if (failed && !loading) return null
  if (!loading && insights.length === 0) return null

  const criticalCount = insights.filter(i => i.priority === 'critical').length
  const warningCount = insights.filter(i => i.priority === 'warning').length
  const current = insights[activeIndex]
  const currentConfig = current ? priorityConfig[current.priority] : priorityConfig.info

  const goTo = (idx: number) => {
    setActiveIndex(Math.max(0, Math.min(idx, insights.length - 1)))
  }
  const handleTouchStart = (e: React.TouchEvent) => { touchStartX.current = e.touches[0].clientX }
  const handleTouchEnd = (e: React.TouchEvent) => {
    const diff = touchStartX.current - e.changedTouches[0].clientX
    if (Math.abs(diff) > 50) { // 50px threshold
      if (diff > 0) goTo(activeIndex + 1) // swipe left → next
      else goTo(activeIndex - 1)           // swipe right → prev
    }
  }

  return (
    <div style={{ marginBottom: 24 }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10,
        padding: '0 2px',
      }}>
        <Star size={14} style={{ color: '#f59e0b', flexShrink: 0 }} />
        <span style={{ fontSize: 10, fontWeight: 700, color: '#f59e0b', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          What Matters Right Now
        </span>

        {/* Priority badges */}
        {criticalCount > 0 && (
          <span style={{
            fontSize: 9, fontWeight: 700, padding: '2px 8px', borderRadius: 999,
            background: 'rgba(239,68,68,0.15)', color: '#ef4444',
          }}>
            {criticalCount} critical
          </span>
        )}
        {warningCount > 0 && (
          <span style={{
            fontSize: 9, fontWeight: 700, padding: '2px 8px', borderRadius: 999,
            background: 'rgba(251,146,60,0.15)', color: '#fb923c',
          }}>
            {warningCount} warning
          </span>
        )}

        <div style={{ flex: 1 }} />

        {/* Navigation arrows */}
        {insights.length > 1 && (
          <div style={{ display: 'flex', gap: 4 }}>
            <button onClick={() => goTo(activeIndex - 1)} disabled={activeIndex === 0} style={{
              background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 6, padding: '3px 6px', cursor: activeIndex === 0 ? 'default' : 'pointer',
              color: activeIndex === 0 ? '#363656' : '#8080A8', display: 'flex', alignItems: 'center',
            }}>
              <ChevronLeft size={14} />
            </button>
            <button onClick={() => goTo(activeIndex + 1)} disabled={activeIndex === insights.length - 1} style={{
              background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 6, padding: '3px 6px', cursor: activeIndex === insights.length - 1 ? 'default' : 'pointer',
              color: activeIndex === insights.length - 1 ? '#363656' : '#8080A8', display: 'flex', alignItems: 'center',
            }}>
              <ChevronRight size={14} />
            </button>
          </div>
        )}
      </div>

      {/* Card area — swipeable on mobile */}
      <div
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        style={{ minHeight: 190, position: 'relative', touchAction: 'pan-y' }}
      >
        {loading ? (
          <div style={{
            height: 190, borderRadius: 14,
            background: 'rgba(245,158,11,0.04)', border: '1px solid rgba(245,158,11,0.1)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            animation: 'pulse 1.5s ease-in-out infinite',
          }}>
            <div style={{ textAlign: 'center' }}>
              <Star size={20} style={{ color: '#f59e0b', marginBottom: 8, opacity: 0.5 }} />
              <div style={{ fontSize: 13, color: '#8080A8' }}>Analyzing your business...</div>
            </div>
          </div>
        ) : current ? (
          <div
            key={activeIndex}
            style={{
              padding: '18px 20px 16px',
              borderRadius: 14,
              background: currentConfig.bg,
              border: `1px solid ${currentConfig.border}`,
              borderTop: `3px solid ${currentConfig.color}`,
              animation: 'fadeIn 200ms ease',
              position: 'relative',
            }}
          >
            {/* Top row: priority badge + counter */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <span style={{
                fontSize: 9, fontWeight: 800, letterSpacing: '0.08em',
                padding: '3px 10px', borderRadius: 6,
                background: 'rgba(0,0,0,0.35)', color: currentConfig.color,
                display: 'flex', alignItems: 'center', gap: 4,
              }}>
                {currentConfig.icon} {currentConfig.label}
              </span>
              {insights.length > 1 && (
                <span style={{ fontSize: 11, color: '#606088', fontWeight: 600 }}>
                  {activeIndex + 1} / {insights.length}
                </span>
              )}
            </div>

            {/* Content area */}
            <div style={{ display: 'flex', gap: 18, alignItems: 'flex-start' }}>
              {/* Metric (left side) */}
              {current.metric && (
                <div style={{ flexShrink: 0, textAlign: 'center', minWidth: 80 }}>
                  <div style={{
                    fontSize: 38, fontWeight: 800, color: currentConfig.color,
                    lineHeight: 1.1, letterSpacing: '-0.02em',
                  }}>
                    {current.metric}
                  </div>
                  {current.metricLabel && (
                    <div style={{ fontSize: 10, color: '#8080A8', fontWeight: 600, marginTop: 2 }}>
                      {current.metricLabel}
                    </div>
                  )}
                </div>
              )}

              {/* Title + body (right side) */}
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 18, fontWeight: 800, color: '#E0E0F4', lineHeight: 1.2, marginBottom: 6 }}>
                  {current.title}
                </div>
                <div style={{ fontSize: 13, color: '#A0A0C8', lineHeight: 1.5 }}>
                  {current.body}
                </div>
              </div>
            </div>

            {/* Action button */}
            {current.action && current.actionRoute && (
              <button
                onClick={() => navigate(current.actionRoute!)}
                style={{
                  marginTop: 14, padding: '9px 18px', borderRadius: 8,
                  background: currentConfig.color, border: 'none',
                  color: '#000', fontSize: 12, fontWeight: 700,
                  cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
                  boxShadow: `0 2px 12px ${currentConfig.color}40`,
                }}
              >
                {current.action} <span style={{ fontSize: 14 }}>&rarr;</span>
              </button>
            )}
          </div>
        ) : null}
      </div>

      {/* Dot indicators */}
      {insights.length > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: 6, marginTop: 10 }}>
          {insights.map((insight, i) => {
            const isActive = i === activeIndex
            const dotColor = priorityConfig[insight.priority].color
            return (
              <button
                key={i}
                onClick={() => goTo(i)}
                style={{
                  width: isActive ? 24 : 8,
                  height: 8,
                  borderRadius: 4,
                  background: isActive ? dotColor : 'rgba(255,255,255,0.1)',
                  border: 'none',
                  cursor: 'pointer',
                  transition: 'all 200ms ease',
                  padding: 0,
                }}
              />
            )
          })}
        </div>
      )}
    </div>
  )
}
