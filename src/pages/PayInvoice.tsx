import { useState, useEffect, useRef } from 'react'
import { useParams } from 'react-router-dom'
import MusicLoader from '../components/shared/MusicLoader'
import { supabase as anonClient } from '../lib/supabase'
import { usePublicTenantId } from '../hooks/usePublicTenantId'
import { DEFAULT_SESSIONS_PER_MONTH, DEFAULT_RATE_PER_SESSION } from '../lib/constants'
import { instrumentWithEmojiTitle } from '../utils/instrumentEmoji'

// ═══════════════════════════════════════
// TYPES
// ═══════════════════════════════════════

interface InvoiceData {
  id: string
  token: string
  status: string
  amount_cents: number
  billing_period_label: string | null
  due_date: string | null
  billing_day: number | null
  created_at: string
  paid_at: string | null
  family: {
    id: string
    name: string
    parent_name: string | null
    primary_email: string | null
    primary_phone: string | null
    card_brand: string | null
    card_last_four: string | null
    billing_day: number | null
  }
  location: {
    id: string
    name: string
    address: string
    city: string
    state: string
    zip: string
    phone: string | null
    email: string | null
    logo_url: string | null
    color: string | null
  } | null
  students: {
    id: string
    first_name: string
    last_name: string
    instrument: string | null
    sessions_per_month: number
    rate_per_session: number
  }[]
}

// ═══════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════

function formatDollars(cents: number): string {
  return `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function formatDate(d: string | null): string {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
}

function ordinal(n: number): string {
  if (n === 1 || n === 21 || n === 31) return `${n}st`
  if (n === 2 || n === 22) return `${n}nd`
  if (n === 3 || n === 23) return `${n}rd`
  return `${n}th`
}

/** Darken a hex color by a percentage (0-1) */
function darken(hex: string, amount: number): string {
  const r = Math.max(0, Math.round(parseInt(hex.slice(1, 3), 16) * (1 - amount)))
  const g = Math.max(0, Math.round(parseInt(hex.slice(3, 5), 16) * (1 - amount)))
  const b = Math.max(0, Math.round(parseInt(hex.slice(5, 7), 16) * (1 - amount)))
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`
}

function hexToRgb(hex: string): string {
  return `${parseInt(hex.slice(1, 3), 16)},${parseInt(hex.slice(3, 5), 16)},${parseInt(hex.slice(5, 7), 16)}`
}

const FALLBACK_COLOR = '#D4226A'
const TEXT = '#E2E8F0'
const TEXT_MUTED = '#94A3B8'
const TEXT_DIM = '#64748B'

// ═══════════════════════════════════════
// SQUARE WEB PAYMENTS
// ═══════════════════════════════════════

function loadSquareScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.getElementById('square-web-sdk')) { resolve(); return }
    const script = document.createElement('script')
    script.id = 'square-web-sdk'
    script.src = 'https://web.squarecdn.com/v1/square.js'
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('Failed to load Square SDK'))
    document.head.appendChild(script)
  })
}

// ═══════════════════════════════════════
// FONT LOADER
// ═══════════════════════════════════════

function loadFonts() {
  if (document.getElementById('pay-fonts')) return
  const link = document.createElement('link')
  link.id = 'pay-fonts'
  link.rel = 'stylesheet'
  link.href = 'https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap'
  document.head.appendChild(link)
}

// ═══════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════

