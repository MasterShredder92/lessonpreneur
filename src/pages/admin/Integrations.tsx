import { useState } from 'react'
import { Calendar, Video, Mail, HardDrive, Users, Phone, CreditCard, Zap, FileSignature, Megaphone, MessageSquare, Globe, Webhook, Code, ChevronDown, Search } from 'lucide-react'
import { toast } from '../../components/shared/Toast'
import { useIntegrations, useConnectIntegration, useDisconnectIntegration, useToggleIntegration, useUpdateIntegrationSettings } from '../../hooks/useIntegrations'
import IntegrationConnectModal from '../../components/admin/IntegrationConnectModal'
import IntegrationConfigureModal from '../../components/admin/IntegrationConfigureModal'
import type { IntegrationConfig } from '../../hooks/useIntegrations'
import { IssueContextProvider } from '../../contexts/IssueContext'
import ReportIssueButton from '../../components/shared/ReportIssueButton'

// ─── Integration Data ───────────────────────────────

interface IntegrationDef {
  id: string
  name: string
  category: string
  description: string
  icon: string
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

const INTEGRATIONS: IntegrationDef[] = [
  // Google
  { id: 'google-calendar', name: 'Google Calendar', category: 'Google', description: 'Sync lesson schedules and teacher availability.', icon: 'calendar' },
  { id: 'google-meet', name: 'Google Meet', category: 'Google', description: 'Auto-generate virtual lesson links.', icon: 'video' },
  { id: 'gmail', name: 'Gmail', category: 'Google', description: 'Send notifications and confirmations via email.', icon: 'mail' },
  { id: 'google-drive', name: 'Google Drive', category: 'Google', description: 'Store and organize student documents.', icon: 'drive' },
  { id: 'google-contacts', name: 'Google Contacts', category: 'Google', description: 'Sync parent and student contact info.', icon: 'contacts' },
  // Communication
  { id: 'twilio', name: 'Twilio', category: 'Communication', description: 'Programmable SMS and voice for notifications.', icon: 'phone' },
  { id: 'zoom', name: 'Zoom', category: 'Communication', description: 'Host virtual lessons with auto-generated links.', icon: 'video' },
  { id: 'quo', name: 'QUO', category: 'Communication', description: 'Two-way SMS messaging with families.', icon: 'message' },
  { id: 'slack', name: 'Slack', category: 'Communication', description: 'Get real-time alerts and team notifications.', icon: 'message' },
  // Billing & Accounting
  { id: 'square', name: 'Square', category: 'Billing & Accounting', description: 'Card and invoice payments; Lessonpreneur owns schedules and billing rules.', icon: 'credit' },
  { id: 'stripe', name: 'Stripe', category: 'Billing & Accounting', description: 'Subscription billing and payment processing.', icon: 'credit' },
  { id: 'quickbooks', name: 'QuickBooks', category: 'Billing & Accounting', description: 'Sync revenue and expenses for accounting.', icon: 'credit' },
  // Automation Tools
  { id: 'zapier', name: 'Zapier', category: 'Automation Tools', description: 'Connect to 5,000+ apps with no-code automations.', icon: 'zap' },
  { id: 'make', name: 'Make', category: 'Automation Tools', description: 'Visual automation workflows for complex logic.', icon: 'zap' },
  { id: 'n8n', name: 'n8n', category: 'Automation Tools', description: 'Self-hosted automation with full control.', icon: 'zap' },
  { id: 'webhooks', name: 'Webhooks', category: 'Automation Tools', description: 'Push real-time events to external systems.', icon: 'webhook' },
  { id: 'custom-api', name: 'Custom API', category: 'Automation Tools', description: 'Build custom integrations with the LP API.', icon: 'code' },
  // Documents & Signatures
  { id: 'signwell', name: 'SignWell', category: 'Documents & Signatures', description: 'Send and track enrollment agreements.', icon: 'sign' },
  { id: 'docusign', name: 'DocuSign', category: 'Documents & Signatures', description: 'Electronic signatures for contracts and forms.', icon: 'sign' },
  // CRM & Marketing
  { id: 'meta-lead-ads', name: 'Meta Lead Ads', category: 'CRM & Marketing', description: 'Capture leads directly from Facebook and Instagram ads.', icon: 'megaphone' },
  { id: 'mailchimp', name: 'Mailchimp', category: 'CRM & Marketing', description: 'Email marketing campaigns and newsletters.', icon: 'mail' },
  { id: 'activecampaign', name: 'ActiveCampaign', category: 'CRM & Marketing', description: 'Advanced email automation and CRM sync.', icon: 'mail' },
]

const CATEGORIES = ['Google', 'Communication', 'Billing & Accounting', 'Automation Tools', 'Documents & Signatures', 'CRM & Marketing']

// ─── Component ──────────────────────────────────────

export default function Integrations() {
  const { data: configs = [], isLoading } = useIntegrations()
  const connectMut = useConnectIntegration()
  const disconnectMut = useDisconnectIntegration()
  const toggleMut = useToggleIntegration()
  const updateSettingsMut = useUpdateIntegrationSettings()

  const [search, setSearch] = useState('')
  const [collapsedCats, setCollapsedCats] = useState<Set<string>>(new Set())
  const [connectModal, setConnectModal] = useState<IntegrationDef | null>(null)
  const [configureModal, setConfigureModal] = useState<{ def: IntegrationDef; config: IntegrationConfig } | null>(null)

  // Build a lookup map for connected integrations
  const configMap = new Map<string, IntegrationConfig>()
  configs.forEach(c => configMap.set(c.integration_id, c))

  const getStatus = (id: string) => {
    const c = configMap.get(id)
    if (!c || c.status !== 'connected') return { connected: false, enabled: false }
    return { connected: true, enabled: c.enabled }
  }

  const connectedItems = INTEGRATIONS.filter(i => getStatus(i.id).connected)
  const filtered = search
    ? INTEGRATIONS.filter(i => i.name.toLowerCase().includes(search.toLowerCase()) || i.category.toLowerCase().includes(search.toLowerCase()))
    : INTEGRATIONS

  const toggleCat = (cat: string) => setCollapsedCats(prev => { const n = new Set(prev); if (n.has(cat)) n.delete(cat); else n.add(cat); return n })

  const handleConnect = async (def: IntegrationDef, credentials: Record<string, string>) => {
    await connectMut.mutateAsync({ integrationId: def.id, credentials })
    toast(`${def.name} connected`, 'success')
    setConnectModal(null)
  }

  const handleDisconnect = async (def: IntegrationDef) => {
    await disconnectMut.mutateAsync(def.id)
    toast(`${def.name} disconnected`, 'success')
  }

  const handleToggle = async (id: string, enabled: boolean) => {
    await toggleMut.mutateAsync({ integrationId: id, enabled })
  }

  const handleSaveConfig = async (integrationId: string, settings: Record<string, any>, credentials?: Record<string, any>) => {
    await updateSettingsMut.mutateAsync({ integrationId, settings, credentials })
    toast('Settings saved', 'success')
    setConfigureModal(null)
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
          {connectedItems.map(c => (
            <span key={c.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 10px', borderRadius: 999, fontSize: 11, fontWeight: 600, background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)', color: '#22C55E' }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#22C55E' }} />
              {c.name}
            </span>
          ))}
        </div>
      )}

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
            {/* Category header */}
            <button onClick={() => toggleCat(cat)} style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '8px 0', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#8080A8', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{cat}</span>
              <span style={{ fontSize: 10, color: '#606088' }}>{catConnected} of {catItems.length} connected</span>
              <div style={{ flex: 1 }} />
              <ChevronDown size={14} style={{ color: '#606088', transition: 'transform 200ms ease', transform: isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)' }} />
            </button>

            {/* Cards grid */}
            {!isCollapsed && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 10 }}>
                {catItems.map(item => {
                  const { connected: isConn, enabled } = getStatus(item.id)
                  const dbConfig = configMap.get(item.id)

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

                      {/* Icon + Name */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                        <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: isConn ? '#22C55E' : '#7070A0', flexShrink: 0 }}>
                          {ICON_MAP[item.icon] ?? <Zap size={20} />}
                        </div>
                        <div style={{ fontSize: 14, fontWeight: 600, color: '#E0E0F4' }}>{item.name}</div>
                      </div>

                      {/* Description */}
                      <div style={{ fontSize: 12, color: '#8080A8', lineHeight: 1.5, marginBottom: 12, minHeight: 36 }}>
                        {item.description}
                      </div>

                      {/* Status + Action */}
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ width: 8, height: 8, borderRadius: '50%', background: isConn ? (enabled ? '#22C55E' : '#FFB800') : '#606088' }} />
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
          onConnect={creds => handleConnect(connectModal, creds)}
          onClose={() => setConnectModal(null)}
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
