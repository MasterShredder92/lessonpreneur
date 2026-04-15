import type { CSSProperties } from 'react'

/** Shared Ziro Work surface tokens — used by ZiroWorkPage and ZiroWorkAgentCard. */
export const ZIRO_WORK_CARD: CSSProperties = {
  borderRadius: 14,
  background: 'rgba(255,255,255,0.025)',
  border: '1px solid rgba(255,255,255,0.07)',
  boxShadow: '0 2px 12px rgba(0,0,0,0.25)',
}

export function ziroWorkPillStyle(color: string): CSSProperties {
  return {
    display: 'inline-block',
    fontSize: 10,
    fontWeight: 700,
    padding: '3px 10px',
    borderRadius: 8,
    background: `${color}18`,
    color,
    letterSpacing: '0.03em',
    lineHeight: 1.4,
  }
}

export const ZIRO_WORK_SECTION_LABEL: CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  color: '#8080A8',
  textTransform: 'uppercase',
  letterSpacing: '0.07em',
  lineHeight: 1.3,
}

export const ZIRO_WORK_LABEL: CSSProperties = {
  display: 'block',
  fontSize: 12,
  fontWeight: 700,
  color: '#8080A8',
  textTransform: 'uppercase',
  letterSpacing: '0.07em',
  marginBottom: 8,
  lineHeight: 1.3,
}

export const ZIRO_WORK_INPUT: CSSProperties = {
  width: '100%',
  padding: '11px 14px',
  fontSize: 14,
  color: '#E0E0F4',
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(255,255,255,0.09)',
  borderRadius: 10,
  fontFamily: 'var(--font-body)',
  lineHeight: 1.5,
  outline: 'none',
  boxSizing: 'border-box' as const,
}

export const ZIRO_WORK_FILTER_SELECT: CSSProperties = {
  padding: '8px 14px',
  fontSize: 13,
  borderRadius: 8,
  fontWeight: 600,
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(255,255,255,0.09)',
  color: '#A0A0C8',
  cursor: 'pointer',
}

export const ZIRO_WORK_PAGE_BTN: CSSProperties = {
  padding: '8px 18px',
  borderRadius: 8,
  fontSize: 13,
  fontWeight: 600,
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(255,255,255,0.08)',
  color: '#8080A8',
  cursor: 'pointer',
}

/** Aliases for ZiroWorkPage imports */
export const CARD = ZIRO_WORK_CARD
export const pillStyle = ziroWorkPillStyle
export const sectionLabel = ZIRO_WORK_SECTION_LABEL
export const labelStyle = ZIRO_WORK_LABEL
export const inputStyle = ZIRO_WORK_INPUT
export const filterSelectStyle = ZIRO_WORK_FILTER_SELECT
export const pageBtnStyle = ZIRO_WORK_PAGE_BTN
