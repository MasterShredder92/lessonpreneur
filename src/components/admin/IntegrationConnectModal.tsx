import { useState } from 'react'
import { createPortal } from 'react-dom'
import { X, Eye, EyeOff, ExternalLink, Loader2 } from 'lucide-react'

// ─── Per-integration field definitions ─────────────────

interface FieldDef {
  key: string
  label: string
  placeholder: string
  secret?: boolean
  helpText?: string
}

const INTEGRATION_FIELDS: Record<string, { fields: FieldDef[]; helpUrl?: string; helpLabel?: string; note?: string }> = {
  // Google services — OAuth ideally, but support service-account / API key for now
  'google-calendar': {
    fields: [
      { key: 'client_id', label: 'Client ID', placeholder: 'xxxx.apps.googleusercontent.com' },
      { key: 'client_secret', label: 'Client Secret', placeholder: 'GOCSPX-...', secret: true },
      { key: 'refresh_token', label: 'Refresh Token', placeholder: 'Paste refresh token', secret: true },
    ],
    helpUrl: 'https://console.cloud.google.com/apis/credentials',
    helpLabel: 'Google Cloud Console',
    note: 'Create OAuth 2.0 credentials in Google Cloud Console. Enable the Calendar API.',
  },
  'google-meet': {
    fields: [
      { key: 'client_id', label: 'Client ID', placeholder: 'xxxx.apps.googleusercontent.com' },
      { key: 'client_secret', label: 'Client Secret', placeholder: 'GOCSPX-...', secret: true },
      { key: 'refresh_token', label: 'Refresh Token', placeholder: 'Paste refresh token', secret: true },
    ],
    helpUrl: 'https://console.cloud.google.com/apis/credentials',
    helpLabel: 'Google Cloud Console',
    note: 'Uses the same Google OAuth credentials. Enable the Meet REST API.',
  },
  'gmail': {
    fields: [
      { key: 'client_id', label: 'Client ID', placeholder: 'xxxx.apps.googleusercontent.com' },
      { key: 'client_secret', label: 'Client Secret', placeholder: 'GOCSPX-...', secret: true },
      { key: 'refresh_token', label: 'Refresh Token', placeholder: 'Paste refresh token', secret: true },
    ],
    helpUrl: 'https://console.cloud.google.com/apis/credentials',
    helpLabel: 'Google Cloud Console',
    note: 'Enable the Gmail API. Allows sending notifications and confirmations.',
  },
  'google-drive': {
    fields: [
      { key: 'client_id', label: 'Client ID', placeholder: 'xxxx.apps.googleusercontent.com' },
      { key: 'client_secret', label: 'Client Secret', placeholder: 'GOCSPX-...', secret: true },
      { key: 'refresh_token', label: 'Refresh Token', placeholder: 'Paste refresh token', secret: true },
      { key: 'folder_id', label: 'Root Folder ID', placeholder: 'Drive folder ID (optional)' },
    ],
    helpUrl: 'https://console.cloud.google.com/apis/credentials',
    helpLabel: 'Google Cloud Console',
    note: 'Enable the Drive API. Optionally specify a folder for student documents.',
  },
  'google-contacts': {
    fields: [
      { key: 'client_id', label: 'Client ID', placeholder: 'xxxx.apps.googleusercontent.com' },
      { key: 'client_secret', label: 'Client Secret', placeholder: 'GOCSPX-...', secret: true },
      { key: 'refresh_token', label: 'Refresh Token', placeholder: 'Paste refresh token', secret: true },
    ],
    helpUrl: 'https://console.cloud.google.com/apis/credentials',
    helpLabel: 'Google Cloud Console',
    note: 'Enable the People API for contact syncing.',
  },
  // Communication
  'twilio': {
    fields: [
      { key: 'account_sid', label: 'Account SID', placeholder: 'ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx' },
      { key: 'auth_token', label: 'Auth Token', placeholder: 'Paste auth token', secret: true },
      { key: 'phone_number', label: 'Phone Number', placeholder: '+1234567890', helpText: 'Your Twilio phone number' },
    ],
    helpUrl: 'https://console.twilio.com',
    helpLabel: 'Twilio Console',
  },
  'zoom': {
    fields: [
      { key: 'client_id', label: 'Client ID', placeholder: 'Zoom app client ID' },
      { key: 'client_secret', label: 'Client Secret', placeholder: 'Zoom app client secret', secret: true },
      { key: 'account_id', label: 'Account ID', placeholder: 'Zoom account ID' },
    ],
    helpUrl: 'https://marketplace.zoom.us/develop/create',
    helpLabel: 'Zoom Marketplace',
    note: 'Create a Server-to-Server OAuth app in Zoom Marketplace.',
  },
  'quo': {
    fields: [
      { key: 'api_key', label: 'API Key', placeholder: 'Your QUO API key', secret: true },
      { key: 'phone_number', label: 'Business Number', placeholder: '+1234567890' },
    ],
  },
  'slack': {
    fields: [
      { key: 'webhook_url', label: 'Webhook URL', placeholder: 'https://hooks.slack.com/services/...', secret: true, helpText: 'Create an Incoming Webhook in your Slack workspace' },
      { key: 'channel', label: 'Default Channel', placeholder: '#studio-alerts' },
    ],
    helpUrl: 'https://api.slack.com/messaging/webhooks',
    helpLabel: 'Slack Webhooks Guide',
  },
  // Billing
  'square': {
    fields: [
      { key: 'access_token', label: 'Access Token', placeholder: 'Square access token', secret: true },
      { key: 'app_id', label: 'Application ID', placeholder: 'sq0idp-...' },
      { key: 'environment', label: 'Environment', placeholder: 'production or sandbox' },
    ],
    helpUrl: 'https://developer.squareup.com/apps',
    helpLabel: 'Square Developer Dashboard',
  },
  'stripe': {
    fields: [
      { key: 'publishable_key', label: 'Publishable Key', placeholder: 'pk_live_...' },
      { key: 'secret_key', label: 'Secret Key', placeholder: 'sk_live_...', secret: true },
      { key: 'webhook_secret', label: 'Webhook Secret', placeholder: 'whsec_...', secret: true, helpText: 'For receiving payment events' },
    ],
    helpUrl: 'https://dashboard.stripe.com/apikeys',
    helpLabel: 'Stripe Dashboard',
  },
  'quickbooks': {
    fields: [
      { key: 'client_id', label: 'Client ID', placeholder: 'QuickBooks app client ID' },
      { key: 'client_secret', label: 'Client Secret', placeholder: 'QuickBooks app client secret', secret: true },
      { key: 'realm_id', label: 'Realm / Company ID', placeholder: 'Your company ID' },
      { key: 'refresh_token', label: 'Refresh Token', placeholder: 'OAuth refresh token', secret: true },
    ],
    helpUrl: 'https://developer.intuit.com/app/developer/dashboard',
    helpLabel: 'Intuit Developer Portal',
  },
  // Automation
  'zapier': {
    fields: [
      { key: 'webhook_url', label: 'Webhook URL', placeholder: 'https://hooks.zapier.com/hooks/catch/...', helpText: 'From your Zapier "Webhooks by Zapier" trigger' },
    ],
    helpUrl: 'https://zapier.com/app/zaps',
    helpLabel: 'Zapier Dashboard',
    note: 'Create a Zap with a "Webhooks by Zapier" trigger to receive events from Lessonpreneur.',
  },
  'make': {
    fields: [
      { key: 'webhook_url', label: 'Webhook URL', placeholder: 'https://hook.us1.make.com/...', helpText: 'From your Make webhook module' },
    ],
    helpUrl: 'https://www.make.com/en/scenarios',
    helpLabel: 'Make Dashboard',
  },
  'n8n': {
    fields: [
      { key: 'webhook_url', label: 'Webhook URL', placeholder: 'https://your-n8n.com/webhook/...', helpText: 'From your n8n webhook node' },
      { key: 'api_key', label: 'API Key (optional)', placeholder: 'For authenticated webhooks', secret: true },
    ],
  },
  'webhooks': {
    fields: [
      { key: 'endpoint_url', label: 'Endpoint URL', placeholder: 'https://your-server.com/webhook' },
      { key: 'secret', label: 'Signing Secret', placeholder: 'Used to verify webhook signatures', secret: true },
    ],
    note: 'We\'ll send POST requests with a HMAC signature in the X-Signature header.',
  },
  'custom-api': {
    fields: [
      { key: 'api_key', label: 'API Key', placeholder: 'Your generated API key', secret: true, helpText: 'Use this key in the Authorization header' },
      { key: 'allowed_origins', label: 'Allowed Origins', placeholder: 'https://yourapp.com (comma-separated)' },
    ],
    note: 'Access the Lessonpreneur API to read and write data programmatically.',
  },
  // Documents
  'signwell': {
    fields: [
      { key: 'api_key', label: 'API Key', placeholder: 'Your SignWell API key', secret: true },
    ],
    helpUrl: 'https://www.signwell.com/app/settings/api',
    helpLabel: 'SignWell Settings',
  },
  'docusign': {
    fields: [
      { key: 'integration_key', label: 'Integration Key', placeholder: 'DocuSign integration key' },
      { key: 'secret_key', label: 'Secret Key', placeholder: 'DocuSign secret key', secret: true },
      { key: 'account_id', label: 'Account ID', placeholder: 'DocuSign account ID' },
      { key: 'base_url', label: 'Base URL', placeholder: 'https://demo.docusign.net or production URL' },
    ],
    helpUrl: 'https://admindemo.docusign.com/apps-and-keys',
    helpLabel: 'DocuSign Admin',
  },
  // CRM & Marketing
  'meta-lead-ads': {
    fields: [
      { key: 'app_id', label: 'App ID', placeholder: 'Facebook App ID' },
      { key: 'app_secret', label: 'App Secret', placeholder: 'Facebook App Secret', secret: true },
      { key: 'access_token', label: 'Access Token', placeholder: 'Long-lived page access token', secret: true },
      { key: 'page_id', label: 'Page ID', placeholder: 'Your Facebook Page ID' },
    ],
    helpUrl: 'https://developers.facebook.com/apps/',
    helpLabel: 'Meta Developer Portal',
    note: 'Requires a Facebook App with Leads Access. New leads will auto-import.',
  },
  'mailchimp': {
    fields: [
      { key: 'api_key', label: 'API Key', placeholder: 'xxxxxxxx-us21', secret: true, helpText: 'Includes your server prefix (e.g. us21)' },
      { key: 'list_id', label: 'Audience / List ID', placeholder: 'Default audience to sync contacts to' },
    ],
    helpUrl: 'https://us1.admin.mailchimp.com/account/api/',
    helpLabel: 'Mailchimp API Keys',
  },
  'activecampaign': {
    fields: [
      { key: 'api_url', label: 'API URL', placeholder: 'https://yourname.api-us1.com' },
      { key: 'api_key', label: 'API Key', placeholder: 'Your ActiveCampaign API key', secret: true },
    ],
    helpUrl: 'https://help.activecampaign.com/hc/en-us/articles/207317590',
    helpLabel: 'ActiveCampaign API Docs',
  },
}

