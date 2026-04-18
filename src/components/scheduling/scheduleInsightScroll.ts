import type { InsightScrollToRef } from './computeScheduleInsights'

/** Resolve a grid cell / day / block inside `root` (schedule scroll surface or document). */
export function resolveInsightScrollTarget(root: ParentNode, target: InsightScrollToRef): HTMLElement | null {
  if (target.mode === 'block') {
    return root.querySelector(`[data-schedule-block-id="${target.blockId}"]`) as HTMLElement | null
  }
  if (target.mode === 'day') {
    return root.querySelector(`[data-schedule-insight-day="${target.date}"]`) as HTMLElement | null
  }
  const dayEl = root.querySelector(`[data-schedule-insight-day="${target.date}"]`)
  if (dayEl) {
    const cell = dayEl.querySelector(
      `[data-teacher-id="${target.teacherId}"][data-schedule-slot="${target.slot}"]`,
    ) as HTMLElement | null
    if (cell) return cell
  }
  return root.querySelector(
    `[data-teacher-id="${target.teacherId}"][data-schedule-slot="${target.slot}"]`,
  ) as HTMLElement | null
}

export function pulseInsightHighlight(el: HTMLElement): void {
  el.animate(
    [
      { boxShadow: '0 0 0 0 rgba(250, 204, 21, 0)', outline: '2px solid transparent' },
      { boxShadow: '0 0 0 6px rgba(250, 204, 21, 0.35)', outline: '2px solid rgba(250, 204, 121, 0.9)' },
      { boxShadow: '0 0 0 0 rgba(250, 204, 21, 0)', outline: '2px solid transparent' },
    ],
    { duration: 1200, easing: 'ease-out', fill: 'forwards' },
  )
  window.setTimeout(() => {
    el.style.boxShadow = ''
    el.style.outline = ''
  }, 1250)
}
