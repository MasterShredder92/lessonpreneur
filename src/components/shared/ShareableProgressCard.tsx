import { useRef, useState } from 'react'
import { toPng } from 'html-to-image'
import { Download, Share2, X } from 'lucide-react'

const LOCATION_BRAND_COLORS: Record<string, string> = {
  'd48229c1-b70a-4d29-893e-5079887dab76': '#D41113',  // Omaha
  'f7b52dd5-12ee-437f-9c60-f8adf454ac31': '#A333FF',  // Bellevue
  'cebd97d4-c241-4de2-8ade-49e5cc0070d5': '#00A5E8',  // Elkhorn
  '40c67ffc-91b5-46a9-94bd-6ddffdfb7638': '#00A651',  // Gretna
}

const LOCATION_DOMAINS: Record<string, string> = {
  'd48229c1-b70a-4d29-893e-5079887dab76': 'omahaguitarandmusiclessons.com',
  'f7b52dd5-12ee-437f-9c60-f8adf454ac31': 'musiclessonsbellevue.com',
  'cebd97d4-c241-4de2-8ade-49e5cc0070d5': 'elkhornlessons.com',
  '40c67ffc-91b5-46a9-94bd-6ddffdfb7638': 'gretnamusiclessons.com',
}

const LOCATION_NAMES: Record<string, string> = {
  'd48229c1-b70a-4d29-893e-5079887dab76': 'Omaha',
  'f7b52dd5-12ee-437f-9c60-f8adf454ac31': 'Bellevue',
  'cebd97d4-c241-4de2-8ade-49e5cc0070d5': 'Elkhorn',
  '40c67ffc-91b5-46a9-94bd-6ddffdfb7638': 'Gretna',
}

interface Props {
  studentFirstName: string
  instrument: string | null
  progressIndicator: 'on_track' | 'crushing_it'
  workedOn: string[]
  locationId: string | null
  studioName?: string
  onClose: () => void
}

