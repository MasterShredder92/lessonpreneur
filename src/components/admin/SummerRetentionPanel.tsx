import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useCampaignStats, useCampaignList, useGenerateWave1, type CampaignRow } from '../../hooks/useRetentionCampaigns'
import { toast } from '../shared/Toast'
import { ChevronDown, ChevronRight, Send, Eye, Clock } from 'lucide-react'

const WAVE_CONFIG = [
  { wave: 1, type: 'value_reinforcement', label: 'Value Reinforcement', dateRange: 'Apr 7-30', color: '#22C55E', description: 'Semester progress summaries — remind families how far their kids have come' },
  { wave: 2, type: 'summer_bridge', label: 'Summer Bridge', dateRange: 'May 1-31', color: '#3b82f6', description: 'Summer sessions messaging — reframe summer as an opportunity, not a break' },
  { wave: 3, type: 'return_incentive', label: 'Return Incentive', dateRange: 'Jun 1-Jul 15', color: '#fb923c', description: 'Win-back for paused families — "We saved your spot" messaging' },
]

export default function SummerRetentionPanel() {
  const { data: stats } = useCampaignStats()
  const generateWave1 = useGenerateWave1()
  const navigate = useNavigate()
  const [expanded, setExpanded] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [progress, setProgress] = useState({ done: 0, total: 0 })
  const [expandedWave, setExpandedWave] = useState<number | null>(null)

  const handleGenerateWave1 = async () => {
    if (generating) return
    if (!confirm('This will generate personalized semester progress summaries for all active students with session data. AI will process ~5 students per second. Continue?')) return
    setGenerating(true)
    setProgress({ done: 0, total: 0 })
    try {
      const result = await generateWave1.mutateAsync((done, total) => {
        setProgress({ done, total })
      })
      toast(`Wave 1 complete: ${result.generated} messages generated, ${result.skipped} skipped`, 'success')
    } catch (err: any) {
      toast(err.message ?? 'Generation failed', 'error')
    }
    setGenerating(false)
  }

  return (
    <div style={{ marginBottom: 28 }}>
      <div onClick={() => setExpanded(!expanded)} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', marginBottom: expanded ? 12 : 0 }}>
        {expanded ? <ChevronDown size={14} style={{ color: '#8080A8' }} /> : <ChevronRight size={14} style={{ color: '#8080A8' }} />}
        <span className="section-label" style={{ margin: 0 }}>Summer Retention Campaign</span>
        {stats && (stats.wave1.sent + stats.wave2.sent + stats.wave3.sent) > 0 && (
          <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 8px', borderRadius: 999, background: 'rgba(34,197,94,0.12)', color: '#22C55E' }}>
            {stats.wave1.sent + stats.wave2.sent + stats.wave3.sent} sent
          </span>
        )}
      </div>

      {expanded && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {WAVE_CONFIG.map(wave => {
            const waveStats = stats ? stats[`wave${wave.wave}` as keyof typeof stats] : { total: 0, sent: 0, read: 0, pending: 0 }
            const readRate = waveStats.sent > 0 ? ((waveStats.read / waveStats.sent) * 100).toFixed(0) : '0'
            const isActive = wave.wave === 1 // Wave 1 is active now
            const isExpandedWave = expandedWave === wave.wave

            return (
              <div key={wave.wave}>
                <div
                  onClick={() => setExpandedWave(isExpandedWave ? null : wave.wave)}
                  style={{
                    padding: '14px 16px', borderRadius: isExpandedWave ? '12px 12px 0 0' : 12,
                    background: 'rgba(255,255,255,0.02)', border: `1px solid ${wave.color}20`,
                    borderBottom: isExpandedWave ? 'none' : undefined,
                    borderLeft: `3px solid ${wave.color}`,
                    cursor: 'pointer',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                        <span style={{ fontSize: 14, fontWeight: 800, color: wave.color }}>Wave {wave.wave}: {wave.label}</span>
                        {isActive && waveStats.total === 0 && (
                          <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 8px', borderRadius: 6, background: `${wave.color}20`, color: wave.color }}>Ready to Launch</span>
                        )}
                        {waveStats.sent > 0 && (
                          <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 8px', borderRadius: 6, background: `${wave.color}20`, color: wave.color }}>Active</span>
                        )}
                      </div>
                      <div style={{ fontSize: 11, color: '#8080A8' }}>{wave.description}</div>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      {waveStats.total > 0 ? (
                        <>
                          <div style={{ fontSize: 18, fontWeight: 800, color: '#E0E0F4' }}>{waveStats.sent}</div>
                          <div style={{ fontSize: 10, color: '#8080A8' }}>sent · {readRate}% read</div>
                        </>
                      ) : (
                        <div style={{ fontSize: 10, color: '#606088' }}>{wave.dateRange}</div>
                      )}
                    </div>
                  </div>

                  {/* Generate button for Wave 1 */}
                  {wave.wave === 1 && waveStats.total === 0 && !generating && (
                    <button
                      onClick={(e) => { e.stopPropagation(); handleGenerateWave1() }}
                      style={{
                        marginTop: 10, padding: '10px 20px', borderRadius: 8,
                        background: wave.color, color: '#000', border: 'none',
                        fontSize: 13, fontWeight: 700, cursor: 'pointer',
                        boxShadow: `0 2px 12px ${wave.color}40`, width: '100%',
                      }}
                    >
                      Generate Semester Progress Summaries for All Students
                    </button>
                  )}

                  {/* Progress bar during generation */}
                  {generating && wave.wave === 1 && (
                    <div style={{ marginTop: 10 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#A0A0C8', marginBottom: 4 }}>
                        <span>Generating messages...</span>
                        <span>{progress.done} / {progress.total}</span>
                      </div>
                      <div style={{ height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.06)' }}>
                        <div style={{ height: '100%', borderRadius: 2, background: wave.color, width: `${progress.total > 0 ? (progress.done / progress.total) * 100 : 0}%`, transition: 'width 300ms ease' }} />
                      </div>
                    </div>
                  )}
                </div>

                {/* Expanded wave detail */}
                {isExpandedWave && waveStats.total > 0 && (
                  <WaveDetail wave={wave.wave} color={wave.color} />
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function WaveDetail({ wave, color }: { wave: number; color: string }) {
  const { data: campaigns } = useCampaignList(wave)
  const navigate = useNavigate()

  if (!campaigns) return <div style={{ padding: 12, color: '#606088', fontSize: 12 }}>Loading...</div>

  return (
    <div style={{
      padding: '12px 16px', borderRadius: '0 0 12px 12px',
      background: 'rgba(255,255,255,0.01)', border: `1px solid ${color}20`, borderTop: 'none',
      maxHeight: 300, overflowY: 'auto',
    }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {campaigns.slice(0, 50).map(c => (
          <div key={c.id} style={{
            display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', borderRadius: 6,
            background: 'rgba(255,255,255,0.02)',
          }}>
            {c.status === 'read' || c.status === 'actioned' ? (
              <Eye size={12} style={{ color: '#22C55E', flexShrink: 0 }} />
            ) : c.status === 'sent' ? (
              <Send size={12} style={{ color: '#3b82f6', flexShrink: 0 }} />
            ) : (
              <Clock size={12} style={{ color: '#606088', flexShrink: 0 }} />
            )}
            <span
              onClick={() => navigate(`/admin/students/${c.student_id}`)}
              style={{ fontSize: 12, color: '#E0E0F4', cursor: 'pointer', flex: 1 }}
            >
              {c.student_name}
            </span>
            <span style={{ fontSize: 10, color: '#606088' }}>{c.instrument ?? ''}</span>
            <span style={{ fontSize: 10, color: '#606088' }}>{c.location_name ?? ''}</span>
            <span style={{ fontSize: 9, color: c.status === 'read' ? '#22C55E' : c.status === 'sent' ? '#3b82f6' : '#606088' }}>
              {c.status}
            </span>
          </div>
        ))}
        {campaigns.length > 50 && (
          <div style={{ fontSize: 10, color: '#606088', textAlign: 'center', padding: 4 }}>+ {campaigns.length - 50} more</div>
        )}
      </div>
    </div>
  )
}
