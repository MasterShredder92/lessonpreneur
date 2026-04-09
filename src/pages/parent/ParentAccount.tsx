import { useState, useEffect } from 'react'
import { useAuthContext } from '../../app/AuthContext'
import { useParentFamily } from '../../hooks/useParentFamily'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { toast } from '../../components/shared/Toast'
import MusicLoader from '../../components/shared/MusicLoader'
import ChangePasswordModal from '../../components/shared/ChangePasswordModal'
import { KeyRound, Clock, CheckCircle2, Lock } from 'lucide-react'
import { qk } from '../../lib/queryKeys'

export default function ParentAccount() {
  const { profile, tenantId } = useAuthContext()
  const { familyId, isLoading } = useParentFamily()
  const qc = useQueryClient()
  const [showChangePassword, setShowChangePassword] = useState(false)

  // Contact info state
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [origPhone, setOrigPhone] = useState('')
  const [origEmail, setOrigEmail] = useState('')
  const [contactSaving, setContactSaving] = useState(false)
  const [justSubmitted, setJustSubmitted] = useState(false)

  // Notification prefs state
  const [smsEnabled, setSmsEnabled] = useState(true)
  const [emailEnabled, setEmailEnabled] = useState(true)
  const [reminder4hr, setReminder4hr] = useState(true)
  const [reminder1hr, setReminder1hr] = useState(false)
  const [prefsSaving, setPrefsSaving] = useState(false)

  // Load family data
  const { data: family } = useQuery({
    queryKey: [...qk.parent.accountFamily, familyId],
    enabled: !!familyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('families')
        .select('primary_email, primary_phone, notify_via_sms, notify_via_email, reminder_4hr, reminder_1hr')
        .eq('id', familyId!)
        .single()
      if (error) throw error
      return data
    },
  })

  // Load pending change request (if any)
  const { data: pendingRequest } = useQuery({
    queryKey: [...qk.parent.accountPendingRequest, familyId],
    enabled: !!familyId,
    queryFn: async () => {
      const { data } = await supabase
        .from('contact_change_requests')
        .select('id, requested_email, requested_phone, status, created_at')
        .eq('family_id', familyId!)
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      return data
    },
  })

  // Seed form when data loads
  useEffect(() => {
    if (family) {
      const p = family.primary_phone ?? ''
      const e = family.primary_email ?? ''
      setPhone(p)
      setEmail(e)
      setOrigPhone(p)
      setOrigEmail(e)
      setSmsEnabled(family.notify_via_sms ?? true)
      setEmailEnabled(family.notify_via_email ?? true)
      setReminder4hr(family.reminder_4hr ?? true)
      setReminder1hr(family.reminder_1hr ?? false)
    }
  }, [family])

  const hasContactChanged = phone.trim() !== origPhone.trim() || email.trim() !== origEmail.trim()

  const handleContactSubmit = async () => {
    if (!familyId || !tenantId) return
    if (!hasContactChanged) return
    setContactSaving(true)
    try {
      const { error } = await supabase.from('contact_change_requests').insert({
        family_id: familyId,
        tenant_id: tenantId,
        requested_email: email.trim() !== origEmail.trim() ? (email.trim() || null) : null,
        requested_phone: phone.trim() !== origPhone.trim() ? (phone.trim() || null) : null,
        status: 'pending',
      })
      if (error) throw error
      setJustSubmitted(true)
      qc.invalidateQueries({ queryKey: qk.parent.accountPendingRequest })
      toast('Change request submitted for review', 'success')
    } catch (err: any) {
      toast(err.message ?? 'Failed to submit', 'error')
    } finally {
      setContactSaving(false)
    }
  }

  const handleSmsToggle = (v: boolean) => {
    if (!v && !emailEnabled) {
      toast('At least one notification channel must be active', 'error')
      return
    }
    setSmsEnabled(v)
  }

  const handleEmailToggle = (v: boolean) => {
    if (!v && !smsEnabled) {
      toast('At least one notification channel must be active', 'error')
      return
    }
    setEmailEnabled(v)
  }

  const handlePrefsSave = async () => {
    if (!familyId) return
    if (!smsEnabled && !emailEnabled) {
      toast('At least one notification channel must be active', 'error')
      return
    }
    setPrefsSaving(true)
    try {
      const { error } = await supabase.from('families').update({
        notify_via_sms: smsEnabled,
        notify_via_email: emailEnabled,
        reminder_4hr: reminder4hr,
        reminder_1hr: reminder1hr,
      }).eq('id', familyId)
      if (error) throw error
      qc.invalidateQueries({ queryKey: qk.parent.accountFamily })
      toast('Notification preferences saved', 'success')
    } catch (err: any) {
      toast(err.message ?? 'Failed to save', 'error')
    } finally {
      setPrefsSaving(false)
    }
  }

  if (isLoading) return <div style={{ padding: 40, textAlign: 'center' }}><MusicLoader /></div>

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '10px 12px', borderRadius: 8,
    border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.04)',
    color: '#E8E8FC', fontSize: 13, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box',
  }

  const showPending = !!pendingRequest || justSubmitted

  return (
    <div style={{ maxWidth: 540, margin: '0 auto', padding: 16 }}>
      <h1 style={{ fontSize: 20, fontWeight: 800, color: '#E0E0F4', margin: '0 0 24px' }}>Account</h1>

      {/* Contact Info */}
      <Section title="Contact Information">
        {showPending && (
          <div style={{
            display: 'flex', alignItems: 'flex-start', gap: 10,
            padding: '10px 12px', borderRadius: 8, marginBottom: 12,
            background: 'rgba(212,34,106,0.08)', border: '1px solid rgba(212,34,106,0.2)',
          }}>
            <Clock size={14} style={{ color: '#D4226A', flexShrink: 0, marginTop: 2 }} />
            <div style={{ fontSize: 12, color: '#E0E0F4', lineHeight: 1.45 }}>
              <div style={{ fontWeight: 700, marginBottom: 2 }}>Change request pending review</div>
              <div style={{ color: '#A0A0C8', fontSize: 11 }}>
                Your studio admin will review and approve the update shortly.
              </div>
            </div>
          </div>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: '#A0A0C8', marginBottom: 4, display: 'block' }}>Email</label>
            <input type="email" value={email} onChange={e => { setEmail(e.target.value); setJustSubmitted(false) }} placeholder="your@email.com" style={inputStyle} />
          </div>
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: '#A0A0C8', marginBottom: 4, display: 'block' }}>Phone</label>
            <input type="tel" value={phone} onChange={e => { setPhone(e.target.value); setJustSubmitted(false) }} placeholder="(555) 555-5555" style={inputStyle} />
          </div>
          <div style={{ fontSize: 11, color: '#8080A8', lineHeight: 1.5 }}>
            The email and phone number on file will be used for invoice delivery. Please keep these current.
          </div>
          <div style={{ fontSize: 11, color: '#8080A8', lineHeight: 1.5 }}>
            Contact changes are reviewed by your studio admin before taking effect.
          </div>
          <button
            onClick={handleContactSubmit}
            disabled={contactSaving || !hasContactChanged}
            style={{
              padding: '10px', borderRadius: 8, border: 'none', fontSize: 13, fontWeight: 700,
              cursor: (contactSaving || !hasContactChanged) ? 'not-allowed' : 'pointer',
              background: hasContactChanged ? '#D4226A' : 'rgba(255,255,255,0.06)',
              color: hasContactChanged ? '#fff' : '#606088',
              opacity: contactSaving ? 0.5 : 1,
            }}
          >
            {contactSaving ? 'Submitting...' : hasContactChanged ? 'Submit Change Request' : 'No changes to submit'}
          </button>
        </div>
      </Section>

      {/* Notification Preferences */}
      <Section title="Notification Preferences">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#8080A8', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Channels</div>
          <Toggle label="Email notifications" sublabel="Session updates, progress reports" checked={emailEnabled} onChange={handleEmailToggle} />
          <Toggle label="SMS notifications" sublabel="Text message reminders and updates" checked={smsEnabled} onChange={handleSmsToggle} />
          <div style={{ fontSize: 10, color: '#606088', fontStyle: 'italic', marginTop: -4 }}>
            At least one channel must remain active.
          </div>

          <div style={{ height: 1, background: 'rgba(255,255,255,0.04)', margin: '8px 0 4px' }} />
          <div style={{ fontSize: 11, fontWeight: 700, color: '#8080A8', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Session Reminders</div>
          <LockedRow label="24-hour reminder" sublabel="Always on — sent the day before each session" />
          <Toggle label="4-hour reminder" sublabel="Get reminded 4 hours before each session" checked={reminder4hr} onChange={setReminder4hr} />
          <Toggle label="1-hour reminder" sublabel="Get reminded 1 hour before each session" checked={reminder1hr} onChange={setReminder1hr} />

          <button onClick={handlePrefsSave} disabled={prefsSaving} style={{
            padding: '10px', borderRadius: 8, border: 'none', fontSize: 13, fontWeight: 700, cursor: 'pointer',
            background: '#D4226A', color: '#fff', opacity: prefsSaving ? 0.5 : 1, marginTop: 4,
          }}>
            {prefsSaving ? 'Saving...' : 'Save Preferences'}
          </button>
        </div>
      </Section>

      {/* Password */}
      <Section title="Security">
        <button onClick={() => setShowChangePassword(true)} style={{
          display: 'flex', alignItems: 'center', gap: 8, width: '100%',
          padding: '12px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer',
          background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', color: '#E0E0F4',
        }}>
          <KeyRound size={14} style={{ color: '#D4226A' }} />
          Change Password
        </button>
      </Section>

      {profile && (
        <div style={{ fontSize: 10, color: '#606088', textAlign: 'center', padding: '16px 0' }}>
          Signed in as {profile.first_name} {profile.last_name}
        </div>
      )}

      <ChangePasswordModal open={showChangePassword} onClose={() => setShowChangePassword(false)} />
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 28 }}>
      <div style={{ fontSize: 14, fontWeight: 700, color: '#E0E0F4', marginBottom: 14 }}>{title}</div>
      <div style={{ padding: '16px', borderRadius: 12, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
        {children}
      </div>
    </div>
  )
}

