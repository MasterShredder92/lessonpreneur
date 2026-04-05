export default function AtmosphericBackground() {
  return (
    <div
      aria-hidden="true"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 0,
        pointerEvents: 'none',
        overflow: 'hidden',
      }}
    >
      <svg
        width="600"
        height="600"
        viewBox="0 0 600 600"
        style={{
          position: 'absolute',
          top: '20%',
          left: '-10%',
          filter: 'blur(120px)',
          opacity: 0.12,
        }}
      >
        <circle cx="300" cy="300" r="300" fill="#D4226A" />
      </svg>
      <svg
        width="500"
        height="500"
        viewBox="0 0 500 500"
        style={{
          position: 'absolute',
          top: '40%',
          right: '-8%',
          filter: 'blur(100px)',
          opacity: 0.08,
        }}
      >
        <circle cx="250" cy="250" r="250" fill="#FF5500" />
      </svg>
    </div>
  )
}
