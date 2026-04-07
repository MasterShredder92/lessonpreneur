import { useState, useEffect } from 'react'
import MusicLoader from '../shared/MusicLoader'
import { supabase } from '../../lib/supabase'
import { useChangeBlockType } from '../../hooks/useScheduleGrid'
import type { GridBlock } from '../../hooks/useScheduleGrid'

interface Props {
  block: GridBlock
  onClose: () => void
  onComplete: (locked: number) => void
}

export default function FirstDayConfirmModal({ block, onClose, onComplete }: Props) {
  const [priorCount, setPriorCount] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const changeType = useChangeBlockType()

  useEffect(() => {
    let cancelled = false
    supabase.rpc('count_first_day_notbookable', { p_block_id: block.block_id })
      .then(({ data, error }) => {
        if (cancelled) return
        if (!error) setPriorCount(data as number)
        setLoading(false)
      })
    return () => { cancelled = true }
  }, [block.block_id])

  const handleConfirm = async () => {
    try {
      const result = await changeType.mutateAsync({
        blockId: block.block_id,
        blockType: 'first_day',
        runFirstDayLock: true,
      })
      onComplete(result?.locked ?? 0)
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
          <h2 style={{ color: '#3B82F6' }}>Set as First Day</h2>
          <button className="btn-ghost" onClick={onClose}>✕</button>
        </div>
        <div className="modal-form">
          <div className="firstday-context">
            <strong>{block.student_name}</strong> with <strong>{block.teacher_name}</strong>
            <br />{dayName}, {dateStr}
          </div>

          {loading ? (
            <div style={{ textAlign: 'center', padding: '16px' }}>
              <div style={{ margin: '0 auto', width: 18 }}><MusicLoader /></div>
            </div>
          ) : (
            <>
              {(priorCount ?? 0) > 0 && (
                <div className="firstday-warning">
                  <div className="firstday-warning-icon">Locked</div>
                  <div>
                    <p>
                      Setting this as <strong style={{ color: '#3B82F6' }}>First Day</strong> will lock{' '}
                      <strong>{priorCount}</strong> prior open slot{priorCount !== 1 ? 's' : ''} as{' '}
                      <strong>Not Bookable</strong> to prevent accidental double-booking.
                    </p>
                    <p className="text-dim" style={{ fontSize: '11px', marginTop: '8px' }}>
                      All prior {dayName} open slots at this time for this teacher will be locked.
                    </p>
                  </div>
                </div>
              )}

              {(priorCount ?? 0) === 0 && (
                <div className="firstday-info">
                  No prior open slots to lock — this is the first available date in the series.
                </div>
              )}

              <div className="firstday-info">
                <span style={{ color: '#3B82F6' }}>ℹ</span>{' '}
                Contract and app invite will be sent automatically when messaging is enabled.
              </div>
            </>
          )}

          <div className="modal-actions">
            <button className="btn-ghost" onClick={onClose}>Cancel</button>
            <button
              className="btn-primary"
              style={{ background: '#3B82F6' }}
              onClick={handleConfirm}
              disabled={loading || changeType.isPending}
            >
              {changeType.isPending ? 'Setting...' : priorCount
                ? `Set First Day & Lock ${priorCount} Slot${priorCount !== 1 ? 's' : ''}`
                : 'Set First Day'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
