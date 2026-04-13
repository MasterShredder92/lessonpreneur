import { useState, useEffect, useCallback, useRef } from 'react'
import { createPortal } from 'react-dom'
import { X, Eye, EyeOff, ExternalLink, Loader2, CheckCircle, XCircle, Copy, Check, LogIn } from 'lucide-react'
import { useTestConnection, getWebhookUrl } from '../../hooks/useIntegrations'
import { safeFetch } from '../../lib/safeFetch'
import { supabase } from '../../lib/supabase'

// ─── Per-integration field definitions ─────────────────

interface FieldDef {
  key: string
  label: string
  placeholder: string
  secret?: boolean
  helpText?: string
  readOnly?: boolean
}

/** Integration type determines the connect flow */
type IntegrationType = 'api_key' | 'oauth' | 'webhook_outbound' | 'lp_api'

interface IntegrationFieldConfig {
  /** Fields shown BEFORE OAuth redirect (api_key shows all, oauth shows only pre-auth) */
  fields: FieldDef[]
  helpUrl?: string
  helpLabel?: string
  note?: string
  type: IntegrationType
  /** Provider label for OAuth button (e.g. "Google", "QuickBooks") */
  oauthProvider?: string
}

const OAUTH_INTEGRATIONS = new Set([
  'google-calendar', 'google-meet', 'gmail', 'google-drive', 'google-contacts',
  'quickbooks', 'docusign', 'meta-lead-ads',
])

