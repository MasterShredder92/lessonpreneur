import { useEffect } from 'react'
import { useAuthContext } from '../../app/AuthContext'
import { useWorkflows, useToggleWorkflow, useSeedWorkflows, type Workflow } from '../../hooks/useWorkflows'
import { toast } from '../../components/shared/Toast'
import MusicLoader from '../../components/shared/MusicLoader'
import { Zap, Clock, Bell, FileText, CheckSquare } from 'lucide-react'
import { IssueContextProvider } from '../../contexts/IssueContext'
import ReportIssueButton from '../../components/shared/ReportIssueButton'

const TRIGGER_ICONS: Record<string, any> = { schedule: Clock, event: Zap, threshold: Bell }
const ACTION_ICONS: Record<string, any> = { send_communication: Bell, create_task: CheckSquare, send_notification: Bell, generate_report: FileText, update_record: Zap }
const TRIGGER_COLORS: Record<string, string> = { schedule: '#3b82f6', event: '#f59e0b', threshold: '#EF4444' }

export default function Workflows() {
  const { role } = useAuthContext()
  const { data: workflows, isLoading } = useWorkflows()
  const toggle = useToggleWorkflow()
  const seed = useSeedWorkflows()

  // Auto-seed pre-built workflows on first visit
  useEffect(() => {
    if (workflows && workflows.length === 0) seed.mutate()
  }, [workflows])

  if (role !== 'owner' && role !== 'admin') {
    return <div className="page" style={{ padding: 40, textAlign: 'center', color: '#8080A8' }}>Access restricted.</div>
  }

  const handleToggle = async (wf: Workflow) => {
    try {
      await toggle.mutateAsync({ id: wf.id, enabled: !wf.enabled })
      toast(`${wf.name} ${wf.enabled ? 'disabled' : 'enabled'}`, 'success')
    } catch (err: any) { toast(err.message ?? 'Failed', 'error') }
  }

  const activeCount = (workflows ?? []).filter(w => w.enabled).length

  return (
    <IssueContextProvider page="AI Workflows">
    <div className="page">
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Zap size={18} style={{ color: '#f59e0b' }} />
          <h1>AI Workflows</h1>
        </div>
        <span style={{ fontSize: 12, color: '#8080A8', marginLeft: 12 }}>{activeCount} active</span>
        <ReportIssueButton />
      </div>

      <div style={{ fontSize: 13, color: '#8080A8', marginBottom: 24, maxWidth: 600 }}>
        Autonomous workflows that run in the background — creating tasks, sending messages, and surfacing insights without you lifting a finger.
      </div>

      {isLoading ? <MusicLoader /> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {(workflows ?? []).map(wf => {
            const TriggerIcon = TRIGGER_ICONS[wf.trigger_type] ?? Zap
            const ActionIcon = ACTION_ICONS[wf.action_type] ?? Zap
            const triggerColor = TRIGGER_COLORS[wf.trigger_type] ?? '#f59e0b'

            return (
              <div key={wf.id} style={{
                padding: '16px 20px', borderRadius: 12,
                background: wf.enabled ? 'rgba(255,255,255,0.02)' : 'rgba(255,255,255,0.01)',
                border: `1px solid ${wf.enabled ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.03)'}`,
                opacity: wf.enabled ? 1 : 0.6,
                borderLeft: `3px solid ${wf.enabled ? triggerColor : '#363656'}`,
              }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <span style={{ fontSize: 15, fontWeight: 700, color: '#E0E0F4' }}>{wf.name}</span>
                      <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 8px', borderRadius: 6, background: `${triggerColor}18`, color: triggerColor }}>
                        {wf.trigger_type}
                      </span>
                    </div>
                    <div style={{ fontSize: 12, color: '#8080A8', marginBottom: 8 }}>{wf.description}</div>
                    <div style={{ display: 'flex', gap: 16, fontSize: 11, color: '#606088' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <TriggerIcon size={11} /> {wf.trigger_config?.label ?? wf.trigger_type}
                      </span>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <ActionIcon size={11} /> {wf.action_type.replace(/_/g, ' ')}
                      </span>
                      {wf.last_run_at && (
                        <span>Last: {new Date(wf.last_run_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                      )}
                      {wf.run_count > 0 && <span>{wf.run_count} runs</span>}
                    </div>
                  </div>
                  {/* Toggle */}
                  <button onClick={() => handleToggle(wf)} style={{
                    width: 44, height: 24, borderRadius: 12, border: 'none', cursor: 'pointer',
                    background: wf.enabled ? '#22C55E' : 'rgba(255,255,255,0.1)',
                    position: 'relative', transition: 'background 200ms',
                  }}>
                    <div style={{
                      width: 18, height: 18, borderRadius: 9, background: '#fff',
                      position: 'absolute', top: 3, left: wf.enabled ? 23 : 3,
                      transition: 'left 200ms', boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
                    }} />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
    </IssueContextProvider>
  )
}
