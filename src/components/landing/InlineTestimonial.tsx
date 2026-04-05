const FONT = 'Plus Jakarta Sans, system-ui, -apple-system, sans-serif'

type Props = {
  quote: string
  name: string
  descriptor: string
  align?: 'left' | 'center' | 'right'
}

export default function InlineTestimonial({ quote, name, descriptor, align = 'center' }: Props) {
  const marginLeft = align === 'right' ? 'auto' : align === 'left' ? '0' : 'auto'
  const marginRight = align === 'left' ? 'auto' : align === 'right' ? '0' : 'auto'
  return (
    <div
      style={{
        maxWidth: '580px',
        marginLeft,
        marginRight,
        padding: '20px 24px',
        borderLeft: '3px solid rgba(212,34,106,0.50)',
        background: 'rgba(212,34,106,0.04)',
        borderRadius: '0 8px 8px 0',
      }}
    >
      <div style={{ color: '#FFB800', fontSize: '13px', letterSpacing: '1px' }}>★★★★★</div>
      <p
        className="lp-inline-quote"
        style={{
          fontFamily: FONT,
          fontSize: '14px',
          color: 'rgba(255,255,255,0.70)',
          fontStyle: 'italic',
          lineHeight: 1.6,
          margin: '8px 0 0 0',
        }}
      >
        “{quote}”
      </p>
      <div
        style={{
          fontFamily: FONT,
          fontSize: '12px',
          fontWeight: 700,
          color: 'rgba(255,255,255,0.45)',
          marginTop: '6px',
        }}
      >
        — {name}, {descriptor}
      </div>
      <style>{`
        @media (min-width: 768px) {
          .lp-inline-quote { font-size: 15px !important; }
        }
      `}</style>
    </div>
  )
}
