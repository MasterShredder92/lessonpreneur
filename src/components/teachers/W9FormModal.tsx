import { useState } from 'react'
import { useAuthContext } from '../../app/AuthContext'
import { supabase } from '../../lib/supabase'
import { toast } from '../shared/Toast'
import { X } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import jsPDF from 'jspdf'

interface Props {
  teacherId: string
  teacherName: string
  onClose: () => void
}

// ═══════════════════════════════════════
// AES-256-GCM ENCRYPTION
// ═══════════════════════════════════════

async function encryptTIN(tin: string): Promise<string> {
  const key = import.meta.env.VITE_W9_ENCRYPTION_KEY || ''
  const encoder = new TextEncoder()
  const keyMaterial = await crypto.subtle.importKey(
    'raw', encoder.encode(key.padEnd(32).slice(0, 32)),
    { name: 'AES-GCM' }, false, ['encrypt']
  )
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv }, keyMaterial, encoder.encode(tin)
  )
  const combined = new Uint8Array(iv.length + new Uint8Array(encrypted).byteLength)
  combined.set(iv)
  combined.set(new Uint8Array(encrypted), iv.length)
  return btoa(String.fromCharCode(...combined))
}

// ═══════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════

function formatSsn(val: string): string {
  const d = val.replace(/\D/g, '').slice(0, 9)
  if (d.length <= 3) return d
  if (d.length <= 5) return d.slice(0, 3) + '-' + d.slice(3)
  return d.slice(0, 3) + '-' + d.slice(3, 5) + '-' + d.slice(5)
}

function formatEin(val: string): string {
  const d = val.replace(/\D/g, '').slice(0, 9)
  if (d.length <= 2) return d
  return d.slice(0, 2) + '-' + d.slice(2)
}

function maskTin(val: string, type: string): string {
  const d = val.replace(/\D/g, '')
  if (type === 'SSN') return d.length >= 9 ? 'XXX-XX-' + d.slice(5) : formatSsn(val)
  return d.length >= 9 ? 'XX-XXX' + d.slice(5) : formatEin(val)
}

const US_STATES = ['AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY','DC']

const LBL: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: '#A0A0C8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6, display: 'block' }
const INP: React.CSSProperties = { width: '100%', padding: '10px 14px', borderRadius: 10, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: '#E0E0F4', fontFamily: 'inherit', fontSize: 14, outline: 'none' }

// ═══════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════