export default function PayInvoice() {
  const tenantId = usePublicTenantId()
  const { token } = useParams<{ token: string }>()
  const [loading, setLoading] = useState(true)
  const [invoice, setInvoice] = useState<InvoiceData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [paying, setPaying] = useState(false)
  const [payError, setPayError] = useState<string | null>(null)
  const [paid, setPaid] = useState(false)
  const [saveCard, setSaveCard] = useState(true)
  const [showFlag, setShowFlag] = useState(false)
  const [flagReason, setFlagReason] = useState('')
  const [flagSent, setFlagSent] = useState(false)
  const [flagSending, setFlagSending] = useState(false)
  const cardContainerRef = useRef<HTMLDivElement>(null)
  const cardInstanceRef = useRef<any>(null)
  const cardInitRef = useRef(false)

  useEffect(() => { loadFonts() }, [])

  // Fetch invoice data
  useEffect(() => {
    if (!token) { setError('No token provided'); setLoading(false); return }

    async function load() {
      const { data: inv, error: invErr } = await anonClient
        .from('invoice_tokens')
        .select('*')
        .eq('token', token)
        .single()

      if (invErr || !inv) { setError('This link is invalid or has expired.'); setLoading(false); return }
      if (new Date(inv.expires_at) < new Date()) { setError('This link is invalid or has expired.'); setLoading(false); return }

      const { data: family } = await anonClient
        .from('families')
        .select('id, name, parent_name, primary_email, primary_phone, card_brand, card_last_four, billing_day')
        .eq('id', inv.family_id)
        .single()

      if (!family) { setError('Family not found.'); setLoading(false); return }

      let location: InvoiceData['location'] = null
      if (inv.location_id) {
        const { data: loc } = await anonClient
          .from('locations')
          .select('id, name, address, city, state, zip, phone, email, logo_url, color')
          .eq('id', inv.location_id)
          .single()
        location = loc
      }
      if (!location) {
        const { data: students } = await anonClient
          .from('students')
          .select('location_id')
          .eq('family_id', family.id)
          .eq('status', 'active')
          .limit(1)
        if (students?.[0]?.location_id) {
          const { data: loc } = await anonClient
            .from('locations')
            .select('id, name, address, city, state, zip, phone, email, logo_url, color')
            .eq('id', students[0].location_id)
            .single()
          location = loc
        }
      }

      const { data: rates } = await anonClient
        .from('student_effective_rate')
        .select('student_id, first_name, last_name, instrument, sessions_per_month, rate_per_session')
        .eq('family_id', family.id)

      const data: InvoiceData = {
        id: inv.id,
        token: inv.token,
        status: inv.status,
        amount_cents: inv.amount_cents,
        billing_period_label: inv.billing_period_label,
        due_date: inv.due_date ?? inv.expires_at,
        billing_day: inv.billing_day ?? family.billing_day,
        created_at: inv.created_at,
        paid_at: inv.paid_at,
        family,
        location,
        students: (rates ?? []).map((s: any) => ({
          id: s.student_id,
          first_name: s.first_name,
          last_name: s.last_name,
          instrument: s.instrument,
          sessions_per_month: s.sessions_per_month ?? DEFAULT_SESSIONS_PER_MONTH,
          rate_per_session: s.rate_per_session ?? DEFAULT_RATE_PER_SESSION,
        })),
      }

      if (inv.status === 'pending') {
        await anonClient.from('invoice_tokens').update({ status: 'viewed', viewed_at: new Date().toISOString() }).eq('id', inv.id)
        data.status = 'viewed'
      }

      if (inv.status === 'paid') setPaid(true)

      setInvoice(data)
      setLoading(false)
    }

    load()
  }, [token])

  // Initialize Square card form — only once
  useEffect(() => {
    if (!invoice || invoice.family.card_last_four || paid || cardInitRef.current) return
    cardInitRef.current = true

    async function init() {
      try {
        await loadSquareScript()
        const appId = import.meta.env.VITE_SQUARE_APP_ID
        const locationId = invoice.location?.id
        if (!appId || !locationId) return

        const payments = (window as any).Square.payments(appId, locationId)
        const card = await payments.card()
        if (cardContainerRef.current) {
          await card.attach(cardContainerRef.current)
          cardInstanceRef.current = card
        }
      } catch (err) {
        console.error('Failed to init Square card:', err)
        cardInitRef.current = false
      }
    }

    init()
  }, [invoice, paid])

  // Handle payment
  async function handlePay() {
    if (!cardInstanceRef.current || !invoice) return
    setPaying(true)
    setPayError(null)

    const sqHeaders = {
      'Authorization': `Bearer ${import.meta.env.VITE_SQUARE_ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
      'Square-Version': '2025-01-23',
    }

    try {
      const result = await cardInstanceRef.current.tokenize()
      if (result.status !== 'OK') {
        setPayError('Please check your card details and try again.')
        setPaying(false)
        return
      }

      let sourceId = result.token

      if (saveCard) {
        const cardRes = await fetch('/square-api/v2/cards', {
          method: 'POST',
          headers: sqHeaders,
          body: JSON.stringify({
            idempotency_key: crypto.randomUUID(),
            source_id: result.token,
            card: { reference_id: invoice.family.id },
          }),
        })

        if (cardRes.ok) {
          const cardData = await cardRes.json()
          const savedCard = cardData.card
          if (savedCard?.id) {
            sourceId = savedCard.id
            await anonClient.from('families').update({
              square_card_id: savedCard.id,
              card_brand: savedCard.card_brand ?? null,
              card_last_four: savedCard.last_4 ?? null,
              card_exp_month: savedCard.exp_month ?? null,
              card_exp_year: savedCard.exp_year ?? null,
            }).eq('id', invoice.family.id)
          }
        }
      }

      const payRes = await fetch('/square-api/v2/payments', {
        method: 'POST',
        headers: sqHeaders,
        body: JSON.stringify({
          source_id: sourceId,
          idempotency_key: crypto.randomUUID(),
          amount_money: { amount: invoice.amount_cents, currency: 'USD' },
          reference_id: invoice.token,
          note: `${invoice.family.name} — ${invoice.billing_period_label ?? 'Music Sessions'}`,
        }),
      })

      if (!payRes.ok) {
        const err = await payRes.json().catch(() => null)
        throw new Error(err?.errors?.[0]?.detail ?? 'Payment failed')
      }

      const payData = await payRes.json()

      await anonClient
        .from('invoice_tokens')
        .update({ status: 'paid', paid_at: new Date().toISOString(), square_payment_id: payData.payment?.id ?? null })
        .eq('token', invoice.token)

      setPaid(true)
    } catch (err) {
      setPayError(err instanceof Error ? err.message : 'Payment failed. Please try again.')
    } finally {
      setPaying(false)
    }
  }

  // ═══════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════

  const C = invoice?.location?.color || FALLBACK_COLOR
  const rgb = hexToRgb(C)

  // Loading / Error states use fallback styling
  if (loading) {
    return (
      <div style={{ ...S.page, background: '#060608' }}>
        <div style={S.center}><MusicLoader /></div>
      </div>
    )
  }

  if (error) {
    return (
      <div style={{ ...S.page, background: '#060608' }}>
        <div style={S.center}>
          <div style={S.card}>
            <div style={{ textAlign: 'center', padding: '48px 24px' }}>
              <div style={{ fontSize: 48, marginBottom: 16, opacity: 0.4 }}>!</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: TEXT, marginBottom: 8, fontFamily: BEBAS }}>{error}</div>
              <div style={{ fontSize: 14, color: TEXT_MUTED }}>If you believe this is an error, please contact your music school.</div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (!invoice) return null

  const loc = invoice.location
  const fam = invoice.family
  const billingDay = invoice.billing_day ?? 1
  const hasCard = !!fam.card_last_four
  const subtotalCents = invoice.students.reduce((s, st) => s + st.sessions_per_month * Math.round(st.rate_per_session * 100), 0)

  return (
    <div style={{
      ...S.page,
      background: `radial-gradient(ellipse 80% 60% at 85% 10%, rgba(${rgb},0.12) 0%, transparent 60%), #060608`,
    }}>
      {/* Grid pattern overlay */}
      <div style={{
        position: 'fixed', inset: 0, pointerEvents: 'none', opacity: 0.03,
        backgroundImage: 'linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)',
        backgroundSize: '60px 60px',
      }} />

      <div style={S.container}>
        <div style={S.card}>

          {/* HEADER */}
          <div style={S.header}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              {loc?.logo_url ? (
                <img src={loc.logo_url} alt="" style={{ width: 52, height: 52, borderRadius: 14, objectFit: 'cover', border: `1px solid rgba(${rgb},0.3)` }} />
              ) : loc ? (
                <div style={{
                  width: 52, height: 52, borderRadius: 14, flexShrink: 0,
                  background: `rgba(${rgb},0.1)`, border: `1px solid rgba(${rgb},0.25)`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 26, fontWeight: 800, color: C, fontFamily: BEBAS,
                }}>{loc.name.charAt(0)}</div>
              ) : null}
              <div>
                {loc && (
                  <>
                    <div style={{
                      fontSize: 26, fontFamily: BEBAS, letterSpacing: '0.02em', lineHeight: 1,
                      background: `linear-gradient(135deg, ${C}, ${darken(C, 0.2)})`,
                      WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
                      marginBottom: 4,
                    }}>{loc.name}</div>
                    <div style={{ fontSize: 13, color: TEXT_MUTED, lineHeight: 1.6 }}>
                      {loc.address}, {loc.city}, {loc.state}
                      {loc.phone && <> &middot; {loc.phone}</>}
                    </div>
                  </>
                )}
              </div>
            </div>
            <div style={{ textAlign: 'right', flexShrink: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: C, textTransform: 'uppercase', letterSpacing: '0.1em', fontFamily: BEBAS, marginBottom: 4 }}>Invoice</div>
              <div style={{ fontSize: 13, color: TEXT_MUTED }}>{formatDate(invoice.created_at)}</div>
              {invoice.billing_period_label && (
                <div style={{ fontSize: 12, color: TEXT_DIM, marginTop: 2 }}>{invoice.billing_period_label}</div>
              )}
            </div>
          </div>

          <div style={S.divider} />

          {/* TITLE */}
          <div style={{ fontSize: 32, fontFamily: BEBAS, letterSpacing: '0.02em', color: TEXT, marginBottom: 20, lineHeight: 1 }}>
            {fam.name.replace(/\s*family\s*/i, '')} Family — Music Sessions
          </div>

          {/* INFO BAR */}
          <div style={{ display: 'flex', gap: 0, marginBottom: 10 }}>
            <div style={{ flex: 1, paddingRight: 20 }}>
              <div style={S.infoLabel}>Bill To</div>
              <div style={{ fontSize: 15, fontWeight: 600, color: TEXT }}>{fam.parent_name ?? fam.name}</div>
              {fam.primary_email && <div style={{ fontSize: 12, color: TEXT_MUTED, marginTop: 2 }}>{fam.primary_email}</div>}
              {fam.primary_phone && <div style={{ fontSize: 12, color: TEXT_MUTED }}>{fam.primary_phone}</div>}
            </div>
            <div style={{ width: 1, background: 'rgba(255,255,255,0.06)', margin: '0 0', flexShrink: 0 }} />
            <div style={{ flex: 1, paddingLeft: 20, paddingRight: 20 }}>
              <div style={S.infoLabel}>Amount Due</div>
              <div style={{ fontSize: 28, fontWeight: 800, color: C, fontFamily: BEBAS, letterSpacing: '0.02em' }}>{formatDollars(invoice.amount_cents)}</div>
            </div>
            <div style={{ width: 1, background: 'rgba(255,255,255,0.06)', margin: '0 0', flexShrink: 0 }} />
            <div style={{ flex: 1, paddingLeft: 20 }}>
              <div style={S.infoLabel}>Due Date</div>
              <div style={{ fontSize: 15, fontWeight: 600, color: TEXT }}>{formatDate(invoice.due_date)}</div>
              {hasCard && (
                <div style={{ fontSize: 12, color: '#4ADE80', marginTop: 3 }}>Autopay on the {ordinal(billingDay)}</div>
              )}
            </div>
          </div>

          {/* LINE ITEMS */}
          <div style={S.divider} />
          <div style={S.tableHeader}>
            <span style={{ flex: 2 }}>Description</span>
            <span style={{ flex: 0.7, textAlign: 'center' }}>Qty</span>
            <span style={{ flex: 1, textAlign: 'right' }}>Price</span>
            <span style={{ flex: 1, textAlign: 'right' }}>Amount</span>
          </div>

          {invoice.students.map(st => {
            const lineCents = st.sessions_per_month * Math.round(st.rate_per_session * 100)
            const instrumentLabel = st.instrument
              ? instrumentWithEmojiTitle(st.instrument)
              : '🎵 Music'
            return (
              <div key={st.id} style={S.tableRow}>
                <div style={{ flex: 2 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: TEXT }}>{st.first_name} {st.last_name}</div>
                  <div style={{ fontSize: 12, color: TEXT_MUTED }}>{instrumentLabel} — 30-minute music session</div>
                </div>
                <span style={{ flex: 0.7, textAlign: 'center', fontSize: 14, color: TEXT }}>{st.sessions_per_month}</span>
                <span style={{ flex: 1, textAlign: 'right', fontSize: 14, color: TEXT }}>${st.rate_per_session.toFixed(2)}</span>
                <span style={{ flex: 1, textAlign: 'right', fontSize: 14, fontWeight: 700, color: TEXT }}>{formatDollars(lineCents)}</span>
              </div>
            )
          })}

          {/* TOTALS */}
          <div style={S.divider} />
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 40, padding: '14px 0' }}>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 13, color: TEXT_DIM, marginBottom: 10 }}>Subtotal</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: TEXT }}>Total</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 13, color: TEXT_MUTED, marginBottom: 10 }}>{formatDollars(subtotalCents)}</div>
              <div style={{ fontSize: 24, fontWeight: 800, fontFamily: BEBAS, letterSpacing: '0.02em', color: C }}>{formatDollars(invoice.amount_cents)}</div>
            </div>
          </div>

          {/* PAYMENT SECTION */}
          <div style={S.divider} />

          {paid ? (
            <div style={{
              textAlign: 'center', padding: '32px 20px', borderRadius: 16,
              background: 'rgba(74,222,128,0.08)', border: '1px solid rgba(74,222,128,0.3)',
            }}>
              <div style={{ fontSize: 32, marginBottom: 8, color: '#4ADE80' }}>&#10003;</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: '#4ADE80', marginBottom: 4, fontFamily: BEBAS, letterSpacing: '0.02em' }}>Payment Received — Thank You!</div>
              {invoice.paid_at && <div style={{ fontSize: 13, color: TEXT_MUTED }}>Paid on {formatDate(invoice.paid_at)}</div>}
            </div>
          ) : hasCard ? (
            <div style={{
              padding: '20px 22px', borderRadius: 16,
              background: 'rgba(74,222,128,0.08)', border: '1px solid rgba(74,222,128,0.3)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#4ADE80" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: '#4ADE80', fontFamily: BEBAS, letterSpacing: '0.02em' }}>Autopay is Active</div>
                  <div style={{ fontSize: 13, color: TEXT_MUTED, lineHeight: 1.5 }}>
                    Your {fam.card_brand ?? 'card'} ending in {fam.card_last_four} will be charged {formatDollars(invoice.amount_cents)} on {invoice.due_date ? formatDate(invoice.due_date) : `the ${ordinal(billingDay)}`}. No action needed.
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div style={{ padding: '20px 0' }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: TEXT, marginBottom: 14, fontFamily: BEBAS, letterSpacing: '0.02em' }}>Pay Now</div>
              <div style={{
                padding: 16, borderRadius: 14, marginBottom: 14,
                background: 'rgba(20,20,32,0.6)', border: '1px solid rgba(255,255,255,0.06)',
              }}>
                <div ref={cardContainerRef} style={{ minHeight: 44 }} />
              </div>
              <label onClick={() => setSaveCard(!saveCard)} style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 18, cursor: 'pointer', userSelect: 'none' }}>
                <div style={{
                  width: 14, height: 14, borderRadius: 3, flexShrink: 0,
                  background: saveCard ? `rgba(${rgb},0.6)` : 'rgba(255,255,255,0.06)',
                  border: saveCard ? `1px solid rgba(${rgb},0.4)` : '1px solid rgba(255,255,255,0.1)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {saveCard && <svg width="9" height="9" viewBox="0 0 12 12" fill="none"><path d="M2.5 6L5 8.5L9.5 3.5" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                </div>
                <span style={{ fontSize: 11, color: TEXT_DIM }}>Save card for automatic monthly payments</span>
              </label>
              {payError && <div style={{ fontSize: 13, color: '#EF4444', marginBottom: 12 }}>{payError}</div>}
              <button
                onClick={handlePay}
                disabled={paying}
                style={{
                  width: '100%', padding: '16px 0', borderRadius: 12,
                  border: 'none',
                  background: paying ? '#333' : `linear-gradient(135deg, ${C}, ${darken(C, 0.25)})`,
                  color: '#fff', fontSize: 20, fontWeight: 400, fontFamily: BEBAS, letterSpacing: '0.06em',
                  cursor: paying ? 'default' : 'pointer',
                  boxShadow: paying ? 'none' : `0 6px 30px rgba(${rgb},0.35)`,
                  transition: 'all 150ms',
                  transform: 'translateY(0)',
                }}
                onMouseEnter={e => { if (!paying) e.currentTarget.style.transform = 'translateY(-3px)' }}
                onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)' }}
              >
                {paying ? 'Processing...' : `PAY ${formatDollars(invoice.amount_cents)}`}
              </button>
            </div>
          )}

        </div>

        {/* Invoice flag link — only for no-card families */}
        {!hasCard && !paid && (
          <div style={{ textAlign: 'center', padding: '8px 0 0' }}>
            <button onClick={() => setShowFlag(true)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, color: TEXT_DIM, textDecoration: 'underline', padding: 4 }}>
              Problem with this invoice? {'\u{2197}'}
            </button>
          </div>
        )}

        {/* FOOTER */}
        <div style={{ textAlign: 'center', padding: '28px 0 44px', fontSize: 12, color: TEXT_DIM }}>
          {loc ? loc.name : 'Lessonpreneur'} — Powered by Lessonpreneur
        </div>
      </div>

      {/* Flag Modal */}
      {showFlag && invoice && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 10000, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={() => !flagSending && setShowFlag(false)}>
          <div style={{ width: '100%', maxWidth: 380, background: 'rgba(20,20,32,0.95)', borderRadius: 18, border: '1px solid rgba(255,255,255,0.08)', padding: 24, boxShadow: '0 20px 60px rgba(0,0,0,0.5)' }} onClick={e => e.stopPropagation()}>
            {flagSent ? (
              <div style={{ textAlign: 'center', padding: '16px 0' }}>
                <div style={{ fontSize: 28, marginBottom: 8 }}>{'\u{2713}'}</div>
                <div style={{ fontSize: 15, fontWeight: 700, color: '#4ADE80', marginBottom: 4 }}>Thanks — we will look into this</div>
                <div style={{ fontSize: 12, color: TEXT_MUTED }}>We will follow up with you shortly.</div>
                <button onClick={() => { setShowFlag(false); setFlagSent(false); setFlagReason('') }} style={{ marginTop: 16, padding: '8px 20px', borderRadius: 8, border: 'none', background: 'rgba(255,255,255,0.06)', color: TEXT_MUTED, fontSize: 12, cursor: 'pointer' }}>Close</button>
              </div>
            ) : (
              <>
                <div style={{ fontSize: 15, fontWeight: 700, color: TEXT, marginBottom: 12 }}>Report an Issue</div>
                <textarea
                  value={flagReason}
                  onChange={e => setFlagReason(e.target.value)}
                  placeholder="Tell us what's wrong with this invoice..."
                  style={{ width: '100%', minHeight: 100, padding: 12, borderRadius: 10, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: TEXT, fontFamily: 'inherit', fontSize: 13, resize: 'vertical', outline: 'none', marginBottom: 12 }}
                />
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => setShowFlag(false)} style={{ flex: 1, padding: '10px 0', borderRadius: 8, border: '1px solid rgba(255,255,255,0.08)', background: 'transparent', color: TEXT_MUTED, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
                  <button
                    disabled={!flagReason.trim() || flagSending}
                    onClick={async () => {
                      setFlagSending(true)
                      await anonClient.from('invoice_flags').insert({
                        tenant_id: tenantId!,
                        invoice_token_id: invoice.id,
                        family_id: invoice.family.id,
                        reason: flagReason.trim(),
                      })
                      setFlagSending(false)
                      setFlagSent(true)
                    }}
                    style={{ flex: 1, padding: '10px 0', borderRadius: 8, border: 'none', background: flagReason.trim() && !flagSending ? C : '#333', color: '#fff', fontSize: 12, fontWeight: 700, cursor: flagReason.trim() ? 'pointer' : 'default' }}
                  >
                    {flagSending ? 'Sending...' : 'Submit'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ═══════════════════════════════════════
// CONSTANTS & STYLES
// ═══════════════════════════════════════

const BEBAS = "'Bebas Neue', sans-serif"

const S: Record<string, React.CSSProperties> = {
  page: {
    minHeight: '100vh',
    fontFamily: "'Plus Jakarta Sans', sans-serif",
    padding: '24px 16px',
    position: 'relative',
  },
  center: {
    display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '80vh',
  },
  container: {
    maxWidth: 680, margin: '0 auto', position: 'relative', zIndex: 1,
  },
  card: {
    background: 'rgba(20,20,32,0.9)',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: 24,
    padding: '36px 36px 32px',
    boxShadow: '0 40px 100px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.05)',
    backdropFilter: 'blur(16px)',
  },
  header: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 20, flexWrap: 'wrap' as const,
  },
  divider: {
    height: 1, background: 'rgba(255,255,255,0.06)', margin: '20px 0',
  },
  infoLabel: {
    fontSize: 11, fontWeight: 700, color: '#475569', textTransform: 'uppercase' as const, letterSpacing: '0.08em', marginBottom: 6,
  },
  tableHeader: {
    display: 'flex', padding: '8px 0', fontSize: 11, fontWeight: 700, color: '#475569',
    textTransform: 'uppercase' as const, letterSpacing: '0.08em',
    borderBottom: '1px solid rgba(255,255,255,0.06)',
  },
  tableRow: {
    display: 'flex', alignItems: 'center', padding: '14px 0',
    borderBottom: '1px solid rgba(255,255,255,0.03)',
    borderRadius: 8,
    transition: 'background 100ms',
  },
}
