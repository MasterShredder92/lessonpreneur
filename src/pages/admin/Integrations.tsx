import { useState, useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Calendar, Video, Mail, HardDrive, Users, Phone, CreditCard, Zap, FileSignature, Megaphone, MessageSquare, Globe, Webhook, Code, ChevronDown, Search, Copy, Check, Key, Trash2, Shield, Activity, ArrowUpRight, Clock, AlertTriangle, CheckCircle, XCircle, RotateCcw } from 'lucide-react'
import { toast } from '../../components/shared/Toast'
import {
  useIntegrations, useConnectIntegration, useDisconnectIntegration,
  useToggleIntegration, useUpdateIntegrationSettings, getWebhookUrl,
  useApiTokens, useCreateApiToken, useRevokeApiToken, useOutboundDeliveries,
} from '../../hooks/useIntegrations'
import IntegrationConnectModal from '../../components/admin/IntegrationConnectModal'
import IntegrationConfigureModal from '../../components/admin/IntegrationConfigureModal'
import type { IntegrationConfig, ApiToken, WebhookEvent } from '../../hooks/useIntegrations'
import { IssueContextProvider } from '../../contexts/IssueContext'
import ReportIssueButton from '../../components/shared/ReportIssueButton'

// ─── Integration Data ───────────────────────────────

interface IntegrationDef {
  id: string
  name: string
  category: string
  description: string
  icon: string
  type: 'api_key' | 'oauth' | 'webhook_outbound' | 'lp_api'
}

const ICON_MAP: Record<string, React.ReactNode> = {
  calendar: <Calendar size={20} />,
  video: <Video size={20} />,
  mail: <Mail size={20} />,
  drive: <HardDrive size={20} />,
  contacts: <Users size={20} />,
  phone: <Phone size={20} />,
  message: <MessageSquare size={20} />,
  globe: <Globe size={20} />,
  credit: <CreditCard size={20} />,
  zap: <Zap size={20} />,
  webhook: <Webhook size={20} />,
  code: <Code size={20} />,
  sign: <FileSignature size={20} />,
  megaphone: <Megaphone size={20} />,
}

const TYPE_LABELS: Record<string, { label: string; color: string }> = {
  api_key: { label: 'API Key', color: '#38BDF8' },
  oauth: { label: 'OAuth', color: '#A78BFA' },
  webhook_outbound: { label: 'Webhook', color: '#FFB800' },
  lp_api: { label: 'LP API', color: '#D4226A' },
}

