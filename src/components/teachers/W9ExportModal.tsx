import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { useAuthContext } from '../../app/AuthContext'
import { toast } from '../shared/Toast'
import { X, Check, Download } from 'lucide-react'
import JSZip from 'jszip'
import PinModal from './PinModal'
import { qk } from '../../lib/queryKeys'

interface Props { onClose: () => void }

export default function W9ExportModal({ onClose }: Props) {
  const { profile } = useAuthContext()
  const [excluded, setExcluded] = useState<Set<string>>(new Set())
  const [exporting, setExporting] = useState(false)
  const [showPin, setShowPin] = useState(false)
  const [pinVerified, setPinVerified] = useState(false)

  // Fetch completed W-9s with teacher names and YTD
  const { data: w9s, isLoading } = useQuery({
    queryKey: qk.w9.exportList,
    queryFn: async () => {
      const { data } = await supabase
        .from('teacher_w9')
        .select('id, teacher_id, legal_name, signed_at, pdf_url')
        .order('legal_name')

      if (!data || data.length === 0) return []

      // Get teacher w9_status to filter only complete
      const teacherIds = [...new Set(data.map(w => w.teacher_id))]
      const { data: teachers } = await supabase
        .from('teachers')
        .select('id, w9_status')
        .in('id', teacherIds)
        .eq('w9_status', 'complete')
      const completeIds = new Set(teachers?.map(t => t.id) ?? [])

      // Get YTD earnings
      const yearStart = `${new Date().getFullYear()}-01-01`
      const { data: payroll } = await supabase
        .from('payroll_entries')
        .select('teacher_id, amount')
        .in('teacher_id', teacherIds)
        .gte('created_at', yearStart)

      const ytdMap = new Map<string, number>()
      payroll?.forEach((p: any) => ytdMap.set(p.teacher_id, (ytdMap.get(p.teacher_id) ?? 0) + (p.amount ?? 0)))

      // De-dupe by teacher_id (latest W-9 per teacher)
      const byTeacher = new Map<string, typeof data[0] & { ytd: number }>()
      data.forEach(w => {
        if (!completeIds.has(w.teacher_id)) return
        if (!byTeacher.has(w.teacher_id) || w.signed_at > (byTeacher.get(w.teacher_id)!.signed_at ?? '')) {
          byTeacher.set(w.teacher_id, { ...w, ytd: ytdMap.get(w.teacher_id) ?? 0 })
        }
      })

      return [...byTeacher.values()]
    },
  })

  const selected = useMemo(() => (w9s ?? []).filter(w => !excluded.has(w.teacher_id)), [w9s, excluded])

  async function handleExport() {
    if (selected.length === 0) { toast('No W-9s selected', 'error'); return }
    if (!pinVerified) { setShowPin(true); return }
    doExport()
  }

  async function doExport() {
    setExporting(true)
    try {
      const zip = new JSZip()
      let fetched = 0
      let failedCount = 0

      for (const w of selected) {
        if (!w.pdf_url) continue
        try {
          const res = await fetch(w.pdf_url)
          if (res.ok) {
            const blob = await res.blob()
            const safeName = w.legal_name.replace(/[^a-zA-Z0-9_-]/g, '_')
            zip.file(`W9_${safeName}.pdf`, blob)
            fetched++
          }
        } catch (err) {
          console.warn(`[W9Export] Failed to fetch PDF for teacher ${w.legal_name}:`, err)
          failedCount++
        }
      }

      if (fetched === 0) { toast('No PDFs could be downloaded', 'error'); setExporting(false); return }

      const zipBlob = await zip.generateAsync({ type: 'blob' })
      const dateStr = new Date().toISOString().slice(0, 10)
      const url = URL.createObjectURL(zipBlob)
      const a = document.createElement('a')
      a.href = url; a.download = `W9_Export_${dateStr}.zip`; a.click()
      URL.revokeObjectURL(url)

      toast(`${fetched} W-9s exported`, 'success')
      if (failedCount > 0) toast(`${failedCount} W-9 document(s) could not be downloaded`, 'error')
      onClose()
    } catch (err) {
      toast('Export failed', 'error')
    } finally {
      setExporting(false)
    }
  }

  if (showPin && profile) {
    return <PinModal profileId={profile.id} onSuccess={() => { setShowPin(false); setPinVerified(true); doExport() }} onClose={() => setShowPin(false)} />
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 10000, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={onClose}>
      <div style={{ width: '100%', maxWidth: 600, maxHeight: '80vh', background: 'rgba(20,18,36,0.97)', borderRadius: 20, border: '1px solid rgba(255,255,255,0.08)', boxShadow: '0 40px 100px rgba(0,0,0,0.6)', display: 'flex', flexDirection: 'column' }} onClick={e => e.stopPropagation()}>

        <div style={{ padding: '18px 24px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 800, color: '#E0E0F4' }}>Export W-9s</div>
            <div style={{ fontSize: 12, color: '#8080A8' }}>Download completed W-9 PDFs as a zip file</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#8080A8' }}><X size={20} /></button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 24px' }}>
          {isLoading ? (
            <div style={{ padding: 40, textAlign: 'center', color: '#606088' }}>Loading...</div>
          ) : !w9s || w9s.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: '#606088' }}>No completed W-9s to export.</div>
          ) : (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <span style={{ fontSize: 12, color: '#8080A8' }}>{selected.length} of {w9s.length} selected</span>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => setExcluded(new Set())} style={{ fontSize: 10, color: '#D4226A', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 700 }}>Select All</button>
                  <button onClick={() => setExcluded(new Set(w9s.map(w => w.teacher_id)))} style={{ fontSize: 10, color: '#8080A8', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 700 }}>Deselect All</button>
                </div>
              </div>

              {/* Header */}
              <div style={{ display: 'grid', gridTemplateColumns: '28px 2fr 1fr 1fr', gap: 8, padding: '6px 0', fontSize: 10, fontWeight: 700, color: '#606088', textTransform: 'uppercase', letterSpacing: '0.06em', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                <span />
                <span>Teacher</span>
                <span>Completed</span>
                <span style={{ textAlign: 'right' }}>YTD Earnings</span>
              </div>

              {w9s.map(w => {
                const isExcl = excluded.has(w.teacher_id)
                return (
                  <div key={w.teacher_id} style={{ display: 'grid', gridTemplateColumns: '28px 2fr 1fr 1fr', gap: 8, padding: '8px 0', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.03)', opacity: isExcl ? 0.35 : 1 }}>
                    <div onClick={() => setExcluded(s => { const n = new Set(s); isExcl ? n.delete(w.teacher_id) : n.add(w.teacher_id); return n })} style={{ width: 18, height: 18, borderRadius: 4, border: isExcl ? '1px solid #606088' : '1px solid #D4226A', background: isExcl ? 'transparent' : 'rgba(212,34,106,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                      {!isExcl && <Check size={11} style={{ color: '#D4226A' }} />}
                    </div>
                    <span style={{ fontSize: 13, fontWeight: 600, color: '#E0E0F4' }}>{w.legal_name}</span>
                    <span style={{ fontSize: 11, color: '#A0A0C8' }}>{w.signed_at ? new Date(w.signed_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}</span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: '#E0E0F4', textAlign: 'right' }}>{w.ytd > 0 ? `$${(w.ytd / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}` : '—'}</span>
                  </div>
                )
              })}
            </>
          )}
        </div>

        <div style={{ padding: '16px 24px', borderTop: '1px solid rgba(255,255,255,0.06)', flexShrink: 0 }}>
          <button onClick={handleExport} disabled={exporting || selected.length === 0} style={{
            width: '100%', padding: '12px 0', borderRadius: 10, border: 'none',
            background: exporting || selected.length === 0 ? '#606088' : '#D4226A',
            color: '#fff', fontSize: 14, fontWeight: 700,
            cursor: exporting ? 'default' : 'pointer',
            boxShadow: exporting ? 'none' : '0 4px 16px rgba(212,34,106,0.3)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          }}>
            <Download size={16} />
            {exporting ? `Exporting ${selected.length} W-9s...` : `Export ${selected.length} W-9s`}
          </button>
        </div>
      </div>
    </div>
  )
}
