import { useState, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { toast } from '../shared/Toast'
import { X, FileText, Upload, Shield, FileSignature, FolderOpen, ExternalLink, AlertTriangle, Download } from 'lucide-react'
import W9FormModal from './W9FormModal'
import PinModal from './PinModal'
import { useAuthContext } from '../../app/AuthContext'

interface Props {
  teacherId: string
  teacherName: string
  w9Status: string | null
  w9CompletedAt: string | null
  onClose: () => void
}

const LBL: React.CSSProperties = { fontSize: 10, fontWeight: 700, color: '#606088', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }

export default function TeacherDocumentsModal({ teacherId, teacherName, w9Status, w9CompletedAt, onClose }: Props) {
  const qc = useQueryClient()
  const { role, profile } = useAuthContext()
  const isOwner = role === 'owner'
  const [showW9Form, setShowW9Form] = useState(false)
  const [showPin, setShowPin] = useState(false)
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  // Fetch documents
  const { data: docs } = useQuery({
    queryKey: ['teacher_documents', teacherId],
    queryFn: async () => {
      const { data } = await supabase.from('teacher_documents').select('*').eq('teacher_id', teacherId).order('uploaded_at', { ascending: false })
      return data ?? []
    },
  })

  // Fetch W-9 record
  const { data: w9Record } = useQuery({
    queryKey: ['teacher_w9', teacherId],
    queryFn: async () => {
      const { data } = await supabase.from('teacher_w9').select('*').eq('teacher_id', teacherId).order('created_at', { ascending: false }).limit(1).single()
      return data
    },
  })

  const w9Docs = docs?.filter(d => d.category === 'W-9') ?? []
  const contractDocs = docs?.filter(d => d.category === 'Contract') ?? []
  const otherDocs = docs?.filter(d => d.category === 'Other') ?? []

  const isW9Complete = w9Status === 'complete'
  const contractStatus: 'missing' | 'sent' | 'signed' = contractDocs.length > 0 ? 'signed' : 'missing'

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const path = `teachers/${teacherId}/docs/${Date.now()}_${file.name}`
      const { error: upErr } = await supabase.storage.from('tenant-assets').upload(path, file)
      if (upErr) throw upErr
      const { data: urlData } = supabase.storage.from('tenant-assets').getPublicUrl(path)
      await supabase.from('teacher_documents').insert({
        teacher_id: teacherId,
        file_url: urlData.publicUrl,
        file_name: file.name,
        category: 'Other',
        uploaded_by: 'Admin',
        uploaded_at: new Date().toISOString(),
      })
      qc.invalidateQueries({ queryKey: ['teacher_documents', teacherId] })
      toast('File uploaded', 'success')
    } catch (err) {
      toast('Upload failed', 'error')
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  function fmtDate(d: string | null) {
    if (!d) return '—'
    return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  }

  if (showW9Form) {
    return <W9FormModal teacherId={teacherId} teacherName={teacherName} onClose={() => { setShowW9Form(false); qc.invalidateQueries({ queryKey: ['teacher'] }); qc.invalidateQueries({ queryKey: ['teacher_w9', teacherId] }); qc.invalidateQueries({ queryKey: ['teacher_documents', teacherId] }) }} />
  }

  if (showPin && profile) {
    return <PinModal profileId={profile.id} onSuccess={() => {
      setShowPin(false)
      // Download the single PDF
      if (w9Record?.pdf_url) {
        const a = document.createElement('a'); a.href = w9Record.pdf_url; a.target = '_blank'; a.click()
      }
    }} onClose={() => setShowPin(false)} />
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'flex-start', justifyContent: 'flex-end' }} onClick={onClose}>
      <div
        style={{ width: '100%', maxWidth: 460, height: '100vh', background: '#141224', borderLeft: '1px solid rgba(255,255,255,0.08)', overflowY: 'auto', boxShadow: '-20px 0 60px rgba(0,0,0,0.5)' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ padding: '18px 22px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, background: '#141224', zIndex: 2 }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 800, color: '#E0E0F4' }}>Documents</div>
            <div style={{ fontSize: 12, color: '#8080A8' }}>{teacherName}</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#8080A8', padding: 4 }}><X size={20} /></button>
        </div>

        <div style={{ padding: '18px 22px', display: 'flex', flexDirection: 'column', gap: 18 }}>

          {/* ═══ W-9 SECTION ═══ */}
          <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 16, padding: '18px 20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
              <Shield size={18} style={{ color: isW9Complete ? '#22C55E' : '#FFB800' }} />
              <span style={{ fontSize: 15, fontWeight: 700, color: '#E0E0F4' }}>W-9</span>
              <span style={{
                marginLeft: 'auto', fontSize: 10, fontWeight: 700, padding: '3px 10px', borderRadius: 100,
                background: isW9Complete ? 'rgba(34,197,94,0.1)' : 'rgba(255,184,0,0.1)',
                color: isW9Complete ? '#22C55E' : '#FFB800',
                border: `1px solid ${isW9Complete ? 'rgba(34,197,94,0.3)' : 'rgba(255,184,0,0.3)'}`,
              }}>
                {isW9Complete ? 'Complete' : 'Missing'}
              </span>
            </div>

            {isW9Complete ? (
              <div>
                <div style={{ fontSize: 12, color: '#8080A8', marginBottom: 10 }}>
                  Completed {fmtDate(w9CompletedAt)}
                  {w9Record?.tin_last_four && <span style={{ marginLeft: 8 }}>TIN: ***-**-{w9Record.tin_last_four}</span>}
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  {w9Record?.pdf_url && (
                    <a href={w9Record.pdf_url} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '6px 14px', borderRadius: 8, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#C0C0E0', fontSize: 12, fontWeight: 600, textDecoration: 'none' }}>
                      <ExternalLink size={12} /> View PDF
                    </a>
                  )}
                  <button onClick={() => setShowW9Form(true)} style={{ padding: '6px 14px', borderRadius: 8, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#8080A8', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Re-submit</button>
                  {isOwner && w9Record?.pdf_url && (
                    <button onClick={() => setShowPin(true)} style={{ padding: '6px 14px', borderRadius: 8, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#8080A8', fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                      <Download size={11} /> Export
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#FFB800', marginBottom: 12 }}>
                  <AlertTriangle size={13} /> Required for payroll processing
                </div>
                <button onClick={() => setShowW9Form(true)} style={{ padding: '10px 20px', borderRadius: 10, background: '#D4226A', border: 'none', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', boxShadow: '0 4px 16px rgba(212,34,106,0.3)' }}>
                  Fill Out W-9
                </button>
              </div>
            )}
          </div>

          {/* ═══ CONTRACT SECTION ═══ */}
          <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 16, padding: '18px 20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
              <FileSignature size={18} style={{ color: contractStatus === 'signed' ? '#22C55E' : '#8080A8' }} />
              <span style={{ fontSize: 15, fontWeight: 700, color: '#E0E0F4' }}>Contract</span>
              <span style={{
                marginLeft: 'auto', fontSize: 10, fontWeight: 700, padding: '3px 10px', borderRadius: 100,
                background: contractStatus === 'signed' ? 'rgba(34,197,94,0.1)' : 'rgba(255,255,255,0.04)',
                color: contractStatus === 'signed' ? '#22C55E' : '#8080A8',
                border: `1px solid ${contractStatus === 'signed' ? 'rgba(34,197,94,0.3)' : 'rgba(255,255,255,0.06)'}`,
              }}>
                {contractStatus === 'signed' ? 'Signed' : 'Missing'}
              </span>
            </div>

            {contractStatus === 'signed' ? (
              <div>
                <div style={{ fontSize: 12, color: '#8080A8', marginBottom: 10 }}>Signed {fmtDate(contractDocs[0]?.uploaded_at)}</div>
                <a href={contractDocs[0]?.file_url} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '6px 14px', borderRadius: 8, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#C0C0E0', fontSize: 12, fontWeight: 600, textDecoration: 'none' }}>
                  <ExternalLink size={12} /> View PDF
                </a>
              </div>
            ) : (
              <div>
                <div style={{ fontSize: 12, color: '#606088', marginBottom: 10 }}>SignWell integration coming soon</div>
                <button disabled style={{ padding: '10px 20px', borderRadius: 10, background: '#1C1C2A', border: '1px solid rgba(255,255,255,0.06)', color: '#606088', fontSize: 13, fontWeight: 700, cursor: 'not-allowed' }}>
                  Send Contract
                </button>
              </div>
            )}
          </div>

          {/* ═══ GENERAL DOCUMENTS ═══ */}
          <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 16, padding: '18px 20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
              <FolderOpen size={18} style={{ color: '#8080A8' }} />
              <span style={{ fontSize: 15, fontWeight: 700, color: '#E0E0F4' }}>General Documents</span>
              <span style={{ marginLeft: 'auto', fontSize: 10, color: '#606088' }}>{otherDocs.length} file{otherDocs.length !== 1 ? 's' : ''}</span>
            </div>

            <div style={{ marginBottom: 12 }}>
              <button onClick={() => fileRef.current?.click()} disabled={uploading} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 8, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#C0C0E0', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                <Upload size={13} /> {uploading ? 'Uploading...' : 'Upload File'}
              </button>
              <input ref={fileRef} type="file" onChange={handleFileUpload} style={{ display: 'none' }} />
            </div>

            {otherDocs.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {otherDocs.map(doc => (
                  <a key={doc.id} href={doc.file_url} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.04)', borderRadius: 8, textDecoration: 'none' }}>
                    <FileText size={14} style={{ color: '#8080A8', flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, color: '#C0C0E0', fontWeight: 600 }}>{doc.file_name}</div>
                      <div style={{ fontSize: 10, color: '#606088' }}>{fmtDate(doc.uploaded_at)}</div>
                    </div>
                    <ExternalLink size={12} style={{ color: '#606088' }} />
                  </a>
                ))}
              </div>
            ) : (
              <div style={{ fontSize: 12, color: '#606088' }}>No documents uploaded yet.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