const INTEGRATION_FIELDS: Record<string, IntegrationFieldConfig> = {
  // ─── Google services — OAuth (only need client_id + client_secret) ───
  'google-calendar': {
    type: 'oauth',
    oauthProvider: 'Google',
    fields: [
      { key: 'client_id', label: 'Client ID', placeholder: 'xxxx.apps.googleusercontent.com' },
      { key: 'client_secret', label: 'Client Secret', placeholder: 'GOCSPX-...', secret: true },
    ],
    helpUrl: 'https://console.cloud.google.com/apis/credentials',
    helpLabel: 'Google Cloud Console',
    note: 'Create OAuth 2.0 credentials in Google Cloud Console. Enable the Calendar API. Set the redirect URI to the callback URL shown below.',
  },
  'google-meet': {
    type: 'oauth',
    oauthProvider: 'Google',
    fields: [
      { key: 'client_id', label: 'Client ID', placeholder: 'xxxx.apps.googleusercontent.com' },
      { key: 'client_secret', label: 'Client Secret', placeholder: 'GOCSPX-...', secret: true },
    ],
    helpUrl: 'https://console.cloud.google.com/apis/credentials',
    helpLabel: 'Google Cloud Console',
    note: 'Uses the same Google OAuth credentials. Enable the Calendar Events API.',
  },
  'gmail': {
    type: 'oauth',
    oauthProvider: 'Google',
    fields: [
      { key: 'client_id', label: 'Client ID', placeholder: 'xxxx.apps.googleusercontent.com' },
      { key: 'client_secret', label: 'Client Secret', placeholder: 'GOCSPX-...', secret: true },
    ],
    helpUrl: 'https://console.cloud.google.com/apis/credentials',
    helpLabel: 'Google Cloud Console',
    note: 'Enable the Gmail API. Allows sending notifications and confirmations.',
  },
  'google-drive': {
    type: 'oauth',
    oauthProvider: 'Google',
    fields: [
      { key: 'client_id', label: 'Client ID', placeholder: 'xxxx.apps.googleusercontent.com' },
      { key: 'client_secret', label: 'Client Secret', placeholder: 'GOCSPX-...', secret: true },
    ],
    helpUrl: 'https://console.cloud.google.com/apis/credentials',
    helpLabel: 'Google Cloud Console',
    note: 'Enable the Drive API for student document storage.',
  },
  'google-contacts': {
    type: 'oauth',
    oauthProvider: 'Google',
    fields: [
      { key: 'client_id', label: 'Client ID', placeholder: 'xxxx.apps.googleusercontent.com' },
      { key: 'client_secret', label: 'Client Secret', placeholder: 'GOCSPX-...', secret: true },
    ],
    helpUrl: 'https://console.cloud.google.com/apis/credentials',
    helpLabel: 'Google Cloud Console',
    note: 'Enable the People API for contact syncing.',
  },
  // ─── Communication — API key ───
  'twilio': {
    type: 'api_key',
    fields: [
      { key: 'account_sid', label: 'Account SID', placeholder: 'ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx' },
      { key: 'auth_token', label: 'Auth Token', placeholder: 'Paste auth token', secret: true },
      { key: 'phone_number', label: 'Phone Number', placeholder: '+1234567890', helpText: 'Your Twilio phone number' },
    ],
    helpUrl: 'https://console.twilio.com',
    helpLabel: 'Twilio Console',
  },
  'zoom': {
    type: 'api_key',
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
    type: 'api_key',
    fields: [
      { key: 'api_key', label: 'API Key', placeholder: 'Your QUO API key', secret: true },
      { key: 'phone_number', label: 'Business Number', placeholder: '+1234567890' },
    ],
  },
  'slack': {
    type: 'api_key',
    fields: [
      { key: 'webhook_url', label: 'Webhook URL', placeholder: 'https://hooks.slack.com/services/...', secret: true, helpText: 'Create an Incoming Webhook in your Slack workspace' },
      { key: 'channel', label: 'Default Channel', placeholder: '#studio-alerts' },
    ],
    helpUrl: 'https://api.slack.com/messaging/webhooks',
    helpLabel: 'Slack Webhooks Guide',
  },
  // ─── Billing — API key ───
  'square': {
    type: 'api_key',
    fields: [
      { key: 'access_token', label: 'Access Token', placeholder: 'Square access token', secret: true },
      { key: 'app_id', label: 'Application ID', placeholder: 'sq0idp-...' },
      { key: 'environment', label: 'Environment', placeholder: 'production or sandbox' },
    ],
    helpUrl: 'https://developer.squareup.com/apps',
    helpLabel: 'Square Developer Dashboard',
  },
  'stripe': {
    type: 'api_key',
    fields: [
      { key: 'publishable_key', label: 'Publishable Key', placeholder: 'pk_live_...' },
      { key: 'secret_key', label: 'Secret Key', placeholder: 'sk_live_...', secret: true },
      { key: 'webhook_secret', label: 'Webhook Secret', placeholder: 'whsec_...', secret: true, helpText: 'For receiving payment events' },
    ],
    helpUrl: 'https://dashboard.stripe.com/apikeys',
    helpLabel: 'Stripe Dashboard',
  },
  'quickbooks': {
    type: 'oauth',
    oauthProvider: 'QuickBooks',
    fields: [
      { key: 'client_id', label: 'Client ID', placeholder: 'QuickBooks app client ID' },
      { key: 'client_secret', label: 'Client Secret', placeholder: 'QuickBooks app client secret', secret: true },
    ],
    helpUrl: 'https://developer.intuit.com/app/developer/dashboard',
    helpLabel: 'Intuit Developer Portal',
    note: 'Create an app in the Intuit Developer Portal. Company ID is obtained automatically during authorization.',
  },
  // ─── Automation — webhook outbound ───
  'zapier': {
    type: 'webhook_outbound',
    fields: [
      { key: 'webhook_url', label: 'Webhook URL', placeholder: 'https://hooks.zapier.com/hooks/catch/...', helpText: 'From your Zapier "Webhooks by Zapier" trigger' },
    ],
    helpUrl: 'https://zapier.com/app/zaps',
    helpLabel: 'Zapier Dashboard',
    note: 'Create a Zap with a "Webhooks by Zapier" trigger to receive events from Lessonpreneur.',
  },
  'make': {
    type: 'webhook_outbound',
    fields: [
      { key: 'webhook_url', label: 'Webhook URL', placeholder: 'https://hook.us1.make.com/...', helpText: 'From your Make webhook module' },
    ],
    helpUrl: 'https://www.make.com/en/scenarios',
    helpLabel: 'Make Dashboard',
  },
  'n8n': {
    type: 'webhook_outbound',
    fields: [
      { key: 'webhook_url', label: 'Webhook URL', placeholder: 'https://your-n8n.com/webhook/...', helpText: 'From your n8n webhook node' },
      { key: 'api_key', label: 'API Key (optional)', placeholder: 'For authenticated webhooks', secret: true },
    ],
  },
  'webhooks': {
    type: 'webhook_outbound',
    fields: [
      { key: 'endpoint_url', label: 'Endpoint URL', placeholder: 'https://your-server.com/webhook' },
      { key: 'secret', label: 'Signing Secret', placeholder: 'Used to verify webhook signatures', secret: true },
    ],
    note: 'We\'ll send POST requests with a HMAC signature in the X-Signature header.',
  },
  'custom-api': {
    type: 'lp_api',
    fields: [],
    note: 'Generate an API token to access the Lessonpreneur API. Tokens are managed in the API Tokens section below.',
  },
  // ─── Documents ───
  'signwell': {
    type: 'api_key',
    fields: [
      { key: 'api_key', label: 'API Key', placeholder: 'Your SignWell API key', secret: true },
    ],
    helpUrl: 'https://www.signwell.com/app/settings/api',
    helpLabel: 'SignWell Settings',
  },
  'docusign': {
    type: 'oauth',
    oauthProvider: 'DocuSign',
    fields: [
      { key: 'client_id', label: 'Integration Key', placeholder: 'DocuSign integration key (client ID)' },
      { key: 'client_secret', label: 'Secret Key', placeholder: 'DocuSign secret key', secret: true },
    ],
    helpUrl: 'https://admindemo.docusign.com/apps-and-keys',
    helpLabel: 'DocuSign Admin',
    note: 'Create an app in DocuSign Admin. Account ID and base URL are obtained during authorization.',
  },
  // ─── CRM & Marketing ───
  'meta-lead-ads': {
    type: 'oauth',
    oauthProvider: 'Meta',
    fields: [
      { key: 'client_id', label: 'App ID', placeholder: 'Facebook App ID' },
      { key: 'client_secret', label: 'App Secret', placeholder: 'Facebook App Secret', secret: true },
    ],
    helpUrl: 'https://developers.facebook.com/apps/',
    helpLabel: 'Meta Developer Portal',
    note: 'Create a Facebook App with Leads Access. Page selection and access token are handled automatically.',
  },
  'mailchimp': {
    type: 'api_key',
    fields: [
      { key: 'api_key', label: 'API Key', placeholder: 'xxxxxxxx-us21', secret: true, helpText: 'Includes your server prefix (e.g. us21)' },
      { key: 'list_id', label: 'Audience / List ID', placeholder: 'Default audience to sync contacts to' },
    ],
    helpUrl: 'https://us1.admin.mailchimp.com/account/api/',
    helpLabel: 'Mailchimp API Keys',
  },
  'activecampaign': {
    type: 'api_key',
    fields: [
      { key: 'api_url', label: 'API URL', placeholder: 'https://yourname.api-us1.com' },
      { key: 'api_key', label: 'API Key', placeholder: 'Your ActiveCampaign API key', secret: true },
    ],
    helpUrl: 'https://help.activecampaign.com/hc/en-us/articles/207317590',
    helpLabel: 'ActiveCampaign API Docs',
  },
}