function Toggle({ label, sublabel, checked, onChange }: { label: string; sublabel: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#E0E0F4' }}>{label}</div>
        <div style={{ fontSize: 11, color: '#8080A8', marginTop: 1 }}>{sublabel}</div>
      </div>
      <button
        onClick={() => onChange(!checked)}
        style={{
          width: 44, height: 24, borderRadius: 12, border: 'none', cursor: 'pointer', flexShrink: 0,
          background: checked ? '#D4226A' : 'rgba(255,255,255,0.1)',
          position: 'relative', transition: 'background 150ms ease',
        }}
      >
        <div style={{
          width: 18, height: 18, borderRadius: '50%', background: '#fff',
          position: 'absolute', top: 3,
          left: checked ? 23 : 3,
          transition: 'left 150ms ease',
        }} />
      </button>
    </div>
  )
}

function LockedRow({ label, sublabel }: { label: string; sublabel: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#E0E0F4' }}>{label}</div>
          <Lock size={10} style={{ color: '#606088' }} />
        </div>
        <div style={{ fontSize: 11, color: '#8080A8', marginTop: 1 }}>{sublabel}</div>
      </div>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0,
        padding: '4px 8px', borderRadius: 10,
        background: 'rgba(212,34,106,0.12)', border: '1px solid rgba(212,34,106,0.25)',
      }}>
        <CheckCircle2 size={11} style={{ color: '#D4226A' }} />
        <span style={{ fontSize: 10, fontWeight: 700, color: '#D4226A' }}>ON</span>
      </div>
    </div>
  )
}