const INTEGRATIONS: IntegrationDef[] = [
  // Google
  { id: 'google-calendar', name: 'Google Calendar', category: 'Google', description: 'Sync lesson schedules and teacher availability.', icon: 'calendar', type: 'oauth' },
  { id: 'google-meet', name: 'Google Meet', category: 'Google', description: 'Auto-generate virtual lesson links.', icon: 'video', type: 'oauth' },
  { id: 'gmail', name: 'Gmail', category: 'Google', description: 'Send notifications and confirmations via email.', icon: 'mail', type: 'oauth' },
  { id: 'google-drive', name: 'Google Drive', category: 'Google', description: 'Store and organize student documents.', icon: 'drive', type: 'oauth' },
  { id: 'google-contacts', name: 'Google Contacts', category: 'Google', description: 'Sync parent and student contact info.', icon: 'contacts', type: 'oauth' },
  // Communication
  { id: 'twilio', name: 'Twilio', category: 'Communication', description: 'Programmable SMS and voice for notifications.', icon: 'phone', type: 'api_key' },
  { id: 'zoom', name: 'Zoom', category: 'Communication', description: 'Host virtual lessons with auto-generated links.', icon: 'video', type: 'api_key' },
  { id: 'quo', name: 'QUO', category: 'Communication', description: 'Two-way SMS messaging with families.', icon: 'message', type: 'api_key' },
  { id: 'slack', name: 'Slack', category: 'Communication', description: 'Get real-time alerts and team notifications.', icon: 'message', type: 'api_key' },
  // Billing & Accounting
  { id: 'square', name: 'Square', category: 'Billing & Accounting', description: 'Process payments and manage transactions.', icon: 'credit', type: 'api_key' },
  { id: 'stripe', name: 'Stripe', category: 'Billing & Accounting', description: 'Subscription billing and payment processing.', icon: 'credit', type: 'api_key' },
  { id: 'quickbooks', name: 'QuickBooks', category: 'Billing & Accounting', description: 'Sync revenue and expenses for accounting.', icon: 'credit', type: 'oauth' },
  // Automation Tools
  { id: 'zapier', name: 'Zapier', category: 'Automation Tools', description: 'Connect to 5,000+ apps with no-code automations.', icon: 'zap', type: 'webhook_outbound' },
  { id: 'make', name: 'Make', category: 'Automation Tools', description: 'Visual automation workflows for complex logic.', icon: 'zap', type: 'webhook_outbound' },
  { id: 'n8n', name: 'n8n', category: 'Automation Tools', description: 'Self-hosted automation with full control.', icon: 'zap', type: 'webhook_outbound' },
  { id: 'webhooks', name: 'Webhooks', category: 'Automation Tools', description: 'Push real-time events to external systems.', icon: 'webhook', type: 'webhook_outbound' },
  { id: 'custom-api', name: 'Custom API', category: 'Automation Tools', description: 'Build custom integrations with the LP API.', icon: 'code', type: 'lp_api' },
  // Documents & Signatures
  { id: 'signwell', name: 'SignWell', category: 'Documents & Signatures', description: 'Send and track enrollment agreements.', icon: 'sign', type: 'api_key' },
  { id: 'docusign', name: 'DocuSign', category: 'Documents & Signatures', description: 'Electronic signatures for contracts and forms.', icon: 'sign', type: 'oauth' },
  // CRM & Marketing
  { id: 'meta-lead-ads', name: 'Meta Lead Ads', category: 'CRM & Marketing', description: 'Capture leads directly from Facebook and Instagram ads.', icon: 'megaphone', type: 'oauth' },
  { id: 'mailchimp', name: 'Mailchimp', category: 'CRM & Marketing', description: 'Email marketing campaigns and newsletters.', icon: 'mail', type: 'api_key' },
  { id: 'activecampaign', name: 'ActiveCampaign', category: 'CRM & Marketing', description: 'Advanced email automation and CRM sync.', icon: 'mail', type: 'api_key' },
]

const CATEGORIES = ['Google', 'Communication', 'Billing & Accounting', 'Automation Tools', 'Documents & Signatures', 'CRM & Marketing']

const HEALTH_COLORS: Record<string, string> = {
  healthy: '#22C55E',
  degraded: '#FFB800',
  error: '#EF4444',
  unknown: '#606088',
}

function timeAgo(dateStr: string): string {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000)
  if (seconds < 60) return 'just now'
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
  return `${Math.floor(seconds / 86400)}d ago`
}

// ─── Outbound Delivery Log Panel ─────────────────────

const DELIVERY_STATUS_CONFIG: Record<string, { icon: React.ReactNode; color: string; label: string }> = {
  delivered: { icon: <CheckCircle size={12} />, color: '#22C55E', label: 'Delivered' },
  queued: { icon: <Clock size={12} />, color: '#38BDF8', label: 'Queued' },
  retrying: { icon: <RotateCcw size={12} />, color: '#FFB800', label: 'Retrying' },
  failed: { icon: <XCircle size={12} />, color: '#EF4444', label: 'Failed' },
}

const EVENT_TYPE_LABELS: Record<string, string> = {
  'lead.created': 'New Lead',
  'enrollment.created': 'New Enrollment',
  'session.completed': 'Session Completed',
  'cancellation.created': 'Cancellation',
}