export default function W9FormModal({ teacherId, teacherName, onClose }: Props) {
  const { tenantId } = useAuthContext()
  const qc = useQueryClient()
  const [submitting, setSubmitting] = useState(false)
  const [showTin, setShowTin] = useState(false)

  const [form, setForm] = useState({
    legalName: teacherName || '',
    businessName: '',
    taxClass: 'individual' as 'individual' | 'other',
    otherTaxDesc: '',
    exemptCode: '',
    address: '',
    city: '',
    state: 'NE',
    zip: '',
    tinType: 'SSN' as 'SSN' | 'EIN',
    tin: '',
    signature: '',
  })

  const set = (k: keyof typeof form, v: string) => setForm(f => ({ ...f, [k]: v }))
  const today = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
  const rawTin = form.tin.replace(/\D/g, '')
  const tinValid = rawTin.length === 9

  async function generatePdf(ytdEarnings: number): Promise<Blob> {
    const doc = new jsPDF({ unit: 'pt', format: 'letter' })
    const w = doc.internal.pageSize.getWidth()
    let y = 40

    doc.setFontSize(18); doc.setFont('helvetica', 'bold')
    doc.text('Form W-9', 40, y); y += 16
    doc.setFontSize(9); doc.setFont('helvetica', 'normal')
    doc.text('Request for Taxpayer Identification Number and Certification', 40, y); y += 24
    doc.setDrawColor(200); doc.line(40, y, w - 40, y); y += 18

    const field = (label: string, value: string) => {
      doc.setFontSize(8); doc.setFont('helvetica', 'normal'); doc.setTextColor(120)
      doc.text(label, 40, y); y += 12
      doc.setFontSize(11); doc.setFont('helvetica', 'bold'); doc.setTextColor(30)
      doc.text(value || '—', 40, y); y += 20
    }

    field('1. Name (as shown on your income tax return)', form.legalName)
    if (form.businessName) field('2. Business name / disregarded entity name', form.businessName)
    const classLabel = form.taxClass === 'individual' ? 'Individual / Sole Proprietor' : `Other: ${form.otherTaxDesc}`
    field('3. Federal tax classification', classLabel)
    if (form.exemptCode) field('4. Exempt payee code', form.exemptCode)
    field('5. Address', form.address)
    field('6. City, State, ZIP', `${form.city}, ${form.state} ${form.zip}`)
    const maskedTin = form.tinType === 'SSN' ? `XXX-XX-${rawTin.slice(5)}` : `XX-XXX${rawTin.slice(5)}`
    field(`7. ${form.tinType}`, maskedTin)

    y += 10; doc.setDrawColor(200); doc.line(40, y, w - 40, y); y += 20

    doc.setFontSize(9); doc.setFont('helvetica', 'bold'); doc.setTextColor(30)
    doc.text('Certification', 40, y); y += 14
    doc.setFontSize(8); doc.setFont('helvetica', 'normal'); doc.setTextColor(80)
    const certText = 'Under penalties of perjury, I certify that the number shown on this form is my correct taxpayer identification number, and I am a U.S. citizen or other U.S. person.'
    const lines = doc.splitTextToSize(certText, w - 80)
    doc.text(lines, 40, y); y += lines.length * 12 + 16

    doc.setFontSize(8); doc.setTextColor(120)
    doc.text('Signature:', 40, y); y += 14
    doc.setFontSize(14); doc.setFont('helvetica', 'italic'); doc.setTextColor(30)
    doc.text(form.signature, 40, y); y += 20
    doc.setFontSize(9); doc.setFont('helvetica', 'normal'); doc.setTextColor(80)
    doc.text(`Date: ${today}`, 40, y); y += 30

    // YTD Earnings
    if (ytdEarnings > 0) {
      doc.setDrawColor(200); doc.line(40, y, w - 40, y); y += 14
      doc.setFontSize(8); doc.setTextColor(120)
      doc.text(`YTD Earnings as of ${today}: $${(ytdEarnings / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}`, 40, y)
    }

    return doc.output('blob')
  }

  async function handleSubmit() {
    if (!form.legalName || !form.address || !form.city || !form.zip || !tinValid || !form.signature) {
      toast('Please fill in all required fields', 'error'); return
    }
    if (form.taxClass === 'other' && !form.otherTaxDesc.trim()) {
      toast('Please describe your entity type', 'error'); return
    }
    setSubmitting(true)

    try {
      const tinLast4 = rawTin.slice(-4)
      const tinEncrypted = await encryptTIN(rawTin)
      const now = new Date().toISOString()

      // Fetch YTD earnings
      const yearStart = `${new Date().getFullYear()}-01-01`
      const { data: payroll } = await supabase.from('payroll_entries').select('amount').eq('teacher_id', teacherId).gte('created_at', yearStart)
      const ytdCents = (payroll ?? []).reduce((s: number, p: any) => s + (p.amount ?? 0), 0)

      // 1. Insert W-9 record
      const { data: w9, error: w9Err } = await supabase.from('teacher_w9').insert({
        tenant_id: tenantId!,
        teacher_id: teacherId,
        legal_name: form.legalName,
        business_name: form.businessName || null,
        tax_classification: form.taxClass === 'other' ? `Other: ${form.otherTaxDesc}` : 'Individual / Sole Proprietor',
        llc_type: null,
        exempt_payee_code: form.exemptCode || null,
        street_address: form.address,
        city: form.city,
        state: form.state,
        zip: form.zip,
        tin_type: form.tinType,
        tin_encrypted: tinEncrypted,
        tin_last_four: tinLast4,
        signature: form.signature,
        signed_at: now,
      }).select('id').single()

      if (w9Err) throw w9Err

      // 2. Generate and upload PDF
      const pdfBlob = await generatePdf(ytdCents)
      const dateStr = new Date().toISOString().slice(0, 10)
      const pdfPath = `w9/${teacherId}/${dateStr}.pdf`

      const { error: uploadErr } = await supabase.storage
        .from('tenant-assets')
        .upload(pdfPath, pdfBlob, { contentType: 'application/pdf', upsert: true })

      let pdfUrl: string | null = null
      if (!uploadErr) {
        const { data: urlData } = supabase.storage.from('tenant-assets').getPublicUrl(pdfPath)
        pdfUrl = urlData.publicUrl
        await supabase.from('teacher_w9').update({ pdf_url: pdfUrl }).eq('id', w9.id)
      }

      // 3. Update teacher status
      await supabase.from('teachers').update({
        w9_status: 'complete',
        w9_completed_at: now,
      }).eq('id', teacherId)

      // 4. Also save to teacher_documents
      if (pdfUrl) {
        await supabase.from('teacher_documents').insert({
          teacher_id: teacherId,
          file_url: pdfUrl,
          file_name: `W-9_${form.legalName.replace(/\s+/g, '_')}_${dateStr}.pdf`,
          category: 'W-9',
          uploaded_by: 'System (W-9 Form)',
          uploaded_at: now,
        })
      }

      qc.invalidateQueries({ queryKey: ['teacher'] })
      qc.invalidateQueries({ queryKey: ['teacher_documents'] })
      qc.invalidateQueries({ queryKey: ['teacher_w9'] })
      toast('W-9 submitted successfully', 'success')
      onClose()
    } catch (err) {
      console.error('W-9 submission failed:', err)
      toast('Failed to submit W-9. Please try again.', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 10000, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={onClose}>
      <div
        style={{
          width: '100%', maxWidth: 640, maxHeight: '85vh', overflowY: 'auto',
          background: 'rgba(20,18,36,0.97)', borderRadius: 22,
          border: '1px solid rgba(255,255,255,0.08)',
          boxShadow: '0 40px 100px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.05)',
          backdropFilter: 'blur(16px)',
          animation: 'w9SlideUp 0.25s ease-out',
        }}
        onClick={e => e.stopPropagation()}
      >
        <style>{`@keyframes w9SlideUp{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}}`}</style>

        {/* Header */}
        <div style={{ padding: '18px 28px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, background: 'rgba(20,18,36,0.97)', zIndex: 2, borderRadius: '22px 22px 0 0' }}>
          <div>
            <div style={{ fontSize: 20, fontWeight: 800, color: '#E0E0F4', fontFamily: "'Bebas Neue', sans-serif", letterSpacing: '0.5px' }}>W-9 Form</div>
            <div style={{ fontSize: 12, color: '#8080A8', marginTop: 2 }}>Request for Taxpayer Identification Number</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#8080A8', padding: 4 }}><X size={20} /></button>
        </div>

        <div style={{ padding: '20px 28px 28px', display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* SECURITY BANNER */}
          <div style={{ padding: '14px 16px', borderRadius: 14, background: 'rgba(20,184,166,0.06)', border: '1px solid rgba(20,184,166,0.2)', display: 'flex', gap: 12, alignItems: 'flex-start' }}>
            <span style={{ fontSize: 20, flexShrink: 0, lineHeight: 1.2 }}>{'\u{1F512}'}</span>
            <div style={{ fontSize: 12, color: '#5EEAD4', lineHeight: 1.6 }}>
              Your information is transmitted over an encrypted HTTPS connection and stored on SOC 2-compliant Supabase servers. Your SSN/EIN is encrypted with AES-256 before leaving your browser — never stored in plain text. Accessed only for year-end 1099 processing. Never sold or shared.
            </div>
          </div>

          {/* Section 1: Identity */}
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#D4226A', marginBottom: 14, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Identity</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={LBL}>Legal Name <span style={{ color: '#EF4444' }}>*</span></label>
                <input style={INP} value={form.legalName} onChange={e => set('legalName', e.target.value)} placeholder="As shown on your income tax return" />
              </div>
              <div>
                <label style={LBL}>Business Name / DBA</label>
                <input style={INP} value={form.businessName} onChange={e => set('businessName', e.target.value)} placeholder="If different from above (optional)" />
              </div>
            </div>
          </div>

          {/* Section 2: Tax Classification — Simplified */}
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#D4226A', marginBottom: 14, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Tax Classification</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {([
                { value: 'individual' as const, label: 'Individual / Sole Proprietor' },
                { value: 'other' as const, label: 'Other' },
              ]).map(c => (
                <label key={c.value} style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', padding: '10px 14px', borderRadius: 10, background: form.taxClass === c.value ? 'rgba(212,34,106,0.08)' : 'transparent', border: form.taxClass === c.value ? '1px solid rgba(212,34,106,0.25)' : '1px solid transparent', transition: 'all 0.15s' }} onClick={() => set('taxClass', c.value)}>
                  <div style={{ width: 18, height: 18, borderRadius: '50%', border: form.taxClass === c.value ? '2px solid #D4226A' : '2px solid #606088', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    {form.taxClass === c.value && <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#D4226A' }} />}
                  </div>
                  <span style={{ fontSize: 13, color: form.taxClass === c.value ? '#E0E0F4' : '#9A96B4', fontWeight: form.taxClass === c.value ? 700 : 500 }}>{c.label}</span>
                </label>
              ))}
            </div>
            {form.taxClass === 'other' && (
              <div style={{ marginTop: 10, paddingLeft: 28 }}>
                <label style={LBL}>Please describe your entity type <span style={{ color: '#EF4444' }}>*</span></label>
                <input style={INP} value={form.otherTaxDesc} onChange={e => set('otherTaxDesc', e.target.value)} placeholder="e.g. LLC, Partnership, Trust..." />
              </div>
            )}
            <div style={{ marginTop: 12 }}>
              <label style={LBL}>Exempt Payee Code</label>
              <input style={{ ...INP, maxWidth: 120 }} value={form.exemptCode} onChange={e => set('exemptCode', e.target.value)} placeholder="Optional" />
            </div>
          </div>

          {/* Section 3: Address */}
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#D4226A', marginBottom: 14, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Address</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={LBL}>Street Address <span style={{ color: '#EF4444' }}>*</span></label>
                <input style={INP} value={form.address} onChange={e => set('address', e.target.value)} placeholder="123 Main St, Apt 4" />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 10 }}>
                <div>
                  <label style={LBL}>City <span style={{ color: '#EF4444' }}>*</span></label>
                  <input style={INP} value={form.city} onChange={e => set('city', e.target.value)} />
                </div>
                <div>
                  <label style={LBL}>State <span style={{ color: '#EF4444' }}>*</span></label>
                  <select style={{ ...INP, cursor: 'pointer' }} value={form.state} onChange={e => set('state', e.target.value)}>
                    {US_STATES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label style={LBL}>ZIP <span style={{ color: '#EF4444' }}>*</span></label>
                  <input style={INP} value={form.zip} onChange={e => set('zip', e.target.value.replace(/\D/g, '').slice(0, 5))} />
                </div>
              </div>
            </div>
          </div>

          {/* Section 4: TIN */}
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#D4226A', marginBottom: 14, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Taxpayer ID Number</div>
            <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
              {(['SSN', 'EIN'] as const).map(t => (
                <button key={t} onClick={() => { set('tinType', t); set('tin', '') }} style={{ padding: '8px 20px', borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: 'pointer', background: form.tinType === t ? 'rgba(212,34,106,0.12)' : 'rgba(255,255,255,0.04)', color: form.tinType === t ? '#D4226A' : '#8080A8', border: `1px solid ${form.tinType === t ? 'rgba(212,34,106,0.3)' : 'rgba(255,255,255,0.08)'}`, transition: 'all 0.15s' }}>{t}</button>
              ))}
            </div>
            <div style={{ position: 'relative' }}>
              <label style={LBL}>{form.tinType} <span style={{ color: '#EF4444' }}>*</span></label>
              <input
                style={{ ...INP, fontFamily: 'monospace', letterSpacing: '2px', paddingRight: 70 }}
                value={showTin ? (form.tinType === 'SSN' ? formatSsn(form.tin) : formatEin(form.tin)) : maskTin(form.tin, form.tinType)}
                onChange={e => set('tin', e.target.value)}
                placeholder={form.tinType === 'SSN' ? '___-__-____' : '__-_______'}
                onFocus={() => setShowTin(true)}
                onBlur={() => setShowTin(false)}
              />
              <div style={{ position: 'absolute', right: 14, top: 30, fontSize: 10, color: tinValid ? '#22C55E' : '#606088', fontWeight: 600 }}>
                {tinValid ? '\u{2713} Valid' : `${rawTin.length}/9`}
              </div>
            </div>
          </div>

          {/* Section 5: Signature */}
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#D4226A', marginBottom: 14, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Certification & Signature</div>
            <div style={{ fontSize: 12, color: '#8080A8', lineHeight: 1.6, marginBottom: 14, padding: '12px 14px', background: 'rgba(255,255,255,0.02)', borderRadius: 10, border: '1px solid rgba(255,255,255,0.04)' }}>
              Under penalties of perjury, I certify that the number shown on this form is my correct taxpayer identification number, and that I am a U.S. citizen or other U.S. person.
            </div>
            <div>
              <label style={LBL}>Type Your Full Legal Name <span style={{ color: '#EF4444' }}>*</span></label>
              <input
                style={{ ...INP, fontFamily: "'Georgia', serif", fontStyle: 'italic', fontSize: 18 }}
                value={form.signature}
                onChange={e => set('signature', e.target.value)}
                placeholder="Your legal signature"
              />
              <div style={{ fontSize: 10, color: '#606088', marginTop: 4 }}>By typing your name you agree this is your legal signature</div>
            </div>
            <div style={{ marginTop: 10 }}>
              <label style={LBL}>Date</label>
              <div style={{ ...INP, background: 'rgba(255,255,255,0.02)', color: '#8080A8' }}>{today}</div>
            </div>
          </div>

          {/* SECURITY FOOTER */}
          <div style={{ fontSize: 10, color: '#606088', lineHeight: 1.6, textAlign: 'center', padding: '0 12px' }}>
            By submitting you confirm this information is accurate. Data is encrypted at rest and in transit on Supabase SOC 2 Type II certified infrastructure.
          </div>

          {/* Submit */}
          <button
            onClick={handleSubmit}
            disabled={submitting}
            style={{
              width: '100%', padding: '14px 0', borderRadius: 12, border: 'none',
              background: submitting ? '#606088' : '#D4226A',
              color: '#fff', fontSize: 15, fontWeight: 800, cursor: submitting ? 'default' : 'pointer',
              boxShadow: submitting ? 'none' : '0 4px 20px rgba(212,34,106,0.35)',
              transition: 'all 0.15s',
            }}
          >
            {submitting ? 'Submitting...' : 'Submit W-9'}
          </button>
        </div>
      </div>
    </div>
  )
}
