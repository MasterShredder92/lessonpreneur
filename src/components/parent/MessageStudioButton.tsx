import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { useParentFamily } from '../../hooks/useParentFamily'
import { MessageCircle } from 'lucide-react'

/**
 * Native SMS deep link to the studio's location phone number.
 * On tap, opens the device's Messages app with the number prefilled.
 * No in-app composer, no API call, no polling.
 */
export default function MessageStudioButton({ variant = 'full' }: { variant?: 'full' | 'compact' }) {
  const { familyId } = useParentFamily()

  const { data: phone } = useQuery({
    queryKey: ['parent-studio-phone', familyId],
    enabled: !!familyId,
    queryFn: async () => {
      const { data: family } = await supabase
        .from('families')
        .select('primary_location_id')
        .eq('id', familyId!)
        .single()
      if (!family?.primary_location_id) return null
      const { data: loc } = await supabase
        .from('locations')
        .select('phone')
        .eq('id', family.primary_location_id)
        .single()
      return loc?.phone ?? null
    },
  })

  if (!phone) return null

  // Normalize to E.164: strip non-digits, prefix +1 for US numbers.
  const digits = phone.replace(/\D/g, '')
  const e164 = digits.length === 10 ? `+1${digits}` : digits.length === 11 ? `+${digits}` : `+${digits}`

  const handleClick = () => {
    window.location.href = `sms:${e164}`
  }

  if (variant === 'compact') {
    return (
      <button
        type="button"
        onClick={handleClick}
        title="Opens your Messages app"
        aria-label="Message Studio"
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          padding: '8px 12px', borderRadius: 8, cursor: 'pointer',
          background: 'rgba(212,34,106,0.1)', border: '1px solid rgba(212,34,106,0.25)',
          color: '#D4226A', fontSize: 12, fontWeight: 700,
          WebkitTapHighlightColor: 'transparent',
        }}
      >
        <MessageCircle size={14} />
        Message Studio
      </button>
    )
  }

  return (
    <div>
      <button
        type="button"
        onClick={handleClick}
        title="Opens your Messages app"
        aria-label="Message Studio"
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          width: '100%', minHeight: 44, padding: '10px 14px', borderRadius: 10,
          cursor: 'pointer',
          background: 'rgba(212,34,106,0.12)', border: '1px solid rgba(212,34,106,0.3)',
          color: '#D4226A', fontSize: 13, fontWeight: 700,
          WebkitTapHighlightColor: 'transparent',
        }}
      >
        <MessageCircle size={16} />
        Message Studio
      </button>
      <div style={{ fontSize: 10, color: '#606088', textAlign: 'center', marginTop: 4 }}>
        Opens your Messages app
      </div>
    </div>
  )
}