function OutboundDeliveryLog() {
  const { data: deliveries = [], isLoading } = useOutboundDeliveries()
  const [expanded, setExpanded] = useState<string | null>(null)

  // Summary stats
  const last24h = deliveries.filter(d => Date.now() - new Date(d.created_at).getTime() < 86_400_000)
  const delivered = last24h.filter(d => d.status === 'delivered').length
  const failing = last24h.filter(d => d.status === 'failed' || d.status === 'retrying').length

  return (
    <div style={{ marginTop: 32, padding: '20px 24px', borderRadius: 14, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,184,0,0.15)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <ArrowUpRight size={16} style={{ color: '#FFB800' }} />
          <span style={{ fontSize: 14, fontWeight: 800, color: '#E0E0F4' }}>Outbound Webhooks</span>
          <span style={{ fontSize: 11, color: '#606088' }}>Last 50 deliveries</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {delivered > 0 && (
            <span style={{ fontSize: 11, fontWeight: 600, color: '#22C55E' }}>
              {delivered} delivered (24h)
            </span>
          )}
          {failing > 0 && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 600, color: '#EF4444' }}>
              <AlertTriangle size={11} />
              {failing} failing
            </span>
          )}
        </div>
      </div>

      {isLoading ? (
        <div style={{ textAlign: 'center', padding: '16px 0', color: '#606088', fontSize: 12 }}>Loading delivery log...</div>
      ) : deliveries.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '20px 0', color: '#606088', fontSize: 12 }}>
          No outbound webhooks dispatched yet. Connect a webhook integration (Zapier, Make, n8n, or custom) and events will appear here when leads are created, students enrolled, sessions completed, or cancellations happen.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {deliveries.map(d => {
            const statusCfg = DELIVERY_STATUS_CONFIG[d.status] ?? { icon: <Clock size={12} />, color: '#606088', label: d.status }
            const isExpanded = expanded === d.id
            const eventLabel = EVENT_TYPE_LABELS[d.event_type] ?? d.event_type

            return (
              <div key={d.id}>
                <button
                  onClick={() => setExpanded(isExpanded ? null : d.id)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10, width: '100%',
                    padding: '10px 14px', borderRadius: 10,
                    background: isExpanded ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.02)',
                    border: `1px solid ${d.status === 'failed' ? 'rgba(239,68,68,0.12)' : 'rgba(255,255,255,0.06)'}`,
                    cursor: 'pointer', textAlign: 'left',
                  }}
                >
                  {/* Status icon */}
                  <span style={{ color: statusCfg.color, flexShrink: 0 }}>{statusCfg.icon}</span>

                  {/* Event type */}
                  <span style={{ fontSize: 12, fontWeight: 600, color: '#E0E0F4', minWidth: 120 }}>{eventLabel}</span>

                  {/* Integration target */}
                  <span style={{ fontSize: 11, color: '#8080A8', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {d.integration_id}
                  </span>

                  {/* Response code */}
                  {d.response_code && (
                    <span style={{
                      fontSize: 10, fontWeight: 700, fontFamily: 'monospace',
                      padding: '2px 6px', borderRadius: 4,
                      background: d.response_code >= 200 && d.response_code < 300
                        ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
                      color: d.response_code >= 200 && d.response_code < 300
                        ? '#22C55E' : '#EF4444',
                    }}>
                      {d.response_code}
                    </span>
                  )}

                  {/* Latency */}
                  {d.latency_ms !== null && (
                    <span style={{ fontSize: 10, color: '#606088', fontFamily: 'monospace', minWidth: 48, textAlign: 'right' }}>
                      {d.latency_ms}ms
                    </span>
                  )}

                  {/* Attempt count */}
                  {d.attempt_count > 1 && (
                    <span style={{ fontSize: 10, color: '#FFB800', fontWeight: 600 }}>
                      ×{d.attempt_count}
                    </span>
                  )}

                  {/* Timestamp */}
                  <span style={{ fontSize: 10, color: '#606088', minWidth: 48, textAlign: 'right', flexShrink: 0 }}>
                    {timeAgo(d.created_at)}
                  </span>
                </button>

                {/* Expanded detail */}
                {isExpanded && (
                  <div style={{
                    margin: '4px 0 4px 36px', padding: '12px 16px', borderRadius: 10,
                    background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)',
                    fontSize: 11, lineHeight: 1.8,
                  }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '4px 12px' }}>
                      <span style={{ color: '#606088' }}>Status</span>
                      <span style={{ color: statusCfg.color, fontWeight: 600 }}>{statusCfg.label}</span>

                      <span style={{ color: '#606088' }}>Event</span>
                      <span style={{ color: '#E0E0F4' }}>{d.event_type}</span>

                      <span style={{ color: '#606088' }}>Integration</span>
                      <span style={{ color: '#E0E0F4' }}>{d.integration_id}</span>

                      {d.delivery_id && (
                        <>
                          <span style={{ color: '#606088' }}>Delivery ID</span>
                          <span style={{ color: '#A0A0C8', fontFamily: 'monospace', fontSize: 10 }}>{d.delivery_id}</span>
                        </>
                      )}

                      {d.target_url && (
                        <>
                          <span style={{ color: '#606088' }}>Target URL</span>
                          <span style={{ color: '#A0A0C8', fontFamily: 'monospace', fontSize: 10, wordBreak: 'break-all' }}>{d.target_url}</span>
                        </>
                      )}

                      {d.response_code !== null && (
                        <>
                          <span style={{ color: '#606088' }}>Response</span>
                          <span style={{ color: '#E0E0F4' }}>HTTP {d.response_code}</span>
                        </>
                      )}

                      {d.latency_ms !== null && (
                        <>
                          <span style={{ color: '#606088' }}>Latency</span>
                          <span style={{ color: '#E0E0F4' }}>{d.latency_ms}ms</span>
                        </>
                      )}

                      <span style={{ color: '#606088' }}>Attempts</span>
                      <span style={{ color: '#E0E0F4' }}>{d.attempt_count} / 5</span>

                      {d.next_retry_at && (
                        <>
                          <span style={{ color: '#606088' }}>Next retry</span>
                          <span style={{ color: '#FFB800' }}>{new Date(d.next_retry_at).toLocaleString()}</span>
                        </>
                      )}

                      <span style={{ color: '#606088' }}>Created</span>
                      <span style={{ color: '#A0A0C8' }}>{new Date(d.created_at).toLocaleString()}</span>
                    </div>

                    {d.error_message && (
                      <div style={{
                        marginTop: 10, padding: '8px 12px', borderRadius: 8,
                        background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.12)',
                        color: '#EF4444', fontSize: 11, lineHeight: 1.5,
                      }}>
                        {d.error_message}
                      </div>
                    )}

                    {d.response_body && (
                      <div style={{
                        marginTop: 8, padding: '8px 12px', borderRadius: 8,
                        background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)',
                        color: '#8080A8', fontSize: 10, fontFamily: 'monospace', lineHeight: 1.5,
                        whiteSpace: 'pre-wrap', wordBreak: 'break-all', maxHeight: 120, overflow: 'auto',
                      }}>
                        {d.response_body}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── API Token Management Panel ──────────────────────

function ApiTokenPanel() {
  const { data: tokens = [], isLoading } = useApiTokens()
  const createMut = useCreateApiToken()
  const revokeMut = useRevokeApiToken()
  const [showCreate, setShowCreate] = useState(false)
  const [newName, setNewName] = useState('')
  const [newToken, setNewToken] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const AVAILABLE_SCOPES = [
    { id: 'leads:read', label: 'Read Leads' },
    { id: 'leads:write', label: 'Write Leads' },
    { id: 'students:read', label: 'Read Students' },
    { id: 'families:read', label: 'Read Families' },
    { id: 'schedule:read', label: 'Read Schedule' },
    { id: 'teachers:read', label: 'Read Teachers' },
    { id: 'locations:read', label: 'Read Locations' },
  ]

  const [selectedScopes, setSelectedScopes] = useState<Set<string>>(new Set(['leads:read', 'schedule:read', 'locations:read']))

  const toggleScope = (scope: string) => setSelectedScopes(prev => {
    const n = new Set(prev)
    if (n.has(scope)) n.delete(scope); else n.add(scope)
    return n
  })

  const handleCreate = async () => {
    if (!newName.trim()) return
    try {
      const result = await createMut.mutateAsync({
        name: newName.trim(),
        scopes: Array.from(selectedScopes),
      })
      setNewToken(result.token)
      setNewName('')
      toast('API token created', 'success')
    } catch (err: any) {
      toast(err.message || 'Failed to create token', 'error')
    }
  }

  const handleRevoke = async (token: ApiToken) => {
    if (!confirm(`Revoke token "${token.name}"? Any system using this token will immediately lose access.`)) return
    try {
      await revokeMut.mutateAsync(token.id)
      toast('Token revoked', 'success')
    } catch {
      toast('Failed to revoke token', 'error')
    }
  }

  const activeTokens = tokens.filter(t => !t.revoked_at)
  const revokedTokens = tokens.filter(t => t.revoked_at)

  return (
    <div style={{ marginTop: 32, padding: '20px 24px', borderRadius: 14, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(212,34,106,0.15)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Key size={16} style={{ color: '#D4226A' }} />
          <span style={{ fontSize: 14, fontWeight: 800, color: '#E0E0F4' }}>API Tokens</span>
          <span style={{ fontSize: 11, color: '#606088' }}>{activeTokens.length} active</span>
        </div>
        <button
          onClick={() => { setShowCreate(!showCreate); setNewToken(null) }}
          style={{ padding: '6px 14px', borderRadius: 8, background: 'rgba(212,34,106,0.08)', border: '1px solid rgba(212,34,106,0.25)', color: '#D4226A', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}
        >
          {showCreate ? 'Cancel' : '+ New Token'}
        </button>
      </div>

      {/* New token just created — show it once */}
      {newToken && (
        <div style={{ padding: '14px 16px', borderRadius: 10, background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.2)', marginBottom: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#22C55E', marginBottom: 8 }}>Token created — copy it now. It won't be shown again.</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              readOnly
              value={newToken}
              style={{ flex: 1, padding: '8px 12px', borderRadius: 8, background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(34,197,94,0.2)', color: '#22C55E', fontSize: 11, fontFamily: 'monospace', outline: 'none' }}
            />
            <button
              onClick={() => { navigator.clipboard.writeText(newToken); setCopied(true); setTimeout(() => setCopied(false), 2000) }}
              style={{ padding: '8px', borderRadius: 8, border: '1px solid rgba(34,197,94,0.2)', background: 'rgba(34,197,94,0.08)', color: '#22C55E', cursor: 'pointer' }}
            >
              {copied ? <Check size={14} /> : <Copy size={14} />}
            </button>
          </div>
        </div>
      )}

      {/* Create form */}
      {showCreate && !newToken && (
        <div style={{ padding: '14px 16px', borderRadius: 10, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.08)', marginBottom: 16 }}>
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 11, fontWeight: 700, color: '#A0A0C8', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 6 }}>Token Name</label>
            <input
              value={newName}
              onChange={e => setNewName(e.target.value)}
              placeholder="e.g. Zapier Production, n8n Webhook"
              style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.04)', color: '#E0E0F4', fontSize: 13, outline: 'none', boxSizing: 'border-box' }}
            />
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 11, fontWeight: 700, color: '#A0A0C8', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 8 }}>Permissions</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {AVAILABLE_SCOPES.map(s => (
                <button
                  key={s.id}
                  onClick={() => toggleScope(s.id)}
                  style={{
                    padding: '5px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: 'pointer',
                    background: selectedScopes.has(s.id) ? 'rgba(212,34,106,0.12)' : 'rgba(255,255,255,0.04)',
                    border: `1px solid ${selectedScopes.has(s.id) ? 'rgba(212,34,106,0.3)' : 'rgba(255,255,255,0.08)'}`,
                    color: selectedScopes.has(s.id) ? '#D4226A' : '#8080A8',
                  }}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>
          <button
            onClick={handleCreate}
            disabled={!newName.trim() || selectedScopes.size === 0 || createMut.isPending}
            style={{
              padding: '10px 20px', borderRadius: 10, border: 'none',
              background: newName.trim() && selectedScopes.size > 0 ? '#D4226A' : '#363656',
              color: '#fff', fontWeight: 700, fontSize: 12, cursor: newName.trim() ? 'pointer' : 'not-allowed',
            }}
          >
            {createMut.isPending ? 'Creating...' : 'Generate Token'}
          </button>
        </div>
      )}

      {/* Token list */}
      {isLoading ? (
        <div style={{ textAlign: 'center', padding: '16px 0', color: '#606088', fontSize: 12 }}>Loading tokens...</div>
      ) : activeTokens.length === 0 && !showCreate ? (
        <div style={{ textAlign: 'center', padding: '16px 0', color: '#606088', fontSize: 12 }}>No API tokens yet. Create one to get started.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {activeTokens.map(token => (
            <div key={token.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderRadius: 10, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
              <Shield size={14} style={{ color: '#D4226A', flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#E0E0F4' }}>{token.name}</div>
                <div style={{ fontSize: 11, color: '#606088', marginTop: 2 }}>
                  <span style={{ fontFamily: 'monospace' }}>{token.token_prefix}...</span>
                  <span style={{ margin: '0 6px' }}>·</span>
                  {token.scopes.slice(0, 3).join(', ')}
                  {token.scopes.length > 3 && ` +${token.scopes.length - 3}`}
                  {token.last_used_at && (
                    <><span style={{ margin: '0 6px' }}>·</span>Used {timeAgo(token.last_used_at)}</>
                  )}
                </div>
              </div>
              <button
                onClick={() => handleRevoke(token)}
                style={{ padding: '6px', borderRadius: 6, border: '1px solid rgba(239,68,68,0.15)', background: 'none', color: '#EF4444', cursor: 'pointer', flexShrink: 0 }}
                title="Revoke token"
              >
                <Trash2 size={13} />
              </button>
            </div>
          ))}
          {revokedTokens.length > 0 && (
            <div style={{ fontSize: 11, color: '#606088', marginTop: 4 }}>{revokedTokens.length} revoked token(s)</div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Main Component ──────────────────────────────────

export default function Integrations() {
  const qc = useQueryClient()
  const { data: configs = [], isLoading } = useIntegrations()
  const connectMut = useConnectIntegration()
  const disconnectMut = useDisconnectIntegration()
  const toggleMut = useToggleIntegration()
  const updateSettingsMut = useUpdateIntegrationSettings()

  const [search, setSearch] = useState('')
  const [collapsedCats, setCollapsedCats] = useState<Set<string>>(new Set())
  const [connectModal, setConnectModal] = useState<IntegrationDef | null>(null)
  const [configureModal, setConfigureModal] = useState<{ def: IntegrationDef; config: IntegrationConfig } | null>(null)
  const [copiedWebhook, setCopiedWebhook] = useState<string | null>(null)

  // When connect modal closes, always re-fetch integrations
  // (OAuth flows store config via callback, not through the mutation)
  const handleCloseConnectModal = useCallback(() => {
    setConnectModal(null)
    qc.invalidateQueries({ queryKey: ['integration_configs'] })
  }, [qc])

  const configMap = new Map<string, IntegrationConfig>()
  configs.forEach(c => configMap.set(c.integration_id, c))

  const getStatus = (id: string) => {
    const c = configMap.get(id)
    if (!c || c.status !== 'connected') return { connected: false, enabled: false, health: 'unknown' as const }
    return { connected: true, enabled: c.enabled, health: c.health_status ?? 'unknown' as const }
  }

  const connectedItems = INTEGRATIONS.filter(i => getStatus(i.id).connected)
  const filtered = search
    ? INTEGRATIONS.filter(i => i.name.toLowerCase().includes(search.toLowerCase()) || i.category.toLowerCase().includes(search.toLowerCase()))
    : INTEGRATIONS

  const toggleCat = (cat: string) => setCollapsedCats(prev => { const n = new Set(prev); if (n.has(cat)) n.delete(cat); else n.add(cat); return n })

  const handleConnect = async (def: IntegrationDef, credentials: Record<string, string>, webhookUrl?: string) => {
    try {
      await connectMut.mutateAsync({ integrationId: def.id, credentials, webhookUrl })
      toast(`${def.name} connected`, 'success')
      setConnectModal(null)
    } catch (err: any) {
      toast(err.message || `Failed to connect ${def.name}`, 'error')
    }
  }

  const handleDisconnect = async (def: IntegrationDef) => {
    if (!confirm(`Disconnect ${def.name}? This will remove stored credentials.`)) return
    try {
      await disconnectMut.mutateAsync(def.id)
      toast(`${def.name} disconnected`, 'success')
    } catch (err: any) {
      toast(err.message || `Failed to disconnect ${def.name}`, 'error')
    }
  }

  const handleToggle = async (id: string, enabled: boolean) => {
    try {
      await toggleMut.mutateAsync({ integrationId: id, enabled })
      toast(enabled ? 'Integration enabled' : 'Integration paused', 'success')
    } catch (err: any) {
      toast(err.message || 'Failed to update integration', 'error')
    }
  }

  const handleSaveConfig = async (integrationId: string, settings: Record<string, any>, credentials?: Record<string, any>) => {
    try {
      await updateSettingsMut.mutateAsync({ integrationId, settings, credentials })
      toast('Settings saved', 'success')
      setConfigureModal(null)
    } catch (err: any) {
      toast(err.message || 'Failed to save settings', 'error')
    }
  }

  const copyWebhook = (integrationId: string) => {
    navigator.clipboard.writeText(getWebhookUrl(integrationId))
    setCopiedWebhook(integrationId)
    setTimeout(() => setCopiedWebhook(null), 2000)
  }

  return (
    <IssueContextProvider page="Settings" section="Integrations">
    <div className="page" style={{ maxWidth: 1100 }}>
      {/* Hero */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: '#E0E0F4', marginBottom: 4 }}>Integrations</h1>
          <ReportIssueButton />
        </div>
        <p style={{ fontSize: 13, color: '#8080A8', marginBottom: 16 }}>Connect your tools. Automate your workflow.</p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: '#22C55E' }}>{connectedItems.length} connected</span>
          <span style={{ fontSize: 12, color: '#606088' }}>&middot;</span>
          <span style={{ fontSize: 12, color: '#8080A8' }}>{INTEGRATIONS.length - connectedItems.length} available</span>
          <div style={{ flex: 1 }} />
          <div style={{ position: 'relative', maxWidth: 240 }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#606088' }} />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search integrations..."
              style={{ width: '100%', padding: '7px 12px 7px 30px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.04)', color: '#E0E0F4', fontSize: 12, outline: 'none' }}
            />
          </div>
        </div>
      </div>

      {/* Connected strip */}
      {connectedItems.length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 20 }}>
          {connectedItems.map(c => {
            const cfg = configMap.get(c.id)
            const healthColor = HEALTH_COLORS[cfg?.health_status ?? 'unknown']
            return (
              <span key={c.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 10px', borderRadius: 999, fontSize: 11, fontWeight: 600, background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)', color: '#22C55E' }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: healthColor }} />
                {c.name}
                {cfg?.last_activity_at && (
                  <span style={{ fontSize: 9, color: '#606088', marginLeft: 2 }}>{timeAgo(cfg.last_activity_at)}</span>
                )}
              </span>
            )
          })}
        </div>
      )}

      {/* API Token Management + Outbound Webhooks — above the fold */}
      <ApiTokenPanel />
      <OutboundDeliveryLog />

      {isLoading && (
        <div style={{ textAlign: 'center', padding: '40px 0', color: '#606088', fontSize: 13 }}>Loading integrations...</div>
      )}

      {/* Categories */}
      {CATEGORIES.map(cat => {
        const catItems = filtered.filter(i => i.category === cat)
        if (catItems.length === 0) return null
        const isCollapsed = collapsedCats.has(cat)
        const catConnected = catItems.filter(i => getStatus(i.id).connected).length

        return (
          <div key={cat} style={{ marginBottom: 20 }}>
            <button onClick={() => toggleCat(cat)} style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '8px 0', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#8080A8', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{cat}</span>
              <span style={{ fontSize: 10, color: '#606088' }}>{catConnected} of {catItems.length} connected</span>
              <div style={{ flex: 1 }} />
              <ChevronDown size={14} style={{ color: '#606088', transition: 'transform 200ms ease', transform: isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)' }} />
            </button>

            {!isCollapsed && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 10 }}>
                {catItems.map(item => {
                  const { connected: isConn, enabled, health } = getStatus(item.id)
                  const dbConfig = configMap.get(item.id)
                  const typeInfo = TYPE_LABELS[item.type]
                  const healthColor = HEALTH_COLORS[health]

                  return (
                    <div
                      key={item.id}
                      style={{
                        padding: '16px 18px',
                        borderRadius: 14,
                        background: 'rgba(255,255,255,0.03)',
                        border: `1px solid ${isConn ? 'rgba(34,197,94,0.15)' : 'rgba(255,255,255,0.06)'}`,
                        borderLeft: isConn ? '3px solid rgba(34,197,94,0.4)' : '3px solid transparent',
                        opacity: isConn && !enabled ? 0.6 : 1,
                        transition: 'all 150ms ease',
                        position: 'relative',
                      }}
                    >
                      {/* Toggle (connected only) */}
                      {isConn && (
                        <button
                          onClick={() => handleToggle(item.id, !enabled)}
                          style={{
                            position: 'absolute', top: 14, right: 14,
                            width: 36, height: 20, borderRadius: 10, border: 'none', cursor: 'pointer',
                            background: enabled ? '#22C55E' : '#363656',
                            transition: 'background 150ms ease', padding: 0,
                          }}
                        >
                          <div style={{
                            width: 16, height: 16, borderRadius: '50%', background: '#fff',
                            transform: `translateX(${enabled ? 17 : 2}px)`,
                            transition: 'transform 150ms ease',
                          }} />
                        </button>
                      )}

                      {/* Icon + Name + Type badge */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                        <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: isConn ? '#22C55E' : '#7070A0', flexShrink: 0 }}>
                          {ICON_MAP[item.icon] ?? <Zap size={20} />}
                        </div>
                        <div>
                          <div style={{ fontSize: 14, fontWeight: 600, color: '#E0E0F4' }}>{item.name}</div>
                          <span style={{ fontSize: 9, fontWeight: 700, color: typeInfo.color, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                            {typeInfo.label}
                          </span>
                        </div>
                      </div>

                      {/* Description */}
                      <div style={{ fontSize: 12, color: '#8080A8', lineHeight: 1.5, marginBottom: 12, minHeight: 36 }}>
                        {item.description}
                      </div>

                      {/* Webhook URL for connected webhook integrations */}
                      {isConn && item.type === 'webhook_outbound' && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 10 }}>
                          <div style={{ flex: 1, fontSize: 10, fontFamily: 'monospace', color: '#606088', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {getWebhookUrl(item.id).replace('https://', '')}
                          </div>
                          <button
                            onClick={() => copyWebhook(item.id)}
                            style={{ padding: '3px 6px', borderRadius: 4, border: '1px solid rgba(255,255,255,0.08)', background: 'none', color: copiedWebhook === item.id ? '#22C55E' : '#606088', cursor: 'pointer', fontSize: 10 }}
                          >
                            {copiedWebhook === item.id ? <Check size={10} /> : <Copy size={10} />}
                          </button>
                        </div>
                      )}

                      {/* Health + Activity indicator for connected integrations */}
                      {isConn && dbConfig?.last_activity_at && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 8 }}>
                          <Activity size={10} style={{ color: '#606088' }} />
                          <span style={{ fontSize: 10, color: '#606088' }}>Last activity: {timeAgo(dbConfig.last_activity_at)}</span>
                          {dbConfig.health_status && dbConfig.health_status !== 'unknown' && (
                            <>
                              <span style={{ margin: '0 2px', color: '#363656' }}>·</span>
                              <span style={{ width: 6, height: 6, borderRadius: '50%', background: healthColor }} />
                              <span style={{ fontSize: 10, color: healthColor }}>{dbConfig.health_status}</span>
                            </>
                          )}
                        </div>
                      )}

                      {/* Status + Action */}
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ width: 8, height: 8, borderRadius: '50%', background: isConn ? (enabled ? healthColor : '#FFB800') : '#606088' }} />
                          <span style={{ fontSize: 11, fontWeight: 600, color: isConn ? (enabled ? '#22C55E' : '#FFB800') : '#606088' }}>
                            {isConn ? (enabled ? 'Connected' : 'Paused') : 'Not Connected'}
                          </span>
                        </div>
                        <div style={{ display: 'flex', gap: 6 }}>
                          {isConn ? (
                            <>
                              <button
                                onClick={() => dbConfig && setConfigureModal({ def: item, config: dbConfig })}
                                style={{ padding: '5px 12px', borderRadius: 8, background: 'none', border: '1px solid rgba(255,255,255,0.08)', color: '#A0A0C8', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}
                              >
                                Configure
                              </button>
                              <button
                                onClick={() => handleDisconnect(item)}
                                style={{ padding: '5px 8px', borderRadius: 8, background: 'none', border: '1px solid rgba(239,68,68,0.15)', color: '#EF4444', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}
                              >
                                Disconnect
                              </button>
                            </>
                          ) : (
                            <button
                              onClick={() => setConnectModal(item)}
                              style={{ padding: '5px 14px', borderRadius: 8, background: 'rgba(212,34,106,0.08)', border: '1px solid rgba(212,34,106,0.25)', color: '#D4226A', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}
                            >
                              Connect
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )
      })}

      {/* Connect Modal */}
      {connectModal && (
        <IntegrationConnectModal
          integrationId={connectModal.id}
          integrationName={connectModal.name}
          onConnect={(creds, webhookUrl) => handleConnect(connectModal, creds, webhookUrl)}
          onClose={handleCloseConnectModal}
        />
      )}

      {/* Configure Modal */}
      {configureModal && (
        <IntegrationConfigureModal
          config={configureModal.config}
          integrationName={configureModal.def.name}
          onSave={(settings, credentials) => handleSaveConfig(configureModal.config.integration_id, settings, credentials)}
          onClose={() => setConfigureModal(null)}
        />
      )}
    </div>
    </IssueContextProvider>
  )
}
