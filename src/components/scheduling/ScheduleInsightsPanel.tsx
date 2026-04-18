import { useCallback, useId, useMemo, useState, type RefObject } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import type { Insight, InsightScrollToRef, ScheduleInsightsResult } from './computeScheduleInsights'
import { countScheduleInsights } from './computeScheduleInsights'
import { pulseInsightHighlight, resolveInsightScrollTarget } from './scheduleInsightScroll'

function iconEmoji(icon: Insight['icon']): string {
  if (icon === 'warning') return '\u26A0\uFE0F'
  if (icon === 'suggestion') return '\u{1F4A1}'
  return '\u{1F4CA}'
}

function flattenInsights(r: ScheduleInsightsResult): Insight[] {
  return [
    ...r.teacherOverCapacity,
    ...r.conflictSuggestions,
    ...r.moveSuggestions,
    ...r.dayOverCapacity,
    ...r.highDemandSlots,
    ...r.dayUnderCapacity,
    ...r.lowDemandSlots,
    ...r.teacherUnderCapacity,
  ]
}

export interface ScheduleInsightsPanelProps {
  insights: ScheduleInsightsResult
  /** Primary scroll surface (all-teachers grid or multi-day grid). */
  scrollRootRef: RefObject<HTMLElement | null>
  /** Focus-mode vertical list scroll surface; used when `useFocusScrollRoot` is true. */
  focusScrollRootRef: RefObject<HTMLElement | null>
  useFocusScrollRoot: boolean
  accentColor: string
}

export default function ScheduleInsightsPanel({
  insights,
  scrollRootRef,
  focusScrollRootRef,
  useFocusScrollRoot,
  accentColor,
}: ScheduleInsightsPanelProps) {
  const [expanded, setExpanded] = useState(false)
  const panelId = useId()
  const total = useMemo(() => countScheduleInsights(insights), [insights])
  const rows = useMemo(() => flattenInsights(insights), [insights])

  const onView = useCallback(
    (target: InsightScrollToRef) => {
      const ref = useFocusScrollRoot ? focusScrollRootRef : scrollRootRef
      const root = ref.current ?? document.body
      const el = resolveInsightScrollTarget(root, target)
      if (!el) return
      el.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' })
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => pulseInsightHighlight(el))
      })
    },
    [focusScrollRootRef, scrollRootRef, useFocusScrollRoot],
  )

  if (total === 0) return null

  return (
    <div
      style={{
        flexShrink: 0,
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        background: 'rgba(12,11,22,0.55)',
      }}
    >
      <button
        type="button"
        id={panelId}
        aria-expanded={expanded}
        onClick={() => setExpanded(e => !e)}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
          padding: '6px 10px',
          border: 'none',
          background: 'transparent',
          cursor: 'pointer',
          color: '#A0A0C8',
          fontSize: 12,
          fontWeight: 700,
          textAlign: 'left',
        }}
      >
        <span style={{ color: '#E0E0F4', display: 'flex', alignItems: 'center', gap: 6 }}>
          Insights <span style={{ color: '#8080A8', fontWeight: 600 }}>• {total}</span>
          {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </span>
      </button>

      <div
        style={{
          display: 'grid',
          gridTemplateRows: expanded ? '1fr' : '0fr',
          transition: 'grid-template-rows 0.32s ease',
        }}
      >
        <div style={{ overflow: 'hidden', minHeight: 0 }}>
          <div
            role="region"
            aria-labelledby={panelId}
            style={{ padding: '0 10px 8px', maxHeight: 220, overflowY: 'auto' }}
          >
            {rows.length === 0 ? (
              <div style={{ padding: '8px 0', fontSize: 11, color: '#606088', userSelect: 'none' }}>
                No scheduling insights for this range.
              </div>
            ) : (
              rows.map(row => (
              <div
                key={row.id}
                title={row.tooltip}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 8,
                  padding: '6px 0',
                  borderTop: '1px solid rgba(255,255,255,0.04)',
                  fontSize: 11,
                  lineHeight: 1.35,
                  color: '#C8C8E6',
                }}
              >
                <span style={{ flexShrink: 0, width: 22, textAlign: 'center', userSelect: 'none' }} aria-hidden>
                  {iconEmoji(row.icon)}
                </span>
                <span style={{ flex: 1, minWidth: 0, userSelect: 'none' }}>{row.text}</span>
                {row.scrollToRef && (
                  <button
                    type="button"
                    onClick={e => {
                      e.stopPropagation()
                      onView(row.scrollToRef!)
                    }}
                    style={{
                      flexShrink: 0,
                      fontSize: 10,
                      fontWeight: 700,
                      padding: '3px 8px',
                      borderRadius: 6,
                      border: `1px solid ${accentColor}44`,
                      background: `${accentColor}18`,
                      color: accentColor,
                      cursor: 'pointer',
                    }}
                  >
                    View
                  </button>
                )}
              </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
