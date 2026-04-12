import { useState, useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { ThumbsUp, ThumbsDown, Check } from 'lucide-react'
import { submitAiMessageFeedback } from '../../services/aiObservability'

type Props = {
  tenantId: string
  profileId: string
  assistantMessageId: string | null | undefined
  conversationId: string | null | undefined
}

/**
 * Thumbs + optional short comment on a persisted assistant message. No-ops if message id missing.
 */
export function ZiroAssistantFeedback({ tenantId, profileId, assistantMessageId, conversationId }: Props) {
  const qc = useQueryClient()
  const [comment, setComment] = useState('')
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const submit = useCallback(
    async (rating: -1 | 1) => {
      if (!assistantMessageId || saving) return
      setSaving(true)
      setErr(null)
      const res = await submitAiMessageFeedback({
        tenantId,
        profileId,
        messageId: assistantMessageId,
        conversationId: conversationId ?? null,
        rating,
        comment: comment.trim() || null,
      })
      setSaving(false)
      if (!res.ok) {
        setErr(res.error ?? 'Could not save')
        return
      }
      setDone(true)
      void qc.invalidateQueries({ queryKey: ['ai-observability'] })
    },
    [assistantMessageId, comment, conversationId, profileId, qc, saving, tenantId],
  )

  if (!assistantMessageId) return null

  if (done) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6 }}>
        <Check size={12} style={{ color: '#22C55E' }} />
        <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)' }}>Thanks for the feedback</span>
      </div>
    )
  }

  return (
    <div style={{ marginTop: 8, maxWidth: 300 }}>
      <input
        type="text"
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        placeholder="Optional note"
        maxLength={500}
        disabled={saving}
        style={{
          width: '100%',
          marginBottom: 6,
          padding: '6px 8px',
          borderRadius: 6,
          fontSize: 11,
          background: 'rgba(0,0,0,0.2)',
          border: '1px solid rgba(255,255,255,0.08)',
          color: '#e0e0f0',
          boxSizing: 'border-box',
        }}
      />
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)' }}>Helpful?</span>
        <button
          type="button"
          disabled={saving}
          onClick={() => void submit(1)}
          title="Thumbs up"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            padding: '4px 10px',
            borderRadius: 6,
            fontSize: 11,
            border: '1px solid rgba(255,255,255,0.1)',
            background: 'rgba(255,255,255,0.04)',
            color: 'rgba(255,255,255,0.55)',
            cursor: saving ? 'wait' : 'pointer',
          }}
        >
          <ThumbsUp size={12} style={{ marginRight: 4 }} />
          Yes
        </button>
        <button
          type="button"
          disabled={saving}
          onClick={() => void submit(-1)}
          title="Thumbs down"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            padding: '4px 10px',
            borderRadius: 6,
            fontSize: 11,
            border: '1px solid rgba(255,255,255,0.1)',
            background: 'rgba(255,255,255,0.04)',
            color: 'rgba(255,255,255,0.55)',
            cursor: saving ? 'wait' : 'pointer',
          }}
        >
          <ThumbsDown size={12} style={{ marginRight: 4 }} />
          No
        </button>
      </div>
      {err && <div style={{ fontSize: 10, color: '#f87171', marginTop: 4 }}>{err}</div>}
    </div>
  )
}
