import { useParentFamily } from '../../hooks/useParentFamily'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import MusicLoader from '../../components/shared/MusicLoader'
import { CreditCard } from 'lucide-react'

export default function ParentBilling() {
  const { familyId, students, isLoading } = useParentFamily()

  const { data: invoices } = useQuery({
    queryKey: ['parent-invoices', familyId],
    enabled: !!familyId,
    queryFn: async () => {
      const { data } = await supabase
        .from('square_invoices')
        .select('id, invoice_date, requested_amount, amount_paid, status')
        .eq('family_id', familyId!)
        .order('invoice_date', { ascending: false })
        .limit(12)
      return data ?? []
    },
  })

  const { data: family } = useQuery({
    queryKey: ['parent-family-billing', familyId],
    enabled: !!familyId,
    queryFn: async () => {
      const { data } = await supabase
        .from('families')
        .select('rate_tier, payment_method')
        .eq('id', familyId!)
        .single()
      return data
    },
  })

  if (isLoading) return <div style={{ padding: 40, textAlign: 'center' }}><MusicLoader /></div>

  const totalDue = (invoices ?? [])
    .filter((i: any) => i.status !== 'paid')
    .reduce((sum: number, i: any) => sum + ((i.requested_amount ?? 0) - (i.amount_paid ?? 0)), 0)

  return (
    <div style={{ maxWidth: 540, margin: '0 auto', padding: 16 }}>
      <h1 style={{ fontSize: 20, fontWeight: 800, color: '#E0E0F4', margin: '0 0 20px' }}>Billing</h1>

      {/* Summary */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 24 }}>
        <div style={{ flex: 1, padding: '16px 14px', borderRadius: 12, background: 'rgba(34,197,94,0.04)', border: '1px solid rgba(34,197,94,0.1)', textAlign: 'center' }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: '#8080A8', textTransform: 'uppercase', marginBottom: 4 }}>Students</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#22C55E' }}>{students.length}</div>
        </div>
        <div style={{ flex: 1, padding: '16px 14px', borderRadius: 12, background: totalDue > 0 ? 'rgba(239,68,68,0.04)' : 'rgba(34,197,94,0.04)', border: `1px solid ${totalDue > 0 ? 'rgba(239,68,68,0.1)' : 'rgba(34,197,94,0.1)'}`, textAlign: 'center' }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: '#8080A8', textTransform: 'uppercase', marginBottom: 4 }}>Balance Due</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: totalDue > 0 ? '#EF4444' : '#22C55E' }}>${totalDue.toFixed(2)}</div>
        </div>
        {family?.rate_tier && (
          <div style={{ flex: 1, padding: '16px 14px', borderRadius: 12, background: 'rgba(212,34,106,0.04)', border: '1px solid rgba(212,34,106,0.1)', textAlign: 'center' }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#8080A8', textTransform: 'uppercase', marginBottom: 4 }}>Monthly Rate</div>
            <div style={{ fontSize: 24, fontWeight: 800, color: '#D4226A' }}>${family.rate_tier}</div>
          </div>
        )}
      </div>

      {family?.payment_method && (
        <div style={{ fontSize: 12, color: '#8080A8', marginBottom: 16 }}>
          Payment method: <span style={{ color: '#E0E0F4', fontWeight: 600 }}>{family.payment_method}</span>
        </div>
      )}

      {/* Invoice history */}
      <div style={{ fontSize: 13, fontWeight: 700, color: '#E0E0F4', marginBottom: 12 }}>Recent Invoices</div>
      {!invoices || invoices.length === 0 ? (
        <div style={{ padding: '32px 16px', textAlign: 'center', borderRadius: 12, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
          <CreditCard size={24} style={{ color: '#606088', marginBottom: 8 }} />
          <p style={{ fontSize: 13, color: '#8080A8', margin: 0 }}>No invoices found.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {invoices.map((inv: any) => {
            const isPaid = inv.status === 'paid' || (inv.amount_paid ?? 0) >= (inv.requested_amount ?? 0)
            return (
              <div key={inv.id} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '10px 12px', borderRadius: 8,
                background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)',
              }}>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#E0E0F4' }}>
                    {inv.invoice_date ? new Date(inv.invoice_date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) : 'Invoice'}
                  </div>
                  <div style={{ fontSize: 10, color: '#606088' }}>${(inv.requested_amount ?? 0).toFixed(2)}</div>
                </div>
                <span style={{
                  fontSize: 10, fontWeight: 700, padding: '3px 10px', borderRadius: 6,
                  background: isPaid ? 'rgba(34,197,94,0.08)' : 'rgba(239,68,68,0.08)',
                  color: isPaid ? '#22C55E' : '#EF4444',
                }}>
                  {isPaid ? 'Paid' : 'Due'}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
