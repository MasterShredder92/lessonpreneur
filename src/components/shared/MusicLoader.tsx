export default function MusicLoader({ size = 18 }: { size?: number }) {
  const barWidth = Math.max(2, Math.round(size / 6))
  const gap = Math.max(1, Math.round(size / 9))
  const colors = ['#D4226A', '#FF5500', '#FFB800', '#D4226A']

  return (
    <div
      className="music-loader"
      style={{ display: 'inline-flex', alignItems: 'center', gap, height: size, width: size }}
    >
      {colors.map((color, i) => (
        <div
          key={i}
          style={{
            width: barWidth,
            height: '100%',
            borderRadius: barWidth / 2,
            background: color,
            animation: `musicLoaderPulse 0.8s ease-in-out ${i * 0.15}s infinite alternate`,
          }}
        />
      ))}
    </div>
  )
}
