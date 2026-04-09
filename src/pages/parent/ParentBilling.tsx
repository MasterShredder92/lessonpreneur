import { useParentFamily } from '../../hooks/useParentFamily'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import MusicLoader from '../../components/shared/MusicLoader'
import { CreditCard } from 'lucide-react'
import { instrumentWithEmojiTitle } from '../../utils/instrumentEmoji'
import { qk } from '../../lib/queryKeys'

const fmtUSD = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD' })

export default function ParentBilling() {
  const { familyId, isLoading } = useParentFamily()

  const { data: family } = useQuery({
    queryKey: [...qk.parent.familyBilling, familyId],
    enabled: !!familyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('families')
        .select('lifetime_paid_cents, overdue_balance_cents, card_brand, card_last_four')
        .eq('id', familyId!)
        .single()
      if (error) throw error
      return data
    },
  })

  const { data: studentRates } = useQuery({
    queryKey: [...qk.parent.familyStudentRates, familyId],
    enabled: !!familyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('students')
        .select('id, first_name, rate_per_session, sessions_per_month, instrument')
        .eq('family_id', familyId!)
        .eq('status', 'active')
        .order('first_name')
      if (error) throw error
      return data ?? []
    },
  })

  const { data: invoices } = useQuery({
    queryKey: [...qk.parent.invoices, familyId],
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

  if (isLoading) return <div style={{ padding: 40, textAlign: 'center' }}><MusicLoader /></div>

  // All dollar amounts in USD dollars (float)
  const lifetimePaid = (family?.lifetime_paid_cents ?? 0) / 100
  const overdueBalance = (family?.overdue_balance_cents ?? 0) / 100

  // rate_per_session is already in dollars. Sum across active students.
  const perStudentMonthly = (studentRates ?? []).map(s => ({
    id: s.id as string,
    firstName: s.first_name as string,
    instrument: s.instrument as string | null,
    rate: Number(s.rate_per_session ?? 0),
    sessions: Number(s.sessions_per_month ?? 0),
    monthly: Number(s.rate_per_session ?? 0) * Number(s.sessions_per_month ?? 0),
  }))
  const monthlyTotal = perStudentMonthly.reduce((sum, s) => sum + s.monthly, 0)

  const paymentMethodDisplay = family?.card_brand && family?.card_last_four
    ? `${family.card_brand} ending in ${family.card_last_four}`
    : null

  return (
    <div style={{ maxWidth: 540, margin: '0 auto', padding: 16 }}>
      <h1 style={{ fontSize: 20, fontWeight: 800, color: '#E0E0F4', margin: '0 0 20px' }}>Billing</h1>

      {/* Summary cards */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
        <SummaryCard
          label="Balance Due"
          value={fmtUSD(overdueBalance)}
          color={overdueBalance > 0 ? '#EF4444' : '#22C55E'}
          tint={overdueBalance > 0 ? 'rgba(239,68,68,0.04)' : 'rgba(34,197,94,0.04)'}
          border={overdueBalance > 0 ? 'rgba(239,68,68,0.12)' : 'rgba(34,197,94,0.12)'}
        />
        <SummaryCard
          label="Monthly Total"
          value={fmtUSD(monthlyTotal)}
          color="#D4226A"
          tint="rgba(212,34,106,0.04)"
          border="rgba(212,34,106,0.12)"
        />
        <SummaryCard
          label="Lifetime Paid"
          value={fmtUSD(lifetimePaid)}
          color="#FFB800"
          tint="rgba(255,184,0,0.04)"
          border="rgba(255,184,0,0.12)"
        />
      </div>

      {paymentMethodDisplay && (
        <div style={{ fontSize: 12, color: '#8080A8', marginBottom: 20 }}>
          Payment method: <span style={{ color: '#E0E0F4', fontWeight: 600 }}>{paymentMethodDisplay}</span>
        </div>
      )}

      {/* Per-student monthly breakdown */}
      {perStudentMonthly.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#E0E0F4', marginBottom: 10 }}>Monthly Rate by Student</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {perStudentMonthly.map(s => (
              <div key={s.id} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '10px 12px', borderRadius: 8,
                background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)',
              }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#E0E0F4' }}>{s.firstName}</div>
                  <div style={{ fontSize: 10, color: '#8080A8' }}>
                    {fmtUSD(s.rate)} × {s.sessions} session{s.sessions === 1 ? '' : 's'}/mo
                    {s.instrument ? ` · ${instrumentWithEmojiTitle(s.instrument)}` : ''}
                  </div>
                </div>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#D4226A' }}>{fmtUSD(s.monthly)}</div>
              </div>
            ))}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '10px 12px', borderRadius: 8, marginTop: 4,
              background: 'rgba(212,34,106,0.06)', border: '1px solid rgba(212,34,106,0.2)',
            }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#E0E0F4' }}>Family Monthly Total</div>
              <div style={{ fontSize: 15, fontWeight: 800, color: '#D4226A' }}>{fmtUSD(monthlyTotal)}</div>
            </div>
          </div>
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
            const requested = Number(inv.requested_amount ?? 0)
            const paid = Number(inv.amount_paid ?? 0)
            const isPaid = inv.status === 'paid' || paid >= requested
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
                  <div style={{ fontSize: 10, color: '#606088' }}>{fmtUSD(requested)}</div>
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

function SummaryCard({ label, value, color, tint, border }: { label: string; value: string; color: string; tint: string; border: string }) {
  return (
    <div style={{
      flex: 1, padding: '14px 12px', borderRadius: 12, textAlign: 'center',
      background: tint, border: `1px solid ${border}`,
    }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: '#8080A8', textTransform: 'uppercase', marginBottom: 4, letterSpacing: '0.04em' }}>
        {label}
      </div>
      <div style={{ fontSize: 18, fontWeight: 800, color, lineHeight: 1.2 }}>{value}</div>
    </div>
  )
}