const FUNCTIONS_URL = 'https://dhsyxyhtoadrqfrlmsqe.supabase.co/functions/v1'
const OAUTH_CALLBACK_URL = `${FUNCTIONS_URL}/integration-oauth-callback`

// ─── Component ─────────────────────────────────────────

interface Props {
  integrationId: string
  integrationName: string
  onConnect: (credentials: Record<string, string>, webhookUrl?: string) => Promise<void>
  onClose: () => void
}

export default function IntegrationConnectModal({ integrationId, integrationName, onConnect, onClose }: Props) {
  const config = INTEGRATION_FIELDS[integrationId]
  const fields = config?.fields ?? [{ key: 'api_key', label: 'API Key', placeholder: 'Enter API key', secret: true }]
  const integrationType = config?.type ?? 'api_key'
  const isOAuth = integrationType === 'oauth' && OAUTH_INTEGRATIONS.has(integrationId)

  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(fields.map(f => [f.key, '']))
  )
  const [showSecrets, setShowSecrets] = useState<Set<string>>(new Set())
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null)
  const [testing, setTesting] = useState(false)
  const [copied, setCopied] = useState(false)

  // OAuth-specific state
  const [oauthStatus, setOauthStatus] = useState<'idle' | 'opening' | 'waiting' | 'success' | 'error'>('idle')
  const [oauthMessage, setOauthMessage] = useState('')
  const popupRef = useRef<Window | null>(null)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const testMut = useTestConnection()
  const inboundWebhookUrl = getWebhookUrl(integrationId)

  const toggleSecret = (key: string) => setShowSecrets(prev => {
    const n = new Set(prev)
    if (n.has(key)) n.delete(key); else n.add(key)
    return n
  })

  const requiredFields = fields.filter(f => !f.helpText?.includes('optional') && !f.label.includes('optional') && !f.readOnly)
  const canSubmit = integrationType === 'lp_api' || requiredFields.every(f => values[f.key]?.trim())

  // ─── OAuth popup message listener ───
  const handleOAuthMessage = useCallback((event: MessageEvent) => {
    if (!event.data || event.data.type !== 'lp-oauth-callback') return

    // Clear timeout
    if (timeoutRef.current) clearTimeout(timeoutRef.current)

    if (event.data.success) {
      setOauthStatus('success')
      setOauthMessage('Connected successfully')
      // Trigger parent refresh — the callback already stored the config
      // We just need to invalidate the query so the page re-fetches
      // Call onConnect with empty creds (they're already stored by the callback)
      // Small delay so user sees the success state
      setTimeout(() => onClose(), 1200)
    } else {
      setOauthStatus('error')
      setOauthMessage(event.data.error || 'Authorization failed')
    }
  }, [onClose])

  useEffect(() => {
    if (isOAuth) {
      window.addEventListener('message', handleOAuthMessage)
      return () => window.removeEventListener('message', handleOAuthMessage)
    }
  }, [isOAuth, handleOAuthMessage])

  // Check if popup was closed without completing
  useEffect(() => {
    if (oauthStatus !== 'waiting') return
    const interval = setInterval(() => {
      if (popupRef.current && popupRef.current.closed) {
        clearInterval(interval)
        if (oauthStatus === 'waiting') {
          setOauthStatus('error')
          setOauthMessage('Authorization window was closed before completing')
        }
      }
    }, 500)
    return () => clearInterval(interval)
  }, [oauthStatus])

  // ─── OAuth flow handler ───
  const handleOAuthAuthorize = async () => {
    if (!values.client_id?.trim() || !values.client_secret?.trim()) {
      setError('Client ID and Client Secret are required')
      return
    }

    setOauthStatus('opening')
    setOauthMessage('')
    setError('')

    try {
      // Call the oauth-start edge function
      let auth_url: string
      try {
        const result = await safeFetch<{ auth_url: string }>(
          `${FUNCTIONS_URL}/integration-oauth-start`,
          {
            body: {
              integration_id: integrationId,
              client_id: values.client_id.trim(),
              client_secret: values.client_secret.trim(),
            } as Record<string, unknown>,
          },
        )
        auth_url = result.auth_url
      } catch (err: any) {
        setOauthStatus('error')
        setOauthMessage(err?.message || 'Failed to start OAuth')
        return
      }

      if (!auth_url) {
        setOauthStatus('error')
        setOauthMessage('No authorization URL returned')
        return
      }

      // Open popup
      const width = 600
      const height = 700
      const left = window.screenX + (window.outerWidth - width) / 2
      const top = window.screenY + (window.outerHeight - height) / 2

      popupRef.current = window.open(
        auth_url,
        'lp_oauth_popup',
        `width=${width},height=${height},left=${left},top=${top},scrollbars=yes,status=yes`
      )

      if (!popupRef.current) {
        setOauthStatus('error')
        setOauthMessage('Popup blocked. Please allow popups for this site and try again.')
        return
      }

      setOauthStatus('waiting')

      // Set a timeout (5 minutes)
      timeoutRef.current = setTimeout(() => {
        if (oauthStatus === 'waiting') {
          setOauthStatus('error')
          setOauthMessage('Authorization timed out. Please try again.')
          popupRef.current?.close()
        }
      }, 5 * 60 * 1000)

    } catch (err: any) {
      setOauthStatus('error')
      setOauthMessage(err.message || 'Failed to start authorization')
    }
  }

  // ─── API key handlers ───
  const handleTest = async () => {
    setTesting(true)
    setTestResult(null)
    try {
      const result = await testMut.mutateAsync({ integrationId, credentials: values })
      setTestResult(result)
    } catch (err: any) {
      setTestResult({ ok: false, message: err.message || 'Test failed' })
    } finally {
      setTesting(false)
    }
  }

  const handleSubmit = async () => {
    if (!canSubmit || saving) return
    setSaving(true)
    setError('')
    try {
      await onConnect(values, inboundWebhookUrl)
    } catch (err: any) {
      setError(err.message || 'Failed to connect')
    } finally {
      setSaving(false)
    }
  }

  const copyWebhookUrl = () => {
    navigator.clipboard.writeText(inboundWebhookUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const copyCallbackUrl = () => {
    navigator.clipboard.writeText(OAUTH_CALLBACK_URL)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  // ─── LP API type ───
  if (integrationType === 'lp_api') {
    return createPortal(
      <div style={{ position: 'fixed', inset: 0, zIndex: 99999, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={onClose}>
        <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 480, margin: '0 16px', background: '#141224', border: '1px solid rgba(212,34,106,0.2)', borderRadius: 16, boxShadow: '0 16px 48px rgba(0,0,0,0.6)', overflow: 'hidden' }}>
          <div style={{ padding: '20px 24px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
            <div>
              <div style={{ fontSize: 16, fontWeight: 800, color: '#E0E0F4' }}>Lessonpreneur API</div>
              <div style={{ fontSize: 12, color: '#8080A8', marginTop: 2 }}>Generate tokens in the API Tokens section</div>
            </div>
            <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#606088', cursor: 'pointer', padding: 4 }}><X size={18} /></button>
          </div>
          <div style={{ padding: '16px 24px 20px' }}>
            <div style={{ padding: '12px 16px', borderRadius: 10, background: 'rgba(56,189,248,0.06)', border: '1px solid rgba(56,189,248,0.15)', fontSize: 12, color: '#A0C8E0', lineHeight: 1.6, marginBottom: 16 }}>
              The LP API lets external systems read and write data programmatically. Generate API tokens below to authenticate requests. Tokens use scoped permissions and can be revoked at any time.
            </div>
            <div style={{ fontSize: 12, color: '#8080A8', marginBottom: 8 }}>Base URL:</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderRadius: 10, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', fontFamily: 'monospace', fontSize: 12, color: '#E0E0F4' }}>
              {FUNCTIONS_URL}/
            </div>
            <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
              <button onClick={onClose} style={{ flex: 1, padding: '12px 16px', borderRadius: 10, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#8080A8', cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>Close</button>
              <button onClick={() => { onConnect({}, undefined) }} style={{ flex: 1, padding: '12px 16px', borderRadius: 10, border: 'none', background: '#D4226A', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>Enable API Access</button>
            </div>
          </div>
        </div>
      </div>,
      document.body
    )
  }

  // ─── Main modal (API key, OAuth, webhook) ───
  return createPortal(
    <div style={{ position: 'fixed', inset: 0, zIndex: 99999, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 480, margin: '0 16px', background: '#141224', border: '1px solid rgba(212,34,106,0.2)', borderRadius: 16, boxShadow: '0 16px 48px rgba(0,0,0,0.6)', overflow: 'hidden', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
        {/* Header */}
        <div style={{ padding: '20px 24px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 800, color: '#E0E0F4' }}>Connect {integrationName}</div>
            <div style={{ fontSize: 12, color: '#8080A8', marginTop: 2 }}>
              {isOAuth ? `Enter your app credentials, then authorize with ${config?.oauthProvider || 'the provider'}`
                : integrationType === 'webhook_outbound' ? 'Configure where LP sends events'
                : 'Enter your credentials to connect'}
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#606088', cursor: 'pointer', padding: 4 }}><X size={18} /></button>
        </div>

        {/* Body */}
        <div style={{ padding: '16px 24px', overflowY: 'auto', flex: 1 }}>
          {/* Webhook URL section for webhook-type integrations */}
          {(integrationType === 'webhook_outbound' || integrationId === 'webhooks') && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#A0A0C8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
                Your LP Webhook URL (for receiving events)
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <input value={inboundWebhookUrl} readOnly style={{ flex: 1, padding: '10px 14px', borderRadius: 10, border: '1px solid rgba(34,197,94,0.2)', background: 'rgba(34,197,94,0.04)', color: '#A0C8A0', fontSize: 11, fontFamily: 'monospace', outline: 'none', boxSizing: 'border-box' }} />
                <button onClick={copyWebhookUrl} style={{ padding: '10px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.04)', color: copied ? '#22C55E' : '#8080A8', cursor: 'pointer', flexShrink: 0 }} title="Copy">
                  {copied ? <Check size={14} /> : <Copy size={14} />}
                </button>
              </div>
              <div style={{ fontSize: 10, color: '#606088', marginTop: 4 }}>External services can POST events to this URL to push data into LP.</div>
            </div>
          )}

          {/* OAuth callback URL — show for OAuth integrations so users can set it in their provider */}
          {isOAuth && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#A0A0C8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
                Redirect URI (add this in your {config?.oauthProvider} app settings)
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <input value={OAUTH_CALLBACK_URL} readOnly style={{ flex: 1, padding: '10px 14px', borderRadius: 10, border: '1px solid rgba(167,139,250,0.2)', background: 'rgba(167,139,250,0.04)', color: '#C8B8E8', fontSize: 10, fontFamily: 'monospace', outline: 'none', boxSizing: 'border-box' }} />
                <button onClick={copyCallbackUrl} style={{ padding: '10px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.04)', color: copied ? '#22C55E' : '#8080A8', cursor: 'pointer', flexShrink: 0 }} title="Copy">
                  {copied ? <Check size={14} /> : <Copy size={14} />}
                </button>
              </div>
            </div>
          )}

          {/* Note */}
          {config?.note && (
            <div style={{ padding: '10px 14px', borderRadius: 10, background: 'rgba(56,189,248,0.06)', border: '1px solid rgba(56,189,248,0.15)', fontSize: 12, color: '#A0C8E0', lineHeight: 1.5, marginBottom: 16 }}>
              {config.note}
            </div>
          )}

          {/* Help link */}
          {config?.helpUrl && (
            <a href={config.helpUrl} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#D4226A', textDecoration: 'none', marginBottom: 16, fontWeight: 600 }}>
              <ExternalLink size={12} />
              {config.helpLabel || 'Documentation'}
            </a>
          )}

          {/* Credential fields */}
          {fields.map(field => (
            <div key={field.key} style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 11, fontWeight: 700, color: '#A0A0C8', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 6 }}>
                {field.label}
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type={field.secret && !showSecrets.has(field.key) ? 'password' : 'text'}
                  value={values[field.key]}
                  onChange={e => { setValues(prev => ({ ...prev, [field.key]: e.target.value })); setTestResult(null); setError('') }}
                  placeholder={field.placeholder}
                  readOnly={field.readOnly}
                  autoComplete="off"
                  disabled={oauthStatus === 'waiting' || oauthStatus === 'success'}
                  style={{
                    width: '100%', padding: '10px 14px', paddingRight: field.secret ? 40 : 14,
                    borderRadius: 10, border: '1px solid rgba(255,255,255,0.08)',
                    background: 'rgba(255,255,255,0.04)', color: '#E0E0F4', fontSize: 13,
                    outline: 'none', boxSizing: 'border-box', fontFamily: field.secret ? 'monospace' : 'inherit',
                    opacity: oauthStatus === 'waiting' || oauthStatus === 'success' ? 0.5 : 1,
                  }}
                />
                {field.secret && (
                  <button onClick={() => toggleSecret(field.key)} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: '#606088', cursor: 'pointer', padding: 4 }}>
                    {showSecrets.has(field.key) ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                )}
              </div>
              {field.helpText && <div style={{ fontSize: 11, color: '#606088', marginTop: 4 }}>{field.helpText}</div>}
            </div>
          ))}

          {/* OAuth status display */}
          {isOAuth && oauthStatus !== 'idle' && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '12px 16px', borderRadius: 10, marginTop: 8,
              background: oauthStatus === 'success' ? 'rgba(34,197,94,0.06)'
                : oauthStatus === 'error' ? 'rgba(239,68,68,0.06)'
                : 'rgba(167,139,250,0.06)',
              border: `1px solid ${oauthStatus === 'success' ? 'rgba(34,197,94,0.2)'
                : oauthStatus === 'error' ? 'rgba(239,68,68,0.2)'
                : 'rgba(167,139,250,0.2)'}`,
            }}>
              {oauthStatus === 'waiting' || oauthStatus === 'opening' ? (
                <Loader2 size={16} style={{ color: '#A78BFA', animation: 'spin 1s linear infinite', flexShrink: 0 }} />
              ) : oauthStatus === 'success' ? (
                <CheckCircle size={16} style={{ color: '#22C55E', flexShrink: 0 }} />
              ) : (
                <XCircle size={16} style={{ color: '#EF4444', flexShrink: 0 }} />
              )}
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: oauthStatus === 'success' ? '#22C55E' : oauthStatus === 'error' ? '#EF4444' : '#A78BFA' }}>
                  {oauthStatus === 'opening' ? 'Starting authorization...'
                    : oauthStatus === 'waiting' ? `Waiting for ${config?.oauthProvider || 'provider'} authorization...`
                    : oauthStatus === 'success' ? 'Connected successfully'
                    : 'Authorization failed'}
                </div>
                {oauthMessage && oauthStatus === 'error' && (
                  <div style={{ fontSize: 11, color: '#EF4444', marginTop: 4, lineHeight: 1.4 }}>{oauthMessage}</div>
                )}
                {oauthStatus === 'waiting' && (
                  <div style={{ fontSize: 11, color: '#8080A8', marginTop: 4 }}>Complete the sign-in in the popup window</div>
                )}
              </div>
            </div>
          )}

          {/* Test Connection Result (API key integrations only) */}
          {!isOAuth && testResult && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '10px 14px', borderRadius: 10, marginTop: 4, marginBottom: 8,
              background: testResult.ok ? 'rgba(34,197,94,0.06)' : 'rgba(239,68,68,0.06)',
              border: `1px solid ${testResult.ok ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)'}`,
            }}>
              {testResult.ok ? <CheckCircle size={14} style={{ color: '#22C55E', flexShrink: 0 }} /> : <XCircle size={14} style={{ color: '#EF4444', flexShrink: 0 }} />}
              <span style={{ fontSize: 12, color: testResult.ok ? '#22C55E' : '#EF4444', lineHeight: 1.4 }}>{testResult.message}</span>
            </div>
          )}

          {error && (
            <div style={{ padding: '8px 12px', borderRadius: 8, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: '#EF4444', fontSize: 12, marginTop: 4 }}>
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '12px 24px 20px', display: 'flex', gap: 8, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          <button onClick={onClose} style={{ padding: '12px 16px', borderRadius: 10, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#8080A8', cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>
            Cancel
          </button>

          {isOAuth ? (
            /* OAuth: Authorize button */
            <button
              onClick={handleOAuthAuthorize}
              disabled={!values.client_id?.trim() || !values.client_secret?.trim() || oauthStatus === 'waiting' || oauthStatus === 'success'}
              style={{
                flex: 1, padding: '12px 16px', borderRadius: 10, border: 'none',
                background: (values.client_id?.trim() && values.client_secret?.trim() && oauthStatus !== 'waiting' && oauthStatus !== 'success') ? '#A78BFA' : '#363656',
                color: '#fff', fontWeight: 700, fontSize: 13,
                cursor: (values.client_id?.trim() && values.client_secret?.trim() && oauthStatus !== 'waiting' && oauthStatus !== 'success') ? 'pointer' : 'not-allowed',
                opacity: (values.client_id?.trim() && values.client_secret?.trim() && oauthStatus !== 'waiting' && oauthStatus !== 'success') ? 1 : 0.5,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              }}
            >
              {oauthStatus === 'waiting' || oauthStatus === 'opening' ? (
                <><Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> Authorizing...</>
              ) : oauthStatus === 'success' ? (
                <><CheckCircle size={14} /> Connected</>
              ) : (
                <><LogIn size={14} /> Authorize with {config?.oauthProvider || 'Provider'}</>
              )}
            </button>
          ) : (
            /* API key / webhook: Test + Connect buttons */
            <>
              {canSubmit && fields.length > 0 && (
                <button
                  onClick={handleTest}
                  disabled={!canSubmit || testing}
                  style={{
                    padding: '12px 16px', borderRadius: 10,
                    background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.12)',
                    color: testing ? '#606088' : '#A0A0C8', fontWeight: 600, fontSize: 13,
                    cursor: testing ? 'not-allowed' : 'pointer',
                    display: 'flex', alignItems: 'center', gap: 6,
                  }}
                >
                  {testing && <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} />}
                  {testing ? 'Testing...' : 'Test'}
                </button>
              )}
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
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  )
}
