import { useState, useRef } from 'react'
import {
  useTeacherDocuments,
  useTeacherW9Status,
  useUploadTeacherDocument,
} from '../../hooks/useTeacherDashboard'
import { toast } from '../../components/shared/Toast'
import MusicLoader from '../../components/shared/MusicLoader'
import { CheckCircle, AlertTriangle, Upload, FileText, ExternalLink, Lock } from 'lucide-react'

const CATEGORY_OPTIONS = [
  { value: 'general', label: 'General' },
  { value: 'certification', label: 'Certification' },
  { value: 'insurance', label: 'Insurance' },
  { value: 'other', label: 'Other' },
]

export default function TeacherDocuments() {
  const { data: documents, isLoading: loadingDocs } = useTeacherDocuments()
  const { data: w9Status, isLoading: loadingW9 } = useTeacherW9Status()
  const uploadDoc = useUploadTeacherDocument()
  const [uploadCategory, setUploadCategory] = useState('general')

  const contracts = (documents ?? []).filter(d => d.category === 'contract')
  const otherDocs = (documents ?? []).filter(d => d.category !== 'contract' && d.category !== 'w9')

  const handleUpload = async (file: File, category: string) => {
    try {
      await uploadDoc.mutateAsync({ file, category })
      toast('Document uploaded', 'success')
    } catch (err: any) {
      toast(err.message ?? 'Upload failed', 'error')
    }
  }

  const isLoading = loadingDocs || loadingW9

  return (
    <div className="page" style={{ maxWidth: 640, margin: '0 auto' }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: '#E0E0F4', margin: 0 }}>My Documents</h1>
        <p style={{ fontSize: 13, color: '#A0A0C8', marginTop: 4 }}>Upload and manage your required documents.</p>
      </div>

      {isLoading ? (
        <div style={{ padding: 60, textAlign: 'center' }}><MusicLoader /></div>
      ) : (
        <>
          {/* ═══ SECTION 1: W-9 ═══ */}
          <GlassCard style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  {w9Status?.has_w9 ? (
                    <CheckCircle size={16} style={{ color: '#22C55E' }} />
                  ) : (
                    <AlertTriangle size={16} style={{ color: '#FBBF24' }} />
                  )}
                  <span style={{ fontSize: 15, fontWeight: 700, color: '#E0E0F4' }}>W-9</span>
                </div>
                <div style={{ fontSize: 12, color: w9Status?.has_w9 ? '#22C55E' : '#FBBF24', fontWeight: 600 }}>
                  {w9Status?.has_w9 ? 'W-9 on file' : 'W-9 needed'}
                </div>
                {w9Status?.has_w9 && w9Status.signed_at && (
                  <div style={{ fontSize: 11, color: '#606088', marginTop: 4 }}>
                    Signed {new Date(w9Status.signed_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </div>
                )}
              </div>
              {w9Status?.has_w9 && w9Status.pdf_url ? (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 4,
                  padding: '6px 14px', borderRadius: 6, fontSize: 11, fontWeight: 700,
                  background: 'rgba(255,255,255,0.04)', color: '#606088',
                  border: '1px solid rgba(255,255,255,0.06)',
                }} title="Downloads are available to students and families only.">
                  <Lock size={11} /> On file
                </div>
              ) : !w9Status?.has_w9 ? (
                <UploadButton label="Complete W-9" onUpload={(file) => handleUpload(file, 'w9')} isPending={uploadDoc.isPending} />
              ) : null}
            </div>
          </GlassCard>

          {/* ═══ SECTION 2: CONTRACT ═══ */}
          <GlassCard style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  {contracts.length > 0 ? (
                    <CheckCircle size={16} style={{ color: '#22C55E' }} />
                  ) : (
                    <AlertTriangle size={16} style={{ color: '#FBBF24' }} />
                  )}
                  <span style={{ fontSize: 15, fontWeight: 700, color: '#E0E0F4' }}>Contract</span>
                </div>
                <div style={{ fontSize: 12, color: contracts.length > 0 ? '#22C55E' : '#FBBF24', fontWeight: 600 }}>
                  {contracts.length > 0 ? 'Contract on file' : 'Contract needed'}
                </div>
                {contracts.length > 0 && (
                  <div style={{ marginTop: 8 }}>
                    {contracts.map(doc => (
                      <div key={doc.id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                        <FileText size={13} style={{ color: '#8080A8' }} />
                        <span style={{ fontSize: 12, color: '#C0C0E0' }}>{doc.file_name}</span>
                        <span style={{ fontSize: 10, color: '#606088' }}>
                          {new Date(doc.uploaded_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              {contracts.length > 0 && contracts[0].file_url ? (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 4,
                  padding: '6px 14px', borderRadius: 6, fontSize: 11, fontWeight: 700,
                  background: 'rgba(255,255,255,0.04)', color: '#606088',
                  border: '1px solid rgba(255,255,255,0.06)',
                }} title="Downloads are available to students and families only.">
                  <Lock size={11} /> On file
                </div>
              ) : (
                <UploadButton label="Upload Contract" onUpload={(file) => handleUpload(file, 'contract')} isPending={uploadDoc.isPending}
                  accept=".pdf,.doc,.docx,.png,.jpg,.jpeg" />
              )}
            </div>
          </GlassCard>

          {/* ═══ SECTION 3: OTHER DOCUMENTS ═══ */}
          <GlassCard>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <span style={{ fontSize: 15, fontWeight: 700, color: '#E0E0F4' }}>Other Documents</span>
            </div>

            {otherDocs.length > 0 && (
              <div style={{ marginBottom: 14 }}>
                {otherDocs.map(doc => (
                  <div key={doc.id} style={{
                    display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0',
                    borderBottom: '1px solid rgba(255,255,255,0.03)',
                  }}>
                    <FileText size={14} style={{ color: '#8080A8', flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, color: '#C0C0E0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{doc.file_name}</div>
                      <div style={{ fontSize: 10, color: '#606088', display: 'flex', gap: 8 }}>
                        {doc.category && <span>{doc.category}</span>}
                        <span>{new Date(doc.uploaded_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                      </div>
                    </div>
                    {doc.file_url && (
                      <div style={{ color: '#606088', flexShrink: 0 }} title="Downloads are available to students and families only.">
                        <Lock size={13} />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <select
                value={uploadCategory}
                onChange={(e) => setUploadCategory(e.target.value)}
                style={{
                  padding: '8px 12px', borderRadius: 8, fontSize: 12,
                  background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
                  color: '#C0C0E0', fontFamily: 'inherit', outline: 'none',
                }}
              >
                {CATEGORY_OPTIONS.map(c => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
              <UploadButton
                label="Upload Document"
                onUpload={(file) => handleUpload(file, uploadCategory)}
                isPending={uploadDoc.isPending}
              />
            </div>

            {otherDocs.length === 0 && (
              <div style={{ padding: '16px 0 4px', textAlign: 'center', color: '#606088', fontSize: 12 }}>
                No other documents uploaded yet.
              </div>
            )}
          </GlassCard>
        </>
      )}
    </div>
  )
}

// ─── Reusable Components ──────────────────────────────

function GlassCard({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{
      padding: '18px 20px', borderRadius: 14,
      background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)',
      boxShadow: '0 4px 24px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.06)',
      ...style,
    }}>
      {children}
    </div>
  )
}

function UploadButton({ label, onUpload, isPending, accept }: {
  label: string
  onUpload: (file: File) => void
  isPending: boolean
  accept?: string
}) {
  const inputRef = useRef<HTMLInputElement>(null)

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept={accept ?? '.pdf,.doc,.docx,.png,.jpg,.jpeg'}
        style={{ display: 'none' }}
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) onUpload(file)
          e.target.value = ''
        }}
      />
      <button
        onClick={() => inputRef.current?.click()}
        disabled={isPending}
        style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '7px 14px', borderRadius: 6, fontSize: 11, fontWeight: 700,
          background: 'rgba(212,34,106,0.1)', color: '#D4226A',
          border: '1px solid rgba(212,34,106,0.2)', cursor: isPending ? 'default' : 'pointer',
          opacity: isPending ? 0.6 : 1,
        }}
      >
        <Upload size={12} />
        {isPending ? 'Uploading...' : label}
      </button>
    </>
  )
}
