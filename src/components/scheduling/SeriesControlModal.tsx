import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useQueryClient } from '@tanstack/react-query'

interface Props {
  blockId: string
  action: 'delete' | 'unassign'
  studentName?: string | null
  teacherName?: string
  time?: string
  dayOfWeek?: string
  onClose: () => void
  onComplete: () => void
}

export default function SeriesControlModal({ blockId, action, studentName, teacherName, time, dayOfWeek, onClose, onComplete }: Props) {
  const qc = useQueryClient()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const actionLabel = action === 'delete' ? 'Delete' : 'Remove student from'
  const actionVerb = action === 'delete' ? 'delete' : 'unassign'

  const handleAction = async (scope: 'single' | 'future' | 'all') => {
    setLoading(true)
    setError(null)

    try {
      const fnName = scope === 'single' ? 'block_series_single'
        : scope === 'future' ? 'block_series_future'
        : 'block_series_all'

      const { data, error: rpcErr } = await supabase.rpc(fnName, {
        p_block_id: blockId,
        p_action: actionVerb,
      })

      if (rpcErr) throw rpcErr

      // Invalidate all relevant caches
      qc.invalidateQueries({ queryKey: ['schedule-grid'] })
      qc.invalidateQueries({ queryKey: ['schedule-intelligence'] })
      qc.invalidateQueries({ queryKey: ['student-blocks'] })
      qc.invalidateQueries({ queryKey: ['students'] })
      qc.invalidateQueries({ queryKey: ['teacher-blocks'] })

      onComplete()
    } catch (err: any) {
      setError(err.message ?? 'Operation failed.')
      setLoading(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 440 }}>
        <div className="modal-header">
          <h2>{action === 'delete' ? 'Delete Block' : 'Remove Student'}</h2>
          <button className="btn-ghost" onClick={onClose}>✕</button>
        </div>
        <div className="modal-form">
          <div className="series-context">
            <p style={{ fontSize: '13px', marginBottom: '8px' }}>
              This is a <strong>recurring</strong> block{studentName ? ` for ${studentName}` : ''}{teacherName ? ` with ${teacherName}` : ''}{dayOfWeek ? ` on ${dayOfWeek}s` : ''}{time ? ` at ${time}` : ''}.
            </p>
            <p className="text-muted" style={{ fontSize: '13px' }}>
              How should this change apply to the series?
            </p>
          </div>

          <div className="series-options">
            <button
              className="series-option"
              onClick={() => handleAction('single')}
              disabled={loading}
            >
              <strong>Just this one</strong>
              <span className="text-muted">{actionLabel} only the selected date. All other instances remain.</span>
            </button>

            <button
              className="series-option"
              onClick={() => handleAction('future')}
              disabled={loading}
            >
              <strong>This and all future</strong>
              <span className="text-muted">{actionLabel} this block and every future instance. Past blocks remain.</span>
            </button>

            <button
              className="series-option series-option-danger"
              onClick={() => handleAction('all')}
              disabled={loading}
            >
              <strong>Entire series</strong>
              <span style={{ color: '#ef4444', fontSize: '11px' }}>
                This will {actionVerb === 'delete' ? 'remove' : 'unassign'} all past and future blocks in this series and cannot be undone.
              </span>
            </button>
          </div>

          {error && <div className="form-error">{error}</div>}

          <div className="modal-actions">
            <button className="btn-ghost" onClick={onClose} disabled={loading}>Cancel</button>
          </div>
        </div>
      </div>
    </div>
  )
}