export default function ShareableProgressCard({
  studentFirstName,
  instrument,
  progressIndicator,
  workedOn,
  locationId,
  studioName = 'Adkins Music Lessons',
  onClose,
}: Props) {
  const cardRef = useRef<HTMLDivElement>(null)
  const [saving, setSaving] = useState(false)

  const brandColor = LOCATION_BRAND_COLORS[locationId ?? ''] ?? '#D4226A'
  const locationName = LOCATION_NAMES[locationId ?? ''] ?? ''
  const domain = LOCATION_DOMAINS[locationId ?? ''] ?? 'lessonpreneur.io'

  const hypeLine = progressIndicator === 'crushing_it'
    ? `${studentFirstName} is CRUSHING IT!`
    : `${studentFirstName} is making awesome progress!`

  const hypeEmoji = progressIndicator === 'crushing_it' ? '🔥' : '🎶'

  const instrumentDisplay = instrument
    ? instrument.charAt(0).toUpperCase() + instrument.slice(1)
    : 'Music'

  const tags = workedOn.slice(0, 4)

  const handleDownload = async () => {
    if (!cardRef.current) return
    setSaving(true)
    try {
      const dataUrl = await toPng(cardRef.current, {
        width: 1080,
        height: 1080,
        pixelRatio: 1,
        backgroundColor: brandColor,
      })
      const link = document.createElement('a')
      link.download = `${studentFirstName}-progress.png`
      link.href = dataUrl
      link.click()
    } catch {
      // Fallback: try without pixel ratio override
      try {
        const dataUrl = await toPng(cardRef.current, { backgroundColor: brandColor })
        const link = document.createElement('a')
        link.download = `${studentFirstName}-progress.png`
        link.href = dataUrl
        link.click()
      } catch {
        alert('Could not generate image. Try taking a screenshot instead.')
      }
    }
    setSaving(false)
  }

  const handleShare = async () => {
    if (!cardRef.current) return
    setSaving(true)
    try {
      const dataUrl = await toPng(cardRef.current, {
        width: 1080,
        height: 1080,
        pixelRatio: 1,
        backgroundColor: brandColor,
      })
      const blob = await (await fetch(dataUrl)).blob()
      const file = new File([blob], `${studentFirstName}-progress.png`, { type: 'image/png' })

      if (navigator.share && navigator.canShare({ files: [file] })) {
        await navigator.share({
          title: `${studentFirstName}'s ${instrumentDisplay} Progress`,
          text: hypeLine,
          files: [file],
        })
      } else {
        // Fallback to download
        handleDownload()
      }
    } catch {
      handleDownload()
    }
    setSaving(false)
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 99999,
      background: 'rgba(0,0,0,0.85)', display: 'flex',
      flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      padding: 16,
    }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, maxWidth: 400, width: '100%' }}>
        {/* Close */}
        <button onClick={onClose} style={{
          alignSelf: 'flex-end', background: 'none', border: 'none',
          color: '#8080A8', cursor: 'pointer', padding: 4,
        }}>
          <X size={20} />
        </button>

        {/* The actual 1080×1080 card (rendered at display size, captured at 1080) */}
        <div
          ref={cardRef}
          style={{
            width: 1080,
            height: 1080,
            transform: 'scale(0.33)',
            transformOrigin: 'top center',
            marginBottom: -1080 * 0.67,
            background: `linear-gradient(160deg, ${brandColor}, ${adjustBrightness(brandColor, -30)})`,
            borderRadius: 40,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '80px 70px',
            position: 'relative',
            overflow: 'hidden',
            fontFamily: "'Plus Jakarta Sans', 'Inter', -apple-system, sans-serif",
            boxSizing: 'border-box',
          }}
        >
          {/* Background pattern — subtle music notes */}
          <div style={{
            position: 'absolute', inset: 0, opacity: 0.06,
            backgroundImage: `radial-gradient(circle at 20% 30%, white 1px, transparent 1px), radial-gradient(circle at 80% 70%, white 1px, transparent 1px), radial-gradient(circle at 50% 10%, white 1.5px, transparent 1.5px), radial-gradient(circle at 10% 90%, white 1px, transparent 1px)`,
            backgroundSize: '200px 200px, 300px 300px, 150px 150px, 250px 250px',
          }} />

          {/* Studio name — top */}
          <div style={{
            fontSize: 36, fontWeight: 700, color: 'rgba(255,255,255,0.9)',
            letterSpacing: '0.02em', marginBottom: 60, textAlign: 'center',
          }}>
            {studioName}
          </div>

          {/* Hype emoji — large */}
          <div style={{ fontSize: 120, marginBottom: 30, lineHeight: 1 }}>
            {hypeEmoji}
          </div>

          {/* Student name — huge */}
          <div style={{
            fontSize: 88, fontWeight: 900, color: '#fff',
            letterSpacing: '-0.02em', marginBottom: 20, textAlign: 'center',
            lineHeight: 1.1, textShadow: '0 4px 20px rgba(0,0,0,0.2)',
          }}>
            {studentFirstName}
          </div>

          {/* Hype line */}
          <div style={{
            fontSize: 42, fontWeight: 700, color: 'rgba(255,255,255,0.95)',
            textAlign: 'center', marginBottom: 50, lineHeight: 1.3,
          }}>
            {progressIndicator === 'crushing_it'
              ? 'is CRUSHING IT!'
              : 'is making awesome progress!'}
          </div>

          {/* Instrument */}
          <div style={{
            fontSize: 32, fontWeight: 600, color: 'rgba(255,255,255,0.8)',
            background: 'rgba(255,255,255,0.15)', padding: '12px 40px',
            borderRadius: 50, marginBottom: 30,
          }}>
            {instrumentDisplay}
          </div>

          {/* Worked-on tags */}
          {tags.length > 0 && (
            <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', justifyContent: 'center', marginBottom: 50 }}>
              {tags.map(tag => (
                <span key={tag} style={{
                  fontSize: 26, fontWeight: 600, color: 'rgba(255,255,255,0.85)',
                  background: 'rgba(255,255,255,0.12)', padding: '10px 28px',
                  borderRadius: 40, border: '1px solid rgba(255,255,255,0.15)',
                }}>
                  {tag}
                </span>
              ))}
            </div>
          )}

          {/* Bottom CTA */}
          <div style={{
            position: 'absolute', bottom: 70, left: 70, right: 70,
            textAlign: 'center',
          }}>
            <div style={{ fontSize: 28, fontWeight: 600, color: 'rgba(255,255,255,0.7)', marginBottom: 10 }}>
              {locationName ? `Learn to play in ${locationName}!` : `Learn to play at ${studioName}!`}
            </div>
            <div style={{ fontSize: 30, fontWeight: 700, color: 'rgba(255,255,255,0.9)' }}>
              {domain}
            </div>
          </div>
        </div>

        {/* Action buttons */}
        <div style={{ display: 'flex', gap: 10, width: '100%', marginTop: 8 }}>
          <button
            onClick={handleShare}
            disabled={saving}
            style={{
              flex: 1, padding: '14px', borderRadius: 10, border: 'none',
              background: brandColor, color: '#fff',
              fontSize: 15, fontWeight: 700, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              opacity: saving ? 0.6 : 1,
            }}
          >
            <Share2 size={16} />
            {saving ? 'Generating...' : 'Share'}
          </button>
          <button
            onClick={handleDownload}
            disabled={saving}
            style={{
              padding: '14px 20px', borderRadius: 10,
              background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
              color: '#E0E0F4', fontSize: 15, fontWeight: 700, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              opacity: saving ? 0.6 : 1,
            }}
          >
            <Download size={16} />
            Save
          </button>
        </div>
      </div>
    </div>
  )
}

// Darken/lighten a hex color
function adjustBrightness(hex: string, amount: number): string {
  const num = parseInt(hex.replace('#', ''), 16)
  const r = Math.max(0, Math.min(255, ((num >> 16) & 0xFF) + amount))
  const g = Math.max(0, Math.min(255, ((num >> 8) & 0xFF) + amount))
  const b = Math.max(0, Math.min(255, (num & 0xFF) + amount))
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`
}
