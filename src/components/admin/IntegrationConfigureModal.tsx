import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { X, Eye, EyeOff, Loader2, Shield, Settings as SettingsIcon } from 'lucide-react'
import type { IntegrationConfig } from '../../hooks/useIntegrations'

// ─── Per-integration setting definitions ───────────────

interface SettingDef {
  key: string
  label: string
  type: 'toggle' | 'text' | 'select'
  options?: string[]
  helpText?: string
}

const INTEGRATION_SETTINGS: Record<string, SettingDef[]> = {
  'google-calendar': [
    { key: 'sync_direction', label: 'Sync Direction', type: 'select', options: ['lp_to_google', 'google_to_lp', 'bidirectional'] },
    { key: 'auto_create_events', label: 'Auto-create calendar events for new lessons', type: 'toggle' },
    { key: 'include_teacher_name', label: 'Include teacher name in event title', type: 'toggle' },
    { key: 'calendar_id', label: 'Calendar ID', type: 'text', helpText: 'Leave blank for primary calendar' },
  ],
  'google-meet': [
    { key: 'auto_generate_links', label: 'Auto-generate Meet links for virtual lessons', type: 'toggle' },
    { key: 'add_to_calendar', label: 'Add Meet link to Google Calendar events', type: 'toggle' },
  ],
  'gmail': [
    { key: 'send_enrollment_confirm', label: 'Send enrollment confirmation emails', type: 'toggle' },
    { key: 'send_session_reminders', label: 'Send session reminder emails', type: 'toggle' },
    { key: 'send_billing_notices', label: 'Send billing notification emails', type: 'toggle' },
    { key: 'from_name', label: 'From Name', type: 'text', helpText: 'e.g. "Adkins Music Academy"' },
  ],
  'google-drive': [
    { key: 'auto_create_folders', label: 'Auto-create folders for new students', type: 'toggle' },
    { key: 'folder_structure', label: 'Folder Structure', type: 'select', options: ['by_student', 'by_teacher', 'by_instrument'] },
  ],
  'google-contacts': [
    { key: 'sync_parents', label: 'Sync parent contacts', type: 'toggle' },
    { key: 'sync_students', label: 'Sync student contacts', type: 'toggle' },
    { key: 'sync_teachers', label: 'Sync teacher contacts', type: 'toggle' },
    { key: 'contact_group', label: 'Contact Group Name', type: 'text', helpText: 'Contacts will be added to this group' },
  ],
  'twilio': [
    { key: 'send_reminders', label: 'Send SMS lesson reminders', type: 'toggle' },
    { key: 'send_billing_alerts', label: 'Send billing SMS alerts', type: 'toggle' },
    { key: 'reminder_hours', label: 'Reminder Hours Before', type: 'text', helpText: 'e.g. 24' },
  ],
  'zoom': [
    { key: 'auto_create_meetings', label: 'Auto-create Zoom meetings for virtual lessons', type: 'toggle' },
    { key: 'default_duration', label: 'Default Meeting Duration (min)', type: 'text', helpText: 'e.g. 30' },
    { key: 'waiting_room', label: 'Enable waiting room', type: 'toggle' },
  ],
  'quo': [
    { key: 'auto_respond', label: 'Enable auto-responses', type: 'toggle' },
    { key: 'forward_to_email', label: 'Forward messages to email', type: 'toggle' },
  ],
  'slack': [
    { key: 'notify_new_leads', label: 'Notify on new leads', type: 'toggle' },
    { key: 'notify_enrollments', label: 'Notify on new enrollments', type: 'toggle' },
    { key: 'notify_cancellations', label: 'Notify on cancellations', type: 'toggle' },
    { key: 'notify_payments', label: 'Notify on payments', type: 'toggle' },
  ],
  'square': [
    { key: 'sync_customers', label: 'Sync customers from Square', type: 'toggle' },
    { key: 'sync_invoices', label: 'Sync invoices from Square', type: 'toggle' },
    { key: 'auto_match_families', label: 'Auto-match families by email', type: 'toggle' },
  ],
  'stripe': [
    { key: 'enable_subscriptions', label: 'Enable subscription billing', type: 'toggle' },
    { key: 'auto_invoice', label: 'Auto-create invoices for new enrollments', type: 'toggle' },
    { key: 'currency', label: 'Currency', type: 'select', options: ['usd', 'cad', 'gbp', 'eur', 'aud'] },
  ],
  'quickbooks': [
    { key: 'sync_invoices', label: 'Sync invoices to QuickBooks', type: 'toggle' },
    { key: 'sync_payments', label: 'Sync payments to QuickBooks', type: 'toggle' },
    { key: 'income_account', label: 'Income Account Name', type: 'text', helpText: 'QuickBooks account for lesson revenue' },
  ],
  'zapier': [
    { key: 'trigger_new_lead', label: 'Trigger on new lead', type: 'toggle' },
    { key: 'trigger_enrollment', label: 'Trigger on enrollment', type: 'toggle' },
    { key: 'trigger_cancellation', label: 'Trigger on cancellation', type: 'toggle' },
  ],
  'make': [
    { key: 'trigger_new_lead', label: 'Trigger on new lead', type: 'toggle' },
    { key: 'trigger_enrollment', label: 'Trigger on enrollment', type: 'toggle' },
    { key: 'trigger_cancellation', label: 'Trigger on cancellation', type: 'toggle' },
  ],
  'n8n': [
    { key: 'trigger_new_lead', label: 'Trigger on new lead', type: 'toggle' },
    { key: 'trigger_enrollment', label: 'Trigger on enrollment', type: 'toggle' },
    { key: 'trigger_cancellation', label: 'Trigger on cancellation', type: 'toggle' },
  ],
  'webhooks': [
    { key: 'events', label: 'Events to send', type: 'text', helpText: 'Comma-separated: lead.created, enrollment.created, session.completed' },
    { key: 'retry_count', label: 'Retry Count', type: 'select', options: ['0', '1', '3', '5'] },
  ],
  'custom-api': [
    { key: 'rate_limit', label: 'Rate Limit (req/min)', type: 'select', options: ['60', '120', '300', '600'] },
    { key: 'read_only', label: 'Read-only access', type: 'toggle' },
  ],
  'signwell': [
    { key: 'auto_send_enrollment', label: 'Auto-send enrollment agreement', type: 'toggle' },
    { key: 'template_id', label: 'Default Template ID', type: 'text' },
  ],
  'docusign': [
    { key: 'auto_send_enrollment', label: 'Auto-send enrollment agreement', type: 'toggle' },
    { key: 'template_id', label: 'Default Template ID', type: 'text' },
  ],
  'meta-lead-ads': [
    { key: 'auto_import', label: 'Auto-import new leads', type: 'toggle' },
    { key: 'default_source', label: 'Default Lead Source', type: 'select', options: ['facebook', 'instagram', 'meta_ads'] },
    { key: 'assign_to_location', label: 'Default Location', type: 'text', helpText: 'Location name for imported leads' },
  ],
  'mailchimp': [
    { key: 'sync_active_families', label: 'Sync active families', type: 'toggle' },
    { key: 'sync_leads', label: 'Sync leads', type: 'toggle' },
    { key: 'tag_by_instrument', label: 'Tag contacts by instrument', type: 'toggle' },
  ],
  'activecampaign': [
    { key: 'sync_active_families', label: 'Sync active families', type: 'toggle' },
    { key: 'sync_leads', label: 'Sync leads', type: 'toggle' },
    { key: 'create_deals', label: 'Create deals for new leads', type: 'toggle' },
  ],
}

