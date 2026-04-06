/**
 * Shared smart positioning logic for all guide/tour tooltip cards.
 * Uses getBoundingClientRect() + viewport space analysis to place cards
 * in the direction with the most available space. Never covers the target.
 */

export type Placement = 'top' | 'bottom' | 'left' | 'right'

export interface CardPosition {
  placement: Placement
  top: number
  left: number
}

function clamp(val: number, min: number, max: number) {
  return Math.max(min, Math.min(max, val))
}

/**
 * Calculate the best position for a guide card relative to a target element.
 * On mobile (< 768px), only top/bottom placement is used.
 * On desktop, picks the direction with the most available space.
 */
export function getCardPosition(
  targetRect: DOMRect,
  cardWidth: number,
  cardHeight: number,
): CardPosition {
  const vw = window.innerWidth
  const vh = window.innerHeight
  const gap = 12
  const isMobile = vw < 768
  const edgePad = 16

  const space = {
    top: targetRect.top,
    bottom: vh - targetRect.bottom,
    left: targetRect.left,
    right: vw - targetRect.right,
  }

  let placement: Placement

  if (isMobile) {
    // Mobile: only top or bottom
    placement = space.bottom >= cardHeight + gap ? 'bottom' : 'top'
  } else {
    // Desktop: pick direction with most space
    const sorted = (Object.entries(space) as [Placement, number][]).sort((a, b) => b[1] - a[1])
    placement = sorted[0][0]

    // If best is left/right but not enough room for the card, fall back to vertical
    if ((placement === 'left' || placement === 'right') && space[placement] < cardWidth + gap + edgePad) {
      placement = space.bottom >= space.top ? 'bottom' : 'top'
    }
    // If best is top/bottom but not enough room, use whichever vertical has more
    if ((placement === 'top' || placement === 'bottom') && space[placement] < cardHeight + gap) {
      placement = space.bottom >= space.top ? 'bottom' : 'top'
    }
  }

  const centerX = targetRect.left + targetRect.width / 2
  const centerY = targetRect.top + targetRect.height / 2

  let top: number
  let left: number

  switch (placement) {
    case 'bottom':
      top = targetRect.bottom + gap
      left = clamp(centerX - cardWidth / 2, edgePad, vw - cardWidth - edgePad)
      break
    case 'top':
      top = targetRect.top - cardHeight - gap
      left = clamp(centerX - cardWidth / 2, edgePad, vw - cardWidth - edgePad)
      break
    case 'right':
      top = clamp(centerY - cardHeight / 2, edgePad, vh - cardHeight - edgePad)
      left = targetRect.right + gap
      break
    case 'left':
      top = clamp(centerY - cardHeight / 2, edgePad, vh - cardHeight - edgePad)
      left = targetRect.left - cardWidth - gap
      break
  }

  return { placement, top, left }
}

/**
 * Get CSS styles for the directional arrow that points from the card toward the target.
 * Returns absolute positioning styles relative to the card container.
 */
export function getArrowStyle(
  placement: Placement,
  targetRect: DOMRect,
  cardLeft: number,
  cardTop: number,
  cardWidth: number,
  cardHeight: number,
): React.CSSProperties {
  const size = 8
  const bg = 'rgba(10,10,20,0.92)'
  const border = '1px solid rgba(255,255,255,0.08)'

  const centerX = targetRect.left + targetRect.width / 2
  const centerY = targetRect.top + targetRect.height / 2

  const base: React.CSSProperties = {
    position: 'absolute',
    width: size * 2,
    height: size * 2,
    background: bg,
    pointerEvents: 'none',
  }

  switch (placement) {
    case 'bottom': {
      // Arrow on top edge of card, pointing up at target
      const arrowLeft = clamp(centerX - cardLeft - size, 12, cardWidth - 24)
      return {
        ...base,
        top: -size,
        left: arrowLeft,
        borderLeft: border,
        borderTop: border,
        transform: 'rotate(45deg)',
      }
    }
    case 'top': {
      // Arrow on bottom edge of card, pointing down at target
      const arrowLeft = clamp(centerX - cardLeft - size, 12, cardWidth - 24)
      return {
        ...base,
        bottom: -size,
        left: arrowLeft,
        borderRight: border,
        borderBottom: border,
        transform: 'rotate(45deg)',
      }
    }
    case 'right': {
      // Arrow on left edge of card, pointing left at target
      const arrowTop = clamp(centerY - cardTop - size, 12, cardHeight - 24)
      return {
        ...base,
        left: -size,
        top: arrowTop,
        borderLeft: border,
        borderBottom: border,
        transform: 'rotate(45deg)',
      }
    }
    case 'left': {
      // Arrow on right edge of card, pointing right at target
      const arrowTop = clamp(centerY - cardTop - size, 12, cardHeight - 24)
      return {
        ...base,
        right: -size,
        top: arrowTop,
        borderRight: border,
        borderTop: border,
        transform: 'rotate(45deg)',
      }
    }
  }
}

/** Shared card container styles */
export const GUIDE_CARD_STYLE: React.CSSProperties = {
  background: 'rgba(10,10,20,0.92)',
  backdropFilter: 'blur(8px)',
  WebkitBackdropFilter: 'blur(8px)',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: 12,
  boxShadow: '0 12px 40px rgba(0,0,0,0.6)',
}

export const GUIDE_PRIMARY_BTN: React.CSSProperties = {
  padding: '7px 14px', borderRadius: 8, border: 'none', cursor: 'pointer',
  background: '#D4226A', color: '#FFFFFF', fontSize: 12, fontWeight: 800,
  fontFamily: 'inherit',
}

export const GUIDE_GHOST_BTN: React.CSSProperties = {
  padding: '7px 14px', borderRadius: 8, cursor: 'pointer',
  background: 'transparent', color: '#A0A0C8',
  border: '1px solid rgba(255,255,255,0.12)', fontSize: 12, fontWeight: 600,
  fontFamily: 'inherit',
}

export const GUIDE_LINK_BTN: React.CSSProperties = {
  background: 'none', border: 'none', cursor: 'pointer',
  color: '#8080A8', fontSize: 11, fontWeight: 500, padding: 0,
  fontFamily: 'inherit',
}

export const GUIDE_PULSE_KEYFRAMES = `@keyframes guidePulse {
  0%, 100% { box-shadow: 0 0 0 3px rgba(255,184,0,0.5); }
  50% { box-shadow: 0 0 0 7px rgba(255,184,0,0.12); }
}`

/** Default card width */
export const GUIDE_CARD_WIDTH = 280

/** Mobile-responsive card width */
export function guideCardWidth(): number {
  const vw = window.innerWidth
  return vw < 768 ? Math.min(280, vw - 32) : 280
}
