import { useNavigate } from 'react-router-dom'
import { useTenantBilling, useCreateCheckout } from '../../hooks/useTenantBilling'

export default function TrialBanner() {
  const { data: billing } = useTenantBilling()
  const checkout = useCreateCheckout()
  const navigate = useNavigate()

  if (!billing) return null
  if (billing.plan === 'active') return null

  const isExpired = billing.isTrialExpired

  return (
    <div style={{
      padding: '10px 20px', marginBottom: 16, borderRadius: 10,
      background: isExpired ? 'rgba(239,68,68,0.06)' : 'rgba(245,158,11,0.04)',
      border: `1px solid ${isExpired ? 'rgba(239,68,68,0.12)' : 'rgba(245,158,11,0.1)'}`,
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    }}>
      <div style={{ fontSize: 13, color: isExpired ? '#EF4444' : '#f59e0b', fontWeight: 600 }}>
        {isExpired
          ? 'Your trial has ended. Subscribe to keep using Lessonpreneur.'
          : `You have ${billing.daysRemaining} day${billing.daysRemaining !== 1 ? 's' : ''} left in your free trial. Take your time getting set up — we're here to help.`}
      </div>
      <button onClick={() => checkout.mutate()} disabled={checkout.isPending} style={{
        padding: '6px 16px', borderRadius: 6, fontSize: 12, fontWeight: 700,
        background: '#f59e0b', color: '#000', border: 'none', cursor: 'pointer',
      }}>
        {checkout.isPending ? 'Loading...' : 'Subscribe Now'}
      </button>
    </div>
  )
}
