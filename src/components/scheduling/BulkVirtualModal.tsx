import { useState } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '../../lib/supabase'
import { EDGE_FUNCTIONS } from '../../lib/config'
import { safeFetch } from '../../lib/safeFetch'
import { sendAppointmentNotification, buildBlockContext } from '../../lib/appointmentNotifications'
import { toast } from '../shared/Toast'
import { Video, Check, X, AlertTriangle } from 'lucide-react'
import type { GridBlock } from '../../hooks/useScheduleGrid'
import { instrumentWithEmojiTitle } from '../../utils/instrumentEmoji'

function formatTime(t: string) {
  const [h, m] = t.split(':')
  const hour = parseInt(h)
  const ampm = hour >= 12 ? 'pm' : 'am'
  const display = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour
  return `${display}:${m}${ampm}`
}

interface Props {
  blocks: GridBlock[]
  date: string
  tenantId: string
  onClose: () => void
}

export default function BulkVirtualModal({ blocks, date, tenantId, onClose }: Props) {
  const bookedBlocks = blocks
    .filter(b => b.status === 'booked' && b.student_id && !b.is_virtual)
    .sort((a, b) => a.start_time.localeCompare(b.start_time))

  const [selected, setSelected] = useState<Set<string>>(new Set(bookedBlocks.map(b => b.block_id)))
  const [step, setStep] = useState<'select' | 'confirm' | 'processing' | 'done'>('select')
  const [results, setResults] = useState<Record<string, 'success' | 'error' | 'pending'>>({})
  const [errorMsgs, setErrorMsgs] = useState<Record<string, string>>({})

  const toggle = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  const dateDisplay = new Date(date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
  const selectedCount = selected.size

  const handleConvert = async () => {
    setStep('processing')
    const init: Record<string, 'pending'> = {}
    selected.forEach(id => { init[id] = 'pending' })
    setResults(init)

    const user = (await supabase.auth.getUser()).data.user
    let successCount = 0

    for (const blockId of selected) {
      try {
        const result = await safeFetch<{ success?: boolean; error?: string; meet_link?: string }>(
          EDGE_FUNCTIONS.createGoogleMeet,
          { body: { block_id: blockId, tenant_id: tenantId, user_id: user?.id } },
        )
        if (!result.success) throw new Error(result.error)

        // Send virtual notification
        const ctx = await buildBlockContext(blockId)
        if (ctx) {
          sendAppointmentNotification('virtual_converted', { ...ctx, meet_link: result.meet_link })
        }

        setResults(prev => ({ ...prev, [blockId]: 'success' }))
        successCount++
      } catch (err: any) {
        setResults(prev => ({ ...prev, [blockId]: 'error' }))
        setErrorMsgs(prev => ({ ...prev, [blockId]: err.message || 'Failed' }))
      }
    }

    setStep('done')
    if (successCount > 0) {
      toast(`${successCount} session${successCount !== 1 ? 's' : ''} converted to virtual`, 'success')
    }
  }

  const failedIds = Object.entries(results).filter(([, s]) => s === 'error').map(([id]) => id)

  const retryFailed = async () => {
    setStep('processing')
    const user = (await supabase.auth.getUser()).data.user

    for (const blockId of failedIds) {
      setResults(prev => ({ ...prev, [blockId]: 'pending' }))
      try {
        const result = await safeFetch<{ success?: boolean; error?: string; meet_link?: string }>(
          EDGE_FUNCTIONS.createGoogleMeet,
          { body: { block_id: blockId, tenant_id: tenantId, user_id: user?.id } },
        )
        if (!result.success) throw new Error(result.error)
        const ctx = await buildBlockContext(blockId)
        if (ctx) sendAppointmentNotification('virtual_converted', { ...ctx, meet_link: result.meet_link })
        setResults(prev => ({ ...prev, [blockId]: 'success' }))
      } catch (err: any) {
        setResults(prev => ({ ...prev, [blockId]: 'error' }))
        setErrorMsgs(prev => ({ ...prev, [blockId]: err.message || 'Failed' }))
      }
    }
    setStep('done')
  }

  return createPortal(
    <div style={{ position: 'fixed', inset: 0, zIndex: 10000, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, backdropFilter: 'blur(2px)' }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 520, maxHeight: '85vh', overflow: 'auto', background: '#141224', borderRadius: 20, border: '1px solid rgba(0,188,212,0.2)', boxShadow: '0 24px 60px rgba(0,0,0,0.6)' }}>
        <div style={{ height: 3, background: 'linear-gradient(90deg, #00BCD4, #0097A7)', borderRadius: '20px 20px 0 0' }} />
        <div style={{ padding: '20px 24px' }}>

          {/* Step 1: Select */}
          {step === 'select' && (<>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
              <div style={{ fontSize: 18, fontWeight: 800, color: '#E0E0F4' }}>Convert Day to Virtual Sessions</div>
              <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#8080A8', cursor: 'pointer' }}><X size={18} /></button>
            </div>
            <div style={{ fontSize: 13, color: '#8080A8', marginBottom: 16 }}>{dateDisplay} — Select sessions to convert</div>

            {bookedBlocks.length === 0 ? (
              <div style={{ padding: 24, textAlign: 'center', color: '#606088' }}>No booked sessions to convert today.</div>
            ) : (<>
              <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                <button onClick={() => setSelected(new Set(bookedBlocks.map(b => b.block_id)))} style={{ padding: '5px 12px', borderRadius: 7, fontSize: 11, fontWeight: 600, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#A0A0C8', cursor: 'pointer' }}>Select All</button>
                <button onClick={() => setSelected(new Set())} style={{ padding: '5px 12px', borderRadius: 7, fontSize: 11, fontWeight: 600, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#A0A0C8', cursor: 'pointer' }}>Deselect All</button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 16 }}>
                {bookedBlocks.map(b => (
                  <label key={b.block_id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 10, background: selected.has(b.block_id) ? 'rgba(0,188,212,0.06)' : 'rgba(255,255,255,0.02)', border: `1px solid ${selected.has(b.block_id) ? 'rgba(0,188,212,0.2)' : 'rgba(255,255,255,0.04)'}`, cursor: 'pointer' }}>
                    <input type="checkbox" checked={selected.has(b.block_id)} onChange={() => toggle(b.block_id)} style={{ accentColor: '#00BCD4', width: 18, height: 18 }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: '#E0E0F4' }}>
                        {formatTime(b.start_time)} — {b.student_name} ({instrumentWithEmojiTitle(b.instrument)})
                      </div>
                      <div style={{ fontSize: 11, color: '#8080A8' }}>Teacher: {b.teacher_name}</div>
                    </div>
                  </label>
                ))}
              </div>

              <button
                disabled={selectedCount === 0}
                onClick={() => setStep('confirm')}
                style={{ width: '100%', padding: '13px 16px', borderRadius: 12, background: selectedCount > 0 ? '#00BCD4' : '#606088', border: 'none', color: '#fff', fontWeight: 700, fontSize: 14, cursor: selectedCount > 0 ? 'pointer' : 'not-allowed', opacity: selectedCount > 0 ? 1 : 0.5, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
              >
                <Video size={16} /> Convert {selectedCount} Session{selectedCount !== 1 ? 's' : ''} →
              </button>
            </>)}
          </>)}

          {/* Step 2: Confirm */}
          {step === 'confirm' && (<>
            <div style={{ fontSize: 18, fontWeight: 800, color: '#E0E0F4', marginBottom: 12 }}>Final Confirmation</div>
            <div style={{ padding: '14px 16px', borderRadius: 12, background: 'rgba(255,184,0,0.06)', border: '1px solid rgba(255,184,0,0.15)', marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                <AlertTriangle size={18} style={{ color: '#FFB800', flexShrink: 0, marginTop: 2 }} />
                <div style={{ fontSize: 13, color: '#C0C0E0', lineHeight: 1.5 }}>
                  You're about to convert <strong>{selectedCount} session{selectedCount !== 1 ? 's' : ''}</strong> to Google Meet virtual sessions for <strong>{dateDisplay}</strong>. Meet links will be generated and sent to all selected teachers and parents immediately.
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setStep('select')} style={{ flex: 1, padding: '12px 16px', borderRadius: 10, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#8080A8', fontWeight: 600, fontSize: 13, cursor: 'pointer', minHeight: 44 }}>Go Back</button>
              <button onClick={handleConvert} style={{ flex: 1, padding: '12px 16px', borderRadius: 10, background: '#00BCD4', border: 'none', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer', minHeight: 44 }}>Convert {selectedCount} Sessions</button>
            </div>
          </>)}

          {/* Step 3: Processing */}
          {step === 'processing' && (<>
            <div style={{ fontSize: 18, fontWeight: 800, color: '#E0E0F4', marginBottom: 16 }}>Converting...</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {bookedBlocks.filter(b => selected.has(b.block_id)).map(b => {
                const status = results[b.block_id]
                return (
                  <div key={b.block_id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 8, background: 'rgba(255,255,255,0.02)' }}>
                    {status === 'success' ? <Check size={14} style={{ color: '#22C55E' }} /> :
                     status === 'error' ? <X size={14} style={{ color: '#EF4444' }} /> :
                     <div style={{ width: 14, height: 14, borderRadius: '50%', border: '2px solid #00BCD4', borderTopColor: 'transparent', animation: 'spin 1s linear infinite' }} />}
                    <span style={{ fontSize: 12, color: '#C0C0E0', flex: 1 }}>{formatTime(b.start_time)} — {b.student_name}</span>
                    {status === 'error' && <span style={{ fontSize: 10, color: '#EF4444' }}>{errorMsgs[b.block_id]}</span>}
                  </div>
                )
              })}
            </div>
          </>)}

          {/* Step 4: Done */}
          {step === 'done' && (<>
            <div style={{ fontSize: 18, fontWeight: 800, color: '#22C55E', marginBottom: 8 }}>
              {Object.values(results).filter(s => s === 'success').length} session{Object.values(results).filter(s => s === 'success').length !== 1 ? 's' : ''} converted
            </div>
            {failedIds.length > 0 && (
              <div style={{ fontSize: 13, color: '#EF4444', marginBottom: 12 }}>{failedIds.length} failed — tap to retry.</div>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 16 }}>
              {bookedBlocks.filter(b => selected.has(b.block_id)).map(b => {
                const status = results[b.block_id]
                return (
                  <div key={b.block_id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 8, background: status === 'success' ? 'rgba(34,197,94,0.04)' : 'rgba(239,68,68,0.04)' }}>
                    {status === 'success' ? <Check size={14} style={{ color: '#22C55E' }} /> : <X size={14} style={{ color: '#EF4444' }} />}
                    <span style={{ fontSize: 12, color: '#C0C0E0', flex: 1 }}>{formatTime(b.start_time)} — {b.student_name}</span>
                  </div>
                )
              })}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              {failedIds.length > 0 && (
                <button onClick={retryFailed} style={{ flex: 1, padding: '12px 16px', borderRadius: 10, background: '#EF4444', border: 'none', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer', minHeight: 44 }}>Retry {failedIds.length} Failed</button>
              )}
              <button onClick={onClose} style={{ flex: 1, padding: '12px 16px', borderRadius: 10, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#8080A8', fontWeight: 600, fontSize: 13, cursor: 'pointer', minHeight: 44 }}>Close</button>
            </div>
          </>)}
        </div>
      </div>
    </div>,
    document.body
  )
}
