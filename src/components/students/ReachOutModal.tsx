import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useMarkFollowupSent, useDismissFollowup, type StudentFollowup } from '../../hooks/useRetention'
import { useAuthContext } from '../../app/AuthContext'
import { supabase } from '../../lib/supabase'
import { toast } from '../shared/Toast'
import { X, Copy, Send, Star } from 'lucide-react'

interface Props {
  followup: StudentFollowup
  onClose: () => void
}

export default function ReachOutModal({ followup, onClose }: Props) {
  const { tenantId } = useAuthContext()
  const markSent = useMarkFollowupSent()
  const dismiss = useDismissFollowup()
  const [draft, setDraft] = useState(followup.ai_draft ?? '')
  const [generating, setGenerating] = useState(false)

  // Auto-generate AI draft on open
  useEffect(() => {
    if (draft) return
    generateDraft()
  }, [])

  const generateDraft = async () => {
    setGenerating(true)
    try {
      const { data: sessionData } = await supabase.auth.getSession()
      const token = sessionData.session?.access_token

      const pausedMonths = followup.paused_at
        ? Math.round((Date.now() - new Date(followup.paused_at).getTime()) / (30 * 24 * 60 * 60 * 1000))
        : null

      const context = [
        `Student: ${followup.student_name}`,
        `Instrument: ${followup.student_instrument}`,
        `Location: ${followup.location_name}`,
        `Parent: ${followup.parent_name}`,
        pausedMonths ? `Paused ${pausedMonths} month${pausedMonths !== 1 ? 's' : ''} ago` : null,
        followup.pause_reason ? `Reason for leaving: ${followup.pause_reason}` : null,
        followup.notes ? `Additional context: ${followup.notes}` : null,
        followup.followup_date ? `Expected follow-up: ${new Date(followup.followup_date + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}` : null,
      ].filter(Boolean).join('\n')

      const res = await fetch(
        `https://dhsyxyhtoadrqfrlmsqe.supabase.co/functions/v1/ai-assistant`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({
            question: `Write a re-engagement message for this paused student. Context:\n\n${context}`,
            tenant_id: tenantId,
            conversation_history: [],
            system_override: 'You are writing a warm, professional re-engagement message for a music school. The student paused sessions and this is a follow-up to check if they are ready to come back. Keep it brief (3-4 sentences max), personal, and low-pressure. Do not sound like a marketing email. Sound like a human who genuinely cares. Reference the instrument and timeframe naturally. Write the message only — no subject line, no sign-off, just the body text.',
          }),
        }
      )
      const data = await res.json()
      if (data.answer) {
        setDraft(data.answer)
        // Save draft to followup record
        await supabase.from('student_followups').update({ ai_draft: data.answer }).eq('id', followup.id)
      }
    } catch {
      setDraft('Hi — we wanted to check in and see how things are going. We miss having your student here and would love to welcome them back whenever the time is right. Let us know if you have any questions!')
    }
    setGenerating(false)
  }

  const handleCopy = () => {
    navigator.clipboard.writeText(draft)
    toast('Message copied', 'success')
  }

  const handleMarkSent = async () => {
    try {
      await markSent.mutateAsync(followup.id)
      toast('Marked as sent', 'success')
      onClose()
    } catch (err: any) { toast(err.message ?? 'Failed', 'error') }
  }

  const handleDismiss = async () => {
    try {
      await dismiss.mutateAsync(followup.id)
      toast('Follow-up dismissed', 'success')
      onClose()
    } catch (err: any) { toast(err.message ?? 'Failed', 'error') }
  }

  const pausedMonths = followup.paused_at
    ? Math.round((Date.now() - new Date(followup.paused_at).getTime()) / (30 * 24 * 60 * 60 * 1000))
    : null

  return createPortal(
    <div style={{ position: 'fixed', inset: 0, zIndex: 10000, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{
        width: '100%', maxWidth: 560, maxHeight: '90vh', overflow: 'auto',
        background: '#141224', borderRadius: 20, border: '1px solid rgba(212,34,106,0.15)',
        boxShadow: '0 0 60px rgba(212,34,106,0.08), 0 24px 60px rgba(0,0,0,0.5)',
      }}>
        <div style={{ height: 3, background: 'linear-gradient(90deg, #D4226A, #7B2CBF)', borderRadius: '20px 20px 0 0' }} />
        <div style={{ padding: '24px 28px 28px' }}>
          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
            <div>
              <div style={{ fontSize: 18, fontWeight: 800, color: '#E0E0F4' }}>Reach Out — {followup.student_name}</div>
              <div style={{ fontSize: 12, color: '#A0A0C8', marginTop: 2 }}>
                {followup.student_instrument ? followup.student_instrument.charAt(0).toUpperCase() + followup.student_instrument.slice(1) : ''} · {followup.location_name}
              </div>
            </div>
            <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, padding: 6, cursor: 'pointer', color: '#8080A8' }}><X size={16} /></button>
          </div>

          {/* Context */}
          <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 10, padding: 12, marginBottom: 16, fontSize: 12, color: '#A0A0C8', lineHeight: 1.6 }}>
            {pausedMonths != null && <div>Paused <strong style={{ color: '#C0C0E0' }}>{pausedMonths} month{pausedMonths !== 1 ? 's' : ''} ago</strong></div>}
            {followup.pause_reason && <div>Reason: <strong style={{ color: '#C0C0E0' }}>{followup.pause_reason}</strong></div>}
            <div>Contact: <strong style={{ color: '#C0C0E0' }}>{followup.parent_name}</strong> · {followup.parent_email} · {followup.parent_phone}</div>
          </div>

          {/* AI Draft */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, fontSize: 11, fontWeight: 700, color: '#FFB800' }}>
              <Star size={11} /> AI Draft
            </div>
            {generating ? (
              <div style={{ padding: 16, textAlign: 'center', color: '#8080A8', fontSize: 13 }}>Generating message...</div>
            ) : (
              <textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={5} style={{
                width: '100%', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: 10, padding: '12px 14px', color: '#E0E0F4', fontSize: 13, resize: 'vertical',
                fontFamily: 'inherit', lineHeight: 1.6,
              }} />
            )}
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button onClick={() => toast('QUO SMS coming soon', 'info')} className="btn-outline" style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 5, opacity: 0.5 }}>
              <Send size={11} /> Send via QUO
            </button>
            <button onClick={handleCopy} className="btn-outline" style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 5 }}>
              <Copy size={11} /> Copy Message
            </button>
            <button onClick={handleMarkSent} className="btn-outline" style={{ fontSize: 12, color: '#22C55E', borderColor: 'rgba(34,197,94,0.3)' }}>
              Mark as Sent
            </button>
            <button onClick={handleDismiss} className="btn-ghost" style={{ fontSize: 12, marginLeft: 'auto' }}>
              Dismiss
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  )
}