// ─── Component ─────────────────────────────────────────

interface Props {
  integrationId: string
  integrationName: string
  onConnect: (credentials: Record<string, string>) => Promise<void>
  onClose: () => void
}

export default function IntegrationConnectModal({ integrationId, integrationName, onConnect, onClose }: Props) {
  const config = INTEGRATION_FIELDS[integrationId]
  const fields = config?.fields ?? [{ key: 'api_key', label: 'API Key', placeholder: 'Enter API key', secret: true }]

  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(fields.map(f => [f.key, '']))
  )
  const [showSecrets, setShowSecrets] = useState<Set<string>>(new Set())
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const toggleSecret = (key: string) => setShowSecrets(prev => {
    const n = new Set(prev)
    if (n.has(key)) n.delete(key); else n.add(key)
    return n
  })

  const requiredFields = fields.filter(f => !f.helpText?.includes('optional') && !f.label.includes('optional'))
  const canSubmit = requiredFields.every(f => values[f.key]?.trim())

  const handleSubmit = async () => {
    if (!canSubmit || saving) return
    setSaving(true)
    setError('')
    try {
      await onConnect(values)
    } catch (err: any) {
      setError(err.message || 'Failed to connect')
    } finally {
      setSaving(false)
    }
  }

  return createPortal(
    <div style={{ position: 'fixed', inset: 0, zIndex: 99999, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 480, margin: '0 16px', background: '#141224', border: '1px solid rgba(212,34,106,0.2)', borderRadius: 16, boxShadow: '0 16px 48px rgba(0,0,0,0.6)', overflow: 'hidden', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
        {/* Header */}
        <div style={{ padding: '20px 24px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 800, color: '#E0E0F4' }}>Connect {integrationName}</div>
            <div style={{ fontSize: 12, color: '#8080A8', marginTop: 2 }}>Enter your credentials to connect</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#606088', cursor: 'pointer', padding: 4 }}>
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '16px 24px', overflowY: 'auto', flex: 1 }}>
          {/* Note */}
          {config?.note && (
            <div style={{ padding: '10px 14px', borderRadius: 10, background: 'rgba(56,189,248,0.06)', border: '1px solid rgba(56,189,248,0.15)', fontSize: 12, color: '#A0C8E0', lineHeight: 1.5, marginBottom: 16 }}>
              {config.note}
            </div>
          )}

          {/* Help link */}
          {config?.helpUrl && (
            <a
              href={config.helpUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#D4226A', textDecoration: 'none', marginBottom: 16, fontWeight: 600 }}
            >
              <ExternalLink size={12} />
              {config.helpLabel || 'Documentation'}
            </a>
          )}

          {/* Fields */}
          {fields.map(field => (
            <div key={field.key} style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 11, fontWeight: 700, color: '#A0A0C8', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 6 }}>
                {field.label}
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type={field.secret && !showSecrets.has(field.key) ? 'password' : 'text'}
                  value={values[field.key]}
                  onChange={e => setValues(prev => ({ ...prev, [field.key]: e.target.value }))}
                  placeholder={field.placeholder}
                  autoComplete="off"
                  style={{
                    width: '100%', padding: '10px 14px', paddingRight: field.secret ? 40 : 14,
                    borderRadius: 10, border: '1px solid rgba(255,255,255,0.08)',
                    background: 'rgba(255,255,255,0.04)', color: '#E0E0F4', fontSize: 13,
                    outline: 'none', boxSizing: 'border-box', fontFamily: field.secret ? 'monospace' : 'inherit',
                  }}
                />
                {field.secret && (
                  <button
                    onClick={() => toggleSecret(field.key)}
                    style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: '#606088', cursor: 'pointer', padding: 4 }}
                  >
                    {showSecrets.has(field.key) ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                )}
              </div>
              {field.helpText && (
                <div style={{ fontSize: 11, color: '#606088', marginTop: 4 }}>{field.helpText}</div>
              )}
            </div>
          ))}

          {error && (
            <div style={{ padding: '8px 12px', borderRadius: 8, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: '#EF4444', fontSize: 12, marginTop: 4 }}>
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '12px 24px 20px', display: 'flex', gap: 8, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          <button onClick={onClose} style={{ flex: 1, padding: '12px 16px', borderRadius: 10, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#8080A8', cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!canSubmit || saving}
            style={{
              flex: 1, padding: '12px 16px', borderRadius: 10, border: 'none',
              background: canSubmit && !saving ? '#D4226A' : '#363656',
              color: '#fff', fontWeight: 700, fontSize: 13,
              cursor: canSubmit && !saving ? 'pointer' : 'not-allowed',
              opacity: canSubmit && !saving ? 1 : 0.5,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            }}
          >
            {saving && <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />}
            {saving ? 'Connecting...' : 'Connect'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