// ─── Credential field definitions (reused from connect) ─

const CREDENTIAL_LABELS: Record<string, string> = {
  client_id: 'Client ID',
  client_secret: 'Client Secret',
  refresh_token: 'Refresh Token',
  account_sid: 'Account SID',
  auth_token: 'Auth Token',
  phone_number: 'Phone Number',
  api_key: 'API Key',
  webhook_url: 'Webhook URL',
  access_token: 'Access Token',
  app_id: 'App ID',
  secret_key: 'Secret Key',
  publishable_key: 'Publishable Key',
  account_id: 'Account ID',
  base_url: 'Base URL',
  api_url: 'API URL',
  realm_id: 'Realm ID',
  integration_key: 'Integration Key',
  app_secret: 'App Secret',
  page_id: 'Page ID',
  list_id: 'List ID',
  channel: 'Channel',
  folder_id: 'Folder ID',
  secret: 'Signing Secret',
  endpoint_url: 'Endpoint URL',
  allowed_origins: 'Allowed Origins',
  environment: 'Environment',
  customer_email: 'Email',
}

const SECRET_KEYS = new Set(['client_secret', 'refresh_token', 'auth_token', 'api_key', 'access_token', 'secret_key', 'webhook_url', 'app_secret', 'secret', 'webhook_secret'])

// ─── Component ─────────────────────────────────────────

interface Props {
  config: IntegrationConfig
  integrationName: string
  onSave: (settings: Record<string, any>, credentials?: Record<string, any>) => Promise<void>
  onClose: () => void
}

