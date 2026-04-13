import { FONT } from './shared'
import { ZW, ZW_COLOR } from '../../config/zwBrand'

type PublicBrandBarProps = {
  /** Tighter padding and type for funnel pages (get-started, trial). */
  variant?: 'default' | 'funnel'
}

/** Top-of-page hierarchy for the SaaS landing: parent brand + product + lockup line. */
export default function PublicBrandBar({ variant = 'default' }: PublicBrandBarProps) {
  const funnel = variant === 'funnel'
  return (
    <div
      style={{
        position: 'relative',
        zIndex: 2,
        padding: funnel ? '16px 20px 4px' : '20px 20px 8px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: funnel ? 'center' : 'flex-start',
        gap: funnel ? 4 : 6,
        textAlign: funnel ? 'center' : 'left',
      }}
    >
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: '8px 14px', justifyContent: funnel ? 'center' : 'flex-start' }}>
        <span
          style={{
            fontFamily: FONT,
            fontWeight: 900,
            fontSize: funnel ? '18px' : '22px',
            letterSpacing: '-0.02em',
            color: '#F8FAFC',
          }}
        >
          {ZW.parent}
        </span>
        <span
          style={{
            fontFamily: FONT,
            fontWeight: 600,
            fontSize: funnel ? '12px' : '13px',
            color: ZW_COLOR.teal,
            letterSpacing: '0.02em',
          }}
        >
          {ZW.productByline}
        </span>
      </div>
      <p
        style={{
          margin: 0,
          fontFamily: FONT,
          fontSize: funnel ? '11px' : '12px',
          fontWeight: 500,
          color: 'rgba(255,255,255,0.45)',
          maxWidth: '520px',
          lineHeight: 1.5,
        }}
      >
        {ZW.musicSchoolsPowered}
        <span style={{ color: 'rgba(255,255,255,0.25)', margin: '0 0.5em' }}>·</span>
        {ZW.poweredBy}
      </p>
    </div>
  )
}
