import { useState, useEffect } from 'react'
import { useAuthContext } from '../../app/AuthContext'
import { useParentFamily } from '../../hooks/useParentFamily'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { toast } from '../../components/shared/Toast'
import MusicLoader from '../../components/shared/MusicLoader'
import ChangePasswordModal from '../../components/shared/ChangePasswordModal'
import { KeyRound } from 'lucide-react'

export default function ParentAccount() {
  const { profile } = useAuthContext()
  const { familyId, isLoading } = useParentFamily()
  const qc = useQueryClient()
  const [showChangePassword, setShowChangePassword] = useState(false)

  // Contact info state
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [contactSaving, setContactSaving] = useState(false)

  // Notification prefs state
  const [smsEnabled, setSmsEnabled] = useState(true)
  const [emailEnabled, setEmailEnabled] = useState(true)
  const [reminder4hr, setReminder4hr] = useState(true)
  const [reminder1hr, setReminder1hr] = useState(false)
  const [prefsSaving, setPrefsSaving] = useState(false)

  // Load family data
  const { data: family } = useQuery({
    queryKey: ['parent-account-family', familyId],
    enabled: !!familyId,
    queryFn: async () => {
      const { data } = await supabase
        .from('families')
        .select('primary_email, primary_phone, sms_opt_in, email_opt_in, reminder_4hr, reminder_1hr')
        .eq('id', familyId!)
        .single()
      return data
    },
  })

  // Seed form when data loads
  useEffect(() => {
    if (family) {
      setPhone(family.primary_phone ?? '')
      setEmail(family.primary_email ?? '')
      setSmsEnabled(family.sms_opt_in ?? true)
      setEmailEnabled(family.email_opt_in ?? true)
      setReminder4hr(family.reminder_4hr ?? true)
      setReminder1hr(family.reminder_1hr ?? false)
    }
  }, [family])

  const handleContactSave = async () => {
    if (!familyId) return
    setContactSaving(true)
    try {
      const { error } = await supabase.from('families').update({
        primary_phone: phone.trim() || null,
        primary_email: email.trim() || null,
      }).eq('id', familyId)
      if (error) throw error
      // Also update profile email if changed
      if (email.trim() && email.trim() !== profile?.email) {
        await supabase.from('profiles').update({ email: email.trim(), phone: phone.trim() || null }).eq('id', profile!.id)
      }
      qc.invalidateQueries({ queryKey: ['parent-account-family'] })
      toast('Contact info updated', 'success')
    } catch (err: any) {
      toast(err.message ?? 'Failed to save', 'error')
    } finally {
      setContactSaving(false)
    }
  }

  const handlePrefsSave = async () => {
    if (!familyId) return
    setPrefsSaving(true)
    try {
      const { error } = await supabase.from('families').update({
        sms_opt_in: smsEnabled,
        email_opt_in: emailEnabled,
        reminder_4hr: reminder4hr,
        reminder_1hr: reminder1hr,
      }).eq('id', familyId)
      if (error) throw error
      qc.invalidateQueries({ queryKey: ['parent-account-family'] })
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

  return (
    <div style={{ maxWidth: 540, margin: '0 auto', padding: 16 }}>
      <h1 style={{ fontSize: 20, fontWeight: 800, color: '#E0E0F4', margin: '0 0 24px' }}>Account</h1>

      {/* Contact Info */}
      <Section title="Contact Information">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: '#A0A0C8', marginBottom: 4, display: 'block' }}>Email</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="your@email.com" style={inputStyle} />
          </div>
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: '#A0A0C8', marginBottom: 4, display: 'block' }}>Phone</label>
            <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="(555) 555-5555" style={inputStyle} />
          </div>
          <button onClick={handleContactSave} disabled={contactSaving} style={{
            padding: '10px', borderRadius: 8, border: 'none', fontSize: 13, fontWeight: 700, cursor: 'pointer',
            background: '#D4226A', color: '#fff', opacity: contactSaving ? 0.5 : 1,
          }}>
            {contactSaving ? 'Saving...' : 'Save Contact Info'}
          </button>
        </div>
      </Section>

      {/* Notification Preferences */}
      <Section title="Notification Preferences">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Toggle label="Email notifications" sublabel="Session updates, progress reports" checked={emailEnabled} onChange={setEmailEnabled} />
          <Toggle label="SMS notifications" sublabel="Text message reminders and updates" checked={smsEnabled} onChange={setSmsEnabled} />
          <div style={{ height: 1, background: 'rgba(255,255,255,0.04)', margin: '4px 0' }} />
          <div style={{ fontSize: 11, fontWeight: 700, color: '#8080A8', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Session Reminders</div>
          <Toggle label="4-hour reminder" sublabel="Get reminded 4 hours before each session" checked={reminder4hr} onChange={setReminder4hr} />
          <Toggle label="1-hour reminder" sublabel="Get reminded 1 hour before each session" checked={reminder1hr} onChange={setReminder1hr} />
          <button onClick={handlePrefsSave} disabled={prefsSaving} style={{
            padding: '10px', borderRadius: 8, border: 'none', fontSize: 13, fontWeight: 700, cursor: 'pointer',
            background: '#D4226A', color: '#fff', opacity: prefsSaving ? 0.5 : 1,
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
      <div>
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