export default function IntegrationConfigureModal({ config, integrationName, onSave, onClose }: Props) {
  const settingDefs = INTEGRATION_SETTINGS[config.integration_id] ?? []
  const [tab, setTab] = useState<'settings' | 'credentials'>('settings')
  const [settings, setSettings] = useState<Record<string, any>>({})
  const [credentials, setCredentials] = useState<Record<string, string>>({})
  const [showSecrets, setShowSecrets] = useState<Set<string>>(new Set())
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)

  useEffect(() => {
    // Initialize settings with defaults
    const s: Record<string, any> = {}
    settingDefs.forEach(d => {
      s[d.key] = config.settings[d.key] ?? (d.type === 'toggle' ? false : '')
    })
    setSettings(s)

    // Initialize credentials — values from DB are masked ('••••••••')
    // Show them as placeholders; user only sends values they actually change
    const c: Record<string, string> = {}
    Object.keys(config.credentials).forEach(key => {
      if (key === 'source' || key === 'note') return
      c[key] = ''  // Start empty — placeholder shows masked value
    })
    setCredentials(c)
  }, [config])

  const toggleSecret = (key: string) => setShowSecrets(prev => {
    const n = new Set(prev)
    if (n.has(key)) n.delete(key); else n.add(key)
    return n
  })

  const [error, setError] = useState('')

  const handleSave = async () => {
    setSaving(true)
    setError('')
    try {
      // Only send credentials the user actually changed (non-empty values)
      const changedCreds = Object.fromEntries(
        Object.entries(credentials).filter(([, v]) => v.trim() !== '')
      )
      const creds = Object.keys(changedCreds).length > 0 ? changedCreds : undefined
      await onSave(settings, creds)
    } catch (err: any) {
      setError(err.message || 'Failed to save settings')
    } finally {
      setSaving(false)
    }
  }

  const credentialKeys = Object.keys(credentials).filter(k => k !== 'source' && k !== 'note')

  return createPortal(
    <div style={{ position: 'fixed', inset: 0, zIndex: 99999, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 520, margin: '0 16px', background: '#141224', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, boxShadow: '0 16px 48px rgba(0,0,0,0.6)', overflow: 'hidden', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
        {/* Header */}
        <div style={{ padding: '20px 24px 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 800, color: '#E0E0F4' }}>Configure {integrationName}</div>
            <div style={{ fontSize: 12, color: '#8080A8', marginTop: 2 }}>Adjust settings and credentials</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#606088', cursor: 'pointer', padding: 4 }}>
            <X size={18} />
          </button>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 0, padding: '16px 24px 0', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          {[
            { id: 'settings' as const, label: 'Settings', icon: <SettingsIcon size={13} /> },
            { id: 'credentials' as const, label: 'Credentials', icon: <Shield size={13} /> },
          ].map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '8px 16px', background: 'none', border: 'none', cursor: 'pointer',
                fontSize: 12, fontWeight: 600,
                color: tab === t.id ? '#D4226A' : '#606088',
                borderBottom: tab === t.id ? '2px solid #D4226A' : '2px solid transparent',
                marginBottom: -1,
              }}
            >
              {t.icon} {t.label}
            </button>
          ))}
        </div>

        {/* Body */}
        <div style={{ padding: '16px 24px', overflowY: 'auto', flex: 1 }}>
          {tab === 'settings' && (
            <>
              {settingDefs.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '24px 0', color: '#606088', fontSize: 13 }}>No configurable settings for this integration.</div>
              ) : (
                settingDefs.map(def => (
                  <div key={def.key} style={{ marginBottom: 14 }}>
                    {def.type === 'toggle' ? (
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0' }}>
                        <div>
                          <div style={{ fontSize: 13, color: '#E0E0F4', fontWeight: 500 }}>{def.label}</div>
                          {def.helpText && <div style={{ fontSize: 11, color: '#606088', marginTop: 2 }}>{def.helpText}</div>}
                        </div>
                        <button
                          onClick={() => { setSettings(prev => ({ ...prev, [def.key]: !prev[def.key] })); setDirty(true) }}
                          style={{
                            width: 36, height: 20, borderRadius: 10, border: 'none', cursor: 'pointer', padding: 0,
                            background: settings[def.key] ? '#22C55E' : '#363656',
                            transition: 'background 150ms ease', flexShrink: 0,
                          }}
                        >
                          <div style={{
                            width: 16, height: 16, borderRadius: '50%', background: '#fff',
                            transform: `translateX(${settings[def.key] ? 17 : 2}px)`,
                            transition: 'transform 150ms ease',
                          }} />
                        </button>
                      </div>
                    ) : def.type === 'select' ? (
                      <>
                        <label style={{ fontSize: 11, fontWeight: 700, color: '#A0A0C8', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 6 }}>
                          {def.label}
                        </label>
                        <select
                          value={settings[def.key] || ''}
                          onChange={e => { setSettings(prev => ({ ...prev, [def.key]: e.target.value })); setDirty(true) }}
                          style={{
                            width: '100%', padding: '10px 14px', borderRadius: 10,
                            border: '1px solid rgba(255,255,255,0.08)',
                            background: 'rgba(255,255,255,0.04)', color: '#E0E0F4', fontSize: 13,
                            outline: 'none', boxSizing: 'border-box',
                          }}
                        >
                          <option value="">Select...</option>
                          {def.options?.map(opt => (
                            <option key={opt} value={opt}>{opt.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}</option>
                          ))}
                        </select>
                        {def.helpText && <div style={{ fontSize: 11, color: '#606088', marginTop: 4 }}>{def.helpText}</div>}
                      </>
                    ) : (
                      <>
                        <label style={{ fontSize: 11, fontWeight: 700, color: '#A0A0C8', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 6 }}>
                          {def.label}
                        </label>
                        <input
                          value={settings[def.key] || ''}
                          onChange={e => { setSettings(prev => ({ ...prev, [def.key]: e.target.value })); setDirty(true) }}
                          placeholder={def.helpText || ''}
                          style={{
                            width: '100%', padding: '10px 14px', borderRadius: 10,
                            border: '1px solid rgba(255,255,255,0.08)',
                            background: 'rgba(255,255,255,0.04)', color: '#E0E0F4', fontSize: 13,
                            outline: 'none', boxSizing: 'border-box',
                          }}
                        />
                      </>
                    )}
                  </div>
                ))
              )}
            </>
          )}

          {tab === 'credentials' && (
            <>
              <div style={{ padding: '8px 12px', borderRadius: 8, background: 'rgba(255,184,0,0.06)', border: '1px solid rgba(255,184,0,0.15)', fontSize: 12, color: '#FFB800', lineHeight: 1.5, marginBottom: 16 }}>
                Credentials are encrypted at rest. Leave a field blank to keep the current value.
              </div>
              {credentialKeys.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '24px 0', color: '#606088', fontSize: 13 }}>No credentials stored for this integration.</div>
              ) : (
                credentialKeys.map(key => {
                  const isSecret = SECRET_KEYS.has(key)
                  return (
                    <div key={key} style={{ marginBottom: 14 }}>
                      <label style={{ fontSize: 11, fontWeight: 700, color: '#A0A0C8', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 6 }}>
                        {CREDENTIAL_LABELS[key] || key.replace(/_/g, ' ')}
                      </label>
                      <div style={{ position: 'relative' }}>
                        <input
                          type={isSecret && !showSecrets.has(key) ? 'password' : 'text'}
                          value={credentials[key]}
                          onChange={e => { setCredentials(prev => ({ ...prev, [key]: e.target.value })); setDirty(true) }}
                          placeholder="••••••••  (leave blank to keep current)"
                          autoComplete="off"
                          style={{
                            width: '100%', padding: '10px 14px', paddingRight: isSecret ? 40 : 14,
                            borderRadius: 10, border: '1px solid rgba(255,255,255,0.08)',
                            background: 'rgba(255,255,255,0.04)', color: '#E0E0F4', fontSize: 13,
                            outline: 'none', boxSizing: 'border-box', fontFamily: isSecret ? 'monospace' : 'inherit',
                          }}
                        />
                        {isSecret && (
                          <button
                            onClick={() => toggleSecret(key)}
                            style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: '#606088', cursor: 'pointer', padding: 4 }}
                          >
                            {showSecrets.has(key) ? <EyeOff size={14} /> : <Eye size={14} />}
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })
              )}
            </>
          )}
        </div>

        {/* Error */}
        {error && (
          <div style={{ padding: '0 24px 8px' }}>
            <div style={{ padding: '8px 12px', borderRadius: 8, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: '#EF4444', fontSize: 12 }}>
              {error}
            </div>
          </div>
        )}

        {/* Footer */}
        <div style={{ padding: '12px 24px 20px', display: 'flex', gap: 8, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          <button onClick={onClose} style={{ flex: 1, padding: '12px 16px', borderRadius: 10, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#8080A8', cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            style={{
              flex: 1, padding: '12px 16px', borderRadius: 10, border: 'none',
              background: !saving ? '#D4226A' : '#363656',
              color: '#fff', fontWeight: 700, fontSize: 13,
              cursor: !saving ? 'pointer' : 'not-allowed',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            }}
          >
            {saving && <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />}
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
