import { useState, useEffect } from 'react'
import MusicLoader from '../shared/MusicLoader'
import { supabase } from '../../lib/supabase'
import { useChangeBlockType } from '../../hooks/useScheduleGrid'
import type { GridBlock } from '../../hooks/useScheduleGrid'

interface Props {
  block: GridBlock
  onClose: () => void
  onComplete: (reverted: number) => void
}

export default function LastDayConfirmModal({ block, onClose, onComplete }: Props) {
  const [futureCount, setFutureCount] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const changeType = useChangeBlockType()

  useEffect(() => {
    let cancelled = false
    supabase.rpc('count_last_day_revert', { p_block_id: block.block_id })
      .then(({ data, error }) => {
        if (cancelled) return
        if (!error) setFutureCount(data as number)
        setLoading(false)
      })
    return () => { cancelled = true }
  }, [block.block_id])

  const handleConfirm = async () => {
    try {
      const result = await changeType.mutateAsync({
        blockId: block.block_id,
        blockType: 'last_day',
        runLastDayRevert: true,
      })
      onComplete(result?.reverted ?? 0)
    } catch {
      // Error handled by mutation
    }
  }

  const dayName = new Date(block.block_date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long' })
  const dateStr = new Date(block.block_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 420 }}>
        <div className="modal-header">
          <h2 style={{ color: '#EF4444' }}>Set as Last Day</h2>
          <button className="btn-ghost" onClick={onClose}>✕</button>
        </div>
        <div className="modal-form">
          <div className="lastday-context">
            <strong>{block.student_name}</strong> with <strong>{block.teacher_name}</strong>
            <br />{dayName}, {dateStr}
          </div>

          {loading ? (
            <div style={{ textAlign: 'center', padding: '16px' }}>
              <div style={{ margin: '0 auto', width: 18 }}><MusicLoader /></div>
            </div>
          ) : (
            <div className="lastday-warning">
              <div className="lastday-warning-icon">Warning</div>
              <div>
                <p>
                  Setting this as <strong style={{ color: '#EF4444' }}>Last Day</strong> will revert{' '}
                  <strong>{futureCount}</strong> future block{futureCount !== 1 ? 's' : ''} in this series
                  back to <strong style={{ color: 'var(--green)' }}>Open Time</strong>.
                </p>
                <p className="text-dim" style={{ fontSize: '11px', marginTop: '8px' }}>
                  All future {dayName} blocks at this time for {block.student_name} will become available for booking.
                  This cannot be undone.
                </p>
              </div>
            </div>
          )}

          <div className="modal-actions">
            <button className="btn-ghost" onClick={onClose}>Cancel</button>
            <button
              className="btn-primary"
              style={{ background: '#EF4444' }}
              onClick={handleConfirm}
              disabled={loading || changeType.isPending}
            >
              {changeType.isPending ? 'Reverting...' : `Set Last Day & Revert ${futureCount ?? 0} Blocks`}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
