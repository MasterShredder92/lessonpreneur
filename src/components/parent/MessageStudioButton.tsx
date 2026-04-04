import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { useParentFamily } from '../../hooks/useParentFamily'
import { MessageCircle } from 'lucide-react'

/**
 * Native-SMS deep link to the studio's location phone number.
 * On mobile: opens the device's Messages app with the number prefilled.
 * On desktop: the href still resolves (may open a handler), but the tooltip
 * instructs the user to open on their phone.
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

  // Normalize to E.164: strip everything except digits, then prefix +1 for US.
  const digits = phone.replace(/\D/g, '')
  const e164 = digits.length === 10 ? `+1${digits}` : digits.length === 11 ? `+${digits}` : `+${digits}`

  const tooltip = 'Open on your phone to send a text.'

  if (variant === 'compact') {
    return (
      <a
        href={`sms:${e164}`}
        title={tooltip}
        aria-label="Message Studio"
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          padding: '8px 12px', borderRadius: 8, textDecoration: 'none',
          background: 'rgba(212,34,106,0.1)', border: '1px solid rgba(212,34,106,0.25)',
          color: '#D4226A', fontSize: 12, fontWeight: 700,
          WebkitTapHighlightColor: 'transparent',
        }}
      >
        <MessageCircle size={14} />
        Message Studio
      </a>
    )
  }

  return (
    <a
      href={`sms:${e164}`}
      title={tooltip}
      aria-label="Message Studio"
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        width: '100%', minHeight: 44, padding: '10px 14px', borderRadius: 10,
        textDecoration: 'none',
        background: 'rgba(212,34,106,0.12)', border: '1px solid rgba(212,34,106,0.3)',
        color: '#D4226A', fontSize: 13, fontWeight: 700,
        WebkitTapHighlightColor: 'transparent',
      }}
    >
      <MessageCircle size={16} />
      Message Studio
    </a>
  )
}
